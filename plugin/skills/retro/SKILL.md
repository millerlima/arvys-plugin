---
name: retro
description: Retrospectiva semanal do escritório Arvys — transforma os incidentes da semana em leis do harness, ratifica os feedbacks pendentes aos agentes e calibra a economia de tokens com dados reais. O dono aprova cada mudança, uma a uma. Usar quando o dono pedir a retro, quando `incidents/` acumulou erros que ainda não viraram gotcha, quando há feedback "a ratificar" em `agents/*/FEEDBACK.md`, ou ao fim de uma semana de trabalho. É o único ritual que muda as leis do escritório — nenhum outro escreve em GOTCHAS a partir de incidente.
---

# /arvys:retro

Melhoria contínua com humano no gate: **a retro propõe, o dono aprova.**
Erro vira lei; lei sem precedente vira ruído.

## Passos

1. **Colete a semana:**
   - `incidents/` novos + entradas recentes dos `GOTCHAS.md` de cada agente
   - `company/DECISIONS.md` da semana
   - `agents/*/FEEDBACK.md` — o que o dono deixou na sala do RH e o que o
     orquestrador registrou no `close` (FILA 43). **Nunca podar nada deste
     arquivo:** o histórico é o que permite dizer "melhorou desde o feedback X".
   - Peça ao dono os números de `/usage` e `/insights` (cota, sessões, modelos)
2. **Leia o boletim antes de propor treino:** `metricas.boletim.porAgente` em
   `company/OFFICE-METRICS.json` + a seção `## Auto-retro (última sessão)` de
   cada `agents/<agente>/STATE.md`. Regra: linha ruim em X = o agente não pega
   missão nova em X antes do treino (playbook ou gotcha). O julgamento é da
   retro COM o dono, nunca automático — e nenhuma linha vira média nem
   ranking (guarda Goodhart).
2b. **Ratifique os feedbacks do orquestrador** (FILA 43,
   `specs/2026-09-feedback-orquestrador/`). Toda linha `(orq · … · a ratificar)`
   dos `agents/*/FEEDBACK.md` é **proposta**, não veredito: o orquestrador
   observou, o dono julga. Uma a uma, com a frase do dono registrada — a mesma
   régua do `gate_aprovado` da spec (sem frase, não houve gate).

   **O orquestrador NUNCA ratifica o próprio feedback.** Se não houver o dono
   nesta sessão, as linhas ficam `a ratificar` e a retro segue — proposta velha
   é informação, proposta ratificada sozinha é o avaliador se dando razão.

   Ratificar exige **classificar o nível** (critério 12) — sem ele, não
   ratifica:
   - `hook` — vira código que recusa o erro antes de acontecer;
   - `campo-sensor` — vira campo obrigatório de ritual ou número de worker;
   - `prosa` — vira linha de `GOTCHAS.md`/playbook, **e só quando os dois
     acima foram descartados por escrito**.

   A ordem não é estética: o agente é markdown, e prosa que ninguém lê é peso,
   não aprendizado. O `GOTCHAS.md` do Forge já tem 39 itens. Se a resposta for
   sempre `prosa`, os agentes estão acumulando, não evoluindo — e
   `feedbacksDoEscritorio.ratificadosPorNivel` no `OFFICE-METRICS.json` mostra
   essa distribuição de propósito.

   **Gravação — nunca à mão, sempre pelo módulo** (achado adjacente-1 do
   reviewer, 2026-09-06: enquanto a ratificação era edição manual, uma linha
   `ratificado <data>` **sem** `nivel:` era aceita e contada como ratificação
   boa — o critério 12 existia só em prosa, o mesmo padrão que o critério 14
   tratou como inaceitável para a autoria):

   ```
   node -e "const f=require('./workers/lib/feedback');console.log(f.formatRatificacao('<a linha inteira>',{decisao:'ratificado',nivel:'<hook|campo-sensor|prosa>',data:'AAAA-MM-DD'}))"
   ```

   `formatRatificacao` **lança** se faltar nível (ou se o nível não estiver no
   conjunto), lança se a linha não estiver `a ratificar` — ratificação não se
   refaz — e devolve a linha com **só** a marca trocada. `riscado` não pede
   nível: o dono discordou do feedback, não há aprendizado a classificar.

   **Dois números para olhar antes de propor treino** (`feedbacksDoEscritorio`):
   - `porOrigem.mandato` — mede o ORQUESTRADOR, não o agente. A auditoria do
     Kaizen achou 29 de 42 defeitos nascendo no mandato; se esta contagem vive
     em zero, a leitura provável é que a triagem está confortável.
   - `leiQueNaoPegou` — não é aprendizado novo: é lei que já existia e voltou.
     A ação aqui é **apertar a lei ou removê-la**, nunca escrever a mesma lei
     de novo (foi o caso do 1º feedback real do escritório, 2026-09-05).
3. **Diagnostique (máx. 5 linhas):** o que travou, o que repetiu, onde a cota foi.
4. **Proponha 1-3 mudanças no harness** — nunca mais que 3. Cada proposta:
   - O quê (arquivo exato a mudar: PLAYBOOK, GOTCHAS, skill, CLAUDE.md)
   - Precedente concreto que a justifica
   - Custo/risco da mudança
5. **Apresente uma a uma para aprovação.** Aplicar somente as aprovadas.
6. Registre a retro em `company/DECISIONS.md` (`## YYYY-MM-DD — Retro semanal`:
   aprovadas E rejeitadas, com motivo).
7. Incidentes fechados na retro: marcar prevenção como VERIFICADA (a regra nova
   existe e é acionável) ou manter aberto.

## Regras

- Retro nunca muda o harness sozinha — sem aprovação, sem escrita.
- GOTCHAS com 3+ meses sem serem relevantes: propor arquivamento (memória com
  cron de invalidação — regra que não protege mais é peso morto).
- CLAUDE.md do orquestrador passou de ~600 tokens? A retro DEVE propor corte.
