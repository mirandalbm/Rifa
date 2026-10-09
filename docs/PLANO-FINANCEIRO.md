# Plano: Tesouraria da plataforma (painel financeiro do master)

Pedido do dono (09/10/2026): um painel financeiro e analítico, só do
administrador master, que entenda **de onde vem cada centavo da plataforma**,
mostre **para onde ele vai** e faça a gestão separada de bens, recursos,
entradas, saídas e destino final — o caixa, o gestor do split e a leitura da
receita —, com a plataforma **já direcionando** créditos e débitos para os
lugares certos.

Este documento é o plano. Nada daqui está no código ainda. As decisões que
faltam estão na seção 8. O pano de fundo contábil (Lucro Real, mídia como
repasse, competência) está em `docs/CONSULTA-CONTADOR-E-ADVOGADO.md`.

## 1. Nome: "Tesouraria", não "Caixa"

No sistema, **Caixa** já é a *caixa de entrada* do master (`/admin/caixa`, o que
espera decisão). Chamar o painel financeiro de "caixa" faria duas coisas com o
mesmo nome. Proposta: um grupo novo do menu do master, **Tesouraria**, ao lado
de "Vendas e dinheiro" (que continua com Pedidos, Financeiro dos afiliados,
Cobrança e Exportações). O organizador não ganha nada novo: ele segue vendo a
conta dele em Cobrança, e a Tesouraria devolve 403 para ele.

## 2. O que já existe (o dinheiro hoje está em onze lugares)

Cada fluxo tem o próprio livro. Falta o **todo**: nenhuma tela soma de onde a
plataforma ganha, nem diz onde o dinheiro está.

| Fluxo | Onde mora hoje |
|---|---|
| Venda online (Pix) | `orders` (`amount_cents`, `presente_cents`), split do Asaas direto para a carteira da promotora |
| Taxa da plataforma sobre a venda / mensalidade | `platform_charges` (`aberta`, `retida`, `paga`, `cancelada`) |
| Comissão do afiliado / cambista | `commissions` (`pending`, `available`, `paid`, `reversed`; `guardada` quando a plataforma guarda) |
| Saque do afiliado (com IRRF) e acerto do cambista | `payouts`, `settlements`, recibos |
| Presente (desconto pago pela plataforma) | `presente_creditos` |
| Saldo de publicidade (recarga, anúncio, banner, reembolso) | `patrocinio_lancamentos`, `patrocinio_recargas`, `patrocinio_reembolsos`, `banner_pedidos` |
| Tráfego pago (reserva, taxa, gasto, sobra, excedente) | `trafego_campanhas`, `trafego_gastos` e o livro do patrocínio |
| Assistente de IA (assinatura, avulso, uso) | `ia_pagamentos`, `ia_lancamentos`, `ia_uso` |
| Pix que chegou tarde | `pix_tardios` |
| Saldo retido por banimento | `retencoes_cautelares` |
| Estorno | desfeito dentro de `refundOrder()` em várias tabelas |

Telas que já olham pedaços: Financeiro, Cobrança, Exportações, Resultados, a
margem do Tráfego pago e o relatório do assistente.

## 3. O que a Tesouraria precisa responder

1. **De onde vem a receita da plataforma**, por origem e por mês: taxa por
   venda, mensalidade, taxa de gestão do tráfego, patrocínio, banner pago,
   assistente de IA (assinatura e pacotes) e o que mais entrar.
2. **O que é receita e o que é dinheiro de terceiros.** No Lucro Real a taxa de
   gestão é diferida na campanha; a mídia, o saldo pré-pago, a comissão guardada,
   o crédito do presente e o Pix a devolver **não são receita**: são passivo.
3. **Onde o dinheiro está agora** (por destino: conta da receita, conta da
   mídia, conta das comissões guardadas, carteiras do Asaas) e **quanto cada
   destino deve ter** pelo livro — a diferença é o que a conciliação cobra.
4. **Para onde cada centavo vai** em cada evento (venda, estorno, saque,
   recarga, gasto, doação) e **o que ainda falta mover**.
5. **O custo**: provedor de Pix, Chatbase, excedente da rede, doações.
6. **O split de cada venda**: plataforma, afiliado ou cambista e promotora,
   o que o Asaas já separou na origem e o que ficou devendo.

## 4. Desenho

### 4.1 Um razão de partida dobrada, só para a plataforma

Duas tabelas novas (nomes provisórios):

