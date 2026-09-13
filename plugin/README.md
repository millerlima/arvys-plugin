# Plugin `arvys` — escritório virtual para o Claude Code

Onze rituais (`/arvys:<x>`), dois subagentes (`explorer`, `reviewer`) e o
contrato de worker. É o **núcleo** do método Arvys: o que viaja igual para
todo projeto. O que nasce em cada projeto (`company/`, workers implementados,
painel) é criado pelo `/arvys:start`; os agentes em `agents/` nascem pelo
`/arvys:hire`, não por este pacote.

| Ritual | Para quê |
|---|---|
| `/arvys:start` | primeira sessão — perfil do dono e trilha do projeto |
| `/arvys:briefing` | abre o dia lendo o briefing da madrugada |
| `/arvys:hire` | contrata um agente novo, com guarda anti-pasta-morta |
| `/arvys:open <agente>` · `/arvys:close` | sessão com um agente: abre com o L1, fecha em ≤ 1 min |
| `/arvys:checkpoint` | salva o meio de uma sessão longa para poder limpar o chat |
| `/arvys:status` | standup instantâneo |
| `/arvys:spec` | cache de decisão em L2+ (spec → plan → tasks, gate antes de código) |
| `/arvys:genesis` | produto novo (L4), da ideia ao primeiro épico |
| `/arvys:retro` | retrospectiva semanal — erro vira lei |
| `/arvys:radar` | curadoria do radar de novidades do Claude Code |

## Biblioteca

O manual de operação do escritório vive em `biblioteca/` (8 capítulos em
markdown: comece aqui, receitas por cenário, contexto e sessão, anti-padrões,
escola de prompt, glossário para leigos, FAQ, exemplos reais). Para ler com
navegação e busca, abra o QG › grupo **Memória** › seção **Biblioteca**; o
leitor acha a pasta no repo ou na cópia instalada do plugin. Primeira leitura:
`biblioteca/00-comece-aqui.md`.

## Coach de prompt

Hook `UserPromptSubmit` (`hooks/coach-de-prompt.js`). Quando o pedido chega
vago ou com vários assuntos, o orquestrador atende como veio **e** fecha
mostrando o mesmo pedido reescrito em 4 campos (objetivo · contexto · limite ·
pronto). No máximo uma vez por sessão, no tom do seu perfil, nunca bloqueia.
Para desligar, uma linha no `OWNER.md`: `Coach de prompt: desligado`
(`ligado` religa; sem a linha, vale o perfil: vibecoder ligado, dev desligado).

## Instalar (escopo de usuário — vale em todo projeto da máquina)

```
claude plugin marketplace add <url-git-ou-caminho-do-repo-Arvys>
claude plugin install arvys@arvys
```

O repositório do Arvys é o marketplace (`.claude-plugin/marketplace.json` na
raiz) e `plugin/` é o plugin. Conferir: `claude plugin list` →
`arvys@arvys … ✔ enabled`. Sessão nova: `/arvys:status` responde num projeto
com escritório e oferece `/arvys:start` num projeto sem.

## Atualizar

```
claude plugin marketplace update arvys
claude plugin update arvys@arvys
```

A instalação é uma **cópia** (`~/.claude/plugins/cache/arvys/arvys/<versão>/`).
Só atualiza quando a `version` de `.claude-plugin/plugin.json` sobe — mesma
versão responde "already at the latest version". Toda mudança publicada vem
com bump e uma linha no `CHANGELOG.md`. Reinicie a sessão depois.

## Desinstalar

```
claude plugin uninstall arvys@arvys
```

Remove o registro (`installed_plugins.json`, `enabledPlugins`). O marketplace
fica declarado (`claude plugin marketplace remove arvys` se quiser) e o cache
fica no disco com marcador `.orphaned_at` — não é instalação.

## Remover a instalação antiga por junction (antes de 2026-09-03)

Se `~/.claude/skills/` tiver `arvys-open`, `arvys-close` etc., são junctions
para uma pasta que não existe mais. Remova **com `rmdir`** — nunca com
`Remove-Item -Recurse`, que entra no alvo:

```
cmd /c rmdir "%USERPROFILE%\.claude\skills\arvys-open"     (uma por ritual)
```

## Desenvolver o Arvys (modo skills-dir)

Uma junction/symlink `~/.claude/skills/arvys` → `<repo-Arvys>/plugin` faz o
Claude Code carregar o plugin como `arvys@skills-dir`, com os mesmos
`/arvys:<x>` e sem cópia: editou, valeu. **Não mantenha as duas formas**: com o
plugin instalado, o CLI o prefere e ignora a junction em silêncio.
`node workers/instalacao.js` no repo do Arvys diz qual forma está ativa e acusa
`duplicada`. Para um ensaio de uma sessão só: `claude --plugin-dir ./plugin`.
