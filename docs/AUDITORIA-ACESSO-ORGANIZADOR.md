# Auditoria do acesso ORGANIZADOR (18/10/2026)

Cronograma 5, item 14 do `docs/CHECKLIST-AJUSTES.md`: tudo o que um usuário de
organização alcança no painel — o menu de `menuDe("organizador")` (Painel,
Rifas e a edição por abas, Pedidos, Resultados, Afiliados, Cambistas,
Cobrança, Marketing, Atendimento, Sorteio, Mensagens, Stories, Usuários,
Exportações, Configurações) e as rotas `/api/admin/*` que ele chama.

Feita numa cópia do repositório em `claude/auditoria-organizador`, com banco e
servidor próprios, com login de `marina@rifassaojose.br` (organizadora do seed)
e um segundo organizador (`iso-sul`) montado pelo `npm run isolation` para o
cruzamento. Cada defeito tem o seu commit; o revisor de invariantes **não
rodou** (o agente que fez a auditoria não tem como chamar outro agente): o
parecer dele sobre os commits de dinheiro e isolamento fica para a sessão
principal (seção "Aberto").

## 1. O que foi conferido

### 1.1 Rotas

As 274 rotas de `server/routes/admin.ts` (267 com `adminRouter.<método>` mais as
de perfil, mídia bruta e as sete da verificação montadas por
`montarRotasDaVerificacao`), as 8 de `/api/ia/*`, e as rotas públicas que o
organizador usa no painel (apagar comentário da rifa e do sorteio oficial).
Cada uma foi lida contra três perguntas — o recorte (`orgOf`,
`assertCampaignInScope`, `assertAffiliateInScope`, o dono conferido **antes** de
gravar), o código (404 para o dado do vizinho, 403 para rota da plataforma) e o
que ela devolve (titularidade do cliente) — e todas foram disparadas com id
torto, id válido que não existe, corpo vazio e corpo com lixo (856 chamadas,
conferindo 5xx e 200 onde devia ser 404).

| Assunto (menu) | Rotas | Como cada uma se comporta para o organizador |
|---|---|---|
| Painel e resultados | `/overview`, `/resultados`, `/busca`, `/avisos*`, `/chamados/pendentes` | só o recorte da sessão; `?organizacao=` ignorado |
| Rifas | `/campaigns` (lista, criar, `PATCH`), `/campaigns/:id/*` (editar, adiar, legal, legenda, transmissão, agendar, publicar, packages, mídia, prized, draw, blockers, certificado, link curto, foto do ganhador, sorteio oficial, banner de divulgação, artes, editor, marketing, reels gerado, sugerir) | `assertCampaignInScope` antes de tudo; o do vizinho é 404 |
| Mídia | `/media/:id/*` (legenda, figurinhas, capa, corte, apagar) | dono conferido pelo pai antes do `DELETE`/`UPDATE` |
| Pedidos e clientes | `/orders`, `/exportacoes*` | `escopoDaCampanha`, `clienteVisivelSql` (cliente da plataforma só pelo ID) |
| Afiliados e cambistas | `/affiliates*`, `/sellers`, `/coupons*`, `/settlements*`, `/colaboradores/pedidos*`, `/termo-afiliado`, `/divulgacoes*`, `/usuarios*` | vínculo, organização do usuário ou da rifa; conta do afiliado é da plataforma (403) |
| Financeiro e cobrança | `/finance*`, `/payouts/:id/*`, `/saques-pagos`, `/recibos/:codigo/pdf`, `/cobranca/tabela` (leitura), `/cobranca/extrato`, `/cobranca/notificacao` | `payouts.organization_id`; o saque da plataforma é 404 para a organização; escrever na tabela é 403 |
| Marketing | `/marketing`, `/patrocinio*`, `/banner-pago*`, `/trafego*`, `/campaigns/:id/marketing*` | recorte pela sessão; decidir, configurar e lançar gasto são 403 |
| Atendimento | `/chamados*`, `/solicitacoes*`, `/entidades` (403), `/denuncias*` (403) | recorte pela organização do chamado/pedido |
| Sorteio | `/sorteios-oficiais` (leitura), `/campaigns/:id/draw`, `/apuracao/metodos` (leitura) | calendário traz só as rifas da organização; lançar resultado é 403 |
| Configurações | `/organizer`, `/organizacoes/:id/{endereco,perfil,socios*,telefone*,verificacao*,link-curto,links/cliques}`, `/comissao`, `/reembolso`, `/payment-methods` (leitura), `/contrato-promotora*`, `/2fa*` | `org !== :id` é 404; plataforma 403 onde a regra é dela |
| Da plataforma (403) | `/organizacoes` (lista e criar), `/organizacoes/:id/acessos`, `/audit`, `/antifraude*`, `/plataforma`, `/template*`, `/banners*`, `/bonus*`, `/ia/*`, `/whatsapp*`, `/caixa-de-entrada`, `/fiscal*`, `/verificacoes*`, retenções, Pix tardio, contestações | `requirePlatformAdmin` |

