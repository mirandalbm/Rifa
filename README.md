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
| `admin@rifa.br` / `admin123` | `/admin` | campanhas, pedidos, afiliados, cupons, financeiro, sorteios, auditoria |
| `joao@rifa.br` / `joao123` (código `JOAO7`) | `/afiliado` | link, cliques, comissões, saques |
| ninguém | `/` | vitrine, rifa, checkout Pix, minhas cotas |
| qualquer pessoa | `/seja-afiliado` | cadastro de afiliado, que entra na fila de aprovação |
| cambista (criado pelo admin) | `/cambista` | vender na mão, imprimir bilhete e ver o próprio acerto |

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
| `npm run load` | teste de carga com compradores simultâneos |

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
| `PUBLIC_BASE_URL` | não | `http://localhost:5000` (usada nos links que saem em mensagem) |
| `NOTIFICATION_PROVIDER` | não | `console` (`whatsapp` quando houver token) |
| `WHATSAPP_TOKEN` | com WhatsApp | — |
| `WHATSAPP_PHONE_ID` | com WhatsApp | — |
| `WHATSAPP_LANGUAGE` | não | `pt_BR` |
| `REMINDER_MINUTES_BEFORE` | não | `5` (lembrete antes de a reserva cair) |
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

Depois de aprovada, a imagem vira **variantes responsivas** — AVIF e WebP em
400/800/1600 px — mais uma miniatura de 20 px embutida no HTML, que aparece
borrada enquanto a foto real carrega. Nada é ampliado: gerar 1600 a partir de
uma foto de 1200 só pesa.

Medir é o ponto: a duração do vídeo sai do cabeçalho `mvhd` do próprio
container MP4/MOV, lido por Range — alguns kilobytes, não os 300 MB — e as
dimensões da imagem saem do cabeçalho PNG/JPEG/WebP. O que o navegador informa
não é usado em lugar nenhum: seria trivial de forjar, e o limite de 60 s é uma
promessa feita ao comprador na tela. Arquivo recusado é apagado do
armazenamento na mesma hora.

WebM não é aceito de propósito: sem saber medir a duração, não dá para
prometer o limite.

### O afiliado

Cadastro aberto em `/seja-afiliado`; ninguém divulga antes do administrador
aprovar. Cada afiliado recebe link, QR pronto para story e três textos que só
precisa copiar — sem isso cada um inventa a própria mensagem, e a pior delas
vira a cara da campanha.

O cupom faz duas coisas ao mesmo tempo: dá desconto ao comprador e credita a
venda ao afiliado **mesmo que a pessoa não tenha entrado pelo link**. No
checkout ele sobrepõe o cookie de primeiro clique.

### O segundo fator

A conta do administrador move dinheiro e publica campanha, então tem TOTP
(RFC 6238) implementado com o crypto do próprio Node. O segredo só é gravado
depois que o aplicativo do administrador prova que gera o código certo —
gravar antes trancaria a conta de quem desistiu no meio. Desligar exige senha
**e** código: sessão roubada não desarma o segundo fator sozinha.

### As mensagens

Seis modelos em `server/notifications/templates.ts`: código de acesso,
pagamento confirmado, cota premiada, reserva expirando, venda para o afiliado
e sorteio realizado. Cada um declara o texto em português **e** a ordem dos
parâmetros que o modelo aprovado do WhatsApp espera — juntos, para ninguém
mudar o texto e esquecer a ordem lá fora.

Todo envio passa por uma chave de deduplicação única no banco. É ela que
impede o mesmo lembrete de sair duas vezes, inclusive com duas réplicas
acordando no mesmo minuto. E falha de envio nunca derruba o fluxo: se o
WhatsApp estiver fora, o pagamento já entrou e as cotas já são do comprador —
a falha fica registrada e a vida segue.

Sem `WHATSAPP_TOKEN`, o provedor é o console: a mensagem aparece no terminal
e o código de acesso volta na resposta, para o fluxo rodar sem conta no
WhatsApp Business.

### As cotas premiadas

O administrador sorteia N cotas para um prêmio e os números ficam **secretos**:
a página pública mostra o prêmio e quantos ainda estão em jogo, nunca qual é o
número — quem soubesse compraria só aquele. A revelação acontece no pagamento,
e o prêmio que já saiu continua na lista marcado como "já saiu", que é prova
de que as cotas premiadas são reais.

