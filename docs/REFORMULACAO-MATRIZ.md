# Matriz de cobertura da reformulação (fase 0)

Gerada do código por `npm run matriz` — **não edite à mão** (o teste `tests/matrizReformulacao.test.ts` falha se ficar velha). O destino de cada tela, seção e cartão mora em `docs/reformulacao-destinos.json`, que a fase 2 (onde mora cada coisa) preenche; enquanto estiver como `a decidir`, a unidade ainda não tem lugar novo.

| O que | Quantos |
|---|---|
| Telas (rotas do `App.tsx`) | 66 (+ 2 redirecionamentos) |
| Seções de acesso (`shared/access.ts`) | 41 |
| Cartões (componentes usados pelas telas) | 866 |
| Rotas da API | 487, das quais 483 citadas por alguma prova |
| Provas contra a API (`npm run …`) | 66 |
| Testes de regra (`tests/`) | 136 arquivos |
| Destinos decididos | 973 de 973 |

## 1. Telas

| Rota | Papel | Seção | Rótulo no menu | Grupo (organizador) | Grupo (plataforma) | Arquivo | Componente | Destino |
|---|---|---|---|---|---|---|---|---|
| `/` | guest | vitrine | Rifas | — | — | `pages/Vitrine.tsx` | Vitrine | manter · 10 · Loja · 01 Vitrine (node 19-1144) · onda 5 |
| `/admin` | organizer | adminPainel | Painel | (sem título) | Painel | `pages/admin.tsx` | AdminPainel | manter · 11 · Painel · P01 Painel (visão geral) (node 32-1288) · onda 2 |
| `/admin/afiliados` | organizer | adminAfiliados | Afiliados | Equipe e marketing | Painel | `pages/admin.tsx` | AdminAfiliados | manter · 11 · Painel · P12 Afiliados (node 43-2125) · onda 2 |
| `/admin/antifraude` | admin | adminAntifraude | Antifraude | — | (sem título) | `pages/adminAntifraude.tsx` | AdminAntifraude | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |
| `/admin/aparencia` | admin | adminAparencia | Aparência | — | Painel | `pages/adminAparencia.tsx` | AdminAparencia | manter · 11 · Painel · P28 Aparência (abas) (node 55-6415) · onda 3 |
| `/admin/atendimento` | organizer | adminAtendimento | Atendimento | (sem título) | (sem título) | `pages/adminAtendimento.tsx` | AdminAtendimento | manter · 11 · Painel · P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) (node 51-3427) · onda 2 |
| `/admin/bonus` | admin | adminBonus | Bônus | — | Painel | `pages/adminBonus.tsx` | AdminBonus | manter · 11 · Painel · P27 Bônus (node 55-5350) · onda 3 |
| `/admin/caixa` | admin | adminCaixa | Tudo | — | (sem título) | `pages/adminCaixa.tsx` | AdminCaixa | manter · 11 · Painel · P22 Caixa de entrada (node 51-4173) · onda 3 |
| `/admin/cambistas` | organizer | adminCambistas | Cambistas | Equipe e marketing | Painel | `pages/adminCambistas.tsx` | AdminCambistas | manter · 11 · Painel · P13 Cambistas (node 44-2097) · onda 2 |
| `/admin/campanhas` | organizer | adminCampanhas | Campanhas | Rifas | Painel | `pages/admin.tsx` | AdminCampanhas | manter · 11 · Painel · P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) (node 33-727) · onda 2 |
| `/admin/cobranca` | organizer | adminCobranca | Cobrança | Vendas | Painel | `pages/adminCobranca.tsx` | AdminCobranca | manter · 11 · Painel · P10 Cobrança (node 41-1633) · onda 2 |
| `/admin/configuracoes` | organizer | adminConfiguracoes | Configurações | Equipe e marketing | Painel | `pages/admin.tsx` | AdminConfiguracoes | manter · 11 · Painel · P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) (node 46-2361) · onda 2 |
| `/admin/exportacoes` | organizer | adminExportacoes | Exportações | Vendas | Painel | `pages/adminExportacoes.tsx` | AdminExportacoes | manter · 11 · Painel · P11 Exportações (node 54-5610) · onda 2 |
| `/admin/financeiro` | organizer | adminFinanceiro | Financeiro | Vendas | Painel | `pages/admin.tsx` | AdminFinanceiro | manter · 11 · Painel · P09 Financeiro (node 40-1503) · onda 2 |
| `/admin/fiscal` | admin | adminFiscal | Cadastros fiscais | — | Painel | `pages/adminFiscal.tsx` | AdminFiscal | manter · 11 · Painel · P26 Cadastros fiscais (node 51-4877) · onda 3 |
| `/admin/marketing` | organizer | adminMarketing | Medição e campanhas | Equipe e marketing | Painel | `pages/adminMarketing.tsx` | AdminMarketing | manter · 11 · Painel · P19 Medição e campanhas (node 51-3059) · onda 2 |
| `/admin/marketing/ia` | organizer | adminMarketingIA | Marketing AI | Equipe e marketing | Painel | `pages/adminMarketingIA.tsx` | AdminMarketingIA | manter · 11 · Painel · P17 Marketing AI (node 54-6576) · onda 2 |
| `/admin/marketing/publicidade` | organizer | adminPublicidade | Publicidade | Equipe e marketing | Painel | `pages/adminPublicidade.tsx` | AdminPublicidade | manter · 11 · Painel · P18 Publicidade (abas) (node 54-7386) · onda 2 |
| `/admin/marketing/trafego` | organizer | adminTrafego | Tráfego pago | Equipe e marketing | Painel | `pages/adminTrafego.tsx` | AdminTrafego | manter · 11 · Painel · P16 Tráfego pago (node 47-2485) · onda 2 |
| `/admin/organizacoes` | admin | adminOrganizacoes | Organizações | — | Painel | `pages/adminOrganizacoes.tsx` | AdminOrganizacoes | manter · 11 · Painel · P25 Organizações (node 55-4792) · onda 3 |
| `/admin/pedidos` | organizer | adminPedidos | Pedidos | Vendas | Painel | `pages/admin.tsx` | AdminPedidos | manter · 11 · Painel · P04 Pedidos (node 35-1137) · onda 2 |
| `/admin/resultados` | organizer | adminResultados | Resultados | Rifas | Painel | `pages/adminResultados.tsx` | AdminResultados | manter · 11 · Painel · P05 Resultados (node 36-1198) · onda 2 |
| `/admin/sorteios` | organizer | adminSorteios | Sorteios | Rifas | Painel | `pages/admin.tsx` | AdminSorteios | manter · 11 · Painel · P07 Sorteios (node 38-1355) · onda 2 |
| `/admin/sorteios-oficiais` | organizer | adminSorteiosOficiais | Sorteios oficiais | Rifas | Painel | `pages/adminSorteiosOficiais.tsx` | AdminSorteiosOficiais | manter · 11 · Painel · P08 Sorteios oficiais (calendário) (node 39-1742) · onda 2 |
| `/admin/stories` | organizer | adminStories | Stories | Rifas | Painel | `pages/adminStories.tsx` | AdminStories | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |
| `/admin/usuarios` | organizer | adminUsuarios | Usuários | Equipe e marketing | Painel | `pages/adminUsuarios.tsx` | AdminUsuarios | manter · 11 · Painel · P14 Usuários (node 45-2338) · onda 2 |
| `/afiliado` | affiliate | afiliadoPainel | Visão geral | — | — | `pages/afiliado.tsx` | AfiliadoPainel | manter · 12 · Afiliado e cambista · A01 Visão geral do afiliado (node 58-409) · onda 4 |
| `/afiliado/comissoes` | affiliate | afiliadoComissoes | Comissões | — | — | `pages/afiliado.tsx` | AfiliadoComissoes | manter · 12 · Afiliado e cambista · A05 Comissões (node 58-1715) · onda 4 |
| `/afiliado/dados` | affiliate | afiliadoDados | Meus dados | — | — | `pages/afiliadoDados.tsx` | AfiliadoDados | manter · 12 · Afiliado e cambista · A07 Meus dados (node 59-1644) · onda 4 |
| `/afiliado/divulgar` | affiliate | afiliadoDivulgar | Divulgar | — | — | `pages/afiliadoDivulgar.tsx` | AfiliadoDivulgar | manter · 12 · Afiliado e cambista · A03 Divulgar (node 58-1203) · onda 4 |
| `/afiliado/links` | affiliate | afiliadoLinks | Meus links | — | — | `pages/afiliado.tsx` | AfiliadoLinks | manter · 12 · Afiliado e cambista · A02 Meus links (node 58-928) · onda 4 |
| `/afiliado/organizacoes` | affiliate | afiliadoOrganizacoes | Organizações | — | — | `pages/afiliado.tsx` | AfiliadoOrganizacoes | manter · 12 · Afiliado e cambista · A04 Organizações do afiliado (node 58-1458) · onda 4 |
| `/afiliado/saques` | affiliate | afiliadoSaques | Saques | — | — | `pages/afiliado.tsx` | AfiliadoSaques | manter · 12 · Afiliado e cambista · A06 Saques (node 58-2028) · onda 4 |
| `/ajuda` | público | — | — | — | — | `pages/Ajuda.tsx` | Ajuda | manter · 10 · Loja · 18 Central de ajuda (node 28-3120) · onda 5 |
| `/bilhete/:code` | público | — | — | — | — | `pages/Bilhete.tsx` | Bilhete | manter · 10 · Loja · 22 Bilhete (node 29-3414) · onda 5 |
| `/buscar` | público | — | — | — | — | `pages/Buscar.tsx` | Buscar | manter · 10 · Loja · 17 Buscar (node 27-3422) · onda 5 |
| `/cambista` | cambista | cambistaVenda | Nova venda | — | — | `pages/cambista.tsx` | CambistaVenda | manter · 12 · Afiliado e cambista · C08 Nova venda do cambista (node 59-1974) · onda 4 |
| `/cambista/acerto` | cambista | cambistaAcerto | Meu acerto | — | — | `pages/cambista.tsx` | CambistaAcerto | manter · 12 · Afiliado e cambista · C10 Meu acerto (node 59-2411) · onda 4 |
| `/cambista/vendas` | cambista | cambistaVendas | Minhas vendas | — | — | `pages/cambista.tsx` | CambistaVendas | manter · 12 · Afiliado e cambista · C09 Minhas vendas (node 59-2180) · onda 4 |
| `/carrinho` | público | — | — | — | — | `pages/Carrinho.tsx` | Carrinho | manter · 10 · Loja · 06 Carrinho (node 23-1850) · onda 5 |
| `/carrinho/pix/:codigo` | público | — | — | — | — | `pages/CarrinhoPix.tsx` | CarrinhoPix | manter · 10 · Loja · 08 Pix do carrinho (node 24-2131) · onda 5 |
| `/conta/senha` | conta | — | — | — | — | `components/TrocarSenha.tsx` | TrocarSenha | manter · 11 · Painel · P21 Minha senha (node 51-3771) · onda 2 |
| `/criar-conta` | público | — | — | — | — | `pages/CriarConta.tsx` | CriarConta | manter · 10 · Loja · 24 Criar conta (node 30-3352) · onda 5 |
| `/entrar` | público | — | — | — | — | `pages/Login.tsx` | Login | manter · 10 · Loja · 23 Entrar (node 30-3205) · onda 5 |
| `/estado/:uf` | público | — | — | — | — | `pages/Estado.tsx` | EstadoPage | manter · 10 · Loja · 04 Página do estado (node 22-1904) · onda 5 |
| `/mensagens` | público | — | — | — | — | `pages/Mensagens.tsx` | Mensagens | manter · 10 · Loja · 16 Mensagens (node 27-3109) · onda 5 |
| `/mensagens/:id` | público | — | — | — | — | `pages/Mensagens.tsx` | Mensagens | manter · 10 · Loja · 16 Mensagens (node 27-3109) · onda 5 |
| `/minhas-compras` | público | — | — | — | — | `pages/MinhasCotas.tsx` | MinhasCotas | manter · 10 · Loja · 09 Minhas compras (node 25-1969) · onda 5 |
| `/minhas-cotas` | guest | minhasCotas | Minhas cotas | — | — | `pages/MinhasCotas.tsx` | MinhasCotas | manter · 10 · Loja · 09 Minhas compras (node 25-1969) · onda 5 |
| `/notificacoes` | público | — | — | — | — | `pages/Notificacoes.tsx` | Notificacoes | manter · 10 · Loja · 10 Notificações (node 25-2159) · onda 5 |
| `/o/:org` | público | — | — | — | — | `pages/Perfil.tsx` | Perfil | manter · 10 · Loja · 03 Perfil da organização (node 21-1489) · onda 5 |
| `/o/:org/r/:slug` | público | — | — | — | — | `pages/Rifa.tsx` | Rifa | manter · 10 · Loja · 02 Página da rifa (node 20-1175) · onda 5 |
| `/o/:org/r/:slug/regulamento` | público | — | — | — | — | `pages/Regulamento.tsx` | Regulamento | manter · 10 · Loja · 20 Regulamento da rifa (node 28-3547) · onda 5 |
| `/pedido/:code` | guest | checkout | Pedido | — | — | `pages/Pedido.tsx` | Pedido | manter · 10 · Loja · 07 Pedido (node 24-1856) · onda 5 |
| `/perfil` | público | — | — | — | — | `pages/PerfilDoUsuario.tsx` | PerfilDoUsuario | manter · 10 · Loja · 11 Perfil (node 25-2481) · onda 5 |
| `/perfil/bilhetes` | público | — | — | — | — | `pages/MeusBilhetes.tsx` | MeusBilhetes | manter · 10 · Loja · 13 Meus bilhetes privados (node 26-2747) · onda 5 |
| `/perfil/configuracoes` | público | — | — | — | — | `pages/Configuracoes.tsx` | Configuracoes | manter · 10 · Loja · 12 Configurações do apostador (node 26-2569) · onda 5 |
| `/privacidade` | público | — | — | — | — | `pages/Legal.tsx` | Privacidade | manter · 10 · Loja · 19 Termos de uso e Privacidade (node 28-3320) · onda 5 |
| `/publicar` | público | — | — | — | — | `pages/Publicar.tsx` | Publicar | manter · 10 · Loja · 14 Publicar (node 26-2914) · onda 5 |
| `/r/:slug` | guest | campanha | Rifa | — | — | `pages/Rifa.tsx` | Rifa | manter · 10 · Loja · 02 Página da rifa (node 20-1175) · onda 5 |
| `/r/:slug/regulamento` | público | — | — | — | — | `pages/Regulamento.tsx` | Regulamento | manter · 10 · Loja · 20 Regulamento da rifa (node 28-3547) · onda 5 |
| `/recibo/:codigo` | público | — | — | — | — | `pages/Recibo.tsx` | ReciboPage | manter · 10 · Loja · 21 Recibo (node 29-3264) · onda 5 |
| `/reels` | público | — | — | — | — | `pages/Reels.tsx` | Reels | manter · 10 · Loja · 15 Reels (node 27-2744) · onda 5 |
| `/seja-afiliado` | público | — | — | — | — | `pages/CadastroAfiliado.tsx` | CadastroAfiliado | manter · 10 · Loja · 25 Seja afiliado (node 30-3436) · onda 5 |
| `/termos` | público | — | — | — | — | `pages/Legal.tsx` | TermosDeUso | manter · 10 · Loja · 19 Termos de uso e Privacidade (node 28-3320) · onda 5 |
| `/u/:apelido` | público | — | — | — | — | `pages/Usuario.tsx` | Usuario | manter · 10 · Loja · 05 Perfil do apostador (node 22-2628) · onda 5 |

