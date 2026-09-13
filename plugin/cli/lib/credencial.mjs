import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { t } from "./texto.mjs";

/**
 * A credencial da máquina — `~/.arvys/credentials`, **fora do repo** (§4.5).
 *
 * Fora do repo não é detalhe de organização: é o que impede o token de virar
 * commit acidental. O risco A3 lista "commit acidental, backup, máquina
 * compartilhada" como o caminho de vazamento, e o primeiro se fecha por
 * geografia — o arquivo não está onde o `git add .` alcança.
 *
 * `ARVYS_HOME` (opcional) troca a raiz, no mesmo espírito do `HEALTH_ROOT` do
 * `workers/health.js`: o sensor exercita tudo sem encostar no `~/.arvys` real
 * de quem está rodando.
 */

export function pastaDoArvys() {
  return process.env.ARVYS_HOME || join(homedir(), ".arvys");
}

export function caminhoDaCredencial() {
  return join(pastaDoArvys(), "credentials");
}

/**
 * SIDs largas e conhecidas que costumam sobreviver ao `/grant:r` porque
 * pertencem a um trustee DIFERENTE do que acabou de ser concedido — Everyone,
 * Authenticated Users, o grupo Users. Removidas por SID, nunca por nome
 * localizado: a máquina é Windows PT-BR, onde "Everyone" se chama "Todos", e
 * comparar por nome localizado é frágil por construção (T9/R6).
 */
const SIDS_AMPLAS_CONHECIDAS = [
  "*S-1-1-0", // Everyone / Todos
  "*S-1-5-11", // Authenticated Users / Usuários autenticados
  "*S-1-5-32-545", // BUILTIN\Users / Usuários
];

/** Lê a ACL/permissão atual — é o que o sensor confere, e não a intenção. */
export function lerPermissao(caminho) {
  if (process.platform !== "win32") return null;
  try {
    return execFileSync("icacls", [caminho], { encoding: "utf8", stdio: "pipe" });
  } catch {
    return null;
  }
}

/**
 * Extrai os trustees (um por ACE) da saída literal do `icacls`.
 *
 * A 1ª linha vem colada ao caminho (`<caminho> <trustee>:(<perms>)`); as
 * seguintes vêm indentadas, uma ACE por linha. Não separa por espaço — nomes
 * de trustee legítimos têm espaço (`NT AUTHORITY\Usuários autenticados`) — em
 * vez disso descasca o prefixo conhecido (o próprio `caminho`).
 */
function trusteesDaAcl(textoAcl, caminho) {
  if (!textoAcl) return null;
  const trustees = [];
  for (let linha of textoAcl.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    if (/^Successfully processed|^Failed processing/i.test(linha.trim())) continue;
    if (linha.startsWith(caminho)) linha = linha.slice(caminho.length);
    linha = linha.trim();
    const m = /^(.+?):((?:\([A-Za-z,]*\))+)$/.exec(linha);
    if (m) trustees.push(m[1].trim());
  }
  return trustees;
}

/**
 * O ponto inteiro do R6: não confiar na palavra do `icacls`, LER a ACL
 * resultante e comparar com a única coisa esperada — o dono, e mais ninguém.
 * `/inheritance:r` tira só ACEs herdadas; `/grant:r` só troca os direitos do
 * trustee informado. Uma concessão explícita pré-existente para outro
 * principal sobrevive intacta, e "o comando rodou sem erro" mentiria.
 */
function verificarAclExclusiva(caminho, usuarioEsperado) {
  const texto = lerPermissao(caminho);
  const trustees = trusteesDaAcl(texto, caminho);
  if (trustees === null) {
    return { exclusiva: false, sobrando: [t("cli.credencial.aclIlegivel")] };
  }
  const sobrando = trustees.filter((t) => t.toLowerCase() !== usuarioEsperado.toLowerCase());
  return { exclusiva: sobrando.length === 0, sobrando };
}

/**
 * Restringe a permissão de um arquivo OU pasta ao usuário atual.
 *
 * **No Windows isso é ACL, não modo octal.** `chmodSync(600)` não falha e não
 * faz nada de útil ali — o arquivo continua legível por outros usuários da
 * máquina, e ninguém percebe porque nenhum erro aparece. Por isso aqui há um
 * caminho por sistema, e a função **devolve o que conseguiu** em vez de dizer
 * "ok" por omissão: quem chama tem obrigação de contar ao dono se falhou.
 *
 * No Windows a palavra do `icacls` não basta: depois de rodar o comando, a
 * ACL resultante é LIDA e comparada contra "só o dono" — é essa leitura, não
 * o código de saída do comando, que decide `restringiu`.
 *
 * @returns {{restringiu: boolean, como: string, erro?: string}}
 */
