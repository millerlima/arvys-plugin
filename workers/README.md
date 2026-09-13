# Workers — o turno da noite (sem LLM)

Scripts determinísticos que rodam 24/7 de graça via Task Scheduler do Windows
e mantêm o estado fresco. O LLM lê o resultado; nunca participa da coleta.

## As duas formas de worker

Um worker é de **uma** destas duas formas, declarada no topo do próprio script.
Misturar as duas no mesmo worker é proibido.

### Forma A — worker de estado

Escreve **write-only no bloco `[L1]`** do STATE do seu agente (regex-replace),
para que a próxima sessão daquele agente abra já sabendo o número.
Saída: prosa curta, de uma linha, para humano ler.
Primeiro da forma A: `workers/cliente-followup.js` (follow-up de um cliente → `[L1]`
do Deal). `cliente-metrics` (pipeline e faturas completos de um cliente) segue
planejado — forma A também, quando sair da FILA.
A mecânica da escrita (regex ancorada no `[L1]`, sanitização, `.tmp` + rename,
takeover explícito por env var, janela pré-takeover no caminho de falha) mora
em **`workers/lib/l1.js`** (`createL1Writer`, `REGEX_L1`, `sanitizar`) — todo
worker forma A importa dali e traz só os seus parâmetros (STATE alvo, prefixo,
env var de takeover). Extraído dos 3 workers em 2026-09-04 (FILA item 25).

### Forma B — worker de produto

Escreve **um único arquivo de saída versionado** (JSON), consumido por painéis e
rituais. Não toca em nenhum STATE.
Saída: dado estruturado, para máquina ler.
Exemplos: `hub/tokens.js` → `company/TOKENS.json` ·
`office-metrics` → `company/OFFICE-METRICS.json`.

> A forma B existia de fato desde o `hub/tokens.js`, mas não estava no contrato.
> Foi escrita aqui em 2026-09-02, durante a spec `2026-09-office-metrics`, quando
> o mapeamento mostrou que o próximo worker nasceria seguindo a regra errada.

## Contrato (obrigatório para todo worker, nas duas formas)

1. **Determinístico e idempotente** — rodar 2× sem mudança nas fontes produz
   resultado idêntico, exceto por carimbo de tempo. Ordenar toda coleção antes
   de serializar: ordem de diretório varia entre sistemas.
2. **Um alvo de escrita, e só ele.** Forma A escreve no `[L1]` do seu agente e
   em mais nada; forma B escreve no seu arquivo de saída e em mais nada. Nunca
   tocar narrativa, decisões, gotchas ou spec. Provado por `git status`.
3. **Read-only nas fontes** — banco, API ou arquivo do repo: leitura, jamais
   escrita.
4. **Fail loudly, e nunca pela metade.** Fonte ausente ou malformada derruba o
   worker com código de saída ≠ 0 e mensagem que nomeia o arquivo culpado.
   Forma A escreve `[L1] WORKER FALHOU <data>: <erro>`. Forma B **não grava
   arquivo nenhum** — saída parcial é pior que saída nenhuma, porque tem cara de
   medição. Dado velho parecendo fresco é o defeito que este item existe para
   impedir.
5. **Credencial via variável de ambiente, nunca no código** — e nunca em arquivo
   versionado.
6. **Sem LLM em ponto nenhum do caminho.** Se precisar de julgamento, não é
   worker: é sessão.
7. **O worker mede; ninguém persegue o número.** Métrica é insumo da retro,
   nunca alvo de agente (PLAYBOOK — Goodhart).

## Existentes

- `hub/tokens.js` (forma B) — lê o `ccusage` real → `company/TOKENS.json`
- `workers/office-metrics.js` (forma B) — mede o próprio escritório a partir de
  arquivos do repo → `company/OFFICE-METRICS.json`. Sem rede, sem banco, sem
  credencial. Spec: `specs/2026-09-office-metrics/`.
  Rodar: `node workers/office-metrics.js && node hub/build.js`
  **Sessões abandonadas (FILA 12):** `metricas.sessoesAbandonadas` conta, por
  agente, as marcas `<!-- checkpoint: YYYY-MM-DDTHH:MM -->` sob `## Em
  progresso` de `agents/*/STATE.md` (regex de `plugin/skills/close/SKILL.md`;
  marca fora dessa seção não conta e vira AVISO + `foraDaSecao`). Marca
  presente = sessão aberta sem `/arvys:close`; idade > 24h em relação a
  `medidoEm` (= `generatedAt`) = abandonada. Alimenta a linha `sessoes` do
  boletim (`metricas.boletim.porAgente.<a>.sessoes.valor = {abandonadas,
  abertas, datas}`): zero marcas é **0 com fonte**, nunca `n/d` — `n/d` só
  quando o STATE não existe. Exceção deliberada à regra "só datas, nunca
  idades": duas rodadas seguidas continuam idênticas exceto pelos carimbos,
  a menos que uma marca cruze a fronteira das 24h entre elas (aí o dado
  mudou de verdade).
