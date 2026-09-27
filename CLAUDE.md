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
| cartelas da compra rápida e mapa de números | `sugerirCartelas()` em `server/services/quotas.ts`, `client/src/components/Cartelas.tsx`, `client/src/pages/Rifa.tsx` |
| mexer no fluxo do pedido | `server/services/orders.ts` |
| trocar o provedor de pagamento | `server/payments/` — implemente `PaymentProvider`; a escolha é do painel (`shared/plataforma.ts`) |
| regras de publicação e mídia | `server/services/campaigns.ts`, `server/routes/admin.ts` |
| sorteio | `server/services/draw.ts` |
| segundo fator | `server/services/totp.ts` |
| variantes de imagem | `server/services/images.ts` |
| mensagens e modelos | `server/notifications/` |
| cotas premiadas | `server/routes/admin.ts` (sorteio) e `services/orders.ts` (revelação) |
| cadastro/cupom/kit do afiliado | `server/routes/public.ts`, `server/routes/affiliate.ts` |
| afiliado de todas as organizações (vínculo, termo, aceite, colaborador) | `shared/afiliados.ts` (regras), `server/services/afiliados.ts` (`comissaoNaRifa`), `client/src/pages/afiliado.tsx` (`AfiliadoOrganizacoes`), `scripts/afiliados-test.ts` |
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
| disputa de reembolso (palavra final da plataforma) | `bloqueioDaDisputa()` em `shared/chamados.ts`, `abrirDisputa()`/`decidirDisputa()` em `server/services/chamados.ts`, `scripts/disputa-test.ts` |
| contrato de cobrança da plataforma | `shared/billing.ts` e `server/services/billing.ts` |
| exportações | `shared/exports.ts` (formato) e `server/services/exports.ts` (consultas) |
| usuários, senha e arquivamento | `server/routes/admin.ts` (`/usuarios`, `/organizacoes/:id/arquivar`), `shared/senha.ts` |
| o que falta para vender em produção | `docs/PENDENCIAS.md` — **atualize no mesmo PR** que fechar um item |
| cadastro fiscal do afiliado, cofre e recibo | `shared/fiscal.ts` (regras), `server/services/cofre.ts`, `server/services/fiscal.ts`, `server/services/recibos.ts`, `client/src/pages/afiliadoDados.tsx`, `adminFiscal.tsx`, `Recibo.tsx`, `scripts/fiscal-test.ts` |
| guarda da comissão pela plataforma (etapa 12) | `guardaComissao` e `percentualDoPromotor()` em `shared/plataforma.ts`, `createOrder`/`settleOrderAsPaid` em `server/services/orders.ts`, `scripts/guarda-test.ts` |
| indicação, bônus e metas (etapa 13) | `shared/bonus.ts` (regras), `server/services/bonus.ts`, `resgatarCotasDeBonus()` em `server/services/orders.ts`, `client/src/lib/indicacao.ts`, `client/src/pages/adminBonus.tsx`, `client/src/components/BonusDoComprador.tsx`, `scripts/bonus-test.ts` |
| rifas patrocinadas por clique (etapa 15): pacote, fila, tabela e números | `shared/patrocinio.ts` (regras, preço, previsão da fila), `server/services/patrocinio.ts`, `client/src/pages/adminPatrocinio.tsx`, `client/src/components/Patrocinadas.tsx`, `scripts/patrocinio-test.ts` |
| marketing e tráfego pago (etapa 16): pixels, aviso de cookies, UTM, compra pelo servidor | `shared/marketing.ts` (regras e corpos das APIs), `server/services/marketing.ts`, `client/src/lib/marketing.ts`, `client/src/components/Marketing.tsx`, `client/src/pages/adminMarketing.tsx`, `scripts/marketing-test.ts` |
| plano da próxima fase (vitrine, contas, afiliados, marketing) | `docs/PLANO-FASE5.md` |
| conta do apostador (senha, confirmação, exclusão) | `shared/contaComprador.ts`, `server/services/contaComprador.ts`, `scripts/conta-test.ts` |
| de quem é o cliente (o que o organizador vê) | `shared/titularidade.ts` (regra) e `server/services/titularidade.ts` (SQL) |
| autorização SPA/MF e data do sorteio | `shared/campanhaLegal.ts`, `salvarDadosLegais()` em `server/services/campaigns.ts`, `client/src/components/DadosLegaisCard.tsx` |
| endereço do organizador e ordem da vitrine por região | `shared/endereco.ts` (regra), `salvarEndereco()` em `server/services/orgs.ts`, `server/services/cep.ts`, `client/src/components/EnderecoForm.tsx` |
| perfil do organizador, seguir e sino | `shared/perfil.ts` (regras), `server/services/perfil.ts`, `client/src/pages/Perfil.tsx`, `client/src/components/Seguir.tsx`, `scripts/perfil-test.ts` |
| perfil de demonstração (organização de exemplo, sem rifa à venda) | `server/services/demonstracao.ts`, card em `client/src/pages/adminOrganizacoes.tsx` |
| editar, adiar e excluir rifa (pedido analisado pela plataforma) | `shared/solicitacoes.ts` (regras), `server/services/solicitacoes.ts`, `excluirRifa()` em `server/services/campaigns.ts`, `client/src/components/EditarRifa.tsx`, `client/src/components/SolicitacoesDeRifa.tsx`, `scripts/solicitacoes-test.ts` |
| endereço curto (`/c/…`) e cliques nos links do perfil (`/l/…`) | `server/services/links.ts`, `client/src/components/LinksCurtos.tsx`, rotas em `server/routes/index.ts`, `scripts/perfil-test.ts` |
| white label do organizador (capa, cor de destaque, links) | `validarDestaque()`/`validarLinks()` em `shared/perfil.ts`, `salvarPerfil()` em `server/services/perfil.ts`, `client/src/components/DestaqueOrg.tsx`, `client/src/components/PerfilPublicoForm.tsx` |
| notificações no celular (Web Push) | `shared/push.ts` (regras), `server/services/push.ts`, `client/public/sw.js`, `client/src/lib/push.ts`, `scripts/push-test.ts` |
| regulamento, central de ajuda, transmissão e conferência do sorteio | `shared/regulamento.ts`, `shared/ajuda.ts`, `shared/sorteio.ts`, `client/src/components/SorteioCard.tsx`, `scripts/transparencia-test.ts` |
| vitrine: banners, stories, estados e feed | `shared/vitrine.ts` (regras), `server/services/vitrine.ts`, `client/src/components/BannersVitrine.tsx`, `Stories.tsx`, `EstadosVitrine.tsx`, `CartaoDoFeed.tsx`, `client/src/pages/adminStories.tsx`, `scripts/vitrine-test.ts` |
| painel de resultados, origem da venda e foto do ganhador | `shared/resultados.ts` (regras), `server/services/resultados.ts`, `client/src/lib/origem.ts`, `client/src/pages/adminResultados.tsx`, `server/services/ganhador.ts`, `scripts/resultados-test.ts` |
| aparência da plataforma (construtor de templates) | `shared/template.ts` (regras), `server/services/template.ts`, `client/src/lib/template.ts`, `client/src/pages/adminAparencia.tsx`, `scripts/aparencia-test.ts` |
| tema claro e escuro | `client/src/index.css` (variáveis), `client/src/lib/tema.ts`, `client/src/components/TemaToggle.tsx`, `tests/tema.test.ts` |
| comentários na publicação da rifa | `shared/comentarios.ts` (regras), `server/services/comentarios.ts`, `client/src/components/Comentarios.tsx`, `scripts/comentarios-test.ts` |
| perfil do apostador (apelido, foto, `/u/<apelido>`) e curtidas | `shared/perfilApostador.ts`, `server/services/perfilApostador.ts`, `client/src/components/PerfilDoApostador.tsx`, `client/src/pages/Usuario.tsx`, `scripts/comentarios-test.ts` |
| segurança do organizador: telefone aprovado, denúncias, rifa travada, banimento | `shared/seguranca.ts` (regras e varredura), `server/services/seguranca.ts`, `client/src/components/Seguranca.tsx`, `scripts/seguranca-test.ts` |
| visão do organizador (só o próprio perfil) | `VisaoDoOrganizador` em `client/src/App.tsx`, `organizacao` em `GET /api/auth/me` |
| central de avisos do apostador (o coração no topo) | `server/services/notificacoes.ts`, `avisar()` em `server/services/push.ts`, `client/src/pages/Notificacoes.tsx`, `CoracaoDeAvisos` em `client/src/components/AppShell.tsx`, `scripts/push-test.ts` |
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

