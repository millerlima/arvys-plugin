/**
 * O texto do CLI — lido do MESMO dicionário do front (E1 · T6, S1.3).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * Até 2026-09-08 o CLI tinha **51 strings literais em PT-BR** espalhadas por
 * `arvys.mjs`, `lib/credencial.mjs` e `lib/lista-branca.mjs` — zero conexão com
 * o dicionário do produto. Era o risco R7 ("dois dicionários") não como
 * hipótese, mas como estado medido.
 *
 * A mecânica foi decidida na T2 do E1 e está escrita em `src/i18n/index.ts`:
 * *"o Next importa, o vanilla busca por `fetch`, e o CLI lê do disco. Uma
 * fonte, três leitores."* Este arquivo é o terceiro leitor.
 *
 * A FONTE NÃO MORA AQUI. Ela mora em `arvys-app/src/i18n/{pt-BR,en}.json`, que
 * é onde vivem os três sensores que já apanharam do reviewer: o tipo `Chave`
 * (chave errada vira erro de `tsc`), o `check:i18n` (5 classes de órfã) e o
 * `check:glossario` (R8, 36 termos congelados). Os arquivos em `../dict/` são
 * **cópia versionada**, levada até aqui pelo `sync-hub-app.mjs` do `arvys-app`
 * e conferida por SHA256 no `hub:check` — o mesmo trilho do QG, nunca um
 * segundo. **Não edite `../dict/*.json`:** edite a origem e rode `hub:sync`.
 *
 * ZERO-DEP, E OFFLINE
 * -------------------
 * `readFileSync` + `JSON.parse`, e nada mais. Nenhuma dependência nova, nenhum
 * transpiler, nenhum `fetch` — um dicionário buscado pela rede quebraria
 * `arvys --help` num avião, que é justamente onde alguém lê o `--help`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DICT = join(dirname(fileURLToPath(import.meta.url)), "..", "dict");

/** Os idiomas que o produto fala. Espelha `arvys-app/src/i18n/idiomas.ts`. */
export const IDIOMAS = ["pt-BR", "en"];

/**
 * O padrão quando não se sabe nada sobre quem chegou — `en`, porque o mercado
 * é internacional (decisão do PRD), não porque o inglês seja "neutro".
 */
export const IDIOMA_PADRAO = "en";

/**
 * A ORDEM DA RESOLUÇÃO — e ela é DIFERENTE no Windows, de propósito.
 *
 *   fora do win32:  ARVYS_IDIOMA > LC_ALL > LC_MESSAGES > LANG > Intl > en
 *   no win32:       ARVYS_IDIOMA > LC_ALL > LC_MESSAGES > Intl > LANG > en
 *
 * As variáveis são a convenção POSIX, da mais específica para a mais geral:
 * `ARVYS_IDIOMA` é o override explícito deste produto; `LC_ALL` manda em tudo;
 * `LC_MESSAGES` manda no texto; `LANG` é o padrão de todas as categorias.
 * `Intl.DateTimeFormat().resolvedOptions().locale` é built-in do Node
 * (zero-dep) e devolve o locale REAL do sistema operacional.
 *
 * POR QUE HÁ UM CAMINHO SÓ PARA WINDOWS (leia antes de "simplificar" isto)
 * -----------------------------------------------------------------------
 * Esta cadeia nasceu (T6 do E1, 2026-09-08) apoiada na frase *"no Windows não
 * existe `LANG`"* — e por isso o `Intl` foi posto DEPOIS dele. **A premissa é
 * falsa.** Git Bash, o terminal embutido das IDEs e os runners de CI
 * **injetam `LANG`** no ambiente do Windows (medido nesta máquina:
 * `LANG=en_US.UTF-8` presente tanto no Git Bash quanto no PowerShell, sem que
 * o dono jamais o tenha definido no registro). Quando isso acontece, o `Intl`
 * — que é justamente a guarda para o CLI falar a língua do dono — fica
 * **inalcançável**, e o CLI vira inglês na máquina de um dono que fala
 * português. Era a regressão vestida de feature que o comentário original
 * dizia estar evitando, acontecendo pela porta dos fundos.
 *
 * No Windows, portanto, `LANG` **não é um sinal de preferência**: é ruído de
 * ferramenta. Quem carrega a preferência real é o locale do sistema, que o
 * `Intl` lê. Fora do Windows nada muda: `LANG` é o mecanismo legítimo e
 * continua mandando, com o `Intl` como último recurso antes do padrão.
 *
 * `LC_ALL` e `LC_MESSAGES` seguem ACIMA do `Intl` nas duas plataformas: nada
 * as injeta sozinho no Windows, então quem as define está escolhendo. E o
 * dono que quer o CLI em inglês numa máquina em português continua com a
 * porta de sempre, no topo da cadeia: `ARVYS_IDIOMA=en`.
 *
 * `C` e `POSIX` não são idiomas: são o pedido explícito de "sem locale". Uma
 * variável com esse valor NÃO decide — a cadeia segue para a próxima, senão
 * um `LC_ALL=C` de script de build calaria a preferência real do dono.
 *
 * Já um candidato definido e legível DECIDE, mesmo que o idioma não exista
 * aqui: `LANG=de_DE` significa "esta máquina é alemã", e a resposta certa é o
 * padrão do produto (`en`), não continuar procurando português numa variável
 * mais fraca. Este é o mesmo "não chuta" que o `resolve.ts` aplica no front.
 *
 * `plataforma` é parâmetro (e não leitura direta de `process.platform` lá
 * dentro) para o sensor conseguir exercitar o ramo não-Windows **aqui**, no
 * Windows. Teste condicionado a rodar em Linux é teste que nunca roda.
 */
