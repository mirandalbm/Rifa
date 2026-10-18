# Plano: banner pago por clique, ao lado do banner por dia

Pedido do responsável (18/10/2026): "o organizador cria o banner, paga, e o
banner entra na fila respeitando o tempo de exibição **por cliques ou por
dia**; temos que criar essa ferramenta no painel admin de marketing".

Este documento é o plano. **Nada daqui está no código ainda.** O que depende
de decisão do responsável está marcado **[decidir]** e reunido na seção 9;
os valores de preço são **proposta** (vêm de `docs/SUGESTAO-PRECOS-PUBLICIDADE.md`,
da branch `claude/youthful-gates-c7xzgz`, itens #46 e #47 da lista de
pendências de 18/10/2026), nunca fato de mercado.

## 0. Resumo

- **Não é tela nem menu novo.** A ferramenta já mora em Marketing →
  Publicidade → aba "Banner na vitrine" (`client/src/pages/adminBannerPago.tsx`,
  `BannerNaVitrine`; `/admin/banner-pago` redireciona para ela). O modo por
  clique entra **nessa aba**: `shared/access.ts`, `MENUS` e `App.tsx` não mudam.
- **Hoje** o banner pago vende só **dias de topo**: arte 1200 × 600 aprovada
  pela plataforma, vagas, o relógio dos dias só começa quando o banner pega a
  vaga, e os dias não usados voltam ao saldo como crédito
  (`shared/bannerPago.ts`, `server/services/bannerPago.ts`).
- **Falta** o modo **por clique**, escolhido pela organização na compra: ela
  paga um pacote de cliques; o banner entra na **mesma fila e nas mesmas
  vagas**; fica até **gastar os cliques ou chegar ao prazo máximo**, o que
  vier primeiro; o que não foi usado volta como **crédito** (nunca dinheiro).
- **A ideia que segura o desenho todo**: nos dois modos o banner ocupa a vaga
  por uma **janela** (`dias`, `inicio`, `fim`). No modo dia a janela é o que
  foi comprado; no modo clique é o **prazo máximo**. O clique, que só existe
  como cobrança no modo clique, é um segundo motivo para a janela fechar
  antes. Assim `promoverBannersPagos()` (trava 811104) **não muda**.
- **O clique honesto reaproveita** o comprovante da exibição
  (`server/services/ticketDoClique.ts`) e as regras das patrocinadas (um
  clique por aparelho em 24 h, teto por IP, robô fora, barrados contados) —
  com uma diferença real: o banner é um **slide de carrossel**, então a
  exibição que assina o comprovante é **por slide visível** (seção 4).

## 1. Modelo de dados

Tudo sobe com o `db:push` **antes** do código (entra em
`docs/ORDEM-DE-LANCAMENTO.md`). Nenhuma perda de dado: só colunas novas com
valor padrão, uma coluna que deixa de ser obrigatória e duas tabelas novas.

### 1.1 Colunas novas em `banner_pedidos` (`shared/schema.ts`)

| Coluna | Tipo | Para quê |
|---|---|---|
| `modo` | `text not null default 'dia'` | `dia` ou `clique` (`MODOS_DO_BANNER` em `shared/bannerPago.ts`). O padrão cobre todos os pedidos de antes. |
| `cliques_comprados` | `integer` (nulo no modo dia) | O pacote. |
| `cliques_usados` | `integer not null default 0` | Anda de 1 em 1, só por `UPDATE` condicional (seção 4). |
| `preco_clique_cents` | `integer` (nulo no modo dia) | **Fotografado** na compra, como `preco_dia_cents`: mudar a tabela não mexe no que já foi pago. |
| `desconto_pct` | `integer not null default 0` | A faixa de desconto aplicada (por cliques ou por dias), fotografada. |
| `encerrado_por` | `text` (nulo) | `cliques`, `prazo` ou `rifa_fora`: a tela diz por que acabou. Cancelado e recusado já têm a situação própria. |

Mudanças em colunas que existem:

- `preco_dia_cents` passa a **aceitar nulo** (`DROP NOT NULL`, sem perda): o
  pedido por clique não tem preço do dia. Zero seria mentira na tela e nos
  relatórios.
- `dias` **mantém o nome** e passa a significar "a janela em dias": no modo
  dia, os dias comprados; no modo clique, o **prazo máximo** fotografado da
  configuração do dia da compra. O comentário do schema diz isso. (Renomear
  mexeria em `sobraDoBanner`, na prova e em todo registro de antes por nada.)
- `fim` é o fim da janela nos dois modos; `bannerPagoNoAr()` e o filtro de
  `bannersPagosNoAr()` continuam valendo sem mudança.

Uma verificação no banco (`check`, drizzle `check()`), para o dado nunca
ficar pela metade:

```
(modo = 'dia'    and cliques_comprados is null and preco_clique_cents is null
                 and preco_dia_cents is not null)
or
(modo = 'clique' and cliques_comprados > 0 and cliques_usados <= cliques_comprados
                 and preco_clique_cents > 0)
```

Todos os pedidos de antes cumprem a primeira metade, então o `db:push` aplica
sem tocar em linha.

**O índice único `uq_banner_pedido_aberto_por_rifa` continua como está**
(um pedido em aberto por rifa, em `em_analise`/`aprovado`/`no_ar`) e vale
para os dois modos juntos: a rifa não tem um banner por dia e outro por
clique ao mesmo tempo. Quem decide é o índice, nunca um `SELECT` antes — a
violação derruba a transação inteira, débito junto, como hoje.

### 1.2 Tabelas novas

Não dá para reaproveitar `patrocinio_cliques` e `patrocinio_diario`: as duas
têm chave estrangeira para `patrocinio_anuncios`, e o painel das patrocinadas
junta as duas e `orders.anuncio_id`. Misturar as contas tiraria a clareza de
quem gastou onde. Espelho, com o mesmo desenho:

- `banner_cliques`: `id`, `pedido_id` (FK `banner_pedidos`, cascata),
  `organization_id`, `campaign_id`, `visitante_hash`, `ip_hash`, `valor_cents`
  (o que **este** clique gastou: `gastoAte(n) − gastoAte(n−1)`; **zero** no
  modo dia), `uf`, `created_at`. Índices: `(pedido_id, visitante_hash,
  created_at)`, `(pedido_id, ip_hash, created_at)` e
  `(visitante_hash, campaign_id, created_at)` (a venda atribuída, seção 7).
- `banner_diario`: `pedido_id`, `organization_id`, `dia` (fuso de São Paulo,
  `diaNoFuso()`), `uf`, `exibicoes`, `cliques`, `barrados`, `gasto_cents`;
  chave `(pedido_id, dia, uf)`; índice `(organization_id, dia)`. É daqui que o
  painel lê (somar dias, **nunca** varrer cliques nem `COUNT(*)`).

**O clique é gravado nos dois modos.** No modo dia ele custa zero, mas a
organização que comprou dias passa a ver exibições, cliques e barrados — e
poder comparar os modos é o que faz o produto novo ser escolhido com dado, não
com palpite.

Fica fora da primeira versão (e vai para `docs/PENDENCIAS.md`): expurgo de
`banner_cliques`. Hoje `patrocinio_cliques` também não tem; o volume é por
clique, não por exibição. **[decidir]** o prazo de guarda junto com os dois,
e se a Privacidade (`shared/legal.ts`) precisa de uma frase — a linha do
`rifa.device` já diz que o hash do aparelho conta "visita e clique".

## 2. Preço e configuração da plataforma

`ConfigBannerPago` (`shared/bannerPago.ts`) ganha dois blocos. Os campos de
antes ficam como estão.

```ts
export interface ConfigBannerPago {
  ligado: boolean;           // já existe: sem isto o produto não existe
  precoDiaCents: number;     // já existe
  diasMin: number;           // já existe
  diasMax: number;           // já existe
  /** NOVO. Desconto por período no modo dia: a partir de N dias, X%. */
  faixasDia: FaixaDeDesconto[];
  vagas: number;             // já existe: vale para os dois modos
  segundos: number;          // já existe
  /** NOVO. O modo por clique. */
  clique: {
    ligado: boolean;         // nasce desligado
    precoCents: number;      // preço de um clique, em centavos
    minimoCliques: number;   // menor pacote
    maximoCliques: number;   // maior pacote por pedido
    prazoMaxDias: number;    // a janela: o banner sai ao chegar aqui
    faixas: FaixaDeDesconto[]; // a partir de N cliques, X%
  };
}
```

`FaixaDeDesconto` já existe em `shared/patrocinio.ts`. A régua das faixas
(ordenadas, sem repetir, **o desconto só cresce**, para o pacote maior nunca
sair mais caro por clique) hoje está dentro de `validarConfigPatrocinio()`:
vira uma função exportada (`validarFaixas()`), usada pelas duas — nada de
copiar. `validarConfigBannerPago()` continua guardando só as chaves
conhecidas; faixa que começa acima do máximo (`diasMax`, `maximoCliques`) é
400, para não existir degrau que ninguém alcança.

### 2.1 Valores iniciais — **proposta**, só para o responsável decidir

| Campo | Valor proposto | De onde vem |
|---|---|---|
| `clique.ligado` | **desligado** | gasta dinheiro de terceiro: nasce desligado, como todo produto pago |
| `clique.precoCents` | 100 (R$ 1,00) | `SUGESTAO-PRECOS-PUBLICIDADE.md`, "Banner por clique", item 4 |
| `clique.minimoCliques` | 100 (pacote mínimo R$ 100,00) | idem |
| `clique.prazoMaxDias` | 30 | idem ("prazo máximo, sugestão: 30 dias") |
| `clique.maximoCliques` | **sem valor proposto** | o documento de preços não diz; o teto técnico é `CLIQUES_MAX_POR_ANUNCIO` (100 mil). **[decidir]** |
| `clique.faixas` | **vazio** | o documento diz só "mesmo desenho das patrocinadas", sem degraus. **[decidir]** |
| `faixasDia` | vazio de fábrica; proposta: 7 dias → 10%, 30 dias → 20% | `SUGESTAO-PRECOS-PUBLICIDADE.md`, item 3 (ainda sem resposta) |
| `precoDiaCents`, `diasMin` | hoje R$ 20,00 e 1; proposta R$ 30,00 e 3 | itens 1 e 2 do mesmo documento (ainda sem resposta) |

Os padrões de fábrica (`CONFIG_BANNER_PAGO_PADRAO`) só valem para quem ainda
não salvou nada; o que a produção usa é o que a plataforma salvou no painel.
Os valores de dia (`precoDiaCents`, `diasMin`) **não mudam no código** sem a
resposta dos itens 1 e 2: a plataforma muda no painel quando decidir.

### 2.2 As contas (funções puras em `shared/bannerPago.ts`)

- `precoDoBanner(cfg, dias)` ganha o desconto: `bruto = dias × precoDiaCents`,
  `desconto = descontoPara(cfg.faixasDia, dias)`, `total = floor(bruto ×
  (100 − desconto) / 100)`. Devolve `{ dias, descontoPct, brutoCents,
  totalCents }`. Sem faixa, o resultado é o de hoje, centavo por centavo
  (o teste de antes continua passando).
- `precoDoBannerPorClique(cfg, cliques)`: `bruto = cliques × precoCents`,
  desconto da maior faixa alcançada, total **para baixo**. Recusa abaixo do
  mínimo e acima do máximo, com a mesma mensagem em português da tela.
