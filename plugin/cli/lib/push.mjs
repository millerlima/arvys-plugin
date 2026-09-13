import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { ler as lerCredencial } from "./credencial.mjs";
import { montarManifesto } from "./manifesto.mjs";
import { varrer } from "./segredos.mjs";

/**
 * O push — duas etapas, §4.3, e a fila de §4.4.
 *
 * 1. `POST /api/sync/manifest` com `[{caminho, sha256, bytes}]`
 * 2. a nuvem responde **quais hashes não tem**
 * 3. `POST /api/sync/push` com só esses corpos, gzip, num request
 *
 * Três decisões que moram aqui:
 *
 * **A varredura de segredos roda ANTES da rede.** Achou → nada sai da máquina,
 * e o CLI aponta arquivo e linha. Varrer depois de enviar seria varrer o
 * cavalo depois do portão aberto.
 *
 * **O `push_id` é o hash do manifesto**, não um sorteio. Assim reenviar o mesmo
 * conteúdo é idempotente por construção (§4.4): a nuvem reconhece o push que já
 * aplicou, e a fila pode ser drenada duas vezes sem duplicar nada.
 *
 * **Sem rede não é erro.** O push vai para `.arvys/outbox/<push_id>.json` e o
 * comando termina bem — é o que faz o `/arvys:close` nunca falhar por rede
 * (S3.6). Erro de verdade é segredo encontrado, não Wi-Fi caído.
 *
 * ---
 *
 * **T9 (2026-09-07) achou 10 defeitos nesta família — "confia na palavra de
 * quem executa em vez de ler o resultado" (`fetch` não vira exceção por
 * status HTTP, `readdirSync` pode falhar, o disco pode mudar entre o
 * enfileiramento e a drenagem). O que muda aqui:
 *
 * - `/manifest` e `/push` agora são **conferidos** (`r.ok` + forma da
 *   resposta), não presumidos.
 * - As duas chamadas levam `AbortSignal.timeout(...)` — sem teto, um host
 *   que aceita e nunca responde prendia o `close` por 14–20s.
 * - A drenagem reivindica cada item com `rename` (atômico) ANTES do fetch,
 *   para duas `drenar()` concorrentes não processarem o mesmo item duas
 *   vezes — e um item "em voo" cujo processo morreu no meio é recuperado
 *   pela PRÓXIMA drenagem em vez de sumir da fila para sempre.
 * - O catch da drenagem só engole erro de REDE; bug de programação sobe.
 */

export function pastaDoOutbox(raiz) {
  return join(raiz, ".arvys", "outbox");
}

export function pushIdDe(manifesto) {
  return createHash("sha256").update(JSON.stringify(manifesto)).digest("hex").slice(0, 32);
}

export function pendentes(raiz) {
  const pasta = pastaDoOutbox(raiz);
  if (!existsSync(pasta)) return [];
  try {
    return readdirSync(pasta)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch (e) {
    // Outbox ilegível (ACL, antivírus, OneDrive segurando a pasta): não é
    // "zero pendentes" de verdade, é "não sei". Devolve vazio (quem chama
    // não pode travar por isto — é o close), mas marca o array para quem
    // quiser contar a verdade ao dono em vez de engolir (T9 R5, defeito 3).
    const vazio = [];
    vazio.erro = String(e.code ?? e.message ?? e);
    return vazio;
  }
}

/** Teto de cada fetch — `AbortSignal.timeout(...)`, T9 defeito 5. O `close`
 * promete ≤1min (SKILL.md); um teto de 10s por chamada cabe folgado nisso
 * mesmo drenando alguns itens. Ajustável só em teste (ARVYS_PUSH_TIMEOUT_MS). */
function timeoutMs() {
  const env = Number(process.env.ARVYS_PUSH_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : 10_000;
}

/** Códigos de erro de rede reconhecidos — a lista que justifica "enfileira,
 * não estoura". Fora daqui, o erro sobe (T9 defeito 9). */
const CODIGOS_DE_REDE = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EPROTO",
  "ABORT_ERR",
]);

/**
 * Rede caída (ou timeout, que T9 exige tratar do mesmo jeito) versus bug de
 * programação. Só o primeiro grupo pode virar "enfileirado" em silêncio —
 * o resto tem de subir (T9 defeito 9: `catch { break; }` genérico demais
 * mascarava bug como Wi-Fi caído).
 */
