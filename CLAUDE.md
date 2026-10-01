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
    esperando 500 simultâneos. Também o comprador (`upsertBuyer`, pelo
    `uq_buyers_phone`), o cupom, a organização e o código do afiliado — o
    primeiro pedido de um telefone novo, tocado duas vezes, dava erro 500.
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
    contador, comissão, taxa da plataforma, cota premiada e o crédito do
    presente na mesma transação. Desfazer cinco das seis não dá erro — vira
    comissão paga a quem não vendeu, ou número que some do estoque. `npm run
    refund` prova (e `npm run presente`, o crédito).
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
| cartelas da compra rápida e mapa de números | `sugerirCartelas()` em `server/services/quotas.ts`, `client/src/components/Cartelas.tsx`, `client/src/pages/Rifa.tsx`, o quadriculado em `client/src/lib/quadro.ts` e `.quadro` em `client/src/index.css` |
| mexer no fluxo do pedido | `server/services/orders.ts` |
| trocar o provedor de pagamento | `server/payments/` — implemente `PaymentProvider`; a escolha é do painel (`shared/plataforma.ts`) |
| regras de publicação e mídia | `server/services/campaigns.ts`, `server/routes/admin.ts` |
| sorteio | `server/services/draw.ts` |
| segundo fator | `server/services/totp.ts` |
| variantes de imagem | `server/services/images.ts` |
| onde a mídia é guardada e a cópia de segurança | `server/services/storage.ts` (`LocalDiskStorage`, `CopiaS3`, `sincronizarCopia`), `/uploads` em `server/index.ts`, `tests/backup.test.ts` |
| mensagens e modelos | `server/notifications/` |
| cotas premiadas | `shared/premiadas.ts` (números escolhidos), `server/routes/admin.ts` (sorteio e escolha), `services/orders.ts` (revelação), `premiados` em `listarComentarios()` (o comentário fixo de quem levou), `client/src/components/CotaSurpresa.tsx` (o presente na publicação, que revela) |
| cadastro/cupom/kit do afiliado | `server/routes/public.ts`, `server/routes/affiliate.ts` |
| afiliado de todas as organizações (vínculo, termo, aceite, colaborador) | `shared/afiliados.ts` (regras), `server/services/afiliados.ts` (`comissaoNaRifa`), `client/src/pages/afiliado.tsx` (`AfiliadoOrganizacoes`), `scripts/afiliados-test.ts` |
| venda física e acerto | `server/routes/seller.ts`, `server/services/settlements.ts` |
| meios de pagamento aceitos | `shared/payments.ts` (regras) e `services/settings.ts` |
| bilhete | `server/services/ticketFormat.ts` (puro) e `ticket.ts` (dados) |
| ponte com a maquininha | `client/src/lib/pos.ts`, `android/`, `docs/MAQUININHAS.md` |
| teste de carga | `scripts/load-test.ts` |
| relógios (expiração, lembretes, limpezas) e a trava de cada um | `server/jobs/index.ts` (`withLock`), `poolDasTravas` em `server/db.ts`, `scripts/relogios-test.ts` |
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
| central de avisos do apostador (o trevo no topo) | `server/services/notificacoes.ts`, `avisar()` em `server/services/push.ts`, `client/src/pages/Notificacoes.tsx`, `CoracaoDeAvisos` em `client/src/components/AppShell.tsx`, `scripts/push-test.ts` |
| perfil verificado (selo de trevo): documentos, foto, fila e cores | `shared/verificacao.ts` (regras e paleta), `server/services/verificacao.ts`, `server/services/rosto.ts` (comparador), `server/routes/verificacaoRotas.ts`, `client/src/components/Verificacao.tsx`, `SeloVerificado.tsx`, `VerificacoesDaPlataforma.tsx`, `CoresDoSelo.tsx`, `scripts/verificacao-test.ts` |
| formato da publicação (retrato 4:5, quadrado 1:1, paisagem 1,91:1, vertical 9:16) e o perfil acima ou por cima | `formatoDaPeca()`/`formatoDoCarrossel()`/`perfilPorCima()` em `shared/publicacao.ts`, `probeVideoDimensions()` em `server/services/probe.ts`, `Carrossel` em `client/src/components/Publicacao.tsx`, `tests/publicacao.test.ts` |
| publicação da rifa: carrossel de até 10 (reels e vídeos), barra de ações (trevo, comentar, republicar, compartilhar, "+" do carrinho, comprar) e legenda | `shared/publicacao.ts` (regras), `server/services/publicacao.ts`, `server/services/media.ts` (limites), `client/src/components/Publicacao.tsx`, `scripts/publicacao-test.ts` |
| carrinho (várias rifas, separadas por organização), o Pix único do carrinho e o comprar da publicação | `shared/carrinho.ts` (regras e split), `server/services/carrinho.ts`, `createCartOrder()` em `server/services/orders.ts`, `client/src/pages/CarrinhoPix.tsx`, `client/src/components/EscolherBilhete.tsx` (a janela do "+"), `scripts/carrinho-test.ts`, `client/src/lib/carrinho.ts`, `client/src/pages/Carrinho.tsx`, `BarraDeAcoes` em `client/src/components/Publicacao.tsx`, `scripts/publicacao-test.ts` |
| presente pelos comentários (desconto de primeira compra pago pela plataforma) | `shared/presente.ts` (regras), `server/services/presente.ts`, `prepararPedido`/`settleOrderAsPaid` em `server/services/orders.ts`, `Presentear` em `client/src/components/Comentarios.tsx`, `AvisoDePresente` em `client/src/pages/Rifa.tsx`, cartão Presente em `client/src/pages/adminBonus.tsx`, `scripts/presente-test.ts` |
| topo e console do app (os 6 botões da base, a lateral no computador, o trevo e a publicação) | `shared/console.ts` (botões, aviso do trevo, quem publica), `client/src/components/Console.tsx`, `PublicShell` em `client/src/components/AppShell.tsx`, `client/src/pages/PerfilDoUsuario.tsx`, `client/src/pages/EmBreve.tsx`, `client/src/components/TopoDoAppCard.tsx`, `tests/console.test.ts` |
| avisos do painel (o sino: comentários novos nas rifas, pendências do atendimento) | `shared/avisos.ts`, `server/services/avisos.ts`, `GET /api/admin/avisos` em `server/routes/admin.ts`, o `<details>` do sino em `PanelShell` (`client/src/components/AppShell.tsx`), `tests/avisos.test.ts`, `scripts/isolation-test.ts` |
| busca do painel (tela, pedido pelo código, cliente pelo ID, organização pelo nome) | `shared/busca.ts` (`interpretarBusca`, `caminhoDoAchado`), `server/services/busca.ts`, `GET /api/admin/busca` e os filtros `?codigo=`/`?cliente=` de `/orders` em `server/routes/admin.ts`, `BuscaDoPainel` em `client/src/components/AppShell.tsx`, `tests/busca.test.ts`, `scripts/isolation-test.ts` |
| caixa de entrada da plataforma (tudo que espera decisão, numa lista) | `shared/caixa.ts` (ordem e destino), `server/services/caixa.ts`, `client/src/pages/adminCaixa.tsx`, `tests/caixa.test.ts` |
| lista e item aberto do Atendimento (chamados, pedidos de mudança, denúncias, verificações) | `MestreDetalhe` em `client/src/components/painel.tsx`, `client/src/pages/adminAtendimento.tsx`, `SolicitacoesDeRifa.tsx`, `VerificacoesDaPlataforma.tsx`, `Seguranca.tsx` (`DenunciasDaPlataforma`) |
| abas de uma tela de painel (Configurações, edição da rifa), aba na URL e âncora | `Abas` em `client/src/components/painel.tsx`, `shared/abas.ts` (`abaInicial`, `abaDoTeclado`), `AdminConfiguracoes` e a edição em `AdminCampanhas` (`client/src/pages/admin.tsx`), `tests/abas.test.ts` |
| lista longa do painel (paginação por chave, cartão no celular e tabela a partir de `sm`) | `shared/paginacao.ts`, `/orders` e `/cobranca/extrato` em `server/routes/admin.ts`, `extratoDa()` em `server/services/billing.ts`, `client/src/lib/paginada.ts`, `TabelaOuCartoes`/`VerMais` em `client/src/components/painel.tsx`, `tests/paginacao.test.ts` |
| campo de digitar (classe `.campo`, componente `Campo` com rótulo, dica e erro) | `.campo` em `client/src/index.css`, `Campo` em `client/src/components/bits.tsx`, `tests/pecas.test.ts` |
| janela sobre a tela (sobe de baixo, Esc, fundo, rolagem travada) | `client/src/components/Janela.tsx`, regra 14 de `docs/VERSOES.md`, `tests/pecas.test.ts` |
| casca dos painéis (menu lateral em grupos, barra de cima, busca, conta, rodapé) e as peças do kit | `MENUS`/`menuDe()` em `shared/access.ts`, `PanelShell` em `client/src/components/AppShell.tsx`, `client/src/components/painel.tsx` (`Estatistica`, `CartaoDoPainel`, `CabecalhoDaTabela`, `AlternarVisao`), `.painel`/`.cartao` em `client/src/index.css`, `tests/menu.test.ts` |
| remodelagem do web e dos painéis: inventário do que existe e lista de conferência | `docs/REMODELAGEM.md` |
| vitrine no tablet e no computador: coluna ao vivo (tela do sorteio, ganhadores, jogando agora), tela flutuante e rodapé com logos | `shared/aoVivo.ts` (regras), `server/services/aoVivo.ts`, `client/src/components/ColunaAoVivo.tsx`, `client/src/components/RodapeDaPlataforma.tsx`, `validarApoios()` em `shared/template.ts`, `tests/aoVivo.test.ts`, `scripts/vitrine-test.ts` |
| rodapé da plataforma: colunas de links, redes sociais e espaço de apoio | `shared/rodape.ts` (colunas), `validarRedes()`/`REDES_DO_RODAPE` em `shared/template.ts`, `client/src/components/RodapeDaPlataforma.tsx`, cartão "Redes sociais do rodapé" em `client/src/pages/adminAparencia.tsx`, `preencherRodapeComExemplo()` em `server/services/template.ts`, `tests/rodape.test.ts` |
| app instalável (PWA): casca, nome e ícone | `client/public/sw.js`, `shared/manifest.ts` (o manifesto montado), `manifestDaPlataforma()`/`iconeDaMarca()` em `server/services/template.ts`, `client/public/manifest.webmanifest` (o de fábrica, se o banco falhar), `client/src/lib/pwa.ts`, `tests/manifest.test.ts`, `scripts/aparencia-test.ts` |
| automação do Claude no projeto: `/provar` (escolhe as provas pela área mexida), `/pr-check` (o rito do PR: docs, capturas, rascunho, mesclagem) e o agente `revisor-de-invariantes` (lê o diff contra as invariantes) | `.claude/skills/provar/SKILL.md`, `.claude/skills/pr-check/SKILL.md`, `.claude/agents/revisor-de-invariantes.md`. **Invariante nova ou regra de PR nova entra nos três** — o `.gitignore` libera só estes (o resto de `.claude/skills` é instalado por `npx skills add`, com o `skills-lock.json`) |
| segurança: onde mora cada defesa, lista de conferência de rota nova e as revisões | `docs/SEGURANCA.md` |
| versões (celular, tablet, computador): registro das mudanças do celular, levas, mapa das telas e auditoria | `docs/VERSOES.md` (guia, mapa e registro — **anote no mesmo PR**), `scripts/telas.ts` (`npm run telas`), `tests/versoes.test.ts` |

