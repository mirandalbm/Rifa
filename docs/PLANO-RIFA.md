# Plano de Construção — Plataforma de Rifas (Usuário · Afiliado · Admin)

> Documento de arquitetura e roadmap. Versão 1 — setembro/2026.
> Escopo: plataforma de rifas online com três superfícies (comprador, afiliado, administrador),
> pagamento Pix automático, atribuição de vendas por link de afiliado e sorteio auditável.
> **Escala definida: até 1.000.000 de cotas por campanha, com o total fixado pelo administrador
> na criação e imutável depois da publicação.**
> **Sistema multi-rifas: várias campanhas no ar ao mesmo tempo, sob um administrador geral,
> cada uma com banner, 5 fotos do prêmio e um vídeo de até 60 segundos.**

---

## 1. Benchmark — o que o mercado já resolveu

Levantamento feito sobre plataformas brasileiras de rifa online em operação (Rifei, 123Rifas,
Plataforma Rifa, Premium Sorte, NC Brasil, Riffas, RifaOn, Rifa4.me, Sistema de Rifas Online)
e sobre scripts vendidos como produto (Script Rifa 10.0, Sistema de Rifas com Afiliados).
Padrões que se repetem em praticamente todas elas:

| Padrão de mercado | Como aparece nas plataformas | Nossa decisão |
|---|---|---|
| **Pix automático com liberação em segundos** | Reserva → cobrança Pix → webhook do PSP → cota liberada sem conferência manual de comprovante | Obrigatório no MVP |
| **Reserva com expiração** | Cota reservada por 10–30 min (algumas por dias); sem pagamento, volta ao estoque | Obrigatório, TTL configurável por campanha |
| **Escala de cotas** | De 100 até 1.000.000+ cotas por campanha | **Até 1.000.000, definido pelo admin na criação — arquitetura esparsa desde a Fase 1** |
| **Cotas premiadas** | Números com prêmio instantâneo, revelados na compra | v1 |
| **Ranking de maiores compradores** | Painel público que premia quem compra mais | v1 |
| **Pacotes / "compra rápida"** | Botões +5 / +10 / +50 / +100 com desconto progressivo | MVP |
| **Sorteio pela Loteria Federal** | Vínculo entre número da cota e o resultado oficial (ex.: últimos dígitos do 1º prêmio) | MVP (+ modo "sorteio próprio auditável") |
| **Afiliados / revendedores nativos** | Link único, cupom próprio, painel de vendas, comissão configurável, saque via Pix | Pilar do produto |
| **Notificação por WhatsApp/e-mail** | Confirmação de pagamento, lembrete de reserva, aviso de sorteio | v1 |
| **Dinheiro direto na conta do organizador** | O PSP é do organizador; a plataforma não é custodiante | Decisão arquitetural (ver §7) |
| **Consulta por telefone/CPF** | Comprador acha as cotas sem criar senha | MVP |

O que a maioria **não** faz bem e é onde a nossa se diferencia:
atribuição de afiliado à prova de perda (first-touch persistente + reconciliação no webhook),
extrato financeiro auditável por campanha, e uma experiência de compra que não parece um script PHP de 2018.

---

## 2. As três superfícies

### 2.1 Comprador (público, sem login obrigatório)
- **Vitrine multi-rifas:** todas as campanhas no ar em uma tela, cada card com o banner da rifa,
  preço da cota, progresso e prazo. Ordenação por destaque, por encerramento próximo e por progresso.
- **Tela inicial da rifa:** banner, **vídeo de até 60 s do prêmio** (pôster primeiro, toque para tocar,
  nunca com som automático) e **galeria de 5 fotos** do que está sendo rifado, antes de qualquer
  outra informação. É a propaganda da campanha e é o que decide a venda.
