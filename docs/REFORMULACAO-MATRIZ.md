# Matriz de cobertura da reformulação (fase 0)

Gerada do código por `npm run matriz` — **não edite à mão** (o teste `tests/matrizReformulacao.test.ts` falha se ficar velha). O destino de cada tela, seção e cartão mora em `docs/reformulacao-destinos.json`, que a fase 2 (onde mora cada coisa) preenche; enquanto estiver como `a decidir`, a unidade ainda não tem lugar novo.

| O que | Quantos |
|---|---|
| Telas (rotas do `App.tsx`) | 66 (+ 2 redirecionamentos) |
| Seções de acesso (`shared/access.ts`) | 41 |
| Cartões (componentes usados pelas telas) | 715 |
| Rotas da API | 477, das quais 446 citadas por alguma prova |
| Provas contra a API (`npm run …`) | 59 |
| Testes de regra (`tests/`) | 127 arquivos |
| Destinos decididos | 0 de 822 |

## 1. Telas

| Rota | Papel | Seção | Rótulo no menu | Grupo (organizador) | Grupo (plataforma) | Arquivo | Componente | Destino |
|---|---|---|---|---|---|---|---|---|
| `/` | guest | vitrine | Rifas | — | — | `pages/Vitrine.tsx` | Vitrine | a decidir |
| `/admin` | organizer | adminPainel | Painel | (sem título) | Painel | `pages/admin.tsx` | AdminPainel | a decidir |
| `/admin/afiliados` | organizer | adminAfiliados | Afiliados | Equipe e marketing | Painel | `pages/admin.tsx` | AdminAfiliados | a decidir |
| `/admin/antifraude` | admin | adminAntifraude | Antifraude | — | (sem título) | `pages/adminAntifraude.tsx` | AdminAntifraude | a decidir |
| `/admin/aparencia` | admin | adminAparencia | Aparência | — | Painel | `pages/adminAparencia.tsx` | AdminAparencia | a decidir |
| `/admin/atendimento` | organizer | adminAtendimento | Atendimento | (sem título) | (sem título) | `pages/adminAtendimento.tsx` | AdminAtendimento | a decidir |
| `/admin/bonus` | admin | adminBonus | Bônus | — | Painel | `pages/adminBonus.tsx` | AdminBonus | a decidir |
| `/admin/caixa` | admin | adminCaixa | Tudo | — | (sem título) | `pages/adminCaixa.tsx` | AdminCaixa | a decidir |
| `/admin/cambistas` | organizer | adminCambistas | Cambistas | Equipe e marketing | Painel | `pages/adminCambistas.tsx` | AdminCambistas | a decidir |
| `/admin/campanhas` | organizer | adminCampanhas | Campanhas | Rifas | Painel | `pages/admin.tsx` | AdminCampanhas | a decidir |
| `/admin/cobranca` | organizer | adminCobranca | Cobrança | Vendas | Painel | `pages/adminCobranca.tsx` | AdminCobranca | a decidir |
| `/admin/configuracoes` | organizer | adminConfiguracoes | Configurações | Equipe e marketing | Painel | `pages/admin.tsx` | AdminConfiguracoes | a decidir |
| `/admin/exportacoes` | organizer | adminExportacoes | Exportações | Vendas | Painel | `pages/adminExportacoes.tsx` | AdminExportacoes | a decidir |
| `/admin/financeiro` | organizer | adminFinanceiro | Financeiro | Vendas | Painel | `pages/admin.tsx` | AdminFinanceiro | a decidir |
| `/admin/fiscal` | admin | adminFiscal | Cadastros fiscais | — | Painel | `pages/adminFiscal.tsx` | AdminFiscal | a decidir |
| `/admin/marketing` | organizer | adminMarketing | Medição e campanhas | Equipe e marketing | Painel | `pages/adminMarketing.tsx` | AdminMarketing | a decidir |
| `/admin/marketing/ia` | organizer | adminMarketingIA | Marketing AI | Equipe e marketing | Painel | `pages/adminMarketingIA.tsx` | AdminMarketingIA | a decidir |
| `/admin/marketing/publicidade` | organizer | adminPublicidade | Publicidade | Equipe e marketing | Painel | `pages/adminPublicidade.tsx` | AdminPublicidade | a decidir |
| `/admin/marketing/trafego` | organizer | adminTrafego | Tráfego pago | Equipe e marketing | Painel | `pages/adminTrafego.tsx` | AdminTrafego | a decidir |
| `/admin/organizacoes` | admin | adminOrganizacoes | Organizações | — | Painel | `pages/adminOrganizacoes.tsx` | AdminOrganizacoes | a decidir |
| `/admin/pedidos` | organizer | adminPedidos | Pedidos | Vendas | Painel | `pages/admin.tsx` | AdminPedidos | a decidir |
| `/admin/resultados` | organizer | adminResultados | Resultados | Rifas | Painel | `pages/adminResultados.tsx` | AdminResultados | a decidir |
| `/admin/sorteios` | organizer | adminSorteios | Sorteios | Rifas | Painel | `pages/admin.tsx` | AdminSorteios | a decidir |
| `/admin/sorteios-oficiais` | organizer | adminSorteiosOficiais | Sorteios oficiais | Rifas | Painel | `pages/adminSorteiosOficiais.tsx` | AdminSorteiosOficiais | a decidir |
| `/admin/stories` | organizer | adminStories | Stories | Rifas | Painel | `pages/adminStories.tsx` | AdminStories | a decidir |
| `/admin/usuarios` | organizer | adminUsuarios | Usuários | Equipe e marketing | Painel | `pages/adminUsuarios.tsx` | AdminUsuarios | a decidir |
| `/afiliado` | affiliate | afiliadoPainel | Visão geral | — | — | `pages/afiliado.tsx` | AfiliadoPainel | a decidir |
| `/afiliado/comissoes` | affiliate | afiliadoComissoes | Comissões | — | — | `pages/afiliado.tsx` | AfiliadoComissoes | a decidir |
| `/afiliado/dados` | affiliate | afiliadoDados | Meus dados | — | — | `pages/afiliadoDados.tsx` | AfiliadoDados | a decidir |
| `/afiliado/divulgar` | affiliate | afiliadoDivulgar | Divulgar | — | — | `pages/afiliadoDivulgar.tsx` | AfiliadoDivulgar | a decidir |
| `/afiliado/links` | affiliate | afiliadoLinks | Meus links | — | — | `pages/afiliado.tsx` | AfiliadoLinks | a decidir |
| `/afiliado/organizacoes` | affiliate | afiliadoOrganizacoes | Organizações | — | — | `pages/afiliado.tsx` | AfiliadoOrganizacoes | a decidir |
| `/afiliado/saques` | affiliate | afiliadoSaques | Saques | — | — | `pages/afiliado.tsx` | AfiliadoSaques | a decidir |
| `/ajuda` | público | — | — | — | — | `pages/Ajuda.tsx` | Ajuda | a decidir |
| `/bilhete/:code` | público | — | — | — | — | `pages/Bilhete.tsx` | Bilhete | a decidir |
| `/buscar` | público | — | — | — | — | `pages/Buscar.tsx` | Buscar | a decidir |
| `/cambista` | cambista | cambistaVenda | Nova venda | — | — | `pages/cambista.tsx` | CambistaVenda | a decidir |
| `/cambista/acerto` | cambista | cambistaAcerto | Meu acerto | — | — | `pages/cambista.tsx` | CambistaAcerto | a decidir |
| `/cambista/vendas` | cambista | cambistaVendas | Minhas vendas | — | — | `pages/cambista.tsx` | CambistaVendas | a decidir |
| `/carrinho` | público | — | — | — | — | `pages/Carrinho.tsx` | Carrinho | a decidir |
| `/carrinho/pix/:codigo` | público | — | — | — | — | `pages/CarrinhoPix.tsx` | CarrinhoPix | a decidir |
| `/conta/senha` | conta | — | — | — | — | `components/TrocarSenha.tsx` | TrocarSenha | a decidir |
| `/criar-conta` | público | — | — | — | — | `pages/CriarConta.tsx` | CriarConta | a decidir |
| `/entrar` | público | — | — | — | — | `pages/Login.tsx` | Login | a decidir |
| `/estado/:uf` | público | — | — | — | — | `pages/Estado.tsx` | EstadoPage | a decidir |
| `/mensagens` | público | — | — | — | — | `pages/Mensagens.tsx` | Mensagens | a decidir |
| `/mensagens/:id` | público | — | — | — | — | `pages/Mensagens.tsx` | Mensagens | a decidir |
| `/minhas-compras` | público | — | — | — | — | `pages/MinhasCotas.tsx` | MinhasCotas | a decidir |
| `/minhas-cotas` | guest | minhasCotas | Minhas cotas | — | — | `pages/MinhasCotas.tsx` | MinhasCotas | a decidir |
| `/notificacoes` | público | — | — | — | — | `pages/Notificacoes.tsx` | Notificacoes | a decidir |
| `/o/:org` | público | — | — | — | — | `pages/Perfil.tsx` | Perfil | a decidir |
| `/o/:org/r/:slug` | público | — | — | — | — | `pages/Rifa.tsx` | Rifa | a decidir |
| `/o/:org/r/:slug/regulamento` | público | — | — | — | — | `pages/Regulamento.tsx` | Regulamento | a decidir |
| `/pedido/:code` | guest | checkout | Pedido | — | — | `pages/Pedido.tsx` | Pedido | a decidir |
| `/perfil` | público | — | — | — | — | `pages/PerfilDoUsuario.tsx` | PerfilDoUsuario | a decidir |
| `/perfil/bilhetes` | público | — | — | — | — | `pages/MeusBilhetes.tsx` | MeusBilhetes | a decidir |
| `/perfil/configuracoes` | público | — | — | — | — | `pages/Configuracoes.tsx` | Configuracoes | a decidir |
| `/privacidade` | público | — | — | — | — | `pages/Legal.tsx` | Privacidade | a decidir |
| `/publicar` | público | — | — | — | — | `pages/Publicar.tsx` | Publicar | a decidir |
| `/r/:slug` | guest | campanha | Rifa | — | — | `pages/Rifa.tsx` | Rifa | a decidir |
| `/r/:slug/regulamento` | público | — | — | — | — | `pages/Regulamento.tsx` | Regulamento | a decidir |
| `/recibo/:codigo` | público | — | — | — | — | `pages/Recibo.tsx` | ReciboPage | a decidir |
| `/reels` | público | — | — | — | — | `pages/Reels.tsx` | Reels | a decidir |
| `/seja-afiliado` | público | — | — | — | — | `pages/CadastroAfiliado.tsx` | CadastroAfiliado | a decidir |
| `/termos` | público | — | — | — | — | `pages/Legal.tsx` | TermosDeUso | a decidir |
| `/u/:apelido` | público | — | — | — | — | `pages/Usuario.tsx` | Usuario | a decidir |

