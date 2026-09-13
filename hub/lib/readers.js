/**
 * hub/lib/readers.js — leitores do escritório (arquivo = fonte de verdade).
 *
 * Nasceu na spec `2026-09-qg-plataforma` (T1/T2). Duas famílias vivem aqui:
 *
 *  1. EXTRAÍDOS de `hub/build.js` (`parseFrontmatter`, `section`, `listItems`,
 *     `readAgent`, `readCompany`, `readTokens`, `parseDecisions`,
 *     `readDecisions`, `CLASSIC_ORDER`, `listAgentDirs`, `RITUALS`, `ORIGINS`).
 *     Comportamento IDÊNTICO ao que o build tinha — o sensor da T1 é o
 *     `hub/index.html` byte a byte. Eles ainda lançam onde sempre lançaram
 *     (o build quer morrer se `agents/x/AGENT.md` sumir no meio).
 *
 *  2. NOVOS, para o `/api/qg`. Contrato único, sem exceção:
 *        { ok: true,  data }                 — leu e entendeu
 *        { ok: true,  data: null }           — arquivo/pasta AUSENTE (vazio ≠ erro)
 *        { ok: false, raw, erro }            — existe mas está torto: bruto recortado + motivo
 *     NENHUM leitor novo lança. A regra da spec: o QG renderiza, nunca valida —
 *     um arquivo torto degrada mostrando o cru daquele bloco, jamais derruba a
 *     página. Torto cobre: bytes inválidos em UTF-8, arquivo acima do teto,
 *     frontmatter aberto (`---` sem fechamento), parser que lança.
 *
 * Regra do escritório — uma regra, um lugar: a linha do FEEDBACK.md é lida
 * pelo parser de `workers/lib/feedback.js`; a marca do INBOX.md pela de
 * `workers/lib/inbox.js`. Nada aqui reinventa essas regex.
 *
 * Números do escritório (gates, placar, boletim) NÃO moram aqui: vêm de
 * `hub/metrics.js` (spec 2026-09-office-metrics). `readSpecs` lê o frontmatter
 * de cada spec para a seção Trabalho mostrar o ARQUIVO (status, gate,
 * evidência) — não conta nada: contagem é do worker.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const fbLib = require('../../workers/lib/feedback');
const inboxLib = require('../../workers/lib/inbox');
const origemDisco = require('./origem-disco');

/**
 * spec 2026-09-saas-e5-projecao (T2 / decisão D-E5-2): todo leitor daqui passa
 * a receber DE ONDE ler — uma "origem" injetada, com a interface mínima
 * `{lerTexto, existe, listar, estado}` (ver `hub/lib/origem-disco.js`). Quem
 * não injeta nada continua lendo do disco, byte a byte como sempre — por
 * isso `origem = origemDisco` é o padrão em toda função exportada daqui.
 * NENHUM leitor chama `fs`/`path` para abrir conteúdo diretamente a partir
 * desta onda; `path` continua servindo só para montar caminhos (`path.join`),
 * o que não é E/S.
 *
 * Duas funções (`readAgent`, `readCompany`, `listAgentDirs` — a família
 * "contrato antigo do build") têm o dever de LANÇAR quando o arquivo/pasta
 * não existe (`hub/build.js` quer morrer se isso sumir no meio). Como a
 * origem devolve `null` para ausente (nunca lança por ausência), essas três
 * sintetizam o erro ENOENT que o `fs` lançaria — ver `lancaSeAusente()`.
 */
function lancaSeAusente(valor, caminho, comoAbriu) {
  if (valor !== null) return valor;
  const e = new Error(`ENOENT: no such file or directory, ${comoAbriu} '${caminho}'`);
  e.code = 'ENOENT';
  throw e;
}

// ---------------------------------------------------------------------------
// 1. EXTRAÍDOS de hub/build.js — comportamento preservado byte a byte
// ---------------------------------------------------------------------------

function parseFrontmatter(md) {
  // strip BOM (\uFEFF): files written by PowerShell redirects start with it
  const m = md.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').trim();
    }
  }
  return meta;
}

function section(md, title) {
  // captura o corpo de uma seção "## <title>" até o próximo "##"
  const re = new RegExp('^## ' + title + '[^\\n]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm');
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

function listItems(body) {
  const items = [];
  // `aberto`: o ultimo item ainda aceita continuacao. Linha em branco FECHA o
  // item — antes ela era pulada e a linha seguinte grudava no ultimo bullet,
  // mesmo que outro bullet tivesse entrado no meio. Achado do review T6-A da
  // spec 2026-09-qg-redesenho-2: no STATE real um bullet inserido dentro de
  // outro fez "ZIDO, por MEDICAO…" aparecer no card de um blocker ABERTO de
  // outro assunto. O leitor le listas; paragrafo orfao nao e item.
  let aberto = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      items.push(line.replace(/^\s*(-|\d+\.)\s+/, '').trim());
      aberto = true;
    } else if (!line.trim()) {
      aberto = false;
    } else if (aberto && items.length && !/^#/.test(line)) {
      items[items.length - 1] += ' ' + line.trim(); // continuação de item multi-linha
    }
  }
  return items.map((i) => i.replace(/\*\*/g, ''));
}

/**
 * Cartão do agente como o build sempre montou. `metrics` é o retorno de
 * `loadMetrics()` (hub/metrics.js); `agentsDir` a pasta `agents/`.
 * LANÇA se AGENT.md/STATE.md não existirem — é o contrato antigo do build.
 */
