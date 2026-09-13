---
titulo: Receitas por cenário
ordem: 01
cenarios: [primeira-sessao, produto-novo, adotar-projeto, fix, feature, semana]
perfil: ambos
---

# Receitas por cenário — "estou em…"

> Analogia: receita de bolo. Ingredientes (o que precisa existir antes),
> modo de fazer (o comando, pronto para copiar) e o ponto certo (como saber
> que deu certo). Seis situações cobrem quase todo dia de trabalho.

Cada receita termina em **evidência** — sem ela, não está pronto
([00-comece-aqui.md](00-comece-aqui.md), princípio 3).

---

## Receita 1 · É minha primeira sessão (`primeira-sessao`)

**Antes:** plugin instalado (`claude plugin list` mostra `arvys@arvys … enabled`).
Nada mais — nem pasta, nem perfil.

**Comando:**

```
/arvys:start
```

**O que acontece:** duas perguntas, uma de cada vez — *você programa ou
constrói com IA?* e *do zero ou projeto que já existe?* — e o esqueleto do
escritório nasce: `OWNER.md`, `company/STATE.md`, `company/DECISIONS.md`.
Nada mais é criado de propósito: pasta morta é pior que pasta ausente.

**Ponto certo:** a última mensagem lista os caminhos gravados, diz em texto
onde você está (`/arvys:genesis` ou **ADOÇÃO**) e faz **uma** pergunta.
Se `/arvys:status` responder "não há escritório aqui", a receita não fechou
— veja [06-faq-e-problemas.md](06-faq-e-problemas.md), problema 1.

---

## Receita 2 · Quero um produto novo (`produto-novo`)

**Antes:** `OWNER.md` com perfil. Sem PRD — é justamente o caso.

**Comando:**

```
/arvys:genesis
```

**O que acontece:** trilha de 6 etapas com entrevista socrática (problema →
mercado → PRD → arquitetura → épicos), gate seu em cada uma. Termina onde o
`/arvys:spec` começa: o primeiro épico executável em `specs/<produto>/genesis/`.

**Ponto certo:** existe `specs/<data>-<produto>/genesis/06-epicos.md` com a
**frase de pronto** do produto — a frase que, quando virar verdade, o épico
fechou. Exemplo real em [07-exemplos-reais.md](07-exemplos-reais.md), sessão 4.

---

## Receita 3 · Quero aplicar o Arvys num projeto que já existe (`adotar-projeto`)

**Antes:** o caminho do repositório.

**Comando:**

```
/arvys:start
```

e responda "projeto em andamento" na segunda pergunta. O ritual anuncia
**ADOÇÃO** e manda o `explorer` mapear stack, git e docs — você não cola
nada no chat.

**Depois, contrate quem vai cuidar do produto:**

```
/arvys:hire
```

O `hire` recusa agente sem uso semanal previsto — é a guarda contra pasta
morta. O primeiro costuma ser o Forge (produto).

**Ponto certo:** `agents/<nome>/STATE.md` tem um ponteiro "leia o repo antes
deste arquivo" — nunca uma cópia do que o git já sabe. A primeira demanda
real é classificada L0-L4 e segue o fluxo normal. Projeto em andamento
**não** passa pelo genesis.

---

## Receita 4 · Quero um fix rápido (`fix`, L0-L1)

**Antes:** saber qual agente é dono da área (`company/STATE.md` diz).

**Comando:**

```
/arvys:open forge
```

e o pedido em 4 campos ([04-escola-de-prompt.md](04-escola-de-prompt.md)):

```
Objetivo: o botão "Salvar" da tela de clientes não responde no celular.
Contexto: src/app/clientes/page.tsx; começou depois do commit de ontem.
Limite: só esse arquivo; nada de banco; não commitar.
Pronto: clicar no celular salva, e tsc passa.
```

**O que acontece:** o orquestrador anuncia "L1" e o agente trabalha em
**plan mode** — mostra o plano, você diz "sim", ele executa.

**Ponto certo:** a evidência que você pediu no campo "Pronto" aparece
colada na resposta (saída do `tsc`, captura). Feche a sessão:

```
/arvys:close
```

Uma tarefa = uma sessão. Depois, `/clear` sem medo.

---

## Receita 5 · Quero uma feature média (`feature`, L2-L3)

**Antes:** a demanda em 4 campos e disposição para ler antes de aprovar.

**Comando:**

```
/arvys:spec
```

**O que acontece:** nascem três arquivos em `specs/<data>-<nome>/` —
`spec.md` (o quê), `plan.md` (como, com a lista **exaustiva** de arquivos e
os riscos nomeados) e `tasks.md` (checklist com sensor por tarefa). O ritual
termina no gate:

```
Proceed? (sim / ajustar / quebrar em partes)
```

**Nada de código antes do seu "sim".** Depois do gate, cada tarefa é
delegada com mandato de 6 campos, e um `reviewer` independente ataca os
riscos no fim.

**Ponto certo:** `tasks.md` com todas as tarefas `[x]`, pasta `evidence/`
cheia, e a spec marcada `pronta`. Se envolve deploy: URL fixada e status
READY, nunca "está no ar".

---

## Receita 6 · Uma semana típica (`semana`)

**Antes:** a corrente noturna configurada (o `/arvys:start` explica; ela
escreve `company/BRIEFING.md` de madrugada).

**Segunda, primeira coisa do dia:**

```
/arvys:briefing
```

Lê o retrato da madrugada: o que espera você, o que está parado, radar,
gasto da semana. Uma vez por dia.

**Durante o dia, quantas vezes quiser:**

```
/arvys:status
```

Standup instantâneo — lê **um** arquivo (`company/STATE.md`).

**Cada tarefa:** `/arvys:open <agente>` → trabalho → `/arvys:close` → `/clear`.
Sessão que cresceu e não acabou: `/arvys:checkpoint` → `/clear` →
`/arvys:open` de novo, e o checkpoint volta junto.

**Quando o briefing disser "Radar: N pendentes":**

```
/arvys:radar
```

**Sexta:**

```
/usage
/arvys:retro
```

Cole o `/usage`. A retro transforma os incidentes da semana em leis,
ratifica os feedbacks pendentes e calibra a economia de tokens com o **seu**
número. É o único ritual que muda as leis do escritório — e você aprova
cada mudança, uma a uma.

**Ponto certo da semana:** `company/METRICS.md` ganhou uma linha, e
`incidents/` não tem incidente aberto sem gotcha.

---

## Resumo em uma tela

| Estou em… | Comando | Termina quando |
|---|---|---|
| primeira sessão | `/arvys:start` | caminhos gravados + trilha nomeada |
| produto novo | `/arvys:genesis` | `06-epicos.md` com a frase de pronto |
| adotar projeto | `/arvys:start` (ADOÇÃO) + `/arvys:hire` | STATE com ponteiro para o repo |
| fix | `/arvys:open <agente>` + 4 campos | evidência do "Pronto" + `/arvys:close` |
| feature | `/arvys:spec` → "sim" | tasks `[x]`, evidence, spec `pronta` |
| semana | `briefing` · `status` · `open/close` · `retro` | linha em METRICS, incidente virou lei |
