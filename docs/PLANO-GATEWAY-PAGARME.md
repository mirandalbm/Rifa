# Plano: gateway Pagar.me (Stone) — rascunho para aprovação (10/10/2026)

Decisão do dono (10/10/2026): o gateway provável é o **Pagar.me**, porque,
pela pesquisa dele, Asaas e Mercado Pago não aceitam rifa. **A fase 1 (o
provedor, sem split) está no código desde 12/10/2026** — seção 6; o resto
daqui ainda não. A documentação foi lida pelo pesquisador de integração em 10/10/2026
(Context7 com a cópia do `docs.pagar.me`, o SDK oficial no GitHub e trechos de
busca); daqui, os domínios do Pagar.me não abrem. O que não teve fonte oficial
está marcado **a confirmar**.

## 0. Decisões de 12/10/2026 (o dono, com o advogado e o contador)

- **Sem split, sempre.** A plataforma recebe o Pix inteiro e repassa a
  parte de cada promotora. O advogado e o contador disseram ao dono que,
  mesmo com a conta recebendo tudo, a documentação mostra que é dinheiro de
  repasse (valor a repassar, não receita). Sem split, somem o contrato PSP,
  o recebedor por promotora e a prova de vida (a antiga fase 2).
- **O repasse é liberado depois do sorteio**, como a carência da comissão:
  o arrependimento fecha 2 h antes do sorteio, e depois dele sobra o risco
  de MED e de contestação.
- **O repasse é pago por Pix manual com baixa e comprovante**, com recibo,
  como o saque do afiliado. Transferência automática pela API fica para
  depois, se o Pagar.me fizer.