## Convenções

- Português nos textos de interface, mensagens de erro e comentários.
- Todo número que o usuário lê (cota, real, prazo, percentual) usa a classe
  `tnum` — DM Mono com algarismo tabular.
- Estado nunca é comunicado só por cor: use `<Pill>`, que traz rótulo em texto.
- Paleta: **claro é branco, azul e verde; escuro é preto, verde e azul.**
  Verde = dinheiro que entrou; azul = espera e prêmio; vermelho = erro.
  **Amarelo não faz parte do padrão** — não entra em tela, em cor de
  componente nem em arte nova. Os tokens `--yellow*` e as classes
  `bg-yellow-soft`/`text-yellow-deep`/`text-on-yellow` **ficaram com o nome
  de antes e hoje são o azul** (não renomeie: são 190 usos); a regra é que o
  valor deles nunca volta a ser amarelo (`tests/tema.test.ts` confere). Cor
  sem significado é ruído. O tema escuro troca os tons, nunca o significado
  (seção "Tema claro e escuro").

## O que ainda não existe

- Política de conteúdo (CSP) completa: hoje só `frame-ancestors`. Os pixels
  de marketing pedem a lista de origens — o caminho é começar em modo
  relatório. O que mais ficou para depois está em `docs/SEGURANCA.md`.

- **Chatbase AI nos painéis** (a última peça do plano dos painéis): uma
  coluna à direita para o administrador master e o organizador, com uma IA que
  interage com o sistema e os auxilia. Ainda não existe; as regras de
  recorte e de confirmação estão em `docs/PENDENCIAS.md` (seção 1b). Quando
  entrar, vale o recorte de `orgOf` e nada de dado pessoal de comprador no
  contexto.

- Pôster extraído do vídeo e transcode: hoje servimos o arquivo original. A
  medição e os limites já existem; falta o processamento. Cloudflare Stream
  resolve os dois de fábrica.
- Fila (BullMQ): os três relógios rodam com `setInterval` no processo,
  protegidos por trava de aplicação do Postgres — com várias réplicas só uma
  executa. Serve bem; a fila entra quando houver trabalho pesado de verdade.
  **A trava pega a conexão de `poolDasTravas`, nunca do `pool` comum**
  (`withLock()` em `server/jobs/index.ts`): a trava é de sessão e fica presa
  enquanto o relógio trabalha pelo `pool`. No mesmo pool, os ~12 relógios
  que disparam juntos a cada 15 min pegavam as 10 conexões só para as
  travas e esperavam para sempre pela 11ª — a produção parou de responder
  toda rota com banco ("Carregando rifas…" no aparelho). E o `pool` tem
  prazo para conseguir conexão (`connectionTimeoutMillis`): sem conexão, a
  requisição falha em vez de esperar sem fim. `npm run relogios` prova.
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

- **Número é casa quadrada, azul ou verde ao acaso** (`.quadro` com
  `.quadro-azul`/`.quadro-verde`, variáveis `--quadro-*` em `index.css`),
  cheias e com número branco nos **dois** temas — sem casa branca ou preta.
  A cor sai do próprio número (`corDaCasa()` em `client/src/lib/quadro.ts`):
  parece aleatória, mas o mesmo número tem a mesma cor no mapa, na cartela
  da página da rifa, na janela do "+" e no carrinho, e a tela não troca de
  cor a cada toque. É só apresentação. Contraste ≥ 3:1 em cada casa e do
  escolhido contra as duas cores, nos dois temas — `tests/quadro.test.ts`
  confere.
- **Cartela é sugestão, não reserva.** `GET /campaigns/:slug/cartelas`
  sorteia grupos de números livres (do `free_pool` em endgame) e não grava
  nada. A compra vai com os números e passa por `reserveSpecific` — tudo ou
  nada, pela PK. Se alguém levou um número no meio, a compra recusa (409) e a
  tela troca aquela cartela sozinha. Nunca transformar a sugestão em
  "consultar e gravar".
- **Cartelas não repetem número entre si**, e `npm run load` confere que a
  sugestão só traz número livre, inclusive na reta final.
- **Quatro cartelas por pacote** (`CARTELAS_NA_TELA`): fecham o 2 × 2 do
  tablet. **E chegam antes do toque**: a página da rifa busca, em paralelo,
  as de todos os pacotes ao abrir (`preCarregarCartelas()`), e trocar de
  pacote mostra as dele na hora. A sugestão guardada vale 60 s e sai da
  guarda quando aparece (`renovar()` já busca a próxima) — voltar ao pacote
  não repete a cartela que foi para o carrinho. Enquanto não chega, o lugar
  das cartelas já fica desenhado, sem a tela pular. Segue sendo só
  sugestão: o número levado nesse meio-tempo a compra recusa (409).
- **O mapa pagina de 100 em 100** sobre o bitmap de 1.000 do servidor e
  mostra o número inteiro (`formatQuota`). Cortar dígito fazia o bloco 2
  parecer o bloco 1.
- **A página abre no +10** (fora da faixa da rifa, o pacote em destaque);
  o **+0**, à esquerda do +5, abre o mapa. O cabeçalho do mapa é a faixa
  da página ("0001 a 0100"), a busca e as setas. O mapa tem 10 colunas no
  tablet e com número de até 3 dígitos, e 5 no resto (`colunasDoMapa()`),
  para o número inteiro caber — até 7 dígitos na rifa de 1 milhão.
  O **escolhido** sai do azul e do verde (`.quadro-escolhido`: a cor do
  texto — quase preto no claro, quase branco no escuro), com ✓ no canto e
  `aria-pressed`; o **vendido** é cinza e riscado (`.quadro-vendido`).
  Estado nunca só pela cor.
- **Os números de cada página aparecem embaralhados**
  (`embaralharPagina()` em `client/src/lib/embaralhar.ts`, semente da
  visita): a página continua sendo a faixa do cabeçalho, só a ordem na tela
  muda, e a mesma página volta na mesma ordem. O número buscado fica
  contornado e a tela rola até ele. É só apresentação — a reserva segue
  pela PK.

## Layout no computador — o que não pode afrouxar

- **O celular é a referência; o computador abre em grade a partir de `lg`.**
  `PublicShell larga` passa a coluna de 768 px para 1152 px só em `lg`;
  abaixo disso nada muda. Tela nova larga reorganiza por classes `lg:`,
  nunca com um segundo componente para o computador.