### Os meios de pagamento

Quem decide o que o app aceita é o administrador, em Configurações: Pix na
loja online, dinheiro com o cambista, cartão na maquininha e Pix na
maquininha, cada um com liga-desliga próprio.

A escolha vale para o app inteiro e é checada **no servidor**, não só na
tela: com o Pix online desligado a página da rifa para de vender sozinha e
passa a orientar o comprador a procurar um cambista; com um meio físico
desligado, o botão some da tela do cambista e a confirmação com aquele meio
é recusada.

A única regra rígida é que sobre pelo menos um meio ligado — desligar todos
deixaria a rifa de pé sem nada poder entrar.

### O bilhete

Todo pedido tem bilhete em `/bilhete/:code`, com o apostador (nome, telefone,
CPF), a rifa e o prêmio, a data e o método do sorteio, os números escolhidos,
a forma de pagamento e a administradora da rifa — nome, CNPJ, cidade e
contato, configurados em Configurações. Sai também a autorização SPA/MF da
campanha e o hash da semente do sorteio.

A folha é de 58 mm, o tamanho da bobina das maquininhas, e a mesma página
imprime bem em A4. Para a impressora térmica do terminal existe
`GET /api/public/tickets/:code/escpos`, que devolve o texto já em 32 colunas,
sem acento e sem espaço não-quebrável — duas coisas que a bobina imprime
como lixo.

### O cambista

Venda física, no mesmo app, com acesso próprio: escolhe a rifa, informa o
apostador, reserva as cotas, cobra e imprime o bilhete.

A ordem importa e não se inverte: **reserva antes de cobrar**. Cartão
aprovado e número já vendido seria o pior desfecho — dinheiro debitado e
nada para entregar. Se a cobrança falhar, um toque devolve as cotas na hora.

O dinheiro fica com quem vendeu, então o cambista não recebe: ele **deve**.
O acerto é a conta do que recolheu menos a comissão dele, e fechar o acerto
carimba as vendas incluídas para nenhuma entrar duas vezes. É o oposto do
afiliado online, que recebe da casa.

### O teste de carga

```bash
npm run load -- --buyers 500 --quotas 5 --prefill 0.95
```

Dispara compradores simultâneos contra o servidor e confere o banco depois.
O caso que interessa não é a rifa vazia — sobra número, ninguém colide. É a
**reta final**: `--prefill` enche a campanha até a porcentagem indicada,
materializa o pool de endgame e põe todo mundo brigando pelo que sobrou.

No fim ele checa seis invariantes, entre elas a que mais importa: nenhuma cota
vendida duas vezes, e o pool sem oferecer cota já tomada.

Resultado numa campanha de 1.000.000 com 500 compradores simultâneos
disputando o fim: **1.000.000 de 1.000.000 vendidas, zero duplicadas**, 200
compras atendidas e 300 recusadas com "sem cota" — exatamente o número que
cabia.

### As maquininhas

O app roda igual no navegador e dentro de uma maquininha Android (PagBank
Smart POS, Stone/Ton, Cielo LIO). Quando o invólucro Android injeta
`window.RifaPOS`, a mesma tela passa a cobrar no cartão pelo SDK da
adquirente e a imprimir na bobina do aparelho. Sem a ponte, nada quebra: o
pagamento é registrado como dinheiro ou Pix e o bilhete sai pela impressão
do navegador.

O invólucro Android está em [`android/`](android/README.md), com um sabor de
build por adquirente — o `generico` compila sem SDK nenhuma e serve para
testar o conjunto antes de ter credencial. Os modelos de terminal e o caminho
de publicação estão em [`docs/MAQUININHAS.md`](docs/MAQUININHAS.md).

### O sorteio

O hash da semente é publicado quando a campanha vai ao ar, antes da primeira
venda. No dia, o número sai de `HMAC(semente, os 5 prêmios do concurso federal)
mod total`, com rejeição de amostra contra viés de módulo. Depois a semente é
publicada e qualquer pessoa refaz a conta. Vale de 100 a 1.000.000 de cotas —
o 1º prêmio da Federal, sozinho, endereça no máximo 100.000.