Redirecionamentos (o endereço de antes segue valendo):

- `/admin/patrocinio` → `/admin/marketing/publicidade`
- `/admin/banner-pago` → `/admin/marketing/publicidade?aba=banner`

## 2. Seções de acesso

| Seção | Rota | Rótulo | Papel mínimo | No menu | Grupo (do papel) | Grupo (plataforma) | Tem tela | Destino |
|---|---|---|---|---|---|---|---|---|
| `vitrine` | `/` | Rifas | guest | não | — | — | sim | manter · 10 · Loja · 01 Vitrine (node 19-1144) · onda 5 |
| `campanha` | `/r/:slug` | Rifa | guest | não | — | — | sim | manter · 10 · Loja · 02 Página da rifa (node 20-1175) · onda 5 |
| `checkout` | `/pedido/:code` | Pedido | guest | não | — | — | sim | manter · 10 · Loja · 07 Pedido (node 24-1856) · onda 5 |
| `minhasCotas` | `/minhas-cotas` | Minhas cotas | guest | não | — | — | sim | manter · 10 · Loja · 09 Minhas compras (node 25-1969) · onda 5 |
| `afiliadoPainel` | `/afiliado` | Visão geral | affiliate | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · A01 Visão geral do afiliado (node 58-409) · onda 4 |
| `afiliadoLinks` | `/afiliado/links` | Meus links | affiliate | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · A02 Meus links (node 58-928) · onda 4 |
| `afiliadoOrganizacoes` | `/afiliado/organizacoes` | Organizações | affiliate | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · A04 Organizações do afiliado (node 58-1458) · onda 4 |
| `afiliadoDivulgar` | `/afiliado/divulgar` | Divulgar | affiliate | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · A03 Divulgar (node 58-1203) · onda 4 |
| `afiliadoComissoes` | `/afiliado/comissoes` | Comissões | affiliate | sim | Dinheiro | — | sim | manter · 12 · Afiliado e cambista · A05 Comissões (node 58-1715) · onda 4 |
| `afiliadoSaques` | `/afiliado/saques` | Saques | affiliate | sim | Dinheiro | — | sim | manter · 12 · Afiliado e cambista · A06 Saques (node 58-2028) · onda 4 |
| `afiliadoDados` | `/afiliado/dados` | Meus dados | affiliate | sim | Dinheiro | — | sim | manter · 12 · Afiliado e cambista · A07 Meus dados (node 59-1644) · onda 4 |
| `cambistaVenda` | `/cambista` | Nova venda | cambista | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · C08 Nova venda do cambista (node 59-1974) · onda 4 |
| `cambistaVendas` | `/cambista/vendas` | Minhas vendas | cambista | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · C09 Minhas vendas (node 59-2180) · onda 4 |
| `cambistaAcerto` | `/cambista/acerto` | Meu acerto | cambista | sim | (sem título) | — | sim | manter · 12 · Afiliado e cambista · C10 Meu acerto (node 59-2411) · onda 4 |
| `adminPainel` | `/admin` | Painel | organizer | sim | (sem título) | Painel | sim | manter · 11 · Painel · P01 Painel (visão geral) (node 32-1288) · onda 2 |
| `adminCampanhas` | `/admin/campanhas` | Campanhas | organizer | sim | Rifas | Painel | sim | manter · 11 · Painel · P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) (node 33-727) · onda 2 |
| `adminPedidos` | `/admin/pedidos` | Pedidos | organizer | sim | Vendas | Painel | sim | manter · 11 · Painel · P04 Pedidos (node 35-1137) · onda 2 |
| `adminResultados` | `/admin/resultados` | Resultados | organizer | sim | Rifas | Painel | sim | manter · 11 · Painel · P05 Resultados (node 36-1198) · onda 2 |
| `adminAtendimento` | `/admin/atendimento` | Atendimento | organizer | sim | (sem título) | (sem título) | sim | manter · 11 · Painel · P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) (node 51-3427) · onda 2 |
| `adminStories` | `/admin/stories` | Stories | organizer | sim | Rifas | Painel | sim | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |
| `adminTrafego` | `/admin/marketing/trafego` | Tráfego pago | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P16 Tráfego pago (node 47-2485) · onda 2 |
| `adminMarketingIA` | `/admin/marketing/ia` | Marketing AI | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P17 Marketing AI (node 54-6576) · onda 2 |
| `adminPublicidade` | `/admin/marketing/publicidade` | Publicidade | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P18 Publicidade (abas) (node 54-7386) · onda 2 |
| `adminPatrocinio` | `/admin/patrocinio` | Rifas patrocinadas | organizer | não | — | — | **não** | manter · aba de 11 · Painel · P18 Publicidade (abas) (node 54-7386) · onda 2 (o endereço antigo redireciona; fora do menu) |
| `adminBannerPago` | `/admin/banner-pago` | Banner na vitrine | organizer | não | — | — | **não** | manter · aba de 11 · Painel · P18 Publicidade (abas) (node 54-7386) · onda 2 (o endereço antigo redireciona; fora do menu) |
| `adminMarketing` | `/admin/marketing` | Medição e campanhas | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P19 Medição e campanhas (node 51-3059) · onda 2 |
| `adminAfiliados` | `/admin/afiliados` | Afiliados | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P12 Afiliados (node 43-2125) · onda 2 |
| `adminCambistas` | `/admin/cambistas` | Cambistas | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P13 Cambistas (node 44-2097) · onda 2 |
| `adminUsuarios` | `/admin/usuarios` | Usuários | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P14 Usuários (node 45-2338) · onda 2 |
| `adminFinanceiro` | `/admin/financeiro` | Financeiro | organizer | sim | Vendas | Painel | sim | manter · 11 · Painel · P09 Financeiro (node 40-1503) · onda 2 |
| `adminSorteios` | `/admin/sorteios` | Sorteios | organizer | sim | Rifas | Painel | sim | manter · 11 · Painel · P07 Sorteios (node 38-1355) · onda 2 |
| `adminSorteiosOficiais` | `/admin/sorteios-oficiais` | Sorteios oficiais | organizer | sim | Rifas | Painel | sim | manter · 11 · Painel · P08 Sorteios oficiais (calendário) (node 39-1742) · onda 2 |
| `adminExportacoes` | `/admin/exportacoes` | Exportações | organizer | sim | Vendas | Painel | sim | manter · 11 · Painel · P11 Exportações (node 54-5610) · onda 2 |
| `adminCobranca` | `/admin/cobranca` | Cobrança | organizer | sim | Vendas | Painel | sim | manter · 11 · Painel · P10 Cobrança (node 41-1633) · onda 2 |
| `adminConfiguracoes` | `/admin/configuracoes` | Configurações | organizer | sim | Equipe e marketing | Painel | sim | manter · 11 · Painel · P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) (node 46-2361) · onda 2 |
| `adminOrganizacoes` | `/admin/organizacoes` | Organizações | admin | sim | Painel | Painel | sim | manter · 11 · Painel · P25 Organizações (node 55-4792) · onda 3 |
| `adminAntifraude` | `/admin/antifraude` | Antifraude | admin | sim | (sem título) | (sem título) | sim | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |
| `adminAparencia` | `/admin/aparencia` | Aparência | admin | sim | Painel | Painel | sim | manter · 11 · Painel · P28 Aparência (abas) (node 55-6415) · onda 3 |
| `adminCaixa` | `/admin/caixa` | Tudo | admin | sim | (sem título) | (sem título) | sim | manter · 11 · Painel · P22 Caixa de entrada (node 51-4173) · onda 3 |
| `adminFiscal` | `/admin/fiscal` | Cadastros fiscais | admin | sim | Painel | Painel | sim | manter · 11 · Painel · P26 Cadastros fiscais (node 51-4877) · onda 3 |
| `adminBonus` | `/admin/bonus` | Bônus | admin | sim | Painel | Painel | sim | manter · 11 · Painel · P27 Bônus (node 55-5350) · onda 3 |

