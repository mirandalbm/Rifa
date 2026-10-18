# Plano: o endereço próprio da organização (`<rotulo>.loteriasdobem.com.br`)

Data: 18/10/2026. Estado: **plano; o PR 1 e o PR 2 estão no código** (regra pura corrigida, `www`,
`noindex`, `Origin` por host em modo relatório — falta só o cookie `__Host-`, que espera a
pergunta 11); do resto, existe o middleware que marca a requisição e nenhuma rota usa o destino.
Ler com `CLAUDE.md` (invariantes 11 e 15 e a seção "Multi-organizador"),
`docs/SEGURANCA.md` e `docs/PERGUNTAS-AO-ADVOGADO.md` (quinta rodada, R30 a R35).

## 0. Decisões do responsável (18/10/2026) e ponto de partida

| Decisão | Valor |
|---|---|
| Domínio base | `loteriasdobem.com.br` — `SUBDOMINIO_BASE=loteriasdobem.com.br`. No Railway já estão a raiz e o `www`; **falta o curinga** `*.loteriasdobem.com.br`, que o responsável cadastra |
| Quem ganha endereço no lançamento | **só a organização**. O endereço de afiliado (`af-<código>`) fica para depois |
| Login | **por endereço**: o cookie `rifa.sid` continua sem `Domain`; **nenhum cookie no domínio base** |

**O que existe hoje (origem/main, 18/10/2026):**

| Peça | Onde | O que faz |
|---|---|---|
| Regra pura | `shared/subdominio.ts` | `problemaNoRotulo()`, `rotuloDoAfiliado()`, `hostDoRotulo()`, `identificarHost()`, `linkDaRifaNoEndereco()`, `RESERVADOS` |
| Leitura da variável | `server/services/subdominio.ts` | `subdominioBaseDoAmbiente()`, `destinoDoSubdominio()`, `reconhecerSubdominio()` (só põe `res.locals.subdominio`) |
| Ligação | `server/index.ts:207` | `app.use(reconhecerSubdominio)` — **depois** dos corpos, do log e dos webhooks, **antes** do `setupAuth` e das rotas |
| Prova | `tests/subdominio.test.ts` | regra pura e o middleware |
| Nada mais | — | nenhuma rota, tela, link, prova de API ou documentação lê `res.locals.subdominio` |

**Lacuna de documentação:** a seção "Subdomínio do organizador" de
`docs/PENDENCIAS.md`, citada no pedido deste plano, **não existe** em
`origin/main`. Este plano a substitui; o PR que o commitar abre a seção com a
lista do fim do capítulo 11 (marcar o que fechar, como no resto do arquivo).

**Pontos da regra atual que o plano corrige** (todos pequenos, no PR 1):

1. `identificarHost()` aceita `a--b` e `xn--…` (punycode): rótulo com dois
   hífens seguidos é ambíguo e é como se escreve IDN. Recusar.
2. `Host: org.base.` (ponto final, que é DNS válido) hoje **não** reconhece:
   normalizar (tirar o ponto) para não haver dois comportamentos.
3. Qualquer porta é tirada (`/:\d+$/`). Em produção só `:80`/`:443` devem passar;
   outras portas só fora de produção (a prova e o `*.localhost:5000`).
4. `slugify()` (`server/services/orgs.ts`) gera slug de até 60 letras, sem
   validar como rótulo: organização de nome curto ("AB"), reservado ("Admin")
   ou "af-…" nasce com slug que **não vira endereço**. Criar já valida e avisa
   (`problemaNoRotulo` na criação), e a auditoria do capítulo 2 lista as que existem.
5. `RESERVADOS` não protege marca (Caixa, bancos, Google, a própria
   "Loterias do Bem"). Lista proposta no capítulo 3.
6. O cabeçalho do arquivo diz "organização **e afiliado**": o código do afiliado
   (`af-<código>`) é reconhecido por `identificarHost()` e **não** pode virar página
   no lançamento — o guarda do servidor responde 404 para `tipo: "afiliado"`
   (capítulo 1) e o prefixo `af-` continua proibido para organização.

---

## 1. O que o endereço da organização mostra

### 1.1 Decisão proposta

