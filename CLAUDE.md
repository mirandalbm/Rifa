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
| sorteio | `server/services/draw.ts` (a conta), `server/services/sortear.ts` (`executarSorteio`: travas, recusas, avisos — o botão do painel e o sorteio automático), `entropiaDoSorteio()` em `shared/sorteio.ts` |
| segundo fator (e o segredo selado no cofre) | `server/services/totp.ts`, `server/services/segundoFator.ts`, `scripts/senha-test.ts` |
| hash da senha (custo do scrypt, refazer a antiga no login) | `server/services/hashSenha.ts`, `refazerHashSeAntigo()` em `server/auth.ts`, `tests/hashSenha.test.ts` |
| política de conteúdo (CSP, modo relatório) | `shared/csp.ts`, `server/services/csp.ts`, `server/index.ts`, `tests/csp.test.ts` |
| variantes de imagem | `server/services/images.ts` |
| pôster do vídeo (rifa, reels e story), o `ffmpeg` local e o Cloudflare Stream | `shared/poster.ts` (regras e comando), `server/services/videoProcessor.ts` (`ProcessadorDeVideo`, `FfmpegLocal`), `gerarPosterDaMidia()` em `server/services/media.ts`, o dos vídeos de antes em `server/services/posterRetroativo.ts` (relógio), `gerarPosterDoStory()` em `server/services/vitrine.ts`, `poster` em `Publicacao.tsx`/`Reels.tsx`/`Stories.tsx`, `scripts/poster-test.ts`, `tests/poster.test.ts`, `tests/cloudflareStream.test.ts` |
| entrega do vídeo em HLS pelo Cloudflare Stream (guardar, tocar, apagar) | `shared/stream.ts` (regras), `publicar()`/`apagarDoStream()` em `server/services/videoProcessor.ts`, `gerarPosterDaMidia()`/`removeMedia()` em `server/services/media.ts`, `stream_uid`/`stream_hls`/`stream_assinado` em `campaign_media`, `server/services/streamPendentes.ts` (vídeo sem dono e a marca dos vídeos de antes, relógio), `client/src/lib/hls.ts` (`useVideoHls`), `scripts/poster-test.ts`, `tests/stream.test.ts`, `tests/streamAssinatura.test.ts`, `tests/cloudflareStream.test.ts` |
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
| Pix que chegou tarde (reserva vencida ou depois do sorteio): fila de devolução | `shared/pixTardio.ts`, `server/services/pixTardio.ts`, `/pix-tardios*` em `server/routes/admin.ts`, `client/src/components/PixTardios.tsx` (em Pedidos), tipo `pix_tardio` em `shared/caixa.ts`, `scripts/pix-tardio-test.ts` |
| pedido de reembolso (chamado) | `shared/chamados.ts`, `server/services/chamados.ts`, `client/src/pages/adminAtendimento.tsx`, `scripts/chamados-test.ts` |
| disputa de reembolso (palavra final da plataforma) | `bloqueioDaDisputa()` em `shared/chamados.ts`, `abrirDisputa()`/`decidirDisputa()` em `server/services/chamados.ts`, `scripts/disputa-test.ts` |
| contrato de cobrança da plataforma | `shared/billing.ts` e `server/services/billing.ts` |
| exportações | `shared/exports.ts` (formato) e `server/services/exports.ts` (consultas) |
| usuários, senha e arquivamento | `server/routes/admin.ts` (`/usuarios`, `/organizacoes/:id/arquivar`), `shared/senha.ts` |
| o que falta para vender em produção | `docs/PENDENCIAS.md` — **atualize no mesmo PR** que fechar um item |
| cadastro fiscal do afiliado, cofre e recibo | `shared/fiscal.ts` (regras), `server/services/cofre.ts`, `server/services/fiscal.ts`, `server/services/recibos.ts`, `client/src/pages/afiliadoDados.tsx`, `adminFiscal.tsx`, `Recibo.tsx`, `scripts/fiscal-test.ts` |
| guarda da comissão pela plataforma (etapa 12) | `guardaComissao` e `percentualDoPromotor()` em `shared/plataforma.ts`, `createOrder`/`settleOrderAsPaid` em `server/services/orders.ts`, `scripts/guarda-test.ts` |
| indicação, bônus e metas (etapa 13) | `shared/bonus.ts` (regras), `server/services/bonus.ts`, `resgatarCotasDeBonus()` em `server/services/orders.ts`, `client/src/lib/indicacao.ts`, `client/src/pages/adminBonus.tsx`, `client/src/components/BonusDoComprador.tsx`, `scripts/bonus-test.ts` |
| Reels (tela cheia, vídeo em pé, interruptor da plataforma) | `shared/reels.ts` (regras, lote), `GET /api/public/reels` em `server/routes/public.ts`, `reelsLigado` em `shared/plataforma.ts`, `client/src/pages/Reels.tsx`, o som lembrado em `client/src/lib/reelsSom.ts`, `vertical` em `BarraDeAcoes`, `scripts/publicacao-test.ts`, `tests/reels.test.ts` |
| Buscar (grade das publicações e busca por texto, interruptor e tabela da plataforma) | `shared/buscar.ts` (regras e tabela), `server/services/buscar.ts`, o índice de texto (`shared/semAcentoSql.ts`, `idx_*_trgm` em `shared/schema.ts`, `scripts/extensoes.ts` no `db:push`), `GET /api/public/buscar` em `server/routes/public.ts`, `buscarLigado`/`buscarTipos` em `shared/plataforma.ts`, `client/src/pages/Buscar.tsx`, cartão em `client/src/components/TopoDoAppCard.tsx`, `scripts/buscar-test.ts`, `tests/buscar.test.ts` |
| Mensagens (caixa de um para um: apostador, organização e afiliado) | `shared/mensagens.ts` (regras puras), `server/services/mensagens.ts`, rotas `/mensagens/*` em `server/routes/public.ts` e `/mensagens/denuncias*` em `server/routes/admin.ts`, `mensagensLigado` em `shared/plataforma.ts`, `client/src/pages/Mensagens.tsx` (foto e "online agora"), grupos da rifa (`shared/grupos.ts`, `server/services/grupos.ts`, `client/src/components/Grupos.tsx`, `GruposDenunciadosDaPlataforma` em `ConversasDenunciadas.tsx`, `scripts/grupos-test.ts`, `tests/grupos.test.ts`), `ConversasDenunciadas.tsx`, `BotaoMensagem.tsx` (também na peça do afiliado em `DivulgacoesDaRifa.tsx`), o número não lido do painel em `PanelShell` (`client/src/components/AppShell.tsx`, `rotuloDoSino()` em `shared/avisos.ts`), `scripts/mensagens-test.ts`, `tests/mensagens.test.ts` |
| rifas patrocinadas por clique (etapa 15): pacote, fila, tabela e números | `shared/patrocinio.ts` (regras, preço, previsão da fila), `server/services/patrocinio.ts`, `client/src/pages/adminPatrocinio.tsx`, `client/src/components/Patrocinadas.tsx`, `scripts/patrocinio-test.ts` |
| banner pago na vitrine (dias de topo, arte aprovada, vagas, devolução dos dias não usados) | `shared/bannerPago.ts` (regras e config), `server/services/bannerPago.ts`, rotas `/banner-pago*` em `server/routes/admin.ts`, `/banners` e `/banners-pagos/:id/imagem` em `server/routes/public.ts`, `bannerPago` em `shared/plataforma.ts`, `client/src/pages/adminBannerPago.tsx`, `client/src/components/BannersVitrine.tsx`, relógio em `server/jobs/index.ts`, `scripts/banner-pago-test.ts`, `tests/bannerPago.test.ts` |
| marketing e tráfego pago (etapa 16): pixels, aviso de cookies, UTM, compra pelo servidor | `shared/marketing.ts` (regras e corpos das APIs), `server/services/marketing.ts`, `client/src/lib/marketing.ts`, `client/src/components/Marketing.tsx`, `client/src/pages/adminMarketing.tsx`, `scripts/marketing-test.ts` |
| plano da próxima fase (vitrine, contas, afiliados, marketing) | `docs/PLANO-FASE5.md` |
| conta do apostador (senha, confirmação, exclusão) | `shared/contaComprador.ts`, `server/services/contaComprador.ts`, `scripts/conta-test.ts` |
| login com Google, completar CPF e telefone, ligar o Google | `shared/google.ts` (regras, claims, volta segura), `server/services/google.ts`, `server/services/contaCompleta.ts`, rotas `/conta/google/*`, `/conta/cpf` e `/conta/telefone/*` em `server/routes/public.ts`, `client/src/components/BotaoGoogle.tsx`, `CompletarConta`/`GoogleCard` em `client/src/pages/MinhasCotas.tsx`, `scripts/google-test.ts`, `tests/google.test.ts` |
| de quem é o cliente (o que o organizador vê) | `shared/titularidade.ts` (regra) e `server/services/titularidade.ts` (SQL) |
| autorização SPA/MF e data do sorteio | `shared/campanhaLegal.ts`, `salvarDadosLegais()` em `server/services/campaigns.ts`, `client/src/components/DadosLegaisCard.tsx` |
| endereço do organizador e ordem da vitrine por região | `shared/endereco.ts` (regra), `salvarEndereco()` em `server/services/orgs.ts`, `server/services/cep.ts`, `client/src/components/EnderecoForm.tsx` |
| perfil do organizador, seguir e sino | `shared/perfil.ts` (regras), `server/services/perfil.ts`, `client/src/pages/Perfil.tsx`, `client/src/components/Seguir.tsx`, `scripts/perfil-test.ts` |
| perfil de demonstração (organização de exemplo, sem rifa à venda) | `server/services/demonstracao.ts`, card em `client/src/pages/adminOrganizacoes.tsx` |
| editar, adiar e excluir rifa (pedido analisado pela plataforma) | `shared/solicitacoes.ts` (regras), `server/services/solicitacoes.ts`, `excluirRifa()` em `server/services/campaigns.ts`, `client/src/components/EditarRifa.tsx`, `client/src/components/SolicitacoesDeRifa.tsx`, `scripts/solicitacoes-test.ts` |
| endereço curto (`/c/…`) e cliques nos links do perfil (`/l/…`) | `server/services/links.ts`, `client/src/components/LinksCurtos.tsx`, rotas em `server/routes/index.ts`, `scripts/perfil-test.ts` |
| white label do organizador (capa, cor de destaque, links) | `validarDestaque()`/`validarLinks()` em `shared/perfil.ts`, `salvarPerfil()` em `server/services/perfil.ts`, `client/src/components/DestaqueOrg.tsx`, `client/src/components/PerfilPublicoForm.tsx` |
| notificações no celular (Web Push) | `shared/push.ts` (regras), `server/services/push.ts`, `client/public/sw.js`, `client/src/lib/push.ts`, `scripts/push-test.ts` |
| Termos de uso e Política de privacidade (texto montado das regras, dados da empresa e encarregado) | `shared/legal.ts` (`montarTermosDeUso`, `montarPrivacidade`, `validarDadosDaEmpresa`), `legal` em `shared/template.ts`, `client/src/pages/Legal.tsx` (`/termos`, `/privacidade`), cartão "Dados da empresa" em `client/src/pages/adminAparencia.tsx`, `tests/legal.test.ts` |
| regulamento, central de ajuda, transmissão, conferência do sorteio e a regra da aproximação (número não vendido) | `shared/regulamento.ts`, `shared/ajuda.ts`, `shared/sorteio.ts` (`contempladoPorAproximacao`), o sorteio em `POST /campaigns/:id/draw` (`server/routes/admin.ts`), `client/src/components/SorteioCard.tsx`, `scripts/transparencia-test.ts` |
| vitrine: banners, stories (inclusive o agendado), estados e feed | `shared/vitrine.ts` (regras), `server/services/vitrine.ts`, `server/services/faixa.ts` (`Range` do vídeo), `client/src/components/BannersVitrine.tsx`, `Stories.tsx`, `EstadosVitrine.tsx`, `CartaoDoFeed.tsx`, `client/src/pages/adminStories.tsx`, `scripts/vitrine-test.ts` |
| painel de resultados, origem da venda e foto do ganhador | `shared/resultados.ts` (regras), `server/services/resultados.ts`, `client/src/lib/origem.ts`, `client/src/pages/adminResultados.tsx`, `server/services/ganhador.ts`, `scripts/resultados-test.ts` |
| aparência da plataforma (construtor de templates) | `shared/template.ts` (regras), `server/services/template.ts`, `client/src/lib/template.ts`, `client/src/pages/adminAparencia.tsx`, `scripts/aparencia-test.ts` |
| tema claro e escuro | `client/src/index.css` (variáveis), `client/src/lib/tema.ts`, `client/src/components/TemaToggle.tsx`, `tests/tema.test.ts` |
| comentários na publicação da rifa | `shared/comentarios.ts` (regras), `server/services/comentarios.ts`, `client/src/components/Comentarios.tsx`, `scripts/comentarios-test.ts` |
| bilhetes do apostador como publicações privadas (`/perfil/bilhetes`) | `shared/bilhetes.ts` (regras), `server/services/bilhetes.ts`, `GET /conta/bilhetes` em `server/routes/public.ts`, `client/src/components/BilheteComoPublicacao.tsx`, `client/src/pages/MeusBilhetes.tsx`, `scripts/bilhetes-test.ts`, `tests/bilhetes.test.ts` |
| perfil do apostador (apelido, foto, `/u/<apelido>`) e curtidas | `shared/perfilApostador.ts`, `server/services/perfilApostador.ts`, `client/src/components/PerfilDoApostador.tsx`, `client/src/pages/Usuario.tsx`, `scripts/comentarios-test.ts` |
| segurança do organizador: telefone aprovado, denúncias, rifa travada, banimento | `shared/seguranca.ts` (regras e varredura), `server/services/seguranca.ts`, `client/src/components/Seguranca.tsx`, `scripts/seguranca-test.ts` |
| visão do organizador (só o próprio perfil) | `VisaoDoOrganizador` em `client/src/App.tsx`, `organizacao` em `GET /api/auth/me` |
| central de avisos do apostador (o trevo no topo) | `server/services/notificacoes.ts`, `avisar()` em `server/services/push.ts`, `client/src/pages/Notificacoes.tsx`, `CoracaoDeAvisos` em `client/src/components/AppShell.tsx`, `scripts/push-test.ts` |
| perfil verificado (selo de trevo): documentos, foto, fila e cores | `shared/verificacao.ts` (regras e paleta), `server/services/verificacao.ts`, `server/services/rosto.ts` (comparador), `server/routes/verificacaoRotas.ts`, `client/src/components/Verificacao.tsx`, `SeloVerificado.tsx`, `VerificacoesDaPlataforma.tsx`, `CoresDoSelo.tsx`, `scripts/verificacao-test.ts` |
| formato da publicação (retrato 4:5, quadrado 1:1, paisagem 1,91:1, vertical 9:16) e o perfil acima ou por cima | `formatoDaPeca()`/`formatoDoCarrossel()`/`perfilPorCima()` em `shared/publicacao.ts`, `probeVideoDimensions()` em `server/services/probe.ts`, `Carrossel` em `client/src/components/Publicacao.tsx`, `tests/publicacao.test.ts` |
| publicação da rifa: carrossel de até 10 (reels e vídeos), barra de ações (trevo, comentar, republicar, compartilhar, "+" do carrinho, comprar) e legenda | `shared/publicacao.ts` (regras), `server/services/publicacao.ts`, `server/services/media.ts` (limites), `client/src/components/Publicacao.tsx`, `scripts/publicacao-test.ts` |
| divulgação de terceiros: o afiliado (influenciador) publica com o material da organização e fotos dele, direto ou só depois da autorização dela (com foto, sempre depois), e o apostador publica texto e fotos (atrás de `publicarApostador`); o menu Criar | `shared/divulgacao.ts` (regras), `server/services/divulgacao.ts`, rotas `/divulgacoes*` em `server/routes/affiliate.ts` (afiliado), `public.ts` (apostador e página da rifa) e `admin.ts` (modo e fila), `modoDaOrganizacao`/`divulgacaoAfiliado` em `organizations`, `MenuCriar` em `client/src/components/Console.tsx`, `client/src/pages/afiliadoDivulgar.tsx`, `Publicar.tsx`, as fotos de quem publica em `client/src/components/FotosProprias.tsx`, a agenda em `shared/agenda.ts` e `client/src/components/CampoDeAgenda.tsx`, `client/src/components/DivulgacoesDaOrganizacao.tsx`, `DivulgacoesDaRifa.tsx`, `tests/divulgacao.test.ts`, `scripts/divulgacao-test.ts` |
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
| selo "ao vivo" no story (anel com a transmissão do sorteio) | `transmissaoNoAr()` em `shared/aoVivo.ts` (regra), `transmissoesNoAr()` em `server/services/aoVivo.ts`, `perfisComStory()` e `perfilPublico()` em `server/services/perfil.ts`, `FotoComStory`/`VisualizadorDeStories` em `client/src/components/Stories.tsx`, `tests/seloAoVivo.test.ts`, `scripts/vitrine-test.ts` |
| tela do sorteio no Início do celular (deslizar para a direita, vídeo e comentários como no YouTube) | `client/src/components/SorteioDoInicio.tsx` (`useSorteioDoInicio`, `BotaoDoSorteio`), a regra do gesto em `client/src/lib/deslizar.ts`, `TelaDoProximoSorteio` em `client/src/components/ColunaAoVivo.tsx`, `antesDaMarca` em `PublicShell`, `tests/deslizar.test.ts` |
| sorteios oficiais da plataforma (calendário, integrar a rifa, selo, resultado oficial, sorteio automático, outras loterias, troca pelo adiamento, a tela do celular) | `shared/sorteiosOficiais.ts` (regras e loterias), `server/services/sorteiosOficiais.ts`, `sortearRifasDoSorteioOficial()` em `server/services/sortear.ts` (e o relógio em `server/jobs/index.ts`), `pedirAdiamento()` com `sorteioOficialId` em `server/services/solicitacoes.ts`, os comentários em `server/services/sorteioComentarios.ts` (o componente `Comentarios` com `sorteioOficialId`, `scripts/sorteio-comentarios-test.ts`) e a denúncia deles (`shared/sorteioDenuncias.ts`, `ComentariosDoSorteioDenunciados` em `client/src/components/ConversasDenunciadas.tsx`, tipo `comentario_sorteio` em `shared/caixa.ts`, `tests/sorteioDenuncias.test.ts`), `/sorteios-oficiais*` e `PUT /campaigns/:id/sorteio-oficial` em `server/routes/admin.ts`, `GET /api/public/sorteio-oficial` em `server/routes/public.ts`, `client/src/pages/adminSorteiosOficiais.tsx`, `ConteudoDoSorteio`/`ContagemDoSorteio` em `client/src/components/SorteioDoInicio.tsx`, `scripts/sorteios-oficiais-test.ts`, `tests/sorteiosOficiais.test.ts` |
| vitrine no tablet e no computador: coluna ao vivo (tela do sorteio, ganhadores, jogando agora), tela flutuante e rodapé com logos | `shared/aoVivo.ts` (regras), `server/services/aoVivo.ts`, `client/src/components/ColunaAoVivo.tsx`, `client/src/components/RodapeDaPlataforma.tsx`, `validarApoios()` em `shared/template.ts`, `tests/aoVivo.test.ts`, `scripts/vitrine-test.ts` |
| rodapé da plataforma: colunas de links, redes sociais e espaço de apoio | `shared/rodape.ts` (colunas), `validarRedes()`/`REDES_DO_RODAPE` em `shared/template.ts`, `client/src/components/RodapeDaPlataforma.tsx`, cartão "Redes sociais do rodapé" em `client/src/pages/adminAparencia.tsx`, `preencherRodapeComExemplo()` em `server/services/template.ts`, `tests/rodape.test.ts` |
| app instalável (PWA): casca, nome e ícone | `client/public/sw.js`, `shared/manifest.ts` (o manifesto montado), `manifestDaPlataforma()`/`iconeDaMarca()` em `server/services/template.ts`, `client/public/manifest.webmanifest` (o de fábrica, se o banco falhar), `client/src/lib/pwa.ts`, `tests/manifest.test.ts`, `scripts/aparencia-test.ts` |
| automação do Claude no projeto: `/provar` (escolhe as provas pela área mexida), `/pr-check` (o rito do PR: docs, capturas, rascunho, mesclagem) e o agente `revisor-de-invariantes` (lê o diff contra as invariantes) | `.claude/skills/provar/SKILL.md`, `.claude/skills/pr-check/SKILL.md`, `.claude/agents/revisor-de-invariantes.md`. **Invariante nova ou regra de PR nova entra nos três** — o `.gitignore` libera só estes (o resto de `.claude/skills` é instalado por `npx skills add`, com o `skills-lock.json`) |
| assistente de IA nos painéis (Chatbase): conversa pelo servidor, coluna, uso e configuração | `shared/ia.ts` (regras, papéis, titular, barreira de dado pessoal), `server/services/chatbase.ts` (cliente da API v2), `server/services/ia.ts` (conversa e uso), `server/routes/ia.ts` (`/api/ia/*`), `/ia/config` em `server/routes/admin.ts`, `assistenteIA` em `shared/plataforma.ts`, `ia_conversas`/`ia_uso` em `shared/schema.ts`, `client/src/lib/assistente.ts` (coluna aberta lembrada), `client/src/components/AssistenteDoPainel.tsx` (botão e coluna, em `PanelShell`), `AssistenteIACard.tsx` (Aparência), `scripts/ia-test.ts`, `tests/ia.test.ts`, `tests/chatbase.test.ts`, `tests/assistente.test.ts` |
| cobrança do assistente de IA (assinatura com franquia, pacotes avulsos, Pix da plataforma, débito por mensagem, vencimento, relatório e ajuste de crédito da plataforma) | `shared/iaCobranca.ts` (regras), `server/services/iaCobranca.ts` (conta, livro, Pix, débito, `ajustarCreditosIA`, `relatorioDaIA`, `extratoDaIA`), `/ia/relatorio`, `/ia/lancamentos` e `/ia/ajustes` em `server/routes/admin.ts`, `client/src/components/UsoDoAssistenteCard.tsx` (em Aparência), `ia_contas`/`ia_pagamentos`/`ia_lancamentos` em `shared/schema.ts`, `/api/ia/conta` e `/api/ia/pagamentos` em `server/routes/ia.ts`, `confirmarPagamentoIA` no webhook, relógio em `server/jobs/index.ts`, `client/src/components/PlanoDoAssistente.tsx` (o plano na coluna), preços em `AssistenteIACard.tsx`, `scripts/ia-test.ts`, `tests/iaCobranca.test.ts` |
| ações do assistente de IA no sistema (consultar, publicar, legenda, excluir, estorno; confirmação e auditoria) | `shared/iaAcoes.ts` (catálogo, entrada, barreira do resultado), `server/services/iaAcoes.ts` (o que cada ação faz, no recorte), `tratarChamadas`/`seguirComAcoes`/`decidirAcaoDaIA` em `server/services/ia.ts`, `enviarResultado` em `server/services/chatbase.ts`, `ia_acoes` em `shared/schema.ts`, `/api/ia/acoes/:id/confirmar\|recusar` em `server/routes/ia.ts`, `CartaoDaAcao` em `AssistenteDoPainel.tsx`, a lista para o Chatbase em `AssistenteIACard.tsx`, `scripts/ia-acoes-test.ts`, `tests/iaAcoes.test.ts` |
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

