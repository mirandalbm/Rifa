# Versões — celular, tablet e computador

Guia para mudar a tela sem criar diferença entre as versões. Vale para
qualquer mudança visual: leia antes de mexer em tela, e anote no
[registro](#registro-das-mudanças-do-celular) no mesmo PR.

Última revisão completa: 28/09/2026 (leva 0, abaixo); última leva: 05/10/2026 (leva 9).

## Em uma frase

**Um código só, três larguras.** O celular é a referência: a mudança nasce
nele e vai para o registro. A cada **10** mudanças registradas, uma **leva**
confere as três larguras e arruma o tablet e o computador de uma vez. O que
quebra outra versão não espera a leva: é consertado no mesmo PR.

## As três versões

| Versão | Largura | No Tailwind | Aparelho de conferência | Loja (`PublicShell`) | Painel (`PanelShell`) |
|---|---|---|---|---|---|
| **Celular** (referência) | até 639 px | sem prefixo | 390 × 844 | coluna da tela inteira | menu recolhido em ícones (56 px); aberto passa por cima |
| **Tablet** | 640 a 1023 px | `sm:` (640) e `md:` (768) | 820 × 1180 | coluna de 768 px no centro | a partir de 768 o menu abre ao lado (220 px) e lembra a escolha |
| **Computador** | 1024 px ou mais | `lg:` (1024) e `xl:` (1280) | 1440 × 900 | `larga`: 1152 px; as demais seguem em 768 | igual ao tablet, conteúdo sem largura máxima |

## Um código só: o que já vale e o que pede leva

Não existem três aplicativos. Cada tela é **um** componente React, e o que
muda entre as versões é só o **arranjo**, por classe (`sm:`, `lg:`). Por
isso, toda mudança no celular cai em um de três casos:

| Caso | O que é | Exemplo | O que fazer |
|---|---|---|---|
| **Vale igual** | texto, regra, cor, comportamento, botão que sai ou entra num lugar que já se ajeita sozinho | tirar o "Comprar" de cada rifa do carrinho | registrar; a leva só confere |
| **Arranjo** | algo novo cujo lugar no tablet ou no computador precisa ser pensado: seção, coluna, janela, tabela, faixa que rola | um bloco novo na página da rifa: fica na coluna da publicação ou na da compra? | registrar; a leva arruma |
| **Quebra** | a mudança estraga outra largura: a página rola para o lado, um botão some, um texto sobrepõe outro | uma faixa nova que empurra a página para fora da tela no computador | **consertar no mesmo PR** — nunca espera a leva |

## O fluxo de cada mudança no celular

1. Faça a mudança pensando no celular (390 px).
2. Rode `npm run telas` (ou só o papel da tela: `npm run telas -- --papel
   anonimo`). **Zero reprovações** nas três larguras — é assim que "quebra"
   não passa.
3. Anote no [registro](#registro-das-mudanças-do-celular): uma linha por
   mudança, situação `aguardando leva`.
4. Se a mudança estiver na lista de "o que não pode afrouxar" do
   `CLAUDE.md`, atualize lá também.

Lista de conferência do PR:

- [ ] `npm run telas` sem reprovação (o relatório diz a largura e o elemento).
- [ ] Nenhum componente novo "só para o computador" — arranjo é classe.
- [ ] Grade nova começa em `grid-cols-1`; filho com texto longo tem `min-w-0`.
- [ ] Número que o usuário lê com `tnum`; campo com rótulo visível.
- [ ] Linha nova no registro.

## A leva

Quando o registro chega a **10** linhas `aguardando leva`, o PR seguinte é a
leva (o `tests/versoes.test.ts` falha na 11ª, então ela não fica esquecida):

1. `npm run telas` completo, nos dois temas (`--tema escuro` na segunda
   rodada).
2. Abra `capturas/index.html`: cada tela nas três larguras, lado a lado.
   Olhe primeiro as telas das mudanças registradas, depois o resto.
3. Arrume o arranjo (`sm:`/`lg:`) do que ficou mal aproveitado. Siga as
   [regras](#regras-entre-as-versões) e o [mapa](#mapa-das-telas) — e
   atualize o mapa se o arranjo mudou.
4. Marque as linhas como `leva N` e descreva na coluna "Tablet e
   computador" o que foi feito ("nada a arrumar" também é resposta).
5. Acrescente a leva na [tabela de levas](#levas).

### Quantas mudanças por leva — sugestão: 10

Limite da leva: **10** mudanças aguardando.

- **A maior parte já vale nas três versões na hora.** As duas mudanças do
  carrinho desta leva são assim. A leva é, quase sempre, conferência — e a
  conferência é automática (`npm run telas`) mais uma olhada nas capturas.
- **Nada quebrado espera.** Estouro, sobreposição e botão sumindo reprovam
  no `npm run telas` do próprio PR. O que espera a leva é só aproveitar
  melhor o espaço do tablet e do computador.
- **A leva tem custo fixo** (rodar, olhar, arrumar, anotar). Os pedidos
  chegam com 3 a 5 itens: com 5, seria leva em quase toda rodada — o que se
  quer evitar. Com 10, uma a cada duas ou três rodadas.
- **Mudanças na mesma tela se juntam.** Arrumar o computador uma vez depois
  de três mudanças no carrinho sai mais barato que três vezes.
- **Quando baixar para 5:** numa fase de redesenho de tela de compra (rifa,
  carrinho, Pix), para o computador não ficar muito tempo atrás. Troque o
  número na linha "Limite da leva" acima — o teste lê daqui.

## Regras entre as versões

1. **Um componente por tela.** O arranjo muda por classe (`sm:`, `md:`,
   `lg:`), nunca por um segundo componente nem por `if (largura)` no
   JavaScript. A única exceção é `telaLarga()`, que decide só o estado
   inicial do menu do painel.
2. **O DOM segue a ordem do celular.** A grade reposiciona
   (`lg:col-start`, `lg:row-start`); inverter a ordem no DOM muda o celular e
   a leitura de tela.
3. **Celular primeiro.** Classe sem prefixo é o celular. `sm:` é o tablet,
   `lg:` o computador. `md:` só para o que depende da coluna de 768 (o menu
   do painel) e `xl:` só para o que precisa de mais de 1024 (a
   pré-visualização da Aparência, a conversa do Atendimento).
4. **Grade começa em `grid-cols-1`** (ou coluna `minmax(0,1fr)`). Sem isso a
   coluna implícita é `auto` e cresce até o tamanho mínimo do conteúdo — foi
   o estouro do painel bento e da Aparência. Filho de grade ou flex com texto
   longo leva `min-w-0`.
5. **Faixa que rola para o lado** (abas, carrossel, stories) leva
   `overflow-x-auto`, e cada item com `sr-only` dentro leva `relative`: o
   `sr-only` é absoluto e, sem ancestral posicionado dentro da faixa, escapa
   dela e alarga a página inteira — foi o estouro do Atendimento da
   plataforma.
6. **Largura das cascas.** `PublicShell` = 768 px sempre; `PublicShell
   larga` = 768 até `lg` e 1152 a partir dele. Leitura e formulário (Minhas
   compras, pedido, ajuda, avisos, regulamento) ficam em 768 de propósito —
   linha longa cansa.
7. **Número que o usuário lê usa `tnum`** em todas as versões — inclusive
   contador, "mínimo 1" e "7 dias". O `npm run telas` avisa o valor solto
   que ficou de fora.
8. **Campo de digitar tem 16 px ou mais no celular** (regra global no
   `index.css`): abaixo disso o iPhone aproxima a tela ao tocar no campo. O
   campo maior de propósito (`text-lg`, como o do código de acesso) fica como
   está. O `npm run telas` reprova campo menor.
9. **Campo tem rótulo visível** (`<label>` com `htmlFor` ou em volta).
   Placeholder é exemplo, não rótulo: some quando a pessoa começa a digitar.
10. **Alvo de toque com pelo menos 24 × 24 px** (WCAG 2.5.8); botão de ação
    principal com 40 px de altura ou mais no celular. Link no meio do texto
    está isento.
11. **Imagem com `alt`** (vazio se for decoração). Link que repete outro ao
    lado (a foto que repete o título) leva `aria-hidden` e `tabIndex={-1}`.
12. **Um `h1` por página** — `sr-only` quando a marca faz o papel de título
    (vitrine, entrar).
13. **Cor por variável**, nunca hex no componente (seção "Tema claro e
    escuro" do `CLAUDE.md`). Topo e faixa de baixo opacos.
14. **Janela** (sobre a tela): sobe de baixo no celular e fica centrada a
    partir de `sm`; fecha no Esc e no toque no fundo; trava a rolagem de
    trás; `role="dialog"` e `aria-modal`. É o componente `Janela`
    (`client/src/components/Janela.tsx`) — tela nova não monta o fundo à
    mão (`tests/pecas.test.ts` confere). O visualizador de stories é tela
    cheia preta, outra coisa, e segue à parte.
15. **Tabela larga no celular rola dentro do cartão**, nunca a página.
16. **O que aparece ao passar o mouse aparece também no toque e no foco** —
    o celular não tem mouse. O gráfico de barras tem a tabela equivalente.

## Mapa das telas

O que cada tela faz em cada versão. "Igual" quer dizer: o mesmo arranjo do
celular, na largura da casca.

### Loja (pública)

| Rota | Arquivo | Casca | Celular | Tablet | Computador |
|---|---|---|---|---|---|
| `/` | `pages/Vitrine.tsx` | larga | stories, banners, estados, patrocinadas e feed em 1 coluna | feed em 2 colunas | banner com "Sorteios chegando" ao lado; feed em 3 colunas |
| `/r/:rifa`, `/o/:org/r/:rifa` | `pages/Rifa.tsx` | larga | publicação, compra, resto | imagem na coluna, com os cantos arredondados (alinhada ao banner da entidade, leva 7) e altura de no máximo 85% da tela; a compra embaixo, na largura toda | 2 colunas: publicação à esquerda; compra à direita, fixa e com rolagem própria, total e Pix no pé |
| `/o/:org` | `pages/Perfil.tsx` | larga | capa 3:1 de ponta a ponta, cartão do perfil, rifas em 1 coluna | capa com cantos; rifas em 2 colunas em fluxo (`columns`, sem buraco entre formatos) | capa 4:1; cartão de 320 px fixo à esquerda; rifas em 2 colunas em fluxo |
| `/estado/:uf` | `pages/Estado.tsx` | larga | feed em 1 coluna | 2 colunas | 3 colunas |
| `/u/:apelido` | `pages/Usuario.tsx` | larga | feed em 1 coluna | 2 colunas | 3 colunas |
| `/carrinho` | `pages/Carrinho.tsx` | larga | rifas por organização; seus dados e o botão de pagamento (o único) no fim | igual, em 768 | rifas à esquerda; total, dados e o botão à direita, fixos na rolagem |
| `/carrinho/pix/:codigo` | `pages/CarrinhoPix.tsx` | 768 | coluna | igual | igual |
| `/pedido/:codigo` | `pages/Pedido.tsx` | 768 | coluna | igual | igual |
| `/minhas-cotas`, `/minhas-compras` | `pages/MinhasCotas.tsx` | 768 | coluna com abas | igual | igual |
| `/notificacoes` | `pages/Notificacoes.tsx` | 768 | coluna | igual | igual |
| `/publicar` | `pages/Publicar.tsx` | 768 | coluna | igual | igual |
| `/perfil/bilhetes` | `pages/MeusBilhetes.tsx` | 768 | coluna: um cartão de publicação por bilhete pago (capa, prêmio, data e hora, números), "Ver mais bilhetes" no pé | igual | igual |
| `/perfil` | `pages/PerfilDoUsuario.tsx` | 768 | foto e nome, menu da conta (bilhetes, reembolsos, conta, painel, ajuda, termos e privacidade), tema, cookies e o "18+" | igual | igual |
| `/reels` | `pages/Reels.tsx` (desligado: `EmBreve`) | 768 | Tela cheia, um vídeo em pé por vez, ações na lateral | igual, coluna de 480 px centrada | igual |
| `/mensagens`, `/mensagens/:id` | `pages/Mensagens.tsx` (desligado: `EmBreve`) | 768 | A lista, e a conversa por cima dela | Tablet: igual ao celular; computador (1024 ou mais): lista de 340 px e a conversa ao lado | igual ao tablet, mais largo |
| `/buscar` | `pages/Buscar.tsx` (desligado: `EmBreve`) | 768 | O campo no topo e a grade de 3 colunas das publicações | Tablet: 3 colunas; computador: 4 (6 a partir de 1280) | igual ao tablet, mais largo |
| `/ajuda` | `pages/Ajuda.tsx` | 768 | coluna | igual | igual |
| `/termos`, `/privacidade` | `pages/Legal.tsx` | 768 | coluna de leitura | igual | igual |
| `/r/:rifa/regulamento`, `/o/:org/r/:rifa/regulamento` | `pages/Regulamento.tsx` | 768 | coluna | igual | igual |
| `/recibo/:codigo` | `pages/Recibo.tsx` | 768 | coluna | igual | igual |
| `/bilhete/:codigo` | `pages/Bilhete.tsx` | nenhuma | papel de 32 colunas | igual | igual |
| `/entrar`, `/criar-conta`, `/seja-afiliado` | `pages/Login.tsx`, `CriarConta.tsx`, `CadastroAfiliado.tsx` | nenhuma | cartão de 384 px no centro | igual | igual |

### Painel do organizador e da plataforma

A casca é a mesma nas três larguras (`PanelShell`, padrão Materialize): no
celular o menu entra por cima pelo botão do topo; no tablet e no computador
fica ao lado, com 260 px ou recolhido em 72 px (abre com os nomes ao passar
o ponteiro). O título da tela vai dentro do conteúdo, abaixo da barra de
cima com a busca, o tema, o sino e a conta.

| Rota | Arquivo | Celular | Tablet | Computador |
|---|---|---|---|---|
| `/admin` | `pages/admin.tsx` (`AdminPainel`) | os widgets do kit empilhados: boas-vindas, cotas, comissão, próximo sorteio, canais, vendas do mês, atividade, rifas no ar, por estado, dia da semana, o que falta, top afiliados | 2 por linha (boas-vindas, sorteio, atividade e rifas no ar ocupam as 2) | 4 colunas: boas-vindas e sorteio com 2, atividade e rifas no ar com 2, o resto com 1 |
| `/admin/campanhas` | `admin.tsx` (`AdminCampanhas`) | formulário; rifas em grade de capas (1 por linha) ou lista rolando no cartão; edição da rifa em quatro abas | formulário em 2 colunas; grade 2 por linha | grade 4 por linha a partir de `xl` ([P5](#pendências) na lista) |
| `/admin/pedidos` | `admin.tsx` (`AdminPedidos`) | cartão por pedido (`TabelaOuCartoes`), 25 por vez e "Ver mais" | tabela, 25 por vez e "Ver mais" | igual ao tablet |
| `/admin/resultados` | `pages/adminResultados.tsx` | números 2 por linha | 3 por linha | 6 por linha (`xl`); gráfico e tabelas em 2 colunas |
| `/admin/stories` | `pages/adminStories.tsx` | formulário; stories 2 por linha | stories 3 por linha | formulário e stories lado a lado |
| `/admin/caixa` (plataforma) | `pages/adminCaixa.tsx` | filtros rolando; tabela rolando no cartão ([P5](#pendências)) | tabela | tabela |
| `/admin/atendimento` | `pages/adminAtendimento.tsx` | abas rolando; a lista **ou** o item aberto (com "Voltar para a lista") | igual ao celular | lista e item lado a lado só em `xl`, cada um rolando no seu lugar |
| `/admin/afiliados` | `admin.tsx` (`AdminAfiliados`) | empilhado | igual | 2 colunas |
| `/admin/cambistas` | `pages/adminCambistas.tsx` | empilhado | igual | 2 colunas |
| `/admin/financeiro` | `admin.tsx` (`AdminFinanceiro`) | empilhado | igual | 2 colunas |
| `/admin/sorteios` | `admin.tsx` (`AdminSorteios`) | lista | igual | igual |
| `/admin/sorteios-oficiais` | `pages/adminSorteiosOficiais.tsx` | calendário na largura toda (dia colorido com ponto), sorteios embaixo | dia com a sigla da loteria (Fed., Mega, Quina, Lotof.) e o concurso embaixo | calendário na largura toda, o dia com o nome e o concurso numa linha (`lg`); embaixo, o cadastro (plataforma, concurso e data empilhados) à esquerda e os sorteios à direita (a partir de `xl`) |
| `/admin/cobranca` | `pages/adminCobranca.tsx` | números empilhados; lançamentos em cartões, 25 por vez e "Ver mais" | números 3 ou 4 por linha; tabela de lançamentos | igual ao tablet |
| `/admin/usuarios` | `pages/adminUsuarios.tsx` | lista | detalhes em 3 colunas | igual |
| `/admin/patrocinio` | `pages/adminPatrocinio.tsx` | empilhado | formulários em 2 colunas | cartões em 2 colunas |
| `/admin/banner-pago` | `pages/adminBannerPago.tsx` | pedir e pedidos empilhados | empilhado | pedir à esquerda, pedidos à direita |
| `/admin/marketing` | `pages/adminMarketing.tsx` | empilhado | igual | 2 colunas |
| `/admin/exportacoes` | `pages/adminExportacoes.tsx` | 1 coluna | 2 colunas | 2 colunas |
| `/admin/configuracoes` | `admin.tsx` (`AdminConfiguracoes`) | três abas (quatro na plataforma, com a "Trilha de auditoria"; a faixa rola para o lado); cartões empilhados dentro | igual | as mesmas abas; cartões em 2 colunas dentro de cada |
| `/admin/organizacoes` (plataforma) | `pages/adminOrganizacoes.tsx` | empilhado | detalhes em 2 e 3 colunas | lista e cartão de 340 px lado a lado |
| `/admin/bonus` (plataforma) | `pages/adminBonus.tsx` | empilhado | igual | 2 colunas |
| `/admin/fiscal` (plataforma) | `pages/adminFiscal.tsx` | lista | detalhe em 2 colunas | igual |
| `/admin/aparencia` (plataforma) | `pages/adminAparencia.tsx` | quatro abas (Identidade e tela inicial · Topo do app · Rodapé e empresa · Assistente de IA), a barra de salvar e publicar nas abas do template; a pré-visualização e as versões embaixo | igual | igual; abas e pré-visualização lado a lado a partir de `xl` |
| `/admin/antifraude` (plataforma) | `pages/adminAntifraude.tsx` | os números e três abas (Limites · Bloqueios manuais · O que foi barrado) | números em 3 colunas | igual; em "O que foi barrado", o resumo e as recusas lado a lado |
| `/conta/senha` | `pages/admin.tsx` | formulário | igual | igual |

### Afiliado e cambista

| Rota | Arquivo | Celular | Tablet | Computador |
|---|---|---|---|---|
| `/afiliado` | `pages/afiliado.tsx` | estatísticas empilhadas | estatísticas 2 por linha | 4 por linha; 2 colunas |
| `/afiliado/links` | `pages/afiliado.tsx` | link e material empilhados | QR de 132 px ao lado do texto | igual |
| `/afiliado/divulgar` | `pages/afiliadoDivulgar.tsx` | cartões empilhados; mídias em 3 por linha | mídias em 5 por linha | 2 colunas (nova divulgação e minhas) |
| `/afiliado/organizacoes`, `/afiliado/comissoes` | `pages/afiliado.tsx` | lista | igual | igual |
| `/afiliado/saques` | `pages/afiliado.tsx` | empilhado | igual | 2 colunas |
| `/afiliado/dados` | `pages/afiliadoDados.tsx` | campos em 1 e 2 colunas | campos em 2 e 3 colunas | cartões em 2 colunas |
| `/cambista` | `pages/cambista.tsx` | números e formulário empilhados | números 3 por linha | igual; formulário na largura toda ([P6](#pendências)) |
| `/cambista/vendas`, `/cambista/acerto` | `pages/cambista.tsx` | lista | igual | igual |

## A ferramenta: `npm run telas`

`scripts/telas.ts` abre cada rota de cada papel (anônimo, apostador,
organizador, plataforma, afiliado e cambista — 60 telas) nas três larguras,
tira a captura da página inteira e mede o que dá para medir sem olho:

| Reprova | Avisa |
|---|---|
| página que rola para o lado | número solto sem `tnum` |
| erro de JavaScript ou resposta 5xx da API | alvo menor que 24 × 24 no celular |
| botão, link ou campo sem nome | campo que só tem placeholder |
| imagem sem `alt` | página sem `h1` ou com dois; erro no console |
| campo com letra menor que 16 px no celular | |

```
npm run telas                                  # tudo, 390/820/1440, tema claro
npm run telas -- --larguras 390                # só o celular
npm run telas -- --papel organizador,cambista  # só esses papéis
npm run telas -- --tema escuro
npm run telas -- --saida /tmp/telas
```

Precisa do `npm run dev` no ar e do seed. Os exemplos (rifa, pedido,
carrinho, recibo, apelido) saem do banco do desenvolvimento; a conta de
apostador das capturas (`telas.apostador`) é criada na primeira vez. As
capturas e o `relatorio.json` ficam em `capturas/` (fora do git), e
`capturas/index.html` mostra cada tela nas três larguras lado a lado. Não
roda no CI: precisa de navegador e de banco com dados.

Aviso não é defeito automático. Alvo pequeno isento pela WCAG (link numa
frase, barra de gráfico que tem tabela equivalente) continua aparecendo — o
olho decide.

## Leva 0 — revisão de 28/09/2026

Todas as telas, os seis papéis e as três larguras, com captura e medida.

### O que foi corrigido

- **Estouro no celular:** Atendimento (abas da plataforma — o `sr-only` dos
  contadores escapava da faixa) e Aparência (grade sem `grid-cols-1`; a
  pré-visualização agora rola dentro do cartão).
- **Financeiro:** a linha de "Saques pagos" sobrepunha código e valor no
  celular; agora quebra.
- **Configurações:** o organizador pedia a trilha de auditoria (403) e via o
  cartão sempre vazio; o cartão é só da plataforma.
- **Título da página:** a vitrine e o entrar não tinham `h1`.
- **Nome dos controles:** a foto do item do carrinho era um segundo link sem
  nome (agora fora da leitura de tela, como a da publicação); a quantidade
  da venda do cambista não tinha rótulo; o ajuste de saldo do patrocínio e
  a chave Pix do afiliado tinham só placeholder.
- **`tnum`:** preço do pacote, valores do afiliado (e a conversão com
  vírgula: "0,0%", era "0.0%"), "mínimo", cartela, quantidade do pedido,
  campanhas, vendas recolhidas, períodos "7/30/90 dias", saldo e recarga
  do patrocínio, selo "18+".
- **Celular:** campo com menos de 16 px aproximava a tela no iPhone (regra
  global, e agora o `npm run telas` reprova); o tema e a ajuda do rodapé
  tinham alvo menor que 24 px, assim como a marca do menu recolhido.

### Pendências

Em ordem de prioridade. Cada uma, quando for feita, entra no registro como
qualquer mudança.

| # | O quê | Onde | Versão |
|---|---|---|---|
| P1 | ~~O tablet é o celular esticado na página da rifa~~ **Feito**: no tablet a imagem fica na coluna (até a leva 7 ia até a borda) e a altura não passa de 85% da tela (corta ao centro); do computador em diante, a coluna da esquerda de sempre | `Rifa.tsx`, `Publicacao.tsx` (`limitarNoTablet`) | tablet |
| P2 | ~~Seis janelas feitas à mão~~ **Feito**: o componente `Janela` (regra 14) serve Comentários, escolha de bilhete, denúncia, Criar, cota surpresa, folhas do perfil e pedido de reembolso | `Janela.tsx` | todas |
| P3 | ~~`h1` em 9 combinações de classe~~ **Feito**: o padrão `font-display text-xl font-extrabold` vale em todas as telas; sobram só dois tamanhos de propósito (o título do cartão com `line-clamp` e o do banner da rifa, `text-2xl`) e os modificadores de posição | várias | todas |
| P4 | ~~A classe do campo de digitar repetida mais de 80 vezes~~ **Feito**: a classe `.campo` (`index.css`) no lugar da lista repetida, e o componente `Campo` (`bits.tsx`: rótulo, campo, dica e erro ligados pelo `id`, `aria-invalid` com erro) para formulário novo — o pedido de reembolso já usa. `tests/pecas.test.ts` barra a lista copiada de volta | várias | todas |
| P6 | ~~"Nova venda" do cambista ocupa a largura toda no computador~~ **Feito**: a venda fica numa coluna de 672 px centrada | `cambista.tsx` | computador |
| P7 | ~~O degradê de "sem foto" repetido~~ **Feito**: classe `.sem-foto` (`index.css`), usada na publicação e na página da rifa; `tests/pecas.test.ts` barra a cópia | `index.css` | todas |
| P8 | ~~A janela de comentários sobe de baixo também no computador~~ **Feito**: `Janela` com `centralizarEm="lg"` — embaixo no celular e no tablet, como no Instagram, no centro só no computador | `Comentarios.tsx`, `Janela.tsx` | computador |
| P9 | ~~48 dos 51 componentes de `components/ui` sem uso~~ **Feito**: sobraram só `toast`, `toaster` e `tooltip`; os outros saíram com o `use-mobile` e os 33 pacotes que só eles usavam (Radix, recharts, vaul, cmdk…) | `components/ui/`, `package.json` | — |
| P11 | ~~Ícones do lucide (traço 2) e os desenhados à mão (traço 1,75) misturados~~ **Feito**: o traço padrão do lucide passa a 1,75 pelo `index.css` (`svg.lucide[stroke-width="2"]`); quem pede outro traço de propósito mantém o dele | `index.css` | todas |
| P12 | ~~Botões do topo com 24 a 28 px de altura~~ **Resolvida pelo topo novo**: o topo ficou só com a publicação e o trevo, em botões de 40 px (`Console.tsx`) | `Console.tsx` | celular |
| P13 | ~~Grades antigas sem `grid-cols-1`~~ **Feito**: 59 grades ganharam a coluna do celular; `tests/pecas.test.ts` barra grade nova sem ela | várias | todas |
| P14 | ~~Topo da loja apertado no celular ("Minhas cotas" quebrava)~~ **Resolvida pelo topo novo**: "Minhas cotas", carrinho e Entrar saíram do topo para o console de baixo e o perfil | `AppShell.tsx` | celular |

## Levas

| Leva | Data | PR | Mudanças | Resumo |
|---|---|---|---|---|
| 0 | 2026-09-28 | #58 | 1 a 2 | Revisão completa das três versões, correções acima e este guia |
| 1 | 2026-09-29 | #67 | 3 a 13 | Conferência das três larguras (`npm run telas`: 189 capturas, 0 reprovadas): tablet e computador seguem o celular sem quebra. O arranjo novo do web (grade de colunas no computador) é a remodelagem, planejada à parte em `docs/REMODELAGEM.md` |
| 2 | 2026-10-01 | #85 | 14 a 22 | `npm run telas` nos dois temas (190 telas, 0 reprovadas; `/admin/caixa` entrou na auditoria). Arrumado: no perfil da organização as rifas vão em duas colunas em fluxo (`columns`) do tablet em diante — a grade deixava um buraco ao lado da publicação 9:16 e o tablet tinha 1 coluna (P1, parte do perfil); em Organizações a tabela do tablet rolava e cortava os botões (largura mínima 560 → 480 px). O resto, sem nada a arrumar |
| 3 | 2026-10-01 | #102 | 23 a 29 | Conferência em 820 e 1440 (Pedidos, Cobrança, Configurações, edição da rifa, Atendimento, Usuários, Reels, Mensagens e Buscar). Arrumado: Pedidos e Cobrança ficam em cartão no tablet e a tabela só entra em `xl` (cortava a Situação e a ação com o menu aberto); os totais da Cobrança em três colunas e com quebra de texto; a grade do Buscar com 4 colunas no tablet. Anotado: tabela de Usuários rola no tablet, Reels ainda sem teste com vídeo real |
| 4 | 2026-10-02 | #114 | 30 a 39 | `npm run telas` nos dois temas, com os interruptores ligados e bilhete e divulgação de exemplo (210 capturas, 0 reprovadas). Arrumado: na página da rifa a seção "Divulgações" ficava entre a publicação e a compra e empurrava a compra para baixo no celular e no tablet — passou para depois da compra (no computador segue na coluna da publicação); no menu do perfil, "Meus bilhetes" (que leva às compras) e "Meus bilhetes privados" pareciam a mesma coisa — o primeiro passou a "Minhas compras". A tela Banner na vitrine entrou na auditoria. Anotado: Reels e o visualizador do story seguem sem vídeo de exemplo no banco |
| 5 | 2026-10-02 | #130 | 40 a 50 | `npm run telas` nos dois temas, com mensagens, reembolso, bônus, Reels, Buscar e o assistente do master ligados (210 + 213 capturas; o assistente com um Chatbase de mentira) e capturas à parte da coluna do assistente aberta, de Mensagens/Grupos do apostador e dos dados legais da rifa. Arrumado: nos dados legais, o rótulo do mínimo de vendidas e o da quantidade de cotas de bônus ficavam na mesma linha do campo no computador (`block`); o "(9)" das ações do assistente sem `tnum`. A auditoria deixou de reprovar o botão escondido no menu "⋮" fechado (`<details>`), que o Chromium mede sem texto, e passou a capturar `/mensagens` do apostador. Anotado: o resultado do sorteio com número contemplado segue sem rifa sorteada no banco de exemplo |
| 6 | 2026-10-03 | #142 | 51 a 60 | `npm run telas` nos dois temas (231 + 231 capturas, 0 reprovadas; `/admin/sorteios-oficiais` e os Pedidos da plataforma entraram na auditoria), com sorteio oficial, comentários, denúncia e Pix a devolver de exemplo, e capturas à parte da janela de moderação, do item aberto da denúncia e do "Adiar sorteio". Arrumado: o dia do calendário no tablet (sigla da loteria e o concurso embaixo) e o cadastro estreito no computador (concurso e data empilhados); o Pix a devolver no tablet (campo espremido entre os botões); a verificação na Minha conta do apostador (empilhada, coluna estreita); "Ver o sorteio" e "Comentários (N)" com alvo de 24 px |
| 7 | 2026-10-03 | #156 | 61 a 70 | `npm run telas` nos dois temas (231 capturas no claro e no escuro, 0 reprovadas), com os interruptores ligados e a entidade beneficiada de exemplo, e capturas à parte do sino aberto (organização e afiliado), da edição da divulgação, do cartão da publicação agendada e da tela da entidade. Arrumado: o carrossel da página da rifa no tablet fica na coluna, com cantos arredondados, alinhado ao banner da entidade; o sino do afiliado sem avisos diz "Nada novo por aqui." (e o afiliado e o cambista não pedem mais os comentários do painel); o seletor de imagem da entidade em português. O resto, sem nada a arrumar |
| 8 | 2026-10-04 | #164 | 71 a 76 | Leva antecipada (6 de 10). `npm run telas` nos dois temas (231 capturas no claro e 231 no escuro, 0 reprovadas) e capturas à parte em 820 e 1440 do vídeo do afiliado na página da rifa, da divulgação no feed, do cartão "Reels da rifa", do story com enquete e com figurinhas, do quadro de figurinhas no painel e das abas da Aparência e do Antifraude. Arrumado: o cartão "Reels da rifa" em uma coluna até `xl` (no tablet a legenda ficava uma palavra por linha) e o resumo de "O que foi barrado" sem esticar no computador (`items-start`) |
| 9 | 2026-10-05 | #172 | 77 a 83 | Leva antecipada (7 de 10). `npm run telas` nos dois temas e capturas à parte da tela cheia da coluna ao vivo em 820×1180, 1180×820 e 1440×900 (com a conversa por cima e ao lado escolhidas), dos perfis da organização e do apostador em 820 e 1440 e do painel dos sorteios oficiais (aviso do link e cartão dos canais) em 820 e 1440. Nada a arrumar: as mudanças da tela do sorteio são do celular, e o que vale do tablet em diante cabe nas três larguras |

## Registro das mudanças do celular

Uma linha por mudança, no mesmo PR que a faz. Situação: `aguardando leva`
ou `leva N`. O teste confere o formato, a numeração e o limite da leva.

| Nº | Data | PR | Tela | O que mudou no celular | Tablet e computador | Situação |
|---|---|---|---|---|---|---|
| 1 | 2026-09-28 | #58 | Carrinho | Saiu o "Pagar tudo num Pix só": o pagamento é só o Pix da plataforma, e o split para cada promotora fica por dentro | Vale igual; no computador o total e o botão seguem na coluna da direita | leva 0 |
| 2 | 2026-09-28 | #58 | Carrinho | Saiu o "Comprar" de cada rifa: fica só o botão de pagamento | Vale igual; conferido em 820 e 1440 | leva 0 |
| 3 | 2026-09-28 | #58 | Afiliado · Saques | Trocar a chave Pix pede a senha ("Sua senha, para confirmar") e mostra se trocou ou o motivo da recusa | Vale igual (mesmo cartão); a conferir na leva | leva 1 |
| 4 | 2026-09-28 | #58 | Painel · Usuários | Na lista do organizador, a conta de afiliado mostra "conta da plataforma" no lugar de senha e desligar | Vale igual; no celular a coluna fica no fim da tabela que rola (P5) | leva 1 |
| 5 | 2026-09-28 | #59 | Vitrine, perfil e rifa · publicação | O carrossel segue o formato da primeira peça (4:5, 1:1, 1,91:1 ou 9:16); no vertical o perfil da promotora vai por cima da imagem | Vale igual; o 9:16 limitado a 85% da altura da tela, conferido em 1440 na grade de 3 colunas | leva 1 |
| 6 | 2026-09-28 | #60 | Loja inteira · topo e console | Topo com a logo, a publicação e o trevo (ponto verde); console fixo na base com Início, Reels, Mensagens, Buscar, Carrinho e Perfil; "18+", ajuda, tema e cookies foram para `/perfil` | Tablet igual ao celular; no computador o topo some e o console vira a lateral esquerda (ícones em `lg`, com nomes em `xl`) | leva 1 |
| 7 | 2026-09-28 | #61 | Perfil da organização e `/perfil` | "+" na foto do próprio perfil para postar story; ponto verde na foto do console e quadro "Complete sua conta" quando falta apelido ou telefone confirmado | Vale igual; no computador o ponto fica na foto da lateral | leva 1 |
| 8 | 2026-09-28 | #62 | Rifa · mapa, cartelas, janela do "+" e carrinho | Números em casas quadradas, azuis e verdes ao acaso nos dois temas; escolhido destacado com ✓; mapa em 5 colunas | Tablet em 10 colunas; no computador, 5 na coluna da compra — a conferir na leva | leva 1 |
| 9 | 2026-09-28 | #63 | Rifa · publicação e cartelas | Presente da cota surpresa (só o ícone, piscando) no canto da publicação (sai o aviso amarelo); o "+" e a sacola saem de baixo da publicação; cada cartela com trocar (ícone), carrinho (junta várias cartelas) e Pagar maior | Vale igual; no computador as cartelas ficam na coluna da compra — a conferir na leva | leva 1 |
| 10 | 2026-09-28 | #64 | Janela do "+", carrinho e comentários | "Adicionar" no lugar de "Pôr no carrinho", a janela fica aberta e a cartela adicionada dá lugar a outra; o carrinho mostra cada bilhete de cada rifa (tira um bilhete sozinho) e conta rifas e bilhetes no total; o comentário fixo é só o do ganhador da cota premiada, sem destaque amarelo | Vale igual; no computador o carrinho segue em duas colunas — a conferir na leva | leva 1 |
| 11 | 2026-09-28 | #65 | Rifa · cartelas | O botão do carrinho na cartela troca a sacola pelo "+" (azul no claro, verde no escuro, em negrito); o presente da cota surpresa fica branco e parado; o comentário fixo é o parabéns ao ganhador, com o comentário dele logo abaixo se houver; embaixo da rifa só o fixo e "Ver os N comentários", que abre o painel | Vale igual — a conferir na leva | leva 1 |
| 12 | 2026-09-29 | #66 | Carrinho e console | No carrinho, a rifa numa faixa horizontal no topo (foto, título, preço e lixeira) e os bilhetes dela embaixo, em largura inteira; foto que não carrega some; o número do carrinho no console conta os bilhetes, não as rifas | Vale igual; no computador o carrinho já é em duas colunas — a conferir na leva | leva 1 |
| 13 | 2026-09-29 | #67 | Rifa · publicação | O presente da cota surpresa sobe para o canto de cima, logo abaixo do contador "1/5" (embaixo fica o som do vídeo) | Vale igual: a mesma posição no carrossel do tablet e do computador | leva 1 |
| 14 | 2026-09-29 | #68 | Vitrine | O feed carrega de 4 em 4 conforme a rolagem (rolagem infinita, com "Ver mais rifas" de reserva); o arranjo do celular não muda | Tablet e computador: uma rifa por vez com cantos arredondados, coluna ao vivo à direita (tela do sorteio que flutua, ganhadores, jogando agora), menu lateral só com ícones que abre ao passar o ponteiro e rodapé com logos. Conferido na leva 2: tablet e computador com uma rifa por vez, coluna ao vivo à direita e rodapé — nada a arrumar | leva 2 |
| 15 | 2026-09-29 | #70 | Vitrine e fotos do perfil | O selo de vendidas ("0% vendida", "reta final") sai de cima da imagem do feed — o progresso já está no cartão da rifa logo abaixo; a foto do perfil (apostador, afiliado, organização e capa) é reduzida no aparelho antes de enviar, e as rotas de foto e de documento aceitam o tamanho da foto do celular | Vale igual: o selo sai também no tablet e no computador. Conferido na leva 2: o selo saiu nas três larguras — nada a arrumar | leva 2 |
| 16 | 2026-10-01 | #72 | Rifa · cartelas | Quatro cartelas por pacote (eram três), já buscadas para todos os pacotes quando a página abre: tocar noutro pacote mostra as cartelas na hora; enquanto chegam, o lugar delas já fica desenhado | Tablet: as quatro fecham o quadrado 2 × 2 (com três sobrava uma lacuna); no computador seguem numa coluna na lateral da compra. Conferido na leva 2: 2 × 2 no tablet; no computador, coluna da compra — nada a arrumar | leva 2 |
| 17 | 2026-10-01 | #79 | Painéis · alvos de toque | Links e botões pequenos dos painéis ganham área de toque de 24 px, sem mudar o desenho: "Compartilhar este perfil", "ver perfil", "conferir de novo", "tirar", "+ faixa", "baixar" (QR do afiliado), "sair desta organização", a caixa "Mostrar" e os botões Subir/Descer dos blocos da Aparência. As colunas dos gráficos por dia (Resultados e Patrocínio) ficam como estão: são 31 num celular, e o mesmo dado está na tabela ao lado | Vale igual — o arranjo não muda. Conferido na leva 2: nada a arrumar | leva 2 |
| 18 | 2026-10-01 | #80 | Painéis · casca, Painel e Rifas | Casca no padrão Materialize: o menu lateral sai da tela e entra por cima pelo botão do topo (era uma régua fixa de 56 px com ícones); barra de cima com a busca do painel, o tema, o sino e a conta; itens do menu em grupos (o master abre pela Caixa de entrada); fundo neutro e cartões "papel" com a fonte Inter. O Painel vira os widgets dos painéis prontos do kit (boas-vindas com o dia, cotas e comissão, próximo sorteio em destaque com a capa, canais site/cambista, vendas do mês, atividade, rifas no ar, vendas por estado, dia da semana, o que falta, top afiliados) empilhados; Rifas ganha a grade de capas (1 por linha) com o botão grade/lista | Tablet e computador: menu de 260 px ao lado (recolhido em 72 px, abre ao passar o ponteiro); estatísticas 2 e 4 por linha; grade 2 e 4 por linha — conferido em 820 e 1440. Conferido na leva 2 em 820 e 1440: menu, estatísticas 2/4 por linha e grade 2/4 por linha — nada a arrumar; a rota entrou no `npm run telas` | leva 2 |
| 19 | 2026-10-01 | #81 | Painel da plataforma · Caixa de entrada | Nova tela "Tudo" na Caixa de entrada: disputas, reembolsos, edições e adiamentos, denúncias, selos, cadastros fiscais e telefones numa lista só, com filtro por tipo (abas que rolam) e "Abrir" para a tela que decide | Tablet e computador: a mesma tabela, sem quebra — a conferir na leva. Conferido na leva 2: a tabela cabe nas três larguras; `/admin/caixa` entrou no `npm run telas` | leva 2 |
| 20 | 2026-10-01 | #82 | Painéis · busca da barra de cima; Pedidos; Organizações | A busca acha, além da tela, o pedido pelo código, o cliente pelo ID e (plataforma) a organização pelo nome, numa lista só com o tipo em texto; Pedidos abre filtrado pelo pedido ou pelo cliente, com "Ver todos"; Organizações abre já na organização achada | Vale igual: a lista da busca tem 320 px e cabe nas três larguras — a conferir na leva. Conferido na leva 2: a lista cabe nas três larguras; em Organizações a tabela no tablet rolava e cortava os botões de ação — a largura mínima baixou de 560 para 480 px | leva 2 |
| 21 | 2026-10-01 | #83 | Painéis · sino da barra de cima | O sino vira um menu de avisos: os comentários novos de apostador nas rifas do painel (quem, rifa, trecho, há quanto tempo), cada um abrindo a publicação nos comentários, e no topo as pendências do atendimento; abrir marca como visto e o número vai no rótulo | Vale igual: o menu tem 320 px e cabe nas três larguras — a conferir na leva. Conferido na leva 2: o menu cabe nas três larguras — nada a arrumar | leva 2 |
| 22 | 2026-10-01 | #84 | Painel · Cobrança | A taxa já retida no split do Pix aparece como "retida no split" (pílula) e soma no "Já pago" com a nota do valor retido; a carteira da plataforma mostra o retido embaixo do pago de cada organização | Vale igual: a mesma pílula e os mesmos números nas três larguras. Conferido na leva 2: nada a arrumar | leva 2 |
| 23 | 2026-10-01 | #86 | Painéis · Pedidos e Cobrança | A lista de Pedidos e os lançamentos da Cobrança viram um cartão por linha (data, situação, de onde veio, valor), 25 por vez e "Ver mais" no pé — Pedidos tinha 11.600 px de altura e Cobrança 15.000, hoje 4.100 e 3.500 com 25 linhas | Tablet: **continua em cartão** — com o menu aberto sobram ~510 px e a tabela cortava Situação e a ação; a tabela entra a partir de `xl` (1280 px), também 25 por vez e "Ver mais". Na Cobrança os três totais ficam numa fileira (3 a partir de `sm`, 4 em `xl`) e o texto grande quebra em vez de vazar do cartão | leva 3 |
| 24 | 2026-10-01 | #87 | Painéis · Configurações e edição da rifa | Configurações deixa de ser uma pilha de 12 cartões e ganha três abas (Conta e segurança · Organização e perfil · Vendas e pagamentos), e a edição de cada rifa ganha quatro (A rifa · Autorização e sorteio · Publicação · Pacotes e cotas premiadas); a aba aberta vai no endereço (`?aba=`) e o link antigo `#verificacao` abre a aba certa. No celular as abas rolam para o lado dentro da faixa | Conferido na leva 3: a mesma faixa de abas (no tablet a última aba rola para o lado); em Configurações os cartões vão em 2 colunas no computador e numa só no tablet; a edição da rifa fica em coluna única larga. Nada a arrumar | leva 3 |
| 25 | 2026-10-01 | #88 | Painéis · busca da barra de cima; Afiliados e Usuários | A busca também acha usuário, afiliado e cambista por nome, e-mail ou código ("Pessoa · afiliado · JOAO7 · Rifas São José"); Afiliados e Usuários abrem já filtrados por ela, com "Ver todos" | Conferido na leva 3: vale igual. Fica anotado que a tabela de Usuários, no tablet, rola para o lado e corta a última coluna (organização quebra em duas linhas) | leva 3 |
| 26 | 2026-10-01 | #89 | Painéis · Atendimento | Abrir um chamado, pedido de mudança, denúncia ou verificação troca a lista pelo item, com "Voltar para a lista" no alto (a página sobe e o foco vai para o botão); antes o item abria embaixo da lista, que podia ter metros. Esc fecha o item | Conferido na leva 3: tablet (820) igual ao celular, uma coisa por vez; de 1280 lista e item lado a lado. Nada a arrumar | leva 3 |
| 27 | 2026-10-01 | #98 | Console · Reels | O botão Reels abre a tela cheia: topo com seta e abas Reels/Seguindo, um vídeo em pé por vez (toca mudo quando ocupa a tela), ações na lateral direita (trevo, comentar, republicar, compartilhar, "+" e sacola), a promotora com Seguir, o prêmio e a legenda embaixo à esquerda e a barra "Comentar…" + Comprar | Conferido na leva 3 (tela vazia, sem vídeo real no banco de teste): a mesma tela, em coluna de 480 px centrada sobre fundo preto no tablet e no computador. Falta ver com vídeo de verdade | leva 3 |
| 28 | 2026-10-01 | #99 | Console · Mensagens | O botão Mensagens abre a caixa: lista de conversas com foto, prévia, hora e não lidas (abas Conversas e Pedidos), "Nova" (procura por @apelido, endereço da organização ou código), a conversa com bolhas, o pedido de mensagem com Aceitar/Recusar, Bloquear e Denunciar; o número de não lidas vai no botão do console e no rótulo; o compartilhar da publicação ganha "Enviar por mensagem"; no celular, Bloquear e Denunciar são só o ícone (com o nome no rótulo), para o nome de quem fala caber | Conferido (antes da leva, no PR #101): tablet igual ao celular; computador com a lista de 340 px e a conversa ao lado. Nada a arrumar | leva 3 |
| 29 | 2026-10-01 | #100 | Console · Buscar | O botão Buscar abre o campo de busca e, embaixo, a grade de 3 colunas das publicações mais novas (a capa de cada rifa, sem texto sobre a imagem), 18 por vez com a próxima leva ao chegar no fim; com texto, perfis de organização (e o @apelido exato, se a plataforma ligar) aparecem numa lista acima da grade | Conferido na leva 3: a grade passa a 4 colunas a partir do tablet (`md`) e 6 em `xl`, para as capas não ficarem enormes em 820 px | leva 3 |
| 30 | 2026-10-01 | #104 | Story em vídeo | O story do organizador pode ser um vídeo em pé de até 30 s: no visualizador em tela cheia ele toca sozinho, a barra de cima acompanha o vídeo, segurar pausa e há um botão de som ao lado do fechar; no painel Stories o formulário aceita imagem ou vídeo, com prévia | Conferido: o visualizador do story em vídeo vale igual nas três larguras | leva 4 |
| 31 | 2026-10-01 | #105 | Banner pago | O organizador ganha a tela "Banner na vitrine" (menu Crescimento): escolhe a rifa, manda a arte 2 por 1, dá o título e os dias e vê o total e o saldo; abaixo, os pedidos em cartão com a situação em texto, a fila e o cancelar. Na vitrine, o banner pago entra no carrossel de cima com a etiqueta "Patrocinado" no canto | Conferido em 820 e 1440 (organizador e plataforma); a tela entrou no `npm run telas` | leva 4 |
| 32 | 2026-10-01 | #106 | Bônus no perfil e quem também joga | O menu de `/perfil` ganha o item "Bônus" (só com o programa ligado, com o saldo embaixo); na página da rifa, logo abaixo da legenda, uma faixa com até 6 fotinhas redondas de quem também joga e abriu o perfil público e o texto "@fulano, @ciclano e outras pessoas também jogam esta rifa" (some quando não há ninguém) | Conferido em 820 e 1440: o item aparece quando o programa de bônus está ligado | leva 4 |
| 33 | 2026-10-01 | #74 | Login com Google | Em "Entrar" e "Criar conta" aparece o botão "Continuar com o Google" (só com o acesso configurado); quem entra assim cai em Minha conta com o cartão "Complete sua conta" (CPF e telefone com código do WhatsApp) e, em Minha conta, ganha o cartão "Entrar com o Google" para ligar ou desligar; a volta com recusa mostra o motivo na tela de entrada | Conferido: o botão do Google só aparece com as chaves; sem elas o Entrar segue igual | leva 4 |
| 34 | 2026-10-01 | #108 | Selo "ao vivo" no story | Quando a rifa está na hora do sorteio com link de transmissão, o anel da foto (fileira de stories da vitrine e perfil da organização) ganha o selo de texto "AO VIVO" embaixo; o perfil ao vivo entra na frente da fileira mesmo sem story e leva à rifa; com story, o visualizador ganha o botão "Ao vivo agora: assistir ao sorteio" | Conferido: o selo vale igual; sem transmissão no ar não há o que capturar | leva 4 |
| 35 | 2026-10-01 | #109 | Rifa, Reels e Stories · vídeo | O vídeo da publicação, o do Reels e o do story mostram o quadro de pôster antes de tocar (em vez de ficar preto ou vazio enquanto carrega), quando o servidor consegue tirá-lo; sem ele, igual a antes | Conferido: o pôster vale igual (mesmo `<video>`); sem vídeo de exemplo no banco, só a regra | leva 4 |
| 36 | 2026-10-01 | #111 | Perfil · bilhetes privados | O menu de `/perfil` ganha "Meus bilhetes privados" (só com conta): cada compra paga vira uma publicação só sua, com a capa da rifa, o prêmio, a data e a hora da compra, os números em casas azuis e verdes e a situação em texto; 10 por vez e "Ver mais bilhetes" | Conferido em 820 e 1440: coluna de leitura de propósito, números em casas de 109 px | leva 4 |
| 37 | 2026-10-02 | #110 | Criar · divulgação de terceiros | O menu Criar ganha, para a organização, "Divulgações de terceiros"; o influenciador (afiliado) ganha a tela "Divulgar" (escolher a rifa e até 5 mídias dela, escrever a legenda, ver as próprias com a situação em texto); o apostador, com a opção ligada, a tela "Publicar" (rifa em que comprou e um texto); em Afiliados a organização escolhe o modo (direto ou só depois da autorização) e autoriza as peças em cartão; na página da rifa, abaixo de "quem também joga", a seção "Divulgações" | Conferido em 820 e 1440: `/afiliado/divulgar` em duas colunas no computador; na rifa a seção Divulgações vai depois da compra no celular e no tablet | leva 4 |
| 38 | 2026-10-02 | #112 | Painel e página da rifa · mensagens | No sino do painel da organização e do afiliado aparece "N mensagens não lidas", que leva à caixa; na seção "Divulgações" da página da rifa, a peça do afiliado ganha o botão "Mensagem" (com as mensagens ligadas); conversa denunciada passa a aparecer na Caixa de entrada da plataforma | Conferido: o sino conta as mensagens nas três larguras | leva 4 |
| 39 | 2026-10-02 | #113 | Buscar e Reels | Em Buscar, abaixo do campo, os botões "Mais novas" e "Mais curtidas" e o seletor de estado ("Todo o Brasil" ou uma UF) filtram a grade; nos Reels, o som que a pessoa ligou continua ligado no reel seguinte e na próxima visita (se o navegador barrar, o reel toca mudo) | Conferido em 820 e 1440: pílulas e seletor de estado na mesma linha; grade de 4 e 6 colunas | leva 4 |
| 40 | 2026-10-02 | #115 | Mensagens · foto e online | Na conversa do apostador há o botão de foto ao lado do campo (a foto aparece na bolha e abre em outra aba); na lista, "Mostrar quando estou online" (desligado) e, quando os dois mostram, "Online agora" em texto, com a bolinha verde, na lista e no cabeçalho da conversa; na denúncia da plataforma a foto vira "[foto]" com link auditado | Conferido em 820 e 1440: tablet igual ao celular; no computador a lista de 340 px e a conversa ao lado (`/mensagens` do apostador entrou no `npm run telas`) | leva 5 |
| 41 | 2026-10-02 | #116 | Mensagens e página da rifa · grupos | Em Mensagens, a aba "Grupos" lista os grupos da pessoa (nome, rifa, prévia e não lidas) e abre o grupo (quem está nele, as mensagens, o campo de escrever, Denunciar e Sair); na página da rifa, o cartão "Grupos desta rifa" (só para apostador logado, depois das Divulgações) lista os grupos, cria um e entra; no painel da plataforma, "Grupos denunciados" ao lado das conversas denunciadas | Conferido em 820 e 1440: a aba Grupos na lista de 340 px no computador; o cartão da rifa segue na coluna da publicação | leva 5 |
| 42 | 2026-10-02 | #121 | Painel · assistente de IA | Na barra de cima do painel do master (e do organizador, se a plataforma liberar) aparece o botão do assistente (ícone de brilho, `aria-pressed`), entre o tema e o sino; o assistente só carrega no primeiro toque e abre a janela do Chatbase por cima do painel; em Aparência, o cartão "Assistente de IA (Chatbase)" | Conferido: o botão entre o tema e o sino nas três larguras (a janela do Chatbase deu lugar à coluna, registro 43) | leva 5 |
| 43 | 2026-10-02 | #122 | Painel · coluna do assistente | O botão do assistente (master; organizador e afiliado se a plataforma liberar) abre uma coluna nossa — cabeçalho com "Nova conversa" e fechar, a conversa e o campo "Sua pergunta" com enviar — que no celular cobre a tela como diálogo (o foco entra ao abrir e volta ao botão ao fechar; Esc só fecha com o foco nela); o widget do Chatbase saiu; em Aparência, o cartão ganhou "Liberar para o afiliado" | Conferido em 820 e 1440: no tablet a coluna cobre a tela como diálogo; no computador fica à direita e o painel abre 380 px | leva 5 |
| 44 | 2026-10-02 | #123 | Painel · plano do assistente | Para organizador e afiliado, a coluna do assistente ganha a faixa de saldo sob o título ("N crédito(s)… até dd/mm" ou "Sem assinatura ativa") com o botão "Plano"; sem assinatura ou sem crédito, o plano toma o lugar da conversa e o campo some: o botão "Assinar"/"Renovar" com preço e franquia, os pacotes avulsos, o CPF/CNPJ quando o provedor pede e o Pix em aberto (copia e cola, "Copiar o código Pix", conferido a cada 5 s); em Aparência, o cartão do assistente ganhou "Cobrança do organizador e do afiliado" (assinatura, franquia e até 4 pacotes) | Conferido: a faixa de saldo e o plano cabem na coluna de 380 px; no tablet igual ao celular | leva 5 |
| 45 | 2026-10-02 | #124 | Painel · ações do assistente | Quando o assistente pede para gravar algo (publicar, trocar a legenda, apagar a rifa, estornar), a conversa ganha o cartão azul "Confirme: …" com o resumo, o prazo ("até HH:MM") e os botões Confirmar e Cancelar; depois de decidir, a conversa mostra "✓ Feito pelo assistente…" ou "Você cancelou"; o texto inicial da coluna cita as ações; em Aparência, o cartão do assistente ganhou a lista "Ações do assistente" para cadastrar no Chatbase | Conferido: o cartão de confirmação na coluna de 380 px; no tablet igual ao celular | leva 5 |
| 46 | 2026-10-02 | #125 | Aparência · uso e receita do assistente | Abaixo do cartão do assistente, o cartão "Uso e receita do assistente": período (7, 30 ou 90 dias, com `aria-pressed`), quatro números (receita, mensagens, créditos consumidos com o do master à parte, assinaturas ativas), a lista por conta em cartões (nome, mensagens, créditos, receita, saldo, "Extrato" e "Ajustar"), o extrato aberto e o formulário "Ajustar créditos" (conta, créditos com −, motivo, "Lançar ajuste") | Conferido em 820 e 1440: cartões até o tablet e a tabela a partir de `xl`; o "(9)" das ações passou a `tnum` | leva 5 |
| 47 | 2026-10-02 | #127 | Página da rifa · resultado do sorteio | Quando o número sorteado não foi vendido, o cartão "Resultado do sorteio" mostra, abaixo do número sorteado, o quadro "número contemplado" (em verde) com a frase da regra da aproximação; no painel, o resultado do sorteio diz o contemplado ou "Nenhuma cota paga"; nos dados legais da rifa, o campo "Mínimo de cotas vendidas para sortear (%)" com a dica do número de cotas | Vale igual (o mesmo cartão na coluna da publicação); sem rifa sorteada no banco de exemplo, conferido pelo componente | leva 5 |
| 48 | 2026-10-02 | #128 | Painel · dados legais da rifa; vitrine e página da rifa | Nos dados legais, o grupo "Como a rifa chega ao sorteio" com quatro opções em cartões (uma coluna no celular, duas a partir de `sm`), com rótulo e explicação; o campo do mínimo só aparece em "Na data marcada"; em "quando completar" a data do sorteio fica desligada. Na vitrine, no perfil e na página da rifa, rifa sem data mostra "sorteio quando completar"; no resultado, "o prêmio fica com a promotora" quando é o caso | Conferido em 820 e 1440: os cartões em duas colunas; o rótulo do mínimo ficava na mesma linha do campo no computador — passou a `block` | leva 5 |
| 49 | 2026-10-02 | #129 | Página da rifa, carrinho e Minhas compras · reembolso | Quando faltam menos de 7 dias para o sorteio, acima da regra do reembolso (antes do Pix) aparece o quadro azul "Atenção: o sorteio é em … Você pode desistir desta compra com devolução integral até …"; no carrinho, um quadro por rifa, com o prêmio em negrito; o texto da regra passa a dizer "o que vier primeiro" e o adiamento; na janela "Pedir reembolso", a compra feita antes de um adiamento mostra a devolução integral; na ajuda, a pergunta "Por que meu prazo para desistir é menor que 7 dias?" | Conferido em 820 e 1440: o quadro na coluna da compra, acima da regra, antes do Pix | leva 5 |
| 50 | 2026-10-02 | #130 | Painel · dados legais da rifa | Marcando "Aceitar cotas de bônus", aparece logo abaixo o campo "Quantas cotas de bônus a autorização prevê" (número, com a dica de que cota grátis não conta para o mínimo de vendidas); desmarcar some com o campo | Conferido em 820 e 1440: o rótulo ficava ao lado do campo no computador — passou a `block` | leva 5 |
| 51 | 2026-10-02 | #131 | Painel · Afiliados (termo) e aceite do afiliado | O termo de adesão ganha as cláusulas de natureza, divulgação, descumprimento, dados pessoais e tributos (o texto que o afiliado lê ao aderir fica mais longo); no cartão "Termo de adesão de afiliado", o quadro azul "O texto do termo mudou…" quando a versão em vigor ficou atrás, e o botão de publicar a versão seguinte libera mesmo sem mudar o percentual | A conferir na leva: o mesmo cartão no tablet e no computador. Conferido na leva 6: o cartão do termo e o aceite do afiliado (Organizações) cabem nas três larguras — nada a arrumar | leva 6 |
| 52 | 2026-10-02 | #132 | Minha conta e painel do afiliado · verificação | No formulário da verificação, a autorização da foto vira um quadro destacado "Autorização para comparar a foto (dado biométrico)" com o texto completo e "Li e autorizo…"; no cartão "Perfil verificado", a seção da autorização: com ela, "Você autorizou em dd/mm/aaaa" e o botão "Revogar autorização" (pede confirmação); sem ela, o texto, a caixa e o botão "Autorizar" | A conferir na leva: a mesma seção no tablet e no computador. Conferido na leva 6: no painel do afiliado, dados e documentos lado a lado no computador, como estava. Arrumado: em Minha conta do apostador (coluna estreita de propósito), dados e documentos ficavam em duas colunas de ~350 px no computador — banco, agência e chave Pix espremidos e a coluna dos documentos sobrando; agora um embaixo do outro em toda largura | leva 6 |
| 53 | 2026-10-02 | #133 | Termos de uso, Privacidade, Perfil e Criar conta | Páginas novas `/termos` e `/privacidade` (texto em seções, coluna de leitura, a data de vigência e o link de uma para a outra); em `/perfil`, os itens "Termos de uso" e "Política de privacidade" abaixo da Central de ajuda; em Criar conta, a linha "Ao criar a conta, você declara ter 18 anos…" com os dois links, embaixo do botão | A conferir na leva: as duas páginas e a linha nova no tablet e no computador. Conferido na leva 6: Termos e Privacidade na coluna de leitura, o perfil e o Criar conta nas três larguras — nada a arrumar | leva 6 |
| 54 | 2026-10-02 | #134 | Painel da plataforma · Pedidos | No alto de Pedidos (só a plataforma, sem filtro), o cartão "Pix a devolver" quando há Pix confirmado depois da reserva vencer ou do sorteio: cada caso com pedido, valor, rifa, motivo e a pílula da situação, o botão "Devolver pelo provedor" e o campo "Como foi resolvido por fora" com "Marcar como resolvido"; os resolvidos num "Resolvidos (N)" recolhido. Na Caixa de entrada, o tipo "Pix a devolver" | A conferir na leva: o cartão no tablet e no computador. Arrumado na leva 6: no tablet o campo "Como foi resolvido por fora" ficava espremido entre os dois botões (o rótulo quebrava palavra por palavra); botão, campo e botão lado a lado só a partir de `xl`, abaixo disso um embaixo do outro | leva 6 |
| 55 | 2026-10-02 | #136 | Início (vitrine) · tela do sorteio | No celular, deslizar o dedo para a direita no Início (ou tocar no ícone de transmissão à esquerda da logo) traz da esquerda a tela do sorteio principal, como no YouTube: "Voltar ao início" e "Próximo sorteio"/"Sorteio ao vivo" no alto, o vídeo da transmissão (ou a contagem) com o botão de tela cheia, o prêmio e a promotora embaixo e os comentários da rifa abertos; deslizar de volta, "Voltar" ou o voltar do aparelho fecham | Só celular (abaixo de 768 px): do tablet em diante a coluna ao vivo já está ao lado do feed e nem o botão nem o gesto existem. Conferido na leva 6: só celular, como registrado — nada a arrumar | leva 6 |
| 56 | 2026-10-02 | #137 | Início (vitrine) · faixa do estado | O seletor "Rifas perto de" virou uma caixa pequena à esquerda com a sigla do estado (BR para todo o Brasil) e a lista com os nomes ao abrir; à direita, a contagem do próximo sorteio (fundo escuro, casas d/h/m/s), que é botão e abre a tela do sorteio | Só celular: no tablet e no computador o seletor segue o de antes ("Rifas perto de" com o nome do estado) e não há contagem — lá o sorteio principal é a coluna ao vivo. Conferido na leva 6: só celular, como registrado — nada a arrumar | leva 6 |
| 57 | 2026-10-02 | #138 | Início (vitrine) · tela do sorteio; página da rifa; painel · Sorteios oficiais | A tela do sorteio (deslizar para a direita) passa a mostrar só o sorteio oficial da plataforma: contagem ou transmissão, nome, loteria e concurso, e a fileira horizontal "Rifas neste sorteio" (capa, prêmio, organização); sem comentários por enquanto. A contagem da faixa do estado conta até ele. Na página da rifa integrada, o selo "Sorteio oficial · Federal 6012 · 02/12" com "Ver o sorteio". Tela nova no painel: calendário do mês na largura toda, cada dia de sorteio na cor da loteria da Caixa (o nome e o concurso dentro do dia a partir de `sm`, legenda embaixo), e os sorteios (o master cadastra, edita, cancela e lança o resultado; a organização integra a rifa em rascunho) | Tablet e computador: a coluna ao vivo segue como estava; o painel abre em duas colunas a partir de `xl`. Arrumado na leva 6: no tablet o dia do calendário cortava o nome da loteria ("Fede…"); abaixo de `lg` vai a sigla (Fed., Mega, Quina, Lotof.) com o concurso embaixo. No computador, o cadastro (coluna de 380 px) cortava o campo de data: concurso e data um embaixo do outro em `xl`. O "Ver o sorteio" do selo ganhou alvo de 24 px. A tela do sorteio, só celular, conferida | leva 6 |
| 58 | 2026-10-03 | #139 | Página da rifa (resultado); painel · Sorteios oficiais e edição da rifa (adiar); Atendimento › Rifas | No resultado do sorteio, o nome da loteria (Mega-Sena, Quina, Lotofácil ou Federal) e o rótulo do resultado ("6 dezenas da Mega-Sena") em "Como conferir". No calendário, a rifa publicada que não pôde sortear mostra "Ainda não sorteou: <motivo>", e a da organização diz como trocar de sorteio; lançar o resultado diz quantas rifas sortearam. No "Adiar sorteio", o campo "Sorteio oficial (opcional)" com os sorteios do calendário — escolhido, a data vira a dele. No pedido de adiamento, "No sorteio oficial: …" | A conferir na leva: os mesmos cartões no tablet e no computador. Conferido na leva 6: o "Adiar sorteio" com o campo do sorteio oficial e os cartões do calendário em 820 e 1440 — nada a arrumar | leva 6 |
| 59 | 2026-10-03 | #140 | Início (vitrine) · tela do sorteio; painel · Sorteios oficiais | Na tela do sorteio do celular, embaixo da fileira "Rifas neste sorteio", a seção "Comentários (N)" aberta, como no YouTube: a lista com foto, apelido, tempo, curtir e responder, e o campo "Participe da conversa…" (sem o presente); sem conta, "Entre na sua conta para comentar". No calendário da plataforma, o botão "Comentários (N)" no cartão do sorteio abre a mesma lista numa janela, com "Apagar" | Só celular na tela do sorteio (do tablet em diante a coluna ao vivo segue sem comentários); a janela de moderação a conferir na leva no tablet e no computador. Conferido na leva 6: a janela de moderação sobe de baixo no tablet e fica no centro no computador. Arrumado: o botão "Comentários (N)" do calendário ganhou alvo de 24 px | leva 6 |
| 60 | 2026-10-03 | #141 | Início (vitrine) · tela do sorteio; painel · Atendimento › Denúncias | Nos comentários do sorteio oficial, "Denunciar" ao lado de "Responder" para quem entrou e não escreveu o comentário; abre a janela "Denunciar comentário" (motivo, texto opcional e o protocolo ao enviar). No Atendimento › Denúncias da plataforma, o cartão "Comentários do sorteio oficial denunciados": a fila (protocolo, motivo, sorteio) e, ao abrir, o comentário guardado (e o de cima, se for resposta), com "Procedente: apagar o comentário" e "Improcedente" | Só celular na tela do sorteio; o cartão do Atendimento a conferir na leva no tablet e no computador. Conferido na leva 6: o cartão de denúncias do Atendimento (fila e item aberto) cabe em 820 e 1440 — nada a arrumar | leva 6 |
| 61 | 2026-10-03 | #146 | Painel (organizador e afiliado) · o sino da barra de cima | No sino da organização, a linha "N divulgações esperando a sua autorização" (leva à fila em Afiliados); no do afiliado, "N divulgações decididas pela organização" (leva a Divulgar), que zera ao abrir o sino. O número vai no rótulo do sino. O apostador recebe o aviso da decisão da peça dele no trevo (ícone de megafone) | Conferido na leva 7: o menu do sino tem 320 px e cabe nas três larguras, com a linha a mais. Arrumado: no painel do afiliado o sino aberto sem nada a avisar ficava vazio (só o título) — agora diz "Nada novo por aqui.", e o afiliado e o cambista deixam de pedir os comentários do painel, que não são deles | leva 7 |
| 62 | 2026-10-03 | #147 | Publicar (apostador); painel do afiliado · Divulgar; Afiliados · fila de divulgações; página da rifa · Divulgações | Em "Minhas publicações" e "Minhas divulgações", o botão "Editar" ao lado de "Retirar" (em análise ou no ar): o formulário volta preenchido com "Salvar edição" e "Cancelar edição", a rifa travada, e o aviso de que a peça editada sai da página até a organização ler de novo (no modo direto do afiliado, segue no ar). A peça editada mostra "Editada" na lista, na fila da organização e na página da rifa | Conferido na leva 7: o formulário de edição é o mesmo cartão, ao lado de "Minhas divulgações" no computador e empilhado no tablet — nada a arrumar | leva 7 |
| 63 | 2026-10-03 | #148 | Publicar (apostador); página da rifa · Divulgações; Afiliados · fila de divulgações | Em Publicar, a área "Fotos (até 4, opcional)" com "Escolher fotos", as miniaturas com "✕" para tirar e, na edição, "Trocar as fotos" e "Tirar as fotos"; em "Minhas publicações", as miniaturas da peça. Na página da rifa, as fotos do apostador numa fileira que rola de lado; na fila da organização, as miniaturas, que abrem a foto em outra aba | Conferido na leva 7: as miniaturas cabem na fila da organização nas três larguras e a fileira da página da rifa rola sem estourar — nada a arrumar | leva 7 |
| 64 | 2026-10-03 | #149 | Painel do afiliado · Divulgar; Publicar (apostador); Afiliados · fila de divulgações | Em Divulgar, a área "Suas fotos (até 4, opcional)" entre as mídias da rifa e a legenda, com a dica de que só vale foto dele ou de quem autorizou e sem menores; no modo direto, a peça com foto diz que vai ao ar só depois da aprovação e o botão vira "Enviar para autorização"; em "Minhas divulgações", as miniaturas. Em Publicar, a mesma área agora se chama "Suas fotos" (componente comum). Na fila da organização, o texto explica que a peça com foto sempre espera a autorização | Conferido na leva 7: a área "Suas fotos" fica no cartão do formulário, que no computador divide a linha com "Minhas divulgações" — nada a arrumar | leva 7 |
| 65 | 2026-10-03 | #150 | Painel · Stories | No formulário do story, o campo "Publicar em (opcional)" (data e hora) com a dica de até 7 dias e das 24 h contadas dali; o botão vira "Agendar story". A lista passa a se chamar "No ar e agendados", e o agendado mostra a pílula "Agendado" com a data e a hora | Conferido na leva 7: o campo de data e a pílula "Agendado" na mesma coluna do formulário, nas três larguras — nada a arrumar | leva 7 |
| 66 | 2026-10-03 | #151 | Publicar (apostador); painel do afiliado · Divulgar; Afiliados · fila de divulgações | O campo "Publicar em (opcional)" (data e hora, com "Sem agenda" para limpar) abaixo das fotos, com a dica de que a autorização da organização vem antes; em "Minhas publicações" e "Minhas divulgações", "Agendada: <data>" ao lado da situação; na fila da organização, "· agendada para <data>" na linha de quem publicou | Conferido na leva 7: o campo de data com "Sem agenda" ao lado cabe no tablet e no computador — nada a arrumar | leva 7 |
| 67 | 2026-10-03 | #152 | Painel · Rifas › edição (aba "A rifa") e a grade de capas | No rascunho, o cartão "Publicação agendada": o campo "Publicar em (opcional)" com a dica (até 30 dias, 1 hora antes do sorteio, tudo conferido na hora), "Agendar publicação"/"Mudar a hora" e "Tirar a agenda", a pílula "Agendada · <data>", o aviso do que ainda falta e, se a hora passou sem publicar, o motivo em vermelho. Na grade de capas, os selos "Publicação agendada" e "Agendada não publicou" | Conferido na leva 7: o cartão "Publicação agendada" na aba "A rifa", embaixo do formulário, nas três larguras — nada a arrumar | leva 7 |
| 68 | 2026-10-03 | #153 | Início (vitrine) · topo e faixa do estado; tela do sorteio | Saiu o ícone de transmissão à esquerda da logo (o topo é a logo e o trevo). A contagem da faixa do estado ficou maior (44 px de altura, casas d/h/m/s em 14 px) e, sem sorteio oficial marcado, conta até o próximo sorteio de rifa — o mesmo da coluna ao vivo; tocar abre a tela do sorteio, que nesse caso mostra a contagem ou a transmissão da rifa, o prêmio, a promotora, "Ver a rifa" e os comentários dela | Conferido na leva 7: do tablet em diante a coluna ao vivo segue como estava e a contagem não aparece — nada a arrumar | leva 7 |
| 69 | 2026-10-03 | #154 | Início (vitrine) · tela do sorteio | A tela do sorteio não mostra mais nenhuma rifa em detalhe (saíram o prêmio, a promotora, "Ver a rifa" e os comentários da rifa do fallback, e as capas da fileira do sorteio oficial): as rifas aparecem como avatares no modelo dos stories — a foto da organização com o anel e o nome embaixo. Tocar na borda (o anel) abre o story da organização; tocar no meio abre a página da rifa. Sem sorteio oficial, a fileira é "Rifas dos próximos sorteios" | Conferido na leva 7: só celular; tablet e computador sem mudança — nada a arrumar | leva 7 |
| 70 | 2026-10-03 | #155 | Página da rifa; painel · Rifas › edição (aba Publicação) | Em cima da rifa saiu a faixa escura com o texto por cima: a data do sorteio, o selo e o prêmio viram texto, e o banner da rifa abre o carrossel, como no feed. Quando a rifa beneficia uma ONG ou fundação, o banner dela (só a imagem, cantos arredondados) vai em cima; tocado, abre a tela da entidade por cima da rifa — X no alto, a imagem grande, o nome, o texto e, na base, os botões redondos das redes e o "Site". No painel, o cartão "Entidade beneficiada" na aba Publicação: "Esta rifa beneficia uma entidade", a imagem, o nome, o texto, o site, as redes, "Salvar entidade" e "Retirar a entidade" | Conferido na leva 7: a tela da entidade fica no centro do tablet e do computador. Arrumado: no tablet o carrossel da rifa ia até a borda e ficava desalinhado do banner da entidade logo acima — do `md` em diante fica na coluna, com os cantos arredondados (como no feed); no cartão do painel, o campo nativo "Choose File" virou o botão "Escolher a imagem" | leva 7 |
| 71 | 2026-10-03 | #157 | Painel do afiliado · Divulgar; Afiliados · fila de divulgações; página da rifa · Divulgações | Em Divulgar, a área "Seu vídeo (até 60 s, opcional)" abaixo das fotos, com "Escolher vídeo"/"Trocar o vídeo", a prévia tocável e "Tirar o vídeo"; foto ou vídeo — escolhido um, a área do outro some e uma linha explica. Em "Minhas divulgações", na fila da organização e na página da rifa, o vídeo da peça toca no toque, com o pôster | Conferido na leva 8: o vídeo (até 320 px de altura) fica na coluna da publicação no computador e no cartão da divulgação no tablet, sem estourar; nada a arrumar | leva 8 |
| 72 | 2026-10-04 | #158 | Início (vitrine) · feed | Entre as rifas, uma a cada 3, entra a divulgação aprovada de um influenciador ou apostador: cartão com borda, a etiqueta "Divulgação", quem publicou, as fotos ou o vídeo, a legenda, "Mensagem" (afiliado) e, embaixo, a rifa (prêmio e organização) com "Ver a rifa →" | Conferido na leva 8: o cartão fica na coluna do feed, com a mesma largura do cartão da rifa, ao lado da coluna ao vivo; nada a arrumar | leva 8 |
| 73 | 2026-10-04 | #160 | Painel · Rifas › edição (aba Publicação); Reels | Na aba Publicação, o cartão "Reels da rifa": a legenda do vídeo (opcional), "Publicar vídeo no Reels" e a lista dos vídeos, cada um com a prévia em pé, a duração, a legenda editável, "Salvar legenda" e "Apagar". No Reels, cada vídeo é uma tela (um de cada rifa por rodada), com a legenda do vídeo | Arrumado na leva 8: os vídeos do cartão "Reels da rifa" ficavam em duas colunas a partir de `sm` e, no tablet com o menu aberto, a legenda ficava uma palavra por linha — agora uma coluna até `xl` e duas a partir dele | leva 8 |
| 74 | 2026-10-04 | #161 | Stories (visualizador); painel · Stories | No story com enquete, o cartão branco no meio: a pergunta e de 2 a 4 opções; tocada uma opção, cada uma mostra o percentual (barra e número), a escolhida com ✓ e "Seu voto"; sem conta, "Entre na sua conta para votar". No painel, o quadro "Enquete (opcional)" no Novo story (pergunta, opções, "Mais uma opção"/"Tirar") e, na lista, os totais de cada opção | Conferido na leva 8: o cartão da enquete fica dentro da coluna do story (9:16) no tablet e no computador; nada a arrumar | leva 8 |
| 75 | 2026-10-04 | #162 | Stories (visualizador); painel · Stories | No story, as figurinhas por cima da imagem, cada uma no ponto escolhido: a contagem até o sorteio (fundo escuro, "Sorteio em" e as casas d/h/m/s), o botão verde "Comprar" (leva à compra rápida da rifa), o texto num balão escuro e um emoji grande. No painel, o quadro "Figurinhas (opcional)" no Novo story ("+ Contagem do sorteio", "+ Botão Comprar", "+ Texto", "+ Emoji"; em cada uma, Lado e Altura e "Tirar") com a prévia do lugar ao lado; na lista, quais figurinhas o story tem | Conferido na leva 8: as figurinhas ficam no ponto escolhido dentro da coluna do story no tablet e no computador, e a prévia de 120 px fica ao lado da lista no painel do tablet; nada a arrumar | leva 8 |
| 76 | 2026-10-04 | #163 | Painel · Aparência, Antifraude e Configurações (plataforma) | Aparência em quatro abas (Identidade e tela inicial · Topo do app · Rodapé e empresa · Assistente de IA), com a barra de salvar e publicar nas abas do template; Antifraude com os números em cima e três abas (Limites · Bloqueios manuais · O que foi barrado); em Configurações, a "Trilha de auditoria" da plataforma saiu do fim de "Conta e segurança" para uma aba própria | Arrumado na leva 8: em "O que foi barrado", no computador, o cartão do resumo esticava até a altura da lista de recusas (um bloco branco vazio) — a grade passou a `items-start`. A faixa de abas rola para o lado no celular e a pré-visualização da Aparência fica ao lado das abas a partir de `xl` | leva 8 |
| 77 | 2026-10-04 | #165 | Início (vitrine) · tela do sorteio; perfil da organização; perfil do apostador | A foto de perfil passa a ter o tamanho da fileira de stories da home do Instagram (76 px, `FOTO_COMO_NO_INSTAGRAM`): os avatares da tela do sorteio (de 66; com o anel, 96), a foto do perfil da organização (de 84) e os destaques (de 64), o `/u/<apelido>` (de 112) e o `/perfil` (de 72). O feed e a fileira de stories da vitrine ficam como estavam | Conferido na leva 9: no perfil da organização a foto de 76 px fica no cartão da coluna de 320 px, ao lado das rifas em 2 colunas, no tablet e no computador; nada a arrumar | leva 9 |
| 78 | 2026-10-04 | #166 | Início (vitrine) · tela do sorteio, tela cheia | Na tela cheia do vídeo do sorteio oficial, os comentários ficam como o chat da Twitch: ao lado do vídeo (deitado, à direita ou à esquerda; em pé, embaixo) ou por cima, num canto, com as últimas mensagens e o "Comentar". O botão "Comentários" na barra escolhe onde ficam, o fundo e o lado, lembrados no aparelho. Com o celular deitado a tela do sorteio não some mais (passava de `md`) e o vídeo pequeno fica com 60% da altura | Conferido na leva 9: do tablet em diante a tela cheia é a da coluna ao vivo, sem os comentários do sorteio oficial; a tela cheia em 820, 1180 e 1440 ocupa a janela sem rolar para o lado. Nada a arrumar | leva 9 |
| 79 | 2026-10-04 | #167 | Início (vitrine) · tela do sorteio, tela cheia | A conversa por cima do vídeo passa a ser só as mensagens, sem fundo (com sombra no texto) e cada pessoa numa cor, como na Twitch, e a escolha de "Fundo" saiu das opções de quem assiste (o YouTube e a Twitch não dão essa escolha). Só a plataforma pode pôr um fundo escuro, de 0% a 100%, no cartão "Topo do app" em Aparência; o quadro das opções segue escuro e meio transparente | Conferido na leva 9: a conversa por cima é só do celular; o cartão "Topo do app" em Aparência fica na aba dele nas três larguras. Nada a arrumar | leva 9 |
| 80 | 2026-10-04 | #168 | Início (vitrine) · tela do sorteio, tela cheia | A tela cheia deita o celular sozinha, como no YouTube (onde o navegador deixa: Android), e volta a girar livre ao sair. A conversa por cima do vídeo deixa o toque passar para o player (play, som, barra do YouTube); só o "Comentar" pega o toque. No painel do sorteio oficial, o campo da transmissão diz se o link vai tocar na tela e traz "Qual link copiar?" | Conferido na leva 9: o aviso do link e o "Qual link copiar?" ficam embaixo do campo da transmissão no painel, em 820 e 1440, sem estourar; a tela cheia da coluna ao vivo não deita nada no computador. Nada a arrumar | leva 9 |
| 81 | 2026-10-04 | #169 | Início (vitrine) · tela do sorteio | A transmissão entra na tela 30 minutos antes da hora do sorteio (a contagem segue até lá; "Sorteio agora" continua na hora). Sem link colado no sorteio oficial, a tela toca a live do canal oficial da loteria, cadastrado uma vez no painel (cartão "Canal oficial de cada loteria") | Conferido na leva 9: o cartão "Canal oficial de cada loteria" fica embaixo de "Novo sorteio" no painel, com os quatro campos na largura do cartão, em 820 e 1440; nada a arrumar | leva 9 |
| 82 | 2026-10-04 | #170 | Início (vitrine) · tela do sorteio, tela cheia | No iPhone (o Safari não deixa o site girar a tela nem pôr a tela do sorteio em tela cheia de verdade), a tela cheia com o aparelho em pé passa a ser desenhada deitada: o vídeo ocupa a tela inteira de lado, com a conversa ao lado, e é só virar o celular. Com o aparelho já deitado, nada muda | Conferido na leva 9: do tablet em diante a tela cheia não é a falsa girada (o tablet deitado e o computador já são deitados; nenhuma tela girou em 820, 1180 e 1440). Nada a arrumar | leva 9 |
| 83 | 2026-10-05 | #171 | Início (vitrine) · tela do sorteio, tela cheia | As mensagens por cima do vídeo ganham contorno fino nas letras (1 px preto em volta, como legenda de filme) no lugar da sombra: o nome e o texto continuam legíveis em cima de qualquer cor do vídeo, sem fundo atrás | Conferido na leva 9: o contorno é só da conversa por cima do celular; nada a arrumar | leva 9 |
| 84 | 2026-10-05 | #173 | Painel · Rifas › edição (aba Publicação), menu Criar · Reels | No celular e no tablet, criar reels é tela cheia como no Instagram: o vídeo ocupa a tela, as ferramentas ficam em ícones na coluna da direita (Legenda, Rifa, Som, Trocar, com o nome embaixo), a prévia da rifa e da legenda embaixo à esquerda e "Publicar no Reels" no pé, com o progresso do envio; o vídeo publicado abre igual (Legenda, Som, Apagar). O cartão "Reels da rifa" vira grade de capas em pé com a duração, as regras em ícones e a barra "N de 10"; o menu Criar ganha o item "Reels" | No computador o cartão segue com a legenda e o arquivo no próprio cartão e o editor abaixo da grade; a grade visual vale nas três larguras | aguardando leva |
| 85 | 2026-10-05 | #176 | Painel · Sorteios oficiais (calendário); página da rifa (selo) | As cores da Mega-Sena, da Quina e da Lotofácil passam a ser as medidas nos cartões do app Loterias Caixa (verde `#49a35b`, azul `#343590`, roxo `#88348e`); a Federal segue a do site | Mesma cor nas três larguras; nada a arrumar | aguardando leva |
| 86 | 2026-10-05 | #177 | Painel · Sorteios oficiais (calendário); Rifas › edição (Autorização e sorteio, Adiar) | Só a Loteria Federal recebe rifa (decisão do advogado: é a apuração da autorização SPA/MF). Mega-Sena, Quina e Lotofácil seguem no calendário com o motivo em texto ("fica só no calendário") e saem da lista de escolha da rifa e do adiamento | Mesma regra nas três larguras; nada a arrumar | aguardando leva |
| 87 | 2026-10-05 | #180 | Painel · Configurações (aba Organização e perfil) | Cartão novo "Contrato da plataforma": a organização lê o texto em vigor numa caixa com rolagem própria, marca "Li o contrato e aceito" e aceita; a pílula diz "falta aceitar" ou "aceito". A plataforma vê "Contrato com as organizações": quantas aceitaram, o texto em vigor e o campo da versão seguinte | Mesmo cartão nas três larguras, em coluna inteira; nada a arrumar | aguardando leva |
| 88 | 2026-10-05 | #181 | Painel · Rifas (Nova rifa; edição: Autorização e sorteio, Pacotes e cotas premiadas); Painel · Sorteios oficiais; página da rifa (mapa, cartelas, resultado), carrinho, pedido, Minhas compras, bilhetes, cambista | A rifa apurada pela Loteria Federal mostra os números a partir de zero (000 a 999); o total da rifa nova é escolhido entre 100, 1.000, 10.000, 100.000 e 1.000.000 (botões); a promotora escolhe o método de apuração nos dados legais; a plataforma libera os métodos no calendário; o resultado mostra a leitura passo a passo dos 5 prêmios, sem semente | Mesmas peças nas três larguras (botões do total em 3 colunas no celular, 5 a partir de `sm`); nada a arrumar | aguardando leva |
