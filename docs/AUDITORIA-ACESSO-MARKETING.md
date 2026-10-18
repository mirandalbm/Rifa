# Auditoria do acesso MARKETING — 18/10/2026

Escopo: o menu Marketing (usado pela plataforma e pelo organizador) e o que o
visitante e o apostador tocam de marketing.

- **Pixels e eventos**: `shared/marketing.ts`, `server/services/marketing.ts`,
  `client/src/lib/marketing.ts`, `client/src/components/Marketing.tsx`,
  `client/src/pages/adminMarketing.tsx` — validação por formato, chaves no
  cofre, aviso de cookies, compra pelo servidor (`marketing_eventos`, trava
  811501), hash do telefone, UTM, "Vendas por campanha".
- **Tráfego pago**: `shared/trafego*.ts`, `server/services/trafego*.ts`,
  `/trafego*` em `server/routes/admin.ts`, `adminTrafego.tsx` — pedido, aceite
  da taxa, aprovação, gasto, importação (Windsor), criação no Meta.
- **Marketing AI**: `shared/marketingIA.ts`, `server/services/marketingIA.ts`,
  `/campaigns/:id/marketing*`.
- **Publicidade**: rifas patrocinadas (`patrocinio.ts`, clique com
  comprovante, IP, aparelho, recarga, reembolso) e banner pago
  (`bannerPago.ts`). **O "banner por clique" não está na base** desta branch
  (só o banner por dias): não foi auditado.
- **Atalhos**: `/c/<código>` e `/l/<perfil>/<n>` (`server/services/links.ts`).

Método: leitura do código de cada rota e serviço; sonda automática contra a API
de verdade, em banco próprio, com duas organizações, plataforma, visitante e
corpos errados (texto, objeto, lista, booleano, vazio, `constructor`, byte nulo,
ids fora do formato, números gigantes); sondas de privilégio nos dois sentidos
(organizador nas rotas da plataforma, plataforma nas rotas da organização, sem
sessão) e de recorte (rifa e pedido do vizinho); corridas (recarga, mensagem,
pedido de banner, dez cliques do mesmo IP); e `npm run telas` nas telas de
Marketing para a organização e para a plataforma, nos dois temas.

## Corrigido

