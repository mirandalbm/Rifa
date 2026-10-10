# Plano: gateway Pagar.me (Stone) — rascunho para aprovação (10/10/2026)

Decisão do dono (10/10/2026): o gateway provável é o **Pagar.me**, porque,
pela pesquisa dele, Asaas e Mercado Pago não aceitam rifa. Nada daqui está no
código. A documentação foi lida pelo pesquisador de integração em 10/10/2026
(Context7 com a cópia do `docs.pagar.me`, o SDK oficial no GitHub e trechos de
busca); daqui, os domínios do Pagar.me não abrem. O que não teve fonte oficial
está marcado **a confirmar**.

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
