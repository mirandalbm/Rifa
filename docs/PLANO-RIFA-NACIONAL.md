# Plano da rifa nacional (18/10/2026)

> **Só plano: nenhum código muda neste documento.** Escrito em 18/10/2026 a
> partir do que o responsável decidiu no mesmo dia. O que **não** foi decidido
> não virou regra: está marcado **[proposta]** (a recomendação técnica, a
> confirmar) ou **[pergunta]** e volta na lista do fim. As perguntas jurídicas
> estão em `docs/PERGUNTAS-AO-ADVOGADO.md` (quarta rodada, R24 a R29).
> Leia antes: o `CLAUDE.md` (invariantes 1, 4, 5, 7, 13, 15 e as seções
> "Endereço e região", "Editar e adiar rifa publicada" e "Vitrine") e o
> `docs/PLANO-RIFA.md` (§2, a vitrine multi-rifas, e §4, o modelo de dados).

## 0. O que já está decidido

1. Existe o conceito de **rifa nacional**.
2. O valor mínimo vale sobre a **arrecadação total**: cotas × preço, em
   centavos inteiros. É **R$ 100.000** (10.000.000 centavos), **configurável
   pela plataforma**, e nasce neste valor.
3. **Só o administrador geral aprova.** A organização pede.
4. A rifa nacional tem **ordem no topo** da vitrine.
5. Depois dela vêm os **banners por estado** (seção 9, só a dependência).

Em linguagem simples: a organização que tem uma rifa grande pede o título de
"nacional"; a plataforma confere e aprova; a rifa passa a abrir a vitrine de
todo mundo, em qualquer estado, e leva o selo "Nacional" escrito.

## 1. Como isso muda "localização ordena, nunca esconde"

### Hoje

