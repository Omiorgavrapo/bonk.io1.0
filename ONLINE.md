# Jogar pela internet

Este pacote já está configurado para o Firebase do proprietário. Ele pode ser aberto pelo arquivo `index.html`, sem instalar um servidor. A partida usa HTTPS pelo Firebase e não precisa de conexão direta entre os aparelhos: os jogadores podem estar em redes Wi-Fi diferentes.

## Criar e entrar

1. Extraia a pasta inteira do ZIP atualizado. Todos devem usar esta mesma versão; pacotes antigos, inclusive o primeiro pacote global, não são compatíveis com as novas regras de partida.
2. Abra `index.html` no Chrome com internet.
3. O dono escolhe **Criar sala** e configura mapa, humanos, bots e vitórias. No painel **Regras da partida**, ajusta gravidade, tamanho dos jogadores, velocidade e tempo de vida do tiro. O limite é cinco participantes no total, incluindo o dono e os bots. Os convidados veem essas regras, mas só o dono pode alterá-las antes de começar.
4. Clique em **Gerar PIN** e envie os oito números ao amigo.
5. O amigo escolhe **Entrar sala**, digita o PIN e entra. Cada PIN vale cinco minutos e conecta uma pessoa; gere outro para o próximo amigo.
6. Quando os apelidos aparecerem na sala, o dono clica em **Iniciar partida**.

Cada navegador controla um humano. Aparência e apelido são definidos no próprio jogo, sem cadastro. O dono escolhe e envia o mapa. Entradas durante uma partida assistem até a próxima.

## Durante a partida

O dono mantém o jogo aberto e a aba visível. Esc abre a sala sem pausar a simulação. Sair do dono encerra a sala; a saída ou perda de conexão de um participante da partida devolve os restantes à sala. Gere outro PIN para reconectar.

As conexões duram até 45 minutos a partir da criação do convite. Ao atingir esse prazo, crie outra sala. Isso mantém a conexão dentro da validade da identidade temporária; esta versão não renova uma partida em andamento.

## Regras e problemas de conexão

O proprietário precisa publicar **o `firebase.rules.json` desta versão** em Firebase → Realtime Database → Regras. As regras antigas liberavam somente convites; as novas também permitem os canais privados da partida. Veja [FIREBASE.md](FIREBASE.md).

Se você já publicou as regras da atualização global de 9 de outubro, não precisa publicá-las novamente para as novas opções e a mira: o arquivo de regras não mudou nesta atualização.

- **Atualize as regras:** copie o arquivo novo inteiro, substitua as regras no console e clique em Publicar.
- **PIN inválido ou usado:** confirme que todos receberam o novo ZIP e gere outro PIN.
- **Conexão interrompida:** confira a internet, peça outro PIN e deixe a aba visível. Não é necessário abrir portas no roteador.
- **O jogo abriu com textos LAN:** você abriu um pacote antigo. Extraia o novo ZIP em uma pasta nova.

## Desempenho e cota

O anfitrião executa a física a 60 passos por segundo. Estados e comandos são enviados até dez vezes por segundo, com estados antigos substituídos na fila e interpolação no convidado. O tempo de resposta depende do caminho entre cada aparelho e o Firebase; pode ser maior que numa conexão direta.

Os dados da partida contam na cota do Realtime Database. O projeto está no plano Spark; acompanhe a aba Uso do banco. Ao esgotar a cota, o online pode deixar de funcionar. A distribuição não altera seu plano nem ativa cobrança.

O canal conserva só o último lote de mensagens por direção, não um histórico infinito. Ao encerrar, o dono tenta apagar o canal. Se o navegador fechar antes da limpeza, as regras bloqueiam acesso após o prazo, mas pode ser necessário limpar registros expirados e usuários anônimos no console.

PINs não são senhas fortes: quem receber um PIN ainda válido pode usá-lo. A listagem pública de salas, chat, amigos e biblioteca pública de mapas não fazem parte desta atualização. Antes de divulgar o banco em grande escala, é necessário limitar abuso e conferir a cota.

Referências: [streaming HTTPS do Firebase](https://firebase.google.com/docs/database/rest/retrieve-data#section-streaming), [limites do banco](https://firebase.google.com/docs/database/usage/limits).
