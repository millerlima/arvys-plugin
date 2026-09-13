#!/usr/bin/env node
// UserPromptSubmit hook: o COACH DE PROMPT. Quando o pedido do dono chega vago
// ou com varios assuntos num prompt so, injeta contexto mandando o orquestrador
// ATENDER o pedido como veio E fechar a resposta com o bloco
//   "Recebi. Se tivesse vindo assim, eu renderia mais:"
// com o proprio pedido reescrito nos 4 campos (objetivo · contexto · limite ·
// pronto). Ensina com o exemplo da pessoa, nunca com sermao.
//
// ORIGEM: spec `specs/2026-09-biblioteca/` (criterio 6, riscos R2/R3), pedido
// do dono em `company/FILA.md` item 2(b): "atende E mostra a versao reescrita
// do PROPRIO pedido". Regras anti-chatice literais do dono: no maximo 1
// micro-licao por sessao, adaptada ao perfil, desligavel no OWNER.md.
//
// HEURISTICA DECLARADA (mudar aqui = mudar este comentario junto):
//   vago        = SEM verbo de acao (VERBOS_DE_ACAO) E SEM criterio de pronto
//                 (CRITERIO_DE_PRONTO) E menos de 12 palavras.
//   multiassunto = 3 ou mais trechos que COMECAM com verbo de acao (ancora
//                 ^verbo: "nao faz isso; nao apaga aquilo" NAO conta), separados
//                 por " e ", ";" ou quebra de linha.
//   Qualquer outro prompt e "claro" e o coach cala.
//   RESPOSTA DE GATE nunca e vaga: "sim", "ok", "quebrar em partes", "continua"
//   etc. (lista RESPOSTAS_DE_GATE, case-insensitive, pontuacao final ignorada)
//   saem ANTES da heuristica — apos /clear o 1o prompt da sessao costuma ser
//   isso (review B, achado 1).
//
// O QUE E IGNORADO SEMPRE (silencio, sem custo): prompt que comeca com "/"
// (ritual /arvys:* ou comando do Claude Code), prompt com mais de 4 kB (colado
// de arquivo), vazio, ou so emoji/pontuacao (sem letra nem digito).
//
// LIGA/DESLIGA pelo `OWNER.md` do cwd:
//   linha `Coach de prompt: ligado|desligado` manda;
//   sem a linha -> pelo `Perfil:` (vibecoder = ligado, dev = desligado);
//   sem OWNER.md ou sem perfil -> ligado.
//   OWNER.md em UTF-16 ou com bytes nulos (encoding estranho) -> silencio.
//
// UMA POR SESSAO: marca `hub/live/coach-<session_id>.txt` no cwd (cwd que nao
// existe = silencio; o hook nunca cria arvore fora do projeto). Marca
// existente = ja ensinou nesta sessao = cala. Marcas com mais de 24 h sao lixo
// de sessao morta e o proprio hook apaga. `hub/live/` e efemero (nunca no git).
//
// Contrato (code.claude.com/docs/en/hooks): stdin e o payload JSON
// { prompt, session_id, cwd }; stdout e JSON
// { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }
// ou nada.
//
// FALHA ABERTA POR DESENHO, como os hooks irmaos: stdin vazio, JSON truncado,
// campo faltando, OWNER.md ilegivel ou erro interno => EXIT 0 SEMPRE, sem saida.
// Este hook roda em TODO prompt do dono: se quebrar, derruba o prompt.
"use strict";

const fs = require("fs");
const path = require("path");

const MAX_BYTES = 4096;

// Respostas de gate: o dono respondendo a uma pergunta do orquestrador. Nunca vago.
const RESPOSTAS_DE_GATE = new Set([
  "sim", "não", "nao", "ok", "ajustar", "quebrar em partes", "continua", "segue",
  "siga", "pode", "vai", "confirmo", "aprovado", "aprovo",
]);
const MIN_PALAVRAS_CLARO = 12;
const MIN_IMPERATIVOS_MULTI = 3;

