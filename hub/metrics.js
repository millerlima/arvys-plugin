/**
 * hub/metrics.js — porta de entrada ÚNICA dos números do escritório.
 *
 * O painel não calcula métrica. Ele lê `company/OFFICE-METRICS.json`, gerado
 * pelo worker `workers/office-metrics.js`. Se você está prestes a escrever aqui
 * (ou em build.js / serve.js) um `readdirSync('specs')`, um `parseFrontmatter`
 * de spec, uma contagem de `incidents/` ou um `git log` para datar arquivo:
 * PARE. Esse número pertence ao worker. Duas telas com a mesma conta calculada
 * de dois jeitos foi o defeito que esta camada existe para impedir
 * (spec `2026-09-office-metrics`; gotcha nº 4 do Forge).
 *
 * Ausência do arquivo NÃO é erro: é estado vazio explícito. O painel mostra
 * como gerá-lo. Nunca zero fingindo ser medição.
 */

'use strict';

const path = require('path');
const origemDisco = require('./lib/origem-disco');

const ROOT = path.join(__dirname, '..');

/**
 * O caminho das métricas, resolvido a partir da raiz de QUEM CHAMA.
 *
 * Era `path.join(ROOT, …)`, com `ROOT` derivado de `__dirname` — e isso furou
 * em produção (E5, achado do dono na tela, 2026-09-08). A T2c trocou o LEITOR
 * (passou a receber a origem) mas não a RESOLUÇÃO do caminho: na nuvem este
 * arquivo vive em `vendor/hub/`, então `__dirname/..` aponta para `vendor/`, e
 * ele procurava `vendor/company/OFFICE-METRICS.json`. A origem de blob não tem
 * essa chave — o mapa do push guarda `company/OFFICE-METRICS.json` —, devolveu
 * `null`, e a chave `metricas` do `/api/qg` saiu como *"ainda não foi gerado"*
 * com o arquivo de 38.655 bytes guardado no banco a um passo dali.
 *
 * Nenhum sensor pegou porque todos rodam no repo do escritório, onde
 * `__dirname/..` por acaso é a raiz certa. Todos os outros leitores recebem a
 * raiz de fora (`def.ler(root, origem)`); este era o único que inventava a
 * sua. Agora recebe também, com `ROOT` de padrão — nenhum chamador de hoje
 * muda.
 */
function caminhoDasMetricas(root = ROOT) {
  return path.join(root, 'company', 'OFFICE-METRICS.json');
}

const COMO_GERAR = 'node workers/office-metrics.js';

/**
 * spec 2026-09-saas-e5-projecao (T2c): a origem é injetada, como em todo
 * leitor de `hub/lib/readers.js` — `origemDisco` é o padrão (ninguém que já
 * chama `loadMetrics()` sem argumento quebra). O CAMINHO lido continua sendo
 * `company/OFFICE-METRICS.json`; muda só QUEM lê. `origem.lerTexto` devolve
 * `null` para ausente (nunca lança por isso) e lança para qualquer outro
 * defeito de leitura — as duas ramificações abaixo reproduzem exatamente as
 * mensagens de antes.
 *
 * @returns {{ok: true, data: object, generatedAt: string}}
 *        | {ok: false, motivo: string, comoGerar: string}
 */
function loadMetrics(origem = origemDisco, root = ROOT) {
  let bruto;
  try {
    bruto = origem.lerTexto(caminhoDasMetricas(root));
  } catch (e) {
    return {
      ok: false,
      motivo: `não consegui ler company/OFFICE-METRICS.json: ${(e && e.message) || e}`,
      comoGerar: COMO_GERAR,
    };
  }
  if (bruto === null) {
    return {
      ok: false,
      motivo: 'company/OFFICE-METRICS.json ainda não foi gerado',
      comoGerar: COMO_GERAR,
    };
  }

  let data;
  try {
    data = JSON.parse(bruto);
  } catch (e) {
    return {
      ok: false,
      motivo: `company/OFFICE-METRICS.json está corrompido: ${e.message}`,
      comoGerar: COMO_GERAR,
    };
  }

  if (!data || !data.metricas || !data.inventario || !Array.isArray(data.inventario.specs)) {
    return {
      ok: false,
      motivo: 'company/OFFICE-METRICS.json está incompleto (falta `metricas` ou `inventario.specs`)',
      comoGerar: COMO_GERAR,
    };
  }

  return { ok: true, data, generatedAt: data.generatedAt || null };
}

/** Dias inteiros entre uma data ISO e agora. `null` entra, `null` sai. */
function diasDesde(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Specs do inventário, na forma que o painel consome. */
function specsDoInventario(m) {
  return m.data.inventario.specs.map((s) => ({
    slug: s.pasta,
    dir: s.pasta,
    title: s.titulo,
    status: s.status,
    categoria: s.categoria, // classificação canônica — nunca reclassificar aqui
    owner: s.owner || '',
    hasCheckpoint: s.temCheckpoint,
    hasEvidence: s.temEvidencia,
    ageDays: diasDesde(s.ultimoCommit),
  }));
}

/** Idade do [L1] por agente, em dias. `null` = ainda sem commit. */
function idadeDoL1PorAgente(m) {
  const out = {};
  for (const a of m.data.metricas.idadeDoL1) out[a.agente] = diasDesde(a.ultimoCommit);
  return out;
}

/**
 * Boletim do agente (spec `2026-09-boletim-agente`): as 6 linhas cruas de
 * `metricas.boletim.porAgente[dir]`, mais o first-pass yield (razão, nunca
 * média entre linhas — R5). `null` quando o JSON não tem `metricas.boletim`
 * (instância antiga do worker) ou quando `dir` não tem cartão nenhum — quem
 * chama (hub/build.js) então simplesmente não desenha o cartão, sem erro.
 * Nenhum cálculo novo aqui: leitura pura, mesma régua do resto do arquivo.
 */
function boletimPorAgente(m, dir) {
  if (!m.ok) return null;
  const boletim = m.data.metricas && m.data.metricas.boletim;
  if (!boletim || !boletim.porAgente || !boletim.porAgente[dir]) return null;
  return {
    atribuicao: boletim.atribuicao || null,
    linhas: boletim.porAgente[dir],
    fpy: (boletim.fpy && boletim.fpy.porAgente && boletim.fpy.porAgente[dir]) || null,
  };
}

/**
 * FPY externo GLOBAL (régua dupla, P7 — `specs/2026-09-fpy-molde/`):
 * `metricas.boletim.fpy.externo`, já calculado pelo worker (entregas sem
 * incidente nem "ajustar" no gate ÷ total). `null` em instância antiga do
 * JSON, de antes da P7. Nunca combinado com o FPY interno por agente —
 * quem chama desenha 1 linha só, fora dos cartões (R7 do reviewer,
 * `evidence/T8.md`: um painel que mostrasse os dois lado a lado convidaria
 * a média).
 */
function fpyExternoGlobal(m) {
  if (!m.ok) return null;
  const fpy = m.data.metricas && m.data.metricas.boletim && m.data.metricas.boletim.fpy;
  return (fpy && fpy.externo) || null;
}

module.exports = {
  loadMetrics,
  diasDesde,
  specsDoInventario,
  idadeDoL1PorAgente,
  boletimPorAgente,
  fpyExternoGlobal,
  COMO_GERAR,
  caminhoDasMetricas,
  /** @deprecated resolve pela raiz DESTE arquivo; use `caminhoDasMetricas(root)` */
  METRICS_PATH: caminhoDasMetricas(),
};
