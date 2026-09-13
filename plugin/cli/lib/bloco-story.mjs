import { createHash } from "node:crypto";

/**
 * E8 · T1 — lê e escreve o bloco `<!--arvys ... -->` de UMA story, do lado
 * do CLI (no disco do dono).
 *
 * ESPELHA `arvys-app/src/server/projection/parse-tasks.ts` (`extrairBloco`),
 * SEM importar aquele arquivo — o CLI é publicado fora deste monorepo e não
 * pode arrastar o Next junto (`plan.md` da spec `2026-09-saas-e8-escrita`
 * explica o motivo por extenso). Os dois lados são cobrados a concordar
 * byte a byte pelo sensor `check:sync-cas`, nunca por import.
 *
 * A regra que este arquivo protege (genesis `04-arquitetura.md` §2.2):
 * **compare-and-swap por BLOCO, nunca por arquivo inteiro.** Toda escrita
 * aqui troca o mínimo possível — uma linha de campo, ou um byte de marca de
 * task — e devolve o hash de ANTES e de DEPOIS para quem chama decidir se
 * bate com o que o servidor esperava.
 */

const RE_HEADING = /^##[ \t]+.*$/gm;
const RE_ARVYS_BLOCO = /<!--\s*arvys\b([\s\S]*?)-->/i;
const RE_TASK_LINE = /^([ \t]*-[ \t]+\[)([x~ ])(\][ \t]*)(.*)$/i;
// Mesmo padrão de `RE_IDENTIFICADOR` do servidor (parse-tasks.ts) — usado só
// para achar o id PADRÃO de uma story sem bloco ainda (S8.5), nunca para
// decidir se algo é story (isso é achado pela presença do bloco em si aqui).
const RE_CODIGO_HEADING = /^(T\d+[a-z]?(?:\.\d+)?)\b/i;

/** Normalização do bloco — LF, sem espaço à direita — o MESMO contrato do
 *  schema ("sha256 do bloco normalizado"), para o hash nunca variar por
 *  CRLF ou espaço sobrando. */
export function hashBloco(blocoTexto) {
  const normalizado = String(blocoTexto)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n");
  return createHash("sha256").update(normalizado, "utf8").digest("hex");
}

/** `texto.trim().replace(/\s+/g,' ')` + sha1 — o MESMO `shaLinha` do
 *  servidor, para uma task marcada `[x]` pelo celular casar com o
 *  `lineHash` que a projeção de leitura já calculou. */
export function hashLinhaTask(texto) {
  const normalizado = String(texto).trim().replace(/\s+/g, " ");
  return createHash("sha1").update(normalizado, "utf8").digest("hex");
}

/** `chave: valor` por linha, dentro do comentário — comentário `#` solto na
 *  linha é descartado, igual ao servidor. Nunca lança: linha que não casa
 *  o padrão é ignorada, não é erro. */
export function lerCampos(conteudoDoComentario) {
  const campos = {};
  for (const linhaBruta of String(conteudoDoComentario).split("\n")) {
    const linha = linhaBruta.split("#")[0];
    const kv = linha.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (kv) campos[kv[1].toLowerCase()] = kv[2];
  }
  return campos;
}

/**
 * Achado do review adversarial do E8 (2026-09-11): um exemplo de
 * documentação dentro de um bloco cercado (` ``` `) mostrando "como o
 * bloco `<!--arvys-->` fica" era lido como o bloco REAL da story — a
 * regex não distinguia "dentro de cerca" de "fora". Aqui, todo trecho
 * cercado vira espaço (preservando `\n` e o TAMANHO exato — os índices
 * continuam válidos no texto ORIGINAL) antes de qualquer busca estrutural
 * (heading, bloco `<!--arvys-->`, linha de task). A ESCRITA sempre usa o
 * texto original, nunca o mascarado — a máscara é só para achar onde.
 */
