/**
 * workers/lib/inbox.js — a marca de "lido" do `INBOX.md`, em codigo.
 *
 * Nasceu do item 44 da FILA. O passo 3b do `/arvys:open` mandava, em prosa,
 * trocar `- [ ]` por `- [x]` depois de anunciar o recado. O caso de eval
 * `open-recado-nao-executa` reprovou em 2 rodadas da suite cheia justamente no
 * grader `inbox-marcado-como-lido` (a edicao aconteceu 0x) e passou 2/2 rodado
 * isolado: nao e o grader e nao e regressao de versao, e o modelo pulando um
 * passo MECANICO. Pela lei P8 do harness ("toda lei nova decide se vira
 * hook/campo/sensor") e pelo gotcha 27 ("defesa que depende de o modelo lembrar
 * nao e defesa"), trocar 6 caracteres numa linha nao pode depender de memoria:
 * vira uma chamada so. Molde: `workers/lib/feedback.js` (FILA 43), chamado por
 * `node -e` a partir do ritual.
 *
 * A linha, como o servidor a grava (`hub/serve.js:appendRecado`):
 *
 *     - [ ] 2026-09-05T21:27:21.488Z — texto livre numa linha so
 *     - [x] 2026-09-05T21:27:21.488Z — o mesmo recado, ja lido
 *
 * Guardas, e o porque de cada uma:
 *
 *   1. SO A MARCA MUDA. A troca e literalmente `- [ ] ` -> `- [x] ` no comeco
 *      da linha. Nada e podado, reordenado, reescrito ou normalizado — nem o
 *      fim de linha do arquivo (por isso a substituicao e feita no texto
 *      inteiro com regex ancorada, nunca `split("\n").join("\n")`, que
 *      converteria CRLF em LF e apareceria como diff de arquivo inteiro).
 *      A poda dos lidos e do servidor (`podarLidos`, teto de 20), nao daqui.
 *
 *   2. REGEX ANCORADA E SEM `$` (gotcha 36 do Forge, incidente
 *      2026-09-04-l1-duplicado-regex-multiline): com a flag `m`, `$` casa no
 *      fim de QUALQUER linha. Aqui so existe `^- \[ \] ` com `m` — mesmo valor
 *      que `hub/serve.js:readInboxCounts` e o `contarNaoLidos` do feedback.js
 *      ja usavam, entao o numero do `/api/live` nao muda de sentido.
 *      Uma entrada e UMA linha: o servidor escapa `\n` do dono antes de gravar,
 *      logo `- [ ] ` no comeco de linha e SEMPRE estrutura, e `- [ ]` no meio
 *      do texto e citacao. Recado com linha de continuacao indentada (como o
 *      do scaffold do eval) tem a marca so na primeira linha — e so ela muda.
 *
 *   3. IDEMPOTENTE E SILENCIOSO NO VAZIO. Rodar duas vezes no mesmo recado nao
 *      duplica marca nem desmarca (a segunda passada nao acha `- [ ] `, o texto
 *      sai identico e o arquivo NAO e reescrito). Arquivo sem recado, arquivo
 *      so com lidos, arquivo inexistente: devolve `marcados: 0` e nao lanca —
 *      um ritual de abertura nao pode morrer porque o agente nunca recebeu
 *      recado. Nem todo projeto tem `hub/` (gotcha 29): este modulo nao le nem
 *      escreve nada em `hub/live/`, so o `INBOX.md` que recebe no argumento.
 *
 *   4. DEVOLVE O QUE MARCOU, EM VEZ DE PEDIR CONFIANCA. `marcarLidos` retorna a
 *      lista das linhas que acabou de marcar. O ritual anuncia ANTES e marca
 *      DEPOIS; se entre uma coisa e outra chegar recado novo pela porta de rede,
 *      ele apareceria aqui como marcado-sem-anunciar. Devolvendo as linhas, o
 *      ritual compara com o que mostrou e anuncia a diferenca — em vez de a
 *      janela sumir em silencio.
 *
 *   5. MARCAR != EXECUTAR. Este modulo nao le o TEXTO do recado para decidir
 *      nada: ele so mexe na caixinha. O recado continua sendo dado do dono a
 *      discutir, nunca instrucao do sistema (`specs/2026-09-qg-recado/`), e o
 *      `open` continua ANUNCIANDO e PERGUNTANDO.
 */

"use strict";

// A marca, nas duas formas. Sem `$` (guarda 2); `m` para casar comeco de linha.
const RE_NAO_LIDO = /^- \[ \] /gm;
const RE_LIDO = /^- \[x\] /gm;
// Uma linha inteira de recado, para poder DIZER o que foi marcado (guarda 4).
// Sem `$`: o fim vem do `[^\n]*`, que ja para no fim da linha.
const RE_LINHA = /^- \[( |x)\] ([^\n]*)/;