// Verbos de acao (PT-BR + EN), radicais com sufixo livre. Lista curta de
// proposito: o que o escritorio pede de verdade.
const VERBOS_DE_ACAO = new RegExp(
  "\\b(" + [
    "cri[ae]r?", "faz", "fa[cç]a", "fazer", "implement\\w*", "adicion\\w*", "remov\\w*",
    "apag\\w*", "corrig\\w*", "consert\\w*", "ajust\\w*", "mud[ae]r?", "alter\\w*",
    "escrev\\w*", "grav\\w*", "rod[ae]r?", "execut\\w*", "test[ae]r?", "verific\\w*",
    "confer\\w*", "list[ae]r?", "mostr\\w*", "explic\\w*", "analis\\w*", "revis\\w*",
    "refator\\w*", "ger[ae]r?", "atualiz\\w*", "instal\\w*", "configur\\w*", "public\\w*",
    "abr[aei]r?", "fech[ae]r?", "leia", "ler", "busc\\w*", "procur\\w*", "encontr\\w*",
    "renome\\w*", "mov[ae]r?", "copi[ae]r?", "migr\\w*", "sub[ae]r?", "sobe", "commit\\w*",
    "deploy\\w*", "melhor[ae]r?", "troc[ae]r?", "trat[ae]r?", "monta?r?", "coloc\\w*", "tir[ae]r?",
    "add", "fix", "create", "make", "build", "write", "run", "update", "delete", "remove",
    "refactor", "check", "show", "explain", "find", "deploy", "test", "list", "read",
    "open", "move", "rename", "implement", "install", "configure",
  ].join("|") + ")\\b",
  "i"
);

// Criterio de pronto: palavras que dizem QUANDO esta feito.
const CRITERIO_DE_PRONTO = /\b(pronto|quando|at[eé]|deve[m]?|precisa[m]?|tem que|assim que|exit|verde|passa[r]?|passe|funcion\w*|sem erro|aceit\w*|crit[eé]rio|done|until|should|must|pass(es|ing)?|expect\w*)\b/i;

function palavras(texto) {
  return texto.trim().split(/\s+/).filter(Boolean);
}

/** "Sim.", "OK!", "quebrar em partes" — resposta de gate, sai antes da heuristica. */
function ehRespostaDeGate(prompt) {
  const p = prompt.trim().toLowerCase().replace(/[\s.!?…]+$/u, "").replace(/\s+/g, " ");
  return RESPOSTAS_DE_GATE.has(p);
}

// Mesma lista de verbos, ancorada no inicio do trecho.
const COMECA_COM_VERBO = new RegExp("^\\s*" + VERBOS_DE_ACAO.source.slice(2), "i");

/** Vago: nada de verbo, nada de "pronto quando", e curto. */
function ehVago(prompt) {
  return (
    !VERBOS_DE_ACAO.test(prompt) &&
    !CRITERIO_DE_PRONTO.test(prompt) &&
    palavras(prompt).length < MIN_PALAVRAS_CLARO
  );
}

/** Multiassunto: 3+ trechos que comecam com verbo de acao, separados por " e " / ";" / linha. */
function ehMultiassunto(prompt) {
  const trechos = prompt.split(/\s+e\s+|;|\r?\n/i).map((t) => t.trim()).filter(Boolean);
  let imperativos = 0;
  for (const t of trechos) {
    if (COMECA_COM_VERBO.test(t)) imperativos++;
  }
  return imperativos >= MIN_IMPERATIVOS_MULTI;
}

/** O prompt e do tipo que o coach nem olha? */
function ignorar(prompt) {
  const p = prompt.trim();
  if (!p) return true;
  if (p.startsWith("/")) return true;
  if (Buffer.byteLength(p, "utf8") > MAX_BYTES) return true;
  if (!/[\p{L}\p{N}]/u.test(p)) return true;   // so emoji/pontuacao
  return false;
}

/**
 * Le o OWNER.md do cwd e decide { ligado, perfil }.
 * perfil: "vibecoder" | "dev" | null. Encoding estranho => ligado: false.
 */
