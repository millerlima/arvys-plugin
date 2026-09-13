---
name: hire
description: Conduz a entrevista de contratação de um agente novo — recusa sem uso semanal previsto, fonte de dados nomeada e cisão/demanda declarada — e grava a pasta completa do agente no molde dos existentes. Usar quando o dono quiser um agente que hoje não existe em `agents/`.
---

# /arvys:hire

Contratar um agente **não é escrever markdown**: é passar pela guarda que
impede o Arvys de virar o Hive (11 squads, pastas mortas — `company/PLAYBOOK.md`
§Lei da fila). A entrevista é conduzida por julgamento, não por script — por
isso este ritual é skill, não worker.

## Antes do passo 0 — este projeto tem escritório?

Se `agents/` não existir, pare: diga que o projeto não tem escritório e
ofereça `/arvys:start`. **Nunca contrate no lugar de iniciar o escritório.**

## Passo 0 — existe parente na galeria?

Se `plugin/templates/galeria/` existir, liste os candidatos de lá (nome ·
callsign · vibe · 1 linha de mission, um por arquivo `*.md` exceto o
`README.md`) e pergunte ao dono: "algum destes é parente do que você quer
contratar?".

- **Chamada explícita** (`/arvys:hire --de <template>`): pule a listagem,
  carregue `plugin/templates/galeria/<template>.md` direto.
