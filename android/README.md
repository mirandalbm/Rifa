# rifa-pos — invólucro Android para maquininha

Este projeto existe por um motivo só: as lojas de aplicativo das maquininhas
(PagBank Smart POS, Stone/Ton, Cielo LIO) aceitam **APK Android**, não
endereço de site. O invólucro carrega o app web da rifa numa WebView e liga
os dois recursos que só o aparelho tem: **cobrar no cartão** e **imprimir na
bobina**.

Nenhuma regra de negócio mora aqui. Preço, cota, comissão e bilhete continuam
no servidor; este projeto é uma ponte de menos de 400 linhas.

## Como está organizado

```
app/src/main/                  o que vale para todo aparelho
  MainActivity.kt              a WebView e a injeção da ponte
  PosBridge.kt                 a @JavascriptInterface que o site enxerga
  Terminal.kt                  o contrato que cada adquirente implementa
  assets/rifa-pos-shim.js      transforma a ponte síncrona em Promise

app/src/generico/              sem SDK — roda em celular comum e emulador
app/src/pagbank/               PlugPag (Moderninha Smart, Smart 2, X, PagTotem)
app/src/ton/                   Stone / Ton POS Android
```

O sabor é escolhido na hora de montar o APK, e cada um traz a própria função
`criarTerminal()`. O resto do código não sabe qual está rodando.

## Rodar agora, sem SDK nenhuma

```bash
./gradlew assembleGenericoDebug -Prifa.appUrl=http://10.0.2.2:5000
```

O sabor `generico` compila sem dependência de adquirente. A ponte existe e
responde honestamente que não há maquininha: a tela do cambista esconde o
botão de cartão e segue vendendo em dinheiro e Pix. Serve para testar o
invólucro inteiro antes de ter qualquer credencial.

`10.0.2.2` é como o emulador enxerga o `localhost` da máquina.

## Ligar uma adquirente

1. Faça o cadastro de desenvolvedor (PagBank Smart POS, Stone DevCenter ou
   Cielo LIO) e baixe a SDK.
2. Acrescente a dependência em `app/build.gradle.kts`, no bloco já comentado.
3. Acrescente o repositório Maven da adquirente em `settings.gradle.kts`.
4. Monte o sabor: `./gradlew assemblePagbankRelease -Prifa.appUrl=https://seu.dominio`.

O arquivo do sabor **não compila sem a SDK** — e isso é de propósito. Erro na
hora de compilar é melhor do que um APK que instala, abre e falha no balcão.

### PagBank

`TerminalPlugPag.kt` está escrito com as chamadas da SDK pública. Confirme os
nomes das constantes contra a versão que você baixar.

Um detalhe que pega quem integra: a impressão livre do PlugPag imprime
**imagem**, não texto. O bilhete de 32 colunas que vem do servidor é
desenhado num bitmap de 384 px (bobina de 58 mm a 203 dpi) antes de ir para a
impressora — isso já está pronto no arquivo.

### Stone / Ton

`TerminalStone.kt` tem a estrutura pronta e **dois pontos de encaixe
marcados**, sem nomes de classe preenchidos. Foi decisão consciente: a API
muda entre versões, e método plausível que compila e falha no balcão é pior
do que método ausente que falha ao compilar. Copie as chamadas da
documentação da versão que você baixar; a estrutura em volta — thread,
tratamento de recusa, formato do resultado — já está pronta e é a mesma.

A impressão da Stone aceita texto direto, sem precisar virar imagem.

## O contrato da ponte

O site conversa com `window.RifaPOS`, definido em
[`client/src/lib/pos.ts`](../client/src/lib/pos.ts). O shim
(`assets/rifa-pos-shim.js`) é quem transforma a interface síncrona do Android
nesse contrato de Promise.

Os dois lados são testados juntos em `tests/posShim.test.ts`, com um lado
nativo de mentira: se o contrato mudar de um lado só, o teste quebra.

Três garantias que o shim oferece e que valem conhecer:

- **Toda chamada tem prazo** — 2 minutos para cobrança, 30 segundos para
  impressão. Sem isso, uma falha do lado nativo deixaria a Promise pendurada
  e o cambista olhando um botão morto.
- **Recusa é resultado, não exceção.** `pay()` resolve com
  `{ ok: false, message }` para o cambista ler o motivo e decidir na hora.
- **Impressão falha alto.** `print()` rejeita: papel que não saiu precisa
  aparecer para quem está com o apostador na frente.

## Publicar

Cada adquirente tem o próprio processo de homologação e a própria loja. O
APK é o mesmo em forma; o que muda é o sabor e a assinatura. Os caminhos e os
requisitos de cada uma estão em [`../docs/MAQUININHAS.md`](../docs/MAQUININHAS.md).