- **Página da rifa em duas colunas**: publicação (organização, banner,
  carrossel, ações) à esquerda; a compra (`<aside>`) à direita, fixa na
  rolagem e com rolagem própria, e o total com o Pix no pé dela. O DOM segue
  a ordem do celular — publicação, compra, resto — e a grade só reposiciona
  (`lg:col-start`/`lg:row-start`); inverter a ordem no DOM mudaria o
  celular e a leitura de tela.
- **Vitrine: uma rifa por vez, em todas as larguras**, com rolagem
  infinita (`FeedInfinito`: leva de 4, a próxima ao chegar perto do fim, e
  "Ver mais rifas" de reserva). No tablet e no computador o cartão tem
  cantos arredondados e borda, as **colunas ficam coladas** (a vitrine
  ocupa a largura toda — `PublicShell vitrine` — e entre o feed e a coluna
  há só a linha de 1 px, nada de espaço grande), e à direita fica a **coluna ao vivo**
  (`ColunaAoVivo`, fixa na rolagem): a tela do próximo sorteio no alto, os
  últimos ganhadores no meio (no máximo 5) e quem está jogando agora
  embaixo, os dois com o mais novo no topo. O celular não tem a coluna. A
  barra de ações aperta pela largura do próprio cartão (`.barra-de-acoes`,
  container query ≤ 360 px), não da tela.
- **A coluna ao vivo é só dado real** (`GET /api/public/vitrine/ao-vivo`,
  `server/services/aoVivo.ts`, guardada 5 s no servidor, a tela consulta a
  cada 15 s): ganhador é sorteio feito ou cota premiada paga; "jogando
  agora" é compra paga. Nome curto (`nomeCurto()`: "Ana S."), cidade/UF do
  cadastro — nunca telefone, CPF, código do pedido ou id (a chave de cada
  item é um hash). Demonstração, rifa travada e promotora arquivada ou
  banida ficam de fora. Nada simulado e nenhum contador de "online".
- **A tela do sorteio** mostra a contagem até o próximo sorteio da
  plataforma e, na hora, a transmissão da rifa (`transmissaoUrl`). Vídeo
  dentro da tela só de serviço conhecido (`videoDaTransmissao()` em
  `shared/aoVivo.ts`: YouTube sem cookie, Vimeo, Twitch, Facebook), num
  `iframe` com `sandbox`; qualquer outro link abre numa aba nova — emoldurar
  qualquer endereço seria pôr página alheia dentro do site. **Flutuar**
  solta a tela da coluna (portal no `body`): arrasta pela barra, muda de
  tamanho pelo canto (livre, sempre 16:9), nunca sai da janela, e o Esc ou o
  X a devolvem. Flutuando, "jogando agora" ocupa o espaço dela.
- **A barra de baixo da tela é a do YouTube**: qualidade num seletor
  (Automática, 2160p … 240p), flutuar e **tela cheia** (a tela inteira,
  barra junto; o Esc do navegador sai da tela cheia, não da flutuante). Fica
  fora do vídeo, para não cobrir os botões do player. **O seletor só aparece
  onde muda alguma coisa** (`aceitaQualidade()`): hoje só o Vimeo aceita a
  qualidade pelo endereço (`srcComQualidade()`); o YouTube ignora o pedido
  desde 2019, e a Twitch e o Facebook não têm o parâmetro — neles a
  qualidade fica na engrenagem do próprio player. Botão sem efeito seria
  mentira na tela.
- **Rodapé da plataforma** (`RodapeDaPlataforma`, só tablet e computador;
  no celular isso mora em `/perfil`), no desenho de rodapé de produto:
  **à esquerda** a logo, o texto de apresentação do template e, embaixo do
  texto, as **redes sociais em botão redondo**; **no meio** o espaço de
  apoio (as logos, com o atalho da central de ajuda); **à direita quatro
  colunas** com o título em negrito (Plataforma, Rifas, Ajuda, Legal); no
  pé, o © e o 18+ com o aviso de jogo responsável, o Pix e os cookies. No
  tablet as colunas ficam ao lado da logo e o apoio desce para uma linha
  própria.
  - **As colunas moram em `shared/rodape.ts`** (`COLUNAS_DO_RODAPE`), e
    `tests/rodape.test.ts` confere que cada caminho existe no `App.tsx` e
    que cada atalho `/ajuda#pergunta` aponta para uma pergunta de
    `shared/ajuda.ts` (a página abre a resposta e rola até ela). Página que
    ainda não existe (Termos de uso, Privacidade) é `emBreve`: texto com o
    rótulo "Em breve", nunca link que cai em 404 — ao criar a página, tire
    a marca.
  - **Redes sociais** (`redes` no template, `validarRedes()`, cartão
    "Redes sociais do rodapé" em Aparência): uma por rede da lista
    (`REDES_DO_RODAPE`), só `https:` sem usuário/senha **e no domínio da
    própria rede** — o botão "Instagram" não pode levar a outro lugar, o
    link sai na tela de todo apostador. Saem com `rel="noopener noreferrer
    nofollow"` e rótulo "(abre em outra aba)"; o nome vai no `aria-label`,
    o ícone sozinho não diz qual rede é. Entra no ar ao publicar o template.
  - **Rodapé de exemplo** (`preencherRodapeComExemplo()`, `POST
    /admin/template/exemplo-rodape`, botão em Aparência; 403 para
    organizador, no `npm run isolation`): preenche o **rascunho** com quatro
    ícones neutros, redes sociais e um texto de apresentação, para ver o
    rodapé pronto antes do material de verdade. **Só o que está vazio**
    (nunca sobrescreve, rodar de novo não duplica) e **nunca publica**: o
    exemplo só vai ao público se a plataforma publicar, e "Projetos que
    apoiamos" com apoiador inventado seria afirmação falsa para quem olha —
    por isso os logos levam "Exemplo" no nome e as redes apontam para a raiz
    do domínio, nunca para a conta de alguém. A tela avisa para trocar antes
    de publicar. `npm run aparencia` prova.
  - **Exemplo no código** (`rodapeEmModoExemplo()`, `REDES_DE_EXEMPLO`,
    `APOIOS_DE_EXEMPLO` em `shared/rodape.ts`): na fase de construção, com o
    rodapé **inteiro vazio** (nenhuma rede e nenhum logo cadastrados), o
    componente mostra ícones neutros marcados "Exemplo", as redes (página
    inicial de cada uma) e um texto de apresentação. Vem do código, **não
    grava nada no banco** e some sozinho no primeiro cadastro real. No
    lançamento, cadastre o material em Aparência e, se quiser, apague o
    exemplo daqui. `tests/rodape.test.ts` prova.
  - **Projetos que apoiamos** (título do espaço do meio): faixa de logos
    **redondas, em fileira** (círculo de 56 px, a logo inteira dentro, sem
    cortar), até 12 (`APOIOS_MAX`), cadastrados só
    pela plataforma em Aparência ("Logos do rodapé", `PUT
    /admin/template/apoio`, 403 no `npm run isolation`). A imagem é
    reprocessada (WebP, até 96 px de altura) e guardada em
    `plataforma_arquivos`; o nome é o texto alternativo; o link é caminho do
    site ou `https:` (`validarApoios()`, a régua do banner). Entra no ar ao
    publicar o template.
- **Perfil da organização**: capa 4:1; abaixo, o cartão do perfil (foto,
  contadores, ações, bio, links, destaques) numa coluna de 320 px fixa na
  rolagem, e as rifas em 2 colunas ao lado.
- **Painel do organizador em grade bento** (`Bento` em
  `client/src/pages/admin.tsx`, etiqueta presa na borda): receita com o
  gráfico em 2×2, cotas, comissão, próximo sorteio (azul), o que falta
  (telefone, reembolsos, rascunho sem autorização, Pix esperando) e as
  últimas vendas. Tudo vem de `/api/admin/overview`, com o recorte de
  `orgOf` em cada consulta; a venda sai **sem** nome nem telefone (quem é
  o cliente é regra da titularidade). `npm run isolation` confere que as
  últimas vendas não trazem o pedido do vizinho.
- **Demais telas largas**: página do estado e perfil do apostador (feed em
  3 colunas) e carrinho (rifas à esquerda, total e Pix à direita, fixo na
  rolagem). Formulário e texto de leitura (Minhas compras, pedido, ajuda,
  avisos) seguem na coluna estreita de propósito — linha longa cansa.
- **Topo e console são opacos** (`bg-white`, sem desfoque): com
  transparência o conteúdo aparecia por baixo ao rolar.
- **No computador o topo some e o console vira a lateral esquerda**
  (`ConsoleDoApp`), **sempre só com os ícones** (72 px): ao passar o
  ponteiro — ou ao entrar pelo teclado (`focus-within`) — abre com os nomes
  (244 px) **por cima** do conteúdo, sem empurrar a página, e fecha ao sair.
  A logo, o trevo e a publicação ficam nela. `PublicShell` recua o conteúdo
  72 px (`lg:pl-[72px]`); o que fica fixo embaixo (aviso de cookies,
  instalar o app) também.
