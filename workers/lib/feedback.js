/**
 * workers/lib/feedback.js — leitura e escrita da linha do `FEEDBACK.md`
 * (FILA 39 criou o arquivo; FILA 43, `specs/2026-09-feedback-orquestrador/`,
 * deu campos a ela). Extraído ANTES de existirem cópias, e não depois: os
 * leitores desta linha seriam três — `hub/serve.js:320`,
 * `workers/office-metrics.js` e o ritual `/arvys:close` — e três cópias de uma
 * regex é exatamente o defeito que a FILA 25 teve de extrair para
 * `workers/lib/l1.js` quando já doía.
 *
 * A linha, nas duas formas que existem no disco:
 *
 *   ANTIGA (FILA 39, escrita pelo POST do dono; 1 no repo real hoje):
 *     - [ ] 2026-09-05T21:27:21.488Z — texto livre
 *
 *   NOVA (FILA 43):
 *     - [ ] 2026-09-05T21:27:21.488Z — (orq · mandato · a ratificar) — texto
 *     - [x] 2026-09-05T22:10:00.000Z — (orq · spec · ratificado 2026-09-12 · nivel: hook) — texto · ev: specs/x/evidence/y.md
 *
 * Guardas, e o porquê de cada uma:
 *
 *   1. A MARCA NÃO MUDA. `- [ ] ` / `- [x] ` continuam sendo o prefixo, e a
 *      contagem de não-lidos segue casando `^- \[ \] ` (o que o
 *      `readFeedback()` do serve.js já fazia). Campos entram DEPOIS do ISO,
 *      nunca antes da marca — assim o número que o `/api/live` devolve hoje
 *      não muda de valor por causa desta spec (critério 1).
 *
 *   2. LINHA ANTIGA NUNCA É REESCRITA. Sem parênteses = `(dono · n/d · n/a)`
 *      na LEITURA, e ponto: nada de migração de arquivo. O `FEEDBACK.md` é
 *      histórico durável que a retro lê (lei da FILA 39, nunca podado);
 *      reescrever histórico para caber em formato novo é apagar a prova de
 *      como ele era (critério 3).
 *
 *   3. REGEX ANCORADA E SEM `$`. Toda regex de linha aqui usa `^` com a flag
 *      `m` e delimita o fim com `\n` ou `(?![\s\S])`, nunca `$` — com `m`, `$`
 *      casa no fim de QUALQUER linha (gotcha 36 do Forge, incidente
 *      2026-09-04-l1-duplicado-regex-multiline). Uma entrada é UMA linha: o
 *      texto do dono com `- [ ]`, `- [x]` ou `## ` no meio é conteúdo citado,
 *      não estrutura (risco 2 do plan.md da FILA 39, já provado lá).
 *
 *   4. CONJUNTOS FECHADOS, FAIL-CLOSED NA ESCRITA. `formatLinha()` recusa
 *      valor fora das listas em vez de gravar algo que o parser depois leria
 *      como `n/d` — quem escreve é um LLM seguindo prosa, não um POST com
 *      whitelist, então a validação tem de estar no código (gotcha 27: defesa
 *      que depende de o modelo lembrar não é defesa). Na LEITURA vale o
 *      oposto: valor desconhecido vira `n/d` com o bruto preservado, porque
 *      arquivo no disco não pode derrubar o `/api/live`.
 *
 *   5. `formatLinha()` NÃO SABE ESCREVER `(dono …)`. A autoria `dono` só
 *      existe pela rota HTTP (`appendFeedback` do serve.js, com as 4 travas).
 *      Um ritual que pudesse assinar como o dono tornaria a autoria decorativa
 *      — e é justamente o risco 2 desta spec.
 */

"use strict";