/**
 * O modo POSIX certo para cada tipo — e por que ele NÃO é o mesmo para os dois.
 *
 * Em POSIX, o bit de execução tem significado diferente em pasta: ele não
 * quer dizer "executável", quer dizer **atravessável**. Sem `x`, ninguém entra
 * na pasta — nem o próprio dono — e portanto ninguém cria nem abre arquivo
 * dentro dela.
 *
 * `gravar()` restringe a PASTA antes de os arquivos nascerem (é o que faz a
 * credencial já nascer protegida no Windows). Com `0600` na pasta, o passo
 * seguinte — escrever o `.gitignore` e a credencial — batia em
 * `EACCES: permission denied`. Ou seja: **`arvys login` não funcionava em Linux
 * nem em macOS**, e no Windows funcionava porque lá isto é ACL e o modo octal
 * é decorativo.
 *
 * Achado em 2026-09-08, na PRIMEIRA vez que o CLI real rodou num runner Linux
 * — coisa que só passou a acontecer quando o CI ganhou o repo do escritório.
 * Antes disso, nenhum sensor tinha como ver: o ramo POSIX desta função nunca
 * era exercitado na máquina do dono.
 *
 * `0700` na pasta e `0600` no arquivo são o par correto: em ambos, só o dono;
 * a diferença é apenas o `x` que torna a pasta atravessável.
 *
 * Função pura de propósito — o modo é uma DECISÃO, e decisão se testa em
 * qualquer sistema operacional, inclusive naquele onde `chmod` é teatro.
 *
 * @param {boolean} ehPasta
 * @returns {number}
 */
export function modoPosixPara(ehPasta) {
  return ehPasta ? 0o700 : 0o600;
}

export function restringirPermissao(caminho) {
  if (process.platform !== "win32") {
    let ehPasta = false;
    try {
      ehPasta = statSync(caminho).isDirectory();
    } catch {
      // Caminho sumiu entre o chamador e aqui: trata como arquivo, e o
      // `chmodSync` abaixo é quem reporta a falha de verdade.
      ehPasta = false;
    }
    const modo = modoPosixPara(ehPasta);
    const como = `chmod ${modo.toString(8)}`;
    try {
      chmodSync(caminho, modo);
      return { restringiu: true, como };
    } catch (e) {
      return { restringiu: false, como, erro: String(e.message ?? e) };
    }
  }

  const usuario = `${process.env.USERDOMAIN ?? ""}\\${userInfo().username}`.replace(/^\\/, "");

  // Pasta precisa de flags de herança (OI)(CI) para propagar aos filhos —
  // sem isso, restringir a pasta ANTES de escrever um arquivo dentro dela
  // some com toda ACE herdável, e o Windows cai para a DACL padrão do
  // processo ao criar o arquivo (que inclui BUILTIN\Administradores); e
  // restringir DEPOIS de escrever apaga a ACL herdada de arquivos já
  // existentes lá dentro — os dois jeitos regridem. Regressão real vista
  // nesta correção, não hipótese.
  let ehPasta = false;
  try {
    ehPasta = statSync(caminho).isDirectory();
  } catch {
    /* alvo ainda não existe ou não é acessível — segue como arquivo */
  }
  const concessao = ehPasta ? `${usuario}:(OI)(CI)F` : `${usuario}:F`;
  const como = `icacls /inheritance:r /grant:r ${concessao}`;

  // Windows: herança removida (/inheritance:r) e uma única concessão, ao dono.
  try {
    execFileSync("icacls", [caminho, "/inheritance:r", "/grant:r", concessao], {
      stdio: "pipe",
    });
  } catch (e) {
    return {
      restringiu: false,
      como,
      erro: String(e.stderr?.toString?.() || e.message || e).trim().split("\n")[0],
    };
  }

  // Melhor esforço: tira as concessões largas mais comuns que sobrevivem ao
  // /grant:r por pertencerem a outro trustee. Falhar aqui não é fatal — quem
  // decide o veredito é a verificação abaixo, nunca este comando.
  try {
    execFileSync("icacls", [caminho, "/remove:g", ...SIDS_AMPLAS_CONHECIDAS], { stdio: "pipe" });
  } catch {
    /* nada dessas SIDs para remover, ou sem permissão — a verificação pega */
  }

  const veredito = verificarAclExclusiva(caminho, usuario);
  if (!veredito.exclusiva) {
    return { restringiu: false, como, erro: t("cli.credencial.aclSobrando", { trustees: veredito.sobrando.join(", ") }) };
  }
  return { restringiu: true, como };
}