- **Cor com opacidade**: `white` no Tailwind é `color-mix` com
  `<alpha-value>`, senão `bg-white/95` sai transparente (era o topo e a
  faixa de baixo). Outra cor que precisar de `/NN` ganha o mesmo formato.

## Topo e console do app — o que não pode afrouxar

Como no Instagram, com as nossas cores (verde no lugar do vermelho e do rosa).

- **Topo**: a logo à esquerda; à direita só a publicação (a varinha) e, no
  canto, o trevo de avisos. Carrinho, "Minhas cotas", Entrar e o menu da
  conta saíram do topo.
- **Console na base, seis botões** (`BOTOES_DO_CONSOLE`): Início, Reels,
  Mensagens, Buscar, Carrinho (o carrinho final, para pagar) e Perfil (a
  foto de quem entrou). **Os ícones moram em `Icones.tsx`**, os mesmos na
  barra de ações e no console: a casa é nossa; republicar é Tabler; reels
  é Iconoir com os cantos arredondados; o resto é Solar, com a versão
  cheia no botão aceso. A Solar é CC BY 4.0: o crédito fica em `/perfil`
  e em `docs/LICENCAS-DE-TERCEIROS.md` — ícone novo de terceiro entra lá
  também. Nada de ícone de traço reto no console. O que ainda não existe (`pronto: false`) aparece
  mesmo assim e leva a "Em breve" (`EM_BREVE`) — o app em desenvolvimento
  mostra a forma final. Botão aceso com traço mais grosso **e**
  `aria-current`, nunca só a cor; o número do carrinho vai no rótulo e
  conta os **bilhetes**, não as rifas (`bilhetesNoCarrinho()`).
