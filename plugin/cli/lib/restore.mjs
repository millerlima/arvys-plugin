import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";

import { ler as lerCredencial } from "./credencial.mjs";

/**
 * `arvys restore` — E11, T2. O inverso de `push`: nuvem → disco.
 *
 * DUAS CHAMADAS POR ARQUIVO, NUNCA UMA SÓ QUE TRAZ TUDO
 * -----------------------------------------------------------------
 * `GET /api/sync/restore-manifest` traz só o MAPA (caminho+sha256+bytes);
 * `GET /api/sync/blob/[sha256]` traz o conteúdo de UM arquivo por chamada,
 * em lotes com teto de paralelismo — nunca um por vez em série (lento
 * demais num push de centenas de arquivos), nunca todos de uma vez sem
 * teto (satura a conexão e o disco ao mesmo tempo). Mesmo espírito do
 * `montarManifesto`/`push`: nunca confia sem conferir.
 *
 * DIRETÓRIO NÃO VAZIO NUNCA É SOBRESCRITO EM SILÊNCIO (C3)
 * -----------------------------------------------------------------
 * `restaurar()` recusa ANTES de qualquer requisição de rede se o destino já
 * tem algo dentro — nunca apaga, nunca mistura sem que quem chamou passe
 * `forcar: true` explicitamente.
 *
 * CADA ARQUIVO CONFERE O PRÓPRIO `sha256` DEPOIS DE BAIXAR
 * -----------------------------------------------------------------
 * O manifesto diz qual hash esperar; se o que chegou não bate (rede
 * corrompida, servidor com bug), o arquivo entra em `falhas`, nunca é
 * gravado com conteúdo errado e reportado como sucesso.
 */

function cabecalhos(extra = {}) {
  const credencial = lerCredencial();
  return credencial?.token ? { ...extra, Authorization: `Bearer ${credencial.token}` } : extra;
}

