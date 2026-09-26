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
9. **A autorização SPA/MF é da campanha.** Sem `authorizationCode`, arquivo do
   certificado e `drawAt` a campanha não publica. Os três entram só por
   `PUT /campaigns/:id/legal` (`salvarDadosLegais()`), que confere o arquivo
   pelo conteúdo, e **travam ao publicar** como o total de cotas. O arquivo
   fica em `campaign_certificados` (banco, não R2) e só é público depois de
   publicada. A plataforma não é homologada em bloco — a Lei 5.768/71
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
| plano da próxima fase (vitrine, contas, afiliados, marketing) | `docs/PLANO-FASE5.md` |
| conta do apostador (senha, confirmação, exclusão) | `shared/contaComprador.ts`, `server/services/contaComprador.ts`, `scripts/conta-test.ts` |
| de quem é o cliente (o que o organizador vê) | `shared/titularidade.ts` (regra) e `server/services/titularidade.ts` (SQL) |
| autorização SPA/MF e data do sorteio | `shared/campanhaLegal.ts`, `salvarDadosLegais()` em `server/services/campaigns.ts`, `client/src/components/DadosLegaisCard.tsx` |
| endereço do organizador e ordem da vitrine por região | `shared/endereco.ts` (regra), `salvarEndereco()` em `server/services/orgs.ts`, `server/services/cep.ts`, `client/src/components/EnderecoForm.tsx` |
| perfil do organizador, seguir e sino | `shared/perfil.ts` (regras), `server/services/perfil.ts`, `client/src/pages/Perfil.tsx`, `client/src/components/Seguir.tsx`, `scripts/perfil-test.ts` |
| notificações no celular (Web Push) | `shared/push.ts` (regras), `server/services/push.ts`, `client/public/sw.js`, `client/src/lib/push.ts`, `scripts/push-test.ts` |
| regulamento, central de ajuda, transmissão e conferência do sorteio | `shared/regulamento.ts`, `shared/ajuda.ts`, `shared/sorteio.ts`, `client/src/components/SorteioCard.tsx`, `scripts/transparencia-test.ts` |
| tema claro e escuro | `client/src/index.css` (variáveis), `client/src/lib/tema.ts`, `client/src/components/TemaToggle.tsx`, `tests/tema.test.ts` |
| app instalável (PWA) | `client/public/sw.js`, `client/public/manifest.webmanifest`, `client/src/lib/pwa.ts` |

## Convenções

- Português nos textos de interface, mensagens de erro e comentários.
- Todo número que o usuário lê (cota, real, prazo, percentual) usa a classe
  `tnum` — DM Mono com algarismo tabular.
- Estado nunca é comunicado só por cor: use `<Pill>`, que traz rótulo em texto.
- Paleta: branco de fundo; verde = dinheiro que entrou; amarelo = espera e
  prêmio; vermelho = erro. Cor sem significado é ruído. O tema escuro troca
  os tons, nunca o significado (seção "Tema claro e escuro").

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

- **Só o comprador logado pede.** A sessão (código do WhatsApp ou conta com
  senha) decide de quem é o pedido; o número digitado não vale nada. Conta
  sem telefone confirmado só pede reembolso do que comprou dentro dela. Pedido de outro comprador
  é 404 (`abrirChamado`), e o mesmo vale para ler chamado e print.
- **Três identidades, conferidas juntas**: telefone (sessão), CPF e o ID do
  cliente (`buyers.codigo`, `C-XXXXXXXX`, sorteado e sem caractere ambíguo).
  O CPF, na primeira vez, fica no cadastro; dali em diante tem de bater.
  O ID é o que o atendimento usa para falar da pessoa sem expor telefone.
- **Depois do sorteio, nunca.** `bloqueioDoReembolso()` em
  `shared/chamados.ts`, a mesma regra que esconde o botão e que o servidor
  aplica. Quem perdeu pediria o dinheiro de volta. E os pedidos **fecham 2
  horas antes** (`fechadoPeloSorteio()` em `shared/reembolso.ts`): o quadro
  precisa estar parado quando o número sair.