Redirecionamentos (o endereço de antes segue valendo):

- `/admin/patrocinio` → `/admin/marketing/publicidade`
- `/admin/banner-pago` → `/admin/marketing/publicidade?aba=banner`

## 2. Seções de acesso

| Seção | Rota | Rótulo | Papel mínimo | No menu | Grupo (do papel) | Grupo (plataforma) | Tem tela | Destino |
|---|---|---|---|---|---|---|---|---|
| `vitrine` | `/` | Rifas | guest | não | — | — | sim | a decidir |
| `campanha` | `/r/:slug` | Rifa | guest | não | — | — | sim | a decidir |
| `checkout` | `/pedido/:code` | Pedido | guest | não | — | — | sim | a decidir |
| `minhasCotas` | `/minhas-cotas` | Minhas cotas | guest | não | — | — | sim | a decidir |
| `afiliadoPainel` | `/afiliado` | Visão geral | affiliate | sim | (sem título) | — | sim | a decidir |
| `afiliadoLinks` | `/afiliado/links` | Meus links | affiliate | sim | (sem título) | — | sim | a decidir |
| `afiliadoOrganizacoes` | `/afiliado/organizacoes` | Organizações | affiliate | sim | (sem título) | — | sim | a decidir |
| `afiliadoDivulgar` | `/afiliado/divulgar` | Divulgar | affiliate | sim | (sem título) | — | sim | a decidir |
| `afiliadoComissoes` | `/afiliado/comissoes` | Comissões | affiliate | sim | Dinheiro | — | sim | a decidir |
| `afiliadoSaques` | `/afiliado/saques` | Saques | affiliate | sim | Dinheiro | — | sim | a decidir |
| `afiliadoDados` | `/afiliado/dados` | Meus dados | affiliate | sim | Dinheiro | — | sim | a decidir |
| `cambistaVenda` | `/cambista` | Nova venda | cambista | sim | (sem título) | — | sim | a decidir |
| `cambistaVendas` | `/cambista/vendas` | Minhas vendas | cambista | sim | (sem título) | — | sim | a decidir |
| `cambistaAcerto` | `/cambista/acerto` | Meu acerto | cambista | sim | (sem título) | — | sim | a decidir |
| `adminPainel` | `/admin` | Painel | organizer | sim | (sem título) | Painel | sim | a decidir |
| `adminCampanhas` | `/admin/campanhas` | Campanhas | organizer | sim | Rifas | Painel | sim | a decidir |
| `adminPedidos` | `/admin/pedidos` | Pedidos | organizer | sim | Vendas | Painel | sim | a decidir |
| `adminResultados` | `/admin/resultados` | Resultados | organizer | sim | Rifas | Painel | sim | a decidir |
| `adminAtendimento` | `/admin/atendimento` | Atendimento | organizer | sim | (sem título) | (sem título) | sim | a decidir |
| `adminStories` | `/admin/stories` | Stories | organizer | sim | Rifas | Painel | sim | a decidir |
| `adminTrafego` | `/admin/marketing/trafego` | Tráfego pago | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminMarketingIA` | `/admin/marketing/ia` | Marketing AI | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminPublicidade` | `/admin/marketing/publicidade` | Publicidade | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminPatrocinio` | `/admin/patrocinio` | Rifas patrocinadas | organizer | não | — | — | **não** | a decidir |
| `adminBannerPago` | `/admin/banner-pago` | Banner na vitrine | organizer | não | — | — | **não** | a decidir |
| `adminMarketing` | `/admin/marketing` | Medição e campanhas | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminAfiliados` | `/admin/afiliados` | Afiliados | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminCambistas` | `/admin/cambistas` | Cambistas | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminUsuarios` | `/admin/usuarios` | Usuários | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminFinanceiro` | `/admin/financeiro` | Financeiro | organizer | sim | Vendas | Painel | sim | a decidir |
| `adminSorteios` | `/admin/sorteios` | Sorteios | organizer | sim | Rifas | Painel | sim | a decidir |
| `adminSorteiosOficiais` | `/admin/sorteios-oficiais` | Sorteios oficiais | organizer | sim | Rifas | Painel | sim | a decidir |
| `adminExportacoes` | `/admin/exportacoes` | Exportações | organizer | sim | Vendas | Painel | sim | a decidir |
| `adminCobranca` | `/admin/cobranca` | Cobrança | organizer | sim | Vendas | Painel | sim | a decidir |
| `adminConfiguracoes` | `/admin/configuracoes` | Configurações | organizer | sim | Equipe e marketing | Painel | sim | a decidir |
| `adminOrganizacoes` | `/admin/organizacoes` | Organizações | admin | sim | Painel | Painel | sim | a decidir |
| `adminAntifraude` | `/admin/antifraude` | Antifraude | admin | sim | (sem título) | (sem título) | sim | a decidir |
| `adminAparencia` | `/admin/aparencia` | Aparência | admin | sim | Painel | Painel | sim | a decidir |
| `adminCaixa` | `/admin/caixa` | Tudo | admin | sim | (sem título) | (sem título) | sim | a decidir |
| `adminFiscal` | `/admin/fiscal` | Cadastros fiscais | admin | sim | Painel | Painel | sim | a decidir |
| `adminBonus` | `/admin/bonus` | Bônus | admin | sim | Painel | Painel | sim | a decidir |

## 3. Cartões por tela

Cada componente que a tela importa de `components/` precisa de lugar novo (ou da decisão de sair).

### `/` — Rifas

| Cartão | Destino |
|---|---|
| `BannersVitrine` | a decidir |
| `CartaoDeDivulgacao` | a decidir |
| `CartaoDoFeed` | a decidir |
| `ColunaAoVivo` | a decidir |
| `ContagemDoSorteio` | a decidir |
| `Empty` | a decidir |
| `FotoComStory` | a decidir |
| `FotoDoPerfil` | a decidir |
| `InstalarApp` | a decidir |
| `Patrocinadas` | a decidir |
| `PublicShell` | a decidir |
| `SorteioDoInicio` | a decidir |
| `VisualizadorDeStories` | a decidir |

### `/admin` — Painel

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/afiliados` — Afiliados

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/antifraude` — Antifraude

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/aparencia` — Aparência

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AssistenteIACard` | a decidir |
| `BannersCard` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `DadosDaEmpresaCard` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `TopoDoAppCard` | a decidir |
| `UsoDoAssistenteCard` | a decidir |

### `/admin/atendimento` — Atendimento

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Conversa` | a decidir |
| `DenunciasDaPlataforma` | a decidir |
| `Empty` | a decidir |
| `EntidadesDaPlataforma` | a decidir |
| `MestreDetalhe` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `SolicitacoesDeRifa` | a decidir |
| `VerificacoesDaPlataforma` | a decidir |

### `/admin/bonus` — Bônus

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/caixa` — Tudo

| Cartão | Destino |
|---|---|
| `CabecalhoDaTabela` | a decidir |
| `CartaoDoPainel` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |

### `/admin/cambistas` — Cambistas

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/campanhas` — Campanhas

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/cobranca` — Cobrança

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Campo` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `RetencoesCautelares` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `VerMais` | a decidir |

### `/admin/configuracoes` — Configurações

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/exportacoes` — Exportações

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/financeiro` — Financeiro

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/fiscal` — Cadastros fiscais

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/marketing` — Medição e campanhas

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/marketing/ia` — Marketing AI

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `ReelsDaRifa` | a decidir |

### `/admin/marketing/publicidade` — Publicidade

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `PanelShell` | a decidir |

### `/admin/marketing/trafego` — Tráfego pago

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Campo` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `Progress` | a decidir |

### `/admin/organizacoes` — Organizações

| Cartão | Destino |
|---|---|
| `AprovarTelefone` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `EnderecoForm` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |

### `/admin/pedidos` — Pedidos

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/resultados` — Resultados

| Cartão | Destino |
|---|---|
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `PanelShell` | a decidir |

### `/admin/sorteios` — Sorteios

| Cartão | Destino |
|---|---|
| `Abas` | a decidir |
| `AbrirEditorDeImagem` | a decidir |
| `AdiarSorteioCard` | a decidir |
| `AgendarPublicacaoCard` | a decidir |
| `AlternarVisao` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `BannerDivulgacaoCard` | a decidir |
| `BarrasHorizontais` | a decidir |
| `Button` | a decidir |
| `CabecalhoDaTabela` | a decidir |
| `CampaignExtras` | a decidir |
| `Card` | a decidir |
| `CartaoDoPainel` | a decidir |
| `CobrancaDaRifaCard` | a decidir |
| `ComissaoCard` | a decidir |
| `ContratoPromotoraCard` | a decidir |
| `CoresDoSeloCard` | a decidir |
| `DadosLegaisCard` | a decidir |
| `DivulgacoesDaOrganizacao` | a decidir |
| `EditarRifaCard` | a decidir |
| `Empty` | a decidir |
| `EnderecoCurto` | a decidir |
| `EnderecoForm` | a decidir |
| `Estatistica` | a decidir |
| `LegendaCard` | a decidir |
| `MediaManager` | a decidir |
| `Money` | a decidir |
| `PagamentosCard` | a decidir |
| `PanelShell` | a decidir |
| `PerfilPublicoForm` | a decidir |
| `Pill` | a decidir |
| `PixTardios` | a decidir |
| `Progress` | a decidir |
| `ReelsDaRifa` | a decidir |
| `ReembolsoCard` | a decidir |
| `SeloVerificado` | a decidir |
| `SociosDaOrganizacaoCard` | a decidir |
| `Sparkline` | a decidir |
| `TabelaOuCartoes` | a decidir |
| `TelefoneDoOrganizadorCard` | a decidir |
| `TransmissaoCard` | a decidir |
| `TrocarSenha` | a decidir |
| `VerMais` | a decidir |
| `VerificacaoCard` | a decidir |
| `WhatsAppCard` | a decidir |

### `/admin/sorteios-oficiais` — Sorteios oficiais

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Campo` | a decidir |
| `CamposDoSegundoFator` | a decidir |
| `Card` | a decidir |
| `Comentarios` | a decidir |
| `Empty` | a decidir |
| `Janela` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `SEGUNDO_FATOR_VAZIO` | a decidir |

### `/admin/stories` — Stories

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `EditorDeFigurinhas` | a decidir |
| `Empty` | a decidir |
| `NOME_DA_FIGURINHA` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/admin/usuarios` — Usuários

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/afiliado` — Visão geral

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Estatistica` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/afiliado/comissoes` — Comissões

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Estatistica` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/afiliado/dados` — Meus dados

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `VerificacaoCard` | a decidir |

### `/afiliado/divulgar` — Divulgar

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Campo` | a decidir |
| `CampoDeAgenda` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `FotosProprias` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |
| `VideoDaDivulgacao` | a decidir |
| `VideoProprio` | a decidir |

### `/afiliado/links` — Meus links

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Estatistica` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/afiliado/organizacoes` — Organizações

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Estatistica` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/afiliado/saques` — Saques

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | a decidir |
| `ArtesParaDivulgar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Estatistica` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/ajuda` — Ajuda

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/buscar` — Buscar

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `FotoDoPerfil` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

### `/cambista` — Nova venda

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/cambista/acerto` — Meu acerto

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/cambista/vendas` — Minhas vendas

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Empty` | a decidir |
| `Kpi` | a decidir |
| `Money` | a decidir |
| `PanelShell` | a decidir |
| `Pill` | a decidir |

### `/carrinho` — Carrinho

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | a decidir |
| `Button` | a decidir |
| `FotoDoPerfil` | a decidir |
| `Money` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

### `/carrinho/pix/:codigo` — CarrinhoPix

| Cartão | Destino |
|---|---|
| `Card` | a decidir |
| `Money` | a decidir |
| `Pill` | a decidir |
| `PixParaPagar` | a decidir |
| `PublicShell` | a decidir |

### `/conta/senha` — TrocarSenha

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |

### `/criar-conta` — CriarConta

| Cartão | Destino |
|---|---|
| `BotaoGoogle` | a decidir |
| `Button` | a decidir |
| `Marca` | a decidir |

### `/entrar` — Login

| Cartão | Destino |
|---|---|
| `BotaoGoogle` | a decidir |
| `Button` | a decidir |
| `Marca` | a decidir |

### `/estado/:uf` — EstadoPage

| Cartão | Destino |
|---|---|
| `CartaoDoFeed` | a decidir |
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/mensagens` — Mensagens

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `FotoDoPerfil` | a decidir |
| `GrupoAberto` | a decidir |
| `Janela` | a decidir |
| `ListaDeGrupos` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

### `/mensagens/:id` — Mensagens

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `FotoDoPerfil` | a decidir |
| `GrupoAberto` | a decidir |
| `Janela` | a decidir |
| `ListaDeGrupos` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

### `/minhas-compras` — MinhasCotas

| Cartão | Destino |
|---|---|
| `BonusDoComprador` | a decidir |
| `Button` | a decidir |
| `Campo` | a decidir |
| `Card` | a decidir |
| `CartaoDoFeed` | a decidir |
| `Conversa` | a decidir |
| `Empty` | a decidir |
| `Janela` | a decidir |
| `Money` | a decidir |
| `PerfilPublicoCard` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |
| `VerificacaoCard` | a decidir |

### `/minhas-cotas` — Minhas cotas

| Cartão | Destino |
|---|---|
| `BonusDoComprador` | a decidir |
| `Button` | a decidir |
| `Campo` | a decidir |
| `Card` | a decidir |
| `CartaoDoFeed` | a decidir |
| `Conversa` | a decidir |
| `Empty` | a decidir |
| `Janela` | a decidir |
| `Money` | a decidir |
| `PerfilPublicoCard` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |
| `VerificacaoCard` | a decidir |

### `/notificacoes` — Notificacoes

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/o/:org` — Perfil

| Cartão | Destino |
|---|---|
| `BarraDeAcoes` | a decidir |
| `Button` | a decidir |
| `Carrossel` | a decidir |
| `Denunciar` | a decidir |
| `DestaqueOrg` | a decidir |
| `Empty` | a decidir |
| `FOTO_COMO_NO_INSTAGRAM` | a decidir |
| `FotoComStory` | a decidir |
| `FotoDoPerfil` | a decidir |
| `Janela` | a decidir |
| `Legenda` | a decidir |
| `LinksDoPerfil` | a decidir |
| `Money` | a decidir |
| `PainelDeComentarios` | a decidir |
| `Progress` | a decidir |
| `PublicShell` | a decidir |
| `SeguirBotoes` | a decidir |
| `SeloVerificado` | a decidir |
| `VisualizadorDeStories` | a decidir |

### `/o/:org/r/:slug` — Rifa

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | a decidir |
| `BannerDaEntidade` | a decidir |
| `BarraDeAcoes` | a decidir |
| `BotaoDenunciar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Carrossel` | a decidir |
| `Cartelas` | a decidir |
| `Comentarios` | a decidir |
| `CotaSurpresa` | a decidir |
| `DestaqueOrg` | a decidir |
| `DivulgacoesDaRifa` | a decidir |
| `FotoDoPerfil` | a decidir |
| `GruposDaRifa` | a decidir |
| `Legenda` | a decidir |
| `Money` | a decidir |
| `PainelDeComentarios` | a decidir |
| `Progress` | a decidir |
| `PublicShell` | a decidir |
| `QuemTambemJoga` | a decidir |
| `SeguirBotoes` | a decidir |
| `SeloVerificado` | a decidir |
| `SoValePelaPlataforma` | a decidir |
| `SorteioCard` | a decidir |

### `/o/:org/r/:slug/regulamento` — Regulamento

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/pedido/:code` — Pedido

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |
| `Money` | a decidir |
| `Pill` | a decidir |
| `PixParaPagar` | a decidir |
| `PublicShell` | a decidir |

### `/perfil` — PerfilDoUsuario

| Cartão | Destino |
|---|---|
| `FOTO_COMO_NO_INSTAGRAM` | a decidir |
| `FotoDoApostador` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

### `/perfil/bilhetes` — MeusBilhetes

| Cartão | Destino |
|---|---|
| `BilheteComoPublicacao` | a decidir |
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/perfil/configuracoes` — Configuracoes

| Cartão | Destino |
|---|---|
| `PreferenciaDeCookies` | a decidir |
| `PublicShell` | a decidir |
| `TemaEscolha` | a decidir |

### `/privacidade` — Privacidade

| Cartão | Destino |
|---|---|
| `PublicShell` | a decidir |

### `/publicar` — Publicar

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Campo` | a decidir |
| `CampoDeAgenda` | a decidir |
| `FotosProprias` | a decidir |
| `Pill` | a decidir |
| `PublicShell` | a decidir |

### `/r/:slug` — Rifa

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | a decidir |
| `BannerDaEntidade` | a decidir |
| `BarraDeAcoes` | a decidir |
| `BotaoDenunciar` | a decidir |
| `Button` | a decidir |
| `Card` | a decidir |
| `Carrossel` | a decidir |
| `Cartelas` | a decidir |
| `Comentarios` | a decidir |
| `CotaSurpresa` | a decidir |
| `DestaqueOrg` | a decidir |
| `DivulgacoesDaRifa` | a decidir |
| `FotoDoPerfil` | a decidir |
| `GruposDaRifa` | a decidir |
| `Legenda` | a decidir |
| `Money` | a decidir |
| `PainelDeComentarios` | a decidir |
| `Progress` | a decidir |
| `PublicShell` | a decidir |
| `QuemTambemJoga` | a decidir |
| `SeguirBotoes` | a decidir |
| `SeloVerificado` | a decidir |
| `SoValePelaPlataforma` | a decidir |
| `SorteioCard` | a decidir |

### `/r/:slug/regulamento` — Regulamento

| Cartão | Destino |
|---|---|
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/recibo/:codigo` — ReciboPage

| Cartão | Destino |
|---|---|
| `Card` | a decidir |
| `Empty` | a decidir |
| `PublicShell` | a decidir |

### `/reels` — Reels

