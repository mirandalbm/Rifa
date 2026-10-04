# Maquininhas — o que dá e o que não dá

Resposta curta à pergunta "o app pode ser aceito nas maquininhas": **não do
jeito que ele é hoje, e nenhum app web pode.** As lojas de aplicativo da
PagBank, da Stone/Ton e da Cielo aceitam **APK Android**, não endereço de
site. O que resolve sem jogar fora o que já existe é um invólucro Android
fino que carrega este mesmo app numa WebView e conversa com o SDK da
adquirente. Um código só, uma tela só, e o cambista opera igual no celular
comum e na maquininha.

## O terreno

| Adquirente | Terminais | Hardware | Como entra o app de terceiro |
|---|---|---|---|
| **PagBank / PagSeguro** | Moderninha Smart, Smart 2, Moderninha X, PagTotem | PAX (linha A/D) | Loja de Aplicativos própria + SDK **PlugPagServiceWrapper** (pagamento e impressão livre). Android API 25–28 |
| **Stone / Ton** | Ton T3, T3 Smart, POS Android | PAX (T1 e Minizinha usam o D150) | **SDK Android** da Stone ou integração por **deeplink**, passando os dados do pagamento como parâmetro |
| **Cielo** | LIO | PAX/Ingenico | Loja LIO + SDK próprio — mesma forma das outras, a confirmar no cadastro |

Os três pontos que importam para nós:

1. **É Android de verdade.** O app roda no aparelho, sem computador ao lado.
2. **A impressora é do aparelho.** O SDK expõe impressão livre — é ali que o
   bilhete sai, e é por isso que `escPosTicket()` existe.
3. **O pagamento passa obrigatoriamente pelo SDK da adquirente.** Não há como
   um site cobrar no leitor de cartão do aparelho.

## O que foi construído aqui

O app já está preparado dos dois lados da ponte:

- **Sem maquininha** (navegador comum, celular do cambista): a tela de venda
  funciona inteira, o pagamento é registrado como dinheiro ou Pix, e o
  bilhete sai pela impressão do navegador — a folha já vem no tamanho de
  bobina de 58 mm.
- **Com maquininha**: se o invólucro injetar `window.RifaPOS`, a mesma tela
  passa a cobrar no cartão pelo SDK e a imprimir na bobina do aparelho.

Nada na tela muda de lugar entre um caso e outro. `client/src/lib/pos.ts`
detecta a ponte e decide.

## O contrato do invólucro

O invólucro Android precisa injetar um objeto `RifaPOS` na WebView:

```ts
interface PosBridge {
  readonly version: string;      // "1.0"
  readonly terminal: string;     // "Moderninha Smart 2", "Ton T3", ...
  readonly hasPrinter: boolean;

  pay(request: {
    amountCents: number;
    orderCode: number;
    method: "credito" | "debito" | "pix";
    installments?: number;
  }): Promise<{
    ok: boolean;
    authCode?: string;   // NSU / autorização
    terminal?: string;
    message?: string;    // motivo da recusa, para mostrar ao cambista
  }>;

  print(text: string): Promise<void>;  // texto puro, 32 colunas
}
```

Do lado Android, com `@JavascriptInterface`, cada método vira uma chamada ao
SDK: `pay` chama o PlugPag (PagBank) ou a SDK/deeplink da Stone; `print`
manda o texto para a impressora do aparelho.

O texto do bilhete o invólucro nem precisa montar: ele busca em
`GET /api/public/tickets/:code/escpos`, que já devolve pronto em 32 colunas,
sem acento e sem espaço não-quebrável — duas coisas que a bobina imprime como
lixo.

## A ordem das operações (não inverter)

```
1. POST /api/seller/sales            → reserva as cotas, devolve o total
2. RifaPOS.pay(...)                  → cobra no cartão
3. POST /api/seller/sales/:code/confirm  → registra pago + NSU
4. RifaPOS.print(...)                → bilhete na bobina
   se (2) recusar → POST .../cancel  → devolve as cotas na hora
```

A reserva vem **antes** da cobrança de propósito. Cobrar primeiro e descobrir
depois que o número acabou de ser vendido é o pior desfecho possível: dinheiro
debitado e nada para entregar.

## O invólucro já existe

O projeto Android está em [`android/`](../android/README.md), com um sabor de
build por adquirente:

