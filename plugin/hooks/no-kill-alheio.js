#!/usr/bin/env node
// PreToolUse hook: recusa `kill` / `taskkill` / `Stop-Process` contra um PID
// que a sessao nao declarou ter subido.
//
// PRECEDENTE (retro de 2026-09-06, feedback ratificado como `hook` pelo dono):
// o Forge subiu um servidor de teste na 5199, o processo morreu com
// EADDRINUSE, ele nao leu o `.err`, mediu `/api/qg` contra o processo que ja
// estava la (de outra sessao), estranhou o resultado e MATOU o PID. Nada se
// perdeu — foi sorte.
// (incidents/2026-09-06-node-alheio-derrubado-na-porta-de-teste.md)
//
// E a mesma familia do `git checkout` de 2026-09-04: agir sobre estado alheio
// sem olhar antes. Aquela ja tinha gotcha EM PROSA (nº 35 do Forge) e voltou
// assim mesmo — por isso esta vira trava, nao linha.
//
// COMO DECLARAR QUE O PID E SEU: escreva o numero em `hub/live/meus-pids.txt`
// (um por linha) logo depois de subir o processo. Sem o arquivo, o hook
// recusa qualquer kill por PID — que e o comportamento desejado: matar
// processo e ato raro, e um ato raro pode custar uma linha a mais.
//
// Contrato (code.claude.com/docs/en/hooks): stdin e o payload JSON; exit 2
// bloqueia a chamada e o stderr vira o motivo mostrado ao modelo. Qualquer
// outro desfecho deixa passar.
//
// FALHA ABERTA POR DESENHO, como os hooks irmaos: stdin invalido, campo
// faltando, ferramenta inesperada ou erro interno => exit 0 sem bloquear. Um
// hook quebrado nunca pode congelar o escritorio.
"use strict";

const fs = require("fs");
const path = require("path");

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const ARQUIVO_DE_PIDS = path.join("hub", "live", "meus-pids.txt");

/** Os PIDs que a sessao declarou ter subido. Ausencia = conjunto vazio. */
function pidsDeclarados() {
  try {
    if (!fs.existsSync(ARQUIVO_DE_PIDS)) return new Set();
    return new Set(
      fs.readFileSync(ARQUIVO_DE_PIDS, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^\d+$/.test(l))
    );
  } catch {
    return new Set();
  }
}

/**
 * Acha os PIDs que o comando quer matar.
 *
 * Cobre as tres formas que este escritorio usa de verdade:
 *   kill 1234 · kill -9 1234 · taskkill /PID 1234 /F · Stop-Process -Id 1234
 *
 * O que NAO e alvo, de proposito: matar por NOME (`taskkill /IM node.exe`,
 * `Stop-Process -Name node`) e ainda mais perigoso, mas nao ha PID para
 * comparar — ele e recusado sempre, mais abaixo, com motivo proprio.
 */
function pidsDoComando(cmd) {
  const alvos = [];
  let porNome = false;

  for (const m of cmd.matchAll(/\bkill\b([^|;&\n]*)/gi)) {
    const resto = m[1] || "";
    for (const n of resto.matchAll(/(?<![\w/-])(\d{2,7})(?![\w.])/g)) alvos.push(n[1]);
  }
  for (const m of cmd.matchAll(/\btaskkill\b([^|;&\n]*)/gi)) {
    const resto = m[1] || "";
    if (/\/IM\b/i.test(resto)) porNome = true;
    for (const n of resto.matchAll(/\/PID\s+(\d{2,7})/gi)) alvos.push(n[1]);
  }
  for (const m of cmd.matchAll(/\bStop-Process\b([^|;&\n]*)/gi)) {
    const resto = m[1] || "";
    if (/-Name\b/i.test(resto)) porNome = true;
    for (const n of resto.matchAll(/-Id\s+(\d{2,7})/gi)) alvos.push(n[1]);
  }
  return { alvos: [...new Set(alvos)], porNome };
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
    const tool = payload && payload.tool_name;
    if (!SHELL_TOOLS.has(tool)) process.exit(0);

    const cmd = String((payload.tool_input && payload.tool_input.command) || "");
    if (!cmd.trim()) process.exit(0);
    // Nem cita kill: o caso esmagadoramente comum sai daqui sem custo.
    if (!/\b(kill|taskkill|Stop-Process)\b/i.test(cmd)) process.exit(0);

    const { alvos, porNome } = pidsDoComando(cmd);

    if (porNome) {
      recusa(
        "RECUSADO: matar processo por NOME (`/IM`, `-Name`) atinge todo processo " +
        "com aquele nome, inclusive de outras sessoes e do dono.\n" +
        "Mate por PID, e declare o PID como seu em hub/live/meus-pids.txt.\n" +
        "Precedente: incidents/2026-09-06-node-alheio-derrubado-na-porta-de-teste.md"
      );
    }
    if (!alvos.length) process.exit(0);   // `kill` sem PID legivel: nao e o caso vigiado

    const meus = pidsDeclarados();
    const alheios = alvos.filter((p) => !meus.has(p));
    if (!alheios.length) process.exit(0);

    recusa(
      "RECUSADO: PID " + alheios.join(", ") + " nao foi declarado como subido por esta sessao.\n" +
      "Voce esta prestes a matar um processo cuja origem nao verificou — foi exatamente\n" +
      "isso que aconteceu em 2026-09-06 (o alvo era de outra sessao; nada se perdeu por sorte).\n\n" +
      "Se o processo E seu: escreva o PID em " + ARQUIVO_DE_PIDS + " (um por linha) ao subi-lo.\n" +
      "Se NAO e seu: nao mate. Reporte ao dono qual processo esta na porta.\n" +
      "Precedente: incidents/2026-09-06-node-alheio-derrubado-na-porta-de-teste.md"
    );
  } catch {
    process.exit(0);   // falha aberta: hook quebrado nunca congela o escritorio
  }
});