function readAgent(dir, { agentsDir, metrics }, origem = origemDisco) {
  const agentPath = path.join(agentsDir, dir, 'AGENT.md');
  const statePath = path.join(agentsDir, dir, 'STATE.md');
  const agentMd = lancaSeAusente(origem.lerTexto(agentPath), agentPath, 'open');
  const stateMd = lancaSeAusente(origem.lerTexto(statePath), statePath, 'open');
  // R1 (achado na varredura de 2026-09-02): isto contava gotchas com fórmula
  // PRÓPRIA e mostrava o número no card, enquanto o worker contava os mesmos
  // gotchas com outra fórmula — duas contas do mesmo número na mesma tela,
  // gotcha nº 4 do Forge. Agora vem do worker; `null` = sem medição, e o card
  // mostra "—", nunca 0.
  const gotchasCount = metrics.ok
    ? (metrics.data.metricas.aprendizado.gotchas.porAgente.find((g) => g.agente === dir) || {}).total ?? null
    : null;
  const meta = parseFrontmatter(agentMd);
  // L1: parágrafo que começa com [L1]
  const l1m = stateMd.match(/\[L1\]\s*([\s\S]*?)(?:\r?\n\r?\n|\r?\n#|$)/);
  // L1 pode ser bloco de várias linhas (um worker de estado escreve 5): cada
  // linha vira uma linha no cartão, em vez de um parágrafo corrido com "- ".
  const l1 = l1m ? l1m[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n') : '—';
  const owns = listItems(section(agentMd, 'Owns'));
  const defers = listItems(section(agentMd, 'Does NOT own'));
  const inProgress = listItems(section(stateMd, 'Em progresso'));
  return { dir, meta, l1, owns, defers, gotchasCount, inProgress };
}

// spec 2026-09-qg-redesenho (T1.5) — situacoes que a iniciativa pode declarar.
// A marcacao minima e uma linha de campos entre parenteses logo no comeco do
// item: "- (em-curso · specs/2026-09-x · 4/9 · forge) texto livre...".
// Iniciativa velha nao tem essa linha e continua valendo: vira `bruto`, com
// `estruturado: false`, e a tela mostra o texto como sempre mostrou.
const INI_SITUACOES = ['em-curso', 'gate', 'entregue', 'parada', 'arquivada'];
// Campo vazio e campo a mais sao TOLERADOS: "(parada · · ·)" e
// "(entregue · a · b · c · d)" nao viram erro — o que falta vira null e o que
// sobra fica em `extras`, NUNCA descartado em silencio (achado-4 do reviewer:
// um `·` dentro do caminho empurrava os campos e o `quem` real sumia sem aviso).
// Marcacao ilegivel (situacao desconhecida) cai em `bruto`.
const RE_INI_SITUACAO = new RegExp('^\\((' + INI_SITUACOES.join('|') + ')(?=[\\s·)])');

/**
 * Acha o ")" que fecha a marcacao CONTANDO parenteses — achado-3 do reviewer:
 * um caminho como `specs/x(sub)/y` fechava a marcacao cedo e comia os campos
 * seguintes. Devolve o indice do fecha-parenteses, ou -1 se nunca fecha.
 */
function fimDaMarcacao(txt) {
  let nivel = 0;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '(') nivel++;
    else if (c === ')') { nivel--; if (nivel === 0) return i; }
    else if (c === '\n') return -1;   // marcacao e de UMA linha
  }
  return -1;
}

/** Tira o markdown que o dono possa ter escrito dentro de um campo (achado-6). */
function limpaCampo(v) {
  if (v == null) return null;
  const s = String(v).replace(/\*\*/g, '').replace(/~~/g, '').trim();
  return s || null;
}

/**
 * Uma iniciativa do `STATE.md`. Nunca lanca: item que nao casa a marcacao
 * volta com `estruturado: false` e o texto inteiro em `bruto` — degradacao,
 * nao erro. Nome sai do primeiro negrito; sem negrito, do primeiro pedaco da
 * frase; se nao sobrar nada, do proprio bruto (nome vazio na tela e defeito).
 */
function parseIniciativa(txt) {
  const bruto = String(txt == null ? '' : txt).trim();
  const ms = bruto.match(RE_INI_SITUACAO);
  const fim = ms ? fimDaMarcacao(bruto) : -1;
  const ok = !!ms && fim > 0;
  const corpo = ok ? bruto.slice(fim + 1).trim() : bruto;
  const nb = corpo.match(/\*\*(.+?)\*\*/);
  const cru = (nb ? nb[1] : (corpo.split(/[.·—]/)[0] || '')).replace(/~~/g, '').replace(/\*\*/g, '').trim();
  const nome = (cru || corpo || bruto).replace(/\*\*/g, '').trim().slice(0, 90);
  if (!ok) {
    return { estruturado: false, nome, situacao: null, caminho: null, progresso: null, quem: null, extras: [], bruto };
  }
  // dentro dos parenteses, depois da situacao: os campos separados por "·"
  const dentro = bruto.slice(ms[0].length, fim);
  const campos = dentro.split('·').map(limpaCampo).filter((s, i) => i > 0 || s !== null);
  return {
    estruturado: true,
    nome,
    situacao: ms[1],
    caminho: campos[0] || null,
    progresso: campos[1] || null,
    quem: campos[2] || null,
    // achado-4: o que sobra NAO some. Fica aqui, e a tela mostra — campo
    // perdido em silencio e pior que campo feio na tela.
    extras: campos.slice(3).filter(Boolean),
    bruto,
  };
}

/**
 * Itens da seccao de iniciativas. NAO usa `listItems`: ele abre item novo em
 * qualquer linha que comece com "N. ", e uma frase quebrada no lugar errado
 * ("…prioridade pos-QG na FILA item\n  7. **QG onda 5…") vira uma iniciativa
 * FANTASMA — e parte em duas a iniciativa de verdade. Achado do reviewer de
 * 2026-09-06 (achado-1), com o caso real do proprio `company/STATE.md`.
 *
 * Regra aqui: **so abre item a linha que comeca com "- " sem indentacao.**
 * Todo o resto e continuacao, inclusive linha que comeca com numero.
 */
function itensDeIniciativa(corpo) {
  const out = [];
  for (const l of String(corpo == null ? '' : corpo).split(/\r?\n/)) {
    if (/^-\s+/.test(l)) out.push(l.replace(/^-\s+/, '').trim());
    else if (out.length && l.trim() && !/^#/.test(l)) out[out.length - 1] += ' ' + l.trim();
  }
  return out;
}

/**
 * spec 2026-09-qg-redesenho-2 (T1, decisão D-QG2-2 do dono): diz se uma linha
 * da seção `## Blockers` é blocker RESOLVIDO (não deve virar card
 * "Destravar"), ainda ABERTO, ou sem conteúdo útil (DESCARTADA — nem um nem
 * outro, como `(nenhum)` ou uma linha vazia).
 *
 * Devolve `true` (resolvido), `false` (aberto) ou `null` (descartar a linha).
 *
 * Regra, tirando `**`, `~~` de abertura e espaços do INÍCIO da linha:
 *  - vazia, ou começa por `(nenhum` (com qualquer sufixo dentro do
 *    parêntese) → `null`, descartada;
 *  - a linha é só o emoji `✅` sem mais nada → `null` (conteúdo vazio: não é
 *    blocker de verdade, é o mesmo caso do `(nenhum)`);
 *  - começa por `✅`, por `RESOLVIDO`/`RESOLVIDA`, ou por `[x]` → `true`;
 *  - a linha inteira, ou o primeiro trecho em negrito, está riscada
 *    `~~…~~` FECHADA (sem fechar não conta) → `true`;
 *  - qualquer outro caso → `false`.
 *
 * "RESOLVIDO" no MEIO da frase NÃO resolve — só o INÍCIO da linha decide.
 * LIMITE CONHECIDO (registrado aqui e na evidência da T1, não escondido): uma
 * linha como "RESOLVIDO parcialmente, falta X" resolve por esta regra (começa
 * por RESOLVIDO) mesmo dizendo, na frase, que falta algo. O dono decidiu a
 * regra pelo INÍCIO da linha de propósito — inventar uma heurística para
 * driblar este caso seria decidir por conta própria o que é mandato do dono.
 */
function blockerResolvido(txt) {
  const s = String(txt == null ? '' : txt).trim();
  if (!s) return null;
  if (/^\(nenhum\b/i.test(s)) return null;
  // trecho riscado (fechado) logo no inicio da linha, com ou sem ** por fora.
  // Review T6-A (2026-09-12): "~~texto~~ mas voltou a acontecer" era
  // "resolvido" porque o inicio decidia sozinho. Riscado so resolve se, depois
  // do `~~` de fechamento, vier uma MARCA de fechamento ou nada; texto livre
  // depois do riscado e reabertura declarada — fica como blocker.
  const riscado = s.match(/^\*{0,2}~~[\s\S]+?~~\**\s*([\s\S]*)$/);
  if (riscado) {
    const depois = riscado[1].replace(/^\*+/, '').trim();
    if (!depois) return true;
    return /^(✅|RESOLVID[OA]S?|RESPONDID[OA]S?|EMPURRAD[OA]S?|FECHAD[OA]S?|MEDID[OA]S?|CONSERTAD[OA]S?|ENTREGUE|FEIT[OA]S?)\b/i.test(depois);
  }
  const head = s.replace(/^\*+/, '').trim();
  if (/^✅\s*$/.test(head)) return null; // so o emoji: sem conteudo util
  if (/^✅/.test(head)) return true;
  if (/^\[x\]/i.test(head)) return true;
  if (/^RESOLVID[OA]\b/i.test(head)) return true;
  return false;
}

function parseCompanyState(md) {
  const brutos = listItems(section(md, 'Blockers'));
  const blockers = [];
  const blockersResolvidos = [];
  for (const b of brutos) {
    const r = blockerResolvido(b);
    if (r === null) continue; // descartado: (nenhum...), vazio, ou so emoji
    (r ? blockersResolvidos : blockers).push(b);
  }
  const initiatives = itensDeIniciativa(section(md, 'Iniciativas em curso'));
  // `initiatives` continua sendo o array de strings que o front antigo e o
  // `hub/build.js` consomem — e continua SEM `**`, como `listItems` entregava.
  // `iniciativas` e a forma estruturada, e recebe o texto COM o negrito porque
  // e dele que sai o nome. Duas VISTAS do mesmo dado, nunca duas fontes.
  return {
    blockers,
    blockersResolvidos,
    initiatives: initiatives.map((t) => t.replace(/\*\*/g, '')),
    iniciativas: initiatives.map(parseIniciativa),
  };
}

/** tira `**`/crase para caber num texto plano curto (mesmo que `textoCru()` do app.js). */
function semMarcacao(s) {
  return String(s == null ? '' : s).replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * spec 2026-09-qg-redesenho-2 (T4a, Emenda 1 · critério 19-21) · hash curto,
 * determinístico, SEM dependência de crypto (roda igual no node do teste e —
 * seria — num navegador, se algum dia precisasse). DJB2 sobre o texto.
 * Não é para segurança (colisão não quebra nada crítico: pior caso, duas
 * ocorrências raras compartilham "adiar"/"nota" — aceitável para uma chave de
 * preferência do dono, não um id de banco).
 */
function hashCurto(s) {
  const str = String(s == null ? '' : s);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * A CHAVE de uma ocorrência de "esperando você" — usada por Adiar (arquivo de
 * preferências, `arvys.ordem.adiados`) e por Anotar (`prefs.notas`). Pura,
 * exportada para o teste; o `app.js` NÃO reimplementa o hash — ele recebe o
 * campo `chave` já pronto em cada item de `pendenciasDoDono().itens` (o mesmo
 * JSON que enche a tela), porque duas implementações do mesmo hash (uma em
 * node, outra em navegador) é exatamente a família de defeito que esta spec
 * existe para matar (dois cálculos, um "número único" de mentira). O
 * `app.js` é IIFE de navegador e não pode `require()` este arquivo — por
 * isso a função mora aqui, mas o VALOR viaja pronto no agregado.
 */
function chaveOcorrencia(fonte, txt) {
  return 'pend:' + String(fonte || '?') + ':' + hashCurto(txt);
}

/** Ordem e nomes dos grupos exibidos no "Esperando você" expandido — fila
 *  reúne as duas fontes da FILA (ESPERA O DONO + contradição): pra quem olha
 *  a tela são a mesma origem, "o arquivo da fila". */
const GRUPOS_PENDENCIA = [
  { grupo: 'blockers', rotulo: 'Blockers', fontes: ['blockers'] },
  { grupo: 'gates', rotulo: 'Gates', fontes: ['gates'] },
  { grupo: 'fila', rotulo: 'Fila', fontes: ['esperaDono', 'esperaConflito'] },
  { grupo: 'radar', rotulo: 'Radar', fontes: ['radar'] },
];

/** Agrupa `itens` (o array de `pendenciasDoDono()`) por fonte, na ordem fixa
 *  acima; grupo sem item nenhum não aparece. Pura, testada. */
function agrupaPendenciasPorFonte(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  return GRUPOS_PENDENCIA
    .map((g) => ({ grupo: g.grupo, rotulo: g.rotulo, itens: lista.filter((it) => g.fontes.indexOf(it && it.fonte) >= 0) }))
    .filter((g) => g.itens.length);
}

/**
 * Tira da lista quem está adiado e ainda não venceu — mesma regra de
 * `adiado()` no app.js (chave > hoje ISO = ainda vale; senão volta sozinho).
 * `mapaAdiados`: `{ '<chave>': '<data ISO>' }` (o mesmo objeto de
 * `arvys.ordem.adiados`). Pura, testada.
 */
function filtraAdiadosPendencia(itens, mapaAdiados, hojeIso) {
  const m = mapaAdiados && typeof mapaAdiados === 'object' ? mapaAdiados : {};
  const h = String(hojeIso || '');
  return (Array.isArray(itens) ? itens : []).filter((it) => {
    const ate = it && it.chave ? m[it.chave] : null;
    if (!ate) return true;          // nunca adiado
    return !(String(ate) > h);      // venceu (<=hoje) -> volta; ainda no futuro -> some
  });
}

/**
 * spec 2026-09-qg-redesenho-2 (T1, critério 2): A FONTE ÚNICA do "o que
 * espera por mim" — selo do menu, bloco "Esperando você" do Início e grupo
 * "Esperando você" de Trabalho consomem TODOS esta função, em vez de três
 * contas diferentes (o defeito que a spec existe para matar). `agregado` é o
 * retorno leve de `/api/qg` (ou um objeto sintético com o mesmo formato, no
 * teste) — a função nunca lança; parte ausente do agregado só falta na conta
 * e entra em `parcial`.
 *
 * Devolve `{ total, itens, porFonte, parcial }`:
 *  - `total`: a soma das 5 fontes — o número que as três telas mostram.
 *  - `itens`: exemplos para cartão curto (`{urgencia, verbo, txt, sub,
 *    fonte}`) — blockers e gates entram todos; fila entra limitada a 3
 *    (ESPERA O DONO) + 2 (contradição), como a tela sempre mostrou (cartão
 *    curto, não a lista inteira) — mas `porFonte`/`total` usam a CONTAGEM
 *    REAL da fila (`esperandoDono`/`esperaContraditoria`), não o tamanho da
 *    lista cortada — era aí que o selo (23) e o Início (25) discordavam.
 *  - `porFonte`: quantos de cada origem (`blockers`, `gates`, `esperaDono`,
 *    `esperaConflito`, `radar`).
 *  - `parcial`: nome da parte do agregado que NÃO estava carregada (ex.:
 *    `'fila'` quando `agregado.trabalho.fila` falta ou veio `ok:false`) — a
 *    tela mostra isso em vez de inventar um segundo número.
 */
function pendenciasDoDono(agregado) {
  const d = agregado || {};
  const itens = [];
  const porFonte = { blockers: 0, gates: 0, esperaDono: 0, esperaConflito: 0, radar: 0 };
  const faltando = [];

  const estado = d.inicio && d.inicio.estado && d.inicio.estado.ok && d.inicio.estado.data ? d.inicio.estado.data : null;
  const blockers = estado && Array.isArray(estado.blockers) ? estado.blockers : [];
  blockers.forEach((b) => {
    itens.push({ urgencia: 0, verbo: 'Destravar', txt: b, sub: 'blocker aberto em company/STATE.md', fonte: 'blockers', chave: chaveOcorrencia('blockers', b) });
  });
  porFonte.blockers = blockers.length;

  const gates = Array.isArray(d.inicio && d.inicio.gates) ? d.inicio.gates : [];
  gates.forEach((g) => {
    const txt = 'A spec ' + g.slug + ' espera seu gate.';
    itens.push({
      urgencia: 0,
      verbo: 'Aprovar',
      txt: txt,
      sub: (g.owner ? 'de ' + g.owner + ' · ' : '') +
        (g.diasEsperando != null ? 'esperando ' + g.diasEsperando + ' ' + (g.diasEsperando === 1 ? 'dia' : 'dias') : 'sem data'),
      fonte: 'gates',
      chave: chaveOcorrencia('gates', txt),
    });
  });
  porFonte.gates = gates.length;

  const rf = d.trabalho && d.trabalho.fila;
  if (rf && rf.ok) {
    porFonte.esperaDono = Number(rf.esperandoDono || 0);
    porFonte.esperaConflito = Number(rf.esperaContraditoria || 0);
    (rf.esperaDono || []).slice(0, 3).forEach((i) => {
      const txt = 'FILA ' + i.numero + ' — ' + semMarcacao(i.titulo);
      itens.push({
        urgencia: 0,
        verbo: 'Decidir',
        txt: txt,
        sub: 'marcado ESPERA O DONO' + (i.desde ? ' em ' + i.desde : '') + ' · company/FILA.md',
        fonte: 'esperaDono',
        chave: chaveOcorrencia('esperaDono', txt),
      });
    });
    (rf.esperaConflito || []).slice(0, 2).forEach((i) => {
      const txt = 'FILA ' + i.numero + ' diz que espera você e já está ' + i.status + '.';
      itens.push({
        urgencia: 1,
        verbo: 'Resolver',
        txt: txt,
        sub: 'contradição no arquivo · company/FILA.md',
        fonte: 'esperaConflito',
        chave: chaveOcorrencia('esperaConflito', txt),
      });
    });
  } else {
    faltando.push('fila');
  }

  const radarCru = d.radar && d.radar.cru;
  if (radarCru && radarCru.ok) {
    const pend = radarCru.data ? (radarCru.data.pendentes || []).length : 0;
    porFonte.radar = pend;
    if (pend) {
      const txt = pend + ' ' + (pend === 1 ? 'item novo' : 'itens novos') + ' no radar esperando seu veredito.';
      itens.push({
        urgencia: 1,
        verbo: 'Curar',
        txt: txt,
        sub: 'rode /arvys:radar — o Scout propõe, você aprova',
        fonte: 'radar',
        // conhecido: a contagem entra no texto, então um dia com N diferente
        // troca a chave — o "adiar" de uma leva de radar não sobrevive à
        // próxima leva. Aceito: a spec já trata a divergência do radar como
        // fora de escopo (item 6 do "Fora de escopo"), e a ação é "curar a
        // leva inteira", não um item nomeado.
        chave: chaveOcorrencia('radar', txt),
      });
    }
  } else {
    faltando.push('radar');
  }

  itens.sort((a, b) => (a.urgencia || 0) - (b.urgencia || 0));

  // O total conta ACOES que esperam o dono, nao linhas de arquivo: cada
  // blocker, gate e item da fila e uma decisao propria; o radar inteiro e UMA
  // acao (`/arvys:radar` cura a leva), por isso entra como 1 quando ha
  // pendentes — o numero de itens do radar ja tem selo proprio no menu.
  // (Conferencia da T1: o executor somou 28 itens do radar e o selo do Inicio
  // saltou de 23 para 40 sem 28 decisoes novas — o numero seria honesto na
  // conta e falso na promessa.)
  const total = porFonte.blockers + porFonte.gates + porFonte.esperaDono + porFonte.esperaConflito + (porFonte.radar ? 1 : 0);
  return { total, itens, porFonte, parcial: faltando.length ? faltando.join(' e ') : null };
}

/**
 * Gates abertos AO VIVO, lidos do frontmatter das specs — nunca da metrica da
 * madrugada (`OFFICE-METRICS.json`), que e um retrato de ate 24 h atras.
 * Precedente (T1 da spec 2026-09-qg-redesenho-2): o Inicio dizia "a spec E9
 * espera seu gate" horas depois de o dono ter aprovado — a metrica so seria
 * refeita na noite seguinte. Puro: recebe a lista de `readSpecs` e o relogio.
 */
function gatesAbertos(specs, agora = Date.now()) {
  if (!Array.isArray(specs)) return [];
  return specs
    .filter((s) => s && s.ok && String(s.status || '').trim().toLowerCase() === 'gate')
    .map((s) => {
      const fm = s.frontmatter || {};
      const desde = fm.criada || fm.created || null;
      const d = desde ? new Date(String(desde).slice(0, 10)) : null;
      const dias = d && !Number.isNaN(d.getTime()) ? Math.max(0, Math.floor((agora - d.getTime()) / 86400000)) : null;
      return { slug: s.slug, owner: s.owner || null, diasEsperando: dias };
    });
}

/**
 * Comparador puro para o número de uma lei ("1", "10", "1a", "1.2", "").
 * Ordem numérica crescente (1, 2, …, 10, 11); número TORTO (não é um inteiro
 * puro) vai para o fim, visível, nunca some — critério 13 da spec
 * 2026-09-qg-redesenho-2 (T4b). Entre dois tortos, mantém a ordem original
 * (comparador estável por índice, ver `ordenaLeis`).
 */
function compararNumeroDeLei(a, b) {
  const na = /^\d+$/.test(String(a).trim()) ? Number(a) : null;
  const nb = /^\d+$/.test(String(b).trim()) ? Number(b) : null;
  if (na === null && nb === null) return 0;
  if (na === null) return 1; // a é torto -> depois de b
  if (nb === null) return -1; // b é torto -> a (numérico) vem antes
  return na - nb;
}

/**
 * Ordena uma lista de leis (ou de números de lei crus) pelo número,
 * numericamente — não como string ("1","10","11","2" vira "1","2","10","11").
 * Torto ("1a", "1.2", vazio, undefined) vai para o fim, na ordem em que
 * chegou (sort estável: usamos o índice original como desempate). Aceita
 * tanto uma lista de strings/números quanto uma lista de objetos com
 * `.numero` — `pegaNumero` decide qual.
 */
function ordenaLeis(lista, pegaNumero = (x) => x) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((item, i) => ({ item, i }))
    .sort((x, y) => {
      const c = compararNumeroDeLei(pegaNumero(x.item), pegaNumero(y.item));
      return c !== 0 ? c : x.i - y.i;
    })
    .map((x) => x.item);
}

/** `company/STATE.md` como o build lê: LANÇA se o arquivo faltar (contrato antigo). */
function readCompany(root, origem = origemDisco) {
  const p = path.join(root, 'company', 'STATE.md');
  const md = lancaSeAusente(origem.lerTexto(p), p, 'open');
  return parseCompanyState(md);
}

/** `company/TOKENS.json` como o build lê: `null` para ausente OU inválido. */
function readTokens(root, origem = origemDisco) {
  try {
    const raw = origem.lerTexto(path.join(root, 'company', 'TOKENS.json'));
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.weeks)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Entradas do `DECISIONS.md`. `avisar` (padrão true) imprime no stderr os
 * cabeçalhos ignorados — exatamente o que o build sempre fez; o servidor passa
 * `false` para não poluir o log a cada recarga do cache.
 */
function parseDecisions(md, { avisar = true } = {}) {
  // normaliza BOM/CRLF (mesmo cuidado de parseFrontmatter)
  const norm = md.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = norm.split('\n');
  const headerRe = /^## (.+)$/;
  const validRe = /^## (\d{4}-\d{2}-\d{2}) — (.+)$/;
  const idx = [];
  let inCode = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l.trim())) {
      inCode = !inCode;
      return;
    }
    if (!inCode && headerRe.test(l)) idx.push(i);
  });
  const entries = [];
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k];
    const end = k + 1 < idx.length ? idx[k + 1] : lines.length;
    const headerLine = lines[start];
    const m = headerLine.match(validRe);
    if (!m) {
      if (avisar) console.error(`[decisions] ignorada: ${headerLine}`);
      continue;
    }
    const date = m[1];
    const title = m[2].trim();
    const body = lines.slice(start + 1, end).join('\n').trim();
    const bodyNoFooter = body.replace(/\n?Autor:[\s\S]*$/, '').trim();
    const authorM = body.match(/Autor:\s*([^\n.(]+)/);
    const author = authorM ? authorM[1].trim() : '';
    const plain = bodyNoFooter
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const sm = plain.match(/^[^.!?]*[.!?]/);
    const summary = (sm ? sm[0] : plain).trim();
    entries.push({ date, title, author, summary, body: bodyNoFooter || plain });
  }
  return entries;
}

