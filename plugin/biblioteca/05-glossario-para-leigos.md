---
titulo: Glossário para leigos
ordem: 05
cenarios: [primeira-sessao, adotar-projeto]
perfil: vibecoder
---

# Glossário para leigos — cada palavra com uma analogia

> Este capítulo **não** substitui o vocabulário da marca. A definição oficial
> de cada termo (e a tradução `en` congelada) mora em `company/GLOSSARIO.md`
> — uma frase de gente por termo. Aqui é o outro lado: a analogia que faz a
> palavra parar de assustar, e onde ela aparece na sua tela.

Quando os dois divergirem, vale o da marca. Termo que existe aqui e não
existe lá é dívida — não deixe nenhuma.

## Do trabalho

| termo | analogia | onde aparece | termo da marca |
|---|---|---|---|
| Fila | a sala de espera: quem ainda não foi chamado | QG › Trabalho; `company/FILA.md` | [Fila](../../company/GLOSSARIO.md) |
| Roadmap | o mapa da viagem: em que ordem as paradas acontecem | QG › Trabalho; `company/ROADMAP.md` | [Roadmap](../../company/GLOSSARIO.md) |
| spec | o projeto do arquiteto antes da obra: o quê (spec), como (plan), checklist (tasks) | `specs/<data>-<nome>/`; ritual `/arvys:spec` | [spec](../../company/GLOSSARIO.md) |
| iniciativa | a obra inteira, que tem várias frentes | QG › Trabalho | [iniciativa](../../company/GLOSSARIO.md) |
| gate | a cancela: ninguém passa sem você levantar | "Proceed? (sim / ajustar)"; QG › Esperando você | [gate](../../company/GLOSSARIO.md) |
| em-spec | "chamaram meu nome": saiu da sala de espera, está em atendimento | marca na `FILA.md` | [em-spec](../../company/GLOSSARIO.md) |
| aguardando | ainda na sala de espera | marca na `FILA.md` | [aguardando](../../company/GLOSSARIO.md) |
| entregue | saiu com o recibo na mão — sem recibo, não saiu | marca `ENTREGUE AAAA-MM-DD` na `FILA.md` | [entregue](../../company/GLOSSARIO.md) |
| ESPERA O DONO | a bola está com você, não com o time | topo de `company/STATE.md`; QG › Início | [ESPERA O DONO](../../company/GLOSSARIO.md) |
| Marca no arquivo | o carimbo à mão no papel — é dele que a situação vem, não de um botão | `company/FILA.md` | [Marca no arquivo](../../company/GLOSSARIO.md) |
| Entregas | a prateleira do que ficou pronto, com o recibo de cada um | QG › Trabalho | [Entregas](../../company/GLOSSARIO.md) |
| Pedidos do dono | o inventário do que você pediu: feito · com agente · com você | QG › Início | [Pedidos do dono](../../company/GLOSSARIO.md) |
| mandato | a ordem de serviço em 6 campos: o que, formato, ferramentas, fronteiras, pronto, papel | delegação do orquestrador; `company/PLAYBOOK.md` | (termo do PLAYBOOK) |
| escala L0-L4 | o tamanho da obra: trocar lâmpada (L0) até construir a casa (L4) | primeira linha da resposta do orquestrador | `CLAUDE.md` do orquestrador |

## Do escritório