/**
 * Escreve o `.gitignore` PRÓPRIO da pasta do Arvys — `*`, tudo ignorado.
 *
 * A proteção do R2 morava inteira FORA do CLI: dependia do `.gitignore` do
 * repo alvo (`.arvys/` na raiz). O Arvys tem essa linha; nenhum outro repo do
 * dono tem, e o E3 existe para rodar em qualquer repo. Isto é o cinto de
 * segurança que não depende do repo alvo — reescrito a cada login, então nem
 * um `.gitignore` apagado por engano sobrevive à próxima sessão.
 */
function escreverGitignoreProprio(pasta) {
  try {
    writeFileSync(join(pasta, ".gitignore"), "*\n", "utf8");
  } catch {
    // Não impede o login — é cinto de segurança, não quem trava a operação
    // principal. Se falhar aqui, a defesa que resta é a do repo alvo.
  }
}

/** Sobe a árvore procurando um `.git` — aviso extra, não a defesa em si. */
function repoGitQueEnvolve(pasta) {
  let atual = pasta;
  for (;;) {
    if (existsSync(join(atual, ".git"))) return atual;
    const pai = dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

/**
 * Grava a credencial. Substitui a anterior — `login` de novo troca a máquina de
 * conta, não acumula duas.
 */
export function gravar({ token, email = null, escritorio = null }) {
  const pasta = pastaDoArvys();
  mkdirSync(pasta, { recursive: true });

  // A pasta é restringida ANTES de qualquer arquivo nascer dentro dela — com
  // herança (OI)(CI) para propagar aos filhos — para que `.gitignore` e a
  // credencial já nasçam dentro de uma pasta exclusiva do dono. Full Control
  // na pasta-pai permitiria apagar/substituir o filho mesmo com o arquivo
  // restrito (T9/R6, achado adjacente sobre a pasta).
  const permissaoPasta = restringirPermissao(pasta);

  escreverGitignoreProprio(pasta);

  const repoQueEnvolve = repoGitQueEnvolve(pasta);
  if (repoQueEnvolve) {
    // Achado adjacente ao R2: se ARVYS_HOME caiu dentro de uma árvore
    // versionada, o `.gitignore` próprio é quem segura — mas o dono precisa
    // SABER que caiu ali, para não confiar cegamente.
    console.error(t("cli.credencial.dentroDeGit", { pasta, repo: repoQueEnvolve }));
  }

  const caminho = caminhoDaCredencial();
  writeFileSync(
    caminho,
    JSON.stringify(
      {
        token,
        // `email` e `escritorio` só existem depois que o SERVIDOR confirmar
        // quem é o dono do token. O `login` não sabe — ele só tem o token
        // colado —, então nascem nulos aqui e quem os preenche é
        // `gravarIdentidade`, com a resposta do `GET /api/sync/whoami`.
        email,
        escritorio,
        gravado_em: new Date().toISOString(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const permissao = restringirPermissao(caminho);

  return { caminho, permissao, permissaoPasta };
}

/**
 * Grava de volta o que o SERVIDOR confirmou — e só isso.
 *
 * Os campos `email`/`escritorio` nasceram nulos na T4 do E3 de propósito:
 * *"quem sabe de quem é o token é o servidor, e o servidor é o E4"*. Esta é a
 * porta por onde a resposta do `GET /api/sync/whoami` entra no arquivo, e ela
 * é deliberadamente estreita:
 *
 * - **o token não é tocado.** Quem troca token é `gravar` (o `login`); uma
 *   resposta de rota não tem por que reescrever o segredo da máquina.
 * - **sem credencial, não cria uma.** Devolve `null` em vez de inventar um
 *   arquivo com identidade e sem token.
 * - **`confirmado_em` é o carimbo desta confirmação**, não o do `login`. É ele
 *   que deixa o `whoami` offline dizer *quando* aquele cache foi visto pela
 *   última vez em vez de apresentá-lo como se fosse de agora.
 *
 * A permissão é reaplicada depois de escrever: o arquivo já existia e mantém a
 * ACL, mas confiar nisso seria a mesma "palavra de quem executa" que a T9
 * derrubou — aqui se refaz e se confere.
 */
export function gravarIdentidade({ email, escritorio }) {
  const atual = ler();
  if (!atual) return null;

  const caminho = caminhoDaCredencial();
  const novo = {
    ...atual,
    email: email ?? null,
    escritorio: escritorio ?? null,
    confirmado_em: new Date().toISOString(),
  };
  writeFileSync(caminho, JSON.stringify(novo, null, 2) + "\n", "utf8");
  const permissao = restringirPermissao(caminho);
  return { credencial: novo, permissao };
}

export function ler() {
  const caminho = caminhoDaCredencial();
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return null; // arquivo corrompido é o mesmo que sem credencial: pede login
  }
}

export function apagar() {
  const caminho = caminhoDaCredencial();
  const existia = existsSync(caminho);
  rmSync(caminho, { force: true });
  return existia;
}
