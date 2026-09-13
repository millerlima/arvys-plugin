---
titulo: Exemplos reais
ordem: 07
cenarios: [feature, semana, produto-novo]
perfil: ambos
---

# Exemplos reais — 5 sessões que deram certo

> Analogia: o álbum de obras entregues do escritório de arquitetura. Não é
> propaganda: cada foto tem o endereço, e você pode ir lá conferir.

Cada exemplo cita o caminho da evidência no repositório do Arvys. Nenhuma
sessão aqui é inventada; onde algo **não** foi provado, está escrito.

---

## Sessão 1 · O dono moveu um card pelo celular, com o PC desligado

**Data:** 2026-09-13 · **Spec:** `specs/2026-09-quadro-mover-status/`
**Evidência:** `specs/2026-09-quadro-mover-status/evidence/T7-dono.md` e
`T7-celular.png`

**O que aconteceu:** no celular, em produção, o dono moveu dois cards do
quadro para "Em andamento". Os cards mostraram "aguardando sua máquina". No
PC, `arvys sync` → "2 mudanças aplicadas no disco. enviado (5586c6a8…)". O
`git diff` do `tasks.md` colado na evidência mostra exatamente o bloco que
mudou (`status: todo → DOING`, `rev: 0 → 1`) e nada mais.

**O que aprender:**

- **O gate visual é do dono, no aparelho dele.** Ninguém pode dar essa prova
  por ele. A tarefa T7 ficou aberta até isso acontecer — não "provavelmente
  funciona".
- **Um pré-requisito descoberto na hora foi pago na hora, e registrado:**
  nenhum `tasks.md` tinha o bloco que o menu precisava; o executor aplicou
  em 40 arquivos, com commit próprio, antes do gate. Sem esconder.
- **O que não é defeito também se escreve:** o aviso "perdi contato com o
  servidor" apareceu na captura; foi registrado "para observação", sem inflar
  a fila.

---

## Sessão 2 · Uma medição proibiu um desenho antes de ele existir

**Data:** 2026-09-08 · **Spec:** `specs/2026-09-saas-e6-historico/`
**Evidência:** `specs/2026-09-saas-e6-historico/evidence/T1-custo-da-busca.md`

**O que aconteceu:** a primeira tarefa do épico não escreveu código — mediu.
Duas formas de buscar no histórico: trazer tudo para a memória e filtrar, ou
deixar o Postgres filtrar (`ILIKE`). Em corpus de 1 ano simulado (218 MB), a
primeira levou **44 a 78 segundos e +466 MB de memória numa única chamada**;
a segunda, **1,5 s com memória estável**. Decidido: memória proibida em
qualquer tamanho; `ILIKE` com teto; índice full-text como dívida com gatilho.

**O que aprender:**

- **Pedir medição em vez de opinião.** O pedido foi "meça os dois caminhos e
  registre" — não "qual é melhor?". O número decidiu, e o voto vencido ficou
  em `company/DECISIONS.md`.
- **Parar quando o número já decidiu.** O orquestrador interrompeu o tier 50×
  antes de completar a matriz — e a evidência tem uma seção **"NÃO MEDIDO
  (declarado, não estimado)"** listando as células vazias. Honestidade é
  parte da evidência.
- **Achado que ninguém pediu entra no relatório:** o índice full-text
  descarta preposições (`de` nunca é achado). Apareceria meses depois, sem
  explicação, se a medição não tivesse sido feita.

---

## Sessão 3 · O QG redesenhado foi ao ar depois de 2 reviewers e 5 defeitos consertados

**Data:** 2026-09-12 · **Spec:** `specs/2026-09-qg-redesenho-2/`
**Evidência:** `specs/2026-09-qg-redesenho-2/evidence/aprovacao.md`,
`t6-review-A.md`, `t6-review-B.md`, `t7-producao.md`

**O que aconteceu:** 8 tarefas, uma emenda ("Esperando você" passou a expandir
e agir), 7 riscos nomeados no `plan.md`. Dois reviewers independentes
atacaram em paralelo, com pegadas disjuntas: **5 riscos confirmados** —
todos consertados com sensor. Depois o próprio Forge achou mais 2 na
conferência (o Histórico travava o renderizador; um blocker grudava no
outro). Gate final do dono, com o SHA no ar e CI verde: **"aprovo"**.

**O que aprender:**

