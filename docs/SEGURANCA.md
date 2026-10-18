# Segurança

Visão de conjunto: onde mora cada defesa, a lista de conferência para rota
nova e o registro das revisões. As regras de cada área seguem no `CLAUDE.md`,
nas seções "o que não pode afrouxar" — este guia não as repete, aponta para
elas.

Este repositório é **público**. Falha encontrada é corrigida antes de ser
descrita aqui; o detalhe de como explorar não entra no repositório.

Última revisão: 02/10/2026, da superfície criada depois da de 28/09 (abaixo); a última completa foi a de 28/09/2026.

## Quem ataca o quê

| Quem | O que quer | Onde mora a defesa |
|---|---|---|
| Robô anônimo | prender estoque (reservar sem pagar), varrer códigos de pedido, criar contas em massa | antifraude (limites por IP, aparelho e telefone; reserva em aberto conferida de novo dentro da transação), código do pedido sorteado com guarda de varredura, limite de cadastro por endereço |
| Comprador | pagar menos, pedir reembolso do que não é dele, ganhar e ser reembolsado | preço calculado no servidor, chamado com três identidades, reembolso e disputa fechados perto do sorteio |
| Organizador | ver ou mexer no que é de outra organização | recorte `orgOf` + `assert*InScope` (404 para o vizinho), provado no `npm run isolation` |
| Quem toma uma sessão | desviar dinheiro (carteira, chave Pix), trancar o dono do lado de fora | senha nas ações que mudam para onde o dinheiro vai, segundo fator para arquivar, sessões derrubadas na troca de senha, desligar o segundo fator conta tentativa |
| Quem forja pagamento | marcar pedido como pago | webhook assinado, status consultado na API do provedor, idempotência por `(provider, external_id)` |
| Quem lê o banco vazado | documentos, CPF, dados fiscais | cofre AES-256-GCM com a chave fora do banco, CPF só como HMAC, senha em scrypt |

## Controles e onde moram