## Cartelas e mapa de números — o que não pode afrouxar

- **Cartela é sugestão, não reserva.** `GET /campaigns/:slug/cartelas`
  sorteia grupos de números livres (do `free_pool` em endgame) e não grava
  nada. A compra vai com os números e passa por `reserveSpecific` — tudo ou
  nada, pela PK. Se alguém levou um número no meio, a compra recusa (409) e a
  tela troca aquela cartela sozinha. Nunca transformar a sugestão em
  "consultar e gravar".
- **Cartelas não repetem número entre si**, e `npm run load` confere que a
  sugestão só traz número livre, inclusive na reta final.
- **O mapa pagina de 100 em 100** sobre o bitmap de 1.000 do servidor e
  mostra o número inteiro (`formatQuota`). Cortar dígito fazia o bloco 2
  parecer o bloco 1.

## Perfil de demonstração — o que não pode afrouxar

- **Demonstração nunca vende.** As rifas "no ar" do perfil de exemplo levam
  `campaigns.demonstracao`: o cartão da vitrine diz "Demonstração" no lugar
  do selo SPA/MF, a página não oferece compra e `createOrder` recusa (409)
  — site, cambista e bônus passam por ele. `npm run vitrine` prova.
- **É a única rifa publicada sem autorização**, e por isso não tem número
  de autorização nem sorteio (data longe, sem semente). Rifa de verdade
  continua passando por `publishCampaign()` e pela invariante 9.
- **Só a plataforma cria e remove** (403 para organizador). Remover volta
  as rifas a rascunho e arquiva a organização; o reset do lançamento apaga.
- **Marcar como teste** (`marcarDemonstracao()`, `POST
  /campaigns/:id/demonstracao`) liga a mesma marca numa rifa qualquer:
  marcar só sem venda (quem comprou não acorda numa rifa "de exemplo");
  desmarcar só com autorização SPA/MF (a demonstração criada sem ela não
  passa a vender). Condições no próprio `UPDATE` (422); só a plataforma.
- **Preencher com exemplo** (`preencherComExemplo()`, `POST
  /organizacoes/:id/exemplo`) é para organização de teste: fotos das
  publicações só das rifas marcadas como teste, dois destaques (rifas de
  exemplo sorteadas, também marcadas), foto e capa só se faltarem, e três
  stories. Recusa (409) organização com rifa de verdade no ar — exemplo na
  vitrine de promotor real seria propaganda falsa com o nome dele.
- **Excluir rifa** (`excluirRifa()`, `DELETE /campaigns/:id`) apaga de
  vez: rascunho, rifa no ar sem nenhuma cota tomada (nem reserva em
  andamento) e rifa de teste. Dinheiro envolvido — pedido pago ou
  estornado, cobrança da plataforma, chamado, anúncio — e rifa já sorteada
  barram sempre (422). O resto vai pela cascata das chaves, numa transação
  com a rifa travada (`FOR UPDATE`) antes de conferir: a reserva que
  estiver gravando cota espera e a conferência a enxerga. Auditoria antes
  de apagar. O organizador apaga a dele (a do vizinho é 404).
- **Tirar do ar** (`tirarDoAr()`, `POST /campaigns/:id/tirar-do-ar`) vale
  para qualquer rifa publicada, mas só sem venda — pedido pago ou pendente,
  ou cota tomada, barram no próprio `UPDATE` (422). Volta a rascunho e
  descarta a semente ainda não usada; publicar de novo sorteia outra. Com
  comprador, o caminho é o estorno. Só a plataforma (403 no `npm run
  isolation`).

