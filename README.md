# Sistema de Rifa Beneficente

Plataforma de rifa para organização sem fins lucrativos, com três portais separados:

| Portal | Quem usa | O que faz |
|---|---|---|
| **Público** (`/`) | Comprador | Escolhe números, paga por PIX, consulta em "Meus números" |
| **Afiliado** (`/afiliado`) | Vendedor/divulgador | Link de indicação, acompanhamento de vendas e comissões |
| **Organizadora** (`/organizadora`) | A ONG | Rifas, arrecadação, compras, comissões a repassar, publicação do resultado |

O painel da organizadora tem quatro abas: **visão geral** (arrecadação e últimas compras),
**rifas** (criar, abrir/encerrar venda, exportar CSV), **afiliados** (cadastrar e registrar
repasse de comissão) e **resultado** (apuração pela Loteria Federal).

Dois perfis acessam esse painel: `ORGANIZADORA` faz tudo; `OPERADOR` apenas consulta e exporta,
sem criar rifa, cadastrar afiliado, registrar repasse ou publicar resultado.

## Como o dinheiro circula

O pagamento sempre entra pela plataforma, direto para a conta da organização. O afiliado
**não recebe dinheiro do comprador** — sua venda e sua comissão são registradas pelo sistema, e o
repasse é feito depois pela organizadora, com registro de auditoria. Isso mantém toda a
arrecadação rastreável.

## Como o sorteio é apurado

O número vencedor não é escolhido pela organizadora: ele é **derivado do 1º prêmio da Loteria
Federal** (últimos dígitos, conforme o tamanho da rifa). Qualquer participante confere o resultado
no site da Caixa Econômica Federal. A rifa registra o concurso usado e os prêmios que originaram
o número.

## Stack

- **Next.js 14** (App Router) — front-end e API no mesmo projeto
- **PostgreSQL + Prisma** — persistência
- **Mercado Pago** — cobrança PIX com webhook assinado
- **Tailwind CSS** — interface

## Configuração

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL, JWT_SECRET e as chaves do Mercado Pago
npx prisma migrate dev --name init
SEED_SENHA_ORGANIZADORA="sua-senha-forte" npm run db:seed
npm run dev
```

O seed **não cria senha padrão** — ele exige `SEED_SENHA_ORGANIZADORA`, para o sistema nunca subir
com credencial conhecida.

## Webhook do Mercado Pago

Configure a URL de notificação no painel do Mercado Pago apontando para:

```
https://SEU-DOMINIO/api/webhooks/mercadopago
```

O segredo da assinatura vai em `MERCADOPAGO_WEBHOOK_SECRET`. Notificações sem assinatura válida
são rejeitadas com 401 — sem isso, qualquer pessoa poderia forjar uma confirmação de pagamento.

Além do webhook, a tela de pagamento também consulta o status direto no provedor a cada poucos
segundos, então uma notificação atrasada não deixa o comprador esperando.

## E-mail de confirmação

Quando um pagamento é confirmado, o comprador recebe um e-mail com seus números e o código da
compra, enviado via [Resend](https://resend.com). É **opcional**: sem `RESEND_API_KEY` e
`EMAIL_REMETENTE`, o sistema funciona normalmente e apenas registra no log que não enviou —
falha de e-mail nunca invalida um pagamento já recebido.

## Exportação de relatório

Na aba **Rifas**, o botão "Exportar CSV" baixa a planilha completa de uma rifa: compras,
compradores, números, valores, data de pagamento, afiliado responsável e comissão. O arquivo sai
com BOM e separador `;`, então abre direto no Excel em português com acentuação correta.

## Decisões que sustentam a operação

1. **Dinheiro nunca é float** — todos os valores são `Decimal(10,2)` no banco e `Prisma.Decimal`
   no código.
2. **Reserva é atômica** — a reserva de números acontece dentro de uma transação com verificação
   de contagem: ou todos os números escolhidos são reservados, ou nada acontece. Dois compradores
   não conseguem levar o mesmo número.
3. **Reserva expira sozinha** — números presos em compras não pagas voltam ao estoque
   automaticamente, sem depender de cron.
4. **Confirmação é idempotente** — reprocessar o mesmo webhook não duplica comissão nem
   reescreve a data de pagamento.
5. **Auditoria** — login, criação de rifa, publicação de resultado, pagamento de comissão,
   exportação de relatório e webhooks ficam registrados em `LogAuditoria`.
6. **CSV não vira fórmula** — campos exportados que começam com `=`, `+`, `-` ou `@` são
   neutralizados, para que um nome cadastrado como `=HYPERLINK(...)` não seja executado ao abrir
   a planilha.

## Conformidade

Rifas beneficentes no Brasil são reguladas. Antes de vender, confirme a situação da sua
organização quanto à autorização aplicável (a Lei 13.756/2018 e as regras da SECAP tratam de
sorteios filantrópicos; há também exigências estaduais/municipais conforme o caso). Os campos
`autorizacaoNumero` e `regulamentoUrl` da rifa existem para exibir esses dados publicamente na
página de venda.
