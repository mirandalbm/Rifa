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
| `npm run isolation` | prova de isolamento entre organizações |
| `npm run refund` | prova dos cinco efeitos do estorno |

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

A bancada sai toda do mesmo IP, e o antifraude — com razão — recusa isso. Ela
afrouxa **só** o limite por IP enquanto roda e devolve a configuração de antes
no fim, mesmo se estourar no meio. O limite de reserva em aberto, que é o que
de fato protege o estoque, continua valendo.

Três bugs de verdade saíram daqui, nenhum deles visível em teste de unidade:
a escolha manual no mapa envenenava o pool de endgame; a compra rápida
desistia na primeira colisão em vez de sortear de novo; e o código do pedido
era conferido com um `SELECT` antes do `INSERT` — dois compradores simultâneos
sortearam o mesmo número entre uma coisa e outra, e um levou erro 500.

### O antifraude

```
/admin/antifraude
```

O ataque que dói numa rifa não é o de pagamento: é **bloqueio de estoque.** Um
script reserva milhares de cotas, não paga, deixa expirar e repete. A rifa
parece vendida, ninguém consegue comprar e o organizador não entende por quê.

Por isso o limite mais apertado não é o de volume de compra, e sim o de
**reserva em aberto**: dois pedidos aguardando pagamento por telefone, 500
cotas seguradas ao mesmo tempo. Acima disso, o pedido é recusado com 429 e o
motivo em português — quem está comprando de verdade precisa entender o que
aconteceu.

Em volta dele, janela deslizante em Postgres para ritmo de compra (por
telefone, por aparelho e por IP), força bruta de senha, pedido de código de
acesso, autoindicação de afiliado por aparelho e bloqueio manual do
administrador por telefone, aparelho ou IP.

Três decisões que valem registrar:

- **O cambista é isento dos limites de comprador, nunca do bloqueio manual.**
  A venda dele é presencial e tem dono — ele responde por ela no acerto. Mas
  telefone bloqueado não compra nem na maquininha.
- **O limite por IP é folgado** (60 em 10 min). Operadora de celular põe um
  bairro inteiro atrás do mesmo IP; apertar aqui derruba comprador de verdade.
- **Dado pessoal não vira chave crua.** IP e aparelho entram em hash SHA-256 e
  o telefone aparece mascarado no registro. Um vazamento da tabela de fraude
  não pode virar lista de telefones.

A tela mostra o que foi barrado e por quê. Sem isso, limite apertado demais
vira venda perdida que ninguém enxerga.

### As exportações

```
/admin/exportacoes
```

Seis relatórios em CSV: pedidos, cotas vendidas, compradores, comissões,
acertos de cambista e a prestação de contas do sorteio. Com recorte por
campanha e por data — o dia final entra inteiro.

O arquivo abre direto no Excel brasileiro: separador ponto e vírgula, vírgula
decimal, sem `R$` e sem separador de milhar (com eles a célula vira texto e a
soma da coluna devolve zero), e BOM no começo, senão o acento vira caractere
estranho.

Três coisas que importam mais que o formato:

- **A planilha executa o que você escreve nela.** Um comprador que se cadastre
  como `=cmd|'/c calc'!A1` põe uma fórmula dentro do relatório do organizador,
  que dispara quando ele abre o próprio arquivo. Toda célula passa por
  `neutralizarFormula()`. O cuidado fino é o `-`: `-14,70` é dinheiro e precisa
  continuar somando, então só é neutralizado quando o resto não é número.
- **Nada é montado inteiro na memória.** Cada relatório é um gerador com
  paginação de chave, e a rota respeita a contrapressão do socket. Medido: meio
  milhão de linhas, 31 MB de arquivo, memória do processo parada em 60 MB do
  começo ao fim.
- **A semente do sorteio só sai depois do sorteio.** Antes dele o relatório
  traz o hash — o compromisso público — e diz por que a semente não está ali.
  Quem a tivesse antes calcularia o número e compraria a cota.

Todo download fica registrado em `audit_log` com quem baixou, quando, qual
recorte e se o arquivo levava dado pessoal.

### O multi-organizador

```
/admin/organizacoes
```

Cada organização é um **promotor** de rifa, e a separação existe por um motivo
jurídico antes de técnico: a Lei 5.768/71 autoriza o promotor, não a
plataforma. É o nome dele que sai no bilhete como administradora e é dele que
a autorização SPA/MF é exigida — por isso a autorização sempre foi campo da
campanha, nunca da plataforma.

**São as mesmas telas.** Organizador e administrador geral usam o mesmo
painel: campanhas, pedidos, afiliados, cambistas, financeiro, sorteios,
exportações. O que muda não é a tela, é o recorte. A convenção que governa
tudo é uma linha: **`organizationId` nulo é a plataforma** — o administrador
geral entra com nulo e enxerga todas; o organizador entra com a dele e não
alcança mais nada. Papel diz qual porta abre; organização diz o que tem atrás.