- Seleção de cotas: **compra rápida** (quantidade + números aleatórios) e **escolha manual** em grade paginada.
- Checkout enxuto: nome, telefone (WhatsApp), CPF opcional, aceite dos termos → QR Code Pix + copia-e-cola.
- Cronômetro de reserva visível, com liberação automática ao expirar.
- Confirmação automática pós-pagamento, com revelação de **cota premiada** quando houver.
- "Minhas cotas": consulta por telefone/CPF + código enviado por WhatsApp/SMS (sem senha).
- Ranking de compradores, regulamento, resultado do sorteio e comprovante da Loteria Federal.

### 2.2 Afiliado (login próprio)
- Onboarding: cadastro → aprovação do admin → chave Pix para recebimento.
- **Link único** (`/r/{slug}?ref=CODIGO`) e **cupom** opcional com desconto ao comprador.
- Painel: cliques, conversões, taxa de conversão, receita gerada, comissão pendente/liberada/paga.
- Material de divulgação: imagens da campanha, textos prontos, QR do link, UTMs.
- Extrato de comissões por pedido, com status e data prevista de liberação.
- Solicitação de saque via Pix, com histórico e comprovantes.
- Regras claras: percentual por campanha, janela de atribuição, carência pós-sorteio, estorno reverte comissão.

### 2.3 Administrador geral (login + 2FA)
- Dashboard: receita, cotas vendidas, ticket médio, conversão do funil, vendas por canal/afiliado, série temporal.
- CRUD de campanhas: prêmio, mídia, **total de cotas (100 a 1.000.000)**, preço, pacotes, cotas
  premiadas, TTL de reserva, data do sorteio, regulamento, status
  (rascunho → publicada → encerrada → sorteada).
- **Mídia da campanha:** upload do banner, de até 5 fotos e de 1 vídeo de no máximo 60 segundos,
  com reordenação, texto alternativo por foto e verificação de duração no servidor (§4.2).
- **O total de cotas é escolhido antes de publicar e trava na publicação.** Enquanto a campanha é
  rascunho, o campo é livre; publicada, fica somente leitura — mudar o total depois altera a chance
  de quem já comprou, o que quebra o regulamento e a confiança.
- Pedidos: busca, detalhe, estorno, liberação manual, reenvio de confirmação.
- Afiliados: aprovar/bloquear, definir comissão (global e por campanha), aprovar saques, ver ranking.
- Financeiro: conciliação com o PSP, comissões a pagar, exportação CSV/XLSX.
- Sorteio: registrar resultado da Loteria Federal ou executar sorteio auditável (seed + hash publicados).
- Configurações: marca, domínio, gateway, mensagens, termos, antifraude.
- **Trilha de auditoria** de toda ação administrativa (quem, o quê, quando, de onde).

---

## 3. Compilado de ferramentas (stack)

O repositório já traz uma base útil (React 18 + Vite + Express + Drizzle + Neon + shadcn/ui + TanStack Query).
Aproveitamos a base e substituímos o domínio.

