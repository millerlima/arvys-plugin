#!/usr/bin/env node
/**
 * `arvys` — o CLI que empurra (épico E3).
 *
 * Instalado do disco: `npm i -g ./plugin/cli`. Publicar no npm entra quando
 * houver um 2º usuário (decisão G16); enquanto é um, instalar da pasta entrega
 * o mesmo resultado sem nome reservado, versionamento público nem cadeia de
 * suprimentos.
 *
 * **Nenhuma seta entra** (arquitetura §4.1): tudo aqui é requisição de saída.
 * Não há daemon, não há watcher, não há porta escutando.
 *
 * **O TEXTO NÃO MORA MAIS AQUI** (E1 · T6, 2026-09-08). Todas as mensagens
 * saem de `lib/texto.mjs`, que lê o mesmo dicionário do front. Literal de
 * usuário neste arquivo é regressão do risco R7 — veja o cabeçalho de
 * `lib/texto.mjs` para o caminho completo da fonte até aqui.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { apagar, caminhoDaCredencial, gravar, gravarIdentidade, ler } from "./lib/credencial.mjs";
import { drenarOps, habilitarSync, lerSync } from "./lib/sync.mjs";
import { drenar, pendentes, push } from "./lib/push.mjs";
import { restaurar } from "./lib/restore.mjs";
import { migrarTasks } from "./lib/tasks-migrate.mjs";
import { rotuloDoPadrao } from "./lib/segredos.mjs";
import { t } from "./lib/texto.mjs";

const RAIZ = process.env.ARVYS_RAIZ || process.cwd();
const BASE = process.env.ARVYS_PUSH_BASE || "https://app.arvys.com.br";

/**
 * A ajuda montada do dicionário.
 *
 * Os NOMES dos comandos (`login`, `sync enable`) não são texto: são o que se
 * digita. Traduzi-los quebraria o comando em inglês — só a descrição ao lado
 * é frase de gente, e é só ela que sai do dicionário.
 */
function ajuda() {
  // A chave fica LITERAL dentro do `t()`, e não guardada numa tabela para ser
  // resolvida depois: o `check:i18n` acha o uso pela árvore sintática, e uma
  // chave escondida atrás de variável some da varredura — vira "verbete que
  // ninguém usa" e convida alguém a apagá-la. Custa uma linha a mais aqui e
  // devolve a fiscalização inteira.
  const comandos = [
    ["arvys login", t("cli.ajuda.login")],
    ["arvys whoami", t("cli.ajuda.whoami")],
    ["arvys logout", t("cli.ajuda.logout")],
    ["arvys sync enable", t("cli.ajuda.syncEnable")],
    ["arvys sync status", t("cli.ajuda.syncStatus")],
    ["arvys sync", t("cli.ajuda.sync")],
    ["arvys tasks migrate", t("cli.ajuda.tasksMigrate")],
    ["arvys push", t("cli.ajuda.push")],
    ["arvys restore", t("cli.ajuda.restore")],
  ];
  const largura = Math.max(...comandos.map(([c]) => c.length));
  return [
    "",
    t("cli.ajuda.titulo"),
    "",
    ...comandos.map(([c, d]) => `  ${c.padEnd(largura + 2)}${d}`),
    "",
    t("cli.ajuda.credencial"),
    t("cli.ajuda.listaBranca"),
  ].join("\n");
}

async function perguntar(texto) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(texto);
  } finally {
    rl.close();
  }
}

function kb(bytes) {
  return t("cli.geral.kb", { n: (bytes / 1024).toFixed(0) });
}

