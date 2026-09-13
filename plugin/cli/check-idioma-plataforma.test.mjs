#!/usr/bin/env node
/**
 * O sensor da PRECEDENCIA DE IDIOMA por plataforma (divida do `[L1]` do Forge).
 *
 * O QUE ELE MEDE, E POR QUE ASSIM
 * -------------------------------
 * Ele nao le codigo nem conta palavras em portugues: ele **roda o CLI de
 * verdade** (`arvys --help`, que e a superficie 100% vinda do dicionario e nao
 * toca disco, rede nem credencial) num processo filho, com o ambiente e a
 * plataforma controlados, e compara a saida com o VERBETE do dicionario.
 *
 * Cada caso e conferido NAS DUAS LINGUAS: o verbete do idioma esperado tem de
 * APARECER e o verbete da outra lingua tem de ESTAR AUSENTE. Isso e resposta
 * direta a armadilha medida na T6 — um sensor que procurava `/enfileirad/i`
 * passava verde em ingles (`push queued`) com o segredo a caminho da nuvem.
 * Sensor de idioma escrito numa lingua so e cego na outra.
 *
 * COMO A PLATAFORMA E SIMULADA
 * ----------------------------
 * Por `--import` de um preload minusculo que redefine `process.platform` (e,
 * onde o caso pede, o locale que o `Intl` devolve) ANTES de o CLI carregar.
 * Nenhuma variavel de configuracao nova entrou no produto para isto: o produto
 * le `process.platform` direto, como sempre leu. Assim o caso "fora do win32"
 * roda AQUI, no Windows, em vez de ficar condicionado a existir uma maquina
 * Linux — condicionar seria o gotcha 23 (verde por nao ter rodado).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "arvys.mjs");

const DICT = {
  "pt-BR": JSON.parse(readFileSync(join(AQUI, "dict", "pt-BR.json"), "utf8")),
  en: JSON.parse(readFileSync(join(AQUI, "dict", "en.json"), "utf8")),
};

/** As 3 frases-ancora: uma com acento, uma sem, e o titulo. Todas so vem do dicionario. */
const ANCORAS = ["cli.ajuda.titulo", "cli.ajuda.whoami", "cli.ajuda.login"];

const TMP = mkdtempSync(join(tmpdir(), "arvys-idioma-"));

/** Preload que finge uma plataforma e, opcionalmente, um locale de sistema. */
function preload(nome, { plataforma, locale }) {
  const linhas = [];
  if (plataforma) {
    linhas.push(`Object.defineProperty(process, "platform", { value: ${JSON.stringify(plataforma)} });`);
  }
  if (locale) {
    linhas.push(
      `const _DTF = Intl.DateTimeFormat;`,
      `Intl.DateTimeFormat = function (...a) {`,
      `  const f = new _DTF(...a);`,
      `  const ro = f.resolvedOptions.bind(f);`,
      `  f.resolvedOptions = () => Object.assign(ro(), { locale: ${JSON.stringify(locale)} });`,
      `  return f;`,
      `};`
    );
  }
  const caminho = join(TMP, `${nome}.mjs`);
  const corpo = linhas.join("\n") + "\n";
  writeFileSync(caminho, corpo, "utf8");
  // Gotcha 47: prova que o byte chegou ao disco, em vez de confiar na escrita.
  const lido = readFileSync(caminho, "utf8");
  if (lido !== corpo) throw new Error(`preload ${caminho} nao bateu byte a byte com o que foi escrito`);
  return pathToFileURL(caminho).href;
}

/** Roda o CLI de verdade, com o ambiente zerado das 4 variaveis de locale. */
function rodarCli({ env = {}, plataforma, locale }) {
  const base = { ...process.env };
  for (const k of ["ARVYS_IDIOMA", "LC_ALL", "LC_MESSAGES", "LANG"]) delete base[k];

  const args = [];
  if (plataforma || locale) {
    const nome = `preload-${plataforma ?? "nativo"}-${(locale ?? "nativo").replace(/[^a-z0-9]/gi, "")}`;
    args.push("--import", preload(nome, { plataforma, locale }));
  }
  args.push(CLI, "--help");

  const r = spawnSync(process.execPath, args, { env: { ...base, ...env }, encoding: "utf8" });
  return { saida: r.stdout ?? "", erro: r.stderr ?? "", code: r.status };
}