`ordenarPorProximidade()` (`shared/endereco.ts`) põe a cidade de quem olha
primeiro, depois o estado, depois o resto, de forma **estável**: dentro de
cada faixa fica a ordem que já vinha (`featured`, `sort_weight`,
`published_at`, em `listPublicCampaigns()` de `server/services/campaigns.ts`).
Quem chama: `GET /api/public/campaigns` (`server/routes/public.ts`, a
vitrine) e `GET /api/public/reels`. A regra do `CLAUDE.md` ("Endereço e
região") é que filtro por região seria rifa que some para quem mora longe;
`/estado/UF` é a única exceção, e é escolha explícita da pessoa.

### Depois

A regra continua sendo "**ordena, nunca esconde**". O que se acrescenta é uma
camada **antes** da proximidade: a rifa nacional aprovada tem **lugar fixo no
topo, igual para todos, com ou sem região escolhida**. Nenhuma rifa some:

```
vitrine = [nacionais aprovadas, até o teto, em ordem própria]
        + ordenarPorProximidade(todas as outras, região de quem olha)
```

- **`ordenarPorProximidade()` não muda** (continua pura e com o
  `tests/endereco.test.ts` intacto). Uma função nova e pura,
  `ordenarVitrine(rifas, perto, { teto })`, em `shared/rifaNacional.ts`, faz
  a separação e chama a antiga para o resto. Um lugar só decide a ordem; o
  `GET /campaigns` passa a chamá-la no lugar de `ordenarPorProximidade()`.
- **Várias nacionais**: ficam todas no topo, **até o teto**
  (`rifaNacional.teto`, config da plataforma). A que passa do teto **não
  some**: cai no resto da vitrine e é ordenada como qualquer outra rifa, por
  proximidade. É a mesma ideia de "nunca esconde".
- **A mesma rifa aparece uma vez só** (no topo ou no resto, nunca nos dois).
- **A região não mexe nas nacionais.** A nacional de outro estado fica em
  cima mesmo para quem escolheu "Rifas perto de: São Paulo".
- **O selo vem do servidor** (`nacional: true` no cartão do feed, só o
  booleano), nunca do aparelho.

### Ordem entre as nacionais **[pergunta]**

Opções, com a inclinação técnica:

| Opção | Como | Custo no código | Observação |
|---|---|---|---|
| A. Aprovada há mais tempo primeiro **(inclinação)** | `nacional_aprovada_em` crescente, `id` desempata | nenhum a mais | Determinística e estável (a lista não pula entre uma visita e outra); mas a mais antiga fica na frente enquanto durar |
| B. Sorteio mais próximo primeiro | `draw_at` crescente | nenhum a mais | Urgência natural; rifa sem data ("quando completar") precisa de regra de empate |
| C. Ordem escolhida pelo master | coluna `nacional_ordem` e uma tela | uma coluna, uma rota | Mais controle, mais trabalho do master |

A decisão é de produto. O resto do plano vale para qualquer uma das três; só a
opção C acrescenta a coluna `nacional_ordem` (e outro `db:push`).

### O teto **[pergunta]**

Quantas nacionais cabem no topo. Proposta de partida: **3**, configurável
(1 a 10). O teto é aplicado **na hora de montar a lista**, não na aprovação:
aprovar não conta nacionais (nada de `COUNT(*)` e nenhuma corrida entre dois
aprovadores). Se a decisão for **barrar** a aprovação quando o topo está cheio,
isso muda o modelo (vira uma contagem sob trava) e é pergunta à parte.

### Onde a ordem do topo **não** vale (escopo da decisão: "topo da vitrine")

Sem decisão em contrário, o plano **só toca o feed da vitrine**
(`GET /api/public/campaigns`). Ficam como estão, e cada uma é pergunta se o
responsável quiser mudar:

- `/estado/UF` (`?estado=`): é filtro explícito pela UF da organização. A
  nacional de outro estado **não** entra nessa página, como hoje. **[pergunta]**
- Reels (`GET /api/public/reels`, que também usa `ordenarPorProximidade()`).
- Buscar (ordem por mais novas ou mais curtidas), perfil da organização,
  fileira de rifas do sorteio oficial, rifas patrocinadas (têm bloco próprio e
  se identificam como "Patrocinada").
- `featured` e `sort_weight`: seguem valendo **dentro** do resto da vitrine; a
  nacional vem antes de ambos.

## 2. Modelo de dados mínimo

Tudo sobe com o `db:push` **antes** do código (e entra em
`docs/ORDEM-DE-LANCAMENTO.md`). Nada de `COUNT(*)`: o teto é fatia de lista, e
a arrecadação é uma conta, não um contador.

### Colunas novas em `campaigns` (`shared/schema.ts`)

| Coluna | Tipo | Para quê |
|---|---|---|
| `nacional_status` | `text` nula, `CHECK` em `('em_analise','aprovada')` | O estado **de agora** na própria linha da rifa. Nula = comum. A vitrine e o `PATCH` leem daqui, sem junção |
| `nacional_aprovada_em` | `timestamp` nula | Quando o master aprovou (a ordem, na opção A) |
| `nacional_arrecadacao_cents` | `bigint` nula | A arrecadação **fotografada** no pedido e conferida na aprovação |
| `nacional_minimo_cents` | `integer` nula | O mínimo em vigor **quando aprovou**. Mudar a config depois não derruba quem já foi aprovada (a mesma ideia da cobrança fotografada, invariante 13) **[proposta]** |

`bigint` porque cotas × preço passa de 2³¹: até 1.000.000 de cotas × o maior
`price_cents` inteiro dá ~2,1 × 10¹⁵ centavos. Cabe com folga em `number`
seguro no JavaScript (limite 9 × 10¹⁵), mas **no SQL a conta é sempre
`total_quotas::bigint * price_cents::bigint`**, nunca inteiro de 32 bits.

Índice parcial só se medir necessidade:
`idx_campaigns_nacional (nacional_aprovada_em) WHERE nacional_status = 'aprovada'`.

### O pedido é uma fila: reaproveita `campanha_solicitacoes` **[proposta]**

`campanha_solicitacoes` já dá protocolo (`RS-…`), conversa dos dois lados
(`campanha_solicitacao_mensagens`), recorte por organização, índice parcial
de "um em análise por rifa e tipo" (`uq_solicitacao_rifa_em_analise`, que
cobre o tipo novo sem mudança), e a Caixa de entrada já lista essa tabela. O
pedido nacional entra como **tipo novo** `nacional` em `solicitacao_tipo`.

- **O arquivo do pedido** fica em `alteracoes` (jsonb, que já existe):
  `{ totalQuotas, priceCents, arrecadacaoCents, minimoCents }` — o retrato do
  que foi pedido. Nenhuma coluna nova na tabela de solicitações.
- **Estados do pedido** (`solicitacao_status`, os que já existem):
  `em_analise` → `aprovada` | `recusada` | `cancelada`. A recusa exige
  resposta (já é a regra). **Perder a condição depois de aprovada** (seção 4)
  não é um estado do pedido: é `campaigns.nacional_status` voltando a nulo, com
  auditoria e aviso.
- **Atenção ao código existente**: `decidirSolicitacao()` em
  `server/services/solicitacoes.ts` trata todo tipo que não é `edicao` como
  adiamento (o `else`). Ao acrescentar o tipo, essa ramificação **precisa ser
  reescrita para tratar o tipo explicitamente** (`switch` com erro no tipo
  desconhecido). Também `cancelarSolicitacao()` precisa limpar
  `campaigns.nacional_status` quando o pedido cancelado é nacional.
  `ALTER TYPE … ADD VALUE` entra pelo `db:push`; conferir a versão do
  Postgres e o comportamento do `drizzle-kit` na PR do esquema.
- **Alternativa se o responsável preferir não tocar nesse `else`**: tabela
  própria `rifa_nacional_pedidos`, com o mesmo molde (protocolo, status,
  índice parcial `uq_nacional_em_analise`, mensagens) e uma linha nova na
  Caixa. É mais código e mais tela repetida; a recomendação segue sendo
  reaproveitar.

### Operações e o `UPDATE` condicional

A **fonte da verdade do estado é `campaigns.nacional_status`**; a linha em
`campanha_solicitacoes` guarda protocolo, conversa e histórico. As duas mudam
**sempre na mesma transação**.

- **Pedir** (`POST /campaigns/:id/nacional`): trava a rifa (`FOR UPDATE`),
  confere (seção 3) e faz um único `UPDATE campaigns SET nacional_status =
  'em_analise', nacional_arrecadacao_cents = … WHERE id = … AND
  nacional_status IS NULL AND status IN ('draft','published') AND
  travada_em IS NULL AND total_quotas::bigint * price_cents::bigint >=
  <mínimo>`. Zero linhas = 409 (já há pedido ou aprovação, ou deixou de
  caber). Em seguida o `INSERT` do pedido com `ON CONFLICT DO NOTHING` pelo
  índice parcial. Nunca um `SELECT` para ver "se pode" seguido de gravação
  (invariante 11).
- **Decidir** (`POST /solicitacoes/:id/decidir`, o existente, agora com o
  ramo `nacional`): trava o pedido (`FOR UPDATE`) e **depois** a rifa — a
  mesma ordem das solicitações de hoje. Aprovar é um `UPDATE campaigns SET
  nacional_status = 'aprovada', nacional_aprovada_em = now(),
  nacional_minimo_cents = <mínimo de agora> WHERE id = … AND nacional_status
  = 'em_analise' AND <arrecadação ≥ mínimo> AND travada_em IS NULL`, e o
  pedido vai a `aprovada` com `UPDATE … WHERE status = 'em_analise'`. Dois
  cliques, uma decisão e um 409. Recusar volta `nacional_status` a nulo.
- **Retirar a condição**: a organização "abre mão" (`DELETE
  /campaigns/:id/nacional`, cancela o pedido em análise ou tira a aprovação) e
  o master revoga com motivo (`POST /campaigns/:id/nacional/revogar`, 403 para
  organizador). Os dois são `UPDATE … WHERE nacional_status IS NOT NULL`.
- **Auditoria na mesma transação** (`audit_log`): `nacional.pedir`,
  `nacional.aprovar`, `nacional.recusar`, `nacional.cancelar`,
  `nacional.abrir_mao`, `nacional.revogar` — com a arrecadação, o mínimo, o
  protocolo e quem decidiu. A organização lê "Plataforma"; a pessoa fica na
  auditoria (o padrão das solicitações).
- **Ordem das travas**: solicitação → rifa (a de `decidirSolicitacao()`). O
  `pedir`, que ainda não tem solicitação, trava a rifa e só então insere. O
  `revisor-de-invariantes` deve conferir que nenhum caminho inverte isso.

### Configuração da plataforma (`shared/plataforma.ts`)

Chave nova `rifaNacional` em `ConfigPlataforma`, com validação que só guarda
chaves conhecidas e **parte da configuração atual** (quem salva um pedaço não
apaga o resto):

| Campo | Padrão | Regra |
|---|---|---|
| `ligado` | `false` | Interruptor. **Nasce desligado** (muda o que a vitrine mostra a todos) **[proposta; confirmar]** |
| `minimoCents` | `10_000_000` (R$ 100.000, decidido) | Inteiro positivo, com teto de sanidade (ex.: R$ 100 milhões); a plataforma muda quando quiser |
| `teto` | `3` **[pergunta]** | 1 a 10 |

`PUT /admin/rifa-nacional/config` (ou dentro do `PUT /admin/app`, onde moram
`buscarLigado` e `reelsLigado`; escolher na PR do esquema), **403 para
organizador**, leitura liberada à organização para mostrar o mínimo.
**Desligado**: `POST` do pedido responde 404 à organização, a vitrine **ignora**
as nacionais (volta ao `ordenarPorProximidade()` de antes) e os dados ficam
guardados para quando ligar de novo.

## 3. Quando o mínimo é conferido

**A conta** é uma função pura, `arrecadacaoDaRifa(totalQuotas, priceCents)`, em
`shared/rifaNacional.ts`: produto de dois inteiros, sem divisão e sem
ponto flutuante, com guarda `Number.isSafeInteger`. `atingeOMinimo(arrecadacao,
minimoCents)` é `>=` (o mínimo é inclusivo: exatamente R$ 100.000,00 atinge
**[pergunta de confirmação]**). A tela e o servidor leem a mesma função
(invariante 5: o front não envia preço; ele mostra a conta do que o servidor
tem). Entram **só** `total_quotas` e `price_cents`; pacotes com desconto, cupom,
cota de bônus e cota premiada **não** entram — a decisão foi "cotas × preço".

**Três momentos**, todos no servidor:

1. **No pedido.** Abaixo do mínimo, 422 com a falta dita em reais ("Faltam
   R$ X para chegar ao mínimo de R$ 100.000"). É cortesia que poupa o tempo do
   master; quem decide é o `UPDATE` condicional.
2. **Na aprovação**, dentro da transação, **relendo** `total_quotas` e
   `price_cents` da rifa travada (nunca os do retrato do pedido) e contra o
   mínimo **de agora**. Se não bate, 409 "recuse o pedido".
3. **Na publicação** (`publishCampaign()`), para a rifa que chegou aprovada em
   rascunho: se total e preço ficaram travados pelo pedido (saída recomendada,
   abaixo), não há o que reconferir e a publicação segue o caminho de sempre.
   Se a decisão for a outra (invalidar em vez de travar), `publishCampaign()`
   reconfere dentro da transação, com a rifa já travada, e tira a aprovação que
   não vale mais.

### E se preço ou total ainda mudam no rascunho

Total e preço só travam ao publicar (invariante 7, `LOCKED_AFTER_PUBLISH` em
`server/services/campaigns.ts`). O pedido pode ser feito no rascunho (a
organização quer saber antes de publicar). Duas saídas **[pergunta]**:

- **Travar enquanto houver pedido ou aprovação (recomendada).** Com
  `nacional_status` não nulo, o `PATCH /campaigns/:id` que mude `totalQuotas`
  ou `priceCents` responde 409: "Esta rifa pediu ser nacional: abra mão do
  pedido para mudar total ou preço." A guarda **não consulta antes**: o
  `UPDATE` do `PATCH` ganha `AND nacional_status IS NULL` quando o corpo toca
  esses dois campos; zero linhas = 409. Como `pedir` e o `PATCH` disputam a
  mesma linha, a corrida se resolve ali (no `READ COMMITTED` o `UPDATE`
  reavalia a condição depois de esperar a trava). `assertEditable()` ganha a
  regra para a mensagem. É a saída que **não perde aprovação calada**.
- **Invalidar.** O `PATCH` que mude total ou preço apaga a aprovação (e cancela
  o pedido em análise) na mesma transação, com aviso na tela antes de salvar e
  na auditoria. Mais flexível; mas o master aprovou **aquele** número, e a
  rifa pode ficar abaixo do mínimo sem que ninguém perceba.

Nos dois casos, **rifa já publicada não tem o que reconferir**: total e preço
estão travados, o produto é fixo, e o retrato da aprovação nunca diverge.
Não há "preço muda" depois de publicar, nem para a plataforma (a regra vale
inclusive para o adiamento e a edição aprovados, que não tocam esses campos).

**A mudança do mínimo da config** não mexe em quem já foi aprovada (o retrato
está em `nacional_minimo_cents`); vale para os pedidos e aprovações seguintes
**[proposta; confirmar]**.

## 4. O que acontece com a rifa nacional

| Evento | O que acontece | Por quê |
|---|---|---|
| **Adiada** (adiamento aprovado) | Segue nacional. Só a data muda; arrecadação (total × preço) não muda. O selo continua e a ordem continua (na opção B, a ordem se recalcula pela data nova) | O adiamento não toca total nem preço (`pedirAdiamento()`) |
| **Travada pela plataforma** (denúncia, `travada_em`) | **A flag fica** `aprovada`, mas a rifa **sai da vitrine** (`listPublicCampaigns()` já exclui travada), logo não ocupa o topo. Destravada, volta ao lugar | Travar é transitório; apagar a aprovação criaria trabalho de refazer sem culpa da organização |
| **Organização banida** | Todas as rifas travam (regra de hoje). A flag fica, nada aparece | Mesma razão |
| **Tirar do ar** (`tirarDoAr()`, só sem venda) | Volta a rascunho: **a aprovação cai** (`nacional_status` nulo) **[proposta]** — no rascunho total e preço voltam a mudar, e a aprovação era daquele número | Evita aprovação de um valor que deixou de estar travado |
| **Sorteada** (`drawn`) ou **encerrada** (`closed`) | Sai do feed (a vitrine só lista `published`), logo sai do topo. A flag fica como história; a página do resultado pode seguir mostrando "Nacional" **[pergunta]** | Não há mais o que fixar |
| **Excluída** (`excluirRifa()`) | Cascata leva o pedido; nada a fazer | `campanha_solicitacoes` tem `onDelete: cascade` na rifa |
| **Perde a aprovação** (master revoga, a organização abre mão, tirar do ar) | `nacional_status` = nulo na mesma transação, auditoria, e o aviso ao dono (sino do painel, e push se já houver o tipo de aviso) com o motivo | O selo e o topo saem na hora |
| **Interruptor desligado** | A vitrine ignora as nacionais; nada é apagado | A flag é dado da rifa |
| **Mínimo da config muda** | Não derruba aprovada (retrato fotografado) | Seção 3 |
| **Estorno** (`refundOrder()`) | Nada. Arrecadação é cotas × preço, não venda feita | Decisão do responsável |

**Cobrança não muda.** A taxa da venda e a do Pix (invariante 13) são as
mesmas; nacional não é plano, só visibilidade. Se o responsável quiser cobrar
o topo, é decisão nova e vira pergunta jurídica/contábil (R28).

## 5. Recorte entre organizações (invariante 15)

- **Pedir, abrir mão e ler o próprio estado**: `assertCampaignInScope(req,
  id)` antes de tudo. A rifa do vizinho é **404** (nunca 403). O organizador
  pede **só da dele**.
- **Aprovar, recusar e revogar**: **só a plataforma**. Organizador recebe
  **403** (rota que todo mundo sabe que existe), inclusive a ação que passa pelo
  `POST /solicitacoes/:id/decidir` (já é só da plataforma).
- **O pedido do vizinho** (ler, mandar mensagem, cancelar) é 404, pelo
  `noRecorte()` das solicitações.
- **Config**: `PUT` 403 para organizador; `GET` liberado (mostra o mínimo).
- **Caixa de entrada** já é só da plataforma (403 no `npm run isolation`).
- **Público**: o cartão do feed leva só `nacional: true|false`. Nunca a
  arrecadação, o mínimo, a data da aprovação nem o protocolo.
- **Entra em `scripts/isolation-test.ts`**, rota por rota: `POST` e `DELETE`
  `/campaigns/:id/nacional` da rifa do vizinho (404); `revogar` e o `PUT` da
  config como organizador (403); o pedido do vizinho em `GET /solicitacoes/:id`
  (404); e, no conteúdo, a vitrine **sem** nenhum campo da aprovação.

## 6. Telas

- **Pedido, na aba "A rifa"** (`client/src/components/RifaNacionalCard.tsx`,
  ao lado de `AgendarPublicacaoCard` e `CobrancaDaRifa`): a conta
  "50.000 cotas × R$ 2,00 = R$ 100.000,00" com a mesma função pura do
  servidor, a faixa do mínimo ("falta R$ X" ou "atinge o mínimo"), a situação
  em `<Pill>` com rótulo em texto (**Sem pedido** · **Em análise** ·
  **Nacional** · **Recusado**, com a resposta da plataforma), e os botões
  "Pedir para ser rifa nacional" (desabilitado com o motivo escrito quando
  abaixo do mínimo; o servidor confere de qualquer jeito) e "Abrir mão". Se
  total e preço estão travados pelo pedido, o campo mostra o aviso da seção 3.
  Número de dinheiro em `tnum`. Desligada a config, o cartão não aparece.
- **Fila do master**: tipo `nacional` na Caixa de entrada (`TIPOS_DA_CAIXA`
  em `shared/caixa.ts`, destino `/admin/atendimento?aba=rifas`, consulta
  em `caixaDeEntrada()` ao lado de `edicao`/`adiamento`, sem dado pessoal:
  organização, rifa e protocolo) e a decisão em Atendimento → Rifas
  (`SolicitacoesDeRifa.tsx`, que ganha o ramo do tipo: arrecadação, mínimo,
  a rifa, aprovar/recusar com a conversa de sempre). `tests/caixa.test.ts`
  cobra o tipo novo.
- **Selo "Nacional" em TEXTO**: `<Pill>` na foto do cartão (`CartaoDoFeed.tsx`)
  e na página da rifa (`Rifa.tsx`), tom azul (o token chamado `yellow`),
  nunca só cor nem só ícone. Mesma regra de "Patrocinada". Texto de
  explicação na ajuda (`shared/ajuda.ts`, pergunta nova com `id` único).
- **Config da plataforma**: cartão na tela do master (candidato: Aparência →
  Topo do app, onde moram `buscarLigado` e `reelsLigado`; ou Marketing, onde
  vão morar os banners por estado — decidir na PR da tela). Mostra o mínimo em
  reais (campo com rótulo), o teto e o interruptor.
- **Registro de versões**: tela mudada entra em `docs/VERSOES.md` como
  `aguardando leva`. Hoje há **5** (a 11ª derruba `tests/versoes.test.ts`), então
  cabem as PRs de tela deste plano sem pedir a leva; conferir a contagem no
  dia de cada PR.

## 7. Artes, regulamento, Termos, ajuda e perguntas ao advogado

Vale o princípio do `CLAUDE.md`: texto que promete o que o sistema não faz é
pior que texto nenhum, e regra nova que toque o apostador muda o texto no
mesmo PR.

- **Artes** (`shared/artes.ts`, `server/services/artes.ts`): **sem mudança**.
  A arte mostra os dados oficiais da rifa; o selo "Nacional" é curadoria da
  plataforma e não vai para a peça que a organização e o afiliado postam
  **[pergunta de produto]**. A legenda sugerida (`legendaSugerida()`) também não
  cita.
- **Regulamento** (`montarRegulamento()`): **sem cláusula nova prevista.** A
  rifa nacional não muda regra de sorteio, apuração, preço, reembolso nem
  prêmio. O mínimo e a ordem do topo são regra **da plataforma**, não da
  promoção. Se o advogado disser que a abrangência da autorização deve constar,
  entra aqui (R24).
- **Termos de uso** (`montarTermosDeUso()` em `shared/legal.ts`): **se** a
  ordem do topo for tratada como critério de destaque, o critério tem de estar
  dito em linguagem clara (R26). Sobe `VIGENCIA_DOS_TERMOS` nesse caso.
- **Contrato da plataforma com a promotora**: a regra do pedido (mínimo,
  aprovação pela plataforma, revogação com motivo) provavelmente precisa estar
  no contrato ou num anexo; hoje o contrato não fala disso. A redação é do
  advogado, e este plano não a escreve (R24 a R26).
- **Ajuda** (`shared/ajuda.ts`): uma pergunta "O que é rifa nacional?" que
  diga o que o selo é e o que **não** é.
- **Dúvidas jurídicas** (todas **perguntas**, nenhuma resposta presumida),
  acrescentadas em `docs/PERGUNTAS-AO-ADVOGADO.md`, "Quarta rodada", R24 a R29:
  1. **R24 [1]** "Nacional" e o âmbito da autorização SPA/MF.
  2. **R25 [1]** O valor maior muda alguma exigência da SPA/MF?
  3. **R26 [2]** A ordem do topo é publicidade/curadoria e precisa ser
     identificada e ter critério declarado?
  4. **R27 [2]** O selo "Nacional" pode ser lido como aval? Texto sugerido.
  5. **R28 [2]** Se um dia o topo for cobrado: é serviço à parte?
  6. **R29 [3]** "Arrecadação prevista" (cotas × preço, potencial) ao
     consumidor exige ressalva?

## 8. Provas e divisão em PRs

### Provas

**`npm run rifa-nacional`** (`scripts/rifa-nacional-test.ts`, contra a API de
verdade, porta própria, devolve o estado de antes; entra em
`.github/workflows/ci.yml` e na tabela de `.claude/skills/provar/SKILL.md`):

1. Config: nasce desligada com R$ 100.000; organizador não grava (403); lê.
2. Desligada: o pedido é 404; a vitrine não muda.
3. Rifa de R$ 99.999,99 recusada no pedido (422); R$ 100.000,00 aceita (limite
   inclusivo); 1.000.000 de cotas × R$ 0,10 e 100 cotas × R$ 1.000,00 também.
4. Dois pedidos da mesma rifa ao mesmo tempo: um 202, um 409 (o índice decide).
5. Aprovar duas vezes ao mesmo tempo: um 200, um 409.
6. Aprovar com total/preço mudados no meio (rascunho, sob a opção "travar"): o
   `PATCH` leva 409 enquanto houver pedido; sob "invalidar", a aprovação cai.
7. Mínimo subido depois de aprovar: a aprovada continua; o pedido novo usa o
   mínimo de agora.
8. Vitrine: a nacional abre a lista para quem olha de qualquer UF; a região
   segue ordenando o resto; teto respeitado, o excedente cai no resto sem
   sumir; a rifa não aparece duas vezes; só `nacional: true` no payload.
9. Travada sai da vitrine e volta ao destravar; tirar do ar derruba a
   aprovação; adiada segue nacional; recusar exige resposta.
10. Auditoria de cada passo gravada na mesma transação.

**`npm run isolation`**: as entradas da seção 5.

**Testes `vitest`** (`tests/rifaNacional.test.ts` e extensões):

- `arrecadacaoDaRifa` e `atingeOMinimo` nas bordas (9.999.999, 10.000.000,
  10.000.001; 1.000.000 × 1; o maior `price_cents` × 1.000.000 continua inteiro
  seguro; sem `NaN`).
- `validarConfigNacional` (só chaves conhecidas, mínimo inteiro positivo, teto
  1 a 10, parte da configuração atual).
- `ordenarVitrine`: sem nacional = idêntico a `ordenarPorProximidade`; com
  uma, duas e acima do teto; com e sem região; nacional da mesma UF de quem
  olha; estável; sem repetir; ordem entre nacionais conforme a opção escolhida.
- `tests/endereco.test.ts` **sem mudança** (prova que a função antiga ficou
  intacta); `tests/caixa.test.ts` com o tipo novo.
- `tests/aoVivo`/`vitrine` só se o cartão ganhar campo.

### PRs pequenas, em ordem

Cada PR leva a documentação do que fez (CLAUDE.md, `docs/PENDENCIAS.md`, este
plano, `docs/ORDEM-DE-LANCAMENTO.md` quando houver coluna, a skill `provar`,
o CI) e é revisada pelo `revisor-de-invariantes` antes de mesclar.

| # | PR | Conteúdo | Risco |
|---|---|---|---|
| 0 | **Este plano** | `docs/PLANO-RIFA-NACIONAL.md` e a quarta rodada em `docs/PERGUNTAS-AO-ADVOGADO.md` | Nenhum (só texto) |
| 1 | **Regras puras e config** | `shared/rifaNacional.ts` (conta, mínimo, `ordenarVitrine`, validação), `rifaNacional` em `shared/plataforma.ts` (desligada), `tests/rifaNacional.test.ts`. **Nada ligado** | Baixo. Risco: errar a borda do mínimo ou mudar `ordenarPorProximidade()` sem querer (o teste antigo segura) |
| 2 | **Esquema** | As colunas de `campaigns` e o tipo `nacional` em `solicitacao_tipo`; nota no `ORDEM-DE-LANCAMENTO` (db:push **antes** do código); `decidirSolicitacao()` com `switch` explícito (sem comportamento novo) | Médio. `ALTER TYPE ADD VALUE` pelo `drizzle-kit`; o `else` de adiamento reescrito sem mudar o que já funciona (`npm run solicitacoes` tem de passar igual) |
| 3 | **Serviço e rotas** | `server/services/rifaNacional.ts`: pedir, decidir (ramo no `decidirSolicitacao`), cancelar, abrir mão, revogar; a regra de total/preço no `PATCH`, `assertEditable()`, `tirarDoAr()`; auditoria; `scripts/rifa-nacional-test.ts` e entradas em `isolation` | **Alto** (o núcleo): corridas (pedido × `PATCH`, aprovar × aprovar), ordem das travas solicitação → rifa (deadlock), aprovação que cai calada. É a PR que o revisor lê linha a linha |
| 4 | **Vitrine** | `GET /campaigns` passa a usar `ordenarVitrine()`; `nacional` no cartão; selo `<Pill>`; ajuda; `npm run vitrine` e `telas` | Médio: mexe na tela inicial de **todo** mundo. Mitigação: com a config desligada o resultado é idêntico ao de hoje (o teste confere linha a linha); cuidar do cache da vitrine |
| 5 | **Telas do painel** | `RifaNacionalCard` (aba "A rifa"), ramo em `SolicitacoesDeRifa.tsx`, tipo na Caixa, cartão da config, `docs/VERSOES.md`, `npm run telas` | Médio-baixo: arranjo em 3 larguras e aviso de total/preço travado |
| 6 | **Texto jurídico** (quando as respostas chegarem) | Termos (e `VIGENCIA_DOS_TERMOS`), contrato/anexo, regulamento se pedirem, texto do selo | Depende de terceiros; **bloqueia ligar o interruptor, não o código** |

As PRs 1 a 5 podem ir ao ar com o interruptor **desligado**. Ligar em produção
é um ato da plataforma, depois da PR 6.

## 9. Dependência: banners por estado (sem detalhar)

Decidido: **carrossel de 5 em cada estado e no nacional**, com cadastro no
**portal de marketing**. Depois da rifa nacional porque:

- "Nacional" passa a ser **um escopo** que o código já conhece; o carrossel
  nacional reaproveita o nome e a lista de UFs (`ufValida` em
  `shared/endereco.ts`). Convém que a chave de escopo dos banners seja
  `nacional` ou uma UF, e não uma segunda definição.
- Os banners da plataforma de hoje são globais (`BANNERS_MAX` em
  `shared/vitrine.ts`, 5, cadastrados em Aparência; o banner pago é outro
  produto, `shared/bannerPago.ts`). A mudança para escopo por estado é um plano
  próprio, a escrever **depois** de a rifa nacional estar de pé.
- Perguntas que ficam para esse plano: quem cadastra (só a plataforma, ou a
  organização também), se o carrossel nacional é o dos atuais, e como o
  banner pago entra nos escopos.

## Decisões que ainda faltam

1. **Ordem entre as nacionais**: A (mais antiga aprovada primeiro, inclinação
   técnica), B (sorteio mais próximo) ou C (escolhida pelo master).
2. **Teto de nacionais no topo** (proposta 3) e se o excedente **cai no resto**
   (proposta) ou se a aprovação é **barrada** com o topo cheio.
3. **Total e preço no rascunho com pedido/aprovação**: travar (recomendada) ou
   invalidar a aprovação.
4. **Interruptor nasce desligado?** (proposta: sim) e o que a vitrine mostra
   para quem já foi aprovada quando desligado (proposta: ignora, sem apagar).
5. **O mínimo é inclusivo (`>=`)?** E o mínimo mudado vale só para pedidos
   novos, sem derrubar aprovada (proposta)?
6. **Escopo do topo**: só o feed da vitrine (proposta)? Entram `/estado/UF`,
   Reels, perfil, Buscar?
7. **Rifa da própria plataforma** (organização nula): pode ser nacional por
   concessão direta do master, sem pedido? Com o mínimo?
8. **Tirar do ar derruba a aprovação** (proposta), e **a página do resultado**
   mantém o selo "Nacional" depois do sorteio?
9. **Selo "Nacional" nas artes e na legenda sugerida?** (proposta: não)
10. **Cobrança do topo**: nenhuma (proposta, nada muda na taxa). Se algum dia
    houver, é decisão nova e passa por R28.
11. **Respostas do advogado** a R24 a R29, em especial R24 (abrangência da
    autorização) e R26 (critério de destaque declarado), antes de ligar em
    produção.
12. **Pedido em rascunho ou só publicada?** (proposta: os dois; em rascunho a
    organização sabe antes de publicar).
13. **Onde mora o cartão de configuração do master** (Aparência → Topo do app
    ou Marketing).
