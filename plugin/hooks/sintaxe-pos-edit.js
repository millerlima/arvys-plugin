#!/usr/bin/env node
// PostToolUse hook: depois de Write/Edit em arquivo .js/.mjs/.cjs, roda
// `node --check` nele e devolve o erro AO MODELO na hora — nao no commit.
//
// PRECEDENTE (mesa sobre o /insights, 2026-09-12, complemento da retro 5):
// o relatorio de 75 sessoes apontou `buggy_code` como o maior atrito (53
// ocorrencias) e sugeriu "typecheck/lint depois de cada edicao". A mesa
// descartou `tsc` por edicao (10-20 s no arvys-app, custo por turno) e ficou
// com o que custa milissegundos e pega a classe mais barata de defeito: o
// arquivo que nem carrega. O pre-commit ja faz `node --check`, mas so no
// commit — horas depois de o arquivo ter sido escrito torto (caso 3 do
// gotcha 47: `\n` virando quebra real, o teste "nem carregou").
//
// Contrato: PostToolUse nao bloqueia (a escrita ja aconteceu). Saida no
// stdout vira contexto para o modelo; exit 0 sempre. FALHA ABERTA.
"use strict";

const { spawnSync } = require("child_process");

const TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);
const EXT = /\.(mjs|cjs|js)$/i;

let bruto = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { bruto += c; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(bruto);
    if (!TOOLS.has(payload && payload.tool_name)) process.exit(0);
    const fp = String((payload.tool_input && payload.tool_input.file_path) || "");
    if (!EXT.test(fp)) process.exit(0);

    const r = spawnSync(process.execPath, ["--check", fp], { encoding: "utf8", timeout: 4000 });
    if (r.status === 0) process.exit(0);
    const erro = String(r.stderr || "").split("\n").filter(Boolean).slice(0, 6).join("\n");
    process.stdout.write(
      "SINTAXE QUEBRADA depois desta edicao (node --check " + fp + "):\n" + erro + "\n" +
      "Conserte antes de seguir — arquivo que nao carrega derruba o QG no boot e reprova o pre-commit.\n"
    );
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
