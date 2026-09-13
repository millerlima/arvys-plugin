/**
 * hub/lib/qg.js — agregador do `/api/qg` (spec 2026-09-qg-plataforma, T3).
 *
 * Monta o JSON que a plataforma (`hub/app/`) renderiza, a partir dos leitores
 * de `hub/lib/readers.js` e dos números de `hub/metrics.js`. Nada aqui lê
 * arquivo direto nem calcula métrica: só junta.
 *
 * Forma da resposta de `/api/qg` (chaves de topo):
 *   ok · geradoEm · cached · duracaoMs · raiz · secoes[] · pesadas{} ·
 *   metricas · inicio · agentes · trabalho · decisoes · cota · radar · leis · biblioteca
 *
 * Seções PESADAS (`decisoes`, `fila`, `pedidos` — 105KB + 65KB + 30KB de
 * markdown) NÃO viajam no agregado: lá vai só o resumo (`ok`, totais, `rota`);
 * o corpo sai por `/api/qg/<secao>` quando a seção abre (R4).
 *
 * Cache por mtime (R4): a cada pedido, `statSync` de todo arquivo/pasta que o
 * agregado lê vira um carimbo (`caminho|mtimeMs|size` por linha). Carimbo
 * igual ao da última montagem → devolve a montagem anterior com
 * `cached:true`, sem abrir um arquivo sequer. Qualquer arquivo tocado, criado
 * ou apagado muda o carimbo e força a remontagem. Seções pesadas têm carimbo
 * próprio (só o seu arquivo).
 */
'use strict';

const path = require('path');
const R = require('./readers');
const M = require('../metrics');
const origemDisco = require('./origem-disco');

// spec 2026-09-saas-e5-projecao (T2 / decisão D-E5-2): o agregado passa a
// receber DE ONDE ler (a mesma origem injetada de `hub/lib/readers.js`).
// `origemDisco` continua sendo o padrão — na nuvem (T3) `hub/serve.js` injeta
// outra. O CARIMBO de cache (`carimboDe`) já vinha de `origem.estado()` desde
// a T2 (hoje `caminho|mtimeMs|size`; na nuvem pode virar o `push_id`).
//
// T2b (fecha a lacuna que a T3 achou): `vigiados`/`ls`, `ultimaMudanca` e
// `escritorio.disponivel` TAMBÉM passam a vir da origem injetada — nenhum
// ponto deste arquivo chama `fs` direto mais. Para saber se um nome é pasta ou
// arquivo (o `fs.Dirent.isDirectory()`/`isFile()` de antes) sem uma 5ª função
// na interface da origem (que de propósito não carrega tipo — uma origem de
// nuvem pode nem ter o conceito de "pasta"), reaproveita `R.ehPasta()`: a
// MESMA solução que a T2 já usa em `hub/lib/readers.js` (tenta
// `origem.listar(caminho)` — pasta lista, arquivo não). Duas cópias desse
// helper seriam duas verdades sobre "o que é pasta". Ver a nota "achados" da
// evidência da T2 e da T2b.

const SECOES = ['inicio', 'agentes', 'trabalho', 'decisoes', 'fila', 'pedidos', 'cota', 'radar', 'leis', 'biblioteca'];
const PESADAS = {
  decisoes: { arquivo: ['company', 'DECISIONS.md'], ler: (root, origem) => R.readDecisionsMd(root, origem) },
  fila: { arquivo: ['company', 'FILA.md'], ler: (root, origem) => R.readFila(root, origem) },
  pedidos: { arquivo: ['company', 'PEDIDOS-DO-DONO.md'], ler: (root, origem) => R.readPedidos(root, origem) },
};
const COMPANY_FILES = [
  'STATE.md', 'BRIEFING.md', 'DECISIONS.md', 'FILA.md', 'ROADMAP.md', 'PEDIDOS-DO-DONO.md', 'RADAR.json',
  'RADAR-CURADO.md', 'PLAYBOOK.md', 'METRICS.md', 'TOKENS.json', 'OFFICE-METRICS.json', 'ANTES-DE-PUBLICAR.md',
];
const AGENT_FILES = ['AGENT.md', 'STATE.md', 'GOTCHAS.md', 'FEEDBACK.md', 'INBOX.md', 'FPY.md'];
const AGENT_DIRS = ['playbooks', 'pesquisas', 'drafts', 'autopsias'];

/** Nomes de uma pasta, pela origem — nunca lança (ausente ou erro de disco viram `[]`). */
function ls(dir, origem = origemDisco) {
  try {
    return origem.listar(dir) || [];
  } catch (e) {
    return [];
  }
}

