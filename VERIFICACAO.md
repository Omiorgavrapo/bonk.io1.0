# Verificação da entrega

## Interface, regras de partida e arco — 9 de outubro de 2026

- Criação local e online compartilha os quatro controles: gravidade, tamanho dos jogadores, velocidade do tiro e tempo de vida do tiro. Valores são validados no núcleo e ao receber dados online; só o anfitrião altera regras da sala. O local salva seus ajustes neste navegador e oferece restauração dos padrões.
- Mira contínua em ambos os sentidos, inclusive durante a recarga. Arco, corda, flecha e indicador circular desenhados no Canvas. No convidado, mira e recarga são interpoladas; a passagem de ângulos entre −180° e 180° segue o caminho curto, corrigindo uma rotação visual invertida de flechas.
- Corrigido o raio fixo do convidado: a renderização usa o tamanho definido pelo anfitrião. Esc agora fecha uma janela mesmo com um campo focado e devolve o foco ao Canvas; pausa e teclado continuam no estado esperado.
- Interface local, sala, janelas, prévias de mapas, HUD e editor usam a mesma paleta, cantos, espaçamentos e contraste. Textos principais da criação e configurações em português. Telas altas têm rolagem; controles foram alcançados em 1366×768, 900×600, 701×600, 683×384 e 390×844.
- `node check-core.cjs`: aprovado nos seis modos, bots, 26 mapas e replay existente. `node check-rules.cjs`: aprovado com gravidade zero/invertida, colisão no tamanho escolhido, bola de Football preservada, duas rotações completas de mira, recarga, velocidade real, expiração do tiro, trajetória e replay com regras personalizadas. Os 26 mapas também passaram 360 ticks em duas combinações extremas dos ajustes com oito participantes.
- `node check-room.cjs`, `node check-online.cjs` e `node check-pin.cjs`: aprovados. A sala inclui regras compartilhadas, impedimento de alteração pelo convidado, tamanho sincronizado, interpolação angular e recarga. Transporte e PIN mantêm os testes anteriores.
- Chrome abrindo `file://`: jogo local sem nenhuma requisição de rede; campos válidos/inválidos, padrões, persistência, teclado de mira/disparo, arco/recarga, fechamento de janela por Esc e movimento após fechar. Capturas de criação, mapa, configurações e editor inspecionadas.
- Chrome com Firebase real e WebRTC desativado: dois humanos e três bots, opções personalizadas iguais nos dois lados, teclado, soltura, saída/reconexão. Uma segunda sala em Arrows confirmou comandos do convidado, carga, disparo e recarga nos dois lados; capturas do arco e recarga inspecionadas. Sem erros JavaScript não tratados ou serviços externos inesperados.

O protocolo do pacote foi atualizado para impedir partidas com clientes antigos que ignoram as novas regras. Todos devem extrair a versão nova. `firebase.rules.json` foi preservado; o proprietário já publicou suas regras na etapa global anterior. Os testes online continuam em duas sessões no mesmo PC usando o banco real, sem teste em dois aparelhos físicos ou Chromebook. Isso não comprova ausência de todo bug possível, fidelidade exata ao original ou latência/cota sob carga pública.

## Atualização global — 9 de outubro de 2026

- O proprietário publicou as regras novas de `connections` e `invites`. A configuração continua apontando para `bonk-98544`.
- `node check-online.cjs`: aprovado. Transporte HTTPS, eventos SSE fragmentados, Unicode, sequência, estados/comandos substituídos na fila, preservação de valores nulos, limite de tamanho, desconexão e permissões de leitura/escrita avaliadas a partir das regras reais em uma fixture local.
- `node check-pin.cjs` e `node check-room.cjs`: aprovados. Convites automáticos, cancelamento, lotação, comandos, validação de mensagens, soltura por inatividade, saída, partidas novas e espectadores.
- `node check-browser.cjs`: aprovado no Chrome, abrindo `index.html` por `file://`, com Firebase real e `RTCPeerConnection` explicitamente desativado. Dois humanos e três bots; estados/rodadas sincronizados, teclado do convidado chegando à física do dono, soltura, saída detectada e reconexão com novo PIN. Sem erros JavaScript nem requisições para serviços inesperados.
- Capturas do menu, sala e partida inspecionadas; botões, títulos e mensagens não usam mais LAN. O transporte WebRTC antigo deixou de ser carregado pelo jogo.
- O ZIP global foi comparado por SHA-256 aos arquivos de distribuição.

Os dois navegadores de teste rodaram neste PC. O trajeto usou o banco real pela internet, sem ligação local direta, mas ainda falta confirmar em dois aparelhos físicos de redes diferentes e em Chromebook. Não foram medidos consumo mensal de cota, latência geográfica, carga pública ou uma sessão completa de 45 minutos. O Firebase agora carrega também a partida; o atraso e a cota de transferência são limites materiais desta implementação. Listagem pública de salas e biblioteca pública de mapas não foram adicionadas.

## Histórico: configuração inicial Firebase — 9 de outubro de 2026

