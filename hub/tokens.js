#!/usr/bin/env node
/**
 * hub/tokens.js — worker determinístico: lê consumo real via ccusage e grava
 * company/TOKENS.json (fonte única). Sem LLM, write-only, idempotente, falha alto.
 * Rodar: node hub/tokens.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { ACUMULADO_DESDE, comoYYYYMMDD } = require('../workers/lib/janela');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'company', 'TOKENS.json');

const CCUSAGE_VERSION = '20.0.20';
// calibrado na review 2026-09-02: 20M marcava 49% das sessões; 50M → 33% (faixa 10–40%)
const NOVELA_CACHE_READ = 50_000_000;
const WEEKS = 4;

function runCcusage(args) {
  // DEP0190 (aviso, não erro): passar argumentos com `shell: true` não os
  // escapa, só concatena. TENTADO E REVERTIDO em 2026-09-02: trocar para
  // `npx.cmd` com `shell: false` quebra no Windows com EINVAL — o Node recusa
  // executar `.cmd` sem shell, justamente por causa desta mesma classe de
  // problema. Não há forma limpa de chamar o npx aqui sem shell.
  // Risco real avaliado: NENHUM argumento vem de entrada externa — são
  // constantes deste arquivo (`-y`, versão fixada, flags literais). Sem
  // superfície de injeção, o aviso é ruído.
  // Se um dia algum argumento passar a ser variável, isto vira defeito de
  // segurança de verdade e precisa ser resolvido antes.
  const res = spawnSync('npx', ['-y', `ccusage@${CCUSAGE_VERSION}`, ...args], {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    console.error(`ccusage falhou (${args.join(' ')}): ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`ccusage saiu com código ${res.status} (${args.join(' ')})`);
    console.error(res.stderr || res.stdout || '');
    process.exit(1);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    console.error(`saída do ccusage não é JSON válido (${args.join(' ')}): ${e.message}`);
    process.exit(1);
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function contextShareOf(entry) {
  return entry.totalTokens > 0 ? round3(entry.cacheReadTokens / entry.totalTokens) : 0;
}

// ---------- weekly ----------

const weeklyRaw = runCcusage(['weekly', '--json', '--no-cost', '--offline']);
const weeklyAll = Array.isArray(weeklyRaw.weekly) ? weeklyRaw.weekly : [];
// período ascendente na saída do ccusage — pegar as últimas WEEKS e ordenar desc (semana atual primeiro)
const weeksSorted = [...weeklyAll].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
const lastWeeks = weeksSorted.slice(-WEEKS).reverse();

const weeks = lastWeeks.map((w) => ({
  period: w.period,
  totalTokens: w.totalTokens,
  outputTokens: w.outputTokens,
  cacheReadTokens: w.cacheReadTokens,
  cacheCreationTokens: w.cacheCreationTokens,
  inputTokens: w.inputTokens,
  contextShare: contextShareOf(w),
  modelBreakdowns: (w.modelBreakdowns || []).map((mb) => ({
    modelName: mb.modelName,
    inputTokens: mb.inputTokens,
    outputTokens: mb.outputTokens,
    cacheCreationTokens: mb.cacheCreationTokens,
    cacheReadTokens: mb.cacheReadTokens,
    totalTokens:
      (mb.inputTokens || 0) + (mb.outputTokens || 0) + (mb.cacheCreationTokens || 0) + (mb.cacheReadTokens || 0),
  })),
}));

// ---------- session ----------

// R6 (review pós-Frente-A, 2026-09-05): `--since` vem da MESMA constante que
// `workers/office-metrics.js` usa para `BOLETIM_ACUMULADO_DESDE` — nunca de
// uma janela móvel tipo "hoje - 14 dias". Antes disso, a partir de
// ~2026-09-15 uma janela móvel de 14 dias deixaria de cobrir 2026-08-31 e o
// "acumulado" do boletim encolheria sozinho, sem nenhum dado ter mudado.
// Consequência aceita: esta consulta cresce com o tempo (não é mais "só os
// últimos 14 dias") — é o preço de "acumulado" ser verdade.
const sessionRaw = runCcusage([
  'session',
  '--json',
  '--no-cost',
  '--offline',
  '--since',
  comoYYYYMMDD(ACUMULADO_DESDE),
]);
const sessionAll = Array.isArray(sessionRaw.session) ? sessionRaw.session : [];

const sessions = sessionAll
  .map((s) => ({
    id: s.period,
    lastActivity: s.metadata && s.metadata.lastActivity ? s.metadata.lastActivity : null,
    totalTokens: s.totalTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    modelsUsed: s.modelsUsed || [],
  }))
  .sort((a, b) => b.totalTokens - a.totalTokens);

const novelas = sessions.filter((s) => s.cacheReadTokens >= NOVELA_CACHE_READ);

// ---------- causa de cache miss (REVISAR do radar, company/RADAR-CURADO.md item d47e9bd613ee) ----------

/**
 * Claude Code 2.1.260 passou a gravar `message.diagnostics.cache_miss_reason.type`
 * no JSONL bruto de cada sessão (~/.claude/projects/**\/*.jsonl) quando um
 * turno perde o cache (ex.: "previous_message_not_found"). CONFIRMADO em
 * 2026-09-05 (evidence/A.md, achado do REVISAR): o campo chega ao JSONL, mas
 * `ccusage@20.0.20` (a fonte de TODO número de token deste worker) NÃO o
 * expõe — inspecionei a saída crua de `ccusage session --json` para uma
 * sessão que tem o campo no JSONL e ele não aparece em lugar nenhum da
 * resposta. Por isso esta função lê o JSONL diretamente, mas SÓ para esta
 * tally diagnóstica; nenhum número de token deste arquivo vem daqui — todos
 * continuam vindo do ccusage, por desenho (workers/README.md: "sem parser
 * próprio de JSONL — formato muda com update"). Falha SEMPRE suave: pasta
 * ausente, arquivo ilegível, linha corrompida ou campo ausente vira
 * `disponivel:false` (ou contagem menor), nunca derruba o worker — o número
 * de token (missão crítica deste arquivo) não depende disto.
 */