- **O trevo avisa com um ponto verde** (padrão) ou cheio, na cor que a
  plataforma escolher (`avisoDoTrevo` em `ConfigPlataforma`, cartão "Topo
  do app" em Aparência, `PUT /admin/app`, 403 para organizador no `npm run
  isolation`). Só estilo e cor conhecidos entram (`validarAvisoDoTrevo`);
  as cores fixas são da paleta do selo **sem os roxos** (roxo, violeta,
  magenta e índigo não são cor do sistema — claro é branco e azul com
  detalhes verdes; escuro é preto e verde, com azul em alguns lugares), com contraste ≥ 3:1
  nos dois temas (o teste confere). O número de avisos vai no rótulo.
- **A logo não muda** — nem na lateral do computador, onde só fica menor.
  É o último item do sistema a mudar.
- **Quem vê a publicação** (`quemPublica()`): organização e plataforma
  (Criar: rifa, story, legenda), afiliado como influenciador (kit e, em
  breve, publicar com o material da organização) e o apostador só com o
  interruptor `publicarApostador` (nasce desligado). Sem conta, não
  aparece. O menu vai para o `body` (portal): dentro do topo, o console
  passaria por cima.
- **Ponto na foto do perfil = conta incompleta** (`pendenciasDaConta()`:
  apelido faltando, telefone não confirmado), só para quem tem conta. O
  ponto é verde e o que falta vai no rótulo do botão e num quadro "Complete
  sua conta" em `/perfil` — nunca só o ponto.
- **"Seu story" é o "+" na foto do próprio perfil** (o organizador, na
  vitrine, é levado ao perfil dele, então é ali que ele está), e na fileira
  de stories vai com a foto da organização, não a inicial. O selo "ao vivo"
  no story fica para a etapa do Reels.
- **O "18+", a ajuda, o tema e os cookies moram em `/perfil`**; não há mais
  faixa fixa de rodapé. O texto livre do rodapé (template) segue no fim da
  página.

## Painéis no padrão Materialize — o que não pode afrouxar

Os três painéis (plataforma e organizador, afiliado, cambista) seguem o kit
Materialize (Figma, comprado): menu lateral de 260 px com os itens em
grupos, barra de cima de 64 px, fundo neutro, cartão "papel" e fonte Inter.
O verde da marca entra no lugar do roxo do kit; o significado das cores
(verde = dinheiro, azul = espera, vermelho = erro) não muda.

- **A ordem e a hierarquia do menu moram em `MENUS` (`shared/access.ts`);
  quem libera continua sendo a matriz.** `menuDe(role, sections)` monta o
  menu só com o que a sessão trouxe: item pai sem filho liberado some; seção
  liberada que o menu não cita entra solta no fim — tela que a sessão
  alcança nunca fica escondida. `tests/menu.test.ts` confere que cada papel
  tem cada seção uma vez só, e que o master abre pela **Caixa de entrada**
  (Tudo, Atendimento, Antifraude) seguida dos seis grupos: Visão geral, Rifas,
  Vendas e dinheiro, Pessoas, Crescimento, Plataforma.
- **Casca uma só, três larguras.** Computador e tablet: menu de 260 px, ou
  recolhido em 72 px (lembrado em `rifa.menu.aberto`) que abre com os nomes
  **por cima** do conteúdo ao passar o ponteiro ou entrar pelo teclado.
  Celular: o menu fica fora da tela e entra por cima pelo botão do topo,
  fechando ao escolher a página. O item aceso é a pílula verde com
  `aria-current`; o contador de pendências vai no rótulo, nunca só na bolinha.
- **A barra de cima tem a busca única do painel** (`BuscaDoPainel`: acha a
  tela pelo nome e, pelo servidor, o **pedido pelo código** (8 dígitos),
  o **cliente pelo ID** (`C-XXXXXXXX`) e, só para a plataforma, a
  **organização pelo nome**, e a **gente da casa** — usuário, afiliado e
  cambista — por nome, e-mail ou código; Enter abre o primeiro achado), o tema, o
  **sino de avisos** e a conta, os dois num `<details>` que fecha fora e no
  Esc. **O sino lista os comentários de apostador nas rifas do recorte**
  (`GET /api/admin/avisos`, `avisosDoPainel()` em `server/services/avisos.ts`;
  só plataforma e organizador — o afiliado também tem organização nula na
  conta e nulo abriria todas) e, em cima, as pendências do atendimento.
  "Visto" é por pessoa (`users.avisos_vistos_em`, `POST /avisos/vistos` ao
  abrir o sino); o que chega depois volta a contar, e o número vai no
  rótulo (`rotuloDoSino()` em `shared/avisos.ts`), nunca só na bolinha.
  Cada aviso leva apelido ou primeiro nome e inicial — nunca telefone — e
  abre a publicação já nos comentários (`caminhoDoAviso()`). `npm run
  isolation` confere que o comentário do vizinho não aparece. Quem lê o texto é `interpretarBusca()` em
  `shared/busca.ts` (a tela e o servidor leem igual); `GET /api/admin/busca`
  (`buscarNoPainel()`) corre dentro do recorte de `orgOf` e devolve **lista
  vazia** para o que é do vizinho — nunca 403, que entregaria que o código
  existe. **Nome e telefone de comprador não entram na busca nem saem
  dela**: o pedido vem com a rifa e a situação, o cliente só com o ID e
  quantos pedidos tem no recorte; quem decide se o nome aparece é a lista de
  pedidos, pela titularidade. **Gente da casa é só da casa**: a consulta
  nunca toca `buyers`, o recorte é o de `orgOf` (a plataforma alcança todos
  menos o administrador geral; a organização, os usuários dela e os
  afiliados com vínculo com ela), e nada sai além de nome, papel, código e
  organização — nunca telefone nem hash. O achado abre a tela já no item
  (`caminhoDoAchado()`: `/admin/pedidos?codigo=`, `?cliente=`,
  `/admin/organizacoes?aberta=`, `/admin/afiliados?q=` e
  `/admin/usuarios?q=`), e `/orders` filtra pelos dois parâmetros
  com o mesmo recorte. `npm run isolation` confere o conteúdo.
- **As regras visuais só valem dentro de `.painel`** (`index.css`): Inter
  nos títulos também (a loja segue com a Bricolage), fundo `--painel`
  (`bg-painel`) e o cartão `.cartao` sem borda, cantos de 10 px e a sombra do
  kit (`--sombra-papel`). `Card`, `Kpi`, `Estatistica` e `CartaoDoPainel`
  levam a classe; na loja ela não faz nada. O escuro redefine os dois tokens
  (`tests/tema.test.ts` cobra).
- **O Painel usa os widgets dos painéis prontos do kit** (eCommerce e
  Analytics), cada um ligado a um dado nosso em `GET /api/admin/overview`
  (hoje, mês, canais site/cambista, por estado de quem comprou, série de 30
  dias no fuso de São Paulo, a capa do próximo sorteio) — tudo venda paga,
  com o recorte de `orgOf` em cada consulta. Sparkline e barras por dia da
  semana levam a lista de valores no `aria-label`; nada é simulado.
- **A Caixa de entrada reúne, não decide** (`/admin/caixa`, só a plataforma:
  403 para organizador, no `npm run isolation`). `caixaDeEntrada()` junta as
  cinco filas (chamados e disputas, pedidos de mudança de rifa, denúncias,
  verificações, cadastros fiscais) e os telefones por aprovar; a ordem e o
  destino de cada tipo moram em `shared/caixa.ts` (`tests/caixa.test.ts`).
  **Sem dado pessoal na lista**: organização, código do afiliado ou apelido —
  nunca telefone, CPF ou nome de comprador. Decidir segue na tela de cada
  tipo, onde a auditoria já é gravada.
- **Lista longa do painel anda por chave e muda de forma no celular.**
  Pedidos e os lançamentos da Cobrança vêm 25 por vez (`limite`, no máximo
  100) e a página seguinte começa depois da última linha vista (`antes`,
  cursor `<criado em>|<id>` de `shared/paginacao.ts`) — **nunca `OFFSET`**,
  que repetiria linha quando entra venda nova no topo. O servidor pede uma
  linha a mais para saber se há próxima (sem `COUNT(*)`) e manda o cursor
  no cabeçalho `X-Proximo`; cursor fora do formato vira primeira página,
  nunca erro nem SQL. O recorte (`orgOf`) é o mesmo em toda página
  (`npm run isolation` confere). Na tela, `useListaPaginada()`
  (`client/src/lib/paginada.ts`) e `TabelaOuCartoes` + `VerMais`
  (`client/src/components/painel.tsx`): **cartão por linha abaixo de `sm`,
  tabela a partir dele**; lista nova de painel usa os dois, não uma tabela
  de cinco colunas espremida num celular.
- **Tela com muito cartão tem abas, não pilha.** `Abas` (`painel.tsx`)
  é uma aba por assunto — Configurações (Conta e segurança · Organização e
  perfil · Vendas e pagamentos) e a edição de cada rifa (A rifa ·
  Autorização e sorteio · Publicação · Pacotes e cotas premiadas). A aba
  aberta vai na URL (`?aba=`) e, com a âncora de um link antigo
  (`#verificacao`), abre a aba que tem aquele cartão e rola até ele
  (`abaInicial()` em `shared/abas.ts`: a URL vence, depois a âncora, depois
  a primeira — valor desconhecido nunca dá tela vazia). Teclado de lista de
  abas (setas, Home, End; só a ativa no Tab) e só a aba aberta monta, para
  cartão de outra aba não buscar dado à toa. Cartão novo entra na aba do
  assunto dele; não abra aba nova para um cartão só. Aba nova que ganha
  âncora de link entra em `ancoras`.
- **O Atendimento é lista e item aberto, não duas colunas coladas.**
  `MestreDetalhe` (`painel.tsx`) serve os quatro (chamados, pedidos de
  mudança em rifa, denúncias, verificações): de `xl` (1280 px) a lista e o
  item rolam cada um no seu lugar e o item fica fixo sob a barra de cima;
  abaixo disso é **uma coisa por vez** — abriu um item, a lista dá lugar a
  ele, com "Voltar para a lista" no alto (o foco vai para o botão e a página
  sobe). Esc fecha o item, menos dentro de campo de texto (não perde o
  rascunho da resposta). O `aoFechar` das telas é função nova a cada
  desenho e **não entra na lista do efeito**: a lista que se atualiza sozinha
  subiria a página e tomaria o foco de quem responde. Tela nova de "lista e
  detalhe" usa o componente; não monte o grid à mão.
- **Rifas em grade de capas** (`AdminCampanhas`): a capa vem do servidor
  (`capa` na lista: o banner, senão a primeira foto — nunca o vídeo), a
  situação vai em texto na pílula sobre a capa, e as mesmas ações da lista
  ficam no cartão (duas à mostra, o resto no "⋮"). Grade ou lista é
  escolha do aparelho (`rifa.rifas.visao`), com `aria-pressed`.

## Versões — o que não pode afrouxar

Um código só, três larguras: celular (até 639 px, a referência), tablet
(640 a 1023) e computador (1024 ou mais). O guia, o mapa de cada tela e o
registro estão em `docs/VERSOES.md`.

- **Mudança no celular entra no registro no mesmo PR** (`docs/VERSOES.md`,
  situação `aguardando leva`). A cada **10** aguardando, o PR seguinte é a
  **leva**: confere as três larguras e arruma o tablet e o computador de uma
  vez. `tests/versoes.test.ts` falha na 11ª — a leva não fica esquecida.
- **Quebra não espera a leva.** Página rolando para o lado, botão sumindo,
  controle sem nome ou erro na página em outra largura é consertado no
  mesmo PR: `npm run telas` (60 telas × 390/820/1440, com captura) não pode
  reprovar. O que espera a leva é só o arranjo.
- **Rota nova entra no mapa** do guia; o teste confere o mapa contra o
  `App.tsx` nos dois sentidos.
- **Grade começa em `grid-cols-1`** e filho com texto longo leva `min-w-0`:
  a coluna implícita é `auto` e cresce até o conteúdo (foi o estouro do
  painel bento e da Aparência).
- **`sr-only` dentro de faixa que rola precisa de ancestral `relative`
  dentro da faixa** — é absoluto e, sem isso, escapa do `overflow-x-auto` e
  alarga a página (foi o estouro do Atendimento da plataforma).
- **Campo de digitar com 16 px ou mais no celular** (regra global no
  `index.css`, sem `!important`, que poupa o `text-lg` de propósito): abaixo
  disso o iPhone aproxima a tela ao focar — o `npm run telas` reprova. Campo
  com rótulo visível — placeholder não é rótulo. Alvo de toque com 24 × 24
  px ou mais.

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

A duração e as dimensões do vídeo e as dimensões da imagem são medidas em
`server/services/probe.ts` e `images.ts`, lendo o arquivo já armazenado.
As dimensões guardadas são as **de exibição**: a foto com a rotação do EXIF
aplicada (`rotate()` no `sharp`, senão a foto de celular em pé saía deitada)
e o vídeo com a matriz do `tkhd` (reels gravado em pé vem como quadro
deitado girado 90°). **Nunca** aceite o
valor vindo do cliente: o limite (3 min reels, 15 min feed) é promessa de
tela e forjar um campo JSON é trivial. Se for aceitar um container novo (WebM, por exemplo), implemente
a medição junto — sem medir, não entra na lista de mimes.

**Foto de celular passa de 1 MB.** O limite geral do corpo JSON é 1 MB;
rota que recebe imagem em base64 entra na lista de limite maior em
`server/index.ts` (8 MB para foto, 10 MB para documento), senão o Express
recusa com 413 antes da régua do serviço — foi assim que a troca de foto
do perfil falhava no celular. E a foto do perfil sai reduzida do aparelho
(`lerFoto()` em `client/src/lib/anexo.ts`), com a rotação do EXIF; o
servidor reprocessa de todo jeito. O 413 responde em português.

**A mídia mora no volume, com cópia fora dele.** Em produção o disco só
vale se `UPLOAD_DIR` for o volume (no Railway, `/data`): fora dele, tudo
sumia a cada publicação, e `storage()` agora recusa produção sem
`UPLOAD_DIR`. Com `BACKUP_S3_BUCKET` (e as chaves `BACKUP_S3_*`), cada
arquivo gravado vai também para um bucket S3 — R2, bucket do Railway —
**na hora** (`LocalDiskStorage.write`); a falha da cópia vai ao log e não
derruba o envio. O que sumir do disco volta sozinho da cópia: na leitura
(`comCopia`) e em `/uploads` (antes do 404). Remover tira dos dois, senão
voltaria. O que já estava no disco quando a cópia foi ligada sobe ao subir
o servidor (`sincronizarCopia`, trava 811013). `tests/backup.test.ts`
prova com uma cópia de mentira. Foto do perfil, capa, banner, story, logo,
foto do ganhador e documentos ficam no **Postgres** — o backup deles é o
do banco.

A **chave do arquivo** também volta do navegador na confirmação do envio, e
só vale a que o passo 1 gerou para aquela rifa e aquele papel
(`chaveDaCampanha()` em `storage.ts`), conferida antes de tudo — a recusa da
mídia apaga o objeto da chave, e a chave de outra organização aparece no
endereço público da imagem dela. A imagem é aberta com teto de 40
megapixels (medido pelo cabeçalho antes de abrir): um PNG pequeno pode
dizer 16.000 × 16.000 e derrubar o processo. `npm run isolation` prova.

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
- **A reserva em aberto é conferida de novo dentro da transação que grava o
  pedido**, com o comprador travado (`conferirReservaAberta`, trava 811601).
  `guardOrder()` conta os pedidos que já existem: pedidos em paralelo do
  mesmo telefone liam todos "nenhuma reserva" e passavam juntos (cinco com
  limite de dois). O carrinho confere uma vez, com a soma. `npm run load`
  prova.
- **Dentro de transação, só o `tx`** — inclusive para ler os limites
  (`getLimits(tx)`). Chamar o `db` de dentro pede uma segunda conexão ao pool;
  sob carga, todas esperam a segunda e o servidor para.

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
- **Senha nova derruba as outras sessões.** Trocar a própria mantém a sessão
  de quem trocou e encerra as demais; redefinir a de outra pessoa encerra
  todas (`encerrarSessoesDoUsuario`). Senão a sessão roubada sobrevive à
  troca que existia para encerrá-la.
- **A conta do afiliado é da plataforma** — inclusive a do afiliado antigo,
  que ainda tem a organização no usuário: a organização não redefine a
  senha nem desliga (403, no `npm run isolation`). Ele trabalha para várias.
- **Cambista e afiliado passam pela mesma régua de senha** (`senhaInvalida`)
  do resto do painel.

## App instalável — o que não pode afrouxar

- **`/api/` e `/uploads/` nunca passam pelo cache do service worker.** Cota e
  pedido são estado vivo: servir a versão guardada é mostrar número vendido
  como livre. Sem rede, a API falha e a tela diz isso.
- Mudou a casca (`sw.js`)? Troque `VERSAO` lá dentro, senão o celular segue
  com a antiga.
- **O nome e o ícone seguem o template publicado, nunca o rascunho.**
  `GET /manifest.webmanifest` é montado por `montarManifest()`: nome limpo
  (até 40 letras, curto até 12), cor de marca `#rrggbb` e, com logo no
  template publicado, os três ícones (`/api/public/marca/icone/192|512|maskable`,
  a logo centralizada em quadrado branco; o "maskable" deixa a logo na zona
  segura). Os ícones ficam em `/api/`, fora do cache do service worker, com
  `?v=` da data da logo. Se o banco falhar, a rota cai no arquivo de fábrica
  — instalar o app nunca quebra. O manifesto **não** entra na casca do
  `sw.js`: guardado lá, o nome novo nunca chegaria. `npm run aparencia` prova.

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
- **A base é o que foi pago**, já com pacote e cupom descontados — nunca o
  preço de tabela. No presente, pagaram dois: o comprador e a plataforma
  (`amount_cents + presente_cents`), e o rateio corre sobre a soma.
- **Mensalidade zera a taxa por venda.** É assim que o contrato de mensalidade
  não cobra duas vezes: `platformPctFor()` devolve 0 e o afiliado volta a
  receber sobre o valor cheio.
- **O padrão é `gratis`.** Organização que existia antes desta decisão não
  acorda devendo. Quem cobra é quem escolheu cobrar.
- **A taxa é lançada dentro da transação que confirma o pagamento**, junto com
  a comissão. Fora dela, sobreviveria a um rollback e cobraria por uma venda
  que não aconteceu.
- **Pix dividido na origem não é cobrado de novo.** Quando o provedor honra
  o split (Asaas, `splitAplicado` em `PixCharge`), a plataforma já ficou
  com a taxa no próprio Pix: o pedido nasce marcado
  (`orders.taxa_retida_no_split`, decidido quando o Pix é gerado — carteira
  cadastrada depois não muda o Pix que já saiu) e o lançamento em
  `platform_charges` nasce `retida` (`lancarTaxaDaVenda(..., retidaNoSplit)`),
  nunca `aberta`. O lançamento existe para o extrato fechar; "em aberto" e
  "dar baixa" só olham `aberta`; o estorno cancela a retida como as outras
  (o Asaas desfaz o split junto). A marca só vale com **taxa no contrato na
  emissão** (`taxaFicouRetida()`): com plano grátis o split manda tudo para
  a promotora, e marcar retida esconderia a taxa que o contrato passasse a
  cobrar. No carrinho a marca é por pedido e pelas carteiras que
  `splitDoCarrinho()` de fato manteve — a parte pequena demais arredonda a
  zero e fica fora. Provedor sem split (dev imita o Asaas; Mercado Pago
  ignora) deixa a taxa devida no livro. O valor novo do enum sobe com o
  `db:push` **antes** do código: sem ele o `INSERT` falha dentro da
  transação que confirma o Pix. `npm run carrinho` prova os dois lados na
  mesma cobrança.
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
  azul cheio (`text-on-yellow`, hoje branco) e o bilhete, que é papel e sai sempre branco.
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
  `--marca`). Cabeçalho, vitrine e o significado das cores (verde, azul,
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
  apelido). **O apelido nasce no cadastro** (`problemaNoCadastro` exige,
  `uq_buyers_apelido` decide o repetido); conta antiga sem apelido completa
  em Minha conta — o comentário só aponta para lá. A organização dona da
  rifa comenta e responde pela sessão do painel, com "• Autor" ao lado do
  nome, como no Instagram. Rascunho não tem comentários (404).
  Uma camada de resposta: responder uma resposta entra no comentário do
  topo. Como no Instagram: foto, apelido, data, curtidas, respostas
  recolhidas e a barra de reações; no feed, os comentários sobem num painel
  por cima da vitrine. Tamanho e fonte do Instagram: 14 px na fonte do
  sistema do aparelho (`font-instagram`), 12 px nos detalhes.
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
- **O comentário fixo é só o de quem levou cota premiada** (`premiados`
  em `listarComentarios()`): fica no topo, marcado "Fixado", com 🏆, o
  prêmio e a cota — no estilo dos outros comentários, **sem destaque
  de cor**. Só pedido **pago** (o estorno devolve a cota premiada e o
  fixo some junto) e só o número já reclamado — antes da compra, o número
  nunca sai (invariante das mensagens). Nome como no comentário, nunca
  telefone. Nenhum outro comentário é fixado — sem ganhador, nada fica no
  topo. O fixo é o **parabéns automático**; se o ganhador comentou na rifa,
  o comentário dele (o mais novo) vai logo abaixo do parabéns e sai da
  lista, para não aparecer duas vezes. **Embaixo da rifa fica só o fixo**
  e o "Ver os N comentários" (`aoAbrirPainel`); a conversa inteira e o
  campo de comentar moram no `PainelDeComentarios`, que abre sozinho
  quando se chega por `#comentarios`.
