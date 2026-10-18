# Auditoria do acesso CAMBISTA — 18/10/2026

Escopo: a sessão de cambista (vendedor presencial, colaborador preso à
organização) — `/api/seller/*` (rifas oferecidas, reservar, confirmar, cancelar,
vendas, acerto), o bilhete e a trilha de impressão (`/api/public/tickets/:code/*`),
o acerto e o fechamento (`server/services/settlements.ts`, as rotas de
`/api/admin/sellers` e `/api/admin/settlements*` que o cadastram e o fecham), a
venda física pelo **mesmo** caminho de reserva das vendas online
(`services/orders.ts`, `services/quotas.ts`), o antifraude (isento dos limites
de comprador, nunca do bloqueio manual), a ponte com a maquininha
(`client/src/lib/pos.ts`, `android/` — só leitura, sem Android SDK), o login, a
senha e a marca de sessão (`users.sessoes_validas_desde`) e as telas
`client/src/pages/cambista.tsx`.

Método: leitura do código das rotas e dos serviços; sonda automática de todas as
rotas do cambista com código, corpo e id fora do formato (texto, objeto, lista,
byte nulo, números gigantes), com duas organizações, dois cambistas e rifas
publicada, rascunho, demonstração e travada; sondas de privilégio (cambista em
`/api/admin`, `/api/affiliate`, `/api/ia`; e o contrário); cambista sem
organização, bloqueado, em organização arquivada e suspensa; meio de pagamento
desligado; telefone bloqueado; troca de senha com sessão copiada; confirmar
com meios diferentes ao mesmo tempo; **estresse de reservas grandes
simultâneas**; e `npm run telas -- --papel cambista` nos dois temas, com vendas
pagas, acerto entregue, acerto a entregar, vendas em aberto e uma reserva
pendente de verdade (3 telas × 390/820/1440).

## Corrigido

