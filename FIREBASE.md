# Ativar os convites por PIN

**Pacote global configurado:** o arquivo `online-config.js` já aponta para o projeto `bonk-98544`. O proprietário ativou a entrada anônima e publicou as regras de convites e canais de partida. As regras continuam iguais na atualização de 10 de outubro com conexão direta e previsão no cliente. Os caminhos direto e de reserva passaram no Chrome com Firebase real. Para jogar, siga [ONLINE.md](ONLINE.md) ou vá à etapa 5; a configuração abaixo fica como referência.

Você configura isto uma vez. Depois, todos abrem o HTML normalmente e só compartilham os 8 números do convite. Cada PIN conecta **uma pessoa**, vale **5 minutos** e deixa de funcionar depois do uso ou quando o dono gera outro.

O Firebase transmite convites, mapas e controle da sala por HTTPS. O movimento tenta automaticamente uma conexão WebRTC global; se ela não funcionar, comandos e estados continuam pelo banco. A física autoritativa roda no aparelho do dono, com previsão no navegador do convidado para responder às teclas antes da confirmação. Os jogadores podem estar em redes diferentes. Um STUN do Google já está configurado; não é necessário abrir portas para usar a reserva. Redes restritas podem continuar com atraso; veja os limites em [ONLINE.md](ONLINE.md).

## 1. Criar o projeto

