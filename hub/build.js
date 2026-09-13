#!/usr/bin/env node
/**
 * hub/build.js — gera hub/index.html a partir de agents/* (arquivo = fonte de verdade).
 * Zero dependências. Rodar: node hub/build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const { loadMetrics, specsDoInventario, idadeDoL1PorAgente, boletimPorAgente, fpyExternoGlobal, COMO_GERAR } = require('./metrics');
// SPECS_DIR e execFileSync removidos de propósito em 2026-09-02: ler specs/ ou
// rodar `git log` daqui recriaria a segunda fonte que a spec
// 2026-09-office-metrics eliminou. Números vêm de hub/metrics.js.

// ---------- parsing ----------
// T1 da spec 2026-09-qg-plataforma: os leitores moram em hub/lib/readers.js —
// o /api/qg e este build leem o escritório pelo MESMO código (uma regra, um
// lugar). Aqui ficam só o HTML e a formatação.
const R = require('./lib/readers');
const { CLASSIC_ORDER, RITUALS, ORIGINS } = R;

// ---------------------------------------------------------------------------
// NÚMEROS DO ESCRITÓRIO — leitura, nunca cálculo.
// Fonte única: company/OFFICE-METRICS.json (worker workers/office-metrics.js).
// Não voltar a ler frontmatter de spec, contar incidents/ nem rodar `git log`
// aqui: é exatamente a segunda fonte que a spec 2026-09-office-metrics matou.
// ---------------------------------------------------------------------------
const METRICS = loadMetrics();
// Régua dupla (P7 — `specs/2026-09-fpy-molde/`): FPY externo é GLOBAL, 1 linha
// só no topo do painel do boletim — nunca por cartão de agente, nunca somado
// com o FPY interno (ver `fpyExternoGlobal` em hub/metrics.js).
const FPY_EXTERNO = fpyExternoGlobal(METRICS);

function readSpecs() {
  if (!METRICS.ok) return [];
  return specsDoInventario(METRICS);
}

function stateAge(dir) {
  if (!METRICS.ok) return null;
  const idades = idadeDoL1PorAgente(METRICS);
  return dir in idades ? idades[dir] : null;
}

function fmtTokens(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function pct(n) {
  return Math.round((Number(n) || 0) * 1000) / 10 + '%';
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mdInline(text) {
  let s = esc(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = s.split('\n');
  let html = '';
  let inList = false;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      html += `<p>${para.join(' ')}</p>`;
      para = [];
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^-\s+/.test(t)) {
      flushPara();
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${t.replace(/^-\s+/, '')}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      if (t === '') {
        flushPara();
      } else {
        para.push(t);
      }
    }
  }
  if (inList) html += '</ul>';
  flushPara();
  return html;
}

// ---------- data ----------

const ORDER = R.listAgentDirs(AGENTS_DIR);
const agents = ORDER.filter((d) => fs.existsSync(path.join(AGENTS_DIR, d, 'AGENT.md'))).map((d) => R.readAgent(d, { agentsDir: AGENTS_DIR, metrics: METRICS }));
const company = R.readCompany(ROOT);
const tokens = R.readTokens(ROOT);
const specs = readSpecs();
const decisions = R.readDecisions(ROOT);
for (const a of agents) {
  a.ageDays = stateAge(a.dir);
  // "Spec ativa" também vem do worker (`placarDeSpecs.ativasPorAgente`) — era a
  // terceira definição rival de "ativa" apontada pelo reviewer em 2026-09-02.
  const ativas = METRICS.ok
    ? METRICS.data.metricas.placarDeSpecs.ativasPorAgente[a.dir] || []
    : [];
  a.activeSpecs = specs.filter((s) => ativas.includes(s.slug));
  // Boletim (spec 2026-09-boletim-agente): null em instância antiga do JSON
  // (sem `metricas.boletim`) ou agente sem cartão — o card some, sem AVISO.
  a.boletim = boletimPorAgente(METRICS, a.dir);
}
const builtAt = process.argv[2] || new Date().toISOString().slice(0, 16).replace('T', ' ');

// ---------- boletim (spec 2026-09-boletim-agente) ----------
// R5: 6 linhas cruas, sem média/ranking/nota composta. `n/d` visível com o
// motivo em title=. Cada `fmt*` só formata — nunca agrega entre linhas.
const fmtGateDePrimeira = (v) => `${v.sim} de primeira · ${v.nao} não · ${v.semRegistro} sem registro`;
const fmtDefeitosConfirmados = (v) =>
  `${v.total} confirmado${v.total === 1 ? '' : 's'} em ${v.specsComCampo} spec(s)` +
  (v.specsSemCampo ? ` · ${v.specsSemCampo} sem o campo` : '');
const fmtIncidentes = (v) => `${v} incidente${v === 1 ? '' : 's'}`;
const fmtSessoes = (v) => `${v.abandonadas} abandonada${v.abandonadas === 1 ? '' : 's'}`;
const fmtInvasoesDeEscopo = (v) => `${v} invasão${v === 1 ? '' : 'ões'} de escopo`;

// Uma linha do boletim: `entry` é sempre `{valor, fonte, motivoNd?}` (nunca
// zero inventado — valor null vem SEMPRE com motivoNd do worker).
function boletimRow(label, entry, formatter) {
  const valorHtml =
    entry.valor === null
      ? `<span class="hint" title="${esc(entry.motivoNd || 'sem dado')}">n/d</span>`
      : esc(formatter(entry.valor));
  return `<div class="boletim-row"><dt>${esc(label)}</dt><dd>${valorHtml}</dd></div>`;
}

function boletimCard(a) {
  const b = a.boletim;
  if (!b) return '';
  const l = b.linhas;
  const fpyHtml = b.fpy
    ? esc(`${b.fpy.passaram} de ${b.fpy.universo}`)
    : `<span class="hint" title="sem specs no universo do FPY para este agente">n/d</span>`;
  return `
    <div class="agent-boletim">
      <h4>Boletim <span class="hint">${esc(b.atribuicao || 'por owner da spec')} · sensores, não auto-relato</span></h4>
      <dl class="boletim-list">
        ${boletimRow('Gate de primeira', l.gateDePrimeira, fmtGateDePrimeira)}
        ${boletimRow('Defeitos confirmados', l.defeitosConfirmados, fmtDefeitosConfirmados)}
        ${boletimRow('Incidentes', l.incidentes, fmtIncidentes)}
        ${boletimRow('Sessões (close × abandono)', l.sessoes, fmtSessoes)}
        ${boletimRow('Tokens por entrega', l.tokensPorEntrega, () => '')}
        ${boletimRow('Invasões de escopo', l.invasoesDeEscopo, fmtInvasoesDeEscopo)}
        <div class="boletim-row boletim-fpy"><dt>FPY interno <span class="hint">(0 defeitos no review)</span></dt><dd>${fpyHtml}</dd></div>
      </dl>
    </div>`;
}

// ---------- render ----------

const agentCard = (a) => `
  <article class="agent" style="--agent:${esc(a.meta.color || '#666')}">
    <div class="agent-stripe"></div>
    <header class="agent-head">
      <span class="agent-emoji" aria-hidden="true">${esc(a.meta.emoji || '•')}</span>
      <div class="agent-id">
        <h3>${esc(a.meta.callsign || a.dir)}</h3>
        <span class="agent-vibe">${esc(a.meta.vibe || '')}</span>
      </div>
      <span class="pill ${a.meta.status === 'ativo' ? 'pill-on' : 'pill-off'}">${esc(a.meta.status || '—')}</span>
    </header>
    <p class="agent-mission">${esc(a.meta.mission || '')}</p>
    <div class="l1"><span class="l1-tag">L1</span>${esc(a.l1).replace(/\n/g, '<br>')}</div>
    <div class="agent-cols">
      <div><h4>Cuida de</h4><ul>${a.owns.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
      <div><h4>Defere</h4><ul>${a.defers.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
    </div>
    ${
      a.inProgress && a.inProgress.length
        ? `<div class="agent-progress"><h4>Em progresso</h4><ul>${a.inProgress
            .slice(0, 3)
            .map((o) => `<li>${esc(o)}</li>`)
            .join('')}${a.inProgress.length > 3 ? `<li class="agent-more">e mais ${a.inProgress.length - 3}</li>` : ''}</ul></div>`
        : ''
    }
    ${
      a.activeSpecs && a.activeSpecs.length
        ? `<div class="agent-specs"><h4>Spec ativa</h4><ul>${a.activeSpecs
            .map((s) => `<li><a class="mono" href="../specs/${esc(s.slug)}/spec.md">${esc(s.title)}</a> <span class="chip">${esc(s.status)}</span></li>`)
            .join('')}</ul></div>`
        : ''
    }
    ${boletimCard(a)}
    <div class="agent-meta">
      <div class="chips">${(a.meta.triggers || '').split('·').map((t) => `<span class="chip">${esc(t.trim())}</span>`).join('')}</div>
      <dl>
        <div><dt>Modelo</dt><dd>${esc(a.meta.model || '—')}</dd></div>
        <div><dt>Entrega</dt><dd>${esc(a.meta.deliverables || '—')}</dd></div>
        <div><dt>Cicatrizes</dt><dd>${a.gotchasCount === null ? '— <span class="hint">sem medição</span>' : `${a.gotchasCount} gotcha${a.gotchasCount === 1 ? '' : 's'}`}</dd></div>
        <div><dt>Arquivo</dt><dd class="mono">agents/${esc(a.dir)}/AGENT.md</dd></div>
      </dl>
      <p class="agent-age ${a.ageDays !== null && a.ageDays >= 7 ? 'stale' : ''}">
        ${
          !METRICS.ok
            ? 'L1 — <span class="hint">sem medição: rode <span class="mono">node workers/office-metrics.js</span></span>'
            : a.ageDays === null
              ? 'L1 atualizado há — <span class="hint">STATE.md ainda sem commit</span>'
              : `L1 atualizado há ${a.ageDays} dia${a.ageDays === 1 ? '' : 's'}`
        }
        <span class="hint">último commit que tocou o STATE.md</span>
      </p>
    </div>
  </article>`;

function gatesPanel(specsList, blockers) {
  // Classificação vem do worker (`categoria`), nunca de predicado próprio sobre
  // `status` — achado do reviewer em 2026-09-02: havia três definições rivais.
  const gates = specsList.filter((s) => s.categoria === 'em-gate');
  const orphans = specsList.filter((s) => s.hasCheckpoint);
  const unknown = specsList.filter((s) => s.categoria === 'sem-convencao');
  const empty = !gates.length && !blockers.length && !orphans.length && !unknown.length;
  const AGENT_META = {};
  for (const a of agents) AGENT_META[a.dir] = a.meta;
  const ownerTag = (owner) => {
    const m = AGENT_META[owner];
    return m ? `${esc(m.emoji || '•')} ${esc(m.callsign || owner)}` : owner ? esc(owner) : 'desconhecido';
  };
  // R7 — sem a fonte de métricas, este painel NÃO pode dizer "nada esperando
  // você": seria uma afirmação falsa com cara de medição, não um vazio.
  if (!METRICS.ok) {
    return `
  <section class="panel gates sem-fonte">
    <h2>Aguardando o dono</h2>
    <p style="margin:0 0 8px; color:var(--ink-2)"><strong>Sem medição.</strong> ${esc(METRICS.motivo)}.</p>
    <p style="margin:0; color:var(--ink-2)">Não sei dizer se há algo esperando por você. Para saber, rode:</p>
    <p class="mono" style="margin:6px 0 0">${esc(COMO_GERAR)}</p>
  </section>`;
  }

  return `
  <section class="panel gates ${empty ? 'empty' : ''}">
    <h2>Aguardando o dono</h2>
    ${
      empty
        ? `<p style="margin:0; color:var(--ink-2)">Nada esperando você — sem gates abertos, sem blockers, sem sessão sem close.</p>`
        : `
    <div class="gates-sec">
      <h3>Gates <span class="hint">specs paradas no "Proceed?" — esperando seu sim</span></h3>
      ${
        gates.length
          ? `<ul>${gates
              .map(
                (s) =>
                  `<li><a class="mono" href="../specs/${esc(s.slug)}/spec.md">${esc(s.title)}</a> · ${ownerTag(s.owner)} · <span class="mono">specs/${esc(s.slug)}/</span></li>`
              )
              .join('')}</ul>`
          : `<p class="hint" style="margin:0">Nenhuma spec parada em gate.</p>`
      }
    </div>
    <div class="gates-sec">
      <h3>Blockers <span class="hint">travas registradas em company/STATE.md</span></h3>
      ${
        blockers.length
          ? `<ul class="blockers">${blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
          : `<p class="hint" style="margin:0">Nenhum blocker aberto.</p>`
      }
    </div>
    <div class="gates-sec">
      <h3>Sessões sem close <span class="hint">checkpoint gravado que ninguém fechou ainda</span></h3>
      ${
        orphans.length
          ? `<ul>${orphans
              .map(
                (s) =>
                  `<li><a class="mono" href="../specs/${esc(s.slug)}/tasks.md">${esc(s.title)}</a> · ${ownerTag(s.owner)}</li>`
              )
              .join('')}</ul>`
          : `<p class="hint" style="margin:0">Nenhum checkpoint pendurado.</p>`
      }
    </div>
    ${
      unknown.length
        ? `<div class="gates-sec">
      <h3>Specs sem convenção <span class="hint">sem frontmatter status/owner — não sabemos se está travada</span></h3>
      <ul>${unknown
        .map((s) => `<li><span class="mono">specs/${esc(s.slug)}/</span> — ${esc(s.title)}</li>`)
        .join('')}</ul>
    </div>`
        : ''
    }`
    }
  </section>`;
}

function tokensPanel(t) {
  if (!t || !t.weeks || !t.weeks.length) {
    return `
  <section class="panel tokens empty">
    <h2>Tokens da semana</h2>
    <p style="margin:0; color:var(--ink-2)">Sem dados ainda. Rode <span class="mono">node hub/tokens.js</span> para gerar <span class="mono">company/TOKENS.json</span>.</p>
  </section>`;
  }
  const cur = t.weeks[0];
  const prev = t.weeks[1];
  const deltaPct = prev && prev.totalTokens > 0 ? ((cur.totalTokens - prev.totalTokens) / prev.totalTokens) * 100 : null;
  const deltaStr = deltaPct === null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;

  const models = (cur.modelBreakdowns || []).slice().sort((a, b) => b.totalTokens - a.totalTokens);
  const modelBar = models
    .map((m, i) => {
      const share = cur.totalTokens > 0 ? (m.totalTokens / cur.totalTokens) * 100 : 0;
      const op = 0.9 - i * 0.15;
      return `<span class="model-seg" style="width:${share.toFixed(2)}%; background:color-mix(in srgb, var(--brass) ${Math.max(op, 0.15) * 100}%, transparent)" title="${esc(m.modelName)} — ${fmtTokens(m.totalTokens)}"></span>`;
    })
    .join('');
  const modelLegend = models
    .map((m) => `<span class="model-tag"><span class="model-dot"></span>${esc(m.modelName)} · ${fmtTokens(m.totalTokens)}</span>`)
    .join('');

  const contextSharePct = pct(cur.contextShare);
  const workShare = cur.totalTokens > 0 ? cur.outputTokens / cur.totalTokens : 0;

  const sessions = t.sessions || [];
  const novelas = t.novelas || [];
  const top5 = sessions.slice(0, 5);

  return `
  <section class="panel tokens">
    <h2>Tokens da semana <span class="tokens-sub">semana seg–dom (ccusage) — não é a janela do /usage · captura pontual, não ao vivo</span></h2>
    <div class="tokens-top">
      <div class="tokens-total">
        <span class="tokens-big">${fmtTokens(cur.totalTokens)}</span>
        <span class="tokens-delta ${deltaPct !== null && deltaPct > 0 ? 'up' : ''}">${deltaStr} vs semana anterior</span>
      </div>
      <div class="tokens-period mono">${esc(cur.period)}</div>
    </div>
    <div class="model-bar">${modelBar}</div>
    <div class="model-legend">${modelLegend}</div>
    <div class="tokens-stats">
      <div class="tstat">
        <div class="tstat-num">${contextSharePct}</div>
        <div class="tstat-label">contexto carregado (cache read/total)</div>
        <p class="tstat-note">cache read custa ~10% do token normal — não é desperdício puro, é histórico recarregado.</p>
      </div>
      <div class="tstat">
        <div class="tstat-num">${pct(workShare)}</div>
        <div class="tstat-label">trabalho novo (output/total)</div>
        <p class="tstat-note">fração da semana que virou resposta nova, não contexto relido.</p>
      </div>
      <div class="tstat">
        <div class="tstat-num">${sessions.length}</div>
        <div class="tstat-label">sessões (14 dias)</div>
        <p class="tstat-note">conversas distintas registradas pelo ccusage no período.</p>
      </div>
      <div class="tstat">
        <div class="tstat-num">${novelas.length}</div>
        <div class="tstat-label">sessões-novela</div>
        <p class="tstat-note">sessões com cache read ≥ ${fmtTokens(t.novelaThreshold || 50_000_000)} — contexto muito recarregado numa única conversa.</p>
      </div>
    </div>
    <h3 class="tokens-h3">Top 5 sessões</h3>
    <table class="tokens-table">
      <thead><tr><th>sessão</th><th>total</th><th>modelos</th></tr></thead>
      <tbody>
        ${top5
          .map(
            (s) =>
              `<tr><td class="mono">${esc(String(s.id).slice(0, 8))}</td><td class="mono">${fmtTokens(s.totalTokens)}</td><td>${esc((s.modelsUsed || []).join(', '))}</td></tr>`
          )
          .join('') || '<tr><td colspan="3">—</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function decisionsPanel(list) {
  if (!list.length) {
    return `
  <section class="panel decisions empty">
    <h2>Decisões</h2>
    <p style="margin:0; color:var(--ink-2)">Sem decisões ainda. Registre em <span class="mono">company/DECISIONS.md</span>.</p>
  </section>`;
  }
  const AGENT_META = {};
  for (const a of agents) AGENT_META[a.dir] = a.meta;
  const authorChip = (author) => {
    if (!author) return '';
    const low = author.toLowerCase();
    const key = Object.keys(AGENT_META).find(
      (k) => low.includes(k) || low.includes(String(AGENT_META[k].callsign || '').toLowerCase())
    );
    if (key) {
      const m = AGENT_META[key];
      return `<span class="chip">${esc(m.emoji || '•')} ${esc(m.callsign || key)}</span>`;
    }
    return `<span class="chip">${esc(author)}</span>`;
  };
  const item = (d) => `
      <details class="decision"><summary>${esc(d.title)} <span class="decision-sum">${esc(d.summary)}</span> ${authorChip(d.author)}</summary>
        <div class="decision-body">${mdInline(d.body)}</div>
      </details>`;
  const sorted = list.slice().reverse(); // mais recente no topo; dentro do mesmo dia, última escrita primeiro
  // agrupa por data (ordem de inserção = ordem inversa de aparição no arquivo),
  // não assume que entradas do mesmo dia estejam contíguas na lista.
  const byDate = new Map();
  for (const d of sorted) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date).push(d);
  }
  const datesDesc = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  // "7 primeiros visíveis / ver todas (N-7)" conta ITENS, não grupos.
  let count = 0;
  const headGroups = [];
  const restGroups = [];
  for (const date of datesDesc) {
    const items = byDate.get(date);
    if (count >= 7) {
      restGroups.push([date, items]);
      continue;
    }
    if (count + items.length <= 7) {
      headGroups.push([date, items]);
      count += items.length;
    } else {
      const splitAt = 7 - count;
      headGroups.push([date, items.slice(0, splitAt)]);
      restGroups.push([date, items.slice(splitAt)]);
      count = 7;
    }
  }
  const renderGroups = (groups) =>
    groups
      .map(([date, items]) => `<h3 class="decision-day">${esc(date)}</h3>${items.map(item).join('')}`)
      .join('');
  const rest = restGroups.reduce((n, [, items]) => n + items.length, 0);
  return `
  <section class="panel decisions">
    <h2>Decisões <span class="hint">${list.length} decisões · última ${esc(sorted[0].date)}</span></h2>
    <div class="decisions-list">${renderGroups(headGroups)}</div>
    ${
      rest
        ? `<details class="decision-more"><summary aria-label="ver todas as ${list.length} decisões">ver todas (${rest})</summary>${renderGroups(restGroups)}</details>`
        : ''
    }
  </section>`;
}

const html = `<meta charset="utf-8">
<title>Hub Arvys</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --bg:#FAFAF7; --surface:#FFFFFF; --ink:#1A1B1E; --ink-2:#52534E; --ink-3:#8B8C85;
    --line:#E4E2DA; --brass:#8A6D1D; --brass-soft:#F4EEDC;
    --on-pill:#FFFFFF; --terminal:#F4F3EE; --danger:#B02A2A;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#17181B; --surface:#1F2126; --ink:#E9E7E2; --ink-2:#A9AAA2; --ink-3:#6E6F68;
      --line:#33352C; --brass:#CBA842; --brass-soft:#2A2718;
      --terminal:#14151A; --danger:#E06A6A;
    }
  }
  :root[data-theme="dark"]{
    --bg:#17181B; --surface:#1F2126; --ink:#E9E7E2; --ink-2:#A9AAA2; --ink-3:#6E6F68;
    --line:#33352C; --brass:#CBA842; --brass-soft:#2A2718;
    --terminal:#14151A; --danger:#E06A6A;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font-family:'Schibsted Grotesk',system-ui,sans-serif; font-size:15px; line-height:1.55;
  }
  .wrap{max-width:1080px; margin:0 auto; padding:0 24px 64px}
  a{color:var(--brass)}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:.86em}

  /* topbar */
  .top{display:flex; align-items:baseline; gap:16px; padding:28px 0 20px; border-bottom:1px solid var(--line); flex-wrap:wrap}
  .brand{font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:28px; letter-spacing:.5px}
  .brand small{color:var(--brass); font-weight:700}
  .top .live{display:inline-flex; align-items:center; gap:7px; color:var(--ink-2); font-size:13px}
  .dot{width:8px; height:8px; border-radius:50%; background:#2F9E44; box-shadow:0 0 0 3px color-mix(in srgb,#2F9E44 22%,transparent)}
  .top .build{margin-left:auto; color:var(--ink-3); font-size:12.5px}
  .top .open-live{font-size:12px; font-weight:600; color:var(--ink-2); background:var(--surface); border:1px solid var(--line);
                  border-radius:99px; padding:3px 11px; text-decoration:none; white-space:nowrap}
  .top .open-live:hover{border-color:var(--brass); color:var(--brass)}

  /* estado da empresa */
  .state{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:24px 0 8px}
  @media(max-width:760px){.state{grid-template-columns:1fr}}
  .panel{background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:16px 18px}
  .panel h2{margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:var(--ink-3); font-weight:600}
  .panel ul{margin:0; padding-left:18px; color:var(--ink-2)}
  .panel li{margin:4px 0}
  .blockers-ok{color:var(--ink-2)} .blockers li{color:var(--danger)}

  /* gates */
  .gates{margin:16px 0 8px}
  .gates.empty{color:var(--ink-2)}
  .gates-sec{margin-top:14px}
  .gates-sec:first-of-type{margin-top:6px}
  .gates-sec h3{margin:0 0 6px; font-size:13px; font-weight:700; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap}
  .hint{font-weight:400; color:var(--ink-3); font-size:11.5px}
  .fpy-externo{margin:-8px 0 16px; font-size:12.5px}
  .gates-sec ul{margin:0; padding-left:18px; color:var(--ink-2); font-size:13.5px}
  .gates-sec li{margin:4px 0}
  .agent-age.stale{color:var(--danger)}
  .agent-age{margin:10px 0 0; font-size:12px; color:var(--ink-2); display:flex; flex-direction:column; gap:2px}

  /* decisões */
  .decisions{margin:16px 0 8px}
  .decisions.empty{color:var(--ink-2)}
  .decisions h2{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .decisions-list{margin-top:6px}
  .decision-day{margin:14px 0 6px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3); font-weight:600}
  .decision-day:first-child{margin-top:0}
  details.decision{border:1px solid var(--line); border-radius:8px; padding:8px 12px; margin:6px 0; background:var(--terminal)}
  details.decision summary{cursor:pointer; font-size:13.5px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; list-style:revert}
  details.decision summary::marker{color:var(--brass)}
  .decision-sum{color:var(--ink-2); font-weight:400; font-size:12.5px}
  .decision-body{margin-top:8px; padding-top:8px; border-top:1px dashed var(--line); color:var(--ink-2); font-size:13px; line-height:1.55}
  .decision-body p{margin:0 0 8px}
  .decision-body p:last-child{margin-bottom:0}
  .decision-body ul{margin:0 0 8px; padding-left:18px}
  .decision-body code{font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:.9em; background:var(--brass-soft); padding:1px 5px; border-radius:4px}
  details.decision-more{margin-top:10px}
  details.decision-more > summary{cursor:pointer; font-size:12.5px; color:var(--brass); font-weight:600; list-style:revert}

  /* tokens */
  .tokens{margin:16px 0 8px}
  .tokens h2{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .tokens-sub{text-transform:none; letter-spacing:0; font-weight:400; color:var(--ink-3); font-size:11.5px}
  .tokens-top{display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin:6px 0 12px}
  .tokens-total{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .tokens-big{font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:30px}
  .tokens-delta{font-size:12.5px; color:var(--ink-3)}
  .tokens-delta.up{color:var(--brass)}
  .tokens-period{color:var(--ink-3); font-size:12px}
  .model-bar{display:flex; width:100%; height:12px; border-radius:6px; overflow:hidden; background:var(--terminal); border:1px solid var(--line)}
  .model-seg{display:block; height:100%}
  .model-legend{display:flex; flex-wrap:wrap; gap:10px 16px; margin:10px 0 4px; font-size:12px; color:var(--ink-2)}
  .model-tag{display:inline-flex; align-items:center; gap:6px}
  .model-dot{width:8px; height:8px; border-radius:50%; background:var(--brass)}
  .tokens-stats{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:16px 0 4px}
  @media(max-width:760px){.tokens-stats{grid-template-columns:1fr 1fr}}
  .tstat-num{font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:20px}
  .tstat-label{font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-3); margin-top:2px}
  .tstat-note{margin:6px 0 0; font-size:12px; color:var(--ink-2); line-height:1.4}
  .tokens-h3{margin:20px 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:var(--ink-3); font-weight:600}
  .tokens-table{width:100%; border-collapse:collapse; font-size:13px}
  .tokens-table th{text-align:left; color:var(--ink-3); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding:4px 8px 6px 0; border-bottom:1px solid var(--line)}
  .tokens-table td{padding:6px 8px 6px 0; border-bottom:1px solid var(--line); color:var(--ink-2)}
  .tokens.empty{color:var(--ink-2)}

  /* grid de agentes */
  h2.sec{font-family:'Bricolage Grotesque',sans-serif; font-size:19px; font-weight:700; margin:36px 0 14px}
  .agents{display:grid; grid-template-columns:1fr 1fr; gap:18px}
  @media(max-width:860px){.agents{grid-template-columns:1fr}}
  .agent{background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column}
  .agent-stripe{height:5px; background:var(--agent)}
  .agent-head{display:flex; align-items:center; gap:12px; padding:16px 18px 4px}
  .agent-emoji{font-size:26px; line-height:1}
  .agent-id h3{margin:0; font-family:'Bricolage Grotesque',sans-serif; font-size:21px; font-weight:800}
  .agent-vibe{font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--agent); font-weight:500}
  .pill{margin-left:auto; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; padding:3px 10px; border-radius:99px}
  .pill-on{background:var(--agent); color:var(--on-pill)}
  .pill-off{background:transparent; color:var(--ink-3); border:1px solid var(--line)}
  .agent-mission{margin:8px 18px; color:var(--ink-2)}
  .l1{margin:4px 18px 12px; padding:10px 12px; border-radius:8px; background:var(--terminal);
      border:1px solid var(--line); font-family:'IBM Plex Mono',monospace; font-size:12.5px; line-height:1.5; color:var(--ink-2)}
  .l1-tag{color:var(--agent); font-weight:600; margin-right:8px}
  .agent-cols{display:grid; grid-template-columns:1fr 1fr; gap:0 16px; padding:0 18px; font-size:13.5px}
  .agent-cols h4{margin:6px 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3); font-weight:600}
  .agent-cols ul{margin:0; padding-left:16px; color:var(--ink-2)}
  .agent-cols li{margin:2px 0}
  .agent-progress, .agent-specs{margin:10px 18px 0; font-size:13.5px}
  .agent-progress h4, .agent-specs h4{margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3); font-weight:600}
  .agent-progress ul, .agent-specs ul{margin:0; padding-left:16px; color:var(--ink-2)}
  .agent-progress li, .agent-specs li{margin:2px 0}
  .agent-more{color:var(--ink-3)}
  .agent-meta{margin-top:auto; padding:12px 18px 16px}
  .chips{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px}
  .chip{font-size:12px; padding:2px 9px; border-radius:99px; border:1px solid var(--line); color:var(--ink-2);
        background:color-mix(in srgb, var(--agent) 7%, transparent)}
  .agent-meta dl{margin:0; display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; font-size:12.5px}
  .agent-meta dt{color:var(--ink-3); font-size:11px; text-transform:uppercase; letter-spacing:.07em}
  .agent-meta dd{margin:0; color:var(--ink-2)}

  /* boletim (2026-09-boletim-agente): 6 linhas cruas, sem cor de bom/ruim,
     sem nota composta, sem ranking entre agentes — só leitura (R5). */
  .agent-boletim{margin:12px 18px 0; padding-top:12px; border-top:1px dashed var(--line)}
  .agent-boletim h4{margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3); font-weight:600; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap}
  .boletim-list{margin:0; display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; font-size:12.5px}
  .boletim-row dt{color:var(--ink-3); font-size:11px; text-transform:uppercase; letter-spacing:.07em}
  .boletim-row dd{margin:0; color:var(--ink-2)}
  .boletim-fpy{grid-column:1 / -1; margin-top:4px; padding-top:6px; border-top:1px dashed var(--line)}

  /* sistema + origem */
  .two{display:grid; grid-template-columns:1fr 1fr; gap:18px}
  @media(max-width:860px){.two{grid-template-columns:1fr}}
  .rituals div{display:flex; gap:12px; padding:7px 0; border-bottom:1px dashed var(--line); font-size:13.5px}
  .rituals div:last-child{border-bottom:0}
  .rituals code{font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--brass); white-space:nowrap; font-weight:500}
  .rituals span{color:var(--ink-2)}
  .origins div{display:flex; gap:12px; padding:7px 0; border-bottom:1px dashed var(--line); font-size:13.5px}
  .origins div:last-child{border-bottom:0}
  .origins b{white-space:nowrap; font-weight:600}
  .origins span{color:var(--ink-2)}

  .foot{margin-top:36px; padding-top:18px; border-top:1px solid var(--line); color:var(--ink-3); font-size:13px}
  .foot .motto{font-family:'Bricolage Grotesque',sans-serif; font-size:15px; color:var(--brass); font-weight:700; margin-bottom:6px}
  .edit-note{background:var(--brass-soft); border:1px solid color-mix(in srgb,var(--brass) 30%,transparent);
             border-radius:8px; padding:10px 14px; margin:20px 0 0; font-size:13px; color:var(--ink-2)}