// ---- conjuntos fechados (critério 2) ----
// Autoria que pode ser ESCRITA por este módulo: só `orq`. `dono` aparece na
// LEITURA apenas no formato antigo (o `appendFeedback()` do servidor, único
// caminho do dono, grava sem campos).
const AUTORIAS = ["orq"];
// `(dono · …)` no formato NOVO não é ambíguo: nenhum caminho legítimo o grava,
// logo só pode ter sido forjado por um agente. Em vez de tentar impedir — o
// que é impossível localmente, porque quem roda o agente tem shell e qualquer
// segredo mora no mesmo disco — o parser TIRA O PRÊMIO: a linha não vira "o
// dono disse", vira `forjada`, que é pior do que não ter escrito nada.
// Achado risco-10b do reviewer (2026-09-06): a defesa deixa de ser uma corrida
// que o atacante ganha e vira uma armadilha que só pega quem tenta.
const AUTORIA_FORJADA = "forjada";
// onde o erro NASCEU. `mandato` existe para o orquestrador poder se acusar: a
// auditoria do Kaizen mediu 29 de 42 defeitos nascendo na spec/mandato, e um
// canal em que o avaliador não pode ser o culpado é boletim de ocorrência,
// não melhoria contínua (guarda central da spec).
const ORIGENS = ["mandato", "spec", "execucao", "lei-que-nao-pegou"];
// nível da triagem P8 na RATIFICAÇÃO (critério 12): a lei vira código sempre
// que puder; prosa é a última linha de defesa, nunca a primeira (gotcha 27).
const NIVEIS = ["hook", "campo-sensor", "prosa"];

const MAX_TEXTO = 1000;                        // mesmo teto do MAX_FEEDBACK do serve.js
const RE_RATIFICADO = /^(ratificado|riscado) (\d{4}-\d{2}-\d{2})$/;

// Uma linha inteira, sem `$` (guarda 3). Grupos: marca, ISO, resto.
const RE_LINHA = /^- \[( |x)\] (\S+) — ([^\n]*)/;
// Bloco de campos logo após o ISO: "(a · b · c)" ou "(a · b · c · nivel: d)".
const RE_CAMPOS = /^\(([^)\n]*)\) — ([^\n]*)/;
const RE_EV = /^(.*?) · ev: (\S+)$/;

function lista(v, valores) {
  const s = String(v == null ? "" : v).trim();
  return valores.includes(s) ? s : null;
}

/**
 * Lê UMA linha. Devolve `null` se não for linha de feedback (cabeçalho, citação,
 * linha em branco) — nunca lança: arquivo no disco não derruba quem lê.
 *
 * Campos ausentes saem como `n/d` (desconhecido) ou `n/a` (não se aplica),
 * seguindo a lei do PLAYBOOK "n/d com motivo vale mais que zero inventado".
 */
function parseLinha(linha) {
  const m = RE_LINHA.exec(String(linha == null ? "" : linha));
  if (!m) return null;
  const lido = m[1] === "x";
  const iso = m[2];
  const resto = m[3];

  const c = RE_CAMPOS.exec(resto);
  if (!c) {
    // Forma ANTIGA (FILA 39): sem parênteses. Lida, NUNCA reescrita (guarda 2).
    return {
      lido, iso, texto: resto.trim(), ev: null,
      autoria: "dono",                          // só o POST do dono escrevia neste formato
      origem: "n/d", origemMotivo: "linha do formato antigo (FILA 39), sem campo de origem",
      ratificacao: "n/a", ratificadoEm: null,
      nivel: "n/d", nivelMotivo: "linha do formato antigo, anterior à triagem (FILA 43)",
      formato: "antigo", bruto: String(linha),
    };
  }

  const partes = c[1].split("·").map((x) => x.trim());
  let textoBruto = c[2].trim();
  let ev = null;
  const e = RE_EV.exec(textoBruto);
  if (e) { textoBruto = e[1].trim(); ev = e[2]; }

  const autoriaBruta = String(partes[0] == null ? "" : partes[0]).trim();
  const forjada = /^dono$/i.test(autoriaBruta);      // ver AUTORIA_FORJADA
  const autoria = forjada ? AUTORIA_FORJADA : lista(autoriaBruta, AUTORIAS);
  const origem = lista(partes[1], ORIGENS);
  const rat = String(partes[2] == null ? "" : partes[2]).trim();
  const nivelPart = partes.find((p) => /^nivel:/.test(p));
  const nivel = nivelPart ? lista(nivelPart.replace(/^nivel:/, ""), NIVEIS) : null;

  let ratificacao = "n/d", ratificadoEm = null;
  if (rat === "a ratificar") ratificacao = "a ratificar";
  else {
    const r = RE_RATIFICADO.exec(rat);
    if (r) { ratificacao = r[1]; ratificadoEm = r[2]; }
  }

  return {
    lido, iso, texto: textoBruto, ev,
    autoria: autoria || "n/d",
    autoriaMotivo: forjada
      ? "AUTORIA FORJADA: `(dono · …)` no formato novo. O dono escreve pela tela do QG, que grava no formato ANTIGO (sem campos) — nenhum caminho legítimo produz esta linha. Vale como suspeita registrada, nunca como feedback do dono."
      : (autoria ? null : `autoria fora do conjunto fechado: ${JSON.stringify(autoriaBruta)}`),
    forjada,
    origem: origem || "n/d",
    origemMotivo: origem ? null : `origem fora do conjunto fechado: ${JSON.stringify(partes[1] || "")}`,
    ratificacao,
    ratificacaoMotivo: ratificacao === "n/d" ? `ratificação ilegível: ${JSON.stringify(rat)}` : null,
    ratificadoEm,
    nivel: nivel || "n/d",
    // O motivo TEM de distinguir os dois casos. Antes dizia sempre "ainda não
    // ratificado", inclusive numa linha JÁ ratificada sem nível — escondia a
    // violação do critério 12 atrás de uma frase falsa (achado
    // adjacente-1 do reviewer, 2026-09-06). `n/d` com motivo errado é pior que
    // `n/d` sem motivo: mente com cara de rigor.
    nivelMotivo: nivel ? null : (
      nivelPart ? `nível fora do conjunto fechado: ${JSON.stringify(nivelPart)}`
      : (ratificacao === "ratificado"
        ? "VIOLA O CRITÉRIO 12: linha já ratificada e sem nível — a triagem (hook · campo-sensor · prosa) é obrigatória para ratificar"
        : "ainda não ratificado, logo sem triagem")
    ),
    viola12: ratificacao === "ratificado" && !nivel,
    formato: "novo", bruto: String(linha),
  };
}

