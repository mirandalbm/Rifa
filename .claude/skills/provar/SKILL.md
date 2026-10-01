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
node_modules/.bin/vitest run
```

Falhou, pare e conserte: nada abaixo vale com o tipo quebrado.

## 2. Quais provas rodar

Pelo caminho que mudou (a mesma tabela "Onde mexer" do `CLAUDE.md`):

| Mexeu em | Roda |
|---|---|
| reserva, alocação, cartelas (`services/quotas.ts`) | `load` |
| pedido, preço, webhook (`services/orders.ts`) | `load`, `refund` |
| estorno | `refund`, `presente` |
| chamado de reembolso, disputa | `chamados`, `disputa` |
| **rota nova ou nova consulta do painel** (qualquer `routes/admin.ts`) | `isolation` — rota que não aparece lá é rota que ninguém provou |
| relógios (`jobs/`, `db.ts`) | `relogios` |
| conta do apostador | `conta` |
| perfil do organizador, seguir, links curtos | `perfil` |
| push, central de avisos | `push` |
| regulamento, sorteio, transmissão | `transparencia` |
| aparência, template, rodapé, banners, stories, vitrine | `aparencia`, `vitrine` |
| comentários, perfil do apostador | `comentarios` |
| segurança do organizador | `seguranca` |
| verificação (selo) | `verificacao` |
| publicação, carrinho, Reels | `publicacao`, `carrinho` |
| mensagens | `mensagens`, `isolation` |
| presente | `presente` |
| painel de resultados | `resultados` |
| afiliados, fiscal, guarda da comissão | `afiliados`, `fiscal`, `guarda` |
| bônus, patrocínio, marketing | `bonus`, `patrocinio`, `marketing` |
| editar, adiar, excluir rifa | `solicitacoes` |
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
