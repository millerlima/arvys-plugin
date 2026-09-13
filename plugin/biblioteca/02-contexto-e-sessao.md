---
titulo: Contexto e sessão
ordem: 02
cenarios: [fix, feature, semana]
perfil: ambos
---

# Contexto e sessão — por que você perdia tokens

> A dor que este capítulo resolve: "consumo tokens em abundância e perco o
> contexto do chat". A resposta do Arvys tem **3 movimentos e 1 número para
> vigiar** — e depois vêm o checkpoint, a escolha de modelo e o worktree.

## O princípio (por que você perdia tokens)

Cada mensagem numa conversa reenvia TODA a conversa. A mensagem 30 custa
~31× a mensagem 1. Conversa longa é juros compostos contra você. E quando o
contexto estoura, o modelo resume com perda — aí você paga duas vezes: nos
tokens E no contexto perdido.

> Analogia: cada mensagem é uma carta que vai com todas as cartas anteriores
> dentro do envelope. No fim do dia você está pagando postagem de um baú.

**A solução não é conversar menos. É mover o contexto do chat para arquivos.**
O chat é descartável; o arquivo é o produto.

## Os 3 movimentos

### 1. Sessão curta com fechamento — o ciclo normal

```
/arvys:open forge   → carrega SÓ o necessário (persona + STATE + gotchas)
   trabalho...
/arvys:close        → estado vai para arquivo (≤1 min)
/clear              → chat zerado, custo zero, NADA perdido
```

Uma tarefa = uma sessão. O `/arvys:close` existe para tornar o `/clear` barato.

### 2. Checkpoint no meio — quando a sessão cresceu e não acabou

Sinais: 15-20+ interações, etapa longa à frente, sensação de "vou perder o fio".

```
/arvys:checkpoint   → grava objetivo, onde parou, próximo passo, arquivos quentes
/clear
/arvys:open forge   → o checkpoint volta junto no STATE; retomada em segundos
```

O que o checkpoint grava, e onde: uma marca `<!-- checkpoint: AAAA-MM-DDTHH:MM -->`
no `STATE.md` do agente, primeira linha sob `## Em progresso`. O `/arvys:close`
a remove. Marca que sobrevive ao dia seguinte = sessão abandonada — vira
número em `company/METRICS.md` (decisão de 2026-09-04 em `company/DECISIONS.md`,
"Formato da marca de sessão aberta").

**Nunca use `/compact` como alternativa ao checkpoint.** É caro (relê a
conversa inteira) e com perda. Checkpoint em arquivo + `/clear` é grátis.

### 3. Spec como cache — para trabalho de dias

Iniciativa L2+ tem `specs/<nome>/` com spec/plan/tasks. Amanhã, a sessão nova
relê a spec (centenas de tokens) em vez de redescobrir decisões (dezenas de
milhares). A spec é o "save game" da iniciativa.

## As regras que protegem a cota

| Regra | Por quê |
|---|---|
| `/clear` sim, `/compact` não | compact é caro e com perda; clear é grátis (o close já salvou tudo) |
| Exploração vai para o subagente `explorer` (Haiku) | ele queima o contexto DELE lendo 50 arquivos e te devolve 10 linhas — firewall de contexto |
| Token caro planeja, token barato digita | Opus decide arquitetura (vira arquivo); Sonnet executa; Haiku faz o mecânico |
| Filtrar antes de ler | test output → só falhas; logs via grep/tail; nunca colar arquivo inteiro |
| CLAUDE.md ≤600 tokens | ele é cobrado em TODA mensagem de TODA sessão; especificidade mora nas skills (carregam sob demanda) |
| Fan-out só no Scout | multi-agente custa ~15×; pesquisa paralela é o único caso em que se paga |

## O número para vigiar

Rode `/usage` toda sexta (entra na `/arvys:retro`). A meta não é regra de blog:
é a SUA cota durando a semana. A retro calibra as regras com o seu dado real.

