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

## Várias rifas ao mesmo tempo

O sistema roda quantas rifas você quiser, simultâneas e independentes — cada uma com seu
tamanho, preço, prêmio, mídia e situação própria.

- **Nenhuma aberta** → a home avisa que não há rifa no momento.
- **Uma aberta** → a home leva direto para ela; ninguém vê uma lista de um item só.
- **Duas ou mais** → a home vira a vitrine, com capa, preço e barra de progresso de cada rifa.

Cada rifa tem endereço próprio (`/rifa/{id}`), que pode ser divulgado separadamente. O código de
indicação do afiliado (`?ref=`) sobrevive à vitrine: entra pela home e segue até a rifa escolhida,
então **um mesmo link de afiliado funciona para qualquer rifa** que o comprador escolher.

## Fotos e vídeo do prêmio

Cada rifa aceita **1 banner de capa, até 5 imagens e 1 vídeo**, enviados em
**Rifas → Fotos e vídeo**. O comprador vê a capa no topo e a galeria logo abaixo, com o vídeo e
as fotos ampliáveis ao toque.

| | Formatos | Tamanho máximo |
|---|---|---|
| Banner e imagens | JPG, PNG, WEBP | 5 MB cada |
| Vídeo | MP4, WEBM | 50 MB |

Banner e vídeo são únicos: enviar outro substitui o anterior, e o arquivo antigo só sai do disco
depois que o banco confirma a troca.

Arquivo enviado por terceiro é conteúdo hostil até prova em contrário, então:

- **O formato é decidido pelo conteúdo, não pelo que o navegador declara.** A assinatura dos
  primeiros bytes é conferida; um executável renomeado para `.jpg` é recusado.
- **SVG não é aceito**, mesmo sendo imagem: é XML, aceita `<script>` e executaria no domínio da
  rifa.
- **O nome do arquivo enviado é descartado.** A chave em disco é um UUID gerado pelo servidor —
  é por nomes de arquivo que entraria `../` e travessia de diretório.
- Na entrega, o `Content-Type` vem da assinatura conferida no upload, com `nosniff` para o
  navegador não adivinhar outro tipo e executar o conteúdo.

Os arquivos ficam em `MIDIA_DIR` (padrão `./midia`). **Em produção aponte para um volume
persistente** — o disco de um container é apagado a cada deploy, e as fotos sumiriam.

## Tamanho da rifa

A quantidade de números é definida pela organizadora ao criar cada rifa, de **10 a 10.000.000**.
O tamanho muda o comportamento do sistema em dois pontos:

| Tamanho | Como o comprador escolhe | Como os números são criados |
|---|---|---|
| até 2.000 | grade clicável, escolhe um a um | na hora |
| 2.001 a 100.000 | informa a quantidade, o sistema sorteia | na hora |
| acima de 100.000 | informa a quantidade, o sistema sorteia | em segundo plano, em blocos |

Medições reais (PostgreSQL 16, container de desenvolvimento):

| Números | Criar | Sortear 20 na compra | Home pública |
|---|---|---|---|
| 100.000 | 1,9 s | — | — |
| 1.000.000 | 25 s | — | — |
| 10.000.000 | 5,4 min | 16 ms | 137 ms |

### Quantos prêmios da Federal a apuração exige

Cada prêmio da Loteria Federal tem 5 dígitos, então **um prêmio sozinho só cobre rifas de até
100 mil números**. Acima disso, o sistema combina prêmios: o 1º forma as casas finais, o 2º as
cinco seguintes, e assim por diante.

| Tamanho da rifa | Prêmios necessários |
|---|---|
| até 100.000 | 1 (só o 1º prêmio) |
| 100.001 a 10.000.000 | 2 (1º e 2º prêmios) |

A tela de apuração pede exatamente os campos necessários, e o servidor **recusa publicar** com
prêmios de menos. Isso é deliberado: numa rifa de 10 milhões apurada só pelo 1º prêmio, o maior
número sorteável seria 99.999 — 99% dos compradores teriam chance zero, e nada na tela
denunciaria a injustiça.

Três decisões vêm daí:

1. **`generate_series` no Postgres, não `Array.from` no Node.** Montar 10 milhões de objetos em
   memória derrubaria o processo; assim o heap fica em 8 MB independentemente do tamanho.
2. **Rifa grande gera fora da requisição.** 5,4 minutos excede o limite de qualquer proxy, então
   a resposta sai na hora e a geração segue em blocos de 500 mil, com progresso em
   `Rifa.numerosGerados`. A venda **não abre** enquanto não terminar — abrir antes venderia uma
   rifa cujos números finais não existem, mas que ainda assim concorreriam no sorteio. Se o
   servidor cair no meio, o botão "Retomar" continua de onde parou (o insert usa
   `ON CONFLICT DO NOTHING`, então repetir é inofensivo).
3. **Contagem por subtração.** Contar números disponíveis diretamente varre quase a tabela
   inteira (746 ms por visita numa rifa de 10 milhões). Contam-se os ocupados, que são poucos,
   e o resto sai por subtração: 4 ms.

## Testes

```bash
npm test              # unidade — não precisa de banco
npm run test:integracao   # precisa de DATABASE_URL apontando para um Postgres de teste
npm run typecheck
```

**Unidade** cobre a lógica que não pode errar em dinheiro de doação: aritmética monetária
(`dinheiro.ts`), derivação do número vencedor a partir da Loteria Federal (`rifa.ts`) e escape
do CSV (`csv.ts`).

**Integração** roda contra PostgreSQL real e cobre o que só aparece com banco de verdade:

- duas compras simultâneas do mesmo número — exatamente uma vence
- lote parcialmente ocupado não deixa rastro (nem compra órfã, nem número preso)
- reserva expirada volta à venda, e compra **paga** nunca expira
- webhook reprocessado não duplica comissão nem reescreve a data do pagamento

> O banco usado no teste de integração é apagado e recriado à vontade — nunca aponte
> `DATABASE_URL` para produção ao rodá-lo.

Ainda **não** testado contra ambiente real: a chamada ao Mercado Pago (geração do PIX e
recebimento do webhook), que depende de credencial de sandbox.

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
