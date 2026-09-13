---
name: genesis
description: Trilha de nascimento de produto do Arvys (demanda L4) - da ideia vaga ao primeiro épico executável, em 6 etapas com entrevista socrática e gate do dono em cada uma. Usar quando o dono quer criar um SaaS/produto novo e ainda não existe PRD. Termina onde o /arvys:spec começa.
---

# /arvys:genesis <nome-do-produto>

Nascimento de produto para quem NÃO precisa saber programar. A regra de ouro:
**a IA pergunta, o dono responde** — uma pergunta por vez, em língua de gente,
explicando qualquer termo técnico por analogia. "Ainda não sei" é resposta
válida: vira item `VALIDAR`, nunca trava a trilha.

## Estrutura

Artefatos em `specs/YYYY-MM-<produto>/genesis/`. **O artefato da etapa N é
entrada obrigatória da etapa N+1** — nenhuma etapa roda sem o anterior
aprovado. Uma etapa por sessão (fechar com `/arvys:close`; se encher no meio,
`/arvys:checkpoint`). Todo gate é leitura + pergunta binária, nunca "revise o
código".

## As 6 etapas

### 1 · DESCOBERTA — ARVYS entrevista, Scout pesquisa
Entrevistar o dono: a dor (de quem? quanto custa em tempo/dinheiro?), a jornada
de hoje, a hipótese de solução, para quem NÃO é (anti-persona). Scout pesquisa
o que o dono marcou VALIDAR.
→ `01-descoberta.md`: problema, proposta de valor em 1 frase ("ajuda [quem] a
[o quê] sem [dor]"), personas + anti-persona, hipóteses com dono (dono/Scout).
**GATE:** "estas hipóteses são suas? Proceed?"

### 2 · BENCHMARK + VOLUMETRIA — Scout
Fan-out nos concorrentes; matriz commodity (todos têm) / diferencial (alguns) /
oportunidade (ninguém); reclamações reais de usuários (reviews, fóruns);
tamanho de mercado com cenários pessimista/realista. Disciplina padrão do
Scout: FATO com fonte ≠ INFERÊNCIA; claim de concorrente sem verificação
humana fica em INFERÊNCIA.
Volumetria segue o template do dono: `specs/_TEMPLATE/genesis/volumetria.md`
(4 eixos, TAM/SAM/SOM, cenários 1/5/10% do SAM em 6/12/24m, hipóteses com
confiança — bloco variável único).
→ `02-mercado.md` + checklist de 2-3 claims para o dono conferir manualmente.
**GATE — as 3 perguntas-guarda:** vale seu tempo? a dor é recorrente? escala?
⚠️ **Matar a ideia aqui é um final feliz.** Registrar o porquê em
`company/DECISIONS.md` e parar — custou uma pesquisa, não seis meses.

### 3 · PRD + CORTE DE MVP — Deal conduz, por entrevista
PRD seção a seção via perguntas (problema, público, jornada, features, modelo
de cobrança, métricas de sucesso, riscos). Depois o corte: **máx. 5 features
no MVP**, cada uma com "o que faz / quem usa / por que é crítica"; todo o
resto vai para OUT com motivo escrito. **Regra: o agente é PROIBIDO de gerar
o documento antes de ter feito as perguntas críticas e recebido respostas.**
→ `03-prd.md` (com seção OUT OF SCOPE em destaque)
**GATE:** dono lê só o OUT: "é isso mesmo que você NÃO vai fazer agora?"

### 4 · ARQUITETURA + CONTEXTO — Forge
Stack (padrão do PLAYBOOK, desvio só com motivo), custo free-tier-first com
gatilho de estouro ("quando passar de X usuários, custa Y"), riscos 🔴🟡🟢,
2-3 decisões registradas com trade-off, dívidas técnicas ACEITAS com prazo.
Fecha com o contexto do produto — **regra: zero alternativas em aberto; um
dev (ou agente) começa sem perguntar nada básico.**
→ `04-arquitetura.md` + `PROJECT-CONTEXT.md` (vai para a raiz do repo novo)
**GATE:** dono aprova as decisões e o custo mensal máximo.

### 5 · REPO + AMBIENTE SEGURO — Forge
Repo git, primeiro commit com o genesis/ inteiro, `.env` de dev NUNCA
apontando para produção, leis de banco do PLAYBOOK aplicadas no scaffold.
→ checklist de itens que o dono marca ✓ a ✓ (valida por leitura).
**GATE:** checklist completo.

### 6 · ÉPICOS + PRIMEIRA ONDA — Forge (+ Echo em paralelo)
Quebrar o MVP em épicos e stories (critério DADO-QUANDO-ENTÃO; story grande
demais quebra em duas; requisito ausente vira stub+TODO, nunca invenção).
Echo recebe personas + mercado e abre o posicionamento em sessão própria.
→ `05-epicos.md` — e daqui em diante **cada épico é uma iniciativa L2/L3
normal: `/arvys:spec` por épico**, com reviewer e sensores. O genesis deságua
no fluxo existente; não existe segundo motor.
**GATE FINAL:** dono lê todas as stories da primeira onda: "é isso?"