| # | Gravidade | Achado | Prova |
|---|---|---|---|
| 1 | **Alta** | **Pix de recarga devolvido no provedor deixava o crédito.** O webhook `refunded` tratava o Pix do assistente de IA e o pedido, mas a recarga do saldo de patrocínio caía em "nenhum pedido" e não fazia nada: a organização recarregava, gastava (anúncio, banner, tráfego) ou só ficava com o saldo e o provedor devolvia o Pix (devolução, contestação) — dinheiro que saiu da conta da plataforma. Agora `estornarRecarga()`: `paga` → `estornada` num `UPDATE` condicional, com a linha da organização travada, e o débito sai pelo livro (`recarga-estorno:<id>`, uma vez só) **até onde o saldo alcança** — o saldo nunca fica negativo. O que já foi gasto não volta sozinho: `faltouCents` na auditoria (`patrocinio.recarga.estornada`) e no log, como a comissão já sacada | `npm run patrocinio` (estorno total, repetido, parcial com o resto na auditoria, cobrança que não é de recarga), `npm run webhook` |
| 2 | **Média** | **A plataforma comprava anúncio patrocinado com o saldo da organização** (`POST /patrocinio/anuncios` com a sessão do master: 201, débito no saldo dela). O banner pago e o tráfego pago já respondiam 403 ("quem compra é a organização"). Agora 403, nada debitado | `npm run patrocinio` |
| 3 | **Média** | **Pixel de uma promotora seguia escutando a página da outra.** Pixel não se descarrega: depois do `init`, o da A fica na memória da página e, com a navegação sem recarregar (SPA), a medição automática da Meta e a correspondência avançada leem os botões e **o que se digita nos formulários** da rifa da B — o `trackSingle` só protegia o evento explícito. `carregarPixels()` agora recarrega a página quando sobra pixel que não é desta página (`pixelsForaDaPagina()`), também ao sair para uma página sem pixel. Só afeta quem aceitou os cookies | `tests/auditoriaMarketing.test.ts` (a regra pura); o recarregar em si é do navegador — conferido por leitura |
| 4 | Média | **Chave herdada do `Object` em lista fechada** (`x in OBJETO` com texto do corpo; `constructor`, `toString`, `__proto__`…). Os resíduos da auditoria do afiliado e outros que a varredura achou: `patrocinio` (alcance e estado), `bannerDivulgacao` (tipo de documento da entidade — gravava um documento com tipo `constructor`), `divulgacao` (filtro de status da fila — **500**), `bonus`, `template` (fonte, cantos, tipo de bloco), `socios`, `plataforma` (loteria), `contratoPromotora`, `iaAcoes`, `verificacao`, e também `console`, `contratoAnexos`, `grupos`, `mensagens`, `seguranca` e `divulgacao` (modo). Todos `Object.hasOwn` | `tests/auditoriaMarketing.test.ts` (cada função, 6 chaves herdadas), `npm run isolation` |
| 5 | Média | **A taxa de gestão mandada vazia virava 0%.** `Number("")`, `Number([])` e `Number(true)` davam 0, 0 e 1 nas configurações da plataforma (taxa do tráfego, tabela do patrocínio e do banner) e `Number([100])` valia 100 nos pedidos (cliques, dias, investimento, gasto, pacote). `numeroDoCorpo()` só aceita número ou texto de número | `tests/auditoriaMarketing.test.ts`, `npm run trafego`, `npm run patrocinio`, `npm run banner` |
| 6 | Média | **Sem teto onde cada chamada custa**: `POST /patrocinio/recargas` chamava o provedor do Pix com a conta da plataforma a cada pedido (12 em 12 chamadas, e as pendentes nunca somem); a conversa do reembolso do saldo aceitava mensagem sem fim; `POST /banner-pago/pedidos` abria a imagem (CPU) antes de saber se havia saldo. Agora 10 recargas por hora e por organização, 30 mensagens a cada 10 minutos e 20 pedidos de banner a cada 10 minutos (429), depois do erro de preenchimento | `npm run patrocinio`, `npm run banner` |
| 7 | Baixa | **Rifa de demonstração e rifa travada podiam ser patrocinadas** (o tráfego e o banner já as recusavam). 409; a fila e o relógio de encerramento largam a demonstração e o que não foi gasto volta como crédito | `npm run patrocinio` |
| 8 | Baixa | **O painel "Vendas por campanha" trazia cada pedido com UTM de 90 dias para a memória** (sem recorte nenhum, no caso da plataforma) e agrupava no processo. Agora `group by` no banco, até 500 linhas, e o rótulo segue sendo `rotuloDaCampanha()` | `npm run marketing` (rótulos que se somam, recorte, plataforma) |
| 9 | Baixa | **O pixel guardado ia à tela como estava.** `pixelsPublicos()` devolvia o que o banco tinha; valor torto (versão antiga, edição à mão) iria parar dentro de um script na tela de todo apostador. Conferido de novo na saída (`pixelsSeguros()`) | `npm run marketing`, `tests/auditoriaMarketing.test.ts` |
| 10 | Baixa | **O redirecionamento de `/l/<perfil>/<n>` confiava no que o banco guarda.** O link foi conferido ao salvar (só `https:`), mas o último lugar onde um valor torto viraria `Location: javascript:` ou `http:` com a assinatura da plataforma não conferia de novo. Agora é 404 | `npm run marketing` |

Provas novas ou ampliadas: `tests/auditoriaMarketing.test.ts` (16),
`scripts/patrocinio-test.ts`, `scripts/banner-pago-test.ts`,
`scripts/trafego-test.ts`, `scripts/marketing-test.ts` e
`scripts/isolation-test.ts`. A matriz (`docs/REFORMULACAO-MATRIZ.md`) foi
regenerada. **Sem linha nova em `docs/VERSOES.md`**: nenhuma tela mudou (o
registro está com 10 "aguardando leva", 203 a 210; a próxima mudança de tela é a
leva) — o recarregar do item 3 é comportamento, não arranjo.

Subir o código **não** exige `db:push`: nenhuma coluna ou tabela nova (o status
`estornada` da recarga é texto).

## Conferido, sem achado

- **Privilégio**: o organizador nas rotas da plataforma — configuração, decisão,
  gasto, fechar a conta, criar e largar no Meta, importação, ajuste de saldo,
  decisão e baixa do reembolso, configuração do banner — é 403; sem sessão é
  401; a plataforma não contrata tráfego nem compra banner pela organização
  (403). Para o organizador, `?organizacao=` no `PUT /marketing` é ignorado:
  grava na dele.