/** `company/DECISIONS.md` como o build lê: `[]` para ausente OU ilegível. */
function readDecisions(root, origem = origemDisco) {
  try {
    const md = origem.lerTexto(path.join(root, 'company', 'DECISIONS.md'));
    if (md === null) return [];
    return parseDecisions(md);
  } catch {
    return [];
  }
}

// T2.1: ORDER deixa de ser lista fixa — vem de agents/*/AGENT.md. Os 4 clássicos
// mantêm a ordem de sempre (nunca reordenam entre si); quem nasce depois (via
// /arvys:hire) entra alfabético, no fim. Isso garante que os 4 saem do build
// pixel-idênticos ao HTML de antes desta onda (ver evidence/onda2.md prova a).
const CLASSIC_ORDER = ['forge', 'deal', 'echo', 'scout'];

/**
 * Pastas de agente válidas, na ordem do painel. Mesma regra do build e do
 * `listAgentes()` do serve.js: só conta com os 3 arquivos e nome em [a-z0-9-].
 * `avisar` imprime no stderr as pastas ignoradas (o que o build sempre fez).
 * LANÇA se `agentsDir` não existir — contrato antigo do build; o `/api/qg`
 * embrulha (`readAgentDirs`).
 */
function listAgentDirs(agentsDir, { avisar = true } = {}, origem = origemDisco) {
  const nomes = lancaSeAusente(origem.listar(agentsDir), agentsDir, 'scandir');
  const all = nomes
    .filter((name) => ehPasta(origem, path.join(agentsDir, name)))
    .filter((name) => {
      const dir = path.join(agentsDir, name);
      const hasAgentMd = origem.existe(path.join(dir, 'AGENT.md'));
      const hasStateMd = origem.existe(path.join(dir, 'STATE.md'));
      const hasGotchasMd = origem.existe(path.join(dir, 'GOTCHAS.md'));
      // A1 (review 2026-09-04): pasta parcial (falta STATE.md e/ou GOTCHAS.md)
      // não pode derrubar o build com stack trace — vira aviso e é ignorada.
      // Mesmo regex do hub/serve.js: nome de pasta vira id/atributo no HTML e
      // chave da whitelist do recado — nunca aceita "/", ".." ou maiúscula.
      if (!/^[a-z0-9-]+$/.test(name)) {
        if (avisar) console.error(`hub/build AVISO: agents/${name} — nome fora de [a-z0-9-], ignorada`);
        return false;
      }
      if (hasAgentMd && (!hasStateMd || !hasGotchasMd)) {
        const falta = [!hasStateMd && 'STATE.md', !hasGotchasMd && 'GOTCHAS.md'].filter(Boolean).join(' e ');
        if (avisar) console.error(`hub/build AVISO: agents/${name} incompleta (falta ${falta}) — ignorada`);
        return false;
      }
      return hasAgentMd && hasStateMd && hasGotchasMd;
    });
  const classics = CLASSIC_ORDER.filter((d) => all.includes(d));
  const rest = all.filter((d) => !CLASSIC_ORDER.includes(d)).sort();
  return [...classics, ...rest];
}

// Constantes que o hub/index.html legado renderiza (rituais e origem do
// método). Vivem aqui para a plataforma (`/api/qg`) e o build lerem a MESMA
// lista — duas listas seriam duas verdades sobre quais rituais existem.
const RITUALS = [
  ['/arvys:start', 'porta de entrada — quem é você (vibecoder × dev) e por onde entramos (zero × andamento)'],
  ['/arvys:open', 'abre sessão com um agente — persona, estado e cicatrizes; anuncia o L1'],
  ['/arvys:close', 'fecha em ≤1 min — estado vira arquivo, o /clear fica grátis'],
  ['/arvys:checkpoint', 'salva o meio de uma sessão longa — limpe o chat sem perder o fio'],
  ['/arvys:status', 'standup instantâneo — agrega o L1 de todos, blockers primeiro'],
  ['/arvys:spec', 'cache de decisão em L2-L3 — spec → plan → tasks, gate antes de código'],
  ['/arvys:genesis', 'produto novo (L4) — da ideia ao primeiro épico em 6 etapas com gate do dono'],
  ['/arvys:retro', 'semanal — erro vira lei; a retro propõe, o dono aprova'],
  ['/arvys:briefing', 'abre o dia — lê o briefing que a corrente noturna escreveu, sem redescobrir nada'],
  ['/arvys:radar', 'curadoria do radar do Claude Code — o Scout propõe, o dono aprova item a item'],
  ['/arvys:hire', 'contrata um agente novo — guarda anti-pasta-morta antes da pasta'],
];

const ORIGINS = [
  ['Hive', 'agente = pasta · orquestrador que não executa · L1 · abrir/fechar sessão'],
  ['Hive vivido (em produção)', 'gotchas com precedente · ponteiros de verdade · nunca auto-commit'],
  ['BMAD Method', 'escala L0-L4 na porta · pacote de contexto fechado por tarefa'],
  ['SDD · Vinicius Lana', 'registro obrigatório no ciclo · evidência por sensores · gate de abordagem'],
  ['Economia de tokens', 'close torna o /clear grátis · spec como cache · firewall de contexto'],
  ['vibehub.academy', 'agentes por função de negócio: web · business · marketing · intel'],
  ['Estado da arte 2026', 'mandato de 6 campos · checklist vazio não gasta · erro vira lei'],
];

// ---------------------------------------------------------------------------
// 2. CAMADA SEGURA — todo leitor novo passa por aqui e por isso nunca lança
// ---------------------------------------------------------------------------

const MAX_BYTES = 1.5 * 1024 * 1024;  // acima disto o arquivo é "torto": 3MB de lixo nunca entra no JSON
const RAW_MAX = 4000;                  // recorte do bruto devolvido em ok:false (a tela mostra o começo)

function recorte(raw) {
  const s = raw == null ? '' : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  return s.length > RAW_MAX ? s.slice(0, RAW_MAX) + `… [+${s.length - RAW_MAX} caracteres]` : s;
}
function ok(data, extra) {
  return Object.assign({ ok: true, data }, extra || {});
}
function falha(erro, raw, extra) {
  return Object.assign({ ok: false, raw: recorte(raw), erro: String(erro) }, extra || {});
}
function rel(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

/**
 * R2-a (review T8): `---` na primeira linha NÃO é sinônimo de frontmatter.
 * `FILA.md`, `DECISIONS.md`, `STATE.md`, `ROADMAP.md` e `PEDIDOS-DO-DONO.md`
 * não têm frontmatter e podem legitimamente abrir com um divisor markdown —
 * a heurística antiga derrubava o arquivo INTEIRO para "torto" por causa
 * disso, escondendo conteúdo são atrás de um aviso de erro (o oposto do
 * estado de partida (b) da spec, que manda degradar só o bloco afetado).
 *
 * Regra nova: só é frontmatter quando o separador de abertura é seguido por
 * uma linha de metadata YAML (`chave: valor`). Divisor no topo é conteúdo.
 * Devolve a mensagem de erro, ou `null` quando o texto está são.
 */
function frontmatterAberto(text) {
  const abre = /^---[ \t]*\r?\n/.exec(text);
  if (!abre) return null;
  const resto = text.slice(abre[0].length);
  // 1ª linha depois do separador: só `chave: valor` (ou `chave:` sozinha)
  // caracteriza YAML. `# Título`, linha em branco, `1. item`, `- item` não.
  const pareceYaml = /^[A-Za-z_][A-Za-z0-9_.\- ]*:([ \t].*)?(\r?\n|$)/.test(resto);
  if (!pareceYaml) return null;
  const fecha = /(^|\r?\n)---[ \t]*(\r?\n|$)/.test(resto);
  if (fecha) return null;
  return 'frontmatter aberto (`---` sem fechamento)';
}

/**
 * Lê um arquivo de texto com todas as guardas, pela origem injetada. Devolve
 * UM de:
 *   { ausente: true }
 *   { erro, raw? }                       — ilegível, grande demais, UTF-8 inválido, frontmatter aberto
 *   { text, bytes, mtime }               — pronto para o parser
 */
function lerTexto(origem, p) {
  let text;
  try {
    text = origem.lerTexto(p);
  } catch (e) {
    if (e && e.origemErro === 'pasta') return { erro: 'é uma pasta, não um arquivo' };
    if (e && e.origemErro === 'utf8') {
      const est = origem.estado(p);
      if (est && est.size > MAX_BYTES) {
        return { erro: `arquivo grande demais (${est.size} bytes; teto ${MAX_BYTES})`, raw: e.raw };
      }
      return { erro: 'bytes inválidos em UTF-8', raw: e.raw };
    }
    return { erro: `não consegui ler: ${(e && e.message) || e}` };
  }
  if (text === null) return { ausente: true };
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BYTES) {
    const raw = Buffer.from(text, 'utf8').subarray(0, RAW_MAX).toString('utf8');
    return { erro: `arquivo grande demais (${bytes} bytes; teto ${MAX_BYTES})`, raw };
  }
  text = text.replace(/^\uFEFF/, '');
  const f = frontmatterAberto(text);
  if (f) return { erro: f, raw: text };
  const est2 = origem.estado(p);
  // Math.round: `fs.Stats.mtime` (Date) arredonda os nanossegundos ao montar
  // o milissegundo; reconstruir `new Date(mtimeMs)` sem arredondar TRUNCA em
  // vez de arredondar quando `mtimeMs` tem fração (achado desta refatoração:
  // um `.mtime` a menos em TODO arquivo, sempre o mesmo 1ms, nunca visto antes
  // porque ninguém comparava os dois caminhos byte a byte).
  return { text, bytes, mtime: est2 ? new Date(Math.round(est2.mtimeMs)).toISOString() : null };
}

