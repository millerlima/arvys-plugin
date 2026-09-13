import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { acharBlocoDaStory, escreverCampoDaStory, hashBloco } from "./bloco-story.mjs";
import { escreverAtomico } from "./escrita-atomica.mjs";
import { listarParaSubir } from "./lista-branca.mjs";
import { lerSyncState, marcarAplicada } from "./sync-state.mjs";
import { falhaDoDicionario, t } from "./texto.mjs";
import { pegar, soltar } from "./trava.mjs";

/** A chave de onde sai a palavra. Uma constante porque três lugares a citam. */
const CHAVE_DA_PALAVRA = "cli.sync.palavraDeConfirmacao";

/**
 * T5b (review R4 da FILA 79, achado "CLI grava status no tasks.md sem
 * validar") — o mesmo enum de `arvys-app/src/server/work/status-quadro.ts`
 * (STATUS_QUADRO), lido da CÓPIA que `hub:sync` já traz para
 * `plugin/cli/dict/status-quadro.json` — a mesma mecânica que `texto.mjs`
 * usa para `dict/pt-BR.json`, nunca um segundo jeito de achar o arquivo.
 *
 * O servidor (`intencao.ts`) já recusa `para` fora do enum ANTES de criar a
 * intenção — mas o CLI não confia no eco do banco (F5 do Forge, a mesma lei
 * que descartou "validar só no cliente" no `plan.md`): uma op que já tivesse
 * entrado torta por outro caminho (bug do servidor, banco editado à mão,
 * migração antiga) seria escrita no `tasks.md` do dono sem checagem nenhuma
 * — `escreverCampoDaStory` grava QUALQUER string em `toValue`.
 *
 * Falha ABERTA de propósito quando o dicionário não está sincronizado: um
 * array vazio nunca valida nada (`includes` sempre `false`), o que RECUSA
 * toda op de status em vez de aceitar lixo — o mesmo "recusa antes de
 * perguntar" que `palavraUsavel` já aplica acima. `hub:check` é quem garante
 * que isto não fica vazio de verdade.
 */
const CAMINHO_STATUS_QUADRO = join(dirname(fileURLToPath(import.meta.url)), "..", "dict", "status-quadro.json");

let STATUS_QUADRO;
function statusQuadro() {
  if (STATUS_QUADRO) return STATUS_QUADRO;
  try {
    const lista = JSON.parse(readFileSync(CAMINHO_STATUS_QUADRO, "utf8"));
    STATUS_QUADRO = Array.isArray(lista) ? lista : [];
  } catch {
    STATUS_QUADRO = [];
  }
  return STATUS_QUADRO;
}

/** `true` quando a op NÃO precisa da checagem de status, ou quando o `toValue` está na lista. */
function statusValido(op) {
  if (op.field !== "status") return true;
  return statusQuadro().includes(op.toValue);
}

/**
 * A palavra serve para comparar? (R1-fail-open-vazio · R1-dict-corrompido, 2026-09-08)
 *
 * Três jeitos de ela não servir, e os três já aconteceram ou eram alcançáveis:
 *
 * - **vazia ou só espaço** — `""` fazia `"" !== ""` dar `false`, e o opt-in
 *   abria com um Enter. Fail-open no único gate que este produto tem;
 * - **`undefined`** — dicionário sem a chave, ou `palavra` injetada torta pelo
 *   chamador;
 * - **o próprio nome da chave** — o dicionário não abriu e o `t()` degradou
 *   para `String(chave)`. A tela então pedia `Digite
 *   "cli.sync.palavraDeConfirmacao"`: seguro (ninguém digita isso por acaso)
 *   mas impossível de usar, o que na prática é um botão morto.
 *
 * Em todos, a resposta é a mesma: recusar ANTES de perguntar. Perguntar algo
 * que não dá para responder certo é pior que dizer que está quebrado.
 */
function palavraUsavel(palavra) {
  if (typeof palavra !== "string") return false;
  if (!palavra.trim()) return false;
  return palavra.trim() !== CHAVE_DA_PALAVRA;
}

