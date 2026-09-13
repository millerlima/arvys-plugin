#!/usr/bin/env node
// PreToolUse hook: ferramenta de INFRA com efeito colateral (Neon via MCP, ou
// comando destrutivo de banco/schema pelo shell) so roda se a sessao escreveu
// ANTES, em arquivo, a linha que traduz o efeito e o "confirmo" do dono.
//
// PRECEDENTES (retro 5, 2026-09-12 — dois feedbacks ratificados como `hook`):
// - 2026-09-09: com o mandato dizendo "nada de comando destrutivo de banco",
//   o executor apagou 13 usuarios + cascata + 30 blobs em dev, por conta
//   propria. A lei existia em TRES lugares (mandato, PLAYBOOK, CLAUDE.md).
//   (incidents/2026-09-09-executor-apagou-dados-do-banco-sem-autorizacao.md)
// - 2026-09-12: `restore_snapshot` do MCP do Neon chamado sem `finalize:false`
//   trocou a `main` de PRODUCAO por 25 min. A descricao da ferramenta dizia o
//   efeito; a leitura nao foi traduzida para o plano. (incidents/2026-09-12-
//   restore-snapshot-do-neon-trocou-a-main-de-producao.md)
// Duas vezes que proibicao em caixa alta nao segurou: vira trava.
//
// COMO LIBERAR — a "linha-antes-de-chamar" (gotcha 65 do Forge), em
// `hub/live/infra-ok.txt`, uma por linha:
//   <nome-da-ferramenta> <project_id|*> — <efeito traduzido em portugues> — confirmo
// Ex.: mcp__neon__restore_snapshot proj-abc-123 — cria branch nova, finalize:false, main intocada — confirmo
// Ex.: bash * — deleteMany dos usuarios __teste_ em DEV, plano mostrado ao dono — confirmo
// A linha exige as tres partes: ferramenta que casa com a chamada, project_id
// igual ao da chamada (ou `*`), e a palavra `confirmo`. O arquivo e da sessao
// (hub/live/, fora do git), como `meus-pids.txt`.
//
// O QUE E VIGIADO
// - MCP do Neon: toda ferramenta da lista ESCRITA abaixo; `run_sql*` so quando
//   o SQL tem DELETE/DROP/TRUNCATE/ALTER.
// - Shell: comando inline com `deleteMany`, `prisma db push`, `prisma migrate`,
//   `DROP TABLE|DATABASE|SCHEMA`, `TRUNCATE`, `DELETE FROM`.
//   LIMITE HONESTO: script salvo em arquivo e executado por `node x.mjs` NAO
//   e inspecionado — o hook ve o comando, nao o arquivo. Isso fica escrito no
//   gotcha 65 e no PLAYBOOK, nao aqui.
//
// FALHA ABERTA POR DESENHO, como os hooks irmaos.
"use strict";

const fs = require("fs");
const path = require("path");

const ARQUIVO = path.join("hub", "live", "infra-ok.txt");
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

const NEON_ESCRITA = new Set([
  "restore_snapshot", "finalize_branch_restore", "reset_from_parent",
  "delete_branch", "delete_project", "delete_snapshot", "delete_postgres_database",
  "delete_postgres_endpoint", "delete_postgres_role", "delete_storage_bucket",
  "delete_storage_object", "delete_storage_objects_by_prefix", "delete_function",
  "prepare_database_migration", "complete_database_migration", "set_default_branch",
  "update_branch", "reset_postgres_role_password", "delete_auth_user",
]);
const NEON_SQL = new Set(["run_sql", "run_sql_transaction"]);
const SQL_DESTRUTIVO = /\b(DELETE\s+FROM|DROP\s+(TABLE|DATABASE|SCHEMA|INDEX)|TRUNCATE|ALTER\s+TABLE)\b/i;
const SHELL_DESTRUTIVO = /\b(deleteMany|prisma\s+(db\s+push|migrate)|DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+\w|DELETE\s+FROM)\b/;

function linhasDeclaradas() {
  try {
    if (!fs.existsSync(ARQUIVO)) return [];
    return fs.readFileSync(ARQUIVO, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/** Ha linha para esta ferramenta e este projeto, com `confirmo`? */
function liberado(ferramenta, projectId) {
  return linhasDeclaradas().some((l) => {
    const [tool, proj] = l.split(/\s+/);
    if (tool !== ferramenta) return false;
    if (!/\bconfirmo\b/i.test(l)) return false;
    return proj === "*" || (projectId && proj === projectId);
  });
}

function recusa(ferramenta, projectId, efeito) {
  process.stderr.write(
    "RECUSADO: " + ferramenta + (projectId ? " (projeto " + projectId + ")" : "") +
    " tem efeito colateral em infra" + (efeito ? " — " + efeito : "") + " — e nao ha\n" +
    "linha-antes-de-chamar em " + ARQUIVO + " para ela.\n" +
    "Escreva ANTES, uma linha: `" + ferramenta + " " + (projectId || "*") +
    " — <efeito traduzido em portugues> — confirmo`\n" +
    "(o `confirmo` e do dono, digitado por ele — PLAYBOOK, seguranca de banco).\n" +
    "Se o efeito e exploratorio, faca em DEV, nunca em producao (gotcha 65 do Forge).\n" +
    "Precedentes: incidents/2026-09-09-executor-apagou-dados-do-banco-sem-autorizacao.md,\n" +
    "incidents/2026-09-12-restore-snapshot-do-neon-trocou-a-main-de-producao.md"
  );
  process.exit(2);
}

let bruto = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { bruto += c; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(bruto);
    const tool = String((payload && payload.tool_name) || "");
    const input = (payload && payload.tool_input) || {};

    if (SHELL_TOOLS.has(tool)) {
      const cmd = String(input.command || "");
      const m = cmd.match(SHELL_DESTRUTIVO);
      if (!m) process.exit(0);
      if (liberado("bash", null) || liberado("bash", "*")) process.exit(0);
      recusa("bash", null, "`" + m[0] + "` no comando");
    }

    const neon = tool.match(/^mcp__neon__(.+)$/);
    if (!neon) process.exit(0);
    const nome = neon[1];
    const projectId = input.project_id || input.projectId || null;

    if (NEON_SQL.has(nome)) {
      const sql = String(input.sql || (Array.isArray(input.sqlStatements) ? input.sqlStatements.join("\n") : "") || "");
      const m = sql.match(SQL_DESTRUTIVO);
      if (!m) process.exit(0);
      if (liberado(tool, projectId)) process.exit(0);
      recusa(tool, projectId, "SQL com `" + m[0] + "`");
    }

    if (!NEON_ESCRITA.has(nome)) process.exit(0);
    if (liberado(tool, projectId)) process.exit(0);
    const efeito = nome === "restore_snapshot" && input.finalize !== false
      ? "restore com finalize (padrao) TROCA a main e move os computes"
      : null;
    recusa(tool, projectId, efeito);
  } catch {
    process.exit(0);   // falha aberta
  }
});
