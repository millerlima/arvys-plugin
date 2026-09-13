import { closeSync, fsyncSync, openSync, renameSync, writeSync } from "node:fs";

/**
 * `conteudo.tmp → fsync → rename` — o padrão que o repo já usa para o
 * outbox (`push.mjs`), extraído para módulo próprio porque T5
 * (`drenarOps`) e T7 (`arvys tasks migrate`) escrevem `tasks.md` da MESMA
 * forma e não há motivo para duas cópias.
 *
 * `rename` no MESMO volume é atômico no SO: quem lê o arquivo nunca vê uma
 * metade — ou o `tmp` de antes (se o processo morrer antes do rename), ou o
 * conteúdo novo inteiro, nunca uma mistura dos dois.
 */
export function escreverAtomico(caminho, conteudo) {
  const tmp = caminho + ".tmp";
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, conteudo, null, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, caminho);
}