## Editar e adiar rifa publicada — o que não pode afrouxar

Rifa no ar tem comprador, e quem comprou comprou aquela rifa. Por isso,
depois de publicar, a organização não muda nada sozinha: **pede, e a
plataforma analisa** (Atendimento → Rifas, com conversa dos dois lados).

- **O prêmio nunca muda depois de publicar** — nem pedindo, nem pela
  plataforma (`LOCKED_AFTER_PUBLISH`, junto com preço, total e
  autorização). O que dá para pedir está em `CAMPOS_EDITAVEIS`: título,
  descrição, mínimo e máximo por pedido, tempo da reserva e comissão
  padrão. Rascunho continua mudando na hora.
- **O `PATCH` genérico não é atalho**: organizador em rifa publicada
  recebe 409 e vai por `POST /campaigns/:id/editar` (202 com protocolo).
  A plataforma edita direto, pela mesma régua (`validarEdicao()`). E
  `demonstracao` saiu do `PATCH` — só `marcarDemonstracao()` mexe nela.
- **Nada muda até a aprovação.** O pedido (`campanha_solicitacoes`,
  protocolo `RS-AAAAMMDD-NNNNNN`) guarda o antes e o depois; aprovar
  confere de novo contra a rifa de agora e aplica exatamente aquilo, com
  o pedido travado (`FOR UPDATE`): dois cliques, uma decisão, um 409.
- **Um em análise por rifa e tipo** — o índice parcial
  `uq_solicitacao_em_analise` decide, não um `SELECT` antes.
- **Adiar é por não atingir a meta**: rifa publicada, não sorteada e sem
  todas as cotas vendidas; data nova depois da atual, com 24 h de
  antecedência e até 180 dias; motivo obrigatório (`problemaNoAdiamento()`).
  Quem aprova confere a autorização SPA/MF — a tela lembra.
- **Aprovar o adiamento mexe em três coisas na mesma transação**: a data
  (só se ainda for a do pedido), `draw_at_original` e `adiamentos`, e a
  comissão `pending` da rifa, que passa a esperar a data nova — senão seria
  liberada antes do sorteio que ela devia esperar.
- **Adiamento se anuncia.** Push `sorteio_adiado` para quem comprou e quem
  segue com sino (chave com o número do adiamento), a página da rifa diz
  "Sorteio adiado — a data era …", e o aviso de "sorteio chegando" volta a
  valer para a data nova (a chave leva o adiamento).
- **Recorte**: o pedido do vizinho é 404 (ler, escrever, cancelar); decidir
  é só da plataforma (403). Os dois no `npm run isolation`. Quem decidiu
  aparece como "Plataforma"; a pessoa fica na auditoria.
- `npm run solicitacoes` prova tudo isso contra a API de verdade.

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
  parcial `uq_chamados_pedido_em_andamento`, não um `SELECT` antes.
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

## Disputa de reembolso — o que não pode afrouxar

A organização decide o reembolso com o dinheiro dela: é juiz em causa
própria. A disputa leva o caso ao administrador geral, que dá a palavra
final.

- **Quando cabe** (`bloqueioDaDisputa()` em `shared/chamados.ts`, a mesma
  régua na tela e no servidor): chamado recusado, até 7 dias da recusa, ou
  aberto sem resposta depois de 3 dias. Aprovado ou devolvido não tem o que
  contestar.
- **Fecha 2 horas antes do sorteio**, como o pedido: senão quem teve a recusa
  esperaria o resultado e só contestaria se perdesse. E pedido premiado
  (sorteio ou cota premiada) não pode ter disputa procedente — prêmio e
  dinheiro de volta juntos, nunca.
- **Uma por chamado**, pelo `UPDATE` condicional (`disputa IS NULL`, e o
  status que a régua conferiu). O recusado em disputa conta como em
  andamento no índice único parcial (`uq_chamados_pedido_em_andamento`):
  não abre outro chamado do mesmo pedido enquanto a plataforma decide.
- **Com a disputa aberta, a organização não decide** (`concluirChamado`
  exige `disputa IS NULL`) — mas a conversa segue dos dois lados, para ela
  argumentar.
- **Só a plataforma decide** (403 para organizador, no `npm run
  isolation`), com explicação, e `disputa = 'aberta'` no `UPDATE`: dois
  cliques, uma decisão. Procedente vira aprovado com o prazo da organização
  contado da decisão, e a devolução segue o caminho de sempre
  (`executarEstorno`, que a plataforma também alcança). Improcedente mantém
  a recusa e encerra.
- **Quem decidiu aparece como "Plataforma"** para o comprador e para a
  organização; a pessoa fica na auditoria (`chamado.disputa.*`).
- O índice ganhou nome novo quando o filtro mudou: `db:push` não troca o
  filtro de um índice existente, mas apaga o antigo e cria o novo.
- `npm run disputa` prova tudo isso contra a API de verdade.

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

## White label do organizador — o que não pode afrouxar

- **É a mesma régua do construtor, com menos opções.** Capa, cor de
  destaque e links; foto e bio já existiam. Só dados — nada de HTML, CSS ou
  script do organizador chega à tela.
- **A cor de destaque vale só dentro do perfil** e na faixa da promotora na
  página da rifa (`<DestaqueOrg>`, classe `.destaque-org`, que troca
  `--marca`). Cabeçalho, vitrine e o significado das cores (verde, amarelo,
  vermelho) não mudam. Contraste ≥ 3:1 nos **dois** temas, conferido no
  servidor (`validarDestaque()`); é isso que deixa o botão Seguir usar
  `bg-marca text-white` sem ficar ilegível.
- **Link é só `https:`**, sem usuário/senha na URL e com domínio de verdade
  (`validarLinks()`): o link sai na tela de todo apostador com a cara do
  organizador — `javascript:` ou um `http:` seriam golpe com a assinatura
  dele. Máximo 5; saem com `rel="noopener noreferrer nofollow ugc"`.
- **A capa fica no banco** (`organizacao_capas`), reprocessada em 1500×500
  WebP, como a foto. Endereço com `?v=`, cache eterno.
