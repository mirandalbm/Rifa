# Notas para quem for mexer aqui

## O que este projeto é

Plataforma multi-rifas: várias campanhas no ar ao mesmo tempo sob um
administrador geral. Um app, três superfícies separadas por papel de sessão.
O plano completo está em `docs/PLANO-RIFA.md` — leia antes de mudar
arquitetura.

## Invariantes (quebrar qualquer uma destas é bug grave)

1. **Cota é vendida uma vez só.** A exclusividade é a PK `(campaign_id, number)`.
   Reserva é `INSERT … ON CONFLICT DO NOTHING`. Nunca consultar disponibilidade
   numa query e gravar em outra.
2. **Nunca materializar cota.** Campanha de 1M nasce com zero linhas em
   `quota_alloc`. Se você se pegar escrevendo `generate_series` fora do
   `enterEndgame`, pare.
3. **Nunca `COUNT(*)` para progresso.** Use `campaign_stats`, atualizado na
   mesma transação da alocação.
4. **Dinheiro é inteiro, em centavos.** O front nunca envia preço: envia
   campanha e quantidade. O total é recalculado em `services/orders.ts`.
5. **Webhook é idempotente.** Chave `(provider, external_id)` em
   `webhook_events`. Assinatura validada no provedor; o redirect do navegador
   não vale como prova de pagamento.
6. **O total de cotas trava ao publicar.** `assertEditable()` em
   `services/campaigns.ts`. Mudar depois alteraria a chance de quem já comprou.
7. **Comissão tem carência.** Nasce `pending`, vira `available` só depois da
   janela de estorno e do sorteio. Autoindicação é bloqueada por telefone.
8. **A autorização SPA/MF é da campanha.** Sem `authorizationCode` a campanha
   não publica. A plataforma não é homologada em bloco — a Lei 5.768/71
   autoriza o promotor.

## Onde mexer

| Quero… | Vá em |
|---|---|
| mudar quem acessa o quê | `shared/access.ts` (cliente e servidor leem daqui) |
| mexer em reserva/alocação | `server/services/quotas.ts` |
| mexer no fluxo do pedido | `server/services/orders.ts` |
| trocar o provedor de pagamento | `server/payments/` — implemente `PaymentProvider` |
| regras de publicação e mídia | `server/services/campaigns.ts`, `server/routes/admin.ts` |
| sorteio | `server/services/draw.ts` |
| segundo fator | `server/services/totp.ts` |
| variantes de imagem | `server/services/images.ts` |
| mensagens e modelos | `server/notifications/` |
| cotas premiadas | `server/routes/admin.ts` (sorteio) e `services/orders.ts` (revelação) |
| cadastro/cupom/kit do afiliado | `server/routes/public.ts`, `server/routes/affiliate.ts` |
| venda física e acerto | `server/routes/seller.ts`, `server/services/settlements.ts` |
| meios de pagamento aceitos | `shared/payments.ts` (regras) e `services/settings.ts` |
| bilhete | `server/services/ticketFormat.ts` (puro) e `ticket.ts` (dados) |
| ponte com a maquininha | `client/src/lib/pos.ts` e `docs/MAQUININHAS.md` |

## Convenções

- Português nos textos de interface, mensagens de erro e comentários.
- Todo número que o usuário lê (cota, real, prazo, percentual) usa a classe
  `tnum` — DM Mono com algarismo tabular.
- Estado nunca é comunicado só por cor: use `<Pill>`, que traz rótulo em texto.
- Paleta: branco de fundo; verde = dinheiro que entrou; amarelo = espera e
  prêmio; vermelho = erro. Cor sem significado é ruído.

## O que ainda não existe

- Pôster extraído do vídeo e transcode: hoje servimos o arquivo original. A
  medição e os limites já existem; falta o processamento. Cloudflare Stream
  resolve os dois de fábrica.
- Fila (BullMQ): os três relógios rodam com `setInterval` no processo,
  protegidos por trava de aplicação do Postgres — com várias réplicas só uma
  executa. Serve bem; a fila entra quando houver trabalho pesado de verdade.
- Fase 4 inteira: teste de carga com 1M de cotas, antifraude, exportações,
  multi-organizador.
- O invólucro Android das maquininhas: o app já fala com `window.RifaPOS`,
  mas o APK que injeta essa ponte é projeto Android nativo e depende do SDK
  da adquirente. Ver `docs/MAQUININHAS.md`.

## Meios de pagamento — o que não pode afrouxar

- As regras moram em `shared/payments.ts`, puras, porque quem valida é o
  servidor e quem exibe o botão é o cliente. Duas cópias viram duas regras
  diferentes na primeira mudança.
- A checagem é **no servidor**: esconder o botão é cortesia. `createOrder`
  barra a venda online sem Pix e `confirmSellerSale` barra o meio desligado.
- Pelo menos um meio precisa sobrar ligado. Nenhum ligado é uma rifa que não
  vende — e a tela não denunciaria isso.
- `validatePaymentMethods` só aceita as chaves conhecidas: isto vem do corpo
  da requisição e espalhar o objeto cru guardaria qualquer coisa.

## Venda física — o que não pode afrouxar

- **Reservar antes de cobrar.** Nunca inverter: cartão aprovado com a cota já
  vendida é dinheiro debitado sem nada para entregar. Cobrança recusada chama
  `/cancel`, que devolve as cotas na hora.
- A venda do cambista usa o **mesmo** caminho de reserva das vendas online
  (`INSERT … ON CONFLICT`). Não existe atalho para venda física.
- Fechar acerto **carimba** os pedidos (`orders.settlement_id`). Sem o carimbo,
  a mesma venda entra em dois acertos.
- O cambista deve à casa; o afiliado recebe dela. Direções opostas, mesma
  máquina de comissão.

## Bilhete — o que não pode afrouxar

- A formatação vive em `ticketFormat.ts`, sem banco, porque é o que os testes
  exercitam: 32 colunas, total alinhado à direita, sem acento e sem espaço
  não-quebrável.
- Se mudar o layout, rode `tests/ticket.test.ts`: linha larga demais estoura
  na bobina e só se descobre na hora de imprimir.

## Mensagens — o que não pode afrouxar

- Todo envio precisa de `dedupeKey`. Sem ela, o job de lembrete manda a mesma
  mensagem a cada minuto.
- Falha de envio **nunca** propaga para o fluxo de pagamento: a venda já
  aconteceu. Registre e siga.
- O número da cota premiada não sai em endpoint público. Só na revelação, para
  quem comprou.

## Mídia — o que não pode afrouxar

A duração do vídeo e as dimensões da imagem são medidas em
`server/services/probe.ts`, lendo o arquivo já armazenado. **Nunca** aceite o
valor vindo do cliente: o limite de 60 s é promessa de tela e forjar um campo
JSON é trivial. Se for aceitar um container novo (WebM, por exemplo), implemente
a medição junto — sem medir, não entra na lista de mimes.