/**
 * O opt-in por repo — S3.2, arquitetura §4.2 fim.
 *
 * *"No primeiro push do repo, mostra a lista completa de caminhos + bytes e
 * exige confirmação digitada — opt-in por repo, uma vez, registrado."*
 *
 * Duas coisas que parecem detalhe e são a tarefa inteira:
 *
 * 1. **A lista vem ANTES da pergunta.** Consentimento dado sem ver o que se
 *    consente não é consentimento; é um "sim" arrancado. Por isso
 *    `resumoDoQueSubiria` existe separado e é o que a tela imprime.
 * 2. **Nada é gravado antes do "confirmo".** Gravar primeiro e apagar depois se
 *    a pessoa recusar é o defeito clássico deste tipo de fluxo: basta o
 *    processo morrer no meio para o repo ficar com um consentimento que ninguém
 *    deu. Aqui a escrita acontece **depois** da confirmação, e só.
 *
 * A PALAVRA É DADO, NÃO TEXTO (E1 · T6.6, 2026-09-08)
 * ---------------------------------------------------
 * Ela é o que o dono DIGITA para ligar o push, então ela sai do dicionário
 * (`cli.sync.palavraDeConfirmacao`) e a comparação é contra a chave, nunca
 * contra o literal `"confirmo"`. Em `en` o CLI pede **e aceita** `confirm`.
 *
 * Pedir em inglês e só aceitar português seria botão morto — e botão morto já
 * é defeito nomeado neste produto (A11). Um literal cravado aqui reintroduz
 * exatamente esse defeito, por isso não há nenhum.
 *
 * Em pt-BR a palavra continua sendo `confirmo`, a mesma que o
 * `guard-db-target` já exige para operação destrutiva — uma palavra só no
 * escritório inteiro.
 */

export const PALAVRA_DE_CONFIRMACAO = t(CHAVE_DA_PALAVRA);

export function caminhoDoSync(raiz) {
  return join(raiz, ".arvys", "sync.json");
}

export function lerSync(raiz) {
  const caminho = caminhoDoSync(raiz);
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return null;
  }
}

/** O que subiria, com o total — a lista que a pessoa lê antes de decidir. */
export async function resumoDoQueSubiria(raiz) {
  const arquivos = await listarParaSubir(raiz);
  const bytes = arquivos.reduce((s, a) => s + a.bytes, 0);
  return { arquivos, total: arquivos.length, bytes };
}

/**
 * Habilita o sync neste repo.
 *
 * `perguntar` é injetado para o sensor poder exercitar recusa, confirmação
 * torta e confirmação certa sem terminal interativo — e para deixar explícito
 * que **quem decide é quem responde**, não esta função.
 *
 * `palavra` é injetada pelo mesmo motivo: o sensor roda a bateria inteira nos
 * DOIS idiomas passando a palavra de cada um, em vez de cravar `"confirmo"`.
 *
 * @param {{raiz: string, perguntar: () => Promise<string>, palavra?: string, agora?: () => string}} args
 */
export async function habilitarSync({
  raiz,
  perguntar,
  palavra = t(CHAVE_DA_PALAVRA),
  agora = () => new Date().toISOString(),
}) {
  // ORDEM IMPORTA: o dicionário é conferido antes da lista e antes da
  // pergunta. Nada de I/O, nada de tela, nada de escrita — o comando morre
  // aqui dizendo o que quebrou.
  const falha = falhaDoDicionario();
  if (falha) {
    return { estado: "recusado", motivo: "dicionario-ilegivel", detalhe: falha };
  }
  if (!palavraUsavel(palavra)) {
    return { estado: "recusado", motivo: "palavra-vazia", detalhe: CHAVE_DA_PALAVRA };
  }

  const jaExiste = lerSync(raiz);
  if (jaExiste) {
    // Rodar de novo não repete o ritual nem pede confirmação outra vez: o
    // opt-in é por repo, uma vez. Pedir de novo ensinaria a responder no
    // automático, que é o oposto do que ele existe para fazer.
    return { estado: "ja-habilitado", sync: jaExiste };
  }

  const resumo = await resumoDoQueSubiria(raiz);
  const resposta = (await perguntar(resumo)) ?? "";

  if (resposta.trim().toLowerCase() !== String(palavra).toLowerCase()) {
    // Nada foi gravado. Nem arquivo parcial, nem pasta com marca — o repo fica
    // exatamente como estava.
    return { estado: "recusado", resumo };
  }

  const sync = {
    habilitado_em: agora(),
    arquivos_no_optin: resumo.total,
    bytes_no_optin: resumo.bytes,
    // O que foi mostrado fica registrado: se a lista branca mudar depois, dá
    // para saber que o "sim" foi dado sobre outra lista.
    confirmado_sobre: resumo.arquivos.map((a) => a.caminho),
  };

  mkdirSync(join(raiz, ".arvys"), { recursive: true });
  writeFileSync(caminhoDoSync(raiz), JSON.stringify(sync, null, 2) + "\n", "utf8");

  return { estado: "habilitado", sync };
}