- `fin_contas` — o plano de contas **fechado em código** (`shared/financeiro.ts`),
  a plataforma só escolhe o **destino** de cada conta. Grupos: **receita**
  (taxa por venda, mensalidade, taxa de gestão, patrocínio, banner, IA),
  **passivo de terceiros** (saldo pré-pago por organização, mídia a repassar,
  comissão guardada, crédito do presente, Pix a devolver, valores retidos,
  IRRF a recolher), **custos** (provedor, Chatbase, excedente, doações) e
  **disponibilidades** (cada conta bancária ou carteira).
- `fin_lancamentos` / `fin_partidas` — um lançamento tem duas ou mais partidas,
  débito e crédito, **em centavos inteiros, e a soma dos débitos é igual à
  dos créditos** (igualdade exata, como o rateio). Cada lançamento leva a
  **chave única do evento de origem** (`pedido:<id>`, `estorno:<id>`,
  `anuncio:<id>`…), a organização (ou nulo, a plataforma), a data de caixa e a
  de competência.

Regras que não se negociam (herdam do `CLAUDE.md`):

- **Gravar na mesma transação do evento.** O lançamento nasce junto com a
  confirmação do pagamento, o estorno, o saque, a aprovação da campanha. Fora
  da transação, sobreviveria a um rollback e mostraria dinheiro que não
  existiu.
- **Só se acrescenta, nunca se muda.** Estornar é lançar o inverso (com a
  chave `estorno:…`), não apagar nem editar. É o que torna o livro prova.
- **A chave decide, nunca um `SELECT` antes** (`ON CONFLICT DO NOTHING`): o
  webhook repetido, o relógio em várias réplicas, o clique duplo.
- **Saldo por conta é coluna atualizada na mesma transação**, como
  `campaign_stats`; **nunca `COUNT(*)` nem `SUM` sobre o livro inteiro** para
  a tela de visão geral. O `SUM` fica para a conciliação, que roda à parte.
- **Sem dado pessoal**: organização, código do pedido e do afiliado — nunca
  nome, telefone ou CPF de comprador.
- **Só o master vê** (403 para organizador e afiliado, no `npm run isolation`);
  a leitura de detalhe entra em `audit_log` antes de sair; lista longa por
  chave (`shared/paginacao.ts`), nunca `OFFSET`.
- O razão **não substitui** os livros de hoje (`platform_charges`,
  `commissions`…): eles continuam sendo a verdade de cada fluxo. O razão os
  **espelha**, e um conferidor compara os dois e acusa a diferença. Trocar a
  verdade de lugar seria reescrever todo o dinheiro de uma vez.

### 4.2 Destinos e "a plataforma já direciona"

- **Destino** é uma conta real: a conta bancária da receita (taxa), a conta da
  mídia (repasse), a conta das comissões guardadas, as carteiras do Asaas. O
  master cadastra os destinos e liga cada conta contábil a um (`fin_destinos`).
- **Tabela de roteamento fechada em código**: para cada tipo de evento, quais
  contas debita e credita e para qual destino. A plataforma escolhe o
  destino; ela **não escreve fórmula** (o rateio continua `splitOrder()`, a
  ordem "plataforma sai antes" não é configurável).
