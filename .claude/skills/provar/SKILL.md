---
name: provar
description: Roda as provas certas para a área que foi mexida (tsc, vitest e os `npm run …` contra a API de verdade), escolhendo pela tabela "Onde mexer" do CLAUDE.md. Use depois de mudar código, antes de commitar ou abrir PR.
argument-hint: "[área: estorno, carrinho, rodapé… ou vazio para deduzir do diff]"
disable-model-invocation: true
---

# Provar

Escolhe e roda as provas da área mexida. Sem argumento, deduz a área do que
mudou (`git diff --name-only origin/main...HEAD` mais o que está sem commit).
Com argumento (`/provar estorno`), usa a área dita.

## 1. Sempre

```bash
node_modules/.bin/tsc --noEmit -p .
env -u DATABASE_URL node_modules/.bin/vitest run
```

O `vitest` roda **sem `DATABASE_URL`**, como no job de tipos e testes do CI:
teste que importa `server/db.ts` (direto ou por um serviço) passa no seu
terminal, onde a variável existe, e quebra lá. Regra pura vai em `shared/` ou
num módulo de servidor sem banco (como `server/services/chatbase.ts`).

Falhou, pare e conserte: nada abaixo vale com o tipo quebrado.

## 2. Quais provas rodar

Pelo caminho que mudou (a mesma tabela "Onde mexer" do `CLAUDE.md`):

| Mexeu em | Roda |
|---|---|
| reserva, alocação, cartelas (`services/quotas.ts`) | `load` |
| pedido, preço, webhook (`services/orders.ts`) | `load`, `refund`, `pix-tardio` |
| estorno | `refund`, `presente`, `bonus` |
| chamado de reembolso, disputa | `chamados`, `disputa` |
| **rota nova ou nova consulta do painel** (qualquer `routes/admin.ts`) | `isolation` — rota que não aparece lá é rota que ninguém provou |
| relógios (`jobs/`, `db.ts`) | `relogios` |
| conta do apostador | `conta` |
| login, senha, segundo fator, cofre, cabeçalhos e CSP (`auth.ts`, `hashSenha.ts`, `segundoFator.ts`, `cofre.ts`, `shared/csp.ts`, `server/index.ts`), rota pública por `slug` | `senha` (o script com o mesmo `SESSION_SECRET` do servidor), `conta`, `seguranca`, `tests/hashSenha.test.ts`, `tests/segundoFator.test.ts`, `tests/csp.test.ts` |
| bilhetes como publicações privadas (`/perfil/bilhetes`) | `bilhetes`, `conta` |
| perfil do organizador, seguir, links curtos | `perfil` |
| push, central de avisos | `push` |
| regulamento, sorteio, transmissão | `transparencia` |
| apuração pela Federal direta e pelo globo, método liberado pela plataforma, numeração a partir de zero, ata do globo, data máxima do "quando completar" (`shared/apuracao.ts`, `formatQuota`/`numeroInterno` em `shared/format.ts`, `numeroSorteado()` em `sortear.ts`, `validarAtaDoGlobo()` em `shared/sorteiosOficiais.ts`, `draw_at_maximo` em `orders.ts`; o número sem dono e os impedidos do item 9: `regraDoNumeroSemDono`/`contempladoNaFita` em `shared/sorteio.ts`, `registrarNovaExtracao()` em `sortear.ts`, `server/services/impedidos.ts`; o prêmio sem dinheiro: `shared/premio.ts`) | `apuracao`, `transparencia`, `sorteios`, `contrato`, `agenda-rifa`, `solicitacoes`, `isolation`, `tests/apuracao.test.ts`, `tests/sorteiosOficiais.test.ts`, `tests/regulamento.test.ts`, `tests/item9.test.ts`, `tests/premio.test.ts`; mexeu em tela com número de cota, `telas` |
| aparência, template, rodapé, banners, stories (e o agendado), vitrine | `aparencia`, `vitrine`, `isolation` (a porta do painel do story) |
| vídeo: pôster, processador, entrega em HLS e URL assinada (`videoProcessor.ts`, `media.ts`, `streamAssinatura.ts`, `streamPendentes.ts`, `posterRetroativo.ts`, `shared/stream.ts`, `client/src/lib/hls.ts`) | `poster` (com e sem `ffmpeg`; com as variáveis da entrega e `CLOUDFLARE_API_URL` local, a parte do HLS e da URL assinada), `tests/cloudflareStream.test.ts`, `tests/stream.test.ts`, `tests/streamAssinatura.test.ts`, `vitrine`, `publicacao` |
| comentários, perfil do apostador | `comentarios` |
| segurança do organizador | `seguranca` |
| verificação (selo), consentimento biométrico e a renovação dele (`RenovarConsentimento`, relógio 811019) | `verificacao`, `isolation`, `tests/verificacao.test.ts`; mexeu no texto, `tests/legal.test.ts` |
| publicação, carrinho, Reels | `publicacao`, `carrinho` |
| mensagens e grupos | `mensagens`, `grupos`, `isolation` |
| buscar (e o índice de texto: `shared/semAcentoSql.ts`, `idx_*_trgm`, `scripts/extensoes.ts`) | `buscar` (o plano com 5 mil rifas numa transação que volta) |
| presente | `presente` |
| painel de resultados | `resultados` |
| afiliados, fiscal, guarda da comissão | `afiliados`, `fiscal`, `guarda` |
| divulgação de terceiros (afiliado influenciador, publicação do apostador, menu Criar, os avisos no sino e no trevo, editar a peça e a versão decidida, as fotos do apostador e do afiliado, a peça agendada) |  `divulgacao`, `afiliados`, `seguranca`, `isolation` |
| bônus, patrocínio, banner pago, marketing | `bonus`, `patrocinio`, `banner`, `marketing` |
| sorteios oficiais (calendário, integrar a rifa, resultado oficial, sorteio automático, outras loterias, tela do sorteio) e o sorteio da rifa (`server/services/sortear.ts`) | `sorteios`, `transparencia`, `solicitacoes`, `isolation` |
| comentários do sorteio oficial e a denúncia deles (`server/services/sorteioComentarios.ts`, `shared/sorteioDenuncias.ts`, o `Comentarios` com `sorteioOficialId`, `ComentariosDoSorteioDenunciados`) | `sorteio-comentarios`, `comentarios`, `isolation` |
| assistente de IA (`shared/ia.ts`, `services/ia.ts`, `services/chatbase.ts`, `routes/ia.ts`, a coluna em `AssistenteDoPainel.tsx`, o cache em `lib/session.ts`, a cobrança em `iaCobranca.ts`, `PlanoDoAssistente.tsx` e o relatório e ajuste em `UsoDoAssistenteCard.tsx`, as ações em `iaAcoes.ts`) | `tests/ia.test.ts`, `tests/iaCobranca.test.ts`, `tests/iaAcoes.test.ts`, `tests/chatbase.test.ts`, `tests/assistente.test.ts`, `ia` e `ia-acoes` (com `CHATBASE_API_KEY` e `CHATBASE_API_URL=http://127.0.0.1:5099/api/v2` no servidor e no script), `isolation`; mexeu na coluna, `telas` |
| editar, adiar, excluir rifa | `solicitacoes` |
| entidade beneficiada da rifa (ONG, fundação: banner e tela) | `banner-divulgacao`, `isolation` |
| publicação agendada da rifa (o relógio que publica) | `agenda-rifa`, `transparencia`, `isolation` |
| conta do apostador, login com Google | `conta`, `google` (o servidor sobe com `GOOGLE_PROVA=1`) |
| qualquer tela (client/) | `telas` (60 telas × 390/820/1440; não pode reprovar) |

