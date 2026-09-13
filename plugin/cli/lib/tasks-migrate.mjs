import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { inserirBlocosFaltantes } from "./bloco-story.mjs";
import { escreverAtomico } from "./escrita-atomica.mjs";
import { pegar, soltar } from "./trava.mjs";

/**
 * E8 · T5.5 — `arvys tasks migrate` (S8.5, C5 da spec
 * `2026-09-saas-e8-escrita`): dá bloco `<!--arvys-->` a quem não tem, em
 * TODO `specs/<slug>/tasks.md` do repo.
 *
 * "POR REPO, a pedido do dono, nunca em lote automático sobre specs de
 * outro projeto" (spec, "Fora de escopo") — por isso varre só `specs/`
 * DENTRO de `raiz`, nunca sobe nem desce para fora dela.
 *
 * A MESMA trava do T2 protege a escrita — "não pode correr com um `arvys
 * sync` no meio" (tasks.md do plan.md): os dois usam
 * `.arvys/locks/specs/<slug>/tasks.md.lock`, o mesmo arquivo por spec que
 * `drenarOps` (T5) usa.
 */

/** Cada pasta imediata de `specs/` que tem um `tasks.md`. */
function specsComTasksMd(raiz) {
  const pastaSpecs = join(raiz, "specs");
  if (!existsSync(pastaSpecs)) return [];
  const entradas = readdirSync(pastaSpecs, { withFileTypes: true });
  return entradas
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((slug) => existsSync(join(pastaSpecs, slug, "tasks.md")))
    .sort();
}

/**
 * @param {{raiz: string, agora?: () => string, gerarId?: () => string}} args
 * @returns {{
 *   processados: {slug: string, arquivo: string, idsGerados: string[], quantos: number}[],
 *   travaOcupada: {slug: string}[],
 * }}
 */
export function migrarTasks({ raiz, agora = () => new Date().toISOString(), gerarId } = {}) {
  const resultado = { processados: [], travaOcupada: [] };

  for (const slug of specsComTasksMd(raiz)) {
    const arquivoRel = join("specs", slug, "tasks.md");
    const handle = pegar(raiz, arquivoRel);
    if (!handle.ok) {
      resultado.travaOcupada.push({ slug, motivo: handle.motivo });
      continue;
    }

    try {
      const caminhoAbs = join(raiz, arquivoRel);
      const textoAntes = readFileSync(caminhoAbs, "utf8");
      const { textoNovo, idsGerados, quantos } = inserirBlocosFaltantes(textoAntes, { agora, gerarId });

      // Idempotência (C5, "rodar duas vezes não duplica bloco"): 0 blocos a
      // inserir é 0 bytes escritos — `escreverAtomico` só roda quando há
      // mudança de verdade, para nunca tocar o `mtime` de um arquivo intacto.
      if (quantos > 0) escreverAtomico(caminhoAbs, textoNovo);

      resultado.processados.push({ slug, arquivo: arquivoRel, idsGerados, quantos });
    } finally {
      soltar(handle);
    }
  }

  return resultado;
}
