---
name: status
description: Standup instantâneo do escritório Arvys — agrega o L1 de todos os agentes e destaca blockers, lendo UM arquivo. Usar A QUALQUER MOMENTO em que o dono perguntar "como estamos", "o que está travado" ou "onde paramos", inclusive várias vezes no mesmo dia. Para ABRIR o dia use /arvys:briefing (o retrato da madrugada, com radar e cota); este aqui é o estado agora e não substitui aquele.
---

# /arvys:status

Standup cross-agente. Barato por desenho: lê UM arquivo.

## Antes do passo 1 — este projeto tem escritório?

Se `company/STATE.md` **não existir**, este diretório não é um escritório Arvys.
Diga isso em uma linha e ofereça `/arvys:start`. **Não procure o arquivo em
outro lugar, não leia o STATE de outro projeto e NUNCA descreva um estado que
você não leu** — status inventado é pior que status ausente.

## Passos

1. Leia APENAS `company/STATE.md`.
2. Responda no formato fixo:
   - **Blockers primeiro** (se houver — com dono sugerido para cada um)
   - Tabela: agente → L1 (verbatim, sem reescrever)
   - Iniciativas em curso (1 linha cada)
   - **Defasagem:** linhas de L1 com data > 7 dias são marcadas "possivelmente
     defasado — abrir o agente para atualizar"
3. Termine com a pergunta única: "Onde ataco primeiro?"

## Como isto aparece na tela

O dono acompanha o ritual pela tela — ela é parte da entrega, não sobra.

- **Leia com o leitor de arquivos, um arquivo por chamada.** Proibido `cat`,
  `type`, `Get-Content` ou qualquer leitura via shell: o shell despeja o
  conteúdo cru e a tela vira paredão. O leitor mostra uma linha por arquivo.
- **Todo comando de shell leva descrição em português dizendo o PORQUÊ**, não o
  quê.
- **Anuncie cada passo numerado em uma linha antes de executá-lo**, no formato
  `▸ <passo> — <por que existe>`. Uma linha por passo do ritual, jamais uma por
  chamada de ferramenta.
- **Campo sem conteúdo é omitido**, nunca preenchido com "nenhum" — ausência já
  é a informação.

## Regras

- NÃO abra os STATE individuais dos agentes — se o agregado parecer errado, a
  correção é rodar `/arvys:close` no agente, não furar a camada.
- Nenhuma ação executiva a partir daqui: status informa, `/arvys:open` trabalha.