Na dúvida entre duas áreas, rode as duas. `isolation` é barata: rode sempre
que tocar `server/routes/`.

## 3. Como subir o ambiente local

As provas falam com a API de verdade; precisam do Postgres e do servidor.

```bash
pg_ctlcluster 16 main start          # se ainda não estiver de pé
export DATABASE_URL=postgres://rifa:rifa@127.0.0.1:5432/rifa_ci
export SESSION_SECRET=ci-somente-para-teste
export BASE_URL=http://localhost:5000
PORT=5000 PUBLIC_BASE_URL=http://localhost:5000 setsid nohup npm run dev > /tmp/dev.log 2>&1 &
echo $! > /tmp/dev.pid
# espere: curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/public/template  → 200
npm run <prova>
```

Para parar o servidor: `kill -- -$(cat /tmp/dev.pid)` (o grupo todo). **Nunca
`pkill -f` com padrão**: ele casa com o próprio shell e derruba a sessão.

## 4. Armadilhas conhecidas

- Depois do `load`, o limite de IP do antifraude pode barrar a próxima
  prova: `delete from rate_events` no banco local antes do `refund`.
- Chave de trava de relógio presa por rodada interrompida: troque a faixa
  entre execuções do `relogios`.
- Prova que apaga saque apaga o recibo antes (FK sem cascata).
- `npm run telas` demora minutos; rode no fim, com o servidor de pé.

## 5. Relato

Diga, prova por prova, o que passou e o que **não** foi rodado e por quê.
Prova que falhou entra com a saída. Não diga "tudo certo" sem ter rodado.
