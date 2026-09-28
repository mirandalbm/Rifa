# Versões — celular, tablet e computador

Guia para mudar a tela sem criar diferença entre as versões. Vale para
qualquer mudança visual: leia antes de mexer em tela, e anote no
[registro](#registro-das-mudanças-do-celular) no mesmo PR.

Última revisão completa: 28/09/2026 (leva 0, abaixo).

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
    trás; `role="dialog"` e `aria-modal`. Hoje 3 das 6 seguem tudo
    ([P2](#pendências)).
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
| `/r/:rifa`, `/o/:org/r/:rifa` | `pages/Rifa.tsx` | larga | publicação, compra, resto | igual, em 768 ([P1](#pendências)) | 2 colunas: publicação à esquerda; compra à direita, fixa e com rolagem própria, total e Pix no pé |
| `/o/:org` | `pages/Perfil.tsx` | larga | capa 3:1 de ponta a ponta, cartão do perfil, rifas em 1 coluna | capa com cantos; rifas em 1 coluna ([P1](#pendências)) | capa 4:1; cartão de 320 px fixo à esquerda; rifas em 2 colunas |
| `/estado/:uf` | `pages/Estado.tsx` | larga | feed em 1 coluna | 2 colunas | 3 colunas |
| `/u/:apelido` | `pages/Usuario.tsx` | larga | feed em 1 coluna | 2 colunas | 3 colunas |
| `/carrinho` | `pages/Carrinho.tsx` | larga | rifas por organização; seus dados e o botão de pagamento (o único) no fim | igual, em 768 | rifas à esquerda; total, dados e o botão à direita, fixos na rolagem |
| `/carrinho/pix/:codigo` | `pages/CarrinhoPix.tsx` | 768 | coluna | igual | igual |
| `/pedido/:codigo` | `pages/Pedido.tsx` | 768 | coluna | igual | igual |
| `/minhas-cotas`, `/minhas-compras` | `pages/MinhasCotas.tsx` | 768 | coluna com abas | igual | igual |
| `/notificacoes` | `pages/Notificacoes.tsx` | 768 | coluna | igual | igual |
| `/perfil` | `pages/PerfilDoUsuario.tsx` | 768 | foto e nome, menu da conta (bilhetes, reembolsos, conta, painel, ajuda), tema, cookies e o "18+" | igual | igual |
| `/reels`, `/mensagens`, `/buscar` | `pages/EmBreve.tsx` | 768 | "Em breve" com o que vem | igual | igual |
| `/ajuda` | `pages/Ajuda.tsx` | 768 | coluna | igual | igual |
| `/r/:rifa/regulamento`, `/o/:org/r/:rifa/regulamento` | `pages/Regulamento.tsx` | 768 | coluna | igual | igual |
| `/recibo/:codigo` | `pages/Recibo.tsx` | 768 | coluna | igual | igual |
| `/bilhete/:codigo` | `pages/Bilhete.tsx` | nenhuma | papel de 32 colunas | igual | igual |
| `/entrar`, `/criar-conta`, `/seja-afiliado` | `pages/Login.tsx`, `CriarConta.tsx`, `CadastroAfiliado.tsx` | nenhuma | cartão de 384 px no centro | igual | igual |

### Painel do organizador e da plataforma

| Rota | Arquivo | Celular | Tablet | Computador |
|---|---|---|---|---|
| `/admin` | `pages/admin.tsx` (`AdminPainel`) | grade bento em 1 coluna | 2 colunas | 4 colunas; receita com o gráfico em 2×2 |
| `/admin/campanhas` | `admin.tsx` (`AdminCampanhas`) | formulário e lista | formulário em 2 colunas | igual ao tablet ([P5](#pendências)) |
| `/admin/pedidos` | `admin.tsx` (`AdminPedidos`) | tabela rolando no cartão ([P5](#pendências), [P10](#pendências)) | tabela | tabela |
| `/admin/resultados` | `pages/adminResultados.tsx` | números 2 por linha | 3 por linha | 6 por linha (`xl`); gráfico e tabelas em 2 colunas |
| `/admin/stories` | `pages/adminStories.tsx` | formulário; stories 2 por linha | stories 3 por linha | formulário e stories lado a lado |
| `/admin/atendimento` | `pages/adminAtendimento.tsx` | abas rolando; lista e conversa empilhadas | igual | lista e conversa lado a lado só em `xl` |
| `/admin/afiliados` | `admin.tsx` (`AdminAfiliados`) | empilhado | igual | 2 colunas |
| `/admin/cambistas` | `pages/adminCambistas.tsx` | empilhado | igual | 2 colunas |
| `/admin/financeiro` | `admin.tsx` (`AdminFinanceiro`) | empilhado | igual | 2 colunas |
| `/admin/sorteios` | `admin.tsx` (`AdminSorteios`) | lista | igual | igual |
| `/admin/cobranca` | `pages/adminCobranca.tsx` | números empilhados; lista longa ([P10](#pendências)) | números 3 ou 4 por linha | igual ao tablet |
| `/admin/usuarios` | `pages/adminUsuarios.tsx` | lista | detalhes em 3 colunas | igual |
| `/admin/patrocinio` | `pages/adminPatrocinio.tsx` | empilhado | formulários em 2 colunas | cartões em 2 colunas |
| `/admin/marketing` | `pages/adminMarketing.tsx` | empilhado | igual | 2 colunas |
| `/admin/exportacoes` | `pages/adminExportacoes.tsx` | 1 coluna | 2 colunas | 2 colunas |
| `/admin/configuracoes` | `admin.tsx` (`AdminConfiguracoes`) | empilhado | igual | cartões em 2 colunas |
| `/admin/organizacoes` (plataforma) | `pages/adminOrganizacoes.tsx` | empilhado | detalhes em 2 e 3 colunas | lista e cartão de 340 px lado a lado |
| `/admin/bonus` (plataforma) | `pages/adminBonus.tsx` | empilhado | igual | 2 colunas |
| `/admin/fiscal` (plataforma) | `pages/adminFiscal.tsx` | lista | detalhe em 2 colunas | igual |
| `/admin/aparencia` (plataforma) | `pages/adminAparencia.tsx` | edição e pré-visualização empilhadas | igual | igual; lado a lado a partir de `xl` |
| `/admin/antifraude` (plataforma) | `pages/adminAntifraude.tsx` | empilhado | números em 3 colunas | 2 colunas |
| `/conta/senha` | `pages/admin.tsx` | formulário | igual | igual |

### Afiliado e cambista

| Rota | Arquivo | Celular | Tablet | Computador |
|---|---|---|---|---|
| `/afiliado` | `pages/afiliado.tsx` | empilhado | números 2 por linha | números 4 por linha; 2 colunas |
| `/afiliado/links` | `pages/afiliado.tsx` | link e material empilhados | QR de 132 px ao lado do texto | igual |
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
| P1 | O tablet é o celular esticado na página da rifa e no perfil: foto 4:5 com 768 px de largura e rifas em 1 coluna (o perfil tem 4.205 px de altura em 820, contra 2.759 em 390) | `Rifa.tsx`, `Perfil.tsx` | tablet |
| P2 | Seis janelas feitas à mão, com comportamentos diferentes: só 3 fecham no Esc e travam a rolagem; fundo `bg-black/50` numa e `/30` noutra. Alvo: um componente `Janela` com a regra 14 | `Comentarios.tsx`, `Stories.tsx`, `EscolherBilhete.tsx`, `Seguranca.tsx`, `Perfil.tsx`, `MinhasCotas.tsx` | todas |
| P3 | `h1` em 9 combinações de classe. Padrão: `font-display text-xl font-extrabold` | várias | todas |
| P4 | A classe do campo de digitar repetida mais de 80 vezes. Alvo: um componente `Campo` (rótulo + campo + erro) | várias | todas |
| P5 | Tabelas do painel (campanhas, cobrança, pedidos) apertadas no celular. Alvo: cartão por linha no celular, tabela a partir de `sm` | `admin.tsx`, `adminCobranca.tsx` | celular |
| P6 | "Nova venda" do cambista ocupa a largura toda no computador | `cambista.tsx` | computador |
| P7 | O degradê de "sem foto" (`#0B1F14` → `#00873E`) repetido em 3 telas. Alvo: uma classe | `Publicacao.tsx`, `Rifa.tsx`, `Vitrine.tsx` | todas |
| P8 | A janela de comentários sobe de baixo também no computador | `Comentarios.tsx` | computador |
| P9 | 49 dos 51 componentes de `components/ui` não são usados (só `toaster` e `tooltip`) | `components/ui/` | — |
| P10 | Pedidos (11.599 px) e Cobrança (15.079 px) sem paginação no celular | `admin.tsx`, `adminCobranca.tsx` | celular |
| P11 | Ícones do lucide (traço 2) e os desenhados à mão (traço 1,75) misturados | `components/` | todas |
| P12 | Botões do topo com 24 a 28 px de altura; o recomendado para toque é 36 px ou mais | `AppShell.tsx` | celular |
| P13 | Grades antigas sem `grid-cols-1` (regra 4) — hoje não estouram, mas estourariam com um texto maior | várias | todas |
| P14 | Topo da loja apertado no celular: "Minhas cotas" quebra em duas linhas em 390 px com a marca padrão, e aperta mais com marca longa. Forçar uma linha estouraria a página; pede decisão (ícone no lugar do texto, ou levar para o menu) | `AppShell.tsx` (`PublicShell`) | celular |

## Levas

| Leva | Data | PR | Mudanças | Resumo |
|---|---|---|---|---|
| 0 | 2026-09-28 | #58 | 1 a 2 | Revisão completa das três versões, correções acima e este guia |

## Registro das mudanças do celular

Uma linha por mudança, no mesmo PR que a faz. Situação: `aguardando leva`
ou `leva N`. O teste confere o formato, a numeração e o limite da leva.

| Nº | Data | PR | Tela | O que mudou no celular | Tablet e computador | Situação |
|---|---|---|---|---|---|---|
| 1 | 2026-09-28 | #58 | Carrinho | Saiu o "Pagar tudo num Pix só": o pagamento é só o Pix da plataforma, e o split para cada promotora fica por dentro | Vale igual; no computador o total e o botão seguem na coluna da direita | leva 0 |
| 2 | 2026-09-28 | #58 | Carrinho | Saiu o "Comprar" de cada rifa: fica só o botão de pagamento | Vale igual; conferido em 820 e 1440 | leva 0 |
| 3 | 2026-09-28 | #58 | Afiliado · Saques | Trocar a chave Pix pede a senha ("Sua senha, para confirmar") e mostra se trocou ou o motivo da recusa | Vale igual (mesmo cartão); a conferir na leva | aguardando leva |
| 4 | 2026-09-28 | #58 | Painel · Usuários | Na lista do organizador, a conta de afiliado mostra "conta da plataforma" no lugar de senha e desligar | Vale igual; no celular a coluna fica no fim da tabela que rola (P5) | aguardando leva |
| 5 | 2026-09-28 | #59 | Vitrine, perfil e rifa · publicação | O carrossel segue o formato da primeira peça (4:5, 1:1, 1,91:1 ou 9:16); no vertical o perfil da promotora vai por cima da imagem | Vale igual; o 9:16 limitado a 85% da altura da tela, conferido em 1440 na grade de 3 colunas | aguardando leva |
| 6 | 2026-09-28 | #60 | Loja inteira · topo e console | Topo com a logo, a publicação e o trevo (ponto verde); console fixo na base com Início, Reels, Mensagens, Buscar, Carrinho e Perfil; "18+", ajuda, tema e cookies foram para `/perfil` | Tablet igual ao celular; no computador o topo some e o console vira a lateral esquerda (ícones em `lg`, com nomes em `xl`) | aguardando leva |
| 7 | 2026-09-28 | #61 | Perfil da organização e `/perfil` | "+" na foto do próprio perfil para postar story; ponto verde na foto do console e quadro "Complete sua conta" quando falta apelido ou telefone confirmado | Vale igual; no computador o ponto fica na foto da lateral | aguardando leva |
| 8 | 2026-09-28 | #62 | Rifa · mapa, cartelas, janela do "+" e carrinho | Números em casas quadradas, azuis e verdes ao acaso nos dois temas; escolhido destacado com ✓; mapa em 5 colunas | Tablet em 10 colunas; no computador, 5 na coluna da compra — a conferir na leva | aguardando leva |