1. Abra o [console Firebase](https://console.firebase.google.com/), entre com sua conta Google e crie um projeto, por exemplo **Bonk 2**. Aceite os termos você mesmo, se o console pedir.
2. Google Analytics não é necessário para este jogo.
3. Nas configurações do projeto, registre um aplicativo **Web** (ícone `</>`). Não precisa ativar Hosting nem instalar o SDK.
4. No objeto `firebaseConfig` exibido, copie **apiKey**. É a chave do aplicativo Web, não uma chave privada de administrador.

## 2. Ativar a entrada anônima

Em **Segurança → Authentication** (ou **Build**, conforme a versão do console), comece a configuração e vá a **Sign-in method / Método de login**. Ative **Anonymous / Anônimo** e salve.

O jogo recebe uma identidade temporária sem pedir apelido de login, e-mail ou senha. A identidade autoriza criar um convite próprio e responder a um convite conhecido. O perfil visual continua sendo configurado no próprio jogo.

Referência: [autenticação anônima](https://firebase.google.com/docs/auth/web/anonymous-auth).

## 3. Criar o banco e aplicar as regras

1. Em **Bancos de dados e armazenamento → Realtime Database** (ou **Build**, conforme a versão do console), crie o banco. Escolha **modo bloqueado**, não modo de teste.
2. Copie a URL mostrada na aba **Data / Dados**. Ela termina em `.firebaseio.com` ou `.firebasedatabase.app`.
3. Na aba **Rules / Regras**, substitua o conteúdo pelo arquivo **firebase.rules.json** incluído neste ZIP e publique as regras.

As regras impedem listar convites e canais, limitam campos/tamanhos, permitem uma única resposta ao PIN e separam as permissões de anfitrião e convidado na partida. Convites expiram após cinco minutos e canais após 45 minutos. Publique o arquivo completo da versão atual, incluindo `connections` e `invites`. Não substitua essas regras por `".read": true` / `".write": true`.

Referências: [criar Realtime Database](https://firebase.google.com/docs/database/web/start) e [regras de acesso](https://firebase.google.com/docs/database/security).

## 4. Preencher o jogo

Este pacote já vem preenchido. Para usar outro projeto, abra **online-config.js** com um editor de texto e substitua os dois valores:

```js
window.BonkOnlineConfig = Object.freeze({
  apiKey: 'COLE_A_APIKEY_DO_APP_WEB',
  databaseURL: 'https://COLE_A_URL_DO_BANCO'
});
```

Mantenha as aspas. Não acrescente `/invites`, `.json` ou parâmetros à URL. Não copie esse exemplo literalmente: use os valores reais do mesmo projeto.

Distribua **essa pasta inteira configurada** para os amigos. Todos precisam do mesmo `online-config.js`: um PIN não contém o endereço do seu projeto Firebase. Ninguém precisa criar uma conta Google para jogar.

A configuração Web é feita para estar no cliente; o acesso ao banco depende das regras e da identidade. Nunca coloque uma chave de conta de serviço, segredo do banco, senha ou token de administrador nesse arquivo. Referência: [chaves de aplicativo Firebase](https://firebase.google.com/docs/projects/api-keys).

## 5. Testar de verdade

1. Reabra `index.html` no Chrome em dois aparelhos com internet, preferencialmente em redes diferentes para conferir o acesso global.
2. No primeiro, **Criar sala → Gerar PIN**. No segundo, **Entrar sala**, digite os 8 números e entre. Não há resposta para copiar.
3. Confira se os dois apelidos aparecem na sala. O dono inicia a partida.
4. Tente reutilizar o PIN em outro navegador: deve ser recusado. Gere um novo, espere 5 minutos e confirme que o PIN expirado também é recusado.
5. No console do Firebase, confira que não é possível ler `/invites` inteiro usando o simulador de regras com um usuário anônimo. Confira também que outro usuário não consegue apagar/substituir um convite alheio.

O teste `check-browser.cjs` usa Chrome com Firebase real. Por padrão verifica a reserva com WebRTC desativado; `BONK_QA_DIRECT=1` também verifica a conexão direta. PIN, cinco participantes, estados, controles, previsão com estados do host retidos, desconexão e reconexão passaram. **Os dois navegadores de teste rodaram no mesmo PC; ainda falta uma partida em aparelhos diferentes e em Chromebook.** A fixture local de regras não é o emulador oficial; veja `VERIFICACAO.md`.

## Se não funcionar

- **PIN ainda não ativado:** os valores de `online-config.js` estão vazios ou inválidos.
- **Ative Authentication → Anônimo:** o método de entrada não foi habilitado no projeto da API key.
- **Acesso recusado:** confira se publicou `firebase.rules.json` no Realtime Database correspondente à URL.
- **PIN não encontrado, expirado ou usado:** peça um novo PIN. Confira se todos receberam a mesma configuração.
- **Sem conexão com o serviço:** os convites precisam de internet; tente novamente quando a conexão voltar.
- **Encontrou a sala, mas não conectou:** confirme que todos usam o pacote global atualizado e que as regras novas, incluindo `connections`, estão publicadas. Confira a internet e gere outro PIN.
- **Funciona hospedado, mas falha pelo arquivo:** restrições da API key por referenciador HTTP podem não aceitar uma página `file://`, que não tem o referenciador de um site. Use a configuração de aplicativo Web adequada ao acesso por arquivo; mantenha as restrições de APIs exigidas pelo Firebase. Não use chaves administrativas como alternativa.

## Uso e manutenção

O PIN é um convite curto para compartilhar com amigos, não uma senha forte. Quem souber um PIN válido pode responder primeiro. As regras não oferecem limitação de tentativas por IP; antes de divulgar o serviço para um público grande, adicione proteção contra abuso e confira as cotas do projeto.

O dono tenta apagar convites e canais ao conectar, cancelar ou sair. Se a aba fechar ou a internet cair antes da limpeza, os registros podem ficar armazenados, mas as regras bloqueiam acesso após o respectivo prazo. Registros expirados e usuários anônimos podem exigir limpeza no console; esta entrega não instala funções pagas para fazer essa limpeza. A partida consome a cota de transferência do banco e seu atraso depende da conexão de cada aparelho ao Firebase. A sessão termina após 45 minutos; crie outra sala para continuar.

O jogo usa requisições HTTPS REST, sem CDN e sem dependência de SDK. Consulte [REST do banco](https://firebase.google.com/docs/reference/rest/database) e [REST da autenticação](https://firebase.google.com/docs/reference/rest/auth).
