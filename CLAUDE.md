# Notas para quem for mexer aqui

## O que este projeto é

Plataforma multi-rifas: várias campanhas no ar ao mesmo tempo sob um
administrador geral. Um app, três superfícies separadas por papel de sessão.
O plano completo está em `docs/PLANO-RIFA.md` — leia antes de mudar
arquitetura.

## Invariantes (quebrar qualquer uma destas é bug grave)

1. **Cota é vendida uma vez só.** A exclusividade é a PK `(campaign_id, number)`.
   Reserva é `INSERT … ON CONFLICT DO NOTHING`. Nunca consultar disponibilidade
   numa query e gravar em outra.
2. **Nunca materializar cota.** Campanha de 1M nasce com zero linhas em
   `quota_alloc`. Se você se pegar escrevendo `generate_series` fora do
   `enterEndgame`, pare.
3. **Pool de endgame não pode oferecer cota tomada.** Todo caminho que toma
   uma cota — inclusive escolha manual no mapa — precisa apagá-la de
   `free_pool`. Foi assim que a compra rápida passou a falhar com a rifa cheia
   de número livre. `npm run load` checa isso.
4. **Nunca `COUNT(*)` para progresso.** Use `campaign_stats`, atualizado na
   mesma transação da alocação.
5. **Dinheiro é inteiro, em centavos.** O front nunca envia preço: envia
   campanha e quantidade. O total é recalculado em `services/orders.ts`.
6. **Webhook é idempotente.** Chave `(provider, external_id)` em
   `webhook_events`. Assinatura validada no provedor; o redirect do navegador
   não vale como prova de pagamento.
7. **O total de cotas trava ao publicar.** `assertEditable()` em
   `services/campaigns.ts`. Mudar depois alteraria a chance de quem já comprou.
8. **Comissão tem carência — salvo quando a organização escolhe o contrário.**
   O padrão (`apos_sorteio`) nasce `pending` e vira `available` só depois da
   janela de estorno e do sorteio. A organização pode escolher `imediata`
   (`organizations.liberacao_comissao`, via `comissaoInicial()`); aí o risco
   de estorno depois do saque é dela, e aparece em `comissaoJaPagaCents`.
   Autoindicação é bloqueada por telefone em qualquer modo.
9. **A autorização SPA/MF é da campanha.** Sem `authorizationCode` a campanha
   não publica. A plataforma não é homologada em bloco — a Lei 5.768/71
   autoriza o promotor.
10. **O antifraude corre antes de qualquer gravação.** `guardOrder()` em
    `services/antifraude.ts` roda antes do primeiro `INSERT` do pedido. Guarda
    que roda depois já deixou o estrago no banco.
11. **Consultar e depois gravar é sempre bug.** Vale para cota (invariante 1) e
    vale para o código do pedido: quem decide é o índice único. Se você achar
    um `SELECT` para ver se "está livre" seguido de um `INSERT`, é uma corrida
    esperando 500 simultâneos.
12. **No rateio, a plataforma sai antes.** `splitOrder()` em
    `shared/pricing.ts`: a taxa incide sobre o pago, e a comissão do afiliado
    ou do cambista incide sobre o que **sobrou** dela. As duas fatias
    arredondam para baixo e o centavo fica com o promotor, para que
    `plataforma + comissão + promotor === pago` seja igualdade exata, nunca
    aproximação.
13. **Mensalidade e comissão nunca convivem.** São dois contratos, e
    `validateBillingPlan()` zera o campo do outro ao trocar: percentual
    guardado num plano de mensalidade é bomba de relógio. Cobrar os dois
    juntos seria um terceiro modo, não um campo ligado junto.
14. **Estorno desfaz tudo, ou não desfaz nada.** `refundOrder()` devolve cota,
    contador, comissão, taxa da plataforma e cota premiada na mesma
    transação. Desfazer quatro das cinco não dá erro — vira comissão paga a
    quem não vendeu, ou número que some do estoque. `npm run refund` prova.
