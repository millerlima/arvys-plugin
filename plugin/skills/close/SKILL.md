---
name: close
description: Fecha a sessão de trabalho atual do Arvys em menos de 1 minuto - reescreve o STATE do agente, registra decisões e gotchas, e propaga o L1 para o estado da empresa. Usar SEMPRE antes de encerrar ou limpar a sessão.
---

# /arvys:close

Fechamento formal. **Este ritual existe para tornar o `/clear` barato**: depois
dele, o chat é descartável porque o estado está em arquivo. Deve custar ≤1 minuto.

## Antes do passo 0 — este projeto tem escritório?

Se `agents/<agente>/STATE.md` **não existir**, não há o que fechar. Diga isso e
pare. **Nunca crie um STATE do zero no close** — o close reescreve estado que
existe; criar estado aqui é fabricar história que ninguém viveu.

## Passos

0. **Spec com evidência colada?** Grave `status: pronta` no frontmatter do
   `spec.md` correspondente.
1. **Reescreva `agents/<agente>/STATE.md`:**
   - `[L1]`: 1-3 linhas FACTUAIS e legíveis por máquina (número, artefato, blocker).
     Nunca narrativa. Ex.: "PR #17 mesclado; deploy READY; falta smoke em prod."
   - Seções "Em progresso" e "Backlog": atualize; narrativa curta é permitida AQUI.
   - Regra: **deixar o STATE melhor do que encontrou.**
   - **Remova a marca de sessão aberta** deixada pelo `/arvys:checkpoint`
     (linha `<!-- checkpoint: YYYY-MM-DDTHH:MM -->`, sob `## Em progresso`),
     se houver. Regex para achá-la (é a que o futuro worker `office-metrics`
     usa): `/^<!-- checkpoint: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}) -->\s*$/m`.
     Marca presente em STATE depois do close = sessão aberta e nunca fechada.
2. **Decisões tomadas na sessão** → apende em `company/DECISIONS.md`
   (formato: `## YYYY-MM-DD — Título` + decisão + motivo + autor/fonte).
   Decisão não logada desaparece.
3. **Erro que custou caro na sessão?** → registre em `incidents/` (root cause +
   prevenção verificável) e destile 1 linha para o `GOTCHAS.md` do agente.
   **Antes de gravar a linha (P8, retro 3 —
   `specs/2026-09-fpy-molde/`): responda por escrito "vira hook, campo
   obrigatório ou sensor? Se não, por quê" e deixe a resposta NA PRÓPRIA
   linha do gotcha.** Prosa sem essa resposta é gotcha que nasceu sem passar
   pelo teste — a lei do cabeçalho de todo `GOTCHAS.md` existe para ser
   aplicada aqui, não só lida.