| Camada | Escolha | Alternativa avaliada | Por quê |
|---|---|---|---|
| Front-end | **React 18 + Vite + TypeScript** | Next.js 15 | Já instalado; SSR não é crítico — SEO da campanha é resolvido com pré-render de rota pública |
| Roteamento | **wouter** | React Router | Já no projeto, 2 kB |
| Estado servidor | **TanStack Query v5** | SWR | Já no projeto; cache e revalidação do grid de cotas |
| UI | **Tailwind + shadcn/ui (Radix)** | MUI | Controle total do visual; acessível por padrão |
| Animação | **Framer Motion** | CSS puro | Micro-interações do grid e do contador |
| Back-end | **Express + TypeScript** | Fastify / NestJS | Já no projeto; migrar depois se precisar |
| ORM | **Drizzle ORM** | Prisma | Já no projeto; SQL explícito ajuda no lock de cotas |
| Banco | **PostgreSQL (Neon)** | Supabase | Transações e `SELECT ... FOR UPDATE SKIP LOCKED` para reserva concorrente |
| Cache/fila | **Redis (Upstash) + BullMQ** | pg-boss | Expiração de reservas, webhooks, notificações, rate limit |
| Pagamento | **Mercado Pago** (Pix + cartão) | **Asaas** (split nativo), Efí, Pagar.me | Pix com webhook confiável; Asaas se o split automático virar requisito |
| Split de comissão | **Ledger interno + repasse Pix em lote** | Split nativo do PSP | Comissão só é devida após janela de estorno; split na hora trava o dinheiro cedo |
| Autenticação | **Sessão Postgres (admin/afiliado) + OTP por WhatsApp (comprador)** | Clerk/Auth0 | Comprador não deve precisar de senha |
| Notificação | **WhatsApp Cloud API + Resend (e-mail)** | Twilio, SendGrid | WhatsApp é o canal real desse público |
| Mídia (imagem) | **Cloudflare R2 + variantes responsivas AVIF/WebP** | S3 + Imgproxy | Custo de egress zero |
| Mídia (vídeo) | **Cloudflare Stream** (transcode, HLS, pôster) | Mux, ffmpeg próprio em worker | Vídeo de 60 s por campanha não justifica manter pipeline próprio |
| Observabilidade | **Sentry + logs estruturados (pino)** | Datadog | Erro de pagamento precisa ser rastreável por pedido |
| Analytics | **PostHog** (funil + eventos de afiliado) | GA4 | Funil de checkout e atribuição no mesmo lugar |
| Antifraude | **Rate limit por IP/telefone + limite de cotas por pedido + device fingerprint** | Serviço externo | Suficiente para o risco do MVP |
| Testes | **Vitest + Playwright** (Playwright já instalado) | Cypress | E2E do checkout é o teste que mais importa |
| Deploy | **Fly.io / Railway + Neon + R2** | Vercel + serverless | Worker de fila precisa de processo longo |

---

## 4. Modelo de dados (essencial)

```
users            id, role(admin|affiliate|buyer), name, email, phone, password_hash?, status, created_at
campaigns        id, organization_id?, slug, title, description, prize, total_quotas, price_cents,
                 featured, sort_weight,
                 min_per_order, max_per_order, reservation_ttl_min, draw_type(federal|own),
                 draw_at, status, commission_pct_default, published_at
campaign_media   id, campaign_id, role(banner|photo|video), position, storage_key, mime,
                 width, height, duration_s?, poster_key?, alt_text, bytes, status, created_at
                 -- 1 banner, até 5 photos, até 1 video (<= 60 s). Ver §4.2
quota_packages   id, campaign_id, quantity, discount_pct, highlight
quota_alloc      campaign_id, number, status(reserved|paid), order_id, reserved_until?
                 -- PK (campaign_id, number). Só existe linha para cota TOMADA. Ver §4.1
campaign_stats   campaign_id, sold_count, reserved_count, revenue_cents, updated_at
                 -- contador incremental; nunca COUNT(*) em 1M de linhas
free_pool        campaign_id, number   -- materializado só no endgame (>85% vendido). Ver §4.1
prized_quotas    id, campaign_id, number, prize_label, claimed_by_order_id?, claimed_at?
orders           id, campaign_id, buyer_id, quantity, amount_cents, discount_cents,
                 status(pending|paid|expired|refunded), affiliate_id?, coupon_id?,
                 psp_charge_id, pix_qr, expires_at, paid_at
buyers           id, name, phone, cpf?, email?  -- identidade leve, sem senha
affiliates       id, user_id, code, pix_key, commission_pct?, status, approved_at
coupons          id, campaign_id?, affiliate_id?, code, discount_pct, max_uses, expires_at
click_events     id, affiliate_id, campaign_id, session_id, ip_hash, ua_hash, created_at
commissions      id, affiliate_id, order_id, amount_cents, status(pending|available|paid|reversed),
                 available_at, payout_id?
payouts          id, affiliate_id, amount_cents, pix_key, status, receipt_url, processed_at
draws            id, campaign_id, method, federal_contest?, seed, seed_hash, result_number,
                 winner_order_id, evidence_url, executed_at
webhook_events   id, provider, external_id UNIQUE, payload, processed_at   -- idempotência
audit_log        id, actor_id, action, entity, entity_id, diff, ip, created_at
```