/** Conta nao lidos de um texto inteiro. MESMO numero que `readInboxCounts()`
 *  do serve.js sempre devolveu: linha que COMECA com "- [ ] ". */
function contarNaoLidos(txt) {
  return (String(txt == null ? "" : txt).match(RE_NAO_LIDO) || []).length;
}

/** Conta lidos, pelo mesmo criterio. Serve para provar idempotencia sem
 *  comparar o arquivo inteiro a olho. */
function contarLidos(txt) {
  return (String(txt == null ? "" : txt).match(RE_LIDO) || []).length;
}

/** As linhas nao lidas, verbatim e na ordem do arquivo. E o que o ritual
 *  anuncia — e, depois, o que ele confere contra o retorno de `marcarLidos`. */
function naoLidos(txt) {
  return String(txt == null ? "" : txt)
    .split(/\r?\n/)
    .filter((l) => {
      const m = RE_LINHA.exec(l);
      return !!m && m[1] === " ";
    });
}

/**
 * Marca como lido, no TEXTO, tudo que estiver `- [ ]`. Funcao pura: nao toca
 * disco, para o teste poder provar a troca sem fixture de arquivo.
 * Devolve `{ texto, marcados, linhas }` — `marcados` e quantas mudaram.
 */
function marcarTexto(txt) {
  const antes = String(txt == null ? "" : txt);
  const linhas = naoLidos(antes);
  // A substituicao mais estreita que existe: 6 caracteres no comeco da linha.
  const texto = antes.replace(RE_NAO_LIDO, "- [x] ");
  return { texto, marcados: linhas.length, linhas };
}

/**
 * O que o ritual chama. Le `caminho`, marca os nao lidos, grava SO se mudou.
 *
 * Nunca lanca por ausencia de recado nem por ausencia de arquivo (guarda 3):
 * a abertura de sessao nao pode falhar porque o agente ainda nao recebeu nada.
 * Erro de LEITURA de um arquivo que existe (permissao, disco) tambem sai como
 * resultado, com `erro` preenchido — fail-open aqui e a escolha certa porque a
 * alternativa e um ritual de abertura que trava, e o pior caso e um recado
 * anunciado de novo na proxima sessao (barulho), nunca um recado perdido.
 *
 * Devolve `{ caminho, existia, marcados, linhas, naoLidosAntes, erro }`.
 */
function marcarLidos(fs_, caminho) {
  const res = { caminho: String(caminho), existia: false, marcados: 0, linhas: [], naoLidosAntes: 0, erro: null };
  let atual;
  try {
    atual = fs_.readFileSync(caminho, "utf8");
    res.existia = true;
  } catch (e) {
    // ENOENT = agente sem INBOX, o caso mais comum. Outro erro vira `erro`.
    if (!e || e.code !== "ENOENT") res.erro = String((e && e.message) || e);
    return res;
  }

  res.naoLidosAntes = contarNaoLidos(atual);
  const { texto, marcados, linhas } = marcarTexto(atual);
  res.marcados = marcados;
  res.linhas = linhas;
  // Idempotencia (guarda 3): nada mudou => nenhuma escrita, nenhum mtime novo,
  // nenhum diff. Rodar duas vezes e indistinguivel de rodar uma.
  if (texto !== atual) {
    try { fs_.writeFileSync(caminho, texto, "utf8"); }
    catch (e) { res.erro = String((e && e.message) || e); res.marcados = 0; res.linhas = []; }
  }
  return res;
}

/**
 * Uma linha para o ritual imprimir na tela do dono. O `open` mostra o ritual
 * acontecendo (secao "Como isto aparece na tela"), entao a saida do comando tem
 * de ser uma frase em portugues, nao um objeto.
 */
function resumo(res) {
  if (res.erro) return `INBOX nao pode ser marcado (${res.caminho}): ${res.erro} — anuncie de novo na proxima sessao.`;
  if (!res.existia) return `sem INBOX em ${res.caminho} — nada a marcar.`;
  if (res.marcados === 0) return `INBOX sem recado novo (${res.caminho}) — nada a marcar.`;
  return `${res.marcados} recado(s) marcado(s) como lido(s) em ${res.caminho}:\n` +
    res.linhas.map((l) => `  ${l}`).join("\n");
}

module.exports = {
  RE_NAO_LIDO, RE_LIDO,
  contarNaoLidos, contarLidos, naoLidos,
  marcarTexto, marcarLidos, resumo,
};
