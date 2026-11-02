# Eclipse FLAC Bridge para MySpoti

Extensão experimental para reprodução e download FLAC usando a tua conta Eclipse autorizada.

## Instalação

Descarrega `extension.zip` em Releases e instala-o em Extensões no MySpoti. Nas definições da extensão, preenche o **URL do addon Eclipse** (terminado em `/manifest.json`) e o **Token da conta Eclipse**. Coloca a extensão em primeiro nas fontes de reprodução e download.

O pacote distribuído tem os campos vazios. Nunca publiques tokens, URLs pessoais ou pacotes personalizados com credenciais. O login Google dentro do WebView não faz parte desta versão.

## Sessão

A extensão verifica a sessão no primeiro uso e depois diariamente quando usada. Guarda o token renovado devolvido pelo servidor. Nos testes, os tokens tinham validade de 30 dias e a API devolvia uma renovação por mais 30 dias. Isso não garante validade indefinida: sessões expiradas, revogadas ou alterações no serviço podem exigir novo token. Alterar ou apagar o campo do token elimina a sessão renovada em cache.

## Áudio e limitações

Suporta FLAC direto e playlists HLS FLAC/fMP4 sem encriptação, finitas e com segmentos HTTPS numerados consecutivamente. Para estas playlists, gera o manifesto DASH suportado pelo MySpoti; o áudio não é recodificado. Layouts incompatíveis e DRM são recusados.

Requer MySpoti 2.1.0 ou posterior e a funcionalidade `audio.manifest` para áudio segmentado. A qualidade real depende do stream devolvido pelo Eclipse.

**Estado experimental:** resolução e manifestos foram testados com a API real, incluindo FLAC 24 bits/96 kHz. Um ficheiro FLAC real foi remuxado e descodificado integralmente no PC. Reprodução, seek e download completos no MySpoti/Android ainda não foram confirmados. Não há afiliação com Eclipse ou MySpoti.

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
