# Gestão de tráfego pago como serviço da plataforma — plano

Rascunho de 09/10/2026. **Decidido**: modelo A (seção 2). **No código**: o
menu Marketing (Tráfego pago, Marketing AI, Publicidade da plataforma em
abas, Medição e campanhas), as fases 1 e 2 do Tráfego pago e a primeira
parte da 3 — a campanha criada no Meta pela API, pausada (seção 5) — e o
Marketing AI (plano de divulgação, textos de anúncio e leitura dos
resultados). A ideia: a plataforma anuncia as rifas das organizações no Google,
no Meta (Facebook e Instagram) e no TikTok, mede o que cada anúncio vendeu e
**ganha uma margem** sobre esse serviço. É uma ferramenta do painel do
administrador master, ao lado de Marketing, Patrocínio e Banner pago.

## 1. O que já existe e é reaproveitado

| Peça | Onde | Serve para |
|---|---|---|
| Saldo da organização, livro com chave única, recarga por Pix sem split | `shared/patrocinio.ts`, `server/services/patrocinio.ts` | Cobrar antes de gastar, sem saldo negativo |
| Retenção cautelar do saldo | `shared/retencao.ts` | O saldo de anúncio entra na mesma regra |
| Pixels, consentimento, UTM, compra pelo servidor | `shared/marketing.ts`, `server/services/marketing.ts` | Medir a venda que o anúncio trouxe |
| Relatório "Vendas por campanha" | `/admin/marketing` | O lado das vendas do resultado |
| Caixa de entrada da plataforma | `shared/caixa.ts` | Fila dos pedidos de campanha para a plataforma aprovar |
| Artes prontas, editor, reels gerado | Fases A, C, F | O criativo do anúncio sai da própria rifa |

## 2. Três modelos de lucro

**A. A plataforma compra a mídia (modelo agência).** As campanhas rodam nas
contas de anúncios **da plataforma**. A organização recarrega um saldo de
tráfego (o mesmo livro do patrocínio) e escolhe quanto investir em cada rifa;
a plataforma gasta e cobra **o investimento + uma taxa de gestão** (ex.: 15% a
20% sobre o gasto), debitando do saldo conforme o gasto real.
- Lucro: a taxa, cobrada sempre (com ou sem venda).
- A favor: controle total (criativo, orçamento, política de anúncios); a
  organização não precisa de conta em lugar nenhum; uma conta só para medir.
- Contra: a plataforma paga o Google, o Meta e o TikTok e repassa — vira
  intermediação de mídia. Precisa do **contador** (NF de serviço sobre a taxa,
  e como tratar o repasse da mídia) e de **cláusula no contrato da promotora**.
  O risco de anúncio reprovado fica com a plataforma.

**B. A organização usa a conta dela e paga uma mensalidade de gestão.** Ela
liga a própria conta de anúncios, paga o Google, o Meta e o TikTok direto, e
a plataforma cobra um plano mensal (como o do assistente de IA) para montar e
acompanhar as campanhas.
- Lucro: a mensalidade.
- A favor: a mídia não passa pela conta da plataforma (fiscal mais simples).
- Contra: cada organização precisa criar e verificar a conta dela (foi o que
  deu trabalho hoje); a plataforma depende do acesso que ela der.

**C. Taxa sobre o resultado.** Cobrar uma porcentagem de cada venda que veio
do anúncio. **Não recomendado**: a origem da venda é estatística (último toque,
cookies recusados, aparelho trocado), e hoje o sistema diz isso de propósito
("a origem nunca decide dinheiro"). Cobrar por ela seria cobrar por um número
que a gente mesmo diz não ser prova.

**Recomendação: A.** É o que dá a margem mais previsível e o que encaixa no
que já existe (saldo, livro, retenção, Caixa). B pode vir depois para
organização grande que já tem conta própria.

## 3. Como ficaria (modelo A)

**Para a organização** (menu Marketing → "Tráfego pago"):
1. Recarrega o saldo de tráfego por Pix (o mesmo fluxo da recarga do patrocínio).
2. Pede uma campanha para uma rifa publicada: objetivo (vender cotas), quanto
   investir no total e por dia, onde (Google, Instagram/Facebook, TikTok),
   alcance (cidade, estado, Brasil). O valor fica **reservado** no saldo.
3. Acompanha: gasto, cliques, vendas atribuídas e custo por venda — com o
   aviso de que a atribuição é estimativa.
4. Pausa a qualquer hora; o que não foi gasto volta ao saldo.

**Para o administrador master** (Marketing → "Tráfego pago", a mesma tela com a fila e a margem):
1. Fila dos pedidos de campanha (também na Caixa de entrada).
2. Monta a campanha nas contas da plataforma — no começo **à mão ou por mim,
   pelo Windsor.ai**, com a sua aprovação; depois, pela API (seção 5).
3. Lança o gasto do dia por campanha (manual no começo, importado depois); o
   sistema debita do saldo **gasto + taxa** pelo livro, uma vez só por dia e
   campanha (chave única), e encerra quando acaba a reserva.
4. Vê a margem: taxa recebida, mídia paga, por organização e por mês.

**Regras que valem desde o começo:**
- Dinheiro inteiro, em centavos; a taxa arredonda para baixo e é
  **fotografada no pedido** (mudar a tabela não muda campanha comprada).