O que o número já mostrou aqui: na retro 1 (`company/DECISIONS.md`,
2026-09-02), a cota estava em 41% — mas **91% do gasto era em contexto acima
de 150k tokens**. A lei "uma tarefa = uma sessão" existia e não estava sendo
cumprida. O número apontou o hábito, não a ferramenta.

## Quando subir (ou descer) de modelo

O Arvys escolhe modelo **por papel, nunca por nome** — porque LLM muda toda
semana e nome em arquivo de instrução é validade escondida (retro 1). A tabela
de ocupantes mora em `company/PLAYBOOK.md`:

| Papel | Faz | Ocupante hoje |
|---|---|---|
| Planejador | orquestra, decide, escreve spec e arquitetura que vira arquivo | o modelo forte |
| Executor | implementa spec aprovada, review adversarial | o modelo médio |
| Explorador | mapeia código, mecânico em massa | o modelo barato |

> Analogia: o arquiteto não assenta tijolo, e o pedreiro não desenha a planta.
> Pagar arquiteto para assentar tijolo é o desperdício mais comum.

Regra prática, com número (`company/METRICS.md`, leitura de 2026-09-07):
numa sessão de 3h17, o Planejador custou US$ 15,07 escrevendo 90k tokens e o
Executor US$ 15,93 escrevendo 440k. **Metade do custo comprou 5× menos
escrita** — é exatamente o desenho. Suba de modelo quando a decisão vira
arquivo (spec, arquitetura, mesa). Desça quando o que falta é digitar o que
já foi decidido. Sinal de que está errado: o modelo forte lendo 50 arquivos
para "entender o repo" — isso é trabalho do `explorer`.

## Worktree — duas sessões no mesmo repositório sem uma pisar na outra

> Analogia: duas pessoas editando o mesmo caderno ao mesmo tempo borram a
> página. Worktree é tirar uma cópia do caderno para cada uma, com o mesmo
> histórico, e juntar as páginas depois.

**Quando precisa:** duas sessões do Claude Code no mesmo repo, ao mesmo tempo,
**as duas escrevendo**. Subagentes da mesma sessão **não** precisam — eles
partilham a árvore e ninguém commita (decisão de 2026-09-04, "Três frentes
rodaram ao mesmo tempo", em `company/DECISIONS.md`). A lei que vale antes do
worktree é mais simples: **paralelizar só por pegada de escrita disjunta** —
cada mandato lista os únicos arquivos que pode escrever, e os conjuntos não se
cruzam.

**Comando:**

```
git worktree add ../meu-projeto-frente-b -b frente-b
```

Abra o Claude Code dentro de `../meu-projeto-frente-b`. Ao terminar, faça o
merge e remova:

```
git worktree remove ../meu-projeto-frente-b
```

**O gotcha conhecido (`company/FILA.md`, item 2):** em projeto Next.js, uma
junction de `node_modules` apontando para a árvore principal **quebra o
Turbopack**. Não linke: rode `npm ci` dentro do worktree. Custa alguns
minutos; o link custa uma hora de "por que o dev server não sobe".

**O risco que sobra:** arquivo compartilhado por natureza (i18n, `CLAUDE.md`,
`company/*`). Esses ficam com o orquestrador, que consolida depois com os
relatórios em mão — nunca com as duas frentes editando.

## Anti-padrões (o que fazia você cair)

1. **Sessão-novela**: um chat só para o dia inteiro, assuntos misturados. O
   assunto 1 inteiro é reenviado enquanto você trata o assunto 5.
2. **Redescobrir em vez de reler**: começar sessão nova explicando tudo de novo
   ao modelo — a spec/STATE já sabia.
3. **`/compact` por hábito**: paga caro para resumir o que o close teria salvo
   de graça e sem perda.
4. **Colar arquivo inteiro no chat** para "dar contexto" — aponte o path; o
   agente lê o trecho que precisa.
5. **Deixar o modelo explorar o repo na sessão principal** — é o trabalho do
   `explorer` descartável.

Os quatro que custaram mais, com o custo medido: [03-anti-padroes.md](03-anti-padroes.md).