/** Lê `p` e aplica `parse(text)`. Contrato: ausente → data:null; torto → ok:false. */
function ler(origem, root, p, parse) {
  const arquivo = rel(root, p);
  const r = lerTexto(origem, p);
  if (r.ausente) return ok(null, { arquivo });
  if (r.erro) return falha(r.erro, r.raw, { arquivo });
  try {
    return ok(parse(r.text), { arquivo, bytes: r.bytes, mtime: r.mtime });
  } catch (e) {
    return falha(`parser falhou: ${(e && e.message) || e}`, r.text, { arquivo });
  }
}

/** Lista uma pasta sem lançar: `null` se não existe. Repassa a origem tal qual. */
function listar(origem, dir) {
  return origem.listar(dir);
}

/**
 * `true` se `p`, pela origem, é uma pasta — sem 5ª função na interface
 * (`estado()`/`lerTexto()` não carregam tipo, e uma origem de nuvem pode nem
 * ter o conceito de "pasta"). O teste é: pasta LISTA (mesmo vazia, `[]`);
 * arquivo não lista — `listar()` devolve `null` ou lança (ENOTDIR e afins),
 * e os dois casos aqui viram "não é pasta".
 */
function ehPasta(origem, p) {
  try {
    return origem.listar(p) !== null;
  } catch (e) {
    return false;
  }
}

/** Embrulha um leitor de PASTA: pasta ausente → data:null; erro de disco → ok:false. */
function lerPasta(origem, root, dir, build) {
  const arquivo = rel(root, dir);
  let entradas;
  try {
    entradas = listar(origem, dir);
  } catch (e) {
    return falha(`não consegui listar: ${(e && e.message) || e}`, '', { arquivo });
  }
  if (entradas === null) return ok(null, { arquivo });
  try {
    return ok(build(entradas), { arquivo });
  } catch (e) {
    return falha(`leitor falhou: ${(e && e.message) || e}`, '', { arquivo });
  }
}

// ---- parsers genéricos de markdown (usados por vários leitores) ----

function linhas(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

/** Primeiro título `# ` do texto (sem o `#`), ou null. */
function tituloDe(text) {
  const m = text.match(/^#\s+([^\n]+)/m);
  return m ? m[1].trim() : null;
}

/** Seções `##`/`###` em lista plana: [{nivel, titulo, corpo}]. `preambulo` = antes da 1ª. */
function parseSecoes(text) {
  const out = [];
  let atual = null;
  const pre = [];
  let inCode = false;
  for (const l of linhas(text)) {
    if (/^```/.test(l.trim())) inCode = !inCode;
    const h = !inCode && l.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      atual = { nivel: h[1].length, titulo: h[2].trim(), corpo: [] };
      out.push(atual);
    } else if (atual) atual.corpo.push(l);
    else pre.push(l);
  }
  for (const s of out) s.corpo = s.corpo.join('\n').trim();
  return { preambulo: pre.join('\n').trim(), secoes: out };
}

/** Primeira tabela markdown do texto: {colunas, linhas:[[célula]]} ou null. */
function parseTabela(text) {
  const rows = linhas(text).filter((l) => /^\s*\|/.test(l));
  if (rows.length < 2) return null;
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const colunas = cells(rows[0]);
  const body = rows.slice(1).filter((l) => !/^\s*\|\s*:?-{2,}/.test(l));
  return { colunas, linhas: body.map(cells) };
}

/** Linhas de citação `> ...` do texto, sem o `>`. */
function citacoes(text) {
  return linhas(text)
    .filter((l) => /^>\s?/.test(l))
    .map((l) => l.replace(/^>\s?/, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 3. LEITORES NOVOS — company/
// ---------------------------------------------------------------------------

/**
 * `company/GLOSSARIO.md` — as palavras do escritório (decisão G3, 2026-09-06).
 * O vocabulário sai do código e vira ARQUIVO: é a fonte, e é dela que sai a
 * tradução `en` congelada que o SaaS herda (requisito 4.0 do PRD).
 * Formato de cada tabela: `| termo | definição | en |`.
 */
function readGlossario(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'GLOSSARIO.md'), (md) => {
    const { secoes } = parseSecoes(md);
    const termos = {};
    const grupos = [];
    for (const s of secoes.filter((x) => x.nivel === 2)) {
      const tab = parseTabela(s.corpo);
      if (!tab || !tab.linhas) continue;
      const desta = [];
      for (const l of tab.linhas) {
        const termo = (l[0] || '').replace(/`/g, '').trim();
        const def = (l[1] || '').trim();
        const en = (l[2] || '').trim();
        if (!termo || !def) continue;              // linha sem definição é dívida: não entra
        termos[termo] = { def, en: en || null };
        desta.push(termo);
      }
      if (desta.length) grupos.push({ titulo: s.titulo, termos: desta });
    }
    return { total: Object.keys(termos).length, termos, grupos };
  });
}

/** `company/STATE.md` no contrato novo (o build continua com `readCompany`). */
function readStateMd(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'STATE.md'), (md) => {
    const base = parseCompanyState(md);
    const { secoes } = parseSecoes(md);
    // as seções datadas ("## 2026-09-05 — ...") são o diário da empresa
    const diario = secoes
      .filter((s) => s.nivel === 2 && /^\d{4}-\d{2}-\d{2}/.test(s.titulo))
      .map((s) => ({ titulo: s.titulo, data: s.titulo.slice(0, 10), corpo: s.corpo }));
    const proxima = secoes.find((s) => /^Ordem para a próxima sessão/i.test(s.titulo));
    return { ...base, diario, proximaSessao: proxima ? proxima.corpo : null };
  });
}

/** `company/TOKENS.json` no contrato novo: inválido é `ok:false`, não `null` mudo. */
function readTokensJson(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'TOKENS.json'), (raw) => {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.weeks)) throw new Error('JSON sem `weeks[]`');
    return data;
  });
}

/** `company/DECISIONS.md` no contrato novo. Pesado (~105KB): só na rota própria. */
function readDecisionsMd(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'DECISIONS.md'), (md) => {
    const entradas = parseDecisions(md, { avisar: false });
    return { total: entradas.length, entradas };
  });
}

// Marcas de status da FILA, como o escritório as escreve (em negrito, no
// corpo do item). A PRIMEIRA que aparece no item decide — o item 1 diz
// "SAIU DA FILA" na 2ª linha e "ENTREGUE" numa sub-onda 50 linhas abaixo.
const FILA_MARCAS = ['ARQUIVADO', 'ENTREGUE', 'DECIDIDO', 'SUPERADO', 'CANCELADO', 'SAIU DA FILA'];

// spec 2026-09-qg-tres-perguntas (T1 / decisao G1 de 2026-09-06): a marca que
// diz "isto trava com o DONO". Nao e status — e ORTOGONAL a ele: um item pode
// estar `aguardando` e esperando o dono ao mesmo tempo. Por isso mora fora de
// FILA_MARCAS.
//
// MAIUSCULA E OBRIGATORIA, como em todas as outras marcas. A primeira versao
// aceitava qualquer caixa "porque o dono escreve a mao" — e a frase comum
// "...nada espera o dono aqui" virava marca. Prosa nao pode marcar item: e a
// mesma familia dos 10 defeitos que o review de hoje achou (plausivel e errado).
const RE_ESPERA_DONO = /\bESPERA O DONO\b(?:\s+(\d{4}-\d{2}-\d{2}))?/;

/** Tira blocos de codigo do texto: marca dentro de ``` e exemplo, nao ordem. */
function semBlocosDeCodigo(txt) {
  const ls = String(txt == null ? '' : txt).split('\n');
  const fora = [];
  let dentro = false;
  for (const l of ls) {
    if (/^\s*(```|~~~)/.test(l)) { dentro = !dentro; continue; }
    if (!dentro) fora.push(l);
  }
  return fora.join('\n');
}
const FILA_STATUS = {
  ARQUIVADO: 'arquivado', ENTREGUE: 'entregue', DECIDIDO: 'decidido', SUPERADO: 'superado',
  CANCELADO: 'cancelado', 'SAIU DA FILA': 'em-spec',
};
const RE_FILA_MARCA = new RegExp('\\b(' + FILA_MARCAS.join('|') + ')\\b(?:\\s+(\\d{4}-\\d{2}-\\d{2}))?');

function parseFila(text) {
  const ls = linhas(text);
  const itens = [];
  let atual = null;
  const cabecalho = [];
  // `linhaNoArquivo` (1-based) — a gaveta mostra a origem como
  // "company/FILA.md:412", e sem isto o dono nao acha o item no editor.
  // achado-2 do reviewer (2026-09-06): sem rastrear a cerca de bloco de codigo,
  // uma linha "2. [cliente] …" colada DENTRO de um bloco ``` virava item novo —
  // com numero duplicado e projeto forjado pelo texto do exemplo. `parseSecoes`
  // ja fazia esse rastreio; a fila nao fazia.
  let emCodigo = false;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (/^\s*(```|~~~)/.test(l)) { emCodigo = !emCodigo; if (atual) atual.linhas.push(l); else cabecalho.push(l); continue; }
    const m = emCodigo ? null : l.match(/^(\d+)\.\s+(.*)$/);
    if (m) {
      atual = { numero: Number(m[1]), linhas: [m[2]], linhaNoArquivo: i + 1 };
      itens.push(atual);
    } else if (atual) atual.linhas.push(l);
    else cabecalho.push(l);
  }
  const porStatus = {};
  const out = itens.map((it) => {
    const texto = it.linhas.join('\n').trim();
    // spec 2026-09-qg-redesenho (T1): o item pode declarar o projeto logo apos o
    // numero — "12. [arvys] **Titulo**". Marca ausente = SEM PROJETO, e sem
    // projeto a tela mostra "(sem projeto)"; nunca se adivinha por heuristica.
    // Case-insensitive de proposito: o dono escreve isto a mao, e "[ARVYS]"
    // perder o projeto em silencio seria pior que aceitar e normalizar.
    const mp = it.linhas[0].match(/^\[([A-Za-z0-9][A-Za-z0-9-]*)\]\s+/);
    const projeto = mp ? mp[1].toLowerCase() : null;
    // O titulo pode quebrar em 2-3 linhas ("12. **Instrumentar sessao\n
    // abandonada**"). Antes desta spec o negrito nao fechava na 1a linha, o
    // match falhava e o titulo saia CRU, com os asteriscos e cortado no meio —
    // 10 dos 52 itens estavam assim. Junta ate o negrito fechar, no maximo 3.
    const cabBruto = it.linhas[0].replace(/^\[[A-Za-z0-9][A-Za-z0-9-]*\]\s+/, '');
    let cab = cabBruto;
    for (let k = 1; k < 3 && it.linhas[k] !== undefined; k++) {
      if ((cab.match(/\*\*/g) || []).length >= 2) break;
      cab += ' ' + it.linhas[k].trim();
    }
    const tb = cab.match(/\*\*(.+?)\*\*/);
    // Negrito que nunca fecha cai no fallback: limpa os asteriscos orfaos para
    // o titulo nao chegar cru na tela (defeito achado na T1 desta spec).
    let titulo = (tb ? tb[1] : cabBruto).replace(/~~/g, '').replace(/\*\*/g, '').trim();
    titulo = titulo.replace(/\s*[—-]\s*(ARQUIVADO|ENTREGUE|DECIDIDO|SUPERADO|CANCELADO|SAIU DA FILA)\b[\s\S]*$/, '').trim();
    const riscado = /^\s*~~/.test(cab) || /\*\*~~/.test(cab);
    const mm = texto.match(RE_FILA_MARCA);
    const status = mm ? FILA_STATUS[mm[1]] : 'aguardando';
    porStatus[status] = (porStatus[status] || 0) + 1;
    // Iniciativa citada NO PROPRIO TEXTO do item ("specs/2026-09-x/"). E leitura
    // literal, nao adivinhacao: se o item nao cita spec nenhuma, fica `null`.
    // achado-5 do reviewer: `https://github.com/foo/specs/bar` virava vinculo de
    // spec forjado. Agora o `specs/` tem de comecar um caminho — nada de letra,
    // barra, arroba, dois-pontos ou ponto colado antes dele.
    const ms = texto.match(/(?<![\w/@:.-])specs\/([A-Za-z0-9][\w.-]*)\/?/);
    // T1.2 — a marca do dono e a CONTRADICAO. Item entregue/arquivado que ainda
    // diz "espera o dono" nao e filtrado em silencio: vira `esperaConflito`, e a
    // tela mostra. Silencio aqui seria a mesma familia de defeito que a mesa
    // acabou de nomear (alerta que envelhece sem dizer que envelheceu).
    const me = semBlocosDeCodigo(texto).match(RE_ESPERA_DONO);
    // `decidido` FALTAVA aqui (reviewer do risco N1, 2026-09-06): a FILA.md usa
    // DECIDIDO como estado fechado (item 14 real: "DECIDIDO 2026-09-03"), e um
    // item decidido que ainda "espera o dono" e a mesma contradicao que ENTREGUE.
    // `em-spec` NAO entra de proposito: item que virou spec espera o dono no
    // gate — ali a marca e legitima, nao contradicao.
    const FECHADOS = ['entregue', 'arquivado', 'cancelado', 'superado', 'decidido'];
    const esperaDono = !!me;
    const esperaConflito = esperaDono && FECHADOS.indexOf(status) >= 0 ? status : null;
    return {
      numero: it.numero, titulo, status, riscado, projeto,
      esperaDono,
      esperaDesde: me && me[1] ? me[1] : null,
      esperaConflito,
      marca: mm ? mm[0] : null, dataMarca: mm && mm[2] ? mm[2] : null,
      linhaNoArquivo: it.linhaNoArquivo || null,
      spec: ms ? 'specs/' + ms[1] + '/' : null,
      linhas: it.linhas.length, texto,
    };
  });
  // Contagem por projeto para a tela agrupar sem recontar. `null` vira a chave
  // "(sem projeto)" — que aparece na tela, nao e escondida.
  const porProjeto = {};
  for (const it of out) {
    const k = it.projeto || '(sem projeto)';
    porProjeto[k] = (porProjeto[k] || 0) + 1;
  }
  // T1: quantos travam com o dono, e quantos se contradizem. Os dois numeros
  // sao da tela — o segundo existe para nao poder ser ignorado.
  const esperandoDono = out.filter((i) => i.esperaDono && !i.esperaConflito).length;
  const esperaContraditoria = out.filter((i) => i.esperaConflito).length;
  return {
    titulo: tituloDe(text),
    intro: citacoes(cabecalho.join('\n')).join(' '),
    total: out.length, porStatus, porProjeto,
    esperandoDono, esperaContraditoria,
    itens: out,
  };
}

/** `company/FILA.md` — itens numerados com status pelas marcas. Pesado (~65KB): rota própria. */
function readFila(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'FILA.md'), parseFila);
}

/** `company/ROADMAP.md` — ondas (`## Onda N — ...`) com a tabela de cada uma. */
function readRoadmap(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'ROADMAP.md'), (md) => {
    const { preambulo, secoes } = parseSecoes(md);
    return {
      titulo: tituloDe(md),
      intro: citacoes(preambulo).join(' '),
      ondas: secoes.filter((s) => s.nivel === 2).map((s) => ({
        titulo: s.titulo,
        tabela: parseTabela(s.corpo),
        notas: linhas(s.corpo).filter((l) => l.trim() && !/^\s*\|/.test(l)).join('\n').trim(),
      })),
    };
  });
}