/** Tudo que o agregado lê — arquivos E pastas (pasta muda de mtime ao ganhar/perder filho). */
function vigiados(root, origem = origemDisco) {
  const out = [path.join(root, 'company'), path.join(root, 'agents'), path.join(root, 'specs'), path.join(root, 'incidents')];
  for (const f of COMPANY_FILES) out.push(path.join(root, 'company', f));
  for (const nome of ls(path.join(root, 'company'), origem)) {
    const p = path.join(root, 'company', nome);
    if (!R.ehPasta(origem, p) && /^MANDATO-NOTURNO-.*\.md$/.test(nome)) out.push(p);
  }
  for (const nome of ls(path.join(root, 'agents'), origem)) {
    const base = path.join(root, 'agents', nome);
    if (!R.ehPasta(origem, base)) continue;
    out.push(base);
    for (const f of AGENT_FILES) out.push(path.join(base, f));
    for (const d of AGENT_DIRS) {
      const p = path.join(base, d);
      out.push(p);
      for (const nomeFilho of ls(p, origem)) {
        const pf = path.join(p, nomeFilho);
        if (!R.ehPasta(origem, pf)) out.push(pf);
      }
    }
  }
  for (const nome of ls(path.join(root, 'specs'), origem)) {
    if (/^_/.test(nome)) continue;
    const base = path.join(root, 'specs', nome);
    if (!R.ehPasta(origem, base)) continue;
    out.push(base, path.join(base, 'spec.md'), path.join(base, 'tasks.md'), path.join(base, 'plan.md'), path.join(base, 'evidence'));
  }
  for (const nome of ls(path.join(root, 'incidents'), origem)) {
    const p = path.join(root, 'incidents', nome);
    if (!R.ehPasta(origem, p)) out.push(p);
  }
  // R4-a (review T8): `hub/live/events.jsonl` NÃO entra aqui. Ele muda a cada
  // ferramenta que qualquer sessão roda, então tê-lo no carimbo global fazia o
  // cache de `/api/qg` só valer com o escritório PARADO (73ms → 6ms → 41ms na
  // medição do reviewer). Ele tem carimbo próprio, em `esforcoAtual()`: o
  // esforço continua fresco a cada pedido e as outras 8 seções ficam no cache.
  // T7/R3: `escritorio.disponivel` sai daqui — sem isto, instalar o `/live`
  // depois do boot não invalidaria o cache e a tela seguiria dizendo que não há.
  out.push(path.join(root, 'hub', 'live', 'office.html'));
  // spec 2026-09-biblioteca (T3): capítulo editado no repo de dev tem de
  // invalidar o cache do agregado. Só a pasta do root entra no carimbo — a do
  // cache do plugin muda só com `claude plugin update`, que reinicia o QG.
  const biblioteca = path.join(root, 'plugin', 'biblioteca');
  out.push(biblioteca);
  for (const nome of ls(biblioteca, origem)) {
    const p = path.join(biblioteca, nome);
    if (!R.ehPasta(origem, p)) out.push(p);
  }
  return out;
}

/**
 * O carimbo de cache: hoje `caminho|mtimeMs|size`, de `origem.estado()` — na
 * nuvem, o mesmo formato pode virar `caminho|push_id` (T3). `origem` é
 * opcional (padrão `origemDisco`) para não quebrar quem já chamava isto só
 * com `paths`.
 */
function carimboDe(paths, origem = origemDisco) {
  const linhas = [];
  for (const p of paths) {
    let st;
    try {
      st = origem.estado(p);
    } catch (e) {
      st = null;
    }
    linhas.push(st ? `${p}|${st.mtimeMs}|${st.size}` : `${p}|x`);
  }
  return linhas.join('\n');
}

/**
 * spec 2026-09-qg-tres-perguntas (T3.2): o instante em que o escritorio mudou
 * pela ultima vez — o maior mtime entre os arquivos que o QG le. E com ele que
 * a tela decide se uma MEDICAO (briefing, saude, achado do Pulse) ainda vale ou
 * ja envelheceu. Sem isto, "5 achados" fica no ar 12 horas depois de virar 2.
 */