- `online-config.js` preenchido para o projeto `bonk-98544`, com a chave pública informada pelo proprietário.
- Acesso REST ao Firebase real aprovado: autenticação anônima de anfitrião e convidado, criação de PIN com oito dígitos, leitura da oferta, gravação/leitura da resposta e recusa de segunda resposta.
- As regras publicadas recusaram listar todos os convites e apagar um convite por outro usuário. O convite e as duas identidades do teste completo foram removidos ao terminar.
- Este teste usou ofertas/respostas de verificação, sem iniciar uma partida. A integração completa no Chrome foi verificada anteriormente com Firebase simulado; ainda falta jogar em dois aparelhos reais na mesma rede.

## Atualização PIN + interface — 8 de outubro de 2026

- `node check-pin.cjs`: aprovado. Oito dígitos/zeros iniciais, colisão, uso único, expiração, cancelamento, limpeza, rede indisponível e expressões das regras incluídas, com REST simulado.
- `node check-room.cjs`: aprovado com PIN automático e ligações simuladas; configuração, capacidade, comandos, espectadores, desconexão, reconexão e dados inválidos.
- `node check-browser.cjs`: aprovado no Chrome com páginas `file://`, Firebase simulado e WebRTC real. Dois humanos e três bots, teclas, soltura, desconexão e conexão com novo PIN. Sem erros JavaScript nem requisições inesperadas.
- Menu, sala e formulário de PIN foram inspecionados em capturas do Chrome. Verificação em 1366×768, 900×600, 701×600, 683×384 e 390×844: controles acessíveis, rolagem, lobby offline, zeros iniciais e erro sem configuração. A sala mostra a prévia do mapa, humanos, vagas livres e bots em painéis separados.

Na entrega de 8 de outubro, o projeto Firebase ainda não estava configurado. A configuração e os testes REST no projeto real foram concluídos em 9 de outubro, como descrito acima. Ainda falta validar dois aparelhos e um Chromebook. O modo local funciona sem acesso ao Firebase.

## Histórico: etapa LAN anterior — testes efetivamente realizados

- `node check-core.cjs`: aprovado, incluindo cinco humanos nos seis modos e os testes locais existentes com dois humanos mais seis bots.
- `node check-lan.cjs`: aprovado. Códigos de conexão, fragmentação, Unicode, limite de 1 MiB por objeto, pressão de buffer, mensagens inválidas, prazo de montagem e limpeza de conexões.
- `node check-room.cjs`: aprovado com mapas e física reais, ligações simuladas. Lotação, divisão humanos/bots, propriedade dos comandos, sequência/frequência, soltura por inatividade, entrada como espectador, saída de jogadores, novas partidas e rejeição de placar malicioso.
- `node check-browser.cjs`: aprovado com duas sessões de Chrome, abrindo `index.html` por `file://`. Convite/resposta WebRTC reais, dois humanos mais três bots, comandos do convidado na física do anfitrião, soltura de teclas, saída e conexão com novo convite. Sem erros JavaScript não tratados nem requisições de página para serviços externos. Capturas da sala e da partida foram inspecionadas.

O navegador precisou executar fora da sandbox de desenvolvimento porque esta impedia sua inicialização. A sandbox do Chrome permaneceu habilitada. Os dois participantes do teste rodaram **no mesmo PC**: não houve teste em dois aparelhos, no Wi-Fi do usuário ou em Chromebook. Isolamento de rede, firewall, políticas do Chrome e desempenho do aparelho continuam pendentes. O anfitrião deve manter a aba visível; sair encerra a sala.

Na etapa LAN anterior, nenhum banco ou serviço de nuvem era usado. A versão PIN intermediária usou Firebase só para os convites. A distribuição global atual também transmite a partida pelo banco, sem SDK externo. A biblioteca pública pela internet fica para outra etapa.

## Verificação original — 7 de outubro de 2026

### Aprovado no ambiente disponível

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

### Pendências da verificação original

Na entrega original, o navegador de testes não conseguiu carregar a prévia em localhost nem abrir URLs `file://`. O teste LAN de 8 de outubro resolveu a verificação de abertura por arquivo, cliques de conexão e teclado da partida LAN no Chrome deste PC. Importação/exportação pela interface, teclado local simultâneo, alternância de layouts durante partida, perda de foco local e redimensionamento completos ainda precisam de conferência.

O CSS contém adaptações para painéis estreitos/baixos e a arena usa escala uniforme; viewports 1366×768, 1280×720, 1024×600, 1920×1080, retrato e zoom ainda precisam ser conferidos visualmente. Nenhum teste foi realizado em um Chromebook.

Para a primeira conferência no aparelho, extraia o ZIP e abra `index.html` sem rede; jogue uma partida em cada modo, acrescente o segundo humano e seis bots, alterne layouts, teste pausa/perda de foco e exporte/reimporte um mapa editado. Reduza Graphics para Low se necessário. Essa lista descreve pendências, não resultados já aprovados.

A física continua estimada e a aparência/sons/fontes diferem da referência. Publicação de mapas anterior a 2026 comprova existência até 2025, mas não geometria idêntica naquele ano. Detalhes em `REFERENCIAS.md` e `MAPAS.md`.

O ZIP foi extraído para uma pasta de conferência; seu conteúdo foi comparado por SHA-256 aos arquivos de distribuição. A checagem do núcleo foi executada novamente nessa cópia extraída. Isso verifica integridade e execução do código de simulação extraído, sem substituir a abertura visual do HTML.