- `workers/briefing.js` (forma B) — escreve `company/BRIEFING.md`: até 5 linhas
  com o que espera o dono, o que está parado e o retrato de hoje. **Não calcula
  nada** — lê a saída do `office-metrics` e o `company/STATE.md`.
  Spec: `specs/2026-09-briefing-diario/`.
- `workers/radar.js` (forma B) — busca 4 fontes públicas do Claude Code e
  vizinhança (changelog do `claude-code`, índice `llms.txt` da documentação,
  commits da biblioteca oficial de skills, tags do DeepSeek Harness) →
  `company/RADAR.json` com `pendentes[]` para o Scout curar. Sem dependência
  nova (`fetch` nativo do Node ≥ 18), sem token de API, sem LLM — o worker
  **acha**, o Scout **julga** em `company/RADAR-CURADO.md`. **Não faz**
  curadoria, não avalia relevância, não toca fora de `hub/live/radar/`
  (snapshots, gitignored) e `company/RADAR.json`.
  Spec: `specs/2026-09-radar-claude-code/`.
- `workers/cliente-followup.js` (forma A) — busca `GET $CLIENTE_FOLLOWUP_URL` num
  endpoint do cliente (`Authorization: Bearer $CLIENTE_FOLLOWUP_TOKEN`) e reescreve **só** o bloco
  `[L1]` de `agents/deal/STATE.md` com leads parados, orçamentos sem
  resposta, saúde dos crons de follow-up (SMS/e-mail) e faturas vencidas.
  Env vars obrigatórias: `CLIENTE_FOLLOWUP_URL`, `CLIENTE_FOLLOWUP_TOKEN` — sem elas, ou
  com o endpoint fora do ar/token errado, grava `[L1] WORKER FALHOU <data>:
  <motivo>` e sai com código ≠ 0. `[L1]` guarda `measuredAt` do JSON, nunca
  `new Date()` do worker (idempotência). Sem dependência nova (`fetch` nativo
  do Node ≥ 18). `CLIENTE_FOLLOWUP_URL` precisa começar com `https://` (exceto
  `http://127.0.0.1`/`http://localhost`, só para teste local) — `http://` para
  qualquer outro host perde o `Authorization` no redirect 308 da Vercel e vira
  um "HTTP 401" enganoso (review T4, achado 10). O worker só sobrescreve um
  `[L1]` que reconheça como seu (prefixo `**Follow-up Cliente —` ou `WORKER
  FALHOU`); um `[L1]` diferente (texto humano curado) faz o worker abortar com
  código 2 sem tocar no arquivo — exceto na 1ª rodada real, quando o dono roda
  **uma vez** com `CLIENTE_FOLLOWUP_TAKEOVER=1` no ambiente para autorizar a 1ª
  sobrescrita (review T4, achado 8). **Janela pré-takeover no caminho de
  FALHA** (review T4-review-2, defeito novo 3): antes do 1º `CLIENTE_FOLLOWUP_TAKEOVER=1`,
  o `[L1]` atual é o texto humano — se o worker falhar (URL/token errados,
  endpoint fora do ar, JSON malformado) *nessa janela*, ele NÃO grava
  `WORKER FALHOU` por cima do bloco humano; o motivo completo vai só para o
  stderr (`cliente-followup FALHOU (motivo completo): ...` + `[L1] humano
  preservado; WORKER FALHOU não gravado.`) e o processo sai com código **1**
  (falha real do worker), não 2 (reservado ao caminho de sucesso). Ou seja: a
  frase "o Deal lê `WORKER FALHOU`" (ver seção "A corrente noturna" abaixo) só
  vale **depois** do 1º takeover — na 1ª noite real, uma falha do worker é
  visível apenas no log, não no `[L1]`. `montarL1()` e `morrer()` sanitizam
  `source`/`measuredAt`/`motivo` (colapsam qualquer whitespace, inclusive
  quebra de linha, num espaço; `motivo` é truncado em 200 chars) — sem isso um
  `\n\n` em qualquer um desses campos partiria o delimitador do bloco `[L1]` e
  faria o STATE crescer sem limite a cada rodada (review T4-review-2, defeito
  novo 2). Spec: `specs/2026-09-followup-autopilot/`.
