# Bonk Local

Jogo local em HTML, CSS e JavaScript, com o Bonk.io de 2025 como referência. **A fidelidade 1:1 visual e física ainda não foi comprovada.** As diferenças e os limites dos testes estão em `VERIFICACAO.md` e `REFERENCIAS.md`.

## Jogar

1. Extraia **todo** o ZIP, mantendo as pastas `vendor` e `assets` junto aos demais arquivos.
2. Abra `index.html` no Chrome. A distribuição usa scripts clássicos e recursos locais; não exige instalação, build, CDN ou servidor para o modo local.
3. Escolha **Quick Play** ou **Custom Game**, configure os participantes e pressione **Start**.

Até dois humanos no mesmo teclado, além de zero a seis bots. Há dois bots por padrão. Bots usam os mesmos comandos e a mesma física dos humanos. Contas, amigos e salas online não estão implementados nesta entrega.

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

A checagem usa somente a biblioteca de física incluída e `assert` do Node: seis modos, comandos de bots, oito participantes, rodadas, placar, pesado, colisões contínuas, geometria/juntas, estado reproduzível e editor lógico. Também valida todos os 26 mapas e sua preservação em JSON. Os resultados e as verificações ainda pendentes estão em `VERIFICACAO.md`.

## Futuro online

`core.js` funciona como script do navegador ou módulo CommonJS, sem DOM, Canvas, áudio ou relógio de parede. `BonkCore.create(map, {players, seed, roundsToWin})` devolve `step(inputs)`, `state()`, `snapshot()`, `restore(snapshot)` e `restartRound()`; inputs são comandos booleanos por ID de jogador e tick.

Um servidor JavaScript futuro deverá validar os comandos, executar esse núcleo a 60 ticks/s e enviar estados ao cliente. Snapshots versão 2 guardam o checkpoint da rodada e os comandos seguintes; restaurar reproduz a rodada para preservar o estado interno da engine. A repetibilidade foi testada no mesmo runtime, sem garantia entre plataformas. Transporte, sincronização e servidor ainda precisam ser implementados.

O cliente poderá continuar sendo `index.html`. WebSocket exigirá um servidor separado, hospedado ou em outro computador; em LAN, servir este cliente por HTTP é uma possibilidade a verificar. A conexão de um cliente `file://` dependerá das regras do Chrome escolhido.

Biblioteca de física e fontes têm suas licenças incluídas; consulte `LICENCAS.md`.