## 3. Cartões por tela

Cada componente que a tela importa de `components/` precisa de lugar novo (ou da decisão de sair).

### `/` — Rifas

| Cartão | Destino |
|---|---|
| `BannersVitrine` | manter · na tela 01 Vitrine · onda 5 |
| `CartaoDeDivulgacao` | manter · na tela 01 Vitrine · onda 5 |
| `CartaoDoFeed` | manter · na tela 01 Vitrine · onda 5 |
| `ColunaAoVivo` | manter · na tela 01 Vitrine · onda 5 |
| `ContagemDoSorteio` | manter · na tela 01 Vitrine · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 01 Vitrine |
| `FotoComStory` | manter · na tela 01 Vitrine · onda 5 |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 01 Vitrine |
| `InstalarApp` | manter · na tela 01 Vitrine · onda 5 |
| `Patrocinadas` | manter · na tela 01 Vitrine · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 01 Vitrine |
| `SeletorDeRegiao` | manter · na tela 01 Vitrine · onda 5 |
| `SorteioDoInicio` | manter · na tela 01 Vitrine · onda 5 |
| `VisualizadorDeStories` | manter · na tela 01 Vitrine · onda 5 |

### `/admin` — Painel

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `AbrirEditorDeImagem` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `AdiarSorteioCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `ArtesParaDivulgar` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `Button` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `Caixa` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `CampaignExtras` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `Card` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `CobrancaDaRifaCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `ComissaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `ContestacoesAConferir` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `CoresDoSeloCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `DadosLegaisCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `EditarRifaCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `EnderecoCurto` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `EnderecoForm` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `LegendaCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `MediaManager` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `PagamentosCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `PerfilPublicoForm` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `PixTardios` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `ReelsDaRifa` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `ReembolsoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `SociosDaOrganizacaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `TelefoneDoOrganizadorCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `TransmissaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `TrocarSenha` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P01 Painel (visão geral) |
| `VerificacaoCard` | manter · na tela P01 Painel (visão geral) · onda 2 |
| `WhatsAppCard` | manter · na tela P01 Painel (visão geral) · onda 2 |

### `/admin/afiliados` — Afiliados

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `AbrirEditorDeImagem` | manter · na tela P12 Afiliados · onda 2 |
| `AdiarSorteioCard` | manter · na tela P12 Afiliados · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `ArtesParaDivulgar` | manter · na tela P12 Afiliados · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `Button` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `Caixa` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `CampaignExtras` | manter · na tela P12 Afiliados · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `Card` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `CobrancaDaRifaCard` | manter · na tela P12 Afiliados · onda 2 |
| `ComissaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `ContestacoesAConferir` | manter · na tela P12 Afiliados · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P12 Afiliados · onda 2 |
| `CoresDoSeloCard` | manter · na tela P12 Afiliados · onda 2 |
| `DadosLegaisCard` | manter · na tela P12 Afiliados · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P12 Afiliados · onda 2 |
| `EditarRifaCard` | manter · na tela P12 Afiliados · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `EnderecoCurto` | manter · na tela P12 Afiliados · onda 2 |
| `EnderecoForm` | manter · na tela P12 Afiliados · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `LegendaCard` | manter · na tela P12 Afiliados · onda 2 |
| `MediaManager` | manter · na tela P12 Afiliados · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `PagamentosCard` | manter · na tela P12 Afiliados · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `PerfilPublicoForm` | manter · na tela P12 Afiliados · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `PixTardios` | manter · na tela P12 Afiliados · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `ReelsDaRifa` | manter · na tela P12 Afiliados · onda 2 |
| `ReembolsoCard` | manter · na tela P12 Afiliados · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `SociosDaOrganizacaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `TelefoneDoOrganizadorCard` | manter · na tela P12 Afiliados · onda 2 |
| `TransmissaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `TrocarSenha` | manter · na tela P12 Afiliados · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P12 Afiliados |
| `VerificacaoCard` | manter · na tela P12 Afiliados · onda 2 |
| `WhatsAppCard` | manter · na tela P12 Afiliados · onda 2 |

### `/admin/antifraude` — Antifraude

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `Button` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `Caixa` | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |
| `Campo` | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |
| `CartaoDoPainel` | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |
| `Empty` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `Kpi` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `Pill` | manter · peça do kit (onda 1) · na tela P24 Antifraude (abas) |
| `TabelaOuCartoes` | manter · 11 · Painel · P24 Antifraude (abas) (node 55-4327) · onda 3 |

### `/admin/aparencia` — Aparência

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `AssistenteIACard` | manter · na tela P28 Aparência (abas) · onda 3 |
| `BannersCard` | manter · na tela P28 Aparência (abas) · onda 3 |
| `Button` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `Caixa` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `Campo` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `DadosDaEmpresaCard` | manter · na tela P28 Aparência (abas) · onda 3 |
| `Filtros` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `Pill` | manter · peça do kit (onda 1) · na tela P28 Aparência (abas) |
| `TopoDoAppCard` | manter · na tela P28 Aparência (abas) · onda 3 |
| `UsoDoAssistenteCard` | manter · na tela P28 Aparência (abas) · onda 3 |

### `/admin/atendimento` — Atendimento

| Cartão | Destino |
|---|---|
| `Abas` | manter · 11 · Painel · P20 Atendimento do organizador (node 51-3427) · onda 2 |
| `Button` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `Caixa` | manter · 11 · Painel · P20 Atendimento do organizador (node 51-3427) · onda 2 |
| `Campo` | manter · 11 · Painel · P20 Atendimento do organizador (node 51-3427) · onda 2 |
| `CartaoDoPainel` | manter · 11 · Painel · P20 Atendimento do organizador (node 51-3427) · onda 2 |
| `Conversa` | manter · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) · onda 2 |
| `DenunciasDaPlataforma` | manter · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `EntidadesDaPlataforma` | manter · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) · onda 2 |
| `Filtros` | manter · 11 · Painel · P20 Atendimento do organizador (node 51-3427) · onda 2 |
| `MestreDetalhe` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `Money` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `Pill` | manter · peça do kit (onda 1) · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) |
| `SolicitacoesDeRifa` | manter · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) · onda 2 |
| `VerificacoesDaPlataforma` | manter · na tela P20 Atendimento do organizador + P23 da plataforma (abas, 51-4545) · onda 2 |

### `/admin/bonus` — Bônus

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `Caixa` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `Campo` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `Empty` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P27 Bônus |
| `Pill` | manter · peça do kit (onda 1) · na tela P27 Bônus |

### `/admin/caixa` — Tudo

| Cartão | Destino |
|---|---|
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P22 Caixa de entrada |
| `Empty` | manter · peça do kit (onda 1) · na tela P22 Caixa de entrada |
| `Filtros` | manter · peça do kit (onda 1) · na tela P22 Caixa de entrada |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P22 Caixa de entrada |
| `Pill` | manter · 11 · Painel · P22 Caixa de entrada (node 51-4173) · onda 3 |
| `TabelaOuCartoes` | manter · 11 · Painel · P22 Caixa de entrada (node 51-4173) · onda 3 |

### `/admin/cambistas` — Cambistas

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `Campo` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `Empty` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `Money` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `Pill` | manter · peça do kit (onda 1) · na tela P13 Cambistas |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P13 Cambistas |

### `/admin/campanhas` — Campanhas

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `AbrirEditorDeImagem` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `AdiarSorteioCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `ArtesParaDivulgar` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `Button` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `Caixa` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `CampaignExtras` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `Card` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `CobrancaDaRifaCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `ComissaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `ContestacoesAConferir` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `CoresDoSeloCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `DadosLegaisCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `EditarRifaCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `EnderecoCurto` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `EnderecoForm` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `LegendaCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `MediaManager` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `PagamentosCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `PerfilPublicoForm` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `PixTardios` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `ReelsDaRifa` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `ReembolsoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `SociosDaOrganizacaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `TelefoneDoOrganizadorCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `TransmissaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `TrocarSenha` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) |
| `VerificacaoCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |
| `WhatsAppCard` | manter · na tela P02 Rifas (grade de capas) + P03 Editar rifa (abas, 54-4503) · onda 2 |

