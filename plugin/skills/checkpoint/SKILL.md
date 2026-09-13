---
name: checkpoint
description: Salva um checkpoint retomável no MEIO de uma sessão longa do Arvys, para poder limpar o chat sem perder contexto. Usar quando a conversa está longa/pesada, antes de operação demorada, ou quando o dono sente que o contexto vai estourar.
---

# /arvys:checkpoint

O antídoto para "conversa longa que come tokens e depois esquece". Grava o
contexto vivo da sessão em arquivo; depois disso, `/clear` + retomar custa
centenas de tokens em vez de arrastar dezenas de milhares a cada mensagem.

## Quando disparar (sinais)

- A sessão passou de ~15-20 interações e o trabalho NÃO acabou
- Vai começar uma etapa longa (build, migração, review extenso)
- O dono disse "continua depois" ou mudou de assunto no meio
- Qualquer sensação de "se eu limpar agora, perco o fio"

## Passos

1. Determine o lugar do checkpoint:
   - Trabalho com spec ativa → apende em `specs/<iniciativa>/tasks.md`
     (seção `## Checkpoint YYYY-MM-DD HH:MM`)
   - Sem spec → `agents/<agente>/STATE.md`, seção "Em progresso"
   - Sem agente aberto → `company/STATE.md`, "Iniciativas em curso"
2. Grave, em NO MÁXIMO 15 linhas:
   - **Objetivo da sessão** (1 linha)
   - **Onde paramos** (última coisa concluída + evidência)
   - **Próximo passo imediato** (a 1ª ação da retomada, específica)
   - **Decisões tomadas no chat ainda não registradas** (ou "nenhuma")
   - **Arquivos quentes** (paths que a retomada deve abrir primeiro)
   - **Armadilha viva** (algo descoberto que ainda não virou gotcha)
   Depois, **carimbe a marca de sessão aberta** em `agents/<agente>/STATE.md`
   — sempre no STATE, mesmo quando o checkpoint foi para a spec: é o STATE que
   a métrica de sessão abandonada lê. Uma linha, primeira sob `## Em progresso`
   (crie a seção se faltar), substituindo qualquer marca anterior:
   `<!-- checkpoint: YYYY-MM-DDTHH:MM -->`. NUNCA dentro do bloco `[L1]` (o
   bloco termina na primeira linha em branco — a marca fica depois dela).
3. Diga ao dono: "Checkpoint salvo em <arquivo>. Pode dar `/clear` — para
   retomar: `/arvys:open <agente>` (o checkpoint vem junto no STATE) ou aponte
   a spec."

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

- Checkpoint NÃO substitui `/arvys:close` — ao terminar de verdade, o close
  roda e APAGA checkpoints consumidos (checkpoint velho é lixo de contexto).
- Nunca usar `/compact` como alternativa: é caro e com perda. Checkpoint em
  arquivo + `/clear` custa zero.
- Máximo 1 checkpoint ativo por agente — o novo sobrescreve o velho, e a
  marca `<!-- checkpoint: … -->` também: no máximo 1 por STATE. O `/arvys:close`
  a remove; marca que sobrevive ao dia seguinte = sessão abandonada.
