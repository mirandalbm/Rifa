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

## O que falta para publicar

1. Cadastro de desenvolvedor na adquirente (PagBank Smart POS, Stone DevCenter
   ou Cielo LIO) — é onde saem as credenciais de homologação.
2. O invólucro Android: uma Activity com WebView, a `@JavascriptInterface`
   acima e a dependência do SDK. É um projeto pequeno, mas é Android nativo —
   não dá para gerar daqui sem o SDK da adquirente em mãos.
3. Homologação e publicação na loja do terminal.

Enquanto isso não acontece, o cambista já pode operar hoje: cobra no aparelho
da adquirente pelo app dela e confirma a venda aqui. Fica tudo registrado
igual, só sem o NSU preenchido automaticamente.

## Fontes

- [PlugPagServiceWrapper (SDK Android da PagBank)](https://github.com/pagseguro/pagseguro-sdk-plugpagservicewrapper)
- [Smart POS — introdução, PagBank](https://developer.pagbank.com.br/v1/reference/smart-pos-introducao)
- [SDK Android da Stone](https://sdkandroid.stone.com.br/docs/o-que-e-a-sdk-android)
- [Dúvidas frequentes POS Android — Stone](https://sdkandroid.stone.com.br/page/pos-android)
- [Stone DevCenter](https://www.stone.com.br/devcenter)