function localizarJsonlPorSessao(sessionIds) {
  const raiz = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(raiz)) return null;
  const alvo = new Set(sessionIds);
  const achados = new Map(); // sessionId -> caminho absoluto
  const pilha = [raiz];
  while (pilha.length) {
    const dir = pilha.pop();
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue; // pasta ilegível (permissão, link quebrado): pula, não derruba
    }
    for (const ent of entradas) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        pilha.push(abs);
      } else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        const id = ent.name.slice(0, -'.jsonl'.length);
        if (alvo.has(id) && !achados.has(id)) achados.set(id, abs);
      }
    }
  }
  return achados;
}

function causasDeCacheMiss(sessionIds) {
  let mapa;
  try {
    mapa = localizarJsonlPorSessao(sessionIds);
  } catch (e) {
    return { disponivel: false, motivo: `varredura de ~/.claude/projects falhou: ${e.message}` };
  }
  if (mapa === null) {
    return { disponivel: false, motivo: '~/.claude/projects não existe nesta máquina' };
  }

  const porTipo = {};
  let total = 0;
  let sessoesComDado = 0;

  for (const caminho of mapa.values()) {
    let texto;
    try {
      texto = fs.readFileSync(caminho, 'utf8');
    } catch (e) {
      continue; // arquivo sumiu/ilegível entre o readdir e a leitura: pula
    }
    let achouNestaSessao = false;
    for (const linha of texto.split('\n')) {
      if (!linha.trim()) continue;
      let evento;
      try {
        evento = JSON.parse(linha);
      } catch (e) {
        continue; // linha truncada/corrompida (escrita em curso): pula, não derruba
      }
      const tipo =
        evento && evento.message && evento.message.diagnostics && evento.message.diagnostics.cache_miss_reason
          ? evento.message.diagnostics.cache_miss_reason.type
          : null;
      if (tipo) {
        porTipo[tipo] = (porTipo[tipo] || 0) + 1;
        total += 1;
        achouNestaSessao = true;
      }
    }
    if (achouNestaSessao) sessoesComDado += 1;
  }

  return {
    disponivel: true,
    fonte:
      'JSONL bruto (~/.claude/projects/**/<sessionId>.jsonl):message.diagnostics.cache_miss_reason.type — ' +
      'ccusage não expõe este campo',
    sessoesDoTotal: sessionIds.length,
    sessoesEncontradasNoDisco: mapa.size,
    sessoesComDado,
    total,
    porTipo,
    nota:
      'Tally diagnóstica de CAUSA de cache miss, nunca número de token — não usar para calcular ' +
      'consumo (isso continua vindo só de weeks/sessions acima, via ccusage). ' +
      'sessoesEncontradasNoDisco pode ser menor que sessoesDoTotal: sessão de outra máquina/perfil, ' +
      'ou anterior ao Claude Code 2.1.260, não tem o campo (nem precisa ter o arquivo aqui).',
  };
}

const cacheMissReasons = causasDeCacheMiss(sessions.map((s) => s.id));

// ---------- gravação ----------

const output = {
  generatedAt: new Date().toISOString(),
  ccusageVersion: CCUSAGE_VERSION,
  novelaThreshold: NOVELA_CACHE_READ,
  weeks,
  sessions,
  novelas,
  cacheMissReasons,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(
  `company/TOKENS.json gravado — ${weeks.length} semana(s), ${sessions.length} sessão(ões), ${novelas.length} novela(s).`
);