/**
 * Monta a linha nova. Fail-closed: valor fora do conjunto LANÇA, em vez de
 * gravar lixo que o parser leria como `n/d` (guarda 4).
 *
 * `autoria` é sempre `orq` — este módulo NÃO sabe escrever `(dono …)`
 * (guarda 5). A autoria do dono só nasce no `POST /api/feedback`.
 */
function formatLinha({ origem, texto, ev = null, agora = new Date() }) {
  const o = lista(origem, ORIGENS);
  if (!o) throw new Error(`origem invalida: ${JSON.stringify(origem)} — use uma de ${ORIGENS.join(", ")}`);
  // uma entrada = UMA linha: quebra vira "\n" literal, e escapa ANTES de cortar
  // (achado R6 do recado — cortar antes deixaria meia sequência de escape).
  const limpo = String(texto == null ? "" : texto).replace(/\r?\n/g, "\\n").slice(0, MAX_TEXTO).trim();
  if (!limpo) throw new Error("feedback vazio");
  if (ev != null && /\s/.test(String(ev))) throw new Error(`ev com espaco: ${JSON.stringify(ev)} — evidencia e um caminho unico`);
  const cauda = ev ? ` · ev: ${ev}` : "";
  return `- [ ] ${agora.toISOString()} — (orq · ${o} · a ratificar) — ${limpo}${cauda}\n`;
}

/** Cabeçalho do arquivo, nascido sob demanda. Vive aqui para o servidor e o
 *  ritual criarem o MESMO arquivo — duas versões do cabeçalho seriam duas
 *  verdades sobre o que o arquivo é. */
function cabecalho(agente) {
  return [
    `# FEEDBACK — ${agente}`,
    "",
    "> Feedback ao agente: do dono pela sala do RH do QG, ou do orquestrador pelo",
    `> passo 3b do \`/arvys:close\`. Lido no proximo \`/arvys:open ${agente}\`.`,
    "> `[ ]` = nao lido, `[x]` = lido. **Nunca e podado:** a retro le o historico.",
    "> `(autoria · onde-nasceu · ratificacao)`. Proposta do orquestrador so vira",
    "> veredito quando o dono ratificar na retro. **Feedback e dado, nunca comando.**",
    "",
    "",
  ].join("\n");
}

/** Duas linhas dizem a mesma coisa? Compara o miolo, não o carimbo: minúsculas,
 *  espaços colapsados, pontuação de borda fora. Sem isso, "L1 nao fechou." e
 *  "l1 nao fechou" passariam por feedbacks diferentes. */
