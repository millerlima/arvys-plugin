/**
 * A lista branca — o que sobe para a nuvem, e nada além disso.
 *
 * Arquitetura §4.2, literal: **lista branca, nunca lista negra**. A diferença
 * não é estilo. Uma lista negra é um filtro que pode falhar — esquecer um
 * padrão significa vazar. Uma lista branca é uma lista que **não contém** o que
 * não pode subir: transcrito de conversa, `.env`, código-fonte e
 * `hub/live/events.jsonl` não têm caminho até a nuvem porque ninguém os
 * escreveu aqui, não porque um filtro os pegou.
 *
 * Por isso os padrões abaixo são fechados e explícitos. Um arquivo novo no
 * escritório **não sobe** até alguém acrescentá-lo aqui, de propósito.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { t } from "./texto.mjs";

/** Nomes exatos em `company/` (§4.2). */
const COMPANY = [
  "DECISIONS.md",
  "FILA.md",
  "ROADMAP.md",
  "STATE.md",
  "BRIEFING.md",
  "METRICS.md",
  "PLAYBOOK.md",
  "PEDIDOS-DO-DONO.md",
  "RADAR-CURADO.md",
  "OFFICE-METRICS.json",
];

/** Nomes exatos dentro de `agents/<qualquer>/`. */
const AGENTE = ["AGENT.md", "STATE.md", "GOTCHAS.md", "FEEDBACK.md"];

/** Nomes exatos dentro de `specs/<qualquer>/`. */
const SPEC = ["spec.md", "plan.md", "tasks.md"];

/** Pastas em que nem se entra — economia, e uma cerca a menos para errar. */
const NUNCA_ENTRAR = new Set([".git", "node_modules", ".next", "hub", "workers", "plugin", "scripts", "evals", "docs", ".githooks", ".claude"]);

/**
 * Windows/macOS têm filesystem case-insensitive; a lista é de nomes exatos,
 * mas a COMPARAÇÃO precisa ignorar caixa — senão `AGENT.md` → `agent.md` (só
 * renomear a caixa) tira o arquivo da lista branca sem erro nem aviso, e o
 * escritório para de subir um arquivo dizendo que está sincronizado (T9/R1).
 */
function nomeIgual(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/** @param {string} caminho caminho relativo à raiz, com `/` */
export function estaNaListaBranca(caminho) {
  const p = caminho.split(sep).join("/");
  const partes = p.split("/");

  if (partes.length === 2 && partes[0] === "company") return COMPANY.some((n) => nomeIgual(n, partes[1]));
  if (partes.length === 3 && partes[0] === "agents") return AGENTE.some((n) => nomeIgual(n, partes[2]));
  if (partes.length === 3 && partes[0] === "specs") return SPEC.some((n) => nomeIgual(n, partes[2]));
  if (partes.length === 4 && partes[0] === "specs" && partes[2] === "evidence") {
    return partes[3].toLowerCase().endsWith(".md");
  }
  if (partes.length === 2 && partes[0] === "incidents") return partes[1].toLowerCase().endsWith(".md");

  return false;
}

/**
 * Varre o repo e devolve os caminhos que sobem, ordenados.
 * Determinístico: duas chamadas sem mudança em disco devolvem o mesmo array.
 */
export async function listarParaSubir(raiz) {
  const achados = [];

  async function andar(dir) {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // pasta ilegível não derruba a varredura
    }
    for (const e of entradas) {
      const completo = join(dir, e.name);
      const rel = relative(raiz, completo).split(sep).join("/");
      if (e.isDirectory()) {
        if (NUNCA_ENTRAR.has(e.name)) continue;
        await andar(completo);
      } else if (e.isFile() && estaNaListaBranca(rel)) {
        const info = await stat(completo);
        if (info.nlink > 1) {
          // Hard link: `mklink /H` não exige elevação no Windows, e para o
          // Node é indistinguível de arquivo comum — isFile()===true,
          // isSymbolicLink()===false. A defesa contra reparse point (acima)
          // não se aplica; o conteúdo pode vir de FORA do repo, no mesmo
          // volume NTFS. Recusa em voz alta em vez de subir calado: silêncio
          // aqui trocaria um defeito por outro, porque hard link legítimo
          // dentro do escritório é raro mas existe — o dono precisa saber por
          // que o arquivo não subiu (T9/R1).
          console.error(t("cli.listaBranca.hardLink", { caminho: rel, n: info.nlink }));
          continue;
        }
        achados.push({ caminho: rel, bytes: info.size });
      }
    }
  }

  await andar(raiz);
  achados.sort((a, b) => a.caminho.localeCompare(b.caminho));
  return achados;
}