- **A cota surpresa é o presente** no canto de cima à direita da
  publicação, logo abaixo do contador "1/5", na página da rifa
  (`CotaSurpresa`, `canto` do `Carrossel`) — embaixo fica o som do vídeo. Só existe com cota premiada — é opcional
  da organização ou da plataforma; sem nenhuma, o presente não aparece. O
  aviso "Cotas premiadas" (que era amarelo) saiu da página: o presente o substitui.
  Aberto, mostra cada prêmio em segredo ("?") e o número já reclamado com
  quem levou — os mesmos `premiados` do topo dos comentários, que já são
  públicos; o número em jogo nunca sai. **Abre sozinho** quando aparece
  número novo desde a última visita deste aparelho (`novosRevelados()`,
  `rifa.surpresa.<rifa>`): quem comprou e voltou encontra o número dele. Na
  primeira visita não abre — seria barulho para todo mundo. **Só o ícone,
  parado, sem círculo nem sombra, branco nos dois temas** (`text-branco`:
  fica sobre a foto, como o botão de som); a tampa abre quando tudo foi
  revelado. Não pisca — ficou ruim na tela.
- **O número premiado é sorteado e só a plataforma o vê.** A organização
  só sorteia (`POST /campaigns/:id/prized` com `quantity`); mandar
  `numeros` é 403 — quem escolhe o número premiado da própria rifa pode
  comprá-lo. `GET /campaigns/:id/prized` devolve `number: null` para a
  organização enquanto a cota está em jogo (ganha, o número já é público e
  volta a aparecer), e o relatório de cotas só marca "Cota premiada" em
  número já ganho. A plataforma vê os números e, só no rascunho, pode
  escolhê-los (`numerosPremiados()`; 409 depois de publicar). `npm run
  comentarios` prova.
- **O campo de comentar** é a pílula do Instagram: o envio (verde) aparece
  dentro dela quando há texto, e o "Enviar" do teclado publica
  (`enterKeyHint="send"`; Shift+Enter quebra a linha). O ícone de comentar
  da página da rifa abre `PainelDeComentarios`.
