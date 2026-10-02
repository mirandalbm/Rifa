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
| Quem toma uma sessão | desviar dinheiro (carteira, chave Pix), trancar o dono do lado de fora | senha nas ações que mudam para onde o dinheiro vai, segundo fator para arquivar, sessões derrubadas na troca de senha |
| Quem forja pagamento | marcar pedido como pago | webhook assinado, status consultado na API do provedor, idempotência por `(provider, external_id)` |
| Quem lê o banco vazado | documentos, CPF, dados fiscais | cofre AES-256-GCM com a chave fora do banco, CPF só como HMAC, senha em scrypt |

## Controles e onde moram

| Controle | Onde | Prova |
|---|---|---|
| Sessão: cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; sessão nova a cada entrada | `server/auth.ts`, `server/services/contaComprador.ts` | — |
| Senha: scrypt, régua única (`shared/senha.ts`), força bruta contada por conta e por IP (`guardLogin`) | `server/auth.ts`, `server/routes/auth.ts` | `tests/senha.test.ts` |
| Troca e redefinição de senha derrubam as outras sessões (painel e apostador) | `encerrarSessoesDoUsuario`, `encerrarOutrasSessoes` | — |
| Segundo fator do painel (TOTP); obrigatório para arquivar organização | `server/services/totp.ts`, `server/routes/admin.ts` | `tests/totp.test.ts` |
| Recorte por organização | `orgOf`, `assertCampaignInScope`, `assertAffiliateInScope`, `assertUserInScope` | `npm run isolation` |
| Arquivo: tipo conferido pelo conteúdo, reprocessado (sharp, teto de 40 MP), nunca servido como veio; chave de mídia gerada pelo servidor e conferida na volta; envio ao disco com assinatura que leva o **teto de bytes** (conferida antes de ler o corpo) e `/uploads` só restaura chave no formato que geramos | `server/services/media.ts`, `storage.ts`, `probe.ts` | `tests/midia.test.ts`, `npm run isolation` |
| Vídeo enviado a terceiro (Cloudflare Stream, só com `VIDEO_PROCESSOR=cloudflare-stream`): token só no cabeçalho, endereço do quadro só `https` em `*.cloudflarestream.com`, vídeo apagado do Stream no `finally`, prazo e teto de 3 envios, nunca lança | `server/services/videoProcessor.ts` | `tests/cloudflareStream.test.ts` |
| Assistente de IA (Chatbase): a conversa passa pelo nosso servidor (nenhum script de terceiro no painel), chave da API só no servidor (nunca em resposta, log ou URL), endereço da API fixo em produção, titular e papel tirados da sessão, telefone/CPF/e-mail barrados antes de sair (texto normalizado: traço Unicode, invisível, largura cheia), uso gravado por mensagem em milésimos com chave única, id da conversa gravado condicional ao lido, limite por pessoa na mensagem e na leitura, conversa fora do cache no login e no logout, configuração só da plataforma | `server/services/chatbase.ts`, `ia.ts`, `server/routes/ia.ts`, `shared/ia.ts` | `tests/ia.test.ts`, `tests/chatbase.test.ts`, `npm run ia` (com o Chatbase de mentira), `npm run isolation` |
| Cobrança do assistente: preço da tabela (nunca do corpo) fotografado no Pix, titular da sessão, 402 antes de sair para o Chatbase, livro com chave única e conta travada na mesma transação, Pix pago por `UPDATE` condicional, débito na transação do uso, CPF/CNPJ do pagador não guardado, limite de Pix por pessoa | `shared/iaCobranca.ts`, `server/services/iaCobranca.ts`, `server/routes/ia.ts`, `server/routes/webhooks.ts` | `tests/iaCobranca.test.ts`, `npm run ia`, `npm run isolation` |
| Ações do assistente: entrada da IA tratada como corpo de requisição (catálogo fechado, formato conferido), recorte da sessão em cada ação, gravação só com confirmação da pessoa (`UPDATE` condicional, prazo, só quem conversava; 404 para outra pessoa) e pelos mesmos serviços das rotas, resumo montado pelo servidor, `audit_log` com `viaIA`, resultado sem dado pessoal (barreira em cada texto), teto de rodadas por mensagem | `shared/iaAcoes.ts`, `server/services/iaAcoes.ts`, `server/services/ia.ts`, `server/routes/ia.ts` | `tests/iaAcoes.test.ts`, `npm run ia-acoes`, `npm run isolation` |
| Pagamento: webhook assinado (tempo constante), status pela API, idempotente | `server/routes/webhooks.ts`, `server/payments/` | `tests/mercadopago.test.ts`, `tests/asaas.test.ts` |
| Antifraude: limites antes do primeiro `INSERT` e a reserva em aberto de novo na transação | `server/services/antifraude.ts`, `orders.ts` | `npm run load` |
| Endereço vindo de usuário: só `https:`, nunca vira redirecionamento aberto | `shared/perfil.ts`, `shared/vitrine.ts`, `server/services/links.ts` | `npm run perfil` |
| Push só para serviço conhecido (contra SSRF) | `shared/push.ts` | `tests/push.test.ts` |
| Cabeçalhos: `nosniff`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`; HSTS em produção | `server/index.ts` | — |
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
- Sem política de conteúdo (CSP) completa — só `frame-ancestors`. Os pixels
  de marketing pedem a lista das origens; o caminho é começar em modo
  relatório.
- Clique em rifa patrocinada: quem controla muitos IPs consegue gastar o
  pacote de outro organizador (o barrado conta por IP e aparelho).
- As rotas públicas de ocupação, prêmios e ranking respondem também para rifa
  em rascunho (só números, sem dado pessoal).
- O segredo do segundo fator fica no banco sem cifra (pode ir para o cofre).
- A senha usa o scrypt com o custo padrão do Node (N = 16.384).
