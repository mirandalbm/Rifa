# Sugestão de preços: banner pago e rifas patrocinadas

Itens #46 e #52 da lista de pendências (18/10/2026). **São propostas para o
responsável decidir**, não fatos de mercado: ainda não há tráfego real, então
os números abaixo partem de hipóteses escritas e se recalibram com 2 a 4
semanas de dados (painel Publicidade já mostra exibições, cliques e venda
atribuída). Nada aqui muda código: os valores entram em Marketing →
Publicidade (Rifas patrocinadas e Banner na vitrine), com o produto ligado.

## O que existe hoje (padrões do código)

| Produto | Padrão atual | Onde |
|---|---|---|
| Banner pago | R$ 20,00 por dia, 1 a 30 dias, 3 vagas, 6 s na tela, nasce desligado | `CONFIG_BANNER_PAGO_PADRAO` |
| Patrocinada | clique R$ 0,25 (cidade), R$ 0,40 (estado), R$ 0,60 (Brasil); mínimo 50 cliques; desconto 5% a partir de 500, 10% a partir de 1.000, 15% a partir de 5.000; vagas 1/1/3; recarga mínima R$ 20,00 | `CONFIG_PATROCINIO_PADRAO` |

## Como pensar o preço (sem inventar mercado)

1. **O comprador de publicidade é a organização**, que só compra se o
   anúncio devolver mais do que custa. A conta dela: `venda gerada ≥ gasto`.
2. Venda gerada por clique = **taxa de conversão do clique em compra** ×
   **valor médio do pedido**. Nenhum dos dois é conhecido hoje: o valor
   médio sai de `ticket médio` em Resultados e a conversão sai da venda
   atribuída (`orders.anuncio_id`, estatística). Até medir, trate qualquer
   conversão como hipótese.
3. Exemplo só para dar a ordem de grandeza (hipótese, não promessa):
   pedido médio de R$ 30 e 2 compras a cada 100 cliques geram R$ 0,60 por
   clique. Um clique a R$ 0,60 empata; abaixo disso o anúncio se paga. Por
   isso o clique **nacional** (o mais caro) é o que mais corre risco de
   não se pagar, e o **local** é o mais barato de acertar.
4. **Não prometa retorno na tela** (o CDC trata como publicidade enganosa
   e as redes recusam texto assim): a tela mostra o que gastou e o que a
   venda atribuída trouxe, nada de "você vai ganhar".

## Proposta para o lançamento

### Rifas patrocinadas: manter a tabela atual

Recomendo **não mexer na tabela de fábrica** no lançamento:

- R$ 0,25 / 0,40 / 0,60 por clique já deixa o pacote mínimo (50 cliques)
  em R$ 12,50 a R$ 30,00, barato o bastante para a primeira compra.
- O desconto por volume só cresce (`validarConfigPatrocinio`), então pode
  ser aumentado depois sem quebrar quem já comprou: o preço é fotografado
  na compra.
- **Vagas**: 1 por cidade, 1 por estado e 3 no Brasil. Poucas vagas criam
  fila, e fila é o que justifica subir o preço depois.
- **Recarga mínima R$ 20,00**: cobre o pacote mínimo de qualquer alcance.

### Banner pago: R$ 30,00 por dia, mínimo 3 dias

- **Preço do dia R$ 30,00** (hoje R$ 20,00). O banner ocupa o topo da
  vitrine e divide o carrossel com 3 vagas e os banners da plataforma, então
  cada banner recebe, no máximo, cerca de um terço do tempo de tela: não vale
  menos que o clique nacional, que é a unidade comparável.
- **Mínimo de 3 dias, máximo de 30** (hoje 1 a 30): um dia de topo quase não
  gera dado para a organização julgar o resultado, e a arte passa por
  aprovação manual (custo de atendimento por pedido).
- **3 vagas e 6 segundos** como estão.
- **Desconto por período** (ideia, não existe no código): 7 dias com 10% e 30
  dias com 20%, no mesmo desenho das faixas das patrocinadas. Se quiser,
  entra junto com o banner por clique (abaixo).

### Banner por clique (pedido #47, a implementar)

Proposta de preço inicial, para o mesmo desenho da patrocinada:

- **R$ 1,00 por clique**, pacote mínimo de **100 cliques** (R$ 100,00).
  É mais caro que o clique nacional da patrocinada (R$ 0,60) porque o
  banner está no topo, com a imagem do próprio organizador, e passa na
  frente de todos os visitantes da vitrine.
- Fila e tempo de exibição: o banner entra na vaga quando chega a vez e
  **sai ao gastar os cliques ou ao fim de um prazo máximo** (sugestão: 30
  dias), o que vier primeiro, para o crédito não ficar preso a um banner sem
  tráfego. Em qualquer dos dois modos o dia/clique não usado volta ao saldo
  como crédito, nunca em dinheiro (regra de hoje do banner pago).
- O clique vale pelas mesmas regras de honestidade das patrocinadas (uma vez
  por aparelho em 24 h, comprovante da exibição, teto por IP).

## O que decidir

1. Preço do dia do banner: **R$ 30,00** (proposta) ou manter R$ 20,00?
2. Mínimo de dias do banner: **3** ou 1?
3. Entrar com o desconto por período (7 dias 10%, 30 dias 20%)?
4. Banner por clique: **R$ 1,00**, mínimo **100** cliques, prazo máximo de
   **30 dias**?
5. Patrocinadas: manter a tabela de fábrica no lançamento (recomendado)?

Depois de 2 a 4 semanas no ar: ler Resultados e Publicidade, calcular o custo
real por venda atribuída de cada alcance e ajustar o preço do clique.
