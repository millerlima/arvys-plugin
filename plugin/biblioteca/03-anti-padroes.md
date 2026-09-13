---
titulo: Anti-padrões
ordem: 03
cenarios: [semana, fix, feature]
perfil: ambos
---

# Anti-padrões — os 4 hábitos que custaram caro

> Analogia: buraco na rua. Todo mundo passa por cima até alguém medir quanto
> custa em pneu. Aqui cada buraco tem o preço medido e a fonte — porque
> número de blog não é métrica (gotcha 1 do Scout: "calibrar sempre com
> `/usage` e `/insights` próprios").

Regra de leitura: **custo sem fonte é `n/d`, nunca um número** — é a regra do
próprio `company/METRICS.md`. Onde não medimos, está escrito "não medido".

---

## 1 · Sessão-novela

**O hábito:** um chat só para o dia inteiro, assuntos misturados. O assunto 1
inteiro é reenviado a cada mensagem enquanto você trata o assunto 5.

**O custo medido:**

- **91% do gasto em contexto acima de 150k tokens** — retro 1, 2026-09-02,
  `company/DECISIONS.md` ("Retro semanal nº 1") e a coluna "Gasto em ctx
  >150k" de `company/METRICS.md`. A cota estava em 41%, o que parecia
  saudável; o número escondido era onde o dinheiro ia.
- **Baseline pré-Arvys (agosto, `/insights`):** 43 sessões, 406 h,
  **≥3 sessões abandonadas** por rate limit ou crash — `company/METRICS.md`,
  primeira linha.
- O QG passou a marcar sessão-novela por **cache read ≥ 50M tokens**; calibrado
  na review porque 20M marcava 49% das sessões e 50M marca 33% —
  `company/DECISIONS.md`, "QG onda 1 entregue" (2026-09-02).

**A saída:** uma tarefa = uma sessão. `/arvys:open` → trabalho →
`/arvys:close` → `/clear` ([02-contexto-e-sessao.md](02-contexto-e-sessao.md),
movimento 1).

---

## 2 · `/compact` por hábito

**O hábito:** o chat pesou, você aperta `/compact` para "aliviar". Ele relê a
conversa inteira para resumi-la — é em si uma requisição do tamanho do
contexto atual — e resume **com perda**.

**O custo medido:** `n/d` — **não medimos** um `/compact` isolado neste
escritório, e não vamos inventar. O que está medido é o contexto em que ele
costuma ser apertado: a faixa acima de 150k tokens, que concentrava 91% do
gasto (fonte acima). Compactar ali custa uma mensagem do tamanho do baú.
A régua de comparação, essa é exata: **`/clear` custa zero**, porque o
`/arvys:close` já salvou tudo em arquivo.

**Onde a regra está escrita:** `plugin/skills/checkpoint/SKILL.md` ("Nunca usar
`/compact` como alternativa: é caro e com perda") e `docs/ORIGEM.md`.

**A saída:** sessão cresceu e não acabou → `/arvys:checkpoint` → `/clear` →
`/arvys:open` de novo. Grátis e sem perda.

---

## 3 · Colar arquivo inteiro no chat

**O hábito:** para "dar contexto", colar o arquivo. Ou pior: uma ferramenta
que lê o arquivo inteiro toda sessão, sem ninguém pedir.

**O custo medido:**

- **Imposto de contexto permanente**, achado pelo reviewer em 2026-09-02:
  o `/arvys:open` lia a caixa de recados (INBOX) **inteira toda sessão**, e
  ela crescia sem limite. Correção: poda os lidos mantendo 20, nunca toca em
  não lido — `company/DECISIONS.md`, "Limpeza do review #29".
- O `CLAUDE.md` é cobrado em **toda mensagem de toda sessão**; estava em ~700
  tokens e foi cortado para ~570 na retro 1, com teto de 600 —
  `company/DECISIONS.md` (retro 1). Cada 100 tokens ali são 100 tokens ×
  todas as mensagens × todas as sessões.
- **Prompt colado gigante quebra a guarda:** o coach de prompt ignora
  prompts acima de 4 kB de propósito, porque texto colado não é pedido
  (spec desta biblioteca, `specs/2026-09-biblioteca/spec.md`, estado (b)).

**A saída:** aponte o caminho (`src/app/x/page.tsx:40-80`); o agente lê o
trecho. Saída de teste → só as falhas. Log → `grep`/`tail`. Exploração →
`explorer`, que devolve 10 linhas.

---

## 4 · Pular o `/arvys:close`

**O hábito:** terminou, fechou a janela. O estado ficou só no chat.

**O custo medido:**

- **Perda de estado com cara de "não trabalhou":** o sensor `L1 defasado`
  acusa o agente que não fecha sessão. Mesa de 2026-09-07 (`company/DECISIONS.md`,
  "G14"): o achado significa **duas coisas opostas** — "não trabalhou" ou
  "trabalhou sem `/arvys:close`" — e ninguém sabe qual sem perguntar ao dono.
  O Echo ficou acusado desde 04/09 por isso. Depois de separar ativo (3 dias)
  de standby (14), os achados do harness caíram de **9 para 1** — o 1 que
  sobrou era exatamente o close pulado.
- **`git stash`/`pop` com agentes concorrentes truncou `agents/forge/STATE.md`
  a 0 bytes** (2026-09-08, `company/STATE.md`, seção "E1 8 de 9") — recuperado
  por cópia, 698 linhas. Estado que só existe no disco de uma sessão aberta
  é estado a um gesto de sumir.
- **O incidente de 2026-09-04** (`incidents/2026-09-04-git-checkout-apesar-do-mandato.md`):
  um executor "limpou" com `git checkout` um arquivo que era saída de outra
  frente. Não perdeu nada **por sorte de ordem**. Fechar a sessão pelo ritual
  (que grava o L1 e confere o `git status`) é a diferença entre sorte e
  controle.

**A saída:** `/arvys:close` leva menos de 1 minuto: reescreve o STATE do
agente, registra decisões e gotchas, propaga o L1 para `company/STATE.md`.
O `/arvys:status` da próxima sessão lê **só** esse arquivo — sem close, ele
mente.

---

## Os que não entram na lista dos 4, mas o dono pagou

Estão em `OWNER.md`, seção "Anti-padrões", e valem para todo agente:

- **"Está no ar" sem verificar** — dev server não pega type error. Conferir
  `tsc`, deploy READY e URL fixada antes de afirmar.
- **Feature completa e inacessível** — sempre perguntar "por onde o usuário
  chega?". Já aconteceu 4+ vezes.
- **Duas fontes para o mesmo número** — uma função pura, usada pelos dois lados.
- **Seed/script de banco é arma carregada** — dry-run por padrão.

O que fazer quando cair num deles: [06-faq-e-problemas.md](06-faq-e-problemas.md).
