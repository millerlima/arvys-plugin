#!/usr/bin/env node
// PreToolUse hook: recusa gravar TEXTO via shell quando o texto carrega barra
// invertida seguida de letra, ou crase — o shell (bash, heredoc, `node -e`,
// `python -c`) come ou traduz esses caracteres EM SILENCIO e o arquivo nasce
// torto sem ninguem ver.
//
// PRECEDENTE (retro 5, 2026-09-12 — feedback ratificado como `hook` pelo dono;
// ja tinha sido ratificado como `hook` na retro 4, em 2026-09-08, e nao foi
// construido): o gotcha 47/49 do Forge foi violado 3x em 07/09 e 2x em 12/09
// — caminho Windows virando byte 0x07, `\n` de caso de teste virando quebra de
// linha real (o teste nem carregou), crase interpretada ao gravar o proprio
// gotcha. Cinco violacoes em seis dias de uma lei escrita em prosa: por isso
// vira trava, nao linha. (specs/2026-09-qg-redesenho-2/evidence/t6-review-A.md)
//
// O QUE E VIGIADO: um comando que GRAVA texto — heredoc (`<<`), `node -e`,
// `python -c`, `python -`, `echo`/`printf` redirecionado (`>`, `>>`) — e cujo
// corpo contem `\` seguido de letra (`\n`, `\t`, `\d`, `C:\Users`…) ou crase.
// Comando que so LE ou so EXECUTA nao e alvo.
//
// COMO LIBERAR QUANDO O ESCAPE E INTENCIONAL: escreva `escape-ok: <motivo>` em
// qualquer lugar do comando (num comentario `#`, por exemplo). O motivo fica
// no historico da sessao. Sem motivo, use a ferramenta Edit/Write — e o que a
// lei sempre disse.
//
// Contrato (code.claude.com/docs/en/hooks): stdin e o payload JSON; exit 2
// bloqueia e o stderr vira o motivo mostrado ao modelo.
//
// FALHA ABERTA POR DESENHO, como os hooks irmaos: stdin invalido, campo
// faltando, ferramenta inesperada ou erro interno => exit 0 sem bloquear.
"use strict";

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

/**
 * Heredoc SEGURO (retro 6, 2026-09-13): delimitador entre aspas simples e
 * consumidor `cat`/`tee`. O bash nao interpreta nada dentro de <<'X' e cat/tee
 * nao traduzem escape — o texto chega ao arquivo byte a byte. O hook recusou 3x
 * em 13/09 exatamente essa forma, sem ter evitado arquivo torto nenhum.
 * `python - <<'PY'` continua vigiado: ali quem come o escape e o Python, nao o
 * shell (o precedente do gotcha 47). Devolve o comando com esses corpos removidos.
 */
function semHeredocSeguro(cmd) {
  return cmd.replace(
    /\b(cat|tee)\b[^\n]*<<-?\s*'(\w+)'[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g,
    "<heredoc-seguro>"
  );
}

/** O comando grava texto por shell? (as formas que o escritorio usa de verdade) */
function gravaTexto(cmd) {
  return (
    /<<-?\s*['"]?\w+['"]?/.test(cmd) ||            // heredoc
    /\bnode\s+(-e|--eval)\b/.test(cmd) ||         // node -e
    /\bpython3?\s+(-c\b|-\s*<<)/.test(cmd) ||     // python -c / python - <<
    /\b(echo|printf)\b[^|\n]*>{1,2}\s*\S/.test(cmd) // echo … > arquivo
  );
}

/** Onde esta o escape que o shell vai comer? Devolve trecho legivel ou null. */
function escapePerigoso(cmd) {
  const barra = cmd.match(/\\[A-Za-z]/);
  if (barra) return "barra invertida + letra em `" + trecho(cmd, barra.index) + "`";
  const crase = cmd.indexOf("`");
  if (crase >= 0) return "crase em `" + trecho(cmd, crase) + "`";
  return null;
}

function trecho(s, i) {
  return s.slice(Math.max(0, i - 18), i + 18).replace(/\s+/g, " ");
}

function recusa(motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

let bruto = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { bruto += c; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(bruto);
    if (!SHELL_TOOLS.has(payload && payload.tool_name)) process.exit(0);

    const cmd = semHeredocSeguro(String((payload.tool_input && payload.tool_input.command) || ""));
    if (!cmd.trim()) process.exit(0);
    if (/escape-ok:\s*\S/.test(cmd)) process.exit(0);   // motivo escrito libera
    if (!gravaTexto(cmd)) process.exit(0);              // so LE/executa: passa

    const onde = escapePerigoso(cmd);
    if (!onde) process.exit(0);

    recusa(
      "RECUSADO: este comando GRAVA texto pelo shell e o texto tem " + onde + ".\n" +
      "Heredoc, `node -e`, `python -c` e `echo >` comem barra invertida e crase em\n" +
      "silencio — o arquivo nasce torto e ninguem ve (gotcha 47/49 do Forge, violado 5x\n" +
      "em 6 dias). Use a ferramenta Edit ou Write para esse texto.\n" +
      "Se o escape E intencional, escreva `escape-ok: <motivo>` no proprio comando.\n" +
      "Precedente: specs/2026-09-qg-redesenho-2/evidence/t6-review-A.md (retro 5, 2026-09-12)"
    );
  } catch {
    process.exit(0);   // falha aberta: hook quebrado nunca congela o escritorio
  }
});
