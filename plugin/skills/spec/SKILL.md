---
name: spec
description: Cria o cache de decisão de uma iniciativa L2+ do Arvys — spec.md (o quê), plan.md (como) e tasks.md (checklist) — com gate humano ANTES de qualquer código. Usar quando a demanda é uma feature, um módulo ou um épico: mexe em mais de dois ou três arquivos, vale a pena a sessão de amanhã reler em vez de redescobrir, ou o dono precisa aprovar a abordagem antes de existir código. NÃO usar em L0/L1 (correção pontual, ajuste de texto, um arquivo) — ali plan mode basta e a cerimônia mata a mudança pequena. Produto novo sem PRD começa por /arvys:genesis, que termina onde esta skill começa.
---

# /arvys:spec

Spec não é burocracia: é o arquivo que a sessão de amanhã relê por centenas de
tokens em vez de redescobrir por dezenas de milhares. **Token caro planeja aqui;
token barato digita depois.**

## Passos

1. Crie `specs/YYYY-MM-<slug>/` com:

   **spec.md** (1 página em L2; mais só em L3-L4):
   - Problema e resultado esperado (na língua do dono, não do programador)
   - **Estado de partida** (P2, retro 3 — obrigatória): 3 perguntas antes dos
     critérios de aceitação — (a) qual estado a produção tem que o teste não
     tem? (b) qual entrada malformada este código vai receber? (c) o que já
     está gravado quando isto roda pela 2ª vez? Não aplicável vira `n/a`
     **com motivo**, nunca em branco.
   - Critérios de aceitação verificáveis
   - `required_sensors`: a evidência que declara pronto, cada linha com
     **fonte primária nomeada** (ex.: tsc limpo, testes verdes, i18n
     coverage, build de produção, deploy READY na URL fixada — a fonte é o
     comando/sistema que responde, nunca o formato onde a coisa costuma
     aparecer) **e `provado vermelho em: <caminho>`** — onde aquele sensor
     REPROVOU alguma vez. Sensor herdado de outra spec também precisa: foi
     justamente um sensor herdado, no `verify` havia meses, que tinha 7 furos.
     Sem o caminho, escreva `provado vermelho em: NÃO — <por quê>`; ausência é
     dívida declarada, nunca campo em branco.
     *Lei do Kaizen, virada campo na retro 4 (2026-09-06): num único dia, cinco
     sensores deste escritório estavam verdes sem medir nada — um com 10 furos,
     um medindo zero por uma regex comida por heredoc, um com 7 furos, um
     recém-escrito com 10, e um CI que rodava 4 de 12 elos.*
   - Fora de escopo (explícito)

   **plan.md**:
   - Abordagem escolhida E a alternativa descartada com motivo
   - Lista EXAUSTIVA de arquivos a tocar (usar o subagente `explorer` para mapear
     — não queimar contexto do agente principal)
   - Riscos nomeados, cada um com o **estado de partida do ataque** (o
     fixture concreto que o `reviewer` vai receber — P4) → como o `reviewer`
     deve atacá-lo depois
   - Ordem de execução

   **tasks.md**: checklist com status por tarefa; cada tarefa carrega seu pacote
   de contexto (arquivos + trechos relevantes) para execução isolada barata, e
   a linha `*Sensor:* <o que provar> — fonte primária: <...>` (P1), **e a
   linha `*Pronto:*`** (retro 6, 2026-09-13, feedbacks ratificados como
   `campo-sensor`) com dois itens: (a) **os sensores que importam DIRETO
   qualquer arquivo que a tarefa toca** — a resposta sai de
   `grep -l "<arquivo>" scripts/*.test.mjs`, 1 segundo; `tsc` e o sensor HTTP
   não veem o que o loader do Node recusa (precedente: `with { type: "json" }`
   passou em tudo e caiu no `verify` inteiro, FILA 79 T5b) — e (b) em tarefa
   de **gate visual**, `estado de partida conferido em produção: <o que, como>`
   (precedente: a T7 da FILA 79 assumiu card movível e o corpus real tinha 0
   blocos; o migrate do E8 tinha sido provado contra cópia). Bloco
   final **Pré-review** (P5): uma linha por risco do `plan.md` com a evidência
   de que foi exercitado, ou "não exercitado" explícito.

2. **GATE — grave `status: gate` no frontmatter de `spec.md` e pare e pergunte:
   "Proceed? (sim / ajustar / quebrar em partes)"** Nenhum código antes do sim.
   Review de ABORDAGEM antes de review de código.

3. Após o sim do dono: grave `status: aprovada` **e, na mesma escrita,
   `gate_aprovado: YYYY-MM-DD — "<frase literal do dono>"`** no frontmatter.
   Sem essa linha o gate existe só em prosa e nenhum worker consegue medir que
   houve gate (precedente: `walkthrough-gate`, retro de 2026-09-03). Nunca
   preencher retroativamente — gate sem registro fica sem registro. Ao começar a executar
   tasks.md, grave `status: em-execucao`. Marque status por tarefa; ao final,
   **preencha o bloco Pré-review do `tasks.md`** (uma linha por risco do
   `plan.md`, com evidência ou "não exercitado" — P5) e só então rode os
   `required_sensors` e cole a evidência na spec antes de declarar pronto.

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
- **O GATE é a tela mais importante deste ritual**: mostre-o isolado, com o
  resultado esperado, a seção **Estado de partida**, os critérios de
  aceitação e o fora de escopo, e a pergunta em linha própria. Gate afogado
  em texto é gate que o dono aprova sem ler.

## Regras

- L0-L1 NÃO usa esta skill (plan mode basta) — cerimônia mata mudança pequena.
- Produto NOVO sem PRD (L4) usa `/arvys:genesis` primeiro — esta skill assume
  que o QUÊ já é conhecido.
- Spec aprovada muda? Atualizar spec.md ANTES de mudar o código.
- A pasta da spec é permanente: é memória de por que o sistema é como é.