function ultimaMudanca(paths, origem = origemDisco) {
  let max = 0;
  let maxArq = 0;
  let ondeArq = null;
  for (const p of paths) {
    let st;
    try {
      st = origem.estado(p);
    } catch (e) {
      st = null;
    }
    if (!st) continue; // ausente nao conta
    if (st.mtimeMs > max) max = st.mtimeMs;
    // O INSTANTE vem de qualquer caminho (pasta inclusive: ela muda ao ganhar
    // ou perder filho). Mas o NOME que a tela mostra tem de ser de um ARQUIVO:
    // "company/PREFERENCIAS.json" diz o que aconteceu; "company" não diz nada.
    // `ehPasta` só é chamado quando este mtime já é o novo maior candidato —
    // evita um `listar()` extra por caminho vigiado.
    if (st.mtimeMs > maxArq && !R.ehPasta(origem, p)) { maxArq = st.mtimeMs; ondeArq = p; }
  }
  if (!max) return { em: null, arquivo: null };
  return { em: new Date(max).toISOString(), arquivo: ondeArq };
}

function resumoDecisoes(r) {
  if (!r.ok) return { ok: false, erro: r.erro, arquivo: r.arquivo, rota: '/api/qg/decisoes' };
  if (r.data === null) return { ok: true, total: 0, ausente: true, arquivo: r.arquivo, rota: '/api/qg/decisoes' };
  const e = r.data.entradas;
  const porDia = {};
  for (const d of e) porDia[d.date] = (porDia[d.date] || 0) + 1;
  return {
    ok: true, total: e.length, arquivo: r.arquivo, bytes: r.bytes, mtime: r.mtime,
    // o arquivo é cronológico: a última decisão é a última entrada
    ultima: e.length ? { date: e[e.length - 1].date, title: e[e.length - 1].title } : null,
    dias: Object.keys(porDia).length,
    rota: '/api/qg/decisoes',
  };
}
function resumoFila(r) {
  if (!r.ok) return { ok: false, erro: r.erro, arquivo: r.arquivo, rota: '/api/qg/fila' };
  if (r.data === null) return { ok: true, total: 0, ausente: true, arquivo: r.arquivo, rota: '/api/qg/fila' };
  // spec 2026-09-qg-tres-perguntas (T3.1): o que ESPERA O DONO viaja no
  // agregado, nao na rota pesada. Sao 0-3 itens de poucas dezenas de bytes, e
  // sem eles o Inicio e a fila responderiam coisas diferentes sobre a MESMA
  // pergunta — que e o defeito que esta spec existe para matar.
  const esperaDono = (r.data.itens || [])
    .filter((i) => i.esperaDono && !i.esperaConflito)
    .map((i) => ({ numero: i.numero, titulo: i.titulo, desde: i.esperaDesde || null }));
  const esperaConflito = (r.data.itens || [])
    .filter((i) => i.esperaConflito)
    .map((i) => ({ numero: i.numero, titulo: i.titulo, status: i.esperaConflito }));
  return {
    ok: true,
    total: r.data.total,
    porStatus: r.data.porStatus,
    esperandoDono: r.data.esperandoDono || 0,
    esperaContraditoria: r.data.esperaContraditoria || 0,
    esperaDono, esperaConflito,
    arquivo: r.arquivo, bytes: r.bytes, mtime: r.mtime, rota: '/api/qg/fila',
  };
}
function resumoPedidos(r) {
  if (!r.ok) return { ok: false, erro: r.erro, arquivo: r.arquivo, rota: '/api/qg/pedidos' };
  if (r.data === null) return { ok: true, placar: null, ausente: true, arquivo: r.arquivo, rota: '/api/qg/pedidos' };
  return { ok: true, placar: r.data.placar, secoes: r.data.secoes.length, arquivo: r.arquivo, bytes: r.bytes, mtime: r.mtime, rota: '/api/qg/pedidos' };
}