- **A resposta da organização avisa o apostador** (push e trevo de avisos,
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

## Perfil verificado — o que não pode afrouxar

- **Destaca, não barra.** Sem o selo, o apostador compra e comenta (sem
  emoji), o afiliado divulga e a organização faz rifa. Nenhuma regra de
  venda ou publicação olha a verificação.
- **Emoji é vantagem de verificado** (`temEmoji()` em
  `shared/comentarios.ts`, 403 em `comentar`), para apostador e para a
  organização que comenta. Foto no perfil **não** é exigida para comentar.
- **Dados e documentos no cofre**, como o cadastro fiscal. A fila não traz
  dado pessoal; o detalhe e cada documento entram em `audit_log` antes de
  sair. Fila e decisão são só da plataforma (403); a organização verifica
  só a si mesma (o vizinho é 404) — os dois no `npm run isolation`.
- **O mesmo CPF não verifica dois perfis do mesmo tipo**: índice
  `uq_verificacao_cpf` sobre a impressão (HMAC), nunca um `SELECT` antes. O
  apostador verifica com o CPF da própria conta (409 se outro).
- **Pessoa compara a foto do perfil com a frente do documento** (que por
  isso vai como imagem, nunca PDF); organização não compara (a foto é a
  marca). Consentimento biométrico marcado na tela, conferido no servidor.
- **Trocar ou tirar a foto apaga o selo na transação que troca a foto**
  (`fotoMudouNaTransacao`); mexer em dado ou documento derruba a aprovação
  dos documentos. O selo público (`buyers.verificado_em`,
  `affiliates.verificado_em`, `organizations.verificada_em`) muda sempre na
  mesma transação do status.
- **Quem aprova a foto diz qual viu** (`fotoVersao`): mudou no meio, 409.
  O comparador automático (`ROSTO_PROVEDOR=rekognition`, nasce desligado)
  só verifica acima de `LIMIAR_ROSTO` e só se a foto comparada ainda for a
  do perfil (`foto_versao` no `UPDATE`); abaixo, ou com o provedor fora,
  **não recusa** — fica para uma pessoa.
- **O selo é um trevo com o sinal de confirmação**, com rótulo em texto
  (`ROTULO_DO_SELO`). As cores saem da paleta de 12 (`PALETA_DO_SELO`,
  contraste ≥ 3:1 nos dois temas e com o sinal branco — o teste confere),
  três diferentes; só a plataforma escolhe (`PUT /admin/selos`).
- Excluir a conta (LGPD) apaga a verificação junto.
- `npm run verificacao` prova tudo isso contra a API de verdade (o
  comparador é injetado: a prova não sai para a internet).

## Publicação da rifa — o que não pode afrouxar

- **Carrossel de até 10 peças contando o banner** (`MAX_CARROSSEL`): fotos e
  vídeos dividem as 9 vagas e a mesma sequência de posição. Conferido no
  pedido de envio **e** de novo ao gravar (dois envios ao mesmo tempo).
- **A primeira peça define o formato do carrossel**, como no Instagram
  (`formatoDoCarrossel()`): retrato 4:5, quadrado 1:1, paisagem 1,91:1 ou
  vertical 9:16, pelo que o servidor mediu — nunca pelo navegador. As
  outras peças são cortadas ao centro na mesma caixa. Sem medida (peça
  antiga), retrato, que era o de antes. A foto 2:3 de câmera é retrato; só
  o que é em pé de tela (abaixo de 0,65) vira vertical.
- **O perfil vai acima nos formatos do feed e por cima no vertical**
  (`perfilPorCima()`), como no reels: sombra em cima, texto branco e
  "Seguir" com contorno; o "1/8" desce para baixo dele. O 9:16 não passa de 85% da altura da tela (computador, tablet
  deitado). A regra mora no `Carrossel` (`perfil`), não em cada tela.
- **Vídeo até 3 min é reels, até 15 min é feed** (`formatoDoVideo()`), pela
  duração medida no servidor; mais que isso é recusado. Reels toca sozinho,
  mudo, quando aparece na tela; o do feed só no toque. Como no Instagram:
  sem os controles do navegador, o som no canto de baixo à direita e
  "Assistir novamente" no fim.
- **As ações são a chave (rifa, pessoa)** (`publicacao_curtidas`,
  `_republicacoes`, `_salvos`): `ON CONFLICT DO NOTHING`, e o contador em
  `campaigns` só anda quando a linha entrou ou saiu, na mesma transação —
  cinco toques, uma curtida. Nada de `COUNT(*)`. A curtida é o **trevo**,
  não o coração.
- **Salvar saiu da barra** (o carrinho ficou no lugar); o que já foi salvo
  segue em Minha conta → Salvos, privado (sem contador; `/conta/salvos` só
  da própria pessoa). **Republicar precisa de apelido** (aparece em `/u/<apelido>`).
  **Compartilhar conta uma vez por pessoa ou aparelho** (hash), porque o
  contador é vitrine.
- **Só conta age** (401 sem sessão), rascunho não tem publicação (404).
  Carrinho e comprar não pedem conta — são o caminho da compra, que já
  aceita comprador sem conta.
- **A legenda é da organização e muda a qualquer hora** (`PUT
  /campaigns/:id/legenda`, fora do `PATCH`): a régua do comentário (sem
  link nem telefone, `problemaNaLegenda`) e a varredura do Pix por fora.
  O recorte é `assertCampaignInScope` (o vizinho é 404, no `npm run
  isolation`).
- `npm run publicacao` prova tudo isso contra a API de verdade.

## Carrinho e comprar — o que não pode afrouxar

Na barra da publicação, o **"+"** (azul no claro, verde no escuro — `--mais` —, em negrito) fica no espaço do meio
e o **comprar** (a sacola) no canto direito, onde era o salvar. O "+" abre
a janela dos números (`EscolherBilhete`): os tamanhos 5, 10, 25 e 50 (ou
uma quantidade digitada, no mínimo e máximo da rifa) e as cartelas daquele
tamanho (`Cartelas` com `acao="carrinho"`); a cartela escolhida vai para o
carrinho.

**Na página da rifa, o "+" e a sacola saem de baixo da publicação** — a
compra já está na tela. Cada cartela traz tudo numa linha: **trocar** (só
o ícone, à esquerda), o **"+"** (o mesmo "+" azul/verde em negrito da
barra, `IconeMais` em `Icones.tsx`, que junta a cartela ao carrinho) e o
**Pagar**, maior, no canto direito.

- **Vários bilhetes por rifa, e de várias rifas** (`juntarCartela()` em
  `shared/carrinho.ts`, `juntarNoCarrinho()` no aparelho — na página e na
  janela do "+"). O carrinho segue com **um item por rifa** (cada rifa é um
  pedido, com todos os números), e os bilhetes ficam separados em
  `bilhetes` só para mostrar: o carrinho lista cada rifa (numa faixa no
  topo, com foto, título, preço e lixeira) com cada bilhete embaixo,
  tira um bilhete sozinho (`tirarBilhete()`) e soma rifas e bilhetes no
  total. `bilhetesDoItem()` só aceita bilhetes que, juntos e na ordem, são
  exatamente os `numeros`. Bilhete com número que já está no carrinho não
  entra pela metade (`repetida`) e a tela sorteia outra cartela; passar do
  máximo por pedido recusa. Item que só tinha quantidade (mudada no
  carrinho) soma a quantidade, e os números passam a ser sorteados.
- **"Adicionar" não fecha a janela do "+"**: o bilhete adicionado sai da
  tela e outro, sorteado evitando os números do carrinho (`evitar`), entra
  no lugar — dá para pôr vários seguidos. O mesmo vale para o ícone do
  carrinho na cartela da página da rifa.

- **Carrinho é lista de desejo, não reserva.** Guarda rifa, quantidade e a
  cartela escolhida (`numeros`, só se tiver exatamente a quantidade) —
  nunca preço. A cota só é tomada na compra, pelo caminho de sempre
  (`createOrder` → `reserveSpecific`, pela PK). Transformar o carrinho em
  reserva seria cota presa por quem não paga — o ataque de bloqueio de
  estoque da seção de antifraude. Se um número da cartela foi levado, a
  compra do carrinho recusa inteira (409, com o `slug` da rifa), o
  aparelho esquece aquela cartela (`esquecerCartela`) e a rifa passa a ser
  sorteada na hora.
- **Fica no aparelho** (`rifa.carrinho`), como a região e o tema: perder
  só esvazia. Até `CARRINHO_MAX_ITENS` (20) rifas; quantidade 0 é "a
  sugerida pela rifa" (`quantidadeInicial`: pacote em destaque, senão o
  menor, senão o mínimo).
- **O preço é do servidor.** `POST /api/public/carrinho` recebe rifa e
  quantidade (`limparCarrinho` joga fora o resto, inclusive preço) e
  devolve o total por `priceOrder()`, a quantidade cortada entre o mínimo e
  o que resta, e se a rifa ainda vende (`rifaAVenda()`, a mesma régua da
  página da rifa). Rascunho, rifa apagada e promotora arquivada voltam
  indisponíveis e o aparelho tira do carrinho. A compra recalcula de novo.
- **Separado por organização**, porque cada promotora tem a própria
  autorização e o próprio bilhete. **Paga-se de um jeito só**: o Pix da
  plataforma, no botão de pagamento do carrinho — o único; o item não tem
  "Comprar" próprio. O split para cada promotora é interno e não aparece
  para quem compra (seção abaixo).
- **Carrinho e comprar só aparecem na rifa que vende agora** (`vende` na
  vitrine e no perfil, por `rifaAVenda()`): demonstração,
  travada, esgotada, encerrada ou sem Pix online não mostram os dois.
