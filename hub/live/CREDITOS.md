# Créditos — arte do escritório ao vivo em pixel-art

> Toda arte raster em `hub/live/tiles/` vem dos packs **MetroCity** de
> **JIK-A-4**, licença **CC0 1.0** ("You can use it as you wish"; uso
> comercial confirmado pelo autor nos comentários do itch.io). Crédito não é
> exigido — damos mesmo assim. Nenhum arquivo veio do repositório
> `pablodelucca/pixel-agents` (os PNGs de lá são derivados sob MIT); baixamos
> os `.rar` originais do itch.io em 2026-09-05 e copiamos as folhas
> **sem alteração** — o recorte dos quadros é feito em SVG (`viewBox`).

## Personagens — MetroCity Free Top Down Character Pack

Fonte: https://jik-a-4.itch.io/metrocity-free-topdown-character-pack ·
arquivo `MetroCity.rar` (44 kB, 16 jan 2024). Folha de 32×32 px por quadro:
24 colunas = 4 direções × 6 quadros (0–5 frente · 6–11 esquerda · 12–17
costas · 18–23 direita).

| Arquivo em `tiles/` | Origem no `.rar` | sha256 (16 primeiros) |
|---|---|---|
| `char-body.png` (768×192) | `MetroCity/CharacterModel/Character Model.png` | `8abcddb8265ec5ef` |
| `char-hair.png` (768×256) | `MetroCity/Hair/Hairs.png` | `04a3d5171babc59c` |
| `char-outfit.png` (768×32) | `MetroCity/Outfits/Outfit1.png` | `10dde5b2a6ef5274` |
| `char-shadow.png` (32×32) | `MetroCity/CharacterModel/Shadow.png` | `a9b5b72935545d06` |

## Ambiente — MetroCity Free Top Down Interior Asset Pack

Fonte: https://jik-a-4.itch.io/metrocity · arquivo `Interior.rar` (180 kB,
14 nov 2024). Grade de 16 px; móveis recortados por caixa exata (x, y, w×h)
declarada no catálogo de tiles do `office.html`.

| Arquivo em `tiles/` | Origem no `.rar` | sha256 (16 primeiros) |
|---|---|---|
| `int-tiles-house.png` (512×512) | `Interior/Home/TilesHouse.png` — piso, paredes, contornos, carpete | `37f8f6d6244f2d28` |
| `int-doors.png` (1344×128) | `Interior/Home/Doors-Sheet.png` | `fed608fced82d437` |
| `int-windows.png` (896×64) | `Interior/Home/Windows-Sheet.png` | `00a62b150aee1ad3` |
| `int-kitchen1.png` (576×96) | `Interior/Home/Kitchen1-Sheet.png` — cadeiras, mesas brancas | `04492567bbe1d034` |
| `int-livingroom.png` (192×96) | `Interior/Home/LivingRoom-Sheet.png` — mesa de madeira | `fe930906725c09d2` |
| `int-tv.png` (256×96) | `Interior/Home/TV-Sheet.png` — monitores | `163300650edc39f9` |
| `int-cupboard.png` (576×96) | `Interior/Home/Cupboard-Sheet.png` — estantes | `7cc27c7fdc40c6cd` |
| `int-lights.png` (384×64) | `Interior/Home/Lights-Sheet.png` | `5fe86fc8dfe4c551` |
| `int-flowers.png` (384×96) | `Interior/Home/Flowers-Sheet.png` | `ef7dcd09ed591af7` |
| `int-carpet.png` (320×64) | `Interior/Home/Carpet-Sheet.png` | `bcd5cc0bab591f3a` |
| `int-paintings.png` (320×32) | `Interior/Home/Paintings-Sheet.png` | `2a880955f8111ef1` |
| `int-hospital-misc.png` (3072×64) | `Interior/Hospital/Miscellaneous-Sheet.png` — computador, balcão, cadeiras | `b0590124204a5515` |

## Arte própria (Arvys)

Martelo do Forge, selo de alerta e demais acessórios são desenhados em SVG
neste repositório (retângulos na grade de 1 px), sem origem externa.

## Código

Nenhum código do Pixel Agents (MIT) foi copiado. O modelo de mapa em tiles de
16 px é ideia de domínio público (não é obra protegida). Se algum trecho
vier a ser copiado de lá, o aviso de copyright MIT entra aqui.
