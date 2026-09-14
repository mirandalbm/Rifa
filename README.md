# rifa.br

Plataforma multi-rifas com pagamento por Pix, afiliados e sorteio auditável.
**Um app só** atende as três superfícies — comprador, afiliado e administrador geral —
e o que separa uma da outra é o papel na sessão.

- Plano de produto e arquitetura: [`docs/PLANO-RIFA.md`](docs/PLANO-RIFA.md)
- Apresentação visual do plano: [`docs/plano-rifa.html`](docs/plano-rifa.html)

## Como rodar

```bash
npm install

# Postgres local (ou aponte para o Neon)
export DATABASE_URL="postgres://postgres@127.0.0.1:5432/rifa"

npm run db:push     # cria o schema
npm run db:seed     # admin, afiliado e 3 campanhas de exemplo
npm run dev         # http://localhost:5000
```

O seed imprime as credenciais no fim:

| Acesso | Entra em | Vê |
|---|---|---|
| `admin@rifa.br` / `admin123` | `/admin` | campanhas, pedidos, afiliados, financeiro, sorteios, auditoria |
| `joao@rifa.br` / `joao123` (código `JOAO7`) | `/afiliado` | link, cliques, comissões, saques |
| ninguém | `/` | vitrine, rifa, checkout Pix, minhas cotas |

Em desenvolvimento o provedor de pagamento é falso: a tela do pedido mostra
**simular pagamento**, que dispara a mesma rotina do webhook real.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor + cliente com HMR |
| `npm run check` | typecheck |
| `npm test` | testes (preço, comissão, sorteio, formatação) |
| `npm run build` | build de produção |
| `npm run db:push` | aplica o schema |
| `npm run db:seed` | popula dados de exemplo |

## Variáveis de ambiente

| Variável | Obrigatória | Padrão |
|---|---|---|
| `DATABASE_URL` | sim | — |
| `SESSION_SECRET` | em produção | valor de desenvolvimento |
| `PAYMENT_PROVIDER` | não | `dev` (use `mercadopago` em produção) |
| `MP_ACCESS_TOKEN` | com Mercado Pago | — |
| `MP_WEBHOOK_SECRET` | com Mercado Pago | — |
| `REFUND_WINDOW_DAYS` | não | `7` |
| `R2_BUCKET` | em produção | sem ela, o armazenamento é o disco local |
| `R2_ACCOUNT_ID` | com R2 | — |
| `R2_ACCESS_KEY_ID` | com R2 | — |
| `R2_SECRET_ACCESS_KEY` | com R2 | — |
| `R2_PUBLIC_URL` | com R2 | — |
| `UPLOAD_DIR` | não | `uploads` (só no disco local) |
| `PORT` | não | `5000` |

## Como está organizado

```
shared/     schema (Drizzle), matriz de acesso, preço e formatação — cliente e servidor
server/     auth + guard por papel, serviços de domínio, rotas por escopo, jobs
client/     um app React; as rotas de painel passam pelo guard de sessão
tests/      lógica pura: preço, comissão, sorteio, número da cota
```

### O acesso

`shared/access.ts` é a fonte única: define os papéis, o que cada um alcança e
as seções de menu. O servidor monta cada router atrás do papel mínimo
(`/api/public`, `/api/affiliate`, `/api/admin`), então **rota nova nasce
protegida**. O cliente usa a mesma matriz só para montar o menu — esconder é
conveniência, quem barra é o servidor.

### As cotas

Só existe linha em `quota_alloc` para cota **tomada**: disponível é a ausência
de linha. Publicar uma campanha de 1.000.000 de cotas não cria linha nenhuma.
A reserva é `INSERT … ON CONFLICT DO NOTHING` sobre a chave primária
`(campaign_id, number)` — sem trava de linha, e a escrita é a própria
verificação. Acima de 85% vendido, a alocação passa a sair de `free_pool`
com `SKIP LOCKED`. Detalhes em `docs/PLANO-RIFA.md` §4.1.

### A mídia

Cada campanha tem 1 banner, até 5 fotos e no máximo 1 vídeo de **60 segundos**.
O envio tem dois passos: o painel pede uma URL assinada e o arquivo vai direto
para o armazenamento (R2 em produção, disco local em desenvolvimento); depois a
confirmação **mede o arquivo já armazenado**.

Medir é o ponto: a duração do vídeo sai do cabeçalho `mvhd` do próprio
container MP4/MOV, lido por Range — alguns kilobytes, não os 300 MB — e as
dimensões da imagem saem do cabeçalho PNG/JPEG/WebP. O que o navegador informa
não é usado em lugar nenhum: seria trivial de forjar, e o limite de 60 s é uma
promessa feita ao comprador na tela. Arquivo recusado é apagado do
armazenamento na mesma hora.

WebM não é aceito de propósito: sem saber medir a duração, não dá para
prometer o limite.

### O sorteio

O hash da semente é publicado quando a campanha vai ao ar, antes da primeira
venda. No dia, o número sai de `HMAC(semente, os 5 prêmios do concurso federal)
mod total`, com rejeição de amostra contra viés de módulo. Depois a semente é
publicada e qualquer pessoa refaz a conta. Vale de 100 a 1.000.000 de cotas —
o 1º prêmio da Federal, sozinho, endereça no máximo 100.000.
