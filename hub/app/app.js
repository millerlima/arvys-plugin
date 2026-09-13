/* ============================================================================
 * app.js — QG do Arvys, shell de plataforma (spec 2026-09-qg-plataforma, T4-T6).
 *
 * Regras que este arquivo tem de honrar, todas da spec:
 *  - vanilla puro: zero framework, zero CDN, zero fonte remota (criterio 7);
 *  - a API e falada por caminho RELATIVO (criterio 10) — nunca 127.0.0.1, nunca
 *    disco: o mesmo front vai servir a versao hospedada;
 *  - TODO texto vindo de arquivo passa por esc() antes de virar HTML (R5);
 *  - markdown por parser proprio, pequeno: o que ele nao entende sai CRU, nunca
 *    interpretado (estado de partida (b): markdown torto e a entrada normal);
 *  - localStorage sempre em try/catch (aba anonima lanca no acesso);
 *  - numero nunca aparece sozinho: unidade + comparacao (spec, "Publico");
 *  - vazio e estado de primeira classe, com o caminho para resolver.
 * ========================================================================= */
(function () {
  'use strict';

  // =========================================================================
  // 1. utilidades
  // =========================================================================

  /** Escape de HTML. Porta unica: nada vindo de arquivo entra no DOM sem passar aqui. */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };

  // ---- spec 2026-09-qg-tres-perguntas (T2 / decisao G2) --------------------
  // A REGRA, uma so: **o arquivo ganha, o localStorage e cache.**
  // `PREFS_ARQ` e o que veio de company/PREFERENCIAS.json; enquanto ele nao
  // chega (ou se falhar), vale o cache. Divergencia entre os dois NAO e
  // resolvida em silencio: vai para `PREFS_AVISOS` e aparece na tela.
  var PREFS_ARQ = null;          // {visao:{}, agrupa:{}, props:{}, colapso:{}, ordem:{}}
  var PREFS_ESTADO = 'nao-carregado';  // nao-carregado | ausente | ok | torto | sem-rede
  var PREFS_AVISOS = [];
  var PREFS_TOKEN = null;

  // ---- spec 2026-09-qg-redesenho-2 (T3, criterio 9) -------------------------
  // Instrucao de terminal (copiar pasta, rodar `node ...`) so faz sentido em
  // quem tem o repo aberto na maquina. A nuvem serve o MESMO app.js (decisao
  // D-E5-3) — o jeito de distinguir nao e outra flag nova, e o que ja existe:
  // o `hub/serve.js` local injeta `<meta name="qg-token">` na pagina (grep
  // `qg-token` em hub/serve.js); a pagina Next do SaaS nunca injeta essa meta.
  // Puro por DOM, sem esperar rede nenhuma, antes de qualquer pintura.
  var LOCAL = !!document.querySelector('meta[name="qg-token"]');
  /** Texto que só faz sentido com terminal à mão × frase equivalente para
   *  quem só tem o navegador (critério 9 — zero instrução de shell na nuvem). */
  function soLocal(htmlLocal, htmlNuvem) { return LOCAL ? htmlLocal : htmlNuvem; }

  /** "arvys.agrupa.fila" -> {grupo:'agrupa', chave:'fila'} · null se nao for do arquivo. */
  function fatiaChave(chave) {
    var m = /^arvys\.(visao|agrupa|props|colapso|ordem)\.(.+)$/.exec(String(chave || ''));
    return m ? { grupo: m[1], chave: m[2] } : null;
  }

  function guarda(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* aba anonima: seguir sem memoria */ }
    // o arquivo e a fonte: toda escrita local tenta subir. Se o POST falhar, a
    // tela avisa (nunca finge que gravou) — o cache local continua valendo.
    var f = fatiaChave(chave);
    if (f) enviaPref(f.grupo, f.chave, valor);
  }
  function lembra(chave) {
    var f = fatiaChave(chave);
    if (f && PREFS_ARQ && PREFS_ARQ[f.grupo] && Object.prototype.hasOwnProperty.call(PREFS_ARQ[f.grupo], f.chave)) {
      var doArquivo = PREFS_ARQ[f.grupo][f.chave];
      var v = typeof doArquivo === 'string' ? doArquivo : JSON.stringify(doArquivo);
      var local = null;
      try { local = localStorage.getItem(chave); } catch (e) { local = null; }
      if (local !== null && local !== v && PREFS_AVISOS.indexOf(chave) < 0) PREFS_AVISOS.push(chave);
      return v;   // o arquivo ganha
    }
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  /**
   * Carrega o arquivo de preferencias ANTES da primeira pintura. Se falhar, a
   * tela nasce igual — com o cache local — e o aviso aparece. Nada aqui bloqueia
   * o QG: preferencia e conforto, nao dado do escritorio.
   */
  function carregaPrefs() {
    var meta = document.querySelector('meta[name="qg-token"]');
    PREFS_TOKEN = meta ? meta.getAttribute('content') : null;
    if (!window.fetch) { PREFS_ESTADO = 'sem-rede'; return Promise.resolve(); }
    return fetch('/api/prefs').then(function (r) { return r.json(); }).then(function (j) {
      var p = j && j.prefs;
      if (!p) { PREFS_ESTADO = 'sem-rede'; return; }
      if (p.ok === false) {
        PREFS_ESTADO = 'torto';
        PREFS_AVISOS.push('arquivo: ' + (p.erro || 'ilegível'));
        return;
      }
      if (!p.data) { PREFS_ESTADO = 'ausente'; return; }
      PREFS_ARQ = p.data.qg || {};
      PREFS_ESTADO = 'ok';
      if (p.data.deVersaoFutura) PREFS_AVISOS.push('o arquivo veio de uma versão mais nova do QG — apliquei o que entendo');
      if (p.data.ignoradas && p.data.ignoradas.length) {
        PREFS_AVISOS.push('não entendi (e não apaguei): ' + p.data.ignoradas.join(', '));
      }
    }).catch(function (e) {
      PREFS_ESTADO = 'sem-rede';
      PREFS_AVISOS.push('não consegui ler as preferências: ' + String(e && e.message));
    });
  }

  /** Sobe UMA preferencia. Erro e visivel; sucesso e silencioso, como deve ser. */
  function enviaPref(grupo, chave, valor) {
    if (!window.fetch || !PREFS_TOKEN) return;
    var v = valor;
    if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) {
      try { v = JSON.parse(v); } catch (e) { /* string mesmo */ }
    }
    var pacote = {};
    pacote[grupo] = {};
    pacote[grupo][chave] = v;
    // mescla o que ja esta em memoria, para nao apagar irmao do mesmo grupo
    if (PREFS_ARQ && PREFS_ARQ[grupo]) pacote[grupo] = Object.assign({}, PREFS_ARQ[grupo], pacote[grupo]);
    fetch('/api/prefs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: PREFS_TOKEN, qg: pacote })
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        if (o.s === 200 && o.j && o.j.ok) {
          PREFS_ARQ = (o.j.prefs && o.j.prefs.data && o.j.prefs.data.qg) || PREFS_ARQ;
          return;
        }
        var msg = 'não gravei a preferência: ' + ((o.j && (o.j.detalhe || o.j.erro)) || o.s);
        if (PREFS_AVISOS.indexOf(msg) < 0) { PREFS_AVISOS.push(msg); pinta(); }
      }).catch(function (e) {
        var msg = 'não gravei a preferência: ' + String(e && e.message);
        if (PREFS_AVISOS.indexOf(msg) < 0) { PREFS_AVISOS.push(msg); pinta(); }
      });
  }

  // ---- T11 · a tela percebe quando o escritório muda ----------------------
  // O QG lê o arquivo — não há segunda cópia. Mas a tela só descobria a mudança
  // no F5, e foi assim que o cartão "Pulse: 5 achados" ficou 12 h no ar depois
  // de virar 2. Aqui ela pergunta de tempos em tempos e **avisa**.
  //
  // A regra: **avisar, nunca recarregar sozinho.** Recarga automática apagaria
  // o filtro, a rolagem e a gaveta abertos — é a forma mais rápida de fazer o
  // dono odiar a tela.
  var MUDANCA_MS = 20000;
  var mudancaBase = null;      // carimbo de quando esta tela foi montada
  var mudancaNova = null;      // {em, arquivo} mais recente que a base
  var mudancaTimer = null;
  var mudancaMorta = false;    // servidor fora do ar: para de perguntar

  function olhaMudanca() {
    if (mudancaMorta || !window.fetch) return;
    // T11.3: aba escondida não bate no servidor — ninguém está olhando.
    if (document.hidden) return;
    fetch('/api/mudanca').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.em) return;
      if (!mudancaBase) { mudancaBase = j.em; return; }
      if (j.em > mudancaBase && (!mudancaNova || j.em > mudancaNova.em)) {
        mudancaNova = { em: j.em, arquivo: j.arquivo };
        pintaAvisoMudanca();
      }
    }).catch(function () {
      // T11.4: servidor fora do ar não vira erro na cara nem laço de tentativa.
      mudancaMorta = true;
      if (mudancaTimer) clearInterval(mudancaTimer);
      pintaAvisoMudanca();
    });
  }

  function pintaAvisoMudanca() {
    var alvo = document.getElementById('aviso-mudanca');
    if (!alvo) {
      alvo = document.createElement('div');
      alvo.id = 'aviso-mudanca';
      alvo.className = 'aviso-mudanca';
      document.body.appendChild(alvo);
    }
    if (mudancaMorta) {
      alvo.innerHTML = '<span>Perdi contato com o servidor do QG — o que está na tela é de antes.</span>';
      alvo.classList.add('frio');
      return;
    }
    if (!mudancaNova) { alvo.remove(); return; }
    alvo.classList.remove('frio');
    alvo.innerHTML = '<span><strong>O escritório mudou</strong>' +
      (mudancaNova.arquivo ? ' — <code>' + esc(mudancaNova.arquivo) + '</code>' : '') + '.</span>' +
      '<button type="button" class="btn" id="btn-recarregar">Atualizar a tela</button>' +
      '<button type="button" class="btn fantasma" id="btn-ignorar">Agora não</button>';
    document.getElementById('btn-recarregar').onclick = function () { location.reload(); };
    document.getElementById('btn-ignorar').onclick = function () {
      // "agora não" adota o carimbo novo como base: ele não volta a avisar pelo
      // mesmo motivo, e volta a avisar na PRÓXIMA mudança.
      mudancaBase = mudancaNova.em;
      mudancaNova = null;
      pintaAvisoMudanca();
    };
  }

  function ligaMudanca() {
    olhaMudanca();
    mudancaTimer = setInterval(olhaMudanca, MUDANCA_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) olhaMudanca(); });
  }

  /** 1234567 -> "1.234.567" */
  function fmtN(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toLocaleString('pt-BR');
  }
  /** 2198729821 -> "2,20 Bi" — token cru nunca aparece na tela. */
  function fmtTok(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    if (n >= 1e9) return (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' Bi';
    if (n >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return fmtN(n);
  }
  function fmtBytes(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
    if (n >= 1024) return Math.round(n / 1024).toLocaleString('pt-BR') + ' KB';
    return n + ' B';
  }
  function plural(n, um, muitos) { return n === 1 ? um : muitos; }

  function hojeISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dia;
  }
  /** "2026-09-06" -> "6 de setembro" (data-only nunca vira instante — gotcha 7). */
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataLonga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return esc(iso);
    return Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1];
  }
  function diasEntre(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var a = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var h = hojeISO().split('-');
    var b = Date.UTC(Number(h[0]), Number(h[1]) - 1, Number(h[2]));
    return Math.round((b - a) / 86400000);
  }
  function idade(dias) {
    if (dias === null || dias === undefined) return 'sem data';
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    return 'há ' + dias + ' dias';
  }

  // =========================================================================
  // 2. jargao do escritorio — explicacao na 1a ocorrencia de cada tela
  // =========================================================================

  var JARGAO = {
    'L1': 'O resumo de uma linha que cada agente deixa ao fechar a sessão: onde ele parou e o que ficou de pé.',
    'gate': 'A parada obrigatória onde o dono lê e aprova antes do trabalho seguir. Nada passa do gate sozinho.',
    'FPY': 'First Pass Yield — quanto do trabalho passou de primeira, sem precisar de retrabalho.',
    'gotcha': 'Uma regra que o escritório aprendeu errando. Cada gotcha tem um precedente real por trás.',
    'spec': 'O pacote de decisão de uma iniciativa: o que é (spec), como se faz (plan) e o checklist (tasks).',
    'worker': 'Um script que roda sozinho de madrugada e escreve os números que este QG lê.',
    'ritual': 'Um comando /arvys:* que o dono roda para abrir o dia, abrir sessão com um agente, ou fechar.',
    'incidente': 'Um erro que já aconteceu, escrito para não acontecer de novo. Vira lei na retrospectiva.',
    'cache read': 'Tokens relidos do contexto já enviado. É a maior parte do gasto e custa bem menos que token novo.',
    'boletim': 'As 7 linhas medidas de cada agente: gates de primeira, defeitos, incidentes, sessões, tokens, feedbacks e escopo.'
  };
  var jaExplicado = Object.create(null);
  function resetJargao() { jaExplicado = Object.create(null); }

  // T7 (decisao G3) · o glossario agora vem de company/GLOSSARIO.md. O objeto
  // JARGAO acima continua como DEGRADACAO: se o arquivo faltar ou estiver
  // torto, a tela nao perde as 10 explicacoes que ja tinha.
  function glossario() {
    var g = DADOS && DADOS.biblioteca && DADOS.biblioteca.glossario;
    return (g && g.ok && g.data && g.data.termos) ? g.data.termos : null;
  }
  // spec 2026-09-biblioteca (T4): o glossário PARA LEIGOS (capítulo 05, lido
  // por `readBiblioteca`) é consultado ANTES do vocabulário da marca — a
  // analogia curta é o que o vibecoder precisa ao passar o mouse. Índice sem
  // acento/caixa, chaveado pelo termo leigo E pelo termo da marca que ele
  // aponta; recalculado só quando o objeto de origem troca (novo DADOS).
  var LEIGO_CACHE = { fonte: null, idx: null };
  function glossarioLeigo() {
    var m = DADOS && DADOS.biblioteca && DADOS.biblioteca.manual;
    var g = m && m.ok && m.data && m.data.glossarioLeigo && m.data.glossarioLeigo.termos;
    if (!g) return null;
    if (LEIGO_CACHE.fonte === g) return LEIGO_CACHE.idx;
    var idx = Object.create(null);
    Object.keys(g).forEach(function (k) {
      var v = g[k] || {};
      idx[bibNorm(k)] = v;
      if (v.marca && !idx[bibNorm(v.marca)]) idx[bibNorm(v.marca)] = v;
    });
    LEIGO_CACHE = { fonte: g, idx: idx };
    return idx;
  }
  function defDe(termo) {
    var g = glossario();
    var marca = g && g[termo] ? g[termo].def : (JARGAO[termo] || null);
    var leigo = glossarioLeigo();
    var l = leigo && leigo[bibNorm(termo)];
    if (l && l.analogia) return l.analogia + (marca ? ' · ' + marca : '');
    return marca;
  }

  /** J('gate') -> termo explicado na 1a vez; texto puro depois. */
  function J(termo, rotulo) {
    var txt = rotulo || termo;
    var def = defDe(termo);
    if (!def || jaExplicado[termo]) return esc(txt);
    jaExplicado[termo] = true;
    // `title` continua para o mouse, MAS o Echo apontou o furo: tooltip nao
    // existe no toque. Por isso o termo tambem abre a folha do glossario ao ser
    // clicado/acionado — e a folha inteira tem tecla propria (`G`).
    return '<button type="button" class="jarg" data-glos="' + esc(termo) + '" title="' + esc(def) + '">' +
      esc(txt) + '</button>';
  }

  // =========================================================================
  // 3. markdown minimo, por parser proprio
  //    O que ele nao entende vira paragrafo com o texto CRU escapado.
  //    Nao ha innerHTML de texto de arquivo em lugar nenhum sem passar por aqui.
  // =========================================================================

  function inline(txt) {
    var s = esc(txt);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    // link vira texto + endereco em code: nao criamos <a> a partir de arquivo do disco.
    // EXCEÇÃO fechada (spec 2026-09-biblioteca, T4): link INTERNO do manual —
    // `0N-capitulo.md[#ancora]`, `#ancora` (mesmo capítulo) ou a rota
    // `#/biblioteca/...` — vira `<a>` para a rota do QG. O leitor já validou
    // que capítulo e âncora existem (R5); aqui só aceitamos [a-z0-9-] no
    // destino, então nunca sai `javascript:` nem host externo daqui.
    s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, function (tudo, txt, url) {
      var cap = /^(\d{2}-[a-z0-9-]+)\.md(?:#([a-z0-9-]+))?$/.exec(url);
      if (cap) return '<a class="ln-int" href="#/biblioteca/' + cap[1] + (cap[2] ? '/' + cap[2] : '') + '">' + txt + '</a>';
      var rota = /^#\/biblioteca(?:\/[a-z0-9-]+){0,2}$/.exec(url);
      if (rota) return '<a class="ln-int" href="' + url + '">' + txt + '</a>';
      var anc = /^#([a-z0-9-]+)$/.exec(url);
      if (anc) return '<a class="ln-int" href="#bib-' + anc[1] + '" data-bib-anc="' + anc[1] + '">' + txt + '</a>';
      return txt + ' <code>' + url + '</code>';
    });
    // D4 (review T8): negrito que o autor abriu e nao fechou sobrava na tela
    // como `**` solto (visto na gaveta, com markdown deliberadamente torto).
    // Depois do par acima, todo `**` restante e marcacao orfa — nao e texto.
    s = s.replace(/\*\*/g, '');
    return s;
  }

  function md(texto, limiteLinhas) {
    var bruto = String(texto === null || texto === undefined ? '' : texto).replace(/\r\n?/g, '\n');
    if (!bruto.trim()) return '';
    var linhas = bruto.split('\n');
    var cortado = false;
    if (limiteLinhas && linhas.length > limiteLinhas) { linhas = linhas.slice(0, limiteLinhas); cortado = true; }

    var out = [];
    var i = 0;
    while (i < linhas.length) {
      var l = linhas[i];

      // bloco de codigo cercado — conteudo sai cru (escapado), sem interpretacao
      var cerca = /^\s*```(.*)$/.exec(l);
      if (cerca) {
        var corpo = [];
        i++;
        while (i < linhas.length && !/^\s*```/.test(linhas[i])) { corpo.push(linhas[i]); i++; }
        i++;
        out.push('<pre><code>' + esc(corpo.join('\n')) + '</code></pre>');
        continue;
      }
      // titulo
      var t = /^(#{1,6})\s+(.*)$/.exec(l);
      if (t) {
        var n = Math.min(t[1].length + 1, 4);
        out.push('<h' + n + '>' + inline(t[2]) + '</h' + n + '>');
        i++; continue;
      }
      // regua
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      // citacao
      if (/^\s*>\s?/.test(l)) {
        var cit = [];
        while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) { cit.push(linhas[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + md(cit.join('\n')) + '</blockquote>');
        continue;
      }
      // lista (com ou sem numeracao); item de lista que nao fecha e so um item longo
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        var ordenada = /^\s*\d+[.)]\s+/.test(l);
        var itens = [];
        while (i < linhas.length && (/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i]) || /^\s{2,}\S/.test(linhas[i]))) {
          if (/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) {
            itens.push(linhas[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
          } else if (itens.length) {
            itens[itens.length - 1] += '\n' + linhas[i].trim();
          }
          i++;
        }
        var tag = ordenada ? 'ol' : 'ul';
        out.push('<' + tag + '>' + itens.map(function (x) {
          return '<li>' + inline(x.replace(/\n/g, ' ')) + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }
      // tabela GFM (spec 2026-09-biblioteca, T4): cabeçalho + linha `|---|` +
      // linhas viram <table class="tab"> (a mesma pele de `tabelaOrd`), cada
      // célula por `inline()` — logo escapada (R8). Sem a linha separadora não
      // é tabela: sai crua e legível, como antes. Dentro de ``` nunca chega
      // aqui (a cerca é tratada acima).
      if (/^\s*\|/.test(l)) {
        var tabela = [];
        while (i < linhas.length && /^\s*\|/.test(linhas[i])) { tabela.push(linhas[i]); i++; }
        if (tabela.length >= 2 && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(tabela[1])) {
          // Review B: `\|` é barra literal dentro da célula (GFM), e célula
          // além do cabeçalho NÃO some — a tabela alarga (th vazio) para a
          // célula excedente aparecer em vez de sumir em silêncio.
          var celulas = function (linha) {
            return linha.trim().replace(/^\|/, '').replace(/([^\\])\|$/, '$1').replace(/\\\|/g, ' ')
              .split('|').map(function (c) { return inline(c.replace(/ /g, '|').trim()); });
          };
          var cab = celulas(tabela[0]);
          var linhasTab = tabela.slice(2).map(celulas);
          var nCol = cab.length;
          linhasTab.forEach(function (cs) { if (cs.length > nCol) nCol = cs.length; });
          while (cab.length < nCol) cab.push('');
          var corpoTab = linhasTab.map(function (cs) {
            while (cs.length < nCol) cs.push('');
            return '<tr>' + cs.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
          }).join('');
          out.push('<div class="tab-rolo"><table class="tab md-tab"><thead><tr>' +
            cab.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + corpoTab + '</tbody></table></div>');
        } else {
          out.push('<p class="cru">' + esc(tabela.join('\n')) + '</p>');
        }
        continue;
      }
      // paragrafo
      if (!l.trim()) { i++; continue; }
      var par = [];
      while (i < linhas.length && linhas[i].trim() && !/^\s*(#{1,6}\s|>|\||```)/.test(linhas[i]) &&
             !/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) { par.push(linhas[i]); i++; }
      // D4: um paragrafo que era so marcacao orfa (`**`) vira vazio — nao
      // desenhamos um <p> em branco por causa dele.
      var htmlPar = inline(par.join(' '));
      if (htmlPar.trim()) out.push('<p>' + htmlPar + '</p>');
    }
    if (cortado) out.push('<p class="cru">… (texto cortado; o arquivo continua no disco)</p>');
    return out.join('');
  }

  // =========================================================================
  // 4. blocos reutilizaveis
  // =========================================================================

  function vazio(titulo, texto, caminho) {
    return '<div class="vazio"><h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p>' +
      (caminho ? '<p class="caminho">Para resolver: ' + caminho + '</p>' : '') + '</div>';
  }

  /**
   * Motivo de leitura em UMA linha curta (T3, critério 7): sem stack, sem
   * "SyntaxError at…", sem o texto cru do arquivo. `res.erro` hoje já é
   * `String(Error)` (nome + mensagem, nunca a pilha — ver hub/lib/readers.js),
   * mas isto se defende de qualquer variação: só a primeira linha, sem o
   * prefixo técnico do nome da exceção, com teto de tamanho.
   */
  function motivoCurto(erro) {
    var s = String(erro || 'arquivo ilegível').split('\n')[0]
      .replace(/^\s*[A-Za-z]*Error:\s*/, '')
      .replace(/\s+at\s+.*$/i, '')
      .trim();
    if (!s) s = 'arquivo ilegível';
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  }

  function torto(res, oQue) {
    return '<div class="torto"><h3>Não consegui ler ' + esc(oQue) + ' — o resto da tela segue</h3>' +
      '<p>' + esc(motivoCurto(res && res.erro)) + '</p></div>';
  }

  /**
   * Contrato dos leitores (T2): {ok:true,data} · {ok:true,data:null} (ausente) ·
   * {ok:false,raw,erro} (torto). Vazio nunca e erro, e erro nunca derruba a secao.
   *
   * T9/R8 (review adversarial): quando o servidor manda `res.motivo` junto
   * com `data:null`, ELE é quem sabe a verdade (ex.: readEsforco na nuvem —
   * "esta seção não tem fonte na nuvem" — ou o envelope de rota sem push —
   * "este escritório ainda não recebeu push nenhum"). `cfgVazio.texto` e
   * `cfgVazio.caminho` foram escritos pensando no caso LOCAL (disco sem a
   * trilha ainda, onde "abra uma sessão do Claude Code" é seguível) — na
   * nuvem essa instrução é impossível e o texto mente por omissão. Por isso
   * o texto fixo só vale quando não há motivo nenhum; havendo motivo, ele
   * substitui o texto e o caminho some (nada de inventar instrução nova por
   * cima do que o servidor mandou).
   */
  function leitura(res, oQue, render, cfgVazio) {
    if (!res) return vazio(cfgVazio.titulo, cfgVazio.texto, cfgVazio.caminho);
    if (res.ok === false) return torto(res, oQue);
    if (res.data === null || res.data === undefined) {
      if (res.motivo) return vazio(cfgVazio.titulo, res.motivo, null);
      return vazio(cfgVazio.titulo, cfgVazio.texto, cfgVazio.caminho);
    }
    return render(res.data, res);
  }

  function num(rotulo, valor, unidade, comparacao, tom) {
    return '<div class="num' + (tom ? ' n-' + tom : '') + '">' +
      '<span class="num-rot">' + rotulo + '</span>' +
      '<span class="num-val">' + valor + (unidade ? '<span class="un">' + esc(unidade) + '</span>' : '') + '</span>' +
      '<span class="num-cmp">' + comparacao + '</span></div>';
  }

  function cartao(inner, extraClasse) {
    return '<section class="cartao' + (extraClasse ? ' ' + extraClasse : '') + '">' + inner + '</section>';
  }
  function tituloBloco(t, sub) {
    return '<div class="titulo-bloco"><h2>' + t + '</h2>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>';
  }
  function barra(pct, tom) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    // escala por transform (--fr), nunca por width: animar largura recalcula layout a cada quadro
    return '<div class="barra' + (tom ? ' b-' + tom : '') + '"><i style="--fr:' + (p / 100) + '"></i></div>';
  }

  // =========================================================================
  // 4b. T10 / E1 — os tres padroes que o dono ja esperava
  //     (1) acionamento no clicavel  (2) janela de detalhamento (gaveta)
  //     (3) 3+ formas de visualizacao por secao com lista
  //
  //  Regras que estas pecas honram:
  //   - trocar de visao NAO refaz fetch: a visao e so estado local + repintura,
  //     e todo dado ja veio de DADOS/PESADAS/LIVE (contador em REDE prova isso);
  //   - a escolha de visao persiste por secao no localStorage, em try/catch;
  //   - a gaveta nunca troca de pagina (nao mexe no hash) e nao repinta o palco,
  //     entao a posicao da lista e a rolagem ficam onde estavam.
  // =========================================================================

  /** Registro aberto pela gaveta: preenchido a cada pintura, chave "tipo:id". */
  var REGISTROS = Object.create(null);
  var gavetaOrigem = null;

  function registra(tipo, id, reg) {
    var chave = tipo + ':' + id;
    reg.tipo = tipo;
    REGISTROS[chave] = reg;
    return chave;
  }

  /** Botao que abre a gaveta. `rotuloHtml` ja vem escapado por quem chama. */
  function abridor(chave, rotuloHtml, classe) {
    return '<button type="button" class="abre' + (classe ? ' ' + classe : '') +
      '" data-abre="' + esc(chave) + '">' + rotuloHtml + '</button>';
  }

  /** Cartao clicavel usado nas visoes "cartoes" e "quadro". */
  function mini(chave, tituloHtml, metaHtml, corpoHtml) {
    return '<button type="button" class="mini" data-abre="' + esc(chave) + '">' +
      (metaHtml ? '<span class="mini-m">' + metaHtml + '</span>' : '') +
      '<span class="mini-t">' + tituloHtml + '</span>' +
      (corpoHtml ? '<span class="mini-c">' + corpoHtml + '</span>' : '') +
      '<span class="mini-abrir" aria-hidden="true">abrir →</span></button>';
  }

  function focaveisDa(raiz) {
    return Array.prototype.slice.call(raiz.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetWidth || el.offsetHeight || el === document.activeElement; });
  }

  function gavetaAberta() {
    var g = document.getElementById('gaveta');
    return !!(g && !g.hidden);
  }

  // ---- T4 · propriedades e ações da janela de detalhamento -----------------
  var gavetaChave = null;

  /**
   * `reg.props`: [{rot, val}] — `val` e HTML JA ESCAPADO por quem produz, na
   * mesma regra de `titulo`/`sub`. Campo sem valor mostra "—" em vez de sumir:
   * a ausencia e informacao ("este item nao declara projeto"), nao um buraco.
   */
  function blocoProps(reg) {
    var ps = reg.props || [];
    if (!ps.length) return '';
    return '<dl class="gav-props">' + ps.map(function (p) {
      return '<dt>' + esc(p.rot) + '</dt><dd>' + (p.val || '<span class="item-meta">—</span>') + '</dd>';
    }).join('') + '</dl>';
  }

  /**
   * Copia texto e confirma NO PROPRIO BOTAO. `navigator.clipboard` nao existe
   * fora de contexto seguro em alguns navegadores; o caminho velho
   * (textarea + execCommand) fica como degradacao, e se os dois falharem o
   * botao diz que falhou — nunca finge que copiou.
   */
  function copiaTexto(txt, botao) {
    function avisa(ok) {
      if (!botao) return;
      var antes = botao.textContent;
      botao.textContent = ok ? 'copiado ✓' : 'não consegui copiar';
      botao.classList.add(ok ? 'gav-ok' : 'gav-erro');
      setTimeout(function () {
        botao.textContent = antes;
        botao.classList.remove('gav-ok', 'gav-erro');
      }, 1400);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { avisa(true); }, function () { avisa(velho()); });
        return;
      }
    } catch (e) { /* cai no caminho velho */ }
    avisa(velho());
    function velho() {
      try {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }
  }

  /** `reg.acoes`: [{rot, copiar}] — por ora so "copiar para a area de transferencia". */
  function montaAcoes(reg) {
    var pe = document.getElementById('gaveta-acoes');
    if (!pe) return;
    var acoes = reg.acoes || [];
    pe.innerHTML = acoes.map(function (a, i) {
      return '<button type="button" class="gav-b" data-acao="' + i + '">' + esc(a.rot) + '</button>';
    }).join('');
    pe.__acoes = acoes;
  }

  function abreGaveta(chave, origem) {
    var reg = REGISTROS[chave];
    if (!reg) return;
    var g = $('#gaveta');
    gavetaOrigem = origem || document.activeElement;
    // R5-b (review T8): este campo é TEXTO PURO, não HTML — por isso os
    // produtores concatenam nome de agente e caminho de arquivo sem esc(),
    // ao contrário de titulo/sub/corpo logo abaixo, que são HTML já escapado.
    // O `...Texto` no nome é a guarda: quem trocar esta linha por innerHTML
    // (para pôr um ícone no rótulo, por exemplo) tem de renomear o campo nos
    // 7 produtores e passar cada um por esc() — reabrir XSS armazenado via o
    // callsign do AGENT.md deixa de ser silencioso.
    $('#gaveta-tipo').textContent = reg.rotuloTipoTexto || '';
    $('#gaveta-titulo').innerHTML = reg.titulo || '';
    $('#gaveta-sub').innerHTML = reg.sub || '';
    // T4 · o bloco de propriedades vem ANTES do texto: quem abre um item quer
    // primeiro saber de que projeto e, de onde no disco veio e o que fazer com
    // ele — a prosa e o segundo passo, nao o primeiro.
    gavetaChave = chave;
    $('#gaveta-corpo').innerHTML = blocoProps(reg) +
      (typeof reg.corpo === 'function' ? reg.corpo() : (reg.corpo || '')) ;
    montaAcoes(reg);
    $('#gaveta-corpo').scrollTop = 0;
    $('#gaveta-veu').hidden = false;
    g.hidden = false;
    document.body.classList.add('com-gaveta');
    // a classe entra no quadro seguinte para a transicao de entrada acontecer
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () { g.classList.add('aberta'); });
    else g.classList.add('aberta');
    $('#gaveta-x').focus();
  }

  function fechaGavetaDet() {
    if (!gavetaAberta()) return;
    // Review B (spec 2026-09-biblioteca): a gaveta de capítulo aberta pela
    // rota `#/biblioteca/<cap>…` devolve o endereço a `#/biblioteca` ao fechar
    // — sem `hashchange` (replaceState), logo sem repintura: filtro, visão e
    // rolagem ficam (R7). Assim clicar o MESMO endereço de novo é mudança de
    // hash de verdade e reabre; e uma repintura por filtro não reabre nada,
    // porque a rota já não tem capítulo. `BIB_ROTA_APLICADA` zera junto.
    if (gavetaChave && /^cap:/.test(gavetaChave) &&
        String(location.hash).indexOf('#/biblioteca/' + gavetaChave.slice(4)) === 0) {
      BIB_ROTA_APLICADA = null;
      try { history.replaceState(null, '', location.pathname + location.search + '#/biblioteca'); }
      catch (e) { /* sem history: a marca zerada já basta para o próximo hashchange */ }
      rotaAtual = rotaDoHash();
    }
    var g = $('#gaveta');
    g.classList.remove('aberta');
    g.hidden = true;
    $('#gaveta-veu').hidden = true;
    document.body.classList.remove('com-gaveta');
    var volta = gavetaOrigem;
    gavetaOrigem = null;
    // devolve o foco ao item de origem — se ele sobreviveu a uma repintura
    if (volta && document.contains(volta)) { try { volta.focus(); } catch (e) { /* elemento sem foco */ } }
    else { try { $('#conteudo').focus(); } catch (e) { /* nada a focar */ } }
  }

  // ---------- (3) formas de visualizacao -----------------------------------

  var VISOES = Object.create(null);
  var ICO_VIS = {
    tabela: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12M6.5 6.5V13"/></svg>',
    cartoes: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="5" rx="1"/><rect x="2" y="8.5" width="5" height="5" rx="1"/><rect x="9" y="8.5" width="5" height="5" rx="1"/></svg>',
    quadro: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="3.6" height="11" rx="1"/><rect x="6.2" y="2.5" width="3.6" height="7.5" rx="1"/><rect x="10.4" y="2.5" width="3.6" height="9.5" rx="1"/></svg>',
    linha: '<svg viewBox="0 0 16 16"><path d="M4 2.5v11"/><circle cx="4" cy="5" r="1.6"/><circle cx="4" cy="11" r="1.6"/><path d="M7.5 5h6M7.5 11h4"/></svg>'
  };
  var NOME_VIS = { tabela: 'Tabela', cartoes: 'Cartões', quadro: 'Quadro', linha: 'Linha do tempo' };

  /** Visao corrente da secao; le do localStorage na 1a vez, valida contra a lista. */
  function visaoDe(secao, validas, padrao) {
    if (VISOES[secao] && validas.indexOf(VISOES[secao]) >= 0) return VISOES[secao];
    var v = lembra('arvys.visao.' + secao);
    if (validas.indexOf(v) < 0) v = padrao;
    VISOES[secao] = v;
    return v;
  }
  function guardaVisao(secao, v) {
    VISOES[secao] = v;
    guarda('arvys.visao.' + secao, v);
  }

  // ---- spec 2026-09-qg-redesenho (T3): agrupar, ordenar, escolher colunas ---
  // Tudo com o mesmo cuidado do tema: valor guardado que nao existe mais cai no
  // padrao, e `lembra`/`guarda` ja engolem localStorage bloqueado.
  var AGRUPA = Object.create(null);   // id da tabela -> chave de agrupamento
  var COLAPSO = Object.create(null);  // id + '|' + rotulo -> true (grupo fechado)
  var PROPS = Object.create(null);    // id da tabela -> {coluna: false} (oculta)

  function agrupamentoDe(id, validos, padrao) {
    if (AGRUPA[id] && validos.indexOf(AGRUPA[id]) >= 0) return AGRUPA[id];
    var g = lembra('arvys.agrupa.' + id);
    if (validos.indexOf(g) < 0) g = padrao;
    AGRUPA[id] = g;
    return g;
  }
  function guardaAgrupamento(id, g) {
    AGRUPA[id] = g;
    guarda('arvys.agrupa.' + id, g);
  }

  /** Colunas visiveis: tudo visivel por padrao; o que o dono desliga fica guardado. */
  function propsDe(id) {
    if (PROPS[id]) return PROPS[id];
    var salvo = {};
    var cru = lembra('arvys.props.' + id);
    if (cru) {
      try {
        var o = JSON.parse(cru);
        if (o && typeof o === 'object') salvo = o;
      } catch (e) { salvo = {}; }   // valor de versao antiga: ignora, nao quebra
    }
    PROPS[id] = salvo;
    return salvo;
  }
  function alternaProp(id, col) {
    var p = propsDe(id);
    p[col] = p[col] === false ? true : false;
    PROPS[id] = p;
    try { guarda('arvys.props.' + id, JSON.stringify(p)); } catch (e) { /* nada */ }
  }
  /**
   * Visível por padrão, menos as marcadas `padraoOculta` (T6.1) — que só
   * aparecem se o dono LIGAR. `PADRAO_OCULTA` é preenchido por quem monta a
   * tabela; a escolha do dono, quando existe, ganha dos dois.
   */
  var PADRAO_OCULTA = Object.create(null);
  function colunaVisivel(id, col) {
    var p = propsDe(id);
    if (Object.prototype.hasOwnProperty.call(p, col)) return p[col] !== false;
    return !PADRAO_OCULTA[id + '|' + col];
  }

  // ---- T6.7 (o que ficou da T2.3) · ordem e colapso deixam de morrer na aba --
  // `ORD` e `COLAPSO` viviam só em memória: fechava um grupo, dava F5, abria; e
  // a ordem padrão era alfabética — a queixa que abriu a spec anterior.
  function ordemDe(id, padrao) {
    if (ORD[id]) return ORD[id];
    var cru = lembra('arvys.ordem.' + id);
    if (cru) {
      try {
        var o = JSON.parse(cru);
        if (o && typeof o.col === 'string' && (o.dir === 1 || o.dir === -1)) { ORD[id] = o; return o; }
      } catch (e) { /* valor de versao antiga: cai no padrao */ }
    }
    ORD[id] = padrao;
    return padrao;
  }
  function guardaOrdem(id) {
    try { guarda('arvys.ordem.' + id, JSON.stringify(ORD[id])); } catch (e) { /* nada */ }
  }
  function colapsoInicial() {
    var cru = lembra('arvys.colapso.qg');
    if (!cru) return;
    try {
      var o = JSON.parse(cru);
      if (o && typeof o === 'object') for (var k in o) if (o[k] === true) COLAPSO[k] = true;
    } catch (e) { /* nada */ }
  }
  function guardaColapso() {
    var so = {};
    for (var k in COLAPSO) if (COLAPSO[k] === true) so[k] = true;
    try { guarda('arvys.colapso.qg', JSON.stringify(so)); } catch (e) { /* nada */ }
  }

  /**
   * A barra ÚNICA de controles (pedido do dono, 2026-09-06: *"cabeçalho muito
   * carregado… gosto de espaço, uma única linha de menus"*).
   *
   * Antes eram SETE faixas empilhadas e 462 px até a primeira linha de dado:
   * abas · visualizações · "o que é isto" · espera · contagem+chips ·
   * agrupar+colunas · busca+nota.
   *
   * Agora: uma linha. O que era faixa virou menu que só ocupa espaço quando
   * aberto — e o menu fecha ao escolher, no clique fora e no Esc.
   */
  function menu(id, rotulo, resumo, corpo) {
    var aberto = MENU_ABERTO === id;
    return '<details class="menu-x"' + (aberto ? ' open' : '') + ' data-menu="' + esc(id) + '">' +
      '<summary class="btn">' + esc(rotulo) +
      (resumo ? '<span class="menu-resumo">' + esc(resumo) + '</span>' : '') +
      '<span class="menu-seta" aria-hidden="true">▾</span></summary>' +
      '<div class="menu-corpo">' + corpo + '</div></details>';
  }
  var MENU_ABERTO = null;

  /** As opções de exibição, agora dentro de UM menu: visão · agrupar · colunas. */
  function barraDisplay(id, grupos, atual, colunas, secaoVis, visValidas, visAtual) {
    var linhas = [];
    if (secaoVis) {
      linhas.push('<div class="menu-g"><span class="menu-rot">Ver como</span>' +
        visValidas.map(function (v) {
          var on = v === visAtual;
          return '<button type="button" class="disp-b' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
            ' data-visao="' + esc(secaoVis + '|' + v) + '">' + esc(NOME_VIS[v]) + '</button>';
        }).join('') + '</div>');
    }
    linhas.push('<div class="menu-g"><span class="menu-rot">Agrupar por</span>' +
      grupos.map(function (o) {
        var on = o.c === atual;
        return '<button type="button" class="disp-b' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
          ' data-agrupa="' + esc(id + '|' + o.c) + '">' + esc(o.rot) + '</button>';
      }).join('') + '</div>');
    // T6.4 · era "Propriedades". O estranho: "pra mim é o menu de botão direito
    // do Windows. Se tivesse escrito COLUNAS, eu acertava de primeira."
    if (colunas.length) {
      linhas.push('<div class="menu-g"><span class="menu-rot">Colunas</span>' +
        colunas.map(function (c) {
          var on = colunaVisivel(id, c.c);
          return '<button type="button" class="disp-b' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
            ' data-prop="' + esc(id + '|' + c.c) + '">' + (on ? '✓ ' : '') + esc(c.rot) + '</button>';
        }).join('') + '</div>');
    }
    return linhas.join('');
  }

  /**
   * A MESMA faixa do Trabalho, para qualquer seção: visões + busca + contagem
   * em UMA linha (pedido do dono, 2026-09-06 — "limpeza de espaço, organização
   * de menu, frases numa linha só em todos os módulos").
   *
   * Só funciona depois que o corpo foi montado: é `tabelaOrd(.., {barraFora:1})`
   * quem deposita a busca em `CONTROLES_ABA`. Chamar antes devolve a linha sem
   * a busca — por isso as seções guardam o corpo numa variável primeiro.
   * Visão sem tabela (cartões, quadro, linha do tempo) não deposita nada, e a
   * faixa fica só com as visões: continua sendo uma linha.
   */
  function faixaDaSecao(seletor, extra) {
    var f = '<div class="linha-aba">' + (extra || '') + CONTROLES_ABA + (seletor || '') + '</div>';
    CONTROLES_ABA = '';
    return f;
  }

  function seletorVisao(secao, validas, atual, nota) {
    return '<div class="barra-visoes">' +
      '<div class="visoes" role="group" aria-label="Forma de visualização desta seção">' +
      validas.map(function (v) {
        var on = v === atual;
        return '<button type="button" class="vis' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
          ' data-visao="' + esc(secao + '|' + v) + '" title="Ver como ' + esc(NOME_VIS[v].toLowerCase()) + '">' +
          '<span class="vis-ico" aria-hidden="true">' + ICO_VIS[v] + '</span>' + esc(NOME_VIS[v]) + '</button>';
      }).join('') + '</div>' +
      (nota ? '<span class="item-meta">' + nota + '</span>' : '') + '</div>';
  }

  // ---------- tabela ordenavel e filtravel (obrigatoria em toda secao) ------

  // Barra de controles que sobe para a linha das abas (ver `barraFora`).
  var CONTROLES_ABA = '';
  var ORD = Object.create(null);      // id da tabela -> {col, dir}
  var FILTRO = Object.create(null);   // id da tabela -> texto digitado

  /**
   * colunas: [{c:'chave', rot:'Rótulo'}]
   * linhas:  [{abre:'tipo:id', busca:'texto', ord:{chave:valor}, cel:{chave:'<html>'}}]
   * A 1a coluna vira o botao que abre a gaveta — teclado chega nele por Tab/Enter.
   */
  function tabelaOrd(id, colunas, linhas, placeholder, opc) {
    opc = opc || {};
    // T3: coluna desligada pelo dono some da tabela — mas a PRIMEIRA nunca sai,
    // porque e ela que abre a gaveta (tirar o abridor seria tirar a navegacao).
    colunas = colunas.filter(function (c, i) { return i === 0 || colunaVisivel(id, c.c); });
    // T6.7: ordem padrão vem de quem chama (a fila pede número decrescente — o
    // mais recente em cima). Alfabética era o pior critério possível: colocava
    // "Adaptadores de runtime" na frente de "O SaaS do Arvys" por causa do A.
    var padraoOrd = opc.ordemPadrao && colunas.some(function (c) { return c.c === opc.ordemPadrao.col; })
      ? opc.ordemPadrao : { col: colunas[0].c, dir: 1 };
    var ordem = ordemDe(id, padraoOrd);
    if (!colunas.some(function (c) { return c.c === ordem.col; })) ordem = { col: colunas[0].c, dir: ordem.dir };
    var termo = String(FILTRO[id] || '').trim().toLowerCase();
    // `opc.buscaExterna`: quem chama já filtrou `linhas` lá fora (busca própria,
    // visível em TODAS as visões da seção — não só na tabela) e não quer o
    // campo duplicado aqui dentro. `termo` continua lido de `FILTRO[id]` só
    // para a contagem "X de Y" fazer sentido no rodapé da barra.
    var vis = opc.buscaExterna ? linhas.slice()
      : (termo ? linhas.filter(function (l) { return String(l.busca || '').toLowerCase().indexOf(termo) >= 0; }) : linhas.slice());
    vis.sort(function (a, b) {
      var va = a.ord[ordem.col], vb = b.ord[ordem.col];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * ordem.dir;
      va = va === null || va === undefined ? '' : String(va);
      vb = vb === null || vb === undefined ? '' : String(vb);
      return va.localeCompare(vb, 'pt-BR') * ordem.dir;
    });

    var cab = colunas.map(function (c) {
      var ativa = c.c === ordem.col;
      var seta = ativa ? (ordem.dir > 0 ? '▲' : '▼') : '↕';
      return '<th aria-sort="' + (ativa ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="th-ord' + (ativa ? ' ativa' : '') + '" data-ord="' + esc(id + '|' + c.c) + '">' +
        esc(c.rot) + '<span class="seta" aria-hidden="true">' + seta + '</span>' +
        '<span class="sr">— ordenar por ' + esc(c.rot) + '</span></button></th>';
    }).join('');

    function tr(l) {
      return '<tr' + (l.abre ? ' data-abre="' + esc(l.abre) + '" data-nav="1"' : '') + '>' +
        colunas.map(function (c, i) {
          var cel = l.cel[c.c] === undefined || l.cel[c.c] === null ? '' : l.cel[c.c];
          if (i === 0 && l.abre) cel = abridor(l.abre, cel);
          return '<td>' + cel + '</td>';
        }).join('') + '</tr>';
    }

    var corpo;
    if (typeof opc.grupo === 'function') {
      // T3 · agrupamento estilo Linear: cabecalho por grupo, com contagem e
      // colapso. Grupo vazio nao aparece; a ORDEM dos grupos e a de `opc.ordem`
      // (o que espera o dono em cima), e o que sobrar vai para o fim.
      var mapa = Object.create(null);
      var ordemG = (opc.ordem || []).slice();
      vis.forEach(function (l) {
        var k = opc.grupo(l) || '—';
        if (!mapa[k]) { mapa[k] = []; if (ordemG.indexOf(k) < 0) ordemG.push(k); }
        mapa[k].push(l);
      });
      corpo = ordemG.filter(function (k) { return mapa[k] && mapa[k].length; }).map(function (k) {
        var chave = id + '|' + k;
        var fechado = COLAPSO[chave] === true;
        var tom = opc.tom ? (opc.tom[k] || '') : '';
        // `opc.grupoSub`: uma 2a métrica no cabeçalho do grupo, além da
        // contagem de linhas — o Quadro usa para "N/M tasks" por épico.
        var sub = opc.grupoSub ? opc.grupoSub(k, mapa[k]) : '';
        var cabG = '<tr class="tr-g"><td colspan="' + colunas.length + '">' +
          '<button type="button" class="g-cab' + (fechado ? ' fechado' : '') + '"' +
          ' data-grupo="' + esc(chave) + '" aria-expanded="' + (!fechado) + '">' +
          '<span class="g-seta" aria-hidden="true">' + (fechado ? '▸' : '▾') + '</span>' +
          '<span class="pil ' + tom + '">' + esc(k) + '</span>' +
          '<span class="item-meta">' + mapa[k].length + '</span>' + sub + '</button></td></tr>';
        return cabG + (fechado ? '' : mapa[k].map(tr).join(''));
      }).join('');
    } else {
      corpo = vis.map(tr).join('');
    }

    // UMA linha: busca + os menus de exibição/filtro + a contagem. Era isto em
    // três faixas separadas (busca+nota, agrupar+colunas, contagem+chips).
    // `opc.buscaExterna`: sem input aqui dentro — quem chama já mostra o seu.
    // Sem controles nem contagem pedida, a barra inteira some — em vez de
    // sobrar uma faixa vazia só de moldura (achado ao ligar o Quadro de
    // tarefas à busca própria da seção, 2026-09-11).
    var mostraBarra = !opc.buscaExterna || opc.controles || opc.contagem != null;
    var barra = !mostraBarra ? '' : '<div class="barra-um">' +
      (opc.buscaExterna ? '' :
        '<input class="campo" type="search" data-filtro="' + esc(id) + '" value="' + esc(FILTRO[id] || '') + '"' +
        ' placeholder="' + esc(placeholder || 'Filtrar…') + '" aria-label="' + esc(placeholder || 'Filtrar') + '">') +
      (opc.controles || '') +
      '<span class="barra-conta item-meta">' +
      (opc.buscaExterna ? (opc.contagem != null ? opc.contagem : linhas.length)
        : (termo || vis.length !== linhas.length ? vis.length + ' de ' + linhas.length : (opc.contagem || linhas.length))) +
      '</span></div>';
    // `barraFora`: a barra sobe para a MESMA linha das abas (pedido do dono,
    // 2026-09-06). A montagem é síncrona — o corpo da aba é montado ANTES da
    // linha de abas — então guardar aqui e usar lá em cima é seguro.
    if (opc.barraFora) { CONTROLES_ABA = barra; barra = ''; }

    return barra +
      (vis.length
        ? '<div class="tab-rolo"><table class="tab tab-clic"><thead><tr>' + cab + '</tr></thead><tbody>' + corpo + '</tbody></table></div>'
        : '<p class="item-meta" style="margin:0">Nenhum registro casa com esse filtro. Apague o texto para ver os ' +
          linhas.length + '.</p>');
  }

  /** cols: [{titulo, tom, itens:[html]}] — quadro por situação (kanban de leitura). */
  function quadro(cols) {
    return '<div class="quadro">' + cols.map(function (c) {
      return '<section class="q-col"><header class="q-cab">' +
        '<span class="pil ' + (c.tom || '') + '">' + esc(c.titulo) + '</span>' +
        '<span class="item-meta">' + c.itens.length + '</span></header>' +
        (c.itens.length ? '<div class="q-lista">' + c.itens.join('') + '</div>'
          : '<p class="q-vazio">nada nesta coluna</p>') + '</section>';
    }).join('') + '</div>';
  }

  /** grupos: [{rotulo, sub, itens:[html]}] — linha do tempo, trilho neutro. */
  function linhaDoTempo(grupos) {
    if (!grupos.length) return '<p class="item-meta">Nada para colocar na linha do tempo.</p>';
    return '<div class="ldt">' + grupos.map(function (g) {
      return '<section class="ldt-g"><header class="ldt-cab">' +
        '<span class="ldt-ponto" aria-hidden="true"></span>' +
        '<h3>' + esc(g.rotulo) + '</h3>' +
        (g.sub ? '<span class="item-meta">' + esc(g.sub) + '</span>' : '') + '</header>' +
        '<div class="ldt-itens">' + g.itens.join('') + '</div></section>';
    }).join('') + '</div>';
  }

  function grade(itens) {
    return '<div class="grade g-auto">' + itens.join('') + '</div>';
  }

  // estado do agente: 4 valores, cor fixa, com "esperando você" explicito (benchmark)
  var ESTADOS = {
    'esperando-voce': { rotulo: 'esperando você', pil: 'p-atencao' },
    'trabalhando': { rotulo: 'trabalhando', pil: 'p-ok' },
    'travado': { rotulo: 'travado', pil: 'p-ruim' },
    'em-standby': { rotulo: 'em standby', pil: 'p-parado' }
  };
  function estadoDoAgente(ag, gates) {
    if (ag.meta && (ag.meta.status === 'blocked' || ag.meta.status === 'travado')) return 'travado';
    for (var i = 0; i < (gates || []).length; i++) if (gates[i].owner === ag.dir) return 'esperando-voce';
    // "trabalhando" so vale se o L1 e recente: agente com frente aberta ha uma
    // semana esta parado, nao trabalhando — e o cartao nao pode mentir sobre isso.
    if (ag.inProgress && ag.inProgress.length && (ag.idadeL1Dias === null || ag.idadeL1Dias <= 2)) return 'trabalhando';
    return 'em-standby';
  }
  function pilEstado(chave) {
    var e = ESTADOS[chave] || ESTADOS['em-standby'];
    return '<span class="pil ' + e.pil + '">' + esc(e.rotulo) + '</span>';
  }

  // =========================================================================
  // 5. estado da aplicacao
  // =========================================================================

  var ICONES = {
    inicio: '<path d="M3 9.5 8 3l5 6.5"/><path d="M4.5 8.5V13h7V8.5"/>',
    escritorio: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M2.5 6.5h11M6 12.5v-3h4v3"/>',
    trabalho: '<rect x="2.5" y="4.5" width="11" height="8" rx="1.5"/><path d="M6 4.5V3.5h4v1"/><path d="M2.5 8h11"/>',
    agentes: '<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13"/><circle cx="11.5" cy="6.5" r="1.7"/><path d="M10 13c0-1.6 1-2.6 2.3-2.6"/>',
    decisoes: '<path d="M3 3.5h5.5v9H3z"/><path d="M8.5 3.5H13v9H8.5z"/><path d="M8.5 3.5v9"/>',
    historico: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.5 13.5"/><path d="M7 4.8V7l1.6 1"/>',
    quadro: '<path d="M2.5 4h11"/><path d="M4.5 8h7"/><path d="M6.5 12h3"/>',
    cota: '<path d="M2.5 12.5V7"/><path d="M6.2 12.5V4"/><path d="M9.8 12.5V8.5"/><path d="M13.5 12.5V5.5"/>',
    radar: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.2"/><path d="M8 2.5V8l3.6 2.4"/>',
    leis: '<path d="M8 2.5v11"/><path d="M3 5.5h10"/><path d="M4.6 5.5 3 9.5h3.2z"/><path d="M11.4 5.5 9.8 9.5H13z"/>',
    biblioteca: '<path d="M3 3.5h3.5v9H3z"/><path d="M7 3.5h2.5v9H7z"/><path d="m10.4 4 2.6.7-2 8.3-2.4-.7z"/>'
  };

  // spec 2026-09-qg-redesenho-2 (T5, critério 14; D-QG2-1): cada secao ganha
  // o grupo do menu novo — Agora / Memoria / Casa. Os 11 ids e suas rotas
  // (#/<id>) continuam intactos; so o agrupamento visual do menu muda
  // (`pintaMenu`, `GRUPOS_MENU` abaixo decidem a ORDEM de exibicao).
  var SECOES = [
    { id: 'inicio', nome: 'Início', titulo: 'Início', lead: 'O que precisa de você agora, o recado do dia e o que andou por aqui.', grupo: 'agora' },
    { id: 'escritorio', nome: 'Escritório', titulo: 'Escritório ao vivo', lead: 'Cada personagem é um agente; cada movimento veio de uma ação de verdade.', grupo: 'agora' },
    { id: 'trabalho', nome: 'Trabalho', titulo: 'Trabalho', lead: 'Você pede e decide; os agentes executam. O que trava com você fica no topo.', grupo: 'agora' },
    { id: 'agentes', nome: 'Agentes', titulo: 'Agentes', lead: 'Quem trabalha aqui: papel, onde parou e a ficha completa de cada um.', grupo: 'agora' },
    { id: 'decisoes', nome: 'Decisões', titulo: 'Decisões', lead: 'Toda escolha que vale para o futuro fica aqui, com data e autor.', grupo: 'memoria' },
    { id: 'historico', nome: 'Histórico & busca', titulo: 'Histórico & busca', lead: 'Todos os pushes deste escritório, do mais novo ao mais antigo — e a busca dentro do que eles guardaram.', grupo: 'memoria' },
    { id: 'quadro', nome: 'Quadro de tarefas', titulo: 'Quadro de tarefas', lead: 'Épico → story → task do SaaS, direto do último push — sem abrir editor nenhum.', grupo: 'agora' },
    { id: 'cota', nome: 'Cota & custo', titulo: 'Cota & custo', lead: 'Quanto de token a semana gastou, em que modelo, e o que isso comprou.', grupo: 'casa' },
    { id: 'radar', nome: 'Radar', titulo: 'Radar', lead: 'O que mudou lá fora, com o veredito do Scout: adotar, revisar ou ignorar.', grupo: 'memoria' },
    { id: 'leis', nome: 'Leis & incidentes', titulo: 'Leis & incidentes', lead: 'As regras que o escritório aprendeu errando — e os erros que as geraram.', grupo: 'memoria' },
    { id: 'biblioteca', nome: 'Biblioteca', titulo: 'Biblioteca', lead: 'O manual do Arvys: como o escritório funciona e como se opera.', grupo: 'memoria' }
  ];

  // Ordem de EXIBIÇÃO dentro de cada grupo — vem literal da spec (critério 14),
  // não da ordem de `SECOES` (que é a ordem histórica das rotas e não muda).
  // Cabeçalho de grupo é `<li role="presentation">`: nao e link, nao recebe
  // foco, teclado passa direto (Tab/J/K nunca iteram sobre `#menu`).
  var GRUPOS_MENU = [
    { chave: 'agora', rotulo: 'Agora', ids: ['inicio', 'trabalho', 'quadro', 'agentes', 'escritorio'] },
    { chave: 'memoria', rotulo: 'Memória', ids: ['decisoes', 'historico', 'leis', 'radar', 'biblioteca'] },
    { chave: 'casa', rotulo: 'Casa', ids: ['cota'] }
  ];

  var DADOS = null;         // /api/qg
  var PESADAS = {};         // /api/qg/<secao> por demanda
  var LIVE = null;          // /api/live (XP e troféus moram lá — uma regra, um lugar)
  var ERRO_API = null;
  var rotaAtual = null;
  var abaTrabalho = 'fila';
  var buscaDecisoes = '';

  // =========================================================================
  // 6. rede — sempre caminho RELATIVO (criterio 10)
  // =========================================================================

  /** Registro de TODA chamada de rede do QG. Existe para provar, na evidencia da
   *  T10, que trocar de visao nao refaz fetch: o contador nao anda. */
  var REDE = { total: 0, chamadas: [] };
  window.__arvysRede = REDE;

  function pegaJson(caminho) {
    REDE.total++;
    REDE.chamadas.push({ n: REDE.total, caminho: caminho, quando: new Date().toISOString() });
    return fetch(caminho, { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + caminho);
        return r.json();
      });
  }

  // Flags de PEDIDO (gotcha 59, review T6-B da spec qg-redesenho-2): a guarda
  // do roteador checa a flag, nunca o resultado — o resultado fica null
  // enquanto o fetch voa e cada repintura disparava outra busca (medido 2x em
  // fila/live/decisoes). Sensor: scripts/check-guarda-pedido.mjs.
  var PESADAS_PEDIDO = {};
  var LIVE_PEDIDO = false;
  function pegaPesada(nome) {
    if (PESADAS[nome]) return Promise.resolve(PESADAS[nome]);
    PESADAS_PEDIDO[nome] = true;
    return pegaJson('/api/qg/' + nome).then(function (j) {
      PESADAS[nome] = j && j[nome] ? j[nome] : { ok: false, erro: 'resposta sem a chave "' + nome + '"' };
      return PESADAS[nome];
    }).catch(function (e) {
      PESADAS[nome] = { ok: false, erro: String(e.message || e) };
      return PESADAS[nome];
    });
  }

  function pegaLive() {
    if (LIVE) return Promise.resolve(LIVE);
    LIVE_PEDIDO = true;
    return pegaJson('/api/live').then(function (j) { LIVE = j; return j; })
      .catch(function () { LIVE = { indisponivel: true }; return LIVE; });
  }

  // =========================================================================
  // 7. SECAO — Inicio
  // =========================================================================

  /**
   * spec 2026-09-qg-redesenho-2 (T1, critério 2) · A FONTE ÚNICA do "o que
   * espera por mim" passou a ser `hub/lib/readers.js#pendenciasDoDono()` — o
   * selo do menu (`pintaMenu`), este bloco e o grupo "Esperando você" de
   * Trabalho (`abaFila`) leem TODOS `d.inicio.pendencias`, nunca recalculam.
   * Esta função só RENDERIZA o que a função pura já decidiu.
   *
   * `urgencia`: 0 = trava o trabalho (blocker, gate, fila) · 1 = precisa de
   * você mas não trava (radar, contradição na fila). O cartão pesa conforme —
   * era tudo com o mesmo peso, e o rótulo gritava mais que o conteúdo (T3.3).
   *
   * Os alertas de medição (Pulse) NÃO entram aqui — eles já aparecem no
   * Recado do Dia (`falaDoBriefing`); duplicá-los aqui era a mesma família de
   * defeito que esta função existe para matar (dois lugares, dois números).
   */
  // ---- T4a (Emenda 1, critérios 19-22) · "Esperando você" expande e age ----
  //
  // Continua consumindo SÓ `d.inicio.pendencias` (critério 2 — um cálculo
  // só); nada aqui recalcula total nem porFonte. O que é novo:
  //  - expandir/recolher, com a escolha lembrada (COLAPSO['esp:tudo'],
  //    mesmo mecanismo — mesma tecla `data-grupo` — que os grupos de tabela
  //    já usam; ver `guardaColapso()`/`colapsoInicial()`);
  //  - expandido, os itens ficam agrupados por fonte (blockers · gates ·
  //    fila · radar), cada grupo com o MESMO colapso genérico
  //    (`esp:g:<grupo>`);
  //  - 4 acionamentos por ocorrência: Abrir (gaveta, já existia), Começar
  //    com <agente> (recado real, `POST /api/recado`), Anotar (preferência
  //    `notas`, `POST /api/prefs`) e Adiar (reaproveita `adiadoChave`/
  //    `alternaAdiarChave`, o mesmo mecanismo da fila, chave
  //    `pend:<fonte>:<hash>` em vez de `fila:<numero>`);
  //  - no SaaS (`!LOCAL`), os 3 acionamentos de ESCRITA somem — só "Abrir"
  //    (leitura) continua, com a frase do critério 22 no lugar dos botões.

  /**
   * Espelho MÍNIMO de `hub/lib/readers.js#filtraAdiadosPendencia` — só o
   * FILTRO. A CHAVE (o hash) nunca é recalculada aqui: cada item já chega
   * com `it.chave` pronta no JSON de `/api/qg` (a mesma `pendenciasDoDono()`
   * do servidor escreve). Duplicar o filtro (não o hash) é necessário porque
   * o mapa de adiados mora só no NAVEGADOR (preferência do dono,
   * `arvys.ordem.adiados`) — o servidor não tem como saber disso, e o
   * `app.js` é IIFE de navegador: não dá para `require()` o módulo node
   * para reaproveitar a função de lá. Mesma regra: `ate > hoje` continua
   * adiado; senão volta sozinho.
   */
  function espFiltraAdiados(itens) {
    var m = adiados();
    var hoje = hojeISO();
    return (itens || []).filter(function (it) {
      var ate = it && it.chave ? m[it.chave] : null;
      if (!ate) return true;
      return !(String(ate) > hoje);
    });
  }

  /** Mesma ordem/nomes de `agrupaPendenciasPorFonte` (hub/lib/readers.js) —
   *  fila reúne esperaDono + esperaConflito, é a mesma origem para quem olha
   *  a tela. Pequeno o bastante para não valer um round-trip: se crescer,
   *  vira rota própria (comentário simétrico ao do readers.js). */
  var ESP_GRUPOS = [
    { grupo: 'blockers', rotulo: 'Blockers', fontes: ['blockers'] },
    { grupo: 'gates', rotulo: 'Gates', fontes: ['gates'] },
    { grupo: 'fila', rotulo: 'Fila', fontes: ['esperaDono', 'esperaConflito'] },
    { grupo: 'radar', rotulo: 'Radar', fontes: ['radar'] }
  ];
  function espAgrupaPorFonte(itens) {
    return ESP_GRUPOS.map(function (g) {
      return { grupo: g.grupo, rotulo: g.rotulo, itens: itens.filter(function (it) { return g.fontes.indexOf(it.fonte) >= 0; }) };
    }).filter(function (g) { return g.itens.length; });
  }

  /** Expandido/recolhido é só mais uma entrada do MESMO mapa de colapso que
   *  as tabelas já usam (`COLAPSO`) — sobe ao arquivo pela MESMA chave
   *  (`arvys.colapso.qg`), sem CHAVES nova em `hub/lib/prefs.js`. */
  function espExpandido() { return COLAPSO['esp:tudo'] === true; }

  /** chave -> item da pintura corrente, para os cliques (Começar/Anotar/
   *  Adiar) acharem o texto sem recalcular nada. Refeito a cada pintura. */
  var ESP_MAPA = Object.create(null);

  function espOpcoesAgentes(d) {
    return ((d && d.agentes) || []).map(function (a) {
      var nome = (a.meta && a.meta.callsign) || a.dir;
      return '<option value="' + esc(a.dir) + '">' + esc(nome) + '</option>';
    }).join('');
  }

  /** A nota do dono (e a marca de recado enviado), sempre lida do ARQUIVO de
   *  preferências (`PREFS_ARQ.notas`) — nunca recalculada, nunca duplicada. */
  function espNotaDe(chave) {
    return (PREFS_ARQ && PREFS_ARQ.notas && PREFS_ARQ.notas[chave]) || null;
  }

  /** Registra a ocorrência na gaveta — mesmo padrão dos outros `reg*`. */
  function espRegistra(it) {
    return registra('pend', it.chave, {
      rotuloTipoTexto: 'Esperando você · ' + it.verbo,
      titulo: inline(it.txt),
      sub: inline(it.sub),
      props: [{ rot: 'Fonte', val: '<span class="item-meta">' + esc(it.fonte) + '</span>' }],
      corpo: function () { return '<p>' + inline(it.txt) + '</p>'; }
    });
  }

  /** Um cartão de ocorrência com os 4 acionamentos. */
  function espCard(it, d) {
    ESP_MAPA[it.chave] = it;
    var nota = espNotaDe(it.chave);
    var adiadoAte = adiadoChave(it.chave);
    var notaAberta = COLAPSO['esp:nota:' + it.chave] === true;

    // `data-esp-item` mora no CONTÊINER (`.esp-acoes`/`.esp-nota-editor`), nunca
    // no botão — o clique busca o irmão (select/textarea) por
    // `itemEl.querySelector(...)`, e `closest('[data-esp-item]')` tem de subir
    // até achar o contêiner, não parar no próprio botão (achado ao testar no
    // navegador: um `data-esp-item` redundante no botão fazia `closest` parar
    // ali, e `espSalvaNota`/`espEnviaRecado` procuravam o textarea/select
    // DENTRO do próprio botão — nunca achavam).
    var acoesEscrita =
      '<label class="sr" for="esp-ag-' + esc(it.chave) + '">Começar com</label>' +
      '<select class="campo esp-sel" id="esp-ag-' + esc(it.chave) + '" data-esp-ag="' + esc(it.chave) + '">' +
      '<option value="">Começar com…</option>' + espOpcoesAgentes(d) + '</select>' +
      '<button type="button" class="btn fantasma" data-esp-comeca="1">Enviar</button>' +
      '<button type="button" class="btn fantasma" data-grupo="esp:nota:' + esc(it.chave) + '">' +
      (nota && nota.texto ? 'Editar nota' : 'Anotar') + '</button>' +
      (adiadoAte
        ? '<button type="button" class="btn fantasma" data-esp-adia="">Trazer de volta</button>'
        : '<button type="button" class="btn fantasma" data-esp-adia="amanha">Adiar até amanhã</button>');

    var editorNota = !notaAberta ? '' :
      '<div class="esp-nota-editor" data-esp-item="' + esc(it.chave) + '">' +
      '<textarea class="campo" data-esp-txt rows="2" placeholder="Sua nota sobre isto…">' + esc((nota && nota.texto) || '') + '</textarea>' +
      '<button type="button" class="btn" data-esp-salva-nota="1">Salvar nota</button>' +
      '</div>';

    // `.esp-card` é a única classe NOVA de moldura aqui: dentro dela,
    // `.espera-item` fica exatamente como era (mesma classe, mesmo CSS já
    // existente) — as ações entram como um segundo bloco, DEPOIS dela, para
    // não empurrar `.espera-item` (que é `display:flex` sem quebra de linha)
    // a ganhar um 3º filho lado a lado. Nenhuma regra existente foi tocada.
    return '<div class="esp-card">' +
      '<div class="espera-item u' + (it.urgencia || 0) + '">' +
      '<span class="espera-verbo">' + esc(it.verbo) + '</span>' +
      '<span class="espera-txt">' + inline(it.txt) + '<small>' + inline(it.sub) + '</small>' +
      (adiadoAte ? '<small class="item-meta">adiado até ' + esc(adiadoAte) + '</small>' : '') +
      (nota && nota.texto ? '<small class="item-meta">📝 ' + esc(nota.texto) + '</small>' : '') +
      (nota && nota.recado ? '<small class="item-meta">recado enviado a ' + esc(nota.recado.agente) + '</small>' : '') +
      '<small class="esp-status" data-esp-status="' + esc(it.chave) + '" aria-live="polite"></small>' +
      '</span></div>' +
      '<div class="esp-acoes" data-esp-item="' + esc(it.chave) + '">' +
      '<button type="button" class="btn fantasma" data-abre="' + esc(espRegistra(it)) + '">Abrir</button>' +
      soLocal(acoesEscrita, '<span class="item-meta">as ações ficam no QG da sua máquina</span>') +
      '</div>' +
      editorNota +
      '</div>';
  }

  function esperandoVoce(d) {
    var p = d.inicio.pendencias;
    // servidor antigo, sem o campo novo: esconde o número, NUNCA recalcula
    // aqui — dois cálculos é exatamente o defeito que esta spec mata.
    if (!p) {
      return '<p class="item-meta" style="margin:0">contagem indisponível — atualize o servidor do QG.</p>';
    }
    if (p.parcial) {
      return '<p class="item-meta" style="margin:0">contagem indisponível — ' + esc(p.parcial) + ' ainda não carregou.</p>';
    }
    ESP_MAPA = Object.create(null);
    var todos = p.itens || [];
    var ativos = espFiltraAdiados(todos);
    var adiadosAgora = todos.length - ativos.length;
    var notaAdiados = !adiadosAgora ? '' :
      '<p class="item-meta" style="margin:0 0 var(--esp-3)">' + adiadosAgora + ' ' +
      plural(adiadosAgora, 'adiado', 'adiados') +
      ' <button type="button" class="btn fantasma" data-grupo="esp:vistoadiados">ver</button></p>' +
      (COLAPSO['esp:vistoadiados'] === true
        ? '<div class="espera" style="margin-bottom:var(--esp-3)">' +
          todos.filter(function (it) { return ativos.indexOf(it) < 0; }).map(function (it) { return espCard(it, d); }).join('') +
          '</div>'
        : '');

    if (!ativos.length) {
      // card vazio SOME (benchmark): fica só a confirmação, sem caixa —
      // salvo os adiados, que o dono pediu para poder ver de volta.
      return notaAdiados + '<p class="item-meta" style="margin:0">✓ Nada esperando por você agora — sem ' +
        J('gate') + ' aberto e sem blocker.</p>';
    }

    var expandido = espExpandido();
    if (!expandido) {
      return notaAdiados +
        '<div class="espera">' + ativos.slice(0, 3).map(function (it) { return espCard(it, d); }).join('') + '</div>' +
        (ativos.length > 3
          ? '<p class="item-meta" style="margin:var(--esp-2) 0 0">' +
            '<button type="button" class="btn fantasma" data-grupo="esp:tudo">ver ' +
            (p.total > ativos.length ? 'os ' + ativos.length + ' de ' + p.total : 'todos os ' + ativos.length) +
            '</button> — os de cima travam o trabalho; os de baixo, não.</p>'
          : '');
    }

    var grupos = espAgrupaPorFonte(ativos);
    return notaAdiados +
      '<p class="item-meta" style="margin:0 0 var(--esp-3)">' +
      '<button type="button" class="btn fantasma" data-grupo="esp:tudo">recolher</button></p>' +
      grupos.map(function (g) {
        var fechado = COLAPSO['esp:g:' + g.grupo] === true;
        return '<div class="esp-grupo">' +
          '<button type="button" class="g-cab' + (fechado ? ' fechado' : '') + '" data-grupo="esp:g:' + esc(g.grupo) + '" aria-expanded="' + (!fechado) + '">' +
          '<span class="g-seta" aria-hidden="true">' + (fechado ? '▸' : '▾') + '</span>' +
          '<span class="pil">' + esc(g.rotulo) + '</span><span class="item-meta">' + g.itens.length + '</span></button>' +
          (fechado ? '' : '<div class="espera">' + g.itens.map(function (it) { return espCard(it, d); }).join('') + '</div>') +
          '</div>';
      }).join('');
  }

  /** "às 06:30" / "ontem às 22:10" — a hora da medição, curta. */
  function quandoMedido(iso) {
    var s = String(iso || '');
    if (!s) return 'sem data';
    var t = Date.parse(s);
    if (isNaN(t)) return 'em ' + esc(s);
    var d = new Date(t);
    var hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var dias = diasEntre(s.slice(0, 10));
    if (dias === 0 || dias === null) return 'às ' + hh;
    if (dias === 1) return 'ontem às ' + hh;
    return 'há ' + dias + ' dias';
  }

  /** T3.2 · a medição é anterior à última mudança do escritório? */
  function medicaoVelha(d, iso) {
    var um = d && d.ultimaMudanca && d.ultimaMudanca.em;
    if (!um || !iso) return false;
    var a = Date.parse(iso), b = Date.parse(um);
    if (isNaN(a) || isNaN(b)) return false;
    return b > a;
  }

  function falaDoBriefing(d) {
    return leitura(d.inicio.briefing, 'o briefing do dia', function (b) {
      var deHoje = b.data === hojeISO();
      var cabeca = deHoje
        ? 'Bom dia. Aqui está o escritório hoje, ' + dataLonga(b.data) + '.'
        : 'Este é o briefing de ' + dataLonga(b.data) + ' — a corrente não rodou hoje, então o retrato é daquele dia.';
      // T3.1: o Recado PARA de responder "o que espera por você" — quem responde
      // isso é o bloco do topo, e eram dois cálculos diferentes se contradizendo
      // na mesma tela. A linha não some do arquivo; some da duplicação.
      var linhas = (b.itens || []).filter(function (it) {
        // CONTEM, nao "comeca com". O reviewer do risco N2 (2026-09-06) achou o
        // rotulo que o worker do briefing emite quando o dia repete:
        // "Igual a ontem, e continua esperando você" — nao comeca com
        // "esperando", escapava do filtro, e a tela voltava a dar DUAS respostas
        // opostas para a mesma pergunta: o Recado dizendo que algo espera e o
        // bloco do topo dizendo "nada esperando por voce agora".
        return !/esperando\s+voc[êe]/i.test(String(it.rotulo || ''));
      }).map(function (it) {
        return '<li><span class="rot">' + esc(it.rotulo) + ':</span> ' + inline(it.texto) + '</li>';
      }).join('');
      return '<div class="fala"><span class="fala-av" aria-hidden="true">A</span><div class="fala-corpo">' +
        '<p class="quem"><b>Arvys</b> · chefe de gabinete · medição de ' + esc(b.medicao || b.data) + '</p>' +
        '<p style="margin:0 0 var(--esp-2)' + (deHoje ? '' : ';color:var(--atencao)') + '">' + esc(cabeca) + '</p>' +
        '<ul class="fala-linhas">' + linhas + '</ul>' +
        ((b.alertas || []).length ? '<p class="fala-alerta">⚠ ' + (b.alertas || []).map(inline).join(' · ') + '</p>' : '') +
        '</div></div>';
    }, {
      titulo: 'Nenhum briefing ainda',
      texto: 'O briefing é escrito de madrugada por um worker e resume o dia em cinco linhas. Ainda não existe um aqui.',
      caminho: soLocal(
        'rode <b>node workers/briefing.js</b> (ou o ritual <code>/arvys:briefing</code>) para gerar <code>company/BRIEFING.md</code>.',
        'este escritório ainda não gerou o briefing — ele nasce no ritual <code>/arvys:briefing</code> na sua máquina.'
      )
    });
  }

  function saudeDoEscritorio(d) {
    var s = d.inicio.saude || {};
    var sp = s.specs;
    var inc = s.incidentes || {};
    var fpy = d.fpyExterno;
    var cel = [];

    if (sp && sp.total) {
      var pctSp = Math.round((sp.prontas / sp.total) * 100);
      cel.push(num('Entregas fechadas', esc(sp.prontas + '/' + sp.total), 'specs',
        pctSp + '% de todas as ' + J('spec', 'specs') + ' já fecharam com evidência', pctSp >= 80 ? 'ok' : ''));
    }
    if (fpy && fpy.universo) {
      var pctF = Math.round((fpy.passaram / fpy.universo) * 100);
      cel.push(num(J('FPY') + ' do escritório', esc(fpy.passaram + '/' + fpy.universo), 'de primeira',
        pctF + '% passaram sem retrabalho', pctF >= 70 ? 'ok' : 'atencao'));
    }
    if (inc.total != null) {
      cel.push(num('Incidentes', esc(String(inc.abertos != null ? inc.abertos : '—')), 'abertos',
        (inc.total || 0) + ' no total · último em ' + (inc.ultimo ? dataLonga(inc.ultimo) : 'data desconhecida'),
        inc.abertos ? 'atencao' : 'ok'));
    }
    if (s.agentes != null) {
      cel.push(num('Agentes contratados', esc(String(s.agentes)), plural(s.agentes, 'agente', 'agentes'),
        (s.decisoes != null ? s.decisoes + ' decisões no livro' : 'sem livro de decisões ainda')));
    }
    if (!cel.length) {
      return vazio('Sem números ainda',
        'A saúde do escritório é medida por um worker que roda de madrugada. Nenhuma medição chegou até aqui.',
        // T7.3 · era "rode node workers/office-metrics.js". Na nuvem o leitor
        // não tem esse repo nem esse node: "ainda não tem dado" virava "está
        // quebrado". O comando só aparece com terminal à mão (T3, critério 9,
        // via soLocal); a frase de cima é para quem só tem a tela.
        'os números aparecem sozinhos depois da primeira noite.' +
        soLocal(' <span class="item-meta">Com terminal à mão: <code>node workers/office-metrics.js</code>.</span>', ''));
    }
    return '<div class="grade g4">' + cel.join('') + '</div>';
  }

  function atividadeRecente(d) {
    var linhas = [];
    var est = d.inicio.estado && d.inicio.estado.ok ? d.inicio.estado.data : null;
    (est && est.diario ? est.diario : []).slice(0, 3).forEach(function (dia) {
      linhas.push({ quando: dia.data, o: dia.titulo, onde: 'diário do escritório' });
    });
    if (d.decisoes && d.decisoes.ok && d.decisoes.ultima) {
      linhas.push({ quando: d.decisoes.ultima.date, o: d.decisoes.ultima.title, onde: 'livro de decisões' });
    }
    if (!linhas.length) return '';
    linhas.sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
    return '<div class="bloco">' + tituloBloco('Atividade recente', 'o raso — o fundo está em Trabalho e Decisões') +
      cartao('<ul class="lista">' + linhas.slice(0, 4).map(function (l) {
        return '<li><div class="item-cab"><span class="t">' + esc(l.o) + '</span></div>' +
          '<p class="item-meta" style="margin:var(--esp-0) 0 0">' + esc(idade(diasEntre(l.quando))) + ' · ' + esc(l.onde) + '</p></li>';
      }).join('') + '</ul>') + '</div>';
  }

  // ---- T5 (spec 2026-09-qg-redesenho) · iniciativas em linha, não em paredão -
  var SIT_INI = {
    'em-curso': 'p-brass', 'gate': 'p-atencao', 'entregue': 'p-ok',
    'parada': 'p-parado', 'arquivada': 'p-parado'
  };

  function regIniciativa(i, idx) {
    return registra('iniciativa', idx, {
      rotuloTipoTexto: 'Iniciativa · company/STATE.md',
      titulo: esc(i.nome || 'iniciativa sem nome'),
      sub: '<span class="item-meta">o texto inteiro do escritório sobre esta iniciativa</span>',
      props: [
        { rot: 'Situação', val: i.situacao
          ? '<span class="pil ' + (SIT_INI[i.situacao] || '') + '">' + esc(i.situacao) + '</span>'
          : '<span class="item-meta">sem marcação no arquivo</span>' },
        { rot: 'Caminho', val: i.caminho ? '<code>' + esc(i.caminho) + '</code>' : '' },
        { rot: 'Progresso', val: i.progresso ? esc(i.progresso) : '' },
        { rot: 'Quem', val: i.quem ? esc(i.quem) : '' },
        { rot: 'Origem', val: '<code>company/STATE.md</code> <span class="item-meta">seção “Iniciativas em curso”</span>' }
      ],
      acoes: [
        { rot: 'Copiar o texto inteiro', copiar: i.bruto || '' },
        { rot: 'Copiar o caminho', copiar: i.caminho || 'company/STATE.md' }
      ],
      // O paredão não sumiu: ele mora AQUI. É a promessa do critério 2 —
      // nada do STATE.md se perde, só deixa de ser a primeira coisa da tela.
      corpo: function () { return '<div class="md">' + md(i.bruto || '') + '</div>'; }
    });
  }

  function linhaIniciativa(i, idx) {
    var chave = regIniciativa(i, idx);
    var pil = i.situacao
      ? '<span class="pil ' + (SIT_INI[i.situacao] || '') + '">' + esc(i.situacao) + '</span>'
      : '<span class="pil p-parado">sem marca</span>';
    var meta = [];
    if (i.caminho) meta.push('<code>' + esc(i.caminho) + '</code>');
    if (i.progresso) meta.push(esc(i.progresso));
    if (i.quem) meta.push(esc(i.quem));
    return '<button type="button" class="ini-l" data-abre="' + esc(chave) + '">' +
      pil +
      '<span class="ini-t"><span class="ini-n">' + esc(i.nome || 'iniciativa sem nome') + '</span>' +
      (meta.length ? '<span class="ini-m">' + meta.join(' · ') + '</span>' : '') + '</span>' +
      '<span class="ini-abrir" aria-hidden="true">abrir →</span></button>';
  }

  function secaoInicio(d) {
    var est = d.inicio.estado;
    var dados = est && est.ok && est.data ? est.data : null;
    // `iniciativas` (estruturado) e o caminho novo; `initiatives` (strings) e a
    // degradacao para um /api/qg mais velho — o front nao pode quebrar por isso.
    var ini = dados && dados.iniciativas && dados.iniciativas.length
      ? dados.iniciativas
      : ((dados && dados.initiatives) || []).map(function (t) { return { nome: String(t).slice(0, 90), bruto: t }; });

    // T5.1 · "Em curso" mostra o que está EM CURSO. Iniciativa `entregue` ou
    // `arquivada` sai da seção — uma seção chamada "em curso" cheia de trabalho
    // acabado ensina o dono a pular a seção (cadeira de UX, mesa de 06/09).
    // Elas não somem do escritório: continuam no STATE.md e viram a linha de
    // rodapé, com o caminho para ler o texto inteiro.
    var FECHADAS = ['entregue', 'arquivada'];
    var emCurso = ini.filter(function (i) { return FECHADAS.indexOf(i.situacao) < 0; });
    var fechadas = ini.filter(function (i) { return FECHADAS.indexOf(i.situacao) >= 0; });

    // T4a (Emenda 1, critério 10): "Em curso" perdeu o título/subtítulo
    // próprio — agora é o CORPO do bloco-pergunta "O que está em curso"
    // (o recado do dia entra ANTES da lista, como o resumo narrado do que
    // mudou; ver comentário abaixo sobre por que ele desceu para cá).
    var corpoCurso;
    if (emCurso.length) {
      corpoCurso = cartao('<div class="ini-lista">' + emCurso.map(linhaIniciativa).join('') +
        (fechadas.length ? '<p class="ini-fechadas">' + fechadas.length + ' ' +
          plural(fechadas.length, 'iniciativa concluída continua', 'iniciativas concluídas continuam') +
          ' registrada' + plural(fechadas.length, '', 's') + ' em <code>company/STATE.md</code>.</p>' : '')) + '</div>';
    } else {
      // T5.2 · o vazio é RESPOSTA, não ausência de resposta. Ele é uma das três
      // perguntas do QG, e "nenhuma" é uma resposta legítima — desde que dita.
      corpoCurso = cartao('<p class="vazio-curso"><strong>Nenhuma iniciativa em curso agora.</strong>' +
        (fechadas.length ? ' As ' + fechadas.length + ' últimas foram concluídas e continuam registradas em <code>company/STATE.md</code>.' : '') +
        '</p>' +
        (fechadas.length ? '<div class="ini-lista ini-fechada-lista">' + fechadas.map(linhaIniciativa).join('') + '</div>' : ''));
    }

    return '<div class="bloco" style="margin-top:0">' + tituloBloco('O que espera por mim') + esperandoVoce(d) + '</div>' +
      '<div class="bloco">' + tituloBloco('O que está em curso',
        emCurso.length ? emCurso.length + ' ' + plural(emCurso.length, 'iniciativa', 'iniciativas') + ' — clique para abrir o texto inteiro' : '') +
        // T5 (redesenho anterior) já tinha descido o recado para cá porque ele
        // repetia "esperando você" — T4a (Emenda 1) o traz de volta, mas
        // AQUI, como o resumo narrado do dia (o worker da madrugada conta o
        // que mudou), que é literalmente "o que está em curso" contado em
        // prosa; T3.1 já filtra as linhas que dizem "esperando você" do
        // texto, então não há mais duplicação com o bloco de cima.
        falaDoBriefing(d) + corpoCurso + '</div>' +
      '<div class="bloco">' + tituloBloco('O que decidimos') + decisoesDoInicio(d) + '</div>';
  }

  /**
   * T4a (Emenda 1, critério 10) · conteúdo do bloco "O que decidimos".
   *
   * As 3 últimas decisões do dono vivem SÓ na rota pesada de Decisões (105 KB,
   * `/api/qg/decisoes`, buscada por `secaoDecisoes`/T4b) — o agregado LEVE
   * (`/api/qg`) só carrega a ÚLTIMA (`resumoDecisoes()` em `hub/lib/qg.js`).
   * Buscar a rota pesada AQUI duplicaria o fetch e o cache que a seção
   * Decisões já mantém (R2 desta spec: dois lugares, dois números/duas
   * buscas). Por isso este bloco mostra a última decisão que já veio no
   * agregado e aponta para a seção inteira — nunca inventa uma segunda busca
   * pelo que a rota pesada não deu de graça.
   *
   * A "Saúde do escritório" (specs fechadas, FPY, incidentes, agentes e
   * decisões no livro) desceu para dentro deste bloco: ela não é "o que
   * espera por mim" nem "o que está em curso" — é o retrato de como o
   * escritório vem DECIDINDO e fechando (specs prontas = decisões
   * executadas; "decisões no livro" está literalmente no nome). Não há bloco
   * 4 nem 5: os cinco blocos antigos (Esperando você, Saúde, Em curso,
   * Recado, Atividade recente) viraram os 3 que a Emenda 1 pediu.
   */
  function decisoesDoInicio(d) {
    var r = d && d.decisoes;
    var linkTodas = '<a class="btn fantasma" href="#/decisoes">abrir Decisões</a>';
    var ultimaHtml;
    if (r && r.ok === false) {
      ultimaHtml = torto(r, 'o livro de decisões');
    } else if (r && r.ok && r.ultima) {
      ultimaHtml = '<p style="margin:0 0 var(--esp-3)"><span class="item-meta">última decisão · ' + esc(r.ultima.date) + '</span><br>' +
        inline(r.ultima.title) + '</p>';
    } else if (r && r.ok && r.ausente) {
      ultimaHtml = '<p class="item-meta" style="margin:0 0 var(--esp-3)">Nenhuma decisão registrada ainda em <code>company/DECISIONS.md</code>.</p>';
    } else {
      ultimaHtml = '<p class="item-meta" style="margin:0 0 var(--esp-3)">ainda carregando…</p>';
    }
    return cartao(ultimaHtml + '<p style="margin:0 0 var(--esp-4)">' + linkTodas + '</p>' +
      '<p class="item-meta" style="margin:0 0 var(--esp-2)">medido pelo ' + J('worker') + ' da madrugada</p>' +
      saudeDoEscritorio(d));
  }

  // =========================================================================
  // 8. SECAO — Escritorio ao vivo (T6)
  // =========================================================================

  /** O /live segue o tema do sistema e, dentro do iframe, perdeu o proprio botao.
   *  Mesma origem: o shell escreve o data-theme dele direto, e o escritorio passa a
   *  obedecer ao interruptor da plataforma. Falha silenciosa se algo mudar la dentro. */
  function sincronizaTemaDoLive() {
    var frame = document.getElementById('live-frame');
    if (!frame) return;
    try {
      var doc = frame.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.dataset.theme =
          document.documentElement.getAttribute('data-tema') === 'escuro' ? 'dark' : 'light';
      }
    } catch (e) { /* origem diferente: o escritorio fica no tema do sistema */ }
  }

  // -------------------------------------------------------------------------
  // T11 (EMENDA 1 · E2) — o escritório numa SEGUNDA JANELA.
  //
  // A regra do dono: nunca duas cópias competindo em silêncio. Enquanto a
  // janela externa vive, o shell NÃO desenha o iframe — mostra o que está
  // acontecendo e dá as duas saídas (focar lá, ou trazer de volta para cá).
  // O fechamento é percebido por duas vias: `beforeunload` de dentro da
  // janela (mesma origem) para o retorno imediato, e uma varredura de
  // `win.closed` como rede — a primeira depende do documento ter carregado,
  // a segunda não depende de nada.
  // -------------------------------------------------------------------------
  var janelaLive = null;   // WindowProxy da janela externa, enquanto viva
  var vigiaLive = null;    // varredura de win.closed
  var liveBloqueado = false; // o navegador barrou o popup na última tentativa

  function liveViva() {
    try { return !!(janelaLive && !janelaLive.closed); } catch (e) { return false; }
  }

  /** Tamanho/posição da última vez, se o navegador tiver deixado guardar. */
  function medidasLive() {
    var padrao = { w: Math.min(1280, Math.max(900, screen.availWidth - 420)), h: Math.max(600, screen.availHeight - 160), x: 60, y: 60 };
    try {
      var g = JSON.parse(lembra('arvys.live.janela') || 'null');
      if (g && g.w > 300 && g.h > 300) return { w: g.w, h: g.h, x: g.x || 0, y: g.y || 0 };
    } catch (e) { /* sem memória: abre no padrão */ }
    return padrao;
  }
  function lembraMedidasLive() {
    if (!liveViva()) return;
    try {
      guarda('arvys.live.janela', JSON.stringify({
        w: janelaLive.outerWidth, h: janelaLive.outerHeight,
        x: janelaLive.screenX, y: janelaLive.screenY
      }));
    } catch (e) { /* janela de outra origem ou sem permissão: seguir */ }
  }

  function paraDeVigiarLive() {
    if (vigiaLive) { clearInterval(vigiaLive); vigiaLive = null; }
  }

  /** A janela morreu (por fora ou pelo botão): volta ao estado normal. */
  function esqueceLive() {
    paraDeVigiarLive();
    janelaLive = null;
    if (rotaAtual && rotaAtual.secao === 'escritorio') pinta();
  }

  /** Mesma origem: o tema da plataforma manda também na janela de fora. */
  function sincronizaTemaDaJanelaLive() {
    if (!liveViva()) return;
    try {
      var doc = janelaLive.document;
      if (doc && doc.documentElement) {
        doc.documentElement.dataset.theme =
          document.documentElement.getAttribute('data-tema') === 'escuro' ? 'dark' : 'light';
      }
    } catch (e) { /* ainda carregando: a próxima varredura tenta de novo */ }
  }

  /** Assim que o documento de lá existe, peço para ele avisar quando sair. */
  function ganchoDeFechamentoLive() {
    if (!liveViva()) return;
    try {
      if (janelaLive.__arvysGancho || !janelaLive.document || janelaLive.document.readyState !== 'complete') return;
      janelaLive.__arvysGancho = true;
      janelaLive.addEventListener('beforeunload', function () {
        // o `closed` só vira true depois; um respiro e a varredura confirma
        setTimeout(function () { if (!liveViva()) esqueceLive(); }, 120);
      });
      sincronizaTemaDaJanelaLive();
    } catch (e) { /* origem diferente: sobra a varredura de win.closed */ }
  }

  function abreLiveEmJanela() {
    if (liveViva()) { focaLive(); return; }
    var m = medidasLive();
    var feat = 'popup=yes,width=' + m.w + ',height=' + m.h + ',left=' + m.x + ',top=' + m.y + ',resizable=yes,scrollbars=yes';
    var w = null;
    try { w = window.open('/live', 'arvysEscritorio', feat); } catch (e) { w = null; }
    if (!w) { liveBloqueado = true; pinta(); return; }   // bloqueador de popup: a tela explica
    liveBloqueado = false;
    janelaLive = w;
    vigiaLive = setInterval(function () {
      if (!liveViva()) { esqueceLive(); return; }
      ganchoDeFechamentoLive();
      lembraMedidasLive();
    }, 700);
    pinta();
    focaLive();
  }

  function focaLive() { try { if (liveViva()) janelaLive.focus(); } catch (e) { /* nada a fazer */ } }

  /** "Trazer de volta": fecha a janela externa e o iframe reassume. */
  function trazLiveDeVolta() {
    lembraMedidasLive();
    try { if (liveViva()) janelaLive.close(); } catch (e) { /* já foi */ }
    esqueceLive();
  }

  var DICA_LIVE = '<p class="item-meta" style="margin-top:var(--esp-3)">Clique em um personagem para abrir a ficha dele aqui no QG. ' +
    'A planta é a mesma de <code>/live</code> — o escritório inteiro, dentro da plataforma.</p>';

  function secaoEscritorio() {
    // T7/R3: instalação nova não tem `hub/live/` (gotcha 29). Sem isto o QG
    // embutia num iframe o placeholder antigo do `serve.js` ("Planta viva chega
    // na T4") — jargão de task interna na cara de quem acabou de instalar.
    var esc0 = DADOS && DADOS.escritorio;
    if (esc0 && esc0.disponivel === false) {
      return vazio(
        'O escritório ao vivo ainda não está instalado',
        'O escritório em pixel-art é desenhado por hub/live/office.html, e este projeto não tem essa pasta. ' +
        'Ela vem junto com o Arvys; quando o QG roda dentro de um projeto que só copiou o hub, ela pode não ter vindo.',
        soLocal(
          'copie a pasta <code>hub/live/</code> do repositório do Arvys para este projeto e recarregue esta página. ' +
          'As outras oito seções funcionam sem ela.',
          'esta tela só existe na sua máquina — as outras seções continuam funcionando por aqui.'
        )
      );
    }
    if (liveViva()) {
      return cartao('<h3 style="margin:0 0 var(--esp-2);font-size:var(--t-3)">O escritório está aberto em outra janela</h3>' +
        '<p style="margin:0 0 var(--esp-3)">Enquanto ela estiver aberta, o QG <b>não desenha uma segunda cópia aqui</b>: ' +
        'seriam duas plantas do mesmo escritório, cada uma com sua conexão e seu relógio, discordando entre si.</p>' +
        '<p style="margin:0 0 var(--esp-4)">Clicar num personagem <b>lá</b> continua abrindo a ficha dele <b>aqui</b> — ' +
        'a janela de fora fala com esta por mensagem de mesma origem.</p>' +
        '<div class="acoes-live">' +
        '<button type="button" class="btn" data-live="focar">Focar a janela do escritório</button>' +
        '<button type="button" class="btn fantasma" data-live="voltar">Trazer de volta para cá</button>' +
        '</div>', 'live-fora');
    }
    return '<div class="acoes-live">' +
      '<button type="button" class="btn" data-live="abrir">Abrir em outra janela</button>' +
      '<span class="item-meta">Para deixar o escritório rodando numa segunda tela enquanto você usa o QG aqui.</span>' +
      '</div>' +
      (liveBloqueado
        ? '<div class="torto"><h3>O navegador bloqueou a janela</h3>' +
          '<p>O pedido saiu daqui, mas o bloqueador de pop-ups do navegador recusou. ' +
          'Procure o aviso na barra de endereço (um ícone de janela barrada), escolha ' +
          '<b>“sempre permitir pop-ups deste site”</b> e clique no botão de novo. ' +
          'Enquanto isso, o escritório continua funcionando aqui embaixo, dentro da plataforma.</p></div>'
        : '') +
      '<div class="moldura-live">' +
      '<iframe id="live-frame" src="/live" title="Escritório ao vivo do Arvys, em pixel-art" ' +
      'referrerpolicy="same-origin" onload="window.__arvysTemaLive && window.__arvysTemaLive()"></iframe></div>' +
      DICA_LIVE;
  }

  // =========================================================================
  // 9. SECAO — Trabalho
  // =========================================================================

  var STATUS_FILA = {
    'entregue': 'p-ok', 'em-spec': 'p-brass', 'aguardando': 'p-parado',
    'decidido': 'p-brass', 'arquivado': 'p-parado',
    'esperando você': 'p-atencao', 'espera contraditória': 'p-ruim'
  };

  // spec 2026-09-qg-tres-perguntas (T1.4 / decisao G1): o topo da fila deixa de
  // ser "o que esta sendo feito" e passa a ser "o que trava com voce". Quatro
  // cadeiras da mesa de 2026-09-06 chegaram nisso por caminhos diferentes.
  var G_ESPERA = 'esperando você';
  var G_CONFLITO = 'espera contraditória';
  var ORDEM_FILA = [G_ESPERA, G_CONFLITO, 'em-spec', 'aguardando', 'decidido', 'entregue', 'arquivado'];
  var VIS_TRABALHO = ['tabela', 'quadro', 'linha'];

  // spec 2026-09-qg-redesenho (T1/T3): o projeto vem do ARQUIVO. Item sem marca
  // aparece assim, visivel — nunca se adivinha o projeto por nome ou por pasta.
  /**
   * T2 · a divergencia entre o arquivo e o navegador aparece. Sem isto, "o
   * arquivo ganha" seria uma escolha em silencio — o defeito que a mesa de
   * 2026-09-06 nomeou tres vezes em contextos diferentes.
   */
  function avisoPrefs() {
    var linhas = [];
    if (PREFS_ESTADO === 'torto') {
      linhas.push('<strong>company/PREFERENCIAS.json está ilegível</strong> — estou usando o que este navegador lembra, e <strong>não vou sobrescrever o arquivo</strong> até você consertá-lo.');
    } else if (PREFS_ESTADO === 'sem-rede') {
      linhas.push('não consegui ler as preferências do arquivo; vale o que este navegador lembra.');
    }
    var divergentes = PREFS_AVISOS.filter(function (a) { return /^arvys\./.test(a); });
    if (divergentes.length) {
      linhas.push('o arquivo e este navegador discordam em <code>' + divergentes.map(esc).join('</code>, <code>') +
        '</code> — <strong>o arquivo ganhou</strong>.');
    }
    var outros = PREFS_AVISOS.filter(function (a) { return !/^arvys\./.test(a); });
    outros.forEach(function (a) { linhas.push(esc(a)); });
    if (!linhas.length) return '';
    return '<p class="aviso-prefs">' + linhas.join('<br>') + '</p>';
  }

  // T6.2 · filtro por situação, clicando no chip de contagem. Vive em memória
  // como o filtro de texto (FILTRO): é escolha do momento, não preferência.
  var FILTRO_SIT = Object.create(null);

  // ---- T6.3 · "adiar" — o verbo que faltava --------------------------------
  // Adiar é PREFERÊNCIA do dono (decisão G2), não estado do trabalho: vai para
  // `company/PREFERENCIAS.json`, e o item continua exatamente como está no
  // `company/FILA.md`. O registro é do escritório; a agenda é do dono.
  function adiados() {
    var cru = lembra('arvys.ordem.adiados');
    if (!cru) return {};
    try {
      var o = JSON.parse(cru);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  // spec 2026-09-qg-redesenho-2 (T4a, Emenda 1, critério 21): o mesmo
  // mecanismo, generalizado para uma CHAVE qualquer — a fila usa 'fila:'+numero
  // (preservado abaixo, ninguém mais muda), e "Esperando você" usa a chave que
  // `pendenciasDoDono()` já manda pronta em cada item (`it.chave`, formato
  // `pend:<fonte>:<hash>` — ver hub/lib/readers.js).
  function adiadoChave(chave) {
    var ate = adiados()[chave];
    if (!ate) return false;
    return String(ate) > hojeISO() ? ate : false;   // venceu: volta sozinho
  }
  function alternaAdiarChave(chave, ate) {
    var m = adiados();
    if (ate === 'amanha') {
      var d = new Date(Date.now() + 86400000);
      m[chave] = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } else {
      delete m[chave];
    }
    guarda('arvys.ordem.adiados', JSON.stringify(m));   // sobe para o arquivo (T2)
  }
  function adiado(numero) { return adiadoChave('fila:' + numero); }
  function alternaAdiar(numero, ate) { alternaAdiarChave('fila:' + numero, ate); }

  var SEM_PROJETO = '(sem projeto)';
  function chipProjeto(p) {
    if (!p) return '<span class="chip-proj chip-vazio" title="este item nao declara projeto em company/FILA.md">' + esc(SEM_PROJETO) + '</span>';
    return '<span class="chip-proj" data-proj="' + esc(p) + '">' + esc(p) + '</span>';
  }
  /** Ordem dos grupos por projeto: o maior primeiro, `(sem projeto)` sempre por ultimo. */
  function ordemProjetos(itens) {
    var cont = Object.create(null);
    itens.forEach(function (i) {
      var k = i.projeto || SEM_PROJETO;
      cont[k] = (cont[k] || 0) + 1;
    });
    return Object.keys(cont).sort(function (a, b) {
      if (a === SEM_PROJETO) return 1;
      if (b === SEM_PROJETO) return -1;
      return cont[b] - cont[a] || a.localeCompare(b, 'pt-BR');
    });
  }

  function regFila(it) {
    return registra('fila', it.numero, {
      rotuloTipoTexto: 'Item da fila · company/FILA.md',
      titulo: esc(it.numero + '. ') + inline(it.titulo),
      // T4: o subtitulo encolheu — situacao e projeto agora vivem no bloco de
      // propriedades logo abaixo, e repetir os dois era ruido, nao reforco.
      sub: '<span class="item-meta">item ' + esc(String(it.numero)) + ' da fila do escritório</span>',
      // T4 · as propriedades. Tudo vem do ARQUIVO: origem com linha, spec citada
      // no proprio texto, data da marca. O que o arquivo nao diz aparece "—".
      props: [
        { rot: 'Situação', val: '<span class="pil ' + (STATUS_FILA[it.status] || '') + '">' + esc(it.status || 'sem status') + '</span>' +
          (it.marca ? ' <span class="item-meta">marca: ' + esc(it.marca) + '</span>' : '') },
        { rot: 'Projeto', val: chipProjeto(it.projeto) },
        { rot: 'Iniciativa', val: it.spec ? '<code>' + esc(it.spec) + '</code> <span class="item-meta">citada no texto do item</span>' : '' },
        { rot: 'Adiado até', val: adiado(it.numero) ? '<span class="pil p-parado">' + esc(adiado(it.numero)) + '</span> <span class="item-meta">sua agenda, não o estado do item</span>' : '' },
        { rot: 'Origem', val: '<code>company/FILA.md' + (it.linhaNoArquivo ? ':' + it.linhaNoArquivo : '') + '</code>' },
        { rot: 'Última marca', val: it.dataMarca ? esc(it.dataMarca) : '' },
        { rot: 'Tamanho', val: '<span class="item-meta">' + esc(String(it.linhas)) + ' ' + plural(it.linhas, 'linha', 'linhas') + ' de texto</span>' }
      ].concat(
        // A gaveta era a ÚNICA superfície que não dizia nada sobre a marca
        // "espera o dono": quem abria o item contraditório lia "Situação:
        // entregue" e ia embora achando que estava tudo certo (reviewer do
        // risco N1, 2026-09-06 — apontado como plausível e confirmado aqui).
        it.esperaDono
          ? [{
              rot: 'Espera você',
              val: (it.esperaConflito
                     ? '<span class="pil p-atencao">contradiz a marca ' + esc(it.esperaConflito) + '</span> '
                     : '') +
                   (it.esperaDesde ? 'desde ' + esc(it.esperaDesde) : 'sem data na marca')
            }]
          : []
      ),
      // T6.3 · a gaveta ganha um VERBO. O teste do estranho fechou com "só sei
      // olhar": as três ações eram Copiar, Copiar e Copiar, e copiar não é uma
      // decisão. "Adiar" é preferência do dono (decisão G2) — escreve no
      // arquivo de preferências, NUNCA no registro do item. Mudar situação
      // continua fora de escopo (é o épico E8 do SaaS).
      acoes: [
        adiado(it.numero)
          ? { rot: 'Trazer de volta', adiar: it.numero, ate: null }
          : { rot: 'Adiar para amanhã', adiar: it.numero, ate: 'amanha' },
        { rot: 'Copiar o caminho', copiar: 'company/FILA.md' + (it.linhaNoArquivo ? ':' + it.linhaNoArquivo : '') },
        { rot: 'Copiar o item inteiro', copiar: it.numero + '. ' + textoCru(it.titulo) + '\n\n' + it.texto }
      ].concat(it.spec ? [{ rot: 'Copiar o caminho da spec', copiar: it.spec }] : []),
      corpo: function () { return '<div class="md">' + md(it.texto) + '</div>'; }
    });
  }

  function abaFila(d) {
    var res = PESADAS.fila;
    if (!res) return '<div class="carregando"><span class="spin"></span><p>Lendo a fila…</p></div>';
    return leitura(res, 'a fila do escritório', function (f) {
      var porStatus = f.porStatus || {};
      // T6.2 · o chip de contagem VIRA FILTRO. O teste do estranho (2026-09-06)
      // pegou isto com o dedo: ele tentou clicar em "entregue: 23" para ver só
      // o que terminou, e nada aconteceu. Rótulo com cara de botão é a interface
      // mentindo — ou vira botão, ou perde a cara.
      var chips = Object.keys(porStatus).map(function (k) {
        var on = FILTRO_SIT.fila === k;
        return '<button type="button" class="pil pil-b ' + (STATUS_FILA[k] || '') + (on ? ' ativo' : '') +
          '" data-sit="fila|' + esc(k) + '" aria-pressed="' + on + '"' +
          ' title="' + (on ? 'mostrar tudo de novo' : 'mostrar só o que está ' + esc(k)) + '">' +
          esc(k) + ': ' + porStatus[k] + '</button>';
      }).join(' ');
      if (FILTRO_SIT.fila) {
        chips += ' <button type="button" class="pil pil-b limpar" data-sit="fila|">mostrar tudo</button>';
      }
      var itens = (f.itens || []).slice();
      itens.forEach(function (it) { it.__chave = regFila(it); });
      if (FILTRO_SIT.fila) {
        itens = itens.filter(function (i) { return (i.status || 'sem status') === FILTRO_SIT.fila; });
      }
      var visao = visaoDe('trabalho', VIS_TRABALHO, 'tabela');
      // T1.4 · o estado vazio do que importa. Sem ninguem esperando o dono, a
      // tela DIZ isso — em vez de deixar o topo para o que ja esta em execucao
      // e o dono deduzir. Vazio e resposta, nao ausencia de resposta.
      var nEsp = Number(f.esperandoDono || 0);
      var nCon = Number(f.esperaContraditoria || 0);
      // spec 2026-09-qg-redesenho-2 (T1, critério 2): o grupo "Esperando você"
      // desta tela continua listando só itens da FILA (é a natureza da tela),
      // mas o vazio passa a citar o MESMO número do selo/Início
      // (`d.inicio.pendencias`, a função pura) em vez de deixar "Nada" sozinho
      // parecendo que não há pendência nenhuma no escritório.
      var pd = d.inicio && d.inicio.pendencias;
      var notaPend = pd && !pd.parcial
        ? ' · ' + pd.total + ' ' + plural(pd.total, 'pendência', 'pendências') + ' no Início (blockers, gates, radar)'
        : '';
      var linhaEspera = nEsp
        ? '<p class="fila-espera"><strong>' + nEsp + ' ' + plural(nEsp, 'item espera', 'itens esperam') +
          ' por você</strong> — ' + plural(nEsp, 'ele está', 'eles estão') + ' no topo da lista.</p>'
        : '<p class="fila-espera vazio">Nada da fila espera por você' + esc(notaPend) + '.</p>';
      var linhaConflito = nCon
        ? '<p class="fila-espera conflito">' + nCon + ' ' + plural(nCon, 'item diz', 'itens dizem') +
          ' que espera você <strong>e</strong> já está fechado — contradição no arquivo, veja o grupo abaixo.</p>'
        : '';
      // T6.5 · a tela diz O QUE ELA É — mas UMA vez só, no lead da seção
      // (logo abaixo do título "Trabalho"). Estava dito duas vezes na mesma
      // área, e o dono viu: "essa frase está ocupando espaço; temos uma frase
      // também abaixo do título". Resposta do estranho continua respondida,
      // sem o parágrafo repetido dentro do cartão.
      var oQueEIsto = '';
      var topo = linhaEspera + linhaConflito + avisoPrefs();

      if (visao === 'tabela') {
        var linhas = itens.map(function (it) {
          var proj = it.projeto || SEM_PROJETO;
          // T1.4: quem espera o dono sai do grupo de status e vai para o topo.
          // Contradicao (entregue E esperando) tem grupo proprio — some do topo
          // sem sumir da tela, que e o oposto de filtrar em silencio.
          var gStatus = it.esperaConflito ? G_CONFLITO
            : (it.esperaDono ? G_ESPERA : (it.status || 'sem status'));
          return {
            abre: it.__chave,
            busca: it.numero + ' ' + it.titulo + ' ' + it.status + ' ' + (it.marca || '') + ' ' + proj +
              (it.esperaDono ? ' espera o dono' : ''),
            grupoStatus: gStatus,
            grupoProjeto: proj,
            ord: {
              titulo: textoCru(it.titulo).toLowerCase(), numero: it.numero,
              status: ORDEM_FILA.indexOf(it.status) < 0 ? 9 : ORDEM_FILA.indexOf(it.status),
              projeto: proj, marca: it.marca || '', linhas: it.linhas
            },
            cel: {
              titulo: inline(it.titulo),
              numero: esc(String(it.numero)),
              projeto: chipProjeto(it.projeto),
              status: '<span class="pil ' + (STATUS_FILA[it.status] || '') + '">' + esc(it.status || 'sem status') + '</span>',
              marca: it.marca ? esc(it.marca) : '<span class="item-meta">—</span>',
              linhas: esc(String(it.linhas))
            }
          };
        });
        // T6.1 · "Linhas" (o tamanho do texto no arquivo) sai do padrão: era
        // metadado de arquivo em espaço nobre, e o estranho perguntou
        // "29 linhas de texto — de quê?". Continua disponível em COLUNAS.
        var colsFila = [
          { c: 'titulo', rot: 'Item' }, { c: 'numero', rot: 'Nº' },
          { c: 'projeto', rot: 'Projeto' },
          { c: 'status', rot: 'Situação' }, { c: 'marca', rot: 'Marca no arquivo' },
          { c: 'linhas', rot: 'Linhas', padraoOculta: true }
        ];
        colsFila.forEach(function (c) { if (c.padraoOculta) PADRAO_OCULTA['fila|' + c.c] = true; });
        var agr = agrupamentoDe('fila', ['status', 'projeto', 'nenhum'], 'status');
        var ROT_AGR = { status: 'Situação', projeto: 'Projeto', nenhum: 'nada' };
        var disp = menu('exibicao', 'Exibição', NOME_VIS[visao] + ' · por ' + ROT_AGR[agr],
          barraDisplay('fila', [
            { c: 'status', rot: 'Situação' }, { c: 'projeto', rot: 'Projeto' }, { c: 'nenhum', rot: 'Nada' }
          ], agr, colsFila.slice(1), 'trabalho', VIS_TRABALHO, visao));
        // O menu de filtro só existe se houver o que filtrar. E o resumo no
        // próprio botão diz o estado — menu fechado que esconde filtro ligado é
        // como o dono descobre, três dias depois, que a lista estava cortada.
        var filtroMenu = menu('filtro', 'Filtrar',
          FILTRO_SIT.fila ? 'só ' + FILTRO_SIT.fila : '',
          '<div class="menu-g"><span class="menu-rot">Só mostrar</span>' + chips + '</div>');
        var opcG = agr === 'nenhum' ? {} : (agr === 'projeto'
          ? { grupo: function (l) { return l.grupoProjeto; }, ordem: ordemProjetos(itens), tom: {} }
          : { grupo: function (l) { return l.grupoStatus; }, ordem: ORDEM_FILA, tom: STATUS_FILA });
        opcG.ordemPadrao = { col: 'numero', dir: -1 };   // T6.7: o mais recente em cima
        opcG.controles = disp + filtroMenu;              // vão para a MESMA linha da busca
        opcG.barraFora = true;                          // ...e a linha inteira sobe para as abas
        opcG.contagem = f.total + ' ' + plural(f.total, 'item', 'itens');
        return cartao(oQueEIsto + topo + tabelaOrd('fila', colsFila, linhas,
          'Filtrar por título, número ou projeto…', opcG));
      }

      // A CONTRADICAO tem de aparecer nas TRES visoes, nao so na tabela.
      // O reviewer do risco N1 (2026-09-06) provou que o quadro e a linha do
      // tempo agrupavam por `i.status` CRU: o item marcado ENTREGUE **e**
      // ESPERA O DONO caia na coluna "entregue" como qualquer outro, enquanto o
      // texto acima do quadro prometia "veja o grupo abaixo" — promessa vazia.
      // Esta e a mesma funcao que a tabela usa, agora compartilhada.
      var grupoDe = function (i) {
        return i.esperaConflito ? G_CONFLITO : (i.esperaDono ? G_ESPERA : i.status);
      };
      // (ORDEM_FILA já começa por G_ESPERA e G_CONFLITO — não duplicar.)

      if (visao === 'quadro') {
        var cols = ORDEM_FILA.filter(function (s) { return itens.some(function (i) { return grupoDe(i) === s; }); })
          .map(function (s) {
            return {
              titulo: s, tom: STATUS_FILA[s] || '',
              itens: itens.filter(function (i) { return grupoDe(i) === s; })
                .sort(function (a, b) { return b.numero - a.numero; })
                .map(function (i) {
                  return mini(i.__chave, inline(i.titulo), '<span class="item-meta">FILA ' + esc(String(i.numero)) + '</span>',
                    i.marca ? esc(i.marca) : '');
                })
            };
          });
        return topo + quadro(cols);
      }

      // linha do tempo: a numeracao da FILA e cronologica — item 1 e o mais antigo.
      var faixas = [];
      var mapaF = Object.create(null);
      itens.slice().sort(function (a, b) { return b.numero - a.numero; }).forEach(function (i) {
        var base = Math.floor((i.numero - 1) / 10) * 10;
        var rot = 'Itens ' + (base + 1) + ' a ' + (base + 10);
        if (!mapaF[rot]) { mapaF[rot] = { rotulo: rot, sub: '', itens: [] }; faixas.push(mapaF[rot]); }
        mapaF[rot].itens.push(mini(i.__chave, inline(i.titulo),
          '<span class="pil ' + (STATUS_FILA[grupoDe(i)] || '') + '">' + esc(grupoDe(i) || 'sem status') + '</span>',
          '<span class="item-meta">FILA ' + esc(String(i.numero)) + '</span>'));
      });
      faixas.forEach(function (g) { g.sub = g.itens.length + ' ' + plural(g.itens.length, 'item', 'itens'); });
      return topo + '<p class="item-meta" style="margin:0 0 var(--esp-3)">A <code>FILA.md</code> é numerada por ordem de ' +
        'chegada — esta é a linha do tempo do que foi pedido, do mais recente para o mais antigo.</p>' + linhaDoTempo(faixas);
    }, {
      titulo: 'A fila está vazia',
      texto: 'A fila guarda as ideias que ainda não viraram trabalho. Nenhuma foi registrada aqui.',
      caminho: 'escreva a primeira em <code>company/FILA.md</code>, ou peça ao Arvys durante uma sessão.'
    });
  }

  function abaRoadmap(d) {
    return leitura(d.trabalho.roadmap, 'o roadmap', function (r) {
      return cartao((r.intro ? '<div class="md" style="margin-bottom:var(--esp-4)">' + md(r.intro) + '</div>' : '') +
        (r.ondas || []).map(function (o) {
          var tab = o.tabela;
          var corpo = tab && tab.linhas && tab.linhas.length
            ? '<div class="tab-rolo"><table class="tab"><thead><tr>' +
              (tab.colunas || []).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
              '</tr></thead><tbody>' + tab.linhas.map(function (l) {
                return '<tr>' + l.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
              }).join('') + '</tbody></table></div>'
            : '<div class="md">' + md(o.notas || '') + '</div>';
          return '<details class="exp" open><summary><span class="t">' + esc(o.titulo) + '</span></summary>' +
            '<div class="corpo">' + corpo + '</div></details>';
        }).join(''));
    }, {
      titulo: 'Sem roadmap',
      texto: 'O roadmap é a ordem em que as ondas de trabalho vão acontecer. Ainda não existe um.',
      caminho: 'crie <code>company/ROADMAP.md</code> — o Arvys monta um a partir da fila quando você pedir.'
    });
  }

  function abaPedidos(d) {
    var res = PESADAS.pedidos;
    if (!res) return '<div class="carregando"><span class="spin"></span><p>Lendo os pedidos…</p></div>';
    return leitura(res, 'o inventário de pedidos do dono', function (p) {
      var pl = p.placar || {};
      var tot = (pl.concluidos || 0) + (pl.pendentes || 0);
      var pct = tot ? Math.round((pl.concluidos / tot) * 100) : 0;
      return cartao(
        '<div class="grade g3" style="margin-bottom:var(--esp-4)">' +
        num('Concluídos', esc(String(pl.concluidos != null ? pl.concluidos : '—')), 'de ' + tot,
          pct + '% de tudo que você já pediu', pct >= 60 ? 'ok' : 'atencao') +
        num('Pendentes', esc(String(pl.pendentes != null ? pl.pendentes : '—')), 'na fila',
          'esperando entrar numa onda do roadmap') +
        num('Superados', esc(String(pl.superados || 0)), plural(pl.superados || 0, 'pedido', 'pedidos'),
          'o escopo mudou e o pedido deixou de fazer sentido') +
        '</div>' + barra(pct, pct >= 60 ? 'ok' : 'atencao') +
        '<div style="margin-top:var(--esp-4)">' + (p.secoes || []).map(function (s) {
          var tab = s.tabela;
          return '<details class="exp"><summary><span class="t">' + esc(s.titulo) + '</span></summary><div class="corpo">' +
            (tab && tab.linhas && tab.linhas.length
              ? '<div class="tab-rolo"><table class="tab"><thead><tr>' +
                (tab.colunas || []).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
                '</tr></thead><tbody>' + tab.linhas.map(function (l) {
                  return '<tr>' + l.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
                }).join('') + '</tbody></table></div>'
              : '<div class="md">' + md(s.corpo || '(seção sem conteúdo)') + '</div>') +
            '</div></details>';
        }).join('') + '</div>');
    }, {
      titulo: 'Nenhum pedido registrado',
      texto: 'Este é o inventário do que você pediu ao escritório, com o que já foi entregue.',
      caminho: 'o Arvys cria <code>company/PEDIDOS-DO-DONO.md</code> quando você pede o inventário numa sessão.'
    });
  }

  var TOM_CAT = { 'pronta': 'p-ok', 'em-gate': 'p-atencao', 'em-andamento': 'p-brass', 'sem-convencao': 'p-parado' };
  var ORDEM_CAT = ['em-gate', 'em-andamento', 'sem-convencao', 'pronta'];

  function regEntrega(s) {
    return registra('entrega', s.dir || s.slug, {
      rotuloTipoTexto: 'Entrega · specs/' + (s.dir || s.slug),
      titulo: esc(s.title || s.slug),
      sub: '<span class="pil ' + (TOM_CAT[s.categoria] || '') + '">' + esc(s.categoria || s.status || '—') + '</span> ' +
        '<span class="item-meta">' + esc(s.ageDays != null ? 'aberta há ' + s.ageDays + ' ' + plural(s.ageDays, 'dia', 'dias') : 'sem data') + '</span>',
      corpo: function () {
        return '<dl class="def">' +
          '<dt>Pasta</dt><dd><code>specs/' + esc(s.dir || s.slug) + '</code></dd>' +
          '<dt>Situação</dt><dd>' + esc(s.categoria || '—') + (s.status ? ' · frontmatter <code>' + esc(s.status) + '</code>' : '') + '</dd>' +
          '<dt>Dono</dt><dd>' + esc(s.owner || 'sem dono declarado') + '</dd>' +
          '<dt>Gate aprovado</dt><dd>' + esc(s.gateAprovado === undefined || s.gateAprovado === null ? '—' : String(s.gateAprovado)) + '</dd>' +
          '<dt>Evidência</dt><dd>' + (s.hasEvidence
            ? 'sim — a pasta <code>specs/' + esc(s.dir || s.slug) + '/evidence/</code> existe'
            : 'não — nada em <code>evidence/</code> ainda') + '</dd>' +
          '<dt>Idade</dt><dd>' + esc(s.ageDays != null ? s.ageDays + ' ' + plural(s.ageDays, 'dia', 'dias') : '—') + '</dd>' +
          (s.tarefas && s.tarefas.length ? '<dt>Checklist</dt><dd><ul class="lista">' +
            s.tarefas.map(function (t) {
              var feito = !!(t && (t.done === true || t.mark === 'DONE'));
              var txt = typeof t === 'string' ? t : ((t && (t.text || t.texto)) || '');
              return '<li>[' + (feito ? 'x' : ' ') + '] ' + esc(textoCru(txt)) + '</li>';
            }).join('') + '</ul></dd>' : '') +
          '</dl>' +
          '<p class="item-meta" style="margin-top:var(--esp-4)">O QG lê a pasta da spec; o texto inteiro vive em disco, ' +
          'em <code>specs/' + esc(s.dir || s.slug) + '/spec.md</code>.</p>';
      }
    });
  }

  function abaEntregas(d) {
    var inv = d.trabalho.inventario || [];
    if (!inv.length) {
      return vazio('Nenhuma entrega ainda',
        'Cada iniciativa L2 ou maior vira uma spec com plano, checklist e evidência. Nenhuma existe aqui ainda.',
        'rode o ritual <code>/arvys:spec</code> na primeira demanda de feature.');
    }
    var lista = inv.slice();
    lista.forEach(function (s) { s.__chave = regEntrega(s); });
    var visao = visaoDe('trabalho', VIS_TRABALHO, 'tabela');

    if (visao === 'tabela') {
      var linhas = lista.map(function (s) {
        return {
          abre: s.__chave,
          busca: (s.title || '') + ' ' + (s.slug || '') + ' ' + (s.categoria || '') + ' ' + (s.owner || ''),
          ord: {
            titulo: String(s.title || s.slug).toLowerCase(),
            categoria: ORDEM_CAT.indexOf(s.categoria) < 0 ? 9 : ORDEM_CAT.indexOf(s.categoria),
            owner: s.owner || 'zzz', evidencia: s.hasEvidence ? 0 : 1,
            idade: s.ageDays == null ? 1e9 : s.ageDays
          },
          cel: {
            titulo: '<b>' + esc(s.title || s.slug) + '</b><span class="item-meta"> specs/' + esc(s.dir) + '</span>',
            categoria: '<span class="pil ' + (TOM_CAT[s.categoria] || '') + '">' + esc(s.categoria || s.status || '—') + '</span>',
            owner: esc(s.owner || 'sem dono'),
            evidencia: s.hasEvidence ? '<span class="pil p-ok sem-ponto">tem</span>' : '<span class="pil p-parado sem-ponto">não</span>',
            idade: esc(s.ageDays != null ? s.ageDays + ' d' : '—')
          }
        };
      });
      return cartao(tabelaOrd('entregas', [
        { c: 'titulo', rot: 'Entrega' }, { c: 'categoria', rot: 'Situação' },
        { c: 'owner', rot: 'Dono' }, { c: 'evidencia', rot: 'Evidência' }, { c: 'idade', rot: 'Idade' }
      ], linhas, 'Filtrar entregas por nome, dono ou situação…'));
    }

    if (visao === 'quadro') {
      return quadro(ORDEM_CAT.filter(function (c) { return lista.some(function (s) { return s.categoria === c; }); })
        .map(function (c) {
          return {
            titulo: c, tom: TOM_CAT[c] || '',
            itens: lista.filter(function (s) { return s.categoria === c; })
              .sort(function (a, b) { return (a.ageDays || 0) - (b.ageDays || 0); })
              .map(function (s) {
                return mini(s.__chave, esc(s.title || s.slug),
                  '<span class="item-meta">' + esc(s.owner || 'sem dono') + '</span>',
                  '<span class="item-meta">' + esc(s.ageDays != null ? s.ageDays + ' dias' : 'sem data') + ' · evidência: ' +
                  (s.hasEvidence ? 'sim' : 'não') + '</span>');
              })
          };
        }));
    }

    var FAIXAS = [
      { rotulo: 'Últimos 7 dias', min: 0, max: 7 },
      { rotulo: 'De 8 a 30 dias', min: 8, max: 30 },
      { rotulo: 'De 31 a 90 dias', min: 31, max: 90 },
      { rotulo: 'Mais de 90 dias', min: 91, max: 1e9 },
      { rotulo: 'Sem data no arquivo', min: null, max: null }
    ];
    var grupos = FAIXAS.map(function (f) {
      var dentro = lista.filter(function (s) {
        if (f.min === null) return s.ageDays == null;
        return s.ageDays != null && s.ageDays >= f.min && s.ageDays <= f.max;
      }).sort(function (a, b) { return (a.ageDays || 0) - (b.ageDays || 0); });
      return {
        rotulo: f.rotulo, sub: dentro.length + ' ' + plural(dentro.length, 'entrega', 'entregas'),
        itens: dentro.map(function (s) {
          return mini(s.__chave, esc(s.title || s.slug),
            '<span class="pil ' + (TOM_CAT[s.categoria] || '') + '">' + esc(s.categoria || '—') + '</span>',
            '<span class="item-meta">' + esc(s.owner || 'sem dono') + '</span>');
        })
      };
    }).filter(function (g) { return g.itens.length; });
    return '<p class="item-meta" style="margin:0 0 var(--esp-3)">Linha do tempo por idade da pasta da ' +
      'spec — a mais nova primeiro.</p>' + linhaDoTempo(grupos);
  }

  function secaoTrabalho(d) {
    var abas = [
      { id: 'fila', nome: 'Fila' },
      { id: 'roadmap', nome: 'Roadmap' },
      { id: 'pedidos', nome: 'Pedidos do dono' },
      { id: 'entregas', nome: 'Entregas' }
    ];
    CONTROLES_ABA = '';                    // cada repintura recomeça do zero
    var corpo = abaTrabalho === 'fila' ? abaFila(d)
      : abaTrabalho === 'roadmap' ? abaRoadmap(d)
      : abaTrabalho === 'pedidos' ? abaPedidos(d)
      : abaEntregas(d);
    // Roadmap e Pedidos sao leitura corrida (documento) — a regra das 3 visoes
    // vale onde ha LISTA acompanhavel: Fila e Entregas (OWNER.md).
    // A faixa de visualizações SAIU daqui: na Fila ela vive dentro do menu
    // "Exibição", na mesma linha da busca (pedido do dono: uma linha de menus).
    // As outras abas continuam com o seletor solto — elas não têm barra própria.
    var comVisoes = abaTrabalho === 'entregas';
    // Abas e controles na MESMA linha (pedido do dono, 2026-09-06). Em tela
    // estreita o flex quebra sozinho — a linha vira duas, e é o certo.
    return '<div class="linha-aba">' +
      '<div class="abas" role="tablist">' + abas.map(function (a) {
        return '<button type="button" class="btn' + (abaTrabalho === a.id ? ' ativo' : '') +
          '" role="tab" aria-selected="' + (abaTrabalho === a.id) + '" data-aba="' + a.id + '">' + esc(a.nome) + '</button>';
      }).join('') + '</div>' +
      CONTROLES_ABA +
      (comVisoes ? seletorVisao('trabalho', VIS_TRABALHO, visaoDe('trabalho', VIS_TRABALHO, 'tabela'), '') : '') +
      '</div>' + corpo;
  }

  // =========================================================================
  // 10. SECAO — Agentes (grade + ficha)
  // =========================================================================

  var VIS_AGENTES = ['cartoes', 'tabela', 'quadro'];

  function regAgente(a, estado, sc) {
    var m = a.meta || {};
    return registra('agente', a.dir, {
      rotuloTipoTexto: 'Agente · agents/' + a.dir,
      titulo: esc((m.emoji ? m.emoji + ' ' : '') + (m.callsign || a.dir)),
      sub: pilEstado(estado) + ' <span class="item-meta">' + esc(m.vibe || 'sem papel declarado') + '</span>',
      corpo: function () {
        var g = a.gotchas && a.gotchas.ok && a.gotchas.data ? a.gotchas.data : null;
        var fb = a.feedback && a.feedback.ok && a.feedback.data ? a.feedback.data : null;
        var ib = a.inbox && a.inbox.ok && a.inbox.data ? a.inbox.data : null;
        var b = a.boletim;
        return '<dl class="def">' +
          '<dt>Missão</dt><dd>' + esc(m.mission || '—') + '</dd>' +
          '<dt>Chame quando</dt><dd>' + esc(m.triggers || '—') + '</dd>' +
          '<dt>Entrega</dt><dd>' + esc(m.deliverables || '—') + '</dd>' +
          '<dt>Modelo</dt><dd>' + esc(m.model || '—') + '</dd>' +
          '<dt>Último L1</dt><dd>' + esc(idade(a.idadeL1Dias)) + '</dd>' +
          (sc ? '<dt>Experiência</dt><dd>nível ' + esc(sc.nivel) + ' · ' + fmtN(sc.xp) + ' XP · ' +
            esc(String(sc.fechadas)) + ' ' + plural(sc.fechadas, 'entrega fechada', 'entregas fechadas') + '</dd>' : '') +
          (b && b.fpy ? '<dt>FPY</dt><dd>' + esc(b.fpy.passaram + '/' + b.fpy.universo) + ' de primeira</dd>' : '') +
          (g ? '<dt>Leis próprias</dt><dd>' + esc(String(g.total || 0)) + ' em ' +
            esc(String((g.familias || []).length)) + ' ' + plural((g.familias || []).length, 'família', 'famílias') + '</dd>' : '') +
          (fb ? '<dt>Feedback do RH</dt><dd>' + esc(String((fb.resumo && fb.resumo.total) || 0)) + ' no total · ' +
            esc(String((fb.resumo && fb.resumo.aRatificar) || 0)) + ' a ratificar</dd>' : '') +
          (ib ? '<dt>Recados</dt><dd>' + esc(String(ib.naoLidos)) + ' não ' + plural(ib.naoLidos, 'lido', 'lidos') + '</dd>' : '') +
          '</dl>' +
          '<h4 style="margin:var(--esp-4) 0 var(--esp-2)">Onde ele parou</h4>' +
          '<div class="md">' + md(a.l1 || '_Ainda não fechou nenhuma sessão._') + '</div>' +
          ((a.inProgress || []).length
            ? '<h4 style="margin:var(--esp-4) 0 var(--esp-2)">Em progresso</h4><ul class="md"><li>' +
              a.inProgress.map(function (x) { return inline(x); }).join('</li><li>') + '</li></ul>' : '') +
          '<p style="margin-top:var(--esp-5)"><a class="btn" href="#/agentes/' + encodeURIComponent(a.dir) +
          '">Abrir a ficha completa deste agente →</a></p>';
      }
    });
  }

  function secaoAgentes(d) {
    var ags = d.agentes || [];
    if (!ags.length) {
      return vazio('Nenhum agente contratado ainda',
        'Um agente é uma pasta em agents/ com perfil, estado e as leis que ele aprendeu. Este escritório ainda não tem nenhum.',
        'rode o ritual <code>/arvys:hire</code> — ele entrevista você e cria a pasta completa.');
    }
    var gates = d.inicio.gates || [];
    var scores = LIVE && LIVE.scores && LIVE.scores.agents ? LIVE.scores.agents : {};
    ags.forEach(function (a) {
      a.__estado = estadoDoAgente(a, gates);
      a.__sc = scores[a.dir] || null;
      a.__chave = regAgente(a, a.__estado, a.__sc);
    });
    var visao = visaoDe('agentes', VIS_AGENTES, 'cartoes');
    // A nota saiu da faixa: "o cartão abre o detalhe" é o comportamento padrão
    // de TODA lista do QG, e repeti-lo em cada tela custa uma linha por tela.
    var seletor = seletorVisao('agentes', VIS_AGENTES, visao, '');

    // T2 (spec 2026-09-qg-redesenho-2, critério 4): faixa própria — contagem
    // de AGENTES, nunca de item de outra seção (a "barra herdada" que a
    // auditoria viu). Mesma forma de resumo que Radar/Leis (`.resumo-faixa`),
    // e vale nas 3 visões — cartões, tabela e quadro.
    var nTrabalhando = ags.filter(function (a) { return a.__estado === 'trabalhando'; }).length;
    var nEsperando = ags.filter(function (a) { return a.__estado === 'esperando-voce'; }).length;
    var extraAgentes = '<span class="resumo-faixa">' +
      '<span class="pil p-parado">' + ags.length + ' ' + plural(ags.length, 'agente', 'agentes') + '</span>' +
      (nTrabalhando ? ' <span class="pil p-ok">' + nTrabalhando + ' trabalhando</span>' : '') +
      (nEsperando ? ' <span class="pil p-atencao">' + nEsperando + ' esperando você</span>' : '') +
      '</span>';

    if (visao === 'tabela') {
      var linhas = ags.map(function (a) {
        var m = a.meta || {};
        return {
          abre: a.__chave,
          busca: (m.callsign || a.dir) + ' ' + a.dir + ' ' + (m.vibe || '') + ' ' + a.__estado + ' ' + textoCru(a.l1),
          ord: {
            nome: String(m.callsign || a.dir).toLowerCase(),
            papel: String(m.vibe || '').toLowerCase(),
            estado: Object.keys(ESTADOS).indexOf(a.__estado),
            l1: a.idadeL1Dias == null ? 1e9 : a.idadeL1Dias,
            xp: a.__sc ? -a.__sc.xp : 1
          },
          cel: {
            nome: '<span class="ag-linha-nome"><span aria-hidden="true">' + esc(m.emoji || '•') + '</span> <b>' +
              esc(m.callsign || a.dir) + '</b></span>',
            papel: esc(m.vibe || '—'),
            estado: pilEstado(a.__estado),
            l1: esc(idade(a.idadeL1Dias)),
            xp: a.__sc ? 'nível ' + esc(String(a.__sc.nivel)) + ' · ' + fmtN(a.__sc.xp) + ' XP' : '<span class="item-meta">—</span>'
          }
        };
      });
      var corpoAg = cartao(tabelaOrd('agentes', [
        { c: 'nome', rot: 'Agente' }, { c: 'papel', rot: 'Papel' }, { c: 'estado', rot: 'Estado' },
        { c: 'l1', rot: 'Último L1' }, { c: 'xp', rot: 'Experiência' }
      ], linhas, 'Filtrar agentes por nome, papel ou estado…', { barraFora: true }));
      return faixaDaSecao(seletor, extraAgentes) + corpoAg;
    }

    if (visao === 'quadro') {
      return faixaDaSecao(seletor, extraAgentes) + quadro(Object.keys(ESTADOS).map(function (k) {
        return {
          titulo: ESTADOS[k].rotulo, tom: ESTADOS[k].pil,
          itens: ags.filter(function (a) { return a.__estado === k; }).map(function (a) {
            var m = a.meta || {};
            return mini(a.__chave, esc((m.emoji || '•') + ' ' + (m.callsign || a.dir)),
              '<span class="item-meta">' + esc(m.vibe || '') + '</span>',
              '<span class="item-meta">L1 ' + esc(idade(a.idadeL1Dias)) + '</span>');
          })
        };
      }).filter(function (c) { return c.itens.length; }));
    }

    // T2 (spec 2026-09-qg-redesenho-2, critério 5): a visão padrão vira
    // galeria — retrato grande, cor do agente como único acento. O card
    // continua sendo o botão que abre a ficha, mas NADA interativo pode
    // nascer dentro dele: a função de glossário devolvia um botão próprio
    // para o termo "L1", e o parser HTML fechava o card no elemento de
    // dentro (achado do T0, `evidence/t0-diagnostico.md`). A correção mais
    // simples não é um 3º modo de saída para a função de glossário — é
    // simplesmente não chamá-la aqui: o termo já foi explicado em
    // `secaoInicio`/`fichaAgente` na mesma sessão, e dentro de um elemento
    // interativo ele não conseguiria abrir a folha do glossário mesmo que
    // quisesse (elemento interativo aninhado é inválido em HTML).
    return faixaDaSecao(seletor, extraAgentes) + '<div class="grade g-auto ag-galeria">' + ags.map(function (a) {
      var m = a.meta || {};
      var sc = a.__sc;
      return '<button type="button" class="ag-cartao" data-abre="' + esc(a.__chave) + '" style="--cor-ag:' + esc(m.color || '#999') + '">' +
        '<span class="ag-topo">' + retratoAgente(a.dir, m, 72) +
        '<span><span class="ag-nome">' + esc(m.callsign || a.dir) + '</span>' +
        '<span class="ag-papel">' + esc(m.vibe || '') + '</span>' +
        (temArte(a.dir) ? '' : '<span class="ag-semarte">' +
          (spriteEstado === 'falhou' ? 'sprite não carregou' : 'sem retrato') + '</span>') + '</span></span>' +
        '<span class="ag-l1">' + esc(textoCru(a.l1) || 'Ainda não fechou nenhuma sessão.') + '</span>' +
        '<span class="ag-rodape">' + pilEstado(a.__estado) +
        '<span>L1 ' + esc(idade(a.idadeL1Dias)) + '</span>' +
        (sc ? '<span>· nível ' + esc(sc.nivel) + ' · ' + fmtN(sc.xp) + ' XP</span>' : '') +
        '<span class="ag-abrir" aria-hidden="true">abrir →</span>' +
        '</span></button>';
    }).join('') + '</div>' +
      '<p class="item-meta" style="margin-top:var(--esp-4)">Clique num agente para abrir o detalhe sem sair da lista — ' +
      'a ficha inteira (persona, ' + J('boletim') + ', feedback do RH, leis próprias e recados) fica a um botão de distância.</p>';
  }

  // ---- T6 (spec 2026-09-qg-redesenho) · retrato do agente ------------------
  // O retrato NAO e arte nova: sao as mesmas pecas do escritorio ao vivo
  // (`hub/live/avatars.svg`), injetadas uma vez e reusadas por <use>.
  // A pergunta "este agente tem arte?" e respondida pelo PROPRIO sprite —
  // existe `#h-<nome>`? — em vez de por um campo que pode discordar do arquivo.
  var spriteEstado = 'nao-tentado';   // nao-tentado | carregando | pronto | falhou

  // R5 (reviewer 2026-09-06): esta rota e servida por `hub/serve.js` no local.
  // Para a nuvem (decisao D3 do SaaS) ela E UMA DEPENDENCIA NOVA: sem um
  // handler equivalente em app.arvys.com.br, o fetch dá 404 e TODO retrato cai
  // no emoji. Por isso o caminho fica aqui, num lugar so, e a falha e VISIVEL
  // na tela (o cartao diz "sprite não carregou", que e diferente de "este
  // agente nao tem arte"). O contrato esta anotado no epico E5 do genesis.
  var CAMINHO_SPRITE = '/live/avatars.svg';

  function carregaSpriteAvatares() {
    if (spriteEstado !== 'nao-tentado') return;
    spriteEstado = 'carregando';
    if (!window.fetch) { spriteEstado = 'falhou'; return; }
    fetch(CAMINHO_SPRITE).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (svg) {
      var caixa = document.createElement('div');
      caixa.id = 'sprite-avatares';
      caixa.setAttribute('aria-hidden', 'true');
      caixa.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      caixa.innerHTML = svg;
      document.body.appendChild(caixa);
      spriteEstado = 'pronto';
      pinta();   // repinta so a tela atual; nenhum fetch de dado acontece aqui
    }).catch(function () {
      // sem sprite o QG continua inteiro: todo agente cai no retrato de cor+emoji
      spriteEstado = 'falhou';
    });
  }

  function temArte(dir) {
    return spriteEstado === 'pronto' && !!document.getElementById('h-' + dir);
  }

  /**
   * `tam` em px. Retrato de verdade quando o sprite tem a cabeca do agente;
   * senao, cor + emoji com moldura tracejada e o motivo no `title` — a ausencia
   * de arte fica VISIVEL, que e o que faz alguem desenhar a que falta.
   */
  function retratoAgente(dir, m, tam) {
    var cor = (m && m.color) || 'var(--linha-forte)';
    var px = tam || 44;
    if (temArte(dir)) {
      return '<span class="ag-retrato" style="--cor-ag:' + esc(cor) + ';width:' + px + 'px;height:' + px + 'px">' +
        '<svg viewBox="12 0 24 24" role="img" aria-label="retrato de ' + esc((m && m.callsign) || dir) + '">' +
        '<use href="#f-head"></use><use href="#h-' + esc(dir) + '"></use></svg></span>';
    }
    // R5: "não tem arte" e "o sprite não chegou" são coisas diferentes, e a
    // tela tem de dizer qual das duas — senão uma falha de rota vira, aos
    // olhos do dono, seis agentes que "nunca foram desenhados".
    var motivo = spriteEstado === 'falhou'
      ? 'o sprite de retratos não carregou (' + CAMINHO_SPRITE + ') — nenhum agente tem retrato nesta sessão'
      : 'este agente ainda não tem retrato no escritório ao vivo';
    return '<span class="ag-retrato sem-arte' + (spriteEstado === 'falhou' ? ' sprite-falhou' : '') + '"' +
      ' style="--cor-ag:' + esc(cor) + ';width:' + px + 'px;height:' + px + 'px"' +
      ' title="' + esc(motivo) + '">' +
      '<span class="ag-retrato-emoji" aria-hidden="true">' + esc((m && m.emoji) || '•') + '</span></span>';
  }

  /** tira marcacao de markdown para caber num cartao curto — inclui link
   *  (`[texto](url)` -> so o texto) e marcador de lista solto na frente
   *  (`– - `, `* `…), achado T3/critério 8: item cru do Radar cujo título
   *  vem cru do JSON as vezes chega como linha de lista/link. */
  function textoCru(s) {
    return String(s || '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s*(?:[-*+–—]\s*)+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // T3/critério 6 (spec 2026-09-qg-redesenho-2): rótulo humano para as chaves
  // de boletim mais comuns — o resto do objeto usa a própria chave (melhor
  // que nada, nunca JSON).
  var ROTULOS_BOLETIM = {
    totalTokens: 'tokens', sessoes: 'sessões', gateDePrimeira: 'gate de primeira',
    defeitosConfirmados: 'defeitos confirmados', incidentes: 'incidentes',
    feedbacks: 'feedbacks', invasoesDeEscopo: 'invasões de escopo'
  };

  /**
   * Objeto de boletim -> linhas "rótulo: valor" legíveis, nunca JSON (T3,
   * critério 6). Aninhado além de 2 níveis não vira JSON também: fica "…" —
   * este boletim não tem gaveta própria por valor para guardar o caminho
   * completo (nenhum caso real passa de 1 nível hoje; ver NÃO MEDIDO na
   * evidência).
   */
  function linhasDeObjeto(v, prof) {
    prof = prof || 1;
    return Object.keys(v).map(function (k) {
      var val = v[k];
      var txt;
      if (val === null || val === undefined) txt = '—';
      else if (typeof val !== 'object') txt = String(val);
      else if (prof >= 2) txt = '…';
      else txt = linhasDeObjeto(val, prof + 1).join(', ');
      return esc(ROTULOS_BOLETIM[k] || k) + ': ' + esc(txt);
    });
  }

  function linhaBoletim(rot, l, fmt) {
    if (!l) return '';
    var v = l.valor;
    var txt;
    if (v === null || v === undefined) txt = '<span class="pil p-parado">n/d</span>';
    else if (typeof v === 'object') txt = linhasDeObjeto(v).join(' · ');
    else txt = esc(fmt ? fmt(v) : v);
    return '<tr><td style="white-space:nowrap"><b style="color:var(--tinta)">' + esc(rot) + '</b></td>' +
      '<td>' + txt + (l.motivoNd ? '<div class="item-meta">' + esc(l.motivoNd) + '</div>' : '') + '</td>' +
      '<td class="item-meta"><code>' + esc(l.fonte || '—') + '</code></td></tr>';
  }

  function fichaAgente(d, nome) {
    var ag = null;
    (d.agentes || []).forEach(function (a) { if (a.dir === nome) ag = a; });
    if (!ag) {
      return vazio('Não existe agente "' + nome + '"',
        'A ficha pedida não corresponde a nenhuma pasta em agents/ deste escritório.',
        'volte para <a href="#/agentes">a lista de agentes</a> e escolha um dos que existem.');
    }
    var m = ag.meta || {};
    var gates = d.inicio.gates || [];
    var sc = LIVE && LIVE.scores && LIVE.scores.agents ? LIVE.scores.agents[nome] : null;
    var b = ag.boletim;
    var out = [];

    out.push('<p style="margin:0 0 var(--esp-4)"><a class="btn fantasma" href="#/agentes">← todos os agentes</a></p>');

    out.push('<div class="ficha-topo" style="--cor-ag:' + esc(m.color || '#999') + '">' +
      retratoAgente(nome, m, 72) +
      '<div style="flex:1 1 240px;min-width:0">' +
      '<h2 style="font-size:var(--t-2)">' + esc(m.callsign || nome) + '</h2>' +
      '<p class="item-meta" style="margin:var(--esp-0) 0 var(--esp-2)">' + esc(m.vibe || '') + ' · ' + esc(m.mission || '') + '</p>' +
      pilEstado(estadoDoAgente(ag, gates)) + ' <span class="pil p-parado sem-ponto">' + J('L1') + ' ' + esc(idade(ag.idadeL1Dias)) + '</span>' +
      '</div>' +
      (sc ? '<div class="xp-barra" style="flex:1 1 200px">' +
        num('Experiência', 'nível ' + esc(sc.nivel), '', fmtN(sc.xp) + ' XP · ' + sc.fechadas + ' ' + plural(sc.fechadas, 'entrega fechada', 'entregas fechadas')) +
        barra(Math.min(100, (sc.xp % 500) / 5), 'ok') + '</div>' : '') +
      '</div>');

    out.push('<div class="bloco" style="margin-top:0">' + tituloBloco('Onde ele parou', 'o ' + J('L1') + ' da última sessão') +
      cartao('<div class="md">' + md(ag.l1 || '_Ainda não fechou nenhuma sessão._') + '</div>' +
        ((ag.inProgress || []).length ? '<h4 style="margin:var(--esp-4) 0 var(--esp-2)">Em progresso</h4><ul class="md"><li>' +
          ag.inProgress.map(function (x) { return inline(x); }).join('</li><li>') + '</li></ul>' : '')) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Persona', 'de agents/' + esc(nome) + '/AGENT.md') +
      cartao('<dl class="def">' +
        '<dt>Missão</dt><dd>' + esc(m.mission || '—') + '</dd>' +
        '<dt>Chame quando</dt><dd>' + esc(m.triggers || '—') + '</dd>' +
        '<dt>Entrega</dt><dd>' + esc(m.deliverables || '—') + '</dd>' +
        '<dt>Modelo</dt><dd>' + esc(m.model || '—') + '</dd>' +
        '<dt>Manda em</dt><dd>' + ((ag.owns || []).length ? (ag.owns || []).map(inline).join('<br>') : '—') + '</dd>' +
        '<dt>Não é dele</dt><dd>' + ((ag.defers || []).length ? (ag.defers || []).map(inline).join('<br>') : '—') + '</dd>' +
        '</dl>') + '</div>');

    if (b && b.linhas) {
      out.push('<div class="bloco">' + tituloBloco('Boletim', 'medido pelo ' + J('worker') + ', atribuição ' + esc(b.atribuicao || '—')) +
        cartao((b.fpy ? '<p style="margin:0 0 var(--esp-3)">' +
          num(J('FPY'), esc(b.fpy.passaram + '/' + b.fpy.universo), 'de primeira',
            (b.fpy.universo ? Math.round(b.fpy.passaram / b.fpy.universo * 100) : 0) + '% das entregas dele passaram sem retrabalho') + '</p>' : '') +
          '<div class="tab-rolo"><table class="tab"><thead><tr><th>Linha</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>' +
          linhaBoletim('Gate de primeira', b.linhas.gateDePrimeira) +
          linhaBoletim('Defeitos confirmados', b.linhas.defeitosConfirmados) +
          linhaBoletim('Incidentes', b.linhas.incidentes) +
          linhaBoletim('Sessões', b.linhas.sessoes) +
          linhaBoletim('Tokens por entrega', b.linhas.tokensPorEntrega) +
          linhaBoletim('Feedbacks', b.linhas.feedbacks) +
          linhaBoletim('Invasões de escopo', b.linhas.invasoesDeEscopo) +
          '</tbody></table></div>') + '</div>');
    }

    // T11: o dia dele, medido pela trilha do escritório ao vivo.
    out.push('<div class="bloco">' + tituloBloco('O dia dele',
      'de hub/live/events.jsonl — cada ação real desta sessão, sem nota e sem comparação com ninguém') +
      blocoEsforco(d, nome) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Feedback do RH', 'o que o orquestrador e o dono anotaram sobre ele') +
      leitura(ag.feedback, 'o feedback deste agente', function (f) {
        if (!f.entradas || !f.entradas.length) {
          return vazio('Sem feedback ainda', 'Ninguém anotou nada sobre este agente.',
            'o orquestrador escreve feedback no passo 3b do ritual <code>/arvys:close</code>.');
        }
        var r = f.resumo || {};
        return cartao('<p style="margin:0 0 var(--esp-3)">' +
          '<span class="pil p-brass">' + (r.total || 0) + ' no total</span> ' +
          '<span class="pil p-atencao">' + (r.aRatificar || 0) + ' a ratificar</span> ' +
          '<span class="pil p-parado">' + (r.doDono || 0) + ' do dono · ' + (r.doOrq || 0) + ' do orquestrador</span></p>' +
          '<ul class="lista">' + f.entradas.map(function (e) {
            return '<li><div class="item-cab">' +
              '<span class="pil ' + (e.ratificacao === 'ratificado' ? 'p-ok' : 'p-atencao') + '">' + esc(e.ratificacao || '—') + '</span>' +
              '<span class="item-meta">' + esc(e.origem || 'sem origem') + ' · por ' + esc(e.autoria || '?') +
              (e.forjada ? ' · <b style="color:var(--ruim)">autoria suspeita</b>' : '') + '</span></div>' +
              '<p style="margin:var(--esp-1) 0 0;font-size:var(--t-4)">' + esc(e.texto) + '</p>' +
              (e.ev ? '<p class="item-meta" style="margin:var(--esp-0) 0 0">evidência: <code>' + esc(e.ev) + '</code></p>' : '') +
              '</li>';
          }).join('') + '</ul>');
      }, {
        titulo: 'Sem feedback ainda',
        texto: 'O RH deste escritório é um arquivo por agente. O deste ainda não existe.',
        caminho: 'o feedback nasce no passo 3b do ritual <code>/arvys:close</code>.'
      }) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Leis próprias', 'os ' + J('gotcha', 'gotchas') + ' que ele aprendeu errando') +
      leitura(ag.gotchas, 'as leis deste agente', function (g) {
        return cartao('<p style="margin:0 0 var(--esp-3);color:var(--tinta-2)">' +
          esc(g.total || 0) + ' ' + plural(g.total || 0, 'lei', 'leis') + ' em ' +
          esc((g.familias || []).length) + ' ' + plural((g.familias || []).length, 'família', 'famílias') + '.</p>' +
          (g.familias || []).map(function (f) {
            return '<details class="exp"><summary><span class="t">' + esc(f.titulo) + '</span>' +
              '<span class="item-meta">' + (f.itens || []).length + ' ' + plural((f.itens || []).length, 'precedente', 'precedentes') + '</span></summary>' +
              '<div class="corpo"><p class="md"><strong>Lei:</strong> ' + inline(f.lei || '') + '</p>' +
              '<ul class="md">' + (f.itens || []).map(function (it) {
                return '<li><b>' + esc(it.numero) + '.</b> ' + inline(it.texto) + '</li>';
              }).join('') + '</ul></div></details>';
          }).join(''));
      }, {
        titulo: 'Nenhuma lei ainda',
        texto: 'As leis de um agente nascem dos erros dele. Este ainda não errou o suficiente para ter alguma.',
        caminho: 'elas nascem na retrospectiva semanal (<code>/arvys:retro</code>) a partir de <code>incidents/</code>.'
      }) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Caixa de recados', 'o que você deixou para ele ler na próxima sessão') +
      leitura(ag.inbox, 'a caixa de recados', function (ib) {
        if (!ib.entradas || !ib.entradas.length) {
          return vazio('Caixa vazia', 'Você não deixou nenhum recado para este agente.',
            'abra <a href="#/escritorio">o escritório ao vivo</a>, clique nele e escreva na caixa lateral.');
        }
        return cartao('<p style="margin:0 0 var(--esp-3)"><span class="pil ' + (ib.naoLidos ? 'p-atencao' : 'p-ok') + '">' +
          esc(ib.naoLidos) + ' não ' + plural(ib.naoLidos, 'lido', 'lidos') + '</span> <span class="pil p-parado">' +
          esc(ib.lidos) + ' ' + plural(ib.lidos, 'lido', 'lidos') + '</span></p>' +
          '<ul class="lista">' + ib.entradas.map(function (e) {
            return '<li><div class="item-cab"><span class="pil ' + (e.lido ? 'p-ok' : 'p-atencao') + '">' +
              (e.lido ? 'lido' : 'não lido') + '</span><span class="item-meta">' + esc(String(e.iso || '').slice(0, 10)) + '</span></div>' +
              '<p style="margin:var(--esp-1) 0 0;font-size:var(--t-4)">' + esc(e.texto) + '</p></li>';
          }).join('') + '</ul>');
      }, {
        titulo: 'Caixa vazia',
        texto: 'Você ainda não deixou recado para este agente.',
        caminho: 'abra <a href="#/escritorio">o escritório ao vivo</a>, clique no personagem e escreva.'
      }) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Documentos do agente', 'playbooks, pesquisas, rascunhos e autópsias') +
      leitura(ag.docs, 'os documentos deste agente', function (dc) {
        if (!dc.total) {
          return vazio('Nenhum documento', 'Este agente ainda não escreveu playbook, pesquisa, rascunho nem autópsia.',
            'eles nascem quando o agente produz algo que sobrevive à sessão — nada a fazer agora.');
        }
        return cartao((dc.pastas || []).map(function (p) {
          return '<h4 style="margin:0 0 var(--esp-2)">' + esc(p.pasta) + '</h4><ul class="lista" style="margin-bottom:var(--esp-4)">' +
            (p.arquivos || []).map(function (a) {
              return '<li><div class="item-cab"><span class="t">' + esc(a.titulo || a.nome) + '</span></div>' +
                '<p class="item-meta" style="margin:var(--esp-0) 0 0"><code>' + esc(a.arquivo) + '</code> · ' + fmtBytes(a.bytes) + '</p></li>';
            }).join('') + '</ul>';
        }).join('') + (dc.fpy ? '<p class="item-meta">Tem <code>FPY.md</code> próprio.</p>' : ''));
      }, {
        titulo: 'Nenhum documento',
        texto: 'Este agente ainda não tem pasta de playbooks, pesquisas, rascunhos ou autópsias.',
        caminho: 'nada a fazer — elas nascem sozinhas conforme ele trabalha.'
      }) + '</div>');

    return out.join('');
  }

  // =========================================================================
  // 11. SECAO — Decisoes
  // =========================================================================

  var VIS_DECISOES = ['linha', 'tabela', 'cartoes'];

  function autorLimpo(e) {
    return String(e.author || '').replace(/\*/g, '').trim() || 'autor não registrado';
  }

  function regDecisao(e, i) {
    return registra('decisao', i, {
      rotuloTipoTexto: 'Decisão · company/DECISIONS.md',
      titulo: inline(e.title),
      sub: '<span class="item-meta">' + esc(dataLonga(e.date)) + ' · ' + esc(idade(diasEntre(e.date))) +
        ' · por ' + esc(autorLimpo(e)) + '</span>',
      corpo: function () {
        return (e.summary ? '<p class="md"><strong>' + esc(e.summary) + '</strong></p>' : '') +
          '<div class="md">' + md(e.body || '_A decisão foi registrada só com título._') + '</div>';
      }
    });
  }

  function secaoDecisoes(d) {
    var res = PESADAS.decisoes;
    if (!res) return '<div class="carregando"><span class="spin"></span><p>Lendo o livro de decisões…</p></div>';
    return leitura(res, 'o livro de decisões', function (dc) {
      var todas = dc.entradas || [];
      todas.forEach(function (e, i) { e.__chave = regDecisao(e, i); });
      var visao = visaoDe('decisoes', VIS_DECISOES, 'linha');
      var seletor = seletorVisao('decisoes', VIS_DECISOES, visao, '');

      if (!todas.length) {
        return faixaDaSecao(seletor) + vazio('O livro está em branco',
          'Cada escolha que vale para o futuro do escritório é gravada aqui com data e autor. Nenhuma ainda.',
          'as decisões nascem no ritual <code>/arvys:close</code> ou quando você decide algo numa sessão.');
      }

      if (visao === 'tabela') {
        var linhasT = todas.map(function (e) {
          return {
            abre: e.__chave,
            busca: (e.title || '') + ' ' + (e.summary || '') + ' ' + (e.body || '') + ' ' + (e.author || '') + ' ' + (e.date || ''),
            ord: {
              titulo: textoCru(e.title).toLowerCase(), data: String(e.date || ''),
              autor: autorLimpo(e).toLowerCase(), resumo: String(e.summary || '').toLowerCase()
            },
            cel: {
              titulo: inline(e.title),
              data: esc(String(e.date || '—')),
              autor: esc(autorLimpo(e)),
              resumo: e.summary ? esc(String(e.summary).slice(0, 90)) + (String(e.summary).length > 90 ? '…' : '')
                : '<span class="item-meta">sem resumo</span>'
            }
          };
        });
        var corpoDec = cartao(tabelaOrd('decisoes', [
          { c: 'titulo', rot: 'Decisão' }, { c: 'data', rot: 'Data' },
          { c: 'autor', rot: 'Autor' }, { c: 'resumo', rot: 'Resumo' }
        ], linhasT, 'Filtrar o livro por título, resumo ou autor…', { barraFora: true }));
        return faixaDaSecao(seletor) + corpoDec;
      }

      var termo = buscaDecisoes.trim().toLowerCase();
      var lista = !termo ? todas : todas.filter(function (e) {
        return ((e.title || '') + ' ' + (e.summary || '') + ' ' + (e.body || '') + ' ' + (e.author || ''))
          .toLowerCase().indexOf(termo) >= 0;
      });
      var porDia = [];
      var mapa = Object.create(null);
      lista.forEach(function (e) {
        if (!mapa[e.date]) { mapa[e.date] = { dia: e.date, itens: [] }; porDia.push(mapa[e.date]); }
        mapa[e.date].itens.push(e);
      });
      porDia.sort(function (a, b) { return String(b.dia).localeCompare(String(a.dia)); });

      // Era uma faixa própria (`.cab-linha`) abaixo das visões: duas linhas de
      // controle para a mesma lista. Agora é a `.barra-um` de sempre, e sobe
      // para a linha das visões via `faixaDaSecao(seletor, cabeca)`.
      var cabeca = '<div class="barra-um">' +
        '<input class="campo" id="busca-dec" type="search" placeholder="Buscar no livro (título, resumo, autor)…" value="' + esc(buscaDecisoes) + '">' +
        '<span class="barra-conta item-meta">' + lista.length + ' de ' + todas.length + ' ' +
        plural(todas.length, 'decisão', 'decisões') + ' · ' + porDia.length + ' ' + plural(porDia.length, 'dia', 'dias') + '</span></div>';

      if (!lista.length) {
        return faixaDaSecao(seletor, cabeca) + vazio('Nada encontrado para "' + buscaDecisoes + '"',
          'Nenhuma decisão do livro casa com esse texto.',
          'apague a busca para ver as ' + todas.length + ' decisões.');
      }

      if (visao === 'cartoes') {
        return faixaDaSecao(seletor, cabeca) + grade(lista.map(function (e) {
          return mini(e.__chave, inline(e.title),
            '<span class="item-meta">' + esc(dataLonga(e.date)) + '</span>',
            '<span class="item-meta">por ' + esc(autorLimpo(e)) + '</span>' +
            (e.summary ? '<span class="mini-res">' + esc(String(e.summary).slice(0, 140)) + '</span>' : ''));
        }));
      }

      return faixaDaSecao(seletor, cabeca) + linhaDoTempo(porDia.map(function (g) {
        return {
          rotulo: dataLonga(g.dia),
          sub: idade(diasEntre(g.dia)) + ' · ' + g.itens.length + ' ' + plural(g.itens.length, 'decisão', 'decisões'),
          itens: g.itens.map(function (e) {
            return mini(e.__chave, inline(e.title),
              '<span class="item-meta">por ' + esc(autorLimpo(e)) + '</span>',
              e.summary ? '<span class="mini-res">' + esc(String(e.summary).slice(0, 140)) + '</span>' : '');
          })
        };
      }));
    }, {
      titulo: 'O livro está em branco',
      texto: 'Cada escolha que vale para o futuro é gravada aqui com data e autor. Nenhuma existe ainda.',
      caminho: 'crie <code>company/DECISIONS.md</code> — o ritual <code>/arvys:close</code> escreve nele.'
    });
  }

  // =========================================================================
  // 11b. SECAO — Historico & busca (spec 2026-09-saas-e6-historico, T6)
  //
  //  DUAS ROTAS DA NUVEM, E NENHUMA DELAS EXISTE NO SHELL LOCAL:
  //    GET /api/historico   (T4) -> { pushes: [{endereco, geradoEm, arquivos}] }
  //    GET /api/busca?q=    (T5) -> { termo, teto, truncado, resultados:
  //                                   [{caminho, trecho, endereco, geradoEm}] }
  //  O `hub/serve.js` local responde 404 text/plain nas duas — e isso NAO e um
  //  erro: e a resposta certa para "esta secao nao existe neste escritorio".
  //  Por isso o 404 tem tratamento PROPRIO aqui, separado do torto.
  //
  //  OS TRES VAZIOS SAO TRES COISAS DIFERENTES (R6 do plan.md — 5a ocorrencia
  //  da familia). Uma frase so para as tres e o defeito de 07/09 outra vez:
  //    1. escritorio com 0 ou 1 push .......... "ainda não há histórico"
  //    2. rota/secao ausente neste escritorio .. "não existe aqui"
  //    3. busca que voltou 0 resultados ........ "sua busca não achou nada"
  //  Cada uma tem TITULO proprio, TEXTO proprio e CAMINHO proprio. Trocar
  //  qualquer uma pela outra e mentir para quem le.
  // =========================================================================

  var VIS_HIST = ['tabela', 'cartoes', 'linha'];

  /** {estado:'ok'|'nao-existe'|'torto', pushes, erro} — null enquanto nao pedi. */
  var HIST = null;
  var HIST_PEDIDO = false;
  /** {estado:'buscando'|'ok'|'nao-existe'|'recusa'|'torto', termo, resultados, truncado, teto, erro} */
  var BUSCA = null;
  var buscaTermo = '';            // o que esta DENTRO do campo, ainda nao enviado
  var buscaEmVoo = 0;             // resposta velha nunca ganha da nova
  var abaHistorico = 'pushes';    // pushes | busca
  var FILTRO_H = { agente: '', tipo: '' };

  /** Instante ISO -> Date, ou null. Nunca lanca: a data vem da rede. */
  function instante(iso) {
    var d = new Date(String(iso || ''));
    return isFinite(d.getTime()) ? d : null;
  }
  /** O DIA LOCAL de um instante — "2026-09-08". Aqui converter e o certo: o
   *  campo `geradoEm` e um instante de verdade, nao uma data-only (gotcha 7). */
  function diaLocal(iso) {
    var d = instante(iso);
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function horaLocal(iso) {
    var d = instante(iso);
    if (!d) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function quandoLongo(iso) {
    var dia = diaLocal(iso);
    if (!dia) return 'sem data';
    return dataLonga(dia) + ' às ' + horaLocal(iso);
  }

  /** O agente dono do caminho — "" quando o arquivo e do escritorio, nao de um agente. */
  function agenteDoCaminho(c) {
    var m = /(?:^|\/)agents\/([^/]+)\//.exec(String(c || ''));
    return m ? m[1] : '';
  }

  /**
   * O TIPO do item, deduzido do caminho. A ordem das regras importa: pasta
   * ganha de extensao (um `.md` dentro de `incidents/` e um incidente, nao um
   * "documento"), e nome fechado ganha de pasta.
   */
  function tipoDoCaminho(c) {
    var p = String(c || '');
    var nome = p.split('/').pop() || '';
    if (/DECISIONS\.md$/i.test(nome)) return 'decisão';
    if (/GOTCHAS\.md$/i.test(nome)) return 'lei';
    if (/FEEDBACK\.md$/i.test(nome)) return 'feedback';
    if (/INBOX\.md$/i.test(nome)) return 'recado';
    if (/AGENT\.md$/i.test(nome)) return 'persona';
    if (/STATE\.md$/i.test(nome)) return 'estado';
    if (/(^|\/)incidents\//i.test(p)) return 'incidente';
    if (/(^|\/)specs\//i.test(p)) return 'spec';
    if (/(PLAYBOOK|README|MANUAL|CLAUDE|OWNER)\.md$/i.test(nome)) return 'manual';
    if (/\.md$/i.test(nome)) return 'documento';
    if (/\.(json|jsonl|ya?ml|toml)$/i.test(nome)) return 'dado';
    return 'arquivo';
  }

  /** Marca as ocorrencias do termo NO TRECHO, sem nunca soltar HTML cru. */
  function destaca(texto, termo) {
    var t = String(texto || '');
    var q = String(termo || '');
    if (!q) return esc(t);
    var alvo = t.toLowerCase(), agulha = q.toLowerCase();
    // minusculizar muda o TAMANHO em alguns alfabetos (İ -> i̇): se mudou, as
    // posicoes deixam de valer para o texto original e o destaque sai errado.
    if (alvo.length !== t.length || agulha.length !== q.length) return esc(t);
    var out = '', i = 0, p;
    while ((p = alvo.indexOf(agulha, i)) >= 0) {
      out += esc(t.slice(i, p)) + '<mark>' + esc(t.slice(p, p + q.length)) + '</mark>';
      i = p + q.length;
    }
    return out + esc(t.slice(i));
  }

  /**
   * A HONESTIDADE MINIMA SOBRE UM LIMITE MEDIDO E NAO CONSERTADO (T5, decisao 1).
   *
   * Medido por HTTP autenticado na T6, no MESMO corpus (evidence/T6-tela.md §6):
   *   `cota` -> 7 · `COTA` -> 7   (ASCII dobra: maiuscula NAO muda nada)
   *   `decisão` -> 3 · `Decisão` -> 3
   *   `DECISÃO` -> 0   e   `decisao` -> 0
   *
   * Sao DOIS limites, nao um. A T5 nomeou o primeiro (acento em maiuscula);
   * o segundo — **termo sem acento nao acha a palavra acentuada** — apareceu
   * aqui. A causa e a mesma: a coluna varrida e `encode(content,'escape')`, o
   * `ILIKE` so dobra ASCII, e ali `Ã`/`ã` sao sequencias de bytes distintas e
   * `decisao` simplesmente nao e substring de `decis\\303\\243o`.
   *
   * O conserto e mudanca de DESENHO e nao e desta tarefa. Mas uma busca que
   * nao acha e diz apenas "sua busca não achou nada" faz o dono concluir que
   * o CONTEUDO nao existe — e nesses dois casos o conteudo existe. Por isso a
   * linha aparece em TODA busca vazia cujo termo tenha letra: qualquer termo
   * com letra pode estar caindo num dos dois lados, e adivinhar em qual
   * seria o mesmo erro de esconder.
   */
  function avisoDoLimiteDeAcento(termo) {
    // Só some quando o limite NÃO pode ser a causa: termo sem letra nenhuma
    // (número, pontuação) não tem acento para casar nem para errar.
    if (!/\p{L}/u.test(String(termo || ''))) return '';
    return '<p class="aviso-limite"><b>Antes de concluir que não existe:</b> a busca casa o acento ' +
      '<b>byte a byte</b> — é limite medido e ainda não consertado. Medido nesta mesma tela: ' +
      '<code>decisão</code> → 3 · <code>DECISÃO</code> → 0 · <code>decisao</code> → 0. ' +
      'Repita o termo em minúsculas e com o acento exatamente como ele foi escrito.</p>';
  }

  // ---- rede: as duas rotas, com o 404 tratado como RESPOSTA, nao como erro --

  function registraChamada(caminho) {
    REDE.total++;
    REDE.chamadas.push({ n: REDE.total, caminho: caminho, quando: new Date().toISOString() });
  }

  /** Le o corpo como JSON sem derrubar nada: rota ausente devolve text/plain. */
  function corpoJson(r) {
    return r.text().then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { return null; }
    });
  }

  function pegaHistorico() {
    if (HIST_PEDIDO) return Promise.resolve(HIST);
    HIST_PEDIDO = true;
    registraChamada('/api/historico');
    return fetch('/api/historico', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        // 404 = "não existe aqui". Vale para os DOIS casos, e os dois sao o
        // mesmo fato para quem le: o shell local (que nao serve esta rota) e a
        // sessao sem escritorio (`respostaHistorico` devolve 404).
        if (r.status === 404) { HIST = { estado: 'nao-existe' }; return HIST; }
        if (!r.ok) { HIST = { estado: 'torto', erro: 'HTTP ' + r.status + ' em /api/historico' }; return HIST; }
        return corpoJson(r).then(function (j) {
          if (!j || !Array.isArray(j.pushes)) {
            HIST = { estado: 'torto', erro: 'a resposta de /api/historico não trouxe a lista "pushes"' };
          } else {
            HIST = { estado: 'ok', pushes: j.pushes };
          }
          return HIST;
        });
      })
      .catch(function (e) {
        HIST = { estado: 'torto', erro: String((e && e.message) || e) };
        return HIST;
      });
  }

  function fazBusca(termo) {
    var limpo = String(termo || '').trim();
    if (!limpo) { BUSCA = null; pinta(); focaBusca(); return; }
    var meu = ++buscaEmVoo;
    BUSCA = { estado: 'buscando', termo: limpo };
    pinta();
    focaBusca();
    registraChamada('/api/busca?q=' + encodeURIComponent(limpo));
    fetch('/api/busca?q=' + encodeURIComponent(limpo), { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return corpoJson(r).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        if (meu !== buscaEmVoo) return;      // chegou depois de uma busca mais nova
        if (o.s === 200 && o.j && Array.isArray(o.j.resultados)) {
          BUSCA = {
            estado: 'ok', termo: limpo, resultados: o.j.resultados,
            truncado: o.j.truncado === true, teto: o.j.teto
          };
        } else if (o.s === 404) {
          BUSCA = { estado: 'nao-existe', termo: limpo };
        } else if (o.s === 400) {
          BUSCA = { estado: 'recusa', termo: limpo, erro: (o.j && o.j.erro) || 'termo recusado', teto: o.j && o.j.teto };
        } else {
          BUSCA = { estado: 'torto', termo: limpo, erro: 'HTTP ' + o.s + ' em /api/busca' };
        }
        pinta();
        focaBusca();
      })
      .catch(function (e) {
        if (meu !== buscaEmVoo) return;
        BUSCA = { estado: 'torto', termo: limpo, erro: String((e && e.message) || e) };
        pinta();
        focaBusca();
      });
  }

  /** Devolve o cursor ao campo depois da repintura — buscar nao pode tirar o foco. */
  function focaBusca() {
    var c = document.getElementById('busca-hist');
    if (!c) return;
    try { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } catch (e) { /* type=search */ }
  }

  // ---- E9 · T5 — o item bloqueado: motivo real (busca sob demanda) + e-mail
  //
  // `p.bloqueado` já vem em CADA linha da LISTA (`GET /api/historico`,
  // `pushesDoDono` — E9 T3): a lista nunca esconde a existência do push, só
  // o CONTEÚDO some quando o item é aberto (C1). Por isso a lista/tabela usa
  // `p.bloqueado` direto, sem chamada extra — mas o MOTIVO e o CTA (que
  // dependem do idioma/região da conta, e cujo pedido é o que grava M1 em
  // `HistoricoBloqueio`) só existem na resposta de `?push=<endereço>`.
  // Reabrir a MESMA gaveta várias vezes não infla M1 — `registrarBloqueio` é
  // upsert por `(officeId, pushId)`, provado em `check-historico-limite`.

  /** Cache por endereço, só desta pintura da tela — reabrir a MESMA gaveta
   *  não dispara uma 2ª rede-viagem (o servidor já é idempotente por conta
   *  do upsert, mas poupar a chamada evita 2 GETs pelo mesmo clique). */
  var BLOQUEIO_CACHE = Object.create(null);

  function buscarBloqueio(endereco) {
    if (BLOQUEIO_CACHE[endereco]) return BLOQUEIO_CACHE[endereco];
    registraChamada('/api/historico?push=' + endereco.slice(0, 8) + '…');
    var pedido = fetch('/api/historico?push=' + encodeURIComponent(endereco), {
      cache: 'no-store', headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return corpoJson(r).then(function (j) { return { status: r.status, corpo: j }; }); })
      .catch(function (e) { return { status: -1, corpo: null, erro: String((e && e.message) || e) }; });
    BLOQUEIO_CACHE[endereco] = pedido;
    return pedido;
  }

  function htmlBloqueio(resp) {
    if (resp.status !== 200 || !resp.corpo || resp.corpo.bloqueado !== true) {
      return '<p class="item-meta">Não consegui confirmar o motivo agora' +
        (resp.erro ? ' (' + esc(resp.erro) + ')' : ' (HTTP ' + esc(String(resp.status)) + ')') +
        ' — feche e reabra a gaveta para tentar de novo.</p>';
    }
    var j = resp.corpo;
    return '<p class="md">' + esc(j.motivo || '') + '</p>' +
      (j.cta ? '<p class="md item-meta">' + esc(j.cta) + '</p>' : '') +
      '<form class="paywall-form" data-paywall="1">' +
        '<input class="campo" type="email" required autocomplete="email" placeholder="seu-email@exemplo.com" data-paywall-email>' +
        '<button type="submit" class="gav-b">Avisar-me</button>' +
      '</form>' +
      '<p class="item-meta" data-paywall-status hidden></p>';
  }

  /** Liga o `submit` do formulário que acabou de entrar no DOM da gaveta —
   *  chamado de novo a cada repintura do corpo bloqueado (a gaveta só tem
   *  um formulário por vez, então não duplica listener em cima de si). */
  function ligaFormularioPaywall(raiz) {
    var form = raiz.querySelector('form[data-paywall]');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = form.querySelector('[data-paywall-email]');
      var status = raiz.querySelector('[data-paywall-status]');
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      registraChamada('/api/paywall/email');
      fetch('/api/paywall/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value })
      })
        .then(function (r) { return corpoJson(r).then(function (j) { return { status: r.status, corpo: j }; }); })
        .catch(function (e) { return { status: -1, corpo: null, erro: String((e && e.message) || e) }; })
        .then(function (resp) {
          btn.disabled = false;
          if (!status) return;
          status.hidden = false;
          if (resp.status === 200) {
            status.innerHTML = '<span class="pil p-ok">' + esc((resp.corpo && resp.corpo.mensagem) || 'e-mail registrado') + '</span>';
            input.value = '';
          } else {
            status.innerHTML = '<span class="pil p-ruim">' + esc((resp.corpo && resp.corpo.erro) || resp.erro || ('HTTP ' + resp.status)) + '</span>';
          }
        });
    });
  }

  /** Preenche a gaveta com o motivo real assim que a resposta chegar — só se
   *  a gaveta ainda estiver aberta NESTA MESMA chave (o dono pode ter
   *  fechado ou aberto outro item enquanto a rede ia e voltava). */
  function pintaBloqueioNaGaveta(endereco, chave) {
    buscarBloqueio(endereco).then(function (resp) {
      if (!gavetaAberta() || gavetaChave !== chave) return;
      var corpo = $('#gaveta-corpo');
      var alvo = corpo && corpo.querySelector('[data-bloqueio-alvo]');
      if (!alvo) return;
      alvo.outerHTML = htmlBloqueio(resp);
      ligaFormularioPaywall(corpo);
    });
  }

  // ---- registros da gaveta -------------------------------------------------

  function regPush(p, i) {
    var arq = typeof p.arquivos === 'number' ? p.arquivos : null;
    var bloqueado = p.bloqueado === true;
    var chave = 'push:' + i;
    return registra('push', i, {
      rotuloTipoTexto: 'Push · GET /api/historico',
      titulo: esc(quandoLongo(p.geradoEm)),
      sub: '<span class="item-meta">' +
        (bloqueado
          ? '<span class="pil p-parado">bloqueado — mais de 30 dias</span>'
          : (arq === null ? 'sem contagem' : fmtN(arq) + ' ' + plural(arq, 'arquivo', 'arquivos'))) +
        ' · ' + esc(idade(diasEntre(diaLocal(p.geradoEm)))) + '</span>',
      props: bloqueado
        ? [{ rot: 'Data e hora', val: esc(quandoLongo(p.geradoEm)) }]
        : [
            { rot: 'Data e hora', val: esc(quandoLongo(p.geradoEm)) },
            { rot: 'Arquivos neste push', val: arq === null ? '' : esc(fmtN(arq)) },
            { rot: 'Origem (endereço público)', val: '<code>' + esc(p.endereco || '') + '</code>' }
          ],
      corpo: bloqueado
        ? function () {
            // Dispara a busca real DEPOIS de devolver o placeholder — é essa
            // busca (`?push=<endereço>`) que grava M1, uma vez por
            // `(officeId, pushId)`, nunca uma vez por clique (idempotente).
            setTimeout(function () { pintaBloqueioNaGaveta(p.endereco, chave); }, 0);
            return '<div class="carregando" data-bloqueio-alvo><span class="spin"></span><p>Conferindo…</p></div>';
          }
        : function () {
            return '<p class="md">Este endereço é um <b>HMAC</b> de <code>officeId + push.id</code> (T2): ' +
              'estável entre pedidos e entre reinícios do servidor, e <b>não resolve</b> no escritório de ' +
              'outra pessoa. O <code>push.id</code> interno nunca sai numa resposta.</p>' +
              '<p class="md item-meta">Abrir a <i>projeção</i> deste push (ver o escritório como ele estava ' +
              'neste dia) ainda não existe — <code>/api/qg</code> só projeta o push corrente. Está declarado ' +
              'como não medido na evidência da T6, nunca escondido atrás de um botão que não faz nada.</p>';
          },
      acoes: bloqueado ? [] : [{ rot: 'Copiar o endereço', copiar: String(p.endereco || '') }]
    });
  }

  function regAchado(r, i, termo) {
    var ag = agenteDoCaminho(r.caminho);
    var tp = tipoDoCaminho(r.caminho);
    return registra('achado', i, {
      rotuloTipoTexto: 'Resultado da busca · ' + String(r.caminho || ''),
      titulo: '<code>' + esc(r.caminho || '') + '</code>',
      sub: '<span class="item-meta">' + esc(quandoLongo(r.geradoEm)) + ' · ' +
        esc(ag || 'escritório') + ' · ' + esc(tp) + '</span>',
      props: [
        { rot: 'Caminho de origem', val: '<code>' + esc(r.caminho || '') + '</code>' },
        { rot: 'Agente', val: ag ? esc(ag) : '<span class="item-meta">nenhum — é arquivo do escritório</span>' },
        { rot: 'Tipo', val: '<span class="pil p-parado">' + esc(tp) + '</span>' },
        { rot: 'Data do push', val: esc(quandoLongo(r.geradoEm)) },
        { rot: 'Push de origem', val: '<code>' + esc(r.endereco || '') + '</code>' }
      ],
      corpo: function () {
        return '<p class="item-meta" style="margin:0 0 var(--esp-2)">O trecho como o servidor o recortou ' +
          '(janela de 240 caracteres em volta da ocorrência):</p>' +
          '<pre class="trecho">' + destaca(r.trecho, termo) + '</pre>';
      },
      acoes: [
        { rot: 'Copiar o caminho', copiar: String(r.caminho || '') },
        { rot: 'Copiar o trecho', copiar: String(r.trecho || '') }
      ]
    });
  }

  // ---- os tres vazios, cada um com a frase que so ele pode dizer -----------

  function vazioNaoExisteAqui(oQue, rota) {
    // `texto` e `titulo` de `vazio()` sao ESCAPADOS; so `caminho` e HTML. Por
    // isso o <code> da rota vive no caminho, e nunca no texto (senao a tag sai
    // na tela como texto, que foi o defeito medido na 1a captura).
    // Review T6-B (R7): na nuvem este vazio aparece para a conta NOVA (404 de
    // `escritorio.ts` antes do 1o push) — e mandava "abra o QG por la" para
    // quem ja estava la, com `node hub/serve.js` no texto. Dois textos, um por lado.
    return soLocal(
      vazio('não existe aqui',
        'Este escritório não serve ' + oQue + '. Não é que esteja vazio: a fonte não existe deste lado — ' +
        'o QG aberto do disco lê arquivos e não guarda push nenhum.',
        'a rota <code>' + esc(rota) + '</code> só existe no Arvys na nuvem — abra o QG por lá.'),
      vazio('ainda não há push',
        'Este escritório ainda não recebeu nenhum push — ' + oQue + ' nasce no primeiro.',
        'empurre o escritório da sua máquina; depois disso esta seção passa a ler ' + esc(rota) + '.'));
  }

  function vazioSemHistorico(quantos) {
    return vazio('ainda não há histórico',
      quantos === 0
        ? 'Este escritório ainda não recebeu push nenhum — não há o que navegar, e isso é diferente de "não existe aqui".'
        : 'Este escritório recebeu 1 push só. Ele está listado abaixo, íntegro: histórico é o que existe entre dois, e o segundo ainda não chegou.',
      'rode <code>arvys push</code> de novo depois de trabalhar — cada push vira uma linha aqui.');
  }

  // ---- aba 1: os pushes ----------------------------------------------------

  function abaPushes() {
    if (!HIST) return '<div class="carregando"><span class="spin"></span><p>Lendo o histórico…</p></div>';
    if (HIST.estado === 'nao-existe') return vazioNaoExisteAqui('a lista de pushes', '/api/historico');
    if (HIST.estado === 'torto') return torto({ ok: false, erro: HIST.erro, arquivo: '/api/historico' }, 'o histórico');

    var pushes = HIST.pushes || [];
    pushes.forEach(function (p, i) { p.__chave = regPush(p, i); });
    // T4b: linha do tempo por padrao (critério 11) — preferência antiga
    // gravada ('tabela') continua valendo, `visaoDe` só cai no padrão novo
    // quando nunca houve escolha ou o valor gravado é inválido.
    var visao = visaoDe('historico-pushes', VIS_HIST, 'linha');
    var seletor = seletorVisao('historico-pushes', VIS_HIST, visao, '');

    // E9 · T5 — `p.bloqueado` é um badge A MAIS, nunca troca a lista: C1 diz
    // explicitamente que a LISTA continua mostrando todos os pushes, com os
    // mesmos campos — só o CONTEÚDO some quando o item é ABERTO (a gaveta,
    // ver `regPush`). Esconder arquivos/endereço aqui seria o front mentindo
    // sobre o que o servidor já decidiu mostrar.
    function badgeBloqueado(p) {
      return p.bloqueado === true ? ' <span class="pil p-parado">bloqueado</span>' : '';
    }

    if (pushes.length <= 1) {
      var soUm = pushes.length === 1
        ? cartao('<ul class="lista"><li><div class="item-cab">' +
            abridor(pushes[0].__chave, '<span class="t">' + esc(quandoLongo(pushes[0].geradoEm)) + '</span>') +
            '<span class="item-meta">' + esc(fmtN(pushes[0].arquivos)) + ' ' +
            plural(pushes[0].arquivos, 'arquivo', 'arquivos') + '</span>' + badgeBloqueado(pushes[0]) + '</div>' +
            '<p class="item-meta" style="margin:var(--esp-1) 0 0">origem: <code>' +
            esc(pushes[0].endereco) + '</code></p></li></ul>')
        : '';
      return faixaDaSecao(seletor) + vazioSemHistorico(pushes.length) + soUm;
    }

    var corpo;
    if (visao === 'tabela') {
      var linhas = pushes.map(function (p) {
        return {
          abre: p.__chave,
          busca: quandoLongo(p.geradoEm) + ' ' + p.endereco + ' ' + p.arquivos + (p.bloqueado === true ? ' bloqueado' : ''),
          ord: { quando: String(p.geradoEm || ''), arquivos: Number(p.arquivos) || 0, origem: String(p.endereco || '') },
          cel: {
            quando: esc(quandoLongo(p.geradoEm)),
            arquivos: esc(fmtN(p.arquivos)) + badgeBloqueado(p),
            idade: '<span class="item-meta">' + esc(idade(diasEntre(diaLocal(p.geradoEm)))) + '</span>',
            origem: '<code class="cod-curto">' + esc(String(p.endereco || '').slice(0, 12)) + '…</code>'
          }
        };
      });
      corpo = cartao(tabelaOrd('historico-pushes', [
        { c: 'quando', rot: 'Data e hora' },
        { c: 'arquivos', rot: 'Arquivos' },
        { c: 'idade', rot: 'Idade' },
        { c: 'origem', rot: 'Origem (endereço)' }
      ], linhas, 'Filtrar por data ou endereço…', {
        barraFora: true,
        ordemPadrao: { col: 'quando', dir: -1 }
      }));
    } else if (visao === 'cartoes') {
      corpo = grade(pushes.map(function (p) {
        return mini(p.__chave, esc(quandoLongo(p.geradoEm)),
          '<span class="item-meta">' + esc(idade(diasEntre(diaLocal(p.geradoEm)))) + '</span>',
          '<span class="item-meta">' + esc(fmtN(p.arquivos)) + ' ' + plural(p.arquivos, 'arquivo', 'arquivos') + '</span>' + badgeBloqueado(p) +
          '<span class="mini-res"><code>' + esc(String(p.endereco || '').slice(0, 16)) + '…</code></span>');
      }));
    } else {
      var porDia = [], mapa = Object.create(null);
      pushes.forEach(function (p) {
        var dia = diaLocal(p.geradoEm) || 'sem-data';
        if (!mapa[dia]) { mapa[dia] = { dia: dia, itens: [] }; porDia.push(mapa[dia]); }
        mapa[dia].itens.push(p);
      });
      porDia.sort(function (a, b) { return String(b.dia).localeCompare(String(a.dia)); });
      corpo = linhaDoTempo(porDia.map(function (g) {
        return {
          rotulo: dataLonga(g.dia),
          sub: idade(diasEntre(g.dia)) + ' · ' + g.itens.length + ' ' + plural(g.itens.length, 'push', 'pushes'),
          itens: g.itens.map(function (p) {
            return mini(p.__chave, esc(horaLocal(p.geradoEm)),
              '<span class="item-meta">' + esc(fmtN(p.arquivos)) + ' ' + plural(p.arquivos, 'arquivo', 'arquivos') + '</span>' + badgeBloqueado(p),
              '<span class="mini-res"><code>' + esc(String(p.endereco || '').slice(0, 16)) + '…</code></span>');
          })
        };
      }));
    }
    return faixaDaSecao(seletor) + corpo;
  }

  // ---- aba 2: a busca ------------------------------------------------------

  /** Os chips de filtro: so aparecem os valores que EXISTEM no resultado. */
  function chipsFiltro(grupo, valores, atual, rotuloZero) {
    if (!valores.length) return '';
    return '<div class="chips-f"><span class="menu-rot">' + esc(rotuloZero) + '</span>' +
      valores.map(function (v) {
        var on = v.valor === atual;
        return '<button type="button" class="pil ' + (on ? 'p-brass' : 'p-parado') + ' pil-b' + (on ? ' ativo' : '') +
          '" aria-pressed="' + on + '" data-fh="' + esc(grupo + '|' + v.valor) + '">' +
          esc(v.valor) + ' <span class="item-meta">' + v.n + '</span></button>';
      }).join('') +
      (atual ? ' <button type="button" class="pil pil-b limpar" data-fh="' + esc(grupo) + '|">todos</button>' : '') +
      '</div>';
  }

  /**
   * A MESMA decisão de `chipsFiltro`, para uma faceta de CARDINALIDADE ALTA
   * (dezenas de valores — o Épico do Quadro de tarefas, hoje 33). Chips
   * soltos escalam bem até uma dúzia; acima disso viram uma parede de
   * botões antes mesmo da tabela aparecer — achado do dono ao abrir a tela
   * pela primeira vez com dado real (2026-09-11).
   *
   * Reaproveita o `menu()` já usado por "Ver como"/"Agrupar por"/"Colunas":
   * a lista entra RECOLHIDA, no mesmo padrão "uma linha de menus" que o
   * dono pediu em 2026-09-06. Lista rolável com teto de altura (a CSS
   * `.menu-g-lista`) em vez de crescer sem fim — a barra de controles nunca
   * empurra o conteúdo pra baixo, mesmo com 100+ valores.
   */
  function menuFacetaGrande(grupo, id, rotulo, valores, atual) {
    if (!valores.length) return '';
    var resumo = atual ? (atual.length > 22 ? atual.slice(0, 20) + '…' : atual) : '';
    // Acima de 8 valores, rolar não é achar — ganha um campo de busca PRÓPRIO
    // (mesmo mecanismo `data-filtro` genérico, com id só deste menu: digitar
    // aqui nunca mexe na busca principal da seção). Estilo Linear: o seletor
    // de projeto/label filtra por texto assim que a lista cresce.
    var idBusca = id + '-busca';
    var termoBusca = valores.length > 8 ? String(FILTRO[idBusca] || '') : '';
    var visiveis = termoBusca ? valores.filter(function (v) { return casaBusca(termoBusca, v.valor); }) : valores;
    var buscaHtml = valores.length > 8
      ? '<input class="campo menu-g-busca" type="search" data-filtro="' + esc(idBusca) + '"' +
        ' value="' + esc(termoBusca) + '" placeholder="Filtrar ' + esc(rotulo.toLowerCase()) + '…"' +
        ' aria-label="Filtrar ' + esc(rotulo.toLowerCase()) + '">'
      : '';
    var corpo = buscaHtml + '<div class="menu-g menu-g-lista">' +
      (visiveis.length ? visiveis.map(function (v) {
        var on = v.valor === atual;
        return '<button type="button" class="disp-b' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
          ' data-fh="' + esc(grupo + '|' + v.valor) + '">' + esc(v.valor) +
          ' <span class="item-meta">' + v.n + '</span></button>';
      }).join('') : '<p class="item-meta" style="margin:var(--esp-1) 0">nada casa com “' + esc(termoBusca) + '”.</p>') +
      (atual ? '<button type="button" class="disp-b" data-fh="' + esc(grupo) + '|">todos</button>' : '') +
      '</div>';
    return menu(id, rotulo, resumo, corpo);
  }

  function contaPor(lista, fn) {
    var mapa = Object.create(null), fora = [];
    lista.forEach(function (it) {
      var k = fn(it);
      if (!k) return;
      if (!mapa[k]) { mapa[k] = { valor: k, n: 0 }; fora.push(mapa[k]); }
      mapa[k].n++;
    });
    fora.sort(function (a, b) { return b.n - a.n || a.valor.localeCompare(b.valor, 'pt-BR'); });
    return fora;
  }

  /** minúsculas, sem acento — a mesma normalização da busca de histórico. */
  function normBusca(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Busca inteligente client-side: cada PALAVRA do termo precisa casar em
   * `alvo` — por substring direto, OU por subsequência (as letras aparecem
   * na ordem, não necessariamente juntas — "qdr epc" acha "Quadro épico").
   * Várias palavras é E, não OU: "epico leitura" só acha o que tem as duas.
   * Sem rede, sem biblioteca — o mesmo espírito do parser de markdown
   * próprio deste arquivo (o que não é medido não entra na régua do E6/E7).
   */
  function casaBusca(termo, alvo) {
    var palavras = normBusca(termo).split(/\s+/).filter(Boolean);
    if (!palavras.length) return true;
    var a = normBusca(alvo);
    return palavras.every(function (p) {
      if (a.indexOf(p) >= 0) return true;
      var i = 0;
      for (var j = 0; j < a.length && i < p.length; j++) { if (a[j] === p[i]) i++; }
      return i === p.length;
    });
  }

  function abaBusca() {
    var campo = '<div class="barra-um">' +
      '<input class="campo" id="busca-hist" type="search" value="' + esc(buscaTermo) + '"' +
      ' placeholder="Buscar no conteúdo dos seus pushes — Enter para buscar…"' +
      ' aria-label="Buscar no conteúdo dos pushes deste escritório">' +
      '<button type="button" class="btn" id="busca-hist-ir">Buscar</button>' +
      (BUSCA && BUSCA.estado === 'ok'
        ? '<span class="barra-conta item-meta">' + BUSCA.resultados.length + ' ' +
          plural(BUSCA.resultados.length, 'resultado', 'resultados') +
          (BUSCA.truncado ? ' · teto de ' + esc(BUSCA.teto) + ' atingido' : '') + '</span>'
        : '') +
      '</div>';

    if (!BUSCA) {
      return faixaDaSecao('', campo) + vazio('Nada buscado ainda',
        'A busca varre o conteúdo dos arquivos que ESTE escritório empurrou — nunca o de outro dono. ' +
        'O resultado traz o trecho e o caminho de origem de cada achado.',
        'escreva um termo acima e tecle Enter.');
    }
    if (BUSCA.estado === 'buscando') {
      return faixaDaSecao('', campo) + '<div class="carregando"><span class="spin"></span><p>Buscando “' + esc(BUSCA.termo) + '”…</p></div>';
    }
    if (BUSCA.estado === 'nao-existe') {
      return faixaDaSecao('', campo) + vazioNaoExisteAqui('a busca', '/api/busca');
    }
    if (BUSCA.estado === 'recusa') {
      return faixaDaSecao('', campo) + vazio('O termo foi recusado — e não é o mesmo que “não achei”',
        'O servidor recusou o termo com o motivo: ' + BUSCA.erro +
        (BUSCA.teto ? ' (teto de ' + BUSCA.teto + ' caracteres)' : '') + '. Nada foi buscado.',
        'encurte ou corrija o termo e tente de novo.');
    }
    if (BUSCA.estado === 'torto') {
      return faixaDaSecao('', campo) + torto({ ok: false, erro: BUSCA.erro, arquivo: '/api/busca' }, 'a busca');
    }

    var todos = BUSCA.resultados || [];
    if (!todos.length) {
      return faixaDaSecao('', campo) + vazio('sua busca não achou nada',
        'Nenhum arquivo dos seus pushes contém “' + BUSCA.termo + '”. O histórico continua inteiro — ' +
        'o que faltou foi casar este termo.',
        'tente um pedaço menor da palavra, ou confira a lista de pushes na aba ao lado.') +
        avisoDoLimiteDeAcento(BUSCA.termo);
    }

    // filtros por agente e por tipo — sobre o que VOLTOU, nunca uma 2a consulta
    var agentes = contaPor(todos, function (r) { return agenteDoCaminho(r.caminho); });
    var tipos = contaPor(todos, function (r) { return tipoDoCaminho(r.caminho); });
    var lista = todos.filter(function (r) {
      if (FILTRO_H.agente && agenteDoCaminho(r.caminho) !== FILTRO_H.agente) return false;
      if (FILTRO_H.tipo && tipoDoCaminho(r.caminho) !== FILTRO_H.tipo) return false;
      return true;
    });
    lista.forEach(function (r, i) { r.__chave = regAchado(r, i, BUSCA.termo); });

    var filtros = chipsFiltro('agente', agentes, FILTRO_H.agente, 'Agente') +
      chipsFiltro('tipo', tipos, FILTRO_H.tipo, 'Tipo');

    // T4b: mesma regra de 'historico-pushes' — linha do tempo é o padrão novo.
    var visao = visaoDe('historico-busca', VIS_HIST, 'linha');
    var seletor = seletorVisao('historico-busca', VIS_HIST, visao, '');
    var aviso = BUSCA.truncado
      ? '<p class="aviso-limite">O servidor parou em ' + esc(BUSCA.teto) + ' resultados (o teto da D-E6-2). ' +
        'Pode haver mais — estreite o termo.</p>'
      : '';

    if (!lista.length) {
      return faixaDaSecao(seletor, campo) + filtros +
        vazio('O filtro escondeu tudo — a busca achou',
          'A busca por “' + BUSCA.termo + '” trouxe ' + todos.length + ' ' +
          plural(todos.length, 'resultado', 'resultados') + ', e nenhum casa com o filtro escolhido.',
          'clique em <b>todos</b> nos chips acima para ver os ' + todos.length + '.');
    }

    var corpo;
    if (visao === 'tabela') {
      var linhas = lista.map(function (r) {
        var ag = agenteDoCaminho(r.caminho);
        var tp = tipoDoCaminho(r.caminho);
        return {
          abre: r.__chave,
          busca: (r.caminho || '') + ' ' + (r.trecho || '') + ' ' + ag + ' ' + tp,
          ord: {
            caminho: String(r.caminho || '').toLowerCase(), agente: ag.toLowerCase(),
            tipo: tp, quando: String(r.geradoEm || ''), trecho: String(r.trecho || '').toLowerCase()
          },
          cel: {
            caminho: '<code>' + esc(r.caminho || '') + '</code>',
            agente: ag ? esc(ag) : '<span class="item-meta">escritório</span>',
            tipo: '<span class="pil p-parado">' + esc(tp) + '</span>',
            quando: esc(quandoLongo(r.geradoEm)),
            trecho: '<span class="cel-trecho">' + destaca(String(r.trecho || '').replace(/\s+/g, ' ').slice(0, 160), BUSCA.termo) + '</span>'
          }
        };
      });
      corpo = cartao(tabelaOrd('historico-busca', [
        { c: 'caminho', rot: 'Caminho de origem' },
        { c: 'agente', rot: 'Agente' },
        { c: 'tipo', rot: 'Tipo' },
        { c: 'quando', rot: 'Data do push' },
        { c: 'trecho', rot: 'Trecho' }
      ], linhas, 'Filtrar os resultados…', { barraFora: false, ordemPadrao: { col: 'quando', dir: -1 } }));
    } else if (visao === 'cartoes') {
      corpo = grade(lista.map(function (r) {
        return mini(r.__chave, '<code>' + esc(r.caminho || '') + '</code>',
          '<span class="item-meta">' + esc(quandoLongo(r.geradoEm)) + ' · ' +
          esc(agenteDoCaminho(r.caminho) || 'escritório') + ' · ' + esc(tipoDoCaminho(r.caminho)) + '</span>',
          '<span class="mini-res">' + destaca(String(r.trecho || '').replace(/\s+/g, ' ').slice(0, 180), BUSCA.termo) + '</span>');
      }));
    } else {
      var porDia = [], mapa = Object.create(null);
      lista.forEach(function (r) {
        var dia = diaLocal(r.geradoEm) || 'sem-data';
        if (!mapa[dia]) { mapa[dia] = { dia: dia, itens: [] }; porDia.push(mapa[dia]); }
        mapa[dia].itens.push(r);
      });
      porDia.sort(function (a, b) { return String(b.dia).localeCompare(String(a.dia)); });
      corpo = linhaDoTempo(porDia.map(function (g) {
        return {
          rotulo: dataLonga(g.dia),
          sub: idade(diasEntre(g.dia)) + ' · ' + g.itens.length + ' ' + plural(g.itens.length, 'achado', 'achados'),
          itens: g.itens.map(function (r) {
            return mini(r.__chave, '<code>' + esc(r.caminho || '') + '</code>',
              '<span class="item-meta">' + esc(agenteDoCaminho(r.caminho) || 'escritório') + ' · ' +
              esc(tipoDoCaminho(r.caminho)) + '</span>',
              '<span class="mini-res">' + destaca(String(r.trecho || '').replace(/\s+/g, ' ').slice(0, 180), BUSCA.termo) + '</span>');
          })
        };
      }));
    }
    return faixaDaSecao(seletor, campo) + filtros + aviso + corpo;
  }

  function secaoHistorico() {
    var abas = [
      { id: 'pushes', nome: 'Pushes' },
      { id: 'busca', nome: 'Busca' }
    ];
    CONTROLES_ABA = '';
    var corpo = abaHistorico === 'busca' ? abaBusca() : abaPushes();
    return '<div class="linha-aba">' +
      '<div class="abas" role="tablist">' + abas.map(function (a) {
        return '<button type="button" class="btn' + (abaHistorico === a.id ? ' ativo' : '') +
          '" role="tab" aria-selected="' + (abaHistorico === a.id) + '" data-abah="' + a.id + '">' +
          esc(a.nome) + '</button>';
      }).join('') + '</div></div>' + corpo;
  }

  // =========================================================================
  // 11c. SECAO — Quadro de tarefas (spec 2026-09-saas-e7-quadro, T6)
  //
  //  UMA ROTA DA NUVEM, AUSENTE NO SHELL LOCAL:
  //    GET /api/qg/quadro (T5) -> { epicos: [{slug, title, stories:
  //      [{id, title, status, owner, rev, editavel, motivoNaoEditavel,
  //        tasks:[{text, mark}]}]}] }
  //  `hub/serve.js` local responde 404 nesta rota — MESMA distinção de
  //  `historico`: "não existe aqui" nunca é "está vazio".
  //
  //  A UNIDADE DA LISTA É A STORY, NÃO O ÉPICO. Um épico sozinho na tabela
  //  esconderia o texto buscável (título de cada story, texto de cada task)
  //  atrás de uma linha só — e a busca desta seção existe para achar UMA
  //  tarefa específica, não para navegar pasta por pasta. O épico vira
  //  COLUNA/FILTRO (como "agente"/"tipo" em Histórico & busca), nunca
  //  desaparece: cada linha mostra de qual épico ela é.
  //
  //  C5 (spec do E7) — STORY SEM BLOCO `<!--arvys-->` É SOMENTE LEITURA, E O
  //  MOTIVO VEM ESCRITO NA TELA: a API já manda `editavel`/`motivoNaoEditavel`
  //  prontos (T5); esta seção só precisa RENDERIZAR os dois, nunca inventar
  //  um terceiro texto por cima.
  // =========================================================================

  var VIS_QUADRO = ['tabela', 'cartoes', 'quadro'];

  /** {estado:'ok'|'nao-existe'|'torto', epicos, erro} — null enquanto nao pedi. */
  var QUADRO = null;
  var QUADRO_PEDIDO = false;
  var FILTRO_Q = { epico: '', status: '' };

  var STATUS_ROTULO = {
    TODO: 'A fazer', DOING: 'Em andamento', REVIEW: 'Em revisão', BLOCKED: 'Bloqueada', DONE: 'Feita'
  };
  var STATUS_PIL = {
    TODO: 'p-parado', DOING: 'p-brass', REVIEW: 'p-atencao', BLOCKED: 'p-ruim', DONE: 'p-ok'
  };
  // rótulo -> classe de cor (o inverso de STATUS_PIL) — usado pelo FILTRO de
  // status, que até aqui reaproveitava `chipsFiltro` genérico (tudo cinza,
  // só o clicado virava âmbar). Achado do dono: "essa linha de status não
  // tem cor" — porque o componente genérico nunca soube a cor SEMÂNTICA de
  // cada status. Aqui cada chip usa a MESMA cor da coluna Status da tabela.
  var STATUS_PIL_POR_ROTULO = {};
  Object.keys(STATUS_ROTULO).forEach(function (cod) { STATUS_PIL_POR_ROTULO[STATUS_ROTULO[cod]] = STATUS_PIL[cod]; });
  function statusRotulo(s) { return STATUS_ROTULO[s] || String(s || '—'); }
  function statusPil(s) {
    return '<span class="pil ' + (STATUS_PIL[s] || 'p-parado') + '">' + esc(statusRotulo(s)) + '</span>';
  }

  // FILA 79 · C4 — fallback: o JSON antigo não trazia `statusValidos`. Fonte
  // de verdade é o servidor (`STATUS_QUADRO` em `status-quadro.ts`, exposto
  // em `/api/qg/quadro`); esta lista só cobre a rota velha.
  var STATUS_QUADRO_FALLBACK = ['DOING', 'REVIEW', 'BLOCKED', 'TODO', 'DONE'];
  function statusQuadro() {
    return (QUADRO && Array.isArray(QUADRO.statusValidos) && QUADRO.statusValidos.length)
      ? QUADRO.statusValidos
      : STATUS_QUADRO_FALLBACK;
  }

  // FILA 79 · T3(b) — op "ativa" bloqueia o menu de mover (C1, C5): pendente
  // (em voo/aguardando a máquina) ou conflito (precisa resolver na mão antes
  // de pedir outra mudança).
  function syncOpAtivo(s) {
    return !!(s && s.syncOp && (s.syncOp.estado === 'pendente' || s.syncOp.estado === 'conflito'));
  }
  var OPS_EM_VOO = {};  // storyId -> opId, enquanto o PATCH está em voo (C5)
  var ERRO_MOVER = {};  // storyId -> {s, erro, detalhe} do último moverStatus recusado

  // E8 · T8 — o badge de sincronização. `s.syncOp` vem de `/api/qg/quadro`
  // (T6): `null` quando não há op ativa para a story (nunca arrastada pela
  // tela, ou a última já confirmou `APPLIED`). Clicar no badge não faz nada
  // à parte — o CARD inteiro já abre a gaveta (`mini()`), e é lá que o
  // detalhe mora.
  var SYNC_ROTULO = { pendente: 'aguardando sua máquina', conflito: 'conflito', expirado: 'expirado' };
  var SYNC_PIL = { pendente: 'p-brass', conflito: 'p-ruim', expirado: 'p-parado' };
  function syncBadge(syncOp) {
    if (!syncOp) return '';
    var rot = SYNC_ROTULO[syncOp.estado] || syncOp.estado;
    return ' <span class="pil ' + (SYNC_PIL[syncOp.estado] || 'p-parado') + '">' + esc(rot) + '</span>';
  }

  /** Chips de STATUS, com a cor semântica de cada valor (nunca cinza
   *  genérico) — a mesma cor que a coluna Status da tabela usa. */
  function chipsStatus(valores, atual) {
    if (!valores.length) return '';
    return '<div class="chips-f"><span class="menu-rot">Status</span>' +
      valores.map(function (v) {
        var on = v.valor === atual;
        var tom = STATUS_PIL_POR_ROTULO[v.valor] || 'p-parado';
        return '<button type="button" class="pil ' + tom + ' pil-b' + (on ? ' ativo' : '') +
          '" aria-pressed="' + on + '" data-fh="' + esc('qstatus|' + v.valor) + '">' +
          esc(v.valor) + ' <span class="item-meta">' + v.n + '</span></button>';
      }).join('') +
      (atual ? ' <button type="button" class="pil pil-b limpar" data-fh="qstatus|">todos</button>' : '') +
      '</div>';
  }

  /** "2026-09-saas-e7-quadro" -> "E7" · specs fora da numeração do SaaS
   *  (as do QG: qg-recado, qg-sala…) não têm este padrão — devolve null, e
   *  quem chama mostra só o nome, sem badge de código inventado. */
  function codigoEpico(slug) {
    var m = String(slug || '').match(/saas-e(\d+)-/i);
    return m ? 'E' + m[1] : null;
  }

  /**
   * Separa o "T7 · Pré-review e fecho — PRONTA 2026-09-11: <parágrafo de
   * evidência>" em três pedaços: o código (`T7`), o rótulo curto (o que a
   * tabela/cartão mostram) e o detalhe (o parágrafo inteiro, que só a
   * gaveta mostra). Convenção observada em TODO `tasks.md` deste
   * escritório — a mesma que `RE_IDENTIFICADOR` do parser do servidor
   * reconhece (`parse-tasks.ts`), replicada aqui do lado do cliente porque
   * a API já devolve o título com o código embutido, nunca separado.
   * Título sem essa convenção (o caso "PRONTA"/"BLOQUEADA" em prosa do E1)
   * cai inteiro em `curto`, sem quebrar.
   */
  var RE_STORY_CODIGO = /^(T\d+[a-z]?(?:\.\d+)?|P\d+|Bloco\s+[A-Za-z0-9]+|Onda\s+[A-Za-z0-9]+)\s*(?:[·\-—:]\s*)?/i;
  function partesStory(tituloCru) {
    var limpo = textoCru(tituloCru || '');
    var m = limpo.match(RE_STORY_CODIGO);
    var codigo = m ? m[1] : '';
    var resto = m ? limpo.slice(m[0].length).trim() : limpo;
    var corte = resto.search(/\s—\s/);
    if (corte < 0) corte = resto.search(/:\s/);
    var curto = corte >= 0 ? resto.slice(0, corte).trim() : resto;
    var detalhe = corte >= 0 ? resto.slice(corte).replace(/^[\s—:]+/, '').trim() : '';
    return { codigo: codigo, curto: curto || '(sem título)', detalhe: detalhe };
  }

  /** O código (Épico ou Story) como o mesmo chip mono que a FILA usa para
   *  número/projeto — reaproveitado, não reinventado. */
  function chipCodigo(codigo, classe) {
    if (!codigo) return '';
    return '<span class="chip-proj' + (classe ? ' ' + classe : '') + '">' + esc(codigo) + '</span> ';
  }

  /**
   * Normaliza o payload NA ENTRADA, uma vez — nunca a cada uso.
   *
   * ACHADO do review adversarial da T7: `editavel` era lido por truthiness
   * em SETE lugares diferentes (tabela, cartões, kanban, gaveta, props…), e
   * em JS a string `"false"` é VERDADEIRA. Um dia em que a API mandasse
   * `"false"` em vez de `false`, a tela diria "editável: sim" para uma story
   * somente-leitura — em sete lugares, todos errados do mesmo jeito. Corrigir
   * os sete pontos de uso seria deixar a armadilha armada para o oitavo;
   * normalizar na porta de entrada fecha a classe inteira.
   */
  function normalizaQuadro(epicos) {
    (epicos || []).forEach(function (e) {
      (e && Array.isArray(e.stories) ? e.stories : []).forEach(function (s) {
        s.editavel = !!s.editavel;
      });
    });
    return epicos;
  }

  function pegaQuadro() {
    if (QUADRO_PEDIDO) return Promise.resolve(QUADRO);
    QUADRO_PEDIDO = true;
    registraChamada('/api/qg/quadro');
    return fetch('/api/qg/quadro', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        // 404 = "não existe aqui" — o shell local não serve esta rota (só a
        // nuvem tem projeção de epic/story/task). Mesma regra de `historico`.
        if (r.status === 404) { QUADRO = { estado: 'nao-existe' }; return QUADRO; }
        if (!r.ok) { QUADRO = { estado: 'torto', erro: 'HTTP ' + r.status + ' em /api/qg/quadro' }; return QUADRO; }
        return corpoJson(r).then(function (j) {
          if (!j || !Array.isArray(j.epicos)) {
            QUADRO = { estado: 'torto', erro: 'a resposta de /api/qg/quadro não trouxe a lista "epicos"' };
          } else {
            QUADRO = {
              estado: 'ok',
              epicos: normalizaQuadro(j.epicos),
              // FILA 79 · C4 — o enum de status mora no servidor (uma fonte só,
              // `status-quadro.ts`); `statusQuadro()` cai no fallback se o JSON
              // não trouxe (versão antiga da rota).
              statusValidos: Array.isArray(j.statusValidos) ? j.statusValidos : null
            };
            // FILA 79 · o erro de um `moverStatus` anterior só faz sentido até
            // o quadro voltar a ser lido de verdade — próximo pegaQuadro
            // bem-sucedido apaga o aviso da gaveta (mandato T3d).
            ERRO_MOVER = {};
          }
          return QUADRO;
        });
      })
      .catch(function (e) {
        QUADRO = { estado: 'torto', erro: String((e && e.message) || e) };
        return QUADRO;
      });
  }

  // ---- registro da gaveta ---------------------------------------------------

  function regStory(epicoSlug, epicoTitulo, s, i) {
    var qtdFeitas = (s.tasks || []).filter(function (t) { return t.mark === 'DONE'; }).length;
    var totalTasks = (s.tasks || []).length;
    var epCodigo = codigoEpico(epicoSlug);
    var st = partesStory(s.title);
    // A GAVETA é onde o parágrafo de evidência inteiro mora — pedido do
    // dono: tabela/cartões ficam limpos (código + rótulo curto), o texto
    // grande (o que a story provou, quando, com que sensor) só aparece
    // aqui, e agora RENDERIZADO como markdown de verdade (antes saía cru
    // em toda parte, inclusive aqui — achado do dono no menu de Épico).
    return registra('story', epicoSlug + ':' + (s.id || i), {
      rotuloTipoTexto: 'Story · ' + (epCodigo ? epCodigo + ' · ' : '') + esc(textoCru(epicoTitulo)),
      titulo: chipCodigo(st.codigo) + esc(st.curto),
      sub: statusPil(s.status) + syncBadge(s.syncOp) + ' <span class="item-meta">' + esc(textoCru(epicoTitulo)) +
        (totalTasks ? ' · ' + qtdFeitas + '/' + totalTasks + ' tasks' : '') + '</span>' +
        (s.editavel ? '' : ' <span class="pil p-parado">somente leitura</span>'),
      props: [
        { rot: 'Épico', val: chipCodigo(epCodigo) + esc(textoCru(epicoTitulo)) },
        { rot: 'Status', val: statusPil(s.status) },
        { rot: 'Dono', val: s.owner ? esc(s.owner) : '<span class="item-meta">não declarado</span>' },
        { rot: 'Revisão do bloco', val: s.editavel ? esc(String(s.rev)) : '<span class="item-meta">—</span>' },
        {
          rot: 'Editável pela tela',
          val: s.editavel
            ? '<span class="pil p-ok">sim</span>'
            : '<span class="pil p-parado">não</span>'
        }
      ].concat(s.syncOp ? [{ rot: 'Sincronização', val: syncBadge(s.syncOp) }] : []),
      corpo: function () {
        var especificacao = st.detalhe
          ? '<div class="md" style="margin:0 0 var(--esp-3)">' + md(st.detalhe) + '</div>'
          : '';
        var aviso = s.editavel ? '' :
          '<p class="item-meta" style="margin:0 0 var(--esp-2)"><b>Por que não dá para editar por aqui:</b> ' +
          esc(s.motivoNaoEditavel || 'esta story não tem bloco de metadados no tasks.md.') +
          ' Para resolver: adicione o bloco <code>&lt;!--arvys--&gt;</code> logo abaixo do título desta ' +
          'story no <code>tasks.md</code> do épico, com um <code>id:</code> — o próximo push já projeta ' +
          'com o bloco reconhecido.</p>';
        // E8 · T8 — o aviso de sincronização. "Duas versões lado a lado" só
        // existe no DISCO DO DONO (`company/SYNC-CONFLITOS.md`, T5) — a tela
        // roda na nuvem e não tem acesso a esse arquivo local, então o aviso
        // aqui aponta para onde as duas versões de verdade estão, em vez de
        // fingir mostrá-las por aqui.
        var avisoSync = '';
        if (s.syncOp && s.syncOp.estado === 'conflito') {
          avisoSync = '<p class="item-meta" style="margin:0 0 var(--esp-2)"><b>Conflito:</b> esta story mudou ' +
            'na sua máquina depois que a mudança foi pedida pela tela — nada foi sobrescrito. Abra ' +
            '<code>company/SYNC-CONFLITOS.md</code> no seu repo para ver as duas versões lado a lado, resolva ' +
            'na mão, e rode <code>arvys sync</code> de novo.</p>';
        } else if (s.syncOp && s.syncOp.estado === 'pendente') {
          avisoSync = '<p class="item-meta" style="margin:0 0 var(--esp-2)"><b>Aguardando sua máquina:</b> ' +
            'esta mudança foi pedida pela tela e ainda não foi aplicada no <code>tasks.md</code> — rode ' +
            '<code>arvys sync</code> na sua máquina para aplicar.</p>';
        } else if (s.syncOp && s.syncOp.estado === 'expirado') {
          avisoSync = '<p class="item-meta" style="margin:0 0 var(--esp-2)"><b>Expirado:</b> esta mudança ' +
            'ficou pendente por mais de 14 dias sem sincronizar e foi descartada — arraste o card de novo ' +
            'se ainda for válida.</p>';
        }
        var tasks = (s.tasks || []).length
          ? '<ul class="lista">' + (s.tasks || []).map(function (t) {
              var marca = t.mark === 'DONE' ? '☑' : (t.mark === 'DOING' ? '◐' : '☐');
              return '<li>' + marca + ' ' + esc(textoCru(t.text)) + '</li>';
            }).join('') + '</ul>'
          : '<p class="item-meta">esta story não tem nenhuma task listada.</p>';
        // FILA 79 · T3(d) — texto DO SERVIDOR (nunca inventado, família R8 do
        // E5): 401 ganha um empurrão a mais ("entre de novo"); 429 já vem com
        // "sincronize sua máquina" pronto no `erro`. Some no próximo
        // `pegaQuadro` bem-sucedido (limpo em `ERRO_MOVER = {}` lá).
        var avisoErroMover = '';
        var erroMover = ERRO_MOVER[s.id];
        if (erroMover) {
          avisoErroMover = '<p class="item-meta" style="margin:0 0 var(--esp-2)"><b>Não consegui mover:</b> ' +
            esc(erroMover.erro) + (erroMover.detalhe ? ' — ' + esc(String(erroMover.detalhe)) : '') +
            (erroMover.s === 401 ? ' Entre de novo.' : '') + '</p>';
        }
        return especificacao + aviso + avisoSync + avisoErroMover + tasks;
      },
      // FILA 79 · T3(b) — "Mover para → <coluna>" só quando a tela pode
      // realmente pedir a mudança: nuvem, story com bloco, sem op ativa
      // (pendente/conflito). Card sem bloco já mostra `motivoNaoEditavel`
      // acima; card com op ativa já mostra o badge de sincronização em
      // `props` — nenhum dos dois ganha ação de mover.
      acoes: [{ rot: 'Copiar o título', copiar: textoCru(s.title || '') }].concat(
        (!LOCAL && s.editavel && !!s.blockSha256 && !syncOpAtivo(s))
          ? statusQuadro().filter(function (st) { return st !== s.status; }).map(function (st) {
              return {
                rot: 'Mover para → ' + statusRotulo(st),
                mover: { storyId: s.id, de: s.status, para: st, baseHash: s.blockSha256 }
              };
            })
          : []
      )
    });
  }

  /**
   * FILA 79 · T3(d) — "Mover para →" na gaveta: mesma forma de
   * `espEnviaRecado` (fetch JSON, `{s, j}`, otimista + `pinta()`), inversa
   * das outras escritas do QG por ser a única que só existe na NUVEM. C5: um
   * `opId` em voo por story basta para travar o 2º clique — `OPS_EM_VOO`
   * segura isso mesmo que a gaveta seja fechada e reaberta no meio.
   */
  function moverStatus(m, botao) {
    if (OPS_EM_VOO[m.storyId]) return; // C5 — já tem op em voo para esta story
    var opId = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    OPS_EM_VOO[m.storyId] = opId;

    var storyRef = null;
    ((QUADRO && QUADRO.epicos) || []).forEach(function (e) {
      (e.stories || []).forEach(function (s) { if (s.id === m.storyId) storyRef = s; });
    });
    var syncOpAntes = storyRef ? storyRef.syncOp : undefined;

    // OTIMISTA: o card já mostra "aguardando sua máquina" antes da resposta.
    if (storyRef) storyRef.syncOp = { estado: 'pendente', opId: opId, otimista: true };
    pinta();
    if (gavetaChave) abreGaveta(gavetaChave, gavetaOrigem);

    fetch('/api/work/story', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyId: m.storyId, campo: 'status', de: m.de, para: m.para, baseHash: m.baseHash, opId: opId })
    }).then(function (r) { return corpoJson(r).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        delete OPS_EM_VOO[m.storyId];
        if (o.s === 200) {
          delete ERRO_MOVER[m.storyId];
          // gotcha 59 — a flag do PEDIDO, nunca `!QUADRO` (ver comentário do
          // roteador em `pinta()`): força o próximo `pegaQuadro()` a ir à
          // rede de novo, para o badge vir do servidor (C6).
          QUADRO_PEDIDO = false;
          // Review R2(d) da FILA 79: se o refetch pós-sucesso falhar (rede,
          // 500), `pegaQuadro` troca QUADRO por {estado:'torto'} e a seção
          // inteira viraria "Não consegui ler o quadro" — todos os cards
          // sumindo com a mudança JÁ gravada no servidor. Preserva o último
          // quadro bom (com o otimista) e diz o que falhou na gaveta.
          var quadroBom = QUADRO;
          pegaQuadro().then(function (q) {
            if (q && q.estado !== 'ok' && quadroBom && quadroBom.estado === 'ok') {
              QUADRO = quadroBom;
              ERRO_MOVER[m.storyId] = { s: 0, erro: 'a mudança foi gravada no servidor, mas não consegui reler o quadro', detalhe: q.erro || q.estado };
            }
            pintaSeAinda('quadro')();
          });
          return;
        }
        // desfaz o otimista: o servidor recusou (409 sem bloco/CAS, 429 teto,
        // 401 sessão, 400 status fora do enum) — a tela nunca inventa texto.
        if (storyRef) storyRef.syncOp = syncOpAntes;
        ERRO_MOVER[m.storyId] = {
          s: o.s,
          erro: (o.j && (o.j.erro || o.j.motivo)) || ('HTTP ' + o.s),
          detalhe: o.j && o.j.detalhe
        };
        pinta();
        if (gavetaChave) abreGaveta(gavetaChave, gavetaOrigem);
      })
      .catch(function (e) {
        delete OPS_EM_VOO[m.storyId];
        if (storyRef) storyRef.syncOp = syncOpAntes;
        ERRO_MOVER[m.storyId] = { s: 0, erro: String((e && e.message) || e) };
        pinta();
        if (gavetaChave) abreGaveta(gavetaChave, gavetaOrigem);
      });
  }

  // ---- os tres vazios, cada um com a frase que so ele pode dizer -----------

  function vazioSemEpicos() {
    return vazio('ainda não há épicos aqui',
      'Este escritório ainda não recebeu um push com specs — o quadro é montado a partir dos ' +
      '`tasks.md` de cada épico, e nenhum chegou ainda.',
      'rode <code>arvys push</code> depois de trabalhar numa spec — o próximo push já projeta o quadro.');
  }

  function vazioFiltroQuadro(total, comBusca) {
    return vazio('o filtro escondeu tudo — o quadro tem stories',
      'Este escritório tem ' + total + ' ' + plural(total, 'story', 'stories') +
      ', e nenhuma casa com ' + (comBusca ? 'a busca ou o filtro escolhidos' : 'o filtro escolhido') + '.',
      (comBusca ? 'apague o texto da busca ou ' : '') +
      'clique em <b>todos</b> nos chips/menu acima para ver todas as ' + total + '.');
  }

  // ---- a secao ---------------------------------------------------------------

  function secaoQuadro() {
    if (!QUADRO) return '<div class="carregando"><span class="spin"></span><p>Lendo o quadro…</p></div>';
    if (QUADRO.estado === 'nao-existe') return vazioNaoExisteAqui('o quadro de tarefas', '/api/qg/quadro');
    if (QUADRO.estado === 'torto') return torto({ ok: false, erro: QUADRO.erro, arquivo: '/api/qg/quadro' }, 'o quadro');

    var epicos = QUADRO.epicos || [];
    if (!epicos.length) return vazioSemEpicos();

    // achata epico -> stories numa lista so, cada linha carregando de qual
    // epico ela veio (a unidade da lista e a STORY, nao o epico — ver o
    // comentario do modulo). `__busca` e o texto combinado (titulo + epico +
    // status + dono + texto de cada task) que alimenta a busca inteligente.
    var todas = [];
    epicos.forEach(function (e) {
      (e.stories || []).forEach(function (s, i) {
        var feitas = (s.tasks || []).filter(function (t) { return t.mark === 'DONE'; }).length;
        todas.push({
          epicoSlug: e.slug, epicoTitulo: e.title, s: s, i: i,
          tasksFeitas: feitas, tasksTotal: (s.tasks || []).length,
          __busca: [codigoEpico(e.slug) || '', textoCru(s.title), textoCru(e.title), statusRotulo(s.status), s.owner || '',
            (s.tasks || []).map(function (t) { return textoCru(t.text); }).join(' ')].join(' ')
        });
      });
    });
    if (!todas.length) return vazioSemEpicos();

    todas.forEach(function (x) { x.__chave = regStory(x.epicoSlug, x.epicoTitulo, x.s, x.i); });

    // filtros por epico e por status — sobre o que VOLTOU, nunca uma 2a consulta
    var epicosDisp = contaPor(todas, function (x) { return x.epicoTitulo; });
    var statusDisp = contaPor(todas, function (x) { return statusRotulo(x.s.status); });
    var comChip = todas.filter(function (x) {
      if (FILTRO_Q.epico && x.epicoTitulo !== FILTRO_Q.epico) return false;
      if (FILTRO_Q.status && statusRotulo(x.s.status) !== FILTRO_Q.status) return false;
      return true;
    });

    // Busca inteligente — UM campo, visível nas 3 visões (antes só existia
    // dentro da Tabela): épico, story, dono e texto de task, tudo numa
    // pesquisa só, tolerante a ordem/letra fora do lugar. Pedido do dono
    // depois de ver a tela real: "veja como o Linear organiza essa parte"
    // (2026-09-11). Reaproveita o MESMO mecanismo `data-filtro` genérico —
    // digitar já repinta com debounce e devolve o foco sozinho.
    var termoBusca = String(FILTRO['quadro-stories'] || '');
    var lista = termoBusca ? comChip.filter(function (x) { return casaBusca(termoBusca, x.__busca); }) : comChip;

    // Épico entra RECOLHIDO, no menu — 33 valores em chips soltos era a
    // "bagunça" que o dono apontou ao abrir a tela pela primeira vez com
    // dado real (2026-09-11). Status continua em chips: 3-5 valores é
    // exatamente a cardinalidade que chips servem bem.
    var filtroEpico = menuFacetaGrande('qepico', 'quadro-epico', 'Épico', epicosDisp, FILTRO_Q.epico);
    var filtros = chipsStatus(statusDisp, FILTRO_Q.status);

    // "Agrupar por" — a árvore épico → story que o dono pediu na mesma
    // conversa do menu de Épico: a Tabela e os Cartões passam a mostrar um
    // cabeçalho recolhível por épico (ou por status), com progresso de
    // tasks — o MESMO agrupamento "estilo Linear" que a FILA já usa (T3,
    // `tabelaOrd` `opc.grupo`), não uma tela nova do zero. O Quadro (kanban)
    // continua fixo por status: é a razão dele existir, ao lado das outras.
    var agr = agrupamentoDe('quadro-stories', ['epico', 'status', 'nenhum'], 'epico');
    var ROT_AGR_Q = { epico: 'Épico', status: 'Status', nenhum: 'nada' };
    var menuAgrupa = menu('quadro-agrupa', 'Agrupar por', ROT_AGR_Q[agr],
      barraDisplay('quadro-stories', [
        { c: 'epico', rot: 'Épico' }, { c: 'status', rot: 'Status' }, { c: 'nenhum', rot: 'Nada' }
      ], agr, []));

    var campoBusca = '<div class="barra-um">' +
      '<input class="campo" type="search" data-filtro="quadro-stories" value="' + esc(termoBusca) + '"' +
      ' placeholder="Buscar épico, story, dono ou texto da task…" aria-label="Buscar no quadro de tarefas">' +
      '<span class="barra-conta item-meta">' + lista.length + ' de ' + todas.length + '</span></div>';

    var visao = visaoDe('quadro-stories', VIS_QUADRO, 'tabela');
    var seletor = seletorVisao('quadro-stories', VIS_QUADRO, visao, '') + filtroEpico + menuAgrupa;

    if (!lista.length) {
      return faixaDaSecao(seletor, campoBusca) + filtros + vazioFiltroQuadro(todas.length, !!termoBusca);
    }

    // ordem dos grupos: a ordem do PUSH (E1..E11), nunca alfabética (mesmo
    // motivo do T6.7 na FILA) — e o tom do épico conta se ele já fechou.
    var ordemEpicos = epicos.map(function (e) { return e.title; });
    // FILA 79 · C4 — mesma fonte única do enum (statusQuadro()), nunca mais
    // hardcode local (R4 do plan.md: "o enum vira duas fontes").
    var ordemStatusRot = statusQuadro().map(statusRotulo);
    var tomStatusRot = {};
    statusQuadro().forEach(function (st) { tomStatusRot[statusRotulo(st)] = STATUS_PIL[st]; });
    var tomEpico = {};
    if (agr === 'epico') {
      var somaEpico = {};
      lista.forEach(function (x) {
        if (!somaEpico[x.epicoTitulo]) somaEpico[x.epicoTitulo] = { feitas: 0, total: 0 };
        somaEpico[x.epicoTitulo].feitas += x.tasksFeitas;
        somaEpico[x.epicoTitulo].total += x.tasksTotal;
      });
      Object.keys(somaEpico).forEach(function (k) {
        var p = somaEpico[k];
        tomEpico[k] = !p.total ? 'p-parado' : (p.feitas === p.total ? 'p-ok' : 'p-brass');
      });
    }
    function progressoLinhas(chaveIgnorada, rows) {
      var f = 0, t = 0;
      rows.forEach(function (l) { f += l.tasksFeitas || 0; t += l.tasksTotal || 0; });
      return t ? ' <span class="g-cab-progresso">' + f + '/' + t + ' tasks</span>' : '';
    }

    var corpo;
    if (visao === 'tabela') {
      var linhas = lista.map(function (x) {
        var s = x.s;
        var epCodigo = codigoEpico(x.epicoSlug);
        var st = partesStory(s.title);
        return {
          abre: x.__chave,
          tasksFeitas: x.tasksFeitas, tasksTotal: x.tasksTotal,
          grupoEpico: x.epicoTitulo, grupoStatus: statusRotulo(s.status),
          ord: {
            epico: x.epicoTitulo.toLowerCase(), titulo: st.curto.toLowerCase(),
            status: statusRotulo(s.status), tasks: x.tasksTotal
          },
          cel: {
            // T4b (critério 12): agrupado por épico, o cabeçalho do grupo já
            // diz o épico — repetir na coluna de cada linha era a mesmice
            // que a spec aponta. Mesma decisão que a visão Cartões já toma
            // (`metaEpico` logo abaixo, agr === 'epico' ? '' : …).
            epico: agr === 'epico' ? '' : chipCodigo(epCodigo) + esc(textoCru(x.epicoTitulo)),
            titulo: chipCodigo(st.codigo) + esc(st.curto) + (s.editavel ? '' : ' <span class="pil p-parado">leitura</span>'),
            status: statusPil(s.status) + syncBadge(s.syncOp),
            tasks: x.tasksTotal ? (x.tasksFeitas + '/' + x.tasksTotal) : '<span class="item-meta">0</span>'
          }
        };
      });
      var opcTab = { buscaExterna: true };
      if (agr === 'epico') {
        opcTab.grupo = function (l) { return l.grupoEpico; };
        opcTab.ordem = ordemEpicos; opcTab.tom = tomEpico; opcTab.grupoSub = progressoLinhas;
      } else if (agr === 'status') {
        opcTab.grupo = function (l) { return l.grupoStatus; };
        opcTab.ordem = ordemStatusRot; opcTab.tom = tomStatusRot; opcTab.grupoSub = progressoLinhas;
      }
      corpo = cartao(tabelaOrd('quadro-stories', [
        { c: 'epico', rot: 'Épico' },
        { c: 'titulo', rot: 'Story' },
        { c: 'status', rot: 'Status' },
        { c: 'tasks', rot: 'Tasks' }
      ], linhas, null, opcTab));
    } else if (visao === 'cartoes') {
      function cartaoStory(x) {
        var s = x.s;
        var epCodigo = codigoEpico(x.epicoSlug);
        var st = partesStory(s.title);
        var metaEpico = agr === 'epico' ? '' :
          '<span class="item-meta">' + chipCodigo(epCodigo) + esc(textoCru(x.epicoTitulo)) + '</span>';
        return mini(x.__chave, chipCodigo(st.codigo) + esc(st.curto),
          statusPil(s.status) + syncBadge(s.syncOp) + metaEpico,
          '<span class="item-meta">' + (x.tasksTotal ? x.tasksFeitas + '/' + x.tasksTotal + ' tasks' : 'sem tasks') +
          (s.editavel ? '' : ' · somente leitura') + '</span>');
      }
      if (agr === 'nenhum') {
        corpo = grade(lista.map(cartaoStory));
      } else {
        var chaveDe = agr === 'epico' ? function (x) { return x.epicoTitulo; } : function (x) { return statusRotulo(x.s.status); };
        var ordemG = (agr === 'epico' ? ordemEpicos : ordemStatusRot).slice();
        var mapaG = Object.create(null);
        ordemG.forEach(function (k) { mapaG[k] = []; });
        lista.forEach(function (x) {
          var k = chaveDe(x) || '—';
          if (!mapaG[k]) { mapaG[k] = []; ordemG.push(k); }
          mapaG[k].push(x);
        });
        corpo = linhaDoTempo(ordemG.filter(function (k) { return mapaG[k] && mapaG[k].length; }).map(function (k) {
          var rows = mapaG[k];
          var feitas = 0, total = 0;
          rows.forEach(function (x) { feitas += x.tasksFeitas; total += x.tasksTotal; });
          return {
            rotulo: k,
            sub: rows.length + ' ' + plural(rows.length, 'story', 'stories') + (total ? ' · ' + feitas + '/' + total + ' tasks' : ''),
            itens: rows.map(cartaoStory)
          };
        }));
      }
    } else {
      // "quadro" — agrupado por STATUS (kanban simples), reaproveitando o
      // mesmo bloco de agrupamento visual que a linha do tempo usa, só que
      // a chave de grupo é o status em vez do dia — status é o único campo
      // que NUNCA é nulo (ao contrário de `touchedAt`, que só existe quando
      // a story tem bloco, e hoje nenhuma tem — T1 do E7 mediu zero blocos
      // no corpus real, então agrupar por dia deixaria tudo num "sem data" só).
      // FIXO por status, não segue "Agrupar por": é a razão deste botão
      // existir ao lado de Tabela/Cartões, não mais um lugar de escolher eixo.
      var porStatus = [], mapa = Object.create(null);
      // FILA 79 · C4 — enum de uma fonte só: `statusQuadro()` (servidor,
      // fallback só se o JSON não trouxe), nunca mais hardcode local.
      statusQuadro().forEach(function (st) {
        mapa[st] = { dia: statusRotulo(st), itens: [] };
        porStatus.push(mapa[st]);
      });
      lista.forEach(function (x) {
        var st = mapa[x.s.status] ? x.s.status : 'TODO';
        mapa[st].itens.push(x);
      });
      porStatus = porStatus.filter(function (g) { return g.itens.length; });
      corpo = linhaDoTempo(porStatus.map(function (g) {
        return {
          rotulo: g.dia,
          sub: g.itens.length + ' ' + plural(g.itens.length, 'story', 'stories'),
          itens: g.itens.map(function (x) {
            var s = x.s;
            var epCodigo = codigoEpico(x.epicoSlug);
            var st = partesStory(s.title);
            return mini(x.__chave, chipCodigo(st.codigo) + esc(st.curto),
              syncBadge(s.syncOp) + '<span class="item-meta">' + chipCodigo(epCodigo) + esc(textoCru(x.epicoTitulo)) + '</span>',
              s.editavel ? '' : '<span class="item-meta">somente leitura</span>');
          })
        };
      }));
    }
    return faixaDaSecao(seletor, campoBusca) + filtros + corpo;
  }

  // =========================================================================
  // 12. SECAO — Cota & custo
  // =========================================================================

  /** semana atual × maior das últimas semanas. NAO ha teto de cota no TOKENS.json
   *  (ver evidence/t5.md, "pedido ao T3"): a régua honesta é a maior semana medida. */
  function reguaDaCota(d) {
    var t = d.cota && d.cota.tokens && d.cota.tokens.ok ? d.cota.tokens.data : null;
    if (!t || !t.weeks || !t.weeks.length) return null;
    var semanas = t.weeks.slice().sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); });
    var atual = semanas[0], anterior = semanas[1] || null;
    var teto = 0;
    semanas.forEach(function (w) { if (w.totalTokens > teto) teto = w.totalTokens; });
    var pct = teto ? Math.round((atual.totalTokens / teto) * 100) : 0;
    var delta = anterior && anterior.totalTokens
      ? Math.round(((atual.totalTokens - anterior.totalTokens) / anterior.totalTokens) * 100) : null;
    return { atual: atual, anterior: anterior, teto: teto, pct: pct, delta: delta, semanas: semanas, t: t };
  }

  // -------------------------------------------------------------------------
  // T11 (EMENDA 1 · E2) — o que o escritório ao vivo gera vira leitura.
  //
  // Fonte única: `hub/live/events.jsonl`, lido por `readEsforco` e servido em
  // `/api/qg` → `cota.esforco`. A seção Cota mostra o escritório inteiro
  // (esforço ao lado de custo); a ficha do agente recorta o dia DELE.
  //
  // TERMÔMETRO, NUNCA PLACAR (Goodhart, FILA 21): daqui não sai nota, não sai
  // ranking, não sai "o mais produtivo". Sai minuto cru por estado, com o
  // período medido escrito ao lado — para comparar um agente com ele mesmo.
  // -------------------------------------------------------------------------
  var ESTADOS_ESFORCO = [
    { chave: 'trabalhandoMs', rotulo: 'Trabalhando', classe: 'e-trab', explica: 'intervalos que começam numa ferramenta que rodou' },
    { chave: 'bloqueadoMs', rotulo: 'Bloqueado', classe: 'e-bloq', explica: 'intervalos que começam numa ferramenta que falhou ou foi negada' },
    { chave: 'esperandoDonoMs', rotulo: 'Esperando você', classe: 'e-dono', explica: 'intervalos que começam num Stop, num fim de sessão ou numa pergunta ao dono' },
    { chave: 'ociosoMs', rotulo: 'Ocioso', classe: 'e-ocio', explica: 'mais de 3 minutos sem tocar em ferramenta nenhuma, sem estar bloqueado nem esperando' }
  ];

  /** ms → "1 h 31 min" · "8 min" · "40 s". Número nunca sai sem unidade. */
  function dur(ms) {
    var s = Math.round((ms || 0) / 1000);
    if (s < 90) return s + ' s';
    var min = Math.round(s / 60);
    if (min < 90) return min + ' min';
    return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  function horaCurta(iso) {
    if (!iso) return '—';
    var dt = new Date(iso);
    if (isNaN(dt)) return '—';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(dt.getHours()) + ':' + p(dt.getMinutes());
  }
  /** Dia LOCAL de um instante ISO. Fatiar os 10 primeiros caracteres daria o dia
   *  em UTC e brigaria com a hora local ao lado (evento das 22:24 de ontem
   *  aparecia como "hoje, 22:24"). O leitor agrupa por dia local — igual aqui. */
  function diaLocalDe(iso) {
    var dt = new Date(iso);
    if (isNaN(dt)) return null;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }
  function nomeDoAgente(d, dir) {
    var achado = dir;
    (d.agentes || []).forEach(function (a) { if (a.dir === dir && a.meta && a.meta.callsign) achado = a.meta.callsign; });
    return achado;
  }

  /** Barra proporcional dos 4 estados de um dia. Sem nota, sem soma mágica. */
  function barraEsforco(b) {
    var total = ESTADOS_ESFORCO.reduce(function (n, e) { return n + (b[e.chave] || 0); }, 0);
    if (!total) return '<span class="item-meta">sem intervalo medido</span>';
    return '<div class="esf-barra" role="img" aria-label="' +
      esc(ESTADOS_ESFORCO.map(function (e) { return e.rotulo.toLowerCase() + ' ' + dur(b[e.chave]); }).join(', ')) + '">' +
      ESTADOS_ESFORCO.map(function (e) {
        var p = (b[e.chave] || 0) / total * 100;
        return p <= 0 ? '' : '<i class="' + e.classe + '" style="--fr:' + (p / 100) + '"></i>';
      }).join('') + '</div>';
  }

  function legendaEsforco() {
    return '<p class="esf-legenda">' + ESTADOS_ESFORCO.map(function (e) {
      return '<span><i class="' + e.classe + '"></i>' + esc(e.rotulo) +
        ' <span class="item-meta">(' + esc(e.explica) + ')</span></span>';
    }).join('') + '</p>';
  }

  function linhaEsforco(d, b, comAgente) {
    var ferr = (b.ferramentas || []).slice(0, 4);
    return '<tr>' +
      (comAgente ? '<td><b style="color:var(--tinta)">' + esc(b.agente.charAt(0) === '(' ? b.agente : nomeDoAgente(d, b.agente)) + '</b>' +
        '<div class="item-meta">' + b.eventos + ' ' + plural(b.eventos, 'evento', 'eventos') + ' · ' +
        horaCurta(b.primeiro) + '–' + horaCurta(b.ultimo) + '</div></td>' : '') +
      ESTADOS_ESFORCO.map(function (e) { return '<td>' + esc(dur(b[e.chave])) + '</td>'; }).join('') +
      '<td>' + barraEsforco(b) + '</td>' +
      '<td class="item-meta">' + (ferr.length
        ? ferr.map(function (f) {
          return esc(f.nome) + ' <b style="color:var(--tinta)">' + f.usos + '×</b>' +
            (f.falhas ? ' <span class="pil p-ruim sem-ponto">' + f.falhas + ' ' + plural(f.falhas, 'falha', 'falhas') + '</span>' : '');
        }).join('<br>')
        : 'nenhuma ferramenta registrada') + '</td>' +
      '<td class="item-meta">' + (b.silencios && b.silencios.length
        ? b.silencios.map(function (s) { return esc(horaCurta(s.de) + '–' + horaCurta(s.ate) + ' (' + dur(s.ms) + ')'); }).join('<br>')
        : 'nenhuma janela de silêncio') + '</td>' +
      '</tr>';
  }

  function cabecalhoEsforco(comAgente) {
    return '<thead><tr>' + (comAgente ? '<th>Agente</th>' : '') +
      ESTADOS_ESFORCO.map(function (e) { return '<th>' + esc(e.rotulo) + '</th>'; }).join('') +
      '<th>Proporção do dia</th><th>Ferramentas mais usadas</th><th>Silêncio (acima de 15 min)</th></tr></thead>';
  }

  /** O aviso de cobertura. Esta trilha NUNCA cobre o dia inteiro — e diz isso. */
  function coberturaEsforco(e) {
    var c = e.cobertura || {};
    return '<div class="aviso-parcial"><b>Dado parcial, e declarado.</b> ' +
      (c.de
        ? 'A trilha fala desde <b>' + esc(dataLonga(diaLocalDe(c.de))) + ', ' + esc(horaCurta(c.de)) + '</b> ' +
          'até <b>' + esc(dataLonga(diaLocalDe(c.ate))) + ', ' + esc(horaCurta(c.ate)) + '</b> — ' +
          e.linhas + ' ' + plural(e.linhas, 'linha', 'linhas') + ' em <code>hub/live/events.jsonl</code>.'
        : 'O arquivo <code>hub/live/events.jsonl</code> existe mas está sem nenhum evento legível.') +
      '<ul>' + (e.motivos || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' +
      '<p class="item-meta">Como o tempo é classificado: ' + esc(e.regra ? e.regra.texto : '') + '</p>' +
      '</div>';
  }

  var VAZIO_ESFORCO = {
    titulo: 'O escritório ao vivo ainda não gravou nada',
    texto: 'O esforço é medido pela trilha que o hook passivo escreve a cada ação do Claude Code. Não existe hub/live/events.jsonl neste escritório.',
    caminho: 'abra <a href="#/escritorio">o escritório ao vivo</a> com uma sessão do Claude Code rodando neste repositório — o hook passa a gravar sozinho.'
  };

  /**
   * O bloco de esforço. `filtro` = nome de pasta do agente (ficha) ou null
   * (Cota & custo, o escritório inteiro).
   */
  function blocoEsforco(d, filtro) {
    return leitura(d.cota && d.cota.esforco, 'a trilha do escritório ao vivo', function (e) {
      var dias = (e.dias || []).map(function (dia) {
        var agentes = filtro ? dia.agentes.filter(function (a) { return a.agente === filtro; }) : dia.agentes;
        return { dia: dia.dia, agentes: agentes };
      }).filter(function (dia) { return dia.agentes.length; });

      if (!dias.length) {
        return coberturaEsforco(e) + vazio(
          filtro ? 'Nenhum evento deste agente na janela medida' : 'Nenhum evento na janela medida',
          filtro
            ? 'A trilha existe, mas nenhum evento dela caiu numa sessão aberta com este agente. O hook só etiqueta o agente quando /arvys:open marcou a sessão.'
            : 'A trilha existe, mas nenhum evento sobreviveu ao truncamento do boot.',
          'abra uma sessão com <code>/arvys:open</code> e o hook passa a etiquetar os eventos.');
      }

      return coberturaEsforco(e) + legendaEsforco() + dias.map(function (dia) {
        return '<h4 class="esf-dia">' + esc(dataLonga(dia.dia)) + '</h4>' +
          '<div class="tab-rolo"><table class="tab esf-tab">' + cabecalhoEsforco(!filtro) + '<tbody>' +
          dia.agentes.map(function (b) { return linhaEsforco(d, b, !filtro); }).join('') +
          '</tbody></table></div>';
      }).join('') +
        '<p class="item-meta" style="margin-top:var(--esp-3)">Estes números são <b>termômetro, não placar</b>: não há nota, não há ' +
        'ranking e nenhum deles se soma num único índice. Servem para comparar um agente com ele mesmo em dias diferentes — ' +
        'e para ver onde o tempo do escritório está indo.</p>';
    }, VAZIO_ESFORCO);
  }

  function secaoCota(d) {
    var r = reguaDaCota(d);
    var out = [];
    if (!r) {
      out.push(leitura(d.cota && d.cota.tokens, 'a medição de tokens', function () {
        return vazio('Sem medição de tokens', 'O arquivo existe mas não trouxe nenhuma semana.',
          soLocal('rode <b>node hub/tokens.js</b> para regravar <code>company/TOKENS.json</code>.',
            'este escritório ainda não mediu tokens desta semana.'));
      }, {
        titulo: 'Nenhum token medido ainda',
        texto: 'O gasto é medido por um worker que lê o ccusage e grava company/TOKENS.json. Nada foi medido aqui.',
        caminho: soLocal('rode <b>node hub/tokens.js</b> — não precisa de conta em serviço nenhum.',
          'a medição nasce sozinha na sua máquina, sem conta em serviço nenhum.')
      }));
    } else {
      var tom = r.pct >= 90 ? 'ruim' : r.pct >= 75 ? 'atencao' : 'ok';
      out.push(cartao(
        '<div class="grade g3">' +
        num('Semana de ' + esc(r.atual.period), fmtTok(r.atual.totalTokens), 'tokens',
          r.pct + '% da maior semana já medida (' + fmtTok(r.teto) + ')', tom) +
        num('Contra a semana anterior', r.delta === null ? '—' : (r.delta > 0 ? '+' : '') + r.delta + '%', '',
          r.anterior ? 'a semana de ' + esc(r.anterior.period) + ' gastou ' + fmtTok(r.anterior.totalTokens) : 'não há semana anterior medida',
          r.delta !== null && r.delta > 25 ? 'atencao' : '') +
        num('Recarga de contexto', Math.round((r.atual.contextShare || 0) * 100) + '%', 'do gasto',
          fmtTok(r.atual.cacheReadTokens) + ' de ' + J('cache read') + ' — barato, mas é onde o volume mora') +
        '</div>' +
        '<div style="margin-top:var(--esp-4)">' + barra(r.pct, tom) +
        '<p class="item-meta" style="margin:var(--esp-2) 0 0">A régua é a <b>maior semana já medida</b>: o <code>TOKENS.json</code> não guarda teto de plano. ' +
        'Semana de segunda a domingo pelo <code>ccusage</code> ' + esc(r.t.ccusageVersion ? 'v' + r.t.ccusageVersion : '') +
        ' — captura pontual, não medição ao vivo.</p></div>'));

      var mods = (r.atual.modelBreakdowns || []).slice().sort(function (a, b) { return b.totalTokens - a.totalTokens; });
      if (mods.length) {
        out.push('<div class="bloco">' + tituloBloco('Por modelo', 'na semana de ' + esc(r.atual.period)) +
          cartao('<div class="tab-rolo"><table class="tab"><thead><tr><th>Modelo</th><th>Total</th><th>Fatia</th><th>Resposta gerada</th></tr></thead><tbody>' +
            mods.map(function (m) {
              var p = r.atual.totalTokens ? Math.round(m.totalTokens / r.atual.totalTokens * 100) : 0;
              return '<tr><td><b style="color:var(--tinta)">' + esc(m.modelName) + '</b></td>' +
                '<td>' + fmtTok(m.totalTokens) + ' tokens</td>' +
                '<td>' + p + '% da semana</td>' +
                '<td>' + fmtTok(m.outputTokens) + ' de saída</td></tr>';
            }).join('') + '</tbody></table></div>') + '</div>');
      }

      var sess = (r.t.sessions || []).slice().sort(function (a, b) { return b.totalTokens - a.totalTokens; }).slice(0, 8);
      if (sess.length) {
        var novelas = (r.t.novelas || []).length;
        out.push('<div class="bloco">' + tituloBloco('Sessões mais caras',
          novelas + ' ' + plural(novelas, 'sessão-novela', 'sessões-novela') + ' (releitura de contexto acima de ' + fmtTok(r.t.novelaThreshold || 5e7) + ')') +
          cartao('<div class="tab-rolo"><table class="tab"><thead><tr><th>Sessão</th><th>Total</th><th>Última atividade</th><th>Modelos</th></tr></thead><tbody>' +
            sess.map(function (s) {
              return '<tr><td><code>' + esc(String(s.id).slice(0, 8)) + '</code></td>' +
                '<td>' + fmtTok(s.totalTokens) + ' tokens</td>' +
                '<td>' + esc(dataLonga(String(s.lastActivity).slice(0, 10))) + '</td>' +
                '<td class="item-meta">' + esc((s.modelsUsed || []).join(', ')) + '</td></tr>';
            }).join('') + '</tbody></table></div>') + '</div>');
      }
    }

    // por agente — vem do boletim de cada um (mesma regra, um lugar só)
    var linhasAg = (d.agentes || []).map(function (a) {
      var l = a.boletim && a.boletim.linhas ? a.boletim.linhas.tokensPorEntrega : null;
      return { nome: (a.meta && a.meta.callsign) || a.dir, valor: l ? l.valor : null, motivo: l ? l.motivoNd : null };
    });
    if (linhasAg.length) {
      out.push('<div class="bloco">' + tituloBloco('Por agente', 'tokens por entrega fechada') +
        cartao('<div class="tab-rolo"><table class="tab"><thead><tr><th>Agente</th><th>Tokens por entrega</th></tr></thead><tbody>' +
          linhasAg.map(function (a) {
            return '<tr><td><b style="color:var(--tinta)">' + esc(a.nome) + '</b></td><td>' +
              (a.valor === null || a.valor === undefined
                ? '<span class="pil p-parado">n/d</span>' + (a.motivo ? '<div class="item-meta">' + esc(a.motivo) + '</div>' : '')
                : (typeof a.valor === 'object' ? linhasDeObjeto(a.valor).join(' · ') : esc(a.valor))) + '</td></tr>';
          }).join('') + '</tbody></table></div>') + '</div>');
    }

    // T11: esforço AO LADO do custo. O gasto acima diz quanto custou; isto diz
    // no que o tempo foi gasto — e as duas medições têm janelas diferentes,
    // por isso cada uma carrega o seu período escrito.
    out.push('<div class="bloco">' + tituloBloco('Esforço × custo',
      'de hub/live/events.jsonl — a trilha que o escritório ao vivo grava a cada ação real') +
      blocoEsforco(d, null) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('A régua COM × SEM o Arvys', 'de company/METRICS.md, uma linha por retrospectiva') +
      leitura(d.cota && d.cota.metricsMd, 'a série semanal', function (m) {
        var tab = m.tabela;
        return cartao((m.intro ? '<div class="md" style="margin-bottom:var(--esp-3)">' + md(m.intro) + '</div>' : '') +
          (tab && tab.linhas && tab.linhas.length
            ? '<div class="tab-rolo"><table class="tab"><thead><tr>' +
              (tab.colunas || []).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
              '</tr></thead><tbody>' + tab.linhas.map(function (l) {
                return '<tr>' + l.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
              }).join('') + '</tbody></table></div>'
            : '') +
          (m.notas ? '<div class="md" style="margin-top:var(--esp-4)">' + md(m.notas) + '</div>' : ''));
      }, {
        titulo: 'Sem série semanal ainda',
        texto: 'A régua compara o escritório com e sem o Arvys. Ela nasce na primeira retrospectiva.',
        caminho: 'rode o ritual <code>/arvys:retro</code> — ele escreve a primeira linha em <code>company/METRICS.md</code>.'
      }) + '</div>');

    return out.join('');
  }

  // =========================================================================
  // 13. SECAO — Radar
  // =========================================================================

  var ETIQUETAS = { 'ADOTAR': 'p-ok', 'REVISAR': 'p-atencao', 'IGNORAR': 'p-parado', 'PENDENTE': 'p-brass' };
  var ORDEM_ETIQ = ['PENDENTE', 'ADOTAR', 'REVISAR', 'IGNORAR'];
  var VIS_RADAR = ['quadro', 'tabela', 'cartoes'];

  /** Um item do radar, curado ou cru, no mesmo formato — a lista do dono é uma só. */
  function itensDoRadar(d) {
    var out = [];
    var cur = d.radar && d.radar.curado && d.radar.curado.ok ? d.radar.curado.data : null;
    var cru = d.radar && d.radar.cru && d.radar.cru.ok ? d.radar.cru.data : null;
    (cur && cur.itens ? cur.itens : []).forEach(function (i, n) {
      out.push({
        chaveId: 'c' + n, etiqueta: i.etiqueta, id: i.id,
        titulo: textoCru(i.motivo).slice(0, 110) || '(sem motivo escrito)',
        motivo: i.motivo || '', fonte: 'RADAR-CURADO.md', vistoEm: null, url: null, trecho: '',
        // T3/critério 8: origem HUMANA no card, nunca o nome do arquivo —
        // RADAR-CURADO.md não guarda data por item (ver hub/lib/readers.js),
        // por isso "data se houver" aqui não tem o que mostrar.
        origemHumana: 'curado pelo Scout'
      });
    });
    (cru && cru.pendentes ? cru.pendentes : []).forEach(function (p, n) {
      var visto = String(p.vistoEm || '').slice(0, 10) || null;
      out.push({
        chaveId: 'p' + n, etiqueta: 'PENDENTE', id: p.id || null,
        // T3/critério 8: título cru que chega como linha de lista/link
        // ("– - [Korean (166 pages)](url)") passa por textoCru() e vira só
        // o texto do link.
        titulo: textoCru(p.titulo || '') || '(sem título)', motivo: '', fonte: p.fonte || 'RADAR.json',
        vistoEm: visto, url: p.url || null, trecho: p.trecho || '',
        origemHumana: visto ? 'colhido em ' + dataLonga(visto) : 'colhido, sem data registrada'
      });
    });
    return out;
  }

  function regRadar(i) {
    return registra('radar', i.chaveId, {
      rotuloTipoTexto: i.etiqueta === 'PENDENTE' ? 'Radar cru · company/RADAR.json' : 'Radar curado · company/RADAR-CURADO.md',
      titulo: esc(i.titulo),
      sub: '<span class="pil ' + (ETIQUETAS[i.etiqueta] || '') + '">' + esc(i.etiqueta) + '</span> ' +
        '<span class="item-meta">' + esc(i.origemHumana) + '</span>',
      corpo: function () {
        return (i.motivo ? '<h4 style="margin:0 0 var(--esp-2)">Veredito do Scout</h4><div class="md">' + md(i.motivo) + '</div>' : '') +
          (i.trecho ? '<h4 style="margin:var(--esp-4) 0 var(--esp-2)">Trecho capturado</h4><p class="md">' + esc(i.trecho) + '</p>' : '') +
          '<dl class="def" style="margin-top:var(--esp-4)">' +
          '<dt>Etiqueta</dt><dd>' + esc(i.etiqueta) + '</dd>' +
          '<dt>Origem</dt><dd>' + esc(i.origemHumana) + ' · <code>' + esc(i.fonte) + '</code></dd>' +
          (i.id ? '<dt>Identificador</dt><dd><code>' + esc(i.id) + '</code></dd>' : '') +
          (i.vistoEm ? '<dt>Visto em</dt><dd>' + esc(dataLonga(i.vistoEm)) + '</dd>' : '') +
          (i.url ? '<dt>Endereço</dt><dd><code>' + esc(i.url) + '</code></dd>' : '') +
          '</dl>' +
          (i.etiqueta === 'PENDENTE'
            ? '<p class="item-meta" style="margin-top:var(--esp-4)">Ainda sem veredito. Rode o ritual ' +
              '<code>/arvys:radar</code>: o Scout propõe ADOTAR, REVISAR ou IGNORAR e você aprova um a um.</p>'
            : '');
      }
    });
  }

  function secaoRadar(d) {
    var itens = itensDoRadar(d);
    var cru = d.radar && d.radar.cru && d.radar.cru.ok ? d.radar.cru.data : null;
    var fontes = (cru && cru.fontes) || {};
    var chips = Object.keys(fontes).map(function (k) {
      var st = fontes[k] && fontes[k].status;
      return '<span class="pil ' + (st === 'ok' ? 'p-ok' : 'p-ruim') + '">' + esc(k) + ': ' + esc(st || '?') + '</span>';
    }).join(' ');

    var tortos = '';
    if (d.radar && d.radar.curado && d.radar.curado.ok === false) tortos += torto(d.radar.curado, 'o radar curado');
    if (d.radar && d.radar.cru && d.radar.cru.ok === false) tortos += torto(d.radar.cru, 'o radar cru');

    if (!itens.length) {
      return tortos + vazio('O radar está limpo',
        'O radar varre o changelog do Claude Code e a documentação; o Scout dá o veredito. Não há item cru nem curado aqui.',
        'o radar se enche sozinho na varredura da madrugada.' +
        soLocal(
          ' <span class="item-meta">Com terminal à mão: <code>node workers/radar.js</code>, depois <code>/arvys:radar</code>.</span>',
          ' O ritual <code>/arvys:radar</code> roda na sua máquina.'
        ));
    }
    itens.forEach(function (i) { i.__chave = regRadar(i); });

    var visao = visaoDe('radar', VIS_RADAR, 'quadro');
    var pend = itens.filter(function (i) { return i.etiqueta === 'PENDENTE'; }).length;
    // Os chips de saúde eram um <p> próprio ACIMA das visões — uma faixa só
    // para eles, com a linha das visões meio vazia ao lado. Agora entram NA
    // linha, como resumo à esquerda.
    var topo = '<span class="resumo-faixa">' + chips +
      (pend ? ' <span class="pil p-atencao">' + pend + ' ' + plural(pend, 'pendente', 'pendentes') + '</span>' : '') +
      (cru && cru.generatedAt ? ' <span class="item-meta">última varredura em ' +
        esc(dataLonga(String(cru.generatedAt).slice(0, 10))) + '</span>' : '') + '</span>';
    // A nota saiu: com os chips de saúde na mesma linha ela estourava a faixa
    // (1108px de conteúdo em 1016px) e empurrava os chips para uma 2ª linha —
    // trocar uma linha de tela por uma dica é mau negócio. "Veredito" já é o
    // nome da coluna na tabela e o título da raia no quadro.
    var seletor = seletorVisao('radar', VIS_RADAR, visao, '');

    var corpo;
    if (visao === 'tabela') {
      corpo = cartao(tabelaOrd('radar', [
        { c: 'titulo', rot: 'Novidade' }, { c: 'etiqueta', rot: 'Veredito' },
        { c: 'fonte', rot: 'Fonte' }, { c: 'visto', rot: 'Visto em' }
      ], itens.map(function (i) {
        return {
          abre: i.__chave,
          busca: i.titulo + ' ' + i.motivo + ' ' + i.fonte + ' ' + i.etiqueta + ' ' + (i.trecho || ''),
          ord: {
            titulo: i.titulo.toLowerCase(), etiqueta: ORDEM_ETIQ.indexOf(i.etiqueta),
            fonte: i.fonte.toLowerCase(), visto: i.vistoEm || ''
          },
          cel: {
            titulo: esc(i.titulo),
            etiqueta: '<span class="pil ' + (ETIQUETAS[i.etiqueta] || '') + '">' + esc(i.etiqueta) + '</span>',
            fonte: '<span class="item-meta">' + esc(i.fonte) + '</span>',
            visto: i.vistoEm ? esc(i.vistoEm) : '<span class="item-meta">—</span>'
          }
        };
      }), 'Filtrar o radar por texto, fonte ou veredito…', { barraFora: true }));
    } else if (visao === 'cartoes') {
      // T3/critério 8: era `i.fonte` (nome de arquivo, "RADAR-CURADO.md") na
      // cara do card — vira a origem humana; o arquivo mora na gaveta.
      corpo = grade(itens.map(function (i) {
        return mini(i.__chave, esc(i.titulo),
          '<span class="pil ' + (ETIQUETAS[i.etiqueta] || '') + '">' + esc(i.etiqueta) + '</span>',
          '<span class="item-meta">' + esc(i.origemHumana) + '</span>');
      }));
    } else {
      corpo = quadro(ORDEM_ETIQ.filter(function (e) { return itens.some(function (i) { return i.etiqueta === e; }); })
        .map(function (e) {
          return {
            titulo: e === 'PENDENTE' ? 'esperando veredito' : e.toLowerCase(), tom: ETIQUETAS[e],
            itens: itens.filter(function (i) { return i.etiqueta === e; }).map(function (i) {
              return mini(i.__chave, esc(i.titulo), '<span class="item-meta">' + esc(i.origemHumana) + '</span>', '');
            })
          };
        }));
    }
    return tortos + faixaDaSecao(seletor, topo) + corpo;
  }

  // =========================================================================
  // 14. SECAO — Leis & incidentes
  // =========================================================================

  function secaoLeis(d) {
    var out = [];
    var leis = d.leis || {};

    // ------- a LISTA da seção: leis (gotchas) + incidentes, nas 3 visões -------
    // A tela chama-se "Leis & incidentes" e abria com Rituais e Constituição:
    // a lista do título ficava a 1074px de rolagem, com os controles dela junto.
    // O assunto da tela vem primeiro; a referência desce (pedido do dono,
    // 2026-09-06 — limpeza de espaço e organização em todos os módulos).
    out.push('<div class="bloco" style="margin-top:0">' + tituloBloco('Leis e incidentes',
      'as regras aprendidas errando e os erros que as geraram, na mesma lista') +
      listaDeLeis(d) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Rituais', 'os comandos que abrem, fecham e organizam o escritório') +
      ((leis.rituais || []).length
        ? cartao('<div class="tab-rolo"><table class="tab"><tbody>' + leis.rituais.map(function (r) {
            return '<tr><td style="white-space:nowrap"><code>' + esc(r.comando) + '</code></td><td>' + esc(r.descricao) + '</td></tr>';
          }).join('') + '</tbody></table></div>')
        : vazio('Nenhum ritual', 'Os ' + J('ritual', 'rituais') + ' são os comandos /arvys:* do plugin.',
            'instale o plugin: <code>claude plugin install arvys@arvys</code>.')) + '</div>');

    out.push('<div class="bloco">' + tituloBloco('Constituição', 'company/PLAYBOOK.md — as regras que valem para todos') +
      leitura(leis.playbook, 'a constituição do escritório', function (p) {
        return cartao((p.secoes || []).map(function (s) {
          return '<details class="exp"><summary><span class="t">' + esc(s.titulo) + '</span></summary>' +
            '<div class="corpo md">' + md(s.corpo || '') + '</div></details>';
        }).join(''));
      }, {
        titulo: 'Sem constituição ainda',
        texto: 'O PLAYBOOK é onde moram as regras que valem para todos os agentes.',
        caminho: 'ele nasce com o ritual <code>/arvys:start</code> num projeto novo.'
      }) + '</div>');

    return out.join('');
  }

  var VIS_LEIS = ['tabela', 'cartoes', 'quadro'];

  // T4b (critério 13): mesma regra de `compararNumeroDeLei`/`ordenaLeis` de
  // `hub/lib/readers.js` (testada em check-pendencias.test.mjs) — este
  // arquivo é IIFE de navegador, não importa o leitor, então replica a
  // MESMA regra aqui: numérico crescente (1, 2, …, 10, 11); número torto
  // ("1a", "1.2", vazio) vai para o fim, visível, mantendo a ordem original
  // entre tortos (sort estável por índice).
  function compararNumeroDeLei(a, b) {
    var na = /^\d+$/.test(String(a).trim()) ? Number(a) : null;
    var nb = /^\d+$/.test(String(b).trim()) ? Number(b) : null;
    if (na === null && nb === null) return 0;
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb;
  }
  function ordenaLeis(lista, pegaNumero) {
    pegaNumero = pegaNumero || function (x) { return x; };
    return lista
      .map(function (item, i) { return { item: item, i: i }; })
      .sort(function (x, y) {
        var c = compararNumeroDeLei(pegaNumero(x.item), pegaNumero(y.item));
        return c !== 0 ? c : x.i - y.i;
      })
      .map(function (x) { return x.item; });
  }

  function regLei(g, i) {
    return registra('lei', i, {
      rotuloTipoTexto: 'Lei do ' + g.agenteNome + ' · agents/' + g.agente + '/GOTCHAS.md',
      titulo: esc(g.numero + '. ') + inline(textoCru(g.texto).slice(0, 120)),
      sub: '<span class="pil p-brass">lei em vigor</span> <span class="item-meta">' +
        (g.familia && g.familia !== '—' ? 'família: ' + esc(g.familia) : 'lista simples, sem famílias') + '</span>',
      corpo: function () {
        return (g.lei ? '<h4 style="margin:0 0 var(--esp-2)">A lei da família</h4><p class="md">' + inline(g.lei) + '</p>' : '') +
          '<h4 style="margin:' + (g.lei ? 'var(--esp-4)' : '0') + ' 0 var(--esp-2)">O precedente nº ' + esc(String(g.numero)) + '</h4>' +
          '<div class="md">' + md(g.texto) + '</div>' +
          '<dl class="def" style="margin-top:var(--esp-4)">' +
          '<dt>Agente</dt><dd>' + esc(g.agenteNome) + '</dd>' +
          '<dt>Família</dt><dd>' + (g.familia && g.familia !== '—' ? esc(g.familia)
            : 'este agente ainda não agrupou as leis em famílias') + '</dd>' +
          '<dt>Arquivo</dt><dd><code>agents/' + esc(g.agente) + '/GOTCHAS.md</code></dd></dl>' +
          '<p style="margin-top:var(--esp-4)"><a class="btn" href="#/agentes/' + encodeURIComponent(g.agente) +
          '">Ver a ficha do agente →</a></p>';
      }
    });
  }

  function regIncidente(i, n) {
    var campos = i.campos || {};
    return registra('incidente', n, {
      rotuloTipoTexto: 'Incidente · ' + (i.arquivo || 'incidents/'),
      titulo: esc(i.titulo || i.slug),
      sub: '<span class="pil ' + (i.fechado ? 'p-ok' : 'p-atencao') + '">' + (i.fechado ? 'fechado' : 'aberto') + '</span> ' +
        '<span class="item-meta">' + esc(i.data ? dataLonga(i.data) : 'sem data no nome do arquivo') +
        ' · ' + esc(idade(diasEntre(i.data))) + '</span>',
      corpo: function () {
        var ks = Object.keys(campos);
        return (ks.length
          ? '<dl class="def">' + ks.map(function (k) {
              return '<dt>' + esc(k.replace(/_/g, ' ')) + '</dt><dd>' + inline(campos[k]) + '</dd>';
            }).join('') + '</dl>'
          : '<p class="item-meta">O arquivo do incidente não trouxe nenhum campo no formato esperado.</p>') +
          ((i.faltam || []).length
            ? '<p class="item-meta" style="margin-top:var(--esp-3)">Campos que o molde pede e faltam: ' +
              esc(i.faltam.join(', ')) + '.</p>' : '') +
          '<p class="item-meta" style="margin-top:var(--esp-4)"><code>' + esc(i.arquivo || '') + '</code></p>';
      }
    });
  }

  function listaDeLeis(d) {
    var leis = d.leis || {};
    var registros = [];
    var tortos = '';

    (d.agentes || []).forEach(function (a) {
      var g = a.gotchas;
      if (g && g.ok === false) tortos += torto(g, 'as leis de ' + a.dir);
      if (!g || g.ok === false || !g.data) return;
      var nome = (a.meta && a.meta.callsign) || a.dir;
      (g.data.familias || []).forEach(function (f) {
        (f.itens || []).forEach(function (it) {
          registros.push({
            tipo: 'lei', agente: a.dir, agenteNome: nome, familia: f.titulo || '—', lei: f.lei || '',
            numero: it.numero, texto: it.texto || '', data: null, fechado: null
          });
        });
      });
    });

    if (leis.incidentes && leis.incidentes.ok === false) tortos += torto(leis.incidentes, 'os incidentes');
    var inc = leis.incidentes && leis.incidentes.ok ? leis.incidentes.data : null;
    (inc && inc.itens ? inc.itens : []).forEach(function (i) {
      registros.push({ tipo: 'incidente', inc: i });
    });

    if (!registros.length) {
      return tortos + vazio('Nenhuma lei e nenhum incidente',
        'As leis deste escritório nascem dos erros dele. Nada foi registrado ainda — o que é bom.',
        'quando algo der errado, o Arvys escreve em <code>incidents/</code> e a retrospectiva ' +
        '(<code>/arvys:retro</code>) transforma o incidente em lei do agente.');
    }

    // T4b (critério 13): leis em ordem NUMÉRICA (1, 2, …, 10, 11), não a
    // ordem de encontro nem a alfabética de string ("1", "10", "11", "2").
    // Número torto ("1a", "1.2", vazio) vai para o fim do bloco de leis,
    // visível, nunca some — mesma regra de `compararNumeroDeLei` acima
    // (espelhada de `hub/lib/readers.js`, testada em
    // `scripts/check-pendencias.test.mjs`). Incidentes seguem depois, na
    // ordem em que chegaram (não é alvo desta spec).
    var soLeis = registros.filter(function (r) { return r.tipo === 'lei'; });
    var soIncidentes = registros.filter(function (r) { return r.tipo !== 'lei'; });
    registros = ordenaLeis(soLeis, function (r) { return r.numero; }).concat(soIncidentes);

    var nL = 0, nI = 0;
    registros.forEach(function (r) {
      if (r.tipo === 'lei') r.__chave = regLei(r, nL++);
      else r.__chave = regIncidente(r.inc, nI++);
    });

    var visao = visaoDe('leis', VIS_LEIS, 'tabela');
    var qLeis = registros.filter(function (r) { return r.tipo === 'lei'; }).length;
    var abertos = registros.filter(function (r) { return r.tipo === 'incidente' && !r.inc.fechado; }).length;
    var topo = '<span class="resumo-faixa">' +
      '<span class="pil p-brass">' + qLeis + ' ' + plural(qLeis, 'lei em vigor', 'leis em vigor') + '</span> ' +
      '<span class="pil ' + (abertos ? 'p-atencao' : 'p-ok') + '">' + abertos + ' ' +
      plural(abertos, 'incidente aberto', 'incidentes abertos') + '</span> ' +
      // "5 fechados" e nao "5 incidentes fechados": o substantivo vem do chip
      // anterior, e os 3 chips + busca + visoes cabem em UMA linha (1308 -> 952).
      '<span class="pil p-parado">' + (registros.length - qLeis - abertos) + ' ' +
      plural(registros.length - qLeis - abertos, 'fechado', 'fechados') + '</span></span>';
    // O card de arquivo TORTO fica FORA da faixa — ele é um bloco de erro com
    // <pre> de até 220px, e dentro de um `display:flex; align-items:center`
    // vira item espremido ao lado da busca. Foi assim que entrou nesta rodada,
    // por vir concatenado no `seletor`; o Radar sempre o manteve fora.
    // (reviewer do risco N5, 2026-09-06)
    var seletor = seletorVisao('leis', VIS_LEIS, visao, '');

    function rotulo(r) {
      return r.tipo === 'lei' ? r.numero + '. ' + textoCru(r.texto).slice(0, 110)
        : (r.inc.titulo || r.inc.slug);
    }
    function origem(r) { return r.tipo === 'lei' ? r.agenteNome : 'incidents/'; }
    function situacao(r) {
      return r.tipo === 'lei' ? 'lei em vigor' : (r.inc.fechado ? 'incidente fechado' : 'incidente aberto');
    }
    function tomSit(r) {
      return r.tipo === 'lei' ? 'p-brass' : (r.inc.fechado ? 'p-ok' : 'p-atencao');
    }

    if (visao === 'tabela') {
      var corpoLeis = cartao(tabelaOrd('leis', [
        { c: 'titulo', rot: 'Registro' }, { c: 'tipo', rot: 'Situação' },
        { c: 'origem', rot: 'Origem' }, { c: 'familia', rot: 'Família / etapa' }, { c: 'data', rot: 'Data' }
      ], registros.map(function (r, i) {
        // T4b (item d, herdado da T3): `busca:` era `JSON.stringify(r.inc.campos)`
        // — dado cru (`{"Etapa":"…"}`) alimentando o texto de busca. O sensor
        // `check-dado-cru` já tolerava (campo de busca nunca vira HTML), mas o
        // critério 6 pede zero — troca por concatenação legível dos VALORES
        // dos campos (o mesmo texto que `regIncidente` já mostra na gaveta).
        var textoCampos = r.tipo === 'lei' ? '' : Object.keys(r.inc.campos || {}).map(function (k) {
          return String(r.inc.campos[k] || '');
        }).join(' ');
        return {
          abre: r.__chave,
          busca: rotulo(r) + ' ' + origem(r) + ' ' + situacao(r) + ' ' +
            (r.tipo === 'lei' ? r.familia + ' ' + r.texto : textoCampos),
          ord: {
            // T4b (critério 13): a ordem NUMÉRICA já foi decidida ao montar
            // `registros` (`ordenaLeis`, acima) — o índice `i` é o rank certo;
            // ordenar por string aqui de novo reintroduziria "1,10,11,2".
            titulo: i, tipo: situacao(r),
            origem: origem(r).toLowerCase(),
            familia: r.tipo === 'lei' ? r.familia.toLowerCase() : 'zzz',
            data: r.tipo === 'lei' ? '' : (r.inc.data || '')
          },
          cel: {
            titulo: esc(rotulo(r)),
            tipo: '<span class="pil ' + tomSit(r) + '">' + esc(situacao(r)) + '</span>',
            origem: esc(origem(r)),
            familia: r.tipo === 'lei' ? '<span class="item-meta">' + esc(r.familia) + '</span>'
              : '<span class="item-meta">' + esc((r.inc.campos && r.inc.campos.Etapa) || '—') + '</span>',
            data: r.tipo === 'lei' ? '<span class="item-meta">—</span>' : esc(r.inc.data || '—')
          }
        };
      }), 'Filtrar leis e incidentes por texto, agente ou família…', { barraFora: true }));
      return tortos + faixaDaSecao(seletor, topo) + corpoLeis;
    }

    function cartaoDe(r) {
      return mini(r.__chave, esc(rotulo(r)),
        '<span class="pil ' + tomSit(r) + '">' + esc(situacao(r)) + '</span>',
        '<span class="item-meta">' + esc(origem(r)) +
        (r.tipo === 'lei' ? ' · ' + esc(r.familia) : (r.inc.data ? ' · ' + esc(r.inc.data) : '')) + '</span>');
    }

    if (visao === 'cartoes') return tortos + faixaDaSecao(seletor, topo) + grade(registros.map(cartaoDe));

    return tortos + faixaDaSecao(seletor, topo) + quadro([
      { titulo: 'leis em vigor', tom: 'p-brass', itens: registros.filter(function (r) { return r.tipo === 'lei'; }).map(cartaoDe) },
      { titulo: 'incidentes abertos', tom: 'p-atencao', itens: registros.filter(function (r) { return r.tipo === 'incidente' && !r.inc.fechado; }).map(cartaoDe) },
      { titulo: 'incidentes fechados', tom: 'p-ok', itens: registros.filter(function (r) { return r.tipo === 'incidente' && r.inc.fechado; }).map(cartaoDe) }
    ]);
  }

  // =========================================================================
  // 15. SECAO — Biblioteca
  // =========================================================================

  // spec 2026-09-biblioteca (T4) — o manual do plugin, lido por
  // `readBiblioteca` (T2) e servido em `DADOS.biblioteca.manual` (T3).
  // Padrões do dono (OWNER.md): (1) capítulo clicável com hover/foco/cursor,
  // (2) gaveta sem sair da lista e sem perder o lugar (R7), (3) três visões
  // persistidas — lista · cenários ("estou em…") · tabela do glossário leigo.
  // Busca no cliente: título + corpo, apontando a seção onde bateu.

  // Cópia FIEL de `slugAncora` em hub/lib/readers.js (o front não importa
  // Node). O leitor gera `secoes[].ancora` com ela; o sumário e a busca daqui
  // geram a MESMA âncora a partir do mesmo título — mudou lá, muda aqui.
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

  /** Texto para comparação: minúsculas, sem acento (tamanho preservado para letras latinas). */
  function bibNorm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  var BIB_VIS = ['lista', 'cenarios', 'glossario'];
  var BIB_NOME_VIS = { lista: 'Lista', cenarios: 'Cenários', glossario: 'Glossário' };
  var BIB_ICO_VIS = { lista: ICO_VIS.linha, cenarios: ICO_VIS.cartoes, glossario: ICO_VIS.tabela };
  var BIB_CENARIOS = [
    { id: 'primeira-sessao', rotulo: 'na minha primeira sessão' },
    { id: 'produto-novo', rotulo: 'começando um produto novo' },
    { id: 'adotar-projeto', rotulo: 'adotando um projeto que já existe' },
    { id: 'fix', rotulo: 'precisando de um fix rápido' },
    { id: 'feature', rotulo: 'construindo uma feature' },
    { id: 'semana', rotulo: 'fechando a semana' }
  ];
  var BIB_PERFIL = { vibecoder: 'para quem não programa', dev: 'para dev', ambos: 'para todo mundo' };

  // A visão persiste em `arvys.biblioteca.vis` (spec, estado de partida (c)).
  function bibVisao() {
    var v = lembra('arvys.biblioteca.vis');
    return BIB_VIS.indexOf(v) >= 0 ? v : 'lista';
  }
  function guardaBibVisao(v) { if (BIB_VIS.indexOf(v) >= 0) guarda('arvys.biblioteca.vis', v); }

  function bibId(arquivo) { return String(arquivo || '').replace(/\.md$/i, ''); }
  function bibDois(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }
  function bibRotuloCen(id) {
    for (var i = 0; i < BIB_CENARIOS.length; i++) if (BIB_CENARIOS[i].id === id) return BIB_CENARIOS[i].rotulo;
    return id;
  }

  /**
   * Fatia o corpo nas MESMAS seções que o leitor viu (`parseSecoes`: só
   * `##`/`###`, fora de cerca de código). Cada fatia leva a âncora feita com a
   * mesma `slugAncora`, então `secoes[].ancora` do leitor e o `id` do título
   * na gaveta coincidem. O `# Título` do topo sai: a gaveta já o mostra.
   */
  function bibFatias(cap) {
    var linhas = String(cap.corpo || '').split('\n');
    var fatias = [{ titulo: null, nivel: 0, ancora: null, linhas: [] }];
    var emCodigo = false;
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      if (/^```/.test(l.trim())) emCodigo = !emCodigo;
      var h = !emCodigo && /^(#{2,3})\s+(.+)$/.exec(l);
      if (h) {
        var t = h[2].trim();
        fatias.push({ titulo: t, nivel: h[1].length, ancora: slugAncora(t), linhas: [] });
        continue;
      }
      fatias[fatias.length - 1].linhas.push(l);
    }
    var pre = fatias[0].linhas;
    while (pre.length && !pre[0].trim()) pre.shift();
    if (pre.length && /^#\s+/.test(pre[0])) pre.shift();
    return fatias;
  }

  /** Corpo da gaveta: sumário (âncoras) + cada seção por `md()` — todo texto de arquivo passa por `esc()` lá dentro (R8). */
  function bibCorpoHtml(cap) {
    var fatias = bibFatias(cap);
    var sum = fatias.filter(function (f) { return f.titulo; });
    var html = '';
    if (sum.length > 1) {
      html += '<nav class="bib-sum" aria-label="Seções deste capítulo"><p class="bib-sum-rot">Neste capítulo</p><ol>' +
        sum.map(function (f) {
          return '<li class="n' + f.nivel + '"><a href="#bib-' + esc(f.ancora) + '" data-bib-anc="' + esc(f.ancora) + '">' +
            inline(f.titulo) + '</a></li>';
        }).join('') + '</ol></nav>';
    }
    html += '<div class="bib-corpo">' + fatias.map(function (f) {
      // mesmo mapa de nível do `md()`: `##` → h3, `###` → h4
      var n = f.titulo ? Math.min(f.nivel + 1, 4) : 0;
      return (f.titulo ? '<h' + n + ' id="bib-' + esc(f.ancora) + '">' + inline(f.titulo) + '</h' + n + '>' : '') +
        md(f.linhas.join('\n'));
    }).join('') + '</div>';
    return html;
  }

  function bibRegistra(cap, m) {
    var id = bibId(cap.arquivo);
    var perfil = BIB_PERFIL[cap.perfil] || cap.perfil || '';
    var cen = (cap.cenarios || []).map(bibRotuloCen);
    return registra('cap', id, {
      rotuloTipoTexto: 'Biblioteca · capítulo ' + bibDois(cap.ordem),
      titulo: esc(cap.titulo),
      sub: esc(perfil) + ' · ' + (cap.secoes || []).length + ' seções',
      props: [
        { rot: 'Arquivo', val: '<code>' + esc(cap.arquivo) + '</code>' },
        { rot: 'Perfil', val: esc(perfil) },
        { rot: 'Cenários', val: cen.map(function (r) { return '<span class="pil p-parado sem-ponto">' + esc(r) + '</span>'; }).join(' ') },
        { rot: 'Fonte', val: '<code>' + esc(m.fonte === 'cache' ? 'cache do plugin ' + (m.versao || '') : (m.pasta || 'plugin/biblioteca')) + '</code>' },
        { rot: 'Endereço', val: '<code>#/biblioteca/' + esc(id) + '</code>' }
      ],
      acoes: [{ rot: 'Copiar endereço', copiar: location.origin + location.pathname + '#/biblioteca/' + id }],
      corpo: function () { return bibCorpoHtml(cap); }
    });
  }

  var BIB_ROTA_APLICADA = null;

  function bibRolaAte(ancora) {
    if (!ancora || !/^[a-z0-9-]+$/.test(ancora)) return;
    var corpo = document.getElementById('gaveta-corpo');
    var alvo = corpo && corpo.querySelector('#bib-' + ancora);
    if (!alvo) return;
    Array.prototype.forEach.call(corpo.querySelectorAll('.bib-alvo'), function (el) { el.classList.remove('bib-alvo'); });
    alvo.classList.add('bib-alvo');
    alvo.scrollIntoView({ block: 'start' });
  }

  /** Abre a gaveta do capítulo `id` (sem `.md`) e, se houver, rola até a âncora. */
  function abreCapitulo(id, ancora, origem) {
    var chave = 'cap:' + id;
    if (!REGISTROS[chave]) return false;
    abreGaveta(chave, origem);
    if (ancora) bibRolaAte(ancora);
    return true;
  }

  /**
   * Chamada por `pinta()` DEPOIS de o palco existir. A rota
   * `#/biblioteca/<cap>[/<ancora>]` abre a gaveta certa UMA vez por endereço:
   * repinturas por filtro/visão não a reabrem — senão fechar a gaveta e
   * digitar na busca a traria de volta (R7). `hashchange` zera a marca.
   */
  function bibliotecaPosPintura(rota) {
    var args = rota.args || [];
    var chaveRota = args.join('/');
    if (!chaveRota || BIB_ROTA_APLICADA === chaveRota) return;
    BIB_ROTA_APLICADA = chaveRota;
    if (args[0] === 'glossario') return;   // a visão já foi trocada em `secaoBiblioteca`
    var origem = document.querySelector('#palco [data-abre="cap:' + args[0].replace(/[^a-z0-9-]/g, '') + '"] button');
    abreCapitulo(args[0], args[1] || '', origem || null);
  }

  /** Trecho em volta da 1ª ocorrência, com a ocorrência em `<mark>`. */
  function bibTrecho(texto, pos, len, termo) {
    var ini = Math.max(0, pos - 70), fim = Math.min(texto.length, pos + len + 90);
    // Review B: o destaque é por POSIÇÃO no texto CRU, escapando cada pedaço
    // (`destaca()` do Histórico) — nunca `replace` sobre HTML já escapado, que
    // partia a entidade de "P&L" ao buscar "amp".
    var html = destaca(texto.slice(ini, fim).replace(/\s+/g, ' '), termo);
    return (ini > 0 ? '… ' : '') + html + (fim < texto.length ? ' …' : '');
  }

  /** Busca no cliente: título + corpo de todos os capítulos; por capítulo, as seções onde bateu. */
  function bibBusca(caps, termo) {
    var t = bibNorm(termo).trim();
    var hits = [];
    if (!t) return hits;
    caps.forEach(function (cap) {
      var noTitulo = bibNorm(cap.titulo).indexOf(t) >= 0;
      var achados = [];
      bibFatias(cap).forEach(function (f) {
        var texto = (f.titulo ? f.titulo + '\n' : '') + f.linhas.join('\n');
        var pos = bibNorm(texto).indexOf(t);
        if (pos < 0) return;
        achados.push({ secao: f.titulo, ancora: f.ancora, trecho: bibTrecho(texto, pos, t.length, termo.trim()) });
      });
      if (noTitulo || achados.length) hits.push({ cap: cap, noTitulo: noTitulo, achados: achados });
    });
    return hits;
  }

  function bibResultados(hits, termo) {
    if (!hits.length) {
      return vazio('Nada com “' + termo + '”', 'Nenhum capítulo tem esse texto no título nem no corpo.',
        'tente outra palavra — ou apague a busca para ver a lista inteira.');
    }
    return cartao('<ul class="lista bib-hits">' + hits.map(function (h) {
      var id = bibId(h.cap.arquivo);
      var chave = 'cap:' + id;
      var n = h.achados.length;
      return '<li><div class="item-cab"><span class="bib-num">' + esc(bibDois(h.cap.ordem)) + '</span>' +
        abridor(chave, esc(h.cap.titulo)) +
        '<span class="item-meta">' + (n ? n + (n === 1 ? ' trecho' : ' trechos') : 'bate no título') + '</span></div>' +
        (n ? '<ul class="bib-trechos">' + h.achados.slice(0, 6).map(function (a) {
          return '<li><button type="button" class="bib-hit" data-bibabre="' + esc(id + '|' + (a.ancora || '')) + '">' +
            '<span class="bib-hit-sec">' + (a.secao ? inline(a.secao) : 'início do capítulo') + '</span>' +
            '<span class="bib-hit-tx">' + a.trecho + '</span></button></li>';
        }).join('') + (n > 6 ? '<li class="item-meta">… e mais ' + (n - 6) + ' — abra o capítulo</li>' : '') + '</ul>' : '') +
        '</li>';
    }).join('') + '</ul>');
  }

  function bibLista(caps) {
    return cartao('<ul class="lista bib-lista">' + caps.map(function (cap) {
      var chave = 'cap:' + bibId(cap.arquivo);
      return '<li class="bib-item" data-abre="' + esc(chave) + '" data-nav="1">' +
        '<span class="bib-num">' + esc(bibDois(cap.ordem)) + '</span>' +
        '<div class="bib-item-c"><div class="item-cab">' + abridor(chave, esc(cap.titulo)) + '</div>' +
        '<p class="item-meta">' + esc(BIB_PERFIL[cap.perfil] || cap.perfil) + ' · ' + (cap.secoes || []).length + ' seções · ' +
        esc((cap.cenarios || []).map(bibRotuloCen).join(', ')) + '</p></div>' +
        '<span class="bib-abrir" aria-hidden="true">abrir →</span></li>';
    }).join('') + '</ul>');
  }

  function bibCenarios(caps, m) {
    var porArq = Object.create(null);
    caps.forEach(function (c) { porArq[c.arquivo] = c; });
    return grade(BIB_CENARIOS.map(function (cen) {
      var arqs = (m.cenarios && m.cenarios[cen.id]) || [];
      return '<section class="cartao bib-cen"><h3 class="bib-cen-t"><span class="bib-cen-rot">Estou em…</span>' + esc(cen.rotulo) + '</h3>' +
        (arqs.length ? '<div class="bib-cen-l">' + arqs.map(function (a) {
          var cap = porArq[a];
          if (!cap) return '';
          return mini('cap:' + bibId(a), esc(cap.titulo), esc(bibDois(cap.ordem)), esc(BIB_PERFIL[cap.perfil] || ''));
        }).join('') + '</div>' : '<p class="item-meta">nenhum capítulo marcado para este cenário</p>') + '</section>';
    }));
  }

  function bibGlossario(gl, caps, termo) {
    var termos = (gl && gl.termos) || {};
    var nomes = Object.keys(termos);
    if (!nomes.length) {
      return vazio('Glossário para leigos vazio', 'O capítulo 05 não trouxe nenhum termo com analogia.',
        'confira <code>plugin/biblioteca/05-glossario-para-leigos.md</code>.');
    }
    var marca = glossario() || {};
    var t = bibNorm(termo).trim();
    var linhas = nomes.map(function (nome) {
      var v = termos[nome] || {};
      return {
        busca: [nome, v.analogia, v.onde, v.marca, v.grupo].join(' '),
        ord: { termo: nome, analogia: v.analogia || '', onde: v.onde || '', marca: v.marca || '', grupo: v.grupo || '' },
        cel: {
          termo: '<strong>' + esc(nome) + '</strong>',
          analogia: esc(v.analogia || ''),
          onde: inline(v.onde || ''),
          // o termo da marca abre a folha do glossário (o mesmo `data-glos` do `J()`)
          marca: !v.marca ? '<span class="item-meta">—</span>'
            : marca[v.marca] ? '<button type="button" class="jarg" data-glos="' + esc(v.marca) + '" title="' + esc(marca[v.marca].def || '') + '">' + esc(v.marca) + '</button>'
            : esc(v.marca),
          grupo: esc(v.grupo || '')
        }
      };
    }).filter(function (l) { return !t || bibNorm(l.busca).indexOf(t) >= 0; });
    var cap05 = null;
    caps.forEach(function (c) { if (!cap05 && /^05-/.test(c.arquivo)) cap05 = c; });
    var cabec = '<p class="item-meta bib-glos-cab">' + (gl.total || nomes.length) + ' termos com analogia' +
      (cap05 ? ' · ' + abridor('cap:' + bibId(cap05.arquivo), 'abrir o capítulo ' + esc(cap05.titulo)) : '') + '</p>';
    return cartao(cabec + tabelaOrd('biblioteca-glos', [
      { c: 'termo', rot: 'Termo' }, { c: 'analogia', rot: 'Analogia' }, { c: 'onde', rot: 'Onde aparece' },
      { c: 'marca', rot: 'Termo da marca' }, { c: 'grupo', rot: 'Grupo' }
    ], linhas, 'Filtrar termos…', { buscaExterna: true, contagem: (t ? linhas.length + ' de ' : '') + nomes.length }));
  }

  function secaoBiblioteca(d) {
    var b = d.biblioteca || {};
    var out = [];
    var rota = rotaAtual || { args: [] };
    var termo = String(FILTRO['biblioteca'] || '');

    // `#/biblioteca/glossario` é para onde os links normalizados do leitor
    // apontam: troca a visão UMA vez por endereço; depois o dono manda.
    if (rota.args && rota.args[0] === 'glossario' && BIB_ROTA_APLICADA !== 'glossario') guardaBibVisao('glossario');
    var vis = bibVisao();

    var manual = b.manual;
    if (!manual) {
      out.push(vazio('Sem manual nesta resposta', 'O servidor não mandou o campo "manual" da biblioteca — QG de versão antiga?',
        'suba o QG de novo (<code>node hub/serve.js</code>) e recarregue.'));
    } else if (manual.ok === false) {
      // R1: falha de leitura é VISÍVEL, com o erro inteiro — nunca lista vazia.
      out.push('<div class="torto bib-erro"><h3>Não consegui ler o manual — o resto da tela segue</h3>' +
        '<p>' + esc(manual.erro || 'motivo não informado') + '</p>' +
        (manual.arquivo ? '<p class="item-meta">Procurei em <code>' + esc(manual.arquivo) + '</code>.</p>' : '') + '</div>');
    } else {
      var m = manual.data || {};
      var caps = (m.capitulos || []).slice();
      caps.forEach(function (c) { bibRegistra(c, m); });
      var seletor = '<div class="visoes" role="group" aria-label="Forma de visualização da biblioteca">' +
        BIB_VIS.map(function (v) {
          var on = v === vis;
          return '<button type="button" class="vis' + (on ? ' ativo' : '') + '" aria-pressed="' + on + '"' +
            ' data-bibvis="' + v + '" title="Ver como ' + esc(BIB_NOME_VIS[v].toLowerCase()) + '">' +
            '<span class="vis-ico" aria-hidden="true">' + BIB_ICO_VIS[v] + '</span>' + esc(BIB_NOME_VIS[v]) + '</button>';
        }).join('') + '</div>';
      out.push('<div class="barra-visoes bib-topo">' +
        '<input class="campo" type="search" data-filtro="biblioteca" value="' + esc(termo) + '"' +
        ' placeholder="Buscar no manual (título e texto dos capítulos)…" aria-label="Buscar na biblioteca">' +
        seletor +
        '<span class="item-meta">' + caps.length + ' capítulos · ' +
        esc(m.fonte === 'cache' ? 'plugin ' + (m.versao || '') : 'plugin/biblioteca') + '</span></div>');

      if (!caps.length) {
        out.push(vazio('Manual sem capítulos', 'A pasta da biblioteca foi encontrada, mas não tem nenhum capítulo.',
          'confira <code>plugin/biblioteca/</code>.'));
      } else if (vis === 'glossario') {
        out.push(bibGlossario(m.glossarioLeigo || {}, caps, termo));
      } else if (termo.trim()) {
        out.push(bibResultados(bibBusca(caps, termo), termo.trim()));
      } else if (vis === 'cenarios') {
        out.push(bibCenarios(caps, m));
      } else {
        out.push(bibLista(caps));
      }
    }

    if ((b.origem || []).length) {
      out.push('<div class="bloco">' + tituloBloco('De onde o Arvys veio', 'as ideias que este escritório herdou') +
        cartao('<dl class="def">' + b.origem.map(function (o) {
          return '<dt>' + esc(o.nome) + '</dt><dd>' + esc(o.descricao) + '</dd>';
        }).join('') + '</dl>') + '</div>');
    }

    out.push('<div class="bloco">' + tituloBloco('Documentos do escritório', 'o que já está escrito e vale ler') +
      leitura(b.documentos, 'os documentos do escritório', function (docs) {
        if (!docs.length) {
          return vazio('Nenhum documento solto', 'O escritório ainda não tem documentos além dos arquivos de estado.',
            'nada a fazer — eles aparecem conforme o escritório escreve.');
        }
        return cartao('<ul class="lista">' + docs.map(function (x) {
          return '<li><div class="item-cab"><span class="t">' + esc(x.titulo || x.nome) + '</span></div>' +
            '<p class="item-meta" style="margin:var(--esp-0) 0 0"><code>' + esc(x.arquivo) + '</code> · ' + fmtBytes(x.bytes) +
            ' · alterado ' + esc(idade(diasEntre(String(x.mtime).slice(0, 10)))) + '</p></li>';
        }).join('') + '</ul>');
      }, {
        titulo: 'Nenhum documento',
        texto: 'O escritório ainda não escreveu documentos além dos arquivos de estado.',
        caminho: 'nada a fazer agora — eles nascem conforme o trabalho acontece.'
      }) + '</div>');

    return out.join('');
  }

  // =========================================================================
  // 16. roteador e pintura
  // =========================================================================

  function rotaDoHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    var partes = h.split('/').filter(Boolean).map(decodeURIComponent);
    if (!partes.length) return { secao: lembra('arvys.secao') || 'inicio', args: [] };
    var id = partes[0];
    var existe = SECOES.some(function (s) { return s.id === id; });
    if (!existe) return { secao: 'inicio', args: [], desconhecida: id };
    return { secao: id, args: partes.slice(1) };
  }

  function pintaMenu(secaoAtiva) {
    var d = DADOS;
    // spec 2026-09-qg-redesenho-2 (T1, critério 2): o selo do Início lê a
    // MESMA função pura que o bloco "Esperando você" (`esperandoVoce`) e o
    // grupo "Esperando você" de Trabalho (`abaFila`) — nunca soma de novo
    // gates+blockers aqui. Servidor antigo sem o campo (`d.inicio.pendencias`
    // ausente) ou parte que ainda não carregou (`parcial`): sem selo, nunca
    // um número que pode discordar dos outros dois lugares.
    var p = d && d.inicio && d.inicio.pendencias;
    var pend = p && !p.parcial ? p.total : 0;
    var radarPend = d && d.radar && d.radar.cru && d.radar.cru.ok && d.radar.cru.data
      ? (d.radar.cru.data.pendentes || []).length : 0;

    var porId = {};
    SECOES.forEach(function (s) { porId[s.id] = s; });
    function itemHtml(s) {
      var selo = '';
      if (s.id === 'inicio' && pend) selo = '<span class="menu-selo">' + pend + '</span>';
      if (s.id === 'radar' && radarPend) selo = '<span class="menu-selo">' + radarPend + '</span>';
      return '<li><a href="#/' + s.id + '"' + (s.id === secaoAtiva ? ' aria-current="page"' : '') + '>' +
        '<span class="menu-ico" aria-hidden="true"><svg viewBox="0 0 16 16">' + ICONES[s.id] + '</svg></span>' +
        '<span class="menu-nome">' + esc(s.nome) + '</span>' + selo + '</a></li>';
    }
    // T5/critério 14: cabeçalho de grupo é `<li role="presentation">` — nunca
    // um link, nunca recebe foco; Tab e os atalhos J/K (que só olham
    // `#palco [data-nav="1"]`) passam direto por ele sem ajuste nenhum.
    $('#menu').innerHTML = GRUPOS_MENU.map(function (g) {
      var itens = g.ids.map(function (id) { return porId[id]; }).filter(Boolean);
      return '<li class="menu-grupo" role="presentation" aria-hidden="true">' + esc(g.rotulo) + '</li>' +
        itens.map(itemHtml).join('');
    }).join('');
  }

  function pintaCotaMini() {
    var r = DADOS ? reguaDaCota(DADOS) : null;
    if (!r) {
      $('#cota-mini-pct').textContent = 'n/d';
      $('#cota-mini-nota').textContent = 'sem medição de tokens ainda — rode node hub/tokens.js';
      return;
    }
    var tom = r.pct >= 90 ? 'ruim' : r.pct >= 75 ? 'atencao' : 'ok';
    $('#cota-mini-pct').textContent = r.pct + '%';
    $('#cota-mini-barra').style.setProperty('--fr', Math.min(100, r.pct) / 100);
    $('#cota-mini-barra').parentNode.className = 'barra b-' + tom;
    // T6.6 · a barra que assustava. O estranho leu a barra verde subindo como
    // CARREGAMENTO e teve "medo de estourar algo". A metade que faltava: a
    // barra nao dizia o que media nem para quem le com o teclado. Agora ela e
    // uma regua declarada (role=meter), com o quanto e de quanto no rotulo.
    var reg = $('#cota-mini-barra').parentNode;
    reg.setAttribute('role', 'meter');
    reg.setAttribute('aria-valuemin', '0');
    reg.setAttribute('aria-valuemax', '100');
    reg.setAttribute('aria-valuenow', String(r.pct));
    reg.setAttribute('aria-label', 'Cota da semana: ' + r.pct + '% do teto de tokens já usado');
    reg.title = r.pct + '% da franquia da semana já gasta — isto não é carregamento.';
    // "gasto" na frente porque era a duvida do estranho: a barra sobe quando
    // eu GASTO, nao quando algo carrega.
    $('#cota-mini-nota').textContent = 'gasto: ' + fmtTok(r.atual.totalTokens) + ' de ' + fmtTok(r.teto) +
      ' tokens (maior semana medida)' + (r.delta === null ? '' : ' · ' + (r.delta > 0 ? '+' : '') + r.delta + '% vs anterior');
  }

  function pinta() {
    var rota = rotaDoHash();
    rotaAtual = rota;
    resetJargao();
    // a gaveta so conhece os registros da pintura corrente
    REGISTROS = Object.create(null);
    pintaMenu(rota.secao);

    var meta = null;
    SECOES.forEach(function (s) { if (s.id === rota.secao) meta = s; });
    var palco = $('#palco');

    if (ERRO_API) {
      palco.innerHTML = '<div class="cab"><h1>Não consegui falar com o servidor</h1></div>' +
        '<div class="torto"><h3>' + esc(ERRO_API) + '</h3>' +
        '<p>O QG lê tudo de <code>/api/qg</code>, servido pelo mesmo processo que entregou esta página. ' +
        soLocal('Se você fechou o servidor, rode <b>node hub/serve.js</b> de novo e recarregue.',
          'Recarregue a página — se persistir, o problema é do servidor, não seu.') + '</p></div>';
      return;
    }
    if (!DADOS) return;

    var ehFicha = rota.secao === 'agentes' && rota.args.length;
    var titulo = ehFicha ? 'Ficha do agente' : meta.titulo;
    var lead = ehFicha ? 'Tudo que o escritório sabe sobre este agente: persona, o que fez, como foi medido e o que aprendeu errando.' : meta.lead;

    var corpo;
    // T2 (spec 2026-09-qg-redesenho-2): a "barra herdada" que a auditoria viu
    // era isto — `CONTROLES_ABA` é global e uma seção que a deposita
    // (`tabelaOrd(.., {barraFora:1})`) podia deixá-la para a PRÓXIMA seção
    // consumir, se a seção de destino não montasse tabela nenhuma. Zerar
    // ANTES de qualquer `secaoX()` fecha essa porta para toda seção, não só
    // Agentes.
    CONTROLES_ABA = '';
    try {
      switch (rota.secao) {
        case 'inicio': corpo = secaoInicio(DADOS); break;
        case 'escritorio': corpo = secaoEscritorio(); break;
        case 'trabalho': corpo = secaoTrabalho(DADOS); break;
        case 'agentes': corpo = ehFicha ? fichaAgente(DADOS, rota.args[0]) : secaoAgentes(DADOS); break;
        case 'decisoes': corpo = secaoDecisoes(DADOS); break;
        case 'historico': corpo = secaoHistorico(); break;
        case 'quadro': corpo = secaoQuadro(); break;
        case 'cota': corpo = secaoCota(DADOS); break;
        case 'radar': corpo = secaoRadar(DADOS); break;
        case 'leis': corpo = secaoLeis(DADOS); break;
        case 'biblioteca': corpo = secaoBiblioteca(DADOS); break;
        default: corpo = vazio('Seção desconhecida', 'O endereço não corresponde a nenhuma seção.', 'use o menu ao lado.');
      }
    } catch (e) {
      // uma seção que estoura não pode derrubar a plataforma (estado de partida (b)).
      // T3/critério 7: a pilha vai só para o console — a tela nunca mostra stack.
      console.error('[qg] seção não conseguiu se montar:', e);
      corpo = '<div class="torto"><h3>Esta seção quebrou ao montar</h3>' +
        '<p>O resto do QG continua funcionando.</p>' +
        '<p class="item-meta">' + esc((e && e.message) || String(e)) + '</p></div>';
    }

    palco.innerHTML = '<div class="cab"><div class="cab-linha"><div>' +
      '<h1>' + esc(titulo) + '</h1><p class="lead">' + lead + '</p></div></div></div>' + corpo;
    // spec 2026-09-biblioteca (T4): `#/biblioteca/<cap>[/<ancora>]` abre a
    // gaveta do capítulo — só DEPOIS de o palco existir (a origem do foco é
    // um botão da lista) e uma vez por endereço (ver `bibliotecaPosPintura`).
    if (rota.secao === 'biblioteca') bibliotecaPosPintura(rota);

    guarda('arvys.secao', rota.secao);
    document.title = 'ARVYS — ' + (ehFicha ? rota.args[0] : meta.nome);

    // seções pesadas: só buscam quando abrem (R4)
    // Guardas pela FLAG do pedido, nunca pelo resultado (gotcha 59; review
    // T6-B mediu 2 requisicoes por abertura em fila/live/decisoes com `!PESADAS.x`).
    if (rota.secao === 'decisoes' && !PESADAS_PEDIDO.decisoes) pegaPesada('decisoes').then(pintaSeAinda('decisoes'));
    if (rota.secao === 'trabalho' && abaTrabalho === 'fila' && !PESADAS_PEDIDO.fila) pegaPesada('fila').then(pintaSeAinda('trabalho'));
    if (rota.secao === 'trabalho' && abaTrabalho === 'pedidos' && !PESADAS_PEDIDO.pedidos) pegaPesada('pedidos').then(pintaSeAinda('trabalho'));
    if (rota.secao === 'agentes' && !LIVE_PEDIDO) pegaLive().then(pintaSeAinda('agentes'));
    // T6/E6 · o histórico é rota da NUVEM: só é pedido quando a seção abre, e
    // uma vez só (`HIST_PEDIDO`). 404 aqui não é erro — é "não existe aqui".
    // Gotcha 59, o caso dormente que ele mesmo nomeou: a guarda era `!HIST` (o
    // RESULTADO), e `HIST` fica null enquanto o fetch voa — cada repintura
    // nessa janela chamava `pegaHistorico()` de novo, que devolvia
    // `Promise.resolve(null)` e agendava outra repintura: microtarefas até o
    // renderer cair. Medido em 2026-09-12 (spec qg-redesenho-2, T4b: virar a
    // visão padrão para linha do tempo expôs o laço — Chromium headless
    // `evaluate travou 15s`; com `!HIST_PEDIDO`, 3 s e vivo).
    if (rota.secao === 'historico' && !HIST_PEDIDO) pegaHistorico().then(pintaSeAinda('historico'));
    // T6/E7 · mesma regra do histórico: rota da NUVEM, só pedida quando a
    // seção abre, uma vez só.
    //
    // ACHADO — trava o navegador inteiro (medido, não hipótese): a guarda
    // TEM de ser `!QUADRO_PEDIDO` (a flag do PEDIDO), nunca `!QUADRO` (a
    // variável do RESULTADO). `QUADRO` fica `null` durante toda a janela em
    // que o fetch está em voo; `pinta()` roda mais de uma vez nessa janela
    // (histórico de navegação, `olhaMudanca`, eventos). Com `!QUADRO`, CADA
    // uma dessas chamadas via `pegaQuadro()` de novo — e como
    // `QUADRO_PEDIDO` já está `true`, ela devolve `Promise.resolve(QUADRO)`
    // (ainda `null`) em vez de esperar a rede. Isso agenda uma MICROTAREFA
    // que chama `pinta()` de novo, que reavalia a MESMA condição, que
    // agenda outra microtarefa — um laço que se autoalimenta e NUNCA cede
    // ao macrotask da resposta real da rede (microtarefas esgotam a fila
    // antes de qualquer I/O), até o processo do navegador cair. Reproduzido
    // 3/3 com `!QUADRO`; 0/3 depois do troque para `!QUADRO_PEDIDO` — ver
    // `evidence/T6-tela.md`. Historico (`!HIST`) caiu no mesmo laco em
    // 2026-09-12 e foi consertado (`!HIST_PEDIDO`, incidente do dia); as
    // guardas de decisoes/fila/pedidos/agentes ganharam flag no mesmo dia
    // (review T6-B). Quem escrever a proxima busca sob demanda: flag do
    // PEDIDO — `scripts/check-guarda-pedido.mjs` reprova o contrario.
    if (rota.secao === 'quadro' && !QUADRO_PEDIDO) pegaQuadro().then(pintaSeAinda('quadro'));
  }

  function pintaSeAinda(secao) {
    return function () { if (rotaAtual && rotaAtual.secao === secao) pinta(); };
  }

  // =========================================================================
  // 17. eventos
  // =========================================================================

  function aplicaTema(t) {
    document.documentElement.setAttribute('data-tema', t);
    guarda('arvys.tema', t);
    sincronizaTemaDoLive();
    sincronizaTemaDaJanelaLive();   // T11: a janela de fora obedece ao mesmo interruptor
  }
  function alternaTema() {
    aplicaTema(document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro');
  }

  function fechaGaveta() {
    $('#lateral').classList.remove('aberta');
    $('#veu').hidden = true;
    $('#btn-menu').setAttribute('aria-expanded', 'false');
  }

  function ligaEventos() {
    $('#btn-tema').addEventListener('click', alternaTema);
    $('#btn-tema-topo').addEventListener('click', alternaTema);

    $('#btn-menu').addEventListener('click', function () {
      var abriu = !$('#lateral').classList.contains('aberta');
      $('#lateral').classList.toggle('aberta', abriu);
      $('#veu').hidden = !abriu;
      this.setAttribute('aria-expanded', String(abriu));
    });
    $('#veu').addEventListener('click', fechaGaveta);
    $('#lateral').addEventListener('click', function (e) { if (e.target.closest('a')) fechaGaveta(); });

    // Esc e Tab: enquanto a gaveta esta aberta ela e dona do teclado (foco preso).
    document.addEventListener('keydown', function (e) {
      var g = document.getElementById('gaveta');
      if (g && !g.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); fechaGavetaDet(); return; }
        if (e.key !== 'Tab') return;
        var f = focaveisDa(g);
        if (!f.length) { e.preventDefault(); return; }
        var pri = f[0], ult = f[f.length - 1];
        if (!g.contains(document.activeElement)) { e.preventDefault(); pri.focus(); }
        else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
        else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
        return;
      }
      if (e.key === 'Escape') fechaGaveta();
    });

    // clique fora fecha; o botao X tambem
    $('#gaveta-veu').addEventListener('click', fechaGavetaDet);
    $('#gaveta-x').addEventListener('click', fechaGavetaDet);
    // link dentro da gaveta que troca de rota: fecha antes de navegar
    $('#gaveta').addEventListener('click', function (e) {
      // spec 2026-09-biblioteca (T4): sumário e `[x](#ancora)` do capítulo
      // rolam DENTRO da gaveta — nunca mexem no hash (hashchange fecharia a
      // gaveta e repintaria o palco: R7).
      var anc = e.target.closest('a[data-bib-anc]');
      if (anc) { e.preventDefault(); bibRolaAte(anc.getAttribute('data-bib-anc')); return; }
      // T4 · ações do rodapé (copiar). Nada aqui navega nem escreve em arquivo:
      // a gaveta continua sendo leitura — copiar é do usuário, não do QG.
      var ac = e.target.closest('[data-acao]');
      if (ac) {
        var pe = document.getElementById('gaveta-acoes');
        var lista = (pe && pe.__acoes) || [];
        var alvo = lista[Number(ac.getAttribute('data-acao'))];
        if (alvo && alvo.copiar) { copiaTexto(alvo.copiar, ac); return; }
        // FILA 79 · T3(c) — "Mover para →": a própria `moverStatus` cuida do
        // otimista e da repintura (padrão de `espEnviaRecado`).
        if (alvo && alvo.mover) { moverStatus(alvo.mover, ac); return; }
        // T6.3 · o verbo. Repinta a lista atrás E a própria gaveta, para o botão
        // já voltar dizendo "Trazer de volta" — ação sem retorno visível é ação
        // que o dono repete achando que não funcionou.
        if (alvo && alvo.adiar) {
          alternaAdiar(alvo.adiar, alvo.ate);
          pinta();
          if (gavetaChave) abreGaveta(gavetaChave, gavetaOrigem);
          return;
        }
        return;
      }
      var a = e.target.closest('a[href^="#/"]');
      if (a) fechaGavetaDet();
    });

    // T4 · ↑ ↓ percorrem os itens SEM fechar a gaveta. A ordem é a da lista que
    // está na tela (grupo inclusive), então percorrer respeita o agrupamento.
    document.addEventListener('keydown', function (e) {
      if (!gavetaAberta()) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var alvo = e.target;
      var t = (alvo && alvo.tagName || '').toLowerCase();
      if (t === 'input' || t === 'textarea' || t === 'select') return;
      var corpo = document.getElementById('gaveta-corpo');
      // deixa a seta rolar o texto quando o foco está dentro do corpo rolável
      if (corpo && corpo.contains(alvo) && corpo.scrollHeight > corpo.clientHeight) return;
      var ls = Array.prototype.slice.call(document.querySelectorAll('#palco [data-nav="1"]'))
        .map(function (l) { return l.getAttribute('data-abre'); });
      var i = ls.indexOf(gavetaChave);
      if (i < 0 || !ls.length) return;
      e.preventDefault();
      var j = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (j < 0 || j > ls.length - 1) return;   // ponta da lista: para, não dá a volta
      var linha = document.querySelector('#palco [data-abre="' + ls[j].replace(/"/g, '\\"') + '"]');
      abreGaveta(ls[j], (linha && linha.querySelector('button[data-abre]')) || gavetaOrigem);
    });

    window.addEventListener('hashchange', function () {
      fechaGavetaDet();
      // endereço novo = a Biblioteca pode abrir a gaveta da rota de novo
      // (mesmo que seja o mesmo capítulo de antes, chegado por outro link).
      BIB_ROTA_APLICADA = null;
      if (window.scrollTo) window.scrollTo(0, 0);
      pinta();
    });

    // ---- T3.5 · atalhos de teclado (J/K/Enter/?), estilo Linear -------------
    // Guarda inegociavel: NENHUM atalho dispara com o foco num campo de texto,
    // nem com modificador (Ctrl/Alt/Meta) — digitar "jk" no filtro tem de
    // escrever "jk", nao navegar a lista. Esc ja e da gaveta e continua dela.
    function editando(el) {
      if (!el) return false;
      var t = (el.tagName || '').toLowerCase();
      return t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable === true;
    }
    function linhasNav() {
      return Array.prototype.slice.call(document.querySelectorAll('#palco [data-nav="1"]'));
    }
    var linhaFoco = -1;
    function marcaFoco(ls, i) {
      ls.forEach(function (l, k) { l.classList.toggle('nav-aqui', k === i); });
      var alvo = ls[i];
      if (!alvo) return;
      var b = alvo.querySelector('button[data-abre]');
      if (b) b.focus(); else alvo.scrollIntoView({ block: 'nearest' });
    }
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (editando(e.target)) return;
      var k = e.key;
      // R6b: a folha aberta é dona do teclado enquanto estiver aberta.
      if (document.getElementById('atalhos-veu')) {
        if (k === 'Escape' || k === '?') { e.preventDefault(); fechaAtalhos(); }
        return;
      }
      if (document.getElementById('glos-veu')) {
        if (k === 'Escape' || k === 'g' || k === 'G') { e.preventDefault(); fechaGlossario(); }
        return;
      }
      // T7: `G` abre as palavras do escritório — o glossário para quem não tem
      // mouse (e para quem quer ler tudo de uma vez).
      if (k === 'g' || k === 'G') { e.preventDefault(); mostraGlossario(); return; }
      // R6a (reviewer 2026-09-06): com a gaveta aberta, o foco esta no botao de
      // fechar — que NAO e campo de texto, entao `editando()` deixava passar.
      // J/K jogavam o foco para uma linha ESCONDIDA atras da gaveta, e Enter
      // trocava o conteudo dela. A gaveta e dona do teclado: aqui nao passa.
      if (gavetaAberta()) return;
      if (k === '?') { e.preventDefault(); mostraAtalhos(); return; }
      if (k !== 'j' && k !== 'J' && k !== 'k' && k !== 'K' && k !== 'Enter') return;
      var ls = linhasNav();
      if (!ls.length) { linhaFoco = -1; return; }
      // R6c: `linhaFoco` sobrevive a repintura, e a lista pode ter encolhido
      // (filtro). Clampa SEMPRE, nao so no incremento — indice podre fazia o
      // Enter nao fazer nada, em silencio.
      if (linhaFoco > ls.length - 1) linhaFoco = ls.length - 1;
      if (k === 'Enter') {
        if (linhaFoco < 0) { linhaFoco = 0; marcaFoco(ls, 0); }
        var atual = ls[linhaFoco];
        if (!atual) return;
        e.preventDefault();
        var bt = atual.querySelector('button[data-abre]') || atual;
        abreGaveta(atual.getAttribute('data-abre'), bt);
        return;
      }
      e.preventDefault();
      var passo = (k === 'j' || k === 'J') ? 1 : -1;
      linhaFoco = linhaFoco < 0 ? (passo > 0 ? 0 : ls.length - 1) : linhaFoco + passo;
      if (linhaFoco < 0) linhaFoco = 0;
      if (linhaFoco > ls.length - 1) linhaFoco = ls.length - 1;
      marcaFoco(ls, linhaFoco);
    });

    var focoAntesDosAtalhos = null;
    // ---- T7 · a folha do glossário (tecla G, ou clicar num termo) ----------
    // O tooltip do `title` só existe com mouse. Esta folha existe para o toque,
    // para o teclado e para quem quer ler tudo de uma vez — os 36 termos, com
    // a tradução `en` congelada ao lado.
    var focoAntesDoGlos = null;
    function fechaGlossario() {
      var v = document.getElementById('glos-veu');
      if (v && v.parentNode) v.parentNode.removeChild(v);
      if (focoAntesDoGlos && document.contains(focoAntesDoGlos)) {
        try { focoAntesDoGlos.focus(); } catch (e) { /* nada */ }
      }
      focoAntesDoGlos = null;
    }
    function mostraGlossario(destaque) {
      if (document.getElementById('glos-veu')) { fechaGlossario(); return; }
      focoAntesDoGlos = document.activeElement;
      var g = DADOS && DADOS.biblioteca && DADOS.biblioteca.glossario;
      var corpo;
      // spec 2026-09-biblioteca (T4): a analogia do glossário leigo entra
      // ANTES da definição da marca, quando existe para o termo.
      var leigo = glossarioLeigo();
      if (g && g.ok && g.data && g.data.grupos && g.data.grupos.length) {
        corpo = g.data.grupos.map(function (gr) {
          return '<h3>' + esc(gr.titulo) + '</h3><dl>' + gr.termos.map(function (t) {
            var v = g.data.termos[t] || {};
            var l = leigo && leigo[bibNorm(t)];
            return '<dt' + (t === destaque ? ' class="destaque"' : '') + '>' + esc(t) +
              (v.en ? ' <span class="glos-en">' + esc(v.en) + '</span>' : '') + '</dt>' +
              '<dd>' + (l && l.analogia ? '<em class="glos-analogia">' + esc(l.analogia) + '</em> · ' : '') + esc(v.def || '') + '</dd>';
          }).join('') + '</dl>';
        }).join('');
      } else {
        corpo = '<p class="item-meta">Não consegui ler <code>company/GLOSSARIO.md</code>. ' +
          'As explicações que aparecem ao passar o mouse continuam funcionando.</p>';
      }
      var d = document.createElement('div');
      d.id = 'glos-veu';
      d.className = 'atalhos-veu';
      d.innerHTML = '<div class="atalhos glos" role="dialog" aria-modal="true" aria-label="As palavras do escritório">' +
        '<button type="button" class="atalhos-x" id="glos-x" title="Fechar (Esc)">' +
        '<span aria-hidden="true">✕</span><span class="sr">Fechar o glossário</span></button>' +
        '<h2>As palavras do escritório</h2>' +
        '<p class="item-meta" style="margin:0 0 var(--esp-4)">De <code>company/GLOSSARIO.md</code>. ' +
        'O termo em cinza é a tradução congelada para o inglês.</p>' +
        corpo + '</div>';
      d.addEventListener('click', function (ev) { if (ev.target === d) fechaGlossario(); });
      d.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Tab') return;
        var f = focaveisDa(d);
        if (!f.length) { ev.preventDefault(); return; }
        var pri = f[0], ult = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === pri) { ev.preventDefault(); ult.focus(); }
        else if (!ev.shiftKey && document.activeElement === ult) { ev.preventDefault(); pri.focus(); }
      });
      document.body.appendChild(d);
      var alvo = d.querySelector('dt.destaque') || document.getElementById('glos-x');
      if (alvo) { if (alvo.tagName === 'DT') alvo.scrollIntoView({ block: 'center' }); }
      var x = document.getElementById('glos-x');
      if (x) x.focus();
    }

    // clicar num termo abre a folha no termo
    $('#palco').addEventListener('click', function (e) {
      var t = e.target.closest('[data-glos]');
      if (t) { e.preventDefault(); mostraGlossario(t.getAttribute('data-glos')); }
    });

    function fechaAtalhos() {
      var v = document.getElementById('atalhos-veu');
      if (v && v.parentNode) v.parentNode.removeChild(v);
      // R6b: o foco volta de onde saiu — some da tela e nao voltar e defeito.
      if (focoAntesDosAtalhos && document.contains(focoAntesDosAtalhos)) {
        try { focoAntesDosAtalhos.focus(); } catch (err) { /* elemento sem foco */ }
      }
      focoAntesDosAtalhos = null;
    }
    function mostraAtalhos() {
      if (document.getElementById('atalhos-veu')) { fechaAtalhos(); return; }
      focoAntesDosAtalhos = document.activeElement;
      var d = document.createElement('div');
      d.id = 'atalhos-veu';
      d.className = 'atalhos-veu';
      d.innerHTML = '<div class="atalhos" role="dialog" aria-modal="true" aria-label="Atalhos de teclado">' +
        '<button type="button" class="atalhos-x" id="atalhos-x" title="Fechar (Esc)">' +
        '<span aria-hidden="true">✕</span><span class="sr">Fechar os atalhos</span></button>' +
        '<h2>Atalhos</h2><dl>' +
        '<dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>desce e sobe na lista</dd>' +
        '<dt><kbd>Enter</kbd></dt><dd>abre o registro inteiro</dd>' +
        '<dt><kbd>Esc</kbd></dt><dd>fecha a janela aberta</dd>' +
        '<dt><kbd>Tab</kbd></dt><dd>percorre os controles da tela</dd>' +
        '<dt><kbd>G</kbd></dt><dd>as palavras do escritório (o glossário)</dd>' +
        '<dt><kbd>?</kbd></dt><dd>mostra e esconde esta lista</dd>' +
        '</dl><p class="item-meta">Nenhum atalho dispara enquanto você digita num campo.</p></div>';
      d.addEventListener('click', fechaAtalhos);
      // R6b: o markup declara `aria-modal` — entao o Tab tem de ficar preso
      // aqui dentro. Sem isto o leitor de tela anuncia um modal e o teclado
      // passeia pela pagina de baixo, que e mentira de acessibilidade.
      d.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Tab') return;
        var f = focaveisDa(d);
        if (!f.length) { ev.preventDefault(); return; }
        var primeiro = f[0], ultimo = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      });
      document.body.appendChild(d);
      var x = document.getElementById('atalhos-x');
      if (x) x.focus();
    }

    // T3: repinta e devolve o foco ao controle clicado (ou ao seu equivalente
    // depois da repintura). Sem isto, cada clique joga o foco para o body.
    function repintaEFoca(sel) {
      pinta();
      var el = document.querySelector(sel);
      if (el) el.focus();
    }

    // delegação no palco: abas, visões, ordenação, abertura da gaveta
    $('#palco').addEventListener('click', function (e) {
      // spec 2026-09-biblioteca (T4): visão da Biblioteca (chave própria
      // `arvys.biblioteca.vis`) e resultado de busca que abre o capítulo JÁ
      // na seção onde bateu. Antes do `[data-abre]` genérico de propósito.
      var bv = e.target.closest('[data-bibvis]');
      if (bv) {
        var nv = bv.getAttribute('data-bibvis');
        guardaBibVisao(nv);
        pinta();   // repintura pura, sem fetch — mesma regra de `data-visao`
        var nb = document.querySelector('[data-bibvis="' + nv + '"]');
        if (nb) nb.focus();
        return;
      }
      var ba = e.target.closest('[data-bibabre]');
      if (ba) {
        var pb = ba.getAttribute('data-bibabre').split('|');
        abreCapitulo(pb[0], pb[1] || '', ba);
        return;
      }
      var abre = e.target.closest('[data-abre]');
      if (abre) {
        // linha da tabela e botao da 1a celula carregam a mesma chave: o botao vence,
        // e a origem do foco e sempre um elemento focavel (para devolver o foco).
        var botao = e.target.closest('button[data-abre]') || abre.querySelector('button[data-abre]') || abre;
        abreGaveta(abre.getAttribute('data-abre'), botao);
        return;
      }
      var ord = e.target.closest('[data-ord]');
      if (ord) {
        var pa = ord.getAttribute('data-ord').split('|');
        var at = ORD[pa[0]] || { col: null, dir: 1 };
        ORD[pa[0]] = { col: pa[1], dir: at.col === pa[1] ? -at.dir : 1 };
        guardaOrdem(pa[0]);
        pinta();
        var volta = document.querySelector('[data-ord="' + pa[0] + '|' + pa[1] + '"]');
        if (volta) volta.focus();
        return;
      }
      var vis = e.target.closest('[data-visao]');
      if (vis) {
        var pv = vis.getAttribute('data-visao').split('|');
        guardaVisao(pv[0], pv[1]);
        pinta();   // repintura pura: nenhum fetch novo (window.__arvysRede.total nao anda)
        var nova = document.querySelector('[data-visao="' + pv[0] + '|' + pv[1] + '"]');
        if (nova) nova.focus();
        return;
      }
      // O menu lembra que estava aberto entre repinturas — sem isto, escolher
      // "agrupar por projeto" fechava o menu na cara de quem ia escolher a
      // coluna em seguida.
      var det = e.target.closest('details[data-menu]');
      if (det && e.target.closest('summary')) {
        MENU_ABERTO = det.open ? null : det.getAttribute('data-menu');
        // fecha os outros
        Array.prototype.forEach.call(document.querySelectorAll('details[data-menu]'), function (d) {
          if (d !== det) d.open = false;
        });
        return;
      }
      // T3 · display options: agrupar, mostrar/esconder coluna, colapsar grupo.
      // Todos repintam e devolvem o foco ao proprio botao — quem navega por
      // teclado nao volta para o topo da pagina a cada clique.
      var ag = e.target.closest('[data-agrupa]');
      if (ag) {
        var pg = ag.getAttribute('data-agrupa').split('|');
        guardaAgrupamento(pg[0], pg[1]);
        repintaEFoca('[data-agrupa="' + pg[0] + '|' + pg[1] + '"]');
        return;
      }
      var pr = e.target.closest('[data-prop]');
      if (pr) {
        var pp = pr.getAttribute('data-prop').split('|');
        alternaProp(pp[0], pp[1]);
        repintaEFoca('[data-prop="' + pp[0] + '|' + pp[1] + '"]');
        return;
      }
      var gr = e.target.closest('[data-grupo]');
      if (gr) {
        var chave = gr.getAttribute('data-grupo');
        COLAPSO[chave] = !COLAPSO[chave];
        guardaColapso();
        repintaEFoca('[data-grupo="' + chave.replace(/"/g, '\\"') + '"]');
        return;
      }
      // T6.2 · o chip de contagem agora filtra de verdade
      var sit = e.target.closest('[data-sit]');
      if (sit) {
        var ps = sit.getAttribute('data-sit').split('|');
        var atualSit = FILTRO_SIT[ps[0]] || '';
        FILTRO_SIT[ps[0]] = (ps[1] && ps[1] !== atualSit) ? ps[1] : '';
        pinta();
        var volta = document.querySelector('[data-sit="' + ps[0] + '|' + ps[1] + '"]') ||
          document.querySelector('[data-sit^="' + ps[0] + '|"]');
        if (volta) volta.focus();
        return;
      }
      var aba = e.target.closest('[data-aba]');
      if (aba) {
        abaTrabalho = aba.getAttribute('data-aba');
        pinta();
        return;
      }
      // T6/E6 · abas do Histórico (próprias — `data-aba` é do Trabalho e não
      // pode ser reaproveitado: um clique aqui trocaria a aba de LÁ).
      var abah = e.target.closest('[data-abah]');
      if (abah) {
        abaHistorico = abah.getAttribute('data-abah');
        pinta();
        repintaFoca('[data-abah="' + abaHistorico + '"]');
        return;
      }
      // T6/E6 · filtro por agente e por tipo, sobre o que a busca já devolveu.
      // Clicar no chip ativo desliga o filtro — mesma mecânica de `data-sit`.
      var fh = e.target.closest('[data-fh]');
      if (fh) {
        // T6/E7 · ACHADO do review adversarial: este handler escrevia SEMPRE
        // em `FILTRO_H`, mas a seção Quadro de tarefas LÊ de `FILTRO_Q` — o
        // clique no chip de Épico/Status não filtrava nada, e ninguém via
        // erro nenhum. Um mapa explícito grupo → (objeto, chave) é o que
        // impede a próxima seção com filtro de cair no mesmo buraco: chip
        // com grupo desconhecido não escreve em lugar nenhum, de propósito.
        var DESTINO_F = {
          agente: [FILTRO_H, 'agente'],
          tipo: [FILTRO_H, 'tipo'],
          qepico: [FILTRO_Q, 'epico'],
          qstatus: [FILTRO_Q, 'status']
        };
        var pf = fh.getAttribute('data-fh').split('|');
        var destino = DESTINO_F[pf[0]];
        if (destino) {
          var alvoF = destino[0], chaveF = destino[1];
          var atualF = alvoF[chaveF] || '';
          alvoF[chaveF] = (pf[1] && pf[1] !== atualF) ? pf[1] : '';
          pinta();
          // Por VALOR, nunca por seletor concatenado: o valor é o título do
          // épico, conteúdo do dono — um título com aspas (`Épico "assim"`)
          // montava um seletor CSS inválido e lançava exceção (2º achado do
          // mesmo review). Comparar o atributo não tem essa superfície.
          repintaFocaAttr('data-fh', pf[0] + '|' + (alvoF[chaveF] || ''));
        }
        return;
      }
      // T6/E6 · o botão "Buscar". A busca vai ao SERVIDOR: não dispara a cada
      // tecla (seria uma consulta por letra), só no clique e no Enter.
      if (e.target.closest('#busca-hist-ir')) { fazBusca(buscaTermo); return; }
    });

    /** Devolve o foco a um controle depois da repintura, se ele sobreviveu. */
    function repintaFoca(sel) {
      var el = document.querySelector(sel);
      if (el) { try { el.focus(); } catch (err) { /* sumiu na repintura */ } }
    }

    /** O mesmo, mas comparando o VALOR do atributo — sem montar seletor por
     *  concatenação. Existe para valores que vêm do CONTEÚDO do dono (título
     *  de épico, nome de agente): aspas, colchetes e barras neles fariam
     *  `querySelector` lançar `is not a valid selector`. */
    function repintaFocaAttr(attr, valor) {
      var els = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < els.length; i++) {
        if (els[i].getAttribute(attr) === valor) {
          try { els[i].focus(); } catch (err) { /* sumiu na repintura */ }
          return;
        }
      }
    }

    // T6/E6 · Enter no campo da busca dispara a consulta; digitar não.
    $('#palco').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var alvo = e.target;
      if (!alvo || alvo.id !== 'busca-hist') return;
      e.preventDefault();
      fazBusca(alvo.value);
    });

    $('#palco').addEventListener('input', function (e) {
      var alvo = e.target;
      // T6/E6 · digitar só guarda o termo. Repintar a cada tecla mataria o
      // campo (ele é recriado a cada pintura) e buscar a cada tecla seria uma
      // consulta ao Postgres por letra — a busca é do Enter, não do teclado.
      if (alvo && alvo.id === 'busca-hist') { buscaTermo = alvo.value; return; }
      if (alvo && alvo.id === 'busca-dec') {
        buscaDecisoes = alvo.value;
        clearTimeout(ligaEventos._t);
        ligaEventos._t = setTimeout(function () {
          pinta();
          var c = document.getElementById('busca-dec');
          if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
        }, 220);
        return;
      }
      if (alvo && alvo.getAttribute && alvo.getAttribute('data-filtro')) {
        var id = alvo.getAttribute('data-filtro');
        FILTRO[id] = alvo.value;
        clearTimeout(ligaEventos._tf);
        ligaEventos._tf = setTimeout(function () {
          pinta();
          var c = document.querySelector('[data-filtro="' + id + '"]');
          if (c) { c.focus(); try { c.setSelectionRange(c.value.length, c.value.length); } catch (err) { /* type=search */ } }
        }, 220);
      }
    });

    // T6: o escritório dentro do iframe avisa qual agente foi clicado.
    // T11: a MESMA mensagem chega da janela externa, por `window.opener`.
    // Só aceito mensagem da MESMA origem — e o nome tem de casar o formato de pasta.
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin) return;
      var m = e.data;
      if (!m || m.type !== 'arvys:agente' || typeof m.nome !== 'string') return;
      if (!/^[a-z0-9-]{1,40}$/.test(m.nome)) return;
      location.hash = '#/agentes/' + encodeURIComponent(m.nome);
      // veio da janela de fora: a ficha abriu AQUI, então esta janela vem à frente
      if (liveViva() && e.source === janelaLive) { try { window.focus(); } catch (err) { /* o navegador decide */ } }
    });

    // T11: os três botões da seção Escritório (listener próprio, delegado).
    $('#palco').addEventListener('click', function (e) {
      var b = e.target.closest('[data-live]');
      if (!b) return;
      var acao = b.getAttribute('data-live');
      if (acao === 'abrir') abreLiveEmJanela();
      else if (acao === 'focar') focaLive();
      else if (acao === 'voltar') trazLiveDeVolta();
    });

    // T11: recarregar/fechar o QG não pode deixar um escritório órfão numa
    // segunda tela — o shell voltaria dizendo "fechado" com a janela aberta.
    window.addEventListener('beforeunload', function () {
      lembraMedidasLive();
      try { if (liveViva()) janelaLive.close(); } catch (err) { /* já foi */ }
    });

    // ---- T4a (Emenda 1) · os 2 acionamentos de ESCRITA do "Esperando você" -
    // (Adiar reaproveita `data-esp-adia` na MESMA delegação; Anotar-ABRIR usa
    // `data-grupo`, já coberto pela delegação principal lá em cima — só o
    // SALVAR da nota e o ENVIO do recado precisam de handler próprio, porque
    // os dois falam com o servidor.) Só existe no QG local: no SaaS os
    // botões que disparam isto não são desenhados (`soLocal`, critério 22).
    $('#palco').addEventListener('click', function (e) {
      var item = e.target.closest('[data-esp-item]');
      if (!item) return;
      var chave = item.getAttribute('data-esp-item');
      var it = ESP_MAPA[chave];

      if (e.target.closest('[data-esp-comeca]')) { if (it) espEnviaRecado(chave, item, it); return; }
      if (e.target.closest('[data-esp-salva-nota]')) { espSalvaNota(chave, item); return; }
      var adia = e.target.closest('[data-esp-adia]');
      if (adia) {
        alternaAdiarChave(chave, adia.getAttribute('data-esp-adia') || null);
        // Otimista, mesmo motivo de `espSalvaNota`/`espEnviaRecado`: `lembra()`
        // prefere o ARQUIVO (T2, "o arquivo ganha") sobre o `localStorage`, e o
        // arquivo só é atualizado quando o `enviaPref` (assíncrono) responder —
        // sem isto, a lista continuaria mostrando o item adiado até uma
        // repintura por outro motivo qualquer. `guarda()`, dentro de
        // `alternaAdiarChave`, já escreveu o mapa novo no localStorage de
        // forma síncrona — só preciso lê-lo de volta e adiantar o cache.
        var mapaFresco = {};
        try { mapaFresco = JSON.parse(localStorage.getItem('arvys.ordem.adiados') || '{}') || {}; } catch (err) { /* aba anonima */ }
        PREFS_ARQ = PREFS_ARQ || {}; PREFS_ARQ.ordem = PREFS_ARQ.ordem || {};
        PREFS_ARQ.ordem.adiados = mapaFresco;
        pinta();
        return;
      }
    });
  }

  /**
   * T4a (Emenda 1, critério 20) · "Começar com <agente>" — a ÚNICA escrita
   * nova desta tarefa que fala com um arquivo fora de preferências: manda um
   * RECADO (`POST /api/recado`, as 4 travas de sempre), nunca uma ordem — o
   * `/arvys:open` do agente é quem PERGUNTA o que fazer, na próxima sessão
   * (lei da onda 5.3, citada no mandato). O texto segue o formato do
   * mandato: "[QG · Esperando você] <verbo>: <txt> — origem: <sub>", com a
   * nota do dono anexada se existir.
   */
  function espEnviaRecado(chave, itemEl, it) {
    var sel = itemEl.querySelector('select[data-esp-ag="' + chave.replace(/"/g, '\\"') + '"]') || itemEl.querySelector('select[data-esp-ag]');
    var agenteDir = sel ? sel.value : '';
    var status = itemEl.querySelector('[data-esp-status]');
    if (!agenteDir) { if (status) status.textContent = 'escolha um agente antes de enviar.'; return; }
    var validos = ((DADOS && DADOS.agentes) || []).map(function (a) { return a.dir; });
    if (validos.indexOf(agenteDir) < 0) { if (status) status.textContent = 'agente desconhecido.'; return; }
    if (!PREFS_TOKEN) { if (status) status.textContent = 'sem servidor: recado indisponível.'; return; }

    var notaAtual = espNotaDe(chave);
    var texto = '[QG · Esperando você] ' + it.verbo + ': ' + textoCru(it.txt) + ' — origem: ' + textoCru(it.sub) +
      (notaAtual && notaAtual.texto ? ' — nota do dono: ' + textoCru(notaAtual.texto) : '');
    if (status) status.textContent = 'enviando…';

    fetch('/api/recado', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: PREFS_TOKEN, agent: agenteDir, texto: texto })
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        if (o.s === 200 && o.j && o.j.ok) {
          var callsign = agenteDir;
          ((DADOS && DADOS.agentes) || []).forEach(function (a) { if (a.dir === agenteDir && a.meta && a.meta.callsign) callsign = a.meta.callsign; });
          if (status) status.textContent = 'recado enviado ao ' + callsign + ' — ele pergunta o que fazer na próxima sessão.';
          // marca "recado enviado" (preferência) — some para a próxima pintura,
          // depois de um respiro para o dono ler a confirmação acima.
          var registro = Object.assign({}, notaAtual || {}, { recado: { agente: agenteDir, em: new Date().toISOString() } });
          enviaPref('notas', chave, registro);
          PREFS_ARQ = PREFS_ARQ || {}; PREFS_ARQ.notas = PREFS_ARQ.notas || {};
          PREFS_ARQ.notas[chave] = registro;
          setTimeout(function () { pinta(); }, 1600);
          return;
        }
        if (status) status.textContent = 'não consegui enviar: ' + ((o.j && (o.j.motivo || o.j.erro)) || o.s);
      }).catch(function (e) {
        if (status) status.textContent = 'não consegui enviar: ' + String(e && e.message);
      });
  }

  /**
   * T4a (Emenda 1, critério 21) · "Anotar" — nota curta do dono, gravada em
   * `company/PREFERENCIAS.json` (grupo `notas`, `POST /api/prefs`), NUNCA no
   * STATE.md/FILA.md. Otimista: a tela reflete antes da resposta do servidor
   * (o padrão de `guarda()`/`enviaPref` já avisa se o POST falhar).
   */
  function espSalvaNota(chave, itemEl) {
    var ta = itemEl.querySelector('textarea[data-esp-txt]');
    var texto = ta ? ta.value.trim() : '';
    if (!texto) return;
    var atual = espNotaDe(chave);
    var registro = Object.assign({}, atual || {}, { texto: texto, em: new Date().toISOString() });
    enviaPref('notas', chave, registro);
    PREFS_ARQ = PREFS_ARQ || {}; PREFS_ARQ.notas = PREFS_ARQ.notas || {};
    PREFS_ARQ.notas[chave] = registro;
    COLAPSO['esp:nota:' + chave] = false;   // fecha o editor depois de salvar
    guardaColapso();
    pinta();
  }

  // =========================================================================
  // 18. boot
  // =========================================================================

  function boot() {
    window.__arvysTemaLive = sincronizaTemaDoLive;   // chamado pelo onload do iframe
    ligaEventos();
    pintaMenu(rotaDoHash().secao);
    // T2: o arquivo de preferências é lido junto com o /api/qg. Ele ganha do
    // localStorage — mas nunca atrasa a primeira pintura: se demorar ou falhar,
    // a tela nasce com o cache e o aviso aparece.
    colapsoInicial();
    ligaMudanca();
    carregaPrefs().then(function () { if (DADOS) pinta(); });
    // T6: o sprite dos retratos vai em paralelo com o /api/qg. Se demorar ou
    // falhar, a tela nasce com os retratos de cor+emoji e se conserta sozinha
    // quando ele chegar — nada aqui bloqueia a primeira pintura.
    carregaSpriteAvatares();

    pegaJson('/api/qg').then(function (j) {
      DADOS = j;
      // T7.3/T7.4 · era "lendo de C:\...". Duas coisas erradas: informava
      // infraestrutura para quem quer garantia de privacidade (Echo), e dava a
      // SEGUNDA resposta para "onde isto está guardado" — o estranho achou esta
      // e a da gaveta, e não soube qual valia. Agora a frase explica a relação,
      // e o caminho fica como detalhe, dentro dela.
      $('#raiz').innerHTML = 'Este escritório vive nos seus arquivos — o QG só lê o que você já escreveu.' +
        '<br><span class="raiz-cam">Tudo que esta tela mostra sai de <code>' + esc(j.raiz || '?') + '</code>' +
        ', e cada item diz de qual arquivo veio.</span>';
      pintaCotaMini();
      pinta();
    }).catch(function (e) {
      ERRO_API = String(e && e.message || e);
      pinta();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
