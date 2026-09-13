---
name: start
description: Porta de entrada do Arvys - primeira sessão de um dono ou de um projeto. Faz as 2 perguntas que direcionam tudo (perfil vibecoder × dev; projeto do zero × em andamento), grava o perfil e roteia para a trilha certa. Usar na primeira conversa de quem acabou de instalar o Arvys, ou ao plugar um projeto novo no escritório.
---

# /arvys:start

Antes de qualquer trabalho, o Arvys precisa saber com quem fala e por onde
entra. Duas perguntas, uma de cada vez — e nada de questionário longo:
o resto o escritório aprende trabalhando.

## Passo 0 — Leia o que já existe (antes de perguntar qualquer coisa)

Pelo leitor de arquivos, nunca por shell: `OWNER.md`, `agents/*/AGENT.md`,
`company/`. O que já está no disco manda:

- `OWNER.md` com campo **Perfil** preenchido → **pule a Pergunta 1** e diga
  ao dono qual perfil já está gravado. Nunca sobrescrever OWNER.md.
- `agents/` com gente dentro → o escritório **já está montado**: nomeie na
  resposta os agentes que encontrou e **não recrie nem sobrescreva nada**
  (nem AGENT.md, nem STATE, nem company/). O `start` aqui só situa e roteia.
- `company/STATE.md` presente → o escritório **já foi criado**: o Passo final
  (esqueleto) é pulado inteiro, sem criar nem reescrever arquivo nenhum.
- Só o que **não existe** é criado.

## Pergunta 1 — Quem é você?

**"Você programa profissionalmente, ou constrói com IA sem ser dev
(vibecoder)?"** (pode ser "um pouco dos dois" — anote como híbrido)

Grave a resposta em `OWNER.md` (campo **Perfil**, e junto a linha
`Coach de prompt: ligado` para vibecoder/híbrido ou `desligado` para dev — o
dono troca quando quiser, editando a linha) e ajuste TODA a comunicação
do escritório dali em diante:

| | Vibecoder | Dev profissional |
|---|---|---|
| Linguagem | Termo técnico sempre com analogia curta ("S3 = armário infinito") | Técnica direta, sem rodeio |
| Gates | Sempre por leitura + pergunta binária; nunca "revise o código" | Podem incluir diff, teste e código |
| Explicações | O "porquê" antes do "como"; passos copiáveis | Só o que não é óbvio |
| Proteções | Redes duplas: confirmação extra em git/banco/deploy | Padrão do PLAYBOOK |

Híbrido: linguagem de dev, gates com opção de leitura.

## Pergunta 2 — Por onde entramos?

**"Vamos criar algo do zero, ou aplicar o Arvys num projeto que já existe?"**

**Do zero** → rote para `/arvys:genesis` (a trilha de nascimento cuida de
tudo). **Anuncie o roteamento com o nome literal do ritual** — "a partir
daqui vale o `/arvys:genesis`" — antes da primeira pergunta da trilha nova.

**Projeto em andamento** → trilha de ADOÇÃO (anuncie assim, pelo nome),
nesta ordem:
1. Peça o caminho do repo. Mande o `explorer` mapear: stack, estrutura,
   estado do git (branches abertos, últimos commits), docs existentes
   (README, TODOs, specs) — o resultado volta resumido.
2. Entreviste o dono sobre o que o código não conta: o que está travado,
   o que vem a seguir, o que já deu errado (isso vira a 1ª gotcha).
3. Crie o vínculo: linha no STATE do agente dono (Forge para produto) com
   **ponteiro** para o repo — "leia o repo antes deste arquivo" — nunca
   duplicando o que o git já sabe.
4. Classifique a primeira demanda real (L0-L4) e siga o fluxo normal.
   Projeto em andamento NÃO passa pelo genesis — ele já nasceu; se faltar
   PRD/contexto, ofereça gerar um PROJECT-CONTEXT reverso a partir do código
   (explorer varre, dono confirma por leitura).

## Passo final — o esqueleto do escritório (o que o `start` CRIA)

Sem isto o dono roda o `start`, acha que tem escritório, e o `/arvys:status`
responde "não há escritório aqui, rode `/arvys:start`" — loop sem saída no
primeiro minuto de uso. **Só depois das 2 respostas** (o mesmo momento em que
`OWNER.md` ganha o campo **Perfil**), crie **os dois arquivos abaixo e mais
nada** — vale nas duas trilhas, genesis e ADOÇÃO:

1. **`company/STATE.md`** — é o único arquivo que o `/arvys:status` lê e o
   destino do L1 no passo 4 do `/arvys:close`. Nasce assim, com a tabela
   vazia (nenhum agente foi contratado ainda):

   ```markdown
   # STATE — Empresa (agregado)

   > O `/arvys:status` lê APENAS este arquivo. Cada linha de agente é o L1
   > propagado pelo último `/arvys:close`. Blockers sempre no topo.

   ## Blockers

   - (nenhum)

   ## L1 por agente — atualizado AAAA-MM-DD

   | Agente | L1 |
   |---|---|

   ## Iniciativas em curso

   - (nenhuma)
   ```

2. **`company/DECISIONS.md`** — append-only; nasce vazio por desenho, e o
   passo 2 do `/arvys:close` apende nele já na 1ª sessão:

   ```markdown
   # DECISIONS — livro de decisões (append-only)

   > Formato: `## AAAA-MM-DD — Título` + decisão + motivo + autor/fonte.
   > Decisão não registrada aqui desaparece.
   ```

**O que o `start` NÃO cria, e por quê** — pasta morta é pior que pasta
ausente, e cada ritual abaixo já sabe lidar com a ausência:

- `agents/` — nasce pelo `/arvys:hire`, um agente por vez, com entrevista.
- `company/BRIEFING.md` — é **medido** pela corrente noturna
  (`workers/briefing.js`). Escrito à mão seria um briefing inventado; o
  `/arvys:briefing` já trata "STATE existe, briefing não" mandando rodar a
  corrente.
- `company/FILA.md` — só o `/arvys:radar` (com o dono aprovando item a item)
  põe coisa lá. Fila pré-preenchida é trabalho que ninguém pediu.
- `company/PLAYBOOK.md` — é o corpo de leis DESTE escritório; vazio ele
  mentiria. O `/arvys:hire` o cria/estende ao contratar o 1º agente.
- `company/OFFICE-METRICS.json`, `company/RADAR.json`, `incidents/`,
  `specs/` — todos gerados por quem os mede ou por ritual próprio.

**Regras que valem aqui:**

- **`company/STATE.md` já existe = escritório já montado: NÃO crie nada,
  nem toque em nada** (nem `DECISIONS.md`, nem `OWNER.md`) — este passo
  inteiro é pulado e o Passo 0 manda: só situar e rotear. Arquivo que já
  existe nunca é sobrescrito, em nenhuma hipótese.
- **Sem as 2 respostas do dono, não crie nada** — nem `OWNER.md`, nem
  `company/`. Perfil chutado calibra o escritório inteiro errado.
- Nada de git: criar arquivo é escrita em disco, commit é ato à parte.

## Fecho obrigatório — a última mensagem do turno

Quem acabou de instalar o Arvys não adivinha o próximo passo. A **última**
mensagem que o dono lê tem de conter, nesta ordem, sempre:

1. **O que foi gravado E o que foi criado, com o caminho de cada arquivo** —
   uma lista curta de caminhos (`OWNER.md`, `company/STATE.md`,
   `company/DECISIONS.md`, STATE de agente), ou "nada foi gravado ainda"
   quando ainda falta resposta. Listar o caminho é o que separa "o escritório
   existe" de "achei que existia".
2. **Onde estamos, pelo nome literal**: `/arvys:genesis` (do zero) ou a
   palavra **ADOÇÃO** (projeto em andamento); em escritório já montado, os
   agentes que já existem, pelo nome. Citar o nome dentro de um caminho de
   arquivo **não** conta como anúncio — tem de ser dito em texto ao dono.
3. **A próxima pergunta — uma só.**

Terminar só com a pergunta da trilha seguinte é falha: sem o nome da trilha
e do que foi gravado, o dono não sabe onde está nem o que aconteceu.

**Confira os 3 antes de enviar.** O item 1 é o mais fácil de inchar e o
item 2 o mais fácil de perder: uma lista de arquivos criados **não**
substitui o nome da trilha. Se a mensagem não tem, em texto corrido,
`/arvys:genesis` **ou** a palavra ADOÇÃO (ou os agentes existentes, pelo
nome), ela ainda não está pronta para ser enviada.

## Regras

- Se `OWNER.md` não existe (instalação nova), **crie-o** com o campo
  **Perfil** já preenchido e a linha `Coach de prompt: ligado` (vibecoder,
  híbrido) ou `Coach de prompt: desligado` (dev); nunca preencher Perfil sem
  resposta do dono. O dono pode trocar a linha do coach a qualquer momento.
- Ao encerrar o ritual, aponte a leitura: "leia a **Biblioteca › Comece
  aqui** no QG (grupo Memória) — ou `plugin/biblioteca/00-comece-aqui.md`".
- As 2 respostas são gravadas em arquivo na hora (OWNER.md + STATE) —
  perguntar de novo na próxima sessão é falha de memória do harness.
- Perfil pode mudar (vibecoder virando dev) — o dono avisa, o OWNER.md muda.
- Se o dono já tem perfil gravado e chega com projeto novo, pule a Pergunta 1.