</style>

<div class="wrap">
  <header class="top">
    <span class="brand">ARVYS<small> · hub</small></span>
    <span class="live"><span class="dot"></span>escritório aberto 24/7</span>
    <a class="open-live" href="http://127.0.0.1:5180/live" title="rode: node hub/serve.js">▶ Abrir escritório ao vivo</a>
    <span class="build">gerado de <span class="mono">agents/*/AGENT.md</span> · ${esc(builtAt)}</span>
  </header>

  <div class="state">
    <div class="panel">
      <h2>Blockers</h2>
      ${company.blockers.length
        ? `<ul class="blockers">${company.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : `<p class="blockers-ok" style="margin:0">Nenhum blocker aberto.</p>`}
    </div>
    <div class="panel">
      <h2>Iniciativas em curso</h2>
      <ul>${company.initiatives.map((i) => `<li>${esc(i)}</li>`).join('') || '<li>—</li>'}</ul>
    </div>
  </div>
${gatesPanel(specs, company.blockers)}
${decisionsPanel(decisions)}
${tokensPanel(tokens)}

  <h2 class="sec">O time</h2>
  ${FPY_EXTERNO
    ? `<p class="hint fpy-externo">FPY externo <span class="mono">(sem incidente nem "ajustar" no gate)</span>: ${esc(`${FPY_EXTERNO.passaram} de ${FPY_EXTERNO.universo}`)} — global, régua companheira do "FPY interno" de cada cartão abaixo; os dois nunca são somados nem mediados (régua dupla, P7).</p>`
    : ''}
  <div class="agents">
    ${agents.map(agentCard).join('\n')}
  </div>

  <div class="edit-note">✏️ Para mudar um perfil, edite o <span class="mono">AGENT.md</span> do agente e rode
  <span class="mono">node hub/build.js</span> — o painel é gerado, nunca editado.</div>

  <h2 class="sec">O sistema</h2>
  <div class="two">
    <div class="panel rituals">
      <h2>Rituais</h2>
      ${RITUALS.map(([c, d]) => `<div><code>${esc(c)}</code><span>${esc(d)}</span></div>`).join('')}
    </div>
    <div class="panel origins">
      <h2>Origem — o que veio de cada fonte</h2>
      ${ORIGINS.map(([s, d]) => `<div><b>${esc(s)}</b><span>${esc(d)}</span></div>`).join('')}
    </div>
  </div>

  <footer class="foot">
    <div class="motto">O chat é descartável; o arquivo é o produto.</div>
    Token caro planeja, token barato digita · erro vira lei · nada é pronto sem evidência.
    <br>Metodologia completa: <span class="mono">README.md</span> · <span class="mono">docs/ORIGEM.md</span> · <span class="mono">docs/GESTAO-DE-CONTEXTO.md</span>
  </footer>
</div>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');

// T2.1: hub/live/agents.json — a fonte que hub/live/office.html lê para deixar
// de ter KNOWN/HOME/CORES/CALL/AGENTES_RECADO fixos (ver hub/live/office.html).
// Escolha (vs. injetar no HTML gerado): office.html é servido DIRETO por
// hub/serve.js (nunca passa por build.js), então precisa de um arquivo próprio
// para buscar — mesmo padrão já usado para hub/live/avatars.svg.
// hasArt: só os 4 clássicos têm sprite/mesa desenhados à mão; qualquer outro
// agente cai no avatar genérico (cor + emoji do frontmatter) e mesa calculada.
const CLASSIC_SET = new Set(CLASSIC_ORDER);
const agentsJson = agents.map((a) => ({
  name: a.dir,
  callsign: a.meta.callsign || a.dir,
  vibe: a.meta.vibe || '',
  emoji: a.meta.emoji || '•',
  // A cor vai parar num atributo style do office.html (--agent:<cor>): só hex.
  color: /^#[0-9a-fA-F]{3,8}$/.test(a.meta.color || '') ? a.meta.color : '#666666',
  hasArt: CLASSIC_SET.has(a.dir),
}));
fs.writeFileSync(path.join(__dirname, 'live', 'agents.json'), JSON.stringify(agentsJson, null, 2) + '\n', 'utf8');

console.log(`hub/index.html gerado — ${agents.length} agentes, ${company.blockers.length} blockers.`);
