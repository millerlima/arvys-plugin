#!/usr/bin/env node
/**
 * hub/live/simulate.js — grava em events.jsonl uma sequência de teste
 * realista (mesmo formato do hook.js) com timestamps atuais.
 *
 *   node hub/live/simulate.js [cena] [--keep]
 *
 * cena: edit     Forge editando + Deal bloqueado + Scout lendo
 *       reviewer Forge chamou o reviewer (reviewer lendo)
 *       all      sequência completa (padrão): Forge Stop, Scout dossiê, Deal bloqueado
 *       copa     tudo com timestamps de 6 min atrás (expira -> copa)
 *       salas    (pixel-art, onda 2) Forge com o reviewer no anexo + Scout entregando
 *                dossiê (sala de trabalho -> Arvys -> descanso): rode "edit" antes,
 *                com a página aberta, para ver os dois atravessarem as portas
 *       conversa (pixel-art, onda 3) os dois roteiros de conversa: "Forge entrega ao reviewer e
 *                os dois conversam" (reviewer lendo 3 arquivos, sem SubagentStop) e "Scout leva
 *                dossiê ao Arvys" (Write em docs/ + Stop). Os balões se alternam a cada tick de 2 s
 *       rh       (FILA 39, sala do RH) Forge editando + Pulse lendo + Deal bloqueado, E grava um
 *                boletim de ensaio com os 3 casos do plan.md: forge completo, pulse inteiro n/d
 *                (uma linha de propósito SEM motivoNd), e nenhuma entrada para "probe"/agente novo.
 *                Suba o serve.js com `--boletim <arquivo>` (caminho impresso no fim) para ver os 3.
 * --keep: não trunca o events.jsonl antes de gravar.
 * --out=<arquivo>: grava noutro jsonl (par do `--events` do serve.js) — ensaio sem apagar o log real.
 * --boletim-out=<arquivo>: onde a cena `rh` grava o boletim de ensaio (padrão: pasta temp do SO,
 *                nunca dentro do repo — company/OFFICE-METRICS.json real não é tocado).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const outFlag = args.find((a) => a.startsWith("--out="));
const EVENTS_PATH = outFlag ? path.resolve(outFlag.slice("--out=".length)) : path.join(__dirname, "events.jsonl");
const scene = args.find((a) => !a.startsWith("--")) || "all";
const keep = args.includes("--keep");

// T2.3: SID vira dinâmico — agente que nasce por /arvys:hire (ex.: "probe" no
// ensaio da onda 2) não está nesta tabela fixa e precisa de um session_id
// mesmo assim; sid() gera um na hora e memoriza, em vez de morrer com undefined.
const SID = { forge: "sim-forge-0001", scout: "sim-scout-0001", deal: "sim-deal-0001" };
function sid(agent) { return SID[agent] || (SID[agent] = `sim-${agent}-0001`); }
let t = Date.now() - (scene === "copa" ? 6 * 60 * 1000 : 30 * 1000);
const lines = [];

function ev(agent, event, extra) {
  t += 700;
  lines.push({
    ts: new Date(t).toISOString(),
    ms: 1,
    session_id: sid(agent),
    event,
    agent,
    agent_type: null,
    tool: null,
    target: null,
    ok: event !== "PostToolUseFailure",
    ...extra,
  });
}
function tool(agent, name, target, extra) {
  ev(agent, "PreToolUse", { tool: name, target, ...extra });
  ev(agent, "PostToolUse", { tool: name, target, ...extra });
}

// --- rh (FILA 39): 3 sessões vivas + boletim de ensaio; sai antes das cenas antigas
if (scene === "rh") {
  tool("forge", "Read", "hub/serve.js");
  tool("forge", "Edit", "hub/serve.js");
  tool("pulse", "Read", "company/OFFICE-METRICS.json");
  ev("deal", "PreToolUse", { tool: "Bash", target: "npm" });
  ev("deal", "PostToolUseFailure", { tool: "Bash", target: "npm" });
  if (!keep) fs.writeFileSync(EVENTS_PATH, "");
  fs.appendFileSync(EVENTS_PATH, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

  const nd = (fonte, motivoNd) => ({ valor: null, fonte, motivoNd });
  const boletim = {
    generatedAt: new Date().toISOString(),
    metricas: { boletim: {
      periodo: { semanaDaRetro: "2026-08-31", acumuladoDesde: "2026-08-31" },
      atribuicao: "por owner da spec",
      porAgente: {
        // caso 1: boletim completo (valores reais do worker de 2026-09-05)
        forge: {
          gateDePrimeira: { valor: { sim: 6, nao: 0, semRegistro: 7 }, fonte: "specs/*/spec.md:gate_aprovado" },
          defeitosConfirmados: { valor: { total: 17, specsComCampo: 12, specsSemCampo: 1 }, fonte: "specs/*/spec.md:defeitos_confirmados" },
          incidentes: { valor: 4, fonte: "incidents/*.md:**Agente:**" },
          sessoes: { valor: 3, fonte: "agents/forge/STATE.md:checkpoint" },
          tokensPorEntrega: { valor: { totalTokens: 16573259, sessoes: 1 }, fonte: "hub/live/events.jsonl:session_id→agent × company/TOKENS.json:sessions" },
          invasoesDeEscopo: { valor: 0, fonte: "incidents/*.md:**Tipo:** invasão de escopo" },
        },
        // caso 2: tudo n/d (agente sem spec como owner). `sessoes` vem SEM motivoNd de propósito:
        // readBoletim() tem de preencher o motivo, nunca deixar a linha vazia (risco 3 do plan.md)
        pulse: {
          gateDePrimeira: nd("specs/*/spec.md:gate_aprovado", "nenhuma spec com owner: pulse"),
          defeitosConfirmados: nd("specs/*/spec.md:defeitos_confirmados", "nenhuma spec com owner: pulse"),
          incidentes: nd("incidents/*.md:**Agente:**", "nenhum incidente com **Agente:** pulse"),
          sessoes: { valor: null, fonte: "agents/pulse/STATE.md:checkpoint" },
          tokensPorEntrega: nd("hub/live/events.jsonl:session_id→agent × company/TOKENS.json:sessions", "nenhuma sessão marca \"pulse\" como agente aberto"),
          invasoesDeEscopo: nd("incidents/*.md:**Tipo:** invasão de escopo", "nenhum incidente com **Tipo:** invasão de escopo (FILA 27)"),
        },
        // caso 3: agente sem entrada nenhuma (recém-contratado) = simplesmente não está aqui
      },
    } },
  };
  const bolFlag = args.find((a) => a.startsWith("--boletim-out="));
  const BOL_PATH = bolFlag ? path.resolve(bolFlag.slice("--boletim-out=".length)) : path.join(os.tmpdir(), "arvys-sim-boletim.json");
  fs.writeFileSync(BOL_PATH, JSON.stringify(boletim, null, 2) + "\n");
  console.log(`simulate: cena "rh" — ${lines.length} eventos em ${path.relative(process.cwd(), EVENTS_PATH)}`);
  console.log(`simulate: boletim de ensaio em ${BOL_PATH}\n  suba com: node hub/serve.js --boletim "${BOL_PATH}"`);
  return;
}