/**
 * `company/PEDIDOS-DO-DONO.md` — placar + seções com tabela. Pesado: rota própria.
 *
 * T3 (spec 2026-09-qg-redesenho-2, achado novo do T0): o placar saía "— de 0
 * · 0%" com o arquivo cheio. A regex antiga exigia "Placar:" colado — o
 * arquivo real tem "Placar original (06/09): 34 concluídos · 18 pendentes ·
 * 1 superado." e depois "Placar de 07/09: 45 concluídos · 33 pendentes · 3
 * descartados por decisão · 1 superado." (revisão, com uma cláusula extra
 * ENTRE pendentes e superados) — nenhum dos dois batia com o padrão fixo.
 * A regra agora: pega a ÚLTIMA linha "Placar...:" do arquivo (a mais recente
 * — o dono revisa por cima, nunca apaga a de trás) e lê concluídos/pendentes/
 * superados como três buscas soltas na mesma linha, não um bloco rígido —
 * aguenta cláusula extra no meio e qualquer ordem.
 */
function readPedidos(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'PEDIDOS-DO-DONO.md'), (md) => {
    // as linhas de placar vivem em citação (`> …`) e o markdown as quebra no
    // meio da frase ("...pendentes · 3 descartados por\ndecisão · 1
    // superado.") — junta as linhas de citação num texto só antes de buscar,
    // senão o número que caiu na linha de baixo nunca é visto.
    const textoCitado = citacoes(md).join(' ');
    const linhasPlacar = [...textoCitado.matchAll(/Placar[^:]*:\s*([^*]+)/gi)];
    let placar = null;
    if (linhasPlacar.length) {
      const ultima = linhasPlacar[linhasPlacar.length - 1][1];
      const conc = ultima.match(/(\d+)\s+conclu[ií]dos?/i);
      const pend = ultima.match(/(\d+)\s+pendentes?/i);
      const sup = ultima.match(/(\d+)\s+superados?/i);
      if (conc && pend) {
        placar = { concluidos: Number(conc[1]), pendentes: Number(pend[1]), superados: sup ? Number(sup[1]) : 0 };
      }
    }
    const { preambulo, secoes } = parseSecoes(md);
    return {
      titulo: tituloDe(md),
      intro: citacoes(preambulo).join(' '),
      placar,
      secoes: secoes.map((s) => ({ nivel: s.nivel, titulo: s.titulo, tabela: parseTabela(s.corpo), corpo: s.corpo })),
    };
  });
}

/** `company/BRIEFING.md` — escrito pelo worker de madrugada. */
function readBriefing(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'BRIEFING.md'), (md) => {
    const t = md.match(/^#\s+Briefing\s+—\s+(\d{4}-\d{2}-\d{2})/m);
    const med = md.match(/Medição de:\s*([^\n]+?)\.?\s*$/m);
    const alertas = linhas(md).filter((l) => /^>\s*⚠️/.test(l)).map((l) => l.replace(/^>\s*⚠️\s*/, '').trim());
    const itens = [];
    for (const l of linhas(md)) {
      const m = l.match(/^-\s+\*\*(.+?):\*\*\s*(.*)$/);
      if (m) itens.push({ rotulo: m[1].trim(), texto: m[2].trim() });
    }
    const rod = md.match(/^_(.+)_\s*$/m);
    const ass = md.match(/<!--\s*assinatura:\s*([0-9a-f]+)\s*-->/);
    return {
      data: t ? t[1] : null, titulo: tituloDe(md), medicao: med ? med[1].trim() : null,
      alertas, itens, rodape: rod ? rod[1].trim() : null, assinatura: ass ? ass[1] : null,
    };
  });
}

/** `company/RADAR.json` + `company/RADAR-CURADO.md` — os dois lados do radar. */
function readRadar(root, origem = origemDisco) {
  const cru = ler(origem, root, path.join(root, 'company', 'RADAR.json'), (raw) => {
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('JSON não é objeto');
    const pendentes = Array.isArray(j.pendentes) ? j.pendentes : [];
    return { generatedAt: j.generatedAt || null, fontes: j.fontes || {}, pendentes, total: pendentes.length };
  });
  const curado = ler(origem, root, path.join(root, 'company', 'RADAR-CURADO.md'), (md) => {
    const itens = [];
    for (const l of linhas(md)) {
      const m = l.match(/^-\s+(ADOTAR|REVISAR|IGNORAR)\s+([0-9a-f]{12})\s+—\s+(.*)$/);
      if (m) itens.push({ etiqueta: m[1], id: m[2], motivo: m[3].trim() });
    }
    const porEtiqueta = { ADOTAR: 0, REVISAR: 0, IGNORAR: 0 };
    for (const i of itens) porEtiqueta[i.etiqueta]++;
    return { intro: citacoes(md).join(' '), total: itens.length, porEtiqueta, itens };
  });
  return { cru, curado };
}

/** `company/PLAYBOOK.md` — a constituição, seção a seção. */
function readPlaybook(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'PLAYBOOK.md'), (md) => {
    const { preambulo, secoes } = parseSecoes(md);
    return { titulo: tituloDe(md), preambulo, secoes };
  });
}

/** `company/METRICS.md` — a régua COM × SEM Arvys (tabela semanal). */
function readMetricsMd(root, origem = origemDisco) {
  return ler(origem, root, path.join(root, 'company', 'METRICS.md'), (md) => ({
    titulo: tituloDe(md),
    intro: citacoes(md.split(/^\|/m)[0]).join(' '),
    tabela: parseTabela(md),
    notas: citacoes(md.slice(md.lastIndexOf('|') + 1)).join(' '),
  }));
}

/** Documentos soltos do escritório (Biblioteca): ANTES-DE-PUBLICAR, mandatos noturnos. */
function readCompanyDocs(root, origem = origemDisco) {
  const dir = path.join(root, 'company');
  return lerPasta(origem, root, dir, (entradas) =>
    entradas
      .filter((nome) => /^(ANTES-DE-PUBLICAR|MANDATO-NOTURNO-.*)\.md$/.test(nome) && !ehPasta(origem, path.join(dir, nome)))
      .sort()
      .map((nome) => resumoDoc(origem, root, path.join(dir, nome)))
  );
}

/** Ficha curta de um `.md`: nome, título, tamanho, mtime — sem o corpo. */
function resumoDoc(origem, root, p) {
  const r = ler(origem, root, p, (md) => ({ titulo: tituloDe(md) }));
  const base = { nome: path.basename(p), arquivo: r.arquivo };
  if (!r.ok) return { ...base, ok: false, erro: r.erro };
  if (r.data === null) return { ...base, ok: true, titulo: null };
  return { ...base, ok: true, titulo: r.data.titulo, bytes: r.bytes, mtime: r.mtime };
}

// ---------------------------------------------------------------------------
// 3b. BIBLIOTECA DO ARVYS — `plugin/biblioteca/` (spec 2026-09-biblioteca, T2)
// ---------------------------------------------------------------------------
//
// O manual é conteúdo do PLUGIN, não do escritório: no repo de desenvolvimento
// mora em `<root>/plugin/biblioteca`; na máquina do adotante o repo NÃO tem
// `plugin/` e a pasta vive no cache do Claude Code
// (`~/.claude/plugins/cache/arvys/arvys/<versão>/biblioteca`), possivelmente
// em mais de uma versão — a MAIS ALTA por semver vence (0.18.0 > 0.9.0; a
// ordem alfabética diria o contrário — R1 do plan). Sem pasta em lugar nenhum
// o leitor devolve `{ok:false, erro}` VISÍVEL, nunca `[]` nem `data:null`: a
// seção Biblioteca não pode regredir em silêncio para "não foi escrito".
//
// Contrato de cada capítulo (`NN-nome.md`): frontmatter com `titulo`, `ordem`
// (única), `cenarios` (lista) e `perfil` (vibecoder|dev|ambos); corpo não
// vazio. Capítulo torto derruba a leitura inteira em `{ok:false}` nomeando o
// arquivo — manual com capítulo quebrado é manual quebrado, e o sensor
// `scripts/check-biblioteca.test.mjs` é quem impede que isso chegue ao git.
//
// Links no corpo (decisão derivada da T1, tasks.md):
//   · `[x](../../company/GLOSSARIO.md)` (qualquer caminho relativo terminando
//     em GLOSSARIO.md) vira a rota `#/biblioteca/glossario`;
//   · `[x](0N-capitulo.md#ancora)` fica e é VALIDADO — capítulo e âncora têm
//     de existir (R5: link para capítulo renomeado reprova com o link exato);
//   · `[x](#ancora)` idem, contra o próprio capítulo;
//   · link relativo para fora da biblioteca vira texto simples (sem link);
//   · http(s)/mailto passam intactos.
// A âncora de uma seção é `slugAncora(titulo)` — a mesma função que a tela
// deve usar para montar `id` dos títulos (T4).

const BIBLIOTECA_PERFIS = ['vibecoder', 'dev', 'ambos'];
const BIBLIOTECA_CENARIOS = ['primeira-sessao', 'produto-novo', 'adotar-projeto', 'fix', 'feature', 'semana'];
const BIBLIOTECA_ROTA_GLOSSARIO = '#/biblioteca/glossario';

/** Semver mínimo: `[major, minor, patch, prerelease|null]` ou null se não parece versão. */
function parseSemver(s) {
  const m = String(s).match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] || null];
}

/** Compara duas versões pelas regras do semver (pré-release perde para a final da mesma base). */
function compararSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  if (a[3] === b[3]) return 0;
  if (a[3] === null) return 1;
  if (b[3] === null) return -1;
  const pa = a[3].split('.');
  const pb = b[3].split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb && Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Onde está a biblioteca. Ordem: `<root>/plugin/biblioteca` → maior versão
 * (semver) em `<home>/.claude/plugins/cache/arvys/arvys/<v>/biblioteca` →
 * `{ok:false, erro}` legível. `home` é injetável (o sensor nunca toca o cache
 * real); o padrão é `os.homedir()`.
 */
