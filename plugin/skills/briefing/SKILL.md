---
name: briefing
description: Abre o dia lendo o briefing que a corrente noturna escreveu de madrugada — o que espera o dono, o que está parado, o que mudou no radar e o gasto da semana. Usar como PRIMEIRA coisa do dia, uma vez só, antes de qualquer /arvys:open. Não usar para "como estamos" no meio do dia (isso é /arvys:status, que agrega o L1 ao vivo): este ritual lê o retrato de madrugada e não recalcula nada.
---

# /arvys:briefing

O briefing **já está escrito** quando você chega. Este ritual lê o arquivo —
ele não descobre nada, não varre o repositório, não conta nada.

## Antes do passo 1 — este projeto tem escritório?

Se `company/BRIEFING.md` **não existir**, verifique se `company/STATE.md`
existe. Sem ele, este diretório não é um escritório Arvys: diga isso e ofereça
`/arvys:start`. Com ele, o briefing só não foi gerado ainda — mande rodar a
corrente noturna. **Nos dois casos, nunca resuma de memória.**

## Passos

1. Leia `company/BRIEFING.md`. **Só isso.**
2. **No Windows, confira o agendador ao vivo** — o worker já grava
   `⚠️ agendador: …` no arquivo quando a corrente falhou, mas essa marca é do
   tamanho da última rodada noturna; aqui o ritual pergunta ao vivo, sem
   esperar a próxima corrente. Rode pela ferramenta **PowerShell** (nunca
   Bash/cmd — `schtasks` quebra no Git Bash por conversão de caminho, ex.:
   `/query` vira `C:/Program Files/Git/query`; use só a ferramenta
   PowerShell):
   ```
   Get-ScheduledTaskInfo -TaskName 'Arvys - corrente noturna' -ErrorAction Stop | Select-Object @{n='last';e={$_.LastRunTime.ToString('o')}},LastTaskResult,@{n='next';e={$_.NextRunTime.ToString('o')}} | ConvertTo-Json -Compress
   ```
   e resuma em **1 linha** ao dono: última execução, código e próxima
   execução —
   - `LastTaskResult` **0** = ok;
   - **267009** = rodando agora (é o caso da própria corrente disparando
     neste instante) — não é erro (`workers/briefing.js:155`,
     `RESULTADOS_OK`);
   - **267011** = a tarefa existe mas nunca rodou;
   - qualquer outro código = falhou, mostre o código.
   - **A ferramenta PowerShell roda mas o `Get-ScheduledTaskInfo` retorna erro
     de "tarefa não encontrada"** (`-ErrorAction Stop` derruba o comando com
     saída ≠ 0): mostre ao dono **"agendador não configurado — a corrente não
     roda sozinha"** — nunca silencie este caso, e nunca cole a exceção crua
     do PowerShell na tela (`workers/briefing.js:171`, mesmo texto do
     alerta que o worker grava).

   **Fora do Windows** (a ferramenta PowerShell não está disponível na sessão,
   ou falha ao nem conseguir chamar o binário `powershell`): pule este passo
   **em silêncio** — não é erro, é ambiente sem agendador. Isto é redundante
   de propósito com o sensor do worker (gotcha nº 27: defesa que depende de
   o modelo lembrar não é defesa) — cada um cobre o outro.
3. Apresente as linhas ao dono, verbatim, e diga a data da medição que consta
   no cabeçalho do arquivo.
4. Se o briefing disser **"sem novidade e nada esperando você"**: diga isso em
   uma linha e **pare**. Dia sem nada não vira sessão — é a regra do PLAYBOOK
   ("checklist vazio = não roda"), e é onde a cota é economizada de verdade.
5. Se houver algo esperando o dono, pergunte **o que ele quer pegar**. Não
   escolha por ele e não comece a trabalhar: a escolha de prioridade é do dono.
   A linha **"Radar: N pendente(s) para o Scout curar"** tem porta própria:
   `/arvys:radar` (o Scout propõe etiqueta, o dono aprova item a item).

## Como isto aparece na tela

O dono acompanha o ritual pela tela — ela é parte da entrega, não sobra.

- **Uma leitura, uma linha.** Este ritual lê UM arquivo com o leitor de
  arquivos. A única exceção é o passo 2 (agendador ao vivo, só Windows): o
  comando PowerShell aparece na tela com a descrição do porquê ("conferindo
  se a corrente noturna disparou sozinha"), e o resultado vira 1 linha —
  nunca o JSON cru.
- Apresente as linhas do briefing **verbatim, em lista**, com a data da medição
  em negrito no topo — e diga se ela é de hoje.
- **Dia sem nada termina em duas linhas.** Encher a tela para parecer trabalho é
  o oposto do que este ritual faz.

## Regras

- **Proibido varrer o repositório.** Se você está prestes a ler `specs/`,
  contar `incidents/` ou rodar `git log` para montar o briefing, pare: esse
  trabalho é do `workers/briefing.js`, que roda sem gastar token. Ler o repo
  aqui é pagar por uma conta que já foi feita de graça.
- **Arquivo ausente ou velho:** se `company/BRIEFING.md` não existe, ou a data
  da medição no cabeçalho é de dois dias ou mais, avise o dono e mande rodar
  a corrente noturna do projeto (no Arvys, `scripts\noite.cmd`; projeto sem
  corrente ainda não tem briefing — não é erro). **Nunca preencha a lacuna
  com o que você lembra** — a
  regra da casa é que célula sem fonte é `n/d`, nunca um número.
- **O briefing não opina, e você também não.** Ele conta e ordena. Adicionar
  "isso está atrasado" ou "recomendo priorizar X" é julgamento — legítimo
  numa conversa, desde que dito como sua opinião, nunca como se estivesse no
  arquivo.
- Este ritual **não abre agente**. Depois dele o dono decide, e aí sim vem o
  `/arvys:open <agente>`.

## Como o briefing é escrito

De madrugada, `scripts\noite.cmd` roda a corrente
`tokens.js → office-metrics.js → radar.js → briefing.js`, tudo determinístico,
sem LLM. Os elos de consumo, métricas e briefing são fatais — a corrente **para
no primeiro erro** e o briefing de ontem permanece com a data de ontem visível
(dado velho declarado é melhor que dado velho disfarçado de fresco). O `radar`
depende de rede e **não é fatal**: se falhar, o briefing usa o `RADAR.json`
anterior.

O próprio arquivo carrega dois sensores, escritos pelo worker: **`DADO VELHO`**
quando a medição tem 2+ dias, e **`agendador:`** quando a tarefa do Windows que
dispara a corrente nunca rodou, não existe, terminou com erro ou não rodou hoje.
Log de saída prova que o script rodou, não quem o chamou (gotcha nº 32 do
Forge) — por isso a pergunta é feita ao agendador, não ao log. Se um desses
alertas aparecer, ele é a primeira coisa a mostrar ao dono.

Specs: `specs/2026-09-briefing-diario/` · `specs/2026-09-radar-claude-code/`