| # | Gravidade | Achado | Prova |
|---|---|---|---|
| 1 | **Alta** | **Reservas grandes ao mesmo tempo davam deadlock e 500.** `insertNumbers()` inseria os candidatos sorteados numa ordem própria de cada pedido; duas transações com números em comum se esperavam em ciclo e o Postgres desfazia uma. Reproduzido: seis pedidos de 800 cotas em paralelo, **metade respondia 500** (três rodadas seguidas) — para o comprador do site e para o cambista no balcão, e o pedido não ficava gravado. Agora os números entram **em ordem crescente** (devolvidos na ordem do sorteio, para não guardar sempre os menores) e o que ainda cruzar (as rodadas de sorteio são comandos separados) recomeça a transação inteira, até 6 vezes, com espera aleatória (`isDeadlock()` em `server/pgError.ts`, `comCodigoLivre()`); passando disso, 503 em português. Depois: dez reservas de 600 cotas em duas rodadas, nenhuma 5xx, nenhuma cota vendida duas vezes, nenhum pedido com menos cota do que cobra. Sem o conserto, a mesma prova dá 503 (retentativa desligada) | `npm run cambista`, `npm run load`, `tests/pgError.test.ts` |
| 2 | **Média** | `POST /sales/:code/confirm` e `/cancel` com código que não é inteiro (`abc`, `12.5`, `Infinity`, `NaN`, `2147483648`, `1,2`) respondiam **500** (`Number(...)` virava `NaN` ou passava do `int4` no SQL). Agora 404, como a venda do colega | `npm run cambista`, `npm run isolation`, `tests/vendaFisica.test.ts` |
| 3 | **Média** | **O comprovante da maquininha ia sem formato nem teto para o bilhete — que é público pelo código do pedido e sai impresso.** `posAuthCode` aceitava texto livre ("Pague no Pix 11999998888") e 200 mil letras (gravadas), e objeto virava `[object Object]`; `posTerminal` aceitava quebra de linha. O cambista é justamente quem conhece o comprador e o golpe é levar o Pix para fora. Agora o NSU leva só letras, números e `. _ / -` até 40, o terminal até 60 em uma linha; o meio só vale pelo texto exato (uma lista `["dinheiro"]` passava no `String()`). A tela nunca mandou o NSU (só o terminal), então nada do que ela faz muda | `npm run cambista`, `tests/vendaFisica.test.ts` |
| 4 | **Média** | **Número repetido no pedido cobrava a mais**: `numbers: [7, 7, 7]` valia 3 cotas no preço e no limite e reservava 1 (`reserveSpecific` já tirava os repetidos, `prepararPedido` não). O comprador (ou o freguês do cambista) pagava três por uma, e a comissão do afiliado incidia sobre o total inflado. Vale para o site, o carrinho e a maquininha: agora o pedido conta o que de fato reserva | `npm run cambista` |
| 5 | **Média** | **Cambista sem organização via e vendia a rifa de todas.** `/overview` e `POST /sales` tratavam `organizationId` nulo como "sem recorte" (o recorte nulo é o da plataforma): provado, o cambista sem organização listava as rifas das duas organizações e vendia na da vizinha (201). Não há rota que o crie (o cadastro exige organização), mas é dado — e o organizador sem organização já era recusado na entrada. Agora o login e a sessão recusam cambista sem organização (a sessão aberta cai) e o `sellerRouter` fecha com 403 de novo; o recorte é sempre `eq(organizationId, a da sessão)` | `npm run cambista` |
| 6 | Média | **Confirmar com dois meios ao mesmo tempo podia deixar no pedido pago o meio de quem perdeu a corrida**: o meio e o comprovante eram gravados num `UPDATE` à parte, **antes** do `UPDATE` que paga. O bilhete, o acerto e a conferência do caixa contam o meio de cada venda (dinheiro × Pix da maquininha). Agora vão no mesmo `UPDATE` condicional que paga (`settleOrderAsPaid`). Achado por leitura — a corrida não se força por HTTP —; a prova confere o caso de seis confirmações com dois meios: todas 200, uma só paga, um meio só nos seis bilhetes | `npm run cambista` |
| 7 | Baixa | **Sem teto de vendas novas por cambista.** A venda dele é isenta dos limites de comprador (certo: é presencial e ele responde no acerto), mas 60 reservas seguidas passavam sem nenhum freio — uma conta tomada prende o estoque de uma rifa inteira (o ataque de bloqueio de estoque feito de dentro). Agora 120 em 10 minutos (`VENDAS_DO_CAMBISTA_POR_JANELA`, balde `cambista-venda:<id>`, 429); conta depois do erro de preenchimento e do recorte; cancelar, confirmar e fechar o dia não contam | `npm run cambista` |
| 8 | Baixa | "Vendas de hoje" e "cotas de hoje" usavam o dia do banco (**UTC**): às 21h de Brasília o contador zerava e a venda da noite (a do evento) caía no dia seguinte. Agora o dia de São Paulo | `npm run cambista` |
| 9 | Baixa | A tela de abrir o dia **oferecia** a rifa de demonstração e a rifa travada pela plataforma (a reserva as recusa com 409, mas o cambista via o botão). Agora não são oferecidas; vender uma delas (ou um rascunho) segue 409 | `npm run cambista` |
| 10 | Baixa | `POST /admin/sellers` da plataforma com `organizationId` fora do formato ou de organização que não existe: **500** (chave estrangeira). Agora 400 e 404 | `npm run cambista` |
| 11 | Baixa | A observação do fechamento de acerto (`notes`) virava `[object Object]` com objeto e ia inteira, sem teto, para o histórico do acerto. Agora texto de até 500 | `npm run cambista` |