---

## 4.1 Cotas em escala — até 1.000.000 por campanha

O total é escolhido pelo administrador na criação (100 a 1.000.000) e trava ao publicar. Isso permite
uma decisão arquitetural que vale para o menor e o maior caso ao mesmo tempo.

### Nunca materializar 1M de linhas na criação

Uma linha por número significaria 1.000.000 de inserts para publicar uma campanha — dezenas de
segundos de espera, índice inchado e custo pago antes da primeira venda. Em vez disso:

> **Só existe linha para cota tomada.** Disponível é a ausência de linha.
> Uma campanha de 1M nasce com zero linhas e cresce conforme vende.

O total é só um número em `campaigns.total_quotas`; a numeração vai de `1` a `total_quotas`, exibida
com zero à esquerda no comprimento do total (1.000.000 -> `0000001`, 10.000 -> `0001`).

### Alocação sem trava de linha

A reserva deixa de ser `SELECT ... FOR UPDATE` e passa a ser **insert com conflito**, que é lock-free
e escala melhor sob concorrência:

```sql
INSERT INTO quota_alloc (campaign_id, number, order_id, status, reserved_until)
SELECT $1, n, $2, 'reserved', now() + $3
FROM unnest($4::int[]) AS n
ON CONFLICT (campaign_id, number) DO NOTHING
RETURNING number;
```

- **Compra rápida (95% das vendas):** o servidor sorteia N candidatos com CSPRNG, tenta inserir o
  lote, conta o que entrou e repete só a diferença. Nenhuma trava, nenhuma varredura.
- **Escolha manual:** o mesmo insert com a lista escolhida; o que conflitar volta como
  "esses números acabaram de ser levados", e o comprador escolhe de novo.
- **Endgame (>85% vendido):** a amostragem aleatória começa a colidir demais. Ao cruzar o limiar,
  um job materializa `free_pool` com os números restantes (no máximo 150 mil linhas) e a alocação
  passa a ser `DELETE ... WHERE number IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT n) RETURNING`.
  A expiração de reserva devolve o número ao pool.

### Contagem sem COUNT(*)

`campaign_stats` guarda vendidas, reservadas e arrecadação, atualizado na mesma transação da
alocação e do webhook. A barra de progresso e o painel leem uma linha, nunca agregam 1M.

### O mapa de números no navegador

Nunca renderizar 1M de células. A tela do comprador tem três caminhos, nessa ordem de destaque:

1. **Compra rápida** — quantidade + números aleatórios. É o caminho padrão e o mais usado.
2. **Busca direta** — o comprador digita `847.219` e vê só aquele número e a vizinhança.
3. **Navegador de blocos** — 1.000 blocos de 1.000 números, com uma faixa de ocupação mostrando
   onde ainda há espaço. Só o bloco aberto é renderizado (1.000 células virtualizadas).

A API devolve a ocupação de um bloco como **bitmap** (1.000 bits = 125 bytes em base64), não como
lista de números. Um bloco cheio e um bloco vazio custam o mesmo: 125 bytes.

### Orçamento de desempenho (vira teste na Fase 1)

| Operação | Alvo | Como |
|---|---|---|
| Publicar campanha de 1M | < 300 ms | nenhuma linha de cota criada |
| Abrir a página no celular | < 2 s | stats + 1 bitmap de bloco |
| Carregar um bloco | < 100 ms | `WHERE number BETWEEN a AND b` na PK |
| Reservar 50 cotas aleatórias | < 150 ms | 1 a 2 inserts em lote |
| Reservar no endgame | < 200 ms | pop do `free_pool` com SKIP LOCKED |

---

## 4.2 Mídia da campanha — banner, 5 fotos e vídeo de 60 s

A tela inicial de cada rifa é uma peça de propaganda. Três formatos, com limites duros validados no
servidor — nunca no navegador.