function resolverPastaBiblioteca(root, origem = origemDisco, home = os.homedir()) {
  const noRoot = path.join(root, 'plugin', 'biblioteca');
  if (ehPasta(origem, noRoot)) return { ok: true, pasta: noRoot, fonte: 'root', arquivo: rel(root, noRoot) };

  const cacheDir = path.join(home, '.claude', 'plugins', 'cache', 'arvys', 'arvys');
  let versoes = null;
  try {
    versoes = origem.listar(cacheDir);
  } catch (e) {
    versoes = null;
  }
  const candidatas = (versoes || [])
    .map((nome) => ({ nome, semver: parseSemver(nome) }))
    .filter((v) => v.semver && ehPasta(origem, path.join(cacheDir, v.nome, 'biblioteca')))
    .sort((a, b) => compararSemver(b.semver, a.semver));
  if (candidatas.length) {
    const pasta = path.join(cacheDir, candidatas[0].nome, 'biblioteca');
    return { ok: true, pasta, fonte: 'cache', versao: candidatas[0].nome, arquivo: pasta.split(path.sep).join('/') };
  }
  return {
    ok: false,
    raw: '',
    erro:
      `biblioteca não encontrada: nem ${rel(root, noRoot)} nem ${cacheDir.split(path.sep).join('/')}/<versão>/biblioteca` +
      (versoes && versoes.length ? ` (versões no cache sem biblioteca: ${versoes.join(', ')})` : ' (cache do plugin ausente)'),
    arquivo: rel(root, noRoot),
  };
}