- Política de conteúdo (CSP) **valendo**: hoje ela está em **modo
  relatório** (`Content-Security-Policy-Report-Only`, só em produção,
  `montarCsp()` em `shared/csp.ts`): avisa em `/api/csp-relatorio`, o log
  agrupa (`[csp]`, diretiva e origem por hora) e nada é bloqueado. Origem
  nova no código (pixel, player, CDN) entra na lista no mesmo PR —
  `tests/csp.test.ts` confere os pixels e os players. Passa a valer quando o
  log de produção ficar limpo, com os pixels ligados. O script do tema entra
  pelo hash do `index.html` construído — nunca `'unsafe-inline'` em script.
  A rota do relatório é aberta: tem `hit` por IP e a diretiva só leva
  letras e hífen (sem isso, uma quebra de linha escrevia linha falsa no log).
  O que mais ficou para depois está em `docs/SEGURANCA.md`.

- **Chatbase AI nos painéis**: a conversa (pelo nosso servidor), a coluna, a
  medição do uso, a cobrança (com o relatório e o ajuste de crédito da
  plataforma) e as ações no sistema existem (seções "Assistente de IA",
  "Cobrança do assistente" e "Ações do assistente"). O Pix do assistente que
  vence sem pagar não é cancelado no provedor; se for pago tarde, credita
  normalmente (`docs/PENDENCIAS.md`, seção 1b).

- **Transcode do vídeo** fora do Stream: o processo web nunca recomprime.
  Com a entrega ligada (`CLOUDFLARE_STREAM_ENTREGA=hls`), o vídeo **da rifa**
  toca em HLS pelo Stream (seção "Entrega em HLS"); sem ela, e no story,
  servimos o arquivo original. Vídeo enviado antes de ligar a entrega segue
  no original (não há envio retroativo ao Stream; o pôster retroativo só tira
  o quadro).
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
  celular e a leitura de tela. Seção que cresce
  com o uso (as "Divulgações" de terceiros) entra **depois** da compra no DOM
  — no celular e no tablet ela não empurra a compra para baixo —, e no
  computador a grade a põe na coluna da publicação.
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
- **No celular, o sorteio mora à esquerda do Início** (`SorteioDoInicio`,
  abaixo de `md` — onde a coluna ao vivo não existe): deslizar o dedo para a
  direita no Início abre a tela do sorteio principal, **como no YouTube** —
  o vídeo parado no alto (a mesma `TelaDoProximoSorteio` da coluna: contagem,
  transmissão, qualidade e tela cheia), o título embaixo e os **comentários
  da rifa abertos** (`Comentarios`, o mesmo campo e as mesmas regras). O mesmo
  dado da coluna (`/vitrine/ao-vivo`), buscado só com a tela aberta. Sem
  sorteio marcado, os últimos ganhadores.
  - **O gesto não rouba o de ninguém** (`toquePodeAbrir()` em
    `client/src/lib/deslizar.ts`): carrossel, banners e stories que ainda
    podem voltar ficam com o toque (na primeira peça, voltar não faz nada lá e
    o gesto abre o sorteio, como no Instagram); campo de digitar, janela
    aberta (`aria-modal`) e `data-sem-gesto` ficam fora. É de lado só com
    `|dy| ≤ dx × 0,5` e abre a partir de `DISTANCIA_PARA_ABRIR`; o painel
    acompanha o dedo, e deslizar de volta fecha. `tests/deslizar.test.ts`.
  - **Gesto nunca é o único caminho** (WCAG 2.5.1): o botão do sorteio no
    topo, à esquerda da logo (`BotaoDoSorteio`, só no celular), abre a mesma
    tela. Aberta, é diálogo (`role="dialog"`, `aria-modal`, foco no
    "Voltar ao início", Esc fecha) e a página de baixo não rola.
  - **A tela do celular transmite só o sorteio oficial da plataforma**
    (seção "Sorteios oficiais"), com a fileira horizontal das rifas
    integradas embaixo do vídeo e os comentários do sorteio oficial abertos
    (seção "Sorteios oficiais"); a contagem da faixa do estado conta até ele.
  - **A faixa do estado no Início do celular**: à esquerda, o seletor de
    estado mostra **só a sigla** (BR para todo o Brasil) e, aberto, a lista
    traz o nome de cada estado — o `<select>` de verdade fica por cima,
    transparente (o toque, o teclado e o leitor de tela são dele, com o
    rótulo "Rifas perto de"); à direita, a **contagem do próximo sorteio**
    (`ContagemDoSorteio`, a cara da tela do sorteio: fundo escuro e as casas
    d/h/m/s), que é botão e abre a tela do sorteio. O tempo vai no
    `aria-label`; sem sorteio marcado, "Ganhadores". **É só do celular**:
    do tablet em diante o seletor segue o de antes ("Rifas perto de" e o
    nome do estado) e a contagem não existe — lá a tela do sorteio principal
    é a coluna ao vivo, já definida.
  - **O voltar do aparelho fecha** (`#sorteio`, `useSorteioDoInicio()`):
    abrir empurra a marca no histórico, fechar a tira; chegar com
    `#sorteio` abre direto.
  - **Tela cheia no iPhone**: o Safari só põe o `<video>` em tela cheia, e a
    transmissão é um `iframe` — sem a tela cheia do navegador, a tela ocupa a
    janela por cima de tudo (`falsa` em `useTelaCheia`), e sai pelo mesmo
    botão ou pelo Esc. Vale também para a coluna.
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
    ainda não existe é `emBreve`: texto com o rótulo "Em breve", nunca link
    que cai em 404 — ao criar a página, tire a marca (Termos de uso e
    Privacidade já saíram dela: seção "Termos de uso e Privacidade").
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
  (Criar: rifa, story, legenda e as divulgações de terceiros para
  autorizar), afiliado como influenciador (kit e publicar com o material
  da organização, `/afiliado/divulgar`) e o apostador só com o interruptor
  `publicarApostador` (nasce desligado; `/publicar`). Sem conta, não
  aparece. As regras de terceiros estão em "Divulgação de terceiros". O menu vai para o `body` (portal): dentro do topo, o console
  passaria por cima.
- **Ponto na foto do perfil = conta incompleta** (`pendenciasDaConta()`:
  apelido faltando, telefone não confirmado), só para quem tem conta. O
  ponto é verde e o que falta vai no rótulo do botão e num quadro "Complete
  sua conta" em `/perfil` — nunca só o ponto.
- **"Seu story" é o "+" na foto do próprio perfil** (o organizador, na
  vitrine, é levado ao perfil dele, então é ali que ele está), e na fileira
  de stories vai com a foto da organização, não a inicial. O selo "ao vivo"
  do story é a seção "Selo ao vivo no story" (abaixo).
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
- **Cartão estreito não corta número.** O `Estatistica` aperta pela largura
  dele (`.estatistica`, container query de até 220 px no `index.css`): o ícone
  sobe e o valor ganha a largura toda, com a fonte acompanhando o cartão
  (`cqi`); o "Vendas do mês" faz o mesmo. Com a coluna do assistente aberta,
  ou num computador de 1024 px, o cartão fica com ~170 px e o dinheiro saía
  "R$ 0…".
- **O Painel usa os widgets dos painéis prontos do kit** (eCommerce e
  Analytics), cada um ligado a um dado nosso em `GET /api/admin/overview`
  (hoje, mês, canais site/cambista, por estado de quem comprou, série de 30
  dias no fuso de São Paulo, a capa do próximo sorteio) — tudo venda paga,
  com o recorte de `orgOf` em cada consulta. Sparkline e barras por dia da
  semana levam a lista de valores no `aria-label`; nada é simulado.
- **A Caixa de entrada reúne, não decide** (`/admin/caixa`, só a plataforma:
  403 para organizador, no `npm run isolation`). `caixaDeEntrada()` junta as
  filas (chamados e disputas, pedidos de mudança de rifa, denúncias, conversas
  e grupos denunciados, comentários do sorteio oficial denunciados,
  verificações, cadastros fiscais, banner pago, Pix a devolver) e os telefones
  por aprovar; a ordem e o
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
  (`client/src/components/painel.tsx`): **cartão por linha até o tablet,
  tabela a partir de `xl`** (com o menu aberto, o tablet deixa ~510 px); lista nova de painel usa os dois, não uma tabela
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

## Buscar — o que não pode afrouxar

A tela Buscar do console: o campo no topo e, embaixo, a grade das
publicações mais novas (a capa de cada rifa). Com texto, acha rifas (título,
prêmio e nome da organização), organizações (nome ou endereço) e, se a
plataforma ligar, o apostador pelo `@apelido` exato.

- **Nasce desligada** (`buscarLigado`, Aparência → Topo do app, `PUT
  /admin/app`, 403 para organizador). Desligada, `/api/public/buscar` devolve
  só `{ ligado: false }` e o botão é "Em breve".
- **A tabela é da plataforma** (`buscarTipos`, `validarConfigBusca()`): quais
  tipos entram. **Apostador nasce desligado** — é pessoa, não vitrine — e,
  ligado, só aparece pelo apelido **exato** (nunca lista aproximada), com
  apelido e foto e nada mais.
- **Só o que a vitrine mostraria**: rifa no ar, não travada, não
  demonstração, de organização nem arquivada nem banida. A capa é a primeira
  imagem (o banner, senão a primeira foto) — nunca o vídeo.
- **Grade por chave** (`publicada em` + id, `shared/paginacao.ts`): nada de
  `OFFSET`, nada de `COUNT(*)`, linha a mais para saber se há próxima. Cursor
  fora do formato vira primeira página. Ordem padrão: as mais novas primeiro.