- **Dado do vizinho é 404**: rifa, campanha de tráfego, gastos, arte e pedido de
  banner, conversa de reembolso, plano e textos de anúncio do Marketing AI,
  endereço curto e cliques dos links. O id fora do formato é 404 em toda rota do
  painel (o `param` do `adminRouter` confere), nunca 500; byte nulo é 400 na
  porta.
- **Segredos**: a chave de API do pixel é cifrada (o banco não tem o texto) e
  nunca volta — nem em resposta, nem na auditoria (`marketing.config` grava só
  quais chaves existem). A chave do Windsor e o token do Meta só vão na chamada;
  a criação no Meta usa o cabeçalho e o erro leva o passo e o código, nunca a
  mensagem crua. A configuração do tráfego e as respostas da organização não
  trazem ids do Meta, links dos anúncios, margem nem excedente.
- **Dinheiro**: o pedido de tráfego reserva mídia + taxa pelo livro na mesma
  transação e o aceite prende o texto lido; a aprovação cobra a taxa inteira com
  a organização travada antes da campanha; o gasto não passa da verba (`UPDATE`
  condicional); uma campanha aberta por rifa pelo índice; recusa e cancelamento
  devolvem tudo uma vez; a retenção cautelar barra o tráfego (pedido e
  aprovação) e o reembolso do saldo. Dois pedidos, dois cancelamentos e duas
  aprovações ao mesmo tempo: um 200 e um 409, sempre. A ordem das travas
  (organização, depois a campanha) vale em todos os caminhos.
- **Clique patrocinado**: comprovante da exibição, uma vez por aparelho e três
  por IP (travas de transação nas duas chaves), robô e aparelho sem
  identificação vão a "barrados", e o `UPDATE` nunca gasta mais do que o
  pacote.
- **Consentimento**: nenhum script de pixel carrega antes do "Aceitar"; o pedido
  só leva `marketing: true` com o aceite; recusar apaga os cookies de medição.
  A compra pelo servidor é um `INSERT … ON CONFLICT DO NOTHING` por destino,
  retomada pela trava 811501, com o telefone em hash e a UTM só como
  estatística (chaves conhecidas, texto limpo e curto; não entra em exportação).
- **Provas verdes depois das mudanças**: `marketing`, `trafego`, `patrocinio`,
  `banner`, `webhook`, `isolation` (373), `aparencia`, `verificacao`,
  `mensagens`, `grupos`, `seguranca`, `divulgacao`, `banner-divulgacao`,
  `apuracao`, `bonus`, `contrato`, `anexos`, `publico`, `acessos`; `npm run
  check`, `npx vitest run` (1479) e `npm run build`.
- **Telas** (`/admin/marketing`, `/trafego`, `/ia`, `/publicidade` e a aba do
  banner; organizador e plataforma; 390/820/1440; claro e escuro; com campanhas
  em análise, no ar, encerrada, anúncios, banner, reembolso e vendas com UTM):
  **0 reprovações e 0 avisos** nos dois temas.

## Parecer do revisor

**Não passou pelo `revisor-de-invariantes`** (não há como acioná-lo daqui). Pedir
antes de mesclar, em especial: `estornarRecarga()` (dinheiro, ordem das travas,
o resto que não volta), o 403 da plataforma em `comprarAnuncio()` (privilégio) e
o recarregar do pixel (consentimento).

## Parecer do revisor (feito) e o que mudou depois

O `revisor-de-invariantes` não achou dano grave de dinheiro. Achou e **foi corrigido depois do parecer**: (1) o estorno que chega **antes** do "pago" (duas entregas que se cruzam) virava no-op e o "pago" creditava um Pix já devolvido — agora a recarga `pendente` vira `estornada` sem débito e o "pago" depois não credita (prova nova em `patrocinio`); (2) `confirmarRecarga` pegava a recarga e depois a organização, e `estornarRecarga` o contrário (deadlock raro entre "pago" e "estornado" da mesma recarga) — agora os dois pegam a organização primeiro; (3) `useRastreio` ignorava o retorno `"recarregando"` de `carregarPixels` (o evento ia para a página descartada) — agora sai; (4) `Number()` solto em `pedirReembolso` e `decidirReembolso` (`""`/`[]` viravam 0 — devolvia tudo sem reter) — agora `numeroDoCorpo`.

