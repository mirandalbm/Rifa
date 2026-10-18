# Auditoria do acesso público (visitante sem login)

Primeiro acesso do item 14 de `docs/CHECKLIST-AJUSTES.md` (cronograma 5).
Data: 18/10/2026. Branch `claude/auditoria-publico`, a partir de `origin/main`
(13923e2). Registro de telas: linhas 205 a 208 de `docs/VERSOES.md` (todas `aguardando
leva`; o registro passou de 2 para 6 aguardando, abaixo do limite de 10).

**Resumo.** Um defeito grave de disponibilidade (um pedido anônimo derrubava o
servidor), seis de segurança e privacidade menores, e quatro de tela
(contraste no escuro, estados da rifa, tela do pedido e um botão pequeno). Os de
API e de contraste têm prova automática (`npm run publico`,
`tests/semNulo.test.ts`, `tests/tema.test.ts`); os de tela foram conferidos com
`npm run telas` e capturas. Resultado final de `npm run telas -- --papel
anonimo`, nos dois temas e nas três larguras: **0 reprovadas e 0 avisos**. O que
depende de decisão está na seção "Ficou aberto".

## O que foi conferido

**Rotas** (`/api/public/*`, `/c/`, `/l/`, `/uploads`, `/manifest.webmanifest`,
`/api/auth/login`, webhooks e a rota de relatório da CSP), por três caminhos:

1. Leitura de cada rota anônima de `server/routes/public.ts` (as que pedem
   sessão foram conferidas só pela resposta 401/404).
2. Sondagem contra a API de verdade com uma rifa em cada estado — no ar,
   rascunho, travada, demonstração, encerrada, sorteada — e as promotoras
   viva, arquivada e banida: 16 rotas por slug × 11 rifas, mais ~90
   entradas fora do formato (id que não é UUID, número que estoura o inteiro
   do banco, byte nulo, texto de 8 mil letras, parâmetro repetido, corpo JSON
   inválido, tipo errado). A sondagem foi descartável; o que ela achou virou
   prova em `scripts/publico-test.ts`.
3. Cabeçalhos de cache de todas as respostas principais.

**Vazamento.** Conferido o conteúdo de: página da rifa, regulamento, sorteio
(semente só depois de feito), prêmios (número em jogo nunca sai), últimas
compras e ranking (nome reduzido, telefone mascarado), bilhete e pedido
(telefone e CPF mascarados; o nome inteiro é decisão registrada em
`docs/SEGURANCA.md`), perfil da organização, comentários, recibo (código de
10 letras, sem CPF nem Pix), certificado, banner da entidade, coluna ao vivo,
sorteio oficial e a fileira de rifas dele. Nenhum telefone, CPF, e-mail, id de
pessoa ou número de cota premiada em jogo sai em rota pública.

**Telas** (`npm run telas -- --papel anonimo`, 25 telas × 390/820/1440, nos dois
temas — 75 capturas cada): vitrine, rifa, perfil da organização, regulamento,
ajuda, termos, privacidade, estado, pedido, bilhete, minhas compras, carrinho,
Pix do carrinho, avisos, publicar, perfil, configurações, reels, mensagens,
buscar, perfil de apostador, entrar, criar conta, seja afiliado e a 404. Mais:
contraste medido por script em 390 e 1440, claro e escuro (texto contra o
fundo efetivo, 4,5:1, ou 3:1 para texto grande), e os estados da rifa e das
promotoras (travada, demonstração, sorteada, encerrada, esgotada, rascunho,
inexistente, arquivada, banida) e de pedido, bilhete, carrinho, apostador,
estado e recibo que não existem.