/** Mesmo teto de `push.mjs` — ajustável só em teste. */
function timeoutMs() {
  const env = Number(process.env.ARVYS_PUSH_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : 10_000;
}

async function corpoOuNulo(r) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Vazio ou ainda inexistente — os dois são "pode restaurar aqui". Qualquer
 *  entrada dentro (arquivo, pasta, dotfile) conta como NÃO vazio: C3 não
 *  faz exceção para ".git" nem para nada. */
function diretorioVazio(diretorio) {
  if (!existsSync(diretorio)) return true;
  return readdirSync(diretorio).length === 0;
}

/** Quantos downloads em voo ao mesmo tempo — nunca em série (lento demais
 *  em pushes grandes), nunca sem teto (satura conexão + disco juntos). */
const TETO_PARALELO = 8;

/**
 * O CAMINHO VEM DO SERVIDOR — E O CLI NÃO CONFIA NELE (E11 · R3, achado do
 * reviewer adversarial em 2026-09-12). O servidor já recusa `..`, absoluto e
 * confusável NA INGESTÃO (`manifesto.ts`, `lerCaminho`), mas essa era a
 * ÚNICA barreira entre um manifesto torto (servidor comprometido, bug de
 * migração, escrita direta no banco) e `writeFileSync` no disco do dono:
 * provado ao vivo, `{ caminho: "../fora.md" }` gravava um nível ACIMA do
 * destino e reportava sucesso. Defesa em profundidade, duplicada aqui de
 * propósito: recusa absoluto, `..` em qualquer segmento, barra invertida
 * (o servidor só grava `/`), `\0`, vazio — e, depois de resolver, exige
 * que o destino fique DENTRO da raiz. Devolve `null` para recusar; quem
 * chama põe o item em `falhas`, nunca grava.
 */
export function destinoSeguro(raiz, caminho) {
  if (typeof caminho !== "string" || caminho === "") return null;
  if (caminho.includes("\0") || caminho.includes("\\")) return null;
  if (isAbsolute(caminho) || /^[A-Za-z]:/.test(caminho) || caminho.startsWith("/")) return null;
  const segmentos = caminho.split("/");
  if (segmentos.some((s) => s === "" || s === "." || s === "..")) return null;
  const base = resolve(raiz);
  const destino = resolve(base, caminho);
  if (destino === base || !destino.startsWith(base + sep)) return null;
  return destino;
}

/**
 * @param {{diretorio: string, base: string, fetch: Function, forcar?: boolean}} args
 * @returns {Promise<{restaurados: number, falhas: {caminho:string, motivo:string}[], geradoEm: string}>}
 */
export async function restaurar({ diretorio, base, fetch, forcar = false }) {
  if (!forcar && !diretorioVazio(diretorio)) {
    const erro = new Error("diretorio-nao-vazio");
    erro.diretorioNaoVazio = true;
    throw erro;
  }

  const rManifesto = await fetch(`${base}/api/sync/restore-manifest`, {
    headers: cabecalhos(),
    signal: AbortSignal.timeout(timeoutMs()),
  });

  if (rManifesto.status === 404) {
    const erro = new Error("sem-push");
    erro.semPush = true;
    throw erro;
  }

  const corpoManifesto = await corpoOuNulo(rManifesto);
  if (!rManifesto.ok || !Array.isArray(corpoManifesto?.arquivos)) {
    const erro = new Error(`/api/sync/restore-manifest respondeu de forma inesperada (status ${rManifesto.status})`);
    erro.rede = true;
    throw erro;
  }

  const restaurados = [];
  const falhas = [];

  // GÊMEOS: UM DOWNLOAD POR sha256, NUNCA POR CAMINHO (E11 · R2, achado do
  // reviewer adversarial em 2026-09-12). O `push` já manda "um corpo só" por
  // hash (`push.mjs`, gêmeos); o restore fazia o inverso errado — 500
  // caminhos apontando para 1 blob de 200 KB viravam 500 GETs (~100 MB de
  // tráfego para 200 KB físicos) e 1000 idas ao banco. Aqui o manifesto é
  // agrupado por `sha256` ANTES da rede: baixa uma vez, grava em todos os
  // caminhos. A validação de caminho continua por CAMINHO (cada destino é
  // conferido); um caminho torto não derruba os irmãos legítimos do mesmo
  // blob.
  const porSha = new Map();
  for (const item of corpoManifesto.arquivos) {
    const destino = destinoSeguro(diretorio, item.caminho);
    if (destino === null) {
      falhas.push({ caminho: item.caminho, motivo: "caminho recusado (fora do diretório de destino ou mal formado)" });
      continue;
    }
    if (!porSha.has(item.sha256)) porSha.set(item.sha256, []);
    porSha.get(item.sha256).push({ caminho: item.caminho, destino });
  }
  const blobs = [...porSha.entries()];

  for (let i = 0; i < blobs.length; i += TETO_PARALELO) {
    const lote = blobs.slice(i, i + TETO_PARALELO);
    await Promise.all(
      lote.map(async ([sha256, destinos]) => {
        try {
          const rBlob = await fetch(`${base}/api/sync/blob/${sha256}`, {
            headers: cabecalhos(),
            signal: AbortSignal.timeout(timeoutMs()),
          });
          if (!rBlob.ok) throw new Error(`HTTP ${rBlob.status}`);
          const conteudo = Buffer.from(await rBlob.arrayBuffer());
          const shaConferido = createHash("sha256").update(conteudo).digest("hex");
          if (shaConferido !== sha256) {
            throw new Error(`sha256 não bate (esperado ${sha256.slice(0, 12)}…, obtido ${shaConferido.slice(0, 12)}…)`);
          }
          for (const { caminho, destino } of destinos) {
            try {
              mkdirSync(dirname(destino), { recursive: true });
              writeFileSync(destino, conteudo);
              restaurados.push(caminho);
            } catch (e) {
              falhas.push({ caminho, motivo: String(e.message ?? e) });
            }
          }
        } catch (e) {
          for (const { caminho } of destinos) falhas.push({ caminho, motivo: String(e.message ?? e) });
        }
      })
    );
  }

  return { restaurados: restaurados.length, falhas, geradoEm: corpoManifesto.geradoEm };
}