15. **Organização nula é a plataforma; qualquer outra é recorte.** Toda
    consulta do painel passa por `orgOf(req)`. Rota que busca por id usa
    `assertCampaignInScope()` ou `assertAffiliateInScope()` — nunca `select`
    solto. `npm run isolation` prova; rota nova que não apareça lá é rota que
    ninguém provou.

## Onde mexer

| Quero… | Vá em |
|---|---|
| mudar quem acessa o quê | `shared/access.ts` (cliente e servidor leem daqui) |
| mexer em reserva/alocação | `server/services/quotas.ts` |
| mexer no fluxo do pedido | `server/services/orders.ts` |
| trocar o provedor de pagamento | `server/payments/` — implemente `PaymentProvider`; a escolha é do painel (`shared/plataforma.ts`) |
| regras de publicação e mídia | `server/services/campaigns.ts`, `server/routes/admin.ts` |
| sorteio | `server/services/draw.ts` |
| segundo fator | `server/services/totp.ts` |
| variantes de imagem | `server/services/images.ts` |
| mensagens e modelos | `server/notifications/` |
| cotas premiadas | `server/routes/admin.ts` (sorteio) e `services/orders.ts` (revelação) |
| cadastro/cupom/kit do afiliado | `server/routes/public.ts`, `server/routes/affiliate.ts` |
| venda física e acerto | `server/routes/seller.ts`, `server/services/settlements.ts` |
| meios de pagamento aceitos | `shared/payments.ts` (regras) e `services/settings.ts` |
| bilhete | `server/services/ticketFormat.ts` (puro) e `ticket.ts` (dados) |
| ponte com a maquininha | `client/src/lib/pos.ts`, `android/`, `docs/MAQUININHAS.md` |
| teste de carga | `scripts/load-test.ts` |
| limites de antifraude | `shared/antifraude.ts` (regras) e `server/services/antifraude.ts` |
| isolamento entre organizadores | `server/services/orgs.ts` e `scripts/isolation-test.ts` |
| rateio da venda | `shared/pricing.ts` (`splitOrder`) |
| estorno | `server/services/orders.ts` (`refundOrder`) e `scripts/refund-test.ts` |
| pedido de reembolso (chamado) | `shared/chamados.ts`, `server/services/chamados.ts`, `client/src/pages/adminAtendimento.tsx`, `scripts/chamados-test.ts` |
| contrato de cobrança da plataforma | `shared/billing.ts` e `server/services/billing.ts` |
| exportações | `shared/exports.ts` (formato) e `server/services/exports.ts` (consultas) |
| usuários, senha e arquivamento | `server/routes/admin.ts` (`/usuarios`, `/organizacoes/:id/arquivar`), `shared/senha.ts` |
| o que falta para vender em produção | `docs/PENDENCIAS.md` — **atualize no mesmo PR** que fechar um item |
| app instalável (PWA) | `client/public/sw.js`, `client/public/manifest.webmanifest`, `client/src/lib/pwa.ts` |

## Convenções

- Português nos textos de interface, mensagens de erro e comentários.
- Todo número que o usuário lê (cota, real, prazo, percentual) usa a classe
  `tnum` — DM Mono com algarismo tabular.
- Estado nunca é comunicado só por cor: use `<Pill>`, que traz rótulo em texto.
- Paleta: branco de fundo; verde = dinheiro que entrou; amarelo = espera e
  prêmio; vermelho = erro. Cor sem significado é ruído.

## O que ainda não existe

- Pôster extraído do vídeo e transcode: hoje servimos o arquivo original. A
  medição e os limites já existem; falta o processamento. Cloudflare Stream
  resolve os dois de fábrica.
- Fila (BullMQ): os três relógios rodam com `setInterval` no processo,
  protegidos por trava de aplicação do Postgres — com várias réplicas só uma
  executa. Serve bem; a fila entra quando houver trabalho pesado de verdade.
- A Fase 4 fechou: carga (`npm run load`), antifraude (`/admin/antifraude`),
  exportações (`/admin/exportacoes`) e multi-organizador
  (`/admin/organizacoes`, provado por `npm run isolation`).