- **Quanto volta é decidido na abertura, não na devolução.**
  `calcularReembolso()` em `shared/reembolso.ts`: compra online (Pix, sem
  cambista) com pedido até 7 dias do pagamento devolve 100% (art. 49 do
  CDC); depois disso, ou venda do cambista, retém a taxa da plataforma
  (`taxaReembolsoPct`, 0 a 10%, padrão 10%, arredondada para baixo). O valor
  fica gravado no chamado (`tipoReembolso`, `taxaCents`, `devolverCents`):
  mudar a taxa no painel não muda o que já foi prometido. A regra aparece
  **antes da compra** (`regraDoReembolso()`, na tela da rifa).
- **Devolução parcial é pelo provedor, com o valor explícito.**
  `refund(chargeId, amountCents)`; sem valor é devolução total. A chave de
  idempotência do Mercado Pago leva o valor, para a repetição não dobrar.
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
- **Chamado novo avisa a organização** pelo WhatsApp (`chamado_novo`), depois
  da transação: para `organizations.aviso_telefone` se houver, senão para os
  organizadores ativos com telefone (`destinatariosDoAviso()`). O aviso leva
  protocolo, ID do cliente e valor — **nunca nome nem telefone do comprador**,
  porque o aparelho do atendimento pode ser compartilhado. Falha de envio não
  desfaz o chamado; o contador no menu (`/chamados/pendentes`) é o aviso que
  não depende da Meta.
- `npm run chamados` prova tudo isso contra a API de verdade.

## Conta do apostador — o que não pode afrouxar

O golpe que esta parte existe para barrar: alguém cria conta com o telefone
de outra pessoa e passa a ver — e pedir reembolso — das compras dela.

- **Senha prova a senha, não o número.** O que liga à conta uma compra feita
  fora dela é: o **CPF** gravado nela bater com o do cadastro
  (`compras_vinculadas_em`, só para o que já existia) ou o **telefone provado**
  pelo código do WhatsApp (`telefone_confirmado_em`). Compra feita dentro da
  conta (`orders.via_conta`) é dela sempre. A regra é `pedidoVisivel()`, e
  "Minhas compras" e o chamado passam por ela.
- **Ver não é reembolsar.** Ligada só pelo CPF, a compra antiga pode pedir
  reembolso se foi Pix online (o dinheiro volta para quem pagou); venda de
  cambista, que devolve à mão, exige o telefone provado
  (`podePedirReembolso()`).
- **Compra sem entrar no telefone de uma conta** só é da conta se vier com o
  CPF dela; sem CPF, fica para o telefone provado decidir.
- **Dentro da conta, quem compra é a conta.** `createOrder` com `contaId` usa
  nome, telefone e CPF da conta; o formulário não joga a compra no telefone
  de outro. E compra sem entrar com o telefone de uma conta **não renomeia**
  ninguém (`upsertBuyer` não mexe em conta com senha).
- **Comprador antigo virando conta**: o CPF das compras já gravado tem de
  bater (e aí as compras antigas vêm junto). A troca é um `UPDATE` condicional (`password_hash IS NULL`): dois
  cadastros ao mesmo tempo, só um vira dono.
- **CPF e e-mail são únicos só entre contas** (índices parciais): comprador
  sem conta pode repetir, e a mesma pessoa com dois telefones não trava.
- **Mesma mensagem para conta inexistente e senha errada**, e o limite de
  tentativas (`guardLogin`) usa a chave em hash — CPF e telefone não entram
  crus no registro de fraude.
- **Troca de senha, primeira prova do telefone e exclusão derrubam as outras
  sessões** da conta (`encerrarOutrasSessoes`). É assim que o dono de verdade
  expulsa quem criou a conta com o número dele.
- **Excluir é anonimizar** (LGPD): nome, telefone, CPF, e-mail e senha saem;
  o telefone vira `removido:<id>`; as mensagens enviadas perdem o número.
  Compras, bilhetes e recibos ficam, pelo prazo legal. Com reembolso em
  andamento, não exclui.
- `npm run conta` prova tudo isso contra a API de verdade, inclusive o golpe.

## De quem é o cliente — o que não pode afrouxar

Dois donos. **Cliente do cambista** (comprou na mão dele) é da organização e
aparece completo no painel dela. **Cliente da plataforma** (se cadastrou
sozinho, direto ou pelo link de afiliado) é da plataforma: o organizador vê
pedido, cotas e valor, e o cliente só pelo ID (`Cliente C-XXXXXXXX`).

- **A regra é por venda, não por pessoa** (`orders.seller_id`). A mesma pessoa
  pode ter comprado dos dois jeitos; o organizador enxerga só o lado dele.