function mascararFences(texto) {
  return texto.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Os headings `## ...` do arquivo, com o corpo de cada um por ÍNDICE
 *  ABSOLUTO na string original — é o que permite trocar só o bloco de UMA
 *  story sem tocar em mais nada do arquivo. Headings dentro de cerca de
 *  código não contam (mascarados antes de procurar). */
function corposPorHeading(texto) {
  const mascarado = mascararFences(texto);
  const headings = [...mascarado.matchAll(RE_HEADING)];
  return headings.map((h, i) => {
    const corpoInicio = h.index + h[0].length;
    const corpoFim = i + 1 < headings.length ? headings[i + 1].index : texto.length;
    return { headingTexto: texto.slice(h.index, corpoInicio), headingInicio: h.index, corpoInicio, corpoFim };
  });
}

/**
 * Acha o bloco `<!--arvys-->` da story com este `id`, varrendo TODOS os
 * headings do arquivo (nunca para no primeiro achado — achado do review:
 * um `id` duplicado entre duas stories fazia a escrita ir, em silêncio,
 * para a PRIMEIRA, deixando a segunda órfã sem erro nenhum e sem
 * CONFLICT). Mais de uma ocorrência do mesmo `id` → `{ erro:
 * "id-duplicado" }`, nunca escolhe uma. Nenhuma ocorrência → `null`
 * (mesma regra do servidor: malformado/ausente vira "sem bloco").
 */
export function acharBlocoDaStory(texto, storyId) {
  const mascarado = mascararFences(texto);
  const ocorrencias = [];
  for (const h of corposPorHeading(texto)) {
    const corpoMascarado = mascarado.slice(h.corpoInicio, h.corpoFim);
    const m = corpoMascarado.match(RE_ARVYS_BLOCO);
    if (!m) continue;
    const campos = lerCampos(m[1]);
    if (campos.id !== storyId) continue;
    const inicio = h.corpoInicio + m.index;
    ocorrencias.push({
      inicio, fim: inicio + m[0].length, blocoTexto: texto.slice(inicio, inicio + m[0].length), campos,
      headingInicio: h.headingInicio, corpoInicio: h.corpoInicio, corpoFim: h.corpoFim,
    });
  }
  if (ocorrencias.length > 1) return { erro: "id-duplicado", quantos: ocorrencias.length };
  return ocorrencias[0] || null;
}

/** Troca a linha `chave: ...` dentro do texto do bloco — só essa linha.
 *  Campo ausente entra antes do `-->` de fechamento. Nunca mexe em mais
 *  nada do bloco (comentários soltos, ordem dos outros campos). */
function trocaLinhaCampo(blocoTexto, chave, valorNovo) {
  const reLinha = new RegExp("(^[ \\t]*" + chave + "[ \\t]*:).*$", "im");
  if (reLinha.test(blocoTexto)) return blocoTexto.replace(reLinha, "$1 " + valorNovo);
  return blocoTexto.replace(/-->\s*$/, chave + ": " + valorNovo + "\n-->");
}

/**
 * Troca UM campo do bloco de UMA story — `status`, por exemplo — e devolve
 * o texto do arquivo inteiro com só essa troca, mais os hashes de antes e
 * depois (o CAS: quem chama compara `hashAntigo` com o `baseHash` da op
 * ANTES de aceitar `textoNovo`).
 *
 * `rev` sobe sempre que um CAMPO muda (o campo é do bloco). Task marcada
 * `[x]`/`[~]` é outra função (`alternarTask`) e, por decisão do genesis
 * (§2.3: "troca um byte"), NÃO mexe em `rev` — o diff fica no tamanho
 * exato da mudança.
 */
export function escreverCampoDaStory(textoTasksMd, storyId, campo, valorNovo, opts = {}) {
  const agora = opts.agora || (() => new Date().toISOString());
  const alvo = acharBlocoDaStory(textoTasksMd, storyId);
  if (!alvo) return { ok: false, motivo: "story-sem-bloco" };
  if (alvo.erro) return { ok: false, motivo: alvo.erro };

  const hashAntigo = hashBloco(alvo.blocoTexto);
  const revAtual = Number(alvo.campos.rev || 0);
  let blocoNovo = trocaLinhaCampo(alvo.blocoTexto, campo, valorNovo);
  blocoNovo = trocaLinhaCampo(blocoNovo, "rev", String(revAtual + 1));
  blocoNovo = trocaLinhaCampo(blocoNovo, "atualizado", agora());
  const hashNovo = hashBloco(blocoNovo);

  const textoNovo = textoTasksMd.slice(0, alvo.inicio) + blocoNovo + textoTasksMd.slice(alvo.fim);
  return { ok: true, textoNovo, hashAntigo, hashNovo, revNovo: revAtual + 1 };
}

/**
 * Marca/desmarca UMA task pelo `lineHash` dela — a mesma identidade que a
 * projeção de leitura já usa (`Task.lineHash`, servidor). Troca só o
 * caractere da marca (` `/`~`/`x`); o texto da linha nunca é tocado.
 */
export function alternarTask(textoTasksMd, storyId, lineHash, novoMark) {
  const alvo = acharBlocoDaStory(textoTasksMd, storyId);
  if (!alvo) return { ok: false, motivo: "story-sem-bloco" };
  if (alvo.erro) return { ok: false, motivo: alvo.erro };

  // Mascarado só para ACHAR a linha (nunca casa dentro de cerca de código —
  // achado do review) — a escrita usa sempre as linhas ORIGINAIS.
  const corpoOriginal = textoTasksMd.slice(alvo.corpoInicio, alvo.corpoFim);
  const linhasOriginais = corpoOriginal.split("\n");
  const linhasMascaradas = mascararFences(corpoOriginal).split("\n");

  // Achado do review: duas tasks com o MESMO texto normalizado colidem no
  // mesmo `lineHash` — marcar a 1ª quando o dono marcou a 2ª é escrita
  // silenciosa na linha errada. Varre TODAS antes de decidir, nunca para
  // na primeira.
  const indices = [];
  for (let i = 0; i < linhasMascaradas.length; i++) {
    const m = linhasMascaradas[i].match(RE_TASK_LINE);
    if (!m) continue;
    if (hashLinhaTask(m[4]) === lineHash) indices.push(i);
  }
  if (indices.length > 1) return { ok: false, motivo: "task-ambigua", quantas: indices.length };
  if (indices.length === 0) return { ok: false, motivo: "task-nao-encontrada" };

  const i = indices[0];
  const m = linhasOriginais[i].match(RE_TASK_LINE);
  const marcaAntiga = m[2];
  linhasOriginais[i] = m[1] + novoMark + m[3] + m[4];
  const corpoNovo = linhasOriginais.join("\n");
  const textoNovo = textoTasksMd.slice(0, alvo.corpoInicio) + corpoNovo + textoTasksMd.slice(alvo.corpoFim);
  return { ok: true, textoNovo, marcaAntiga, marcaNova: novoMark };
}

/**
 * S8.5 — `id` padrão para uma story sem bloco: o código `Tn` do heading, em
 * minúsculas (`## T7 — título` → `t7`), a MESMA convenção do exemplo do
 * genesis (`04-arquitetura.md:249`). Heading sem código reconhecível (a
 * convenção livre do E1) ganha um id gerado — nunca fica sem id.
 */
function idPadraoDoHeading(headingTexto, geradorFallback) {
  const semMarcador = headingTexto.replace(/^##[ \t]+/, "").trim();
  const m = semMarcador.match(RE_CODIGO_HEADING);
  if (m) return m[1].toLowerCase();
  return geradorFallback();
}

/**
 * Insere um bloco `<!--arvys-->` novo logo abaixo do heading de UMA story
 * que ainda não tem — `rev: 0`, sem tocar em nenhuma letra do texto
 * visível (título ou tasks). É a primitiva que `arvys tasks migrate` (T7)
 * chama para cada heading sem bloco.
 */
export function inserirBlocoNovo(textoTasksMd, headingInicio, opts = {}) {
  const agora = opts.agora || (() => new Date().toISOString());
  const gerarId = opts.gerarId || (() => "s" + Math.random().toString(36).slice(2, 10));

  const fimDaLinhaDoHeading = textoTasksMd.indexOf("\n", headingInicio);
  const corte = fimDaLinhaDoHeading === -1 ? textoTasksMd.length : fimDaLinhaDoHeading + 1;
  const headingTexto = textoTasksMd.slice(headingInicio, corte).trimEnd();
  const id = idPadraoDoHeading(headingTexto, gerarId);

  // FILA 81: sem `status:` de propósito — `extrairBloco()` (parse-tasks.ts)
  // nunca lê este campo, e nada mais no CLI o lê de volta; o status real
  // vem da marca da task e da prosa. `arvys sync` grava `status:` quando um
  // move real acontece (mirror legível para o dono no arquivo), mas um
  // bloco recém-criado não tem status para espelhar.
  const bloco = "<!--arvys\nid: " + id + "\nrev: 0\natualizado: " + agora() + "\n-->\n";
  const textoNovo = textoTasksMd.slice(0, corte) + bloco + textoTasksMd.slice(corte);
  return { textoNovo, id };
}

/** Todos os headings sem bloco `<!--arvys-->` — a lista que `arvys tasks
 *  migrate` percorre. Índice ABSOLUTO de cada heading (para inserir na
 *  ordem certa, de trás para frente — ver `inserirBlocosFaltantes`). */
export function headingsSemBloco(texto) {
  const mascarado = mascararFences(texto);
  return corposPorHeading(texto).filter((h) => {
    const corpoMascarado = mascarado.slice(h.corpoInicio, h.corpoFim);
    return !RE_ARVYS_BLOCO.test(corpoMascarado);
  });
}

/** `arvys tasks migrate`, de ponta a ponta sobre um texto já lido: insere
 *  bloco em TODOS os headings que faltam, de trás para frente (para os
 *  índices dos anteriores não se moverem a cada inserção). */
export function inserirBlocosFaltantes(textoTasksMd, opts = {}) {
  const faltando = headingsSemBloco(textoTasksMd);
  let texto = textoTasksMd;
  const idsGerados = [];
  for (let i = faltando.length - 1; i >= 0; i--) {
    const r = inserirBlocoNovo(texto, faltando[i].headingInicio, opts);
    texto = r.textoNovo;
    idsGerados.unshift(r.id);
  }
  return { textoNovo: texto, idsGerados, quantos: faltando.length };
}