- `sobraDoBannerPorClique({ valorPagoCents, comprados, usados, inicio })`:
  `valor − gastoAte(valor, comprados, usados)`; banner que nunca foi ao ar
  volta inteiro. **`gastoAte()` é a de `shared/patrocinio.ts`, importada**:
  cada clique custa a diferença entre dois acumulados e a soma de todos é
  exatamente o valor pago.
- `resumoDoPedido(cfg, entrada)`: devolve a **conta em texto** ("7 dias × R$
  30,00 = R$ 210,00, menos 10% (R$ 21,00) = R$ 189,00" / "100 cliques × R$
  1,00 = R$ 100,00"), a mesma que a tela mostra e que o servidor grava na
  descrição do lançamento.
- `previsaoDaFilaDoBanner(...)`: seção 3.5.

### 2.3 O corpo do pedido e a rota da configuração

- `POST /api/admin/banner-pago/pedidos` passa a receber `modo` (`dia` |
  `clique`; **sem o campo vale `dia`**, para o que já existe) e `dias` **ou**
  `cliques`. **O front nunca envia preço** (invariante 5): o total é
  recalculado em `comprarBanner()` pelas funções acima, e `modo` desconhecido
  é 400. Modo clique com `clique.ligado` falso é **404**, como o produto
  desligado (a organização não deve saber que existe).
- **Achado a corrigir junto**: hoje `PUT /banner-pago/config` repassa o corpo a
  `setPlataforma({ bannerPago: req.body })`, e `validarConfigBannerPago()`
  preenche com o **padrão** o que faltou — mandar `{ ligado: true }` reescreve
  preço, dias e vagas com os de fábrica (a prova de hoje manda o objeto
  inteiro ao ligar). Com blocos novos isso fica pior (`clique` inteiro seria
  zerado por um PUT de uma chave só). A rota passa a **partir da atual**,
  como o tráfego já faz: `{ ...atual, ...corpo, clique: { ...atual.clique,
  ...corpo.clique } }`, e só as chaves conhecidas entram.
- Só a plataforma muda a configuração (403 para organizador; auditoria
  `banner.config` com os valores, como hoje).

## 3. A fila: dia e clique nas mesmas vagas

### 3.1 Uma fila só, por ordem de aprovação

Os dois modos disputam as **mesmas** `vagas` (`cfg.vagas`, hoje 3), do
aprovado mais antigo ao mais novo (`aprovado_em`, depois `id`), como
`promoverBannersPagos()` já faz. **O modo não dá prioridade**: o que decide é
a ordem de chegada da aprovação. **[decidir]** se a plataforma quer vagas
separadas por modo (por exemplo, uma reservada ao clique) — a primeira versão
não reserva nada, porque reservar é regra de negócio que o pedido não traz.

`promoverBannersPagos()` **não muda**: ela lê `dias` e põe `fim = agora +
dias × DIA_MS`. Como `dias` é a janela nos dois modos, o banner por clique
entra com `fim = agora + prazoMaxDias`, e a contagem de vagas ocupadas
(`status = 'no_ar' and fim > agora`) segue valendo. O relógio dos dias **e** o
prazo máximo só começam quando o banner pega a vaga, nunca na fila.

### 3.2 O que encerra um banner

| Motivo | Quem encerra | Modo dia | Modo clique |
|---|---|---|---|
| Acabou o prazo (`fim ≤ agora`) | relógio (`encerrarBannersPagos`) | encerra, **sem devolver** (como hoje) | encerra e **devolve a sobra**: `valor − gastoAte(usados)` |
| Gastou o último clique | a própria transação do clique | — | `encerrado_por = 'cliques'`, sobra zero, vaga liberada na hora |
| A rifa saiu do ar, foi travada, ou a promotora foi arquivada ou banida | relógio | `sobraDoBanner()` (o dia que começou conta inteiro) | `sobraDoBannerPorClique()` |
| Cancelar em análise / recusa da arte | organização / plataforma | devolve tudo (como hoje) | devolve tudo — nenhum clique pode ter sido gasto antes de ir ao ar |

Todo `UPDATE` de encerramento é condicional à situação lida (`no_ar`), e o
dinheiro só volta pelo livro de saldo (`lancar()`, chave única), na mesma
transação. **A devolução é sempre crédito no saldo, nunca dinheiro** — o
reembolso em dinheiro do saldo tem interruptor próprio e não é tocado aqui.

### 3.3 Mudanças em `encerrarBannersPagos()`

Hoje o primeiro passo é um `UPDATE` em bloco que encerra todo `no_ar` vencido
sem devolver nada. No modo clique isso engoliria a sobra. Então:

1. O `UPDATE` em bloco passa a valer só para `modo = 'dia'`.
2. A consulta dos "perdidos" ganha `or (b.status = 'no_ar' and b.modo =
   'clique' and b.fim <= now())` e o laço por pedido (transação, linha travada
   `FOR UPDATE`) decide a sobra pelo modo. Chave do livro igual à de hoje:
   `banner-sobra:<id>` — quem decide que devolve uma vez só é a chave.
3. `encerrado_por` é gravado no mesmo `UPDATE` (`prazo` ou `rifa_fora`).

O relógio roda a cada 15 min (`releaseMs`, trava 811404). O prazo vencido já
**some da vitrine na leitura** (a consulta filtra `fim > agora`), então só a
devolução e a reutilização da vaga esperam o relógio — exatamente como o dia
de hoje. O último clique é diferente: libera a vaga na hora (3.4).

### 3.4 O último clique libera a vaga sem esperar

Dentro da transação do clique (seção 4), o `UPDATE` que passa `cliques_usados`
a `cliques_comprados` também grava `status = 'encerrado'`, `encerrado_em` e
`encerrado_por = 'cliques'`. **Depois do commit**, o servidor chama
`promoverBannersPagos()` em segundo plano (`emSegundoPlano`, nunca derruba o
clique): o próximo da fila entra no ar em segundos, não em 15 min. A falha
vai ao log e o relógio cuida na volta seguinte.

### 3.5 Previsão da fila (o que a tela promete)

O banner aprovado e sem vaga mostra "Esperando vaga: 2º da fila" (já existe).
Ganha **"entra, no mais tardar, em <data>"**: um limite que é verdade, sem
estimativa. Cada vaga ocupada libera, no máximo, no `fim` dela (a sobra do
clique só pode adiantar); cada pedido da frente ocupa a vaga, no máximo, pela
janela dele (`dias`). `previsaoDaFilaDoBanner(fins, janelas, vagas, agora)`
simula isso em ordem (pura, em `shared/bannerPago.ts`, testada). Uma
**estimativa** pelo ritmo de cliques por hora (como `previsaoDaFila()` das
patrocinadas) fica para depois e, se vier, a tela diz "estimativa".

### 3.6 Exemplo

Três vagas, config de proposta. A (dia, 5 dias) e B (clique, 100 cliques,
prazo 30) estão no ar; C (dia, 3 dias) entra na terceira vaga. D (clique) e E
(dia) estão aprovados esperando. B gasta o 100º clique às 14:02: encerra,
sobra zero, D entra às 14:02. A chega ao `fim` e o relógio encerra sem devolver;
E entra na volta seguinte. Se a rifa de C sai do ar no dia 2, C devolve 1 dia
(`banner-sobra:<id>`), E sobe.

## 4. O clique honesto

### 4.1 A exibição num carrossel (a pergunta de verdade)

Nas patrocinadas, `GET /patrocinadas` entrega a lista e assina um comprovante
**por anúncio** para o aparelho que pediu (`comprovanteDaExibicao(id,
aparelho)`); o clique precisa dele, emitido de 1 s a 30 min antes
(`COMPROVANTE_MIN_MS`, `COMPROVANTE_MAX_MS`). Funciona porque o bloco inteiro
é visível.

O banner é diferente: `BannersVitrine` é um carrossel de `scroll-snap` com a
plataforma e até `vagas` banners pagos; **só um slide aparece por vez**, passa
sozinho a cada `segundos` e o slide 3 pode nunca ser visto. Assinar o
comprovante na entrega da lista (`GET /banners`) diria "este aparelho viu" de
um slide que talvez não tenha aparecido, e obrigaria a lista a variar por
aparelho (hoje é pública e cacheável).

**Proposta: a exibição que assina o comprovante é por slide visível.**

- A tela (`BannersVitrine.tsx`) observa cada slide pago com
  `IntersectionObserver` (raiz = o trilho, limiar 0,6). Slide visível por
  **pelo menos 1 s**, com a aba visível (`document.visibilityState`), conta
  como exibição.
- A tela manda `POST /api/public/banners-pagos/exibicoes` com `{ ids, uf }`
  (até 5) e recebe `{ comprovantes: { <id>: "<quando>.<hmac>" } }`. O servidor
  confere que cada banner está no ar, que não é robô, limita por IP (como
  `patrocinio-exibicao`: 10 min, 200), soma a exibição em `banner_diario` e
  assina com `comprovanteDaExibicao(pedidoId, deviceHash)`. **A função e a
  chave são as mesmas**; o id do pedido é um UUID aleatório, então o
  comprovante de uma patrocinada não vale para um banner (e vice-versa).
- A tela guarda o comprovante **na memória** (`Map` por id, com a hora) e só
  pede de novo depois de ~20 min (o comprovante vale 30). **Nenhuma chave nova
  no navegador**, então `GUARDADO_NO_NAVEGADOR` (`shared/legal.ts`) e o teste
  `tests/legal.test.ts` não mudam.
- O que resolve: o número de exibições passa a ser o do **slide visto** (sem
  ele a taxa de clique não faz sentido), o clique só é cobrado depois de uma
  exibição registrada, e `GET /banners` continua público e cacheável.

Alternativa mais simples **(A)**: assinar na entrega da lista, como as
patrocinadas. Mais barata, mas conta como visto o que pode não ter sido, e
a taxa de clique fica com o denominador errado. Recomendo a proposta (B);
**[decidir]** só se o responsável preferir a simplicidade.

Aviso honesto: nenhuma das duas impede um script que finge ser o aparelho —
o comprovante prova que o clique veio de quem pediu a exibição, não que um
humano olhou. O que segura a conta são o limite por aparelho, o teto por IP, o
robô fora e os barrados visíveis (4.4).

### 4.2 O clique

`POST /api/public/banners-pagos/:id/clique` com `{ uf, comprovante }`;
responde **204 sempre** (quem clica não precisa saber se contou, e o robô não
aprende o que conta); limite `hit("banner-clique:<ipHash>", 10, 120)` antes.
`registrarCliqueDoBanner()` em `server/services/bannerPago.ts`:

1. Id inválido ou pedido inexistente: nada (nem barrado).
2. **Barra sem cobrar** (soma em `barrados`): sem aparelho identificado; robô
   (`ehRobo`); comprovante que não confere com o pedido e o aparelho
   (`comprovanteConfere`); sem IP (com `trust proxy` não acontece); e, **se o
   responsável quiser**, o clique de uma sessão de painel da própria
   organização dona (autoclique). **[decidir]**
3. Numa transação, duas travas de aplicação **nesta ordem** (a mesma ideia de
   `registrarClique()`): `pg_advisory_xact_lock(<classe do aparelho>,
   hashtext(pedido || aparelho))`, depois `(<classe do IP>, hashtext(pedido ||
   ip))`. Classes novas, livres hoje (sugestão 811910 e 811911; conferir com
   `grep` no PR): duas chaves, para nunca colidir com as travas de uma chave
   dos relógios.
4. Mesmo aparelho no mesmo banner nas últimas 24 h
   (`JANELA_DO_CLIQUE_HORAS`): não cobra. Mesmo IP com `CLIQUES_POR_IP` (3) ou
   mais: não cobra. **[decidir]** se o banner terá teto próprio
   (`CLIQUES_POR_IP_NO_BANNER`) — a vitrine é a página mais vista, e um bairro
   inteiro atrás do mesmo IP bate no teto mais depressa; o teto erra para o
   lado do patrocinador, nunca cobra a mais.
5. **Modo clique — quem decide é o `UPDATE`, nunca um `SELECT` antes**:

   ```sql
   UPDATE banner_pedidos
      SET cliques_usados = cliques_usados + 1
    WHERE id = $1 AND modo = 'clique' AND status = 'no_ar' AND fim > now()
      AND cliques_usados < cliques_comprados
      AND EXISTS (SELECT 1 FROM campaigns c
                   WHERE c.id = campaign_id AND c.status = 'published' AND c.travada_em IS NULL)
      AND EXISTS (SELECT 1 FROM organizations o
                   WHERE o.id = organization_id AND o.archived_at IS NULL AND o.banida_em IS NULL)
   RETURNING cliques_usados, cliques_comprados, valor_pago_cents
   ```

   Nenhuma linha: não cobra (esgotado, vencido ou rifa fora do ar) e vai
   para `barrados`. Com a linha: `valor_cents = gastoAte(valor, comprados,
   usados) − gastoAte(valor, comprados, usados − 1)`; se `usados =
   comprados`, o mesmo bloco grava o encerramento (3.4). A mesma regra de
   situação da vitrine (`bannersPagosNoAr`) vale aqui: o banner que o público
   não vê não cobra.
6. **Modo dia**: `INSERT … SELECT … WHERE EXISTS (<mesma condição de estar no
   ar>)` com `valor_cents = 0`; não há contador a mexer.
7. `INSERT` em `banner_cliques` e `banner_diario` (`cliques + 1`, `gasto_cents
   + valor`) na **mesma transação**. Fora dela, o que não cobrou soma em
   `barrados`.

### 4.3 O que muda por ser banner (e não bloco de patrocinadas)

| Ponto | Patrocinadas | Banner |
|---|---|---|
| Unidade de exibição | o bloco/anúncio entregue na lista | o **slide** visível por ≥ 1 s |
| Quem assina o comprovante | `GET /patrocinadas` | `POST …/exibicoes`, por slide |
| Segmento | fila por cidade/estado/Brasil | nacional, uma fila só; a UF de quem olhou entra só nas estatísticas |
| O que o clique faz | `Link` para a rifa | `Link` para `/o/<org>/r/<rifa>`, já com `marcarOrigem("banner")` |
| Vaga | por segmento | `cfg.vagas`, global |
| Viés de posição | cada cartão numa lista | o 1º slide é muito mais visto; a ordem hoje é `inicio asc`, **fixa** |

Duas consequências práticas para registrar:

- **Só o clique primário conta.** O `onClick` do `Link` dispara o `POST`;
  abrir em nova aba (botão do meio) não dispara. Erra para o lado de não
  cobrar. O `POST` vai sem esperar (`apiRequest(...).catch(() => {})`, como as
  patrocinadas); a navegação é dentro do app.
- **Viés de posição.** No modo clique ele não muda o preço, só o tempo para
  gastar o pacote (o prazo máximo é a saída); no modo dia ele muda o que o
  organizador recebe pelo dia. **[decidir]** se a ordem dos slides pagos passa
  a girar por visita. A primeira versão não mexe na ordem.

### 4.4 O que a organização e a plataforma enxergam do clique

`barrados` fica visível para quem pagou, como nas patrocinadas: ela vê o que
**não** foi cobrado. A plataforma vê o mesmo, de todas. Um concorrente que
queira esvaziar o pacote de outro esbarra no limite de 1 por aparelho e 3 por
IP em 24 h e no robô fora; o risco que sobra é o de quem tem muitos aparelhos
e muitos IPs, e o remédio operacional é o ajuste de saldo que a plataforma já
tem (`POST /patrocinio/ajustes`). Sem ferramenta nova na primeira versão.

## 5. Interface (Marketing → Publicidade → Banner na vitrine)

Tudo em `client/src/pages/adminBannerPago.tsx` e, na vitrine,
`client/src/components/BannersVitrine.tsx`. Peças do kit (`Filtros`, `Caixa`,
`Campo`, `Pill`, `Button`, `CartaoDoPainel`), `tnum` em todo número, estado
sempre com `<Pill>` e texto, rótulo em todo campo, `grid-cols-1` no começo da
grade, sem amarelo, cor por variável.

### 5.1 Comprar (organização) — `NovoPedido`

- Grupo **"Como pagar"** com `Filtros exclusivo` (rádio de verdade, regra do
  kit): **Por dia no topo** | **Por clique**. A opção por clique só existe
  se `config.clique.ligado`; desligada, a tela é a de hoje.
- Por dia: o campo de dias de hoje + a dica das faixas de período
  ("a partir de 7 dias, 10% de desconto").
- Por clique: campo "Quantos cliques" (mínimo e máximo na dica) + dica com o
  preço do clique e as faixas.
- **Resumo do pedido com a conta em texto**, vindo de `resumoDoPedido()`:
  - dia: "7 dias × R$ 30,00 = R$ 210,00, menos 10% (R$ 21,00) = R$ 189,00 ·
    o tempo só começa a contar quando o banner entra no ar";
  - clique: "100 cliques × R$ 1,00 = R$ 100,00 · vale até gastar os cliques
    **ou** em 30 dias, o que vier primeiro · o que não for usado volta ao seu
    saldo como crédito".
  A frase do prazo máximo sai de `prazoMaxDias` da configuração, nunca
  digitada. O total aparece com `tnum`; o botão só habilita com saldo.
- O aviso de sempre: recusado ou cancelado antes de ir ao ar, volta tudo; rifa
  que sai do ar, o não usado volta como crédito.

### 5.2 Meus pedidos (organização) — `Pedidos`

Por pedido, além do que já existe:

- A pílula do modo ("Por dia" / "Por clique") ao lado da situação.
- Modo clique: **barra de progresso** (a `Barra` de `adminPatrocinio.tsx`,
  `role="progressbar"`, extraída para um lugar comum) com o texto "37 de 100
  cliques", "Gasto R$ 37,00 · restam R$ 63,00" e "no ar até, no máximo,
  <data>".
- Exibições, cliques, **barrados** e taxa de clique (do `banner_diario`), nos
  dois modos.
- Encerrado: o motivo em texto ("gastou todos os cliques", "chegou ao prazo
  máximo", "a rifa saiu do ar") e "voltou ao saldo: R$ …".
- Esperando vaga: "Nº da fila" e "entra, no mais tardar, em <data>".
- Cancelar continua só em análise. **[decidir]** se o modo clique permite
  encerrar antes de aprovado e ao ar, com a sobra em crédito (hoje nenhum
  modo permite depois de aprovado).

### 5.3 Plataforma — `ConfigDoBanner` e a fila

- A configuração vira **dois cartões**: "Banner por dia" (o que existe + as
  faixas por período) e "Banner por clique" (liga, preço, mínimo, máximo,
  prazo máximo, faixas). O editor de faixas hoje está dentro de `ConfigCard`
  em `adminPatrocinio.tsx`: **extrai-se** para um componente comum, sem copiar.
- Lista de pedidos de todas as organizações (já existe), com os mesmos
  números por pedido, o nome da organização e os botões de aprovar ou recusar
  a arte (já existem). A fila mostra os dois modos juntos, na ordem de
  aprovação, e as vagas ocupadas com o fim de cada uma.
- Números da plataforma por modo (pedidos, cliques cobrados, barrados, valor
  gasto em cliques) no topo — a mesma leitura de `Numeros` das patrocinadas.
- A Caixa de entrada (`caixaDeEntrada()`, tipo `banner`) segue listando a arte
  esperando aprovação; o texto ganha "(por clique)" quando for o caso.

### 5.4 Vitrine — `BannersVitrine.tsx`

Sem mudança visual. Muda o que acontece por trás: o observador de slides, o
`POST` de exibição e o `POST` do clique no `Destino` do banner pago. Nenhuma
chave nova no navegador (4.1).

### 5.5 Registro das telas

Mudança de tela entra em `docs/VERSOES.md` (registro, `aguardando leva`).
Antes do PR de tela, **conferir quantas linhas já estão aguardando**: com 10,
o PR seguinte é a leva, e a 11ª faz `tests/versoes.test.ts` falhar. A rota é a
mesma, então o mapa de telas do guia não muda. `npm run telas` sem reprovação.

## 6. Recorte e acesso

- **Pedido do vizinho é 404, nunca 403**: ler, cancelar, ver a arte e (novo)
  ver exibições, cliques e barrados. O painel (`painelDoBannerPago()`) segue
  recortando por `orgOf(req)`; as consultas novas ao `banner_diario` levam
  `organization_id = $org`. Pedido por clique na rifa do vizinho:
  `assertCampaignInScope` → 404, como o pedido por dia.
- **Quem compra é a organização** (a plataforma é 403 — não compra pelo
  organizador) e **quem decide a arte e muda a configuração é só a
  plataforma** (403 para organizador). Nenhuma rota de decisão nova: o modo
  clique usa as mesmas `…/decisao`, `…/cancelar`, `…/imagem` e `…/config`.
- **As rotas públicas novas** (`…/exibicoes`, `…/clique`) não têm sessão e
  não devolvem dado de ninguém: o clique responde 204 e a exibição devolve só
  o comprovante do aparelho que perguntou, de banners **que já estão
  públicos**. Nunca id de pessoa, IP ou hash na resposta.
- **`npm run isolation`** (`scripts/isolation-test.ts`) ganha: o `PUT
  /banner-pago/config` com o bloco `clique` (403 para organizador, a linha de
  hoje passa a levar o corpo novo); `POST /banner-pago/pedidos` com `modo:
  "clique"` na rifa do vizinho (404); cancelar e ver a arte de pedido por
  clique do vizinho (404); e a conferência de **conteúdo**: o painel da
  organização A não traz exibições, cliques, barrados nem o id de pedido da B
  (resposta 200 com lista vazia seria vazamento calado — o teste olha o
  conteúdo, não só o código).
- Auditoria na mesma transação do pedido (`banner.pedido` leva `modo`, `dias`
  ou `cliques` e `valorPagoCents`), e `banner.config` com o bloco novo. O
  clique **não** entra em `audit_log` (volume); fica em `banner_cliques`.

## 7. Venda atribuída (opcional, última etapa)

`orders.anuncio_id` é só um `uuid` sem chave estrangeira, e o painel das
patrocinadas o junta a `patrocinio_anuncios`. Usá-lo para o banner misturaria
as duas contas. Para mostrar "vendas depois do clique", a etapa final traz uma
coluna nova `orders.banner_pedido_id` (nula, `db:push` antes do código) e
`bannerDaVenda(deviceHash, campaignId)`: o último clique do aparelho nessa
rifa em até `JANELA_DA_VENDA_DIAS` (7), em `banner_cliques`, chamado em
`prepararPedido()` ao lado de `anuncioDaVenda()` (só venda online; o cambista
não entra). **É estatística, nunca decide dinheiro**, e a tela diz que é
estimativa. **[decidir]** se cada produto atribui o seu (o mesmo pedido pode
contar para uma patrocinada e para um banner) ou só o último clique entre os
dois. Como mexe no fluxo do pedido (`server/services/orders.ts`), vai em PR
próprio e fica por último.

## 8. Provas e divisão em PRs

### 8.1 Provas

- **`tests/bannerPago.test.ts` (vitest) ampliado**: configuração (só as chaves
  conhecidas, faixas ordenadas e que só crescem, faixa acima do máximo, mínimo
  maior que máximo, padrão nasce desligado, config guardada **sem** os campos
  novos ainda valida); `precoDoBanner` com e sem faixa (sem faixa, igual a
  hoje); `precoDoBannerPorClique` (para baixo, mínimo, máximo, faixa na
  fronteira); `sobraDoBannerPorClique`; **a soma de cada clique é exatamente o
  valor pago** (varredura de `valor` de 0 a R$ 30,00 e de `comprados` de 1 a
  200, no desenho do teste de `gastoAte` em `tests/patrocinio.test.ts`) e **gasto + sobra = valor
  pago** nos dois modos; `resumoDoPedido`; `previsaoDaFilaDoBanner`
  (vaga vazia, fila maior que as vagas, janelas diferentes).
- **`scripts/banner-pago-test.ts` (`npm run banner`) ampliado**, contra a API
  de verdade, em seções novas: configuração com o bloco `clique` (liga,
  recusa inválido, PUT de uma chave só **não** zera o resto); pedido por
  clique (preço fotografado, saldo sai na hora, `modo` desconhecido 400, modo
  clique desligado 404, sem saldo nada fica); aprovar → entra no ar com `fim =
  agora + prazo máximo`; exibição devolve comprovante só para banner no ar e
  não-robô; **clique honesto**: sem comprovante, com comprovante de outro
  aparelho, de outro banner, robô, repetido em 24 h e acima do teto por IP —
  todos barrados e sem cobrar; **corrida no último clique**: um banner com
  poucos cliques restantes (ex.: 3) e dezenas de aparelhos clicando ao mesmo
  tempo, cada um com comprovante válido (assinado no próprio script com
  `comprovanteDaExibicao(id, aparelho, agora)` no passado, mesma
  `SESSION_SECRET` do servidor) — exatamente 3 cobram, `cliques_usados =
  cliques_comprados`, a soma de `banner_cliques.valor_cents` é o valor pago,
  `status = encerrado`, `encerrado_por = cliques`, devolvido zero, e o
  próximo da fila **já entrou** no ar; **clique × relógio** (o prazo vence
  durante a corrida: ou o clique entra antes e a sobra desconta, ou depois e é
  barrado — nunca os dois, nunca sobra a mais); prazo máximo vencido com
  cliques sobrando: encerra, devolve `valor − gastoAte(usados)` uma vez só
  (relógio duas vezes não devolve de novo, a chave decide); rifa fora do ar;
  dia e clique na mesma fila (ordem de aprovação, vaga liberada pelo último
  clique); **o livro fecha**: Σ lançamentos `banner*` = Σ gasto dos dois modos,
  contando os cliques de `banner_cliques`.
  O teto por IP precisa de clientes que o servidor veja com IPs diferentes
  (`trust proxy` está ligado em `server/auth.ts`); a prova usa o cabeçalho de
  encaminhamento ou fica nos 3 do mesmo IP, como a das patrocinadas.
- **`npm run isolation`**: as linhas da seção 6.
- **`npm run telas`** (60 telas × 390/820/1440), sem reprovação, na aba do
  banner nas duas visões (organização e plataforma).
- Antes de cada PR: `npx tsc --noEmit -p .`, `env -i PATH="$PATH" HOME="$HOME"
  npx vitest run`, `npm run build`, e as provas do assunto com o servidor da
  cópia no ar.

### 8.2 Os PRs, pequenos, na ordem

| # | O que entra | Risco | Notas |
|---|---|---|---|
| 1 | **Regras e esquema, sem mudar comportamento.** `shared/bannerPago.ts` (config nova, preços, sobra, resumo, previsão), `validarFaixas()` extraída de `shared/patrocinio.ts`, colunas e tabelas em `shared/schema.ts`, a rota `PUT /banner-pago/config` partindo da atual, vitest. `clique.ligado = false` | **baixo** em código; **médio no `db:push`** | `db:push` antes do código (`docs/ORDEM-DE-LANCAMENTO.md`); o `DROP NOT NULL` e o `check` não perdem dado. O `PUT` que parte da atual só deixa de zerar o que faltou no corpo; a prova de hoje já manda o objeto inteiro ao ligar, e ganha um caso de uma chave só. |
| 2 | **Clique honesto, nos dois modos, sem cobrar nada.** `…/exibicoes`, `…/clique`, `banner_cliques`, `banner_diario`, observador e `POST`s em `BannersVitrine.tsx`, números no painel (só leitura). No modo dia grava com `valor_cents = 0` | **médio**: toca a página mais vista e abre dois endpoints públicos | Sozinho já dá exibições, cliques e barrados a quem comprou dias — o dado para decidir os preços do clique. Limite por IP, robô e 204 sempre. Prova: o clique honesto, sem corrida de saldo. |
| 3 | **Comprar por clique, fila e encerramento (servidor).** `comprarBanner()` com `modo`, `registrarCliqueDoBanner()` cobrando (o `UPDATE` condicional), `encerrarBannersPagos()` com a sobra do clique, `promoverBannersPagos()` chamada depois do último clique, `encerrado_por` | **alto**: dinheiro, relógio e corrida | `npm run banner` ampliado inteiro (corrida do último clique, clique × relógio, livro fecha). `clique.ligado` segue desligado em produção: sem a tela do PR 4 ninguém liga por engano. |
| 4 | **Telas.** Escolha do modo, resumo com a conta em texto, painel da organização (barra, exibições, barrados, motivo do fim, previsão), configuração em dois cartões e a fila da plataforma; extrações (`Barra`, editor de faixas) | **baixo a médio**: acessibilidade e `npm run telas` | Entrada em `docs/VERSOES.md`; checar o limite de linhas `aguardando leva` antes. |
| 5 | **Fechamento da documentação** | **baixo** | Pode estar espalhada pelos PRs 1 a 4, mas conferir tudo aqui (seção 8.3). Liga-se `clique.ligado` no painel só depois da prova verde em produção e do `db:push`. |
| 6 | **Venda atribuída** (opcional) | **médio**: mexe em `orders.ts` | Coluna `orders.banner_pedido_id`; `bannerDaVenda()`; mostra "vendas depois do clique" como estimativa. Só depois das decisões da seção 9. |

### 8.3 Documentação no mesmo PR de cada passo

`CLAUDE.md` (seção "Banner pago na vitrine" e a linha de "Onde mexer" do
banner pago), `docs/PENDENCIAS.md` (o item #47 fecha; abrir o do expurgo de
`banner_cliques` e o da ordem dos slides), `docs/ORDEM-DE-LANCAMENTO.md` (o
`db:push` antes do código, PRs 1 e 6), `.claude/skills/provar/SKILL.md` (a
linha `banner` ganha o que a prova cobre agora), `.github/workflows/ci.yml`
(a variável `SESSION_SECRET` para a prova assinar o comprovante, se ainda não
estiver no passo do banner), `docs/VERSOES.md` (PR 4) e a matriz de
reformulação: **`npm run matriz`** (nunca à mão) toda vez que entrar rota da
API ou cartão novo — `tests/matrizReformulacao.test.ts` falha com a matriz
velha ou com seção/cartão sem linha de destino
(`npm run matriz -- --destinos`).

## Decisões do responsável (18/10/2026)

Respostas às perguntas da seção 9 (as que não aparecem aqui seguem abertas):

- **Preço do clique, pacote mínimo e prazo máximo são configuração da
  plataforma**: o administrador define no painel (Marketing → Publicidade →
  Banner na vitrine) e **o que ele definir vale, na hora, para a tela de
  compra da organização** (a tela lê a configuração; nenhum valor fica
  escrito no código além do padrão de fábrica). Para o padrão de fábrica:
  R$ 1,00 por clique e 30 dias de prazo máximo; o pacote mínimo ficou como
  decisão do admin (o responsável citou 1.000 cliques; o documento de preços
  propunha 100).
- **Vagas compartilhadas** entre o modo por dia e o por clique: uma fila só,
  por ordem de aprovação.
- **O clique da própria organização não conta** (nem cobra nem entra no gasto
  do pacote).
- **A ordem dos slides pagos gira a cada visita**: cada visita começa por um
  slide diferente, em rodízio, para os pagantes receberem a primeira posição
  na mesma proporção.
- **Venda atribuída por produto**: o banner tem a atribuição dele (coluna
  própria `orders.banner_pedido_id`) e a patrocinada a dela; um produto não
  rouba a venda do outro.

## 9. Decisões que ainda faltam

Do responsável (negócio):

1. **Preço do clique do banner, pacote mínimo e prazo máximo**: R$ 1,00, 100
   cliques e 30 dias (item 4 de `SUGESTAO-PRECOS-PUBLICIDADE.md`) estão só como
   proposta. Qual teto de cliques por pedido (`maximoCliques`)?
2. **Faixas de desconto**: por volume de cliques (quais degraus? hoje vazio) e
   por período no modo dia (7 dias 10% e 30 dias 20% é proposta, item 3 do
   mesmo documento). E o preço do dia (R$ 20,00 ou R$ 30,00) e o mínimo de
   dias (1 ou 3), itens 1 e 2.
3. **Vagas**: os dois modos dividem as mesmas vagas na ordem de aprovação
   (proposta), ou algumas vagas ficam reservadas a um modo?
4. **Encerrar antes**: a organização pode encerrar o banner por clique já no
   ar, recebendo a sobra em crédito? (Hoje nenhum modo permite depois de
   aprovado.)
5. **Clique da própria organização** (sessão de painel dela) conta ou é
   barrado?
6. **Ordem dos slides pagos**: fixa por início (hoje) ou girando por visita,
   para reduzir o viés do primeiro slide?
7. **Atribuição de venda**: cada produto atribui o seu, ou só o último clique
   entre patrocinada e banner?

Técnicas a confirmar no PR 1 ou 2:

8. **Comprovante por exibição de slide** (proposta B) ou na entrega da lista
   (A, mais simples)?
9. **Teto por IP do banner**: o mesmo `CLIQUES_POR_IP` (3) ou um próprio?
10. **Guarda de `banner_cliques`**: por quanto tempo, e a Privacidade precisa
    de frase nova?

Para o advogado e o contador (`docs/PERGUNTAS-AO-ADVOGADO.md`, junto das outras
de publicidade): o contrato com a promotora e os Termos precisam dizer que a
plataforma **não garante número de cliques nem prazo de exibição** (só o
prazo máximo), que o clique cobrado é o que passa pelas regras de contagem
(os barrados não são cobrados e a organização não os audita), e que o saldo
não usado volta como crédito. Ao contador: quando o valor do banner por clique
vira receita — na compra (como hoje, no débito do saldo), no clique gasto ou
na devolução do que não foi usado — e se muda algo em relação ao banner por dia.
