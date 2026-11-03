# Eclipse FLAC Bridge para MySpoti

Extensão experimental para reprodução e download FLAC usando a tua conta Eclipse autorizada.

## Instalação

Descarrega `extension.zip` em Releases e instala-o em Extensões no MySpoti. Nas definições da extensão, preenche o **URL do addon Eclipse** (terminado em `/manifest.json`) e o **Token da conta Eclipse**. Coloca a extensão em primeiro nas fontes de reprodução e download.

O pacote distribuído tem os campos vazios. Nunca publiques tokens, URLs pessoais ou pacotes personalizados com credenciais. O login Google dentro do WebView não faz parte desta versão.

## Como obter o token e o URL

1. Num browser **num PC**, abre https://eclipsemusic.app/account e inicia sessão na conta Eclipse.
2. Prime **F12** e abre **Application** (Chrome/Edge/Brave) ou **Storage/Armazenamento** (Firefox).
3. Abre **Local Storage → https://eclipsemusic.app**.
4. Procura a chave **`eclipse_token`** e copia apenas o seu **valor**, sem aspas. Cola-o no campo **Token da conta Eclipse** da extensão. Não é a password Google.
5. Para o URL, abre **Support the project → Eclipse addon → Copy** na página da conta. Cola o link completo no campo **URL do addon Eclipse**.

Se a chave não aparecer, confirma que o login foi concluído em `https://eclipsemusic.app`, no mesmo domínio selecionado no Local Storage. Mantém o token e o link privados. Não precisas de colar comandos na consola nem desativar proteções do browser.

## Sessão

A extensão verifica a sessão no primeiro uso e depois diariamente quando usada. Guarda o token renovado devolvido pelo servidor. Nos testes, os tokens tinham validade de 30 dias e a API devolvia uma renovação por mais 30 dias. Isso não garante validade indefinida: sessões expiradas, revogadas ou alterações no serviço podem exigir novo token. Alterar ou apagar o campo do token elimina a sessão renovada em cache.

## Áudio e limitações

Suporta FLAC direto e playlists HLS FLAC/fMP4 sem encriptação, finitas e com segmentos HTTPS numerados consecutivamente. Para estas playlists, gera o manifesto DASH suportado pelo MySpoti; o áudio não é recodificado. Layouts incompatíveis e DRM são recusados.

Requer MySpoti 2.1.0 ou posterior e a funcionalidade `audio.manifest` para áudio segmentado. A qualidade real depende do stream devolvido pelo Eclipse.

**Estado experimental:** resolução e manifestos foram testados com a API real, incluindo FLAC 24 bits/96 kHz. Um ficheiro FLAC real foi remuxado e descodificado integralmente no PC. O utilizador confirmou reprodução Eclipse e transferência Connect nos dois sentidos no Android; download completo e seek no Android ainda não foram confirmados. Não há afiliação com Eclipse ou MySpoti.

## Spotify Connect: telefone e computador

Para evitar que o MySpoti volte a puxar a música do PC para o telefone:

1. Desliga **Contar reproduções de extensões no Spotify** nas definições do MySpoti.
2. Mantém **Retomar Eclipse ao voltar ao telefone (experimental)** ligado nas definições desta extensão.
3. Mantém Eclipse em primeiro nas fontes de reprodução.

A extensão observa o dispositivo remoto e só pede retoma pela fonte Eclipse quando confirma o telefone como dispositivo ativo. O utilizador confirmou o percurso telefone → PC → telefone; no regresso pode ouvir-se Spotify por breves segundos antes de Eclipse. A deteção depende dos eventos de reprodução e pode esperar pelo próximo progresso de 10 s; uma ida/volta muito rápida pode não ser detetada. Pausa, buffering ou dispositivo ambíguo não provocam retoma automática.

Esta funcionalidade não cria um espelho Spotify próprio nem garante contagem Spotify enquanto Eclipse toca. A atualização pede permissões de eventos de reprodução, consulta de dispositivos (`library.read`) e controlo de reprodução. Os campos de token e URL permanecem vazios no pacote público.

## Desenvolvimento e testes

Sem dependências JavaScript externas. Com Node.js instalado:

```sh
node --test tests/*.test.cjs
```

Com o runner oficial `myspoti-ext` disponível:

```sh
myspoti-ext check .
myspoti-ext test . --scenario tests/smoke.json
myspoti-ext test . --scenario tests/http403.json
myspoti-ext test . --scenario tests/edge-cases.json
myspoti-ext pack .
```

O runner é compilado a partir da pasta `base` do [MySpoti](https://github.com/kota-zo/myspoti) com `./gradlew :extensions-cli:installDist` (Windows: `gradlew.bat`). Os cenários são offline e usam credenciais fictícias.

Os logs reais do runner podem conter URLs assinados: mantém-nos privados.