function novo(root, origem = origemDisco) {
  const agentsDir = path.join(root, 'agents');
  const cache = { agregado: null, pesadas: {}, esforco: null };

  /**
   * R4-a: esforço com carimbo próprio (só `events.jsonl`), no padrão das
   * PESADAS. Sessão ativa reconstrói ISTO a cada pedido — 1 arquivo — em vez
   * do agregado inteiro (9 seções, ~260 arquivos).
   */
  function esforcoAtual() {
    const carimbo = carimboDe([path.join(root, 'hub', 'live', 'events.jsonl')], origem);
    const hit = cache.esforco;
    if (hit && hit.carimbo === carimbo) return { valor: hit.valor, cached: true };
    const valor = R.readEsforco(root, origem);
    cache.esforco = { carimbo, valor };
    return { valor, cached: false };
  }

  /** Seção pesada, com cache só do seu arquivo. */
  function pesada(nome) {
    const def = PESADAS[nome];
    const carimbo = carimboDe([path.join(root, ...def.arquivo)], origem);
    const hit = cache.pesadas[nome];
    if (hit && hit.carimbo === carimbo) return { valor: hit.valor, cached: true };
    const valor = def.ler(root, origem);
    cache.pesadas[nome] = { carimbo, valor };
    return { valor, cached: false };
  }

  function montar() {
    const m = M.loadMetrics(origem, root);
    const metricas = m.ok
      ? { indisponivel: null, geradoEm: m.generatedAt, comoGerar: M.COMO_GERAR }
      : { indisponivel: { motivo: m.motivo, comoGerar: m.comoGerar }, geradoEm: null, comoGerar: M.COMO_GERAR };
    const inventario = m.ok ? M.specsDoInventario(m) : null;
    const idades = m.ok ? M.idadeDoL1PorAgente(m) : {};

    // ---- agentes ----
    const dirs = R.readAgentDirs(agentsDir, root, origem);
    const agentes = (dirs.ok && Array.isArray(dirs.data) ? dirs.data : []).map((dir) => {
      const cartao = R.readAgentSafe(dir, { agentsDir, metrics: m, root }, origem);
      const c = cartao.ok && cartao.data ? cartao.data : null;
      const ativas = m.ok && m.data.metricas.placarDeSpecs && m.data.metricas.placarDeSpecs.ativasPorAgente
        ? m.data.metricas.placarDeSpecs.ativasPorAgente[dir] || []
        : [];
      return {
        dir,
        cartao: c ? { ok: true } : { ok: cartao.ok, erro: cartao.erro || null, raw: cartao.raw || null },
        meta: c ? c.meta : {},
        l1: c ? c.l1 : null,
        owns: c ? c.owns : [],
        defers: c ? c.defers : [],
        inProgress: c ? c.inProgress : [],
        gotchasCount: c ? c.gotchasCount : null,
        idadeL1Dias: dir in idades ? idades[dir] : null,
        specsAtivas: inventario ? inventario.filter((s) => ativas.includes(s.slug)) : [],
        boletim: M.boletimPorAgente(m, dir),
        feedback: R.readFeedback(agentsDir, dir, root, origem),
        inbox: R.readInbox(agentsDir, dir, root, origem),
        gotchas: R.readGotchas(agentsDir, dir, root, origem),
        docs: R.readAgentDocs(agentsDir, dir, root, origem),
      };
    });

    // ---- pesadas (só o resumo viaja aqui) ----
    const dec = pesada('decisoes').valor;
    const fila = pesada('fila').valor;
    const ped = pesada('pedidos').valor;

    const estado = R.readStateMd(root, origem);
    const incidentes = R.readIncidents(root, origem);
    const specs = R.readSpecs(root, origem);

    // Gates AO VIVO, do frontmatter das specs — a metrica da madrugada
    // (`specsEmGate`) e retrato de ate 24 h e mentia no Inicio ("a spec E9
    // espera seu gate" horas depois do "Sim" do dono). Conferencia da T1 da
    // spec 2026-09-qg-redesenho-2.
    const gates = R.gatesAbertos(specs);

    const radar = R.readRadar(root, origem);
    const filaResumo = resumoFila(fila);
    // spec 2026-09-qg-redesenho-2 (T1, critério 2): A FONTE UNICA do "o que
    // espera por mim" — o selo do menu, o bloco "Esperando você" do Início e o
    // grupo "Esperando você" de Trabalho consomem TODOS este mesmo campo, em
    // vez de tres contas diferentes (o defeito que a spec existe para matar).
    const pendencias = R.pendenciasDoDono({
      inicio: { estado, gates },
      trabalho: { fila: filaResumo },
      radar,
    });

    return {
      ok: true,
      geradoEm: new Date().toISOString(),
      // T3.2: quando o escritorio mudou pela ultima vez. A tela compara CADA
      // medicao com isto — medicao anterior a mudanca e medicao velha, e a tela
      // diz isso em vez de deixar o numero errado no ar.
      ultimaMudanca: ultimaMudanca(vigiados(root, origem), origem),
      raiz: root,
      secoes: SECOES,
      pesadas: Object.fromEntries(Object.keys(PESADAS).map((k) => [k, `/api/qg/${k}`])),
      metricas,
      inicio: {
        estado,
        briefing: R.readBriefing(root, origem),
        gates,
        pendencias,
        saude: {
          specs: inventario
            ? { total: inventario.length, prontas: inventario.filter((s) => s.categoria === 'pronta').length, placar: m.data.metricas.placarDeSpecs || null }
            : null,
          incidentes: {
            total: incidentes.ok && incidentes.data ? incidentes.data.total : null,
            abertos: incidentes.ok && incidentes.data ? incidentes.data.abertos : null,
            ultimo: m.ok && m.data.metricas.aprendizado && m.data.metricas.aprendizado.incidentes ? m.data.metricas.aprendizado.incidentes.ultimo || null : null,
          },
          agentes: agentes.length,
          decisoes: dec.ok && dec.data ? dec.data.total : null,
        },
      },
      agentes,
      // T7/R3: numa instalacao nova `hub/live/` nao existe (gotcha 29) e o
      // `/live` cai num placeholder antigo. O front precisa SABER disso para
      // mostrar o vazio explicado em vez de embutir o placeholder num iframe.
      escritorio: {
        disponivel: origem.existe(path.join(root, 'hub', 'live', 'office.html')),
        arquivo: 'hub/live/office.html',
      },
      fpyExterno: M.fpyExternoGlobal(m),
      trabalho: {
        fila: filaResumo,
        roadmap: R.readRoadmap(root, origem),
        pedidos: resumoPedidos(ped),
        specs,
        inventario,
      },
      decisoes: resumoDecisoes(dec),
      cota: {
        tokens: R.readTokensJson(root, origem),
        metricsMd: R.readMetricsMd(root, origem),
        // T11 (EMENDA 1 · E2): esforço medido pela trilha do escritório ao vivo.
        // Mora aqui para a seção Cota mostrar esforço AO LADO de custo; a ficha
        // do agente recorta o mesmo objeto (uma leitura, um lugar).
        esforco: esforcoAtual().valor,
      },
      radar,
      leis: {
        rituais: R.RITUALS.map(([comando, descricao]) => ({ comando, descricao })),
        playbook: R.readPlaybook(root, origem),
        incidentes,
        gotchas: { porAgente: Object.fromEntries(agentes.map((a) => [a.dir, a.gotchas.ok && a.gotchas.data ? a.gotchas.data.total : null])) },
      },
      biblioteca: {
        // spec 2026-09-biblioteca (T3): o manual do plugin, lido por
        // `readBiblioteca` — `<root>/plugin/biblioteca` ou a maior versão no
        // cache do Claude Code. Sem pasta é `{ok:false, erro}` VISÍVEL (R1),
        // nunca o cartão "não foi escrito" de volta: `emConstrucao` e `ponte`
        // saíram junto com ele.
        manual: R.readBiblioteca(root, origem),
        origem: R.ORIGINS.map(([nome, descricao]) => ({ nome, descricao })),
        documentos: R.readCompanyDocs(root, origem),
        // T7 (decisao G3): o vocabulario sai do codigo e vira arquivo. E daqui
        // que sai a traducao `en` congelada que o SaaS herda.
        glossario: R.readGlossario(root, origem),
      },
    };
  }

  /** `/api/qg` — o agregado, do cache quando nenhum arquivo vigiado mudou. */
  function agregado() {
    const t0 = process.hrtime.bigint();
    const carimbo = carimboDe(vigiados(root, origem), origem);
    let cached = true;
    if (!cache.agregado || cache.agregado.carimbo !== carimbo) {
      cache.agregado = { carimbo, valor: montar(), vigiados: carimbo.split('\n').length };
      cached = false;
    }
    // R4-a: o esforço vem do carimbo dele, SEMPRE — inclusive quando o resto
    // veio do cache. Assim o agregado não serve esforço velho sem pagar a
    // remontagem das outras 8 seções. `cached` continua descrevendo o agregado;
    // `esforcoCached` diz, separado, se o esforço também veio de cache.
    const esf = esforcoAtual();
    const base = cache.agregado.valor;
    const valor = esf.cached ? base : { ...base, cota: { ...base.cota, esforco: esf.valor } };
    if (!esf.cached) cache.agregado.valor = valor;
    const duracaoMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
    return { ...valor, cached, duracaoMs, esforcoCached: esf.cached, vigiados: cache.agregado.vigiados };
  }

  /** `/api/qg/<secao>` — pesada com cache próprio; leve recortada do agregado. `null` = desconhecida. */
  function secao(nome) {
    if (!SECOES.includes(nome)) return null;
    const t0 = process.hrtime.bigint();
    if (PESADAS[nome]) {
      const { valor, cached } = pesada(nome);
      const duracaoMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      return { ok: true, secao: nome, cached, duracaoMs, geradoEm: new Date().toISOString(), [nome]: valor };
    }
    const a = agregado();
    return { ok: true, secao: nome, cached: a.cached, duracaoMs: a.duracaoMs, geradoEm: a.geradoEm, [nome]: a[nome] };
  }

  return { agregado, secao, SECOES, PESADAS: Object.keys(PESADAS) };
}

module.exports = { novo, SECOES, vigiados, carimboDe, ultimaMudanca };
