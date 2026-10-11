# Jogar pela internet

Este pacote já está configurado para o Firebase do proprietário. Ele pode ser aberto pelo arquivo `index.html`, sem instalar um servidor. Os jogadores podem estar em redes diferentes. O PIN usa Firebase e a partida tenta uma conexão direta global por WebRTC, automaticamente. Se a rede não permitir, continua pelo Firebase.

## Criar e entrar

1. Extraia a pasta inteira do ZIP atualizado. Todos devem usar esta mesma versão; pacotes antigos, inclusive o primeiro pacote global, não são compatíveis com as novas regras de partida.
2. Abra `index.html` no Chrome com internet.
3. O dono escolhe **Criar sala** e configura mapa, humanos, bots e vitórias. No painel **Regras da partida**, ajusta gravidade, tamanho dos jogadores, velocidade e tempo de vida do tiro. O limite é cinco participantes no total, incluindo o dono e os bots. Os convidados veem essas regras, mas só o dono pode alterá-las antes de começar.
4. Clique em **Gerar PIN** e envie os oito números ao amigo.
5. O amigo escolhe **Entrar sala**, digita o PIN e entra. Cada PIN vale cinco minutos e conecta uma pessoa; gere outro para o próximo amigo.
6. Quando os apelidos aparecerem na sala, o dono clica em **Iniciar partida**.

Cada navegador controla um humano. Aparência e apelido são definidos no próprio jogo, sem cadastro. O dono escolhe e envia o mapa. Entradas durante uma partida assistem até a próxima.

Todos devem atualizar a pasta inteira para receber a correção do convidado. O PIN continua com oito dígitos; não existe um novo modo LAN nem códigos longos para copiar. A conexão direta pode levar alguns segundos para ser preparada enquanto a sala já funciona pelo banco.

Esta versão também prevê a física no navegador do convidado. Movimento, mira, disparo e chute no Football respondem localmente antes da confirmação do dono. Distribua a pasta inteira, incluindo `prediction.js`; clientes de versões anteriores não podem entrar nesta versão.

## Durante a partida

O dono mantém o jogo aberto e a aba visível. Esc abre a sala sem pausar a simulação. Sair do dono encerra a sala; a saída ou perda de conexão de um participante da partida devolve os restantes à sala. Gere outro PIN para reconectar.

As conexões duram até 45 minutos a partir da criação do convite. Ao atingir esse prazo, crie outra sala. Isso mantém a conexão dentro da validade da identidade temporária; esta versão não renova uma partida em andamento.

## Regras e problemas de conexão

O proprietário precisa publicar **o `firebase.rules.json` desta versão** em Firebase → Realtime Database → Regras. As regras antigas liberavam somente convites; as novas também permitem os canais privados da partida. Veja [FIREBASE.md](FIREBASE.md).

Se você já publicou as regras da atualização global de 9 de outubro, não precisa publicá-las novamente para as novas opções, a mira ou a correção do atraso do convidado: o arquivo de regras não mudou nesta atualização.

- **Atualize as regras:** copie o arquivo novo inteiro, substitua as regras no console e clique em Publicar.
- **PIN inválido ou usado:** confirme que todos receberam o novo ZIP e gere outro PIN.
- **Conexão interrompida:** confira a internet, peça outro PIN e deixe a aba visível. Não é necessário abrir portas no roteador.
- **O jogo abriu com textos LAN:** você abriu um pacote antigo. Extraia o novo ZIP em uma pasta nova.

## Desempenho e cota

O anfitrião executa a física a 60 passos por segundo. Estados são enviados até vinte vezes por segundo. Uma mudança de tecla é enviada no primeiro frame, com atualizações periódicas para manter os comandos. Os pacotes enviam só a posição/rotação dos objetos do mapa, sem repetir a geometria inteira.

O convidado suaviza a partir da posição que já estava desenhando, com duração ajustada ao intervalo dos estados. Um pacote que chega cedo não provoca o salto para a posição de outro snapshot. Estados antigos não se acumulam em filas de movimento.

Para o próprio jogador, `prediction.js` executa a mesma física a 60 Hz e guarda os comandos ainda não confirmados. O estado do dono informa quais comandos já foram processados. O convidado aplica esse estado, descarta o trabalho confirmado e reaplica os comandos pendentes. Pequenas diferenças de posição da bolinha, dos seus tiros e da bola de Football convergem suavemente; mortes, placar, mudanças de rodada e correções grandes seguem o dono. Os outros jogadores continuam com interpolação dos estados recebidos.

A previsão é uma estimativa: não conhece uma tecla futura do adversário nem todos os detalhes internos de colisão do dono. Um tiro desenhado imediatamente ainda depende da confirmação para causar um acerto. Após 1,5 segundo de comandos sem confirmações úteis, a previsão para de avançar até a rede voltar; isso evita acumular trabalho ou fingir uma partida independente durante uma queda. Ela disfarça a espera, mas não elimina o atraso real da rede.

O rodapé mostra **Online · Direta** quando o movimento passa por WebRTC, ou **Online · Via banco** quando usa a reserva HTTPS. O Firebase continua transmitindo convites e controle da sala nos dois casos. Se a conexão direta cair, a reserva entra automaticamente; não precisa gerar outro PIN por causa dessa troca.

Na conexão direta, um servidor STUN do Google ajuda a localizar os aparelhos em redes diferentes. Algumas redes bloqueiam a conexão direta; nesses casos, o caminho pelo Firebase ainda tem atraso. Para reduzir esse atraso também nessas redes, seria necessário um serviço TURN próprio ou contratado. Nenhum serviço pago foi ativado. Um desenvolvedor pode fornecer servidores ICE em `BonkOnlineConfig.iceServers`; a configuração atual usa STUN e conserva o banco como reserva.

Os dados enviados pelo Firebase contam na cota do Realtime Database. Na conexão direta, só os convites e o controle da sala passam pelo banco; na reserva, ele carrega também os movimentos. O projeto está no plano Spark; acompanhe a aba Uso do banco. Ao esgotar a cota, o online pode deixar de funcionar. A distribuição não altera seu plano nem ativa cobrança.

O canal conserva só o último lote de mensagens por direção, não um histórico infinito. Ao encerrar, o dono tenta apagar o canal. Se o navegador fechar antes da limpeza, as regras bloqueiam acesso após o prazo, mas pode ser necessário limpar registros expirados e usuários anônimos no console.

PINs não são senhas fortes: quem receber um PIN ainda válido pode usá-lo. A listagem pública de salas, chat, amigos e biblioteca pública de mapas não fazem parte desta atualização. Antes de divulgar o banco em grande escala, é necessário limitar abuso e conferir a cota.

Referências: [conexões WebRTC, STUN e TURN](https://webrtc.org/getting-started/peer-connections), [streaming HTTPS do Firebase](https://firebase.google.com/docs/database/rest/retrieve-data#section-streaming), [limites do banco](https://firebase.google.com/docs/database/usage/limits).