Provas em `scripts/cambista-test.ts` (seção "auditoria do acesso cambista",
mais de 50 verificações novas) e `scripts/isolation-test.ts` (`rotasDoCambista`, 17 por
organização: a lista de vendas e o acerto só dele, a rifa da vizinha 404 e nada
gravado, confirmar, cancelar e marcar impresso a venda do cambista vizinho 404 e a
trilha dele intacta, código fora do formato, e o painel e o afiliado 403), mais
`tests/vendaFisica.test.ts` e `tests/pgError.test.ts`. A matriz
(`docs/REFORMULACAO-MATRIZ.md`) foi regenerada. **Sem linha nova em
`docs/VERSOES.md`**: nenhuma tela mudou (o registro está com 10 "aguardando
leva", 203 a 210; a próxima mudança de tela é a leva).

Subir o código **não** exige `db:push`: nenhuma coluna ou tabela nova.

## Conferido, sem achado

- **Privilégio**: o cambista em `/api/admin/*` (painel, pedidos, usuários,
  exportações, meios de pagamento, 2FA), `/api/affiliate/*` e `/api/ia/*` é 403;
  sem sessão é 401; o organizador e o afiliado em `/api/seller/*` são 403. O
  cambista não fecha o próprio acerto nem cadastra outro cambista. O segundo
  fator, se a conta o tiver, é exigido no login (`totp_required`, `totp_invalid`).
- **Dado de outro é 404, nunca 403**: confirmar, cancelar e marcar impresso a
  venda do colega, do cambista da outra organização e do código que não existe
  respondem a mesma coisa; vender a rifa da outra organização é 404 e nada é
  gravado; a lista de vendas e o acerto trazem só as dele.
- **Reservar antes de cobrar** (invariante 1): a venda nasce pendente com a cota
  presa; as últimas cotas disputadas por doze vendas ao mesmo tempo dão cinco
  reservas e nenhuma duplicada; o preço, o meio, o cupom e o afiliado do corpo
  são ignorados (o pedido sai com o preço do servidor, `dinheiro` e o cambista
  como afiliado).
- **Confirmar × cancelar** concorrentes: seis corridas, sempre um 200 e um 409
  com o banco de acordo (já provado; conferido de novo). **Fechar acerto**: cinco
  fechamentos simultâneos dão um acerto, a linha do cambista travada
  (`FOR UPDATE`) e o carimbo `settlement_id` condicional com conferência da
  contagem (a venda estornada no meio desfaz o fechamento — conferido por
  leitura; a corrida não se força por HTTP). **Dar baixa** é condicional e a
  segunda é 409 sem mexer na data.
- **Meio desligado**: dinheiro desligado → confirmar é 409 e a venda segue
  pendente; nenhum meio da mão → nem reservar (409); a tela deixa de oferecê-lo.
- **Antifraude**: o telefone bloqueado pela administração não compra na mão (429)
  e nada é gravado; a isenção é só dos limites de comprador.
- **Sessão**: a troca de senha derruba a sessão copiada e mantém a de quem
  trocou; a senha atual errada é 401; cambista bloqueado, organização arquivada
  e conta desativada perdem a sessão. A organização **suspensa** mantém o
  cambista vendendo, como o código documenta (as rifas dela seguem no ar).
- **Dado pessoal**: a lista de vendas traz só o nome do freguês dele (nunca
  telefone ou CPF); o bilhete público esconde telefone e CPF; o log de recusa de
  login tem o e-mail mascarado.
- **Provas verdes depois das mudanças**: `cambista`, `isolation`, `load`
  (500 compradores, 900 mil cotas, invariantes do pool), `carrinho`, `refund`,
  `bonus`, `acessos`, `senha`, `webhook`, `guarda`, `presente`; `npm run check`,
  `npx vitest run` (1463) e `npm run build`.
- **Telas** (`/cambista`, `/cambista/vendas`, `/cambista/acerto`; 390/820/1440;
  claro e escuro; com vendas pagas, acerto entregue, acerto a entregar e reserva
  pendente): **0 reprovações e 0 avisos** — sem estouro lateral, controle sem
  nome, campo abaixo de 16 px no celular, alvo menor que 24 px, erro de
  JavaScript ou 5xx. Números em `tnum`, estados em `<Pill>`.

## Ponte com a maquininha (leitura, sem Android SDK)

O contrato (`client/src/lib/pos.ts` e `rifa-pos-shim.js`) tem prazo em toda
chamada e a recusa do cartão é resultado, não exceção — conferido por leitura; o
`tests/posShim.test.ts` segue verde. **Um achado, não corrigido aqui**
(`android/` é só leitura nesta auditoria): a ponte vale para **toda página** que a
WebView abrir. `MainActivity` usa `addJavascriptInterface` (exposto a qualquer
origem), injeta o shim em todo `onPageFinished` e não restringe a navegação
(`shouldOverrideUrlLoading` não existe). Um link externo aberto dentro do app
(o perfil de uma organização tem links `https:`; a transmissão do sorteio abre
em outra aba) carregaria uma página de terceiro com `RifaPOS.pay()` e
`RifaPOS.print()` à mão: mandar imprimir texto ou abrir uma cobrança de valor
qualquer na maquininha do cambista. Registrado em `docs/PENDENCIAS.md` (antes de
publicar o APK): deixar na WebView só a origem de `BuildConfig.APP_URL` e abrir o
resto no navegador do aparelho; injetar o shim só nessa origem.

## Aberto

| Item | Por quê |
|---|---|
| **A ponte da maquininha na WebView vale para qualquer página** (acima) | Código Android, sem SDK para compilar e provar aqui |
| O cambista **não tem como ligar o segundo fator**: `/api/admin/2fa/*` é do organizador e do master (o cambista é 403), e ele recolhe dinheiro e dá baixa em venda | Decisão de produto: rota própria do cambista ou exigir o segundo fator só de quem fecha o acerto |
| **Venda do cambista estornada depois de o acerto fechar** segue no bruto do acerto: `refundOrder` não mexe em `settlements`, então o cambista, que devolveu o dinheiro do próprio caixa, continua devendo à casa aquela venda | Decisão do contador e do produto: crédito no acerto seguinte ou reabertura do acerto |
| O cambista **não está sujeito à autoindicação**: a venda dele pula `resolveAttribution`, então vender para o próprio telefone dá a ele a comissão sobre a própria compra (paga o líquido) | Decisão de produto (bloquear pelo telefone do usuário valeria só para o telefone que ele cadastrou) |
| Confirmar, cancelar e as vendas do cambista **não entram em `audit_log`** — a trilha é o próprio pedido (`seller_id`, `method`, `paid_at`, `pos_*`) | Decisão de produto: uma linha de auditoria por venda é volume; hoje só o fechamento e a baixa do acerto são auditados |
| O bloqueio de **aparelho** usa o `x-device-id` que o cliente manda; quem é bloqueado por aparelho troca o cabeçalho (o bloqueio por telefone e o limite por IP seguem valendo) | Antifraude geral, não é do cambista; o aparelho vem do navegador por desenho |
| O log de erro 500 imprime os `params` da consulta do Drizzle (telefone, nome e CPF do comprador quando a que falha é a do comprador) | Vale para todo o sistema; tirar os parâmetros do log exige trocar o tratador de erro, e hoje eles ajudam a achar o defeito |
| Na reta final da rifa, várias reservas grandes ao mesmo tempo respondem 409 ("não restam cotas") mesmo com cota livre: o pool de endgame toma as linhas com `SKIP LOCKED` e as que outra transação ainda segura não aparecem. Visto nas rodadas de estresse com 5 e 6 pedidos de 600 a 800 cotas acima de 85%; **não investigado a fundo** | O 409 é seguro (ninguém é cobrado) e o caso é de volume improvável no balcão; vale medir com a carga do endgame antes de mexer no pool |
| A carimbada tardia da sessão do apostador (`entrarComo`) continua como na auditoria do afiliado | Rodada própria |
| O teto de 120 vendas em 10 minutos é um palpite folgado para o balcão (uma venda a cada 5 s no máximo) | Ajustar se um evento de verdade precisar de mais |
| A mudança do `quotas.ts` (ordem de inserção e a retentativa do deadlock), a da sessão do cambista (`auth.ts`) e as de dinheiro (`orders.ts`, `settleOrderAsPaid`) **não passaram pelo `revisor-de-invariantes`** | Não há como acioná-lo daqui; peça o parecer antes de mesclar |

## Como conferir

```
npm run check && npx vitest run
npm run cambista isolation load carrinho acessos senha
npm run telas -- --papel cambista                  # claro
npm run telas -- --papel cambista --tema escuro
```
