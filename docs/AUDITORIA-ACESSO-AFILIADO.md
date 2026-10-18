# Auditoria do acesso AFILIADO — 18/10/2026

Escopo: a conta avulsa de afiliado, de todas as organizações — cadastro e
login, `/api/affiliate/*` (visão geral, comissões, links e kit, artes e editor
de imagem, divulgações, saldo, saque, nota fiscal, recibo, chave Pix, cadastro
fiscal, verificação do perfil, foto), vínculo, termo e aceite por organização
(`shared/afiliados.ts`, `server/services/afiliados.ts`), mensagens e assistente
de IA com o afiliado como titular, e as telas `client/src/pages/afiliado*.tsx`.

Método: leitura do código das rotas e serviços; sonda automática de todas as
rotas do afiliado com id, código e corpo fora do formato (texto, objeto, lista,
byte nulo, nulos), com duas organizações e dois afiliados, rifa publicada e
rascunho; sondas de privilégio (afiliado em `/api/admin` e `/api/seller`, e o
contrário); saque simultâneo; corrida de sessão (24 requisições em laço contra
a sessão roubada durante a troca de senha); e `npm run telas -- --papel
afiliado` nos dois temas com comissões, saque, cadastro fiscal e peça de
divulgação de verdade (8 telas × 390/820/1440).

## Corrigido

| # | Gravidade | Achado | Prova |
|---|---|---|---|
| 1 | **Alta** | **A sessão roubada de um usuário do painel (afiliado, e o mesmo desenho vale para organizador, cambista e master) sobrevivia à troca de senha.** A troca apagava as linhas de `sessions`, mas o `connect-pg-simple` grava com `INSERT … ON CONFLICT DO UPDATE`: uma requisição da sessão roubada já em andamento a recriava depois do `DELETE`. Reproduzido **6 de 6** com 24 requisições em laço contra `/conta/google/entrar` (a rota que escreve na sessão a cada chamada) enquanto a vítima trocava a senha: o ladrão seguia com `/api/affiliate/overview` em 200. Era o item "aberto" da auditoria do apostador. Agora `users.sessoes_validas_desde` + `session.painelEntrouEm` (gravado no login); o middleware de `setupAuth` derruba a sessão mais velha que a marca; a sessão de quem trocou a senha é renovada e segue; **redefinir a senha de outra pessoa** e **desligar o acesso** (`PATCH /usuarios/:id`) também gravam a marca — ligar de novo não traz de volta a sessão que alguém guardou. Depois: 0 de 4 sobrevivem | `npm run afiliados` (a sessão regravada à mão depois do `DELETE` + a corrida em laço) |
| 2 | Média | Documento do cadastro fiscal aceitava **tipo inventado**: `tipo in DOCUMENTOS` é verdadeiro para `constructor`, `__proto__`, `toString`, `hasOwnProperty`; o servidor gravava (cifrado) o arquivo de até 6 MB com esse tipo, quatro ou mais por afiliado, e a tela de conferência da plataforma leria o rótulo do protótipo. O mesmo em `validarPix` (tipo da chave Pix da verificação: gravava `{ tipo: "constructor" }`). Agora `Object.hasOwn` | `npm run afiliados`, `tests/verificacao.test.ts` |
| 3 | Média | `PATCH /pix-key` aceitava objeto ou lista (`String({a:1})` = `"[object Object]"`, com 15 letras, passava na régua de tamanho) e guardava como a chave para onde a plataforma paga os saques. Agora só texto | `npm run afiliados` |
| 4 | Baixa | **Sem limite** em `PUT /fiscal`, `PUT /fiscal/documentos/:tipo`, `PUT /foto`, `PUT /verificacao`, `PUT /verificacao/documentos/:tipo` e `POST /verificacao/copiar-do-fiscal`. A conta de afiliado nasce aberta a qualquer pessoa (`/afiliados/cadastro`), e cada gravação cifra ou reprocessa até 6 MB; o 409 do cadastro fiscal ("este CPF já está no cadastro de outro afiliado") deixava varrer CPFs sem teto. Agora 40 gravações por hora por afiliado (`afiliado-cadastro-dados:<id>`, 429); ler não conta | `npm run afiliados` |
| 5 | Baixa | `GET /artes/:slug` de um **rascunho** da organização em que ele tem vínculo respondia 200 com a lista vazia (e o `link`): confirmava que o endereço existe. Agora 404, como o resto do kit (`/editor`, `/artes/:slug/:tipo`) | `npm run afiliados` |
| 6 | Baixa (escala) | `GET /links` lia **todas** as rifas publicadas da plataforma e rodava `comissaoNaRifa` (três consultas) em cada uma antes de filtrar, e gerava o QR só das que ficavam; `GET /organizacoes` trazia **todas as versões** de **todos os termos** de todas as organizações para escolher a mais nova. Com a conta aberta a qualquer pessoa, o custo crescia com a plataforma, não com o afiliado. Agora a consulta já recorta as organizações dele (vínculo aprovado ou a de casa) e o termo vem por `DISTINCT ON` (só a versão em vigor). A saída é a mesma | `npm run afiliados`, `npm run isolation` |
| 7 | Ferramenta | `scripts/telas.ts` **não rodava** na base (`const pagina` declarada duas vezes, resto de um merge): `npm run telas` falhava ao transformar, e a auditoria visual passava sem ser feita. Linha sobrando removida | `npm run telas -- --papel afiliado` |

