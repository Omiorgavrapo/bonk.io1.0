# Verificação da entrega — 7 de outubro de 2026

## Aprovado no ambiente disponível

Windows, Node v24.19.0, Planck 1.4.2 incluído. `node check-core.cjs` passou.

- Contato com plataformas, pulo, penalidade de controle no pesado e colisão contínua: um círculo a 10.000 px/s não atravessou uma plataforma de 1 px.
- Seis modos, bots usando flechas/gancho/chute, até dois humanos mais seis bots, transições de rodada, eliminação, placar, gols, empates e reinício.
- Geometria côncava, junta motorizada, zonas filtradas por time e estados numéricos finitos.
- 26 entradas de mapa, IDs únicos e cobertura dos seis modos. Todos passaram validação, ida e volta em JSON e 600 ticks com oito participantes por mapa.
- Snapshot/restauração e evolução posterior iguais no mesmo runtime. Uma sessão de 18.000 ticks cruzou mais de 50 rodadas; o histórico retido ficou limitado à rodada atual. Snapshot com tick inválido foi rejeitado sem alterar estado, pontuação, RNG ou histórico.
- Autoverificação lógica do editor: polígono, seleção de retângulo rotacionado e preservação de propriedades no JSON. Isso não é um teste de cliques na interface.
- Scripts clássicos analisados e dependências locais conferidas. O jogo não contém fetch, XHR, WebSocket, CDN obrigatório nem importação de módulos locais.
- Renderização nativa em Canvas no desktop: fontes locais carregadas, 26 prévias e estados dos seis modos desenhados. Formas grandes respeitam o recorte do mapa, suas cores são preservadas e o contexto de desenho é restaurado. Essa checagem de componentes não é uma captura da interface no Chrome.

O benchmark do núcleo com obtenção de estados executou 10.800 ticks em aproximadamente **0,45 s** neste desktop. Não mede Canvas/DOM, memória total ou FPS no Samsung Chromebook 3.

Foram corrigidos: a unidade do ângulo da bola para o renderizador, o filtro de times nas zonas, o placar de captura no Football, validação antecipada de snapshots e dois problemas de pausa na interface (abrir novamente Settings ao redefinir controles; texto herdado de uma partida anterior).

## Pendências de verificação

O navegador de testes não conseguiu carregar a prévia em localhost. A abertura de URLs `file://` também não estava disponível nesse navegador automatizado. Portanto **não foram comprovados por teste real de navegador**: abertura offline do HTML extraído, ausência de erros de console, cliques/importação/exportação, teclado simultâneo, perda de foco, alternância de layouts durante a partida ou redimensionamento.

O CSS contém adaptações para painéis estreitos/baixos e a arena usa escala uniforme; viewports 1366×768, 1280×720, 1024×600, 1920×1080, retrato e zoom ainda precisam ser conferidos visualmente. Nenhum teste foi realizado em um Chromebook.

Para a primeira conferência no aparelho, extraia o ZIP e abra `index.html` sem rede; jogue uma partida em cada modo, acrescente o segundo humano e seis bots, alterne layouts, teste pausa/perda de foco e exporte/reimporte um mapa editado. Reduza Graphics para Low se necessário. Essa lista descreve pendências, não resultados já aprovados.

A física continua estimada e a aparência/sons/fontes diferem da referência. Publicação de mapas anterior a 2026 comprova existência até 2025, mas não geometria idêntica naquele ano. Detalhes em `REFERENCIAS.md` e `MAPAS.md`.

O ZIP foi extraído para uma pasta de conferência; seu conteúdo foi comparado por SHA-256 aos arquivos de distribuição. A checagem do núcleo foi executada novamente nessa cópia extraída. Isso verifica integridade e execução do código de simulação extraído, sem substituir a abertura visual do HTML.