| Papel | Quantidade | Formato aceito | Limites | Onde aparece |
|---|---|---|---|---|
| **Banner** | 1, obrigatório | JPG, PNG, WebP | 1600×900 (16:9) recomendado, mín. 1200 px de largura, 8 MB | Card da vitrine e topo da página da rifa |
| **Fotos do prêmio** | até 5, mín. 1 | JPG, PNG, WebP | mín. 1080 px no lado maior, 8 MB cada | Galeria logo abaixo do vídeo |
| **Vídeo do prêmio** | até 1, opcional | MP4, MOV, WebM | **máx. 60 s**, 300 MB, 16:9 ou 9:16 | Bloco de propaganda, acima da galeria |

### Pipeline de upload

```
1. Admin escolhe o arquivo → POST /admin/media/sign
   → o servidor devolve URL pré-assinada do R2 (o arquivo nunca passa pela nossa API)
2. Upload direto para o R2 → POST /admin/media/commit
3. Worker processa:
   imagem → variantes responsivas (400/800/1600 em AVIF + WebP) + LQIP de 20 px para o blur
   vídeo  → ffprobe mede a duração; > 60 s é REJEITADO com a duração medida na mensagem
          → transcode 720p H.264 + HLS + poster extraído do segundo 1
4. status vira `ready`; só então a mídia aparece na campanha
```

### Regras que protegem a venda

- **O vídeo nunca toca sozinho.** Carrega o pôster (uma imagem), e o `<video>` só é montado no toque.
  Autoplay com som espanta comprador e estoura a franquia de dados de quem chegou pelo WhatsApp.
- **Nenhuma mídia bloqueia o preço.** Banner e vídeo ocupam o topo, mas o preço da cota, o progresso
  e o botão de compra entram no primeiro quadro da tela, sem rolagem.
- **A duração é medida no servidor.** `ffprobe` na ingestão; o que o navegador diz não vale.
- **Texto alternativo obrigatório em cada foto** — acessibilidade e SEO da página da rifa.
- **Publicação bloqueada** sem banner e sem pelo menos 1 foto. O vídeo é opcional.
- **Orçamento de peso:** a tela inicial da rifa carrega no máximo 400 KB de imagem antes da
  interação; o vídeo só baixa depois do toque.

---

## 5. Fluxo de compra e atribuição do afiliado

```
1. Clique no link  /r/campanha?ref=JOAO7
   → grava click_event, seta cookie first-party `aff` (30 dias, SameSite=Lax) + localStorage de backup
2. Seleção de cotas → POST /orders
   → INSERT ... ON CONFLICT DO NOTHING em quota_alloc (ver §4.1); o que não entrou é re-sorteado
   → campaign_stats.reserved_count += inseridos, na mesma transação
   → order.affiliate_id resolvido na criação (cookie → cupom → último clique da sessão)
3. Cobrança Pix criada no PSP → QR + copia-e-cola devolvidos ao cliente
4. Webhook do PSP (idempotente por external_id)
   → order.paid, quota_alloc.status = paid, cota premiada revelada
   → commission criada em `pending`, available_at = paid_at + janela de estorno (ex.: 7 dias)
   → notificação WhatsApp ao comprador e ao afiliado
5. Job de expiração (a cada minuto)
   → DELETE das linhas reservadas vencidas (o número volta a existir por ausência),
     devolução ao free_pool se a campanha estiver em endgame, ordem vira `expired`
6. Estorno → commission vira `reversed`; se já paga, vira débito no saldo do afiliado
```

**Regras de atribuição (documentar no regulamento do afiliado):**
- Modelo **first-touch** dentro de 30 dias; cupom digitado no checkout sobrepõe o cookie.
- Autoindicação bloqueada (mesmo telefone/CPF/dispositivo do afiliado).
- Comissão calculada sobre o valor líquido pago (após cupom, antes da taxa do PSP) — parâmetro por campanha.
- Carência: liberação só após o sorteio ou após N dias do pagamento, o que vier depois.

---

## 6. Regras críticas de engenharia

