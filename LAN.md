# Jogar em LAN com PIN

**Documento histórico:** estas instruções se referem ao pacote LAN anterior. A distribuição atual usa conexão global pelo Firebase; siga [ONLINE.md](ONLINE.md).

Cada jogador abre seu próprio index.html, com a pasta inteira extraída. A configuração do Firebase é feita uma vez pelo proprietário; veja [FIREBASE.md](FIREBASE.md). Distribua o mesmo online-config.js para todos.

## Criar e entrar

1. Conectem os computadores à mesma rede local, com acesso à internet.
2. O dono escolhe **Criar sala LAN**. Define humanos, bots, vitórias e mapa. Humanos + bots: até **5**, contando o dono.
3. O dono clica **Gerar PIN** e envia os **8 números** ao amigo.
4. O amigo escolhe **Entrar sala LAN**, digita o PIN e clica **Entrar na sala**. A resposta é automática.
5. Quando o apelido aparecer em **Na sala**, a conexão terminou. Gere outro PIN para o próximo amigo.
6. O dono clica **Iniciar partida**.

O PIN preserva zeros no começo, vale 5 minutos e conecta uma pessoa. Gere outro se expirar ou alguém já o tiver usado. Quem conhece o PIN pode tentar entrar; entregue a quem você quer convidar.

## Durante a partida

- Cada navegador controla um humano com as teclas do Jogador 1, ajustáveis em Settings.
- O dono mantém a aba aberta e visível; sair ou fechá-la encerra a sala.
- Esc abre a sala sem pausar a física.
- Entradas durante uma partida assistem e participam da próxima.
- Se um participante desconectar, a partida termina e os outros voltam à sala. Para reconectar, peça outro PIN.
- O anfitrião escolhe os mapas. Incluídos e criados no editor são transmitidos para os convidados.
- Classic, Arrows, Death Arrows, Grapple, VTOL e Football estão disponíveis.
- O modo local permite dois humanos no mesmo teclado e bots, sem internet.

## Internet e rede

O Firebase apresenta os navegadores usando os dados do convite/resposta. Não executa a física nem recebe os comandos da partida. O jogo usa WebRTC direto, sem servidores STUN/TURN; entrar apenas com PIN **não libera automaticamente partidas entre redes diferentes**.

Wi-Fi de convidados, isolamento entre clientes, firewall e políticas do navegador podem impedir a conexão. Não desative o firewall inteiro. Se encontrar o PIN mas não conectar, confira a LAN e gere outro convite.

Sem internet, novas conexões por PIN não funcionam. Uma partida já conectada pode continuar pela LAN; perder a conexão com o dono exige reconectar. Não existe lista pública de salas, chat, amigos ou biblioteca de mapas publicada nesta versão.

## Verificação

Os testes automatizados verificaram o PIN com Firebase simulado e conexão WebRTC real entre duas sessões de Chrome neste PC, abrindo pelo arquivo. Ainda falta validar o seu projeto Firebase, dois aparelhos na rede e um Chromebook real. Veja VERIFICACAO.md.