A cobertura em `scripts/isolation-test.ts` (rota por rota, pelo caminho com o
id trocado): **55 das 274 rotas não tinham nenhuma menção**; agora são 21 e
todas elas são pessoais (`/2fa/*`, `/avisos/vistos`, `/solicitacoes/pendentes`,
aceite de contrato — só a sessão, sem id), ou provadas por outro caminho
(`/exportacoes/cotas?campanha=`, `/artes/rifa`).

### 1.2 Telas

`npm run telas -- --papel organizador` nas três larguras (390, 820, 1440), claro
e escuro: **0 reprovações**. Como as 22 rotas do script abrem cada tela vazia,
a mesma ferramenta foi rodada numa cópia com as abas da edição da rifa
(publicada e rascunho: A rifa, Autorização e sorteio, Publicação, Pacotes e
cotas premiadas), as abas de Configurações, os dois cartões de Publicidade e
dados de exemplo (pedidos pagos, afiliado, rascunho), 32 rotas × 3 larguras ×
2 temas = 192 capturas. Mais um percurso à mão (Playwright) em 390/820/1440,
claro e escuro: "Nova rifa" aberta, o sino, o menu lateral, Cambistas,
Afiliados, Financeiro, Usuários, Exportações e Atendimento — sem estouro
horizontal, campo abaixo de 16 px no celular, controle sem nome ou erro de
console.

## 2. Achados e correções (um defeito por commit)

| # | Achado | Gravidade | Commit |
|---|---|---|---|
| 1 | **Pacote de cotas sem teto de desconto.** `PUT /campaigns/:id/packages` gravava `discountPct` como veio: com 100% o pedido nascia de **R$ 0,00** com as cotas reservadas, com 150% de **−R$ 24,75**. | grave (dinheiro) | `139a8e9` — `validarPacotes()` (`shared/pacotes.ts`: até 10 pacotes, quantidade de 1 ao total, desconto inteiro de 0 a 50, sem repetir, só as chaves conhecidas) e `prepararPedido()` recusa total abaixo de 1 centavo (protege o que já estava gravado) |
| 2 | **Comissão própria do cambista/afiliado sem faixa.** `POST /sellers`, `POST /affiliates` e `PATCH /affiliates/:id` aceitavam 150%: o `splitOrder()` recusa acima de 100% e o Pix pago daquele cambista **não era registrado**; fração ou texto davam 500; `PATCH` sem nada dava 500. | grave (comissão) | `aa40231` — `lerComissaoDoCadastro()` (`shared/afiliados.ts`, 0 a 50 inteiro, o teto do vínculo e do termo) |
| 3 | **`POST /affiliates` sem a régua de senha** (aceitava "1"; o CLAUDE.md manda a mesma régua do cambista) e 500 para e-mail ou código repetido. | médio (acesso) | `67b23ce` |
| 4 | **Criar acesso e redefinir senha sem limite**: cada senha gasta um scrypt (64 MiB e uma thread do libuv). | médio (disponibilidade) | `370d896` — 30 por hora por pessoa |
| 5 | **Id fora do formato no caminho dava 500 em mais de 50 rotas** (rifa, mídia, chamado, usuário, cupom, saque, story, divulgação, pedido de banner…). | médio (500 onde devia ser 404) | `ae57f8d` — `adminRouter.param()` |
| 6 | **`assertCampaignInScope` com id vazio ou torto vindo do corpo** (`POST /patrocinio/anuncios {}`, cupom, pedido de banner…) dava 500. | médio | `1c353e6` |
| 7 | **`/orders?status=foo` e `/solicitacoes?status=foo` davam 500** (enum do banco). | baixo | `66aec91` |
| 8 | **`POST /coupons` com validade ou limite de usos tortos dava 500.** | baixo | `1c494b3` |
| 9 | **Destaque e peso do feed (`featured`, `sortWeight`) aceitos do organizador** em `POST /campaigns`, `PATCH` e `/editar` (rascunho): `featured: true, sortWeight: 999999` punha a rifa dele no topo da vitrine de todos. | médio (privilégio) | `d8e045c` |
| 10 | **O rascunho aceitava reserva de 0 minuto, de 69 dias e mínimo maior que o máximo** (o pedido de edição da rifa publicada já recusava): o Pix nascia vencido ou a cota ficava presa. | médio | `b061745` — `problemaNosLimitesDoPedido()`, a mesma régua nos dois caminhos |
| 11 | Campo do texto alternativo da foto só com placeholder. | baixo (tela) | `98c635f` |
| 12 | Números sem `tnum` (faixa "000 a 999", preço sob o campo) e alvos de toque de 16 e 20 px no celular ("ver certificado enviado", títulos em Resultados). | baixo (tela) | `df26422` |
| 13 | Texto: o reembolso é pedido "com o print do bilhete" em três telas; o print é opcional. | baixo (texto) | `759c3a7` |