- `workers/cliente-content.js` (forma A) — lê o **repositório local** de um cliente em
  `$CLIENTE_REPO_PATH` (sem rede, sem banco, sem credencial): `git log main
  --since=7.days` (contagem por tipo `feat`/`fix`/`docs`/outros, até 5
  títulos `feat` mais recentes em ordem cronológica, sem hash) + a linha
  `**Placar:` de `docs/PAINEL.md`, e reescreve **só** o bloco `[L1]` de
  `agents/echo/STATE.md` (prefixo `**Conteúdo Cliente —`). `measuredAt` = data
  ISO do commit mais recente, nunca `new Date()`. Env var obrigatória:
  `CLIENTE_REPO_PATH` — ausente, pasta inexistente, sem branch `main`, `git`
  indisponível ou `PAINEL.md` sem `**Placar:` → `[L1] WORKER FALHOU <data>:
  <motivo>` e exit 1. Mesmas defesas do `cliente-followup`: sobrescrita recusada
  (exit 2, arquivo intacto) se o `[L1]` não for do worker, exceto **uma vez**
  com `CLIENTE_CONTENT_TAKEOVER=1`; janela pré-takeover no caminho de falha;
  títulos/placar/motivo sanitizados (whitespace colapsado, título truncado em
  120 chars, `$'`/`$&`/crase literais via replacer function). Só `feat` conta
  como funcionalidade; títulos em português ficam em português (o Echo traduz
  na peça). Spec: `specs/2026-09-echo-conteudo/`.
- `workers/health.js` (forma A) — checklist fixo de 7 verificações sobre o
  próprio harness: build do hub (`node hub/build.js`), referências quebradas
  entre crases (`agents/**`, `company/*.md`, `specs/*/spec.md`, só caminhos
  com prefixo `agents/ company/ specs/ workers/ hub/ plugin/ scripts/ docs/
  incidents/`), `[L1]` defasado de qualquer agente (> 3 dias), checkpoint
  órfão em `specs/*/tasks.md` com spec ainda `em-execucao` (> 2 dias),
  `git status`/`git rev-list` soltos (git medido ANTES do build, R2: o build
  regrava `hub/index.html`), versão do plugin divergente
  (`plugin/.claude-plugin/plugin.json` × `.claude-plugin/marketplace.json` ×
  `installed_plugins.json`) e o Agendador do Windows (mesma consulta do
  `briefing.js`; `n/d` fora do Windows). Reescreve **só** o bloco `[L1]` de
  `agents/pulse/STATE.md` — prefixo `**Saúde do harness —`. Cada verificação
  tem try/catch próprio: uma que falhar sozinha vira `n/d: <motivo>` no
  `[L1]`, nunca derruba as outras seis. Achado não é falha do worker — exit 0
  com ou sem achados; só o próprio worker (`HEALTH_ROOT` inexistente,
  `agents/pulse/STATE.md` ilegível) grava `[L1] WORKER FALHOU <data>:
  <motivo>` e sai com código ≠ 0. Mesmas defesas do `cliente-followup`/`cliente-content`:
  sobrescrita recusada (exit 2) se o `[L1]` não for do worker, exceto **uma
  vez** com `HEALTH_TAKEOVER=1`. `HEALTH_ROOT` (opcional, só para ensaiar as 7
  condições numa pasta descartável) e `ARVYS_CLAUDE_HOME` (opcional, mesma
  variável do `instalacao.js`) não mudam nada na corrente de produção — sem
  elas, é sempre o repo e o `~/.claude` reais. `workers/briefing.js` lê o
  `[L1]` do Pulse e mostra `⚠️ **Pulse: N achado(s)**` no topo quando N > 0.
  Spec: `specs/2026-09-health-watchdog/`.
- `workers/instalacao.js` (**não é worker — é sensor, não escreve nada**) —
  diz por qual forma o plugin `arvys` chega ao Claude Code — `plugin`
  (`installed_plugins.json` + `enabledPlugins`), `junction`
  (`~/.claude/skills/arvys` → `plugin/`, dev), `duplicada` (as duas; o CLI
  ignora a junction) ou `ausente`; acusa junction legada `arvys-*`. Como CLI
  imprime o diagnóstico e sai 1 se não estiver OK; o `briefing.js` o importa e escreve
  `⚠️ instalação:` no `BRIEFING.md` só quando algo diverge. Nasceu do achado
  BAIXA do reviewer (2026-09-03): junction fora do git não era auditável.

