---
titulo: Comece aqui
ordem: 00
cenarios: [primeira-sessao, adotar-projeto, produto-novo]
perfil: ambos
---

# Comece aqui

> Analogia: o Arvys é um escritório virtual dentro do Claude Code. Você é o
> dono. Existe um chefe de gabinete (o orquestrador), especialistas (os
> agentes), um livro de leis (gotchas) e um painel na parede (o QG). Você
> não programa o escritório — você **pede**, **lê** e **aprova**.

## O que você recebeu ao instalar

| Peça | O que é | Onde mora |
|---|---|---|
| 11 rituais `/arvys:*` | Comandos que abrem o dia, abrem sessão, fecham, planejam, retrospectam | `plugin/skills/` |
| 2 subagentes | `explorer` (lê 50 arquivos e te devolve 10 linhas) e `reviewer` (tenta provar que o risco é real) | `plugin/agents/` |
| 7 hooks | Ganchos que recusam o gesto perigoso antes de ele acontecer (apagar arquivo alheio, matar processo que não é seu, mexer em banco de produção sem confirmar) | `plugin/hooks/` |
| Esta biblioteca | O manual | `plugin/biblioteca/` |

O que **não** vem no plugin, e nasce no seu projeto: `OWNER.md` (seu perfil),
`company/STATE.md` (onde o escritório está), `company/DECISIONS.md` (o livro
de decisões) e `agents/` (cada especialista contratado por `/arvys:hire`).

## O princípio que explica tudo

**O chat é descartável; o arquivo é o produto.** Decisão que ficou só na
conversa desaparece quando você limpa o chat. Por isso todo ritual termina
gravando em arquivo — e por isso limpar o chat é grátis (veja
[02-contexto-e-sessao.md](02-contexto-e-sessao.md)).

Os outros quatro:

1. **Token caro planeja; token barato digita.** O modelo forte decide e
   escreve a spec; o modelo barato executa.
2. **Erro vira lei.** Todo tropeço vira incidente, e o incidente vira regra
   do agente responsável — na retrospectiva, nunca no calor da hora.
3. **Nada é "pronto" sem evidência.** Teste verde, tsc, captura de tela,
   deploy READY. "Está no ar" sem prova é o anti-padrão mais caro do dono.
4. **Escrever em git é ato explícito.** Nenhum ritual commita sozinho.

## Por onde começar, conforme o seu perfil

O `/arvys:start` pergunta uma vez e grava em `OWNER.md`. O que muda:

### Você é vibecoder (constrói com IA, não programa profissionalmente)

Leia nesta ordem — é o caminho curto:

1. [01-receitas-por-cenario.md](01-receitas-por-cenario.md) — ache o seu
   "estou em…" e copie o comando.
2. [04-escola-de-prompt.md](04-escola-de-prompt.md) — quatro campos e o
   resultado dobra. O orquestrador vai te mostrar isso ao vivo, uma vez por
   sessão, com o **seu** pedido reescrito (o coach de prompt; desligável no
   `OWNER.md` com `Coach de prompt: desligado`).
3. [05-glossario-para-leigos.md](05-glossario-para-leigos.md) — aberto ao
   lado, para quando aparecer uma palavra estranha na tela.
4. [03-anti-padroes.md](03-anti-padroes.md) — depois da primeira semana.

O escritório fala com você por analogia curta, o porquê antes do como, gate
por leitura + pergunta binária ("sim / ajustar"), e rede dupla em git, banco
e deploy. Você nunca precisa "revisar o código".

### Você é dev

1. [02-contexto-e-sessao.md](02-contexto-e-sessao.md) — o modelo mental
   (sessão curta, checkpoint, spec como cache, worktree).
2. [01-receitas-por-cenario.md](01-receitas-por-cenario.md) — os comandos.
3. [03-anti-padroes.md](03-anti-padroes.md) — os números.
4. `company/PLAYBOOK.md` do seu projeto — as leis, com o mandato de 6 campos.

Gates podem trazer diff, teste e código. O coach de prompt vem **desligado**
por padrão para dev (ligue no `OWNER.md` se quiser).

### Híbrido

Linguagem de dev, gates com opção de leitura. Siga a trilha de dev.

## A escala que o orquestrador anuncia em toda demanda

| Escala | O que é | O que acontece |
|---|---|---|
| L0 | trivial (um texto, um ajuste) | agente direto |
| L1 | fix pequeno, um arquivo | agente direto, com plano antes |
| L2 | feature (mexe em 3+ arquivos) | `/arvys:spec` + gate "Proceed?" antes de código |
| L3 | módulo | idem, com ondas e reviewer |
| L4 | produto novo, sem PRD | `/arvys:genesis` |

Você pode rebaixar ou subir a escala em uma frase ("trata como L1").

## Os 4 arquivos que valem a pena conhecer pelo nome

- `OWNER.md` — quem você é e como quer ser tratado.
- `company/STATE.md` — onde tudo está; o `/arvys:status` lê **só** ele.
- `company/DECISIONS.md` — o que foi decidido e por quê; append-only.
- `agents/<nome>/GOTCHAS.md` — o que aquele agente aprendeu errando.

Próximo capítulo: [01-receitas-por-cenario.md](01-receitas-por-cenario.md).
