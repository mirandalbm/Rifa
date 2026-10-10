# Decisões de cobrança e meios de pagamento (10/10/2026)

Origem: decisões do dono em resposta às perguntas de 10/10/2026. Registro do
que foi decidido e de como entrou no código. Não é contrato: o texto legal sai
depois, como versão nova (Termos, regulamento, contrato da promotora).

## Decisões do dono

| # | Decisão | Como entrou no código |
|---|---|---|
| D1 | Valor fixo por cota comprada, cobrado do organizador | Modo `por_cota` em `shared/cobranca.ts` |
| D2 | Percentual por venda continua; o valor é ajustado pelo admin master | Modo `percentual`; a tabela é do master (`PUT /admin/cobranca/tabela`) |
| D3 | Taxa de transação Pix em percentual, por faixas de volume (quanto mais transação, menor a taxa), definida pelo admin master | `faixasPix` na tabela; a faixa é fotografada no pedido |
| D4 | Sem cartão de crédito nem de débito: só Pix | `cartao_maquininha` saiu das regras (`shared/payments.ts`), do cambista, do bilhete e da exportação |
| D5 | Organizações atuais são de teste; serão resetadas antes da publicação | Sem migração: o `db:push` apaga as colunas da mensalidade |
| D6 | A taxa Pix é descontada do organizador, não do comprador | Entra no rateio: a plataforma sai antes (invariante 12) |
| P1 | O organizador escolhe como quer ser cobrado **em cada sorteio** | `campaigns.cobranca_modo` no rascunho, trava ao publicar; a publicação fotografa a tabela (`campaigns.cobranca`) |
| P2 | Não há mensalidade: só percentual ou por cota | Mensalidade removida (contrato, relógio, rotas, tela); invariante 13 reescrita |
| P3 | Volume = transações Pix pagas da organização no mês de São Paulo, contador atômico, faixa fixada na criação do pedido | `pix_volume_mensal` (`INSERT … ON CONFLICT DO UPDATE` na transação do pagamento) e `taxaDoPedido()` |
| P4 | Taxa por cota nunca igual ou maior que o preço da cota | `problemaNaCobranca()` barra a publicação |
| P5 | Dinheiro com o cambista continua aceito (o "só Pix" vale para cartão) | Nada muda: o meio segue ligável em Configurações |
| P6 | No carrinho, cada pedido conta uma transação Pix no volume do mês da organização | Como está (`pix_volume_mensal` por pedido) |
| P7 | Textos legais: pedido detalhado ao advogado | `docs/PEDIDO-ADVOGADO-COBRANCA.md` |

## Como fica a conta de um pedido

1. A taxa da venda: percentual sobre o pago (no presente, a soma do comprador
   e da plataforma) **ou** valor por cota × cotas.
2. A taxa Pix: a faixa do mês sobre o que entrou pelo Pix do site. Dinheiro e
   Pix na maquininha do cambista não pagam taxa Pix.
3. As duas arredondam para baixo, nunca passam do pago e saem antes da
   comissão (`splitOrder()` com `taxas`). O centavo fica com a organização.
4. O split do Asaas recebe o percentual equivalente, para cima em 4 casas
   (`pctEquivalente()`).
5. O lançamento em `platform_charges` é uma linha por pedido, com a venda e o
   Pix separados (`vendaCents`, `pixCents`).

## O que ficou de fora

- **Textos legais** (Termos, regulamento, contrato da promotora, termo do
  afiliado): pedido ao advogado em `docs/PEDIDO-ADVOGADO-COBRANCA.md`.
- **Simulação contábil** das duas receitas (taxa da venda e taxa Pix): com o
  contador.
- **A ponte com a maquininha** (`client/src/lib/pos.ts`, o shim do Android)
  segue sabendo cobrar cartão — é o contrato da ponte, provado por
  `tests/posShim.test.ts` —, mas nenhuma tela a chama para cartão.