### `/admin/cobranca` — Cobrança

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `Campo` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `CartaoDoPainel` | manter · 11 · Painel · P10 Cobrança (node 41-1633) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `Kpi` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `Money` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `Pill` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `RetencoesCautelares` | manter · na tela P10 Cobrança · onda 2 |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P10 Cobrança |
| `VerMais` | manter · peça do kit (onda 1) · na tela P10 Cobrança |

### `/admin/configuracoes` — Configurações

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `AbrirEditorDeImagem` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `AdiarSorteioCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `ArtesParaDivulgar` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `Button` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `Caixa` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `CampaignExtras` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `Card` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `CobrancaDaRifaCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `ComissaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `ContestacoesAConferir` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `CoresDoSeloCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `DadosLegaisCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `EditarRifaCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `EnderecoCurto` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `EnderecoForm` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `LegendaCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `MediaManager` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `PagamentosCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `PerfilPublicoForm` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `PixTardios` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `ReelsDaRifa` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `ReembolsoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `SociosDaOrganizacaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `TelefoneDoOrganizadorCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `TransmissaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `TrocarSenha` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) |
| `VerificacaoCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |
| `WhatsAppCard` | manter · na tela P15 Configurações do organizador (abas) + P29 da plataforma (51-5240) · onda 2 |

### `/admin/exportacoes` — Exportações

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P11 Exportações |
| `Campo` | manter · 11 · Painel · P11 Exportações (node 54-5610) · onda 2 |
| `CartaoDoPainel` | manter · 11 · Painel · P11 Exportações (node 54-5610) · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P11 Exportações |
| `Pill` | manter · peça do kit (onda 1) · na tela P11 Exportações |

### `/admin/financeiro` — Financeiro

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `AbrirEditorDeImagem` | manter · na tela P09 Financeiro · onda 2 |
| `AdiarSorteioCard` | manter · na tela P09 Financeiro · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `ArtesParaDivulgar` | manter · na tela P09 Financeiro · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `Button` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `Caixa` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `CampaignExtras` | manter · na tela P09 Financeiro · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `Card` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `CobrancaDaRifaCard` | manter · na tela P09 Financeiro · onda 2 |
| `ComissaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `ContestacoesAConferir` | manter · na tela P09 Financeiro · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P09 Financeiro · onda 2 |
| `CoresDoSeloCard` | manter · na tela P09 Financeiro · onda 2 |
| `DadosLegaisCard` | manter · na tela P09 Financeiro · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P09 Financeiro · onda 2 |
| `EditarRifaCard` | manter · na tela P09 Financeiro · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `EnderecoCurto` | manter · na tela P09 Financeiro · onda 2 |
| `EnderecoForm` | manter · na tela P09 Financeiro · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `LegendaCard` | manter · na tela P09 Financeiro · onda 2 |
| `MediaManager` | manter · na tela P09 Financeiro · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `PagamentosCard` | manter · na tela P09 Financeiro · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `PerfilPublicoForm` | manter · na tela P09 Financeiro · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `PixTardios` | manter · na tela P09 Financeiro · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `ReelsDaRifa` | manter · na tela P09 Financeiro · onda 2 |
| `ReembolsoCard` | manter · na tela P09 Financeiro · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `SociosDaOrganizacaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `TelefoneDoOrganizadorCard` | manter · na tela P09 Financeiro · onda 2 |
| `TransmissaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `TrocarSenha` | manter · na tela P09 Financeiro · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P09 Financeiro |
| `VerificacaoCard` | manter · na tela P09 Financeiro · onda 2 |
| `WhatsAppCard` | manter · na tela P09 Financeiro · onda 2 |

### `/admin/fiscal` — Cadastros fiscais

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P26 Cadastros fiscais |
| `Campo` | manter · 11 · Painel · P26 Cadastros fiscais (node 51-4877) · onda 3 |
| `CartaoDoPainel` | manter · 11 · Painel · P26 Cadastros fiscais (node 51-4877) · onda 3 |
| `Empty` | manter · peça do kit (onda 1) · na tela P26 Cadastros fiscais |
| `MestreDetalhe` | manter · 11 · Painel · P26 Cadastros fiscais (node 51-4877) · onda 3 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P26 Cadastros fiscais |
| `Pill` | manter · peça do kit (onda 1) · na tela P26 Cadastros fiscais |

### `/admin/marketing` — Medição e campanhas

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `Campo` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `Empty` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `Filtros` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `Pill` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P19 Medição e campanhas |

### `/admin/marketing/ia` — Marketing AI

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela P17 Marketing AI · onda 2 |
| `ArtesParaDivulgar` | manter · na tela P17 Marketing AI · onda 2 |
| `Button` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `Campo` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `Empty` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `Pill` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |
| `ReelsDaRifa` | manter · na tela P17 Marketing AI · onda 2 |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela P17 Marketing AI |

### `/admin/marketing/publicidade` — Publicidade

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P18 Publicidade (abas) |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P18 Publicidade (abas) |

### `/admin/marketing/trafego` — Tráfego pago

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Caixa` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Campo` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Empty` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Money` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Pill` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |
| `Progress` | manter · peça do kit (onda 1) · na tela P16 Tráfego pago |

### `/admin/organizacoes` — Organizações

| Cartão | Destino |
|---|---|
| `AprovarTelefone` | manter · na tela P25 Organizações · onda 3 |
| `Button` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `Campo` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `Empty` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `EnderecoForm` | manter · na tela P25 Organizações · onda 3 |
| `Filtros` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `PerfilPublicoForm` | manter · na tela P25 Organizações · onda 3 |
| `Pill` | manter · peça do kit (onda 1) · na tela P25 Organizações |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P25 Organizações |

### `/admin/pedidos` — Pedidos

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `AbrirEditorDeImagem` | manter · na tela P04 Pedidos · onda 2 |
| `AdiarSorteioCard` | manter · na tela P04 Pedidos · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `ArtesParaDivulgar` | manter · na tela P04 Pedidos · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `Button` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `Caixa` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `CampaignExtras` | manter · na tela P04 Pedidos · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `Card` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `CobrancaDaRifaCard` | manter · na tela P04 Pedidos · onda 2 |
| `ComissaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `ContestacoesAConferir` | manter · na tela P04 Pedidos · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P04 Pedidos · onda 2 |
| `CoresDoSeloCard` | manter · na tela P04 Pedidos · onda 2 |
| `DadosLegaisCard` | manter · na tela P04 Pedidos · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P04 Pedidos · onda 2 |
| `EditarRifaCard` | manter · na tela P04 Pedidos · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `EnderecoCurto` | manter · na tela P04 Pedidos · onda 2 |
| `EnderecoForm` | manter · na tela P04 Pedidos · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `LegendaCard` | manter · na tela P04 Pedidos · onda 2 |
| `MediaManager` | manter · na tela P04 Pedidos · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `PagamentosCard` | manter · na tela P04 Pedidos · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `PerfilPublicoForm` | manter · na tela P04 Pedidos · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `PixTardios` | manter · na tela P04 Pedidos · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `ReelsDaRifa` | manter · na tela P04 Pedidos · onda 2 |
| `ReembolsoCard` | manter · na tela P04 Pedidos · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `SociosDaOrganizacaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `TelefoneDoOrganizadorCard` | manter · na tela P04 Pedidos · onda 2 |
| `TransmissaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `TrocarSenha` | manter · na tela P04 Pedidos · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P04 Pedidos |
| `VerificacaoCard` | manter · na tela P04 Pedidos · onda 2 |
| `WhatsAppCard` | manter · na tela P04 Pedidos · onda 2 |

### `/admin/resultados` — Resultados

| Cartão | Destino |
|---|---|
| `CartaoDoPainel` | manter · 11 · Painel · P05 Resultados (node 36-1198) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P05 Resultados |
| `Filtros` | manter · peça do kit (onda 1) · na tela P05 Resultados |
| `Kpi` | manter · peça do kit (onda 1) · na tela P05 Resultados |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P05 Resultados |

