# Arvys — escritório virtual para o Claude Code

Arvys é uma **metodologia + harness** para rodar um negócio (ou um produto)
com agentes de IA como se fossem um pequeno escritório: um orquestrador que
roteia e delega, especialistas com estado e memória próprios, e uma
constituição escrita que decide como o trabalho é feito — nunca combinada de
novo a cada sessão.

A ideia central: **o chat é descartável; o arquivo é o produto.** Decisão,
estado e lição aprendida moram em arquivo (`STATE.md`, `DECISIONS.md`,
`GOTCHAS.md`), nunca só na conversa — o que torna `/clear` barato e a próxima
sessão instantaneamente produtiva.

Requer o [Claude Code](https://claude.com/claude-code). Não tem adaptador
testado para outros runtimes de agente.

## O que vem neste repositório

- **`plugin/`** — o núcleo: onze rituais (`/arvys:<x>`), dois subagentes
  (`explorer`, `reviewer`) e o contrato de worker. O que viaja igual para
  todo projeto. Documentação completa: `plugin/README.md`.
- **`hub/`** — o QG: um painel HTML autocontido que lê o estado do seu
  escritório (decisões, fila, agentes, épicos) e roda com `node hub/serve.js`.
  Funciona vazio — cada seção sem dado ainda diz o comando que a preenche.
- **`workers/`** — scripts determinísticos (sem LLM) que alimentam o QG:
  consumo de tokens, métricas do próprio escritório, briefing diário, radar
  de novidades do Claude Code. Veja `workers/README.md` para o contrato e
  como escrever o seu.

## Instalar

```
claude plugin marketplace add https://github.com/millerlima/arvys-plugin
claude plugin install arvys@arvys
```

Confirme com `claude plugin list` → `arvys@arvys … ✔ enabled`. Numa sessão
nova, `/arvys:status` responde num projeto que já tem escritório e oferece
`/arvys:start` num projeto sem.

Detalhes de atualização, desinstalação e modo de desenvolvimento (junction):
`plugin/README.md`.

## Primeiros passos

1. `/arvys:start` — a primeira conversa. Duas perguntas (seu perfil, e se o
   projeto é novo ou em andamento) decidem a trilha.
2. `/arvys:hire` quando precisar de um agente que ainda não existe —
   recusa contratação sem uso semanal previsto e fonte de dados nomeada
   (agente sem uso real vira pasta morta).
3. `/arvys:open <agente>` para trabalhar com um especialista; `/arvys:close`
   ao terminar (custa menos de um minuto e é o que torna o próximo `/clear`
   barato).
4. `/arvys:spec` antes de qualquer mudança que mexa em mais de dois ou três
   arquivos — gate humano entre plano e código.

## O painel (QG)

```
node hub/serve.js
```

Abre em `http://localhost:5180` (ou a porta que você passar com `--port`).
Não depende de nenhum dado do escritório do exemplo — roda vazio, e cada
seção diz como se preencher.

## Licença

MIT — veja `LICENSE`. O uso de qualquer worker que você escrever para se
conectar a um sistema seu (CRM, pagamento, API interna) é sua
responsabilidade quanto a credenciais e dados — o contrato de worker exige
variável de ambiente, nunca segredo em arquivo versionado.