- **A pessoa escolhe a ordem e o estado** (`ordem` e `estado` na URL, só valor
  conhecido: `interpretarOrdem()`/`interpretarEstado()`). **"Mais curtidas"** usa
  o contador real da publicação (`campaigns.curtidas_count`), com cursor
  próprio `<curtidas>|<id>` (o par decide, as curtidas empatam o tempo todo) e
  **sem nunca devolver o número**. O **estado** filtra pela UF da organização
  — aqui o filtro é escolha explícita, como em `/estado/UF` (restringe só a
  grade de rifas; a organização achada pelo texto não é filtrada); a vitrine,
  que ordena sozinha, segue sem esconder nada. Como o contador muda entre uma
  página e outra, uma rifa pode repetir ou pular ao rolar em "Mais curtidas". Cursor de uma ordem na outra é
  primeira página. Ficou de fora: hashtags.
- **O texto tem índice** (`pg_trgm`, índice `gin` de trigrama sobre o texto
  sem acento: título e prêmio da rifa, nome e endereço da organização). **A
  expressão do índice e a da consulta moram num lugar só**
  (`ACENTOS_DE`/`ACENTOS_PARA` em `shared/semAcentoSql.ts`): uma letra
  diferente e o Postgres volta a ler a tabela inteira, calado. **Mudou uma
  letra, suba `VERSAO_SEM_ACENTO`**: o nome do índice leva a versão
  (`idx_*_trgm_v<n>`), porque o `drizzle-kit` só recria índice quando o nome
  muda — não compara a expressão (`tests/semAcentoSql.test.ts` falha se as
  letras mudarem sem a versão). A grade busca em dois passos — as
  organizações pelo nome e as rifas por título, prêmio ou dona —, porque um
  `OR` com coluna das duas tabelas do `JOIN` não usa índice. As donas têm
  teto (`ORGANIZACOES_DO_TEXTO_MAX`, 200: o texto genérico bateria em todas),
  ordem fixa (a mesma lista em toda página do cursor) e só contam as que têm
  rifa que a grade mostraria; passado o teto, o nome da organização deixa de
  achar rifa (título e prêmio seguem valendo). O `drizzle-kit` não cria extensão: o `npm run
  db:push` roda antes `scripts/extensoes.ts` (`CREATE EXTENSION IF NOT
  EXISTS pg_trgm`); sem ela, o push falha. `npm run buscar` prova o plano
  com 5 mil rifas sintéticas numa transação que volta (`sqlDaGrade()`).
- **O texto é dado, nunca SQL**: parâmetro, `%` e `_` viram letras
  (`escaparCuringa`), sem acento e sem diferença de maiúscula dos dois lados.
  Texto de menos de 2 letras não busca.
- **Limite por aparelho** (`hit`, 60 por minuto): o campo digita e a grade
  pagina, mas varrer a base por tentativa se barra (429).
- **Nunca** telefone, CPF, e-mail, nome real, id ou preço na resposta.
- `npm run buscar` prova tudo isso contra a API de verdade.

## Mensagens de WhatsApp — o que não pode afrouxar

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

**O envio ao disco leva o teto na assinatura.** A URL assinada do passo 1
(`LocalDiskStorage.sign(key, exp, maxBytes)`) inclui os bytes declarados, e
`/media/raw` confere a assinatura **antes** de ler o corpo e só aceita aquele
tamanho: sem isso, dois envios de 2 GB em paralelo estouravam a memória.
`/uploads` só restaura da cópia chave no formato que geramos
(`chaveRestauravel()`), senão cada nome pedido virava uma chamada ao S3.

A **chave do arquivo** também volta do navegador na confirmação do envio, e
só vale a que o passo 1 gerou para aquela rifa e aquele papel
(`chaveDaCampanha()` em `storage.ts`), conferida antes de tudo — a recusa da
mídia apaga o objeto da chave, e a chave de outra organização aparece no
endereço público da imagem dela. A imagem é aberta com teto de 40
megapixels (medido pelo cabeçalho antes de abrir): um PNG pequeno pode
dizer 16.000 × 16.000 e derrubar o processo. `npm run isolation` prova.

## Pôster do vídeo — o que não pode afrouxar

O quadro que aparece antes do play (`poster` do `<video>`) do vídeo da
rifa, do reels e do story. Quem faz é um **processador de vídeo**
(`ProcessadorDeVideo` em `server/services/videoProcessor.ts`): hoje o
`ffmpeg` local, se estiver instalado, ou o Cloudflare Stream
(`VIDEO_PROCESSOR=cloudflare-stream`).

- **Cloudflare Stream** (`CloudflareStream`, com `CLOUDFLARE_ACCOUNT_ID` e
  `CLOUDFLARE_STREAM_TOKEN`; sem as duas, cai no `ffmpeg` local com aviso no
  log): envia o arquivo temporário (`openAsBlob`, sem pôr o vídeo na memória;
  até 200 MB), espera `readyToStream`, busca o quadro (`time=0.5s`,
  `width=720`) e **apaga o vídeo do Stream no `finally`**, dê certo ou não — o
  Stream cobra por minuto guardado, e hoje ele só serve para o pôster. O
  endereço do quadro vem da resposta e só vale `https` em
  `*.cloudflarestream.com`. O token só vai no cabeçalho, nunca na URL nem no
  log. Falhou, vence o prazo (120 s) ou deu erro: `ComReserva` tenta o
  `ffmpeg` local; sem ele, "sem pôster". Teto próprio de 3 envios ao mesmo
  tempo. O vídeo sai do nosso servidor para a Cloudflare enquanto dura o
  processamento — é decisão de privacidade, ligada só pela variável.
  `tests/cloudflareStream.test.ts` prova com um Stream de mentira.

- **Degrada, nunca quebra.** Sem `ffmpeg`, com vídeo que ele não abre, com
  prazo estourado (20 s) ou saída maior que 8 MB, o resultado é "sem pôster"
  (`null`): o envio da mídia, a publicação e o story seguem iguais, e o
  `<video>` mostra o primeiro quadro como sempre mostrou. `gerarPoster()`
  nunca lança.
- **Só em segundo plano** (`emSegundoPlano`): o envio responde 201 sem esperar
  o processo, e o pôster aparece depois (`UPDATE … poster_key IS NULL`). Mídia
  apagada no meio do caminho: o pôster recém-gravado é apagado também.
- **O pôster é nosso, nunca do navegador.** A chave
  (`chaveDoPoster()`, `campanhas/<rifa>/poster-<uuid>.webp`) é gerada aqui e
  não passa por `chaveDaCampanha()` — confirmar essa chave como mídia dá 400.
  `posterKey`/`poster` no corpo do envio são ignorados. Vale a regra da
  mídia: nenhuma medida ou valor vem do cliente.
- **Um quadro só, WebP, até 720 px de largura**, tirado a 0,5 s (o primeiro
  quadro costuma ser preto) ou, em vídeo curto demais, do primeiro de
  verdade; o `ffmpeg` aplica a rotação do vídeo. Reprocessado pelo `sharp`:
  sem metadados.
- **Onde mora**: rifa — `campaign_media.poster_key` no armazenamento (volume
  e cópia, como a mídia; `removeMedia` apaga junto), exposto como `poster`
  (`posterUrl` em `withUrls`, `pecaPublica` para feed, perfil e Reels, e
  `reelsPoster` no lote do Reels). Story — `stories.poster` no banco, como o
  vídeo. A coluna é nova: **`db:push` antes do código**.
- **Vídeo grande fora do disco local** (bucket) acima de 200 MB não é baixado
  só para tirar o quadro: fica sem pôster até o Stream entrar.
- **Fila e memória**: o `ffmpeg` roda no máximo 2 ao mesmo tempo
  (`limiteDeFfmpeg()`, `FFMPEG_MAX_SIMULTANEOS`; o resto espera a vez, na
  ordem), e o vídeo do bucket vai para o arquivo temporário **em pedaços**
  (`comArquivoTemporarioEmPedacos()`, 4 MB por vez) — nunca inteiro na memória.
  `excluirRifa()` apaga do armazenamento o original, o pôster e as variantes
  (`apagarArquivosDeMidias()`), só **depois** de a transação fechar: rollback
  não pode deixar mídia sem arquivo.
- **O vídeo de antes ganha o pôster pelo relógio** (`posterDosVideosAntigos()`
  em `server/services/posterRetroativo.ts`, trava 811017): o vídeo sem pôster
  nem `uid` passa pelo mesmo `gerarPosterDaMidia()` do envio (mesmo `UPDATE`
  condicional), **só o pôster** (`soPoster`) — o vídeo nunca fica guardado no
  Stream por aqui: rifa encerrada, rascunho ou promotora arquivada seriam
  minutos cobrados sem ninguém assistir. Só vídeo com mais de 1 h
  (`FOLGA_DO_ENVIO_MIN`: o envio recente ainda pode estar no segundo plano),
  4 por volta, um de cada vez, **andando por chave sem recomeçar** — cada
  vídeo é tentado no máximo uma vez por processo e por réplica (o cursor é da
  memória), e de novo a cada deploy. Sem tamanho guardado, o do bucket não é
  baixado. Mídia apagada no meio da volta: o original que a leitura trouxe da
  cópia sai de novo. A entrega em HLS é a seção abaixo. `npm run poster` prova (com `ffmpeg` e sem; `FFMPEG_PATH`
  apontando para o vazio nos dois lados prova o caminho sem ele) e
  `tests/poster.test.ts` cobre as regras e as falhas do processo.

## Entrega em HLS — o que não pode afrouxar

Com `VIDEO_PROCESSOR=cloudflare-stream` **e** `CLOUDFLARE_STREAM_ENTREGA=hls`
(`entregaHlsLigada()` em `shared/stream.ts`), o vídeo da rifa **fica** no
Stream e a tela toca o HLS dele; sem a escolha, o Stream só tira o pôster e
apaga o vídeo, como antes. Guardar cobra por minuto: é decisão de custo, por
isso é variável à parte.

- **O mesmo passo do pôster** (`gerarPosterDaMidia()` → `publicar()` em
  `CloudflareStream`), em segundo plano: o envio responde 201 sem esperar, e
  o HLS aparece depois. O pôster que o Stream não der, o `ffmpeg` tenta
  (`ComReserva.publicar`).
- **Só fica no Stream o que vai tocar.** O vídeo fica se o Stream devolveu um
  HLS conferido; qualquer outra saída (erro, prazo de 10 min da entrega —
  `prazoEntregaMs`, o vídeo de feed demora —, HLS estranho) apaga no
  `finally`.
- **Nenhum vídeo esquecido lá** (o Stream cobra por minuto guardado): todo
  envio é anotado em `stream_pendentes` **antes** de qualquer espera (gancho
  `enviado`, `server/services/streamPendentes.ts`), e sai da lista quando o
  Stream confirma o DELETE ou quando a mídia guarda o `uid`. Apagar uma mídia
  anota antes de pedir o DELETE. O relógio (`limparStreamPendente`, trava
  811014) apaga no Stream o que passou de 30 min sem dono — o processo que
  caiu no meio, o DELETE que falhou — e tira da lista o que tem dono. O `uid` só vale no formato do Stream (`uidValido()`: 32 hex) —
  ele vira caminho da consulta e do `DELETE`.
- **O HLS é conferido, nunca aceito** (`hlsDoStream()`): `https`,
  `customer-<código>.cloudflarestream.com`, caminho
  `/<o mesmo uid>/manifest/video.m3u8`, sem usuário, porta, consulta nem
  âncora. O endereço sai na tela de todo apostador. **Nada vem do navegador**:
  `streamUid`/`streamHls`/`hls` no corpo do envio são ignorados.
- **Gravar é `UPDATE` condicional** (mídia existe e ainda sem pôster nem
  `uid`), junto do pôster. Mídia removida no meio: o pôster sai do
  armazenamento e o vídeo, do Stream. `removeMedia` e `excluirRifa()`
  (`apagarArquivosDeMidias()`, depois da transação, com as linhas travadas
  `FOR UPDATE`) apagam no Stream (`apagarDoStream()`, nunca lança; sem
  credencial, avisa no log que o vídeo ficou lá).
- **O campo `streamUid` não sai em resposta** (`withUrls()` o tira); a tela
  recebe `hls` (`pecaPublica`, a página da rifa, `reelsHls` no Reels) e
  sempre o `url` original de reserva. O `uid` está dentro do endereço do HLS
  — não é segredo: apagar exige o token.
- **A tela volta ao original** (`useVideoHls()` em `client/src/lib/hls.ts`,
  regra em `fonteDoVideo()`): HLS nativo (Safari, iPhone) ou hls.js (versão
  `light`, baixada só quando precisa e que só busca os pedaços do vídeo no
  play — o `preload="metadata"` segue valendo); erro fatal ou sem como tocar,
  `src` = original, no ponto em que estava.
- **Endereço da API**: `CLOUDFLARE_API_URL` só fora de produção
  (`baseDaCloudflare()`), para a prova; o token só no cabeçalho.
- **URL assinada** (`server/services/streamAssinatura.ts`, com
  `CLOUDFLARE_STREAM_CHAVE_ID` e `CLOUDFLARE_STREAM_CHAVE_JWK` — a chave de
  assinatura do Stream, `POST /stream/keys`; sem as duas, tudo segue aberto
  como antes): o HLS aberto deixava qualquer site tocar o `.m3u8` com a
  plataforma pagando os minutos. Com a chave, o vídeo que fica no Stream é
  marcado `requireSignedURLs` **depois** de tirar o pôster (o quadro também
  passa a pedir token) e **antes** de a mídia guardá-lo; não conseguiu
  marcar, **não fica** (sai no `finally`) — vídeo guardado aberto é o custo
  que isto corta. A mídia guarda `stream_assinado`; a tela recebe o
  endereço com um JWT RS256 no lugar do `uid` (`hlsParaATela()` em
  `shared/stream.ts`, `sub` = o `uid`, vale 4 h, o mesmo token reaproveitado
  em memória até faltar 1 h), assinado aqui — sem chamada à Cloudflare por
  visualização. **Vídeo marcado sem chave no processo não vai com HLS**: a
  tela toca o original, nunca um endereço que daria 401. Para o
  público, o token sai só das rotas que já conferem a rifa no ar (o painel
  da dona, pelo recorte, também recebe): a rifa que sai do ar para de tocar
  no Stream para o público quando os tokens dados vencem. O vídeo
  guardado antes da chave é marcado pelo relógio do Stream
  (`assinarVideosDoStream()`, 20 por volta, andando por chave — o vídeo que
  o Stream não marca fica para a volta seguinte e não segura a fila —, com
  `try` próprio dentro da trava, e `UPDATE` condicional ao `uid` lido). O JWK é segredo: nunca vai a log, resposta ou URL.
- Ficou fora: story em vídeo (vive 24 h, fica no banco) e `allowedOrigins`
  do Stream (o HLS nativo do iPhone pode não mandar `Origin`; a URL assinada
  já fecha o custo) — `docs/PENDENCIAS.md`.
- As colunas `campaign_media.stream_uid`, `stream_hls` e `stream_assinado` e
  a tabela `stream_pendentes` sobem com o `db:push`
  **antes** do código. `npm run poster` prova com um Stream de mentira (com as
  variáveis da entrega, como no CI; a URL assinada com uma chave criada pela
  própria prova, só no processo dela) e `tests/stream.test.ts`,
  `tests/streamAssinatura.test.ts` e `tests/cloudflareStream.test.ts` cobrem
  as regras.

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
- **O registro de recusa e o bloqueio vencido têm prazo** (a Privacidade
  diz os dois): `fraud_events` sai com `GUARDA_DAS_RECUSAS_DIAS` (180) e o
  bloqueio com prazo sai `GUARDA_DO_BLOQUEIO_VENCIDO_DIAS` (30) depois de
  vencer (`purgarGuardaDoAntifraude()`, no relógio de limpeza); o bloqueio
  sem prazo fica até a plataforma tirar. Mudou o prazo, o texto acompanha
  (lê das mesmas constantes). `npm run pix-tardio` prova.
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
- **Rascunho não existe para o público.** Toda rota pública por `slug` responde
  404 (igual a inexistente) para rifa em rascunho — página, regulamento,
  mapa de números, número, prêmios, ranking e últimas compras. Responder "só
  números" já entrega que a rifa existe e quanto ela tem. Rota pública nova
  por `slug` confere o `status`; `npm run senha` prova as de números.
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
- **O hash da senha leva o custo** (`s2$N$r$p$sal$chave`, `CUSTO_DA_SENHA`
  em `server/services/hashSenha.ts`: N = 2¹⁶, r = 8, p = 2). A senha do
  formato antigo (`sal:chave`, custo padrão do Node) continua entrando e é
  refeita no login certo (`refazerHashSeAntigo`, `UPDATE` condicional ao hash
  lido — painel e conta do apostador). Subir o custo de novo é mudar a
  constante: nenhuma senha deixa de valer. Custo fora da faixa no hash
  guardado é recusado sem calcular. O código do WhatsApp (6 dígitos, minutos
  de vida) fica no custo leve (`hashCodigo`) — quem protege é o limite.