1. **Concorrência de cotas** — a chave primária `(campaign_id, number)` é quem garante a exclusividade:
   reserva é `INSERT ... ON CONFLICT DO NOTHING`, e o que não entrou simplesmente não é do comprador.
   No endgame, pop do `free_pool` com `FOR UPDATE SKIP LOCKED`. Nunca reservar em memória, nunca
   checar disponibilidade em uma query separada da escrita.
2. **Idempotência de webhook** — `webhook_events.external_id` único; reprocessamento é no-op.
   Validar assinatura do PSP; nunca confiar em redirect de sucesso do browser.
3. **Dinheiro em centavos, inteiro** — nada de float. Totais recalculados no servidor, sempre.
4. **Estado do pedido é do servidor** — o front nunca envia preço; envia campanha + quantidade/números.
5. **Sorteio auditável em qualquer escala** — o 1º prêmio da Loteria Federal tem 5 dígitos, o que
   endereça no máximo 100.000 cotas. Para campanhas maiores — e 1.000.000 é o nosso teto — o
   mapeamento direto não existe. A regra única, que serve de 100 a 1.000.000:

   ```
   seed_hash publicado ANTES da primeira venda
   numero = 1 + (HMAC_SHA256(seed || os 5 premios do concurso federal) mod total_quotas)
            com rejeicao de amostra para eliminar vies de modulo
   ```

   O resultado federal é a entropia pública (ninguém controla), a semente é o compromisso prévio
   (nós não escolhemos depois), e qualquer pessoa refaz a conta. Guardar seed, seed_hash, concurso,
   os 5 prêmios e o comprovante oficial.
6. **LGPD** — telefone e CPF minimizados, IP e user-agent guardados como hash, política de retenção,
   consentimento explícito no checkout, exportação e exclusão a pedido.
7. **Conformidade** — a autorização (Lei 5.768/71, regulamentada pelo Decreto 70.951/72) é da
   **campanha e do promotor** perante a SPA/MF (ex-SECAP), não do software. A plataforma deve
   exigir e armazenar o certificado de autorização por campanha e exibi-lo na página pública.
   Bloquear publicação sem esse campo preenchido é decisão de produto recomendada.

---

## 7. Modelo financeiro

**Escolha:** o PSP é da conta do organizador; o dinheiro cai direto para ele. A plataforma mantém um
**ledger interno** que registra comissão devida a cada afiliado e gera lotes de repasse Pix.

Motivos: (a) evita a plataforma operar como instituição de pagamento/custodiante;
(b) comissão só deve ser liberada após a janela de estorno e, em geral, após o sorteio;
(c) split nativo do PSP (Asaas/Mercado Pago) fica como opção para quem quiser repasse instantâneo —
a abstração `PaymentProvider` já prevê isso.

Interface de provedor a implementar:
`createPixCharge`, `getCharge`, `refund`, `verifyWebhook`, `createTransfer` (payout), `splitRules?`.

---

## 8. Roadmap

### Fase 0 — Fundação (1 semana)
Limpar o esqueleto herdado, definir design system, schema Drizzle inicial, autenticação admin,
CI (typecheck + lint + testes), ambientes.

### Fase 1 — MVP vendável (3 semanas)
Campanha (CRUD admin, total de até 1M travado na publicação) · **arquitetura esparsa de cotas
(§4.1) desde o primeiro commit** · **vitrine multi-rifas** · **pipeline de mídia: banner, 5 fotos e
vídeo de 60 s (§4.2)** · página da rifa com compra rápida, busca por número e navegador
de blocos · reserva com TTL · Pix automático + webhook · "minhas cotas" por telefone ·
sorteio auditável (semente + Federal) · dashboard básico.
**Critério de pronto:** uma campanha real de 1.000.000 de cotas vendida do início ao sorteio, sem
intervenção manual e dentro do orçamento de desempenho da §4.1.

### Fase 2 — Afiliados (2 semanas)
Cadastro e aprovação · link e cupom · rastreio de clique e atribuição · painel do afiliado ·
ledger de comissões · saques Pix · relatórios por afiliado no admin.
**Critério de pronto:** venda por link de afiliado creditada, liberada e paga, com extrato conferido.