### `/admin/sorteios` — Sorteios

| Cartão | Destino |
|---|---|
| `Abas` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `AbrirEditorDeImagem` | manter · na tela P07 Sorteios · onda 2 |
| `AdiarSorteioCard` | manter · na tela P07 Sorteios · onda 2 |
| `AgendarPublicacaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `AlternarVisao` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `ArtesParaDivulgar` | manter · na tela P07 Sorteios · onda 2 |
| `BannerDivulgacaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `BarraDeAcessos` | manter · na tela P01 Painel (visão geral) · onda 2 (a barra só aparece no Painel; o gerador marca o arquivo admin.tsx inteiro) |
| `BarrasHorizontais` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `Button` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `CabecalhoDaTabela` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `Caixa` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `CampaignExtras` | manter · na tela P07 Sorteios · onda 2 |
| `Campo` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `Card` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `CobrancaDaRifaCard` | manter · na tela P07 Sorteios · onda 2 |
| `ComissaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `ContestacoesAConferir` | manter · na tela P07 Sorteios · onda 2 |
| `ContratoPromotoraCard` | manter · na tela P07 Sorteios · onda 2 |
| `CoresDoSeloCard` | manter · na tela P07 Sorteios · onda 2 |
| `DadosLegaisCard` | manter · na tela P07 Sorteios · onda 2 |
| `DivulgacoesDaOrganizacao` | manter · na tela P07 Sorteios · onda 2 |
| `EditarRifaCard` | manter · na tela P07 Sorteios · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `EnderecoCurto` | manter · na tela P07 Sorteios · onda 2 |
| `EnderecoForm` | manter · na tela P07 Sorteios · onda 2 |
| `Estatistica` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `LegendaCard` | manter · na tela P07 Sorteios · onda 2 |
| `MediaManager` | manter · na tela P07 Sorteios · onda 2 |
| `Money` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `PagamentosCard` | manter · na tela P07 Sorteios · onda 2 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `PerfilPublicoForm` | manter · na tela P07 Sorteios · onda 2 |
| `Pill` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `PixTardios` | manter · na tela P07 Sorteios · onda 2 |
| `Progress` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `ReelsDaRifa` | manter · na tela P07 Sorteios · onda 2 |
| `ReembolsoCard` | manter · na tela P07 Sorteios · onda 2 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `SociosDaOrganizacaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `Sparkline` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `TelefoneDoOrganizadorCard` | manter · na tela P07 Sorteios · onda 2 |
| `TransmissaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `TrocarSenha` | manter · na tela P07 Sorteios · onda 2 |
| `VerMais` | manter · peça do kit (onda 1) · na tela P07 Sorteios |
| `VerificacaoCard` | manter · na tela P07 Sorteios · onda 2 |
| `WhatsAppCard` | manter · na tela P07 Sorteios · onda 2 |

### `/admin/sorteios-oficiais` — Sorteios oficiais

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `Campo` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `CamposDoSegundoFator` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `CartaoDoPainel` | manter · 11 · Painel · P08 Sorteios oficiais (node 39-1742) · onda 2 |
| `Comentarios` | manter · na tela P08 Sorteios oficiais (calendário) · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `Janela` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `Pill` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |
| `SEGUNDO_FATOR_VAZIO` | manter · peça do kit (onda 1) · na tela P08 Sorteios oficiais (calendário) |

### `/admin/stories` — Stories

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P06 Stories |
| `Caixa` | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |
| `Campo` | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |
| `CartaoDoPainel` | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |
| `EditorDeFigurinhas` | manter · na tela P06 Stories · onda 2 |
| `Empty` | manter · peça do kit (onda 1) · na tela P06 Stories |
| `NOME_DA_FIGURINHA` | manter · peça do kit (onda 1) · na tela P06 Stories |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P06 Stories |
| `Pill` | manter · peça do kit (onda 1) · na tela P06 Stories |
| `TONS_DO_BOTAO` | manter · 11 · Painel · P06 Stories (node 54-4984) · onda 2 |

### `/admin/usuarios` — Usuários

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `Campo` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `Empty` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `PanelShell` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `Pill` | manter · peça do kit (onda 1) · na tela P14 Usuários |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela P14 Usuários |

### `/afiliado` — Visão geral

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela A01 Visão geral do afiliado · onda 4 |
| `ArtesParaDivulgar` | manter · na tela A01 Visão geral do afiliado · onda 4 |
| `Button` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Campo` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Card` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Empty` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Estatistica` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Filtros` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Money` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `Pill` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela A01 Visão geral do afiliado |

### `/afiliado/comissoes` — Comissões

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela A05 Comissões · onda 4 |
| `ArtesParaDivulgar` | manter · na tela A05 Comissões · onda 4 |
| `Button` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Campo` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Card` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Empty` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Estatistica` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Filtros` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Money` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `Pill` | manter · peça do kit (onda 1) · na tela A05 Comissões |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela A05 Comissões |

### `/afiliado/dados` — Meus dados

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `Campo` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `Filtros` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `IconePerfil` | manter · na tela A07 Meus dados · onda 4 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `Pill` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela A07 Meus dados |
| `VerificacaoCard` | manter · na tela A07 Meus dados · onda 4 |

### `/afiliado/divulgar` — Divulgar

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `Campo` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `CampoDeAgenda` | manter · na tela A03 Divulgar · onda 4 |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `Empty` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `FotosProprias` | manter · na tela A03 Divulgar · onda 4 |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `Pill` | manter · peça do kit (onda 1) · na tela A03 Divulgar |
| `VideoDaDivulgacao` | manter · na tela A03 Divulgar · onda 4 |
| `VideoProprio` | manter · na tela A03 Divulgar · onda 4 |

### `/afiliado/links` — Meus links

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela A02 Meus links · onda 4 |
| `ArtesParaDivulgar` | manter · na tela A02 Meus links · onda 4 |
| `Button` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Campo` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Card` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Empty` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Estatistica` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Filtros` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Money` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `Pill` | manter · peça do kit (onda 1) · na tela A02 Meus links |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela A02 Meus links |

### `/afiliado/organizacoes` — Organizações

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela A04 Organizações do afiliado · onda 4 |
| `ArtesParaDivulgar` | manter · na tela A04 Organizações do afiliado · onda 4 |
| `Button` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Campo` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Card` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Empty` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Estatistica` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Filtros` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Money` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `Pill` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela A04 Organizações do afiliado |

### `/afiliado/saques` — Saques

| Cartão | Destino |
|---|---|
| `AbrirEditorDeImagem` | manter · na tela A06 Saques · onda 4 |
| `ArtesParaDivulgar` | manter · na tela A06 Saques · onda 4 |
| `Button` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Campo` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Card` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Empty` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Estatistica` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Filtros` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Money` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `PanelShell` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `Pill` | manter · peça do kit (onda 1) · na tela A06 Saques |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela A06 Saques |

### `/ajuda` — Ajuda

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 18 Central de ajuda |
| `Empty` | manter · peça do kit (onda 1) · na tela 18 Central de ajuda |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 18 Central de ajuda |

### `/bilhete/:code` — Bilhete

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 22 Bilhete |

### `/buscar` — Buscar

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 17 Buscar |
| `Empty` | manter · peça do kit (onda 1) · na tela 17 Buscar |
| `Filtros` | manter · peça do kit (onda 1) · na tela 17 Buscar |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 17 Buscar |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 17 Buscar |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 17 Buscar |

### `/cambista` — Nova venda

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Campo` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Card` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Empty` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Kpi` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Money` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `PanelShell` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `Pill` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela C08 Nova venda do cambista |

### `/cambista/acerto` — Meu acerto

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Campo` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Card` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Empty` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Kpi` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Money` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `PanelShell` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `Pill` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela C10 Meu acerto |

### `/cambista/vendas` — Minhas vendas

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Campo` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Card` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Empty` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Kpi` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Money` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `PanelShell` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `Pill` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |
| `TabelaOuCartoes` | manter · peça do kit (onda 1) · na tela C09 Minhas vendas |

### `/carrinho` — Carrinho

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | manter · na tela 06 Carrinho · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `Money` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `Pill` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 06 Carrinho |
| `SoValePelaPlataforma` | manter · na tela 06 Carrinho · onda 5 |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 06 Carrinho |

### `/carrinho/pix/:codigo` — CarrinhoPix

| Cartão | Destino |
|---|---|
| `Card` | manter · peça do kit (onda 1) · na tela 08 Pix do carrinho |
| `Money` | manter · peça do kit (onda 1) · na tela 08 Pix do carrinho |
| `PixParaPagar` | manter · na tela 08 Pix do carrinho · onda 5 |
| `PrazoDaReserva` | manter · na tela 08 Pix do carrinho · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 08 Pix do carrinho |
| `SituacaoDoPedido` | manter · na tela 08 Pix do carrinho · onda 5 |

### `/conta/senha` — TrocarSenha

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela P21 Minha senha |
| `Campo` | manter · peça do kit (onda 1) · na tela P21 Minha senha |
| `CartaoDoPainel` | manter · peça do kit (onda 1) · na tela P21 Minha senha |

### `/criar-conta` — CriarConta

| Cartão | Destino |
|---|---|
| `BotaoGoogle` | manter · na tela 24 Criar conta · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 24 Criar conta |
| `Campo` | manter · peça do kit (onda 1) · na tela 24 Criar conta |
| `CampoDeSenha` | manter · na tela 24 Criar conta · onda 5 |
| `Marca` | manter · peça do kit (onda 1) · na tela 24 Criar conta |

### `/entrar` — Login

| Cartão | Destino |
|---|---|
| `BotaoGoogle` | manter · na tela 23 Entrar · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 23 Entrar |
| `Caixa` | manter · peça do kit (onda 1) · na tela 23 Entrar |
| `Campo` | manter · peça do kit (onda 1) · na tela 23 Entrar |
| `CampoDeSenha` | manter · na tela 23 Entrar · onda 5 |
| `Marca` | manter · peça do kit (onda 1) · na tela 23 Entrar |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 23 Entrar |