// ─────────────────────────────────────────────────────────── T5 · drenarOps

/**
 * E8 · T5 — `arvys sync` (sem subcomando) drena as ops PENDING do servidor
 * (genesis `04-arquitetura.md:187`: "Push + drenagem das ops pendentes").
 *
 * Junta T1 (`bloco-story.mjs`, CAS por bloco) + T2 (`trava.mjs`) + T4
 * (`/api/sync/ops*`). Por op, na ordem que o `GET` devolve (`seq` ASC):
 * pega a trava do ARQUIVO → recalcula o hash no disco → bate: escreve
 * (`tmp → fsync → rename`) e confirma `APPLIED` → não bate: confirma
 * `CONFLICT`, anexa as duas versões em `company/SYNC-CONFLITOS.md`, e PARA
 * a drenagem daquele arquivo (C4 — nunca pula por cima; outros arquivos
 * seguem independentes).
 */

/** `<epicSlug>/<blockId>` → `{arquivoRel, blockId}`. O `/` do meio é o único
 *  separador de propósito (achado do gotcha: nunca usar `split("/")` cru,
 *  um `blockId` malformado com `/` dentro quebraria a contagem). */
function resolverAlvo(targetPath) {
  const i = targetPath.indexOf("/");
  if (i < 0) return null;
  const epicSlug = targetPath.slice(0, i);
  const blockId = targetPath.slice(i + 1);
  if (!epicSlug || !blockId) return null;
  return { epicSlug, blockId, arquivoRel: join("specs", epicSlug, "tasks.md") };
}

/**
 * `company/SYNC-CONFLITOS.md` — as duas versões do bloco, lado a lado
 * (C3). "A versão que a op pediria" é SINTÉTICA: o campo trocado por cima
 * do texto ATUAL do disco, só para dar ao dono algo concreto para
 * comparar — nunca escrita de verdade (o CAS já recusou antes de chegar
 * aqui).
 */
function anexarConflito(raiz, { arquivoRel, op, blocoAtualTexto, hashAtual, motivo }, agora) {
  const caminho = join(raiz, "company", "SYNC-CONFLITOS.md");
  mkdirSync(join(raiz, "company"), { recursive: true });
  const cabecalho = existsSync(caminho)
    ? ""
    : "# Conflitos de sincronização\n\n> Toda vez que `arvys sync` encontra um bloco que mudou no disco\n" +
      "> desde que a intenção foi criada pela tela, ele para e anexa aqui —\n" +
      "> nunca escolhe um lado (genesis §3: \"nunca se resolve em silêncio\").\n" +
      "> Resolver é editar `tasks.md` na mão e rodar `arvys sync` de novo.\n\n";

  const versaoPedida =
    motivo === "sem-bloco-no-disco"
      ? "(a story não tem mais bloco `<!--arvys-->` neste arquivo — foi removida ou nunca migrada de novo)"
      : "```\n" + (op.tentativaTexto ?? "(não foi possível montar a versão hipotética)") + "\n```";

  const entrada =
    `## ${arquivoRel.replace(/\\/g, "/")} — story \`${op.targetPath.split("/").slice(1).join("/")}\` — ${agora()}\n\n` +
    `**Op:** campo \`${op.field}\` de \`${op.fromValue ?? "(nenhum)"}\` para \`${op.toValue}\` ` +
    `(op_id \`${op.opId}\`, pedida em ${op.createdAt}, baseHash esperado \`${op.baseHash}\`)\n\n` +
    `**Motivo:** ${motivo === "sem-bloco-no-disco" ? "o bloco sumiu do disco" : "o hash do disco não bate mais com o esperado"}` +
    (motivo === "hash-divergente" ? ` — disco em \`${hashAtual}\`.\n\n` : ".\n\n") +
    `**Versão no disco agora:**\n\n\`\`\`\n${blocoAtualTexto ?? "(bloco não encontrado)"}\n\`\`\`\n\n` +
    `**Versão que a op pediria** (aplicada por cima do disco de agora, só para comparação — NÃO foi gravada):\n\n${versaoPedida}\n\n` +
    "---\n\n";

  writeFileSync(caminho, (existsSync(caminho) ? "" : cabecalho) + entrada, { flag: "a" });
}