- **Em aberto, antes de construir o repasse**: o parecer de 07/10 (item 1.2
  de `docs/PENDENCIAS.md`) concluiu que a plataforma **não é
  subcredenciadora** (Resolução BCB 150/2021, art. 2º, V) *porque* o
  provedor recebia e dividia o Pix, e a plataforma não liquidava para
  recebedores. Sem split, a plataforma liquida para as promotoras. O
  advogado precisa confirmar por escrito que a conclusão continua valendo
  (ou o que muda), além da parte fiscal. A decisão B3 de
  `docs/FECHAMENTO-JURIDICO-CONTABIL.md` ("a plataforma nunca segura
  dinheiro de rifa") deixa de valer se ele confirmar.
- **Efeito no sistema** (quando o repasse entrar): a taxa da venda online
  fica sempre retida (como hoje com `taxa_retida_no_split`), a notificação
  de falta de pagamento passa a valer só para o cambista, a retenção
  cautelar alcança o dinheiro das vendas, e o MED e a contestação saem do
  saldo a repassar da promotora.

## 1. O que a documentação confirma

| Assunto | O que vale | Efeito no sistema |
|---|---|---|
| Pedido Pix | `POST /orders` em `https://api.pagar.me/core/v5`, autenticação Basic com a chave secreta, valores em centavos | Provedor novo `server/payments/pagarme.ts` |
| Cliente do Pix | **nome, e-mail, documento e telefone obrigatórios** | O e-mail do comprador, hoje opcional, passa a ser exigido no Pix online, **antes de reservar** (como o CPF) |
| Validade do QR | por segundos (`expires_in`) ou instante (`expires_at`) | O QR vence junto com a reserva (no Asaas valia o dia todo) |
| Divisão do Pix (split) | **só para cliente "PSP"** e, no Pix, com "afiliação Pagar.me"; cada regra tem recebedor, valor `flat` (centavos, inteiro) ou percentual inteiro, e as opções de quem responde por contestação (`liable`), quem paga a tarifa (`charge_processing_fee`) e quem fica com a sobra (`charge_remainder_fee`); **a plataforma também entra como recebedor**; vários recebedores num Pix só | Split em **centavos exatos** de `splitOrder()`: fecha a invariante 12 melhor que o percentual do Asaas; o carrinho deixa de fazer média de percentuais |
| Recebedor da promotora | `POST /recipients` com os dados da empresa (ou da pessoa), **um representante legal** (CPF, nome da mãe, nascimento, renda, ocupação, endereço), conta bancária e transferência automática; nasce em `registration` (vende, não saca), passa pela **prova de vida** (link com QR) e termina em `active` ou `refused` | Tela nova de cadastro do recebedor (área "Dinheiro"), com a situação e o link da prova de vida |
| Quando o dinheiro chega | o Pix cai **no mesmo dia** no saldo do recebedor; os "14 dias" não aparecem em nenhuma fonte do Pagar.me | Nada a mudar |
| Estorno | `DELETE /charges/{id}`, total ou **parcial**, até **90 dias** da conciliação, e exige saldo disponível; a tarifa do Pix **não volta** (a confirmar) | Devolução parcial do "paga na hora" e da fila do Pix que chegou tarde com teto de 90 dias; depois disso, por transferência |
| Cancelar Pix não pago | **a mesma rota do estorno** | Risco: cancelar a reserva vencida logo depois do pagamento viraria estorno. O QR passa a vencer com a reserva e o relógio só cancela depois de ler a cobrança como pendente |
| Webhook | eventos `charge.paid`, `charge.refunded`, `charge.partial_canceled`, `order.*`, `recipient.updated`, `chargeback.received`; id `hook_…`; **a autenticação não está documentada** | O status vem sempre da consulta à API (regra de hoje), com segredo no endereço do webhook e a assinatura assimétrica, se vier |

## 2. Fases (cada uma é um PR, com o revisor de invariantes)

Reordenadas em 12/10/2026 pela decisão "sem split": a fase 1 segue (sem as
regras de split), a 2 (recebedor da promotora) sai, e o **repasse à
promotora** entra no lugar dela, depois da resposta do advogado (seção 0).
A lista abaixo é a de 10/10, para registro.

1. **Provedor Pagar.me**:
   - o Pix com split em centavos (promotora, plataforma e, com a guarda ligada, a comissão do lado da plataforma);
   - a sobra para a promotora;
   - o webhook confirmado pela API;
   - estorno parcial com chave de idempotência;
   - o cancelamento só da cobrança pendente;
   - o e-mail do comprador obrigatório no Pix online.

   Provado contra um Pagar.me de mentira, como o Meta e o Windsor.
2. **Recebedor da promotora**:
   - cadastro, situação e prova de vida;
   - só vende online com o recebedor `active` (decisão B3); sem ele, só pelo cambista.
3. **Fim do saldo pré-pago** (decisão B1): anúncio patrocinado, banner e taxa do tráfego com Pix próprio, e a sobra devolvida.
4. **Textos**:
   - Privacidade e Termos: o Pagar.me/Stone como quem processa o pagamento, e os dados do representante legal da promotora;
   - o CLAUDE.md: provedor, rateio e carrinho;
   - o mesmo PR que muda a regra.
5. **Asaas e Mercado Pago**: saem do código depois do Pagar.me em produção.

## 3. Por escrito, antes do código (comercial do Pagar.me)

1. Aceitam **promoção comercial com autorização SPA/MF** (rifa autorizada)?
   Qual MCC?
2. Contrato **PSP com split no Pix** e a afiliação.
3. **Quem responde** por contestação e por devolução por golpe (MED) quando o
   Pix é dividido: o recebedor `liable`, proporcional, ou a conta principal?
4. Como o **estorno parcial** se divide entre os recebedores, e o que acontece
   quando o recebedor já sacou.
5. **Tarifa** do Pix, e se ela volta em algum estorno.
6. **Autenticação do webhook** do painel (assinatura assimétrica? usuário e
   senha?).
7. Validade mínima do QR, prazo de aprovação da prova de vida e a
   idempotência (quanto tempo vale a chave).

## 4. Achado que pede uma conferência sua

Pela busca, a central de ajuda do **Asaas** põe **loterias como "uso
restrito"** (empresa, com documentos), e não como proibidas. Isso contradiz a
pesquisa anterior. Vale perguntar por escrito também ao Asaas: o código dele
já está pronto. O **Mercado Pago** proíbe rifas, pela citação de terceiros.

## 5. Decisões que ficam para depois das respostas do item 3

- Quem é `liable` (responde por contestação e MED): a promotora, a plataforma ou as duas, pelo que o Pagar.me responder.
- O que fazer com o dinheiro de recebedor recusado depois de vender.

Até lá, a recomendação é não mandar a parte da promotora no split com o recebedor fora de `active`.

## 6. Fase 1 feita (12/10/2026): o provedor, sem split

No código: `server/payments/pagarme.ts` (`PagarmeProvider`, registrado em
`server/payments/index.ts` e em `shared/plataforma.ts` — `PROVEDORES_PIX`,
`NOME_PROVEDOR`, `CREDENCIAIS_PROVEDOR` com `PAGARME_SECRET_KEY` e
`PAGARME_WEBHOOK_TOKEN`, `EXIGE_CPF` e o novo `EXIGE_EMAIL`).

- **Pix**: `POST /orders` (Basic com a chave secreta, centavos), um item com
  o total, o cliente com nome, e-mail, CPF ou CNPJ e o celular
  (`phones.mobile_phone`), o pagamento Pix com `expires_at` = o vencimento da
  reserva e o código do pedido no `code` e no `metadata`. **Nunca `split`**: o
  parâmetro é ignorado e o Pix nunca diz `splitAplicado` (a taxa segue devida
  no livro; o repasse é outra fase). O pedido guarda o id da **cobrança**
  (`ch_…`). O QR é desenhado no nosso servidor a partir do copia e cola
  (`qrcode`), sem depender do `qr_code_url` de lá.
- **Webhook**: `/api/webhooks/pagarme?t=<PAGARME_WEBHOOK_TOKEN>`, o segredo
  comparado em tempo constante (sem ele ou errado, **401**). O status vem
  sempre de `GET /charges/{id}`: `charge.paid`/`charge.overpaid` só pagam com
  a cobrança `paid` ou `overpaid` (pendente na API: **503 com
  `Retry-After`**, para o Pagar.me tentar de novo — nada pago); `underpaid`
  vai ao log e é ignorado; `charge.refunded` só estorna com a cobrança
  estornada inteira (com `canceled_amount` cobrindo o pago — sem o valor,
  nada); `charge.chargedback` com a API dizendo `chargedback` e o
  contestado cobrindo o pago vira estorno (MED e contestação são
  registrados sempre; a parcial vai ao log e é ignorada); a consulta fora do
  ar (rede, prazo, 5xx) também é 503 com `Retry-After`; o resto (inclusive
  `charge.partial_canceled`) é ignorado. A chave da idempotência é o id do
  evento (`hook_…`), e `webhook_events` guarda só `{ id, type, data: { id } }`
  — o `data` de lá traz o cliente.
- **Estorno**: `DELETE /charges/{id}`, total sem corpo e parcial com
  `{ amount }` em centavos, com a chave `estorno-<cobrança>-<quem>-<valor>`.
  O parcial lê o `canceled_amount` antes e o da resposta: devolveu outro
  valor (ou tudo), é erro e nada é desfeito aqui. O erro de depois de
  chamar (sem resposta, 5xx, valor que não confere) não volta o chamado a
  aprovado: ele fica estornado, marcado `conferir_no_provedor`, sem nova
  devolução, até alguém conferir no painel do Pagar.me. O par consulta →
  `DELETE` corre com a cobrança travada (trava de sessão no
  `poolDasTravas`).
- **Cancelamento da reserva vencida**: consulta a cobrança e só cancela a
  `pending`; a paga fica como está e volta `"paga"` — o relógio
  (`expirarReservas()`) a anota (`cobrancas_pagas_a_conferir` em
  `app_settings`) e leva o pedido vencido à fila do Pix tardio, mesmo sem o
  webhook; a anotação só sai com o Pix na fila (o banco que falhar no meio
  tem a volta seguinte).
- **Quem paga, antes de reservar**: o e-mail (até 64 letras, nunca cortado)
  e o telefone no formato do Pagar.me, no pedido, no carrinho, na recarga e
  no Pix do assistente (sem WhatsApp no acesso, o telefone aprovado da
  organização); a recarga recusada pelo provedor não fica órfã.
- **E-mail obrigatório** com o Pagar.me: conferido no servidor antes de
  reservar (pedido e carrinho) e antes de gravar (recarga do patrocínio e Pix
  do assistente, com o e-mail do acesso). A tela de compra (página da rifa e
  carrinho) pede o e-mail só quando o provedor exige; a conta com e-mail não
  digita.
- **Prova**: `npm run pagarme` (Pagar.me de mentira na porta 5095) e
  `tests/pagarme.test.ts`.

**A confirmar** com o Pagar.me (sem fonte oficial na documentação lida pelo
Context7 em 12/10/2026 — conferir no ambiente de teste antes de escolher o
provedor no painel):

1. O formato do corpo do webhook (`id` `hook_…`, `type`, a cobrança em
   `data`) — a documentação traz a lista de eventos, não um exemplo do corpo.
2. Os nomes na resposta do Pix: `charges[].last_transaction.qr_code` e
   `expires_at`; e a lista de status da **cobrança** (`pending`, `paid`,
   `canceled`, `refunded`…) — a documentação lida traz os status da
   *transação* Pix (`waiting_payment`, `paid`, `pending_refund`, `refunded`).
3. O status da cobrança Pix paga depois do estorno total (`refunded` ou
   `canceled`) e se `canceled_amount` vem preenchido; e se o estorno total
   depois de um parcial devolve só o que restava.
4. O campo `amount` no corpo do `DELETE /charges/{id}` para o estorno
   parcial (a documentação diz que pode ser parcial, mas o exemplo não veio).
5. O nome do cabeçalho de idempotência do v5 (usamos `Idempotency-Key`) e
   por quanto tempo a chave vale.
6. O formato e o **fuso** do `expires_at` (a documentação mostra
   `YYYY-MM-DDThh:mm:ss`, UTC, sem o `Z`; mandamos assim). Conferir no
   primeiro Pix de teste: se o Pagar.me ler sem o `Z` como Brasília, o QR
   vive **3 h a mais que a reserva** (e o Pix pago nesse tempo vai para a
   fila do Pix tardio). Se a documentação disser que aceita o `Z`, mandar com
   ele.
7. `phones.mobile_phone` (o exemplo do Pix usa `home_phone`) e o tamanho
   máximo de `code`, `name` e `email` (o e-mail acima de 64 é recusado antes
   de reservar: `EMAIL_MAX_DO_PAGARME`).
8. Se o Pagar.me reenvia o webhook quando a resposta não é 2xx, e por quanto
   tempo — a recusa do "pago com a cobrança pendente" depende disso.
9. A autenticação do webhook (seção 3, item 6): se vier assinatura, ela
   entra junto com o segredo do endereço.
10. A contestação: o nome do evento (`charge.chargedback`, que a
    documentação diz dar lugar a `chargeback.received`, cujo corpo traz a
    contestação e não a cobrança), o status `chargedback` da cobrança e em
    que campo vem o valor contestado (usamos `canceled_amount`; sem ele, a
    contestação é ignorada e vai ao log).
11. `overpaid` e `underpaid` numa cobrança Pix (o valor é fixo no QR): o
    `overpaid` paga, o `underpaid` vai ao log (`[pagarme]`) e espera a
    devolução à mão.
12. A resposta do `DELETE` (o `canceled_amount` e o `last_transaction.amount`
    da devolução), que o estorno parcial confere.