- **Recusa não deixa nada pela metade**: tudo é conferido (inclusive abrir
  as imagens) antes da transação. `npm run perfil` prova.
- **Redirecionamento só para destino guardado.** O endereço curto
  (`/c/<código>`, um por perfil e um por rifa, índices parciais) leva a um
  caminho do próprio site; o link do perfil (`/l/<perfil>/<n>`) leva ao
  link número `n` que a organização cadastrou. Nada da URL vira destino —
  senão a plataforma viraria redirecionador aberto com o nome do
  organizador. Índice fora da lista é 404; código inexistente volta para a
  vitrine.
- **Clique é contado sem `COUNT(*)`**: o curto num `UPDATE cliques + 1`, o
  link do perfil em `perfil_link_cliques` (organização, link, dia de São
  Paulo, `ON CONFLICT DO UPDATE`). Robô (`ehRobo`) não conta. Recorte da
  organização no painel (o do vizinho é 404, no `npm run isolation`).

## Comentários e a visão do organizador — o que não pode afrouxar

- **O organizador vê a plataforma pelo próprio perfil.** Com sessão de
  organizador, a vitrine, a página de estado e o perfil (ou rifa) de outra
  organização levam ao dele (`VisaoDoOrganizador`, com o slug que
  `/api/auth/me` devolve). É visão, não barreira: o que é público segue
  público. No próprio perfil, "Editar perfil" no lugar de "Seguir".
- **Comenta quem tem conta e apelido** (`req.session.buyer.id`, 409 sem
  apelido); a organização dona da rifa comenta e responde pela sessão do
  painel, com o selo "organização". Rascunho não tem comentários (404).
  Uma camada de resposta: responder uma resposta entra no comentário do
  topo. Como no Instagram: foto, apelido, data, curtidas, respostas
  recolhidas e a barra de reações; no feed, os comentários sobem num painel
  por cima da vitrine.
- **O apelido é o nome de usuário** (`validarApelido()`: minúsculas,
  números, ponto e sublinhado; sem telefone; reservados recusados), único
  entre contas pelo índice parcial `uq_buyers_apelido`. O perfil
  `/u/<apelido>` mostra foto, apelido e **sempre o primeiro e o último nome
  reais** (`nomeRealPublico`) — nunca telefone, CPF ou e-mail. A foto fica
  no banco (`comprador_fotos`, 320 px WebP). Excluir a conta (LGPD) leva
  apelido e foto.
- **Curtida é a chave (comentário, pessoa)** (`comentario_curtidas`):
  `ON CONFLICT DO NOTHING`, e o contador `comentarios.curtidas` só anda
  quando a linha entrou ou saiu, na mesma transação.
- **A organização não apaga comentário de apostador — pede.** Comentário
  pode ser a denúncia contra ela: `DELETE` dela vira solicitação
  `remover_comentario` (202, motivo obrigatório, uma em análise por
  comentário — índice `uq_solicitacao_comentario_em_analise`) e o
  comentário fica no ar até a plataforma decidir em Atendimento → Rifas. O
  que ela mesma escreveu, apaga na hora.
- **Sem link e sem telefone, de ninguém** (`problemaNoComentario()`): é o
  golpe clássico na rifa alheia ("chama no zap", "Pix aqui"). O contato da
  organização está no perfil, pelos links conferidos.
- **O apostador aparece pelo primeiro nome e a inicial**
  (`nomeNoComentario`); telefone nunca sai.
- **Contador sem `COUNT(*)`**: `campaigns.comentarios_count` anda na mesma
  transação que grava ou apaga.
- **Apagar é marcar** (`removido_em`, `removerNaTransacao`), e confere o
  dono antes: quem escreveu ou a plataforma; para os demais, 404 (`npm run
  isolation`). O do topo leva as respostas. `UPDATE` condicional: dois
  cliques, um desconto e um 404.
- **Limite por pessoa** (`hit`, 10 em 10 min), contado depois do erro de
  preenchimento — como o chamado.
- **A resposta da organização avisa o apostador** (push e coração,
  `comentario`), fora da transação.
- `npm run comentarios` prova tudo isso contra a API de verdade.

## Segurança contra organizador fraudulento — o que não pode afrouxar

O golpe: levar o apostador para um Pix fora da plataforma. Ele paga, não
tem bilhete válido, e o dinheiro não passou por rateio, comissão nem
estorno.

- **Só vale bilhete pago pela plataforma** — dito antes da compra
  (`SoValePelaPlataforma`), no regulamento (item 4) e na ajuda.
- **Telefone do organizador provado e aprovado antes da primeira rifa.**
  Código no WhatsApp (guardado só na sessão, em hash —
  `otpOrganizador`) e aprovação da plataforma (403 para organizador), que
  exige o número já provado. Trocar o número zera as duas marcas no mesmo
  `UPDATE`. Sem aprovação, `publishBlockers` barra a publicação.
- **Denúncia é só da plataforma.** O apostador (com conta) denuncia rifa,
  comentário ou organização; uma aberta por pessoa e organização (índice
  parcial `uq_denuncia_aberta_por_pessoa`), limite por dia. A denunciada
  nunca vê a fila nem quem denunciou (403 no `npm run isolation`).
- **Varredura automática do texto do organizador**
  (`pedePagamentoPorFora()`): comentário da organização, bio, legenda de
  story e texto da rifa. Procura o **pedido** ("faz um pix", "chave pix",
  "paga direto", "deposita"), não a palavra "pix" — "paguei com Pix pelo
  site" é o caminho certo. Acendeu, vira denúncia automática com o trecho;
  não barra o que ele fez (quem decide é a plataforma) e nunca derruba o
  fluxo (`emSegundoPlano`).
- **Decidir é `UPDATE` condicional** (`status = 'aberta'`): improcedente,
  **travar a rifa** (`campaigns.travada_em`: `createOrder` recusa com 409,
  sai da vitrine e das patrocinadas, a página avisa) ou **banir a
  organização** (`banida_em`, `active = false`: a porta fecha para todos
  dela em `barreiraDaOrganizacao`, o perfil some e todas as rifas
  publicadas travam na mesma transação). Travar e banir exigem motivo;
  auditoria antes. Destravar é da plataforma e nunca vale para banida.
