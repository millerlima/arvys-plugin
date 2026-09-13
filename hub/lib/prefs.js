/**
 * hub/lib/prefs.js — as preferências de tela do DONO, em arquivo.
 *
 * Decisão G2 (2026-09-06, mesa do QG): preferência do dono pode virar arquivo
 * no repo, em vez de morrer no `localStorage` do navegador. O que ela destrava:
 * memória entre máquinas, e o SaaS herda de graça (o mesmo arquivo sobe no push).
 *
 * A REGRA, uma só e escrita aqui: **o arquivo ganha, o `localStorage` é cache.**
 * Divergência entre os dois é VISÍVEL na tela — nunca resolvida em silêncio, que
 * é a família de defeito que este escritório mais paga.
 *
 * O que este módulo NÃO faz: não escreve nada fora de `company/PREFERENCIAS.json`,
 * não guarda dado de trabalho (isso é registro, e registro se escreve no arquivo
 * do registro), não apaga arquivo que não entendeu.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO = ['company', 'PREFERENCIAS.json'];
const VERSAO = 1;

/** Só estas chaves são aceitas. Chave desconhecida é guardada, nunca aplicada.
 *  `notas` (spec 2026-09-qg-redesenho-2, T4a/Emenda 1): nota curta do dono por
 *  ocorrência de "Esperando você", chaveada por `pend:<fonte>:<hash>` (ver
 *  `hub/lib/readers.js#chaveOcorrencia`) — formato `{ texto, em, recado? }`,
 *  onde `recado` marca que um recado já foi enviado para aquela ocorrência. */
const CHAVES = ['visao', 'agrupa', 'props', 'colapso', 'ordem', 'notas'];

function caminho(root) {
  return path.join(root, ...ARQUIVO);
}

function vazio() {
  return { versao: VERSAO, atualizadoEm: null, qg: {} };
}

/**
 * Lê as preferências. Contrato dos leitores novos, igual ao resto do QG:
 *   { ok:true,  data }        — leu e entendeu
 *   { ok:true,  data:null }   — arquivo AUSENTE (vazio ≠ erro)
 *   { ok:false, raw, erro }   — existe e está torto: bruto recortado + motivo
 * NUNCA lança, e NUNCA reescreve o arquivo que não entendeu.
 */
function lerPrefs(root) {
  const f = caminho(root);
  let cru;
  try {
    if (!fs.existsSync(f)) return { ok: true, data: null };
    cru = fs.readFileSync(f, 'utf8');
  } catch (e) {
    return { ok: false, raw: '', erro: 'não consegui ler: ' + String(e && e.message) };
  }
  let obj;
  try {
    obj = JSON.parse(cru.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, raw: cru.slice(0, 400), erro: 'JSON inválido: ' + String(e && e.message) };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, raw: cru.slice(0, 400), erro: 'o arquivo não é um objeto' };
  }
  const v = Number(obj.versao);
  const qg = obj.qg && typeof obj.qg === 'object' && !Array.isArray(obj.qg) ? obj.qg : {};
  // Versao do FUTURO: nao e erro e nao se apaga. Aplica-se o que se entende e
  // avisa-se — quem escreveu pode ser uma versao mais nova do proprio QG.
  const futuro = v > VERSAO;
  const aplicavel = {};
  const ignoradas = [];
  for (const k of Object.keys(qg)) {
    if (CHAVES.indexOf(k) >= 0 && qg[k] && typeof qg[k] === 'object') aplicavel[k] = qg[k];
    else ignoradas.push(k);
  }
  return {
    ok: true,
    data: {
      versao: Number.isFinite(v) ? v : null,
      atualizadoEm: typeof obj.atualizadoEm === 'string' ? obj.atualizadoEm : null,
      qg: aplicavel,
      // o que este QG nao entende continua no arquivo e aparece aqui, nomeado
      ignoradas,
      deVersaoFutura: futuro,
    },
  };
}

/**
 * Grava. Mescla por chave (nao apaga o que este QG nao entende), escreve em
 * arquivo temporario e renomeia — leitor nunca ve meio arquivo.
 * Devolve { ok, erro? }. Erro e VISIVEL para quem chamou: nada de sucesso falso.
 */
function gravarPrefs(root, parcial) {
  if (!parcial || typeof parcial !== 'object' || Array.isArray(parcial)) {
    return { ok: false, erro: 'nada para gravar' };
  }
  const f = caminho(root);
  const atual = lerPrefs(root);
  // arquivo torto NAO e sobrescrito as cegas: quem grava tem de saber disso
  if (atual.ok === false) return { ok: false, erro: 'o arquivo atual está torto; não vou sobrescrever: ' + atual.erro };

  const base = atual.data || vazio();
  const bruto = (() => {
    try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : {}; }
    catch (e) { return {}; }
  })();
  const qgAntigo = (bruto && typeof bruto.qg === 'object' && bruto.qg) || {};

  const qg = Object.assign({}, qgAntigo);          // preserva chaves desconhecidas
  for (const k of Object.keys(parcial)) {
    if (CHAVES.indexOf(k) < 0) continue;            // chave fora da lista nao entra
    const v = parcial[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    // MESCLA por sub-chave — nao substitui o grupo inteiro.
    //
    // Precedente (reviewer do risco N3, 2026-09-06): `qg[k] = v` apagava toda
    // irma que nao viesse no POST. Tres sintomas, uma causa:
    //   1. o dono muda a coluna da tabela A e perde a preferencia da tabela B;
    //   2. dois POST quase simultaneos = lost update — a 2a resposta reverte a
    //      1a, porque o front monta o merge com um cache ainda velho;
    //   3. campo escrito por VERSAO FUTURA dentro de um grupo conhecido some,
    //      apesar de o modulo prometer "nao apago o que nao entendi".
    // O merge tem de acontecer AQUI, no servidor, sobre o que esta em disco
    // agora — nao no navegador, sobre um cache que pode estar atrasado.
    const antigoDoGrupo = (qgAntigo[k] && typeof qgAntigo[k] === 'object' && !Array.isArray(qgAntigo[k]))
      ? qgAntigo[k] : {};
    qg[k] = Object.assign({}, antigoDoGrupo, v);
  }

  const saida = {
    versao: VERSAO,
    atualizadoEm: new Date().toISOString(),
    // preserva o topo que nao e nosso (mesma logica das chaves de dentro)
    ...(bruto && typeof bruto === 'object' && !Array.isArray(bruto)
      ? Object.keys(bruto).reduce((a, k) => (k === 'versao' || k === 'atualizadoEm' || k === 'qg' ? a : (a[k] = bruto[k], a)), {})
      : {}),
    qg,
  };

  const tmp = f + '.tmp';
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(saida, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, f);                          // atomico no mesmo volume
    return { ok: true, atualizadoEm: saida.atualizadoEm, base: base.versao };
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (err) { /* nada */ }
    return { ok: false, erro: String(e && e.message) };
  }
}

module.exports = { lerPrefs, gravarPrefs, CHAVES, VERSAO, ARQUIVO };
