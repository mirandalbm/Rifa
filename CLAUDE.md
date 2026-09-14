# Notas para quem for mexer aqui

## O que este projeto é

Plataforma multi-rifas: várias campanhas no ar ao mesmo tempo sob um
administrador geral. Um app, três superfícies separadas por papel de sessão.
O plano completo está em `docs/PLANO-RIFA.md` — leia antes de mudar
arquitetura.

## Invariantes (quebrar qualquer uma destas é bug grave)

1. **Cota é vendida uma vez só.** A exclusividade é a PK `(campaign_id, number)`.
   Reserva é `INSERT … ON CONFLICT DO NOTHING`. Nunca consultar disponibilidade
   numa query e gravar em outra.
2. **Nunca materializar cota.** Campanha de 1M nasce com zero linhas em
   `quota_alloc`. Se você se pegar escrevendo `generate_series` fora do
   `enterEndgame`, pare.
3. **Nunca `COUNT(*)` para progresso.** Use `campaign_stats`, atualizado na
   mesma transação da alocação.
4. **Dinheiro é inteiro, em centavos.** O front nunca envia preço: envia
   campanha e quantidade. O total é recalculado em `services/orders.ts`.
5. **Webhook é idempotente.** Chave `(provider, external_id)` em
   `webhook_events`. Assinatura validada no provedor; o redirect do navegador
   não vale como prova de pagamento.
6. **O total de cotas trava ao publicar.** `assertEditable()` em
   `services/campaigns.ts`. Mudar depois alteraria a chance de quem já comprou.
7. **Comissão tem carência.** Nasce `pending`, vira `available` só depois da
   janela de estorno e do sorteio. Autoindicação é bloqueada por telefone.
8. **A autorização SPA/MF é da campanha.** Sem `authorizationCode` a campanha
   não publica. A plataforma não é homologada em bloco — a Lei 5.768/71
   autoriza o promotor.

## Onde mexer

| Quero… | Vá em |
|---|---|
| mudar quem acessa o quê | `shared/access.ts` (cliente e servidor leem daqui) |
| mexer em reserva/alocação | `server/services/quotas.ts` |
| mexer no fluxo do pedido | `server/services/orders.ts` |
| trocar o provedor de pagamento | `server/payments/` — implemente `PaymentProvider` |
| regras de publicação e mídia | `server/services/campaigns.ts`, `server/routes/admin.ts` |
| sorteio | `server/services/draw.ts` |
| segundo fator | `server/services/totp.ts` |
| variantes de imagem | `server/services/images.ts` |
| cadastro/cupom/kit do afiliado | `server/routes/public.ts`, `server/routes/affiliate.ts` |

## Convenções

- Português nos textos de interface, mensagens de erro e comentários.
- Todo número que o usuário lê (cota, real, prazo, percentual) usa a classe
  `tnum` — DM Mono com algarismo tabular.
- Estado nunca é comunicado só por cor: use `<Pill>`, que traz rótulo em texto.
- Paleta: branco de fundo; verde = dinheiro que entrou; amarelo = espera e
  prêmio; vermelho = erro. Cor sem significado é ruído.

## O que ainda não existe

- Notificação por WhatsApp (o código de acesso volta na resposta em
  desenvolvimento). É item da Fase 3.
- Pôster extraído do vídeo e transcode: hoje servimos o arquivo original. A
  medição e os limites já existem; falta o processamento. Cloudflare Stream
  resolve os dois de fábrica.
- Cotas premiadas e ranking: o servidor já revela a cota premiada no pagamento
  e já responde o ranking, mas nenhuma tela mostra. Fase 3.
- Fila (BullMQ): os dois relógios rodam com `setInterval` no processo, agora
  protegidos por trava de aplicação do Postgres — com várias réplicas só uma
  executa. Serve bem; a fila entra quando houver trabalho pesado de verdade.

## Mídia — o que não pode afrouxar

A duração do vídeo e as dimensões da imagem são medidas em
`server/services/probe.ts`, lendo o arquivo já armazenado. **Nunca** aceite o
valor vindo do cliente: o limite de 60 s é promessa de tela e forjar um campo
JSON é trivial. Se for aceitar um container novo (WebM, por exemplo), implemente
a medição junto — sem medir, não entra na lista de mimes.
