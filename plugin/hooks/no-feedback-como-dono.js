#!/usr/bin/env node
// PreToolUse hook: refuses any agent-written line in agents/<x>/FEEDBACK.md
// that claims authorship `(dono ...)` — FILA 43, spec
// specs/2026-09-feedback-orquestrador/, risco 2.
//
// Why this exists. The sala do RH (FILA 39) let the OWNER write feedback to an
// agent through the QG screen; FILA 43 let the ORCHESTRATOR write too, and the
// line now carries `(autoria · onde-nasceu · ratificacao)`. The whole design
// rests on that first field being trustworthy: the retro reads the history to
// decide training, and "the owner said X" weighs differently from "the
// orchestrator thinks X". `formatLinha()` has no code path that writes
// `(dono`, but nothing stopped an agent from bypassing the module and writing
// the line by hand — the guard was prose, and prose is the last line of
// defence, never the first (gotcha 27 do Forge). By P8 (retro 3), a guard that
// CAN become code MUST become code.
//
// The owner's own path is untouched: the QG writes through
// `POST /api/feedback` in hub/serve.js, which is a network request from the
// browser and never a tool call — no hook sees it. The owner editing the file
// by hand in their own editor is likewise outside Claude Code. What this hook
// blocks is exactly the one thing that must not happen: an AGENT signing as
// the owner.
//
// Contract (code.claude.com/docs/en/hooks): stdin is the hook payload JSON;
// exit 2 blocks the tool call and stderr becomes the reason shown to the
// model. Any other outcome lets the call proceed.
//
// Fail-open by design: invalid stdin, missing fields, unexpected tool or any
// internal error => exit 0 without blocking. A broken hook must never freeze
// the office.
"use strict";

const fs = require("fs");

// Só o arquivo de feedback de um agente. `specs/`, `company/` e qualquer outro
// FEEDBACK.md fora de agents/<nome>/ não são alvo — o texto `(dono` é legítimo
// em prosa (esta spec inteira fala dele).
const FEEDBACK_PATH = /(^|[\\/])agents[\\/][^\\/]+[\\/]FEEDBACK\.md$/i;
const FEEDBACK_MENTION = /agents[\\/][^\s"'`;|&]+[\\/]FEEDBACK\.md/i;

// A assinatura proibida. Ancorada no CAMPO DE AUTORIA do formato novo, nunca
// num `(dono` solto: marca + ISO + travessão + `(dono` + separador de campos
// (`·` ou `)`). Sem essa âncora o hook tinha falso positivo real — achado
// risco-10a do reviewer (2026-09-06): o dono escrevendo pela tela do QG um
// texto que COMEÇA com "(dono ja mandou isso antes, ver historico)" produz uma
// linha do formato ANTIGO cujo texto livre casa `(dono`; o `/arvys:open`
// ficava impedido de marcá-la como lida — para sempre, em toda sessão futura.
// Texto livre não é campo de autoria.
//
// Nota que torna isto seguro: hoje NINGUÉM legítimo grava `(dono ·` — o
// `appendFeedback()` do servidor (hub/serve.js), único caminho do dono, grava
// no formato ANTIGO (`- [ ] <ISO> — <texto>`, sem campos). Logo uma autoria
// `dono` explícita no formato novo só pode ter sido escrita por um agente.
const AUTORIA_DONO = /^-\s*\[[ x]\]\s+\S+\s*—\s*\(\s*dono\s*(?:·|\))/im;
// Mesma âncora, para shell: o comando carrega a linha inteira dentro de aspas,
// então o `^` de linha não serve — casa a partir da marca onde ela estiver.
const AUTORIA_DONO_SHELL = /-\s*\[[ x]\][^\n"']*?—\s*\(\s*dono\s*(?:·|\))/i;

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

function temAssinaturaDoDono(texto, viaShell) {
  if (typeof texto !== "string" || !texto) return false;
  return viaShell ? AUTORIA_DONO_SHELL.test(texto) : AUTORIA_DONO.test(texto);
}

function decide(payload) {
  const tool = payload && payload.tool_name;
  const input = (payload && payload.tool_input) || {};

  // 1) Ferramentas de arquivo: alvo é o caminho, conteúdo é o que será gravado.
  if (WRITE_TOOLS.has(tool)) {
    const alvo = input.file_path || input.path || input.notebook_path || "";
    if (!FEEDBACK_PATH.test(String(alvo))) return null;
    // Só o texto que ENTRA no arquivo importa: `old_string` é o que sai.
    const escrito = [input.content, input.new_string, input.new_source]
      .filter((v) => typeof v === "string")
      .join("\n");
    if (temAssinaturaDoDono(escrito, false)) return { via: tool, alvo: String(alvo) };
    return null;
  }

  // 2) Shell: só olha comandos que mencionam um FEEDBACK.md de agente. Sem
  //    essa porta, qualquer comando com a palavra "dono" seria inspecionado.
  if (SHELL_TOOLS.has(tool)) {
    const cmd = input.command;
    if (typeof cmd !== "string" || !FEEDBACK_MENTION.test(cmd)) return null;
    if (temAssinaturaDoDono(cmd, true)) {
      const m = cmd.match(FEEDBACK_MENTION);
      return { via: tool, alvo: m ? m[0] : "agents/<agente>/FEEDBACK.md" };
    }
    return null;
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
    `Assinatura recusada: esta escrita em ${hit.alvo} grava uma linha com autoria \`(dono …)\`. ` +
    "Autoria `dono` existe SÓ pelo caminho do dono — o campo de feedback da sala do RH no QG " +
    "(`POST /api/feedback`), que não passa por ferramenta. O orquestrador registra feedback pelo " +
    "passo 3b do `/arvys:close`, sempre com `workers/lib/feedback.js` (`formatLinha`), que escreve " +
    "`(orq · <onde-nasceu> · a ratificar)` e nada mais. " +
    "Motivo: a retro lê este arquivo para decidir treino, e \"o dono disse\" pesa diferente de " +
    "\"o orquestrador achou\" — assinar pelo dono corrompe a única coisa que sustenta o registro. " +
    "Se for erro do agente na leitura do texto: escreva com formatLinha; se a linha é mesmo do dono, " +
    "ela entra pela tela do QG. Precedente: specs/2026-09-feedback-orquestrador/ (risco 2).\n"
  );
  process.exitCode = 2; // let stderr drain; no process.exit()
}

main();
