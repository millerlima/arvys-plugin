---
titulo: Escola de prompt
ordem: 04
cenarios: [fix, feature, primeira-sessao]
perfil: ambos
---

# Escola de prompt — como pedir

> Analogia: pedir a um marceneiro "faz uma mesa aí" rende uma mesa qualquer.
> "Mesa de jantar para 6, madeira clara, cabe no vão de 1,80 m, pronta até
> sexta" rende a mesa que você queria. O marceneiro é o mesmo. O pedido não.

O orquestrador delega com um **mandato de 6 campos** (objetivo · formato de
saída · arquivos e ferramentas permitidos · fronteiras · critério de pronto
com evidência · papel). Você não precisa dos 6. A versão humana tem **4** —
e cobre 90% dos casos.

## A anatomia do bom pedido

| Campo | A pergunta que ele responde | Se faltar |
|---|---|---|
| **Objetivo** | O que muda no mundo quando isto estiver feito? | o agente escolhe um objetivo plausível — e plausível errado vira bug |
| **Contexto** | Onde mora (arquivo, tela, rota)? O que já foi tentado? | o agente explora o repo na sua sessão, gastando o seu contexto |
| **Limite** | O que ele NÃO pode tocar (banco, `.env`, commit, outros arquivos)? | ele toca. O incidente de 2026-09-09 (`incidents/`) foi exatamente isso |
| **Pronto** | Que evidência prova que acabou? | "está no ar" vira afirmação sem prova — o anti-padrão 3 do `OWNER.md` |

Formato que funciona, copiável:

```
Objetivo: ...
Contexto: ...
Limite: ...
Pronto: ...
```

Você não precisa escrever "Objetivo:" — precisa que os 4 estejam lá.

## Receitas por situação

**Fix pequeno (L0-L1):**

```
Objetivo: o total do carrinho arredonda errado (R$ 10,005 vira 10,00).
Contexto: src/lib/preco.ts, função total(). Aparece na tela /carrinho.
Limite: só esse arquivo; sem mudar a assinatura; não commitar.
Pronto: teste unitário com 10,005 → 10,01 verde, e tsc limpo.
```

**Feature (L2):** o pedido vira spec — dê o objetivo e o "pronto" e deixe o
`/arvys:spec` perguntar o resto.

```
Objetivo: cliente exporta o extrato em PDF pela tela de conta.
Contexto: tela /conta já lista as transações; não temos gerador de PDF.
Limite: nada de serviço pago novo; sem tocar no schema.
Pronto: botão visível na tela, PDF abre no celular, deploy READY com URL.
```

**Pesquisa / decisão técnica:** peça a **mesa aberta**, não a sua opinião.

```
Objetivo: decidir se a busca vai por ILIKE ou índice full-text.
Contexto: corpus de 4 MB hoje, ~50× em um ano.
Limite: não implementar; medir e registrar em DECISIONS.md.
Pronto: número medido nos dois caminhos, decisão com o voto vencido.
```

(Foi assim que a T1 do E6 nasceu — [07-exemplos-reais.md](07-exemplos-reais.md), sessão 2.)

**Aprovação (gate):** responda com uma palavra. "sim", "ajustar: <o quê>",
"quebrar em partes". "Pode seguir" vale para o bloco inteiro apresentado.

## Três pares antes/depois — reais, com a origem

Nenhum destes é inventado. O "antes" é a frase literal do dono; o "depois" é
o que o escritório escreveu a partir dela — e onde está gravado.

### Par 1 · Padrões de interface

