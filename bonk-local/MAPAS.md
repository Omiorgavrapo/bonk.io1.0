# Mapas reais e origem

Este catálogo inclui 7 mapas reais e 13 entradas de modo. Nomes e autores abaixo são os nomes publicados. A fonte é uma resposta do serviço oficial [map_getsearch.php](https://bonk2.io/scripts/map_getsearch.php), consultada em 6–7 de outubro de 2026, com buscas por nome/autor. O campo oficial `publisheddate` comprova existência até 2025; **não comprova que a geometria continuava igual em 2025**. O payload atual foi decodificado com [Bonk Map Library](https://github.com/PixelMelt/bonk-map).

| ID oficial | Nome | Autor | Publicação oficial | Modo nesta versão |
|---|---|---|---|---|
| 153902 | White Balance | NotSoBonk | 2021-01-25 | classic (modo atribuído localmente) |
| 280137 | balance | rezmamah2 | 2021-04-25 | classic (modo atribuído localmente) |
| 41943 | Balance | rainbow yeeter | 2020-07-08 | classic (modo atribuído localmente) |
| 153902 | White Balance | NotSoBonk | 2021-01-25 | arrows (modo atribuído localmente) |
| 280137 | balance | rezmamah2 | 2021-04-25 | arrows (modo atribuído localmente) |
| 153902 | White Balance | NotSoBonk | 2021-01-25 | deatharrows (modo atribuído localmente) |
| 280137 | balance | rezmamah2 | 2021-04-25 | deatharrows (modo atribuído localmente) |
| 280137 | balance | rezmamah2 | 2021-04-25 | grapple (modo atribuído localmente) |
| 390423 | VTOL combat hangar | Oo 0 oO | 2021-07-30 | grapple (modo atribuído localmente) |
| 390423 | VTOL combat hangar | Oo 0 oO | 2021-07-30 | vtol |
| 1036231 | Throne (Velvety VTOL) | StarCubey | 2023-10-06 | vtol |
| 34517 | Football | H005Me | 2020-06-20 | football (modo atribuído localmente) |
| 393039 | Football Olympics (4) | Darda 177222222 | 2021-08-01 | football (modo atribuído localmente) |

## O que a conversão preserva

Coordenadas e tamanhos em pixels, polígonos, ângulos, cores, propriedades de colisão suportadas, corpos estáticos e corpos dinâmicos com uma forma, spawns originais, decorações sem física, regiões retangulares de captura e gols. A transformação usa escala uniforme **1** e translação **(+500,+350)**; nenhuma dimensão da geometria é esticada para adaptar a tela. Spawns são ordenados pela prioridade original. A tela de 1000×700 pode recortar geometria muito distante, como tetos ou fundos enormes.

## Limites e adaptações explícitas

- O marcador `historicalVerified` significa somente publicação oficial anterior a 2026. Não é certificado de física nem de geometria de 2025.
- Mapas sem modo fixado no metadata são usados em modos locais indicados na tabela. A entrada Grapple de VTOL combat hangar reaproveita a mesma geometria com o modo local Grapple; o modo original publicado é VTOL. Nenhuma delas é apresentada como um mapa dedicado original de Arrows/Grapple.
- O motor local usa os valores de gravidade, tamanho dos jogadores, amortecimento, controle e impulsos de `core.js`. O `pixelsPerMeter` do original não substitui esses parâmetros. A fidelidade da física de 2025 não foi medida.
- Em Football, a bola dinâmica circular original é representada pela bola do modo local na posição original, com o raio e material do modo local. O raio original é registrado em `source.evidence`; para Football Olympics (4), ele é 11 pixels. A captura de gols é imediata no motor local, enquanto o payload registra tempos curtos.
- Materiais de formas decorativas e sensores são preservados, inclusive valores incomuns/negativos finitos. Formas sem física e sensores não produzem impulsos de contato.
- Foram excluídos mapas que dependem de corpos móveis compostos, joints especiais, forças constantes, filtros seletivos, respawn, spawns com velocidade, polígonos autointersectantes ou materiais sticky/boost físicos fora do intervalo suportado. Não foram substituídos por geometria inventada.
- As arenas com IDs `local-*` são arenas autorais do projeto, não réplicas verificadas. Elas mantêm esse status no próprio campo `source`.

A biblioteca inclui mapas publicados em anos anteriores que existiam até 2025; ela não afirma conter todos os mapas do serviço. O registro público consultado e os mapas importados são identificados por ID, nome e autor acima.

## Arenas autorais adicionais

Essas 13 entradas foram criadas para o jogo local e para exercitar as mecânicas; não têm origem histórica atribuída.

| Modo | Nomes |
|---|---|
| Classic | Flat arena; Islands; Pendulum |
| Arrows | Arrow platforms; Arrow duel |
| Death Arrows | Death arrows arena; Death islands |
| Grapple | Grapple course; Grapple towers |
| VTOL | VTOL arena; VTOL sky islands |
| Football | Football field; Football steps |

Total da distribuição: 13 arenas autorais + 13 entradas/variantes dos sete mapas reais = **26 entradas**.
