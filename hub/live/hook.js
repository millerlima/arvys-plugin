#!/usr/bin/env node
// Hook passivo do QG ao vivo. Le stdin (payload do Claude Code), grava 1
// linha em hub/live/events.jsonl. Nunca lanca excecao, nunca escreve stdout,
// sempre sai com codigo 0.
const fs = require("fs");
const path = require("path");

function main() {
  const liveDir = path.join(__dirname);
  const eventsPath = path.join(liveDir, "events.jsonl");
  const sessionPath = path.join(liveDir, "session.json");
  const start = Date.now();

  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (e) {
    raw = "";
  }

  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    payload = {};
  }

  const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
  const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "unknown";
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : null;
  const agentType = typeof payload.agent_type === "string" ? payload.agent_type : null;

  // target: caminho relativo do arquivo (file_path/path/pattern) ou 1a
  // palavra do comando Bash. Nunca conteudo de arquivo, nunca comando inteiro.
  let target = null;
  try {
    const ti = payload.tool_input || {};
    let raw_target = ti.file_path || ti.path || ti.pattern || null;
    if (raw_target && typeof raw_target === "string") {
      target = path.isAbsolute(raw_target)
        ? path.relative(process.cwd(), raw_target).split(path.sep).join("/")
        : raw_target;
    } else if (typeof ti.command === "string" && ti.command.trim()) {
      target = ti.command.trim().split(/\s+/)[0];
    }
  } catch (e) {
    target = null;
  }

  // agent: le session.json e faz "claim" da sessao (R1, review 2026-09-05,
  // vazamento confirmado por PoC do reviewer). /arvys:open grava
  // {agent, since} SEM session_id — nao sabe qual sessao vai le-lo. Antes
  // deste claim, "session_id ausente" era tratado como "vale para
  // qualquer sessao", entao uma sessao PARALELA (outra janela, subagente)
  // que tocasse o mesmo repo herdava a etiqueta do agente aberto em OUTRA
  // janela, e o office-metrics debitava 100% dos tokens dela nesse agente.
  // Agora: o PRIMEIRO evento que chegar com session_id ausente em
  // session.json reivindica o arquivo, gravando o proprio session_id de
  // volta (escrita atomica .tmp + rename). Dali em diante so eventos DESSA
  // sessao recebem a tag; uma sessao paralela encontra session_id ja
  // preenchido e DIFERENTE do seu, e fica sem agente (nunca herda).
  let agent = null;
  try {
    if (fs.existsSync(sessionPath) && sessionId) {
      const sess = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
      if (!sess.session_id) {
        try {
          const claimed = Object.assign({}, sess, { session_id: sessionId });
          const tmpPath = sessionPath + "." + process.pid + "." + Date.now() + ".tmp";
          fs.writeFileSync(tmpPath, JSON.stringify(claimed));
          fs.renameSync(tmpPath, sessionPath);
        } catch (e) {
          // claim falhou (corrida, disco cheio, permissao): a sessao ainda
          // recebe a tag desta vez, mas o proximo evento tenta de novo —
          // pior caso e igual ao comportamento antigo, nunca pior.
        }
        agent = sess.agent || null;
      } else if (sess.session_id === sessionId) {
        agent = sess.agent || null;
      }
      // else: session.json ja reivindicado por OUTRA sessao — sem agente.
    }
  } catch (e) {
    agent = null;
  }

  let ok = true;
  try {
    if (payload.hook_event_name === "PostToolUseFailure") ok = false;
    if (payload.tool_response && payload.tool_response.error) ok = false;
  } catch (e) {}

  // Nao ha mkdir de hub/live: este script mora dentro dela. Se a pasta for
  // apagada, o proprio hook some — o Claude Code falha ao spawnar e segue;
  // sem protecao possivel aqui.

  // rotacao: se events.jsonl > 5 MB, renomeia para events.1.jsonl
  try {
    const stat = fs.existsSync(eventsPath) ? fs.statSync(eventsPath) : null;
    if (stat && stat.size > 5 * 1024 * 1024) {
      const rotated = path.join(liveDir, "events.1.jsonl");
      try { fs.rmSync(rotated, { force: true }); } catch (e) {}
      fs.renameSync(eventsPath, rotated);
    }
  } catch (e) {}

  const line = {
    ts: new Date().toISOString(),
    ms: Date.now() - start,
    session_id: sessionId,
    event,
    agent,
    agent_type: agentType,
    tool: toolName,
    target,
    ok,
  };

  try {
    fs.appendFileSync(eventsPath, JSON.stringify(line) + "\n");
  } catch (e) {}
}

try {
  main();
} catch (e) {
  // nunca lanca
}
process.exit(0);