- Vitrine por domínio próprio: hoje a loja é uma só e mostra a rifa de todos
  os promotores, com a administradora aparecendo no bilhete e na página da
  rifa. White label de domínio é trabalho de implantação (DNS e certificado),
  não de código deste repositório.
- A integração da Stone no invólucro Android: `android/app/src/ton/` tem a
  estrutura e dois pontos de encaixe marcados, sem nomes de classe
  preenchidos. A do PagBank está escrita.
- O APK nunca foi compilado: este repositório não tem Android SDK. O sabor
  `generico` foi escrito para compilar sem dependência de adquirente, mas
  isso ainda precisa ser confirmado numa máquina com o SDK.

## A ponte com a maquininha — o que não pode afrouxar

- O contrato vive em dois arquivos que precisam andar juntos:
  `client/src/lib/pos.ts` (web) e `android/app/src/main/assets/rifa-pos-shim.js`
  (invólucro). `tests/posShim.test.ts` carrega o shim real e exercita os dois
  contra um lado nativo de mentira — mudou um lado só, o teste quebra.
- Toda chamada à ponte tem prazo. Promise pendurada deixa o cambista olhando
  um botão morto com o apostador na frente.
- Recusa de cartão é **resultado** (`{ ok: false, message }`), não exceção: o
  cambista precisa ler o motivo e decidir na hora.
- Nenhuma regra de negócio entra no projeto Android. Se aparecer preço ou cota
  em Kotlin, está no lugar errado.

## Meios de pagamento — o que não pode afrouxar

- As regras moram em `shared/payments.ts`, puras, porque quem valida é o
  servidor e quem exibe o botão é o cliente. Duas cópias viram duas regras
  diferentes na primeira mudança.
- A checagem é **no servidor**: esconder o botão é cortesia. `createOrder`
  barra a venda online sem Pix e `confirmSellerSale` barra o meio desligado.
- Pelo menos um meio precisa sobrar ligado. Nenhum ligado é uma rifa que não
  vende — e a tela não denunciaria isso.
- `validatePaymentMethods` só aceita as chaves conhecidas: isto vem do corpo
  da requisição e espalhar o objeto cru guardaria qualquer coisa.

## Venda física — o que não pode afrouxar

- **Reservar antes de cobrar.** Nunca inverter: cartão aprovado com a cota já
  vendida é dinheiro debitado sem nada para entregar. Cobrança recusada chama
  `/cancel`, que devolve as cotas na hora.
- A venda do cambista usa o **mesmo** caminho de reserva das vendas online
  (`INSERT … ON CONFLICT`). Não existe atalho para venda física.
- Fechar acerto **carimba** os pedidos (`orders.settlement_id`). Sem o carimbo,
  a mesma venda entra em dois acertos.
- O cambista deve à casa; o afiliado recebe dela. Direções opostas, mesma
  máquina de comissão.

## Bilhete — o que não pode afrouxar

- A formatação vive em `ticketFormat.ts`, sem banco, porque é o que os testes
  exercitam: 32 colunas, total alinhado à direita, sem acento e sem espaço
  não-quebrável.
- Se mudar o layout, rode `tests/ticket.test.ts`: linha larga demais estoura
  na bobina e só se descobre na hora de imprimir.

## Mensagens — o que não pode afrouxar

- Todo envio precisa de `dedupeKey`. Sem ela, o job de lembrete manda a mesma
  mensagem a cada minuto.
- Falha de envio **nunca** propaga para o fluxo de pagamento: a venda já
  aconteceu. Registre e siga.
- O número da cota premiada não sai em endpoint público. Só na revelação, para
  quem comprou.

## Mídia — o que não pode afrouxar

A duração do vídeo e as dimensões da imagem são medidas em
`server/services/probe.ts`, lendo o arquivo já armazenado. **Nunca** aceite o
valor vindo do cliente: o limite de 60 s é promessa de tela e forjar um campo
JSON é trivial. Se for aceitar um container novo (WebM, por exemplo), implemente
a medição junto — sem medir, não entra na lista de mimes.