/** Um `fetch` autenticado com o device token, contra `base`. */
function clienteDe(fetch, base, token) {
  return (caminho, opcoes = {}) =>
    fetch(`${base}${caminho}`, {
      ...opcoes,
      headers: { ...(opcoes.headers ?? {}), authorization: `Bearer ${token}` },
    });
}

/**
 * @param {{raiz: string, base: string, fetch: typeof globalThis.fetch, token: string, agora?: () => string}} args
 * @returns {Promise<{aplicadas: object[], conflitos: object[], travaOcupada: object[], erros: object[]}>}
 */
export async function drenarOps({ raiz, base, fetch, token, agora = () => new Date().toISOString() }) {
  const chamar = clienteDe(fetch, base, token);
  const resultado = { aplicadas: [], conflitos: [], travaOcupada: [], erros: [] };

  const respostaGet = await chamar("/api/sync/ops");
  if (respostaGet.status === 401) {
    resultado.erros.push({ motivo: "credencial-recusada" });
    return resultado;
  }
  if (!respostaGet.ok) {
    resultado.erros.push({ motivo: "sem-resposta", detalhe: `HTTP ${respostaGet.status}` });
    return resultado;
  }
  let corpo;
  try {
    corpo = await respostaGet.json();
  } catch {
    resultado.erros.push({ motivo: "resposta-malformada" });
    return resultado;
  }
  const ops = Array.isArray(corpo?.ops) ? corpo.ops : [];
  if (ops.length === 0) return resultado;

  // Agrupa por EPIC (um arquivo = uma trava), preservando a ordem de `seq`
  // que o servidor já devolveu — a ordem RELATIVA dentro de cada grupo é a
  // mesma da lista original.
  const grupos = new Map();
  for (const op of ops) {
    const alvo = resolverAlvo(op.targetPath);
    if (!alvo) {
      resultado.erros.push({ opId: op.opId, motivo: "targetPath-invalido", detalhe: op.targetPath });
      continue;
    }
    if (!grupos.has(alvo.arquivoRel)) grupos.set(alvo.arquivoRel, []);
    grupos.get(alvo.arquivoRel).push({ op, alvo });
  }

  for (const [arquivoRel, entradas] of grupos) {
    const handle = pegar(raiz, arquivoRel);
    if (!handle.ok) {
      resultado.travaOcupada.push({ arquivo: arquivoRel, motivo: handle.motivo });
      continue;
    }

    try {
      const caminhoAbs = join(raiz, arquivoRel);
      if (!existsSync(caminhoAbs)) {
        resultado.erros.push({ arquivo: arquivoRel, motivo: "arquivo-ausente" });
        continue;
      }
      let textoAtual = readFileSync(caminhoAbs, "utf8");
      const estado = lerSyncState(raiz);

      for (const { op, alvo } of entradas) {
        // Reenvio: já aplicado localmente numa rodada anterior que não
        // confirmou por causa da rede — só reenvia a confirmação, nunca
        // reescreve (C7).
        const jaAplicada = estado.aplicadas[op.opId];
        if (jaAplicada) {
          const r = await chamar(`/api/sync/ops/${op.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ estado: "APPLIED", resultHash: jaAplicada.resultHash }),
          });
          if (r.status === 200 || r.status === 409) {
            // 409 aqui é o servidor dizendo "já sei" (idempotência do LADO
            // DELE, S8.4) — não é falha, é confirmação de que bateu.
            resultado.aplicadas.push({ arquivo: arquivoRel, opId: op.opId, campo: op.field, reenvio: true });
          } else {
            resultado.erros.push({ arquivo: arquivoRel, opId: op.opId, motivo: "confirmacao-falhou", detalhe: `HTTP ${r.status}` });
          }
          continue;
        }

        const achado = acharBlocoDaStory(textoAtual, alvo.blockId);
        if (achado?.erro) {
          resultado.erros.push({ arquivo: arquivoRel, opId: op.opId, motivo: achado.erro });
          break; // estado anômalo do arquivo — não segue tentando as próximas ops dele
        }
        if (!achado) {
          anexarConflito(raiz, { arquivoRel, op, blocoAtualTexto: null, motivo: "sem-bloco-no-disco" }, agora);
          const r = await chamar(`/api/sync/ops/${op.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ estado: "CONFLICT", conflictNote: "sem-bloco-no-disco" }),
          });
          resultado.conflitos.push({ arquivo: arquivoRel, opId: op.opId, motivo: "sem-bloco-no-disco", confirmado: r.ok });
          break; // C4 — para no primeiro conflito DAQUELE arquivo
        }

        // T5b (review R4) — status fora do enum é recusado AQUI, antes do
        // CAS: o servidor já deveria ter barrado isto na criação da
        // intenção, então isto NÃO é um conflito de hash (por isso não passa
        // por `anexarConflito`/`CONFLICT`) — é uma op que nunca deveria ter
        // chegado. Recusa local, sem tocar o disco e sem confirmar nada ao
        // servidor: nem `APPLIED` (não foi aplicada) nem `CONFLICT` (não é
        // isso). A op expira em 14 dias (TTL do servidor) se ninguém a
        // corrigir. `continue`, não `break`: é um defeito DESTA op, as
        // outras ops do mesmo arquivo continuam válidas.
        if (!statusValido(op)) {
          resultado.erros.push({
            arquivo: arquivoRel,
            opId: op.opId,
            motivo: "status-invalido",
            detalhe: `"${op.toValue}" não está em ${statusQuadro().join(", ")}`,
          });
          continue;
        }

        const hashAtual = hashBloco(achado.blocoTexto);
        if (hashAtual !== op.baseHash) {
          const tentativa = escreverCampoDaStory(textoAtual, alvo.blockId, op.field, op.toValue, { agora });
          const blocoTentado = tentativa.ok ? acharBlocoDaStory(tentativa.textoNovo, alvo.blockId) : null;
          anexarConflito(
            raiz,
            {
              arquivoRel, op: { ...op, tentativaTexto: blocoTentado && !blocoTentado.erro ? blocoTentado.blocoTexto : null },
              blocoAtualTexto: achado.blocoTexto, hashAtual, motivo: "hash-divergente",
            },
            agora
          );
          const r = await chamar(`/api/sync/ops/${op.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ estado: "CONFLICT", conflictNote: `hash-divergente:${hashAtual}` }),
          });
          resultado.conflitos.push({ arquivo: arquivoRel, opId: op.opId, motivo: "hash-divergente", confirmado: r.ok });
          break; // C4 — para no primeiro conflito DAQUELE arquivo
        }

        const escrita = escreverCampoDaStory(textoAtual, alvo.blockId, op.field, op.toValue, { agora });
        if (!escrita.ok) {
          resultado.erros.push({ arquivo: arquivoRel, opId: op.opId, motivo: escrita.motivo });
          break;
        }

        escreverAtomico(caminhoAbs, escrita.textoNovo);
        textoAtual = escrita.textoNovo;
        marcarAplicada(raiz, op.opId, escrita.hashNovo, agora);
        estado.aplicadas[op.opId] = { resultHash: escrita.hashNovo };

        const r = await chamar(`/api/sync/ops/${op.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ estado: "APPLIED", resultHash: escrita.hashNovo }),
        });
        if (r.status === 200) {
          resultado.aplicadas.push({ arquivo: arquivoRel, opId: op.opId, campo: op.field });
        } else {
          // Já escrito e marcado no sync-state — a confirmação reenviará na
          // próxima rodada (C7). Não é um estado ambíguo, é um estado que
          // sabe se recuperar sozinho.
          resultado.erros.push({ arquivo: arquivoRel, opId: op.opId, motivo: "confirmacao-pendente", detalhe: `HTTP ${r.status}` });
        }
      }
    } finally {
      soltar(handle);
    }
  }

  return resultado;
}