- **Ganhador aparece completo** (sorteio ou cota premiada): o promotor
  responde pela entrega do prêmio (Lei 5.768/71).
- **Organização nula vê tudo** — mesma convenção de `orgOf()`.
- **A regra mora em dois lugares que andam juntos**: `clienteNoPainel()` para
  o que é montado pedido a pedido e `clienteVisivelSql()` para listas e
  exportações. Tela ou relatório novo com dado de comprador passa por um dos
  dois. Carteira de clientes (`exportacoes/compradores`) do organizador = só
  os fregueses dos cambistas dele.
- **O afiliado vê só o primeiro nome** de quem comprou pelo link dele; o
  cambista vê o próprio freguês inteiro.
- **Todo comprador tem ID desde a primeira compra** (`garantirCodigoCliente`
  no `createOrder`); quem comprou antes ganha pelo relógio
  (`preencherCodigosDeCliente`, trava 811006).
- `npm run isolation` prova: pedido online sem nome e sem telefone, venda do
  cambista completa, exportações, e o ganhador liberado.

## Endereço e região — o que não pode afrouxar

- **Localização ordena, nunca esconde.** Toda rifa é nacional:
  `ordenarPorProximidade()` põe a cidade de quem olha primeiro, depois o
  estado, depois o resto — estável, mantendo destaque e peso dentro de cada
  faixa. Filtro por região seria rifa que some para quem mora longe.
- **O estado da rifa é o da promotora** (`organizations.uf`). Não há campo de
  UF por campanha.
- **Endereço entra inteiro** (`PUT /organizacoes/:id/endereco`,
  `validarEndereco()`): cidade de um cadastro com UF de outro ordenaria a
  vitrine errado sem ninguém ver. Por isso `cidade` saiu do `PATCH` genérico.
- **O CEP é atalho, não porteiro.** `consultarCep()` tem prazo de 3 s e toda
  falha vira resposta (`indisponivel`, `nao_encontrado`); a tela deixa
  digitar à mão.
- **A região de quem compra vem do CEP do cadastro** (`buyers.cep`, `cidade`,
  `uf`; o CEP é obrigatório ao criar conta). O seletor de estado da vitrine
  vale mais e fica no aparelho (`client/src/lib/regiao.ts`); sem conta, só
  ele. CEP inexistente é recusado; serviço de CEP fora do ar **não** barra o
  cadastro — guarda o CEP e o relógio completa cidade e UF
  (`completarRegioesPendentes`, trava 811009).
- **Cadastro antigo "Cidade/UF"** é separado uma vez pelo relógio
  (`separarCidadesAntigas`, trava 811007), só onde a UF está vazia.

## Tema claro e escuro — o que não pode afrouxar

- **Cor é variável, nunca valor.** Tela nova usa as classes do Tailwind
  (`bg-white`, `text-ink`, `text-green-deep`…), que leem as variáveis de
  `index.css`. Hex no componente fica igual nos dois temas — só vale para o
  que é igual de propósito: banner sobre foto (`text-branco`), texto sobre
  amarelo (`text-on-yellow`) e o bilhete, que é papel e sai sempre branco.
- **Os nomes ficaram, o papel também.** No escuro, `white` é a superfície e
  `ink` o texto; os `-deep` são cor de **texto** (clareiam) e os `-soft` são
  fundo de aviso (escurecem). Por isso `bg-green-deep` não é usado: no
  escuro seria um fundo claro com texto branco.
- **Duas entradas, mesmos valores**: o celular pedindo escuro e a escolha
  explícita. `tests/tema.test.ts` confere que as duas são iguais e que o
  escuro redefine toda cor do claro.
- **Sem piscar.** O `index.html` aplica a escolha antes do primeiro desenho,
  com a mesma chave (`rifa.tema`) e as cores da barra de `COR_DA_BARRA`; o
  teste confere as duas coisas.
- **A escolha fica no aparelho**, como a região: padrão automático, e
  perder a escolha só devolve o automático.

## Perfil do organizador — o que não pode afrouxar

- **A rifa abre dentro do perfil** (`/o/:org/r/:rifa`). O endereço com a
  organização errada é corrigido para a dona da rifa — nunca mostra a rifa
  de um promotor "dentro" do perfil de outro. `/r/:rifa` segue valendo.
- **Seguir é a chave (organização, comprador)**: `INSERT … ON CONFLICT DO
  NOTHING`, e `seguidores_count` só anda quando a linha entrou, na mesma
  transação. Cinco toques simultâneos = um seguidor (`npm run perfil` prova).
  Sem `COUNT(*)` na página.