function lerOwner(cwd) {
  const arq = path.join(cwd, "OWNER.md");
  if (!fs.existsSync(arq)) return { ligado: true, perfil: null };
  const buf = fs.readFileSync(arq);
  const utf16 = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
  if (utf16 || buf.includes(0)) return { ligado: false, perfil: null };
  const texto = buf.toString("utf8");

  const perfilM = texto.match(/Perfil\s*:\s*\**\s*(vibecoder|dev)\b/i);
  const perfil = perfilM ? perfilM[1].toLowerCase() : null;

  const coachM = texto.match(/Coach de prompt\s*:\s*\**\s*(ligado|desligado)\b/i);
  if (coachM) return { ligado: coachM[1].toLowerCase() === "ligado", perfil };
  if (perfil === "dev") return { ligado: false, perfil };
  return { ligado: true, perfil };
}

const PASTA_LIVE = path.join("hub", "live");
const VIDA_DA_MARCA_MS = 24 * 60 * 60 * 1000;

/** Nome de arquivo seguro a partir do session_id (sem barra, sem espaco). */
function nomeDaMarca(sessionId) {
  return "coach-" + String(sessionId).replace(/[^\w.-]/g, "_").slice(0, 120) + ".txt";
}

/** Apaga marcas de sessoes mortas (mais de 24 h). Nunca falha para fora. */
function limparMarcasVelhas(live) {
  try {
    const agora = Date.now();
    for (const f of fs.readdirSync(live)) {
      if (!/^coach-.*\.txt$/.test(f)) continue;
      try {
        const st = fs.statSync(path.join(live, f));
        if (agora - st.mtimeMs > VIDA_DA_MARCA_MS) fs.unlinkSync(path.join(live, f));
      } catch {}
    }
  } catch {}
}

/** Ja ensinou nesta sessao? Se nao, grava a marca e devolve false. cwd inexistente => true (cala). */
function jaEnsinou(cwd, sessionId) {
  if (!fs.existsSync(cwd)) return true;
  const live = path.join(cwd, PASTA_LIVE);
  fs.mkdirSync(live, { recursive: true });
  limparMarcasVelhas(live);
  const marca = path.join(live, nomeDaMarca(sessionId));
  if (fs.existsSync(marca)) return true;
  fs.writeFileSync(marca, new Date().toISOString() + "\n");
  return false;
}

/** O texto que o orquestrador recebe como contexto adicional. */
function contexto(prompt, perfil, motivo) {
  const tom = perfil === "dev"
    ? "Tom: direto, sem analogia, sem sermao."
    : "Tom: 1 analogia curta (1 frase), sem sermao.";
  return [
    "[coach de prompt — micro-licao unica desta sessao]",
    "O pedido acima veio " + motivo + ". ATENDA o pedido normalmente, como veio.",
    "Depois, FECHE a resposta com este bloco (no maximo 6 linhas):",
    "  Recebi. Se tivesse vindo assim, eu renderia mais:",
    "  objetivo: <o que o dono quer, em 1 linha>",
    "  contexto: <arquivo/tela/estado de partida que faltou>",
    "  limite: <o que NAO tocar>",
    "  pronto: <como o dono sabe que ficou pronto>",
    "Reescreva o PROPRIO pedido do dono nesses 4 campos — nao um exemplo generico.",
    tom + " Nao execute a versao reescrita; so mostre. Nao repita esta licao nesta sessao.",
  ].join("\n");
}

let bruto = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { bruto += c; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(bruto);
    const prompt = String((payload && payload.prompt) || "");
    if (ignorar(prompt)) process.exit(0);
    if (ehRespostaDeGate(prompt)) process.exit(0);

    const cwd = String((payload && payload.cwd) || process.cwd());
    const owner = lerOwner(cwd);
    if (!owner.ligado) process.exit(0);

    let motivo = null;
    if (ehMultiassunto(prompt)) motivo = "com varios assuntos num prompt so";
    else if (ehVago(prompt)) motivo = "vago (sem verbo de acao nem criterio de pronto)";
    if (!motivo) process.exit(0);

    const sessionId = String((payload && payload.session_id) || "sem-id");
    if (jaEnsinou(cwd, sessionId)) process.exit(0);   // 1 micro-licao por sessao

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: contexto(prompt, owner.perfil, motivo),
      },
    }));
    process.exit(0);
  } catch {
    process.exit(0);   // falha aberta: hook quebrado nunca derruba o prompt do dono
  }
});
