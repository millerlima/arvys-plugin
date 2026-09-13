# Workers — o turno da noite (sem LLM)

> Contrato do plugin `arvys`. Copie para `workers/README.md` do seu projeto e
> acrescente abaixo a seção **Existentes** com os workers que nascerem lá.
> O contrato é núcleo (igual para todo adotante); os workers são instância.

Scripts determinísticos que rodam 24/7 de graça via Task Scheduler do Windows
e mantêm o estado fresco. O LLM lê o resultado; nunca participa da coleta.

## As duas formas de worker

Um worker é de **uma** destas duas formas, declarada no topo do próprio script.
Misturar as duas no mesmo worker é proibido.

### Forma A — worker de estado

Escreve **write-only no bloco `[L1]`** do STATE do seu agente (regex-replace),
para que a próxima sessão daquele agente abra já sabendo o número.
Saída: prosa curta, de uma linha, para humano ler.
Exemplo planejado: `cliente-metrics` (pipeline e faturas de um cliente → `[L1]` do Deal).

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