- **"Seguido por" é só de quem ligou o perfil público** (`buyers.perfil_publico`,
  nasce desligado — LGPD), e só o primeiro nome. A regra é `seguidoPor()`;
  o perfil nunca devolve telefone de seguidor.
- **O sino só existe para quem segue** (409 sem seguir). Seguir liga o sino.
  O aviso em si é a etapa das notificações.
- **A bio automática é montada, não guardada** (`bioAutomatica()`): segue a
  rifa no ar com o sorteio mais próximo, então muda sozinha quando outra é
  publicada.
- **A foto fica no banco** (`organizacao_fotos`), reprocessada em 400 px
  WebP — não depende do R2 e o arquivo enviado nunca é servido como veio.
  O endereço leva a data (`?v=`), por isso pode ter cache eterno.
- **Organização arquivada: o perfil some (404).** Mesma regra do resto.
- `PUT /organizacoes/:id/perfil` tem o recorte do endereço (o do vizinho é
  404) e está no `npm run isolation`.

## Notificações no celular — o que não pode afrouxar

- **O servidor só faz POST em serviço de push conhecido** (`endpointPermitido`:
  FCM, Mozilla, Apple, Windows; só HTTPS, porta 443). O `endpoint` vem do
  aparelho — aceitar qualquer um deixaria usar o servidor contra rede
  interna. Localhost só em desenvolvimento, que é como o teste roda.
- **Todo aviso tem chave por pessoa** (`push_envios`, `ON CONFLICT DO
  NOTHING`) — a mesma regra do `dedupeKey` do WhatsApp. O relógio do
  "sorteio chegando" roda a cada minuto e em várias réplicas sem repetir.
- **Só a janela mais apertada** (`janelaDoSorteio`): rifa a 30 min do
  sorteio recebe "em menos de 1 hora", nunca os dois avisos juntos.
- **Push nunca derruba o fluxo.** Publicar, sortear e responder chamado
  chamam `emSegundoPlano()`: a resposta não espera, e falha só vai ao log.
  Aparelho que responde 404/410 é apagado.
- **Quem recebe o quê**: rifa nova → quem segue com sino; sorteio chegando e
  resultado → quem segue com sino **e** quem comprou; reembolso → só o dono
  do chamado. WhatsApp segue sendo o canal do que é transação.
- **Permissão só depois de um toque** (seguir, ligar o sino, "Ligar avisos"
  em Minha conta). Pedir ao abrir o site vira "bloquear" para sempre.
- **As chaves VAPID nunca se regeneram sozinhas**: vêm do ambiente ou são
  criadas uma vez em `app_settings`. Trocar invalida todas as inscrições.
- Mudou `sw.js`? Troque `VERSAO` — senão o celular segue com a casca velha.
- `npm run push` prova tudo isso, descriptografando o que chega.

## Transparência — o que não pode afrouxar

- **O regulamento é montado dos dados da rifa** (`montarRegulamento()`):
  promotora, autorização, prêmio, cotas premiadas (só a descrição — o
  número nunca), numeração, preço, apuração, entrega e reembolso saem da
  mesma fonte do bilhete e da tela de compra. O organizador só acrescenta
  as disposições dele (`regulamentoExtra`), que entram por
  `PUT /campaigns/:id/legal` e **travam ao publicar** como a autorização.
  Rascunho não tem regulamento público (404).
- **A semente não sai antes do sorteio** — nem na página da rifa, nem no
  regulamento, nem em `/sorteio`. Antes, só o hash. `npm run transparencia`
  procura a semente em todas as respostas.
- **A conferência roda no aparelho de quem olha** (`conferirSorteio()`, com
  WebCrypto): a mesma conta de `drawNumber()`. Mudou uma, mude a outra —
  `tests/sorteio.test.ts` compara as duas em 300 casos.
- **Transmissão muda a qualquer hora** (`PUT /campaigns/:id/transmissao`),
  só https (`transmissaoValida`), fora do `PATCH` genérico. Recorte de
  campanha: o do vizinho é 404 (`npm run isolation`).
- **A ajuda responde com a regra em vigor** (`perguntasDaAjuda()` recebe a
  taxa de reembolso configurada): pergunta nova vai para `shared/ajuda.ts`,
  com `id` único.
