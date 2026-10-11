# Bonk Local + Online

Jogo local em HTML, CSS e JavaScript, com o Bonk.io de 2025 como referência. **A fidelidade 1:1 visual e física ainda não foi comprovada.** As diferenças e os limites dos testes estão em `VERIFICACAO.md` e `REFERENCIAS.md`.

## Jogar

1. Extraia **todo** o ZIP, mantendo as pastas `vendor` e `assets` junto aos demais arquivos.
2. Abra `index.html` no Chrome. A distribuição usa scripts clássicos e recursos locais; não exige instalação, build, CDN ou servidor para o modo local.
3. Escolha **Jogar local** ou **Criar partida**, configure os participantes e pressione **Iniciar partida**.

No modo local, até dois humanos no mesmo teclado, além de zero a seis bots. Há dois bots por padrão. Bots usam os mesmos comandos e a mesma física dos humanos.

**Online com PIN:** computadores em redes diferentes podem jogar abrindo o arquivo HTML. O dono escolhe até cinco vagas no total, divididas entre humanos e bots; cada navegador controla um humano. O convite é um **PIN de 8 dígitos**, válido por cinco minutos para uma pessoa; a resposta é automática. Este pacote já tem a configuração do projeto Firebase do proprietário. Todos recebem a mesma pasta. O banco transmite os convites e o controle da sala; o movimento tenta uma conexão direta global por WebRTC e usa HTTPS como reserva. O rodapé mostra **Direta** ou **Via banco**. Veja [ONLINE.md](ONLINE.md). As regras já publicadas não mudaram nesta correção. Chat, amigos e biblioteca pública de mapas ficam para outra etapa.

O convidado usa **previsão no cliente com reconciliação**: sua bolinha, mira, tiros e chutes respondem antes da confirmação. A física local reaplica os comandos pendentes a partir do estado do anfitrião, suavizando pequenas diferenças. Os resultados da partida continuam sendo confirmados pelo dono. Todos precisam atualizar a pasta inteira, incluindo `prediction.js`; esta versão recusa conexões com pacotes antigos.

## Regras da partida

Nas telas de criação local e online, o painel **Regras da partida** permite ajustar:

| Opção | Intervalo | Padrão |
|---|---|---|
| Gravidade | −3× a 3× da gravidade do mapa; 0 flutua | 1× |
| Tamanho dos jogadores | 0,5× a 2×; altera também a colisão | 1× |
| Velocidade do tiro | 0,25× a 3× | 1× |
| Tempo de vida do tiro | 0,2 a 15 segundos; uma colisão pode encerrá-lo antes | 5 s |

Velocidade e tempo de vida afetam Arrows e Death Arrows. O tamanho não altera a bola do Football. **Restaurar padrão** desfaz os ajustes. No local, as regras ficam salvas neste navegador; no online, o dono escolhe antes de iniciar e todos recebem os mesmos valores. Durante a partida online, os ajustes ficam bloqueados.

## Controles

| Ação | Jogador 1 | Jogador 2 |
|---|---|---|
| Direções | Setas | W A S D |
| Pesado / chute no Football | X | F |
| Especial | Z | G |
| Pausar / continuar | Esc | Esc |

É possível remapear as teclas em **Configurações** (⚙), sem duplicar comandos. O teclado físico pode limitar a quantidade de teclas simultâneas; escolha outra combinação caso alguma deixe de responder. Clique fora de um campo de texto antes de controlar o jogador; Esc fecha uma janela e devolve o foco à arena.

## Modos e aparência

| Modo | Mecânica desta implementação |
|---|---|
| Classic | Movimento, contato com plataformas, pesado e eliminação ao sair da arena. Último sobrevivente vence. |
| Arrows | Segure Especial, gire a mira continuamente com esquerda/direita e solte para disparar; mirar bloqueia movimento. Flechas empurram. |
| Death Arrows | O disparo funciona como em Arrows; acertar uma flecha elimina. |
| Grapple | Segure Especial para prender o gancho a uma superfície próxima; solte para liberar. Contato de um oponente pode soltá-lo. |
| VTOL | Propulsores direcionais, rotação, colisões e pesado. |
| Football | Dois times, bola e gols; Pesado funciona como chute. O placar de cada integrante mostra os pontos do time. |

O botão **Original / Adapted** e a opção Layout em Configurações mudam a disposição da interface durante a mesma partida. A simulação usa passos fixos de 1/60 s e coordenadas independentes da tela. **Original é uma reconstrução da referência**, sem comprovação pixel a pixel.