- `npm run seguranca` prova tudo isso contra a API de verdade.

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
- **A central de avisos guarda o mesmo que sai por push** (o coração no
  topo do site, `/notificacoes`). `avisar()` grava em `notificacoes` para
  todo mundo que o aviso alcança — inclusive quem não ligou o push — com a
  mesma chave por pessoa (índice único `uq_notificacao_chave`), então o
  relógio que repete não duplica. Falha ao gravar não derruba o push nem o
  fluxo. Só o próprio comprador lê (sessão; sem sessão, 401) e abrir marca
  como lido. O número do coração vai no rótulo, não só na cor. O relógio
  apaga o que passou de 90 dias (`apagarNotificacoesAntigas`, trava 811012).
- `npm run push` prova tudo isso, descriptografando o que chega, e confere
  a central de cada pessoa.

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

## Construtor de templates — o que não pode afrouxar

- **Só dados, nunca HTML ou script.** Identidade (nome, logo, cor de marca,
  fonte de uma lista, cantos), blocos que o sistema já sabe desenhar e os
  textos do rodapé. `validarTemplate()` só guarda chaves conhecidas; bloco
  novo entra em `TIPOS_DE_BLOCO` **e** no `switch` da vitrine.
- **Cor de marca é marca, não significado** (`--marca`, `text-marca`): logo,
  links, destaque. Dinheiro, espera e erro não mudam com o template. A cor
  precisa de contraste ≥ 3:1 com o fundo de **cada** tema, conferido no
  servidor; `FUNDO` é o mesmo do `index.css` (o teste confere).
- **O feed de rifas não sai da vitrine**: template sem o bloco "Rifas no ar"
  ligado é recusado.
- **Publicar não sobrescreve**: cada publicação é uma linha em
  `template_versoes`; voltar publica a antiga como versão nova. Versão que
  não valide mais cai no padrão (`completarTemplate`) em vez de derrubar a
  vitrine.
- **Só o administrador geral** (403 para organizador, no `npm run isolation`).
  A pré-visualização lê o rascunho por `?previa=1` num iframe do próprio
  site — por isso `X-Frame-Options: SAMEORIGIN`, não `DENY`; site alheio
  continua sem poder emoldurar a loja.
- **A logo fica no banco** (`plataforma_arquivos`), reprocessada em WebP.
- `npm run aparencia` prova tudo isso e devolve o estado de antes no fim.

## Vitrine — o que não pode afrouxar

- **Banners são da plataforma** (403 para organizador, no `npm run
  isolation`): até 5 (`BANNERS_MAX`), com título obrigatório — é o texto
  alternativo da imagem. O link é caminho do site (`/r/…`) ou `https:`,
  nunca `//outro-site` nem `javascript:` (`validarLinkDoBanner`). A janela de
  datas e o "ligado" decidem o que está no ar (`bannerNoAr`), e entram na
  hora, sem publicar o template.
- **Limite é conferido com trava**, não com `SELECT` solto: contar e
  inserir ficam na mesma transação com `pg_advisory_xact_lock` (banners e
  stories por organização). Dois pedidos ao mesmo tempo não passam do teto —
  `npm run vitrine` prova.
- **Story vive 24 h** (`expira_em`). Vencido some da rota **na hora** (lista
  e imagem conferem a data), e o relógio tira do banco (`apagarStoriesVencidos`,
  trava 811010). Organização arquivada: a imagem também some.
- **Story leva só para rifa da própria organização**, e já pública. Apagar
  confere o dono **antes** do `DELETE` — o do vizinho é 404.
- **O "visto" do story fica no aparelho** (`client/src/lib/stories.ts`),
  como a região e o tema: perder só acende o anel de novo. O anel aceso é
  mais grosso e diz "(novo)" no rótulo — nunca só cor.
- **A fileira do topo é de stories, como no Instagram** (os círculos de
  estado saíram dela). `GET /api/public/stories` (`perfisComStory()`)
  traz todo perfil com story no ar e organização não arquivada, seguidos
  primeiro e o mais novo na frente; o aparelho põe o já visto no fim. Ela
  ocupa o lugar do primeiro bloco `seguidos` ou `estados` do template — o
  outro não repete. O organizador vê "Seu story" no começo, que leva a
  postar.
- **Estados ordenam, a página do estado filtra.** O seletor "Rifas perto
  de" põe o estado de quem olha primeiro; `/estado/UF` é escolha explícita
  da pessoa, por isso ali filtrar vale (`?estado=`). A vitrine segue só
  ordenando.
- **Feed em formato de publicação** (4:5), com o perfil da promotora
  **por cima da imagem**, como no Instagram (sombra no topo para o texto
  branco ler sobre qualquer foto; o link do perfil é irmão do link da rifa,
  nunca dentro dele), e o selo "Autorizada SPA/MF" com o número — a rifa no
  ar sempre tem.
- **Imagem nunca é servida como veio**: banner 1200×600 e story 1080×1920,
  WebP, sem metadados, no banco (até o R2 entrar).
- **Subconsulta com tabela de fora escreve o nome da tabela**
  (`"organizations"."id"`): o drizzle deixa a coluna sem prefixo dentro do
  template `sql`, e `id` vira o da tabela de dentro. E `timestamp` lido por SQL cru
  volta como texto sem fuso — é UTC, converta (`ultimoStorySql`).

## Painel de resultados — o que não pode afrouxar

- **Recorte em toda consulta** (`orgOf`), e o `?organizacao=` só vale para a
  plataforma: o organizador que manda o id do vizinho continua vendo o
  dele. `npm run resultados` confere os **valores** (receita, canais, rifas),
  não só o 200.
- **Receita é venda paga**, pelo dia do pagamento **no fuso de São Paulo**
  (`paid_at` guarda UTC; o início do período é convertido uma vez no SQL e a
  comparação fica na coluna crua). Pendente não entra; estornada sai da
  receita e aparece em "Estornos". Dia sem venda aparece com zero
  (`serieDiaria`).