- **O que o código move sozinho** é só o que o provedor permite: o split do
  Asaas já separa a promotora no Pix. O resto — passar a taxa para a conta da
  receita, a mídia para a conta da mídia, pagar saque — hoje é **transferência
  bancária feita por uma pessoa**. Por isso o sistema gera a **lista de
  movimentações a fazer** ("mover R$ X da conta A para a B, por este motivo, até
  esta data"), a pessoa marca como feita com o comprovante, e a conciliação
  confere. Se o Asaas tiver API para transferência ou subcontas, parte disso
  vira automática depois (**a pesquisar**, seção 6).
- **Nunca prometer movimento que não aconteceu**: a tela diz "a fazer",
  "feito, a conferir" e "conferido".

### 4.3 As telas (grupo Tesouraria)

1. **Visão geral**: dinheiro por destino agora, receita do mês por origem,
   a pagar a terceiros, a mover, diferença da conciliação.
2. **Receitas**: por origem, por organização e por mês, em competência e em
   caixa; a taxa de gestão diferida (receita diferida × apropriada).
3. **Valores de terceiros**: saldo pré-pago por organização, mídia a
   repassar, comissões guardadas, créditos do presente, Pix a devolver, retenção
   cautelar.
4. **Fluxo de caixa**: entradas e saídas por dia e por destino, destino final.
5. **Split de pagamento**: por venda, o que foi para plataforma, afiliado ou
   cambista e promotora, o que o provedor já dividiu e o que ficou devendo.
6. **Movimentações**: a lista "a fazer / feito / conferido" da seção 4.2.
7. **Conciliação**: livro × extrato do provedor × faturas das redes.
8. **Contador**: o extrato mensal (campos do item 16 da consulta, com as
   retenções do Lucro Real), DRE gerencial e provisões; exporta pelo
   `shared/exports.ts`.
9. **Política de doações**: o percentual da taxa reservado para doação e as
   doações feitas, com o recibo da ONG.

## 5. Fases (cada uma é um PR, com o revisor de invariantes)

| Fase | O que entrega | Risco |
|---|---|---|
| **F0** | Pesquisa (Asaas: subcontas, transferências, extrato; Meta: faturas), plano de contas com o contador, o advogado sobre saldo pré-pago | nenhum código |
| **F1** | Grupo Tesouraria + **Receitas por origem** e **Valores de terceiros**, **somente leitura**, em cima dos livros que já existem; inclui o **extrato mensal do contador** | baixo: não grava nada |
| **F2** | O razão em **modo sombra**: `fin_*`, lançamentos nas transações dos eventos novos, **reconstrução do histórico**, conferidor que compara o razão com cada livro | médio: toca a transação de cada evento |
| **F3** | Destinos, roteamento e a **lista de movimentações a fazer** | baixo |
| **F4** | Conciliação com o extrato do provedor e as faturas das redes | médio: depende da API |
| **F5** | Competência (taxa diferida), retenções, NFS-e, DRE, provisões, doações | contábil, junto do contador |
| **F6** | Movimentos automáticos onde o provedor deixar | alto: dinheiro saindo sozinho; só com a conciliação provada |

A **F1** entrega valor logo e não arrisca o dinheiro. A **F2** é onde mora o
perigo (o razão errado parece certo); por isso entra em sombra, com o
conferidor, e só vira "a verdade da Tesouraria" depois de rodar limpo.

## 6. Quem faz o quê

- **pesquisador-de-integracao**: Asaas (subcontas, transferência, extrato e
  eventos de conciliação), faturas do Meta/Google/TikTok — antes de F3/F4.
- **implementador-da-rifa**: cada fase de código, em worktree.
- **revisor-de-invariantes**: obrigatório em F2, F3 e F6 (dinheiro, transação,
  isolamento) e opcional em F1.
- **conferente-de-telas**: as telas novas nas três larguras.
- **contador** (fora): plano de contas, DRE, tratamento de cada conta,
  competência. **Advogado** (fora): saldo pré-pago e arranjo de pagamento,
  política de doações.
- A sessão principal roda as provas e traz os commits, como sempre.

## 7. Riscos que já dá para ver

- **Divergência entre o razão e os livros.** Vira dois lugares dizendo o
  dinheiro. Mitigação: sombra + conferidor + o livro de cada fluxo continua
  sendo a verdade até a fase F5.
- **Prometer "direcionamento automático" sem API.** Mitigação: a lista de
  movimentações a fazer; automatizar só o que a conciliação provar.
- **Arranjo de pagamento.** Guardar saldo pré-pago e mover dinheiro de
  terceiros pode ser instituição de pagamento (pergunta 14 ao advogado). A
  Tesouraria não deve ir além do que o advogado liberar.
- **Histórico.** Reconstruir lançamentos de vendas antigas exige regra clara
  por tipo de pedido (estornado, com presente, de carrinho, de cambista).
- **Peso.** O razão cresce por venda; índices por conta/data/organização e
  saldo em coluna desde o início.

## 8. O que falta o dono decidir

1. **Nome e lugar**: "Tesouraria" como grupo novo do master? (recomendado)
2. **Por onde começar**: F1 (somente leitura, entrega rápida) ou o razão (F2)
   de uma vez? (recomendado: F1, com o extrato do contador dentro)
3. **Os destinos reais de hoje**: quantas contas bancárias existem e quais
   (receita, mídia, comissões)? O provedor é só o Asaas? Há conta no Meta em
   reais, cobrada em cartão ou boleto? Sem isso o roteamento não tem para onde
   apontar.
4. **Quem executa as movimentações** enquanto não houver API: o dono, uma
   pessoa financeira? Precisa de papel próprio (financeiro) além do master?
5. **Doações**: percentual fixo da taxa reservado em conta contábil própria,
   ou só registro do que foi doado?
