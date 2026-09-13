# Biblioteca do Arvys — o manual do escritório

> Analogia: você comprou um escritório mobiliado. Esta pasta é a recepção —
> quem entra descobre qual porta abrir, em que ordem, e o que cada sala faz.

A biblioteca é **conteúdo do plugin** (MIT, nunca pago). O QG lê esta pasta
e mostra a seção **Biblioteca**, navegável e pesquisável. Um único conjunto
de `.md`, uma única rota de leitura — sem cópia congelada em cada projeto.

## Os capítulos, na ordem de leitura

| # | Arquivo | Em uma frase |
|---|---|---|
| 00 | [Comece aqui](00-comece-aqui.md) | O mapa: o que é o escritório e por onde entrar, conforme seu perfil |
| 01 | [Receitas por cenário](01-receitas-por-cenario.md) | "Estou em…" → o comando pronto para copiar, seis situações |
| 02 | [Contexto e sessão](02-contexto-e-sessao.md) | Por que você perdia tokens, os 3 movimentos, checkpoint, modelo, worktree |
| 03 | [Anti-padrões](03-anti-padroes.md) | Os 4 hábitos que custaram caro, com o custo medido e a fonte |
| 04 | [Escola de prompt](04-escola-de-prompt.md) | Como pedir: anatomia em 4 campos, antes/depois reais, 4 erros clássicos |
| 05 | [Glossário para leigos](05-glossario-para-leigos.md) | Cada termo com analogia e onde aparece; a definição oficial fica na marca |
| 06 | [FAQ e problemas](06-faq-e-problemas.md) | Os 10 tropeços do dia 1 e a saída de cada um |
| 07 | [Exemplos reais](07-exemplos-reais.md) | 5 sessões que deram certo, com o caminho da evidência e o que aprender |

## Como ler

- **Primeira vez:** `00` inteiro, depois a receita do seu cenário em `01`.
- **Sente que o chat pesou:** `02` (contexto) e `03` (anti-padrões).
- **O resultado veio torto:** quase sempre é o pedido — `04`.
- **Não entendeu uma palavra da tela:** `05`.
- **Algo travou ou recusou:** `06`.

Cada capítulo abre com um cabeçalho (frontmatter) que o QG usa para montar
as visualizações: `titulo`, `ordem` (00-07, único), `cenarios` (lista entre
`primeira-sessao · produto-novo · adotar-projeto · fix · feature · semana`)
e `perfil` (`vibecoder | dev | ambos`).

## Como contribuir

1. Edite o `.md` no repositório do Arvys (`plugin/biblioteca/`). A tela só
   lê; escrita é pelo git do plugin.
2. Mantenha o frontmatter completo e a `ordem` sem repetição.
3. Link entre capítulos usa o **nome exato do arquivo** (`[x](02-contexto-e-sessao.md)`).
   Link para capítulo renomeado apodrece — o sensor `check-biblioteca` reprova.
4. Exemplo "real" cita caminho real do repositório (`specs/*/evidence/`,
   `company/DECISIONS.md`, `incidents/`). Sessão inventada não entra.
5. Termo novo para leigo entra em `05`, com link para o vocabulário da marca
   em `company/GLOSSARIO.md` — que **não** muda por aqui.
6. Toda mudança publicada sobe a versão do plugin e ganha linha no `CHANGELOG.md`.