- Nunca gasta mais que o reservado; o gasto lançado é `UPDATE` condicional.
- O saldo retido (retenção cautelar) não paga anúncio novo.
- Só rifa publicada, autorizada, nem demonstração nem travada.
- Sem dado pessoal de comprador saindo para as plataformas além do que o
  consentimento de cookies já permite (seção Marketing do `CLAUDE.md`).
- Recorte: a organização vê só as campanhas dela (404 para o vizinho); a
  fila, a taxa e o lançamento do gasto são só da plataforma (403).

## 4. O que precisa de decisão (amanhã)

1. **Modelo**: A (recomendado), B ou os dois.
2. **Taxa**: quanto (ex.: 15%, 20%) e se há investimento mínimo por campanha.
3. **Contador**: como a plataforma fatura a taxa e trata o repasse da mídia
   no modelo A.
4. **Advogado**: (a) a política de jogos e apostas do Google, do Meta e do
   TikTok para rifa autorizada pela SPA/MF — se exigirem certificação, quem
   pede e em nome de quem; (b) a cláusula nova no contrato da promotora
   (a plataforma anuncia em nome dela, o anúncio reprovado, o reembolso do
   saldo não gasto).
5. **Quem opera no começo**: você (ou alguém da equipe) pelas telas do Google
   e do Meta, ou eu pelo Windsor.ai a cada pedido.

## 5. Fases

- **Fase 1 — o negócio no sistema (feita, 09/10/2026):** saldo de tráfego,
  pedido de campanha, fila do master, lançamento manual do gasto com a taxa,
  relatório de margem e o relatório da organização (gasto × vendas
  atribuídas). Funciona sem nenhuma API de anúncio: a campanha é montada fora.
  O que ficou valendo está na seção "Tráfego pago" do `CLAUDE.md`: o
  "pausar" virou **encerrar** (a campanha para e fica "fechando a conta" até a
  plataforma lançar os últimos dias que a rede cobrou; aí o que não foi gasto
  volta ao saldo; pedir de novo é uma campanha nova), a taxa e os mínimos ficaram a critério da
  plataforma (decisão de 09/10/2026) e os cliques ficam para a fase 2 (vêm
  do painel da rede).
- **Fase 2 — importar o gasto (feita, 09/10/2026):** o gasto e os cliques
  dos dias fechados vêm das redes pela API do Windsor.ai (uma chave do
  servidor, `WINDSOR_API_KEY`, para as três), de hora em hora e no "Importar
  agora" da plataforma, pela mesma régua do lançamento à mão. A campanha da
  rede é achada pelo código `trafego-<código>` no nome dela; o dia importado
  é corrigido enquanto a rede o acerta (até 3 dias), o lançado à mão fica
  como está; o que a rede gastar além do cobrável (verba acabada, campanha
  parada ou fechada) não é cobrado da organização e aparece na margem como
  excedente. O que ficou valendo está na seção "Tráfego pago" do
  `CLAUDE.md`. As APIs oficiais (Google Ads com *developer token*, Meta com
  app verificado) ficam como alternativa, se um dia o Windsor sair.
- **Fase 3 — criar a campanha pela API.** **Primeira parte feita
  (09/10/2026): o Meta (Facebook e Instagram), pela Marketing API.** Na
  campanha no ar que pediu o Meta, a plataforma toca "Criar no Meta" (nunca
  sozinho na aprovação) e o sistema cria campanha, conjunto e anúncio,
  **tudo pausado** — ligar continua sendo no gerenciador do Meta, onde o
  anúncio de rifa passa pela revisão de política. O que vai para o Meta sai
  do banco: o nome com o código `trafego-…` (a importação da fase 2 casa por
  ele), a verba por dia, o fim quando a verba acaba pela conta, a região do
  pedido pela busca de locais do Meta (sem achar, recusa — nunca o Brasil
  todo), maiores de 18, a arte pronta "rifa" 4:5 e o texto dos dados
  públicos (prêmio, preço, data, autorização, "só vale bilhete pago pela
  plataforma"), na régua do texto. Uma criação por campanha e rede (o
  índice decide); a falha no meio fica anotada para apagar no gerenciador
  e dá para tentar de novo; encerrar pausa lá. Nasce desligado e só existe
  com `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID` e `META_PAGE_ID` no servidor.
  O que ficou valendo está na seção "Tráfego pago" do `CLAUDE.md`.
  **A seguir, na mesma interface (`CriadorDeCampanha` em
  `server/services/trafegoCriacao.ts`):** o **Google Ads** (exige o
  *developer token* aprovado pelo Google, a conta de administrador (MCC) e
  o OAuth da conta de anúncios; a campanha de pesquisa precisa de palavras
  e anúncio de texto, não de imagem) e o **TikTok** (exige o app aprovado no
  TikTok for Business, com o acesso à conta de anúncios, e o vídeo — o
  reels gerado da fase F é o candidato). Depois, o criativo do reels gerado
  no Meta também.

## 6. O que fazer fora do código antes de anunciar

- Terminar a conta do Google Ads (modo Especialista, pagamento) e criar a
  conversão "Compra"; criar o GA4 do site; cadastrar os pixels em Marketing.
- Verificar o Business Manager do Meta e a conta do TikTok Ads da plataforma.
- As respostas do contador e do advogado da seção 4.