// --- Forge: Edit -> Bash vitest -> reviewer -> Stop
tool("forge", "Read", "hub/build.js");
if (scene === "edit") tool("forge", "Bash", "vitest");
tool("forge", "Edit", "hub/build.js");
if (scene !== "edit") tool("forge", "Bash", "vitest");
// --- Scout: Read x3 -> Write docs/x.md -> Stop
tool("scout", "Read", "docs/a.md");
tool("scout", "Read", "docs/b.md");
tool("scout", "Read", "docs/c.md");
// --- Deal: falha de ferramenta -> bloqueado
ev("deal", "PreToolUse", { tool: "Bash", target: "npm" });
ev("deal", "PostToolUseFailure", { tool: "Bash", target: "npm" });

if (scene !== "edit") {
  ev("forge", "SubagentStart", { agent_type: "reviewer" });
  tool("forge", "Read", "hub/build.js", { agent_type: "reviewer" });
  tool("forge", "Grep", "hub/", { agent_type: "reviewer" });
}
if (scene === "conversa") {              // reviewer segue lendo: o balão dele diz "lendo 3 arquivos" enquanto o Forge diz "com o reviewer"
  tool("forge", "Read", "hub/serve.js", { agent_type: "reviewer" });
  tool("forge", "Read", "hub/live/office.html", { agent_type: "reviewer" });
}
if (scene === "all" || scene === "copa") {
  ev("forge", "SubagentStop", { agent_type: "reviewer" });
  ev("forge", "Stop");
  tool("scout", "Write", "docs/benchmark-new-way.md");
  ev("scout", "Stop");
}
if (scene === "salas" || scene === "conversa") {   // reviewer segue ativo (Forge fica no anexo); Scout entrega e vai descansar
  tool("scout", "Write", "docs/benchmark-new-way.md");
  ev("scout", "Stop");
}

// --extra=<agente>: pra ensaiar o avatar genérico (T2.4) sem mexer nas cenas
// acima — um agente qualquer (ex.: "probe") lendo e editando, sentado na mesa dele.
const extraFlag = args.find((a) => a.startsWith("--extra="));
if (extraFlag) {
  const nome = extraFlag.slice("--extra=".length);
  tool(nome, "Read", "AGENT.md");
  tool(nome, "Edit", "STATE.md");
}

if (!keep) fs.writeFileSync(EVENTS_PATH, "");
fs.appendFileSync(EVENTS_PATH, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
console.log(`simulate: cena "${scene}" — ${lines.length} eventos em ${path.relative(process.cwd(), EVENTS_PATH)}`);