export function idiomaDoSistema(env = process.env, plataforma = process.platform) {
  const doSistema = intlLocale();
  const candidatos =
    plataforma === "win32"
      ? [env.ARVYS_IDIOMA, env.LC_ALL, env.LC_MESSAGES, doSistema, env.LANG]
      : [env.ARVYS_IDIOMA, env.LC_ALL, env.LC_MESSAGES, env.LANG, doSistema];

  for (const cru of candidatos) {
    if (typeof cru !== "string") continue;
    const v = cru.trim();
    if (!v) continue;
    // "sem locale" não é um locale: segue para a próxima fonte.
    if (v === "C" || v === "POSIX" || v.startsWith("C.") || v.startsWith("POSIX.")) continue;
    return normalizar(v);
  }
  return IDIOMA_PADRAO;
}

/** `Intl` é built-in, mas um Node compilado sem ICU pode não ter locale útil. */
function intlLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/**
 * `pt_BR.UTF-8`, `pt-br`, `pt`, `pt-PT` → `pt-BR`. Qualquer outra coisa → `en`.
 *
 * Só a subtag de idioma decide. `pt-PT` vira `pt-BR` porque é o português que
 * o produto tem — a mesma regra que o `resolve.ts` já aplica no front, e não
 * uma segunda política inventada aqui.
 */
function normalizar(valor) {
  const idioma = valor.split(/[.@]/)[0].replace(/_/g, "-").split("-")[0].toLowerCase();
  return idioma === "pt" ? "pt-BR" : IDIOMA_PADRAO;
}

/**
 * Lê um dicionário do disco.
 *
 * Dicionário ausente não pode DERRUBAR o CLI (`--help` tem de responder mesmo
 * numa instalação torta), mas também não pode sumir em silêncio — cair calado
 * no nome da chave é exatamente o defeito que o `check:i18n` existe para
 * impedir do outro lado. Então: avisa alto no stderr, uma vez, e segue.
 */
function ler(idioma) {
  const caminho = join(DICT, `${idioma}.json`);
  try {
    const cru = readFileSync(caminho, "utf8").replace(/^﻿/, "");
    const dado = JSON.parse(cru);
    if (!dado || typeof dado !== "object" || Array.isArray(dado)) throw new Error("nao e um objeto de chaves");
    return dado;
  } catch (e) {
    FALHAS.set(idioma, `${caminho}: ${e.message}`);
    console.error(
      `arvys: nao consegui ler o dicionario ${caminho} (${e.message}). ` +
        "As mensagens vao sair como nomes de chave. " +
        "Rode `npm run hub:sync` no repo arvys-app para reconstruir plugin/cli/dict/."
    );
    return {};
  }
}

