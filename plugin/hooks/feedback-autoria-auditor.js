#!/usr/bin/env node
// PostToolUse hook: audita o CONTEÚDO REAL de agents/<x>/FEEDBACK.md depois de
// qualquer escrita, e denuncia linha com autoria `(dono · …)` no formato novo.
//
// Por que existe, e por que é PostToolUse (achado risco-10b do reviewer,
// 2026-09-06). O irmão `no-feedback-como-dono.js` roda ANTES da chamada e só
// pode olhar o texto-fonte do comando. O reviewer derrubou essa defesa com uma
// linha:
//
//   node -e "const p='agents'+'/scout/FEEDBACK.md'; ... '('+'dono'+' · …'"
//
// Nenhum literal contíguo, nenhum padrão para casar, EXIT=0 — e a linha
// forjada no disco. Não dá para blindar inspeção de texto-fonte contra
// ofuscação arbitrária (concatenação, fromCharCode, variável de shell): é uma
// corrida que o atacante sempre ganha.
//
// A saída é mudar o que se olha. Depois da escrita, a ofuscação do comando não
// importa mais — só importa o byte que ficou no arquivo. Este hook lê o
// arquivo e, achando autoria `dono` no formato NOVO, devolve exit 2: a escrita
// já aconteceu (PostToolUse não desfaz), mas o modelo recebe a denúncia e a
// instrução de reverter, e o fato fica dito em voz alta em vez de passar
// silencioso.
//
// O que torna isto preciso: hoje NENHUM caminho legítimo grava `(dono ·`. O
// `appendFeedback()` do servidor — o único caminho do dono, pelo QG — grava no
// formato ANTIGO (`- [ ] <ISO> — <texto>`, sem campos). Logo qualquer autoria
// `dono` explícita no formato novo é forjada, e não há falso positivo possível
// enquanto isso for verdade. Se um dia o servidor passar a gravar campos, este
// hook precisa mudar junto — a nota está na spec.
//
// Fail-open por desenho: stdin inválido, arquivo ilegível, qualquer erro
// interno => exit 0. Hook quebrado nunca congela o escritório.
"use strict";

const fs = require("fs");
const path = require("path");

const FEEDBACK_PATH = /(^|[\\/])agents[\\/][^\\/]+[\\/]FEEDBACK\.md$/i;
const FEEDBACK_MENTION = /agents[\\/][^\s"'`;|&]+[\\/]FEEDBACK\.md/i;
// Autoria `dono` no formato NOVO: marca + ISO + travessão + `(dono` + separador.
const AUTORIA_DONO_NO_ARQUIVO = /^-\s*\[[ x]\]\s+\S+\s*—\s*\(\s*dono\s*(?:·|\))[^\n]*/gim;

/** Arquivos de feedback que esta chamada pode ter tocado. */
function alvos(payload) {
  const tool = payload && payload.tool_name;
  const input = (payload && payload.tool_input) || {};
  const out = new Set();

  const direto = input.file_path || input.path || input.notebook_path;
  if (typeof direto === "string" && FEEDBACK_PATH.test(direto)) out.add(direto);

  // Shell: qualquer FEEDBACK.md citado no comando, mesmo que o conteúdo esteja
  // ofuscado — o caminho ofuscado escapa daqui, e é por isso que o varredor
  // abaixo existe.
  if (typeof input.command === "string") {
    const m = input.command.match(new RegExp(FEEDBACK_MENTION.source, "gi"));
    for (const c of m || []) out.add(c);
    // Caminho montado por concatenação: varre agents/*/FEEDBACK.md do cwd.
    if (!m && /agents/i.test(input.command) && /FEEDBACK/i.test(input.command)) {
      for (const p of varrerAgents()) out.add(p);
    }
  }
  return [...out];
}

/** Todos os agents/<x>/FEEDBACK.md do diretório atual. Barato: uma listagem. */
function varrerAgents() {
  const out = [];
  try {
    for (const d of fs.readdirSync("agents", { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const p = path.join("agents", d.name, "FEEDBACK.md");
      if (fs.existsSync(p)) out.push(p);
    }
  } catch (e) { /* sem agents/ — nada a auditar */ }
  return out;
}

function decide(payload) {
  for (const alvo of alvos(payload)) {
    let txt;
    try { txt = fs.readFileSync(alvo, "utf8"); } catch (e) { continue; }
    const achados = txt.match(AUTORIA_DONO_NO_ARQUIVO);
    if (achados && achados.length) {
      return { alvo, linha: achados[0].slice(0, 200), quantas: achados.length };
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
    `Autoria forjada encontrada em ${hit.alvo} DEPOIS da escrita: ` +
    `${hit.quantas} linha(s) com autoria \`(dono · …)\` no formato novo.\n` +
    `Primeira: ${hit.linha}\n` +
    "Nenhum caminho legítimo grava isso: o dono escreve pela tela do QG " +
    "(`POST /api/feedback`), que grava no formato ANTIGO, sem campos; o orquestrador escreve pelo " +
    "passo 3b do `/arvys:close`, com `formatLinha`, que só produz `(orq · …)`. " +
    "AÇÃO: remova a(s) linha(s) forjada(s) e regrave com `formatLinha` se o feedback for seu; " +
    "se a linha é mesmo do dono, ela tem de entrar pela tela do QG. " +
    "Motivo: a retro lê este arquivo para decidir treino — \"o dono disse\" pesa diferente de " +
    "\"o orquestrador achou\". Precedente: specs/2026-09-feedback-orquestrador/ (risco-10b).\n"
  );
  process.exitCode = 2; // let stderr drain; no process.exit()
}

main();
