/**
 * hub/lib/origem-disco.js — a origem de disco.
 *
 * Spec 2026-09-saas-e5-projecao (T2 / decisão D-E5-2, já aprovada pelo dono):
 * o QG lê arquivos do disco hoje; na nuvem os mesmos leitores (`hub/lib/readers.js`,
 * `hub/lib/qg.js`) vão receber os MESMOS bytes de um lugar diferente. Em vez de
 * reescrever os leitores (duas verdades), eles passam a receber DE ONDE ler —
 * uma "origem" injetada. Esta é a origem de disco: reproduz EXATAMENTE o
 * comportamento que os leitores sempre tiveram chamando `fs`/`path` direto, e
 * é a origem PADRÃO — quando ninguém injeta nada, é esta quem responde.
 *
 * Contrato mínimo (as 4 funções, nem uma a mais):
 *   lerTexto(caminho) -> string | null
 *   existe(caminho)   -> boolean
 *   listar(pasta)     -> string[] | null
 *   estado(caminho)   -> { mtimeMs, size } | null
 *
 * `null` é sempre "ausente" (ENOENT) — nunca erro. Qualquer outro defeito
 * (pasta no lugar de arquivo, UTF-8 inválido, permissão negada, caminho que
 * não é pasta) LANÇA: quem decide como isso vira `{ok:false,raw,erro}` é o
 * leitor (`hub/lib/readers.js`), não a origem. A origem só busca bytes — não
 * aplica MAX_BYTES nem corta RAW_MAX; essa é política de leitura, e viver
 * aqui obrigaria uma origem remota a baixar o arquivo só para descartá-lo.
 *
 * `lerTexto` decodifica com o MESMO rigor de sempre (`TextDecoder` com
 * `fatal:true`): UTF-8 inválido lança, e o erro carrega `.origemErro='utf8'`
 * mais um `.raw` (o mesmo arquivo decodificado SEM rigor, só para quem quer
 * mostrar um pedaço na tela) — o corte para RAW_MAX continua acontecendo no
 * leitor, como sempre aconteceu (`recorte()` em `hub/lib/readers.js`).
 */
'use strict';

const fs = require('fs');

const DECODER = new TextDecoder('utf-8', { fatal: true });

function existe(caminho) {
  return fs.existsSync(caminho);
}

function estado(caminho) {
  try {
    const st = fs.statSync(caminho);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

function listar(pasta) {
  try {
    return fs.readdirSync(pasta);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

function lerTexto(caminho) {
  let st, buf;
  try {
    st = fs.statSync(caminho);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  if (st.isDirectory()) {
    const e = new Error('é uma pasta, não um arquivo');
    e.origemErro = 'pasta';
    throw e;
  }
  buf = fs.readFileSync(caminho);
  try {
    return DECODER.decode(buf);
  } catch (e) {
    const err = new Error('bytes inválidos em UTF-8');
    err.origemErro = 'utf8';
    err.raw = buf.toString('utf8'); // leniente — só para preview, nunca para validar
    throw err;
  }
}

/**
 * spec 2026-09-saas-e5-projecao (T2c): 5º método da interface, OPCIONAL —
 * `typeof origem.lerCauda !== 'function'` é uma origem válida (a T2 recusou
 * inventar isto sem caso concreto; agora duas tarefas bateram no mesmo ponto
 * — ver `hub/lib/readers.js:readEsforco` — e o caso ficou concreto).
 *
 * Reproduz EXATAMENTE a lógica que `hub/lib/readers.js:lerJsonl` sempre teve
 * (`openSync`/`readSync` num offset de bytes, o corte que já existia): arquivo
 * que cabe em `maxBytes` volta inteiro; acima disso, só os últimos `maxBytes`
 * bytes — nunca o arquivo inteiro na memória. Decodifica leniente
 * (`toString('utf8')`, igual a `fs.readFileSync(p,'utf8')` de sempre) — NUNCA
 * o `TextDecoder` fatal de `lerTexto` acima, que é rigor de outro leitor
 * (markdown/JSON pequenos); `events.jsonl` já tolerava byte cortado no meio de
 * um caractere multibyte (a 1ª linha da cauda vem cortada de qualquer jeito, e
 * quem descarta essa linha é `lerJsonl`, não esta função).
 *
 * `null` = ausente (ENOENT), como `lerTexto`. Lança com `.origemErro='pasta'`
 * se `caminho` for pasta — mesma convenção.
 *
 * Achado (T2c): o `lerJsonl` original usava DOIS números — um teto de 8MB
 * para decidir se lia a cauda, e um tamanho de cauda de 4MB para o quanto ler.
 * A interface de 5 campos manda um `maxBytes` só; esta função usa o MESMO
 * valor para as duas coisas (arquivo ≤ maxBytes lê inteiro; acima disso lê os
 * últimos maxBytes bytes). Isso só muda comportamento para um arquivo entre
 * 4MB e 8MB — faixa que `hub/live/events.jsonl` nunca alcança no escritório
 * real (o hook rotaciona em 5MB, mas o teto agora é passado pelo chamador).
 * Ver "achados não consertados" na evidência da T2c.
 */
function lerCauda(caminho, maxBytes) {
  let st;
  try {
    st = fs.statSync(caminho);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  if (st.isDirectory()) {
    const e = new Error('é uma pasta, não um arquivo');
    e.origemErro = 'pasta';
    throw e;
  }
  if (st.size <= maxBytes) {
    return { texto: fs.readFileSync(caminho, 'utf8'), cauda: false, bytes: st.size, mtime: st.mtime.toISOString() };
  }
  const fd = fs.openSync(caminho, 'r');
  let texto;
  try {
    const buf = Buffer.alloc(maxBytes);
    const lidos = fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
    texto = buf.subarray(0, lidos).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  return { texto, cauda: true, bytes: st.size, mtime: st.mtime.toISOString() };
}

module.exports = { existe, estado, listar, lerTexto, lerCauda };
