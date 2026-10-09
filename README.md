# Bonk Local + LAN

Jogo local em HTML, CSS e JavaScript, com o Bonk.io de 2025 como referência. **A fidelidade 1:1 visual e física ainda não foi comprovada.** As diferenças e os limites dos testes estão em `VERIFICACAO.md` e `REFERENCIAS.md`.

## Jogar

1. Extraia **todo** o ZIP, mantendo as pastas `vendor` e `assets` junto aos demais arquivos.
2. Abra `index.html` no Chrome. A distribuição usa scripts clássicos e recursos locais; não exige instalação, build, CDN ou servidor para o modo local.
3. Escolha **Quick Play** ou **Custom Game**, configure os participantes e pressione **Start**.

No modo local, até dois humanos no mesmo teclado, além de zero a seis bots. Há dois bots por padrão. Bots usam os mesmos comandos e a mesma física dos humanos.

**LAN:** computadores na mesma rede podem jogar abrindo o arquivo HTML, sem servidor, nuvem ou instalação. O dono escolhe até cinco vagas no total, divididas entre humanos e bots; cada navegador controla um humano. Use **Criar sala LAN** ou **Entrar sala LAN** e troque um convite e uma resposta por jogador. Veja o passo a passo em [LAN.md](LAN.md). Contas, amigos, chat, descoberta automática de salas e acesso entre redes pela internet ficam para outra etapa.

## Controles

| Ação | Jogador 1 | Jogador 2 |
|---|---|---|
| Direções | Setas | W A S D |
| Pesado / chute no Football | X | F |
| Especial | Z | G |
| Pausar / continuar | Esc | Esc |

É possível remapear as teclas em **Settings**, sem duplicar comandos. O teclado físico pode limitar a quantidade de teclas simultâneas; escolha outra combinação caso alguma deixe de responder. Clique fora de um campo de texto antes de controlar o jogador.

## Modos e aparência

| Modo | Mecânica desta implementação |
|---|---|
| Classic | Movimento, contato com plataformas, pesado e eliminação ao sair da arena. Último sobrevivente vence. |
| Arrows | Segure Especial, mire com as direções e solte para disparar; mirar bloqueia movimento. Flechas empurram. |
| Death Arrows | O disparo funciona como em Arrows; acertar uma flecha elimina. |
| Grapple | Segure Especial para prender o gancho a uma superfície próxima; solte para liberar. Contato de um oponente pode soltá-lo. |
| VTOL | Propulsores direcionais, rotação, colisões e pesado. |
| Football | Dois times, bola e gols; Pesado funciona como chute. O placar de cada integrante mostra os pontos do time. |

O botão **Original / Adapted** e a opção Layout em Settings mudam a disposição da interface durante a mesma partida. A simulação usa passos fixos de 1/60 s e coordenadas independentes da tela. **Original é uma reconstrução da referência**, sem comprovação pixel a pixel.

Cinco skins básicas e cor configurável por humano. Áudio sintetizado localmente, com volume/mudo. Para um computador mais lento, use **Graphics → Low**; isso reduz a resolução do Canvas sem modificar o passo da física. A configuração de referência é Samsung Chromebook 3, 2 GB, 1366×768; não houve medição nesse aparelho.

## Mapas e editor

O catálogo possui **26 entradas**: 13 arenas autorais e 13 entradas/variantes de sete mapas reais, com nome, autor e publicação oficial anteriores a 2026. O payload dos mapas foi obtido em outubro de 2026; ele não comprova geometria idêntica à de 2025. Consulte a lista e as adaptações em `MAPAS.md`.

Em **Map Editor**, crie ou carregue um mapa, selecione uma ferramenta e desenhe na arena. Há retângulos, círculos, polígonos, spawns, gols, zonas e juntas; seleção, movimento, tamanho, rotação, propriedades físicas e Undo/Redo. O painel também permite selecionar objetos ocultos por outros objetos.

- **Test map** joga o rascunho; **Back to editor** retorna para continuar editando.
- **Save** grava no armazenamento deste navegador. **Load a map** recupera mapas incluídos ou salvos.
- **Export** cria um JSON portátil; **Import** valida e abre esse formato, preservando o rascunho se o arquivo for inválido. Não importa códigos do formato original do Bonk.io.
- Faça uma exportação para guardar seus mapas. O armazenamento de páginas `file://` varia entre navegadores e pode ser apagado; importação/exportação é a alternativa independente dele.

## Verificação para desenvolvimento

Quem joga não precisa de Node. Para continuar o projeto, com Node instalado, execute dentro desta pasta:

```sh
node check-core.cjs
```

A checagem usa somente a biblioteca de física incluída e `assert` do Node: seis modos, cinco humanos, comandos de bots, oito participantes locais, rodadas, placar, pesado, colisões contínuas, geometria/juntas, estado reproduzível e editor lógico. Também valida todos os 26 mapas e sua preservação em JSON. `node check-lan.cjs` verifica o transporte e `node check-room.cjs` verifica a sala com ligações simuladas. `check-browser.cjs` é uma checagem opcional com Chrome e Playwright, que precisam estar disponíveis no ambiente de desenvolvimento. Quem joga só precisa extrair o ZIP e abrir o HTML.

## LAN e futuro pela internet

`lan.js` usa um canal WebRTC confiável, com sinalização manual por códigos e sem servidores ICE/STUN/TURN. `lan-room.js` executa a física no navegador do anfitrião; os convidados enviam comandos e recebem estados para renderizar. O anfitrião escolhe os mapas; convidados não publicam. Entradas tardias assistem até a próxima partida. A perda de um participante da partida a encerra e devolve os restantes à sala; uma nova conexão exige novo convite. Sair da sala do anfitrião a encerra para todos. Esc abre a sala, sem pausar a física. O anfitrião deve manter a aba visível.

Há testes reais com duas sessões de Chrome neste PC, abrindo por `file://`, sem requisições externas. Isso não substitui um teste com dois aparelhos na sua rede. Wi-Fi de convidados, isolamento de clientes, firewall e políticas de navegador podem impedir WebRTC local.

`core.js` funciona como script do navegador ou módulo CommonJS, sem DOM, Canvas, áudio ou relógio de parede. `BonkCore.create(map, {players, seed, roundsToWin})` devolve `step(inputs)`, `state()`, `snapshot()`, `restore(snapshot)` e `restartRound()`; inputs são comandos booleanos por ID de jogador e tick.

Para uma futura versão pública pela internet, um servidor JavaScript pode executar esse núcleo a 60 ticks/s. Outro caminho é um serviço de nuvem para salas/mapas e conexão entre navegadores. Esta entrega implementa apenas a LAN. Snapshots versão 2 guardam o checkpoint da rodada e os comandos seguintes; restaurar reproduz a rodada para preservar o estado interno da engine. A repetibilidade foi testada no mesmo runtime, sem garantia entre plataformas.

O cliente continua sendo `index.html`. A biblioteca pública pela internet, com publicação só pelo proprietário, fica para a etapa com um serviço compartilhado. Mapas da sala LAN são enviados pelo anfitrião e o editor mantém seu armazenamento e exportação locais.

Biblioteca de física e fontes têm suas licenças incluídas; consulte `LICENCAS.md`.