Provas: `tests/pacotes.test.ts`, `tests/afiliados.test.ts` (comissão),
`tests/solicitacoes.test.ts` (limites) e a seção "o painel do organizador, rota
a rota" do `npm run isolation` (`1b2a008`, `f3ba8ca`), que passou a ter 467
cruzamentos: o vizinho 404 em 17 rotas que não tinham prova, 9 listas sem o
dado dele, o que o corpo e a `?organizacao=` não trocam (comissão,
reembolso, pixels, termo, resultados, liberar comissões), 16 recusas de
entrada (o que antes gravava lixo ou dava 500), o destaque do feed, 27 ids
tortos e 4 situações desconhecidas, mais o 403 de criar organização, criar
acesso e do antifraude manual. `npm run cobranca` foi ajustado
(`e4a1a79`): o caso do pacote abaixo da taxa por cota usa uma rifa de cota
barata, já que o desconto tem teto.

## 3. Aberto (decisão de produto ou de advogado, ou fora do escopo desta auditoria)

1. **A rifa da Federal que não está num sorteio oficial** (`POST
   /campaigns/:id/draw`): o organizador digita o concurso e os cinco prêmios, e
   o ganhador sai do que ele digitou (`resultadoParaARifa()`). Na rifa
   integrada o formulário é ignorado. Recomendação: exigir a integração ao
   calendário para `federal_direta` (a plataforma lança o resultado da Caixa).
2. **Pacotes mudam depois de publicada, sem análise** (`PUT
   /campaigns/:id/packages`, sem checar a situação da rifa): o desconto de até
   50% muda o preço efetivo de quem ainda vai comprar, enquanto preço, prêmio e
   total travam. O código usa a tabela fotografada na publicação, o que sugere
   que é intencional; vale confirmar com o produto se vai pelo `/editar`.
3. **Nome e CNPJ da organização** (`PUT /organizer`, `PATCH
   /organizacoes/:id`) mudam com rifa no ar e o CNPJ não tem o dígito conferido
   (os dados da empresa, o CNPJ da entidade e o fiscal têm). É o nome que sai no
   bilhete e no regulamento como promotora.
4. **Afiliado criado pela organização** (`POST /affiliates`): quem cria sabe a
   senha inicial de uma conta que "é da plataforma" e trabalha para várias
   organizações. O caminho mais seguro é o convite com link para o afiliado
   definir a senha.
5. **O cartão "Reembolso: prazo e aviso"** diz que o comprador pede em "Minhas
   cotas" mesmo quando a plataforma deixa o interruptor `estornoManual`
   desligado (o padrão).
6. **Rota da plataforma chamada com id torto** responde 404 (o guarda de id vem
   antes do `requirePlatformAdmin`), não 403 — não vaza dado nenhum.
7. Sem limite por pessoa (`hit`): criar rifa (`POST /campaigns`), `GET
   /exportacoes/:key` (exporta tudo, com auditoria) e `PUT /campaigns/:id/legal`
   com certificado. Nenhum é abuso entre organizações; é carga.
8. `PUT /organizer` e `PATCH /organizacoes/:id` gravam o corpo cru em
   `audit_log.diff` (a trilha é lida só pela plataforma).
9. O **parecer do `revisor-de-invariantes`** sobre os commits `139a8e9`,
   `aa40231`, `ae57f8d`, `1c353e6`, `d8e045c` e `b061745` não foi obtido.
10. O Chromium da prova de telas fechou no meio de algumas rodadas com a máquina
    cheia (carga de 8 em 4 núcleos) e, nessas capturas, o `h1` ainda não tinha
    desenhado ("0 h1", tela branca). Repetidas isoladamente, passam; não é
    defeito da tela.
