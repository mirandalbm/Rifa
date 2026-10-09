# Plano: Tesouraria da plataforma (painel financeiro do master)

Pedido do dono (09/10/2026): um painel financeiro e analítico, só do
administrador master, que entenda **de onde vem cada centavo da plataforma**,
mostre **para onde ele vai** e faça a gestão separada de bens, recursos,
entradas, saídas e destino final — o caixa, o gestor do split e a leitura da
receita —, com a plataforma **já direcionando** créditos e débitos para os
lugares certos.

**Esclarecimento do dono (09/10/2026): o dinheiro não se move pelo
sistema.** O que a Tesouraria faz é **contabilidade, controladoria e gestão**:
no **fechamento mensal** ela mostra o saldo bruto, **quanto deve ser destinado
a cada área** (doação, mídia, despesas, salários, impostos, consultoria…) e o
**saldo final da empresa**. As áreas e as regras — valor fixo, percentual,
valor digitado no mês — são **campos que o master cria e edita no painel**.
Quem transfere o dinheiro é a pessoa, fora do sistema; o painel diz quanto.

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

### 4.2 Destinação do mês (a controladoria) — o coração do pedido

**Sem movimento de dinheiro.** O sistema calcula e registra; não transfere.

- **Saldo bruto do mês**: vem do sistema (seção 4.4), não é digitado.
- **Áreas de destinação** (`fin_areas`): linhas que o master cria, nomeia,
  ordena e agrupa — "Doação ONG", "Mídia (Meta/Google/YouTube/TikTok)",
  "Despesas da empresa", "Salários", "Impostos", "Consultoria"… Cada área pode
  ter **subitens** (aluguel, energia, água, combustível…). Cada linha tem uma
  **natureza** (despesa, imposto, doação, reserva, repasse), que é o que o
  contador usa para classificar.
- **Como cada linha calcula** (`regra`), só estas formas, fechadas em código:
  1. **valor fixo** (em reais, por mês);
  2. **percentual** de uma **base** à escolha: o saldo bruto, o **saldo que
     sobrou até ali** (cascata) ou o **lucro antes dos impostos**;
  3. **valor do mês** (variável): digitado no fechamento (salários que mudam,
     consultoria avulsa);
  4. **automático** do sistema, quando o dado existe: gasto de mídia do mês,
     custo do Chatbase, excedente da rede, taxa do provedor, doações já
     registradas.
- **Contas exatas, como o rateio da venda**: tudo em centavos inteiros; o
  percentual arredonda **para baixo** e o centavo que sobra fica no saldo da
  empresa, de modo que **saldo bruto = soma das destinações + saldo final**
  é igualdade, nunca aproximação. A ordem das linhas é a ordem da conta
  (a cascata depende dela) e fica visível.
- **Teto e aviso**: linha com limite (a doação no Lucro Real é até 2% do
  **lucro operacional**, não do bruto — o painel avisa ao passar, e a base
  certa é pergunta ao contador). Saldo final negativo aparece em destaque,
  em texto, não só em cor.
- **Fechamento do mês**: o master **fecha o mês** e o sistema guarda um
  **retrato imutável** (período, saldo bruto e a origem dele, cada linha com a
  regra e o valor calculado, saldo final e uma impressão SHA-256), como o recibo
  do saque. **Reabrir** é possível, mas fica na auditoria com motivo, e o
  retrato anterior permanece. Dois cliques, um fechamento (`UPDATE`
  condicional); o retrato de um mês não muda quando o modelo de áreas muda
  depois.
- **Previsto × realizado** (depois): a destinação é o que **deve** ser
  destinado; o master pode lançar o que **foi** gasto (valor, data, comprovante)
  em cada área, e o painel mostra a diferença e o que sobrou ou faltou. É a
  parte de auditoria.
- **Destinos reais** (conta da receita, da mídia, das comissões guardadas,
  carteiras do Asaas) viram apenas **cadastro informativo**: onde cada área
  está guardada, para o painel dizer "destine R$ X para a conta Y". O sistema
  não tem como mover, e a tela diz "a destinar", nunca "destinado".

### 4.3 As telas (grupo Tesouraria)

1. **Visão geral**: saldo bruto do mês e de onde veio, o que está destinado a
   cada área, saldo da empresa, a pagar a terceiros.
2. **Fechamento mensal**: o quadro do exemplo do dono — saldo bruto, cada
   área com a regra (fixo, % ou valor do mês) e o valor, saldo final; botão
   de fechar o mês e a lista dos meses fechados.
3. **Áreas e regras**: criar, editar, ordenar e desativar as áreas e os
   campos (fixo, %, valor do mês, automático), com a base e o teto.
4. **Receitas**: por origem, por organização e por mês, em competência e em
   caixa; a taxa de gestão diferida.
5. **Valores de terceiros**: saldo pré-pago por organização, mídia a repassar,
   comissões guardadas, créditos do presente, Pix a devolver, retenção
   cautelar — **dinheiro que não é da plataforma e fica fora do saldo bruto**.
6. **Split de pagamento**: por venda, o que foi para plataforma, afiliado ou
   cambista e promotora, o que o provedor já dividiu e o que ficou devendo.