## Antifraude — o que não pode afrouxar

O ataque que dói numa rifa **não é o de pagamento: é bloqueio de estoque.** Um
script reserva milhares de cotas, não paga, deixa expirar e repete. A rifa
parece vendida, ninguém consegue comprar e o organizador não entende por quê.
Por isso o limite mais apertado é o de reserva em aberto
(`openOrdersPerPhone`), não o de volume de compra.

- **`guardOrder()` antes do `INSERT`.** Vale para a compra pelo site e para a
  venda do cambista. Recusa devolve 429 com motivo em português — o comprador
  legítimo precisa entender por que foi barrado.
- **O cambista é isento dos limites de comprador, nunca do bloqueio manual.**
  A venda dele é presencial e tem dono: ele responde por ela no acerto. Mas
  telefone que o administrador bloqueou não compra nem na maquininha.
- **Dado pessoal não vira chave crua.** IP e identificador de aparelho entram
  em hash SHA-256; telefone aparece mascarado no registro de recusa. Um
  vazamento da tabela de fraude não pode virar lista de telefones.
- **Contar mesmo quando recusa.** `hit()` grava o evento antes de decidir:
  senão a janela zera a cada tentativa barrada e quem insiste nunca estoura.
- **O limite por IP é folgado de propósito** (60 em 10 min). Operadora de
  celular põe um bairro inteiro atrás do mesmo IP — apertar aqui derruba
  comprador de verdade. Quem mede é a bancada, e ela afrouxa **só** este
  limite enquanto roda, devolvendo a configuração de antes no fim.
- **`rate_events` é lixo com data.** O relógio limpa o que passou de 2 horas
  (`purgeRateEvents`, trava de aplicação 811004). Sem isso a tabela só cresce.

## Código do pedido — o que não pode afrouxar

É sorteado, nunca sequencial: a consulta do pedido é pública e devolve o nome
de quem comprou. Código sequencial deixaria qualquer um enumerar a carteira de
clientes da rifa e ler o volume de vendas do dia pela diferença entre dois
códigos.

A faixa é de **oito dígitos** (`ORDER_CODE_MIN`/`MAX` em `services/orders.ts`).
A de seis era um teto de verdade: a plataforma roda várias rifas de até 1M de
cotas e passa de um milhão de *pedidos* ao longo da vida — com 990 mil códigos,
a rifa simplesmente pararia de emitir pedido. Se um dia encurtar isso, faça a
conta da densidade antes.

## Exportações — o que não pode afrouxar

- **A planilha executa o que você escreve nela.** Célula que começa com `=`,
  `+`, `@` — ou `-` que não é número — o Excel trata como fórmula, e o nome do
  comprador vem de formulário público. `neutralizarFormula()` em
  `shared/exports.ts` põe apóstrofo à esquerda. Coluna nova que carregue texto
  de usuário passa por `csvCell()`, sem exceção.
- **O `-` de dinheiro negativo continua número.** Neutralizar todo `-`
  quebraria a soma da coluna de estorno, que é justamente o que a
  contabilidade confere. Tem teste para os dois lados.
- **Nada é montado inteiro na memória.** Cada relatório é gerador com
  paginação de chave (keyset) e a rota respeita a contrapressão do socket.
  Meio milhão de linhas saiu com a memória do processo parada em 60 MB. Se
  aparecer `OFFSET` ou um array acumulando linhas aqui, é regressão.
- **`JOIN` de relatório é `LEFT`.** `quota_alloc.order_id` não tem chave
  estrangeira; com `INNER`, cota cujo pedido sumisse desapareceria calada do
  arquivo. Relatório de conferência que omite linha em silêncio é pior que
  relatório que falha.
- **A semente do sorteio não sai antes do sorteio.** Quem a tiver calcula o
  número e compra a cota. Antes, só o hash — o compromisso público. Vale
  inclusive para o administrador: arquivo baixado sai do controle do sistema.