| Cartão | Destino |
|---|---|
| `BarraDeAcoes` | a decidir |
| `BotaoDenunciar` | a decidir |
| `CabecalhoDaPublicacao` | a decidir |
| `FigurinhasNaTela` | a decidir |
| `Money` | a decidir |
| `PainelDeComentarios` | a decidir |

### `/seja-afiliado` — CadastroAfiliado

| Cartão | Destino |
|---|---|
| `Button` | a decidir |
| `Card` | a decidir |

### `/termos` — TermosDeUso

| Cartão | Destino |
|---|---|
| `PublicShell` | a decidir |

### `/u/:apelido` — Usuario

| Cartão | Destino |
|---|---|
| `BotaoMensagem` | a decidir |
| `CartaoDoFeed` | a decidir |
| `Empty` | a decidir |
| `FOTO_COMO_NO_INSTAGRAM` | a decidir |
| `FotoDoApostador` | a decidir |
| `PublicShell` | a decidir |
| `SeloVerificado` | a decidir |

## 4. Rotas da API e a prova que cada uma tem

A API não muda de lugar na reformulação. Aqui está para que a tela nova não deixe rota sem prova: "—" quer dizer que nenhum arquivo de `scripts/` ou `tests/` cita o caminho.

### `server/routes/admin.ts` — /api/admin (264 rotas, 261 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `isolation-test.ts` |
| GET | `/campaigns` | `acessos-test.ts`, `agenda-rifa-test.ts`, `apuracao-test.ts` +3 |
| POST | `/campaigns` | `acessos-test.ts`, `agenda-rifa-test.ts`, `apuracao-test.ts` +3 |
| PATCH | `/campaigns/:id` | `agenda-rifa-test.ts`, `apuracao-test.ts`, `banner-pago-test.ts` +9 |
| POST | `/campaigns/:id/editar` | `acessos-test.ts`, `apuracao-test.ts`, `isolation-test.ts` +1 |
| POST | `/campaigns/:id/adiar` | `isolation-test.ts`, `solicitacoes-test.ts`, `sorteios-oficiais-test.ts` |
| GET | `/organizacoes/:id/telefone` | `isolation-test.ts`, `seguranca-test.ts` |
| POST | `/organizacoes/:id/telefone` | `isolation-test.ts`, `seguranca-test.ts` |
| POST | `/organizacoes/:id/telefone/confirmar` | `isolation-test.ts`, `seguranca-test.ts` |
| POST | `/organizacoes/:id/telefone/aprovar` | `isolation-test.ts`, `seguranca-test.ts` |
| GET | `/retencoes` | `isolation-test.ts`, `retencao-test.ts` |
| POST | `/organizacoes/:id/retencao` | `isolation-test.ts`, `retencao-test.ts` |
| POST | `/retencoes/:id/liberar` | `isolation-test.ts`, `retencao-test.ts` |
| POST | `/retencoes/:id/abater` | `isolation-test.ts`, `retencao-test.ts` |
| GET | `/pix-tardios` | `isolation-test.ts`, `pix-tardio-test.ts` |
| POST | `/pix-tardios/:id/devolver` | `isolation-test.ts`, `pix-tardio-test.ts` |
| POST | `/pix-tardios/:id/resolver` | `isolation-test.ts`, `pix-tardio-test.ts` |
| GET | `/denuncias` | `isolation-test.ts`, `seguranca-test.ts` |
| GET | `/denuncias/:id` | `isolation-test.ts` |
| POST | `/denuncias/:id/decidir` | `isolation-test.ts`, `retencao-test.ts`, `seguranca-test.ts` |
| GET | `/mensagens/denuncias` | `isolation-test.ts`, `mensagens-test.ts` |
| GET | `/mensagens/denuncias/:id` | `isolation-test.ts`, `mensagens-test.ts` |
| GET | `/mensagens/denuncias/:id/fotos/:fotoId` | `isolation-test.ts`, `mensagens-test.ts` |
| POST | `/mensagens/denuncias/:id/decidir` | `isolation-test.ts`, `mensagens-test.ts` |
| GET | `/mensagens/grupos/denuncias` | `grupos-test.ts`, `isolation-test.ts` |
| GET | `/mensagens/grupos/denuncias/:id` | `grupos-test.ts`, `isolation-test.ts` |
| POST | `/mensagens/grupos/denuncias/:id/decidir` | `grupos-test.ts`, `isolation-test.ts` |
| GET | `/sorteios-oficiais/denuncias` | `isolation-test.ts`, `sorteio-comentarios-test.ts` |
| GET | `/sorteios-oficiais/denuncias/:id` | `isolation-test.ts`, `sorteio-comentarios-test.ts` |
| POST | `/sorteios-oficiais/denuncias/:id/decidir` | `isolation-test.ts`, `sorteio-comentarios-test.ts` |
| POST | `/campaigns/:id/destravar` | `isolation-test.ts`, `seguranca-test.ts` |
| GET | `/solicitacoes` | `isolation-test.ts` |
| GET | `/solicitacoes/pendentes` | `acessos-test.ts` |
| GET | `/solicitacoes/:id` | `acessos-test.ts`, `comentarios-test.ts`, `isolation-test.ts` +2 |
| POST | `/solicitacoes/:id/mensagens` | `isolation-test.ts`, `solicitacoes-test.ts` |
| POST | `/solicitacoes/:id/cancelar` | `isolation-test.ts`, `solicitacoes-test.ts` |
| POST | `/solicitacoes/:id/decidir` | `comentarios-test.ts`, `isolation-test.ts`, `solicitacoes-test.ts` +1 |
| PUT | `/campaigns/:id/legal` | `apuracao-test.ts`, `bonus-test.ts`, `isolation-test.ts` +3 |
| PUT | `/campaigns/:id/legenda` | `isolation-test.ts`, `publicacao-test.ts` |
| GET | `/campaigns/:id/artes` | `artes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/artes/:tipo/pacote` | `artes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/artes/:tipo` | `artes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/editor` | `artes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/editor/foco/:mediaId` | `artes-test.ts`, `isolation-test.ts` |
| POST | `/campaigns/:id/editor/conferir` | `artes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/marketing` | `ia-acoes-test.ts`, `isolation-test.ts` |
| POST | `/campaigns/:id/marketing/anuncios` | `ia-acoes-test.ts`, `isolation-test.ts` |
| POST | `/campaigns/:id/sugerir` | `artes-test.ts`, `ia-acoes-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/banner-divulgacao` | `banner-divulgacao-test.ts`, `contrato-anexos-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/banner-divulgacao/imagem` | `isolation-test.ts` |
| PUT | `/campaigns/:id/banner-divulgacao` | `banner-divulgacao-test.ts`, `contrato-anexos-test.ts`, `isolation-test.ts` |
| PUT | `/campaigns/:id/banner-divulgacao/documentos/:tipo` | `isolation-test.ts` |
| DELETE | `/campaigns/:id/banner-divulgacao` | `banner-divulgacao-test.ts`, `contrato-anexos-test.ts`, `isolation-test.ts` |
| GET | `/entidades` | `banner-divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/entidades/:campaignId/documentos/:tipo` | `banner-divulgacao-test.ts`, `isolation-test.ts` |
| POST | `/entidades/:campaignId/decidir` | `banner-divulgacao-test.ts`, `isolation-test.ts` |
| PUT | `/campaigns/:id/transmissao` | `isolation-test.ts`, `transparencia-test.ts` |
| GET | `/campaigns/:id/certificado` | `isolation-test.ts` |
| GET | `/campaigns/:id/blockers` | `apuracao-test.ts`, `cobranca-test.ts`, `contrato-anexos-test.ts` +3 |
| POST | `/campaigns/:id/tirar-do-ar` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/campaigns/:id/demonstracao` | `cobranca-test.ts`, `isolation-test.ts`, `vitrine-test.ts` |
| DELETE | `/campaigns/:id` | `agenda-rifa-test.ts`, `apuracao-test.ts`, `banner-pago-test.ts` +9 |
| POST | `/campaigns/:id/publish` | `agenda-rifa-test.ts`, `apuracao-test.ts`, `cobranca-test.ts` +3 |
| PUT | `/campaigns/:id/agendar-publicacao` | `agenda-rifa-test.ts`, `isolation-test.ts` |
| PUT | `/campaigns/:id/packages` | `cobranca-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/media` | `isolation-test.ts`, `poster-test.ts`, `publicacao-test.ts` |
| POST | `/campaigns/:id/media/upload-url` | `poster-test.ts`, `publicacao-test.ts` |
| PUT | `/media/raw` | — |
| POST | `/campaigns/:id/media` | `isolation-test.ts`, `poster-test.ts`, `publicacao-test.ts` |
| PUT | `/media/:mediaId/legenda` | `isolation-test.ts`, `publicacao-test.ts` |
| PUT | `/media/:mediaId/figurinhas` | `isolation-test.ts`, `publicacao-test.ts` |
| PUT | `/media/:mediaId/capa` | `isolation-test.ts`, `poster-test.ts` |
| POST | `/campaigns/:id/reels-gerado` | `fila-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/reels-gerado` | `fila-test.ts`, `isolation-test.ts` |
| PUT | `/media/:mediaId/corte` | `isolation-test.ts`, `poster-test.ts` |
| DELETE | `/media/:mediaId` | `isolation-test.ts`, `poster-test.ts`, `publicacao-test.ts` |
| GET | `/campaigns/:id/prized` | `apuracao-test.ts`, `comentarios-test.ts`, `contrato-anexos-test.ts` +1 |
| POST | `/campaigns/:id/prized` | `apuracao-test.ts`, `comentarios-test.ts`, `contrato-anexos-test.ts` +1 |
| DELETE | `/prized/:prizedId` | — |
| GET | `/busca` | `isolation-test.ts` |
| GET | `/orders` | `isolation-test.ts` |
| GET | `/affiliates` | `afiliados-test.ts` |
| POST | `/affiliates` | `afiliados-test.ts` |
| PATCH | `/affiliates/:id` | `afiliados-test.ts`, `divulgacao-test.ts` |
| GET | `/coupons` | `afiliados-test.ts` |
| POST | `/coupons` | `afiliados-test.ts` |
| DELETE | `/coupons/:id` | `afiliados-test.ts` |
| POST | `/sellers` | `cambista-test.ts` |
| GET | `/settlements` | `cambista-test.ts` |
| POST | `/settlements/:sellerId/close` | `cambista-test.ts` |
| POST | `/settlements/:id/paid` | `cambista-test.ts` |
| GET | `/organizer` | `banner-pago-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +3 |
| PUT | `/organizer` | `banner-pago-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +3 |
| GET | `/exportacoes` | `acessos-test.ts` |
| GET | `/exportacoes/:key` | `apuracao-test.ts`, `isolation-test.ts`, `transparencia-test.ts` |
| GET | `/organizacoes` | `isolation-test.ts` |
| GET | `/demonstracao` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/demonstracao` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/organizacoes/:id/exemplo` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/organizacoes/:id/link-curto` | `isolation-test.ts`, `perfil-test.ts` |
| GET | `/organizacoes/:id/links/cliques` | `isolation-test.ts`, `perfil-test.ts` |
| POST | `/campaigns/:id/link-curto` | `isolation-test.ts` |
| DELETE | `/demonstracao` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/organizacoes` | `isolation-test.ts` |
| PATCH | `/organizacoes/:id` | `isolation-test.ts` |
| PUT | `/organizacoes/:id/endereco` | `isolation-test.ts` |
| GET | `/organizacoes/:id/socios` | `apuracao-test.ts`, `isolation-test.ts` |
| POST | `/organizacoes/:id/socios` | `apuracao-test.ts`, `isolation-test.ts` |
| DELETE | `/organizacoes/:id/socios/:socioId` | `isolation-test.ts` |
| POST | `/organizacoes/:id/socios/declarar` | `isolation-test.ts` |
| PUT | `/organizacoes/:id/perfil` | `isolation-test.ts`, `perfil-test.ts` |
| POST | `/organizacoes/:id/acessos` | `acessos-test.ts` |
| POST | `/organizacoes/:id/arquivar` | `isolation-test.ts` |
| POST | `/organizacoes/:id/restaurar` | `isolation-test.ts` |
| GET | `/plataforma` | `bonus-test.ts`, `fiscal-test.ts`, `guarda-test.ts` +3 |
| PUT | `/app` | `buscar-test.ts`, `divulgacao-test.ts`, `grupos-test.ts` +3 |
| PUT | `/selos` | `isolation-test.ts`, `verificacao-test.ts` |
| PUT | `/plataforma` | `bonus-test.ts`, `fiscal-test.ts`, `guarda-test.ts` +3 |
| GET | `/comissao` | `guarda-test.ts` |
| PUT | `/comissao` | `guarda-test.ts` |
| GET | `/chamados` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| GET | `/chamados/pendentes` | `chamados-test.ts`, `disputa-test.ts`, `divulgacao-test.ts` +2 |
| GET | `/avisos` | `isolation-test.ts` |
| POST | `/avisos/vistos` | `acessos-test.ts` |
| GET | `/chamados/anexos/:id` | `chamados-test.ts`, `isolation-test.ts` |
| GET | `/chamados/:id` | `chamados-test.ts`, `disputa-test.ts`, `divulgacao-test.ts` +2 |
| POST | `/chamados/:id/mensagens` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| POST | `/chamados/:id/concluir` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| POST | `/chamados/:id/disputa/decidir` | `disputa-test.ts`, `isolation-test.ts` |
| POST | `/chamados/:id/estornar` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| GET | `/reembolso` | `chamados-test.ts` |
| PUT | `/reembolso` | `chamados-test.ts` |
| GET | `/whatsapp` | `isolation-test.ts` |
| POST | `/whatsapp/modelos` | `isolation-test.ts` |
| POST | `/whatsapp/teste` | `isolation-test.ts` |
| GET | `/usuarios` | `isolation-test.ts` |
| POST | `/usuarios/:id/senha` | `isolation-test.ts` |
| PATCH | `/usuarios/:id` | `isolation-test.ts` |
| GET | `/cobranca` | `cobranca-test.ts`, `isolation-test.ts` |
| GET | `/cobranca/tabela` | `cobranca-test.ts`, `isolation-test.ts` |
| PUT | `/cobranca/tabela` | `cobranca-test.ts`, `isolation-test.ts` |
| DELETE | `/cobranca/tabela/proxima` | `cobranca-test.ts`, `isolation-test.ts` |
| POST | `/cobranca/:id/baixa` | `cobranca-test.ts`, `isolation-test.ts`, `presente-test.ts` +1 |
| GET | `/cobranca/notificacao` | `cobranca-test.ts` |
| POST | `/cobranca/:id/notificar` | `cobranca-test.ts`, `isolation-test.ts` |
| POST | `/cobranca/notificacoes/:id/cancelar` | `cobranca-test.ts`, `isolation-test.ts` |
| GET | `/cobranca/extrato` | `cobranca-test.ts`, `isolation-test.ts`, `presente-test.ts` |
| GET | `/antifraude` | `acessos-test.ts`, `isolation-test.ts` |
| PUT | `/antifraude/limites` | `acessos-test.ts` |
| POST | `/antifraude/bloqueios` | `acessos-test.ts` |
| DELETE | `/antifraude/bloqueios/:id` | `acessos-test.ts` |
| GET | `/payment-methods` | `isolation-test.ts` |
| PUT | `/payment-methods` | `isolation-test.ts` |
| GET | `/finance` | `afiliados-test.ts`, `fiscal-test.ts`, `guarda-test.ts` |
| POST | `/finance/release` | `guarda-test.ts` |
| GET | `/payouts/:id/nota` | `fiscal-test.ts`, `isolation-test.ts` |
| POST | `/payouts/:id/paid` | `afiliados-test.ts`, `fiscal-test.ts`, `guarda-test.ts` |
| GET | `/template` | `aparencia-test.ts`, `contrato-promotora-test.ts`, `isolation-test.ts` |
| GET | `/template/previa` | `aparencia-test.ts`, `isolation-test.ts` |
| PUT | `/template/rascunho` | `aparencia-test.ts`, `contrato-promotora-test.ts`, `isolation-test.ts` |
| PUT | `/template/empresa` | `aparencia-test.ts`, `isolation-test.ts` |
| PUT | `/template/logo` | `aparencia-test.ts`, `isolation-test.ts` |
| PUT | `/template/apoio` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/template/exemplo-rodape` | `aparencia-test.ts`, `isolation-test.ts` |
| POST | `/template/publicar` | `aparencia-test.ts`, `contrato-promotora-test.ts`, `isolation-test.ts` |
| POST | `/template/versoes/:id/restaurar` | `aparencia-test.ts`, `isolation-test.ts` |
| GET | `/campaigns/:id/draw` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +1 |
| POST | `/campaigns/:id/draw` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +1 |
| GET | `/2fa` | `acessos-test.ts` |
| POST | `/2fa/setup` | `acessos-test.ts`, `senha-test.ts` |
| POST | `/2fa/enable` | `acessos-test.ts`, `senha-test.ts` |
| POST | `/2fa/disable` | `acessos-test.ts` |
| GET | `/audit` | `isolation-test.ts` |
| GET | `/sorteios-oficiais` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` |
| GET | `/apuracao/metodos` | `apuracao-test.ts`, `isolation-test.ts` |
| PUT | `/apuracao/metodos` | `apuracao-test.ts`, `isolation-test.ts` |
| GET | `/sorteios-oficiais/canais` | `isolation-test.ts` |
| PUT | `/sorteios-oficiais/canais` | `isolation-test.ts` |
| POST | `/sorteios-oficiais` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` |
| PATCH | `/sorteios-oficiais/:id` | `isolation-test.ts`, `sorteio-comentarios-test.ts`, `sorteios-oficiais-test.ts` |
| POST | `/sorteios-oficiais/:id/cancelar` | `isolation-test.ts`, `sorteios-oficiais-test.ts` |
| POST | `/sorteios-oficiais/:id/resultado` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` |
| PUT | `/sorteios-oficiais/:id/ata` | `apuracao-test.ts`, `isolation-test.ts` |
| POST | `/sorteios-oficiais/:id/rifas/:campaignId/extracoes` | `apuracao-test.ts`, `isolation-test.ts` |
| PUT | `/campaigns/:id/sorteio-oficial` | `apuracao-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` |
| GET | `/banners` | `isolation-test.ts`, `vitrine-test.ts` |
| POST | `/banners` | `isolation-test.ts`, `vitrine-test.ts` |
| PUT | `/banners/ordem` | `isolation-test.ts`, `vitrine-test.ts` |
| PATCH | `/banners/:id` | `isolation-test.ts`, `vitrine-test.ts` |
| DELETE | `/banners/:id` | `isolation-test.ts`, `vitrine-test.ts` |
| GET | `/stories` | `isolation-test.ts`, `poster-test.ts`, `vitrine-test.ts` |
| POST | `/stories` | `isolation-test.ts`, `poster-test.ts`, `vitrine-test.ts` |
| GET | `/stories/:id/:qual(imagem\|poster)` | — |
| DELETE | `/stories/:id` | `isolation-test.ts`, `poster-test.ts`, `vitrine-test.ts` |
| GET | `/resultados` | `resultados-test.ts` |
| PUT | `/campaigns/:id/foto-ganhador` | `isolation-test.ts`, `resultados-test.ts` |
| GET | `/termo-afiliado` | `afiliados-test.ts`, `divulgacao-test.ts` |
| POST | `/termo-afiliado` | `afiliados-test.ts`, `divulgacao-test.ts` |
| GET | `/contrato-promotora` | `contrato-anexos-test.ts`, `contrato-promotora-test.ts`, `isolation-test.ts` |
| POST | `/contrato-promotora` | `contrato-anexos-test.ts`, `contrato-promotora-test.ts`, `isolation-test.ts` |
| POST | `/contrato-promotora/previa` | `contrato-promotora-test.ts`, `isolation-test.ts` |
| POST | `/contrato-promotora/aceite` | `contrato-anexos-test.ts`, `contrato-promotora-test.ts` |
| POST | `/contrato-promotora/anexos` | `contrato-anexos-test.ts`, `isolation-test.ts` |
| POST | `/contrato-promotora/anexos/previa` | `contrato-anexos-test.ts`, `isolation-test.ts` |
| POST | `/contrato-promotora/anexos/aceite` | `contrato-anexos-test.ts` |
| GET | `/colaboradores/pedidos` | `afiliados-test.ts` |
| POST | `/colaboradores/pedidos/:id` | `afiliados-test.ts` |
| GET | `/divulgacoes/config` | `divulgacao-test.ts`, `isolation-test.ts` |
| PUT | `/divulgacoes/config` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/divulgacoes` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/divulgacoes/:id/fotos/:fotoId` | `isolation-test.ts` |
| GET | `/divulgacoes/:id/video` | `isolation-test.ts` |
| POST | `/divulgacoes/:id` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/recibos/:codigo/pdf` | `fiscal-test.ts` |
| GET | `/saques-pagos` | `fiscal-test.ts` |
| GET | `/bonus` | `isolation-test.ts`, `presente-test.ts` |
| PUT | `/bonus/config` | `bonus-test.ts`, `isolation-test.ts`, `presente-test.ts` |
| POST | `/bonus/metas` | `bonus-test.ts`, `isolation-test.ts` |
| PUT | `/bonus/metas/:id` | `isolation-test.ts` |
| GET | `/banner-pago` | `banner-pago-test.ts` |
| POST | `/banner-pago/pedidos` | `banner-pago-test.ts` |
| GET | `/banner-pago/pedidos/:id/imagem` | `banner-pago-test.ts` |
| POST | `/banner-pago/pedidos/:id/cancelar` | `banner-pago-test.ts` |
| POST | `/banner-pago/pedidos/:id/decisao` | `banner-pago-test.ts`, `isolation-test.ts` |
| PUT | `/banner-pago/config` | `banner-pago-test.ts`, `isolation-test.ts` |
| GET | `/trafego` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| GET | `/trafego/campanhas/:id/gastos` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/cancelar` | `isolation-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/encerrar` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/decisao` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/gastos` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/fechar` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| POST | `/trafego/campanhas/:id/meta/largar` | `isolation-test.ts`, `trafego-criacao-test.ts` |
| POST | `/trafego/campanhas/:id/meta` | `isolation-test.ts`, `trafego-criacao-test.ts` |
| GET | `/trafego/importacao` | `isolation-test.ts`, `trafego-test.ts` |
| POST | `/trafego/importacao` | `isolation-test.ts`, `trafego-test.ts` |
| PUT | `/trafego/config` | `isolation-test.ts`, `trafego-criacao-test.ts`, `trafego-test.ts` |
| GET | `/ia/config` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| PUT | `/ia/config` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| GET | `/ia/relatorio` | `ia-test.ts`, `isolation-test.ts` |
| GET | `/ia/lancamentos` | `ia-test.ts`, `isolation-test.ts` |
| POST | `/ia/ajustes` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| GET | `/patrocinio` | `patrocinio-test.ts` |
| POST | `/patrocinio/anuncios` | `patrocinio-test.ts` |
| POST | `/patrocinio/reembolsos` | `patrocinio-test.ts` |
| POST | `/patrocinio/reembolsos/:id/mensagens` | `patrocinio-test.ts` |
| POST | `/patrocinio/reembolsos/:id/decisao` | `isolation-test.ts`, `patrocinio-test.ts`, `retencao-test.ts` |
| POST | `/patrocinio/reembolsos/:id/pago` | `isolation-test.ts`, `patrocinio-test.ts`, `retencao-test.ts` |
| POST | `/patrocinio/recargas` | `patrocinio-test.ts` |
| PUT | `/patrocinio/config` | `isolation-test.ts`, `patrocinio-test.ts` |
| POST | `/patrocinio/ajustes` | `banner-pago-test.ts`, `isolation-test.ts`, `patrocinio-test.ts` |
| GET | `/marketing` | `marketing-test.ts` |
| PUT | `/marketing` | `marketing-test.ts` |
| GET | `/verificacoes` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/verificacoes/:id` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/verificacoes/:id/documentos/:tipo` | `isolation-test.ts` |
| GET | `/verificacoes/:id/foto` | `isolation-test.ts`, `verificacao-test.ts` |
| POST | `/verificacoes/:id/decidir` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/caixa-de-entrada` | `banner-divulgacao-test.ts`, `banner-pago-test.ts`, `grupos-test.ts` +6 |
| GET | `/fiscal` | `fiscal-test.ts`, `isolation-test.ts` |
| GET | `/fiscal/:affiliateId` | `fiscal-test.ts`, `isolation-test.ts` |
| GET | `/fiscal/:affiliateId/documentos/:tipo` | `fiscal-test.ts`, `isolation-test.ts` |
| POST | `/fiscal/:affiliateId/decidir` | `fiscal-test.ts`, `isolation-test.ts` |

### `server/routes/affiliate.ts` — /api/affiliate (36 rotas, 32 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `verificacao-test.ts` |
| GET | `/commissions` | — |
| GET | `/links` | `afiliados-test.ts`, `artes-test.ts` |
| GET | `/coupons` | — |
| GET | `/artes/:slug` | `artes-test.ts` |
| GET | `/artes/:slug/:tipo/pacote` | `artes-test.ts` |
| GET | `/artes/:slug/:tipo` | `artes-test.ts` |
| GET | `/editor/:slug` | `artes-test.ts` |
| POST | `/editor/:slug/sugerir` | `artes-test.ts` |
| GET | `/editor/:slug/foco/:mediaId` | `artes-test.ts` |
| POST | `/editor/:slug/conferir` | `artes-test.ts` |
| PATCH | `/pix-key` | `afiliados-test.ts` |
| GET | `/saldo` | `afiliados-test.ts`, `fiscal-test.ts`, `guarda-test.ts` |
| POST | `/payouts` | `afiliados-test.ts`, `fiscal-test.ts`, `guarda-test.ts` |
| GET | `/payouts/:id/nota` | `fiscal-test.ts` |
| GET | `/payouts` | `afiliados-test.ts`, `fiscal-test.ts`, `guarda-test.ts` |
| GET | `/organizacoes` | — |
| POST | `/organizacoes/:slug/aderir` | `afiliados-test.ts`, `divulgacao-test.ts` |
| DELETE | `/organizacoes/:slug` | `afiliados-test.ts`, `divulgacao-test.ts` |
| GET | `/fiscal` | `fiscal-test.ts` |
| PUT | `/fiscal` | `fiscal-test.ts` |
| PUT | `/fiscal/documentos/:tipo` | `fiscal-test.ts`, `verificacao-test.ts` |
| GET | `/fiscal/documentos/:tipo` | `fiscal-test.ts`, `verificacao-test.ts` |
| POST | `/verificacao/copiar-do-fiscal` | `verificacao-test.ts` |
| PUT | `/foto` | `verificacao-test.ts` |
| GET | `/foto` | `verificacao-test.ts` |
| GET | `/recibos/:codigo/pdf` | `fiscal-test.ts` |
| GET | `/divulgacoes/rifas` | `divulgacao-test.ts` |
| GET | `/divulgacoes` | `divulgacao-test.ts` |
| POST | `/divulgacoes` | `divulgacao-test.ts` |
| GET | `/divulgacoes/novidades` | `divulgacao-test.ts`, `isolation-test.ts` |
| POST | `/avisos/vistos` | `divulgacao-test.ts`, `isolation-test.ts` |
| PATCH | `/divulgacoes/:id` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/divulgacoes/:id/fotos/:fotoId` | `isolation-test.ts` |
| GET | `/divulgacoes/:id/video` | — |
| DELETE | `/divulgacoes/:id` | `divulgacao-test.ts`, `isolation-test.ts` |