### `/estado/:uf` — EstadoPage

| Cartão | Destino |
|---|---|
| `CartaoDoFeed` | manter · na tela 04 Página do estado · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 04 Página do estado |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 04 Página do estado |

### `/mensagens` — Mensagens

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Caixa` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Campo` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Empty` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Filtros` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `GrupoAberto` | manter · na tela 16 Mensagens · onda 5 |
| `Janela` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `ListaDeGrupos` | manter · na tela 16 Mensagens · onda 5 |
| `Pill` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 16 Mensagens |

### `/mensagens/:id` — Mensagens

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Caixa` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Campo` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Empty` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `Filtros` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `GrupoAberto` | manter · na tela 16 Mensagens · onda 5 |
| `Janela` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `ListaDeGrupos` | manter · na tela 16 Mensagens · onda 5 |
| `Pill` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 16 Mensagens |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 16 Mensagens |

### `/minhas-compras` — MinhasCotas

| Cartão | Destino |
|---|---|
| `BonusDoComprador` | manter · na tela 09 Minhas compras · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Caixa` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Campo` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Card` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `CartaoDoFeed` | manter · na tela 09 Minhas compras · onda 5 |
| `Conversa` | manter · na tela 09 Minhas compras · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Janela` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Money` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `PerfilPublicoCard` | manter · na tela 09 Minhas compras · onda 5 |
| `Pill` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `VerificacaoCard` | manter · na tela 09 Minhas compras · onda 5 |

### `/minhas-cotas` — Minhas cotas

| Cartão | Destino |
|---|---|
| `BonusDoComprador` | manter · na tela 09 Minhas compras · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Caixa` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Campo` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Card` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `CartaoDoFeed` | manter · na tela 09 Minhas compras · onda 5 |
| `Conversa` | manter · na tela 09 Minhas compras · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Janela` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `Money` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `PerfilPublicoCard` | manter · na tela 09 Minhas compras · onda 5 |
| `Pill` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 09 Minhas compras |
| `VerificacaoCard` | manter · na tela 09 Minhas compras · onda 5 |

### `/notificacoes` — Notificacoes

| Cartão | Destino |
|---|---|
| `PublicShell` | manter · peça do kit (onda 1) · na tela 10 Notificações |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 10 Notificações |

### `/o/:org` — Perfil

| Cartão | Destino |
|---|---|
| `BarraDeAcoes` | manter · na tela 03 Perfil da organização · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `Carrossel` | manter · na tela 03 Perfil da organização · onda 5 |
| `Denunciar` | manter · na tela 03 Perfil da organização · onda 5 |
| `DestaqueOrg` | manter · na tela 03 Perfil da organização · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `FOTO_COMO_NO_INSTAGRAM` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `FotoComStory` | manter · na tela 03 Perfil da organização · onda 5 |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `Janela` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `Legenda` | manter · na tela 03 Perfil da organização · onda 5 |
| `LinksDoPerfil` | manter · na tela 03 Perfil da organização · onda 5 |
| `Money` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `PainelDeComentarios` | manter · na tela 03 Perfil da organização · onda 5 |
| `Progress` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `SeguirBotoes` | manter · na tela 03 Perfil da organização · onda 5 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 03 Perfil da organização |
| `VisualizadorDeStories` | manter · na tela 03 Perfil da organização · onda 5 |

### `/o/:org/r/:slug` — Rifa

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | manter · na tela 02 Página da rifa · onda 5 |
| `BannerDaEntidade` | manter · na tela 02 Página da rifa · onda 5 |
| `BarraDeAcoes` | manter · na tela 02 Página da rifa · onda 5 |
| `BotaoDenunciar` | manter · na tela 02 Página da rifa · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `Card` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `Carrossel` | manter · na tela 02 Página da rifa · onda 5 |
| `Cartelas` | manter · na tela 02 Página da rifa · onda 5 |
| `Comentarios` | manter · na tela 02 Página da rifa · onda 5 |
| `CotaSurpresa` | manter · na tela 02 Página da rifa · onda 5 |
| `DestaqueOrg` | manter · na tela 02 Página da rifa · onda 5 |
| `DivulgacoesDaRifa` | manter · na tela 02 Página da rifa · onda 5 |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `GruposDaRifa` | manter · na tela 02 Página da rifa · onda 5 |
| `Legenda` | manter · na tela 02 Página da rifa · onda 5 |
| `Money` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `PaginaNaoEncontrada` | manter · na tela 02 Página da rifa (rascunho ou endereço errado) · onda 5 |
| `PainelDeComentarios` | manter · na tela 02 Página da rifa · onda 5 |
| `Progress` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `QuemTambemJoga` | manter · na tela 02 Página da rifa · onda 5 |
| `SeguirBotoes` | manter · na tela 02 Página da rifa · onda 5 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `SoValePelaPlataforma` | manter · na tela 02 Página da rifa · onda 5 |
| `SorteioCard` | manter · na tela 02 Página da rifa · onda 5 |

### `/o/:org/r/:slug/regulamento` — Regulamento

| Cartão | Destino |
|---|---|
| `Empty` | manter · peça do kit (onda 1) · na tela 20 Regulamento da rifa |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 20 Regulamento da rifa |
| `TextoDeLeitura` | manter · na tela 20 Regulamento da rifa · onda 5 |

### `/pedido/:code` — Pedido

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 07 Pedido |
| `Card` | manter · peça do kit (onda 1) · na tela 07 Pedido |
| `Money` | manter · peça do kit (onda 1) · na tela 07 Pedido |
| `PixParaPagar` | manter · na tela 07 Pedido · onda 5 |
| `PrazoDaReserva` | manter · na tela 07 Pedido · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 07 Pedido |
| `SituacaoDoPedido` | manter · na tela 07 Pedido · onda 5 |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 07 Pedido |

### `/perfil` — PerfilDoUsuario

| Cartão | Destino |
|---|---|
| `BalaoDaNota` | manter · na tela 11 Perfil · onda 5 |
| `ChipDeLink` | manter · na tela 11 Perfil · onda 5 |
| `FOTO_COMO_NO_INSTAGRAM` | manter · peça do kit (onda 1) · na tela 11 Perfil |
| `FotoDoApostador` | manter · na tela 11 Perfil · onda 5 |
| `IconeRepublicar` | manter · peça do kit (onda 1) · na tela 11 Perfil |
| `MarcadosNoPerfil` | manter · na tela 11 Perfil · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 11 Perfil |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 11 Perfil |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 11 Perfil |

### `/perfil/bilhetes` — MeusBilhetes

| Cartão | Destino |
|---|---|
| `BilheteComoPublicacao` | manter · na tela 13 Meus bilhetes privados · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 13 Meus bilhetes privados |
| `Empty` | manter · peça do kit (onda 1) · na tela 13 Meus bilhetes privados |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 13 Meus bilhetes privados |

### `/perfil/configuracoes` — Configuracoes

| Cartão | Destino |
|---|---|
| `PreferenciaDeCookies` | manter · na tela 12 Configurações do apostador · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 12 Configurações do apostador |
| `TemaEscolha` | manter · na tela 12 Configurações do apostador · onda 5 |

### `/privacidade` — Privacidade

| Cartão | Destino |
|---|---|
| `PublicShell` | manter · peça do kit (onda 1) · na tela 19 Termos de uso e Privacidade |
| `TextoDeLeitura` | manter · na tela 19 Termos de uso e Privacidade · onda 5 |

### `/publicar` — Publicar

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 14 Publicar |
| `Campo` | manter · peça do kit (onda 1) · na tela 14 Publicar |
| `CampoDeAgenda` | manter · na tela 14 Publicar · onda 5 |
| `FotosProprias` | manter · na tela 14 Publicar · onda 5 |
| `Pill` | manter · peça do kit (onda 1) · na tela 14 Publicar |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 14 Publicar |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 14 Publicar |

### `/r/:slug` — Rifa

| Cartão | Destino |
|---|---|
| `AvisoDePrazo` | manter · na tela 02 Página da rifa · onda 5 |
| `BannerDaEntidade` | manter · na tela 02 Página da rifa · onda 5 |
| `BarraDeAcoes` | manter · na tela 02 Página da rifa · onda 5 |
| `BotaoDenunciar` | manter · na tela 02 Página da rifa · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `Card` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `Carrossel` | manter · na tela 02 Página da rifa · onda 5 |
| `Cartelas` | manter · na tela 02 Página da rifa · onda 5 |
| `Comentarios` | manter · na tela 02 Página da rifa · onda 5 |
| `CotaSurpresa` | manter · na tela 02 Página da rifa · onda 5 |
| `DestaqueOrg` | manter · na tela 02 Página da rifa · onda 5 |
| `DivulgacoesDaRifa` | manter · na tela 02 Página da rifa · onda 5 |
| `FotoDoPerfil` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `GruposDaRifa` | manter · na tela 02 Página da rifa · onda 5 |
| `Legenda` | manter · na tela 02 Página da rifa · onda 5 |
| `Money` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `PaginaNaoEncontrada` | manter · na tela 02 Página da rifa (rascunho ou endereço errado) · onda 5 |
| `PainelDeComentarios` | manter · na tela 02 Página da rifa · onda 5 |
| `Progress` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `QuemTambemJoga` | manter · na tela 02 Página da rifa · onda 5 |
| `SeguirBotoes` | manter · na tela 02 Página da rifa · onda 5 |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 02 Página da rifa |
| `SoValePelaPlataforma` | manter · na tela 02 Página da rifa · onda 5 |
| `SorteioCard` | manter · na tela 02 Página da rifa · onda 5 |

### `/r/:slug/regulamento` — Regulamento