function erroDeRede(e) {
  if (!e) return false;
  if (e.rede === true) return true; // marcado por nós: HTTP não-ok ou resposta malformada
  const nome = e.name ?? e.cause?.name;
  if (nome === "AbortError" || nome === "TimeoutError") return true;
  const codigo = e.code ?? e.cause?.code;
  if (codigo && (CODIGOS_DE_REDE.has(codigo) || String(codigo).startsWith("UND_ERR"))) return true;
  if (e instanceof TypeError && /fetch failed/i.test(e.message ?? "")) return true;
  return false;
}

/**
 * Cabeçalhos com `Authorization: Bearer <token>` quando há credencial —
 * T9 defeito 8. Sem credencial, nada muda (o comportamento de hoje é não
 * empurrar, e continua sendo).
 *
 * **O sal de conta ficou onde tinha de ficar, e a decisão está tomada** (E4/T6,
 * 2026-09-07). Dois repos de boilerplate idêntico produzem o mesmo `push_id`
 * — medido, não suposto: `2ba57a7b236bffe446d315f5055cdad3` saiu igual dos
 * dois. O sal **não** é do cliente: ele é `@@unique([officeId, clientPushId])`
 * no Postgres, e a T6 provou os dois lados disso — o `push_id` de A não pune B
 * (que perderia o escritório inteiro em silêncio), e a corrida grava uma linha
 * só. A parte do cliente é esta função: o `Authorization` VIAJA, e é dele que
 * o servidor tira o `officeId` — nunca do corpo, nunca da URL (E4/T9).
 *
 * Salgar aqui seria pior do que inútil: o cliente não sabe em qual escritório
 * escreve (essa é a lei), e um `push_id` derivado de algo local quebraria a
 * idempotência que a fila de §4.4 depende — o mesmo conteúdo tem de produzir o
 * mesmo id em duas drenagens.
 */
function cabecalhos(extra = {}) {
  const credencial = lerCredencial();
  return credencial?.token ? { ...extra, Authorization: `Bearer ${credencial.token}` } : extra;
}

function enfileirar(raiz, envelope) {
  const pasta = pastaDoOutbox(raiz);
  mkdirSync(pasta, { recursive: true });
  const arquivo = join(pasta, `${envelope.push_id}.json`);
  // Idempotente também no disco: o mesmo push_id não vira dois arquivos.
  writeFileSync(arquivo, JSON.stringify(envelope), "utf8");
  return arquivo;
}

/**
 * Lê o corpo como JSON sem confiar que ele É JSON — resposta malformada,
 * corpo vazio, ou HTML de erro de proxy não podem virar exceção não tratada
 * aqui dentro (T9 defeito 1/2: a validação é de quem chama, não do parse).
 */
async function corpoOuNulo(r) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Monta o envelope do push: manifesto + os corpos que a nuvem não tem.
 * Separado do envio para a fila poder guardar exatamente o que seria mandado.
 */
