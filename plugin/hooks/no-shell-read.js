#!/usr/bin/env node
// PreToolUse hook: refuses shell reads (cat / type / Get-Content / gc) of the
// office files under agents/** and company/**. Those files must be opened with
// the Read tool, one file per call — decision "A tela do ritual e parte da
// entrega" (company/DECISIONS.md, 2026-09-03).
//
// Contract (code.claude.com/docs/en/hooks): stdin is the hook payload JSON;
// exit 2 blocks the tool call and stderr becomes the reason shown to the
// model. Any other outcome (exit 0, no stdout) lets the call proceed.
//
// Fail-open by design: invalid stdin, missing fields, unexpected tool or any
// internal error => exit 0 without blocking. A broken hook must never freeze
// the office. False positive costs more than false negative: only the exact
// reader commands are matched, and only when an argument resolves to a path
// inside agents/ or company/ of the current working directory.
"use strict";

const path = require("path");
const fs = require("fs");

const READERS = new Set(["cat", "type", "get-content", "gc"]);
const OFFICE_DIRS = /^(agents|company)(\/|$)/i;
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
/** Output redirection operators: `>`, `>>`, `2>`, `&>`, `>|`. Input `<`,
 * heredoc `<<` and here-string `<<<` are deliberately NOT here: those are
 * reads. Applied to a whole token — the tokenizer always emits the operator
 * as its own token, glued in the source or not (FILA 45, 2026-09-10). */
const OUT_REDIRECT = /^(?:\d?>>?\|?|&>>?)$/;
/** Any redirection operator standing alone as a token. */
const REDIRECT_OP = /^(?:&>>?|\d?>>?\|?|<<?<?)$/;

/** Splits a command line into segments (one per simple command), each a list
 * of tokens. Quote-aware: separators and whitespace inside '...' or "..." do
 * not split. Separators: | || & && ; newline. Redirection operators (`<`, `>`,
 * `>>`, `<<`, `>|`, …) are emitted as their OWN token even when the source
 * glues them to the command word or to the path (`cat<company/X.md`), so that
 * `cat <company/X.md` and `cat < company/X.md` are seen identically (FILA 45).
 * Good enough for detection; any ambiguity is resolved in favor of not
 * blocking. */
function tokenizeSegments(command) {
  const segments = [];
  let tokens = [];
  let cur = "";
  let quote = null;
  let hasToken = false;

  const flushToken = () => {
    if (hasToken) tokens.push(cur);
    cur = "";
    hasToken = false;
  };
  const flushSegment = () => {
    flushToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else { cur += ch; hasToken = true; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue; }
    if (ch === "\\" && i + 1 < command.length && command[i + 1] !== "\n") {
      // Bash escape; on Windows paths this keeps the backslash and next char.
      cur += ch + command[i + 1]; hasToken = true; i++; continue;
    }
    if (ch === "<" || ch === ">") {
      // Redirection operator: close whatever came before it and emit the run of
      // `<`/`>` (plus a trailing `|` of `>|`) as a standalone token. Whatever
      // follows becomes the next token on its own, glued or not.
      flushToken();
      let op = ch;
      while (i + 1 < command.length && (command[i + 1] === "<" || command[i + 1] === ">")) op += command[++i];
      if (op[0] === ">" && command[i + 1] === "|") op += command[++i];
      tokens.push(op);
      continue;
    }
    if (ch === "|" || ch === "&" || ch === ";" || ch === "\n") {
      flushSegment();
      if ((ch === "|" || ch === "&") && command[i + 1] === ch) i++;
      continue;
    }
    if (/\s/.test(ch)) { flushToken(); continue; }
    cur += ch; hasToken = true;
  }
  flushSegment();
  return segments;
}

/** Command word of a segment: skips env assignments (FOO=bar), the PowerShell
 * call operator (&) and `sudo`; strips directory and .exe. */
function commandWord(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === "&" || tokens[i].toLowerCase() === "sudo")) i++;
  if (i >= tokens.length) return { word: null, rest: [] };
  let word = tokens[i].replace(/\\/g, "/");
  word = word.slice(word.lastIndexOf("/") + 1).toLowerCase().replace(/\.exe$/, "");
  return { word, rest: tokens.slice(i + 1) };
}

/** True when `token` names a path inside agents/ or company/ of `cwd`. */
function isOfficePath(token, cwd) {
  if (!token || token.startsWith("-") || token === "<" || token === ">") return false;
  const cleaned = token.replace(/\\/g, "/");
  if (!/[A-Za-z0-9_.]/.test(cleaned)) return false;
  let rel;
  try {
    rel = path.relative(cwd, path.resolve(cwd, cleaned)).replace(/\\/g, "/");
  } catch (e) {
    return false;
  }
  return OFFICE_DIRS.test(rel);
}

function decide(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!SHELL_TOOLS.has(payload.tool_name)) return null;
  const ti = payload.tool_input;
  if (!ti || typeof ti.command !== "string" || !ti.command.trim()) return null;
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

  for (const tokens of tokenizeSegments(ti.command)) {
    const { word, rest } = commandWord(tokens);
    if (!word || !READERS.has(word)) continue;
    // `cat >> company/DECISIONS.md <<EOF` is a WRITE by heredoc, not a read: the
    // office path is the redirection target, never an operand. So an office path
    // is only a read when it is NOT the target of an output redirection. The
    // position decides — `cat company/X.md >> out.txt` still reads the protected
    // file and is still refused (FILA 41, 2026-09-06).
    let skipNext = false;
    for (const token of rest) {
      if (skipNext) { skipNext = false; continue; } // output redirection target
      if (REDIRECT_OP.test(token)) {
        // `>`/`>>`/`2>`/`&>`/`>|`: the NEXT token is a write target, skip it.
        // `<`/`<<`/`<<<`: input, so the next token is judged as usual — that is
        // what makes `cat <company/X.md` refuse exactly like `cat < company/X.md`.
        skipNext = OUT_REDIRECT.test(token);
        continue;
      }
      if (isOfficePath(token, cwd)) return { command: word, target: token };
    }
  }
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (e) {
    return; // fail-open
  }
  let hit = null;
  try {
    hit = decide(payload);
  } catch (e) {
    return; // fail-open
  }
  if (!hit) return;

  process.stderr.write(
    `Leitura via shell recusada: \`${hit.command} ${hit.target}\` aponta para agents/** ou company/**. ` +
    "Use a ferramenta Read (leitor de arquivos), um arquivo por chamada. " +
    "Decisao \"A tela do ritual e parte da entrega\" (company/DECISIONS.md, 2026-09-03).\n"
  );
  process.exitCode = 2; // let stderr drain; no process.exit()
}

main();