- **Comprar não é atalho**: leva à compra rápida da rifa (`?comprar=1`),
  com o aviso "só vale bilhete pago pela plataforma" antes do botão. A
  página da rifa abre com o bloco de números já aberto (o pacote em
  destaque, senão o segundo, senão o primeiro).
- **O Pix e o split são os mesmos em toda a plataforma**: compra pelos
  botões da publicação, compra direta na página da rifa dentro do perfil da
  organização e carrinho — todas pagam à plataforma e passam pelo split do
  Asaas com `percentualDoPromotor` (avulso: `splitDaOrganizacao`;
  carrinho: `splitDoCarrinho`, que com uma promotora só dá o mesmo número).
- `npm run publicacao` prova o carrinho contra a API de verdade (preço do
  aparelho ignorado, rascunho indisponível, quantidade cortada, nada
  reservado, rifa travada sem venda).

## Carrinho num Pix só — o que não pode afrouxar

Todo Pix é pago à plataforma; o do carrinho também. Uma cobrança com o
total de todas as rifas, e o split do Asaas levando a parte de cada
promotora para a carteira dela **no mesmo pagamento**
(`createCartOrder()` em `server/services/orders.ts`).

- **Cada rifa continua sendo um pedido.** O carrinho
  (`carrinho_pedidos`, código de 9 dígitos abaixo da faixa da recarga) só
  junta os pedidos (`orders.carrinho_id`) e guarda a cobrança; bilhete,
  comissão, taxa, cota premiada, sorteio e estorno seguem pedido a pedido.
  A situação do carrinho é tirada dos pedidos (`situacaoDoCarrinho()`),
  nunca guardada à parte.
- **A mesma régua do pedido avulso.** `createOrder` virou
  `prepararPedido()` (confere, resolve comprador e afiliado, calcula o
  preço) + `inserirPedido()` (grava e reserva, na transação de quem chama);
  o carrinho usa os dois. Não existe segundo caminho de reserva.
- **Antifraude uma vez, antes de tudo**, com a soma das cotas. E o
  carrinho conta como **um** pedido aberto (`count(distinct
  coalesce(carrinho_id, id))` em `guardOrder`) — senão o limite de 2
  pedidos abertos barraria qualquer carrinho de três rifas.
- **Tudo ou nada.** Os pedidos de todas as rifas entram na mesma
  transação: faltou cota na reserva de uma, nenhuma fica reservada (o
  `npm run carrinho` força a falha dentro da reserva, não só na checagem de
  antes). Provedor recusou o Pix: `devolverReserva` em todos.
- **Vencem juntos**, no menor prazo de reserva entre as rifas. O relógio
  devolve as cotas de todos e cancela a cobrança **uma vez** (`releaseExpired`
  junta por cobrança); o lembrete de reserva vencendo sai um por carrinho.
- **O split é a média pesada pelo valor** (`splitDoCarrinho()`): cada
  pedido entra com o percentual que teria sozinho
  (`percentualDoPromotor`, taxa do plano e comissão guardada), somado por
  carteira e arredondado para baixo em 4 casas. Organização sem carteira
  não entra — a parte dela fica na conta da plataforma, como no avulso.
- **O Pix pago confirma todos** (`markOrderPaid` acha os pedidos pela
  cobrança e passa cada um por `settleOrderAsPaid`, idempotente). Pedido
  que já tinha vencido não reabre: vai para o log, é dinheiro sem cota.
- **Estorno de um pedido nunca devolve a cobrança inteira**: o valor vai
  sempre explícito ao provedor quando o pedido é de carrinho
  (`executarEstorno`). O aviso "estornada" do provedor só chega quando a
  cobrança inteira voltou, e aí `refundByChargeId` desfaz todos os pedidos
  dela (idempotente: o que o chamado já desfez não dobra).
- **A consulta do carrinho** (`/carrinho/pedidos/:codigo`) tem a guarda de
  varredura da consulta do pedido e não traz nome nem telefone.
- `npm run carrinho` prova tudo isso contra a API de verdade.

## Presente — o que não pode afrouxar

Quem tem conta manda, pelo ícone de presente ao lado do campo de
comentário, o link da rifa com o código de indicação dele. O convidado ganha
desconto na primeira compra — **pago pela plataforma**.

- **Nasce desligado**, e só a plataforma liga, com percentual (1 a 50%) e
  teto (R$ 1 a R$ 100) — cartão Presente em Bônus (403 para organizador,
  no `npm run presente`). `validarConfigPresente` só guarda as três chaves.
- **O ícone fica sempre à direita do campo de comentário.** Desligado, o
  presente vira convite: o link da rifa com o código de indicação, sem
  desconto (`meuCodigoDePresente` devolve o código e `ligado: false`).
- **Uma vez por pessoa, e só com conta.** O CPF único entre contas é o que
  faz o desconto ser um por pessoa; sessão só com o código do WhatsApp não
  basta (`presenteDoPedido` exige senha e CPF). Só na primeira compra paga;
  autoindicação (mesmo comprador, telefone ou CPF) não vale; cambista e
  carrinho não levam. Dois pedidos com presente ao mesmo tempo: quem decide
  é o índice parcial `uq_presente_por_comprador` (pedido vencido sai dele e
  libera outro) — 409, nunca um `SELECT` antes.
- **A compra conta como paga pelo preço cheio.** O comprador paga
  `amount_cents`; a plataforma, `presente_cents`. O rateio (`splitOrder`)
  corre sobre a soma: taxa, comissão e promotora como se fosse o preço
  cheio. O comprador nunca paga R$ 0,00 (máximo 50%, e o desconto nunca
  chega ao total). O reembolso devolve só o que o comprador pagou.
- **A parte da promotora no desconto é crédito dela** (`presente_creditos`,
  `creditoDoPresente()`: o desconto rateado — a taxa da plataforma sobre ele
  fica com a plataforma; a comissão fica com a promotora, que paga o
  afiliado, salvo guardada). Lançado na transação que confirma o pagamento
  (um por pedido, índice único), **cancelado na do estorno** e repassado no
  acerto: `darBaixa` fecha a conta nos dois sentidos, numa transação. Crédito
  já repassado não volta sozinho — fica pago e vai para o log, como a
  comissão já sacada.
- **Quem convida ganha o bônus de indicação que já existe** (etapa 13), se
  o programa estiver ligado — o presente usa o mesmo código e o mesmo
  `?ind=`.
- **A oferta pública mostra só o primeiro nome** de quem mandou (nunca
  telefone). O código de quem manda (`/presente/meu`) pede conta (401).
- `npm run presente` prova tudo isso contra a API de verdade.

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
- **A central de avisos guarda o mesmo que sai por push** (o trevo no
  topo do site, `/notificacoes`). `avisar()` grava em `notificacoes` para
  todo mundo que o aviso alcança — inclusive quem não ligou o push — com a
  mesma chave por pessoa (índice único `uq_notificacao_chave`), então o
  relógio que repete não duplica. Falha ao gravar não derruba o push nem o
  fluxo. Só o próprio comprador lê (sessão; sem sessão, 401) e abrir marca
  como lido. O número do trevo vai no rótulo, não só na cor. O relógio
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
- **Feed em formato de publicação do Instagram**: o topo **fora** da
  imagem (foto da promotora, nome com o selo, a cidade embaixo e "Seguir"
  só para quem ainda não segue — `seguindo` vem na lista, sem uma consulta
  por cartão), o carrossel 4:5, logo abaixo dele o **cartão com borda, que
  é só a rifa** (prêmio, selo "Autorizada SPA/MF" com o número — a rifa no
  ar sempre tem —, cota, sorteio e cotas), e depois, **fora** do cartão, as
  ações, a legenda, "Ver comentários" e o "Há 3 dias" (`quandoPublicou`).
  A mesma ordem vale no perfil. **Do tablet em diante não há faixa branca
  em cima**: o perfil (foto, nome, cidade e "Seguir") vai por cima da
  imagem em todos os formatos, com a sombra do reels, e a imagem tem os
  quatro cantos arredondados (`perfilSobreNaWeb` no `Carrossel`, só por
  classes `md:` — o celular não muda). O "1/8" desce para baixo do perfil.
  **Não há selo de vendidas sobre a imagem**, em nenhuma largura: o
  progresso já está no cartão da rifa logo abaixo, e dois contadores na
  mesma tela eram repetição. Depois do toque em "Seguir", o botão vira
  "Seguindo" com ✓; quem já seguia continua sem botão.
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
- **Trocar a chave Pix pede a senha** e fica na auditoria (com a chave
  mascarada): é para onde vai o dinheiro dos saques, e quem tomou a sessão
  não troca sozinho. A senha conta na janela de força bruta do login.
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
  é tão fácil quanto aceitar (dois botões iguais) e a tela do perfil
  (`/perfil`) tem "Preferência de cookies" para mudar de ideia. O pedido leva `marketing: true/false`
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

