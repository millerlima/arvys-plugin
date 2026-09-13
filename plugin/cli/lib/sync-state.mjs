import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E8 · T5 — `.arvys/sync-state.json`: os `op_id` já APLICADOS NO DISCO por
 * este cliente (C7, idempotência).
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * ------------------------------------
 * `arvys sync` pode escrever o bloco no disco e depois falhar ao confirmar
 * (`POST /api/sync/ops/:id`) — rede caiu no meio. Na PRÓXIMA rodada, o
 * servidor ainda mostra a op como `PENDING` (nunca recebeu a confirmação).
 * Recalcular o hash de novo nesse momento NÃO bate mais com `baseHash` — o
 * `rev` já subiu na 1ª tentativa — e sem este arquivo isso viraria um
 * `CONFLICT` falso: a op já foi aplicada, só a confirmação que se perdeu.
 *
 * Por isso: antes de tentar reaplicar, `drenarOps` consulta este arquivo. Se
 * o `opId` já está aqui, a etapa de escrita é PULADA — só reenvia a
 * confirmação, com o `resultHash` que já foi calculado da primeira vez.
 */

export function caminhoDoSyncState(raiz) {
  return join(raiz, ".arvys", "sync-state.json");
}

export function lerSyncState(raiz) {
  const caminho = caminhoDoSyncState(raiz);
  if (!existsSync(caminho)) return { aplicadas: {} };
  try {
    const dado = JSON.parse(readFileSync(caminho, "utf8"));
    return { aplicadas: dado && typeof dado.aplicadas === "object" && dado.aplicadas ? dado.aplicadas : {} };
  } catch {
    // Corrompido não pode travar a drenagem: o pior caso é reavaliar o hash
    // de novo (que, se a op já foi de fato aplicada, vira CONFLICT visível —
    // nunca escrita duplicada silenciosa).
    return { aplicadas: {} };
  }
}

/** `opId` já aplicado localmente, com o hash resultante daquela aplicação. */
export function marcarAplicada(raiz, opId, resultHash, agora = () => new Date().toISOString()) {
  const estado = lerSyncState(raiz);
  estado.aplicadas[opId] = { resultHash, aplicadoEm: agora() };
  mkdirSync(join(raiz, ".arvys"), { recursive: true });
  writeFileSync(caminhoDoSyncState(raiz), JSON.stringify(estado, null, 2) + "\n", "utf8");
  return estado;
}