- **Canal: quem vendeu manda** (`canalDaVenda`): cambista, depois afiliado,
  depois a origem do site. A **origem** (`orders.origem`) vem do navegador
  (`client/src/lib/origem.ts`, último toque na aba; anúncio por UTM, gclid,
  fbclid fica até fechar a aba) e é **só estatística** — valor fora de
  `ORIGENS` vira nulo, e nunca decide comissão nem dinheiro.
- **Ticket médio arredonda para baixo** — dinheiro é inteiro.
- **Gráfico de uma série só, verde** (dinheiro que entrou): sem legenda,
  com o dia em texto ao passar o dedo/mouse/foco e a tabela ao lado para
  quem não enxerga o gráfico.
- **Foto do ganhador só depois do sorteio** (409 antes), com recorte da
  campanha (o do vizinho é 404), reprocessada em 1080×1350 WebP no banco.
  Vira a capa do destaque no perfil e aparece no resultado. A autorização de
  uso da imagem é do organizador com o ganhador — a tela avisa.

## Afiliado de todas as organizações — o que não pode afrouxar

- **O afiliado é avulso**: a conta não tem organização
  (`users.organization_id` nulo) e entra na hora. O que cada organização
  aprova é o **vínculo** com ela (`afiliado_vinculos`, chave única do par —
  aderir de novo é `ON CONFLICT`). O cambista continua preso à organização
  pelo usuário: é colaborador dela, não avulso.
- **Sem vínculo aprovado, o link não dá comissão.** `comissaoNaRifa()`
  confere afiliado ativo, vínculo aprovado com a **dona da rifa** e, se a
  rifa foi publicada com termo, o aceite **daquela versão**. Sem isso a
  venda segue, sem afiliado. (Antes, o link de um afiliado da A dava
  comissão na rifa da B.) O afiliado antigo, com a organização no usuário,
  conta como vínculo aprovado com ela, e o relógio cria o vínculo dele
  (`migrarAfiliadosAntigos`, trava 811011).
- **O termo é fotografado na publicação** (`campaigns.termo_id`, com a
  mesma trava da publicação do termo — 811201 por organização): a rifa
  segue a versão com que foi publicada até o sorteio. Publicar termo nunca
  edita a versão anterior; o percentual das vendas da rifa sai do termo
  dela (`pctDaComissao`). Sem termo, vale o de antes (vínculo, cadastro,
  padrão da rifa).
- **O aceite é prova**: guarda a cópia do texto, a versão, IP e aparelho em
  hash. Aceitar olhando uma versão que já mudou é 409 — lê de novo.
- **Cupom é da organização** (`coupons.organization_id`): não vale na rifa
  de outra, e só a dona apaga. Conferir pelo afiliado deixaria uma
  organização mexer no cupom da outra, porque o afiliado é das duas.
- **Saque é por organização** (`payouts.organization_id`): cada uma vê e
  paga só a comissão das rifas dela, e o painel Financeiro filtra pela
  organização da rifa — nunca pela do usuário do afiliado. Com a guarda da
  plataforma ligada, a comissão guardada vira um saldo à parte, pago por ela
  (seção abaixo).
- **A organização decide o vínculo, nunca a conta.** `PATCH
  /affiliates/:id` do organizador muda o vínculo com ele; a conta (ativo,
  bloqueado) é da plataforma. Sair desfaz o vínculo sem apagar o que já foi
  ganho.
- **"Seja um colaborador" pede conta** (o pedido leva nome e WhatsApp dela
  para a organização responder) e tem um pedido em aberto por organização
  (índice parcial). Atender preenche o cadastro de cambista; a senha e o
  código continuam sendo criados pela organização.
- `npm run afiliados` prova tudo isso contra a API de verdade, inclusive o
  recorte entre duas organizações.

## Cadastro fiscal e recibo — o que não pode afrouxar

- **Dado fiscal e documento só entram cifrados** (`cofre.ts`, AES-256-GCM).
  A chave vem de `COFRE_CHAVE`, nunca do banco: vazar o banco sozinho não
  abre nada. Em produção, sem a chave, o cofre recusa — não existe modo
  "sem cifrar". Trocar a chave sem migrar é perder os documentos.
- **O CPF não vira chave crua.** A unicidade entre afiliados é pela
  impressão (HMAC do cofre, `cpf_impressao`, índice único parcial) — o
  índice decide, nunca um `SELECT` antes (409 para o repetido).
- **O organizador nunca vê** (403 em `/api/admin/fiscal*`, no `npm run
  isolation`). A plataforma vê, e **a auditoria é gravada antes** de o dado
  sair — dados e cada documento. A lista não traz dado nenhum; os dados só
  carregam ao conferir.
- **Documento é conferido pelo conteúdo** (bytes mágicos: JPG, PNG, WebP,
  PDF), até 6 MB, e servido com `no-store`.
- **Mexer depois de aprovado volta para análise** — trocar a conta de
  destino é exatamente o golpe de quem tomou a conta do afiliado. Decidir é
  `UPDATE` condicional (`em_analise` → aprovado/recusado); recusa exige
  motivo.
- **Exigir o cadastro para sacar é escolha da plataforma**
  (`exigirCadastroFiscal`, nasce desligada): quem já sacava não acorda
  barrado.
- **Baixa e recibo na mesma transação**, com `UPDATE` condicional: dois
  cliques dão um recibo e um 409. Recibo que não fecha (origem ≠ valor) não
  sai — e a baixa volta junto.
- **O recibo é o retrato, não uma consulta**: `snapshot` + SHA-256 do texto
  canônico + HMAC da plataforma. O PDF é gerado dele; a conferência pública
  (`/recibo/<código>`) refaz os dois e mostra só primeiro nome, pagador e
  valor — nunca CPF nem Pix. Um centavo mexido no banco vira "não confere".
- **Recibo não se apaga junto com o saque** (FK sem cascata): script de
  teste que apaga saque apaga o recibo antes.
