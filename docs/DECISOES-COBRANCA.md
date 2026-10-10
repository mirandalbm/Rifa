# Decisões de cobrança e meios de pagamento (10/10/2026)

Origem: decisões do dono em resposta às perguntas de 10/10/2026. Documento de
trabalho para a PR de cobrança. Não é contrato: o texto legal sai depois, como
versão nova (Termos, regulamento, contrato da promotora).

## Decisões do dono

| # | Decisão | Consequência no código |
|---|---|---|
| D1 | Taxa fixa por cota comprada (valor fixo por cota, cobrado do organizador) | Novo modo de cobrança, além de mensalidade e percentual |
| D2 | Percentual por venda continua, e o valor é ajustado pelo admin master | `platformFeePct` já existe; o ajuste fica só no painel da plataforma |
| D3 | Taxa de transação Pix em percentual, por faixas de volume (quanto mais transação, menor a taxa), definida pelo admin master | Tabela configurável de faixas; faixa fotografada no pedido |
| D4 | Sem cartão de crédito nem de débito: só Pix | Remover `cartao_maquininha`; Pix online e Pix na maquininha ficam |
| D5 | Organizações atuais são de teste; serão resetadas antes da publicação | Sem migração de contratos; usar o reset do lançamento |
| D6 | A taxa Pix é descontada do organizador, não do comprador | Entra no rateio: a plataforma sai antes (invariante 12) |

## Perguntas que ainda travam o código

**P1. Os modos são exclusivos?** O invariante 13 diz que mensalidade e percentual
nunca convivem. A taxa fixa por cota entra como terceiro modo, exclusivo.
Recomendação: sim, um modo por organização: `mensalidade`, `comissao` (percentual)
ou `cota` (valor fixo por cota).

**P2. A taxa Pix vale para todos os modos ou só para comissão?** Taxa Pix é um
percentual. Se valer para mensalidade, a mensalidade passa a conviver com
percentual, e isso quebra o invariante 13. Recomendação: ela é um **custo de
transação repassado no rateio**, separado do contrato. Aplica-se a todos os
modos e aparece como linha própria no extrato. Isso exige decidir se o invariante
13 vale para o percentual do contrato (sim) e não para a taxa de transação (sim,
com nota explícita no código).

**P3. Como o volume é medido para escolher a faixa?** Recomendação: transações
Pix pagas da organização no mês civil (fuso de São Paulo), contadas por um
contador atômico (invariante 4: nada de COUNT(*)), e a faixa vale para o pedido
no momento da criação. Faixas iniciais de exemplo: até 100 transações, 2%;
até 1.000, 1,5%; acima, 1%. Valores definitivos são do admin master.

**P4. Teto e piso.** Taxa por cota não pode passar do preço da cota (senão a
venda dá prejuízo). Taxa Pix e percentual têm teto de 30% (já existe).

## Não entra nesta PR
- Textos legais (Termos, regulamento, contrato): versão nova depois do advogado.
- Simulação contábil: depende de P1 a P3.
- App Android: a remoção do cartão afeta o shim da maquininha (`tests/posShim.test.ts`); entra na mesma PR só se for só remover o meio.

## Efeito nos documentos existentes
- `docs/PENDENCIAS.md`: atualizar quando a PR for mesclada.
- `shared/payments.ts`: remover `cartao_maquininha` e a regra "pelo menos um meio".