3b. **Feedback ao agente — o que você viu e o arquivo não vai lembrar**
   (FILA 43, `specs/2026-09-feedback-orquestrador/`). Vizinho de propósito do
   passo 3: o incidente cuida do erro que custou caro ao ESCRITÓRIO; este cuida
   do que o agente fez e vai repetir.

   **Só entra o que passou por UM dos dois filtros:** (a) **repetiu** — é a 2ª
   vez, e você consegue nomear a 1ª; ou (b) **custou retrabalho medível** — uma
   rodada a mais, um arquivo refeito, um sensor que teve de ser reescrito. Erro
   que você corrigiu na hora, sem custo, **não vira linha**: vira nada.
   **Teto de 2 por sessão.** Ficou mais do que isso de fora, diga ao dono
   quais — o `FEEDBACK.md` nunca é podado (lei da FILA 39) e um arquivo que
   vira log é um arquivo que a retro para de ler.

   **Antes de escrever, responda por escrito ONDE O ERRO NASCEU** — e o
   primeiro valor da lista é sobre você:
   - `mandato` — **o pedido estava ruim.** Faltou critério de pronto, faltou
     estado de partida, faltou arquivo no pacote de contexto. A auditoria do
     Kaizen mediu **29 de 42 defeitos nascendo aqui**: se em várias sessões
     seguidas nada cai neste valor, é quase certo que a triagem está errada,
     não que o mandato estava bom.
   - `spec` — a spec era ambígua ou o fixture era irreal.
   - `execucao` — o mandato estava claro e o agente não o cumpriu.
   - `lei-que-nao-pegou` — **a regra já existia** e voltou assim mesmo.
     Procure a lei no `AGENT.md`/`GOTCHAS.md`/subagente ANTES de classificar
     como `execucao`: se ela está lá, este é o valor, e a ação depois é
     apertar a lei ou removê-la, nunca escrever a mesma lei de novo.

   **Como escrever** — nunca à mão, sempre pelo módulo. Ele **recusa** o que a
   prosa acima só pedia, e por isso o teto e a não-repetição deixaram de
   depender de você lembrar (achado do reviewer, 2026-09-06):
   ```
   node -e "const fs=require('fs'),f=require('./workers/lib/feedback');f.appendFeedback(fs,'agents/<agente>/FEEDBACK.md','<agente>',{origem:'<mandato|spec|execucao|lei-que-nao-pegou>',texto:'<o que aconteceu>',ev:'<caminho|null>'})"
   ```
   `appendFeedback` cria o arquivo com o cabeçalho se não existir, e **lança**
   em três casos: origem fora do conjunto, **texto que já está no arquivo**
   (comparado sem carimbo nem pontuação — cobre o close rodado duas vezes), e
   **teto do dia atingido** (2 por agente). Recusa não é obstáculo a contornar:
   se bateu no teto, diga ao dono o que ficou de fora.

   **Três coisas que este passo NÃO faz:**
   - **não assina como o dono.** `formatLinha` só sabe escrever `(orq · …)`;
     a autoria `dono` existe só pela tela do QG. E não adianta contornar o
     módulo: `(dono · …)` no formato novo é lido como **`forjada`**, não como
     "o dono disse" — dois hooks e o painel dizem isso em voz alta. Falsificar
     a autoria não dá o que se quer com ela; só deixa rastro.
   - **não ratifica.** A linha nasce `a ratificar` e assim fica: quem ratifica
     é o dono, na `/arvys:retro`. Você observa; ele julga.
   - **não commita.** Escrita em git é ato explícito à parte (regra absoluta 5).

   Não havendo feedback a registrar, **não escreva nada** — nem linha "nenhum".
   Ausência é informação.