const DICIONARIOS = {};

/**
 * Que dicionários NÃO abriram, e por quê.
 *
 * Existe porque um `catch` que só imprime deixa o resto do CLI cego: o
 * `sync enable` seguia até uma pergunta ilegível (`Digite
 * "cli.sync.palavraDeConfirmacao" para ligar o push`) em vez de recusar na
 * hora (R1-dict-corrompido-fail-closed, 2026-09-08). Quem decide algo caro
 * consulta este mapa ANTES de perguntar.
 */
const FALHAS = new Map();

/** Idiomas já avisados de que caíram no pt-BR — o aviso é 1 por idioma, não 1 por chave. */
const FALLBACK_AVISADO = new Set();

/** Força a carga e devolve o motivo da falha, ou `null` se o dicionário abriu. */
export function falhaDoDicionario(idioma = IDIOMA) {
  DICIONARIOS[idioma] ??= ler(idioma);
  DICIONARIOS["pt-BR"] ??= ler("pt-BR");
  return FALHAS.get(idioma) ?? FALHAS.get("pt-BR") ?? null;
}

/**
 * Resolve uma chave dizendo DE ONDE o texto veio.
 *
 * Duas regras que o `??` anterior não tinha:
 *
 * 1. **String vazia é ausência, não conteúdo.** `DICIONARIOS[i][k] ?? …` não
 *    cai no fallback diante de `""`. Com `cli.sync.palavraDeConfirmacao`
 *    valendo `""`, o opt-in do push abria com um Enter — o defeito mais caro
 *    possível neste produto (R1-fail-open-vazio, 2026-09-08).
 * 2. **`origem` sai junto.** Sem ela, quem chama não consegue distinguir
 *    "traduzido" de "caiu no português" de "nem existe" — e foi exatamente
 *    esse silêncio que deixou o fallback de idioma invisível.
 */
export function resolver(chave, idioma = IDIOMA) {
  DICIONARIOS[idioma] ??= ler(idioma);
  DICIONARIOS["pt-BR"] ??= ler("pt-BR");
  const doIdioma = DICIONARIOS[idioma][chave];
  if (typeof doIdioma === "string" && doIdioma.trim()) return { texto: doIdioma, origem: idioma };
  const doPt = DICIONARIOS["pt-BR"][chave];
  if (typeof doPt === "string" && doPt.trim()) return { texto: doPt, origem: "pt-BR" };
  return { texto: String(chave), origem: "chave" };
}

/** O idioma resolvido UMA VEZ por processo — reler o ambiente a cada frase daria saídas com dois idiomas. */
export const IDIOMA = idiomaDoSistema();

/**
 * Traduz. `vars` interpola `{nome}`.
 *
 * Mesma degradação do `t()` do front: chave sem verbete no idioma pedido cai
 * no português para a saída não quebrar. Quem garante que isso não acontece é
 * o `check:i18n`, no CI — aqui a rede de segurança existe para o comando
 * terminar, não para esconder a falta.
 */
export function t(chave, vars, idioma = IDIOMA) {
  const { texto: bruto, origem } = resolver(chave, idioma);
  // UMA vez por idioma, nunca por chave: um dicionário meio traduzido tem
  // dezenas de chaves faltando, e um aviso por chave viraria ruído que se
  // aprende a ignorar — que é como o fallback ficou invisível até agora.
  if (origem !== idioma && idioma !== "pt-BR" && !FALLBACK_AVISADO.has(idioma)) {
    FALLBACK_AVISADO.add(idioma);
    console.error(
      `arvys: falta traducao em ${idioma} (a primeira: ${chave}). ` +
        "Estas mensagens saem em pt-BR. " +
        "Rode `npm run check:i18n` no repo arvys-app para ver a lista inteira."
    );
  }
  if (!vars) return bruto;
  return String(bruto).replace(/\{(\w+)\}/g, (inteiro, nome) =>
    Object.prototype.hasOwnProperty.call(vars, nome) ? String(vars[nome]) : inteiro
  );
}

/** Um `t` preso a um idioma — o que o sensor usa para rodar a mesma bateria nos dois. */
export function traduzirCom(idioma) {
  return (chave, vars) => t(chave, vars, idioma);
}