7. **Conciliação**: livro × extrato do provedor × faturas das redes.
8. **Contador**: o extrato mensal (campos da consulta, com as retenções do
   Lucro Real), DRE gerencial e provisões; exporta pelo `shared/exports.ts`.
9. **Realizado × previsto** e as doações com o recibo da ONG.

### 4.4 O que entra no saldo bruto (precisa de decisão — seção 8)

O saldo bruto tem de ser **dinheiro da plataforma**: taxa por venda,
mensalidade, taxa de gestão do tráfego, patrocínio, banner pago, assistente de
IA. Valor de terceiros — a **mídia** que a organização pagou, o saldo
pré-pago, a comissão guardada — **não é receita** (o contador: é repasse).
Misturar os dois faria o painel dizer que há dinheiro para salários onde há
dinheiro de outras pessoas. Por isso a proposta é: o saldo bruto é a **receita
própria do mês**; a mídia aparece em bloco à parte ("repasse"), e a linha
"Meta/Google/TikTok" do exemplo do dono entra como **repasse** (dinheiro que
passa e sai) ou como **custo próprio** (o excedente e o que a plataforma
gastar com anúncio da própria marca).

## 5. Fases (cada uma é um PR, com o revisor de invariantes)

Nenhuma fase move dinheiro. A ordem prioriza o que o dono pediu.

| Fase | O que entrega | Risco |
|---|---|---|
| **F0** | Plano de contas e as áreas do exemplo com o contador; o advogado sobre saldo pré-pago | nenhum código |
| **F1** | Grupo Tesouraria, **Receitas por origem**, **Valores de terceiros** e o **saldo bruto do mês**, somente leitura, sobre os livros de hoje; inclui o extrato mensal do contador | baixo: não grava nada |
| **F2** | **Áreas e regras** (fixo, %, valor do mês, automático) e o **Fechamento mensal** com retrato imutável e saldo final | baixo: grava só a configuração e o retrato |
| **F3** | **Realizado × previsto**: lançar o que foi gasto por área, comprovante, diferença; doações com recibo | baixo |
| **F4** | Conciliação com o extrato do provedor e as faturas das redes; o razão em modo sombra, se ainda valer a pena | médio |
| **F5** | Competência (taxa diferida), retenções, NFS-e, DRE e provisões, com o contador | contábil |

A **F2** é a que o dono descreveu. O razão de partida dobrada deixou de ser
o centro: sem movimento de dinheiro, ele é uma escolha da F4, não pré-requisito.

## 6. Quem faz o quê

- **pesquisador-de-integracao**: Asaas (extrato e eventos de conciliação),
  faturas do Meta/Google/TikTok — antes da F4.
- **implementador-da-rifa**: cada fase de código, em worktree.
- **revisor-de-invariantes**: obrigatório na F2 (conta exata, fechamento
  imutável, isolamento) e na F4; opcional na F1 e na F3.
- **conferente-de-telas**: as telas novas nas três larguras.
- **contador** (fora): plano de contas, DRE, tratamento de cada conta,
  competência. **Advogado** (fora): saldo pré-pago e arranjo de pagamento,
  política de doações.
- A sessão principal roda as provas e traz os commits, como sempre.

## 7. Riscos que já dá para ver

- **Misturar dinheiro de terceiros com receita** no saldo bruto (seção 4.4).
  Mitigação: o bruto é só receita própria; o resto aparece à parte.
- **Percentual sobre base errada** (bruto × saldo restante × lucro): o painel
  mostra a base de cada linha e a ordem; `tests` varrem a igualdade exata.
- **Retrato que muda**: fechar guarda o modelo e os valores da época; mudar as
  áreas depois não reescreve o passado.
- **Doação acima do teto** de 2% do lucro operacional (Lucro Real): o painel
  avisa; a base certa vem do contador.
- **Imposto**: o exemplo cita ICMS; serviço de publicidade costuma ser ISS, e
  IRPJ/CSLL no Lucro Real incidem sobre o **lucro**, depois das despesas —
  então as linhas de imposto precisam da base "lucro antes dos impostos". O
  contador define quais linhas e quais bases.
- **Peso**: o fechamento lê o mês inteiro; usar o que já é agregado
  (`platform_charges`, `patrocinio_diario`, `trafego_gastos`…), nunca
  `COUNT(*)` sobre pedidos.

## 8. O que falta o dono decidir

1. **Nome e lugar**: "Tesouraria" como grupo novo do master? (recomendado)
2. **O que é o saldo bruto**: só a **receita própria do mês** (recomendado) ou
   também o que passa pela conta (mídia, saldo pré-pago)?
3. **A linha Meta/Google/TikTok**: entra como **repasse** (bloco à parte, não
   sai da sua receita) ou como **custo** que sai do bruto, como no seu exemplo?
4. **Percentual sobre quê**: cada linha escolhe a base (bruto, saldo restante
   ou lucro antes dos impostos) — confirma?
5. **Fechamento imutável** com reabertura auditada — confirma?
6. **Quem acessa**: só o master, ou um papel "financeiro" separado?
7. **Por onde começar**: F1 + F2 juntas (recomendado, é o que você descreveu)
   ou F1 primeiro?