3c. **Dívida adjacente tem item de fila — SÓ SE O SENSOR EXISTIR NESTE
   PROJETO** (retro 5, 2026-09-12, aprovado pelo dono). Sem
   `scripts/check-divida-adjacente.mjs`, pule em silêncio. Havendo:

   ```
   node scripts/check-divida-adjacente.mjs
   ```

   Ele varre as evidências das últimas 24 h e **reprova** toda linha que
   declara dívida ("dormente", "fora do escopo", "fora do mandato", "não
   corrigido", "mesmo padrão em") sem `FILA nº <n>` na mesma linha. Se
   reprovar, abra o item em `company/FILA.md` (com dono e gatilho) e escreva
   o número na evidência — **antes** do passo 4. Precedente: o gotcha 59
   nomeou `pegaHistorico()` como "dormente, fora do arquivo" e virou incidente
   em 1 dia; a asserção `!== 200` voltou em 9 dias. Nota no gotcha não é dono.
4. **Propague o L1:** atualize a linha do agente na tabela de
   `company/STATE.md` (+ blockers se houver).
5. Responda ao dono com: L1 novo · decisões logadas (títulos) · próximo passo
   sugerido para a próxima sessão.
6. **Apague a mesa no QG ao vivo — SÓ SE HOUVER QG.** Sem `hub/live/`, pule em
   silêncio (o QG é da instância Arvys, não do núcleo). Havendo: remova
   `hub/live/session.json` (senão a
   próxima sessão herda o agente errado):
   `node -e "require('fs').rmSync('hub/live/session.json',{force:true})"`
7. **Auto-retro (última sessão):** escreva 3 linhas factuais — "o que eu faria
   diferente", com artefato ou número quando houver — na seção
   `## Auto-retro (última sessão)` do `agents/<agente>/STATE.md`. Crie a seção
   se não existir; SOBRESCREVA o conteúdo da sessão anterior (a retro só olha
   a última). Nunca dentro do bloco `[L1]`. Insumo qualitativo da retro — o
   worker `office-metrics` NÃO lê esta seção, nem ela vira número no boletim.
8. **Empurre o escritório — SÓ SE O CLI EXISTIR NESTE PROJETO** (E3/S3.6). Sem
   `scripts/close-push.mjs`, pule em silêncio: o push é da instância Arvys, não
   do núcleo, e projeto implantado pode não ter CLI.
   Havendo, uma linha, e ela é a ÚLTIMA do ritual:

   ```
   node scripts/close-push.mjs
   ```

   **Não escreva aqui nenhuma regra sobre "não falhar por rede".** A garantia é
   do script — ele termina com código 0 aconteça o que acontecer, e diz
   `push enfileirado (N pendentes)` quando não houver rede. Guarda em prosa
   depende de o modelo lembrar (gotcha 27); esta está em código, com o sensor
   `scripts/check-close-push.test.mjs` cortando a rede de verdade para provar.
   **Cole a saída dele na resposta ao dono** — uma linha, sem enfeite.
9. **O checklist do dono — SÓ SE ELE EXISTIR NESTE PROJETO.** Sem
   `company/CHECKLIST.md`, pule em silêncio (projeto implantado pode não ter).

   Antes de rodar, **atualize os marcadores** do que mudou nesta sessão:
   `[x]` concluído · `[~]` em desenvolvimento · `[ ]` pendente. Item novo só
   entra por decisão da retro (lei da fila) — aqui você só mexe no marcador e
   na anotação de estado, nunca acrescenta linha por conta própria.

   Depois, a última coisa que o dono vê:

   ```
   node scripts/checklist.mjs
   ```

   **O script CONFERE os itens com `fonte:` contra o status real das specs no
   disco e acusa divergência.** Se ele acusar, o erro está no marcador que você
   acabou de escrever — corrija e rode de novo. Divergência não derruba o
   ritual (o registro da sessão vale mais que uma lista perfeita), mas sair com
   aviso na tela é dívida entregue ao dono.

   **Por que este passo existe:** o `PEDIDOS-DO-DONO.md` envelheceu em dois
   dias — 11 itens fecharam e o arquivo seguiu dizendo o contrário. Lista que
   envelhece em silêncio dá confiança falsa.

## Como isto aparece na tela

O dono acompanha o ritual pela tela — ela é parte da entrega, não sobra.

- **Leia com o leitor de arquivos, um arquivo por chamada.** Proibido `cat`,
  `type`, `Get-Content` ou qualquer leitura via shell: o shell despeja o
  conteúdo cru e a tela vira paredão. O leitor mostra uma linha por arquivo.
- **Todo comando de shell leva descrição em português dizendo o PORQUÊ**, não o
  quê: "apagando a mesa do QG para a próxima sessão não herdar o agente errado",
  nunca "rodando node -e".
- **Anuncie cada passo numerado em uma linha antes de executá-lo**, no formato
  `▸ <passo> — <por que existe>`. Uma linha por passo do ritual, jamais uma por
  chamada de ferramenta: a ideia é o dono entender o ritual, não narrar cliques.
- **Campo sem conteúdo é omitido**, nunca preenchido com "nenhum" — ausência já
  é a informação.

## Regras

- Não commitar nem pushar nada — escrita em git é ato explícito à parte.
- Se a sessão não mudou nada de estado, diga isso e atualize apenas a data do L1.
