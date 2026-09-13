---
titulo: FAQ e problemas
ordem: 06
cenarios: [primeira-sessao, adotar-projeto, fix]
perfil: ambos
---

# FAQ e problemas — os 10 tropeços do dia 1

> Analogia: o manual da máquina de lavar tem uma página "não liga? confira
> a tomada". Esta é aquela página. Todo item aqui aconteceu de verdade —
> a fonte está em `incidents/` ou na evidência da spec que o achou.

Regra geral antes de qualquer item: **quando um hook recusa, ele está
certo até prova em contrário.** Ele foi escrito depois de um incidente
real; a mensagem de recusa cita qual.

---

## 1 · Rodei `/arvys:start` e o `/arvys:status` diz "não há escritório aqui"

**O que é:** loop do primeiro minuto. O `start` gravou só o `OWNER.md` e não
criou `company/STATE.md` — o único arquivo que o `status` lê.

**Fonte:** `specs/2026-09-plugin-distribuicao/evidence/teste-do-estranho.md`
("o `start` passou a CRIAR o escritório", 2026-09-06). Corrigido no plugin
0.10.0+: o `start` cria `company/STATE.md` e `company/DECISIONS.md` depois
das 2 respostas.

**Saída:** atualize o plugin (`claude plugin update arvys@arvys`, reinicie) e
rode `/arvys:start` de novo. Ele **não** sobrescreve o que já existe. Se
`company/STATE.md` existir e o `status` ainda reclamar, o arquivo está
torto — abra e confira que tem `## Blockers` e a tabela `| Agente | L1 |`.

---

## 2 · Os rituais `/arvys:*` sumiram depois de atualizar

**O que é:** a versão do marketplace subiu e a instalada não. Precedente:
marketplace em 0.2.0, instalação em 0.1.0, todos os rituais fora do ar.

**Fonte:** gotcha 37 do Forge (`agents/forge/GOTCHAS.md`, família F7).

**Saída:**

```
claude plugin marketplace update arvys
claude plugin update arvys@arvys
```

e **reinicie a sessão**. Confira com `claude plugin list` — a versão que
importa é a instalada, não a do marketplace. Mesma versão responde "already
at the latest version": isso é normal.

---

## 3 · O hook recusou meu comando com "barra invertida" ou "crase"

