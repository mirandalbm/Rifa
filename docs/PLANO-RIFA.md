# Plano de Construção — Plataforma de Rifas (Usuário · Afiliado · Admin)

> Documento de arquitetura e roadmap. Versão 1 — setembro/2026.
> Escopo: plataforma de rifas online com três superfícies (comprador, afiliado, administrador),
> pagamento Pix automático, atribuição de vendas por link de afiliado e sorteio auditável.

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
| **Escala de cotas** | De 100 até 1.000.000+ cotas por campanha | Suporte a 10M via estratégia de cotas virtuais |
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
- Vitrine de campanhas ativas + página da campanha (galeria, prêmio, preço da cota, progresso, prazo).
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
- CRUD de campanhas: prêmio, mídia, total de cotas, preço, pacotes, cotas premiadas, TTL de reserva,
  data do sorteio, regulamento, status (rascunho → publicada → encerrada → sorteada).
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
| Mídia | **Cloudflare R2 + imagens responsivas** | S3 | Custo de egress zero |
| Observabilidade | **Sentry + logs estruturados (pino)** | Datadog | Erro de pagamento precisa ser rastreável por pedido |
| Analytics | **PostHog** (funil + eventos de afiliado) | GA4 | Funil de checkout e atribuição no mesmo lugar |
| Antifraude | **Rate limit por IP/telefone + limite de cotas por pedido + device fingerprint** | Serviço externo | Suficiente para o risco do MVP |
| Testes | **Vitest + Playwright** (Playwright já instalado) | Cypress | E2E do checkout é o teste que mais importa |
| Deploy | **Fly.io / Railway + Neon + R2** | Vercel + serverless | Worker de fila precisa de processo longo |

---

## 4. Modelo de dados (essencial)

```
users            id, role(admin|affiliate|buyer), name, email, phone, password_hash?, status, created_at
campaigns        id, slug, title, description, prize, media[], total_quotas, price_cents,
                 min_per_order, max_per_order, reservation_ttl_min, draw_type(federal|own),
                 draw_at, status, commission_pct_default, published_at
quota_packages   id, campaign_id, quantity, discount_pct, highlight
quotas           id, campaign_id, number, status(available|reserved|paid), order_id?, reserved_until?
                 -- índice único (campaign_id, number); materializado por lotes ou virtual em campanhas >100k
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

**Campanhas grandes (>100 mil cotas):** não materializar linha por cota. Guardar apenas as cotas
vendidas/reservadas e derivar disponibilidade por intervalo (`int4range` + exclusão), com o grid do
front paginado em blocos de 1.000.

---

## 5. Fluxo de compra e atribuição do afiliado

```
1. Clique no link  /r/campanha?ref=JOAO7
   → grava click_event, seta cookie first-party `aff` (30 dias, SameSite=Lax) + localStorage de backup
2. Seleção de cotas → POST /orders
   → transação: SELECT ... FOR UPDATE SKIP LOCKED nas cotas → status=reserved, reserved_until=now+TTL
   → order.affiliate_id resolvido na criação (cookie → cupom → último clique da sessão)
3. Cobrança Pix criada no PSP → QR + copia-e-cola devolvidos ao cliente
4. Webhook do PSP (idempotente por external_id)
   → order.paid, quotas.paid, cota premiada revelada
   → commission criada em `pending`, available_at = paid_at + janela de estorno (ex.: 7 dias)
   → notificação WhatsApp ao comprador e ao afiliado
5. Job de expiração (a cada minuto)
   → reservas vencidas voltam a `available`, ordem vira `expired`
6. Estorno → commission vira `reversed`; se já paga, vira débito no saldo do afiliado
```

**Regras de atribuição (documentar no regulamento do afiliado):**
- Modelo **first-touch** dentro de 30 dias; cupom digitado no checkout sobrepõe o cookie.
- Autoindicação bloqueada (mesmo telefone/CPF/dispositivo do afiliado).
- Comissão calculada sobre o valor líquido pago (após cupom, antes da taxa do PSP) — parâmetro por campanha.
- Carência: liberação só após o sorteio ou após N dias do pagamento, o que vier depois.

---

## 6. Regras críticas de engenharia

1. **Concorrência de cotas** — toda reserva acontece em transação única com `FOR UPDATE SKIP LOCKED`;
   índice único `(campaign_id, number)` é a última linha de defesa. Nunca reservar em memória.
2. **Idempotência de webhook** — `webhook_events.external_id` único; reprocessamento é no-op.
   Validar assinatura do PSP; nunca confiar em redirect de sucesso do browser.
3. **Dinheiro em centavos, inteiro** — nada de float. Totais recalculados no servidor, sempre.
4. **Estado do pedido é do servidor** — o front nunca envia preço; envia campanha + quantidade/números.
5. **Sorteio auditável** — no modo próprio, publicar `seed_hash` antes de vender e `seed` depois,
   com resultado derivado por HMAC; no modo federal, guardar o comprovante oficial do concurso.
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
Campanha (CRUD admin) · página pública · compra rápida e manual · reserva com TTL ·
Pix automático + webhook · "minhas cotas" por telefone · sorteio Loteria Federal · dashboard básico.
**Critério de pronto:** uma campanha real vendida do início ao sorteio, sem intervenção manual.

### Fase 2 — Afiliados (2 semanas)
Cadastro e aprovação · link e cupom · rastreio de clique e atribuição · painel do afiliado ·
ledger de comissões · saques Pix · relatórios por afiliado no admin.
**Critério de pronto:** venda por link de afiliado creditada, liberada e paga, com extrato conferido.

### Fase 3 — Conversão (2 semanas)
Cotas premiadas · ranking de compradores · pacotes com desconto · notificações WhatsApp ·
recuperação de carrinho abandonado · prova social (últimas compras).

### Fase 4 — Escala e operação (2 semanas)
Campanhas de 1M+ cotas · filas e workers · antifraude · trilha de auditoria · exportações ·
observabilidade · multi-organizador (white label) se o negócio pedir.

---

## 9. Riscos e decisões pendentes

| Risco / decisão | Impacto | Encaminhamento |
|---|---|---|
| Escolha do PSP (Mercado Pago × Asaas) | Alto — define split e prazos | Decidir antes da Fase 1; abstração isola |
| Regularização da campanha (SPA/MF) | Alto — jurídico | Campo obrigatório por campanha + orientação ao organizador |
| Grid de 1M cotas no navegador | Médio — performance | Virtualização + paginação por blocos; decidir na Fase 4 |
| Multi-organizador (SaaS) ou rifa própria | Alto — molda o schema | **Pergunta aberta ao cliente** |
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