| termo | analogia | onde aparece | termo da marca |
|---|---|---|---|
| QG | a sala de controle: uma parede de painéis que lê os arquivos e mostra o estado | `hub/` local; `app.arvys.com.br/escritorio/qg` | [QG](../../company/GLOSSARIO.md) |
| escritório | o arquivo morto que virou vivo: a pasta é a empresa, a conversa é só o telefone | `company/`, `agents/`, `specs/`, `incidents/` | [escritório](../../company/GLOSSARIO.md) |
| orquestrador | o chefe de gabinete: roteia, delega, consolida — nunca faz o trabalho do especialista | a voz que responde no chat | (`CLAUDE.md` do orquestrador) |
| agente | o especialista com crachá, memória e leis próprias | `agents/<nome>/`; `/arvys:open <nome>` | [agente](../../company/GLOSSARIO.md) |
| subagente | o estagiário descartável: faz uma tarefa, entrega, e o caderno dele vai fora | `explorer`, `reviewer` | (`company/PLAYBOOK.md`) |
| L1 | o bilhete na porta ao sair: "parei aqui, isto ficou de pé" | `agents/<nome>/STATE.md`; `company/STATE.md` | [L1](../../company/GLOSSARIO.md) |
| boletim | o boletim escolar do agente, 7 notas | QG › Agentes | [boletim](../../company/GLOSSARIO.md) |
| ritual | a rotina com nome: abrir o dia, abrir sessão, fechar | `/arvys:*` | [ritual](../../company/GLOSSARIO.md) |
| worker | o funcionário do turno da noite: roda sozinho e deixa os números na mesa | `workers/`; `company/BRIEFING.md` | [worker](../../company/GLOSSARIO.md) |
| Escritório ao vivo | a câmera da sala, em pixel-art | QG › Escritório ao vivo | [Escritório ao vivo](../../company/GLOSSARIO.md) |
| Radar | o jornal da manhã: o que mudou lá fora e pode mudar aqui | `/arvys:radar`; QG › Radar | [Radar](../../company/GLOSSARIO.md) |
| Leis & incidentes | o livro de ocorrências que vira regulamento | QG › Leis; `incidents/`; `GOTCHAS.md` | [Leis & incidentes](../../company/GLOSSARIO.md) |
| gotcha | a cicatriz que virou regra | `agents/<nome>/GOTCHAS.md` | [gotcha](../../company/GLOSSARIO.md) |
| incidente | a ocorrência escrita para não repetir | `incidents/AAAA-MM-DD-*.md` | [incidente](../../company/GLOSSARIO.md) |
| evidência | o recibo: teste verde, captura, deploy no ar | `specs/*/evidence/` | [evidência](../../company/GLOSSARIO.md) |
| Biblioteca | este manual | QG › Biblioteca; `plugin/biblioteca/` | [Biblioteca](../../company/GLOSSARIO.md) |
| checkpoint | salvar o jogo no meio da fase | `/arvys:checkpoint`; marca no STATE | (`plugin/skills/checkpoint/`) |
| retro | a reunião de sexta em que o erro da semana vira lei | `/arvys:retro`; `company/METRICS.md` | (`plugin/skills/retro/`) |
| mesa aberta | os especialistas discutem e decidem; você lê o resultado, não arbitra | `company/DECISIONS.md`, `company/atas/` | (`OWNER.md`) |
| sensor | o detector de fumaça: um script que prova, com exit code, que algo é verdade | `scripts/check-*.mjs`; `npm run verify` | (`company/PLAYBOOK.md`) |
| reviewer | o advogado do diabo: recebe um risco com nome e tenta provar que é real | subagente `arvys:reviewer` | (`plugin/agents/reviewer.md`) |
| explorer | o pesquisador de biblioteca: lê 50 livros e te traz 10 linhas | subagente `arvys:explorer` | (`plugin/agents/explorer.md`) |

## Da medição

| termo | analogia | onde aparece | termo da marca |
|---|---|---|---|
| Cota & custo | o tanque de combustível da semana | QG › Cota; `/usage` | [Cota & custo](../../company/GLOSSARIO.md) |
| token | o pedaço de palavra que a IA cobra — mais ou menos ¾ de uma palavra | `/usage`; `company/TOKENS.json` | [token](../../company/GLOSSARIO.md) |
| cache read | reler o que já estava na mesa: custa bem menos que trazer papel novo | QG › Cota | [cache read](../../company/GLOSSARIO.md) |
| contexto | a mesa de trabalho: tudo o que está em cima dela vai junto em cada mensagem | [02-contexto-e-sessao.md](02-contexto-e-sessao.md) | (Claude Code) |
| FPY | acertar de primeira, sem retrabalho | QG › Agentes (boletim) | [FPY](../../company/GLOSSARIO.md) |
| medição | o carimbo de data no número — número sem data envelhece calado | `company/BRIEFING.md` ("DADO VELHO") | [medição](../../company/GLOSSARIO.md) |
| torto | o formulário rasgado: existe, mas não dá para ler — e o QG mostra o rasgo em vez de esconder | qualquer seção do QG | [torto](../../company/GLOSSARIO.md) |

## Não são nossas — são de fora

| termo | analogia | onde aparece | termo da marca |
|---|---|---|---|
| Claude Code | o prédio onde o escritório funciona | o terminal | [Claude Code](../../company/GLOSSARIO.md) |
| plugin | a mudança já embalada: instala o escritório no prédio | `claude plugin install arvys@arvys` | [plugin](../../company/GLOSSARIO.md) |
| hook | o segurança da porta: barra o gesto perigoso antes de ele acontecer | `plugin/hooks/`; mensagens "recusado" | [hook](../../company/GLOSSARIO.md) |
| worktree | tirar uma cópia do caderno para duas pessoas escreverem ao mesmo tempo | [02-contexto-e-sessao.md](02-contexto-e-sessao.md) | (git) |
| deploy READY | a placa "aberto" acesa na porta da loja — não o plano de abrir | evidência de spec; painel da Vercel | (Vercel) |
| tsc | o revisor gramatical do código: passa ou não passa | evidência de spec | (TypeScript) |
| CI | o inspetor que confere toda entrega antes de ela entrar no prédio | GitHub Actions; "CI verde no SHA" | (GitHub) |
| Linear | a referência de desenho da tela Trabalho | QG › Trabalho | [Linear](../../company/GLOSSARIO.md) |

Termo que apareceu na tela e não está aqui: é dívida deste capítulo. Anote
em `company/FILA.md` ou peça ao orquestrador "explica <termo> com analogia".
