#!/usr/bin/env node
// PreToolUse hook: refuses `git checkout -- <path>` / `git checkout <ref> --
// <path>` / `git restore <path>` / `git stash push <path>` when the target
// resolves inside agents/**, company/** or specs/** of the office. Restoring
// a tracked file with git discards whatever another parallel front wrote to
// it — gotcha nº 35 do Forge (agents/forge/GOTCHAS.md), reincidiu mesmo com o
// mandato dizendo "NUNCA" em caixa alta
// (incidents/2026-09-04-git-checkout-apesar-do-mandato.md). P6 da spec
// 2026-09-fpy-molde: a lei escrita em prosa não segurou 2x, vira trava.
//
// Contract (code.claude.com/docs/en/hooks): stdin is the hook payload JSON;
// exit 2 blocks the tool call and stderr becomes the reason shown to the
// model. Any other outcome (exit 0, no stdout) lets the call proceed.
//
// Fail-open by design, same architecture as no-shell-read.js: invalid stdin,
// missing fields, unexpected tool, git absent or any internal error => exit 0
// without blocking. A broken hook must never freeze the office. Only the
// exact refuse commands are matched, only when an argument resolves to a
// path inside agents/, company/ or specs/ of the current working directory —
// `git checkout -b`, `git checkout <branch>` (no path) and any restore
// outside the office directories pass through untouched.
"use strict";

const path = require("path");
const fs = require("fs");

const OFFICE_DIRS = /^(agents|company|specs)(\/|$)/i;
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

/** Splits a command line into segments (one per simple command), each a list
 * of tokens. Quote-aware: separators and whitespace inside '...' or "..." do
 * not split. Separators: | || & && ; newline. Good enough for detection; any
 * ambiguity is resolved in favor of not blocking. Copied verbatim from
 * no-shell-read.js so the two hooks never drift in tokenizing behavior. */
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

/**
 * True when `token`, resolved against the CURRENT shell `cwd` (which may
 * already reflect a `cd` earlier in the same command line), lands inside
 * agents/, company/ or specs/ of `officeRoot` — the office boundary, fixed
 * to the ORIGINAL payload cwd for the whole command line. Checking against
 * `officeRoot` instead of the moving `cwd` is what catches `cd hub && git
 * checkout -- ../company/X`: resolving "../company/X" from hub/ yields an
 * absolute path that DOES sit under officeRoot/company, even though its
 * path relative to hub/ starts with "..".
 */
function isOfficePath(token, cwd, officeRoot) {
  if (!token || token.startsWith("-") || token === "<" || token === ">") return false;
  const cleaned = token.replace(/\\/g, "/");
  if (!/[A-Za-z0-9_.]/.test(cleaned)) return false;
  let rel;
  try {
    const abs = path.resolve(cwd, cleaned);
    rel = path.relative(officeRoot, abs).replace(/\\/g, "/");
  } catch (e) {
    return false;
  }
  // officeRoot itself may already sit inside a sibling of agents/company/
  // specs (payload cwd = ".../hub", not the repo root) — the relative path
  // then starts with one or more "../" before re-entering the office
  // directory from above. Strip those leading climbs before testing: the
  // remainder is the path from wherever the climb lands, and that is what
  // must start with agents/, company/ or specs/.
  let remainder = rel;
  while (remainder.startsWith("../")) remainder = remainder.slice(3);
  return OFFICE_DIRS.test(remainder);
}

/**
 * Decides whether a `git` segment is a refused restore of an office path.
 * Refused shapes (subcommand + at least one office path in `rest`, ignoring
 * flags):
 *   git checkout -- <path>            (git checkout <ref> -- <path> too)
 *   git checkout <path>               (no -b, no "--" branch create)
 *   git restore <path>                (git restore --source=<ref> <path> too)
 *   git stash push <path>             (git stash <path> is a shorthand for it)
 * Allowed (never matched): `git checkout -b <name>`, `git checkout <branch>`
 * with no path-looking arg, `git restore --staged` with no office path,
 * `git stash` / `git stash pop` / `git stash list` with no path argument.
 */
function officeRestoreTarget(word, rest, cwd, officeRoot) {
  if (word !== "git") return null;
  let i = 0;
  while (i < rest.length && rest[i].startsWith("-")) i++; // skip leading flags (rare before subcommand)
  const sub = rest[i];
  if (!sub) return null;
  const args = rest.slice(i + 1);

  if (sub === "checkout") {
    if (args.some((a) => a === "-b" || a === "-B")) return null; // creating/moving a branch, not restoring a path
    const withoutDashDash = args.filter((a) => a !== "--");
    const hit = withoutDashDash.find((a) => isOfficePath(a, cwd, officeRoot));
    return hit ? { subcommand: "checkout", target: hit } : null;
  }
  if (sub === "restore") {
    // `--staged` without `--worktree` only touches the index, never the
    // working tree — the file on disk is untouched, so there is nothing to
    // discard. Only a restore that can write the working copy is refused.
    const staged = args.some((a) => a === "-S" || a === "--staged");
    const worktree = args.some((a) => a === "-W" || a === "--worktree");
    if (staged && !worktree) return null;
    const hit = args.find((a) => isOfficePath(a, cwd, officeRoot));
    return hit ? { subcommand: "restore", target: hit } : null;
  }
  if (sub === "stash") {
    // Only the path-taking forms restore working-tree content from a stash
    // entry back over a file; "stash" / "stash pop" / "stash list" (no path
    // argument) do not target a specific path and are left alone.
    const rest2 = args[0] === "push" || args[0] === "save" ? args.slice(1) : args;
    const hit = rest2.find((a) => isOfficePath(a, cwd, officeRoot));
    return hit ? { subcommand: "stash", target: hit } : null;
  }
  return null;
}

const DIR_CHANGERS = new Set(["cd", "chdir", "set-location", "sl", "push-location", "pushd"]);

function decide(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!SHELL_TOOLS.has(payload.tool_name)) return null;
  const ti = payload.tool_input;
  if (!ti || typeof ti.command !== "string" || !ti.command.trim()) return null;
  // officeRoot is fixed for the whole command line (the boundary a path must
  // fall under to be refused). `cwd` is rolling: `cd x && git checkout --
  // ../company/Y` (attack named in the spec's risk 2) must resolve the
  // relative token from `x`, then test the RESULT against officeRoot — never
  // against the moving `cwd` itself, or a `..` back out of a subdirectory
  // would hide the target. Track `cd`/PowerShell Set-Location across
  // `&&`/`;`-separated segments of the same command line.
  const officeRoot = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  let cwd = officeRoot;

  for (const tokens of tokenizeSegments(ti.command)) {
    const { word, rest } = commandWord(tokens);
    if (!word) continue;
    if (DIR_CHANGERS.has(word)) {
      const target = rest.find((t) => !t.startsWith("-"));
      if (target) {
        try { cwd = path.resolve(cwd, target); } catch (e) { /* keep previous cwd */ }
      }
      continue;
    }
    const hit = officeRestoreTarget(word, rest, cwd, officeRoot);
    if (hit) return hit;
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
    `Restauração via git recusada: \`git ${hit.subcommand} ... ${hit.target}\` aponta para agents/**, company/** ou specs/**. ` +
    "Arquivo fora da sua pegada que mudou durante a rodada é de OUTRA frente: copie para o scratchpad e restaure DA CÓPIA, " +
    "nunca com git (gotcha nº 35 do Forge). " +
    "Precedente: incidents/2026-09-04-git-checkout-apesar-do-mandato.md.\n"
  );
  process.exitCode = 2; // let stderr drain; no process.exit()
}

main();