async function montarEnvelope({ raiz, base, fetch }) {
  const manifesto = await montarManifesto(raiz);

  // A cerca, antes de qualquer byte sair.
  const achados = [];
  for (const item of manifesto) {
    const conteudo = await readFile(join(raiz, item.caminho), "utf8");
    achados.push(...varrer(conteudo, item.caminho));
  }
  if (achados.length) {
    const erro = new Error("segredo encontrado — o push inteiro foi recusado");
    erro.achados = achados;
    throw erro;
  }

  const push_id = pushIdDe(manifesto);

  const r = await fetch(`${base}/api/sync/manifest`, {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json" }),
    body: JSON.stringify({ manifesto, push_id }),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const corpo = await corpoOuNulo(r);

  // T9 defeito 1 — o achado mais grave: um 200 sem `faltam` virava
  // `new Set(undefined)` → conjunto vazio → ZERO corpos → "enviado", num
  // repo cujo conteúdo nunca chegou à nuvem. `r.ok` E a FORMA da resposta
  // são exigidos; qualquer um errado é falha, e falha aqui cai no caminho
  // de enfileirar (`erro.rede = true`), nunca no de "enviado" em silêncio.
  if (!r.ok || !Array.isArray(corpo?.faltam)) {
    const erro = new Error(
      `/api/sync/manifest respondeu de forma inesperada (status ${r.status}${
        r.ok ? ", sem 'faltam' valido" : ""
      })`
    );
    erro.rede = true;
    throw erro;
  }

  const querem = new Set(corpo.faltam);
  const corpos = [];
  for (const item of manifesto) {
    if (!querem.has(item.sha256)) continue;
    if (corpos.some((c) => c.sha256 === item.sha256)) continue; // gêmeos: um corpo só
    corpos.push({
      sha256: item.sha256,
      conteudo: (await readFile(join(raiz, item.caminho))).toString("base64"),
    });
  }

  // O CARIMBO DA MÁQUINA (E4/T5, decisão do orquestrador). O schema da nuvem
  // tem `generatedAt` (esta linha) e `receivedAt` (a hora do servidor) de
  // propósito: *"relógio de máquina pode estar torto e a tela precisa do
  // carimbo do dono"*. Sem este campo o servidor gravava a MESMA hora nas duas
  // colunas — dois carimbos dizendo uma coisa só.
  //
  // Fora do `push_id`, de propósito: `pushIdDe(manifesto)` é o hash do
  // CONTEÚDO, e é isso que faz a fila poder ser drenada duas vezes (§4.4). Um
  // instante dentro do id daria um id novo a cada tentativa, e a idempotência
  // da T6 morreria calada.
  //
  // ISO 8601 em UTC (`toISOString`, sufixo `Z`): fuso da máquina não viaja.
  return { push_id, manifesto, corpos, generated_at: new Date().toISOString() };
}

async function enviar({ base, fetch, envelope }) {
  const r = await fetch(`${base}/api/sync/push`, {
    method: "POST",
    headers: cabecalhos({ "content-type": "application/json", "content-encoding": "gzip" }),
    body: gzipSync(Buffer.from(JSON.stringify(envelope), "utf8")),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const corpo = await corpoOuNulo(r);

  // T9 defeito 2 — `fetch` não transforma status HTTP em exceção. Um 500
  // explícito passava como sucesso, e nada ficava para retry. E um `corpo`
  // que não parseia (JSON inválido, corpo vazio) é o mesmo problema com
  // status 200: não dá para confirmar que a nuvem aplicou nada.
  if (!r.ok || corpo === null) {
    const erro = new Error(`/api/sync/push respondeu de forma inesperada (status ${r.status})`);
    erro.rede = true;
    throw erro;
  }

  return corpo;
}

/**
 * @param {{raiz: string, base: string, fetch: Function}} args
 */
export async function push({ raiz, base, fetch }) {
  let envelope;
  try {
    envelope = await montarEnvelope({ raiz, base, fetch });
  } catch (e) {
    if (e.achados) throw e; // segredo: erro de verdade, sobe
    // Falhou já na 1ª etapa (rede, timeout, ou resposta que não dava para
    // confiar): não há envelope a enfileirar com corpos, mas o manifesto
    // local basta para tentar de novo depois.
    const manifesto = await montarManifesto(raiz);
    const push_id = pushIdDe(manifesto);
    enfileirar(raiz, { push_id, manifesto, corpos: null, motivo: String(e.code ?? e.message) });
    return { estado: "enfileirado", push_id, pendentes: pendentes(raiz).length };
  }

  try {
    const resposta = await enviar({ base, fetch, envelope });
    return { estado: "enviado", push_id: envelope.push_id, resposta };
  } catch (e) {
    enfileirar(raiz, { ...envelope, motivo: String(e.code ?? e.message) });
    return { estado: "enfileirado", push_id: envelope.push_id, pendentes: pendentes(raiz).length };
  }
}

const SUFIXO_EM_VOO = ".enviando";
/** Acima de qualquer timeout de fetch somado (T9 defeito 7): um claim mais
 * novo do que isto está de verdade em voo; mais velho é processo morto. */
const LIMITE_EM_VOO_MS = 60_000;

/**
 * Devolve à fila normal qualquer item deixado "em voo" por um processo que
 * morreu no meio da drenagem (T9 defeito 7) — ele não pode sumir para
 * sempre. Só reivindica o que está velho o bastante para não ser uma
 * drenagem concorrente de verdade, ainda em andamento.
 */
function recuperarEmVoo(pasta) {
  if (!existsSync(pasta)) return;
  let nomes;
  try {
    nomes = readdirSync(pasta);
  } catch {
    return; // outbox ilegível agora: nada a recuperar nesta passada
  }
  for (const nome of nomes) {
    if (!nome.endsWith(`.json${SUFIXO_EM_VOO}`)) continue;
    const caminho = join(pasta, nome);
    let stat;
    try {
      stat = statSync(caminho);
    } catch {
      continue;
    }
    if (Date.now() - stat.mtimeMs < LIMITE_EM_VOO_MS) continue; // pode estar em voo de verdade
    try {
      renameSync(caminho, join(pasta, nome.slice(0, -SUFIXO_EM_VOO.length)));
    } catch {
      // outra drenagem chegou primeiro entre o readdir e agora: segue.
    }
  }
}

/**
 * Drena a fila. Idempotente por `push_id`: drenar duas vezes não duplica —
 * a nuvem reconhece o que já aplicou, e o arquivo local só some quando o
 * envio dá certo.
 *
 * **Claim atômico (T9 defeito 7):** cada item é reivindicado com `rename`
 * — atômico, e o que o resto do repo já usa (`tmp → fsync → rename`) —
 * ANTES de qualquer fetch. Duas `drenar()` concorrentes (mesmo processo,
 * interleaving em `await`, ou dois processos) não processam o mesmo item:
 * quem chega depois vê o arquivo já renomeado e pula para o próximo.
 *
 * **DECISÃO (T9 defeito 6):** um item enfileirado sem corpos (falhou na 1ª
 * etapa) é remontado com o DISCO DE AGORA, não com a foto de quando foi
 * enfileirado — o envelope na fila só guarda o manifesto para permitir a
 * remontagem, não uma versão congelada. Se o dono editou arquivos entre o
 * enfileiramento e a drenagem, o `push_id` transmitido reflete o disco
 * atual. Isto é aceitável porque o outbox nunca prometeu versionamento —
 * prometeu só "o que mudou sobe" — mas o CONSEQUÊNCIA obrigatória é: o
 * `push_id` **reportado** em `enviados` tem de ser o `push_id` **remontado**
 * (o que de fato foi para a rede), nunca o antigo guardado no nome do
 * arquivo da fila.
 */
export async function drenar({ raiz, base, fetch }) {
  const pasta = pastaDoOutbox(raiz);
  recuperarEmVoo(pasta);

  const arquivos = pendentes(raiz);
  const enviados = [];

  for (const nome of arquivos) {
    const caminho = join(pasta, nome);
    const emVoo = caminho + SUFIXO_EM_VOO;

    try {
      renameSync(caminho, emVoo);
      const agora = new Date();
      utimesSync(emVoo, agora, agora); // marca "reivindicado agora" p/ a recuperação
    } catch {
      // Outra drenagem já reivindicou este item (ou ele sumiu por outro
      // motivo, ex.: foi processado entre o readdir e agora). Não é desta
      // chamada — segue para o próximo.
      continue;
    }

    let envelope;
    try {
      envelope = JSON.parse(readFileSync(emVoo, "utf8"));
    } catch (e) {
      try {
        renameSync(emVoo, caminho); // devolve: arquivo corrompido não é rede
      } catch {}
      throw e;
    }

    try {
      // Remontagem DENTRO do try (T9 defeito 4): antes, um item sem corpos
      // com a rede fora fazia `arvys push` crashar com `TypeError: fetch
      // failed` não tratado — a garantia da S3.6 quebrada no caminho direto.
      const completo = envelope.corpos ? envelope : await montarEnvelope({ raiz, base, fetch });
      await enviar({ base, fetch, envelope: completo });
      rmSync(emVoo, { force: true });
      // Reporta o push_id que DE FATO foi transmitido (T9 defeito 6), não o
      // que motivou o enfileiramento originalmente.
      enviados.push(completo.push_id ?? envelope.push_id);
    } catch (e) {
      // O item não pode sumir da fila: devolve a reivindicação.
      try {
        renameSync(emVoo, caminho);
      } catch {}
      if (e.achados) throw e; // segredo achado na remontagem: erro de verdade, sobe
      if (erroDeRede(e)) break; // rede/timeout ainda fora: para e tenta na próxima
      throw e; // T9 defeito 9: bug de programação sobe, não vira "rede caída"
    }
  }

  return { enviados, pendentes: pendentes(raiz).length };
}