| Controle | Onde | Prova |
|---|---|---|
| Sessão: cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; sessão nova a cada entrada | `server/auth.ts`, `server/services/contaComprador.ts` | — |
| Senha: scrypt com custo próprio (N = 2¹⁶, r = 8, p = 2, guardado no hash `s2$…`; a senha antiga entra e é refeita no login), régua única (`shared/senha.ts`), força bruta contada por conta e por IP (`guardLogin`) | `server/services/hashSenha.ts`, `server/auth.ts`, `server/routes/auth.ts` | `tests/senha.test.ts`, `tests/hashSenha.test.ts`, `npm run senha` |
| Troca e redefinição de senha derrubam as outras sessões (painel e apostador); a sessão também cai pela marca `sessoes_validas_desde` (`buyers` e `users`) se uma requisição em andamento a regravar. Trocar a senha ou excluir a conta pede a senha atual ou o código do WhatsApp dos últimos 30 minutos — entrar pela senha não basta | `encerrarSessoesDoUsuario`, `encerrarOutrasSessoes`, `setupAuth`, `codigoRecente` | `npm run conta`, `npm run afiliados` |
| Segundo fator do painel (TOTP); obrigatório para arquivar organização, **lançar o resultado do sorteio oficial e registrar nova extração do globo** (`conferirSegundoFatorAgora()`, senha e código na hora, 30 tentativas em 10 min). O segredo fica **selado no cofre** (`cofre:v1:…`, também o pendente na sessão); o de antes, em claro, entra e é selado ao subir o servidor; o selado adulterado é "código incorreto", nunca 500 | `server/services/totp.ts`, `server/services/segundoFator.ts`, `server/routes/admin.ts` | `tests/totp.test.ts`, `tests/segundoFator.test.ts`, `npm run senha` |
| Recorte por organização | `orgOf`, `assertCampaignInScope`, `assertAffiliateInScope`, `assertUserInScope` | `npm run isolation` |
| Arquivo: tipo conferido pelo conteúdo, reprocessado (sharp, teto de 40 MP), nunca servido como veio; chave de mídia gerada pelo servidor e conferida na volta; envio ao disco com assinatura que leva o **teto de bytes** (conferida antes de ler o corpo) e `/uploads` só restaura chave no formato que geramos | `server/services/media.ts`, `storage.ts`, `probe.ts` | `tests/midia.test.ts`, `npm run isolation` |
| Vídeo enviado a terceiro (Cloudflare Stream, só com `VIDEO_PROCESSOR=cloudflare-stream`): token só no cabeçalho, endereço do quadro só `https` em `*.cloudflarestream.com`, vídeo apagado do Stream no `finally`, prazo e teto de 3 envios, nunca lança | `server/services/videoProcessor.ts` | `tests/cloudflareStream.test.ts` |
| Entrega em HLS pelo Stream (`CLOUDFLARE_STREAM_ENTREGA=hls`): `uid` só no formato do Stream (vira caminho de URL), HLS conferido (`https`, `customer-*.cloudflarestream.com`, caminho do próprio `uid`, sem consulta), nada vem do navegador, campo `streamUid` fora das respostas, vídeo apagado no Stream ao apagar a mídia ou a rifa (anotado em `stream_pendentes` e reapagado pelo relógio se o DELETE falhar), `CLOUDFLARE_API_URL` só fora de produção | `shared/stream.ts`, `server/services/videoProcessor.ts`, `server/services/media.ts` | `tests/stream.test.ts`, `npm run poster` |
| Assistente de IA (Chatbase): a conversa passa pelo nosso servidor (nenhum script de terceiro no painel), chave da API só no servidor (nunca em resposta, log ou URL), endereço da API fixo em produção, titular e papel tirados da sessão, telefone/CPF/e-mail barrados antes de sair (texto normalizado: traço Unicode, invisível, largura cheia), uso gravado por mensagem em milésimos com chave única, id da conversa gravado condicional ao lido, limite por pessoa na mensagem e na leitura, conversa fora do cache no login e no logout, configuração só da plataforma | `server/services/chatbase.ts`, `ia.ts`, `server/routes/ia.ts`, `shared/ia.ts` | `tests/ia.test.ts`, `tests/chatbase.test.ts`, `npm run ia` (com o Chatbase de mentira), `npm run isolation` |
| Cobrança do assistente: preço da tabela (nunca do corpo) fotografado no Pix, titular da sessão, 402 antes de sair para o Chatbase, livro com chave única e conta travada na mesma transação, Pix pago por `UPDATE` condicional, débito na transação do uso, CPF/CNPJ do pagador não guardado, limite de Pix por pessoa; ajuste de crédito só da plataforma (403), com motivo, idempotente pela chave da tela, no avulso sem deixá-lo negativo e com auditoria na mesma transação; relatório e extrato só da plataforma, sem dado de pessoa | `shared/iaCobranca.ts`, `server/services/iaCobranca.ts`, `server/routes/ia.ts`, `server/routes/webhooks.ts`, `server/routes/admin.ts` | `tests/iaCobranca.test.ts`, `npm run ia`, `npm run isolation` |
| Ações do assistente: entrada da IA tratada como corpo de requisição (catálogo fechado, formato conferido), recorte da sessão em cada ação, gravação só com confirmação da pessoa (`UPDATE` condicional, prazo, só quem conversava; 404 para outra pessoa) e pelos mesmos serviços das rotas, resumo montado pelo servidor, `audit_log` com `viaIA`, resultado sem dado pessoal (barreira em cada texto), teto de rodadas por mensagem | `shared/iaAcoes.ts`, `server/services/iaAcoes.ts`, `server/services/ia.ts`, `server/routes/ia.ts` | `tests/iaAcoes.test.ts`, `npm run ia-acoes`, `npm run isolation` |
| Pagamento: webhook assinado (tempo constante), status pela API, idempotente | `server/routes/webhooks.ts`, `server/payments/` | `tests/mercadopago.test.ts`, `tests/asaas.test.ts` |
| Antifraude: limites antes do primeiro `INSERT` e a reserva em aberto de novo na transação | `server/services/antifraude.ts`, `orders.ts` | `npm run load` |
| Venda do cambista: presa à organização da sessão (organização nula é recusada na entrada, na sessão e na rota), código da venda, meio e comprovante da maquininha com formato e teto, teto de vendas novas por cambista, meio e comprovante gravados no `UPDATE` que paga, reserva em ordem crescente com o deadlock repetido | `server/routes/seller.ts`, `shared/vendaFisica.ts`, `server/services/orders.ts`, `quotas.ts` | `tests/vendaFisica.test.ts`, `npm run cambista`, `npm run isolation`, `npm run load` |
| Endereço vindo de usuário: só `https:`, nunca vira redirecionamento aberto | `shared/perfil.ts`, `shared/vitrine.ts`, `server/services/links.ts` | `npm run perfil` |
| Push só para serviço conhecido (contra SSRF) | `shared/push.ts` | `tests/push.test.ts` |
| Endereço da organização (`<rótulo>.<base>`, só com `SUBDOMINIO_BASE`): o dono sai **só do `Host`** normalizado (nunca `X-Forwarded-Host`), rótulo inexistente, desligado, arquivado ou banido é 404 de verdade, **lista fechada de rotas** (o que ninguém classificou é 404; o painel, a API de papel e os webhooks não existem no endereço), a rifa e a organização do vizinho são 404 (inclusive no corpo da compra), varrer rótulo esbarra no limite por IP, `www` vai ao principal e host desconhecido sai com `noindex`, `Origin` por host em modo relatório | `shared/subdominio.ts`, `shared/enderecoRotas.ts`, `server/services/enderecoDaOrganizacao.ts`, `enderecoDoHost.ts` | `tests/subdominio.test.ts`, `tests/enderecoRotas.test.ts`, `tests/enderecoDoHost.test.ts`, `npm run subdominio`, `npm run isolation` |
| Cabeçalhos: `nosniff`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`; HSTS em produção | `server/index.ts` | — |
| Política de conteúdo (CSP) **em modo relatório**, só em produção: a lista do que o sistema carrega (pixels, fontes, Stream, players), o script do tema pelo hash, `object-src 'none'`; os relatórios vão ao log agrupados (diretiva e origem, nunca a URL) | `shared/csp.ts`, `server/services/csp.ts`, `server/index.ts` | `tests/csp.test.ts` |
| Clique patrocinado: cobra só com o comprovante da exibição (HMAC por anúncio e aparelho, de 1 s a 30 min) e no máximo 3 por IP por anúncio em 24 h | `server/services/ticketDoClique.ts`, `registrarClique` em `server/services/patrocinio.ts` | `tests/ticketDoClique.test.ts`, `npm run patrocinio` |
| A porta recusa o que ninguém digita: byte nulo no endereço, na consulta ou no JSON é 400 para todas as rotas; o erro 22021 que escapar também; `unhandledRejection` vai ao log. Balde do antifraude de texto longo vira começo + impressão (`chaveDoBalde`); rota `async` leva `try/catch`. Leitura pública em `private, no-cache` por padrão, pedido/carrinho/bilhete em `no-store` | `server/index.ts`, `shared/semNulo.ts`, `server/services/balde.ts`, `server/routes/index.ts` | `tests/semNulo.test.ts`, `npm run publico` |
| Rascunho não responde em rota pública (mapa, número, prêmios, ranking, últimas compras): 404, igual a inexistente | `server/routes/public.ts` | `npm run senha` |
| Segredos obrigatórios em produção (`SESSION_SECRET`, `COFRE_CHAVE`, R2); o seed se recusa em produção | `server/auth.ts`, `cofre.ts`, `storage.ts`, `scripts/seed.ts` | — |
| Log: método, caminho sem a query, status e tempo; recusa de login com o e-mail mascarado | `server/index.ts`, `server/routes/auth.ts` | — |
| Dependências sem vulnerabilidade conhecida | `package-lock.json` | `npm audit` |

## Rota nova: lista de conferência

- [ ] **Recorte.** Id de organização, rifa ou filho (mídia, cupom, saque…)
  passa por `orgOf`/`assert*InScope` **antes** de ler ou gravar. O do vizinho
  é 404. A rota entra no `npm run isolation`.
- [ ] **O índice decide.** Nada de consultar "já existe?" e depois gravar:
  `ON CONFLICT` ou `isUniqueViolation` → 409. Dois pedidos ao mesmo tempo
  passam os dois pela consulta.
- [ ] **Dentro da transação, só o `tx`.** Chamar o `db` de dentro de uma
  transação pede uma segunda conexão ao pool; com carga, todas as transações
  esperam a segunda e o servidor para (foi o que o `npm run load` pegou).
- [ ] **Entrada pública tem limite** (`hit`), contado depois do erro de
  preenchimento, com mensagem em português.
- [ ] **Arquivo** conferido pelo conteúdo, reprocessado com teto de pixels,
  servido com `nosniff`. Chave de armazenamento vem do servidor e é
  conferida quando volta do navegador.
- [ ] **Endereço vindo do usuário:** só `https:`, sem usuário e senha na URL.
- [ ] **Dinheiro:** ação que muda valor ou para onde o dinheiro vai pede
  senha (e segundo fator no painel, quando couber) e grava auditoria.
- [ ] **Rota pública pesada** (lê várias rifas ou grava por requisição) tem
  limite por **IP** (`hit` com `ipHash`): o `x-device-id` vem do cliente e muda
  a cada pedido, então sozinho não limita nada.
- [ ] **Dado pessoal** não sai em rota pública (primeiro nome; telefone e CPF
  mascarados) e não vai inteiro para o log.

## Como conferir

```
npm run check && npm test          # tipos e testes (o CI roda os dois)
npm audit                          # dependências
npm run isolation                  # recorte entre organizações
npm run load                       # simultaneidade, estoque e antifraude
npm run telas                      # telas: nome dos controles, estouro, erros
```

O CI roda as 25 provas contra a API a cada PR (`.github/workflows/ci.yml`).

## Revisões

### 18/10/2026 — acesso marketing

Escopo: o menu Marketing (pixels e compra pelo servidor, tráfego pago, Marketing
AI, rifas patrocinadas, banner pago) e os atalhos `/c/` e `/l/`. Relatório
completo, com o que ficou aberto, em `docs/AUDITORIA-ACESSO-MARKETING.md`.

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| **Alta** | **Pix de recarga devolvido no provedor deixava o crédito** (o webhook `refunded` só tratava o assistente e o pedido). Agora tira o crédito pelo livro, uma vez, até onde o saldo alcança; o resto fica na auditoria | `patrocinio.ts` (`estornarRecarga`), `routes/webhooks.ts` (`npm run patrocinio`, `npm run webhook`) |
| Média | A plataforma comprava anúncio patrocinado com o saldo da organização (o banner e o tráfego já eram 403) | `patrocinio.ts` (`npm run patrocinio`) |
| Média | Pixel de uma promotora seguia escutando a página da outra na navegação sem recarregar (medição automática e correspondência avançada leem o que se digita); agora recarrega quando sobra pixel que não é da página | `client/src/lib/marketing.ts`, `shared/marketing.ts` (`tests/auditoriaMarketing.test.ts`) |
| Média | `x in OBJETO` com texto do corpo aceitava `constructor` em 20 listas fechadas (um 500 na fila de divulgações; documento de entidade gravado com tipo `constructor`); `Object.hasOwn` em todas | `shared/*`, `server/services/*` (`tests/auditoriaMarketing.test.ts`, `npm run isolation`) |
| Média | Taxa de gestão e tabelas mandadas vazias viravam 0%; `[100]` e `true` valiam como número; `numeroDoCorpo()` | `shared/inteiro.ts` (`npm run trafego`, `patrocinio`, `banner`) |
| Média | Sem teto na recarga (chama o Pix da plataforma), na conversa do reembolso do saldo e no pedido de banner (abre a imagem): 10/h, 30/10 min e 20/10 min | `patrocinio.ts`, `bannerPago.ts` (`npm run patrocinio`, `banner`) |
| Baixa | Rifa de demonstração ou travada patrocinada; painel "Vendas por campanha" na memória (agora `group by`); pixel guardado sem conferir na saída; `/l/` sem conferir `https:` no redirecionamento | `patrocinio.ts`, `marketing.ts`, `links.ts` (`npm run marketing`) |

Aberto, para decisão: a dívida de uma recarga estornada depois de gasta; a
revogação do consentimento não alcança o pedido já criado; o telefone em hash vai
ao pixel da organização (controladora distinta); o formato dos eventos da Meta e
do TikTok não foi confirmado em fonte oficial. **Não passou pelo
`revisor-de-invariantes`.**

### 18/10/2026 — acesso do cambista

Escopo: tudo o que a sessão de cambista alcança (`/api/seller/*`, o bilhete e a
trilha de impressão, o acerto e o fechamento, a venda física pelo mesmo caminho
de reserva, o antifraude, a ponte com a maquininha — só leitura —, o login, a
senha e a marca de sessão). Relatório completo, com o que ficou aberto, em
`docs/AUDITORIA-ACESSO-CAMBISTA.md`.

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| **Alta** | **Reservas grandes ao mesmo tempo davam deadlock e 500** (seis pedidos de 800 cotas em paralelo: metade falhava, para o site e para o balcão): os candidatos sorteados entravam em ordem própria e duas transações se esperavam em ciclo. Agora entram em ordem crescente (devolvidos na ordem do sorteio) e o deadlock que sobrar recomeça a transação (até 6 vezes, depois 503) | `quotas.ts`, `orders.ts`, `pgError.ts` (`npm run cambista`, `npm run load`) |
| Média | Código de venda que não é inteiro em confirmar e cancelar respondia 500 (`NaN` no SQL) | `routes/seller.ts`, `shared/vendaFisica.ts` (`npm run cambista`, `npm run isolation`) |
| Média | O comprovante da maquininha ia sem formato nem teto para o bilhete — público pelo código e impresso: texto livre ("pague no Pix para…") e 200 mil letras passavam | `shared/vendaFisica.ts`, `routes/seller.ts` (`npm run cambista`) |
| Média | Número repetido no pedido cobrava a mais (`[7, 7, 7]` = 3 no preço, 1 reservada) | `orders.ts` (`npm run cambista`) |
| Média | Cambista sem organização (recorte nulo = plataforma) listava e vendia a rifa de todas; agora login, sessão e rota o recusam | `auth.ts`, `routes/seller.ts` (`npm run cambista`) |
| Média | O meio e o comprovante da venda na mão gravavam antes do `UPDATE` que paga: dois meios ao mesmo tempo deixavam o do perdedor no pedido pago | `orders.ts` (`npm run cambista`) |
| Baixa | Sem teto de vendas novas por cambista (a venda dele é isenta dos limites de comprador); "vendas de hoje" no dia UTC; demonstração e rifa travada oferecidas na tela; cadastro de cambista com organização inexistente (500); observação do acerto sem formato nem teto | `routes/seller.ts`, `routes/admin.ts` (`npm run cambista`) |

Aberto, para decisão: o segundo fator não existe para o cambista; a venda
estornada depois do acerto fechado segue no bruto dele; a ponte da maquininha
vale para qualquer página da WebView (Android, `docs/PENDENCIAS.md`).

### 18/10/2026 — acesso do afiliado

Escopo: tudo o que a sessão de afiliado alcança (`/api/affiliate/*`, cadastro e
login, vínculo e termo, kit/artes/editor, divulgações, saldo, saque, cadastro
fiscal, recibo, chave Pix, mensagens e assistente). Relatório completo, com o
que ficou aberto, em `docs/AUDITORIA-ACESSO-AFILIADO.md`.

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| **Alta** | **A sessão roubada de um usuário do painel sobrevivia à troca de senha** (e à redefinição por outra pessoa): uma requisição em andamento da sessão expulsa a regravava depois do `DELETE` em `sessions`. Provado 6 em 6 com 24 requisições em laço. A marca `users.sessoes_validas_desde` + `session.painelEntrouEm` fecha o que o acesso do apostador fechou só para `buyers`; desligar o acesso também derruba as sessões (ligar de novo não as traz de volta) | `auth.ts`, `routes/auth.ts`, `routes/admin.ts`, `schema.ts` (`npm run afiliados`) |
| Média | Documento fiscal aceitava tipo inventado (`in` pega `constructor`, `toString`…): gravava arquivo de 6 MB sob o nome do protótipo; o mesmo no tipo da chave Pix da verificação | `fiscal.ts`, `shared/verificacao.ts` (`npm run afiliados`, `tests/verificacao.test.ts`) |
| Média | A chave Pix dos saques aceitava objeto ou lista (virava `[object Object]`) | `routes/affiliate.ts` (`npm run afiliados`) |
| Baixa | Cadastro fiscal, documentos, foto e verificação sem limite: conta de afiliado nasce aberta e o 409 do CPF repetido deixava varrer CPFs; agora 40 gravações por hora por afiliado | `routes/affiliate.ts` (`npm run afiliados`) |
| Baixa | Artes do kit de um **rascunho** da organização respondiam 200 (confirmava o endereço); agora 404 | `routes/affiliate.ts` (`npm run afiliados`) |
| Baixa | `/links` varria todas as rifas da plataforma (3 consultas e um QR por rifa) e `/organizacoes` trazia todas as versões de todos os termos a cada abertura; agora só as organizações do afiliado e só o termo em vigor | `routes/affiliate.ts`, `afiliados.ts` |

### 18/10/2026 — acesso público (visitante sem login)

Escopo: tudo o que o visitante alcança (telas e `/api/public/*`, `/c/`, `/l/`,
login, webhooks). Relatório completo, com o que ficou aberto, em
`docs/AUDITORIA-ACESSO-PUBLICO.md`.

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| Alta | `POST /api/auth/login` sem `try`: o e-mail com byte nulo ou enorme (estoura a linha do índice do antifraude) derrubava o processo — um pedido anônimo tirava o site do ar | `routes/auth.ts`, `index.ts`, `balde.ts`, `semNulo.ts` (`npm run publico`, `tests/semNulo.test.ts`) |
| Média | Id fora do formato e byte nulo em rota pública respondiam 500 (pedido, carrinho, story, banner pago, perfil, recibo, pixel…) | `routes/public.ts`, `index.ts` (`npm run publico`) |
| Média | Promotora banida ainda aparecia na vitrine, nos estados, no termo, no pixel e no link do perfil (por onde o Pix por fora costuma ir) | `campaigns.ts`, `vitrine.ts`, `links.ts`, `afiliados.ts`, `marketing.ts` (`npm run publico`) |
| Média | Leitura pública sem `Cache-Control` (varia com a sessão); pedido e bilhete sem `no-store` | `routes/index.ts`, `public.ts` (`npm run publico`) |
| Baixa | Ranking sem guarda (varredura por pedido); consulta de CEP sem limite (ViaCEP) | `public.ts` (`npm run publico`) |

### 18/10/2026 — acesso da plataforma

Escopo: as 267 rotas de `/api/admin` e as telas do master. O relatório (o que
foi conferido, o que foi corrigido e o que ficou aberto) está em
`docs/AUDITORIA-ACESSO-PLATAFORMA.md`. Em resumo: id fora do formato respondia
500 em mais de setenta rotas; arquivar organização tinha cópia própria do
segundo fator, sem limite de tentativas; configuração com campo ausente voltava
ao padrão e dois cartões salvos juntos se perdiam; auditoria gravada antes da
decisão (ou fora da transação do resultado do sorteio).

### 02/10/2026

Escopo: o que nasceu depois da revisão de 28/09 — mensagens (foto, presença e
grupos), divulgação de terceiros, bilhetes privados, login com Google, banner
pago, Buscar, Reels, pôster do vídeo (execução do `ffmpeg`) e `/uploads` com a
cópia no S3. Revisão por leitura do código, mais as provas da API e o
`npm audit` (nenhuma vulnerabilidade conhecida).

**Corrigido nesta revisão:**

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| Média | O envio de mídia ao disco aceitava corpo de até 2 GB sem teto ligado à assinatura: dois envios em paralelo estouravam a memória do processo | `admin.ts` (`/media/raw`), `storage.ts` (`sign`/`verify` com o teto), `media.ts` (`tests/envioDeMidia.test.ts`) |
| Média | Completar o CPF da conta do Google não tinha limite: o "já existe" revelava quem é apostador e o dígito verificador era a única prova | `contaCompleta.ts` (`npm run google`) |
| Baixa | Os limites do Buscar e de "compartilhar" usavam o identificador do aparelho (cabeçalho do cliente): um valor novo por pedido os contornava; agora é por IP | `buscar.ts`, `publicacao.ts` |
| Baixa | `/uploads` perguntava ao bucket de cópia por qualquer nome, sem limite | `index.ts`, `storage.ts` (`chaveRestauravel`, `tests/envioDeMidia.test.ts`) |
| Baixa | `/reels` lia todas as rifas e mídias a cada pedido, sem limite | `public.ts` (`npm run publicacao`) |
| Baixa | O afiliado aparecia com o nome civil completo na conversa (o código dele é público) | `mensagens.ts` (`nomeCurto`) |
| Baixa | A decisão de denúncia de conversa gravava na auditoria o texto da ação vindo solto do corpo | `admin.ts` |

**Conferido e sem achados:** recorte e 404 em mensagens, grupos, fotos e
banner pago; `UPDATE` condicional nas decisões; compra paga conferida dentro
da transação; Google (state, nonce, PKCE, assinatura, volta só para o próprio
site); bilhetes privados; Buscar (curinga escapado, parâmetro, sem `OFFSET`);
o `ffmpeg` (sem shell, protocolos limitados, prazo, saída com teto) e nenhum
`sql.raw` com entrada de usuário.

**Sem correção nesta revisão** (as de 28/09 seguem valendo):

- `ffmpeg` simultâneos: limitado a 2 (fila) desde o PR dos extras do pôster.
- O identificador do aparelho continua vindo do cliente; o que segura é o IP.
- ~~Sessão derrubada pode voltar~~ **provada e corrigida na auditoria do acesso
  apostador (18/10/2026)**: `encerrarOutrasSessoes` apagava as linhas de
  `sessions`, mas o `connect-pg-simple` grava com `INSERT … ON CONFLICT (sid)
  DO UPDATE` — uma requisição da sessão expulsa que já estava em andamento e
  mexia na própria sessão a recriava depois do `DELETE` (reproduzido com 24
  requisições em laço contra `/conta/google/entrar`). Agora a conta tem
  `sessoes_validas_desde` e a sessão do apostador, `entrouEm`; o middleware de
  `setupAuth` derruba a sessão mais velha que a marca. Vale para troca de senha,
  primeira prova do telefone e exclusão da conta (`npm run conta`). O painel
  (`users`) tem o mesmo desenho de sessão e **não** foi coberto: ver
  `docs/AUDITORIA-ACESSO-APOSTADOR.md`. **O painel foi coberto na auditoria do
  acesso do afiliado (18/10/2026)**: `users.sessoes_validas_desde` e
  `session.painelEntrouEm`, provados com a mesma corrida em laço.

### 28/09/2026

Escopo: todas as rotas (`/api/public`, `/api/admin`, `/api/affiliate`,
`/api/seller`, webhooks, `/c/` e `/l/`), os serviços de dinheiro, upload,
sessão, antifraude e o cliente (o que fica no aparelho, links, service
worker). As 25 provas da API, 180 capturas de tela, o log do servidor e o
`npm audit` (nenhuma vulnerabilidade conhecida).

**Corrigido nesta revisão:**

| Gravidade | O quê | Onde (e prova) |
|---|---|---|
| Alta | A confirmação do envio de mídia não conferia se a chave do arquivo era da rifa | `media.ts`, `storage.ts` (`npm run isolation`, `tests/midia.test.ts`) |
| Média | A lista de usuários da organização alcançava a conta do afiliado antigo, que é da plataforma | `admin.ts` (`npm run isolation`) |
| Média | Trocar a chave Pix do afiliado não pedia senha nem ficava na auditoria | `affiliate.ts`, tela Saques (`npm run afiliados`) |
| Média | Trocar ou redefinir a senha do painel não derrubava as outras sessões | `auth.ts`, `routes/auth.ts`, `admin.ts` |
| Média | Pedidos simultâneos do mesmo telefone passavam do limite de reservas abertas, e o primeiro pedido de um telefone novo podia dar erro 500 | `antifraude.ts`, `orders.ts` (`npm run load`) |
| Baixa | Teto de pixels nas fotos da rifa e no certificado; limite e régua de senha no cadastro de afiliado; régua de senha no cadastro de cambista; "consultar e gravar" em cupom, organização e código de afiliado; bilhete impresso só com sessão; log sem as respostas de sucesso; HSTS; tamanho da tag do cofre; comprovante de saque só `https:`; formato do id do Asaas; seed recusado em produção | vários |
| Teste | Três provas escolhiam a organização com `limit(1)` sem ordem e falhavam conforme o estado do banco | `scripts/refund-test.ts`, `conta-test.ts`, `carrinho-test.ts` |

**Sem correção nesta revisão** (risco aceito ou plano, em
`docs/PENDENCIAS.md`):

- A consulta pública do pedido e o bilhete mostram o nome completo de quem
  comprou (telefone e CPF mascarados). É decisão do produto; o código do
  pedido é sorteado entre 90 milhões e a varredura é barrada por IP.
- O identificador do aparelho vem do navegador: o limite por aparelho se
  contorna trocando o identificador; quem segura é o limite por IP.
- O bloqueio por excesso de tentativas de entrada pode ser usado para trancar
  uma conta por 15 minutos.
- Assistente de IA: o que a pessoa escreve fica guardado no Chatbase (é lá que
  mora a conversa). Telefone, CPF e e-mail são barrados antes de sair; nome de
  cliente digitado à mão passa — o aviso na coluna pede o código do pedido ou o
  ID do cliente. O script de terceiro no painel, aceito na primeira versão, saiu:
  a conversa agora passa pelo servidor.
- Cobrança do assistente: o custo só é sabido depois da resposta, então
  mensagens em paralelo com o último crédito deixam o avulso negativo (a dívida
  de uma janela, limitada pelo limite de mensagens por pessoa e por quem paga);
  o Pix pago tarde (depois de a tela dar por vencido) credita normalmente.
- `setPlataforma` lê e grava sem trava: dois cartões salvos ao mesmo tempo
  podem perder um (último a gravar vence). Já existia; o cartão do assistente é
  só mais um escritor.
- A política de conteúdo (CSP) está **em modo relatório**: avisa, não
  bloqueia. Passa a valer de verdade quando o log de produção (`[csp]`)
  ficar só com o que a lista já tem — inclusive com os pixels ligados.
- Clique em rifa patrocinada: quem controla muitos IPs **e** pede a lista como
  cada aparelho ainda consegue gastar o pacote de outro organizador (o
  comprovante e o teto por IP encarecem, não impedem). O passo seguinte seria
  exigir um tempo mínimo de página ou a conta.