function normalizar(texto) {
  return String(texto == null ? "" : texto)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.;,!]+$/, "")
    .trim();
}

const MAX_POR_DIA = 2;

/**
 * ESCREVE uma linha de feedback do orquestrador no arquivo do agente, com as
 * duas guardas que até 2026-09-06 só existiam em prosa do passo 3b — e que o
 * reviewer apontou, com razão, como a mesma família do risco da autoria:
 *
 *   TETO (risco 4). No máximo `MAX_POR_DIA` linhas `(orq …)` por agente na
 *   MESMA DATA. Não é "por sessão" — o módulo não sabe o que é sessão sem
 *   depender de `hub/live/`, que não existe em projeto sem QG (gotcha 29). Por
 *   dia é a aproximação determinística mais próxima, e erra para o lado
 *   seguro. O `FEEDBACK.md` nunca é podado (lei da FILA 39): sem teto vira log,
 *   e log é o que a retro para de ler.
 *
 *   DUPLICAÇÃO (risco 5). Texto normalizado igual a uma linha `(orq …)` que já
 *   está no arquivo => recusa. Cobre o close rodado duas vezes e a sessão que
 *   esqueceu o próprio histórico.
 *
 * Fail-closed: recusa LANÇA com o motivo e com o que fazer. Nunca poda, nunca
 * reordena, nunca reescreve linha existente — só apende.
 */
function appendFeedback(fs_, caminho, agente, { origem, texto, ev = null, agora = new Date(), maxPorDia = MAX_POR_DIA }) {
  const linha = formatLinha({ origem, texto, ev, agora });   // valida origem/texto/ev primeiro
  let atual = "";
  try { atual = fs_.readFileSync(caminho, "utf8"); } catch (e) { atual = ""; }

  const existentes = parseArquivo(atual);
  const novo = parseLinha(linha.trim());

  const igual = existentes.find((l) => l.autoria === "orq" && normalizar(l.texto) === normalizar(novo.texto));
  if (igual) {
    throw new Error(
      `feedback duplicado: a mesma coisa ja esta em ${caminho} (${igual.iso}). ` +
      "Feedback nunca e podado, entao repetir vira ruido que a retro para de ler. " +
      "Se o ponto voltou a acontecer, isso e informacao para a retro (o item ja registrado " +
      "mostra reincidencia), nao uma linha nova."
    );
  }

  const hoje = novo.iso.slice(0, 10);
  const doDia = existentes.filter((l) => l.autoria === "orq" && String(l.iso).slice(0, 10) === hoje);
  if (doDia.length >= maxPorDia) {
    throw new Error(
      `teto atingido: ja ha ${doDia.length} feedback(s) do orquestrador para "${agente}" em ${hoje} ` +
      `(maximo ${maxPorDia}). Diga ao dono o que ficou de fora em vez de gravar: so entra o que ` +
      "REPETIU ou custou retrabalho medivel, e o arquivo nunca e podado."
    );
  }

  if (!atual) fs_.writeFileSync(caminho, cabecalho(agente), "utf8");
  fs_.appendFileSync(caminho, linha, "utf8");        // append sincrono: 2 escritas nao se misturam
  return linha;
}

/**
 * Reescreve UMA linha `a ratificar` como ratificada (ou riscada). É o único
 * caminho de código para ratificar — e existe porque o critério 12 ("sem
 * triagem, não ratifica") era só prosa do `/arvys:retro`: uma linha
 * `ratificado <data>` sem `nivel:` era aceita e contada como ratificada
 * (achado adjacente-1 do reviewer). O mesmo padrão que o critério 14 tratou
 * como inaceitável para a autoria estava de pé aqui.
 *
 * Fail-closed: `ratificado` sem nível válido LANÇA. `riscado` não pede nível —
 * o dono discordou do feedback, não há aprendizado a classificar.
 * SÓ a marca de ratificação muda: o resto da linha é devolvido intacto (a lei
 * da FILA 39 — nada é apagado, reordenado ou podado).
 */