| Cartão | Destino |
|---|---|
| `Empty` | manter · peça do kit (onda 1) · na tela 20 Regulamento da rifa |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 20 Regulamento da rifa |
| `TextoDeLeitura` | manter · na tela 20 Regulamento da rifa · onda 5 |

### `/recibo/:codigo` — ReciboPage

| Cartão | Destino |
|---|---|
| `Card` | manter · peça do kit (onda 1) · na tela 21 Recibo |
| `Empty` | manter · peça do kit (onda 1) · na tela 21 Recibo |
| `Pill` | manter · peça do kit (onda 1) · na tela 21 Recibo |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 21 Recibo |

### `/reels` — Reels

| Cartão | Destino |
|---|---|
| `BarraDeAcoes` | manter · na tela 15 Reels · onda 5 |
| `BotaoDenunciar` | manter · na tela 15 Reels · onda 5 |
| `Button` | manter · peça do kit (onda 1) · na tela 15 Reels |
| `CabecalhoDaPublicacao` | manter · na tela 15 Reels · onda 5 |
| `ConsoleDoApp` | manter · na tela 15 Reels · onda 5 |
| `FigurinhasNaTela` | manter · na tela 15 Reels · onda 5 |
| `Money` | manter · peça do kit (onda 1) · na tela 15 Reels |
| `PainelDeComentarios` | manter · na tela 15 Reels · onda 5 |
| `TONS_DO_BOTAO` | manter · peça do kit (onda 1) · na tela 15 Reels |

### `/seja-afiliado` — CadastroAfiliado

| Cartão | Destino |
|---|---|
| `Button` | manter · peça do kit (onda 1) · na tela 25 Seja afiliado |
| `Caixa` | manter · peça do kit (onda 1) · na tela 25 Seja afiliado |
| `Campo` | manter · peça do kit (onda 1) · na tela 25 Seja afiliado |
| `CampoDeSenha` | manter · na tela 25 Seja afiliado · onda 5 |
| `Card` | manter · peça do kit (onda 1) · na tela 25 Seja afiliado |

### `/termos` — TermosDeUso

| Cartão | Destino |
|---|---|
| `PublicShell` | manter · peça do kit (onda 1) · na tela 19 Termos de uso e Privacidade |
| `TextoDeLeitura` | manter · na tela 19 Termos de uso e Privacidade · onda 5 |

### `/u/:apelido` — Usuario

| Cartão | Destino |
|---|---|
| `BalaoDaNota` | manter · na tela 05 Perfil do apostador · onda 5 |
| `BotaoMensagem` | manter · na tela 05 Perfil do apostador · onda 5 |
| `CartaoDoFeed` | manter · na tela 05 Perfil do apostador · onda 5 |
| `ChipDeLink` | manter · na tela 05 Perfil do apostador · onda 5 |
| `Empty` | manter · peça do kit (onda 1) · na tela 05 Perfil do apostador |
| `FOTO_COMO_NO_INSTAGRAM` | manter · peça do kit (onda 1) · na tela 05 Perfil do apostador |
| `FotoDoApostador` | manter · na tela 05 Perfil do apostador · onda 5 |
| `MarcadosNoPerfil` | manter · na tela 05 Perfil do apostador · onda 5 |
| `PublicShell` | manter · peça do kit (onda 1) · na tela 05 Perfil do apostador |
| `SeloVerificado` | manter · peça do kit (onda 1) · na tela 05 Perfil do apostador |

## 4. Rotas da API e a prova que cada uma tem

A API não muda de lugar na reformulação. Aqui está para que a tela nova não deixe rota sem prova: "—" quer dizer que nenhum arquivo de `scripts/` ou `tests/` cita o caminho.