## A corrente noturna

`scripts\noite.cmd` roda os workers em ordem — **e é o mesmo arquivo que o
Agendador do Windows executa**. Não existe versão "de teste" diferente da real:
é o que evita o clássico "no meu funciona".

```
tokens.js  ->  office-metrics.js  ->  radar.js  ->  cliente-followup.js  ->  cliente-content.js  ->  health.js  ->  briefing.js
```

**Para no primeiro erro, de propósito — exceto no elo `radar`.** Se a coleta de
consumo falhar por falta de rede às 3h, o briefing NÃO é reescrito: o de ontem
permanece, com a data de ontem visível. Dado velho declarado é melhor que dado
velho disfarçado de fresco (contrato item 4). O radar é a única exceção
deliberada: fonte externa fora do ar não pode travar o briefing do dia — se
`radar.js` falhar, o log registra `radar FALHOU - segue sem ele` e a corrente continua
até o briefing (spec `2026-09-radar-claude-code`, risco R2). O elo
`cliente-followup` segue o mesmo padrão: fonte externa (o cliente) fora do ar não
pode travar o briefing — se falhar, o log registra `followup FALHOU - segue`
e, **depois do 1º `CLIENTE_FOLLOWUP_TAKEOVER=1`**, o Deal lê `WORKER FALHOU` e não
inventa número (não existe "`[L1]` anterior" para ler — em falha o worker
sobrescreve o bloco; spec `2026-09-followup-autopilot`). **Antes** do 1º
takeover (a janela da 1ª noite real), uma falha do worker não grava nada —
o `[L1]` humano fica intacto e o motivo vai só para o log; ver "Janela
pré-takeover no caminho de FALHA" acima. O elo `conteudo` (`cliente-content.js`)
é o terceiro não fatal, com a mesma mecânica: se o repo local de um cliente não
estiver onde `CLIENTE_REPO_PATH` aponta, o log registra `conteudo FALHOU - segue`,
o Echo lê `WORKER FALHOU` (depois do 1º `CLIENTE_CONTENT_TAKEOVER=1`) e o briefing
sai do mesmo jeito. O elo `health` (`health.js`) é o quarto não fatal e roda
por último, imediatamente antes do `briefing`: se falhar, o log registra
`health FALHOU - segue` e, depois do 1º `HEALTH_TAKEOVER=1`, o Pulse lê
`WORKER FALHOU`; antes do 1º takeover, mesma janela pré-takeover das outras
duas — o `[L1]` humano fica intacto. Diferença dos outros três: `health`
mede o PRÓPRIO harness (sem fonte externa), então "achado" (referência
quebrada, versão do plugin divergente…) não é falha do worker e nunca para a
corrente — só uma falha real do próprio `health.js` (ex.: `agents/pulse/`
ilegível) é que vira `health FALHOU`. Spec: `specs/2026-09-health-watchdog/`.

Tarefa registrada: **"Arvys - corrente noturna"**, diária às 03:30, com
"executar assim que possível após perder o horário" ligado — notebook dormindo
não perde o dia.

> ⚠️ `scripts\noite.cmd` é **ASCII puro com quebras CRLF** de propósito. O
> `cmd.exe` lê em ANSI e, com quebras LF, come o primeiro caractere de cada
> linha — aconteceu de verdade em 2026-09-03. Não acrescente acentos nem salve
> como UTF-8/LF.

### Regra de ouro dos leitores

O painel **não calcula métrica**. Quem quiser um número do escritório lê
`company/OFFICE-METRICS.json` pela porta única `hub/metrics.js`. Escrever em
`hub/` um `readdirSync('specs')`, um parser de frontmatter de spec, uma contagem
de `incidents/` ou um `git log` para datar arquivo **recria a segunda fonte** —
o defeito que a spec `2026-09-office-metrics` eliminou (gotcha nº 4 do Forge).

## Planejados

- `cliente-metrics` (forma A) — Neon de cliente: pipeline, faturas em aberto →
  `[L1]` do Deal. **Despriorizado** em 2026-09-02 (ver `company/DECISIONS.md`);
  volta pela FILA. Continua planejado mesmo com `cliente-followup` já existindo:
  são medições diferentes (follow-up vs. pipeline/faturas completos).