### `server/routes/auth.ts` — /api/auth (4 rotas, 4 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/me` | `acessos-test.ts`, `google-test.ts`, `marketing-test.ts` |
| POST | `/login` | `acessos-test.ts`, `afiliados-test.ts`, `agenda-rifa-test.ts` +43 |
| POST | `/senha` | `acessos-test.ts` |
| POST | `/logout` | `acessos-test.ts` |

### `server/routes/dev.ts` — /api/dev (4 rotas, 4 com prova)

| Método | Caminho | Provas |
|---|---|---|
| POST | `/google` | `google-test.ts` |
| POST | `/pay/:code` | `afiliados-test.ts`, `bonus-test.ts`, `carrinho-test.ts` +11 |
| POST | `/ia-pagamento/:codigo` | `ia-acoes-test.ts`, `ia-test.ts` |
| POST | `/recarga/:codigo` | `patrocinio-test.ts` |

### `server/routes/ia.ts` — /api/ia (8 rotas, 8 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/sessao` | `ia-test.ts`, `isolation-test.ts` |
| GET | `/conversa` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| DELETE | `/conversa` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| POST | `/mensagens` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |
| POST | `/acoes/:id/confirmar` | `ia-acoes-test.ts`, `isolation-test.ts` |
| POST | `/acoes/:id/recusar` | `ia-acoes-test.ts`, `isolation-test.ts` |
| GET | `/conta` | `ia-test.ts`, `isolation-test.ts` |
| POST | `/pagamentos` | `ia-acoes-test.ts`, `ia-test.ts`, `isolation-test.ts` |