- **Review adversarial é despachado por quem NÃO executou** (gotcha 14). O
  executor dizendo "rodei o reviewer" não conta.
- **Risco confirmado vira sensor, não remendo.** 4 sensores novos entraram
  no pre-commit nesta spec — o defeito não volta calado.
- **A frase do gate é literal e curta**, e fica gravada com o SHA e o status
  do deploy ao lado. Sem isso, "aprovado" é memória.

---

## Sessão 4 · A frase de pronto de um produto inteiro virou verdade

**Data:** 2026-09-08 · **Spec:** `specs/2026-09-saas-e5-projecao/`
**Evidência:** `specs/2026-09-saas-e5-projecao/evidence/T10-producao.md`

**O que aconteceu:** o genesis do SaaS tinha escrito, meses antes, o critério
de pronto da onda 1 inteira: *"o dono roda `arvys push`, abre
`app.arvys.com.br` de outra máquina, e vê o escritório"*. A T10 foi provando
pedaço por pedaço — `arvys push` real (312 arquivos, 7º push), domínio com
SSL, e a última linha que só o dono podia dar: abriu **no celular** e disse
*"deu certinho"*.

**O que aprender:**

- **Escreva a frase de pronto no dia 1.** Ela vira a régua de todos os
  épicos. A evidência tem uma tabela "a frase, linha por linha", com a prova
  de cada pedaço.
- **O que não foi provado fica escrito como não provado.** A largura de
  celular (390 px) foi tentada por duas ferramentas, as duas falharam, e a
  evidência diz "não medido" — até o dono abrir no aparelho dele.
- **O produto guardou o registro de como foi construído**: o push levou as
  próprias evidências para a nuvem.

---

## Sessão 5 · O `/arvys:start` foi testado por um "estranho" de disco vazio

**Data:** 2026-09-06 · **Spec:** `specs/2026-09-plugin-distribuicao/`
**Evidência:** `specs/2026-09-plugin-distribuicao/evidence/teste-do-estranho.md`

**O que aconteceu:** a pergunta era "o `start` funciona para quem acabou de
instalar e não tem nada no disco?". Resposta: **não** — a última mensagem
não dizia o que foi gravado nem em que trilha o dono entrou, e um escritório
já montado seria recriado. Cinco casos de eval, seis rodadas (US$ 2,50 no
total), até **5/5 casos, 10/10 runs**. E uma prova direta fora do harness:
diretório vazio de verdade, `claude -p "/arvys:start …"`, e o `find` mostrando
só `OWNER.md`, `company/STATE.md`, `company/DECISIONS.md`.

**O que aprender:**

- **Teste o caminho do estranho, não o seu.** Quem construiu o ritual nunca
  o roda em disco vazio.
- **Grader que reprova por trabalho de outra sessão é grader errado** — o
  vermelho da rodada 5 era regressão da própria correção, e foi consertado
  no ritual, **sem afrouxar nenhum grader**.
- **"O que ficou por provar" é seção obrigatória:** multi-turno de verdade,
  instalação por marketplace, a primeira sessão completa depois do start —
  listados, não escondidos.

---

## Bônus · A defesa que dependia de alguém lembrar virou código

**Data:** 2026-09-03 · **Spec:** `specs/2026-09-briefing-diario/`
**Evidência:** `specs/2026-09-briefing-diario/evidence/reviewer.md`

O briefing podia estar velho (máquina desligada) e a única proteção era uma
frase no `SKILL.md` mandando o modelo comparar datas. O reviewer escreveu:
*"defesa que depende de alguém lembrar não é defesa"*. A regra foi movida
para o worker, que mede a idade da própria medição e grita **dentro do
arquivo**. Virou o gotcha 27, e desde então a pergunta de toda retro é: **vira
hook, campo obrigatório ou sensor?** — prosa é a última linha, não a primeira.

---

## O padrão que se repete nas 5

1. O pedido tinha **critério de pronto** antes de começar.
2. O que ficou pronto tem **evidência com caminho** — e o que não ficou
   está escrito como "não provado".
3. Quem revisou **não** foi quem executou.
4. O gate do dono é uma **palavra literal**, gravada ao lado do SHA.
5. O erro achado no caminho virou **sensor ou hook**, não conselho.

Para pedir assim: [04-escola-de-prompt.md](04-escola-de-prompt.md).
