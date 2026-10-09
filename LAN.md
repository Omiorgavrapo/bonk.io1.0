# Jogar em LAN pelo arquivo

O modo LAN conecta os navegadores diretamente por WebRTC. Cada pessoa abre seu próprio `index.html`, com todas as pastas do jogo extraídas. Não precisa instalar nada, criar conta, usar nuvem ou executar um servidor. SQLite, Firebase e Supabase não são necessários para essa etapa.

## Preparar

1. Conectem os computadores ou Chromebooks à mesma rede local.
2. Extraiam o ZIP inteiro e abram `index.html` no Chrome.
3. Escolham apelido e aparência. Cada navegador participa com um jogador; o segundo jogador no mesmo teclado continua sendo uma opção do modo local.

Evitem a rede Wi-Fi de convidados: ela pode impedir a comunicação entre os aparelhos. Redes com isolamento de clientes/AP também podem bloquear a conexão.

## Criar e entrar na sala

1. O anfitrião escolhe **Criar sala LAN** e define de **1 a 5 humanos**, incluindo ele, e de **0 a 4 bots**. A soma de humanos e bots deve ser no máximo **5**.
2. O anfitrião escolhe o mapa, o modo e as opções da partida.
3. Para cada convidado, o anfitrião gera um **Convite** individual e copia todo o texto.
4. O convidado escolhe **Entrar sala LAN**, cola esse convite e gera sua **Resposta**.
5. O convidado devolve todo o texto da resposta ao anfitrião. O anfitrião cola e confirma a resposta correspondente àquele convite.
6. Repitam a troca para os outros jogadores. Quando aparecerem conectados na sala, o anfitrião inicia a partida.

**Exemplo sem internet:** o anfitrião salva o convite de Ana em um arquivo `.txt` e entrega esse arquivo por pendrive ou pasta compartilhada da rede. Ana copia o texto para o jogo, salva a resposta em outro `.txt` e devolve o arquivo. O anfitrião confirma a resposta. Para Bruno, gera outro convite e repete o processo. Convite e resposta de pessoas diferentes não devem ser misturados. Os arquivos servem apenas para transportar o texto; não precisam ser importados pelo editor de mapas.

Esse procedimento substitui um serviço que apresentaria os navegadores entre si. Não compartilhe o convite publicamente: entregue-o à pessoa que deve entrar.

## Durante a partida

- O anfitrião mantém a aba aberta e visível. Fechar ou sair da sala encerra a sessão; os convidados precisam de uma nova conexão para jogar novamente.
- Cada convidado usa os controles do primeiro jogador, configuráveis em **Settings**. Clique fora dos campos de texto antes de jogar.
- Quem entra depois do início assiste à partida em andamento e participa da próxima partida.
- Se um participante da partida desconectar, a partida termina e os restantes voltam à sala. Para reconectar, o anfitrião gera outro convite. **Sala LAN · Esc** abre a sala sem pausar a física.
- Os seis modos estão disponíveis: Classic, Arrows, Death Arrows, Grapple, VTOL e Football.
- O anfitrião escolhe e envia o mapa para os convidados. Eles não precisam importar o mesmo mapa antes de entrar.

Mapas incluídos ou criados pelo anfitrião podem ser usados na sala. Convidados não publicam mapas. A biblioteca pública acessível pela internet fica para uma próxima etapa; a LAN não cria esse serviço.

## Se não conectar

Confira se os dois aparelhos estão na mesma rede, se a rede permite comunicação entre clientes e se cada resposta corresponde ao convite correto. Se uma tentativa foi cancelada, gere um novo convite e refaça a troca.

A conexão usa WebRTC sem servidores ICE/STUN/TURN externos. Isso atende à proposta de LAN sem nuvem, mas pode falhar por isolamento do Wi-Fi, firewall ou políticas do navegador/rede. Em uma rede administrada, peça ao responsável uma liberação específica para o Chrome/WebRTC. Não desative o firewall inteiro.

O uso por `file://` também depende das permissões e políticas do navegador. Atualizar o Chrome e testar em uma rede doméstica sem isolamento ajuda a identificar restrições do ambiente. Esta versão não oferece conexão entre redes pela internet.

## Limites da verificação

O fluxo foi testado com duas sessões de Chrome neste PC, abrindo por arquivo, incluindo partida, comandos e nova conexão. Isso não comprova uma partida em dois aparelhos, funcionamento em um Chromebook específico ou desempenho da sua rede. Consulte `VERIFICACAO.md` para os testes efetivamente realizados e o que ainda está pendente.