- `npm run fiscal` prova tudo isso contra a API de verdade.

## Guarda da comissão pela plataforma — o que não pode afrouxar

- **Nasce desligada** (`guardaComissao`), e só a plataforma liga — depois de
  o contador confirmar o modelo. `setPlataforma()` parte da configuração
  atual: quem salva um pedaço não desliga o resto por omissão.
- **O contrato é da venda, não da chave.** O pedido nasce marcado
  (`orders.comissao_guardada`) junto com o split do Pix, e a comissão copia
  a marca (`commissions.guardada`). Desligar depois não muda o que já nasceu
  — o Pix daquela venda já foi dividido daquele jeito.
- **Só venda online com afiliado.** O cambista acerta com a casa em mãos.
- **No split, a comissão sai da parte do promotor, sobre o que sobrou da
  taxa** (`percentualDoPromotor(taxa, comissão)`, a mesma ordem de
  `splitOrder()`), arredondando para baixo: o promotor nunca recebe a
  fração que não é dele.
- **Guardada é sempre depois do sorteio**, mesmo com liberação "na hora" da
  organização (`comissaoInicial(..., guardada)`).
- **A organização não vê, não libera e não paga comissão guardada.** O
  saldo do afiliado mostra "Plataforma" à parte; o saque dela nasce sem
  organização, só o administrador geral dá baixa (o organizador recebe
  404), e o recibo sai em nome da plataforma.
- `npm run guarda` prova tudo isso contra a API de verdade.

## Bônus, indicação e metas — o que não pode afrouxar

- **Cota grátis só existe se o regulamento prevê.** O programa nasce
  desligado (`bonusLigado`) e liga-se depois do advogado; o resgate só vale
  em rifa com `aceita_cota_bonus`, marcada em `PUT /campaigns/:id/legal`,
  que **trava ao publicar** e põe a cláusula no regulamento
  (`clausulaDoBonus()`).
- **Livro-razão com chave única** (`bonus_lancamentos.chave`): a mesma
  indicação, meta ou resgate nunca lança duas vezes; o saldo
  (`buyers.bonus_saldo`) só anda quando a linha entrou, na mesma transação.
- **Indicação é da primeira compra paga do indicado**, conferida no próprio
  `INSERT … SELECT` e com índice único por indicado; autoindicação (mesmo
  comprador, telefone ou CPF) não conta. Confirma dentro da transação que
  confirma o pagamento; **estorno tira o bônus** na transação do estorno
  (`estornarIndicacao`) — senão comprar pelo próprio link com outro número e
  pedir o dinheiro de volta renderia cota grátis. O saldo pode ficar
  negativo: é dívida, e o resgate trava.
- **O código do link não é o ID do cliente**: o ID prova identidade no
  reembolso e não sai em link público.
- **Visita conta uma vez por aparelho** (hash, índice único) e no máximo
  `VISITAS_POR_DIA` por pessoa, contada sob trava (811301).
- **O resgate é venda pelo caminho de sempre**: pedido de R$ 0,00
  (`method = 'bonus'`), `reserveRandom` e `settleOrderAsPaid` — sem
  comissão e sem taxa, porque não entrou dinheiro. O saldo sai num `UPDATE`
  condicional na mesma transação que reserva: sem cota livre, nada sai.
  Fecha 2 horas antes do sorteio. **Cota de bônus não tem reembolso.**
- **Desligado, nada acumula e nada se resgata**; o saldo de cada um fica.
- `npm run bonus` prova tudo isso contra a API de verdade.

## Rifas patrocinadas — o que não pode afrouxar

O anúncio é um **pacote de cliques**: rifa + alcance (cidade, estado ou
Brasil) + quantos cliques. Pago de uma vez com o saldo, entra no fim da
fila do seu segmento e, quando pega a vaga, **fica até gastar o pacote** —
aí o próximo entra sozinho.

- **Sem interruptor geral** — o único interruptor do patrocínio é o do
  reembolso do saldo (abaixo). Só a plataforma edita a tabela
  (`ConfigPatrocinio`: preço do clique por alcance em centavos, faixas de
  desconto por volume, mínimo de cliques, vagas por alcance, recarga
  mínima). Sem anúncio no ar, o bloco vem vazio e some da vitrine.
- **O preço é fotografado na compra** (`preco_clique_cents`,
  `desconto_pct`, `valor_pago_cents`): mudar a tabela não mexe em anúncio
  comprado. Total arredonda para baixo; o desconto da faixa só cresce
  (`validarConfigPatrocinio`), senão pacote maior sairia mais caro.
- **A fila não é gravada, é calculada** (`fila()`): anúncios ativos com
  clique sobrando, rifa no ar e promotora não arquivada, numerados por
  `fila_desde` em cada segmento (`nacional`, `estado:UF`,
  `cidade:UF:nome-sem-acento`); os primeiros `vagas` estão no ar. Nada a
  promover, nada a esquecer de promover. A previsão (`previsaoDaFila`) usa o
  ritmo das últimas 24 h — é estimativa e a tela diz isso.
- **O anúncio nunca gasta mais do que comprou**: o clique é `UPDATE`
  condicional (`usados < comprados`), e o último encerra o anúncio na mesma
  transação. O gasto é `gastoAte()` — proporcional, para baixo — e a soma
  dos cliques dá exatamente o valor pago.
- **O saldo anda pelo livro** (`patrocinio_lancamentos`, chave única):
  compra (`anuncio:<id>`), estorno e recarga
  lançam uma vez só, e o saldo nunca fica negativo (`UPDATE` condicional —
  sem saldo, a compra cai inteira e nada entra na fila). A recarga é Pix
  **sem split** para a conta da plataforma, com código na faixa de 9
  dígitos; o webhook reconhece a recarga (`confirmarRecarga`) antes de
  procurar pedido.
- **Não existe cancelamento de anúncio.** Enquanto a rifa está no ar, o
  crédito do anúncio fica preso a ele — não se cancela e não se pede
  reembolso. Quando a rifa sai do ar (ou a promotora é arquivada), o relógio
  (`encerrarAnunciosForaDoAr`, trava 811403) encerra o anúncio e devolve ao
  saldo, **como crédito**, o que não foi gasto (`sobra-anuncio:<id>`),
  condicional em `status = 'ativo'`. O saldo vale para qualquer rifa.