/** Âncora de um título: minúsculas, sem acento, só [a-z0-9-]. A tela usa a MESMA regra. */
function slugAncora(titulo) {
  return String(titulo)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `cenarios: [a, b]` (ou `a, b`) do frontmatter → `['a','b']`. */
function parseListaFrontmatter(valor) {
  if (valor === undefined || valor === null) return [];
  return String(valor)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Texto depois do frontmatter (o corpo do capítulo). */
function corpoSemFrontmatter(md) {
  const m = md.replace(/^﻿/, '').match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  return m ? md.replace(/^﻿/, '').slice(m[0].length) : md;
}

/**
 * Reescreve e valida os links de um corpo. Devolve `{corpo, erros[]}`; cada
 * erro carrega o link EXATO (`[texto](alvo)`) para o sensor reprovar apontando.
 * Blocos de código (```) e trechos em crase não são tocados.
 */
function tratarLinks(corpo, arquivo, indiceAncoras, imagemExiste = () => true) {
  const erros = [];
  let inCode = false;
  const LINK = /(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
  const out = linhas(corpo).map((linha) => {
    if (/^```/.test(linha.trim())) {
      inCode = !inCode;
      return linha;
    }
    if (inCode) return linha;
    // fora de crase: partes pares; dentro: ímpares
    return linha
      .split(/(`[^`]*`)/)
      .map((parte, i) => {
        if (i % 2 === 1) return parte;
        return parte.replace(LINK, (todo, bang, texto, alvo) => {
          if (/^(https?:|mailto:)/i.test(alvo)) return todo;
          if (bang) {
            // review A da T2: imagem também apodrece. Caminho relativo DENTRO
            // da biblioteca tem de existir; `../` (fora) ou ausente reprova
            // com o link exato — mesma família do R5.
            const link = `![${texto}](${alvo})`;
            if (/^(\.\.\/|\/|[a-z]:)/i.test(alvo) || alvo.split('/').includes('..')) {
              erros.push(`${arquivo}: imagem ${link} aponta para fora da biblioteca`);
            } else if (!imagemExiste(alvo)) {
              erros.push(`${arquivo}: imagem ${link} não existe na biblioteca`);
            }
            return todo;
          }
          if (/(^|\/)GLOSSARIO\.md(#[^)]*)?$/.test(alvo)) return `[${texto}](${BIBLIOTECA_ROTA_GLOSSARIO})`;
          let capitulo = null;
          let ancora = null;
          if (/^#/.test(alvo)) {
            capitulo = arquivo;
            ancora = alvo.slice(1);
          } else {
            const m = alvo.match(/^(\d{2}-[^/#]+\.md)(?:#(.*))?$/);
            if (!m) return texto; // link relativo para fora da biblioteca: vira texto
            capitulo = m[1];
            ancora = m[2] || null;
          }
          const link = `[${texto}](${alvo})`;
          if (!Object.prototype.hasOwnProperty.call(indiceAncoras, capitulo)) {
            erros.push(`${arquivo}: link ${link} aponta para capítulo inexistente \`${capitulo}\``);
          } else if (ancora !== null && !indiceAncoras[capitulo].includes(ancora)) {
            erros.push(`${arquivo}: link ${link} aponta para âncora inexistente \`#${ancora}\` em \`${capitulo}\``);
          }
          return todo;
        });
      })
      .join('');
  });
  return { corpo: out.join('\n'), erros };
}

/**
 * Glossário para leigos: tabelas `termo | analogia | onde aparece | termo da
 * marca` de um capítulo. Linha sem analogia é descartada — a MESMA regra do
 * `readGlossario` (linha sem definição é dívida). `marca` é o texto do link
 * para o vocabulário da marca (`[Fila](…GLOSSARIO.md)` → `'Fila'`) ou null
 * quando a célula não linka (`(termo do PLAYBOOK)` fica em `nota`).
 */
function parseGlossarioLeigo(corpo) {
  const { secoes } = parseSecoes(corpo);
  const termos = {};
  const grupos = [];
  for (const s of secoes.filter((x) => x.nivel === 2)) {
    const tab = parseTabela(s.corpo);
    if (!tab || !tab.linhas) continue;
    const cab = tab.colunas.map((c) => c.toLowerCase());
    if (cab[0] !== 'termo' || cab[1] !== 'analogia') continue;
    const desta = [];
    for (const l of tab.linhas) {
      const termo = (l[0] || '').replace(/`/g, '').trim();
      const analogia = (l[1] || '').trim();
      const onde = (l[2] || '').trim();
      const celula = (l[3] || '').trim();
      if (!termo || !analogia) continue;              // sem analogia é dívida: não entra
      const link = celula.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      // o corpo chega com os links já tratados (`GLOSSARIO.md` → rota); aceita as duas formas
      const paraMarca = link && (/(^|\/)GLOSSARIO\.md(#.*)?$/.test(link[2]) || link[2] === BIBLIOTECA_ROTA_GLOSSARIO);
      const marca = paraMarca ? link[1].trim() : null;
      termos[termo] = { analogia, onde, marca, nota: marca ? null : celula || null, grupo: s.titulo };
      desta.push(termo);
    }
    if (desta.length) grupos.push({ titulo: s.titulo, termos: desta });
  }
  return { total: Object.keys(termos).length, termos, grupos };
}

/**
 * R4 (duas verdades de glossário): cruza o glossário leigo com o da marca
 * (`readGlossario().data`). Termo comum aos dois tem de apontar, em `marca`,
 * para o MESMO termo da marca; link para termo que a marca não tem também é
 * divergência. Devolve a lista de mensagens (vazia = coerente).
 */
function divergenciasGlossario(leigo, marca) {
  const out = [];
  if (!leigo || !marca) return out;
  const daMarca = marca.termos || {};
  for (const [termo, t] of Object.entries(leigo.termos || {})) {
    const comum = Object.prototype.hasOwnProperty.call(daMarca, termo);
    if (comum && t.marca !== termo) {
      out.push(`termo \`${termo}\` existe nos dois glossários mas o "termo da marca" do leigo é ${t.marca ? '`' + t.marca + '`' : 'vazio (sem link)'} — tem de linkar \`${termo}\``);
    } else if (!comum && t.marca && !Object.prototype.hasOwnProperty.call(daMarca, t.marca)) {
      out.push(`termo \`${termo}\` linka \`${t.marca}\`, que não existe em company/GLOSSARIO.md`);
    }
  }
  return out;
}

/**
 * A biblioteca inteira: capítulos ordenados (com corpo já com links tratados
 * e sumário de seções), índice por cenário, glossário leigo e índice de
 * âncoras. Contrato `{ok,data} | {ok:false,raw,erro}`; nunca `data:null`.
 */
function readBiblioteca(root, origem = origemDisco, home = os.homedir()) {
  const onde = resolverPastaBiblioteca(root, origem, home);
  if (!onde.ok) return onde;
  const { pasta } = onde;
  const arquivoTopo = onde.arquivo;
  let nomes;
  try {
    nomes = origem.listar(pasta) || [];
  } catch (e) {
    return falha(`não consegui listar ${arquivoTopo}: ${(e && e.message) || e}`, '', { arquivo: arquivoTopo });
  }
  const capitulosNomes = nomes.filter((n) => /^\d{2}-[^/]+\.md$/i.test(n) && !ehPasta(origem, path.join(pasta, n))).sort();
  if (!capitulosNomes.length) {
    return falha(`biblioteca sem capítulos: ${arquivoTopo} tem [${nomes.join(', ') || 'nada'}] e nenhum \`NN-nome.md\``, '', { arquivo: arquivoTopo });
  }

  const capitulos = [];
  const ordens = {};
  for (const nome of capitulosNomes) {
    const p = path.join(pasta, nome);
    const r = lerTexto(origem, p);
    if (r.ausente) return falha(`capítulo ${nome} sumiu entre listar e ler`, '', { arquivo: arquivoTopo });
    if (r.erro) return falha(`capítulo ${nome}: ${r.erro}`, r.raw, { arquivo: arquivoTopo, capitulo: nome });
    const md = r.text;
    const meta = parseFrontmatter(md);
    const semFm = !/^---\r?\n/.test(md.replace(/^﻿/, ''));
    const faltam = ['titulo', 'ordem', 'cenarios', 'perfil'].filter((k) => !meta[k]);
    if (semFm) return falha(`capítulo ${nome}: sem frontmatter (titulo, ordem, cenarios, perfil)`, md, { arquivo: arquivoTopo, capitulo: nome });
    if (faltam.length) return falha(`capítulo ${nome}: frontmatter sem ${faltam.join(', ')}`, md, { arquivo: arquivoTopo, capitulo: nome });
    if (!/^\d+$/.test(meta.ordem)) return falha(`capítulo ${nome}: ordem \`${meta.ordem}\` não é número`, md, { arquivo: arquivoTopo, capitulo: nome });
    const ordem = Number(meta.ordem);
    if (ordens[ordem]) return falha(`capítulo ${nome}: ordem ${meta.ordem} repetida (já é de ${ordens[ordem]})`, md, { arquivo: arquivoTopo, capitulo: nome });
    ordens[ordem] = nome;
    if (!BIBLIOTECA_PERFIS.includes(meta.perfil)) {
      return falha(`capítulo ${nome}: perfil \`${meta.perfil}\` inválido (${BIBLIOTECA_PERFIS.join('|')})`, md, { arquivo: arquivoTopo, capitulo: nome });
    }
    const cenarios = parseListaFrontmatter(meta.cenarios);
    const estranhos = cenarios.filter((c) => !BIBLIOTECA_CENARIOS.includes(c));
    if (!cenarios.length || estranhos.length) {
      return falha(
        `capítulo ${nome}: cenarios ${cenarios.length ? 'desconhecidos: ' + estranhos.join(', ') : 'vazio'} (válidos: ${BIBLIOTECA_CENARIOS.join(', ')})`,
        md,
        { arquivo: arquivoTopo, capitulo: nome }
      );
    }
    const corpo = corpoSemFrontmatter(md).trim();
    const soTitulos = corpo.replace(/^#.*$/gm, '').trim();
    if (!soTitulos) return falha(`capítulo ${nome}: corpo vazio (só título)`, md, { arquivo: arquivoTopo, capitulo: nome });
    const { secoes } = parseSecoes(corpo);
    capitulos.push({
      arquivo: nome,
      titulo: meta.titulo,
      ordem,
      cenarios,
      perfil: meta.perfil,
      corpo,
      secoes: secoes.map((s) => ({ titulo: s.titulo, nivel: s.nivel, ancora: slugAncora(s.titulo) })),
      bytes: r.bytes,
      mtime: r.mtime,
    });
  }
  capitulos.sort((a, b) => a.ordem - b.ordem);

  const ancoras = {};
  for (const c of capitulos) ancoras[c.arquivo] = c.secoes.map((s) => s.ancora);

  const errosLink = [];
  for (const c of capitulos) {
    const t = tratarLinks(c.corpo, c.arquivo, ancoras, (alvo) => origem.existe(path.join(pasta, alvo.split('#')[0])));
    c.corpo = t.corpo;
    errosLink.push(...t.erros);
  }
  if (errosLink.length) {
    return falha(`links quebrados (${errosLink.length}): ${errosLink.join(' · ')}`, '', { arquivo: arquivoTopo, links: errosLink });
  }

  const cenarios = {};
  for (const nome of BIBLIOTECA_CENARIOS) cenarios[nome] = [];
  for (const c of capitulos) for (const cen of c.cenarios) cenarios[cen].push(c.arquivo);

  let glossarioLeigo = { total: 0, termos: {}, grupos: [] };
  for (const c of capitulos) {
    const g = parseGlossarioLeigo(c.corpo);
    if (g.total) {
      glossarioLeigo = { ...g, capitulo: c.arquivo };
      break;
    }
  }

  return ok(
    { capitulos, cenarios, glossarioLeigo, indice: { ancoras }, pasta, fonte: onde.fonte, versao: onde.versao || null },
    { arquivo: arquivoTopo }
  );
}

// ---------------------------------------------------------------------------
// 4. LEITORES NOVOS — incidents/ e specs/
// ---------------------------------------------------------------------------

const INC_CAMPOS = ['Agente', 'etapa_de_origem', 'Sintoma', 'Root cause', 'Correção aplicada', 'Prevenção verificável', 'Status'];

function parseIncidente(md) {
  const campos = {};
  let atual = null;
  for (const l of linhas(md)) {
    const m = l.match(/^\*\*([^*]+?):\*\*\s*(.*)$/);
    if (m) {
      atual = m[1].trim();
      campos[atual] = m[2].trim();
    } else if (atual && l.trim() && !/^#/.test(l)) campos[atual] += ' ' + l.trim();
    else if (!l.trim()) atual = null;
  }
  for (const k of Object.keys(campos)) campos[k] = campos[k].trim();
  const status = campos.Status || null;
  return {
    titulo: tituloDe(md),
    campos,
    faltam: INC_CAMPOS.filter((c) => c !== 'Status' && !(c in campos)),
    fechado: !!status && /^FECHADO/i.test(status),
  };
}

/** `incidents/*.md` (menos `_TEMPLATE`), do mais novo ao mais velho. */
function readIncidents(root, origem = origemDisco) {
  const dir = path.join(root, 'incidents');
  return lerPasta(origem, root, dir, (entradas) => {
    const itens = entradas
      .filter((nome) => /\.md$/.test(nome) && !/^_/.test(nome) && !ehPasta(origem, path.join(dir, nome)))
      .sort()
      .reverse()
      .map((nome) => {
        const r = ler(origem, root, path.join(dir, nome), parseIncidente);
        const dm = nome.match(/^(\d{4}-\d{2}-\d{2})/);
        const base = { slug: nome.replace(/\.md$/, ''), data: dm ? dm[1] : null, arquivo: r.arquivo };
        return r.ok ? { ...base, ok: true, ...r.data } : { ...base, ok: false, erro: r.erro, raw: r.raw };
      });
    return { total: itens.length, abertos: itens.filter((i) => i.ok && !i.fechado).length, itens };
  });
}

function contarMarcas(md) {
  const c = { aFazer: 0, emCurso: 0, feitas: 0 };
  for (const l of linhas(md)) {
    if (/^\s*-\s+\[ \]/.test(l)) c.aFazer++;
    else if (/^\s*-\s+\[~\]/.test(l)) c.emCurso++;
    else if (/^\s*-\s+\[x\]/i.test(l)) c.feitas++;
  }
  return c;
}

/**
 * `specs/<slug>/` — o ARQUIVO de cada spec: frontmatter, título, evidência,
 * marcas do tasks.md. Pastas `_*` (template, rascunhos) ficam de fora.
 * Não conta specs por status: isso é do worker (`OFFICE-METRICS.json`).
 */
function readSpecs(root, origem = origemDisco) {
  const dir = path.join(root, 'specs');
  return lerPasta(origem, root, dir, (entradas) =>
    entradas
      .filter((nome) => !/^_/.test(nome) && ehPasta(origem, path.join(dir, nome)))
      .sort()
      .reverse()
      .map((slug) => {
        const pasta = path.join(dir, slug);
        const spec = ler(origem, root, path.join(pasta, 'spec.md'), (md) => {
          const fm = parseFrontmatter(md);
          return {
            titulo: tituloDe(md),
            status: fm.status || null,
            gateAprovado: fm.gate_aprovado || null,
            owner: fm.owner || fm.agente || null,
            escala: fm.escala || null,
            frontmatter: fm,
            temFrontmatter: /^---\r?\n/.test(md),
          };
        });
        const evDir = path.join(pasta, 'evidence');
        const ev = listar(origem, evDir);
        const evidencias = ev ? ev.filter((nome) => !ehPasta(origem, path.join(evDir, nome))).sort() : [];
        const tasks = ler(origem, root, path.join(pasta, 'tasks.md'), contarMarcas);
        const base = {
          slug, pasta: rel(root, pasta),
          temEvidencia: evidencias.length > 0, evidencias,
          temPlan: origem.existe(path.join(pasta, 'plan.md')),
          tasks: tasks.ok ? tasks.data : null,
        };
        if (!spec.ok) return { ...base, ok: false, erro: spec.erro, raw: spec.raw };
        if (spec.data === null) return { ...base, ok: true, semSpecMd: true, status: null, titulo: null };
        return { ...base, ok: true, ...spec.data, mtime: spec.mtime };
      })
  );
}

// ---------------------------------------------------------------------------
// 5. LEITORES NOVOS — agents/<dir>/
// ---------------------------------------------------------------------------

/** Pastas de agente no contrato novo: `agents/` ausente → data:null. */
function readAgentDirs(agentsDir, root, origem = origemDisco) {
  return lerPasta(origem, root || path.dirname(agentsDir), agentsDir, () => listAgentDirs(agentsDir, { avisar: false }, origem));
}

/** Cartão do agente no contrato novo: AGENT.md/STATE.md tortos → ok:false, não exceção. */
function readAgentSafe(dir, { agentsDir, metrics, root }, origem = origemDisco) {
  const r = root || path.dirname(agentsDir);
  const a = lerTexto(origem, path.join(agentsDir, dir, 'AGENT.md'));
  const s = lerTexto(origem, path.join(agentsDir, dir, 'STATE.md'));
  const arquivo = rel(r, path.join(agentsDir, dir));
  if (a.ausente) return ok(null, { arquivo });
  if (a.erro) return falha(`AGENT.md: ${a.erro}`, a.raw, { arquivo });
  if (s.erro) return falha(`STATE.md: ${s.erro}`, s.raw, { arquivo });
  try {
    const card = readAgent(dir, { agentsDir, metrics }, origem);
    return ok({ ...card, stateAusente: !!s.ausente, mtimeState: s.mtime || null }, { arquivo });
  } catch (e) {
    return falha(`cartão falhou: ${(e && e.message) || e}`, a.text, { arquivo });
  }
}

function parseGotchas(md) {
  const { preambulo, secoes } = parseSecoes(md);
  // Dois formatos no disco: `- **N.** texto` (Forge, por famílias) e
  // `N. **título** texto` (Deal, Echo, Scout… lista numerada no preâmbulo).
  const item = (l) => {
    const m = l.match(/^\s*-\s+\*\*(\d+)\.\*\*\s*(.*)$/) || l.match(/^(\d+)\.\s+(.*)$/);
    return m ? { numero: Number(m[1]), texto: m[2].trim() } : null;
  };
  const familias = [];
  let total = 0;
  const bloco = (titulo, corpo) => {
    const itens = [];
    let lei = null;
    let atual = null;
    for (const l of linhas(corpo)) {
      const lm = l.match(/^\*\*Lei:\*\*\s*(.*)$/);
      if (lm) { lei = lm[1].trim(); atual = 'lei'; continue; }
      const it = item(l);
      if (it) { itens.push(it); atual = it; continue; }
      if (!l.trim()) { atual = null; continue; }
      if (atual === 'lei') lei += ' ' + l.trim();
      else if (atual && !/^\s*-\s/.test(l)) atual.texto += ' ' + l.trim();
    }
    total += itens.length;
    return { titulo, lei, itens };
  };
  // formato antigo (sem famílias): itens soltos no preâmbulo
  const solto = bloco(null, preambulo);
  if (solto.itens.length) familias.push(solto);
  for (const s of secoes) familias.push(bloco(s.titulo, s.corpo));
  return { titulo: tituloDe(md), aviso: citacoes(preambulo).join(' '), total, familias };
}

/** `agents/<dir>/GOTCHAS.md` — famílias (lei + precedentes numerados). */
function readGotchas(agentsDir, dir, root, origem = origemDisco) {
  return ler(origem, root || path.dirname(agentsDir), path.join(agentsDir, dir, 'GOTCHAS.md'), parseGotchas);
}

/** `agents/<dir>/FEEDBACK.md` — histórico COMPLETO, pelo parser único de workers/lib/feedback.js. */
function readFeedback(agentsDir, dir, root, origem = origemDisco) {
  return ler(origem, root || path.dirname(agentsDir), path.join(agentsDir, dir, 'FEEDBACK.md'), (md) => {
    const entradas = fbLib.parseArquivo(md);
    return { total: entradas.length, resumo: fbLib.contarPorOrigem(md), entradas };
  });
}

// A linha do INBOX como o `appendRecado()` do serve.js grava: `- [ ] <ISO> — <texto>`.
// A CONTAGEM vem de workers/lib/inbox.js (mesmo número do /api/live); esta
// regex só separa ISO de texto para a ficha — sem `$` (gotcha 36).
const RE_INBOX_LINHA = /^- \[( |x)\] (\S+) — ([^\n]*)/;

/** `agents/<dir>/INBOX.md` — recados do dono, lidos e não lidos. */
function readInbox(agentsDir, dir, root, origem = origemDisco) {
  return ler(origem, root || path.dirname(agentsDir), path.join(agentsDir, dir, 'INBOX.md'), (md) => {
    const entradas = [];
    for (const l of linhas(md)) {
      const m = RE_INBOX_LINHA.exec(l);
      if (m) entradas.push({ lido: m[1] === 'x', iso: m[2], texto: m[3].trim() });
    }
    return { naoLidos: inboxLib.contarNaoLidos(md), lidos: inboxLib.contarLidos(md), entradas };
  });
}

const DOC_DIRS = ['playbooks', 'pesquisas', 'drafts', 'autopsias'];

/** `agents/<dir>/{playbooks,pesquisas,drafts,autopsias}/*.md` + `FPY.md` — fichas, sem o corpo. */
function readAgentDocs(agentsDir, dir, root, origem = origemDisco) {
  const r = root || path.dirname(agentsDir);
  const base = path.join(agentsDir, dir);
  return lerPasta(origem, r, base, () => {
    const pastas = [];
    for (const nome of DOC_DIRS) {
      const p = path.join(base, nome);
      const entradas = listar(origem, p);
      if (entradas === null) continue;
      pastas.push({
        pasta: nome,
        arquivos: entradas
          .filter((n) => /\.md$/i.test(n) && !ehPasta(origem, path.join(p, n)))
          .sort()
          .map((n) => resumoDoc(origem, r, path.join(p, n))),
      });
    }
    const fpy = origem.existe(path.join(base, 'FPY.md')) ? resumoDoc(origem, r, path.join(base, 'FPY.md')) : null;
    return { pastas, fpy, total: pastas.reduce((n, p) => n + p.arquivos.length, 0) + (fpy ? 1 : 0) };
  });
}

// ---------------------------------------------------------------------------
// 5. ESFORÇO — o que o escritório ao vivo gera (T11 / EMENDA 1 · E2)
// ---------------------------------------------------------------------------
/**
 * `hub/live/events.jsonl` é a trilha que o hook passivo (`hub/live/hook.js`)
 * grava a cada PreToolUse/PostToolUse/Stop/SubagentStop do Claude Code. Até a
 * T11 ela só movia bonecos no `/live`. Aqui ela vira leitura de decisão.
 *
 * TERMÔMETRO, NUNCA PLACAR (spec § E2, Goodhart / FILA 21): daqui não sai nota
 * composta, nem ranking, nem "produtividade". Sai tempo cru em ms por estado,
 * contagem crua de ferramenta e a janela medida — cada número com unidade e
 * período, para comparar um agente com ELE MESMO em dias diferentes.
 *
 * O QUE É DADO PARCIAL, SEMPRE (a tela tem de dizer, nunca zerar em silêncio):
 *  - o `serve.js` trunca o arquivo no boot em `MAX_LINES_ON_BOOT` (2000 linhas);
 *  - o hook rotaciona para `events.1.jsonl` acima de 5 MB;
 *  - a pasta `hub/live/` não existe numa instalação nova (gotcha 29).
 * Por isso o retorno traz SEMPRE `cobertura` (de quando até quando a trilha
 * fala) e `parcial`/`motivos`, mesmo quando leu tudo.
 *
 * COMO O TEMPO É CLASSIFICADO — a regra, escrita porque nenhum evento carrega
 * duração: cada evento abre um intervalo que se fecha no evento seguinte DO
 * MESMO AGENTE, no MESMO dia. O evento que ABRE decide o rótulo:
 *   `Stop` / `SessionEnd` / ferramenta `AskUserQuestion` → esperando o dono
 *   `ok:false` / `PostToolUseFailure`                    → bloqueado
 *   qualquer outro                                       → trabalhando
 * e o TAMANHO do intervalo corrige: acima de `OCIOSO_MS` um "trabalhando" vira
 * ocioso (ninguém trabalha 8 min sem tocar em ferramenta), e acima de
 * `SILENCIO_MS` sai da conta do dia e vira uma janela de silêncio listada à
 * parte. O último evento do dia não abre intervalo (não há o que o feche):
 * por isso `eventosSemIntervalo`.
 */
// T2c: os dois números viravam UM só quando a leitura de cauda passou a ser
// método de origem (`origem.lerCauda(caminho, maxBytes)` — interface de 5
// campos, um parâmetro). Ver achado em `hub/lib/origem-disco.js:lerCauda`.
const ESFORCO_TETO_BYTES = 8 * 1024 * 1024; // acima disto leio só a cauda (o hook rotaciona em 5 MB)
const OCIOSO_MS = 3 * 60 * 1000;    // intervalo maior que isto não é trabalho: é espera sem nome
const SILENCIO_MS = 15 * 60 * 1000; // acima disto o escritório estava vazio — fora da conta do dia
const SEM_AGENTE = '(sessão sem agente aberto)';
const ESFORCO_MAX_LINES_ON_BOOT = 2000; // espelha hub/serve.js:MAX_LINES_ON_BOOT (só para a frase da tela)

function diaLocalDe(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Lê o jsonl inteiro, ou só a cauda se for grande demais, pela origem
 * injetada (`origem.lerCauda`). Nunca lança — quem chama já garantiu que
 * `origem.lerCauda` existe (ver `readEsforco`).
 */
function lerJsonl(origem, p) {
  let r;
  try {
    r = origem.lerCauda(p, ESFORCO_TETO_BYTES);
  } catch (e) {
    if (e && e.origemErro === 'pasta') return { erro: 'é uma pasta, não um arquivo' };
    return { erro: `não consegui ler: ${(e && e.message) || e}` };
  }
  if (r === null) return { ausente: true };
  let texto = r.texto;
  if (r.cauda) texto = texto.slice(texto.indexOf('\n') + 1); // a 1ª linha da cauda está cortada ao meio
  return { texto, cauda: r.cauda, bytes: r.bytes, mtime: r.mtime };
}

function novoBalde(agente) {
  return {
    agente,
    eventos: 0,
    trabalhandoMs: 0,
    bloqueadoMs: 0,
    esperandoDonoMs: 0,
    ociosoMs: 0,
    silencioMs: 0,
    falhas: 0,
    eventosSemIntervalo: 0,
    primeiro: null,
    ultimo: null,
    _ferramentas: Object.create(null),
    _silencios: [],
  };
}

function fechaBalde(b) {
  const ferramentas = Object.keys(b._ferramentas)
    .map((nome) => ({ nome, usos: b._ferramentas[nome].usos, falhas: b._ferramentas[nome].falhas }))
    .sort((a, b2) => b2.usos - a.usos || a.nome.localeCompare(b2.nome));
  const silencios = b._silencios.sort((a, b2) => b2.ms - a.ms).slice(0, 5);
  const medidoMs = b.trabalhandoMs + b.bloqueadoMs + b.esperandoDonoMs + b.ociosoMs;
  delete b._ferramentas;
  delete b._silencios;
  return Object.assign(b, { ferramentas, silencios, medidoMs });
}

function classificaEsforco(ev) {
  if (ev.event === 'Stop' || ev.event === 'SessionEnd') return 'esperandoDonoMs';
  if (ev.tool === 'AskUserQuestion') return 'esperandoDonoMs';
  if (ev.ok === false || ev.event === 'PostToolUseFailure') return 'bloqueadoMs';
  return 'trabalhandoMs';
}

function parseEsforco(texto, meta) {
  const brutas = texto.split(/\r?\n/).filter((l) => l.trim());
  const eventos = [];
  let ilegiveis = 0;
  for (const l of brutas) {
    let o;
    try { o = JSON.parse(l); } catch (e) { ilegiveis++; continue; }
    if (!o || typeof o !== 'object' || typeof o.ts !== 'string') { ilegiveis++; continue; }
    const t = Date.parse(o.ts);
    if (!isFinite(t)) { ilegiveis++; continue; }
    eventos.push({
      t,
      ts: o.ts,
      dia: diaLocalDe(new Date(t)),
      agente: typeof o.agent === 'string' && o.agent ? o.agent : null,
      event: typeof o.event === 'string' ? o.event : 'unknown',
      tool: typeof o.tool === 'string' && o.tool ? o.tool : null,
      ok: o.ok !== false,
    });
  }
  eventos.sort((a, b) => a.t - b.t);

  // agrupa por (dia, agente) preservando a ordem cronológica
  const chaves = new Map();
  for (const ev of eventos) {
    const chave = ev.dia + '\u0000' + (ev.agente || SEM_AGENTE);
    if (!chaves.has(chave)) chaves.set(chave, []);
    chaves.get(chave).push(ev);
  }

  const porDia = new Map();
  const porAgente = new Map();
  for (const [chave, lista] of chaves) {
    const [dia, agente] = chave.split('\u0000');
    const b = novoBalde(agente);
    b.dia = dia;
    b.eventos = lista.length;
    b.primeiro = lista[0].ts;
    b.ultimo = lista[lista.length - 1].ts;
    for (let i = 0; i < lista.length; i++) {
      const ev = lista[i];
      if (ev.tool) {
        const f = b._ferramentas[ev.tool] || (b._ferramentas[ev.tool] = { usos: 0, falhas: 0 });
        if (ev.event === 'PreToolUse') f.usos++; // 1 uso = 1 PreToolUse; o Post é o MESMO uso, não outro
        if (!ev.ok) f.falhas++;
      }
      if (!ev.ok) b.falhas++;
      const prox = lista[i + 1];
      if (!prox) { b.eventosSemIntervalo++; continue; }
      const gap = prox.t - ev.t;
      if (gap >= SILENCIO_MS) {
        b.silencioMs += gap;
        b._silencios.push({ de: ev.ts, ate: prox.ts, ms: gap });
        continue;
      }
      let estado = classificaEsforco(ev);
      if (estado === 'trabalhandoMs' && gap > OCIOSO_MS) estado = 'ociosoMs';
      b[estado] += gap;
    }
    const fechado = fechaBalde(b);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(fechado);

    const soma = porAgente.get(agente) || Object.assign(novoBalde(agente), { dias: 0 });
    soma.eventos += fechado.eventos;
    soma.trabalhandoMs += fechado.trabalhandoMs;
    soma.bloqueadoMs += fechado.bloqueadoMs;
    soma.esperandoDonoMs += fechado.esperandoDonoMs;
    soma.ociosoMs += fechado.ociosoMs;
    soma.silencioMs += fechado.silencioMs;
    soma.falhas += fechado.falhas;
    soma.eventosSemIntervalo += fechado.eventosSemIntervalo;
    soma.dias += 1;
    soma.primeiro = soma.primeiro && soma.primeiro < fechado.primeiro ? soma.primeiro : fechado.primeiro;
    soma.ultimo = soma.ultimo && soma.ultimo > fechado.ultimo ? soma.ultimo : fechado.ultimo;
    for (const f of fechado.ferramentas) {
      const alvo = soma._ferramentas[f.nome] || (soma._ferramentas[f.nome] = { usos: 0, falhas: 0 });
      alvo.usos += f.usos;
      alvo.falhas += f.falhas;
    }
    for (const s of fechado.silencios) soma._silencios.push(s);
    porAgente.set(agente, soma);
  }

  const dias = [...porDia.keys()].sort().reverse().map((dia) => {
    const agentes = porDia.get(dia).sort((a, b) => b.eventos - a.eventos);
    return {
      dia,
      eventos: agentes.reduce((n, a) => n + a.eventos, 0),
      primeiro: agentes.map((a) => a.primeiro).sort()[0] || null,
      ultimo: agentes.map((a) => a.ultimo).sort().reverse()[0] || null,
      agentes,
    };
  });

  const motivos = [];
  if (meta.cauda) motivos.push(`o arquivo passou de ${ESFORCO_TETO_BYTES} bytes e li só a cauda (últimos ${ESFORCO_TETO_BYTES} bytes)`);
  if (brutas.length >= ESFORCO_MAX_LINES_ON_BOOT) motivos.push(`o servidor trunca o arquivo em ${ESFORCO_MAX_LINES_ON_BOOT} linhas ao subir (MAX_LINES_ON_BOOT), e ele está com ${brutas.length}`);
  if (ilegiveis) motivos.push(`${ilegiveis} ${ilegiveis === 1 ? 'linha ilegível foi descartada' : 'linhas ilegíveis foram descartadas'}`);
  motivos.push('o hook só grava enquanto uma sessão do Claude Code está aberta neste repositório — hora sem evento não é hora parada, é hora não medida');

  return {
    linhas: brutas.length,
    ilegiveis,
    eventos: eventos.length,
    cauda: !!meta.cauda,
    parcial: true, // esta trilha NUNCA cobre o dia inteiro; a tela diz desde quando ela fala
    maxLinhasNoBoot: ESFORCO_MAX_LINES_ON_BOOT,
    cobertura: eventos.length
      ? { de: eventos[0].ts, ate: eventos[eventos.length - 1].ts, dias: dias.length }
      : { de: null, ate: null, dias: 0 },
    motivos,
    regra: {
      ociosoMs: OCIOSO_MS,
      silencioMs: SILENCIO_MS,
      semAgente: SEM_AGENTE,
      texto: 'cada evento abre um intervalo fechado pelo evento seguinte do mesmo agente no mesmo dia; o rótulo vem do evento que abre (Stop/SessionEnd/AskUserQuestion = esperando o dono; ok:false = bloqueado; o resto = trabalhando), e o tamanho corrige: acima de 3 min um "trabalhando" é ocioso, acima de 15 min sai da conta do dia e vira janela de silêncio.',
    },
    dias,
    porAgente: [...porAgente.values()].map(fechaBalde).sort((a, b) => b.eventos - a.eventos),
  };
}

/**
 * `hub/live/events.jsonl` → esforço por agente e por dia. Contrato dos novos:
 * pasta/arquivo ausente é `{ok:true,data:null}` (instalação nova não tem
 * `hub/live/` — gotcha 29), ilegível é `{ok:false,raw,erro}`, nunca lança.
 *
 * T2c (spec 2026-09-saas-e5-projecao): `origem` é injetada, como em todo
 * leitor daqui. `lerCauda` é o 5º método da interface, OPCIONAL — a origem de
 * disco tem (`hub/lib/origem-disco.js`); uma origem sem ele (a nuvem, por
 * exemplo) não tem como ler a cauda de um arquivo por offset de bytes. Nesse
 * caso NUNCA se lê disco por fora: degrada com `data:null` e um motivo
 * escrito — nunca "vazio" (que seria a mesma mentira que já custou caro:
 * ausência de fonte não é a mesma coisa que esforço zero).
 */
function readEsforco(root, origem = origemDisco) {
  const p = path.join(root, 'hub', 'live', 'events.jsonl');
  const arquivo = rel(root, p);
  if (typeof origem.lerCauda !== 'function') {
    return ok(null, { arquivo, motivo: 'esta seção não tem fonte na nuvem' });
  }
  const r = lerJsonl(origem, p);
  if (r.ausente) return ok(null, { arquivo });
  if (r.erro) return falha(r.erro, r.raw || '', { arquivo });
  try {
    return ok(parseEsforco(r.texto, r), { arquivo, bytes: r.bytes, mtime: r.mtime });
  } catch (e) {
    return falha(`parser falhou: ${(e && e.message) || e}`, r.texto, { arquivo });
  }
}

module.exports = {
  // extraídos do build (contrato antigo, preservado)
  parseFrontmatter, section, listItems, readAgent, parseCompanyState, parseIniciativa, readCompany, readTokens,
  blockerResolvido, pendenciasDoDono, gatesAbertos, compararNumeroDeLei, ordenaLeis,
  chaveOcorrencia, agrupaPendenciasPorFonte, filtraAdiadosPendencia,
  readGlossario,
  parseDecisions, readDecisions, CLASSIC_ORDER, listAgentDirs, RITUALS, ORIGINS,
  // camada segura
  MAX_BYTES, RAW_MAX, lerTexto, ler, lerPasta, parseSecoes, parseTabela,
  // novos (contrato {ok,data} | {ok:false,raw,erro})
  readStateMd, readTokensJson, readDecisionsMd, readFila, parseFila, readRoadmap, readPedidos,
  readBriefing, readRadar, readPlaybook, readMetricsMd, readCompanyDocs, readIncidents, readSpecs,
  readAgentDirs, readAgentSafe, readGotchas, parseGotchas, readFeedback, readInbox, readAgentDocs,
  // biblioteca do Arvys (spec 2026-09-biblioteca, T2)
  readBiblioteca, resolverPastaBiblioteca, divergenciasGlossario, slugAncora, parseSemver, compararSemver,
  BIBLIOTECA_CENARIOS, BIBLIOTECA_PERFIS, BIBLIOTECA_ROTA_GLOSSARIO,
  // esforço do escritório ao vivo (T11)
  readEsforco, parseEsforco, OCIOSO_MS, SILENCIO_MS, SEM_AGENTE,
  // spec 2026-09-saas-e5-projecao (T2b): `hub/lib/qg.js` reaproveita o MESMO
  // helper de tipo (pasta vs arquivo) — a interface da origem não carrega tipo
  // de propósito, e duas cópias de "como saber se é pasta" seriam duas verdades.
  ehPasta,
};