### `server/routes/public.ts` — /api/public (149 rotas, 131 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/campaigns` | `comentarios-test.ts`, `publicacao-test.ts`, `seguranca-test.ts` +3 |
| GET | `/mensagens/resumo` | `grupos-test.ts`, `mensagens-test.ts` |
| GET | `/mensagens/destino` | `mensagens-test.ts` |
| GET | `/mensagens/conversas` | `mensagens-test.ts` |
| POST | `/mensagens/conversas` | `mensagens-test.ts` |
| GET | `/mensagens/conversas/:id` | `mensagens-test.ts` |
| POST | `/mensagens/conversas/:id/mensagens` | `mensagens-test.ts` |
| GET | `/mensagens/conversas/:id/fotos/:fotoId` | — |
| GET | `/mensagens/grupos` | `grupos-test.ts` |
| POST | `/mensagens/grupos` | `grupos-test.ts` |
| GET | `/mensagens/grupos/rifa/:slug` | `grupos-test.ts` |
| GET | `/mensagens/grupos/:id` | `grupos-test.ts` |
| POST | `/mensagens/grupos/:id/entrar` | `grupos-test.ts` |
| POST | `/mensagens/grupos/:id/sair` | `grupos-test.ts` |
| POST | `/mensagens/grupos/:id/mensagens` | `grupos-test.ts` |
| POST | `/mensagens/grupos/:id/lida` | `grupos-test.ts` |
| POST | `/mensagens/grupos/:id/denuncia` | `grupos-test.ts` |
| GET | `/mensagens/presenca` | `mensagens-test.ts` |
| PUT | `/mensagens/presenca` | `mensagens-test.ts` |
| POST | `/mensagens/conversas/:id/lida` | `mensagens-test.ts` |
| POST | `/mensagens/conversas/:id/pedido` | `mensagens-test.ts` |
| PUT | `/mensagens/conversas/:id/bloqueio` | `mensagens-test.ts` |
| POST | `/mensagens/conversas/:id/denuncia` | `mensagens-test.ts` |
| GET | `/buscar` | `buscar-test.ts` |
| GET | `/reels` | `publicacao-test.ts` |
| GET | `/banners` | `banner-pago-test.ts`, `vitrine-test.ts` |
| GET | `/banners/:id/imagem` | — |
| GET | `/banners-pagos/:id/imagem` | `banner-pago-test.ts` |
| GET | `/estados` | `vitrine-test.ts` |
| GET | `/o/:slug/stories` | `poster-test.ts`, `vitrine-test.ts` |
| POST | `/stories/:id/enquete` | `vitrine-test.ts` |
| GET | `/stories/:id/poster` | `poster-test.ts` |
| GET | `/stories/:id/imagem` | `poster-test.ts`, `vitrine-test.ts` |
| GET | `/recibos/:codigo` | `fiscal-test.ts` |
| GET | `/o/:slug/termo-afiliado` | — |
| POST | `/o/:slug/colaborador` | `afiliados-test.ts` |
| GET | `/o/:slug` | `perfil-test.ts`, `poster-test.ts`, `resultados-test.ts` +3 |
| GET | `/o/:slug/foto` | — |
| GET | `/o/:slug/capa` | — |
| GET | `/o/:slug/qr.svg` | `perfil-test.ts` |
| GET | `/o/:slug/seguir` | `bonus-test.ts`, `perfil-test.ts`, `push-test.ts` |
| POST | `/o/:slug/seguir` | `bonus-test.ts`, `perfil-test.ts`, `push-test.ts` |
| DELETE | `/o/:slug/seguir` | `bonus-test.ts`, `perfil-test.ts`, `push-test.ts` |
| PUT | `/o/:slug/sino` | `perfil-test.ts`, `push-test.ts` |
| GET | `/seguindo` | `perfil-test.ts` |
| GET | `/campaigns/:slug/quem-joga` | `bonus-test.ts` |
| GET | `/campaigns/:slug/comentarios` | `comentarios-test.ts`, `seguranca-test.ts`, `verificacao-test.ts` |
| POST | `/campaigns/:slug/comentarios` | `comentarios-test.ts`, `seguranca-test.ts`, `verificacao-test.ts` |
| DELETE | `/comentarios/:id` | `comentarios-test.ts`, `isolation-test.ts` |
| PUT | `/comentarios/:id/curtida` | `comentarios-test.ts` |
| POST | `/denuncias` | `seguranca-test.ts` |
| GET | `/conta/perfil` | `comentarios-test.ts`, `google-test.ts`, `verificacao-test.ts` |
| PUT | `/conta/perfil` | `comentarios-test.ts`, `google-test.ts`, `verificacao-test.ts` |
| GET | `/app` | `buscar-test.ts`, `divulgacao-test.ts`, `grupos-test.ts` +3 |
| GET | `/selos` | `verificacao-test.ts` |
| PUT | `/campaigns/:slug/acoes/:acao` | `publicacao-test.ts` |
| POST | `/campaigns/:slug/compartilhamentos` | `publicacao-test.ts` |
| POST | `/carrinho` | `carrinho-test.ts`, `publicacao-test.ts` |
| GET | `/conta/salvos` | `publicacao-test.ts` |
| GET | `/conta/bilhetes` | `bilhetes-test.ts`, `isolation-test.ts` |
| GET | `/u/:apelido/republicacoes` | `publicacao-test.ts` |
| GET | `/u/:apelido` | `bilhetes-test.ts`, `comentarios-test.ts`, `publicacao-test.ts` +1 |
| GET | `/u/:apelido/foto` | — |
| GET | `/notificacoes/resumo` | `push-test.ts` |
| GET | `/notificacoes` | `push-test.ts` |
| POST | `/notificacoes/lidas` | `push-test.ts` |
| GET | `/stories` | `vitrine-test.ts` |
| GET | `/template` | `aparencia-test.ts`, `base-ia.ts` |
| GET | `/marca/logo` | `aparencia-test.ts` |
| GET | `/marca/icone/:tamanho` | `aparencia-test.ts`, `manifest.test.ts` |
| GET | `/marca/apoio/:id` | `aoVivo.test.ts` |
| GET | `/push/chave` | `push-test.ts` |
| POST | `/push/inscricoes` | `push-test.ts` |
| DELETE | `/push/inscricoes` | `push-test.ts` |
| GET | `/cep/:cep` | — |
| GET | `/campaigns/:slug/certificado` | — |
| GET | `/campaigns/:slug/banner-divulgacao` | `banner-divulgacao-test.ts` |
| GET | `/campaigns/:slug` | `agenda-rifa-test.ts`, `apuracao-test.ts`, `banner-divulgacao-test.ts` +7 |
| GET | `/campaigns/:slug/regulamento` | `apuracao-test.ts`, `bonus-test.ts`, `transparencia-test.ts` |
| GET | `/campaigns/:slug/sorteio` | `apuracao-test.ts`, `transparencia-test.ts` |
| GET | `/campaigns/:slug/foto-ganhador` | — |
| GET | `/campaigns/:slug/blocks/:block` | `senha-test.ts` |
| GET | `/campaigns/:slug/cartelas` | `carrinho-test.ts`, `load-test.ts` |
| GET | `/campaigns/:slug/numbers/:number` | — |
| POST | `/track-click` | — |
| GET | `/checkout` | `base-ia.ts` |
| POST | `/orders` | `acessos-test.ts`, `afiliados-test.ts`, `apuracao-test.ts` +17 |
| POST | `/carrinho/checkout` | `carrinho-test.ts` |
| GET | `/orders/:code` | `carrinho-test.ts`, `marketing-test.ts`, `presente-test.ts` |
| GET | `/carrinho/pedidos/:codigo` | `carrinho-test.ts` |
| POST | `/my-quotas/request-code` | `bonus-test.ts`, `chamados-test.ts`, `conta-test.ts` +1 |
| POST | `/my-quotas/verify` | `bonus-test.ts`, `chamados-test.ts`, `conta-test.ts` +1 |
| GET | `/my-quotas` | `chamados-test.ts`, `conta-test.ts` |
| GET | `/conta/google/disponivel` | `google-test.ts` |
| GET | `/conta/google/entrar` | `google-test.ts` |
| GET | `/conta/google/ligar` | `google-test.ts` |
| GET | `/conta/google/retorno` | `google-test.ts` |
| POST | `/conta/cpf` | `google-test.ts` |
| POST | `/conta/telefone/codigo` | `google-test.ts` |
| POST | `/conta/telefone/confirmar` | `google-test.ts` |
| DELETE | `/conta/google` | `google-test.ts` |
| POST | `/conta` | `afiliados-test.ts`, `bilhetes-test.ts`, `buscar-test.ts` +15 |
| POST | `/conta/entrar` | `conta-test.ts`, `google-test.ts`, `telas.ts` |
| POST | `/conta/sair` | `bilhetes-test.ts`, `conta-test.ts` |
| GET | `/conta` | `afiliados-test.ts`, `bilhetes-test.ts`, `buscar-test.ts` +15 |
| PUT | `/conta/senha` | `conta-test.ts` |
| PUT | `/conta/cep` | `conta-test.ts` |
| PUT | `/conta/perfil-publico` | `perfil-test.ts` |
| POST | `/conta/excluir` | `bilhetes-test.ts`, `conta-test.ts`, `google-test.ts` +1 |
| GET | `/chamados` | `bonus-test.ts`, `chamados-test.ts`, `conta-test.ts` +1 |
| POST | `/chamados` | `bonus-test.ts`, `chamados-test.ts`, `conta-test.ts` +1 |
| GET | `/chamados/anexos/:id` | `chamados-test.ts` |
| GET | `/chamados/:id` | `chamados-test.ts`, `disputa-test.ts` |
| POST | `/chamados/:id/mensagens` | `chamados-test.ts`, `disputa-test.ts` |
| POST | `/chamados/:id/disputa` | `disputa-test.ts` |
| GET | `/presente` | `presente-test.ts` |
| GET | `/presente/meu` | `presente-test.ts` |
| GET | `/bonus` | `bonus-test.ts` |
| POST | `/bonus/resgatar` | `bonus-test.ts` |
| POST | `/bonus/visita` | `bonus-test.ts` |
| GET | `/marketing` | `marketing-test.ts` |
| GET | `/patrocinadas` | `patrocinio-test.ts`, `aparelhoNaLeitura.test.ts` |
| POST | `/patrocinadas/exibicoes` | `patrocinio-test.ts` |
| POST | `/patrocinadas/:id/clique` | `patrocinio-test.ts`, `aparelhoNaLeitura.test.ts` |
| GET | `/tickets/:code` | — |
| GET | `/tickets/:code/escpos` | — |
| POST | `/tickets/:code/printed` | — |
| GET | `/campaigns/:slug/premios` | — |
| GET | `/sorteio-oficial/:id/ata` | `apuracao-test.ts` |
| GET | `/sorteio-oficial` | `sorteios-oficiais-test.ts` |
| GET | `/sorteio-oficial/:id/comentarios` | `sorteio-comentarios-test.ts` |
| POST | `/sorteio-oficial/:id/comentarios` | `sorteio-comentarios-test.ts` |
| DELETE | `/sorteio-oficial/comentarios/:id` | `isolation-test.ts`, `sorteio-comentarios-test.ts` |
| POST | `/sorteio-oficial/comentarios/:id/denuncia` | `sorteio-comentarios-test.ts` |
| PUT | `/sorteio-oficial/comentarios/:id/curtida` | `sorteio-comentarios-test.ts` |
| GET | `/vitrine/ao-vivo` | `vitrine-test.ts` |
| GET | `/campaigns/:slug/ultimas-compras` | — |
| POST | `/afiliados/cadastro` | `afiliados-test.ts`, `divulgacao-test.ts` |
| GET | `/campaigns/:slug/ranking` | — |
| GET | `/campaigns/:slug/divulgacoes` | `divulgacao-test.ts` |
| GET | `/divulgacoes/feed` | `divulgacao-test.ts` |
| GET | `/divulgacoes/rifas` | `divulgacao-test.ts` |
| GET | `/divulgacoes/minhas` | `divulgacao-test.ts` |
| POST | `/divulgacoes` | `divulgacao-test.ts` |
| GET | `/divulgacoes/minhas/:id/fotos/:fotoId` | — |
| GET | `/divulgacoes/:id/fotos/:fotoId` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/divulgacoes/:id/video` | `divulgacao-test.ts`, `isolation-test.ts` |
| PATCH | `/divulgacoes/:id` | `divulgacao-test.ts` |
| DELETE | `/divulgacoes/:id` | `divulgacao-test.ts` |

### `server/routes/seller.ts` — /api/seller (6 rotas, 6 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `cambista-test.ts` |
| POST | `/sales` | `cambista-test.ts` |
| POST | `/sales/:code/confirm` | `cambista-test.ts` |
| POST | `/sales/:code/cancel` | `cambista-test.ts` |
| GET | `/sales` | `cambista-test.ts` |
| GET | `/settlement` | `cambista-test.ts` |

### `server/routes/verificacaoRotas.ts` — (montada em public.ts, affiliate.ts e admin.ts) (5 rotas, 0 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `${caminho}/consentimento` | — |
| POST | `${caminho}/consentimento` | — |
| DELETE | `${caminho}/consentimento` | — |
| PUT | `${caminho}/documentos/:tipo` | — |
| GET | `${caminho}/documentos/:tipo` | — |

### `server/routes/webhooks.ts` — /api/webhooks (1 rotas, 0 com prova)

| Método | Caminho | Provas |
|---|---|---|
| POST | `/:provider` | — |

## 5. Rotas que nenhuma prova cita

Busca literal do caminho em `scripts/` e `tests/` (a interpolação vale como parâmetro): é a lista do que a reformulação mexe sem rede de proteção. Pode haver prova que chega à rota por outro caminho; o contrário (prova que cita e não confere) a busca não vê.

- `server/routes/admin.ts` (3 de 264): PUT `/media/raw`, DELETE `/prized/:prizedId`, GET `/stories/:id/:qual(imagem|poster)`
- `server/routes/affiliate.ts` (4 de 36): GET `/commissions`, GET `/coupons`, GET `/organizacoes`, GET `/divulgacoes/:id/video`
- `server/routes/public.ts` (18 de 149): GET `/mensagens/conversas/:id/fotos/:fotoId`, GET `/banners/:id/imagem`, GET `/o/:slug/termo-afiliado`, GET `/o/:slug/foto`, GET `/o/:slug/capa`, GET `/u/:apelido/foto`, GET `/cep/:cep`, GET `/campaigns/:slug/certificado`, GET `/campaigns/:slug/foto-ganhador`, GET `/campaigns/:slug/numbers/:number`, POST `/track-click`, GET `/tickets/:code`, GET `/tickets/:code/escpos`, POST `/tickets/:code/printed`, GET `/campaigns/:slug/premios`, GET `/campaigns/:slug/ultimas-compras`, GET `/campaigns/:slug/ranking`, GET `/divulgacoes/minhas/:id/fotos/:fotoId`
- `server/routes/verificacaoRotas.ts` (5 de 5): GET `${caminho}/consentimento`, POST `${caminho}/consentimento`, DELETE `${caminho}/consentimento`, PUT `${caminho}/documentos/:tipo`, GET `${caminho}/documentos/:tipo`
- `server/routes/webhooks.ts` (1 de 1): POST `/:provider`

## 6. Provas contra a API

| `npm run` | Arquivo |
|---|---|
| `acessos` | `scripts/acessos-test.ts` |
| `admin:create` | `scripts/create-admin.ts` |
| `afiliados` | `scripts/afiliados-test.ts` |
| `agenda-rifa` | `scripts/agenda-rifa-test.ts` |
| `anexos` | `scripts/contrato-anexos-test.ts` |
| `aparencia` | `scripts/aparencia-test.ts` |
| `apuracao` | `scripts/apuracao-test.ts` |
| `artes` | `scripts/artes-test.ts` |
| `banner` | `scripts/banner-pago-test.ts` |
| `banner-divulgacao` | `scripts/banner-divulgacao-test.ts` |
| `base-ia` | `scripts/base-ia.ts` |
| `bilhetes` | `scripts/bilhetes-test.ts` |
| `bonus` | `scripts/bonus-test.ts` |
| `buscar` | `scripts/buscar-test.ts` |
| `cambista` | `scripts/cambista-test.ts` |
| `carrinho` | `scripts/carrinho-test.ts` |
| `chamados` | `scripts/chamados-test.ts` |
| `cobranca` | `scripts/cobranca-test.ts` |
| `comentarios` | `scripts/comentarios-test.ts` |
| `conta` | `scripts/conta-test.ts` |
| `contrato` | `scripts/contrato-promotora-test.ts` |
| `db:push` | `scripts/extensoes.ts` |
| `db:seed` | `scripts/seed.ts` |
| `disputa` | `scripts/disputa-test.ts` |
| `divulgacao` | `scripts/divulgacao-test.ts` |
| `fila` | `scripts/fila-test.ts` |
| `fiscal` | `scripts/fiscal-test.ts` |
| `google` | `scripts/google-test.ts` |
| `grupos` | `scripts/grupos-test.ts` |
| `guarda` | `scripts/guarda-test.ts` |
| `ia` | `scripts/ia-test.ts` |
| `ia-acoes` | `scripts/ia-acoes-test.ts` |
| `isolation` | `scripts/isolation-test.ts` |
| `load` | `scripts/load-test.ts` |
| `marketing` | `scripts/marketing-test.ts` |
| `matriz` | `scripts/matriz.ts` |
| `mensagens` | `scripts/mensagens-test.ts` |
| `patrocinio` | `scripts/patrocinio-test.ts` |
| `perfil` | `scripts/perfil-test.ts` |
| `pix-tardio` | `scripts/pix-tardio-test.ts` |
| `poster` | `scripts/poster-test.ts` |
| `presente` | `scripts/presente-test.ts` |
| `publicacao` | `scripts/publicacao-test.ts` |
| `push` | `scripts/push-test.ts` |
| `refund` | `scripts/refund-test.ts` |
| `relogios` | `scripts/relogios-test.ts` |
| `resultados` | `scripts/resultados-test.ts` |
| `retencao` | `scripts/retencao-test.ts` |
| `seguranca` | `scripts/seguranca-test.ts` |
| `senha` | `scripts/senha-test.ts` |
| `solicitacoes` | `scripts/solicitacoes-test.ts` |
| `sorteio-comentarios` | `scripts/sorteio-comentarios-test.ts` |
| `sorteios` | `scripts/sorteios-oficiais-test.ts` |
| `telas` | `scripts/telas.ts` |
| `trafego` | `scripts/trafego-test.ts` |
| `trafego-criacao` | `scripts/trafego-criacao-test.ts` |
| `transparencia` | `scripts/transparencia-test.ts` |
| `verificacao` | `scripts/verificacao-test.ts` |
| `vitrine` | `scripts/vitrine-test.ts` |