let ok = 0;
const falhas = [];

function caso(titulo, cenario, esperado) {
  const outro = esperado === "pt-BR" ? "en" : "pt-BR";
  const { saida, code } = rodarCli(cenario);

  if (code !== 0) {
    falhas.push(`${titulo}: o CLI saiu com codigo ${code} (esperado 0)`);
    return;
  }
  for (const chave of ANCORAS) {
    const doEsperado = DICT[esperado][chave];
    const doOutro = DICT[outro][chave];
    if (!saida.includes(doEsperado)) {
      falhas.push(`${titulo}: faltou o verbete ${esperado} de ${chave} -> ${JSON.stringify(doEsperado)}`);
    } else ok++;
    if (saida.includes(doOutro)) {
      falhas.push(`${titulo}: a saida trouxe o verbete ${outro} de ${chave} -> ${JSON.stringify(doOutro)}`);
    } else ok++;
  }
}

// ---------------------------------------------------------------- win32 ----
// 1. O DEFEITO: Git Bash / terminal de IDE / CI injetam LANG no Windows, e o
//    Intl (a guarda do idioma do dono) ficava inalcancavel.
caso(
  "win32 · LANG=en_US.UTF-8 com Intl pt-BR",
  { plataforma: "win32", locale: "pt-BR", env: { LANG: "en_US.UTF-8" } },
  "pt-BR"
);

// 2. O SENTIDO INVERSO: quem QUER ingles continua recebendo ingles. A porta e
//    o override explicito do produto, que segue no topo da cadeia.
caso(
  "win32 · ARVYS_IDIOMA=en manda mesmo com Intl pt-BR",
  { plataforma: "win32", locale: "pt-BR", env: { ARVYS_IDIOMA: "en", LANG: "pt_BR.UTF-8" } },
  "en"
);

// 3. LC_ALL e escolha deliberada (nada o injeta no Windows) e continua acima
//    do Intl — o conserto move o LANG, nao a cadeia inteira.
caso(
  "win32 · LC_ALL=en_US.UTF-8 vence o Intl pt-BR",
  { plataforma: "win32", locale: "pt-BR", env: { LC_ALL: "en_US.UTF-8" } },
  "en"
);

// 4. LANG ausente — o cenario que a premissa original imaginava. Nada muda.
caso("win32 · sem LANG, Intl pt-BR", { plataforma: "win32", locale: "pt-BR" }, "pt-BR");

// 5. O Intl e confiavel NAS DUAS DIRECOES: Windows em ingles, CLI em ingles.
caso("win32 · sem LANG, Intl en-US", { plataforma: "win32", locale: "en-US" }, "en");

// 6. A consequencia declarada do conserto: no Windows o LANG deixa de decidir
//    tambem quando ele diz pt. Quem quer forcar usa ARVYS_IDIOMA (caso 2).
caso(
  "win32 · LANG=pt_BR.UTF-8 nao vence o Intl en-US",
  { plataforma: "win32", locale: "en-US", env: { LANG: "pt_BR.UTF-8" } },
  "en"
);

// ------------------------------------------------------------ nao-win32 ----
// 7 e 8. Fora do win32 o LANG e o mecanismo legitimo e continua mandando —
// provado nas DUAS direcoes, contra um Intl que discorda.
caso(
  "linux · LANG=en_US.UTF-8 vence o Intl pt-BR",
  { plataforma: "linux", locale: "pt-BR", env: { LANG: "en_US.UTF-8" } },
  "en"
);
caso(
  "linux · LANG=pt_BR.UTF-8 vence o Intl en-US",
  { plataforma: "linux", locale: "en-US", env: { LANG: "pt_BR.UTF-8" } },
  "pt-BR"
);

// 9. Fora do win32 sem LANG, o Intl segue como ultima fonte antes do padrao.
caso("linux · sem LANG, Intl pt-BR", { plataforma: "linux", locale: "pt-BR" }, "pt-BR");

// -------------------------------------------------------------------------
if (falhas.length) {
  console.error(`VERMELHO — ${ok} ok, ${falhas.length} falhou`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`VERDE — ${ok} ok, 0 falhou (9 casos, cada um conferido nas duas linguas)`);