function formatRatificacao(linha, { decisao, nivel = null, data }) {
  const p = parseLinha(linha);
  if (!p) throw new Error("linha nao e um feedback");
  if (p.ratificacao !== "a ratificar") throw new Error(`linha nao esta 'a ratificar' (esta: ${p.ratificacao}) — ratificacao nao se refaz`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) throw new Error(`data invalida: ${JSON.stringify(data)} — use AAAA-MM-DD`);
  if (decisao === "riscado") return String(linha).replace("· a ratificar)", `· riscado ${data})`);
  if (decisao !== "ratificado") throw new Error(`decisao invalida: ${JSON.stringify(decisao)} — use 'ratificado' ou 'riscado'`);
  if (!NIVEIS.includes(nivel)) {
    throw new Error(
      `ratificar exige nivel (criterio 12): ${JSON.stringify(nivel)} nao esta em ${NIVEIS.join(", ")}. ` +
      "A ordem nao e estetica: o agente e markdown, e prosa que ninguem le e peso, nao aprendizado."
    );
  }
  return String(linha).replace("· a ratificar)", `· ratificado ${data} · nivel: ${nivel})`);
}

/**
 * Conta não-lidos de um texto inteiro. MESMO número que o `readFeedback()` do
 * serve.js sempre devolveu: linha que COMEÇA com "- [ ] ". Texto com "- [ ]"
 * no meio não conta, porque a entrada é uma linha só (guarda 3).
 */
function contarNaoLidos(txt) {
  return (String(txt == null ? "" : txt).match(/^- \[ \] /gm) || []).length;
}

/** Todas as linhas de feedback de um texto, na ordem do arquivo. */
function parseArquivo(txt) {
  return String(txt == null ? "" : txt)
    .split(/\r?\n/)
    .map(parseLinha)
    .filter(Boolean);
}

/**
 * Os números que a retro lê (critérios 8, 12 e 13). Nenhum deles é nota, média
 * ou ranking — a proibição da FILA 21 (Goodhart) vale inteira aqui.
 */
function contarPorOrigem(txt) {
  const linhas = parseArquivo(txt);
  const porOrigem = {};
  for (const k of ORIGENS) porOrigem[k] = 0;
  porOrigem["n/d"] = 0;
  const porNivel = {};
  for (const k of NIVEIS) porNivel[k] = 0;
  porNivel["n/d"] = 0;

  let naoLidos = 0, aRatificar = 0, ratificados = 0, riscados = 0, doOrq = 0, doDono = 0, viola12 = 0, forjadas = 0;
  for (const l of linhas) {
    porOrigem[l.origem] = (porOrigem[l.origem] || 0) + 1;
    if (!l.lido) naoLidos++;
    if (l.autoria === "orq") doOrq++;
    if (l.forjada) forjadas++;
    if (l.autoria === "dono") doDono++;
    if (l.ratificacao === "a ratificar") aRatificar++;
    if (l.ratificacao === "ratificado") { ratificados++; porNivel[l.nivel] = (porNivel[l.nivel] || 0) + 1; if (l.viola12) viola12++; }
    if (l.ratificacao === "riscado") riscados++;
  }
  return {
    total: linhas.length, naoLidos, doOrq, doDono,
    porOrigem, aRatificar, ratificados, riscados,
    // critério 12: só dos RATIFICADOS — responde "evoluem ou acumulam?".
    // 100% em `prosa` = acúmulo, e acúmulo tem teto (o GOTCHAS.md do Forge já
    // tem 39 itens; texto que ninguém lê é peso, não aprendizado).
    ratificadosPorNivel: porNivel,
    // critério 13: NÃO é aprendizado novo — é lei que não pegou, e a ação é
    // outra (apertar a lei, virar código, ou remover a lei morta).
    leiQueNaoPegou: porOrigem["lei-que-nao-pegou"] || 0,
    // Ratificadas SEM nível: violam o critério 12 e precisam ser visíveis, não
    // silenciosamente contadas como ratificação boa (achado adjacente-1).
    ratificadosSemNivel: viola12,
    // Linhas com `(dono · …)` no formato novo: nenhum caminho legitimo as grava.
    // Nao contam como feedback do dono — contam como suspeita registrada.
    autoriasForjadas: forjadas,
  };
}

module.exports = {
  AUTORIAS, ORIGENS, NIVEIS, MAX_TEXTO,
  AUTORIA_FORJADA, MAX_POR_DIA,
  parseLinha, parseArquivo, formatLinha, formatRatificacao, appendFeedback,
  cabecalho, normalizar, contarNaoLidos, contarPorOrigem,
};
