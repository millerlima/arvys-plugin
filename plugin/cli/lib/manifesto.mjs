import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { listarParaSubir } from "./lista-branca.mjs";

/**
 * O manifesto — `[{caminho, sha256, bytes}]`, arquitetura §4.3.
 *
 * **Content-addressed** quer dizer que o endereço do conteúdo é o próprio
 * conteúdo: dois arquivos idênticos têm o mesmo `sha256`, estejam onde
 * estiverem. É isso que faz o push seguinte custar poucos KB — a nuvem responde
 * "já tenho esses hashes" e só os corpos que faltam viajam.
 *
 * Consequência que parece detalhe e não é: **o caminho NÃO entra no hash.**
 * Um hash que misturasse caminho e conteúdo funcionaria em todos os testes
 * óbvios e destruiria a deduplicação em silêncio — mover um arquivo faria o
 * conteúdo inteiro subir de novo.
 *
 * O hash é dos **bytes do disco**, sem normalizar fim de linha. No Windows um
 * arquivo com CRLF é um arquivo diferente de um com LF, e fingir o contrário
 * faria o manifesto discordar do que de fato seria enviado.
 */

export function sha256De(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * @param {string} raiz
 * @returns {Promise<{caminho: string, sha256: string, bytes: number}[]>}
 */
export async function montarManifesto(raiz) {
  const arquivos = await listarParaSubir(raiz);
  const manifesto = [];

  for (const { caminho, bytes } of arquivos) {
    const conteudo = await readFile(join(raiz, caminho));
    manifesto.push({ caminho, sha256: sha256De(conteudo), bytes });
  }

  // Ordem estável: o manifesto é comparado byte a byte entre execuções, e
  // ordem de leitura de diretório não é garantida entre sistemas.
  manifesto.sort((a, b) => a.caminho.localeCompare(b.caminho));
  return manifesto;
}

/** Só os hashes, para a 1ª etapa do push (§4.3). */
export function hashesDo(manifesto) {
  return [...new Set(manifesto.map((m) => m.sha256))];
}