- **O segredo do segundo fator fica selado no cofre**
  (`server/services/segundoFator.ts`: `cofre:v1:…`; o pendente da sessão
  também). O de antes, em claro, entra e é selado ao subir o servidor
  (`cifrarSegredosDoSegundoFator`, trava 811015, `UPDATE` condicional). Sem
  `COFRE_CHAVE` o novo é guardado em claro com aviso — trancar o segundo
  fator seria pior (é a única exceção ao "não existe modo sem cifrar" do
  cofre). Selado que não abre é "código incorreto", nunca 500 — por isso
  **trocar a `COFRE_CHAVE` tranca fora quem tem segundo fator**, como perde
  os documentos fiscais: desligue o segundo fator (ou migre) antes.
  `npm run senha` prova. Cada hash de senha usa 64 MiB e uma das threads do
  libuv (que também servem o disco): se o login sob rajada pesar no Railway,
  suba `UV_THREADPOOL_SIZE`.
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

## Pix que chegou tarde — o que não pode afrouxar

O provedor confirmou o Pix, mas o pedido já não podia virar cota: a reserva
tinha vencido (os números voltaram ao estoque) ou a rifa já tinha sido
sorteada (o quadro está congelado). É dinheiro sem bilhete, e volta para
quem pagou.

- **Fila, não log** (`pix_tardios`, `server/services/pixTardio.ts`): uma
  linha por pedido (índice único `uq_pix_tardio_pedido`, `ON CONFLICT DO
  NOTHING` — o webhook repetido não duplica), com o valor, a cobrança e o
  provedor do pedido. `registrarPixTardio()` **nunca lança**: quem chama é
  o webhook, e falhar aqui não vira 500 para o provedor. Entra por
  `markOrderPaid`/`marcarCarrinhoPago` (pedido `expired`) e por
  `settleOrderAsPaid` (rifa sorteada, valor acima de zero).
- **Só a plataforma vê e resolve** (403 para organizador, no `npm run
  isolation`): o dinheiro passou pela conta dela. Cartão "Pix a devolver"
  em Pedidos e o tipo `pix_tardio` na Caixa de entrada. **Sem nome nem
  telefone** de quem pagou: o pedido basta para achar a cobrança.
- **Devolver é `UPDATE` condicional** (`pendente` → `devolvendo`) antes de
  chamar o provedor, **com o valor explícito** (no carrinho a cobrança é de
  várias rifas) **e a chave do caso** (`refund(..., chave)`: no Mercado Pago a
  idempotência leva a chave, senão duas devoluções da mesma cobrança com o
  mesmo valor virariam uma só — o estorno do chamado passa a chave do
  pedido): dois cliques, uma devolução e um 409. O que se sabe **antes** de
  chamar (sem cobrança, provedor que não devolve pelo sistema) volta a
  `pendente`: nada saiu. **Erro depois de chamar** (prazo, rede) pode ter
  devolvido: o caso **fica em `devolvendo`**, com o motivo, sem botão de
  devolver, e só fecha por **resolver** (de `pendente` ou `devolvendo`,
  observação obrigatória) depois de conferir no provedor. Voltar a
  `pendente` seria a segunda devolução no próximo clique. A troca de
  situação e o `audit_log` vão na mesma transação.
- Os Termos dizem que o valor volta por esta fila. `npm run pix-tardio`
  prova. A tabela sobe com o `db:push` **antes** do código.

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
- **O arrependimento acaba no que vier primeiro: 7 dias ou o fechamento**
  (2 horas antes do sorteio, `prazoDoArrependimento()`). O bilhete é a
  participação num sorteio com data marcada; feito o sorteio, o serviço foi
  prestado. Como o prazo pode ficar menor que 7 dias, **a tela diz a data e
  a hora exatas antes do Pix** (`avisoDePrazoCurto()`, `AvisoDePrazo` na
  página da rifa e no carrinho, uma linha por rifa que vende; na rifa
  "quando completar" ainda sem data, o aviso diz que o prazo pode encurtar
  ao encher) — CDC, arts. 6º, III, e
  31; Decreto 7.962/2013. A regra, o regulamento (item 7) e a ajuda
  (`prazo-de-desistir`) dizem o mesmo texto.
- **Sorteio adiado depois da compra devolve tudo** (tipo `adiamento`),
  online ou cambista, mesmo depois dos 7 dias, até o fechamento da data
  nova: quem comprou, comprou a rifa da data antiga. A data que separa é a
  aprovação do último adiamento (`adiadoEmSql`, `max(decidido_em)` dos
  pedidos de adiamento aprovados — sem coluna nova), lida no servidor ao
  abrir o chamado e em "Minhas compras" (a prévia da tela usa a mesma
  conta). **O chamado com taxa já aberto ou aprovado** passa a devolver
  tudo na mesma transação que aprova o adiamento — senão a promessa valeria
  só para quem pedisse depois. A data marcada pela rifa "quando completar"
  (ou desmarcada pelo estorno) não é adiamento.
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
- **"Quem também joga" na página da rifa** (`QuemTambemJoga`, `GET
  /campaigns/:slug/quem-joga`, `quemTambemJoga()`): até 6 mini-perfis (foto e
  `@apelido`, que levam a `/u/<apelido>`) de quem tem **compra paga** naquela
  rifa **e** abriu o perfil público (`buyers.perfil_publico`, nasce
  desligado — participar de rifa é dado pessoal, LGPD; o texto da opção em
  Minha conta diz isso). Só apelido e foto: **nunca** nome, telefone, CPF, id
  nem quantas cotas. A consulta parte de quem abriu o perfil (índice parcial
  `ix_buyers_perfil_publico`) e confere a compra com `EXISTS` — nunca varre
  os pedidos da rifa — e pede uma pessoa a mais só para saber se há "e outras
  pessoas", **sem número** (nada de contar quem não abriu o perfil). Rascunho,
  demonstração, rifa travada e promotora arquivada ou banida vêm vazios; sem
  ninguém, a faixa não existe. Guardada 15 s no servidor.
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

## Bilhetes privados — o que não pode afrouxar

Em `/perfil/bilhetes`, quem tem conta vê cada compra **paga** como uma
publicação (o `Carrossel` e o topo do feed, sem as ações sociais): capa da
rifa, prêmio, data e hora (fuso de São Paulo), números e situação do sorteio.

- **Só a própria pessoa.** `GET /conta/bilhetes` decide pela sessão (nada
  vem da URL): 401 sem conta com senha, `no-store`, e não existe rota por id
  nem versão pública — nunca em `/u/<apelido>`.
- **Só pedido pago e visível pela regra da conta** (`pedidoVisivel()`, aqui
  em SQL em `visivelNaConta()`): compra de cambista ou de outro telefone só
  entra com a prova (CPF vinculado ou telefone provado). Pendente, vencido e
  estornado não entram (conservador: o que não vale mais fica em Minhas
  compras, com a situação).
- **Por chave, sem `OFFSET` e sem `COUNT(*)`** (`shared/paginacao.ts`,
  `X-Proximo`); o total de números é `orders.quantity`, e o cartão mostra no
  máximo `NUMEROS_NO_CARTAO`, com link para o bilhete inteiro.
- **Nunca** telefone, CPF, nome, ID de cliente nem número de cota premiada
  em jogo: só a que **este** pedido já reclamou (a revelação).
- `npm run bilhetes` prova tudo isso contra a API de verdade.

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
  marca).
- **Consentimento biométrico é prova, destacado e revogável** (LGPD, arts.
  8º e 11, I). O texto (`textoDoConsentimentoBiometrico()`: para quê, quem
  compara — e o Amazon Rekognition quando o comparador automático está
  ligado —, guarda, opcional, como revogar) vem do servidor com a chave
  (`chaveDoConsentimento()`: versão e modo), e a chave volta no pedido:
  texto diferente do lido é 409. Gravado na verificação
  (`consentimento_biometrico_em`, a chave e o SHA-256 do texto) e, **na
  mesma transação e só quando mudou**, na auditoria (com a chave e o hash;
  o ator do apostador é ele, nunca a sessão de painel do mesmo navegador).
  **Não é condição para salvar os dados** (quem revogou corrige a conta sem
  consentir de novo): sem ele falta "a sua autorização"
  (`faltaNaVerificacao`), a plataforma não aprova a foto (409) e aprovar só
  os documentos deixa a verificação parada (`incompleto`), não na fila da
  foto. **O comparador automático exige a chave do texto que cita o serviço
  de fora** (`chaveDoConsentimento({automatico: true})`, também no
  `UPDATE`, junto com a data do consentimento lido): quem autorizou só a
  comparação por uma pessoa nunca tem a foto enviada, e a tela pede a
  autorização de novo. **Revogar** (`DELETE …/consentimento`) apaga a prova
  e tira o selo na mesma transação — `foto_divergente` e `recusado` ficam
  como estão; autorizar de novo (`POST …/consentimento`, limite por pessoa)
  só reabre a análise de quem estava `incompleto`, nunca a decisão da
  plataforma, e o mesmo texto de novo não grava nada. A fila mostra "Sem
  autorização da foto". Verificado de antes do consentimento gravado segue
  verificado; subir a versão do texto exige o consentimento de novo.
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

## Divulgação de terceiros — o que não pode afrouxar

O afiliado (influenciador) e o apostador publicam **sobre a rifa de uma
organização**, nunca a rifa em si. A peça (`divulgacoes`) é uma legenda
própria e, para o afiliado, a escolha de mídias que a organização já
publicou, com o link dele (`/r/<rifa>?ref=<código>`).

- **Não toca a rifa.** Preço, cotas, prêmio e autorização SPA/MF não passam
  por aqui; o afiliado escolhe `campaign_media` **da própria rifa, já
  prontas** (id conferido contra a rifa) — nada do navegador vira mídia da
  rifa, e as medidas e limites dela seguem sendo os do envio da organização.
  A foto própria (do afiliado ou do apostador) é outra coisa: fica em
  `divulgacao_fotos`, presa à peça (bullet "As fotos de quem publica").
- **O afiliado só divulga onde recebe**: `comissaoNaRifa()` (afiliado ativo,
  vínculo aprovado com a **dona** da rifa e, se a rifa foi publicada com
  termo, o aceite **daquela versão**) — 403 sem isso. A régua vale de novo
  **na aprovação** (409 se o vínculo mudou) e **na leitura pública**: perdeu
  o vínculo ou o aceite, a peça some da página sem apagar nada.
- **O modo é da organização** (`organizations.divulgacao_afiliado`):
  `autorizacao` (padrão — nada vai ao ar sem ela) ou `direta`. Só a dona
  muda (o recorte é `organizacaoDoPedido`; a plataforma escolhe a
  organização). **O apostador sempre passa pela fila**, em qualquer modo.
- **Rifa que aceita peça nova**: publicada, não demonstração, não travada,
  organização ativa, não arquivada nem banida (`rifaParaDivulgar`).
- **O texto passa pela régua da legenda** (sem link e sem telefone, 422) e
  pela varredura `pedePagamentoPorFora()`: pedido de Pix por fora é
  **recusado** (422) e vira denúncia automática (`emSegundoPlano`, evidência
  "texto de terceiro (afiliado <código>), recusado e não publicado"). A
  denúncia tem a organização como alvo porque a rifa é dela, mas a evidência
  diz que o texto não é dela e nunca foi ao ar; quem decide é a plataforma.
  A tentativa recusada **conta no limite diário** (`hit()` antes de recusar).
  Peça de terceiro nunca nasce sem isto.
- **Decidir é `UPDATE` condicional com a linha travada** (`FOR UPDATE`,
  `decidir()`): aprovar/recusar parte de `em_analise`, retirar de
  `publicada` — dois cliques, uma decisão, um 409. Recusar e retirar pedem
  motivo (quem publicou o lê). O pedido do vizinho é **404** (`orgOf`),
  conferido antes de tudo; o afiliado não decide (403, é rota de painel).
- **Um em análise por autor e rifa** pelos índices parciais
  (`uq_divulgacao_afiliado_em_analise`, `uq_divulgacao_apostador_em_analise`)
  — nunca um `SELECT` antes — e `hit()` de 10 por dia por pessoa, depois do
  erro de preenchimento.
- **O apostador** só com o interruptor `publicarApostador` ligado (desligado:
  404 em toda rota e as peças dele saem do ar), só com **conta e apelido**,
  **texto e até `DIVULGACAO_FOTOS_MAX` (4) fotos dele** (nunca mídia da rifa),
  só sobre rifa em que tem **compra paga** — conferida de novo na leitura
  pública: estornou, a peça sai do ar.
- **O afiliado também manda até 4 fotos dele** (além das mídias da rifa), e
  **a peça com foto própria passa pela organização em qualquer modo**
  (`statusInicial(…, temFotoPropria)`): no modo direto, sem foto vai ao ar
  na hora; com foto, espera. Na edição, a peça que **fica** com foto volta
  para a fila mesmo no modo direto; tirar as fotos (`fotos: []`) devolve o
  modo direto. A peça vazia (sem legenda, mídia nem foto) é 422. O termo do
  afiliado (item 7) diz que a foto é dele ou de quem autorizou, nunca de
  menor, e passa pela promotora. Perdeu o vínculo, a peça some da página
  sem apagar nada (como a do texto); a foto sai do banco na recusa ou na
  retirada — que o próprio afiliado faz a qualquer hora (a Privacidade diz
  isso). A porta dele fecha com a conta (`afiliadoOnline`).
- **As fotos de quem publica** (`divulgacao_fotos`, no banco): JPEG de até
  1600 px reprocessado pelo `sharp` (sem metadados, teto de 40 MP, 3 MB cada — PNG, JPG ou WebP; SVG não),
  **todas processadas antes da transação** que grava a peça (recusa não deixa
  peça pela metade). A varredura do Pix por fora só lê texto — **quem lê a
  foto é a organização**, e peça com foto sempre passa pela fila. Três
  portas, nunca o arquivo solto: a pública (`/api/public/divulgacoes/:id/fotos/:f`)
  só serve a peça que a página da rifa mostra agora (no ar, rifa e promotora
  no ar e a condição de quem publicou: o apostador com compra paga e o
  interruptor ligado, o afiliado ativo com vínculo e aceite valendo — saiu
  do ar, a foto some); a do painel, no recorte de `orgOf` (a do vizinho é
  404, no `npm run isolation`); e a do autor (`/api/public/divulgacoes/minhas/…`
  para o apostador, `/api/affiliate/divulgacoes/:id/fotos/:f` para o
  afiliado, só a dele; `no-store`). Na edição, sem `fotos` no corpo ficam as que a
  peça tinha; a lista troca todas, na transação do `UPDATE` que confere a
  versão. **Recusada ou retirada (pela organização ou por quem publicou), as
  fotos são apagadas na mesma transação** — a Privacidade diz isso. Excluir a
  conta (LGPD) apaga as fotos. Só o `POST` da peça e o `PATCH` da edição
  (de `/api/public` e de `/api/affiliate`) aceitam 18 MB (a tela reduz a foto
  antes, `lerFoto()`, no componente comum `FotosProprias`); o resto de
  `/api/public/divulgacoes*` e `/api/affiliate/divulgacoes*` segue em 1 MB. As
  três portas respondem `private` (a pública com 60 s, as outras `no-store`).
  O 413 genérico do Express só troca a mensagem do corpo grande demais
  (`entity.too.large`): o 413 da régua da foto chega com o próprio texto.
- **Sem dado pessoal em lugar nenhum**: a fila e a página pública trazem
  nome curto e código (afiliado) ou `@apelido` (apostador) — nunca telefone,
  CPF, e-mail ou id de pessoa.
- **Avisos**: a organização vê no sino quantas peças esperam a autorização
  dela (`divulgacoes` em `/chamados/pendentes`, só no recorte dela — a
  plataforma não conta: não é ela quem autoriza no dia a dia), com a linha que
  leva à fila em Afiliados. Quem publicou fica sabendo da decisão **da
  organização** (`decidido_por`): o apostador por push e trevo (`avisar()`,
  tipo `divulgacao`, chave com a situação, fora da transação, motivo no
  corpo); o afiliado, que não tem push, pelo número no sino do painel
  (`GET /api/affiliate/divulgacoes/novidades`, o "visto" é o mesmo
  `users.avisos_vistos_em`, marcado por `POST /api/affiliate/avisos/vistos`
  — o afiliado não alcança `/api/admin`). O que a pessoa retirou sozinha
  zera `decidido_por` e não vira aviso; a peça que nasce no ar (modo direto)
  também não. Nada de telefone ou nome no aviso.