As provas estão em `scripts/afiliados-test.ts` (seção "auditoria do acesso
afiliado", 52 verificações: privilégio, recorte, saque, chave Pix, tipos, teto,
sessão) e `tests/verificacao.test.ts`. A matriz
(`docs/REFORMULACAO-MATRIZ.md`) foi regenerada. **Sem linha nova em
`docs/VERSOES.md`**: nenhuma tela mudou (o registro está com 10 "aguardando
leva", 203 a 210; a próxima mudança de tela é a leva).

Subir o código exige `db:push` antes: coluna nova `users.sessoes_validas_desde`
(`docs/ORDEM-DE-LANCAMENTO.md`).

## Conferido, sem achado

- **Privilégio**: afiliado em `/api/admin/*` e `/api/seller/*` é 403; organizador
  e cambista em `/api/affiliate/*` é 403; sem sessão é 401. A matriz
  (`INHERITS`) não deixa um papel herdar o outro (o master não herda o
  afiliado). `requireAffiliateAccount` exige o cadastro; conta bloqueada perde a
  sessão no `deserializeUser`.
- **Dado de outro é 404**: peça, foto, vídeo, saque, nota do saque, recibo
  (PDF), documento do cadastro fiscal — de outro afiliado. Id fora do formato
  (`abc`, byte nulo, 40 zeros), código de recibo com NUL, tipo de documento e
  slug fora do formato: nenhum 5xx. Corpo `null`, lista, texto e objeto em todas
  as gravações: nenhum 5xx.
- **Recorte por organização**: `/links`, `/artes`, `/editor`, `/divulgacoes/rifas`
  e o `POST /divulgacoes` só valem onde `comissaoNaRifa` diz que recebe (vínculo
  aprovado e aceite da versão do termo da rifa); a rifa de outra organização é
  404 (kit) ou 403 (divulgar); o saldo e o extrato trazem só as organizações dele.
- **Código vindo do corpo/URL**: `?ref=` em `/links` e `/artes` é ignorado (o
  código sai da sessão); o QR e a legenda do kit levam o dele.
- **Dinheiro**: dez `POST /payouts` ao mesmo tempo dão **um** saque (a seleção
  das comissões `available` é `FOR UPDATE` e o `UPDATE` repete o status); o saque
  é de **uma organização** por vez, escolhida entre as que têm saldo (corpo com
  `organizacaoId` de quem não tem saldo, texto, objeto: 400 ou a única que ele
  tem); saque da comissão guardada é "plataforma", com `organization_id` nulo
  (só o master dá baixa, o organizador recebe 404); a nota fiscal e o IRRF saem
  do cadastro aprovado, nunca do corpo; a comissão só chega a `available` pela
  carência (o estorno trava as mesmas linhas, então nunca racha com o saque).
  Trocar a chave Pix pede a senha (conta na janela do login) e vai à auditoria.
- **Dado pessoal**: o extrato traz o primeiro nome (nunca telefone ou CPF); o
  saldo diz a quem a nota é emitida sem expor chave, CPF ou CNPJ do afiliado.
- **Mensagens e assistente** com o afiliado como titular: id fora do formato,
  `como` forjado (cai no apostador, ou 401), conversa de outro (404), sem 5xx.
  `npm run mensagens`, `npm run ia`, `npm run isolation` verdes.
- Provas verdes depois das mudanças: `afiliados`, `isolation`, `fiscal`,
  `divulgacao`, `artes`, `acessos`, `senha`, `conta`, `google`, `mensagens`,
  `verificacao`, `cambista`, `guarda`, `ia`, `relogios`; `npm run check`,
  `npx vitest run` (1449) e `npm run build`.
- **Telas** (afiliado, `/afiliado`, `/links`, `/divulgar`, `/organizacoes`,
  `/comissoes`, `/saques`, `/dados` e `/perfil`; 390/820/1440; claro e escuro;
  com comissões pendentes e pagas, saque aguardando, cadastro fiscal aprovado e
  peça em análise): **0 reprovações e 0 avisos** — sem estouro lateral, controle
  sem nome, campo abaixo de 16 px no celular, alvo menor que 24 px, erro de
  JavaScript ou 5xx. Números em `tnum`, estados em `<Pill>`.

## Parecer do revisor (feito) e o que mudou depois

O `revisor-de-invariantes` não achou vazamento entre afiliados ou organizações,
risco ao dinheiro do saque nem privilégio novo. Achou duas janelas estreitas na
marca da sessão, **corrigidas depois do parecer**: (1) a hora de entrada do
painel era carimbada depois de conferir a senha (centenas de ms de scrypt) —
um login que começou antes da troca de senha e terminou depois passava; agora
vale o instante em que o login **começou**; (2) a sessão que fica na troca de
senha só era renovada em memória, e uma requisição paralela podia carregá-la
velha e derrubá-la; agora ela é salva com a hora nova **antes** de a marca valer.
A corrida em laço da prova só roda com o login do Google no servidor (pulada
aqui); o `DELETE` regravado à mão roda sempre. **O mesmo carimbo tardio existe na
sessão do apostador** (`entrarComo` em `contaComprador.ts`, #280): o fio chega
depois da conferência do código e precisa do instante de início passado pelos
chamadores — fica para uma rodada própria.

## Aberto

| Item | Por quê |
|---|---|
| `POST /api/public/afiliados/cadastro` responde 409 "Já existe uma conta com este e-mail." e deixa testar quais e-mails têm acesso ao painel (organizador e master também são `users`). Limitado a 10 por hora por IP | Decisão de produto: mensagem neutra exigiria confirmar o e-mail antes de criar a conta |
| `aderir` volta um vínculo **recusado** (ou desfeito) pela organização a `pendente` quando o afiliado pede de novo — a organização tem de recusar outra vez; sem limite de pedidos | Decisão de produto (bloquear de vez é uma ação de organização que hoje não existe) |
| A chave Pix do saque é texto livre de 5 a 140 caracteres; só a verificação do perfil confere o formato (`validarPix`). Chave com erro de digitação é dinheiro para o lugar errado | Decisão de produto/contador: exigir o formato mudaria quem já tem chave guardada |
| `affiliateCode` no corpo de `POST /orders` e do carrinho **vence** o código da sessão (primeiro clique). O cliente do site nunca o manda; um script que o mande atribui a venda a esse afiliado (continuam valendo a autoindicação por telefone e por aparelho) | Muitas provas dependem do campo; tirar do esquema muda o contrato da API |
| **Corrigido na auditoria do marketing (18/10/2026)**, com os que a varredura achou além da lista: `docs/AUDITORIA-ACESSO-MARKETING.md`. Antes: o padrão `x in OBJETO` com texto vindo do corpo (aceita `constructor`) ainda existia fora do afiliado: `patrocinio.ts:220` e `shared/patrocinio.ts:116` (alcance), `bannerDivulgacao.ts:180,241` (tipo de documento da entidade), `shared/socios.ts:35`, `shared/plataforma.ts:209`, `shared/template.ts:271-281`, `shared/bonus.ts:73`, `shared/divulgacao.ts:34`, `shared/contratoPromotora.ts:107`, `shared/iaAcoes.ts:284` | São rotas do organizador e da plataforma (outras auditorias): cada uma é uma linha (`Object.hasOwn`), mas o efeito depende da coluna que recebe o valor |
| `entrouEm`/`painelEntrouEm` usam o relógio do processo; com várias réplicas e relógios muito diferentes, a sessão renovada de quem trocou a senha poderia cair | Hoje há um processo; o `NOW()` do banco resolveria, ao custo de uma consulta a mais por login |
| `/links` e `/divulgacoes/rifas` ainda rodam `comissaoNaRifa` rifa a rifa dentro das organizações do afiliado (3 consultas por rifa) | Cresce com as rifas do afiliado, não da plataforma; medir antes de otimizar |
| As mudanças em dinheiro (saque) não tiveram código novo, só prova; a mudança de **sessão** (`auth.ts`, `routes/auth.ts`, `routes/admin.ts`) e de privilégio **não passaram pelo `revisor-de-invariantes`** | Não há como acioná-lo daqui; peça o parecer antes de mesclar |

## Como conferir

```
npm run db:push            # a coluna users.sessoes_validas_desde, antes do código
npm run check && npx vitest run
npm run afiliados isolation fiscal divulgacao artes acessos senha conta google mensagens verificacao ia
npm run telas -- --papel afiliado                  # claro
npm run telas -- --papel afiliado --tema escuro
```