Arco, corda, flecha e rodinha de recarga são desenhados no **Canvas**. A mira gira em 360° e pode ser ajustada durante a recarga; a rodinha se completa quando outro disparo fica disponível. Use Z + setas esquerda/direita no Jogador 1 e G + A/D no Jogador 2, ou as teclas configuradas. Todos os participantes online precisam deste pacote atualizado; versões anteriores não entendem as novas regras. Esta atualização conserva as regras Firebase já publicadas.

Cinco skins básicas e cor configurável por humano. Áudio sintetizado localmente, com volume/mudo. Para um computador mais lento, use **Gráficos → Baixo**; isso reduz a resolução do Canvas sem modificar o passo da física. A configuração de referência é Samsung Chromebook 3, 2 GB, 1366×768; não houve medição nesse aparelho.

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
node check-rules.cjs
node check-prediction.cjs
```

A checagem usa somente a biblioteca de física incluída e `assert` do Node: seis modos, cinco humanos, comandos de bots, oito participantes locais, rodadas, placar, pesado, colisões contínuas, geometria/juntas, estado reproduzível e editor lógico. Também valida todos os 26 mapas e sua preservação em JSON. `node check-online.cjs` verifica o transporte global e regras com uma fixture local, `node check-room.cjs` verifica a sala e a continuidade da interpolação com ligações simuladas e `node check-pin.cjs` verifica os PINs. `node check-hybrid.cjs` verifica a negociação automática, mensagens diretas e a reserva após falha/bloqueio do WebRTC. `check-browser.cjs` usa Chrome e Playwright com o Firebase real configurado; cria e limpa dados de teste. Por padrão verifica a reserva HTTPS; com a variável de ambiente `BONK_QA_DIRECT=1`, verifica WebRTC real e sua queda para a reserva. Quem joga só extrai o ZIP configurado e abre o HTML.

## Conexão pela internet

`online.js` usa HTTPS e streaming SSE do Firebase para convites, controle e reserva, negociando automaticamente uma conexão WebRTC global para estados e comandos. `lan.js` fornece o canal direto com fragmentação e limites; `pin.js` publica convites de uso único. `lan-room.js` conserva o controlador da sala, executando a física no navegador do anfitrião a 60 Hz e enviando até 20 estados por segundo; os convidados enviam mudanças de tecla imediatamente. `prediction.js` usa uma instância de `BonkCore` para antecipar a resposta do jogador local e reconciliar comandos confirmados; a correção física aceita posição, velocidades, recargas e gancho validados, sem prometer restauração exata dos impulsos internos da engine. A memória é limitada a 90 passos pendentes. Os outros participantes usam interpolação. Os pacotes não repetem a geometria do mapa. Os nomes internos herdados não indicam uma restrição a LAN. O anfitrião escolhe os mapas; convidados não publicam. Entradas tardias assistem até a próxima partida. A perda de um participante da partida a encerra e devolve os restantes à sala; uma nova conexão exige novo PIN. Sair da sala do anfitrião a encerra para todos. Esc abre a sala, sem pausar a física. O anfitrião deve manter a aba visível.

O transporte serializa lotes de mensagens em strings para preservar arrays e valores nulos no banco, limita filas/tamanhos, substitui estados e comandos antigos e encerra conexões que perdem a sequência ou deixam de enviar sinais de vida. Cada conexão possui um identificador aleatório de 128 bits e permissões separadas para anfitrião e convidado. A sessão dura até 45 minutos; confira os resultados e limites dos testes em `VERIFICACAO.md`.

`core.js` funciona como script do navegador ou módulo CommonJS, sem DOM, Canvas, áudio ou relógio de parede. `BonkCore.create(map, {players, seed, roundsToWin, rules})` devolve `step(inputs)`, `state()`, `snapshot()`, `restore(snapshot)` e `restartRound()`; inputs são comandos booleanos por ID de jogador e tick. `BonkCore.normalizeRules()` fornece padrões e valida os quatro ajustes; `options-ui.js` compartilha seus controles entre local e online.

Snapshots versão 2 guardam o checkpoint da rodada e os comandos seguintes; restaurar reproduz a rodada para preservar o estado interno da engine. A repetibilidade foi testada no mesmo runtime, sem garantia entre plataformas.

O cliente continua sendo `index.html`. A biblioteca pública pela internet, com publicação só pelo proprietário, fica para outra etapa. Mapas da sala são enviados pelo anfitrião e o editor mantém seu armazenamento e exportação locais. A conexão direta usa STUN do Google; redes que a bloqueiam continuam pelo banco e podem apresentar atraso. Na reserva, movimentos também consomem a cota do Firebase; na conexão direta, essa cota é usada pelos convites e pelo controle da sala. Nenhum serviço TURN pago foi ativado.

Biblioteca de física e fontes têm suas licenças incluídas; consulte `LICENCAS.md`.