/** Mesmo teto do push (T9): host que aceita e nunca responde nao prende o CLI. */
function timeoutMs() {
  const n = Number(process.env.ARVYS_PUSH_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

/**
 * `GET /api/sync/whoami` — a unica pessoa que sabe de quem e' o token e o
 * servidor. A T4 do E3 deixou `email`/`escritorio` nulos na credencial por
 * isso mesmo, e esta funcao e a ponta que a T7 fecha.
 *
 * Tres estados, e nenhum deles e' uma excecao vazando para o dono:
 *
 * - `confirmado` — 200 com `{email, escritorio}` de verdade. Qualquer outra
 *   forma de 200 NAO conta como confirmacao (a licao do defeito 1 da T9: um
 *   200 malformado virava silencio otimista).
 * - `recusado` — 401. O token nao vale mais; nao ha cache que console.
 * - `sem-resposta` — rede caida, timeout, 5xx, proxy cuspindo HTML. Nao e'
 *   erro (S3.6): quem chama diz o cache, avisando que e cache.
 */
async function consultarWhoami(token) {
  let r;
  try {
    r = await fetch(`${BASE}/api/sync/whoami`, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (e) {
    return { estado: "sem-resposta", motivo: String(e.cause?.code ?? e.name ?? e.message) };
  }

  if (r.status === 401) return { estado: "recusado" };

  let corpo = null;
  try {
    corpo = await r.json();
  } catch {
    /* HTML de proxy, corpo vazio, JSON torto: nao da para confirmar nada */
  }

  if (!r.ok || typeof corpo?.email !== "string") {
    return { estado: "sem-resposta", motivo: `HTTP ${r.status}` };
  }
  return { estado: "confirmado", email: corpo.email, escritorio: corpo.escritorio ?? null };
}

const [comando, sub] = process.argv.slice(2);

switch (comando) {
  case "login": {
    const token = (await perguntar(t("cli.login.pergunta"))).trim();
    if (!token.startsWith("arv_live_")) {
      console.error("  " + t("cli.login.tokenInvalido"));
      process.exitCode = 1;
      break;
    }
    const { caminho, permissao } = gravar({ token });
    console.log("  " + t("cli.login.gravada", { caminho }));
    if (!permissao.restringiu) {
      // Nunca em silencio: a permissao e parte da promessa.
      console.log("  " + t("cli.login.permissaoAtencao", { como: permissao.como }));
      console.log(`  ${permissao.erro ?? ""}`);
      console.log("  " + t("cli.login.permissaoConfira"));
    }
    break;
  }

  case "whoami": {
    const c = ler();
    if (!c) {
      console.log("  " + t("cli.whoami.ninguem"));
      break;
    }
    console.log("  " + t("cli.whoami.token", { prefixo: c.token.slice(0, 15), caminho: caminhoDaCredencial() }));

    const r = await consultarWhoami(c.token);

    if (r.estado === "confirmado") {
      // Fonte da verdade: a resposta do servidor. O arquivo e' so' o eco dela,
      // gravado agora para o proximo whoami ter o que dizer sem rede.
      gravarIdentidade({ email: r.email, escritorio: r.escritorio });
      console.log("  " + t("cli.whoami.identidade", { email: r.email, escritorio: r.escritorio }));
      break;
    }

    if (r.estado === "recusado") {
      // 401 e' o servidor dizendo que aquele token nao responde mais por
      // ninguem. Mostrar o e-mail guardado aqui seria apresentar como valida
      // uma identidade que o servidor acabou de negar — o cache nao entra.
      console.error("  " + t("cli.whoami.recusado"));
      process.exitCode = 1;
      break;
    }

    // Sem resposta do servidor. Rede caida nao e erro (S3.6) — mas dizer o
    // cache SEM dizer que e cache seria apresentar dado velho como fresco.
    if (c.email) {
      console.log(
        "  " +
          t("cli.whoami.identidade", {
            email: c.email,
            escritorio: c.escritorio ?? t("cli.whoami.escritorioDesconhecido"),
          })
      );
      console.log("  " + t("cli.whoami.cache", { quando: c.confirmado_em ?? c.gravado_em ?? t("cli.whoami.dataDesconhecida") }));
    } else {
      console.log("  " + t("cli.whoami.naoConfirmada"));
    }
    console.log("  " + t("cli.whoami.motivo", { motivo: r.motivo }));
    break;
  }

  case "logout":
    console.log("  " + (apagar() ? t("cli.logout.apagada") : t("cli.logout.naoHavia")));
    break;

  case "sync": {
    if (sub === "status") {
      const s = lerSync(RAIZ);
      const n = pendentes(RAIZ).length;
      console.log("  " + (s ? t("cli.sync.empurraDesde", { quando: s.habilitado_em }) : t("cli.sync.naoEmpurra")));
      if (n) console.log("  " + t(n === 1 ? "cli.sync.pendentes.um" : "cli.sync.pendentes.varios", { n }));
      break;
    }

    // `arvys sync` SEM subcomando — genesis `04-arquitetura.md:187`: "Push +
    // drenagem das ops pendentes". Mesmo nome de comando, 2º sentido — não é
    // um comando novo (spec `2026-09-saas-e8-escrita`, tabela "o que já
    // existe").
    if (sub === undefined) {
      if (!lerSync(RAIZ)) {
        console.error("  " + t("cli.push.semSync"));
        process.exitCode = 1;
        break;
      }
      const credencial = ler();
      if (!credencial) {
        console.error("  " + t("cli.push.semCredencial"));
        process.exitCode = 1;
        break;
      }

      // 1º drena as ops da nuvem para o disco — o dono espera ver o efeito
      // do que arrastou pela tela ANTES de subir o resultado.
      const d = await drenarOps({ raiz: RAIZ, base: BASE, fetch: globalThis.fetch, token: credencial.token });
      if (d.aplicadas.length) console.log("  " + t(d.aplicadas.length === 1 ? "cli.sync.ops.aplicada.um" : "cli.sync.ops.aplicada.varios", { n: d.aplicadas.length }));
      for (const c of d.conflitos) console.log("  " + t("cli.sync.ops.conflito", { arquivo: c.arquivo }));
      for (const o of d.travaOcupada) console.log("  " + t("cli.sync.ops.travaOcupada", { arquivo: o.arquivo }));
      for (const e of d.erros) console.error("  " + t("cli.sync.ops.erro", { detalhe: e.motivo }));
      if (!d.aplicadas.length && !d.conflitos.length && !d.travaOcupada.length && !d.erros.length) {
        console.log("  " + t("cli.sync.ops.nenhuma"));
      }

      // 2º sobe o que mudou — o `tasks.md` que a drenagem acabou de tocar
      // inclusive, para a projeção do servidor refletir a mudança aplicada.
      if (pendentes(RAIZ).length) {
        const dp = await drenar({ raiz: RAIZ, base: BASE, fetch: globalThis.fetch });
        if (dp.enviados.length) console.log("  " + t("cli.push.filaDrenada", { n: dp.enviados.length }));
      }
      try {
        const r = await push({ raiz: RAIZ, base: BASE, fetch: globalThis.fetch });
        console.log(
          "  " +
            (r.estado === "enviado"
              ? t("cli.push.enviado", { id: r.push_id.slice(0, 12) })
              : t(r.pendentes === 1 ? "cli.push.enfileirado.um" : "cli.push.enfileirado.varios", { n: r.pendentes }))
        );
      } catch (e) {
        if (e.achados?.length) {
          console.error("  " + t("cli.push.recusado"));
          process.exitCode = 1;
          break;
        }
        throw e;
      }
      break;
    }

    if (sub !== "enable") {
      console.error("  " + t("cli.sync.usoInvalido"));
      process.exitCode = 1;
      break;
    }

    const r = await habilitarSync({
      raiz: RAIZ,
      perguntar: async (resumo) => {
        console.log(`\n  ${t("cli.sync.resumo.cabecalho", { total: resumo.total, tamanho: kb(resumo.bytes) })}\n`);
        for (const a of resumo.arquivos) console.log(`    ${String(kb(a.bytes)).padStart(8)}  ${a.caminho}`);
        console.log("\n  " + t("cli.sync.resumo.nadaMais"));
        // A palavra pedida e a palavra aceita saem da MESMA chave — pedir em
        // ingles e so aceitar portugues seria botao morto (A11).
        return perguntar("\n  " + t("cli.sync.pergunta", { palavra: t("cli.sync.palavraDeConfirmacao") }));
      },
    });

    if (r.estado === "ja-habilitado") console.log("  " + t("cli.sync.jaHabilitado", { quando: r.sync.habilitado_em }));
    else if (r.motivo === "dicionario-ilegivel") {
      // A UNICA frase literal do CLI, e por um motivo que nao se contorna: e a
      // mensagem de que o DICIONARIO nao abriu. Buscar no dicionario o texto
      // que diz "o dicionario esta quebrado" e a definicao de circular — sairia
      // o nome da chave. Fica em ingles porque `en` e o padrao do produto.
      console.error(
        `\n  REFUSED — the dictionary could not be read (${r.detalhe}). ` +
          "Nothing was written. Run `npm run hub:sync` in the arvys-app repo to rebuild plugin/cli/dict/."
      );
      process.exitCode = 1;
    } else if (r.motivo === "palavra-vazia") {
      console.error("\n  " + t("cli.sync.recusadoPalavraVazia", { chave: r.detalhe }));
      process.exitCode = 1;
    } else if (r.estado === "recusado") console.log("\n  " + t("cli.sync.recusado"));
    else console.log("\n  " + t("cli.sync.habilitado", { arquivos: r.sync.arquivos_no_optin }));
    break;
  }

  case "tasks": {
    // S8.5 — "roda POR REPO, a pedido do dono": um comando explícito, nunca
    // parte de `arvys sync`/`arvys push`. `migrarTasks` já varre só
    // `specs/` dentro de `RAIZ`.
    if (sub !== "migrate") {
      console.error("  " + t("cli.tasks.usoInvalido"));
      process.exitCode = 1;
      break;
    }

    const r = migrarTasks({ raiz: RAIZ });
    if (!r.processados.length && !r.travaOcupada.length) {
      console.log("  " + t("cli.tasks.migrate.nenhumSpec"));
      break;
    }
    let total = 0;
    for (const p of r.processados) {
      if (p.quantos > 0) {
        total += p.quantos;
        console.log("  " + t("cli.tasks.migrate.blocosAdicionados", { slug: p.slug, n: p.quantos, ids: p.idsGerados.join(", ") }));
      } else {
        console.log("  " + t("cli.tasks.migrate.jaCompleto", { slug: p.slug }));
      }
    }
    for (const o of r.travaOcupada) {
      console.log("  " + t("cli.tasks.migrate.travaOcupada", { slug: o.slug }));
    }
    console.log("  " + t(total === 1 ? "cli.tasks.migrate.total.um" : "cli.tasks.migrate.total.varios", { n: total }));
    break;
  }

  case "push": {
    if (!lerSync(RAIZ)) {
      console.error("  " + t("cli.push.semSync"));
      process.exitCode = 1;
      break;
    }
    if (!ler()) {
      console.error("  " + t("cli.push.semCredencial"));
      process.exitCode = 1;
      break;
    }
    try {
      if (pendentes(RAIZ).length) {
        const d = await drenar({ raiz: RAIZ, base: BASE, fetch: globalThis.fetch });
        if (d.enviados.length) console.log("  " + t("cli.push.filaDrenada", { n: d.enviados.length }));
      }
      const r = await push({ raiz: RAIZ, base: BASE, fetch: globalThis.fetch });
      console.log(
        "  " +
          (r.estado === "enviado"
            ? t("cli.push.enviado", { id: r.push_id.slice(0, 12) })
            : t(r.pendentes === 1 ? "cli.push.enfileirado.um" : "cli.push.enfileirado.varios", { n: r.pendentes }))
      );
    } catch (e) {
      if (e.achados?.length) {
        console.error("  " + t("cli.push.recusado"));
        const mostrados = e.achados.slice(0, 10);
        for (const a of mostrados) {
          console.error(
            "    " + t("cli.push.achado", {
              caminho: a.caminho,
              linha: a.linha,
              padrao: rotuloDoPadrao(a.id),
              trecho: a.trecho,
            })
          );
        }
        const fora = e.achados.length - mostrados.length;
        // T9 defeito 10: truncar em 10 sem dizer quantos ficaram de fora faz
        // o dono corrigir 10, rodar de novo, e achar que zerou.
        if (fora > 0) {
          console.error(
            "    " +
              t(fora === 1 ? "cli.push.maisAchados.um" : "cli.push.maisAchados.varios", {
                n: fora,
                total: e.achados.length,
              })
          );
        }
        process.exitCode = 1;
        break;
      }
      throw e;
    }
    break;
  }

  case "restore": {
    if (!ler()) {
      console.error("  " + t("cli.push.semCredencial"));
      process.exitCode = 1;
      break;
    }
    try {
      const r = await restaurar({ diretorio: RAIZ, base: BASE, fetch: globalThis.fetch });
      console.log("  " + t(r.restaurados === 1 ? "cli.restore.feito.um" : "cli.restore.feito.varios", { n: r.restaurados }));
      if (r.falhas.length) {
        console.error("  " + t(r.falhas.length === 1 ? "cli.restore.falhas.um" : "cli.restore.falhas.varios", { n: r.falhas.length }));
        // T9 defeito 10 do push, mesma disciplina aqui: nunca truncar sem
        // dizer quantos ficaram de fora.
        const mostradas = r.falhas.slice(0, 10);
        for (const f of mostradas) console.error(`    ${f.caminho}: ${f.motivo}`);
        const fora = r.falhas.length - mostradas.length;
        if (fora > 0) console.error("    " + t(fora === 1 ? "cli.push.maisAchados.um" : "cli.push.maisAchados.varios", { n: fora, total: r.falhas.length }));
        process.exitCode = 1;
      }
    } catch (e) {
      if (e.diretorioNaoVazio) {
        console.error("  " + t("cli.restore.diretorioNaoVazio"));
        process.exitCode = 1;
        break;
      }
      if (e.semPush) {
        console.error("  " + t("cli.restore.semPush"));
        process.exitCode = 1;
        break;
      }
      throw e;
    }
    break;
  }

  case "--help":
  case "-h":
  case undefined:
    console.log(ajuda());
    break;

  default:
    console.error("  " + t("cli.geral.comandoDesconhecido", { comando }) + "\n");
    console.log(ajuda());
    process.exitCode = 1;
}