Registrado, sem mudança: o que não volta de uma recarga estornada depois de gasta só vai ao log e à auditoria com ator nulo (sem item na Caixa de entrada nem retenção automática: o reembolso do saldo pago por Pix seguido de contestação da recarga paga duas vezes — decisão de produto/contador); contestação só **pedida** (Asaas `CHARGEBACK_REQUESTED`, Mercado Pago `charged_back`) debita de vez e não há volta se for revertida; o pixel recarrega a página à toa ao navegar do perfil da organização A para a rifa dela enquanto a rifa carrega (`donaDaRifa` nulo no intervalo) — só incômodo, depois do aceite; `Number()` solto restante em `admin.ts` (investimento mínimo, taxa de reembolso `""` = 0%).

## Aberto

| Item | Por quê |
|---|---|
| **O resto de uma recarga estornada depois de gasta** não volta sozinho (`faltouCents` na auditoria e no log): o saldo nunca fica negativo (`lancar`), então a dívida da organização com a plataforma fica fora do sistema | Decisão de produto e do contador: saldo negativo que trava a organização, retenção cautelar automática (`reterNaTransacao`) ou cobrança à parte |
| **Revogar o consentimento não alcança pedido já criado**: o pedido guarda `marketing_consentimento` na criação, e quem recusa os cookies com o Pix ainda por pagar tem a compra enviada pelo servidor (com o telefone em hash) quando o Pix cai | Decisão do advogado e do produto: o aparelho avisar o servidor da revogação (os pedidos abertos dele), ou o servidor reler o consentimento ao enviar |
| **O telefone em hash vai ao pixel da organização, que é controladora distinta** (o aviso de cookies cita Meta, Google e TikTok, não a promotora) | Texto do aviso e da Privacidade: decisão do advogado |
| A compra enviada **não confere se o pedido foi estornado** antes de o relógio mandar: o `Purchase` sai de um pedido devolvido (a janela é de minutos) | Pequeno; o evento de reembolso nas três APIs é outro trabalho |
| **Não confirmado em fonte oficial**: a Meta pede `client_user_agent` (e o IP) nos eventos de site, e o evento sai sem eles; o token da Meta e o do TikTok vão **na URL** da chamada de eventos (o TikTok documenta o cabeçalho `Access-Token`); o `fbc` usa a hora do pagamento no lugar da do clique | Conferir com o primeiro envio de verdade (as chamadas só foram provadas contra um provedor de mentira) |
| O **cliente do Windsor leva a chave no endereço** (é como ele a pede); o endereço nunca vai a log, resposta ou erro, mas passa por proxy e log do provedor | Do serviço de fora; trocar de fonte ou usar o cabeçalho, se ele oferecer |
| **`/c/<código>` e `/l/<perfil>/<n>` contam clique sem limite por IP** (só o robô por User-Agent fica de fora): a estatística de cliques é inflável por quem quiser | Estatística, não dinheiro; um balde por IP custaria um `INSERT` por clique numa rota muito aberta |
| A **venda atribuída ao tráfego e ao patrocínio é forjável** (a UTM `trafego-<código>` e o aparelho vêm do navegador): quem sabe o código põe a compra na campanha | Já documentado como estatística; nunca decide dinheiro |
| A auditoria do patrocínio (compra, reembolso, baixa, recarga) é gravada **depois** da transação, na rota; a do tráfego já vai dentro dela | Decisão de produto: a baixa do reembolso é o ato que mais pede a auditoria na mesma transação |
| O `PUT` de configuração com `ligado: "true"` (texto) **desliga** o produto: o interruptor só liga com `true` de verdade, e o corpo é mesclado com o que estava | Desenho documentado ("nasce desligado, só liga com true"); só a plataforma alcança |
| `marketing_eventos` não tem purga (uma linha por pedido e destino, sai com o pedido) nem índice por data para o painel | Pequeno; medir antes |
| O link do perfil aceita qualquer `https:` de domínio com ponto (inclusive IP) e não passa pela varredura do Pix por fora | Decisão de produto (o contato da organização mora ali) |
| O **banner por clique** não está na base desta branch | Auditar quando entrar |
| As mudanças de dinheiro (`estornarRecarga`, o 403 do patrocínio, os tetos) e de privilégio **não passaram pelo `revisor-de-invariantes`** | Ver acima |

## Como conferir

```
npm run check && npx vitest run
npm run marketing trafego patrocinio banner webhook isolation
npm run telas -- --papel organizador,plataforma --rotas marketing
npm run telas -- --papel organizador,plataforma --rotas marketing --tema escuro
```