**Texto.** `shared/ajuda.ts`, `shared/legal.ts` (Termos e Privacidade),
`shared/regulamento.ts` e os avisos da página da rifa, do Pix e do pedido,
contra o que o sistema faz (prazos e rótulos que as frases citam foram
procurados no código: "Minhas compras → Reembolsos", "Excluir conta", "Avisos
neste aparelho", os prazos de guarda, as constantes de resposta e devolução).

## O que foi achado e corrigido

| # | Gravidade | Defeito | Commit |
|---|---|---|---|
| 1 | **Alta** | `POST /api/auth/login` era a única rota `async` do Express 4 sem `try`. O e-mail com byte nulo ou com milhares de letras (a linha do índice `idx_rate_bucket` tem teto de ~2,7 KB) fazia o `INSERT` do antifraude falhar, a rejeição ficava sem tratamento e **o processo caía**: um pedido anônimo tirava o site do ar. Corrigido em quatro camadas: `try` na rota, byte nulo recusado na porta para todas as rotas (400), balde do antifraude de texto longo vira começo + impressão, e `unhandledRejection` vai ao log. | 4e0f8f8 |
| 2 | Média | `/orders/:code` e `/carrinho/pedidos/:codigo` usavam `Number()` cru: texto ou número maior que o inteiro do banco dava 500. `/stories/:id/poster\|imagem` e `/banners-pagos/:id/imagem` mandavam o id sem conferir o formato. Agora 404 (a tentativa que erra conta na guarda de varredura). | 68630ed |
| 3 | Média | Byte nulo em `/campaigns/%00`, `/o/%00`, `/u/%00`, `/recibos/%00`, `/marketing?organizacao=%00`, `/l/%00/0`, clique de afiliado e cadastro de afiliado: 500. Agora 400 (coberto pelo item 1). | 4e0f8f8 |
| 4 | Média | Resposta pública sem `Cache-Control`, e quase toda ela varia com a sessão (quem segue, quem curtiu). Padrão agora `private, no-cache`; pedido, carrinho, bilhete e texto da impressora, `private, no-store` (levam o nome de quem comprou e o Pix). | 5c88d79, 68630ed |
| 5 | Média | Promotora **banida** (e a arquivada, na vitrine) ainda aparecia no feed, nos Reels e na busca (`listPublicCampaigns` não filtrava), na contagem dos estados, no termo de afiliado, no pixel público, no link do perfil (`/l/…`) e no endereço curto (`/c/…`). O link do perfil da banida é justamente por onde o Pix por fora costuma ir. | 428c1d8 |
| 6 | Baixa | `/campaigns/:slug/ranking` somava todos os pedidos pagos da rifa a cada pedido, sem limite nem guarda: guardado 10 s por rifa. | 5771de9 |
| 7 | Baixa | `/cep/:cep` chamava o serviço de fora para cada CEP novo, sem limite: varredura de CEPs nos faria ser bloqueados e ninguém preencheria endereço. Limite de 120 por minuto por IP, com mensagem em português. | 007eccf |
| 8 | Média (tela) | Tema escuro: texto branco de 12 a 14 px sobre o verde (#16924e) tinha contraste 4,0:1 — botão primário, "Pagar", "Copiar código Pix", "Instalar", números do bilhete e casas do mapa. O verde do escuro passa a #12874a (4,57:1). `tests/tema.test.ts` trava o 4,5:1 nos dois temas. | 3ee58d1 |
| 9 | Média (tela) | Página da rifa **sorteada, encerrada ou esgotada** oferecia compra (pacotes, mapa, aviso do Pix) e mostrava "Rifa não encontrada." no lugar das cartelas. O `vende` da página era mais frouxo que o `rifaAVenda()` do feed e do carrinho. Agora usa a mesma régua e diz o motivo ("Cotas esgotadas", "Vendas encerradas"). | 3b20f5a |
| 10 | Baixa (tela) | `/pedido/:código` com código que não existe (ou consulta barrada) ficava em "Carregando pedido…" para sempre. Agora diz que não achou e leva a Minhas compras. | 4e733aa |
| 11 | Baixa (tela) | Vitrine: o botão "Ver mais rifas" (a reserva da rolagem infinita) tinha 109 × 20 px, abaixo dos 24 × 24 de WCAG 2.5.8; passa a 40 px de altura. | 58a187b |

A prova dos itens 1 a 5 e 7 é o bloco novo de `scripts/publico-test.ts`
(commits b9264ae e 007eccf): mais de 40 verificações novas, entre elas "login com
e-mail de 8 mil letras: 401 e o servidor segue no ar" e "a rifa da banida não
está na vitrine". Os testes de regra são `tests/semNulo.test.ts` (byte nulo e
balde) e `tests/tema.test.ts`.

## Ficou aberto, para decisão

1. **A vitrine devolve todas as rifas no ar de uma vez** (`GET
   /api/public/campaigns`: cada rifa com mídias, sem página e sem limite), e o
   `FeedInfinito` só fatia no navegador. Com poucas rifas não pesa; com
   centenas, é a rota mais cara do site e a mais aberta. Pede paginação por
   chave (como `buscar` e `reels`) ou guarda curta no servidor. Não mexi:
   muda o contrato da vitrine, dos Reels, dos salvos e das republicações.
2. **`/campaigns/:slug/cartelas` não tem limite por IP.** A página pré-carrega
   as cartelas de todos os pacotes, então um limite apertado derrubaria quem
   compra atrás do mesmo IP (operadora, evento). Pede um limite folgado e
   medido, ou guarda curta por rifa e tamanho. Decisão de produto sobre o teto.
3. **Rifa de promotora banida ou arquivada segue com a página aberta** (a
   travada "segue, com o aviso" é regra documentada), mas a página mostra o
   nome da promotora e o "Seguir", que leva a um perfil 404. Decidir se a
   página mostra a promotora, ou só o aviso.
4. **O antifraude guarda e-mail e telefone crus por 2 horas** em
   `rate_events` (`login:<e-mail>`, `otp:<telefone>`, `order:phone:<telefone>`),
   contra o princípio de que dado pessoal não vira chave crua. Trocar por hash
   é simples no servidor, mas as provas `conta`, `bonus`, `disputa` e outras
   apagam esses baldes pelo nome cru. Decisão: aceitar as 2 horas (o texto da
   Privacidade já diz "contagem de tentativas: 2 horas") ou hashear e ajustar
   as provas.
5. **O código do pedido ainda mostra o nome inteiro de quem comprou** a quem
   tiver o código (já registrado em `docs/SEGURANCA.md` como risco aceito); o
   bilhete idem.
6. **`/robots.txt` e `/sitemap.xml` devolvem a página do app** (200, HTML), e
   a página da rifa travada, da demonstração e da promotora banida não diz
   `noindex`. Decisão de produto: o que os buscadores podem indexar.
7. **O visitante vê um 401 no console** em Minhas compras e no Carrinho (a
   leitura da conta anônima). É o estado esperado e `npm run telas` não o
   conta, mas limpa o console se a leitura passar a tratar o 401 como "sem
   conta".
8. **A matriz `docs/REFORMULACAO-MATRIZ.md`** é gerada (`npm run matriz`) e foi
   regerada aqui (um arquivo de teste a mais). As outras auditorias por acesso
   vão regerá-la também: o conflito é de geração, resolva rodando o comando.

## Texto: só apontado, para o advogado

Nada do que segue foi mudado — é texto jurídico, e o erro não é de
contagem ou de nome de tela, que puxei do código:

- **Ajuda ("Como sei que a rifa é legal?")**: "Toda rifa publicada aqui tem
  autorização da SPA/MF." As rifas de demonstração são publicadas sem
  autorização (a página diz "Rifa de demonstração … não está à venda"). Trocar
  por "toda rifa à venda aqui" resolve.
- **Regulamento, item 7**, com o reembolso desligado: "Esta rifa não aceita
  pedidos de reembolso pelo site no momento." Os Termos (item 5), a Ajuda e a
  tela antes do Pix dizem, pela mesma função (`regraSemReembolsoPeloSite()`),
  que o arrependimento de 7 dias do art. 49 segue valendo; o regulamento é o
  único que cala. Quem lê só o regulamento lê "não aceita" sem a ressalva.
- **Privacidade, item 6** diz que "o IP e o aparelho usados no antifraude"
  ficam em hash, o que é exato; o item 2 lista "tentativas de acesso" sem
  dizer que o e-mail e o telefone dessas tentativas ficam crus por 2 horas
  (item 4 acima). Se a decisão for manter, vale uma frase.

Nenhum texto de Termos ou Privacidade foi alterado: `VIGENCIA_DOS_TERMOS`
segue em 2026-10-14.

## Como provar

```
npm run publico        # o bloco novo está no fim de scripts/publico-test.ts
npm run telas -- --papel anonimo [--tema escuro]
env -u DATABASE_URL npx vitest run tests/semNulo.test.ts tests/tema.test.ts
```