`https://<rotulo>.loteriasdobem.com.br/` **é o perfil da organização** — a mesma
página de `/o/:org` (`client/src/pages/Perfil.tsx`), com a grade das rifas, os
stories, seguir e o sino. A rifa abre **dentro** do endereço, em `/r/<rifa>`
(a mesma página de `/o/:org/r/:rifa`, `client/src/pages/Rifa.tsx`). **Não é uma
"vitrine só dela" nova**: perfil e vitrine só dela são a mesma coisa hoje, e um
componente novo duplicaria o que `Perfil` já faz (CLAUDE.md, "tela nova larga
reorganiza por classes, nunca com um segundo componente").

| No endereço da organização | O que acontece |
|---|---|
| `/` | `Perfil` da organização do rótulo |
| `/r/:rifa` | `Rifa` dentro do perfil; a rifa de **outra** organização é 404 (HTML e API) |
| `/r/:rifa/regulamento` | `Regulamento` |
| `/pedido/:code`, `/carrinho`, `/carrinho/pix/:codigo` | iguais (o carrinho só aceita rifa da organização, 1.5) |
| `/entrar`, `/criar-conta`, `/minhas-cotas`, `/minhas-compras`, `/perfil`, `/perfil/…`, `/notificacoes` | **apostador com login por endereço** (capítulo 7) |
| `/ajuda`, `/termos`, `/privacidade` | iguais |
| `/bilhete/:code`, `/recibo/:codigo` | respondem nos dois lugares (são por código), mas **o link que sai impresso e nos recibos é o do domínio principal** (documento da plataforma, estável mesmo que o endereço seja desligado) |
| `/o/<este rótulo>…` | **301** para o caminho sem `/o/<rótulo>` (links, push e compartilhamentos antigos continuam valendo) |
| `/o/<outra organização>…`, `/` da vitrine global, `/estado/UF`, `/reels`, `/buscar`, `/mensagens…`, `/u/:apelido`, `/publicar`, `/seja-afiliado` | **302 para o domínio principal** com o mesmo caminho (são da plataforma, não da promotora) |
| `/admin…`, `/afiliado…`, `/cambista…`, `/conta/senha`, `/api/admin`, `/api/affiliate`, `/api/seller`, `/api/ia`, `/api/auth/login` (painel), `/api/webhooks`, `/api/dev` | **404** no endereço (o painel, a API de painel e os webhooks existem só no domínio principal) |
| `/c/<código>` e `/l/<perfil>/<n>` | funcionam; o código de **outra** organização redireciona para o principal (1.6) |

A lista é **fechada** (nega por padrão): rota nova que ninguém classificou não
responde no endereço. O classificador mora em `shared/subdominio.ts`
(`rotaNoEndereco(metodo, caminho)` → `livre`, `da-organizacao`, `da-rifa`,
`so-principal`, `bloqueada`) e um teste (`tests/subdominio.test.ts`) reprova se
uma rota registrada em `publicRouter`/`App.tsx` ficar sem classe — o mesmo
desenho do mapa de telas de `tests/versoes.test.ts`.

### 1.2 Como o SPA decide, sem segundo componente

Hoje o `App.tsx` (wouter 3.3.5) casa o caminho do navegador direto com os
`<Route>`. O endereço da organização precisa que `/` seja `Perfil` e `/r/x` seja
`Rifa` **dentro** do perfil. Em vez de duplicar rotas ou tocar nas 38 linhas
que montam `/o/${slug}…` (`Vitrine`, `CartaoDoFeed`, `Stories`, `Publicacao`,
`Perfil`, `Rifa`…), o `Router` do wouter recebe um **hook de localização** que
traduz o caminho **real** do navegador no caminho **lógico** que as rotas
conhecem:

- `caminhoLogico(real, slug)`: `/` → `/o/<slug>`; `/r/…` → `/o/<slug>/r/…`; o resto
  passa como está. (Puro, em `shared/subdominio.ts`, com teste de ida e volta.)
- `caminhoReal(logico, slug)`: `/o/<slug>` → `/`; `/o/<slug>/r/…` → `/r/…`; um
  caminho de **outro** lugar (`/o/<outra>`, `/admin`, `/reels`) vira navegação de
  página inteira para o domínio principal (`window.location.assign`).
- `client/src/lib/endereco.ts`: `useEndereco()` (lê `GET /api/public/endereco`,
  `staleTime: Infinity`) e `useLocationDoEndereco(slug)`, montado sobre
  `wouter/use-browser-location`.
- `App.tsx` ganha **um** wrapper na raiz: `<RoteadorPorEndereco>`, que escolhe
  `<Router hook={useLocationDoEndereco(slug)} hrefs={…}>` no endereço da
  organização e o `<Router>` de sempre no domínio principal. As rotas, o
  `Switch` e as páginas são os mesmos. `Perfil` e `Rifa` continuam lendo
  `useParams().org`, que sai do caminho lógico.
- `VisaoDoOrganizador` não muda: o organizador entra no painel pelo domínio
  principal (cookie não atravessa), então no endereço dele ele é um visitante.
- O console (`shared/console.ts`, `BOTOES_DO_CONSOLE`) filtra no endereço por
  `botoesNoEndereco()`: ficam Início (o perfil), Carrinho e Perfil; Reels, Buscar
  e Mensagens ficam de fora (são globais). A intro da marca e a faixa "Baixe o
  app" **não aparecem** no endereço no lançamento (7.7).
- Enquanto `/api/public/endereco` não responde, o endereço mostra o "Carregando…"
  de `GuardedConta`. A injeção do dado no `index.html` (`<meta>`), que tira a
  espera, entra no PR de SEO (capítulo 4) porque é a mesma mudança.

Onde confirmar: a propriedade `hrefs` do `Router` do wouter e o contrato do
`hook` na versão instalada (3.3.5) — `node_modules` não existe nesta cópia; o PR 3
abre com um teste que monta o `Router` com o hook (suposição 1).

### 1.3 Quem responde primeiro: o servidor

O SPA não é a barreira (ele é cortesia, como em todo o projeto). Antes do
`serveStatic` e das rotas, um middleware **`guardaDoEndereco`** (substitui
`reconhecerSubdominio`, que passa a ser a primeira linha dele) decide por
requisição, a partir de **`req.headers.host` e só dele**:

```
host normalizado ─┬─ não é do domínio base ........ segue como hoje (principal, Railway, IP)
                  ├─ www.<base> ................... 301/308 para o domínio principal
                  ├─ <base> (raiz) ................ segue (principal)
                  ├─ af-<código> .................. 404 (afiliado: depois)
                  ├─ rótulo inválido/reservado .... 404
                  └─ <rotulo> ─ consulta o rótulo (cache curto)
                        ├─ não existe / arquivada / banida / endereço desligado ... 404
                        └─ existe ─ res.locals.endereco = { organizacao }, aplica a classe da rota
```

- **Nunca `req.hostname`, `req.subdomains` ou `X-Forwarded-Host`.** Com `trust
  proxy` ligado, o Express faz `req.hostname` ler `X-Forwarded-Host`; o que vem
  do cliente não decide a organização. Só `Host`, normalizado por uma função
  (`hostDaRequisicao`): minúsculas, sem ponto final, porta só `80/443` em produção,
  um único valor, sem `@`, espaço, barra, `%` ou caractere de controle. Duplicado
  ou estranho → 400 (não "segue como principal").
- **404 de verdade (status), não 200 com a tela de "não encontrada".** A SPA
  serve `index.html` para qualquer caminho; sem o guarda, `rotulo-que-nao-existe.
  loteriasdobem.com.br` devolveria 200 e o Google/Meta veria um "soft 404" como
  página válida. O guarda responde `404` com o mesmo `index.html` (a SPA desenha
  `PaginaNaoEncontrada` pelo `GET /api/public/endereco`, que devolve `{ tipo:
  "inexistente" }`) e, na API, o 404 em JSON de sempre.
- **O que *não* fazer: redirecionar rótulo inexistente para a vitrine.** Seria
  mostrar a vitrine da plataforma (o "agregador") sob um endereço que o
  anunciante julga ser da promotora, e deixaria qualquer `qualquercoisa.` + base
  parecer um endereço oficial. 404 sempre.
- **Cache do rótulo:** `Map` na memória, `slug → { id, slug, nome, situacao }`,
  validade de 15 s e invalidação local em arquivar, banir, desligar o endereço e
  criar organização (`invalidarEndereco()`). Com várias réplicas o teto de
  atraso é a validade. Rótulo inexistente também é guardado (negativo, 15 s)
  para um varredor de rótulos não virar uma consulta ao banco por requisição.
- **Limite por IP** na resolução de rótulo inexistente (`hit`, mesmo desenho do
  `csp:`): varrer rótulos é descobrir quais organizações existem.

**Revisão do PR 2 (18/10/2026) — o que a lista fechada tem de ler como o Express lê:** o
Express casa rota **sem diferenciar maiúscula** (`/API/public/…` chega ao mesmo
handler) e aceita a forma absoluta do pedido (`GET http://x/api/…`). Por isso o guarda
trata `/api` em qualquer caixa (`ehCaminhoDeApi`), nega o que não é a forma minúscula
classificada, recusa a forma absoluta (400) e **nunca** segue para a rota quando nega.
Cada rota de compra confere **o campo que ela usa** (`/orders` → `campaignId`;
`/carrinho` e `/carrinho/checkout` → todos os `itens`); o destino do 301 de
`/o/<este rótulo>` é sempre um caminho do próprio endereço. A invalidação do cache é
local ao processo: com várias réplicas, desligar leva até 15 s nas outras.

### 1.4 Os casos que o responsável pediu

| Caso | Resposta |
|---|---|
| Domínio principal (`loteriasdobem.com.br`) | Nada muda. É a vitrine, o painel, a API e os webhooks |
| `www.loteriasdobem.com.br` | **301** (GET/HEAD) ou **308** (o resto) para o mesmo caminho no domínio principal escolhido (`PUBLIC_BASE_URL`). Duas casas (raiz e `www`) com o mesmo conteúdo dividem sessão e `localStorage` ao meio e duplicam o conteúdo (capítulo 4); isto vale **mesmo com a base de subdomínio desligada** e vai no PR 1. `www` já é reservado |
| Rótulo reservado (`admin`, `api`, `painel`…) | 404. Para rótulo de organização é impossível criar; para o `Host` é recusado por `identificarHost()` |
| Rótulo inexistente | 404 (acima) |
| Organização **arquivada** ou **banida** | 404 — a mesma regra de `organizacaoPublica()` (`server/services/perfil.ts:68`, `archived_at` e `banida_em` nulos). Banir já trava as rifas na mesma transação; o endereço passa a 404 em até 15 s |
| Organização **suspensa** (`active = false`) | **Hoje o perfil dela segue público** (`organizacaoPublica()` não olha `active`; suspender fecha a porta do *organizador*, `barreiraDaOrganizacao()`). O plano segue a regra do perfil: o endereço **continua respondendo**. O pedido do responsável dizia 404; é a pergunta 5 do capítulo 12 |
| Endereço desligado pela plataforma (phishing, marca, ordem judicial) | 404 só no endereço; a organização e o perfil `/o/<slug>` no principal seguem. É o interruptor do capítulo 3 (`organizations.endereco_ativo`) |
| Rifa de outra organização pedida pelo endereço | 404 (a API confere o dono, 1.5) |
| Endereço do afiliado `af-…` | 404 até a fase seguinte |

### 1.5 Dado público no endereço: o recorte é da organização

O dado em si continua público (a rifa do vizinho é pública no principal), mas **a
página da promotora A nunca mostra a rifa da B**: seria misturar marca num
endereço que o anunciante apresenta como "da promotora" (R12 e Q4). Por isso o
guarda, depois de achar a organização, aplica a classe da rota:

- `da-organizacao`: família `/api/public/o/:slug…` — o `:slug` tem de ser o do
  endereço, senão 404.
- `da-rifa`: família `/api/public/campaigns/:slug…`, `/orders` (corpo com a rifa),
  `/carrinho` (cada item), `/api/public/divulgacoes…` da rifa, `/mensagens/grupos/rifa/:slug`,
  comentários, presente… — a rifa tem de ser da organização do endereço, senão 404.
  O dono vem de uma consulta por `slug` (índice `uq_campaigns_slug`), pequena e
  com o mesmo cache de 15 s.
- `livre`: o que não tem organização (`/api/public/endereco`, `/api/public/marketing`
  com a organização do endereço, `/api/public/app`, `/api/public/checkout`, as
  rotas de conta do apostador, `/api/public/conta/…`).
- `so-principal`: feed, vitrine, estados, Reels, Buscar, coluna ao vivo, sorteio
  oficial global, `u/`, mensagens e grupos globais, banners da vitrine, patrocinadas.
- `bloqueada`: tudo o que for de painel (acima).

A lista exata das 156 rotas de `publicRouter` é gerada no PR 2 e **vira teste**:
cada rota registrada tem de estar classificada (a mensagem do teste diz qual).

### 1.6 Links curtos

`/c/<código>` e `/l/<perfil>/<n>` ficam como estão (`server/routes/index.ts:31` e
`:41`, `server/services/links.ts`). No endereço: `/c/<código>` de **outra**
organização redireciona (302) para o mesmo `/c/<código>` no domínio principal;
`/l/<perfil>/<n>` de outro perfil, idem. O destino guardado continua sendo um
caminho do próprio site (`/o/<slug>…`), e o endereço aplica a canonicalização
(301 de `/o/<este rótulo>` para o caminho curto). O curto passa a ser **emitido**
pelo endereço da organização (capítulo 2).

---

## 2. Rótulo, slug e o que acontece quando muda

### 2.1 Recomendação: o rótulo é o slug; o interruptor é uma coluna

- **O rótulo é `organizations.slug`**, como o cabeçalho de `shared/subdominio.ts`
  já diz. O slug é **imutável** (`server/services/orgs.ts:359`: "já foi impresso em
  bilhete e pode estar em link") e único para sempre (`uq_organizations_slug`);
  organização **não se apaga** (arquiva), então o rótulo **não é liberado** e
  nunca passa a outra organização. Isto resolve, no lançamento, a troca de slug
  e a retomada de rótulo liberado: não existem.
- **Coluna nova:** `organizations.endereco_ativo boolean not null default false`
  (e `endereco_motivo text`). **Nasce desligado por organização**: a plataforma
  liga cada uma em Organizações (auditoria `organizacao.endereco`, 403 para
  organizador, 404 para o vizinho em ler). É o *lançamento gradual* e o
  *interruptor de emergência* (rótulo parecido com marca, phishing, ordem
  judicial) na mesma peça: desligar não toca a rifa, a venda nem o perfil no
  principal. Sobe com o `db:push` **antes** do código.
- **Só liga se o rótulo valer** (`problemaNoRotulo(slug) === null`, mais a regra
  de lista de marcas do capítulo 3): a rota recusa com 422 e o motivo.
- **Auditoria dos que já existem:** `npm run subdominio -- --auditar` (script
  somente leitura) lista as organizações cujo slug não vira endereço (curto,
  reservado, `af-`, `--`) e as que batem com a lista de marcas, para o
  responsável decidir uma a uma. Essas ficam sem endereço (o perfil no principal
  não muda).

### 2.2 Se um dia o slug puder mudar (não é o lançamento)

Só se o responsável decidir permitir renomear o endereço (pergunta 1). Desenho já
pronto para não improvisar:

- tabela **`organizacao_rotulos`** (`rotulo` único para sempre, `organization_id`,
  `desde`, `ate`, `motivo`, `atual boolean`): o rótulo antigo **nunca** é
  liberado (tombstone permanente) — é a defesa contra reuso de rótulo;
- o guarda consulta a tabela: rótulo antigo → **301** para o rótulo atual
  (mesmo caminho e consulta), **sem prazo** (ele nunca vai pertencer a outro; o
  custo de manter é uma linha). Se o responsável quiser prazo (pergunta 1),
  depois dele o rótulo vira 404 e continua reservado;
- só a plataforma troca, com motivo, auditoria e a mesma validação; o slug
  (`/o/<slug>`, bilhete) **não** muda — só o endereço;
- o `UPDATE` que troca o atual e o `INSERT` do novo vão na mesma transação, com
  a organização travada (`FOR UPDATE`), e o índice decide a colisão.

### 2.3 Takeover do rótulo

O "takeover" clássico de subdomínio é o `CNAME` pendurado para um serviço que
alguém reivindica. **Aqui não há registro por rótulo**: o DNS é um curinga
único para o Railway, e o que decide é o banco. Os riscos reais são:
(a) rótulo liberado e reusado — não acontece (2.1); (b) o curinga cair para outro
serviço — o curinga fica só no serviço da plataforma e o `*.up.railway.app`
não substitui o `Host` (o guarda recusa `Host` fora da base); (c) o domínio base
expirar — renovação com alerta, e este é um dos motivos da pergunta R34.

---

## 3. Phishing da marca por um endereço de organização

O endereço carrega a confiança da plataforma e é dado pela plataforma. Hoje **só
o administrador geral cria organização** (`POST /organizacoes`,
`server/routes/admin.ts:2794`), a partir do **nome** (o slug sai de `slugify`):
não há cadastro livre, o que já corta quase tudo. Controles:

1. **Validação na criação** (`createOrganization`): o slug gerado passa por
   `problemaNoRotulo()` e pela lista de marcas; se não passar, a organização é
   criada **sem endereço** e a tela diz por quê (a plataforma pode escolher
   outro nome). Não bloqueia a criação: o perfil no principal funciona.
2. **Reservados e marcas** — `RESERVADOS` ganha (proposta, o responsável aprova;
   pergunta 10): `loteriasdobem`, `loterias`, `loteria`, `bem`, `oficial`,
   `federal`, `caixa`, `cef`, `gov`, `fazenda`, `receita`, `spa`, `pix`,
   `pagamento`, `pagamentos`, `login`, `entrar`, `conta`, `seguranca`,
   `bancodobrasil`, `bb`, `itau`, `bradesco`, `santander`, `nubank`, `inter`,
   `mercadopago`, `pagarme`, `stone`, `asaas`, `google`, `facebook`, `meta`,
   `instagram`, `tiktok`, `whatsapp`, `youtube`, `windsor`, `cloudflare`,
   `railway`. Mais a regra de **contém**: rótulo que *começa ou termina* por
   `loteriasdobem`, `caixa-`/`-caixa`, `gov-`, `oficial-`, `-oficial` exige a
   ligação manual por quem decide (a rota devolve 409 com o motivo, a
   plataforma liga conscientemente). Lista em `shared/subdominio.ts`, com teste.
3. **Sem `--` e sem `xn-`:** punycode e homógrafo ficam de fora (o slug já é
   ASCII sem acento, mas o `Host` pode chegar com `xn--`).
4. **Interruptor** `endereco_ativo` (2.1): desligar é imediato (invalida o cache
   local, 15 s nas outras réplicas).
5. **Nome ofensivo:** o nome da organização já passa pelas regras da plataforma
   (quem cria é o administrador, que vê o nome e o endereço resultante antes de
   ligar). A tela de ligar mostra o endereço por extenso e a pergunta
   "confere?". Denúncia de organização continua no fluxo de `Seguranca`.
6. **A página não é HTML da organização.** Tudo o que ela controla é *dado* já
   validado (`validarLinks`, `validarDestaque`, bio, capa reprocessada): nenhum
   HTML, CSS ou script chega ao endereço dela. É o que impede o endereço de ser
   uma página de golpe com a assinatura da plataforma, e o plano **não** abre
   exceção (domínio próprio da promotora com HTML dela não é este plano).
7. **Contrato:** a plataforma poder desligar ou trocar o endereço a qualquer
   momento, sem aviso, por risco de phishing, e o endereço ser da plataforma
   (a promotora não é dona dele) — texto do advogado (R33 e R34).

---

## 4. `canonical`, SEO e Open Graph

**Hoje não existe** `robots.txt`, `sitemap.xml`, `<link rel="canonical">`,
`og:*` nem `twitter:*` (`client/index.html` só tem `description`, `theme-color`
e as metas do iOS; `client/public/` só tem `icons`, `intro`, `manifest.webmanifest`
e `sw.js`). Link compartilhado no WhatsApp mostra o texto cru. Tudo abaixo é
novo, não uma troca.

- **Canônico = o endereço da organização**, quando ele está ativo: o mesmo
  conteúdo existe em `loteriasdobem.com.br/o/<slug>` (e `/o/<slug>/r/<rifa>`) e
  em `<slug>.loteriasdobem.com.br/`. A página no principal ganha
  `<link rel="canonical" href="https://<slug>.…/…">`; a do endereço, canonical
  para si. **Sem redirecionar** do principal para o endereço: o organizador
  logado e o apostador que navega na vitrine usam `/o/<slug>` no principal, com
  a sessão deles.
- **Como o servidor põe isso no HTML:** o `index.html` construído ganha um
  marcador `<!--rifa-meta-->`; `serveStatic` (`server/vite.ts:70`) lê o arquivo
  uma vez, e por requisição troca o marcador por `canonical`, `og:title`,
  `og:description`, `og:image` (capa da rifa), `og:url`, `robots` e o
  `<meta name="rifa:endereco">` que a SPA lê antes do primeiro desenho. O hash do
  script do tema (`shared/csp.ts`, `hashesDosScriptsEmLinha`) é do conteúdo do
  `<script>`, não muda. Em desenvolvimento (Vite) o marcador não é trocado e a
  SPA usa o endpoint.
- **`robots.txt` e `sitemap.xml` por host** (rotas do servidor, não arquivos):
  - endereço da organização: `Allow: /`, sitemap com o perfil e as rifas
    **publicadas** (nunca rascunho, demonstração, travada nem promotora
    arquivada/banida) — a mesma régua da vitrine;
  - domínio principal: sitemap só da vitrine, páginas legais e ajuda. **Não lista
    `/o/<slug>…`** das organizações que têm endereço ativo (a duplicata);
  - qualquer outro host (`*.up.railway.app`, IP): `Disallow: /` e
    `X-Robots-Tag: noindex`.
- **O que nunca indexa:** `/entrar`, `/criar-conta`, `/minhas-*`, `/perfil…`,
  `/carrinho…`, `/pedido/…` (`noindex, nofollow`, no `<meta robots>` e no
  cabeçalho `X-Robots-Tag`) — e `Disallow` no `robots.txt`.
- **Imagem do Open Graph:** a capa da rifa (banner, senão a primeira foto, nunca o
  vídeo), no tamanho de variantes que já existe; a imagem do perfil usa a foto da
  organização. Nada de preço no `og:title` (o preço muda; vale a página).
- **A indexação é decisão do responsável** (pergunta 8): o plano entrega a
  estrutura; ligar o sitemap é uma variável (`SEO_INDEXAR=1`).

---

## 5. Todo lugar que monta URL absoluta

Regra: **o que é da rifa/organização sai pelo endereço da organização** (se
ativo e válido); **o que é da conta ou do documento fica no domínio principal**.
Sem `SUBDOMINIO_BASE`, ou com a organização sem endereço ativo, **tudo cai no
caminho de hoje** (é o que deixa cada PR subir desligado).

Peça nova em `server/services/urls.ts` (e a regra pura em `shared/subdominio.ts`):

```
enderecoDaOrganizacao(org)           → "https://<rotulo>.<base>" | null
urlDaOrganizacao(org, caminho)       → endereço + caminho, senão publicUrl(`/o/${slug}${caminho}`)
urlDaRifa(org, rifaSlug, {ref, utm}) → `${endereco}/r/${rifa}${query}`, senão o de hoje
```

O esquema e a porta vêm de `PUBLIC_BASE_URL` fora de produção (para a prova e
para o `*.localhost:5000`); em produção é sempre `https:` sem porta
(`linkDaRifaNoEndereco` hoje fixa `https://`, vai a parâmetro).

| Onde | Hoje | Passa a ser | PR |
|---|---|---|---|
| `publicUrl()` / `PUBLIC_BASE_URL` (`server/services/urls.ts:4`) | domínio principal | **continua** para tudo que é da plataforma: Google (`google.ts:42`, o retorno é um só), VAPID, chamados, bônus `/?ind=`, recibo (`urlDeConferencia`), bilhete | — |
| `baseDoSite(req)` (`urls.ts:15`; `admin.ts:1118/1132/1145/1156`, `affiliate.ts:205/276/378`, `trafego.ts:719`) | `Host` da requisição do painel | o endereço vem da **organização da rifa** (do banco), nunca da requisição; o painel está no principal, então `Host` ali não serve | 4 |
| QR e link das artes (`artes.ts`, `artesRotas.ts`, `GET /campaigns/:id/artes*`, `…/editor`, pacote ZIP) | `${base}/r/${slug}` e `/c/<código>` do principal | `urlDaRifa(org, slug)` e o curto no endereço (`${endereco}/c/<código>`). A arte é guardada 60 s **por link** (a chave já inclui o link), então a troca entra sozinha | 4 |
| Kit do afiliado (`affiliate.ts:209`, `:276`, `textosDoKit()` em `shared/afiliados.ts:156`, artes do afiliado `/artes/:slug*`, editor) | `${base}/r/${slug}?ref=${código}` | `urlDaRifa(org, slug, { ref: código })` (é o `linkDaRifaNoEndereco` que já existe). O `?ref=` continua sendo a atribuição; o código do afiliado sai **da sessão do afiliado**, não da URL. O `track-click` grava o código na sessão **do endereço** (7.4) | 4 |
| Links curtos `/c/…` (`links.ts`, `LinksCurtos.tsx:30`) | `window.location.origin` + caminho | o servidor devolve a URL absoluta (endereço da organização); o cliente deixa de montar | 4 |
| QR do perfil (`public.ts:841`, `publicUrl("/o/…")`) | principal | endereço da organização | 4 |
| WhatsApp e push com link de rifa: `pagamento_confirmado`, `reserva_expirando` (`orders.ts:1506`, `jobs/index.ts:141`), `sortear.ts:311`, `shared/push.ts` (`url: /o/<org>/r/<rifa>`), `comentarios.ts:343`, `mensagens.ts:701`, `bannerPago.ts:418`, `buscar.ts:165` | `publicUrl("/pedido/…")`, `/r/…` ou caminho relativo | **pedido, rifa e sorteio** (da rifa) → endereço da organização; **conta, chamado, bônus, verificação** → principal. O link entra como variável do corpo do modelo (`templates.ts`: `{{5}}`), não é botão de URL fixa, então o host pode variar (suposição 3). O caminho relativo do push continua relativo (7.5) | 4 |
| Compartilhar (`Publicacao.tsx:435`, `PerfilDoUsuario.tsx:119`, `Perfil.tsx:157`, `Comentarios.tsx:432` presente `?ind=`) | `window.location.origin` + caminho | no endereço: o `origin` já é o dele; no principal: `urlCompartilhavel(org, caminho)` (o servidor manda o endereço da organização em `perfil`/`rifa`) | 4 |
| Tráfego pago (`linkDoAnuncio()` em `shared/trafego.ts:364`; `trafegoCriacao.ts:537`, `baseDoAnuncio()` em `urls.ts:28`, `basePublicaDoAnuncio()`) | `${PUBLIC_BASE_URL}/o/<org>/r/<rifa>?utm…` | `${endereco}/r/<rifa>?utm…`. **É a página de destino da promotora** que o Google/Meta e o advogado pedem (Q4/R12). Sem endereço ativo com a base ligada: a criação no Meta responde 409 com o motivo (pergunta 7); com a base desligada, o link de hoje. As UTMs e a atribuição (`orders.utm.campaign = trafego-<código>`) não mudam | 4 |
| Marketing por servidor (`marketing.ts:228/241`, `urlDaRifa` no evento de compra) | `PUBLIC_BASE_URL/r/…` | `urlDaRifa(org, slug)` (o `event_source_url` bate com a página onde o pixel disparou) | 4 |
| Banners, stories, mídia (`/uploads`, R2) | relativo ou R2 | **sem mudança**: `/uploads` responde também no endereço; o R2 é outro domínio e já está no CSP | — |
| `images.ts` (`srcSet` com `publicUrl`) | URL absoluta do principal | continua válido (imagem pública do principal, CSP `img-src https:`). Se algum dia a imagem for relativa, `media-src 'self'` do vídeo também funciona no endereço | — |
| Sitemap, `canonical`, Open Graph | não existe | capítulo 4 | 6 |
| E-mail | o sistema **não envia e-mail** hoje (WhatsApp e push) | — | — |
| Demonstração (`admin.ts:2714/2731`, `demonstracao.ts:106`) | `PUBLIC_BASE_URL` | principal (a demonstração não vende e não tem anúncio) | — |
| Webhooks, login do painel, API, bilhete, recibo | principal | **principal** (nunca no endereço) | — |

Rastreabilidade: um teste varre `server/` e `client/src/` procurando `publicUrl(`,
`baseDoSite(`, `baseDoAnuncio(`, `window.location.origin` e `PUBLIC_BASE_URL` e
compara com uma lista aprovada no próprio teste — chamada nova de montar URL
absoluta é decidida (endereço ou principal), não esquecida.

---

## 6. Segurança, ponto a ponto

### 6.1 Sessão e cookie

- `rifa.sid` fica **sem `Domain`** (`server/auth.ts:156`, `httpOnly`, `sameSite:
  lax`, `secure` em produção): cada endereço tem a sessão **dele**. Nenhum cookie
  no domínio base. Isto é uma decisão do responsável e é o que impede o
  endereço de uma organização de ler ou receber a sessão do painel.
- **Nome `__Host-rifa.sid` em produção.** O prefixo `__Host-` obriga `Secure`,
  `Path=/` e **proíbe `Domain`**; e um irmão (`outra.loteriasdobem.com.br`) não
  consegue gravar um cookie com esse nome por cima (o navegador recusa o
  `Domain=.loteriasdobem.com.br` com prefixo `__Host-`). Fecha o *cookie
  tossing* (fixar ou estragar a sessão de outro host da mesma família). Custo:
  **todo mundo sai da conta uma vez** no deploy (avisar antes) e o nome muda em
  `shared/legal.ts:48` (a lista do que o site guarda) e em `tests/legal.test.ts`.
  Em desenvolvimento (http) o nome segue `rifa.sid`.
- Sessão nova a cada entrada (já existe) tira a fixação por cookie plantado.
- O `connect-pg-simple` guarda a sessão de cada host numa linha; "senha nova
  derruba as outras sessões" (`encerrarOutrasSessoes`) trabalha por conta, então
  **derruba a sessão em todos os endereços**. Provar no `npm run subdominio`.

### 6.2 CSRF e `Origin` por host

O projeto não tem token CSRF: contava com `SameSite=Lax` (só POST da mesma
*site*). **`SameSite` não separa subdomínios**: `a.loteriasdobem.com.br` e
`b.…` e o principal são o **mesmo site**, e `express.urlencoded` aceita `POST`
de formulário. Uma página de um endereço poderia, em teoria, enviar um
formulário ao principal com o cookie do principal. Controle:

- **Middleware `exigirOrigemDoHost`** em `/api` para `POST/PUT/PATCH/DELETE`
  (fora de `/api/webhooks` e do relatório de CSP): se há `Origin`, ele tem de ser
  `https://<o mesmo Host>`; se não há `Origin`, mas há `Sec-Fetch-Site`, ele tem
  de ser `same-origin` ou `none`; sem nenhum dos dois (curl, prova, servidor a
  servidor), passa. Qualquer divergência → 403 "Origem não permitida.".
- Entra primeiro em **modo relatório** (log `[origem]` agrupado, como o `[csp]`),
  e passa a recusar quando o log ficar limpo — o app dentro da WebView do Android
  (`rifa-pos-shim`) e as sessões do POS entram na observação.
- **CORS:** o projeto não tem CORS e continua sem. Nada no plano faz o endereço
  chamar a API do principal por `fetch` (as trocas de host são navegação, 7.2).

### 6.3 CSP, HSTS, quadros

- **CSP** (`shared/csp.ts`): todas as fontes são `'self'` ou origens externas
  fixas, então o endereço funciona sem mudança (`connect-src 'self'` é do host
  que serviu a página). Nada de curinga do domínio base: `*.loteriasdobem.com.br`
  **não** entra em nenhuma diretiva (liberaria um endereço a carregar do outro).
  O relatório (`/api/csp-relatorio`) passa a registrar o **host** (a classe:
  principal ou endereço, não o rótulo) para o log distinguir. O hash do script do
  tema não muda (4). A CSP segue em modo relatório e ganha um item na lista de
  "passar a valer": ver o log também dos endereços.
- **HSTS** (`server/index.ts:59`): continua `max-age=15552000` **sem
  `includeSubDomains`** e sem `preload`. O cabeçalho é global, então cada host
  que responder (principal ou endereço) recebe o seu — HSTS vale por host. O
  comentário atual ("outro subdomínio do domínio não é deste sistema") muda: agora
  os subdomínios *são* deste sistema, e `includeSubDomains` fica de fora porque o
  curinga pode ser desfeito e porque o `preload` é um compromisso que o plano não
  assume. A primeira visita em `http://` precisa do redirecionamento de borda
  (Railway ou Cloudflare "Always HTTPS").
- **`X-Frame-Options: SAMEORIGIN` e `frame-ancestors 'self'`** ficam: o iframe da
  pré-visualização do construtor de templates é o domínio principal em si mesmo.
  O endereço nunca é emoldurado por outro (nem pelo principal).
- **`Referrer-Policy: strict-origin-when-cross-origin`** fica. Navegar do endereço
  para o principal (login do painel, vitrine) leva a *origem*, não o caminho com
  código de pedido.

### 6.4 O `Host` forjado, o `X-Forwarded-Host` e os outros hosts

- Só `Host` (1.3). `X-Forwarded-Host` é ignorado mesmo com `trust proxy`.
- Host com `@`, espaço, `/`, `\`, `%`, controle, duplicado, vazio, IPv6 literal:
  400 antes de qualquer consulta.
- `*.up.railway.app` (o domínio gerado pela Railway) e qualquer outro host que
  chegue ao serviço: **segue como hoje** (a verificação de saúde da Railway usa
  um `Host` próprio), com `X-Robots-Tag: noindex` e sem endereço de organização.
  Não redirecionar tudo ao principal: quebraria a verificação de saúde.
- **Cache de borda:** o `index.html` e as respostas da API não devem ser guardados
  por CDN que ignore `Host`. Se um dia houver CDN na frente, a chave do cache
  inclui o `Host`; as respostas de `GET /api/public/endereco` levam `Cache-Control:
  no-store` e `Vary: Host`.

### 6.5 Limites e abuso

- Limite por IP em rótulo inexistente (1.3) e no novo `GET /api/public/endereco`.
- Rótulo **ativo mas sem tráfego** não custa nada: não há provisionamento por
  rótulo (o curinga é um registro).
- Certificado: o curinga cobre **um nível** (`<rotulo>.base`); `a.b.base` não
  tem certificado e `identificarHost()` já recusa mais de um nível.

---

## 7. O apostador ao trocar de endereço (login por endereço)

Cada endereço é uma **origem** diferente para o navegador. Tudo o que o navegador
guarda por origem (cookie, `localStorage`, `sessionStorage`, IndexedDB, service
worker, inscrição de push, permissão de notificação, instalação do app) começa
**vazio** no endereço novo. Isto é consequência da decisão "cookie sem `Domain`",
e o plano a assume, não a contorna.

### 7.1 Entrar de novo

Quem tem conta no principal precisa entrar de novo no endereço de cada
organização em que quiser comprar com a conta: `/entrar` no endereço faz o login
do **apostador** (senha, ou o código do WhatsApp) e abre a sessão **daquele
host**. O login do painel (`/api/auth/login`) **não** existe no endereço (404): o
organizador entra pelo principal. A tela de entrar no endereço mostra, em texto,
que "este endereço é da organização X; a conta é a mesma da plataforma".
Comprar **sem conta** (código no WhatsApp) já era o caminho comum e funciona igual.

### 7.2 Entrar com o Google

O Google exige a *redirect URI* exata e registrada: o retorno é **um só**
(`urlDeRetorno()`, `google.ts:42`, domínio principal) e o `state/nonce/PKCE` ficam
em `req.session.google` — a sessão **do host que começou**. Começar no endereço e
voltar no principal perde a sessão. **No lançamento o botão "Entrar com o Google"
não aparece no endereço** (`GET /conta/google/disponivel` responde `false` lá) e a
tela diz "entre pelo site principal ou use a senha". A entrega correta
(*hand-off*) é um PR de depois: o principal conclui o login, grava um código de
uso único no banco (hash, 60 s, preso ao `state` e ao host de destino) e
redireciona para o endereço, que o troca por sessão própria. Sem `fetch` entre
hosts e sem CORS (pergunta 6).

### 7.3 Carrinho (`rifa.carrinho`)

O carrinho é do aparelho **por origem** (`localStorage`). Efeito: o carrinho do
principal (várias rifas de várias organizações, um Pix só com split) **não existe**
no endereço, e o do endereço **só tem rifa daquela organização** (o endereço só
mostra o "+" dela e a API recusa rifa de outra, 1.5).

- Não perde dinheiro nem estoque: o carrinho é lista de desejo, **não reserva**
  (`CLAUDE.md`, "Carrinho e comprar"); "perder só esvazia".
- O Pix único de várias organizações **continua existindo só no principal**. No
  endereço, o carrinho é de uma organização (um pedido, um Pix, o split dela).
- Saída pequena no lançamento: no endereço, "Ver o carrinho completo no site
  principal" (link) e a explicação em uma linha. Saída futura (se medir dor): um
  *hand-off* do carrinho por URL (`#`) que o principal lê uma vez; **não** por
  cookie no domínio base.

### 7.4 O que mais é "por origem" e o que fazer

| Item | Efeito no endereço | Decisão |
|---|---|---|
| `rifa.device` (identificador do aparelho para o antifraude) | outro valor por endereço | aceito: o identificador **já vem do cliente** e o limite que segura é o de IP e telefone (`docs/SEGURANCA.md`); a contagem de visita/clique "uma vez por aparelho" pode contar o mesmo humano em dois endereços |
| Código de indicação `rifa.indicacao` e atribuição de afiliado (`?ref=` na sessão) | vale **no host onde o link caiu** | o kit do afiliado emite o link **no endereço da organização**, então o `?ref=` cai no host onde a compra acontece. Quem chega por `?ref=` no endereço e vai ao principal perde a atribuição, igual a trocar de navegador hoje |
| Região (`rifa.regiao`), tema (`rifa.tema`), preferências de tela | começam vazias | tema: `prefers-color-scheme` cobre o automático; região não é usada no endereço (só o perfil da organização) |
| Aviso e escolha de cookies (`rifa.cookies`) | **o aviso aparece de novo** em cada endereço | correto: cada organização tem os pixels dela e o consentimento é por página (5) |
| Intro da marca (`rifa.intro`), faixa "Baixe o app" (`rifa.instalar.fechado`) | repetem | no endereço **não** mostrar a intro nem a faixa (7.7) |
| "Minhas compras" no endereço | só as compras daquela organização, com "Ver tudo no site principal" | white label sem mostrar à organização A que a pessoa comprou na B |
| Sessão do painel | inexistente | por desenho |

### 7.5 Service worker e push

- `client/public/sw.js` registra com escopo da origem (`register("/sw.js")`,
  `client/src/lib/pwa.ts:39`): **cada endereço baixa o seu e tem o cache dele**
  (`VERSAO` por origem). O mesmo arquivo serve a todos; trocar `VERSAO` continua
  valendo para todos ao mesmo tempo. A casca (`/`) guardada no endereço é o
  mesmo `index.html` (o dado do endereço vem da API, não do HTML guardado — por
  isso o `<meta>` do capítulo 4 vem com `no-cache` para navegação). `/api/` e
  `/uploads/` seguem sem cache.
- Primeira visita a cada endereço baixa o pacote inteiro (cache por origem). A
  borda deve guardar `/assets/*` (nome com hash, imutável).
- **Push é por origem**: a inscrição feita no principal não é do endereço, e a
  permissão é pedida de novo ("só depois de um toque", regra atual). O servidor já
  entrega por inscrição (`push_subscriptions` por comprador), então quem se
  inscreveu nos dois recebe nos dois. O `url` da notificação é caminho relativo
  (`shared/push.ts`; `sw.js` abre `new URL(url, self.location.origin)`), então o
  clique abre **no host da inscrição**: no endereço, `/o/<outra>/r/<rifa>` cai no
  guarda, que responde **302 ao principal** (1.1) — por isso não é preciso
  mudar o `sw.js` no lançamento. Se o produto quiser abrir direto no endereço da
  organização, o payload passa a ter URL absoluta e o `sw.js` a aceitar `https:`
  da própria base (`VERSAO` sobe).
- `VAPID_SUBJECT` fica no principal.

### 7.6 PWA e manifesto por host

`GET /manifest.webmanifest` (`server/index.ts:90`, `manifestDaPlataforma()`) é
igual para todos os hosts e `start_url`/`scope`/`id` são relativos (`/`), então
**instalar a partir do endereço instala um app separado, aberto no perfil da
organização, com o nome e o ícone da plataforma**. No lançamento: a faixa "Baixe o
app" fica escondida no endereço e o manifesto não muda (o navegador ainda pode
oferecer instalar pelo menu; é aceito). Fase seguinte (pergunta 9): `manifestParaHost(host)` com
`name`/`short_name` da organização, `theme_color` da cor de destaque (validada) e
ícones da foto da organização (precisa de PNG 192/512 e de uma versão
*maskable*, ver `docs/marca/`). iOS só recebe push de app instalado, então o push
no endereço no iPhone depende dessa fase.

### 7.7 O que o endereço não mostra

A intro da marca (`client/src/lib/intro.ts`, `deveMostrarIntro()`), o aviso de
instalar o app e os atalhos globais (Reels, Buscar, Mensagens) ficam de fora no
endereço. Se a marca da plataforma some do topo e do rodapé (white label total) é
a pergunta 2; o plano propõe **manter a identificação da plataforma** (logo
pequena no topo, rodapé com os dados da empresa, termos e privacidade): o
Decreto 7.962/2013 pede a identificação do fornecedor e a pergunta R31 trata de
quem é.

---

## 8. Pixels e consentimento por organização no endereço

- **A organização do endereço é conhecida antes de a página desenhar**
  (`/api/public/endereco`), então `definirOrganizacaoDaPagina(slug)`
  (`client/src/lib/marketing.ts:133`) é chamado na raiz do endereço, não só em
  `Perfil`/`Rifa`/`Pedido`. Cada página do endereço tem os pixels **da
  organização** (e os da plataforma), e nenhum outro: a regra "cada evento só vai
  para os pixels da página" (`trackSingle`, `send_to`, `ttq.instance`) deixa de
  ser sobre navegação dentro de uma SPA e passa a ser também sobre **origem**.
- **Consentimento por origem** (`rifa.cookies` no `localStorage` do endereço):
  aviso novo em cada endereço. É o comportamento certo — a organização é a
  controladora daquela página — e `TEXTO_DO_AVISO_DE_COOKIES` (versão 2) já diz
  "controladores conjuntos". Recusar apaga os cookies de medição e recarrega, como hoje.
- **Achado que precisa de decisão — cookies de pixel no domínio base.** Os pixels
  gravam seus cookies no domínio **registrável** (`_fbp`, `_ga`, `_gcl_au`, `_ttp`
  com `Domain=.loteriasdobem.com.br`). Como as organizações são irmãs sob o mesmo
  domínio, **o mesmo `_fbp`/`_ga` apareceria para os pixels de organizações
  diferentes** (e para o da plataforma), ligando o visitante entre promotoras — e
  ferindo a decisão "nenhum cookie no domínio base" (que valia para os **nossos**
  cookies, mas o usuário vai ver o cookie de terceiro no domínio base). Opções:
  1. **GA4/Google Ads:** `cookie_domain` = o host da página (`gtag('config', id, {
     cookie_domain: location.hostname })`) — suportado;
  2. **Meta e TikTok:** não há parâmetro documentado de domínio do cookie que eu
     tenha confirmado (suposição 5); conferir na documentação de cada um antes do PR 5;
  3. **Lista de Sufixos Públicos (PSL):** inscrever `loteriasdobem.com.br` como
     sufixo faz cada `<rotulo>.loteriasdobem.com.br` ser um *site* próprio para o
     navegador — o pixel passa a gravar no host, o `SameSite` passa a separar
     as organizações (fecha também o CSRF entre irmãs) e o cookie tossing deixa de
     existir. Custo: pedido ao mantenedor da lista, propagação lenta, compromisso
     de manter o domínio. É a solução de fundo (pergunta 12) e **não bloqueia o
     lançamento**.
  Até lá: o texto da Privacidade (`GUARDADO_NO_NAVEGADOR`) diz o que é verdade; a
  pergunta R32 vai ao advogado.
- **Compra pelo servidor:** `enfileirarCompra` e o `event_source_url` usam o
  endereço da rifa (capítulo 5); o `event_id` (`compra-<código>`) não muda. Os
  UTMs chegam por `orders.utm`, que já é por pedido.
- `GUARDADO_NO_NAVEGADOR` (`shared/legal.ts:44`) e `tests/legal.test.ts` ganham
  a explicação de que o navegador guarda por endereço. A SPA não grava chave nova
  por causa do endereço.

---

## 9. `trust proxy`, Cloudflare e o limite por IP

Hoje: `app.set("trust proxy", 1)` (`server/auth.ts:143`) — um salto, a borda da
Railway. `req.ip` alimenta `identify()` (`ipHash`, `antifraude.ts:92`) e, por
ele, o limite de pedidos por IP (60 em 10 min), o código OTP, o clique
patrocinado (3 por IP), o relatório de CSP, a Buscar e o cadastro.

**Sem Cloudflare (o lançamento), nada muda**: o DNS aponta o curinga para a
Railway, `trust proxy` fica em 1, e `Host`/`X-Forwarded-For` chegam como hoje.

**Com Cloudflare na frente (opcional, depois):** a cadeia vira
cliente → Cloudflare → borda da Railway → app. Com `trust proxy 1`, `req.ip` passa a
ser o IP **da Cloudflare**: milhares de apostadores dividem poucos IPs, o limite de
60 em 10 min bloqueia todo mundo, e o clique patrocinado (3 por IP) para de
cobrar. Passar para `2` conserta o caso comum **e abre um buraco**: o domínio
`*.up.railway.app` continua alcançável sem a Cloudflare, e ali o cliente escolhe
o `X-Forwarded-For` e fixa o IP que quiser.

Desenho que não quebra o limite e não depende do número de saltos:

1. A Cloudflare acrescenta, por **regra de transformação**, um cabeçalho com um
   segredo (`X-Origem-Cloudflare: <segredo>`); o segredo é variável do servidor
   (`CLOUDFLARE_ORIGEM_SEGREDO`), nunca em log, resposta ou URL.
2. Middleware `ipViaCloudflare`, **antes** de tudo que lê `req.ip`: se o segredo
   do cabeçalho confere (`timingSafeEqual`) **e** `CF-Connecting-IP` é um IP
   válido (`net.isIP`), reescreve `req.headers["x-forwarded-for"]` para esse IP;
   senão, não mexe. `trust proxy` **fica em 1**, e `req.ip` (que o Express
   calcula a cada leitura a partir do cabeçalho) passa a ser o IP real. Nenhum
   `req.ip` do código precisa mudar.
3. A prova (`npm run subdominio`) cobre: sem segredo, o `CF-Connecting-IP` forjado é
   ignorado; com segredo certo vale; segredo errado vale como se não houvesse.
4. Ligação: o segredo e a regra primeiro em um serviço de teste; **só então** o DNS
   passa a apontar pela Cloudflare. Aviso ao responsável: **desligar o domínio
   `*.up.railway.app`** (ou aceitar que, ali, o IP é o da borda da Railway).
5. Certificado: o Universal SSL da Cloudflare cobre `*.loteriasdobem.com.br` (um
   nível), compatível com o desenho (suposição 6). `index.html` não pode ficar em
   cache de borda com "Cache Everything".

---

## 10. Provas

### 10.1 `npm run subdominio` (`scripts/subdominio-test.ts`, contra a API de verdade)

O servidor sobe com `SUBDOMINIO_BASE` (no CI, `rifas.localhost.test`; a prova
define o `Host` à mão com `node:http`, que deixa escolher o cabeçalho — `fetch`
não deixa). Cria duas organizações com endereço ativo e uma rifa publicada cada,
uma arquivada, uma banida, uma suspensa, uma com endereço desligado, e apaga o
que criou no fim.

| Grupo | Casos |
|---|---|
| `Host` forjado | rótulo de outra organização com cookie da organização A; `X-Forwarded-Host` ignorado; `Host` duplicado; `Host` com `@`, espaço, `%00`, `\`; `Host` vazio; IPv6 literal |
| Forma do `Host` | maiúscula (`ORG.BASE`); porta `:443` e `:80` aceitas, `:8443` recusada em produção e aceita em desenvolvimento; ponto final (`org.base.`); `punycode` (`xn--abc.base`) e `a--b.base` → 404; dois níveis (`x.org.base`) → sem certificado e 404; IDN em Unicode no `Host` → 400 |
| Destino | principal, `www` (301/308 com caminho e consulta), raiz, `af-<código>` (404 no lançamento), reservado, inexistente (**status 404**, não 200) |
| Situação da organização | arquivada, banida, desligada: 404 no endereço e perfil no principal; suspensa: a regra decidida (pergunta 5) |
| Escopo | `GET /api/public/campaigns/<rifa da B>` no endereço da A → 404; `/api/public/o/<B>` → 404; `/api/public/feed` e outras `so-principal` → 404; `POST /orders` e `/carrinho` com rifa da B → 404 |
| Painel e webhook | `/api/admin/*`, `/api/affiliate/*`, `/api/seller/*`, `/api/ia/*`, `/api/auth/login`, `/api/webhooks/*`, `/api/dev/*` no endereço → 404, **também com a sessão do principal enviada à mão** |
| Caminhos | `/o/<A>` e `/o/<A>/r/<x>` no endereço A → 301 para `/` e `/r/<x>`; `/o/<B>`, `/reels`, `/buscar` → 302 para o principal; `/c/<código da B>` no A → 302 principal |
| Sessão | login do apostador no endereço cria cookie **só** daquele host (`Set-Cookie` sem `Domain`); senha trocada derruba a sessão nos dois hosts; `__Host-` em produção |
| `Origin` | `POST` com `Origin` de irmão → 403; `Sec-Fetch-Site: same-site` → 403; sem cabeçalhos (prova) → passa; webhook sem `Origin` → passa |
| Links | `artes` (QR e curto), kit do afiliado, tráfego (`linkDoAnuncio`), notificação, curto `/c/` saem no endereço quando ativo e **no principal** quando desligado |
| Cache | rótulo desligado volta a 404 em até 15 s; `Cache-Control: no-store` e `Vary: Host` no `/api/public/endereco` |
| IP | com e sem o segredo da Cloudflare (9) |

### 10.2 `tests/subdominio.test.ts` (vitest, sem banco)

- `identificarHost`: tudo da tabela de formas acima, em parâmetros; ida e volta
  `caminhoLogico`/`caminhoReal`; `rotaNoEndereco` cobre cada `<Route>` de
  `App.tsx` e cada rota de `publicRouter` (lê os arquivos, como `tests/versoes.test.ts`);
  `problemaNoRotulo` com `--`, `xn-`, marca e reservado; `linkDaRifaNoEndereco` com
  esquema/porta de desenvolvimento.
- Varredura de URL absoluta (capítulo 5): lista aprovada de chamadas a
  `publicUrl(`/`baseDoSite(`/`baseDoAnuncio(`.
- `hostDaRequisicao`, `ipViaCloudflare`, `exigirOrigemDoHost` com `req` de mentira.
- `tests/legal.test.ts`: a tabela do navegador acompanha o nome do cookie e a
  explicação "por endereço".

### 10.3 `npm run isolation` — entradas novas

A rota nova de painel é **uma**: `PUT /organizacoes/:id/endereco` (ligar/desligar
o endereço). Entradas: organizador → **403** (só a plataforma liga); a plataforma
liga organização arquivada → 409; id fora do formato → 404; `GET
/organizacoes/:id/endereco` (a situação) do vizinho → **404**. E, na outra
direção: o organizador A, com **sessão do principal**, pedindo `Host:
<A>.base` a `/api/admin/*` → 404, e `Host: <B>.base` a `/api/public/o/<A>` → 404.
`GET /api/public/endereco` é pública e não leva dado de ninguém.

### 10.4 `npm run telas`

O script ganha uma rodada com `SUBDOMINIO_BASE=localhost` e `Host:
<rotulo>.localhost:<porta>` (o Chromium resolve `*.localhost` para a máquina), nos
três tamanhos, sobre `/`, `/r/<rifa>`, `/entrar`, `/carrinho` e o 404 do endereço.
Tela mudada entra em `docs/VERSOES.md` (**checar o contador de "aguardando
leva" antes**: com 10 linhas, o PR seguinte é a leva).

---

## 11. Divisão em PRs

Cada PR é pequeno, tem prova própria e **sobe com `SUBDOMINIO_BASE` desligada**
(variável ausente → todo código novo é inerte), exceto onde indicado. O que muda
sem a variável está marcado.

| # | PR | Conteúdo | Sem `SUBDOMINIO_BASE` | Risco |
|---|---|---|---|---|
| 0 | **Este plano** + R30 a R35 + seção em `PENDENCIAS.md` | documentos | — | nenhum |
| 1 | **Endurecimento que independe do domínio** — *feito (b, c, d, e) em 18/10/2026; (a) aguarda o OK da pergunta 11* | (a) `__Host-rifa.sid` em produção; (b) `exigirOrigemDoHost` em modo relatório; (c) `shared/subdominio.ts` corrigido (`--`, ponto final, porta, marcas) + testes; (d) `www` → principal; (e) `X-Robots-Tag` para host desconhecido | **age** (a, b, d, e). (a) desloga todos uma vez; (b) só registra; (d) é o único efeito visível | **médio** pelo (a): avisar antes e fazer em horário calmo. (b) em relatório não derruba nada |
| 2 | **Guarda do endereço no servidor** — *feito em 18/10/2026 (a rota do interruptor é `PUT /organizacoes/:id/subdominio`, porque `/endereco` já é o CEP; os curtos de outra organização ficaram para o PR 4)* | `guardaDoEndereco`, `hostDaRequisicao`, cache, `GET /api/public/endereco`, classificador de rotas (+ teste de cobertura), 404 com status, canonicalização `/o/<rótulo>`, redirecionamentos ao principal, bloqueio de painel/webhook no endereço; coluna `organizations.endereco_ativo` e a rota `PUT /organizacoes/:id/endereco` (com a auditoria); `npm run subdominio` (servidor) e entradas do `isolation` | **inerte** (sem base, nenhum host é endereço; a coluna fica sem uso) | **médio**: é um middleware global; o teste de cobertura e a prova seguram. `db:push` **antes** do código |
| 3 | **SPA: roteador por endereço** — *feito em 18/10/2026 (junto da leva 21; ver 14.1)* | `RoteadorPorEndereco`, `useEndereco`, `useLocationDoEndereco`, console filtrado, botão do Google, intro e faixa de instalar escondidos no endereço, carrinho e "Minhas compras" do endereço; `npm run telas` com a rodada `*.localhost`; registro em `VERSOES.md` | **inerte** (`/api/public/endereco` responde `principal`) | **médio**: mexe na navegação, mas só troca o `Router` quando é endereço |
| 4 | **URLs absolutas** — *feito em 18/10/2026 (menos o compartilhar do navegador, os avisos de pedido e o 409 do Meta sem endereço; ver `PENDENCIAS.md`)* | `urls.ts` (os três auxiliares), artes, kit do afiliado, curtos, QR do perfil, WhatsApp, push, compartilhar, marketing por servidor, **tráfego (`linkDoAnuncio`)** + varredura de URL no teste | **inerte** (cai no caminho de hoje) | **médio-alto** pela atribuição: o tráfego e o `?ref=` mudam de host. Provar com `npm run trafego-criacao`, `npm run afiliados`, `npm run artes`, `npm run marketing`, `npm run perfil` |
| 5 | **Pixels, cookies e Privacidade** | organização do endereço na raiz, `cookie_domain` (GA4/Ads), texto da Privacidade e `GUARDADO_NO_NAVEGADOR`, relatório de CSP com o host | **inerte** | baixo |
| 6 | **SEO** | marcador no `index.html` (canonical, Open Graph, robots), `robots.txt` e `sitemap.xml` por host, `noindex` nas áreas de conta | o marcador age (canonical do principal para ele mesmo, `og:*` novos); sem endereço, nada de sitemap de organização | baixo-médio (muda o HTML servido; o hash da CSP não muda, conferir) |
| 7 | **Ligar** | `SUBDOMINIO_BASE=loteriasdobem.com.br`, curinga no Railway, auditoria dos slugs, ligar **uma** organização de teste, depois as demais; CI com a variável; `.env.example`; `docs/ORDEM-DE-LANCAMENTO.md`; skill `provar` | liga | **alto até a prova em produção**: reversível desligando a variável ou o interruptor por organização |
| 8 | **Depois do lançamento** | Cloudflare (`ipViaCloudflare`), PSL, *hand-off* do login do Google, manifesto/PWA por endereço, endereço de afiliado (`af-`), domínio próprio da promotora, prazo de rótulo antigo (se houver renomeação) | — | cada um tem plano próprio |

Ordem: 1 e 2 podem andar em paralelo (1 não depende do endereço); 3 depende de
2; 4 depende de 2 (a coluna e os auxiliares); 5 e 6 dependem de 3; 7 por último.

### Dependências fora do código (o responsável)

- Cadastrar o curinga `*.loteriasdobem.com.br` no Railway (e o certificado, que a
  Railway emite quando o curinga é verificado — suposição 7).
- Escolher o domínio principal canônico (raiz ou `www`) e confirmar `PUBLIC_BASE_URL`.
- Registrar a URL de retorno do Google (continua a do principal) e, se for ao ar
  com a Cloudflare, o segredo de origem.
- Decidir a lista de reservados/marcas e as perguntas abaixo.

### Pendências a abrir em `docs/PENDENCIAS.md` (seção "Subdomínio do organizador")

- [ ] **[decisão]** perguntas 1 a 12 (abaixo).
- [ ] **[advogado]** R30 a R35.
- [ ] **[código]** PR 1 a PR 7 (acima).
- [ ] **[você]** curinga no Railway, domínio principal canônico, lista de marcas.
- [ ] **[código, depois]** Cloudflare, PSL, Google por *hand-off*, PWA por endereço, `af-`.

---

## 12. Perguntas ao responsável (lista curta)

1. **Rótulo:** reaproveitar o slug (imutável) com o interruptor por organização
   (**recomendado**), ou criar coluna própria com histórico para poder renomear
   o endereço (capítulo 2.2)? E, se renomear, por quanto tempo o rótulo antigo
   redireciona — sem prazo (recomendado) ou N dias?
2. **Marca no endereço:** manter a identificação da plataforma (logo pequena,
   rodapé com os dados da empresa e termos — **recomendado**) ou esconder a marca
   (white label total)? Esconder Reels, Buscar e Mensagens do console no endereço
   (recomendado)?
3. **Páginas globais no endereço** (vitrine, estados, Reels, Buscar, perfis de
   apostador, mensagens): redirecionar ao domínio principal (**recomendado**) ou
   404?
4. **Domínio principal canônico:** a raiz ou o `www`? O outro vira 301.
5. **Organização suspensa:** o endereço segue no ar, como o perfil hoje
   (**recomendado**, é o que o código faz), ou passa a 404 como o pedido sugeria?
6. **Entrar com o Google no endereço:** fora do lançamento, com o botão
   escondido (**recomendado**), ou fazer o *hand-off* antes de ligar?
7. **Anúncio (tráfego pago):** com a base ligada e a organização **sem** endereço
   ativo, bloquear a criação no Meta (409 — **recomendado**, é o destino da
   promotora) ou cair no link do principal?
8. **Indexação:** queremos os endereços no Google (sitemap, canonical)? E o
   principal deixa de listar `/o/<slug>` quando há endereço?
9. **PWA no endereço:** esconder a faixa de instalar no lançamento
   (**recomendado**) ou já fazer o manifesto e os ícones da organização?
10. **Lista de reservados e marcas** do capítulo 3: aprovar, cortar ou acrescentar.
11. **Cookie `__Host-`:** aceita que todos saiam da conta uma vez no PR 1? (Marcar
    o dia.)
12. **PSL e Cloudflare:** inscrever `loteriasdobem.com.br` na Lista de Sufixos
    Públicos (compromisso de manter o domínio; recomendado depois do lançamento)
    e/ou pôr a Cloudflare na frente (depois, com o segredo de origem).

---

## 13. Perguntas ao advogado (nova rodada: R30 a R35)

Vão em `docs/PERGUNTAS-AO-ADVOGADO.md`, "Quinta rodada". Resumo:

- **R30 [1]** Subdomínio da plataforma conta como "página de destino da
  promotora" (Q4, R12)?
- **R31 [2]** Identificação do fornecedor na página do endereço (Decreto
  7.962/2013, art. 2º): da promotora, da plataforma ou das duas?
- **R32 [2]** Cookies de pixel gravados no domínio comum entre organizações:
  controladoria, aviso e consentimento por organização.
- **R33 [3]** Cláusula para desligar ou trocar o endereço sem aviso por risco de
  phishing; rótulo parecido com marca ou órgão.
- **R34 [3]** Propriedade do endereço (da plataforma), rótulo que nunca volta, o
  que acontece com material impresso na rescisão ou no banimento.
- **R35 [3]** Endereço de afiliado depois (`af-<código>`): destino é da promotora,
  mas o endereço carrega o nome do afiliado.

---

## 14. Suposições não conferidas

1. **wouter 3.3.5:** `Router` aceita `hook` e `hrefs`, e o `hook` recebe o `navigate`
   com as opções de `replace`. **Conferida no PR 3** (`tests/enderecoRoteador.test.ts`
   monta o `Router` com o hook e lê o `href` dos `Link` e a rota casada): o hook
   devolve `[caminho, navegar]`, o `Link` usa `hrefs` e passa o caminho lógico ao
   `navegar`. Dois detalhes que mordem: o `Router` refaz o roteador quando o
   `hook` muda de referência (por isso `criarHookDoEndereco()` guarda um por
   endereço) e o `Link` com `~` ignora a base.
2. **`req.ip` é lido a cada acesso** a partir de `X-Forwarded-For` (getter do
   Express), e reescrever o cabeçalho antes dele funciona. Confirmar com a versão
   do Express instalada no PR 8.
3. **O link do WhatsApp é variável do corpo** (`{{5}}` em `templates.ts`), não
   botão de URL fixa, e a Meta não exige o mesmo domínio nos modelos *utility*.
   Conferir no gerenciador de modelos antes do PR 4.
4. **A Railway repassa o `Host` original** do curinga ao serviço (e a borda
   adiciona só um salto ao `X-Forwarded-For`). Conferir com um serviço de teste.
5. **Cookies dos pixels:** `cookie_domain` do `gtag` aceita o host da página;
   **não confirmei** parâmetro equivalente no Meta Pixel nem no TikTok Pixel. Conferir
   nas respectivas documentações antes do PR 5.
6. **Cloudflare:** o Universal SSL cobre `*.dominio` de um nível e registros
   curinga podem ser *proxied* no plano em uso. Conferir antes do PR 8.
7. **Railway:** domínio curinga (`*.dominio`) com certificado emitido pela própria
   Railway e verificação por registro DNS. Conferir na documentação e com o
   responsável antes do PR 7.
8. **Prefixo `__Host-`:** recusa `Domain` e o navegador não deixa um irmão gravar o
   mesmo nome com `Domain` (comportamento padrão dos navegadores); o
   `express-session` aceita o nome e `Path=/`/`Secure` já são o padrão. Provar no PR 1.
9. **Verificação de saúde da Railway** usa um `Host` fora da base e passa pelo
   guarda sem ser redirecionada. Conferir o `Host` real que ela envia.
10. **Número de rotas públicas (156)** e que `:slug` significa organização em
    `/o/:slug…` e rifa em `/campaigns/:slug…` (lido por busca no código; o PR 2 gera
    a lista inteira e o teste de cobertura a trava).
11. **Seções mencionadas e inexistentes:** "Subdomínio do organizador" em
    `PENDENCIAS.md` não está em `origin/main` (conferido).