- **`generico`** — compila sem SDK nenhuma e roda em celular comum ou
  emulador. A ponte existe e responde que não há maquininha, então a tela do
  cambista segue vendendo em dinheiro e Pix. Serve para testar o invólucro
  inteiro antes de ter credencial.
- **`pagbank`** — `TerminalPlugPag.kt` escrito com as chamadas da SDK pública,
  incluindo o desenho do bilhete em bitmap de 384 px, porque a impressão livre
  do PlugPag imprime imagem e não texto.
- **`ton`** — **por deeplink**, sem a SDK da Stone (compila sem credencial):
  `TerminalStone.kt` abre o app de pagamento da Stone (`payment-app://pay`) e
  o de impressão (`printer-app://print`) que já vêm no POS Android, e recebe a
  resposta por deeplink de volta na `MainActivity` (`singleTask`,
  `RetornoDeApp`). Os esquemas de volta estão no `AndroidManifest.xml` do
  sabor. **Nunca compilado no Android nem testado numa maquininha**: o
  `android/teste-sem-sdk/rodar.sh` (`npm run stone`) compila o sabor contra
  classes mínimas do Android e confere a montagem dos deeplinks e a leitura
  das respostas contra um app da Stone de mentira — o resto é a venda de
  teste (abaixo, "Stone por deeplink").

```bash
cd android
./gradlew assembleGenericoDebug -Prifa.appUrl=http://10.0.2.2:5000
```

## O que falta para publicar

1. Cadastro de desenvolvedor na adquirente (PagBank Smart POS, Stone DevCenter
   ou Cielo LIO) — é onde saem as credenciais de homologação.
2. Acrescentar a dependência da SDK em `android/app/build.gradle.kts` (o bloco
   já está lá, comentado) e montar o sabor correspondente.
3. Homologação e publicação na loja do terminal.

Enquanto isso não acontece, o cambista já pode operar hoje: cobra no aparelho
da adquirente pelo app dela e confirma a venda aqui. Fica tudo registrado
igual, só sem o NSU preenchido automaticamente.

## Stone por deeplink — o que conferir na primeira venda de teste

O protocolo saiu da documentação de deeplink do POS Android da Stone e de um
plugin aberto que já o usa no aparelho; nada disso rodou numa Ton ainda.
Na primeira venda de teste, numa T3 Smart com a conta de homologação:

1. `./gradlew assembleTonDebug` compila (o sabor não depende da SDK).
2. Crédito à vista, débito, Pix e crédito parcelado: o app da Stone abre com
   o valor certo (em centavos) e **não deixa editar**; aprovado, a tela do
   cambista recebe o ATK como autorização.
3. Cartão recusado: a mensagem da Stone aparece para o cambista (é
   resultado, não exceção).
4. O bilhete sai na bobina, uma linha por linha, e "sem papel" aparece em
   português.
5. Deixar a tela de pagamento da Stone aberta sem pagar: em 115 s a ponte
   desiste com "Confira na Stone se a venda foi aprovada antes de cobrar de
   novo" — **é o caso de cobrança dobrada**: confira na Stone antes de
   repetir. Se a Stone demorar mais que isso de verdade, suba os prazos do
   shim e de `TerminalStone` juntos.

Se algum nome de parâmetro estiver diferente na versão do app da Stone do
aparelho, o ajuste é só em `TerminalStone.kt` (e no teste sem SDK).

## Fontes

- [PlugPagServiceWrapper (SDK Android da PagBank)](https://github.com/pagseguro/pagseguro-sdk-plugpagservicewrapper)
- [Smart POS — introdução, PagBank](https://developer.pagbank.com.br/v1/reference/smart-pos-introducao)
- [SDK Android da Stone](https://sdkandroid.stone.com.br/docs/o-que-e-a-sdk-android)
- [Dúvidas frequentes POS Android — Stone](https://sdkandroid.stone.com.br/page/pos-android)
- [Stone DevCenter](https://www.stone.com.br/devcenter)
- [Deeplink do POS Android — Stone](https://sdkandroid.stone.com.br/page/deeplink) e [Pagamento por deeplink](https://sdkandroid.stone.com.br/reference/pagamento-deeplink)
- [flutter_stone_payment](https://github.com/Luiz-Carlos-de-Lima/flutter_stone_payment) — plugin aberto que usa os mesmos deeplinks (nomes das respostas e da impressão)