**Antes** (dono, 2026-09-06, gravado em `OWNER.md`, seção "Padrões de
interface"):

> "vc sabe de acordo com os projetos anteriores que gosto de…"

Pedido verdadeiro, impossível de executar: o escritório **não sabia** — os
padrões vinham dos projetos anteriores e nunca tinham sido escritos; por isso
o front do QG nasceu sem eles.

**Depois** (`OWNER.md`, os 3 padrões, válidos para toda tela nova sem precisar
pedir):

> 1. Acionamento em campo clicável — hover, foco, cursor, retorno ao clique.
> 2. Janela de detalhamento — item de lista abre painel/modal sem perder o
>    lugar na lista.
> 3. Pelo menos 3 formas de visualização, tabela ordenável e filtrável
>    obrigatória; a escolha persiste.

**O que mudou:** "o que eu gosto" virou 3 critérios de pronto verificáveis. A
seção Biblioteca do QG nasceu já com os 3 (`specs/2026-09-biblioteca/spec.md`,
critério 4) — sem ninguém ter de lembrar.

### Par 2 · O painel

**Antes** (dono, sessão de 2026-09-02, citado em `company/DECISIONS.md`,
"QG e a fila combinada"):

> "preciso é saber se o Arvys está cumprindo o que planejamos… bota ele
> oficialmente como meu framework oficial"

Dois pedidos numa frase (um painel; uma decisão de adoção), sem contexto,
limite nem pronto.

**Depois** (`company/DECISIONS.md`, retro 1 + "QG onda 1 entregue";
`specs/2026-09-qg-tokens/spec.md`):

> QG sai da fila como **L3**, em ondas: 0 METRICS.md sem código · 1 tokens
> via `ccusage` pinado (sem parser próprio) · 2 fila de gates. **Limite:**
> sem dólar no painel (assinatura ≠ API). **Pronto:** `company/TOKENS.json`
> como fonte, o hub renderiza, JSON commitado como histórico.

**O que mudou:** a frase vaga virou uma escala (L3), uma ordem de ondas e um
limite explícito que evitou uma discussão inteira (dólar). A "adoção oficial"
virou linha própria em DECISIONS, separada do painel.

### Par 3 · Esta biblioteca

**Antes** (dono, 2026-08-31, `company/FILA.md`, item 2):

> "Biblioteca do Arvys — manual de uso eficiente" … receitas por cenário,
> boas práticas, worktree, exemplos reais, anti-padrões, glossário,
> troubleshooting, mentor de onboarding, escola de prompt…

Escopo generoso, bem descrito, e **grande demais para uma spec**: dois
produtos (manual + mentor) no mesmo item.

**Depois** (`specs/2026-09-biblioteca/spec.md`):

> **Parte A** (esta spec): 8 capítulos com frontmatter, leitor no QG, 3
> visualizações, busca, coach de prompt em hook — `UserPromptSubmit`, máx. 1
> por sessão, desligável. **Fora de escopo, explícito:** o mentor de
> onboarding (Parte B, `/arvys:hire` próprio), biblioteca paga, subdomínio,
> tradução `en`. **Pronto:** 8 sensores nomeados, gate visual do dono no
> celular.

**O que mudou:** o pedido foi **cortado** (Parte A / Parte B) em vez de
inchado, e o "fora de escopo" ficou escrito — para ninguém "aproveitar e
fazer" o mentor no meio.

## Os 4 erros clássicos

1. **Pedido vago.** "Faz aí", "vê isso", "melhora". Sem objetivo o agente
   escolhe um; sem pronto, ele declara pronto quando quiser. O coach de prompt
   existe para este erro: ele atende **e** mostra o seu pedido reescrito em 4
   campos — uma vez por sessão, nunca sermão.
2. **Três assuntos num prompt.** Cada assunto reenvia os outros dois a cada
   mensagem, e o `/arvys:close` não sabe qual L1 gravar. Um assunto por
   sessão; o segundo espera o `/clear`.
3. **Colar arquivo inteiro.** Custo em [03-anti-padroes.md](03-anti-padroes.md),
   item 3. Aponte o caminho.
4. **"Faz aí" sem critério de pronto.** É o que gera "está no ar" sem deploy
   READY e "já existia pronto" sem reler código (`OWNER.md`, anti-padrões 1
   e 3). Diga o que prova que acabou — teste, captura, URL, exit 0.

## O coach de prompt — o que esperar

Quando o seu pedido chega vago ou com vários assuntos, o orquestrador atende
normalmente e fecha com:

> Recebi. Se tivesse vindo assim, eu renderia mais: …

seguido do **seu** pedido reescrito nos 4 campos. Regras: no máximo 1 por
sessão; no tom do seu perfil (vibecoder = analogia; dev = direto); nunca em
comando `/arvys:*`; nunca bloqueia. Para desligar, uma linha no `OWNER.md`:

```
Coach de prompt: desligado
```

Vibecoder vem ligado por padrão; dev, desligado.