**O que é:** o `no-escape-em-shell` recusa heredoc, `node -e`, `python -c` e
`echo >` cujo texto tenha `\` + letra ou crase. Motivo: em 2026-09-06 um
`\b` virou o byte de controle `0x08` em dois sensores, que continuaram
**sintaticamente válidos** e pararam de medir qualquer coisa. Violado 5× em
6 dias depois de escrito em prosa — virou hook na retro 5.

**Fonte:** `incidents/2026-09-06-escapes-comidos-por-heredoc.md`; gotchas 47
e 49 do Forge.

**Saída:** conteúdo com barra invertida ou crase vai pela ferramenta de
escrita (Write/Edit), nunca por string de shell. Em caminho, use `/`, que o
Windows aceita. Se o caso é legítimo, libere com motivo:
`escape-ok: <motivo>` no próprio comando.

---

## 4 · O hook recusou `git checkout` / `git restore` / `git stash`

**O que é:** o `no-git-restore` recusa restaurar arquivo em `agents/**`,
`company/**` e `specs/**`. Motivo: um executor "limpou" com `git checkout`
um arquivo que era saída de **outra** frente rodando em paralelo — apesar do
mandato dizer NUNCA em caixa alta. Prosa não segurou; virou hook.

**Fonte:** `incidents/2026-09-04-git-checkout-apesar-do-mandato.md`; gotcha
35 do Forge.

**Saída:** arquivo fora da sua pegada que mudou sozinho é de outra frente —
registre na evidência e siga. Se a mudança é **sua**, de 1 minuto atrás, e
precisa voltar:

```
git show HEAD:<caminho> > <caminho>
```

com o motivo escrito no chat. O hook não tem como provar de quem é a mudança,
e não vai ter.

---

## 5 · O hook recusou `kill` / `taskkill` / `Stop-Process`

**O que é:** o `no-kill-alheio` recusa matar PID que você não declarou, e
recusa **sempre** matar por nome. Motivo: um executor subiu servidor de teste
na porta 5199, deu `EADDRINUSE`, mediu contra o processo alheio que já estava
lá e, ao perceber, **matou o PID que não era dele**.

**Fonte:** `incidents/2026-09-06-node-alheio-derrubado-na-porta-de-teste.md`;
gotcha 44 do Forge.

**Saída:** antes de qualquer medição contra `127.0.0.1:<porta>`, cole na
evidência o PID que **você** subiu e a saída de `netstat -ano | findstr :<porta>`.
Para poder derrubar o seu, declare-o em `hub/live/meus-pids.txt`. PID que
você não subiu, você não mata — reporte.

---

## 6 · O hook recusou uma ferramenta de banco / infra em produção

**O que é:** o `no-infra-prod-sem-linha` recusa `mcp__neon__*` de escrita,
`run_sql` com DELETE/DROP/TRUNCATE/ALTER, `deleteMany`, `prisma db push`.
Dois precedentes: um executor apagou 13 usuários e 30 blobs num pedido de
**uma linha de `console.log`** (mandato proibindo); e um restore de snapshot
**trocou a `main` de produção** por 25 minutos.

**Fonte:** `incidents/2026-09-09-executor-apagou-dados-do-banco-sem-autorizacao.md`
e `incidents/2026-09-12-restore-snapshot-do-neon-trocou-a-main-de-producao.md`;
gotchas 55 e 65.

**Saída:** escreva a linha-antes-de-chamar em `hub/live/infra-ok.txt`:
`<ferramenta> <project_id|*> — <efeito traduzido> — confirmo`. Se você não
consegue escrever em uma linha o que a ferramenta faz com a `main` e os
computes, **pare** — a resposta certa é relatar, não agir. Achado destrutivo
se relata; a tarefa segue.

---

## 7 · O briefing diz "DADO VELHO: a medição tem N dias"

**O que é:** a corrente noturna não rodou — máquina desligada, ou um elo
parou. O worker mede a idade da própria medição e grita no arquivo a partir
de 2 dias, em vez de confiar que alguém compare datas de cabeça.

**Fonte:** `specs/2026-09-briefing-diario/evidence/reviewer.md` (R3: "defesa
que depende de alguém lembrar não é defesa"); gotcha 27.

**Saída:** rode a corrente (`scripts\noite.cmd` no escritório de referência;
o seu `start` diz o caminho) **antes** de decidir qualquer coisa com esses
números. Execução agendada se prova com `LastRunTime`/`LastTaskResult` da
tarefa, nunca pelo log (`incidents/2026-09-03-teste-manual-registrado-como-corrente.md`).

---

## 8 · O `/arvys:status` acusa "L1 defasado" para um agente

**O que é:** o agente não fechou sessão há mais de N dias. Significa **duas
coisas opostas** — "não trabalhou" ou "trabalhou sem `/arvys:close`" — e só
você sabe qual. Limiar: 3 dias para agente `ativo`, 14 para `standby`.

**Fonte:** `company/DECISIONS.md`, mesa G14 de 2026-09-07 (achados caíram de
9 para 1).

**Saída:** se trabalhou, `/arvys:open <agente>` e `/arvys:close` — o L1
propaga. Se não trabalha mesmo, mude `status: standby` no `AGENT.md` dele.
Agente parado há mais de duas semanas muda a pergunta de "cadê o close?" para
"por que este agente existe?" — e isso também merece aparecer.

---

## 9 · "Está no ar" e não estava (ou estava, e público)

**O que é:** duas faces do mesmo erro. (a) Dev server não pega type error —
o build de produção sim. (b) O QG ficou **público na internet por alguns
minutos** porque a mensagem da CLI ("proteção gerada") foi lida como prova de
proteção; produção é pública por padrão na Vercel.

**Fonte:** `OWNER.md`, anti-padrão 3; `incidents/2026-09-06-qg-publicado-antes-da-trava.md`;
gotchas 3 e 8 do Forge.

**Saída:** "pronto" de deploy exige: `tsc`/build de produção verde, URL/SHA
**fixados antes** de esperar (não "o primeiro da lista"), deploy READY
conferido pelo SHA, e — para conteúdo interno — um `curl` **sem credencial**
colado na evidência devolvendo 401/403. Print do painel não vale.

---

## 10 · A flag que eu sempre usei não existe mais

**O que é:** `prisma db push --skip-generate` foi escrita de memória; o
Prisma 7 removeu a opção. Custou uma rodada de CI e um ciclo de atenção do
dono ("E2E ainda vermelho" depois de o conserto ter sido anunciado).

**Fonte:** `incidents/2026-09-02-prisma7-flag-removida.md`; gotcha 12.

**Saída:** flag de CLI só depois do `--help` da versão instalada:

```
npx <cli> <comando> --help
```

Vale para prisma, next, playwright, vercel — todos mudam flags entre majors.
E quando o alvo é feature de CLI instalada, o `--help` local vem **antes** da
web: a busca devolve homônimos primeiro (gotcha 4 do Scout).

---

## Perguntas rápidas

**Posso rodar duas sessões no mesmo repo?** Sim, com pegada de escrita
disjunta ou worktree — [02-contexto-e-sessao.md](02-contexto-e-sessao.md).

**O escritório commita sozinho?** Nunca. Escrever em git é ato explícito
(princípio 5 em [00-comece-aqui.md](00-comece-aqui.md)). Auto-commit e
auto-merge estão desligados por decisão do dono (`OWNER.md`).

**O orquestrador me perguntou uma coisa técnica que eu não sei julgar.**
Peça a mesa aberta: "abram a mesa, decidam e registrem". Você lê o resultado
e corrige o que não gostar (`OWNER.md`, "Mesa aberta é o método padrão").

**Ele está me parando demais para perguntar.** Diga. A regra é uma pergunta
por decisão de fundo, zero por decisão de forma; "pode seguir" vale para o
bloco inteiro. Gates que continuam obrigatórios: spec L2+, commit/push,
deploy, banco, `.env`, apagar arquivo, comunicação externa.

**A tela do QG mostra "torto".** O arquivo existe e o leitor não entendeu.
Ele mostra o pedaço cru de propósito — abra o caminho indicado e conserte o
formato. Esconder seria pior.

**Onde vejo o que já deu certo?** [07-exemplos-reais.md](07-exemplos-reais.md).