Antifraude, meios de pagamento e trilha de auditoria ficam com a plataforma:
valem para todo mundo que vende aqui, e a trilha guarda ação de todas as
organizações — recortá-la daria falsa completude.

#### O modo de falhar aqui é silencioso

Rota que esquece de **barrar** devolve 403 e alguém reclama. Rota que esquece
de **filtrar** devolve 200 e entrega pedido, telefone e caixa do vizinho, sem
que ninguém perceba. Por isso o teste de isolamento não confere só o código de
resposta — confere o **conteúdo** das listas:

```bash
npm run isolation
```

Ele cria duas organizações com rifa e venda, entra como o organizador de uma e
tenta alcançar tudo da outra: por id (espera 404 — para quem não é dono,
aquilo não existe), nas rotas da plataforma (espera 403) e, principalmente, no
que as listas dele realmente trazem. Depois limpa o que criou. Rota nova de
`/api/admin` que não apareça ali é rota que ninguém provou.

Duas decisões que valem registrar:

- **404, não 403, para o dado do vizinho.** Responder "existe, mas não é sua"
  já confirma que o id é válido, e com isso dá para varrer a plataforma
  contando rifa alheia.
- **Rota com id de filho confere o pai, antes de escrever.** `/media/:id` e
  `/prized/:id` não trazem a campanha no caminho; sem buscar o dono primeiro,
  o id do vizinho apagaria o banner dele — e a checagem depois do `DELETE`
  chegaria tarde.

### O rateio e a cobrança da plataforma

Uma venda tem três bolsos, e a ordem entre eles é a regra que não se negocia:
**a plataforma sai primeiro**, e a comissão do afiliado ou do cambista incide
sobre o que sobrou — nunca sobre o bruto.

```
pago pelo comprador          R$ 445,50
 taxa da plataforma (5%)    −R$  22,27
 comissão do afiliado (12%) −R$  50,78   ← 12% de R$ 423,23, não de R$ 445,50
 fica com o promotor          R$ 372,45
```

Inverter a ordem faria a plataforma cobrar sobre dinheiro que já era de outro.
A diferença parece pequena — aqui, R$ 2,68 no mesmo pedido — e é exatamente o
tipo de erro que só aparece no fechamento do mês.

As duas fatias arredondam **para baixo** e o centavo que sobra fica com o
promotor: é a única direção em que a soma nunca passa do que o comprador pagou.
A garantia é de igualdade, não de aproximação, e tem teste varrendo de 0 a
R$ 20,00 em seis combinações de percentual.

#### Mensalidade ou comissão

O contrato é por organização, e são dois, nunca os dois juntos:

| | Como cobra | Por venda |
|---|---|---|
| **mensalidade** | valor fixo por mês | nada |
| **comissão** | nada fixo | percentual sobre cada venda paga |
| **sem cobrança** | — | — |

Quem paga mensalidade tem taxa **zero** no rateio, então o afiliado volta a
receber sobre o valor cheio. Trocar de modo zera o campo do outro — percentual
esquecido num plano de mensalidade é bomba de relógio.

O padrão de toda organização é **sem cobrança**: ninguém acorda devendo por
causa de uma decisão tomada depois. A mensalidade é lançada pelo relógio,
sempre referente ao **mês anterior**, e é idempotente pela chave
`(organização, competência)`.

Tudo isso vira um razão único em `/admin/cobranca` — a plataforma vê a carteira
de clientes, e o organizador vê a conta dele, com a origem de cada lançamento.

### O estorno

Estornar é desfazer cinco coisas ao mesmo tempo, e o modo de errar é sempre o
mesmo: desfazer quatro e esquecer a quinta. O que sobra não dá erro — vira
comissão paga por uma venda que voltou, ou número que some do estoque.

`refundOrder()` faz tudo na mesma transação: devolve as cotas, corrige o
contador e a receita, reverte a comissão, cancela a taxa da plataforma e solta
a cota premiada que aquele pedido tinha reclamado. É idempotente: só age sobre
pedido `paid`.

Duas regras valem registrar:

- **A cota só volta ao estoque se a rifa ainda não foi sorteada.** Depois do
  sorteio o quadro está congelado — quem conferir o resultado precisa
  encontrar exatamente o que existia quando o número saiu. Nesse caso o
  estorno vira só dinheiro, e o comprador recebe uma mensagem diferente:
  dizer que as cotas voltaram seria mentira.
- **Em endgame o número volta para o `free_pool`.** Sem isso ele ficaria livre
  em `quota_alloc` e invisível para quem aloca pelo pool: sumiria do estoque
  sem ninguém perceber.

O estorno entra pelo webhook do provedor e também pela mão
(`POST /api/admin/orders/:code/estornar`), porque nem todo estorno vem do Pix
— venda em dinheiro do cambista, cobrança contestada por fora, erro de
operação. O botão **não devolve dinheiro**: quem devolve é o Pix ou o caixa, e
a rota só acerta o que o sistema registrou.

```bash
npm run refund
```

Prova os quatro cenários contra o banco de verdade: venda comum, rifa em
endgame, cota premiada e rifa já sorteada.

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