- **Quem publicou edita a própria peça** (`PATCH /api/affiliate/divulgacoes/:id`
  e `/api/public/divulgacoes/:id`, `editarPropria()`): em análise ou no ar
  (`podeEditar()`; recusada e retirada terminaram — envia outra), a legenda e,
  para o afiliado, as mídias da rifa. **A mesma régua da peça nova**: texto,
  Pix por fora (recusa e denúncia), mídias da própria rifa, vínculo e termo do
  afiliado, compra paga do apostador, o interruptor; um balde próprio de
  `hit` (`EDICOES_POR_DIA`, a tentativa conta). **Editada, volta para a fila**
  (sai da página da rifa até a organização ler de novo) — salvo o afiliado no
  modo direto, que segue no ar (e aí a decisão que a pôs no ar fica como
  está: a aprovação ainda não vista segue no sino do afiliado). O índice de
  "uma em análise" decide se já há outra esperando (409). Voltando para a
  fila, a edição zera `decidido_por` (não é decisão da organização). Marca
  `editada_em` ("Editada" na lista, na fila e na página). Sem `midias` no
  corpo, ficam as que a peça tinha.
- **A organização decide a versão que leu.** `divulgacoes.versao` sobe a cada
  edição; a fila devolve a versão e a decisão a manda de volta — **obrigatória**
  (`validarDecisao()`, 422 sem ela): editada no meio, 409 — nunca aprovar um
  texto que ninguém viu. A edição também parte de uma versão (a tela manda;
  formato errado é 422): duas abas na mesma versão dão um 200 e um 409. Os
  dois `UPDATE` repetem situação e versão. O aviso ao apostador leva a versão
  na chave (`<id>:<versao>:<situação>`): a peça editada e aprovada de novo
  avisa de novo.
- **Peça agendada** (`divulgacoes.publica_em`, `agendaDaPeca()` em
  `shared/divulgacao.ts`, até `DIVULGACAO_AGENDA_MAX_DIAS`, 30): quem publica
  escolhe a hora em que a peça entra na página da rifa. **Agendar não pula a
  fila**: a peça só aparece se estiver `publicada` (aprovada, ou no ar pelo
  modo direto) **e** passada a hora — a página e a foto pública filtram por
  `noArAgora()` (sem agenda, ou `publica_em` já passou), comparando com o
  relógio do processo. Sem relógio: na hora ela simplesmente passa a valer.
  Na edição, sem `publicaEm` no corpo fica a agenda que estava; `null` tira
  a agenda; a tela só manda o campo se a pessoa mexeu (a hora que passou não
  volta como "hora que já passou"). A data é instante ISO com fuso
  (`instanteAgendado()` em `shared/agenda.ts`, a mesma régua do story).
- **A plataforma vê e decide a fila de todas** (organização nula no recorte),
  com o nome da organização em cada peça; o modo continua sendo da organização.
- A tabela nova sobe com o `db:push` **antes** do código, e a coluna
  `organizations.divulgacao_afiliado` também, e `divulgacoes.versao` e
  `editada_em`, e a tabela `divulgacao_fotos`, e a coluna
  `divulgacoes.publica_em`.
- `npm run divulgacao` prova tudo isso contra a API de verdade
  (`npm run isolation` confere o recorte).

## Mensagens — o que não pode afrouxar

Caixa de entrada geral, como a DM do Instagram, de **um para um** entre
apostador (conta com apelido), organização e afiliado. Uma rifa entra na
conversa como cartão (o compartilhar da publicação), nunca como link no texto.

- **Nasce desligada** (`mensagensLigado`, Aparência → Topo do app, `PUT
  /admin/app`, 403 para organizador). Desligada, toda rota `/mensagens/*`
  é 404 e o botão do console é "Em breve".
- **O par é único pelo índice** (`uq_conversa_par`, em ordem canônica:
  `ordenarPar()`): `INSERT … ON CONFLICT DO NOTHING`, nunca um `SELECT` antes.
  Escrever trava a conversa (`FOR UPDATE`) e confere bloqueio, encerramento
  e pedido com a linha travada; mensagem, prévia e contador de não lidas
  andam na mesma transação. **Nunca `COUNT(*)`** para o número do console.
- **Quem conversa** (`minhaIdentidade()`): organização (sessão de
  organizador), afiliado **ativo** (sessão de afiliado) ou apostador com conta
  e apelido. O administrador geral e o cambista não conversam (401).
- **Conversa de outro é 404**, nunca 403: o apostador só alcança as dele, a
  organização as da organização da sessão. `npm run mensagens` e `npm run
  isolation` provam.
- **Pedido de mensagem**: quem não tem vínculo manda **uma** mensagem e
  espera. Só o apostador que **segue** a organização conversa direto com
  ela. Quem recebeu aceita, recusa ou responde (responder é aceitar);
  responder o pedido é um `UPDATE` condicional (`situacao = 'pedido'`).
- **A mesma régua dos comentários**: sem link e sem telefone
  (`problemaNaMensagem()`). **Emoji vale para todos** — conversa privada.
- **Achar alguém é por nome exato** (`@apelido`, endereço da organização ou
  código do afiliado), com limite; nunca lista. Nada de telefone, CPF ou
  e-mail em nenhuma resposta: o apostador é o apelido, a organização o nome
  público.
- **Limites** (`hit`): conversas novas por dia, mensagens por janela, buscas
  e denúncias — o erro de preenchimento sai antes de contar.
- **Denúncia leva só o trecho**: as últimas 30 mensagens, gravadas na hora
  (`mensagem_denuncias.trecho`). A plataforma **nunca lê a conversa
  inteira**; a fila não traz texto; a leitura do trecho entra em `audit_log`
  **antes** de sair; organização não vê nem decide (403). Uma aberta por
  conversa e lado (índice parcial). Procedente **encerra** a conversa na
  mesma transação, e dois cliques são uma decisão e um 409.
- **Varredura do Pix por fora** (`pedePagamentoPorFora()`) em mensagem de
  **organização e afiliado** (a conversa privada é o canal do golpe): acendeu,
  vira denúncia automática com o trecho; não barra a mensagem e nunca derruba
  o envio (`emSegundoPlano`).
- **Vídeo nas Mensagens não existe e não vai existir** (decisão do produto,
  03/10/2026): nem na conversa de um para um nem nos grupos. Entre os
  participantes, só texto e — na conversa — a foto do apostador. Não abra
  rota, tabela ou botão de vídeo aqui.
- **Foto na conversa** (`mensagem_imagens`): **só o apostador envia**
  (`podeEnviarImagem()`) — a varredura do Pix por fora só lê texto e a
  conversa da organização e do afiliado é o canal do golpe; foto lá seria o
  Pix em imagem. JPEG de até 1600 px reprocessado pelo `sharp` (sem
  metadados, teto de 40 MP, 5 MB), no Postgres, 20 por dia (`hit` antes de
  abrir a imagem). Só quem está na conversa a abre (404 para o resto,
  `no-store`, `nosniff`). A denúncia leva só o **id** da foto no trecho; a
  plataforma a abre por `GET /admin/mensagens/denuncias/:id/fotos/:fotoId`
  **só se o id está naquele trecho**, e a abertura entra em `audit_log`
  antes de sair. Recorte provado em `npm run isolation` (403).
- **"Online agora"** (`mensagens_presenca`): **só dado real e só opt-in**
  (`mostrar` nasce `false`, "Mostrar quando estou online" na lista). Aparece
  só quando **os dois** mostram (`podeVerOnline()`: quem esconde também não
  vê) e a conversa foi **aceita** — pedido não revela presença. Nunca
  "visto por último" nem horário: o `online` é o mesmo booleano para quem
  esconde e para quem está fora (janela de 120 s, escrita no máximo uma vez
  por minuto). O estado vai em texto ("Online agora"), não só na bolinha.
- **Grupos da rifa** (`grupos`, `grupo_membros`, `grupo_mensagens`,
  `grupo_denuncias`; regras em `shared/grupos.ts`, serviço em
  `server/services/grupos.ts`): conversa de **até 50 apostadores com compra
  paga naquela rifa**, atrás do mesmo interruptor `mensagensLigado`. **Só
  apostador com conta e apelido** — organização e afiliado não entram (403/401):
  a conversa privada deles já é o canal do golpe, e num grupo ele alcançaria
  cinquenta pessoas de uma vez. **Só texto**, na régua das mensagens (sem link
  e sem telefone, também no nome do grupo); sem foto.
  - **Entrar é a chave (grupo, pessoa)**: `INSERT … ON CONFLICT DO NOTHING` e o
    contador `membros_count` só anda quando a linha entrou, com teto no próprio
    `UPDATE` (`membros_count < 50`), com o grupo travado (`FOR UPDATE`) — duas
    entradas na última vaga: uma 200 e uma 409, e a perdedora não vira membro.
    Nunca um `SELECT` de vagas antes. Sair e excluir a conta (LGPD) descem o
    contador na mesma transação; o que a pessoa escreveu fica, sem apelido.
  - **A compra paga é conferida na transação** que cria, entra e escreve
    (`exists` em `orders`, `status = 'paid'`). Estornou: segue **lendo**, não
    escreve (409, com o motivo na tela). Um grupo aberto por criador e rifa
    (índice parcial `uq_grupo_por_criador_e_rifa`); a rifa precisa ser a que
    aceita divulgação (publicada, não demonstração, não travada, organização
    no ar).
  - **Grupo de que não sou membro é 404**, ler, escrever, sair e denunciar. A
    lista "grupos desta rifa" (só nome e quantos são, só para apostador logado)
    é a vitrine para entrar; quem não comprou vê os grupos e o motivo de não
    participar. Nunca nome real, telefone, CPF ou id de pessoa: só `@apelido`.
  - **Limites** (`hit`, o erro de preenchimento sai antes): 3 grupos novos por
    dia, 20 entradas por dia, 20 mensagens a cada 5 min, denúncias por dia.
    **Sem push**: um grupo de 50 viraria 50 avisos por mensagem; o número de
    não lidas anda no contador do console (`naoLidasDeGrupos()` soma em
    `resumoDasMensagens`) e na aba "Grupos".
  - **Denúncia leva só o trecho** (30 mensagens, gravadas na hora, só
    apelido); a plataforma nunca lê o grupo inteiro; a fila e a Caixa (tipo
    `grupo`) não trazem texto; a leitura do trecho entra em `audit_log`
    **antes** de sair; organização não vê nem decide (403, no `npm run
    isolation`). Uma aberta por grupo e pessoa; decidir é `UPDATE` condicional
    (`aberta`) e procedente encerra o grupo na mesma transação.
  - **Rifa travada ou promotora banida fecha o grupo** para novas mensagens
    (409): o mesmo corte da compra. O último a sair **fecha** o grupo (vazio,
    ele travaria o criador e ocuparia a lista). A denúncia guarda o apelido
    no trecho como prova da moderação — a retenção é de propósito (excluir a
    conta tira a pessoa do grupo e mascara as mensagens na leitura, mas a prova
    de uma denúncia aberta não se apaga).
  - Fica de fora: moderador do grupo (quem cria não remove ninguém — a
    plataforma encerra), foto em grupo e aviso no celular.
  - `npm run grupos` prova tudo isso contra a API de verdade.
- **Aviso sem conteúdo**: o apostador recebe push e trevo "Nova mensagem" (no
  máximo um por conversa a cada 30 min, pela chave); o texto nunca vai no push.
- **O painel conta, não entrega**: o sino da organização e do afiliado mostra
  "N mensagens não lidas" (a mesma `/mensagens/resumo` do console, pela
  identidade da sessão do painel) e leva à caixa; o administrador geral não
  conversa e vê zero. Sem texto no sino.
- **Entrar em conversa com o afiliado** é pelo botão "Mensagem" da peça dele
  na página da rifa (o código dele já é público no link); vale o pedido de
  mensagem de sempre, e o código nunca vem de apostador.
- **Conversa denunciada na Caixa** (tipo `conversa`): protocolo, motivo e os
  dois lados só pelo tipo ("apostador e organização") — nunca texto, nome ou
  telefone; o trecho continua só na tela da denúncia, com a auditoria antes.
  `npm run mensagens` prova.
- `npm run mensagens` prova tudo isso contra a API de verdade.

## Reels — o que não pode afrouxar

- **Nasce desligado** (`reelsLigado`, Aparência → Topo do app, `PUT
  /admin/app`, 403 para organizador). Desligado, `/api/public/reels` devolve
  lista vazia e `/reels` é a tela "Em breve".
- **Só rifa no ar com vídeo em pé de até 3 min**, medido no servidor
  (`videoDoReels()`: formato "reels" e proporção ≤ 0,85 — vídeo deitado ou
  sem medida não entra). Demonstração, rifa travada e rascunho ficam de fora.
- **Lote depois do último id visto** (`loteDepoisDe()`, parâmetro `depois`),
  nunca por número de página nem `OFFSET`: rifa nova no topo não repete nem
  pula item. Região ordena (`ordenarPorProximidade`), nunca esconde.
- **"Seguindo" pede conta** (`precisaEntrar`) e filtra por `seguidores`.
- **É o mesmo cartão e as mesmas ações da vitrine**: curtir, comentar,
  republicar, compartilhar, "+" e comprar passam pelas rotas de sempre.
  Nada reserva cota aqui; comprar leva à compra rápida (`?comprar=1`).
- Sem prova social inventada: nada de contador "assistindo agora".
- **O som é escolha da pessoa e fica no aparelho** (`client/src/lib/reelsSom.ts`,
  `rifa.reels.som`): quem ligou o som ouve no reel seguinte e na próxima visita.
  O navegador pode barrar o som sem toque; aí o reel **toca mudo** e a escolha
  guardada fica como estava (botão de som com `aria-pressed`). Nada de música
  nem trilha: sem biblioteca licenciada, o som é o do próprio vídeo.
- `npm run publicacao` prova a rota e o interruptor contra a API de verdade.

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
  que já tinha vencido não reabre: vai para a fila de devolução (seção
  "Pix que chegou tarde"), é dinheiro sem cota.
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
- **Número sorteado não vendido: regra da aproximação**
  (`contempladoPorAproximacao()` e `REGRA_DA_APROXIMACAO` em
  `shared/sorteio.ts`, a mesma frase no regulamento e na tela): o prêmio vai
  ao número **vendido e pago** imediatamente acima; sem nenhum acima, ao
  imediatamente abaixo. O sorteio grava os dois (`resultNumber`, o sorteado,
  que a conferência pública refaz; e `winnerNumber`, o contemplado) numa
  transação com a linha de `draws` travada (`FOR UPDATE`): dois cliques, um
  sorteio e um 409; só rifa publicada. **Com cota reservada esperando Pix, o
  sorteio espera (409)** — o Pix pago depois ficaria fora do quadro. A
  confirmação do pagamento (`settleOrderAsPaid`) e o estorno (`refundOrder`)
  leem o sorteio **dentro** da transação deles com a mesma linha travada
  (`FOR SHARE`): Pix que chega depois do sorteio não vira cota (vai à fila
  de devolução, seção "Pix que chegou tarde"), e o estorno nunca solta a cota que o sorteio está
  escolhendo. Aviso do ganhador, push do resultado, coluna ao vivo e o
  relatório de prestação de contas ("Número contemplado" e a regra) usam o
  contemplado. Sorteio de antes da
  coluna não tem `winnerNumber`: vale o sorteado. O prêmio prescrito em 180
  dias vai ao Tesouro Nacional — está no regulamento. `npm run
  transparencia` prova.
