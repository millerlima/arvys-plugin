import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * E8 · T2 — trava local de arquivo, `.arvys/locks/<arquivo>.lock`.
 *
 * Protege só CONTRA outra instância do `arvys sync`/`arvys tasks migrate`
 * (plan.md da spec `2026-09-saas-e8-escrita` nomeia por que ela NÃO protege
 * contra um agente escrevendo `tasks.md` por fora — isso é o CAS por hash,
 * `bloco-story.mjs`, que cobre).
 *
 * `O_CREAT|O_EXCL` (a flag `"wx"` do Node): dois processos tentando criar o
 * MESMO arquivo ao mesmo tempo — só um consegue, o SO decide, nunca uma
 * corrida de "checar se existe, depois criar" (que teria uma janela).
 *
 * Trava com menos de 30 s: **viva**, espera até 5 s e desiste com aviso —
 * nunca força. Trava com 30 s ou mais: **morta** (o dono provavelmente
 * crashou sem soltar), pode ser assumida.
 */

const TRAVA_MORTA_MS = 30_000;
const ESPERA_PADRAO_MS = 5_000;
const PASSO_MS = 100;

export function caminhoDaTrava(raiz, arquivo) {
  return join(raiz, ".arvys", "locks", arquivo + ".lock");
}

function lerTrava(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    // arquivo ilegível/corrompido/sumiu entre o EEXIST e a leitura — trata
    // como SEM DONO IDENTIFICÁVEL, o que a chamada de `travaEstaMorta`
    // abaixo já lê como morta (nunca prende o dono para sempre por causa
    // de um arquivo de trava quebrado).
    return null;
  }
}

function travaEstaMorta(info, agoraMs) {
  if (!info || typeof info.comecouEm !== "number") return true;
  return agoraMs - info.comecouEm > TRAVA_MORTA_MS;
}

function tentarCriar(caminho, conteudo) {
  try {
    mkdirSync(dirname(caminho), { recursive: true });
    const fd = openSync(caminho, "wx"); // O_CREAT | O_EXCL — atômico no SO
    writeSync(fd, conteudo);
    closeSync(fd);
    return true;
  } catch (e) {
    if (e && e.code === "EEXIST") return false;
    throw e;
  }
}

/** Dorme de forma SÍNCRONA (o CLI roda em script direto, sem event loop
 *  pendurado esperando `setTimeout`) — `Atomics.wait` é o jeito padrão do
 *  Node de fazer isso sem addon nativo. */
function dormeSincrono(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Pega a trava — ou devolve `{ok:false}` com o motivo, nunca força.
 *
 * @param {{esperarMs?: number, agora?: () => number, pid?: number}} opts
 */
export function pegar(raiz, arquivo, opts = {}) {
  const esperarMs = opts.esperarMs ?? ESPERA_PADRAO_MS;
  const agora = opts.agora || (() => Date.now());
  const pid = opts.pid ?? process.pid;
  const caminho = caminhoDaTrava(raiz, arquivo);
  const inicioEspera = agora();

  for (;;) {
    const comecouEm = agora();
    const conteudo = JSON.stringify({ pid, comecouEm });
    if (tentarCriar(caminho, conteudo)) {
      return { ok: true, caminho, pid, comecouEm };
    }

    const dono = lerTrava(caminho);
    if (travaEstaMorta(dono, agora())) {
      // Morta: assume o lugar — remove e tenta de novo no próximo giro.
      // Se outro processo também estiver assumindo ao mesmo tempo, o
      // O_EXCL do próximo `tentarCriar` decide, nunca os dois "ganham".
      try { rmSync(caminho, { force: true }); } catch { /* já sumiu */ }
      continue;
    }

    if (agora() - inicioEspera >= esperarMs) {
      return { ok: false, motivo: "ocupada", dono };
    }
    dormeSincrono(Math.min(PASSO_MS, esperarMs));
  }
}

/**
 * Solta a trava — só se ela ainda for A MESMA que este `handle` pegou
 * (mesmo `pid` e `comecouEm`). Nunca solta a trava de outro dono: se ela
 * foi julgada morta e assumida por outro processo enquanto este ainda
 * achava que era dele, soltar aqui apagaria a trava do NOVO dono.
 */
export function soltar(handle) {
  if (!handle || !handle.ok) return false;
  const atual = lerTrava(handle.caminho);
  if (atual && atual.pid === handle.pid && atual.comecouEm === handle.comecouEm) {
    try { rmSync(handle.caminho, { force: true }); } catch { /* já sumiu */ }
    return true;
  }
  return false;
}

/** Só para os sensores: a trava existe e não é minha? */
export function travaAlheiaViva(raiz, arquivo, agora = () => Date.now()) {
  const caminho = caminhoDaTrava(raiz, arquivo);
  if (!existsSync(caminho)) return false;
  return !travaEstaMorta(lerTrava(caminho), agora());
}