- **Sim, é este `<template>`:** pré-preencha P4 (nome · callsign · vibe ·
  emoji · cor), P5 (Owns / Does NOT own → defere a) e a persona a partir do
  template escolhido — mas **a guarda roda igual**: P1, P2 e P3 continuam
  obrigatórias, sem atalho, e diga isso em voz alta ao dono ("o template
  pré-preenche a forma, a guarda roda igual"). Uma resposta vaga a P1, um
  "nenhuma" em P2 ou a ausência de cisão/demanda em P3 recusa a contratação
  do mesmo jeito que recusaria sem template.
  **O `AGENT.md` gravado segue sempre o molde de 10 campos** (§Passo 4):
  `demanda_prevista` e `fonte_de_dados` do template alimentam as respostas de
  P1/P2 e o registro em `DECISIONS.md` — **nunca** o frontmatter do agente.
  Ao montar o `AGENT.md` no gate de leitura (passo 3), copie só os 10 campos
  do molde; os dois campos extras do template morrem ali.
- **Não há parente, ou a galeria não existe:** siga direto para o passo 1.

## Passos

1. **Leia os agentes existentes primeiro** (com o leitor de arquivos, um por
   chamada): todo `agents/*/AGENT.md` — é o material com que a guarda cruza
   as respostas do dono (Owns, Does NOT own).

2. **Responda as 6 perguntas você mesmo, em UMA proposta, e faça UM gate.**
   Preencha P1–P6 a partir do template (se houver), da FILA, dos incidentes
   e dos STATEs — e mostre a proposta inteira de uma vez, com o `AGENT.md`
   do passo 3 logo abaixo. A guarda (P1 concreto · P2 nomeada · P3 com cisão
   ou demanda) continua obrigatória: **você a verifica na própria proposta**
   e, se não conseguir preencher P1–P3 com fato do repo, RECUSA antes de
   perguntar qualquer coisa. Só pergunte ao dono, uma por vez, o item que
   **não dá para inferir** de arquivo nenhum (regra de autonomia em
   `OWNER.md`: uma pergunta por decisão de fundo, zero por decisão de forma —
   nome, cor, emoji e modelo você propõe e o dono corrige se quiser). As 6
   perguntas, com o critério de cada uma:

   **P1 — Que trabalho semanal este agente vai fazer?**
   Resposta vaga ou genérica ("ajudar com tudo", "suporte geral"): não
   avance. Mostre o Owns de cada agente existente e pergunte "isso o
   `<agente>` já faz?". Só segue para P2 com um trabalho concreto e nomeado.

   **P2 — Qual fonte de dados alimenta o STATE dele?** (arquivo, worker, API)
   Resposta válida é **UMA** destas três, nomeada:
   - **caminho de arquivo ou pasta do repo** (existente ou a criar, com o
     caminho);
   - **nome de worker em `workers/`** (existente ou a criar, com o nome);
   - **API/URL nomeada**.

   **Qualquer outra coisa conta como nenhuma** — inclusive "o dono conta",
   "definimos depois", "a sessão", "o próprio chat" e variações: nada disso é
   fonte de dado. Resposta que não nomeia um dos três acima (ou vazia):
   **RECUSE a contratação agora.** Cite a lei da cisão (`company/PLAYBOOK.md`
   §Lei da fila): agente sem dado é custo de contexto, não trabalho. Sugira
   um playbook dentro de um agente existente em vez de uma cadeira nova.
   **Não escreva nenhum arquivo.** Pare o ritual.

   **P3 — Nasce por cisão de quem, ou por demanda nova?**
   Precisa apontar (a) o Owns que sai de um agente existente por sobrecarga,
   ou (b) declarar "demanda nova" com o que a justifica (projeto, mercado,
   ritual que não cabe em nenhum existente). Resposta sem cisão nem demanda
   justificada: **RECUSE**, mesma citação da lei da cisão, mesmo "não escreva
   nada", pare o ritual.

   **P4 — Nome · callsign · vibe · emoji · cor.**
   Se houver parente na galeria (passo 0), proponha a partir dele; senão,
   proponha a partir do trabalho descrito em P1.

   **P5 — Owns / Does NOT own → defere a.**
   Cruze cada item de Owns proposto com o Owns dos agentes existentes. Item
   sobreposto: acuse a sobreposição e pergunte se é isso mesmo que o dono
   quer (agente novo assumindo escopo de outro é decisão do dono, não
   automática).

   **P6 — Modelo pelo papel** (Planejador · Executor · Explorador — nunca por
   nome de modelo). Use a tabela de `company/PLAYBOOK.md` §Economia de
   tokens. Escreva em prosa de papel (ex.: "forte (sessão) · sonnet p/
   rotina"), **nunca** um model-id (`claude-*`).

3. **Gate de leitura (o único do ritual).** Monte o `AGENT.md` completo a
   partir do molde preenchido com as respostas e **mostre-o inteiro** ao
   dono, junto com as respostas de P1–P3 em 3 linhas (é o que vai para o
   `DECISIONS.md`). Pergunte: "É este o agente? (sim / ajustar)". Sem "sim"
   (ou "siga", "pode seguir"), não grava nada.

4. **Escrita nesta ordem exata, só depois do "sim":**
   1. **Os 4 arquivos do agente**, juntos (`agents/<nome>/AGENT.md`,
      `STATE.md`, `GOTCHAS.md`, `playbooks/README.md`) — nunca parcial: pasta
      com menos de 4 arquivos derruba o `office-metrics.js`. Se qualquer uma
      das 4 escritas falhar, **apague `agents/<nome>/` inteira** e recomece
      (não existe transação atômica de verdade aqui — são 4 chamadas de
      escrita separadas; a garantia é o passo de verificação abaixo).
   2. `company/STATE.md` — linha do agente na tabela de L1. **Se o arquivo
      não existir** (projeto implantado mínimo), pule este passo e diga ao
      dono que pulou.
   3. `company/PLAYBOOK.md` — acrescente o nome à lista de agentes (ver
      §Agentes: "os que existem em `agents/`"). **Se o arquivo não existir**,
      pule e diga ao dono que pulou.
   4. `company/DECISIONS.md` — registre a contratação com as respostas de
      P1–P3 **literais**: é a evidência de que a guarda foi cumprida. **Se o
      arquivo não existir**, pule e diga ao dono que pulou.

   `status:` do `AGENT.md` gravado é `standby` — como 3 dos 4 agentes reais
   (só o Scout nasceu `ativo`); o placeholder `{{status}}` do molde só existe
   até este passo; `status: candidato` é exclusivo dos templates da galeria
   (onda 3), nunca de um agente contratado de verdade. Diga ao dono: "vira
   `ativo` no primeiro `/arvys:close` com entrega".

   **Verificação final (obrigatória, depois das 4 escritas de `agents/`):**
   liste `agents/<nome>/` e confirme os 4 arquivos; se existir
   `workers/office-metrics.js`, rode-o e confirme exit 0. **Se qualquer passo
   falhar** (arquivo faltando, `office-metrics.js` com exit ≠ 0): apague
   `agents/<nome>/` inteira, reverta as linhas gravadas em `company/`,
   anuncie a falha ao dono — **nada de meio-termo** (pasta parcial ou
   `company/` referenciando um agente que não existe mais).

5. **Guard de QG.** Se `hub/live/` não existir, pule em silêncio — nada a
   fazer nesta onda além de mencionar que o hub descobre agentes novos sem
   edição de código (onda 2 desta spec).

6. Anuncie `/arvys:open <nome>` como próximo passo.

## Como isto aparece na tela

O dono acompanha o ritual pela tela — ela é parte da entrega, não sobra.

- **Leia com o leitor de arquivos, um arquivo por chamada.** Proibido `cat`,
  `type`, `Get-Content` ou qualquer leitura via shell.
- **Todo comando de shell leva descrição em português dizendo o PORQUÊ**, não
  o quê.
- **Anuncie cada passo numerado em uma linha antes de executá-lo**, no
  formato `▸ <passo> — <por que existe>`.
- **O GATE de leitura (passo 3) é a tela mais importante deste ritual**:
  mostre o `AGENT.md` inteiro, isolado, com a pergunta em linha própria.
  Gate afogado em texto é gate que o dono aprova sem ler.
- Campo sem conteúdo é omitido, nunca preenchido com "nenhum".

## Regras

- **Recusa não é fracasso do ritual — é o ritual funcionando.** Uma recusa
  bem fundamentada (com a lei citada e uma sugestão de playbook) é o
  resultado correto tanto quanto uma contratação.
- Nenhum arquivo é escrito antes do "sim" do gate de leitura.
- `model:` nunca vira model-id — sempre prosa de papel.
- Escrita em git é ato explícito à parte — este ritual não commita.