- **Reembolso em dinheiro do saldo tem interruptor próprio**
  (`patrocinioReembolso`, nasce desligado — a plataforma quer medir a
  demanda primeiro). Desligado, o organizador **não vê o botão nem a palavra
  reembolso** (para não gerar especulação) e `POST /patrocinio/reembolsos`
  responde 404; pedido que já existia continua visível até terminar.
  Ligado, o pedido (`patrocinio_reembolsos`, protocolo `PR-XXXXXX`) leva
  valor, chave Pix e motivo, e **reserva o valor no saldo** na abertura
  (`reembolso-reserva:<id>`) — não dá para gastar em anúncio o que está em
  análise. Um em aberto por organização (índice parcial
  `uq_patrocinio_reembolso_aberto`). A conversa é entre a organização e
  "Suporte" (nunca o nome de quem atendeu).
- **Só a plataforma decide e dá baixa** (403 para organizador, no `npm run
  isolation`): aprovado devolve por Pix o pedido menos o que ela retém
  (custo de divulgação externa), e fica "a pagar" até a baixa; recusado
  devolve o valor ao saldo (`reembolso-recusado:<id>`). Pedido travado antes
  e `UPDATE` condicional em cada passo: dois cliques, uma decisão, uma baixa.
- **Clique honesto**: uma vez por aparelho (hash) em 24 h por anúncio, sob
  trava do par (811402); robô (`ehRobo`), aparelho sem identificação e
  anúncio esgotado vão para **barrados** — o patrocinador vê o que não
  pagou. A rota responde 204 sempre, para não ensinar o que conta.
- **Números para provar que vale a pena**: `patrocinio_diario` (por
  anúncio, dia de São Paulo e UF de quem olhou) guarda exibições, cliques,
  barrados e gasto — sem `COUNT(*)` no painel. A **venda atribuída** é do
  mesmo aparelho que clicou na mesma rifa em até 7 dias (`orders.anuncio_id`,
  último clique): estatística, nunca decide dinheiro.
- **Recorte**: anúncio só de rifa própria no ar (vizinho 404 por
  `assertCampaignInScope`); pedido e conversa de reembolso conferem o dono
  (o do vizinho é 404); o organizador vê só os números dele e nunca a fila
  dos outros. Configuração e ajuste de
  saldo são da plataforma (403 no `npm run isolation`).
- **Propaganda se identifica**: cada cartão diz "Patrocinada" em texto.
  Quem olha vê cidade, estado e Brasil nessa ordem, uma vez por rifa.
- Template publicado antes do bloco existir ganha o bloco antes do feed
  (`comPatrocinadas()` na vitrine); no construtor ele pode mudar de lugar
  ou ser desligado.
- `npm run patrocinio` prova tudo isso contra a API de verdade.

## Marketing e tráfego pago — o que não pode afrouxar

- **Sem interruptor: quem liga é o pixel.** O menu Marketing existe para a
  plataforma e para o organizador; sem nenhum pixel cadastrado para a
  página, nada carrega, o aviso de cookies não aparece e nenhuma compra vira
  evento. (O único interruptor ligado a dinheiro de anúncio é o do
  reembolso do saldo de patrocínio.)
- **Só dados, nunca script.** Pixel é número conferido por formato
  (`validarPixels`: Meta, GA4, Google Ads e rótulo, TikTok); quem monta o
  código que roda no navegador é `client/src/lib/marketing.ts`, chamando as
  funções oficiais com o número. Campo livre viraria script de terceiro na
  tela de todo apostador.
- **Consentimento antes do pixel** (LGPD). Sem o "Aceitar" do aviso
  (`rifa.cookies`, no aparelho, com versão), nenhum script carrega. Recusar
  é tão fácil quanto aceitar (dois botões iguais) e o rodapé tem "Cookies"
  para mudar de ideia. O pedido leva `marketing: true/false`
  (`orders.marketing_consentimento`): sem o aceite, a compra **não** sai
  pelo servidor.
- **Cada evento vai só para os pixels da página** (`trackSingle`,
  `send_to`, `ttq.instance`): na SPA o pixel da promotora A continuaria
  iniciado na rifa da B. A página diz de quem é
  (`definirOrganizacaoDaPagina`) e sai limpando.
- **A compra conta pelo servidor, uma vez.** Na transação que confirma o
  pagamento, `enfileirarCompra` grava uma linha por destino com pixel **e**
  chave (`marketing_eventos`, único por pedido+dono+provedor); os destinos
  são lidos antes do BEGIN (decifram chave). O relógio
  (`enviarEventosPendentes`, trava 811501) toma cada linha num `UPDATE`
  condicional, manda com prazo de 5 s e, falhando, espera 1, 5, 25, 125 min;
  na quinta desiste (`falhou`). Falha nunca toca o pagamento.
- **Mesmo `event_id` no navegador e no servidor** (`compra-<código>`): Meta,
  Google e TikTok juntam os dois. O navegador conta a compra uma vez por
  aparelho (`compraJaContada`).
- **Dado pessoal só em hash e só com consentimento**: telefone vira
  `sha256("55" + DDD + número)`; o clique do anúncio (fbclid/ttclid) vai
  como identificador do anúncio. Nome, CPF e e-mail nunca saem.
- **Chaves de API cifradas no cofre** (`marketing_credenciais`, uma por
  dono: `plataforma` ou o id da organização) e **nunca voltam** — a tela
  sabe só se existe. Campo ausente mantém, vazio apaga.
- **UTM é estatística**, como a origem: `validarUtm` só guarda as chaves
  conhecidas, limpas e curtas (`orders.utm`); o relatório "Vendas por
  campanha" agrupa por fonte/meio/campanha com o recorte de `orgOf`.
- `npm run marketing` prova tudo isso contra a API de verdade (o envio é
  injetado: a prova não sai para a internet).