### Fase 3 — Conversão (2 semanas)
Cotas premiadas · ranking de compradores · pacotes com desconto · notificações WhatsApp ·
recuperação de carrinho abandonado · prova social (últimas compras).

### Fase 4 — Operação e carga (2 semanas)
Endgame pool sob carga real · filas e workers · antifraude · trilha de auditoria · exportações ·
observabilidade · teste de carga de 1M de cotas com 500 compradores simultâneos ·
multi-organizador (white label) se o negócio pedir.

---

## 9. Riscos e decisões pendentes

| Risco / decisão | Impacto | Encaminhamento |
|---|---|---|
| Escolha do PSP (Mercado Pago × Asaas) | Alto — define split e prazos | Decidir antes da Fase 1; abstração isola |
| Regularização da campanha (SPA/MF) | Alto — jurídico | Campo obrigatório por campanha + orientação ao organizador |
| ~~Grid de 1M cotas no navegador~~ | **Decidido** | Armazenamento esparso + bitmap por bloco + busca direta (§4.1), desde a Fase 1 |
| Sorteio acima de 100.000 cotas | Alto — a Federal só dá 5 dígitos | Semente comprometida + HMAC sobre os 5 prêmios (§6.5); validar o texto com o jurídico |
| ~~Multi-rifas~~ | **Decidido** | Várias campanhas simultâneas sob um administrador geral, desde a Fase 1 |
| Multi-**organizador** (cada cliente com sua conta) | Médio — não é o mesmo que multi-rifas | `organization_id` nulo no schema desde já; ativar só se o negócio virar SaaS |
| Peso da mídia na tela inicial | Médio — conversão no 4G | Pôster em vez de vídeo, AVIF responsivo, orçamento de 400 KB (§4.2) |
| Fraude de autoindicação em afiliados | Médio — custo direto | Bloqueio por device/telefone + revisão manual acima de X |
| Aprovação do WhatsApp Cloud API | Médio — prazo | Iniciar cadastro na Fase 1, e-mail como fallback |

---

## 10. Design

Identidade, tokens, componentes e os mockups das quatro telas estão na apresentação visual do
plano (artefato publicado). Resumo do sistema:

**Paleta — branco, verde e amarelo.** Fundo branco em toda a plataforma, sem exceção de tela.

| Token | Hex | Papel |
|---|---|---|
| `--white` | `#FFFFFF` | fundo de tudo |
| `--mist` | `#F4F8F4` | superfície secundária, cabeçalho de tabela |
| `--green` | `#00873E` | ação primária, cota paga, comissão liberada |
| `--green-bright` | `#12B45C` | gráficos e hover |
| `--green-soft` | `#E6F5EC` | destaque de KPI, selo de sucesso |
| `--yellow` | `#FFC700` | reserva em curso, cota premiada, reta final |
| `--yellow-soft` | `#FFF6D6` | avisos e contadores |
| `--ink` | `#0B1F14` | texto |
| `--muted` | `#6B8475` | texto secundário |
| `--red` | `#B3372A` | expirado, estornado, erro |

Verde significa dinheiro que entrou. Amarelo significa espera ou prêmio. Vermelho significa erro.
Nenhuma das três cores decora nada — cor sem significado é ruído.

**Tipografia.** Bricolage Grotesque (display, 700/800) · Instrument Sans (texto) ·
DM Mono com algarismo tabular (cota, valor, prazo, percentual).

**Princípios.**

- **O número é o herói.** Cota em monoespaçada, grande e tabular. Tudo gira em torno da grade.
- **Estado legível em um relance, nunca só por cor.** Contorno = livre; contorno grosso = escolhida;
  tracejado = reservada; preenchido = paga; amarelo sólido = premiada. Sempre com rótulo em texto.
- **Checkout sem susto.** Cronômetro sempre visível, total fixo no rodapé, um botão verde por tela.
- **Mobile primeiro de verdade** — a venda acontece no celular, dentro do WhatsApp.