### `server/routes/admin.ts` — /api/admin (267 rotas, 266 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `guarda-test.ts`, `isolation-test.ts` |
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
| DELETE | `/prized/:prizedId` | `isolation-test.ts` |
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
| POST | `/settlements/:sellerId/close` | `acessos-test.ts`, `cambista-test.ts` |
| POST | `/settlements/:id/paid` | `acessos-test.ts`, `cambista-test.ts` |
| GET | `/organizer` | `banner-pago-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +3 |
| PUT | `/organizer` | `banner-pago-test.ts`, `isolation-test.ts`, `sorteios-oficiais-test.ts` +3 |
| GET | `/exportacoes` | `acessos-test.ts` |
| GET | `/exportacoes/:key` | `apuracao-test.ts`, `guarda-test.ts`, `isolation-test.ts` +1 |
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
| GET | `/plataforma` | `bonus-test.ts`, `fiscal-test.ts`, `guarda-test.ts` +4 |
| PUT | `/app` | `buscar-test.ts`, `divulgacao-test.ts`, `grupos-test.ts` +4 |
| PUT | `/selos` | `isolation-test.ts`, `verificacao-test.ts` |
| PUT | `/plataforma` | `bonus-test.ts`, `fiscal-test.ts`, `guarda-test.ts` +4 |
| GET | `/comissao` | `guarda-test.ts` |
| PUT | `/comissao` | `guarda-test.ts` |
| GET | `/chamados` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` +1 |
| GET | `/chamados/pendentes` | `chamados-test.ts`, `disputa-test.ts`, `divulgacao-test.ts` +2 |
| GET | `/avisos` | `isolation-test.ts` |
| POST | `/avisos/vistos` | `acessos-test.ts` |
| GET | `/chamados/anexos/:id` | `chamados-test.ts`, `isolation-test.ts` |
| GET | `/chamados/:id` | `chamados-test.ts`, `disputa-test.ts`, `divulgacao-test.ts` +2 |
| POST | `/chamados/:id/mensagens` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| POST | `/chamados/:id/concluir` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` |
| POST | `/chamados/:id/disputa/decidir` | `disputa-test.ts`, `isolation-test.ts` |
| GET | `/contestacoes` | `isolation-test.ts`, `pagarme-test.ts` |
| POST | `/contestacoes/:cobranca/conferida` | `isolation-test.ts`, `pagarme-test.ts` |
| POST | `/chamados/:id/conferencia` | `isolation-test.ts`, `pagarme-test.ts` |
| POST | `/chamados/:id/estornar` | `chamados-test.ts`, `disputa-test.ts`, `isolation-test.ts` +1 |
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
| POST | `/finance/release` | `guarda-test.ts`, `pagarme-test.ts` |
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
| GET | `/stories/:id/:qual(imagem\|poster)` | `isolation-test.ts`, `poster-test.ts` |
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
| POST | `/divulgacoes/:id` | `divulgacao-test.ts`, `isolation-test.ts`, `marcados-test.ts` |
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
| POST | `/patrocinio/recargas` | `pagarme-test.ts`, `patrocinio-test.ts` |
| PUT | `/patrocinio/config` | `isolation-test.ts`, `patrocinio-test.ts` |
| POST | `/patrocinio/ajustes` | `banner-pago-test.ts`, `isolation-test.ts`, `patrocinio-test.ts` |
| GET | `/marketing` | `marketing-test.ts` |
| PUT | `/marketing` | `marketing-test.ts` |
| GET | `/verificacoes` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/verificacoes/:id` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/verificacoes/:id/documentos/:tipo` | `isolation-test.ts` |
| GET | `/verificacoes/:id/foto` | `isolation-test.ts`, `verificacao-test.ts` |
| POST | `/verificacoes/:id/decidir` | `isolation-test.ts`, `verificacao-test.ts` |
| GET | `/caixa-de-entrada` | `banner-divulgacao-test.ts`, `banner-pago-test.ts`, `grupos-test.ts` +7 |
| GET | `/fiscal` | `fiscal-test.ts`, `isolation-test.ts` |
| GET | `/fiscal/:affiliateId` | `fiscal-test.ts`, `isolation-test.ts` |
| GET | `/fiscal/:affiliateId/documentos/:tipo` | `fiscal-test.ts`, `isolation-test.ts` |
| POST | `/fiscal/:affiliateId/decidir` | `fiscal-test.ts`, `isolation-test.ts` |

### `server/routes/affiliate.ts` — /api/affiliate (36 rotas, 35 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `verificacao-test.ts` |
| GET | `/commissions` | `afiliados-test.ts` |
| GET | `/links` | `afiliados-test.ts`, `artes-test.ts` |
| GET | `/coupons` | `afiliados-test.ts` |
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
| GET | `/organizacoes` | `afiliados-test.ts` |
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
| POST | `/login` | `acessos-test.ts`, `afiliados-test.ts`, `agenda-rifa-test.ts` +46 |
| POST | `/senha` | `acessos-test.ts` |
| POST | `/logout` | `acessos-test.ts` |

### `server/routes/dev.ts` — /api/dev (4 rotas, 4 com prova)

| Método | Caminho | Provas |
|---|---|---|
| POST | `/google` | `google-test.ts` |
| POST | `/pay/:code` | `afiliados-test.ts`, `bonus-test.ts`, `carrinho-test.ts` +12 |
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

### `server/routes/public.ts` — /api/public (156 rotas, 154 com prova)

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
| GET | `/banners/:id/imagem` | `publico-test.ts` |
| GET | `/banners-pagos/:id/imagem` | `banner-pago-test.ts` |
| GET | `/estados` | `vitrine-test.ts` |
| GET | `/o/:slug/stories` | `poster-test.ts`, `vitrine-test.ts` |
| POST | `/stories/:id/enquete` | `vitrine-test.ts` |
| GET | `/stories/:id/poster` | `poster-test.ts` |
| GET | `/stories/:id/imagem` | `poster-test.ts`, `vitrine-test.ts` |
| GET | `/recibos/:codigo` | `fiscal-test.ts` |
| GET | `/o/:slug/termo-afiliado` | `publico-test.ts` |
| POST | `/o/:slug/colaborador` | `afiliados-test.ts` |
| GET | `/o/:slug` | `perfil-test.ts`, `poster-test.ts`, `resultados-test.ts` +3 |
| GET | `/o/:slug/foto` | `publico-test.ts` |
| GET | `/o/:slug/capa` | `publico-test.ts` |
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
| GET | `/conta/perfil` | `comentarios-test.ts`, `google-test.ts`, `nota-test.ts` +1 |
| PUT | `/conta/perfil` | `comentarios-test.ts`, `google-test.ts`, `nota-test.ts` +1 |
| PUT | `/conta/nota` | `nota-test.ts` |
| GET | `/app` | `buscar-test.ts`, `divulgacao-test.ts`, `grupos-test.ts` +4 |
| GET | `/selos` | `verificacao-test.ts` |
| PUT | `/campaigns/:slug/acoes/:acao` | `publicacao-test.ts` |
| POST | `/campaigns/:slug/compartilhamentos` | `publicacao-test.ts` |
| POST | `/carrinho` | `carrinho-test.ts`, `publicacao-test.ts` |
| GET | `/conta/salvos` | `publicacao-test.ts` |
| GET | `/conta/bilhetes` | `bilhetes-test.ts`, `isolation-test.ts` |
| GET | `/u/:apelido/republicacoes` | `publicacao-test.ts` |
| GET | `/u/:apelido` | `bilhetes-test.ts`, `comentarios-test.ts`, `publicacao-test.ts` +2 |
| POST | `/u/:apelido/seguir` | `nota-test.ts`, `seguir-pessoas-test.ts` |
| DELETE | `/u/:apelido/seguir` | `nota-test.ts`, `seguir-pessoas-test.ts` |
| GET | `/conta/marcacoes` | `marcados-test.ts` |
| POST | `/marcacoes/:id/aceitar` | `marcados-test.ts` |
| DELETE | `/marcacoes/:id` | `marcados-test.ts` |
| GET | `/u/:apelido/marcados` | `marcados-test.ts` |
| GET | `/u/:apelido/foto` | `publico-test.ts` |
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
| GET | `/cep/:cep` | `publico-test.ts` |
| GET | `/campaigns/:slug/certificado` | `publico-test.ts` |
| GET | `/campaigns/:slug/banner-divulgacao` | `banner-divulgacao-test.ts` |
| GET | `/campaigns/:slug` | `agenda-rifa-test.ts`, `apuracao-test.ts`, `banner-divulgacao-test.ts` +7 |
| GET | `/campaigns/:slug/regulamento` | `apuracao-test.ts`, `bonus-test.ts`, `transparencia-test.ts` |
| GET | `/campaigns/:slug/sorteio` | `apuracao-test.ts`, `transparencia-test.ts` |
| GET | `/campaigns/:slug/foto-ganhador` | `publico-test.ts` |
| GET | `/campaigns/:slug/blocks/:block` | `senha-test.ts` |
| GET | `/campaigns/:slug/cartelas` | `carrinho-test.ts`, `load-test.ts` |
| GET | `/campaigns/:slug/numbers/:number` | `publico-test.ts` |
| POST | `/track-click` | `publico-test.ts` |
| GET | `/checkout` | `base-ia.ts`, `pagarme-test.ts` |
| POST | `/orders` | `acessos-test.ts`, `afiliados-test.ts`, `apuracao-test.ts` +20 |
| POST | `/carrinho/checkout` | `carrinho-test.ts`, `pagarme-test.ts` |
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
| POST | `/conta/telefone/codigo` | `conta-test.ts`, `google-test.ts` |
| POST | `/conta/telefone/confirmar` | `conta-test.ts`, `google-test.ts` |
| DELETE | `/conta/google` | `google-test.ts` |
| POST | `/conta` | `afiliados-test.ts`, `bilhetes-test.ts`, `buscar-test.ts` +18 |
| POST | `/conta/entrar` | `conta-test.ts`, `google-test.ts`, `telas.ts` |
| POST | `/conta/sair` | `bilhetes-test.ts`, `conta-test.ts` |
| GET | `/conta` | `afiliados-test.ts`, `bilhetes-test.ts`, `buscar-test.ts` +18 |
| PUT | `/conta/senha` | `conta-test.ts` |
| PUT | `/conta/cep` | `conta-test.ts` |
| PUT | `/conta/perfil-publico` | `perfil-test.ts` |
| POST | `/conta/excluir` | `bilhetes-test.ts`, `conta-test.ts`, `google-test.ts` +3 |
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
| GET | `/tickets/:code` | `publico-test.ts` |
| GET | `/tickets/:code/escpos` | `publico-test.ts` |
| POST | `/tickets/:code/printed` | `publico-test.ts` |
| GET | `/campaigns/:slug/premios` | `publico-test.ts` |
| GET | `/sorteio-oficial/:id/ata` | `apuracao-test.ts` |
| GET | `/sorteio-oficial` | `sorteios-oficiais-test.ts` |
| GET | `/sorteio-oficial/:id/comentarios` | `sorteio-comentarios-test.ts` |
| POST | `/sorteio-oficial/:id/comentarios` | `sorteio-comentarios-test.ts` |
| DELETE | `/sorteio-oficial/comentarios/:id` | `isolation-test.ts`, `sorteio-comentarios-test.ts` |
| POST | `/sorteio-oficial/comentarios/:id/denuncia` | `sorteio-comentarios-test.ts` |
| PUT | `/sorteio-oficial/comentarios/:id/curtida` | `sorteio-comentarios-test.ts` |
| GET | `/vitrine/ao-vivo` | `vitrine-test.ts` |
| GET | `/campaigns/:slug/ultimas-compras` | `publico-test.ts` |
| POST | `/afiliados/cadastro` | `afiliados-test.ts`, `divulgacao-test.ts` |
| GET | `/campaigns/:slug/ranking` | `publico-test.ts` |
| GET | `/campaigns/:slug/divulgacoes` | `divulgacao-test.ts` |
| GET | `/divulgacoes/feed` | `divulgacao-test.ts` |
| GET | `/divulgacoes/rifas` | `divulgacao-test.ts` |
| GET | `/divulgacoes/minhas` | `divulgacao-test.ts` |
| POST | `/divulgacoes` | `divulgacao-test.ts`, `marcados-test.ts` |
| GET | `/divulgacoes/minhas/:id/fotos/:fotoId` | — |
| GET | `/divulgacoes/:id/fotos/:fotoId` | `divulgacao-test.ts`, `isolation-test.ts` |
| GET | `/divulgacoes/:id/video` | `divulgacao-test.ts`, `isolation-test.ts` |
| PATCH | `/divulgacoes/:id` | `divulgacao-test.ts`, `marcados-test.ts` |
| DELETE | `/divulgacoes/:id` | `divulgacao-test.ts`, `marcados-test.ts` |

### `server/routes/seller.ts` — /api/seller (6 rotas, 6 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `/overview` | `cambista-test.ts` |
| POST | `/sales` | `cambista-test.ts`, `publico-test.ts` |
| POST | `/sales/:code/confirm` | `cambista-test.ts`, `publico-test.ts` |
| POST | `/sales/:code/cancel` | `cambista-test.ts` |
| GET | `/sales` | `cambista-test.ts`, `publico-test.ts` |
| GET | `/settlement` | `cambista-test.ts` |

### `server/routes/verificacaoRotas.ts` — (montada em public.ts, affiliate.ts e admin.ts) (5 rotas, 5 com prova)

| Método | Caminho | Provas |
|---|---|---|
| GET | `${caminho}/consentimento` | `matriz.ts`, `verificacao-test.ts` |
| POST | `${caminho}/consentimento` | `matriz.ts`, `verificacao-test.ts` |
| DELETE | `${caminho}/consentimento` | `matriz.ts`, `verificacao-test.ts` |
| PUT | `${caminho}/documentos/:tipo` | `banner-divulgacao-test.ts`, `fiscal-test.ts`, `verificacao-test.ts` |
| GET | `${caminho}/documentos/:tipo` | `banner-divulgacao-test.ts`, `fiscal-test.ts`, `verificacao-test.ts` |

### `server/routes/webhooks.ts` — /api/webhooks (1 rotas, 1 com prova)

| Método | Caminho | Provas |
|---|---|---|
| POST | `/:provider` | `pagarme-test.ts`, `webhook-test.ts` |

## 5. Rotas que nenhuma prova cita

Busca literal do caminho em `scripts/` e `tests/` (a interpolação vale como parâmetro): é a lista do que a reformulação mexe sem rede de proteção. Pode haver prova que chega à rota por outro caminho; o contrário (prova que cita e não confere) a busca não vê.

- `server/routes/admin.ts` (1 de 267): PUT `/media/raw`
- `server/routes/affiliate.ts` (1 de 36): GET `/divulgacoes/:id/video`
- `server/routes/public.ts` (2 de 156): GET `/mensagens/conversas/:id/fotos/:fotoId`, GET `/divulgacoes/minhas/:id/fotos/:fotoId`

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
| `logo-escrita` | `scripts/logo-escrita.ts` |
| `marcados` | `scripts/marcados-test.ts` |
| `marketing` | `scripts/marketing-test.ts` |
| `matriz` | `scripts/matriz.ts` |
| `mensagens` | `scripts/mensagens-test.ts` |
| `nota` | `scripts/nota-test.ts` |
| `pagarme` | `scripts/pagarme-test.ts` |
| `patrocinio` | `scripts/patrocinio-test.ts` |
| `perfil` | `scripts/perfil-test.ts` |
| `pix-tardio` | `scripts/pix-tardio-test.ts` |
| `poster` | `scripts/poster-test.ts` |
| `presente` | `scripts/presente-test.ts` |
| `publicacao` | `scripts/publicacao-test.ts` |
| `publico` | `scripts/publico-test.ts` |
| `push` | `scripts/push-test.ts` |
| `refund` | `scripts/refund-test.ts` |
| `relogios` | `scripts/relogios-test.ts` |
| `resultados` | `scripts/resultados-test.ts` |
| `retencao` | `scripts/retencao-test.ts` |
| `seguir-pessoas` | `scripts/seguir-pessoas-test.ts` |
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
| `webhook` | `scripts/webhook-test.ts` |