- **Mínimo de cotas vendidas para sortear** (`campaigns.minimo_vendido_pct`,
  0 = sem mínimo): a promotora define o percentual da autorização nos dados
  legais (`PUT /campaigns/:id/legal`, `problemaNoMinimoVendido()`), ele
  **trava ao publicar** (fora do `PATCH` genérico) e entra no regulamento
  com o número de cotas (`cotasMinimasParaSortear()`, arredonda para cima).
  Abaixo dele o sorteio recusa (409, dentro da mesma transação, contando
  `campaign_stats.sold_count`) e a promotora pede o adiamento (seção "Editar
  e adiar rifa publicada"). `npm run transparencia` prova.
- **Como a rifa chega ao sorteio é escolha da promotora** (`campaigns.modo_sorteio`,
  `MODOS_DO_SORTEIO` em `shared/campanhaLegal.ts`, nos dados legais; trava ao
  publicar, fora do `PATCH`, e entra no regulamento): **na data** (o mínimo
  que ela definir), **rifa cheia na data** (mínimo 100%; não completou, pede
  o adiamento), **rifa cheia, sorteio quando completar** (sem data: a última
  cota paga, em `settleOrderAsPaid`, marca `draw_at` para a próxima extração
  da Federal — quarta ou sábado, 19h de Brasília, com 24 h de folga,
  `proximaExtracaoFederal()` — num `UPDATE` condicional; push
  `sorteio_marcado`; a comissão de quem vendeu antes espera a data com a data
  provisória `SORTEIO_SEM_DATA` e passa a esperar a marcada, sem encurtar a
  carência; estorno que deixa a rifa não cheia **desmarca** a data e a
  comissão volta a esperar — encheu de novo, marca de novo e avisa de novo)
  e **a promotora completa** (sem mínimo; o número sorteado não
  vendido é dela e o prêmio fica com ela — sem aproximação). `npm run
  transparencia` prova os três.
- **A conferência roda no aparelho de quem olha** (`conferirSorteio()`, com
  WebCrypto): a mesma conta de `drawNumber()`. Mudou uma, mude a outra —
  `tests/sorteio.test.ts` compara as duas em 300 casos.
- **Transmissão muda a qualquer hora** (`PUT /campaigns/:id/transmissao`),
  só https (`transmissaoValida`), fora do `PATCH` genérico. Recorte de
  campanha: o do vizinho é 404 (`npm run isolation`).
- **A ajuda responde com a regra em vigor** (`perguntasDaAjuda()` recebe a
  taxa de reembolso configurada): pergunta nova vai para `shared/ajuda.ts`,
  com `id` único.

## Termos de uso e Privacidade — o que não pode afrouxar

- **Montados das regras, não escritos à parte** (`montarTermosDeUso()`,
  `montarPrivacidade()` em `shared/legal.ts`, como o regulamento e a ajuda):
  a regra de reembolso é `regraDoReembolso()` com a taxa em vigor (desligado o
  reembolso pela conta, o texto diz o art. 49 do CDC e manda à ajuda), e cada
  frase descreve o que o sistema já faz. **Regra nova que toque comprador,
  dado pessoal ou compartilhamento muda o texto no mesmo PR** — e sobe
  `VIGENCIA_DOS_TERMOS`. Termo que promete o que o sistema não faz é pior
  que termo nenhum.
- **Os dados da empresa são da plataforma** (`legal` no template:
  razão social, CNPJ com dígito conferido, endereço, e-mail e o encarregado
  de dados — `validarDadosDaEmpresa()`, só as chaves conhecidas; cartão
  "Dados da empresa" em Aparência, 403 para organizador como o resto do
  template) e entram no ar ao publicar. Decreto 7.962/2013, art. 2º; LGPD,
  art. 41, § 1º. **Faltando, a página diz que ainda não foram publicados —
  nunca inventa** — e Aparência lista o que falta (`faltaNaEmpresa()`).
- **Uma página, dois textos** (`client/src/pages/Legal.tsx`): `/termos` e
  `/privacidade`, coluna de leitura, data de vigência e o link de uma para a
  outra. Saem do rodapé (coluna Legal), do `/perfil` e de Criar conta ("Ao
  criar a conta, você declara ter 18 anos ou mais e concorda…").
- `tests/legal.test.ts` prova a régua dos dados, a regra de reembolso igual à
  da compra e o texto sem empresa cadastrada.

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
- **Story agendado** (`publica_em`, `publicacaoDoStory()` em
  `shared/vitrine.ts`): a organização escolhe a hora (até
  `STORY_AGENDA_MAX_DIAS`, 7, à frente; passado ou longe demais é 400) e as
  24 h contam **dali** (`expira_em = publica_em + 24 h`). **Nada público vê o
  agendado antes da hora**: toda leitura pública passa por `storyNoAr()`
  (já entrou e não venceu) — perfil, fileira, anel (`ultimoStorySql`, o mais
  novo por `publica_em`), imagem e pôster. Não há relógio: na hora ele
  simplesmente passa a valer. O painel vê o agendado (com `agendadoPara`) pela
  porta dele (`GET /admin/stories/:id/imagem|poster`, recorte por
  `donoDoStory` antes — o do vizinho é 404, no `npm run isolation`;
  `no-store`), porque a pública ainda dá 404. O agendado ocupa vaga do
  `STORIES_MAX` (no ar ou agendados).
- **Story em vídeo vai como veio, medido no servidor** (`postarStory` com
  `video`, `lerVideoDoStory()`; régua em `problemaNoVideoDoStory()` de
  `shared/vitrine.ts`): MP4 ou MOV (WebM não, porque não sabemos medir), até
  **30 s**, **15 MB** e **em pé** (proporção ≤ 0,85, a régua do reels). Duração
  e medidas saem do container (`probeVideoDuration`/`probeVideoDimensions`),
  nunca do que o navegador diz; sem medida, não entra. **Sem transcode** — isso
  é o Cloudflare Stream, que entra no mesmo lugar; o pôster sai em segundo
  plano (`gerarPosterDoStory()`, coluna `stories.poster`, rota
  `/stories/:id/poster` com a regra da imagem: vencido some). O arquivo
  fica no banco, como a imagem, e sai em `/stories/:id/imagem` **com `Range`
  (206)**: o Safari não toca vídeo sem ele. O visualizador deixa o vídeo
  mandar no tempo (barra pelo `timeupdate`, passa no `ended`), segurar pausa,
  o som tem botão (se o navegador barrar o som, toca mudo). O corpo de
  `POST /admin/stories` aceita 22 MB (base64 de 15 MB). `npm run vitrine`
  prova (45 s, deitado, pesado, não-vídeo, WebM, 206, 416).
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
  quatro cantos arredondados e **nunca passa de 85% da altura da tela**,
  em todos os formatos (`md:max-h-[85svh]`: a imagem corta ao centro, como o
  vertical — a publicação cabe inteira na janela, sem rolar para ver a
  foto) (`perfilSobreNaWeb` no `Carrossel`, só por classes `md:` — o celular
  não muda). O "1/8" desce para baixo do perfil.
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

## Sorteios oficiais — o que não pode afrouxar

Os concursos das loterias da Caixa que a **plataforma** põe no calendário
(`sorteios_oficiais`). A tela do sorteio no Início do celular transmite só
estes; as organizações integram as rifas neles. No tablet e no computador a
coluna ao vivo segue como estava.

- **Só a plataforma cadastra, muda, cancela e lança o resultado** (403 para
  organizador, no `npm run isolation`). O mesmo concurso da mesma loteria
  não entra duas vezes: quem decide é o índice `uq_sorteio_oficial_concurso`.
- **Integrar é escolher no calendário, e só no rascunho** (`PUT
  /campaigns/:id/sorteio-oficial`, `integrarAoSorteioOficial()`): a data da
  rifa vira a do concurso **no mesmo `UPDATE`**, condicional ao rascunho, com
  o sorteio travado (`FOR SHARE`) — a plataforma não muda a data no meio.
  Com menos de 24 h (`ANTECEDENCIA_PARA_INTEGRAR_MS`), cancelado ou com
  resultado, não entra; "quando completar" (sem data) também não. A rifa do
  vizinho é 404. `sorteioOficialId` está fora do `PATCH` genérico, e os
  dados legais recusam outra data enquanto a rifa estiver no sorteio.
- **As quatro loterias recebem rifa** (`LOTERIAS_QUE_RECEBEM_RIFA`): o
  número sai do resultado da loteria do sorteio (`entropiaDoSorteio()` em
  `shared/sorteio.ts`, a mesma no servidor e na conferência do aparelho). **A
  Federal segue a conta de sempre** ("p1-p2-p3-p4-p5", `draws.loteria`
  nulo): todo sorteio já feito continua conferindo. As outras levam o nome
  da loteria na frente das dezenas em ordem ("mega_sena:04-11-…"). O
  regulamento (`sorteioOficial` em `montarRegulamento()`) e a página do
  resultado (`loteriaDoSorteio()`) dizem a loteria e o concurso. Com rifa no
  sorteio, a loteria dele não muda (409).
- **O resultado lançado sorteia a rifa** (`sortearRifasDoSorteioOficial()`,
  na rota do resultado, depois de gravá-lo): cada rifa publicada integrada
  passa por `executarSorteio()` — o mesmo caminho do botão, com as regras da
  rifa (mínimo, reserva esperando Pix, aproximação, a promotora completa).
  A que não pode agora guarda o motivo (`campaigns.sorteio_auto_motivo`,
  "Ainda não sorteou" no calendário) e o relógio
  (`sortearRifasPendentesDosSorteiosOficiais`, trava 811016, a cada 5 min)
  tenta de novo; uma rifa que falha não segura as outras. **Na rifa
  integrada, o botão do painel usa o resultado oficial** e ignora o
  formulário (`resultadoParaARifa()`); sem resultado lançado, 409 — a
  promotora não digita a Caixa. A transação do sorteio trava o sorteio
  oficial (`FOR SHARE`) antes da linha de `draws`, e o `UPDATE` da rifa
  exige que ela siga naquele sorteio. Auditoria (`campaign.draw`) na mesma
  transação, com `sistema` como ator quando foi o automático. **Passada a
  hora do concurso, a rifa integrada não vende** (`createOrder`, 409 "As
  vendas fecharam"): o resultado é público, e reserva nova adiaria o
  sorteio automático sem fim (o ataque de bloqueio de estoque). Lançar o
  resultado nunca responde 500 depois de gravado: falha ao sortear as rifas
  vai ao log e o relógio cuida.
- **Trocar de sorteio depois de publicar é adiamento** (`pedirAdiamento()`
  com `sorteioOficialId`, campo "Sorteio oficial (opcional)" no Adiar): a
  data nova é a do concurso, nunca a do formulário, e o pedido guarda o
  sorteio (`campanha_solicitacoes.sorteio_oficial_novo_id`). A aprovação
  trava o sorteio pedido (`FOR SHARE`, antes da rifa) e confere de novo —
  cancelado, com resultado, a menos de 24 h ou com a data mudada desde o
  pedido é 409 — e põe a rifa nele na mesma transação de sempre do
  adiamento (comissão, reembolso integral, aviso). Pedir o mesmo sorteio em
  que já está é 422. Com pedido em análise para um sorteio, loteria e
  concurso dele não mudam (409) — a organização pediu aquele concurso.
- **A ordem das travas é sempre sorteio oficial → rifa**: integrar (sorteio
  `FOR SHARE`, depois o `UPDATE` da rifa), mudar o sorteio (`FOR UPDATE`,
  depois os rascunhos) e publicar (o sorteio que a rifa tinha `FOR SHARE`,
  depois a rifa `FOR UPDATE`, e o sorteio de agora tem de ser o mesmo; o
  `UPDATE` final exige `status = 'draft'`). Ordem trocada vira deadlock, e
  rifa sem trava na publicação deixava integrar no meio e mudar a data de
  um sorteio que já tinha rifa no ar. As condições também ficam no `UPDATE`:
  integrar exige o modo diferente de "quando completar"; os dados legais só
  gravam data ou modo se a rifa segue no mesmo sorteio que foi lido.
- **Publicar confere o sorteio** (`problemaDoSorteioOficial()`, com a linha
  travada na transação da publicação): cancelado, com resultado ou data
  diferente da do concurso não publica. Depois de publicada, a rifa não sai
  sozinha (409): **mudança só com a plataforma** — o adiamento aprovado tira
  a rifa do sorteio (ou a põe no sorteio oficial pedido) na mesma transação
  que muda a data.
- **Com rifa publicada no sorteio, loteria, concurso e data não mudam e ele
  não é cancelado** (409): quem comprou comprou aquela data. Só o título e a
  transmissão — que mudam até o resultado, mesmo depois da hora (a data só é
  conferida quando muda). Sem rifa publicada, a data nova leva junto as
  rifas em rascunho; cancelar as tira e as deixa sem data.
- **O resultado é o oficial da Caixa**, conferido pelo formato de cada
  loteria (`validarResultado()`: a Federal com os 5 prêmios de 5 algarismos,
  as outras com as dezenas na faixa, sem repetir), **só depois da hora** e
  **uma vez** (`UPDATE` condicional: dois cliques, um resultado e um 409).
  Fica guardado para sempre.
- **A tela pública** (`GET /api/public/sorteio-oficial`) traz o próximo
  sorteio (até 3 h depois da hora, o tempo da transmissão) ou, sem nenhum,
  o último com resultado; a fileira horizontal só leva rifa publicada que a
  vitrine mostraria (nada de rascunho, demonstração, travada ou promotora
  arquivada ou banida), com capa, prêmio e organização — o endereço da
  transmissão sai só como o vídeo conferido (`videoDaTransmissao`).
- **O calendário ocupa a largura da tela e cada dia de sorteio vem na cor
  da loteria** (`CORES_DA_CAIXA` em `shared/sorteiosOficiais.ts`: Federal,
  Mega-Sena, Quina, Lotofácil). É a **única exceção à paleta**: cor de
  identidade de terceiro (a da Caixa, que o apostador já reconhece), nunca
  estado, e sempre com o nome junto (no dia — a sigla no tablet, `sigla` em
  `LOTERIAS`, e o nome do `lg` em diante —, no rótulo do botão e na
  legenda). O número do dia vai em branco por cima — `tests/sorteiosOficiais.test.ts`
  exige ≥ 3:1. As cores saíram do padrão do site das Loterias Caixa (o site
  e o manual não abrem deste ambiente): confira contra o manual de
  identidade visual e troque só ali.
- **O selo vai na página da rifa** (`seloDoSorteioOficial()`: "Sorteio
  oficial · Federal 6012 · 02/12", com "Ver o sorteio" no celular).
- **Comentários do sorteio oficial** (`sorteio_comentarios`,
  `sorteio_comentario_curtidas`, `server/services/sorteioComentarios.ts`,
  rotas `/sorteio-oficial/:id/comentarios` e `/sorteio-oficial/comentarios/:id`
  em `server/routes/public.ts`), embaixo do vídeo na tela do celular, como no
  YouTube: **todo mundo lê; escreve só conta com apelido** (401 sem conta,
  409 sem apelido). **As regras dos comentários da rifa**: sem link e sem
  telefone (`problemaNoComentario()`), **emoji só de perfil verificado**
  (403), uma camada de resposta, curtida pela chave (comentário, pessoa) e o
  mesmo limite por pessoa (o balde `comentario:comprador:<id>` é o da rifa:
  comentar no sorteio não abre uma janela a mais). **Não há organização
  dona**: apaga quem escreveu e a plataforma (o organizador é 404, como o
  outro apostador), pelo `UPDATE` condicional — dois cliques, um desconto; o
  do topo leva as respostas. O contador (`sorteios_oficiais.comentarios_count`)
  anda na mesma transação, nunca `COUNT(*)`. Sorteio cancelado não tem
  comentários (404). Nome é o apelido (ou o primeiro nome e a inicial) e a
  foto do perfil — **nunca telefone nem CPF**. A plataforma modera pelo
  calendário (o botão "Comentários (N)" abre a mesma lista, com "Apagar" em
  todos). O componente da tela é o mesmo `Comentarios` da rifa, com
  `sorteioOficialId` (sem o presente, que é da rifa). `npm run
  sorteio-comentarios` prova.
- **Denúncia de comentário do sorteio oficial** (`sorteio_comentario_denuncias`,
  regras em `shared/sorteioDenuncias.ts`, serviço em
  `server/services/sorteioComentarios.ts`, `POST
  /sorteio-oficial/comentarios/:id/denuncia` e `/sorteios-oficiais/denuncias*`
  em `server/routes/admin.ts`): **quem entrou e não escreveu denuncia**
  ("Denunciar" ao lado de "Responder"; 401 sem conta, 409 o próprio, 404 o
  apagado ou de sorteio cancelado). O motivo é da lista; o erro de
  preenchimento sai antes do `hit` (`denuncia-sorteio:<id>`, 10 por dia).
  **Uma aberta por comentário e pessoa** pelo índice parcial
  `uq_sorteio_denuncia_aberta` — nunca um `SELECT` antes. O **trecho** (o
  comentário e, se for resposta, o de cima, só com apelido) é gravado na hora:
  quem escreveu pode apagar depois, a prova fica. **Só a plataforma vê e
  decide** (403 para organizador, no `npm run isolation`): a fila e a Caixa
  (tipo `comentario_sorteio`) não trazem texto; a leitura do trecho entra em
  `audit_log` **antes** de sair. Decidir é `UPDATE` condicional (`aberta`):
  dois cliques, uma decisão e um 409. **Procedente apaga o comentário** (o do
  topo leva as respostas), desce o contador e fecha as outras denúncias
  abertas do mesmo comentário, na mesma transação; exige explicação. **A
  trava é do comentário antes da denúncia** (e o apagar também trava o
  comentário antes das respostas): duas denúncias do mesmo comentário
  decididas juntas esperam no comentário e dão 200 e 409 — na ordem inversa
  eram deadlock e 500. A auditoria da decisão vai **dentro** da transação,
  depois do `UPDATE`: só registra o que aconteceu.
  Improcedente deixa o comentário no ar. Quem escreveu nunca sabe quem
  denunciou. `npm run sorteio-comentarios` prova.
- A tabela e as colunas (`campaigns.sorteio_oficial_id`,
  `sorteio_auto_motivo`, `sorteio_auto_em`, `draws.loteria`,
  `campanha_solicitacoes.sorteio_oficial_novo_id`,
  `sorteios_oficiais.comentarios_count`, `sorteio_comentarios`,
  `sorteio_comentario_curtidas` e `sorteio_comentario_denuncias`) sobem com o `db:push` **antes** do código. `npm run sorteios` prova tudo isso, e
  `npm run isolation` confere que o calendário de cada organização só traz
  as rifas dela.

## Selo "ao vivo" no story — o que não pode afrouxar

O anel do perfil (na fileira de stories da vitrine e na foto do perfil da
organização) ganha o selo **"AO VIVO"** quando há transmissão de sorteio no ar.

- **Só dado real, e a fonte é a própria rifa.** `transmissaoNoAr()`
  (`shared/aoVivo.ts`) acende quando a rifa tem **`transmissaoUrl` válida
  (https)**, a hora do sorteio (`drawAt`) já chegou, a janela de 3 h da
  transmissão (`DURACAO_DA_TRANSMISSAO_MS`, a mesma da coluna ao vivo) não
  fechou e o sorteio ainda não foi feito. Sem link, não acende: não há o que
  assistir. Nada de botão da organização para "ficar ao vivo" nem contador de
  espectadores — o selo só diz o que a rifa já declara.
- **A régua de vitrine vale**: rifa publicada, nem demonstração nem travada,
  promotora nem arquivada nem banida (`rifaDaVitrine`, a mesma da coluna ao
  vivo). `transmissoesNoAr()` é só a consulta; a regra é a função pura.
- **O perfil ao vivo entra na fileira mesmo sem story** (o selo é a razão) e
  vem na frente. Sem story, o anel leva direto à rifa; com story, abre os
  stories e o visualizador ganha o botão "Ao vivo agora: assistir ao
  sorteio". O endereço da transmissão **nunca** sai nessas rotas: só o
  `slug` da rifa e o prêmio.
- **Estado nunca só por cor**: o selo é texto ("Ao vivo") e o rótulo do botão
  diz "ao vivo agora". Sem vermelho (é erro) e sem amarelo.
- `npm run vitrine` prova (sem link, antes da hora, janela fechada, link não
  https, demonstração, travada, rascunho) e `tests/seloAoVivo.test.ts` cobre a regra.

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
- **O texto-base é da plataforma** (`montarTermo()`, cláusulas numeradas):
  parceria autônoma sem vínculo de emprego nem exclusividade, 18+, quem paga
  (inclusive a comissão guardada pela plataforma), quanto, quando, venda paga,
  autoindicação, **como divulgar** (identificar como publicidade; sem prometer
  ganho, sem omitir preço, data e autorização, sem menores, sem spam, sem Pix
  por fora), descumprimento, **dados pessoais** (só o primeiro nome, nada fora
  da plataforma), tributos e recibo, versões e saída. A organização só soma as
  regras dela. Mudar o texto-base **não reescreve** versão publicada (o aceite
  é prova daquele texto): `termoDoPainel()` compara o texto em vigor com o de
  hoje e o painel avisa (`desatualizado`), para a organização publicar a
  versão seguinte. `npm run afiliados` prova.
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
- **A quantidade é a da autorização** (`campaigns.bonus_max_cotas`,
  `problemaNoBonusMax()`): aceitar cota grátis exige dizer quantas (1 até o
  total da rifa), desmarcar zera, e as duas travam ao publicar (fora do
  `PATCH`; rifa marcada sem quantidade, ou com mais do que o total de agora,
  não publica). O resgate soma em `campaign_stats.bonus_count` com o teto
  **no próprio `UPDATE`**, na transação que debita o saldo e **depois da
  reserva** (a ordem da venda: cota, depois contadores — na inversa, resgate
  e venda se travavam), e **o saldo sai por último**, depois dos contadores
  (a ordem do estorno: cota e contadores, depois a pessoa — na inversa, o
  resgate e o estorno de um pedido da mesma pessoa se travavam): três resgates na última cota grátis dão um 201 e dois
  409, e o saldo de quem perdeu não sai. Rifa publicada antes desta regra
  (quantidade 0) segue a cláusula e o resgate de antes, sem teto. Resgate que vence sem
  confirmar (o sorteio veio no meio) devolve o saldo e o teto
  (`resgate-vencido:<pedido>` no livro, em `releaseExpired`).
- **Cota grátis não conta para o mínimo de vendidas**
  (`vendidasParaOMinimo()`: `sold_count − bonus_count`) — senão a promotora
  inflaria a venda dando cota. **Na rifa cheia conta** (`cheia_com_data` e
  `quando_completar`), porque o número já tem dono e sem ela a rifa cheia
  com bônus nunca sortearia. A cláusula diz a
  quantidade, como se ganha, que concorre igual (inclusive às premiadas), que
  fecha 2 horas antes e que não vira dinheiro, reembolso nem transferência.
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
- **O estorno desfaz a meta que deixou de ser cumprida** — "rifas
  compradas" de quem comprou e "indicações" de quem indicou
  (`desfazerMetasNoEstorno()`, na transação do estorno). **Quem comprou e
  quem indicou são travados juntos, na ordem do id**
  (`travarPessoasDoEstorno()`), antes de mexer em qualquer saldo — dois
  estornos cruzados (A indicou B, B indicou A) se esperariam para sempre. E
  `avaliarMetas` relê o progresso **com a pessoa travada** antes de pagar:
  lido antes, um estorno no meio faria a meta desfeita pagar outra volta.
  Vale também para meta desativada (o bônus veio da compra estornada). Só tira se o progresso caiu abaixo do
  alvo e a meta foi paga mais vezes do que desfeita; alcançar de novo paga
  de novo, numa volta nova da chave (`meta:<id>:<pessoa>:<n>`, e
  `estorno-meta:<id>:<pessoa>:<n>`). Visitas e seguir não voltam atrás —
  não há dinheiro a desfazer.
- **O código do link não é o ID do cliente**: o ID prova identidade no
  reembolso e não sai em link público.
- **Visita conta uma vez por aparelho** (hash, índice único) e no máximo
  `VISITAS_POR_DIA` por pessoa, contada sob trava (811301).
- **O resgate é venda pelo caminho de sempre**: pedido de R$ 0,00
  (`method = 'bonus'`), `reserveRandom` e `settleOrderAsPaid` — sem
  comissão e sem taxa, porque não entrou dinheiro. O saldo sai num `UPDATE`
  condicional na mesma transação que reserva: sem cota livre, nada sai.
  Fecha 2 horas antes do sorteio. **Cota de bônus não tem reembolso.**
- **Seguir também é meta** ("Siga N organizações", `organizacoes_seguidas`):
  conta o que a pessoa segue **hoje**, só para **conta com senha** (o CPF
  único entre contas é o que segura a fazenda de contas) e só organização
  nem arquivada nem banida (`progressoDe()`). O aviso sai do próprio seguir
  (`seguir()`, fora da transação, `emSegundoPlano`, só quando o seguir
  entrou) e a chave da meta (`meta:<id>:<pessoa>`) garante um crédito só:
  seguir, largar e seguir de novo não paga outra vez, e **largar depois não
  tira o bônus** (diferente da indicação, aqui não há dinheiro de volta a
  desfazer). Como toda cota grátis, só vale com o programa ligado.
- **O item "Bônus" do menu do perfil** (`/perfil`) só aparece para conta
  quando o programa está ligado, e leva à aba Bônus de Minhas compras
  (`?aba=bonus`), com o saldo no detalhe.
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
  **Só cobra com o comprovante da exibição** (`ticketDoClique.ts`): a lista
  `/patrocinadas` assina, para o aparelho que pediu, cada anúncio que mostrou
  (HMAC de anúncio + aparelho + hora), e o clique vale de 1 s a 30 min
  depois — id inventado, comprovante de outro aparelho ou clique na hora vão
  para barrados. E **no máximo `CLIQUES_POR_IP` (3) por IP** por anúncio em
  24 h (`patrocinio_cliques.ip_hash`, que sobe com o `db:push` **antes** do
  código — sem a coluna o `INSERT` do clique falha), contado sob a trava do
  par anúncio + IP (811405, depois da do aparelho): sem ela, dez cliques do
  mesmo IP com aparelhos diferentes contavam juntos e cobravam nove. Sem IP,
  não cobra. O teto erra para o lado do patrocinador. **A leitura da lista
  leva o aparelho**: `getQueryFn` manda o `x-device-id` como o `apiRequest`
  (`tests/aparelhoNaLeitura.test.ts`) — sem ele o comprovante saía nulo e
  nenhum clique de verdade era cobrado.
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

## Login com Google — o que não pode afrouxar

O Google prova **nome e e-mail confirmado** — nada mais. Por isso a conta
que nasce dele é incompleta, e o e-mail dele **nunca liga sozinho** a uma
conta que já existe.

- **Sem as chaves, sem botão** (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`;
  `GET /conta/google/disponivel`). Sem interruptor no painel: quem liga é a
  configuração. `GOOGLE_PROVA=1` (só fora de produção) troca o Google por
  claims entregues a `/api/dev/google` — é o que `npm run google` usa, e o
  servidor da prova sobe com ele.
- **Código de autorização com PKCE, state e nonce** guardados na sessão
  (`req.session.google`, 10 min). `state` errado, vencido ou repetido é
  recusado; o id_token é conferido na assinatura (RS256, chaves do Google)
  e em emissor, cliente, validade, nonce e `email_verified`
  (`claimsDoToken()`). Nada de biblioteca nova.
- **A volta é caminho do próprio site** (`caminhoDeVolta()`): `//outro.com`,
  `https://…` e quebra de linha viram `/perfil` — senão o login seria um
  redirecionador aberto.
- **E-mail do Google em conta com senha: recusa** (409 → "entre com a senha
  e ligue o Google em Minha conta"). O e-mail das contas não é confirmado:
  ligar por ele deixaria quem cadastrou o e-mail de outra pessoa tomar a
  conta dela. Ligar é **de dentro da conta** (`/conta/google/ligar`, a
  sessão que pediu é a que volta), e o mesmo Google não vale em duas contas
  (`uq_buyers_google_sub`, o índice decide).
- **A conta nasce incompleta, e só se completa por provas.** O telefone é
  um marcador (`pendente:<id>`, como `removido:<id>`; `phone` é chave única
  e obrigatória), nunca um número: `notify()` recusa qualquer telefone com
  letra, e a tela não o mostra. A senha é a marca `!google`, que não é hash
  válido — nenhuma senha confere, mas a conta continua sendo "conta" (CPF e
  e-mail únicos, comentar, bônus).
- **O portão da compra é do servidor.** `createOrder` e o carrinho recusam
  (409 "Complete sua conta…") conta sem CPF ou com telefone provisório —
  antes de qualquer gravação. A tela só avisa (`pendenciasDaConta()`, o
  ponto no perfil e o cartão "Complete sua conta").
- **CPF entra uma vez** (`POST /conta/cpf`: só com o campo vazio, `UPDATE`
  condicional; repetido entre contas é 409 pelo índice). **Telefone entra
  pelo código do WhatsApp neste número** (`/conta/telefone/codigo` e
  `/confirmar`, o mesmo antifraude e a mesma sessão de código do "Minhas
  cotas"); número que já é de outro cadastro é recusado antes de enviar, e
  provar o número derruba as outras sessões da conta.
- **Excluir pede a palavra EXCLUIR** (não há senha) e apaga também o
  vínculo com o Google; o mesmo Google depois começa conta nova. Conta só
  do Google não desliga o Google (ficaria sem acesso).
- Limite por aparelho nas voltas (`hit`, 20 em 10 min): o retorno cria
  conta. `npm run google` prova tudo isso contra a API de verdade.

## Banner pago na vitrine — o que não pode afrouxar

A organização compra **dias de topo** para uma rifa dela: o banner entra no
carrossel de cima da vitrine, ao lado dos da plataforma, e leva à rifa. Preço
do dia, mínimo e máximo de dias, vagas e segundos na tela são da plataforma
(Banner na vitrine, `PUT /admin/banner-pago/config`, 403 para organizador).

- **Nasce desligado** (`bannerPago.ligado`). Desligado, a organização recebe
  404 em toda rota do produto e a vitrine não mostra banner pago; a
  plataforma vê a tela para poder ligar. Quem compra é a **organização**, com
  o saldo dela: a plataforma não compra pelo organizador (403).
- **O saldo anda pelo livro, na mesma transação do pedido** (`lancar()` de
  `services/patrocinio.ts`, chave única): pedido (`banner:<id>`), devolução da
  recusa ou do cancelamento (`banner-devolucao:<id>`) e dias não usados
  (`banner-sobra:<id>`) lançam **uma vez só**, e o saldo nunca fica negativo —
  sem saldo, o pedido também não fica. O preço do dia é fotografado no
  pedido (`preco_dia_cents`): mudar a tabela não mexe no que já foi pago.
- **Uma rifa, um pedido em aberto** (`uq_banner_pedido_aberto_por_rifa`,
  índice parcial em `em_analise`/`aprovado`/`no_ar`): quem decide é o índice,
  nunca um `SELECT` antes; a violação derruba a transação inteira, débito
  junto. Dois pedidos ao mesmo tempo, um 201 e um 409.
- **A plataforma aprova a arte antes de ir ao ar** (Caixa de entrada, tipo
  "Banner pago"): propaganda enganosa no topo da vitrine é golpe com a
  vitrine inteira de testemunha. Decidir é `UPDATE` condicional
  (`em_analise`, com o pedido travado): dois cliques, uma decisão e um 409.
  Recusa exige motivo (a organização o lê) e devolve tudo. A organização só
  cancela enquanto está em análise; depois de aprovado, não há cancelamento.
- **O relógio de dias só começa quando o banner pega a vaga**
  (`promoverBannersPagos()`: trava de transação 811104, conta e promove
  juntos, `FOR UPDATE SKIP LOCKED`, do aprovado mais antigo). Aprovado com
  vaga livre entra na hora; sem vaga, espera na fila (calculada, nunca
  guardada). Os banners da plataforma não ocupam vaga paga.
- **A janela vale mesmo antes do relógio**: a vitrine só mostra `no_ar` com
  `inicio ≤ agora < fim`, rifa publicada e não travada, organização nem
  arquivada nem banida; a arte pública (`/banners-pagos/:id/imagem`) segue
  a mesma regra. O relógio (`encerrarBannersPagos`, trava 811404) encerra o
  vencido (sem devolver) e o que perdeu a rifa ou a promotora: **devolve os
  dias não usados** (`sobraDoBanner()`: o dia que começou conta inteiro, o
  gasto arredonda para baixo, gasto + sobra = valor pago, nunca mais que
  isso) e depois preenche as vagas. Pedido em análise ou aprovado que nem
  chegou a aparecer volta inteiro.
- **Propaganda se identifica**: o cartão leva "Patrocinado" em texto, no
  canto. A arte é reprocessada (WebP 1200×600) e fica no banco; o título é o
  texto alternativo.
- **Rifa com banner pago não se apaga** (422, FK `restrict` e checagem em
  `excluirRifa`): dinheiro envolvido.
- **Recorte**: o pedido, a arte e o cancelamento do vizinho são 404; decidir
  e configurar são da plataforma (403, no `npm run isolation`); a
  organização vê o saldo e os pedidos dela, sem o nome das outras.
- `npm run banner` prova tudo isso contra a API de verdade e devolve o
  estado de antes. A tabela nova (`banner_pedidos`) sobe com o `db:push`
  **antes** do código.

## Assistente de IA (Chatbase) — o que não pode afrouxar

Um assistente numa **coluna à direita** dos painéis do **administrador master**
(gratuito), do **organizador** e do **afiliado** (pagos, cada um no próprio
login). Cambista e apostador não têm.

- **A conversa passa pelo nosso servidor.** O navegador fala só com
  `/api/ia/*`; o servidor fala com a API v2 do Chatbase
  (`server/services/chatbase.ts`) com `CHATBASE_API_KEY`, que **nunca sai dele**
  (nem em resposta, nem em log, nem na URL). **Nenhum script do Chatbase roda no
  painel** — o widget da primeira versão saiu justamente por isso (código de
  terceiro com a sessão do master). `CHATBASE_API_URL` troca o endereço **só
  fora de produção** (`baseDoChatbase()`), para a prova.
- **Nasce desligado**, e só a plataforma configura (`PUT /admin/ia/config`, 403
  para organizador, no `npm run isolation`): liga, o id do agente, os
  interruptores `paraOrganizador` e `paraAfiliado`, **também desligados**, e os
  preços (`cobranca`). Organizador e afiliado pagam: **sem preço e franquia,
  não se liberam** (400). Sem a chave no servidor a plataforma não liga (409).
  Configuração guardada que não passe mais na régua perde só a liberação
  (`configIAGuardada()`) — nunca derruba a configuração inteira da plataforma.
- **Quem fala e quem responde pelo uso saem da sessão**, nunca do corpo:
  `titularDaIA()` — plataforma (master), a organização do organizador ou o
  cadastro do afiliado (**ativo**, a mesma porta das Mensagens). Quem não tem
  direito recebe `{ ligado: false }` na sessão e 404 nas outras rotas (para ele
  o assistente não existe); cambista, 403; sem login, 401. `no-store` em tudo.
- **Dado pessoal de cliente nunca sai para a IA**: `problemaNaMensagemDaIA()`
  barra **antes** de qualquer coisa sair (422) o e-mail, o CPF (3+3+3+2, com ou
  sem separador), o telefone com DDD (com ou sem +55), o celular sem DDD com
  separador (`9XXXX-XXXX`) e 10 dígitos seguidos. O texto é normalizado antes
  (`normalizarParaChecar()`: largura cheia, caractere invisível e traço Unicode
  — o disfarce de quem cola do Word). Passam data, hora, o código do pedido (8)
  e do carrinho (9), o ID do cliente e números de cota; o fixo sem DDD
  (`XXXX-XXXX`) passa de propósito, porque confunde com faixa de cotas. O
  identificador que vai ao Chatbase é opaco (`rifa-u-<id>`).
- **O uso é contado por mensagem**, pelo que o Chatbase diz ter gasto
  (`usage.credits`), **em milésimos exatos** (`milicreditos`; nada se arredonda
  aqui — quem arredonda é a cobrança, sobre a soma). Sem o campo, a linha fica
  com `null` ("sem medida") e o log avisa: zero seria uso de graça sem ninguém
  saber. Uma linha em `ia_uso` por resposta, **chave única pela mensagem**
  (`ON CONFLICT DO NOTHING`), com o titular, na mesma transação que guarda a
  conversa. Erro do Chatbase (créditos da plataforma esgotados, chave recusada,
  prazo de 60 s) volta em português e **não grava uso**. É daqui que a
  cobrança vai debitar.
- **A conversa guardada** (`ia_conversas`: só o id e o agente; o texto mora no
  Chatbase e o histórico é lido pela API) **nunca trava o assistente**: a de
  outro agente (trocado em Aparência) é esquecida; a que o Chatbase não conhece
  mais (404) é esquecida e a mensagem recomeça sozinha, uma vez. Gravar o id é
  **condicional ao que foi lido** antes de falar com o Chatbase (`UPDATE … WHERE
  conversation_id = <lido>`, ou `INSERT … ON CONFLICT DO NOTHING`): outra aba ou
  "Nova conversa" no meio do caminho decidem pela linha, não pelo último a
  gravar.
- **Limite por pessoa** (`hit`): 20 mensagens e 30 leituras do histórico em 5
  min (cada leitura é uma chamada ao Chatbase com a chave da plataforma),
  contado **depois** do erro de preenchimento, como no comentário.
- **A coluna**: no computador fica à direita e o conteúdo abre espaço
  (`lg:pr-[380px]`); no celular e no tablet, por cima da tela, **como diálogo**
  (`role="dialog"`, `aria-modal`, o Tab não sai). Aberta ou fechada fica no
  aparelho (`rifa.assistente.aberto`), então segue aberta ao trocar de tela do
  painel. Abrir leva o foco para dentro (o campo no computador; a coluna no
  celular, para não abrir o teclado sozinho) e fechar o devolve ao botão. **Esc
  só fecha com o foco dentro da coluna** e fora do campo — não fecha junto com
  a janela, o sino ou o Atendimento. A mensagem que falhou volta ao campo sem
  apagar o que já foi digitado. O texto da resposta é texto puro
  (`whitespace-pre-wrap`), nunca HTML. **Login e logout tiram a conversa do
  cache** (`esquecerAssistente()` em `client/src/lib/session.ts`; o logout fecha
  a coluna): quem entra em seguida na mesma aba não vê a conversa de quem saiu.
  Com erro na leitura, nada da conversa aparece e "Nova conversa" fica
  disponível.
- **O que a IA faz no sistema** são as ações da seção "Ações do assistente"
  (abaixo): recorte de `orgOf`, confirmação da pessoa para o que grava e
  `audit_log` como feita pela IA. O saldo do patrocínio não paga a IA.
- As tabelas `ia_conversas` e `ia_uso` sobem com o `db:push` **antes** do código.
- `npm run ia` prova (com `CHATBASE_API_KEY` e `CHATBASE_API_URL` apontando para
  o Chatbase de mentira que a própria prova sobe, no servidor e no script),
  inclusive entre duas organizações, o agente trocado e a conversa apagada no
  Chatbase; `npm run isolation` confere visitante (401), cambista (403) e o
  organizador sem o assistente (404) em cada rota `/api/ia/*`;
  `tests/ia.test.ts`, `tests/chatbase.test.ts` e `tests/assistente.test.ts`
  cobrem as regras, o cliente da API e a coluna.

## Cobrança do assistente — o que não pode afrouxar

O organizador (pela organização) e o afiliado (no próprio login) pagam o
assistente; o master não. **Assinatura mensal com franquia de créditos** e
**pacotes avulsos**, por **Pix da plataforma, sem split** (como a recarga do
patrocínio). Regras puras em `shared/iaCobranca.ts`; o resto em
`server/services/iaCobranca.ts`.

- **O preço é da tabela, nunca do corpo.** `POST /api/ia/pagamentos` recebe o
  tipo (`assinatura` ou `avulso`), o índice do pacote e, se o provedor pedir, o
  CPF/CNPJ do pagador (vai só para o Pix, não fica guardado; a organização usa
  o CNPJ cadastrado). Valor e créditos são **fotografados** no pagamento
  (`ia_pagamentos`): mudar a tabela não mexe no que já foi cobrado. O mesmo Pix
  em aberto é devolvido em vez de gerar outro — procurar e criar a linha
  acontecem **sob a trava do titular** (`pg_advisory_xact_lock`), então dois
  cliques ou dois organizadores ao mesmo tempo geram uma cobrança só; o
  provedor que recusa o Pix leva a linha junto (não fica "esperando o Pix"
  vazio). Limite de 10 Pix por hora por pessoa (`hit`). O código fica numa faixa própria (`IA_CODIGO_MIN`, 10
  dígitos), fora do pedido, do carrinho e da recarga.
- **O pacote só com a assinatura ativa** (409): crédito que não pode ser usado
  seria dinheiro preso. O preço por crédito **nunca sobe** no pacote maior
  (`validarConfigCobrancaIA`).
- **Sem assinatura ativa ou sem saldo, 402 antes de qualquer coisa sair para o
  Chatbase** (`exigirSaldo`, depois do erro de preenchimento e antes do `hit`).
  A coluna troca a conversa pelo plano.
- **A conta anda pelo livro** (`ia_lancamentos`, chave única) **e a conta junto**
  (`ia_contas`, uma linha por titular criada com `ON CONFLICT DO NOTHING` e
  travada com `FOR UPDATE`), na mesma transação: pagamento (`pagamento:<id>`),
  cada mensagem (`uso:<mensagem>`) e o vencimento (`vencimento:…:<ciclo>`)
  lançam **uma vez só**. O Pix pago é `UPDATE` condicional (`pendente` →
  `paga`): o webhook repetido não credita de novo.
- **Débito na transação que grava o uso**, pelo que o Chatbase informou em
  milésimos: **primeiro a franquia, depois o avulso** (`debitar()`). O custo só
  é sabido depois da resposta, então **o avulso pode ficar negativo por uma
  mensagem** — é dívida, a próxima é recusada e o pacote seguinte paga primeiro
  a dívida. Uso sem medida (`null`) não debita (o log já avisou); custo acima
  de um milhão de créditos numa resposta é defeito e fica sem medida. A dívida
  de mensagens em paralelo é limitada também **por quem paga** (`hit`
  `ia-pagante:…`, 40 em 5 min), não só por pessoa. Os saldos são `bigint`
  (renovação e pacote somam sem teto).
- **O ciclo é de 30 dias** (`DIAS_DO_CICLO`). Renovar com o ciclo em curso
  **estende** por mais 30 dias e **soma** a franquia (quem renova antes não
  perde o que pagou); com o ciclo vencido, começa do zero. A franquia que sobrou
  **vence pelo livro** (relógio `vencerFranquias`, trava 811701, e também na
  hora de debitar ou creditar); o avulso não vence.
- **Cada titular tem a própria conta**, tirada da sessão: a organização
  (qualquer organizador dela) ou o cadastro do afiliado. Nada vem de id na URL.
- **O webhook olha o assistente antes da recarga e do pedido**
  (`confirmarPagamentoIA`). **Pix do assistente estornado no provedor tira os
  créditos que deu** (`estornarPagamentoIA`): `UPDATE` condicional `paga` →
  `estornada` e o débito `estorno:<id>` no livro (franquia primeiro, o que já
  foi gasto vira dívida no avulso), com a conta travada; o estorno de pedido
  segue pelo caminho de sempre quando a cobrança não é do assistente. A configuração
  guardada que não passe mais na régua perde as liberações (e, se for a
  cobrança, os preços), mantém o assistente do master e avisa no log.
- **Ajuste de crédito é só da plataforma** (`POST /admin/ia/ajustes`,
  `ajustarCreditosIA()`; 403 para organizador e afiliado, no `npm run
  isolation`): cortesia (para mais) ou correção (para menos), **sempre no
  avulso** (não vence; a franquia é o que a assinatura comprou), com **motivo
  obrigatório** (`validarAjusteIA()`). A conta é escolhida pelo identificador
  público (endereço da organização ou código do afiliado), nunca pelo id cru.
  A correção **nunca deixa o avulso negativo** (`problemaNoAjuste()`, 409):
  dívida só nasce do uso. Livro (`ajuste:<id da tela>`, chave única), conta
  travada e `audit_log` (`ia.ajuste`, com motivo e autor) na **mesma
  transação**; a tela gera a identificação a cada mudança no formulário,
  então dois cliques (ou reenviar depois de a rede cair) são um lançamento só
  (o segundo responde 200 "repetido"), e a mesma identificação com outro
  valor ou em outra conta é engano, não repetição (409).
- **O relatório é da plataforma** (`GET /admin/ia/relatorio`,
  `relatorioDaIA()`, 7/30/90 dias, `no-store`): por quem paga, mensagens,
  créditos usados, receita dos Pix pagos e o saldo de agora; o uso do master
  aparece à parte, como custo. **Sem dado de pessoa**: o nome público da
  organização ou o código do afiliado — nunca e-mail, telefone ou nome de
  quem conversou. O extrato de uma conta (`GET /admin/ia/lancamentos`) traz
  os 50 lançamentos mais novos. A lista mostra as 200 contas de mais receita
  e uso e **diz quando cortou** (`cortada`, pela linha a mais — relatório que
  omite linha calado não serve); os totais contam todas, numa passada por
  tabela pelos índices de data (`idx_ia_uso_data`, `idx_ia_pagamentos_paga_em`,
  que sobem com o `db:push`). O estornado é o dos Pix pagos no período que
  depois voltaram. A tela é o cartão "Uso e receita do assistente" em
  Aparência (`UsoDoAssistenteCard.tsx`).
- As tabelas `ia_contas`, `ia_pagamentos` e `ia_lancamentos` sobem com o
  `db:push` **antes** do código.
- `npm run ia` prova tudo isso contra a API de verdade (o Pix pago pelo atalho
  de desenvolvimento `/api/dev/ia-pagamento/:codigo`, a mesma confirmação do
  webhook), inclusive o relatório por conta e o ajuste enviado duas vezes ao
  mesmo tempo; `npm run isolation` confere `/api/ia/conta`,
  `/api/ia/pagamentos` e as três rotas da plataforma;
  `tests/iaCobranca.test.ts` cobre as regras.

## Ações do assistente — o que não pode afrouxar

O assistente faz coisas no painel pelas "client actions" da API v2 do
Chatbase: a resposta traz partes `tool-call` (nome e entrada), o nosso
servidor executa e devolve o resultado (`tool-result`), e o agente continua.
O catálogo mora em `shared/iaAcoes.ts` (`ACOES_DA_IA`) e cada ação é
cadastrada no Chatbase (tipo "Client") com o mesmo nome — a lista está em
Aparência → Assistente de IA.

- **A entrada vem da IA, e a IA lê o que qualquer um escreve**: é dado,
  nunca instrução. `validarEntrada()` trata como corpo de requisição (só as
  chaves conhecidas, no formato); ação desconhecida, de outro papel ou com
  entrada errada volta como erro para o agente, sem executar.
- **O recorte é o da sessão** (`orgOf(req)`; o afiliado só pelo cadastro
  dele): a rifa, o pedido e o chamado do vizinho "não existem". O afiliado só
  consulta (`minhas_comissoes`); nenhuma ação que grava é dele.
- **Ler é na hora; gravar só com confirmação.** Publicar, trocar a legenda,
  apagar a rifa e estornar (o chamado já aprovado, pelo protocolo) viram uma
  linha `pendente` em `ia_acoes`; a coluna mostra o **resumo montado pelo
  servidor** com os dados de verdade (`prepararGravacao()`), nunca o texto da
  IA, e nada muda até o Confirmar. O que já se sabe que vai falhar (rifa do
  vizinho, publicação sem banner ou autorização, legenda com telefone, chamado
  não aprovado) falha antes de pedir confirmação.
- **Confirmar é `UPDATE` condicional** (`pendente` → `executando`, dentro de
  `ACAO_PENDENTE_MIN`): dois cliques, uma execução e um 409. Só quem conversava
  decide (a de outra pessoa é 404), e a execução usa a **sessão de quem
  confirmou** — o alvo passa de novo pelo recorte.
- **Gravar passa pelos mesmos serviços das rotas** (`publishCampaign`,
  `salvarLegenda`, `excluirRifa`, `executarEstorno`): não existe segundo
  caminho com regra diferente. E entra em `audit_log` com a mesma ação da rota
  e `viaIA: true` (e o id da ação). Estornar continua sendo só o do chamado
  aprovado — a IA não abre botão solto de estorno.
- **A pendente vence**: escrever outra mensagem, "Nova conversa", trocar o
  agente ou passar do prazo. O agente recebe o resultado "não confirmado" e
  ninguém confirma depois (409).
- **Uma confirmação de cada vez**: duas gravações na mesma resposta, a segunda
  é recusada. E as rodadas de ação por mensagem têm teto
  (`RODADAS_DE_ACAO_MAX`): cada uma é outra chamada paga ao Chatbase.
- **Nada de dado pessoal no resultado**: o resultado é montado sem nome,
  telefone e CPF de comprador, e cada texto dele ainda passa pela barreira da
  mensagem (`resultadoSemDadoPessoal()`); o que parecer dado pessoal é retido.
- **Cada resposta do Chatbase é uso e débito**, inclusive a que segue uma
  ação (`gravarResposta()`); confirmar exige saldo e conta no limite como uma
  mensagem.
- A tabela `ia_acoes` sobe com o `db:push` **antes** do código.
- `npm run ia-acoes` prova tudo isso contra a API de verdade (com o Chatbase de
  mentira que pede ações); `npm run isolation` confere visitante, cambista e
  organizador sem o assistente nas rotas de confirmar e recusar;
  `tests/iaAcoes.test.ts` cobre as regras.

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