- **Todo download entra em `audit_log`, antes de o arquivo começar.** Quem
  baixou, quando, qual recorte e se levava dado pessoal. Registrar depois
  perderia o download interrompido.
- **Formato é pt-BR ou não serve:** separador `;`, vírgula decimal, sem `R$`,
  sem separador de milhar (senão a célula vira texto e a soma dá zero) e BOM
  no começo, senão o Excel abre em Latin-1 e come os acentos.

## Multi-organizador — o que não pode afrouxar

Cada organização é um **promotor** de rifa. A separação existe porque a Lei
5.768/71 autoriza o promotor, não a plataforma: é o nome dele que sai no
bilhete como administradora e é dele que a autorização SPA/MF é exigida.

A convenção que governa tudo: **`organizationId` nulo é a plataforma.** O
administrador geral entra com nulo e enxerga todas; o organizador entra com a
dele e não alcança mais nada. Papel diz qual porta abre; organização diz o que
tem atrás.

- **O modo de falhar aqui é silencioso.** Rota que esquece de *barrar* dá 403,
  e alguém reclama. Rota que esquece de *filtrar* responde 200 e entrega
  pedido, telefone e caixa do vizinho. Por isso o teste de isolamento confere
  o **conteúdo** das listas, não só o código de resposta.
- **404, não 403, para o dado do vizinho.** "Existe, mas não é sua" já entrega
  que o id é válido — dá para varrer a plataforma contando rifa alheia. 403
  fica só para rota que é da plataforma e todo mundo sabe que existe.
- **Rota com id de filho confere o pai.** `/media/:id` e `/prized/:id` não
  trazem a campanha no caminho; sem buscar o dono antes, o id do vizinho
  apaga o banner dele. E a conferência vem **antes** do `DELETE`, senão a
  linha já sumiu quando a checagem roda.
- **Campanha não muda de dono por `PATCH`.** Seria transferir venda, cota e
  comissão de uma administradora para outra com um campo de formulário.
- **Organizador sem organização é recusado na entrada.** Recorte nulo abre
  tudo — deixar passar o transformaria em administrador geral por omissão.
- **O cambista só vende rifa da organização dele.** A tela já filtra, mas a
  tela é cortesia: quem barra é `/api/seller/sales`.
- **São as mesmas telas.** Organizador e administrador geral usam o mesmo
  painel; o que muda é o recorte. Tela nova para organizador é sinal de que o
  recorte foi feito no lugar errado.

## Arquivar e usuários — o que não pode afrouxar

- **Arquivar não apaga.** `archived_at` tira a organização da lista padrão e
  fecha a porta de todos dela; venda, cota, comissão e cobrança seguem nos
  relatórios. `DELETE` de organização não existe, de propósito.
- **Arquivar pede senha E código do autenticador.** Sem segundo fator ligado,
  não arquiva — não há caminho alternativo.
- **Rifa no ar ou esperando sorteio barra o arquivamento**, no mesmo `UPDATE`
  que arquiva. A publicação trava a linha da organização (`FOR SHARE`) e recusa
  promotora arquivada.
- **Suspensa fecha a porta do organizador; arquivada fecha a de todos.** É
  conferido na entrada e em toda requisição (`barreiraDaOrganizacao()`).
- **A lista de usuários nunca devolve hash de senha nem segredo do
  autenticador** — só se o segundo fator está ligado.

## App instalável — o que não pode afrouxar

- **`/api/` e `/uploads/` nunca passam pelo cache do service worker.** Cota e
  pedido são estado vivo: servir a versão guardada é mostrar número vendido
  como livre. Sem rede, a API falha e a tela diz isso.
- Mudou a casca (`sw.js`)? Troque `VERSAO` lá dentro, senão o celular segue
  com a antiga.

## Provedor do Pix e estorno — o que não pode afrouxar

- **Duas funções, dois papéis.** `activePaymentProvider()` escolhe quem gera
  o Pix das vendas novas (escolha do painel, ou `PAYMENT_PROVIDER`);
  `paymentProviderByName()` atende webhook e estorno pelo nome gravado no
  pedido. Usar o provedor "em uso" no webhook deixaria órfão o Pix emitido
  antes da troca.
- **Asaas: o status vem da API, não do corpo** — igual ao Mercado Pago. O
  token do cabeçalho `asaas-access-token` só prova a origem.
- **Split em percentual sobre o líquido**, nunca valor fixo: o Asaas desconta
  a tarifa antes de dividir, e um fixo igual ao "bruto menos a taxa"
  estouraria o líquido. A comissão **não** vai no split.
- **CPF é conferido antes de reservar.** Descobrir no Pix deixaria cotas
  presas. E se o provedor recusar a cobrança, `devolverReserva()` devolve os
  números na hora — inclusive para o `free_pool` em endgame.
- **O QR do Asaas vale até o fim do dia.** Reserva vencida cancela a cobrança
  (`cancelCharge`, no relógio de expiração); senão o comprador pagaria uma
  reserva já devolvida.
- **Reembolso nasce desligado** (`estornoManual`, "Aceitar pedidos de
  reembolso"). Desligado, o comprador não abre chamado e a organização não
  devolve; estorno avisado pelo provedor (contestação, Pix devolvido) é
  registrado sempre — o dinheiro já saiu.
- **Carteira do Asaas só a plataforma cadastra.** Trocar a carteira é trocar
  para onde vai o dinheiro das vendas.

## Rateio e cobrança — o que não pode afrouxar

Três bolsos numa venda: plataforma, divulgador (afiliado ou cambista) e
promotor. **A ordem é sempre esta, e a plataforma sai primeiro.**

- **A comissão incide sobre o que sobrou da taxa, não sobre o bruto.** Inverter
  faria a plataforma cobrar sobre dinheiro que já era de outro, e as duas
  contas cresceriam uma em cima da outra. Numa venda de R$ 100 com taxa de 5%
  e comissão de 10%, a diferença são 50 centavos — que viram muito em volume.
- **A soma é igualdade, não aproximação.** As duas fatias arredondam para
  baixo e o centavo que sobra fica com o promotor. Arredondar para cima em
  qualquer uma faria o sistema distribuir dinheiro que não existe. Há teste
  varrendo de 0 a R$ 20,00 em seis combinações de percentual.
- **A base é o que o comprador pagou**, já com pacote e cupom descontados —
  nunca o preço de tabela.
- **Mensalidade zera a taxa por venda.** É assim que o contrato de mensalidade
  não cobra duas vezes: `platformPctFor()` devolve 0 e o afiliado volta a
  receber sobre o valor cheio.
- **O padrão é `gratis`.** Organização que existia antes desta decisão não
  acorda devendo. Quem cobra é quem escolheu cobrar.
- **A taxa é lançada dentro da transação que confirma o pagamento**, junto com
  a comissão. Fora dela, sobreviveria a um rollback e cobraria por uma venda
  que não aconteceu.
- **Os dois índices únicos de `platform_charges` são a defesa contra cobrar
  duas vezes**, e cada um pega um jeito diferente de dobrar: `uq_charge_order`
  contra o webhook chamado de novo, `uq_charge_competencia` contra o relógio
  rodando em várias réplicas.
- **A mensalidade cobra o mês anterior**, nunca o corrente: lançar no dia 1º
  para o mês que começa é cobrança antecipada, e quem cancelar no dia 3 estaria
  devendo por 28 dias que não usou.
- **O organizador vê a própria conta.** Cobrar sem mostrar de onde veio cada
  lançamento é indefensável — e é a primeira coisa que o cliente pede quando
  desconfia da fatura.

## Estorno — o que não pode afrouxar

Estornar é desfazer cinco coisas ao mesmo tempo, e o modo de errar é sempre o
mesmo: desfazer quatro e esquecer a quinta. O que sobra não dá erro — vira
comissão paga por venda que voltou, ou número que some do estoque.

- **Tudo na mesma transação**: cota, `campaign_stats`, comissão
  (`reversed`), taxa da plataforma (`cancelada`) e a cota premiada que aquele
  pedido tinha reclamado.
- **A cota só volta se a rifa ainda não foi sorteada.** Depois do sorteio o
  quadro está congelado: quem conferir o resultado precisa encontrar
  exatamente o que existia quando o número saiu. Aí o estorno vira só
  dinheiro, e a mensagem ao comprador muda junto (`estorno_pos_sorteio`) —
  dizer que as cotas voltaram seria mentira.
- **Em endgame o número volta para o `free_pool`.** É a invariante 3 ao
  contrário: sem isso ele fica livre em `quota_alloc` e invisível para quem
  aloca pelo pool — some do estoque sem ninguém perceber.
- **Idempotente**: só age sobre pedido `paid`, e o `UPDATE` condicional
  impede que duas chamadas simultâneas dupliquem qualquer coisa.
- **Comissão já sacada não volta sozinha.** A carência existe para isso não
  acontecer, mas estorno tardio acontece: quando pega uma comissão `paid`, o
  valor volta em `comissaoJaPagaCents` e vai para o log. Engolir calado seria
  esconder dinheiro que saiu.
- **Não existe botão solto de estorno.** O único caminho manual é o chamado
  aprovado (seção abaixo). Com Pix, a devolução vai pelo provedor, para a
  mesma conta que pagou, **antes** de `refundOrder`; se o provedor recusa, o
  chamado volta a aprovado e nada é desfeito. Venda do cambista não tem
  provedor: o sistema registra e o dinheiro volta pelo caixa
  (`formaDevolucao = manual`).

## Reembolso por chamado — o que não pode afrouxar

Reembolso é a porta preferida de quem quer fraudar: comprar, perder e pedir o
dinheiro de volta, ou pedir por um pedido que não é seu. Por isso ele não é
botão, é **chamado** — com dono, prova, conversa e protocolo.

- **Só o comprador logado pede.** A sessão do código pelo WhatsApp decide de
  quem é o pedido; o número digitado não vale nada. Pedido de outro comprador
  é 404 (`abrirChamado`), e o mesmo vale para ler chamado e print.
- **Três identidades, conferidas juntas**: telefone (sessão), CPF e o ID do
  cliente (`buyers.codigo`, `C-XXXXXXXX`, sorteado e sem caractere ambíguo).
  O CPF, na primeira vez, fica no cadastro; dali em diante tem de bater.
  O ID é o que o atendimento usa para falar da pessoa sem expor telefone.
- **Depois do sorteio, nunca.** `bloqueioDoReembolso()` em
  `shared/chamados.ts`, a mesma regra que esconde o botão e que o servidor
  aplica. Quem perdeu pediria o dinheiro de volta.
- **Um chamado em andamento por pedido** — quem decide é o índice único
  parcial `uq_chamados_pedido_andamento`, não um `SELECT` antes.
- **Limite do dia conta a tentativa, e conta o CPF errado.** Erro de
  preenchimento (print faltando) sai **antes** do `hit()`, senão quem erra o
  formulário fica 24 h sem pedir; o CPF é conferido **depois**, senão dá para
  chutar CPF sem limite.
- **O print é reprocessado** (`processarAnexo`: sharp → JPEG, sem metadados
  de localização) e fica no banco, servido só pelas duas rotas que conferem o
  dono, com `no-store`. Imagem do bilhete nunca vai para URL pública.
- **Concluir é um `UPDATE` condicional** (`aberto` → `aprovado`/`recusado`).
  O prazo de devolução sai de `organizations.prazoEstornoDias` (1 a 30),
  calculado na conclusão, e vai na mensagem com o protocolo — é compromisso.
- **Estornar toma o chamado** (`aprovado` → `estornado`) antes de chamar o
  provedor: dois cliques simultâneos dão um estorno e um 409.
- **O comprador nunca vê o nome de quem atendeu** — só "Atendimento".
- `npm run chamados` prova tudo isso contra a API de verdade.
