# Plano da Fase 5 — vitrine, contas, afiliados e marketing

Plano por prioridade, com as decisões já tomadas pelo responsável (26/09/2026).
Cada etapa sai num PR próprio; `docs/PENDENCIAS.md` marca o que fechou.

Legenda: **[decidido]** respondido pelo responsável; **[aberto]** falta
resposta; **[você]** depende de cadastro, documento ou conta externa.

---

## P0 — Dados legais da campanha (bloqueia publicar)

O servidor exige autorização SPA/MF e data do sorteio para publicar, mas o
painel não tinha onde preencher: nenhuma rifa publicava pelo painel.

- Número do certificado de autorização, arquivo do certificado (PDF, JPG ou
  PNG) e data e hora do sorteio, em "Ajustar" da campanha.
- O arquivo fica no banco (não depende do R2) e é público só depois de
  publicada — é o documento que o apostador tem direito de conferir.
- Autorização e data **travam ao publicar**, como o total de cotas.
  Adiamento autorizado vira fluxo próprio do administrador geral, depois.

## P1 — Contas e localização

### P1a. Conta do apostador **[decidido]**
- Entrar com **telefone, CPF ou e-mail + senha**, ou **Google**.
- "Criar conta" e "Quero ser afiliado" na tela Entrar e no topo da vitrine.
- A conta vale para todas as rifas de todas as organizações.
- Tira "Minhas cotas" e o reembolso da dependência do código do WhatsApp
  (que espera a verificação da Meta). O código segue como opção.
- **[você]** Google: criar o cliente OAuth no Google Cloud e passar o ID.

### P1b. Endereço do organizador e estado da rifa
- Organização com CEP, rua, número, bairro, cidade e UF (CEP preenche o
  resto). A rifa herda a UF da promotora.
- Toda rifa é nacional; a localização só **ordena** (cidade → estado →
  resto do país). É também o que alimenta o carrossel de estados (P2).

## P2 — Vitrine nova **[decidido]**

Ordem da tela inicial, de cima para baixo:

1. **Banners da plataforma** — carrossel com até 5 avisos e marketing. O
   administrador geral define o tempo de cada um (ou um tempo igual para
   todos). Organizador pode **pagar** para a rifa dele ficar mais tempo
   nesse topo.
2. **Estados** — carrossel de círculos (como os stories do Instagram) com a
   bandeira de cada estado que tem rifa no ar. Toque leva a `/estado/UF`.
3. **Rifas patrocinadas** — carrossel de 5 banners de rifa, **comprados por
   clique** no painel do organizador; o preço do clique é do administrador
   geral. O saldo de cliques é pago antes (Pix) e o banner sai do ar quando
   acaba. Clique conta uma vez por visitante em 24 h, e robô não conta.
4. **Rifas** — em cartão no formato de publicação do Instagram (retrato
   4:5, 1080×1350), com foto e nome do organizador no topo do cartão.

Perfil do organizador:
- Foto, capa, cidade, rifas no ar e encerradas, botão **Seguir**.
- **Stories**: imagem ou vídeo curto que some em 24 h, na roda do topo do
  perfil e numa faixa da vitrine para quem segue.

Sugestões para entrar junto (baratas agora, caras depois):
- Quem segue recebe aviso de **rifa nova** do organizador (WhatsApp ou
  notificação do app).
- Botão **compartilhar** no cartão (WhatsApp), já com o link de afiliado
  de quem compartilha, se for afiliado.
- Selo **"Autorizada SPA/MF"** no cartão, com o número — é o que separa a
  rifa legal da clandestina aos olhos de quem compra.

Visual: inspirado no layout enviado (carrosséis, círculos, cartões), com a
identidade da própria plataforma — nada de imagem ou marca de terceiros.
**[aberto]** fundo escuro como o exemplo, ou manter o branco atual?

**[você]** Cloudflare R2 precisa estar configurado: banner, foto de perfil,
capa e story são arquivos grandes demais para o banco.

## P3 — Afiliado de todas as organizações **[decidido]**

- **Afiliado avulso**: cadastro sem organização; escolhe as rifas que quer
  divulgar e pode aderir a quantas organizações quiser.
- **Termo de adesão**: cada organização escreve regras e ganhos. Antes de
  divulgar, o afiliado vê o termo (percentual, quando recebe, quem paga,
  regras) e aceita. O aceite fica registrado com cópia do texto, data,
  versão, IP e aparelho.
- **O termo não muda com rifa em andamento.** Ele é fotografado na
  publicação de cada rifa, como o total de cotas: vale até o sorteio. A
  organização edita o termo a qualquer hora, mas a versão nova vale para as
  rifas que publicar depois. Quando uma versão nova entra em vigor, o
  afiliado vê o termo novo; se não aceitar, o vínculo é desfeito
  automaticamente (sem perder o que já ganhou).
- **O dinheiro da comissão fica na conta da plataforma**, não do
  organizador: no split do Pix, a parte do promotor vai para ele e a
  comissão fica retida com a plataforma, que paga depois do resultado. O
  organizador não alcança esse valor.
- **Ganhos sempre depois do resultado do sorteio.** A comissão aparece a
  cada venda, mas só é sacável depois que o resultado sai. A opção "na hora
  do pagamento" deixa de existir.
- **Cadastro fiscal do afiliado na plataforma**: RG, CPF, comprovante de
  residência e conta bancária, com cópia dos documentos guardada pela
  plataforma (criptografada, acesso auditado, nunca visível ao organizador).
- **Recibo assinado a cada pagamento**: declaração com os dados do afiliado,
  valor, origem (organização, rifa, pedidos) e aceite eletrônico, gerada em
  PDF e guardada. É o respaldo da plataforma perante o fisco.
- **Extrato por origem**: cada comissão com organização, rifa e pedido;
  totais por organização e por situação (aguardando sorteio, disponível,
  paga).
- **[você]** Contador: retenção de IR/INSS no pagamento a pessoa física
  (RPA), nota fiscal de MEI/PJ, e o enquadramento de a plataforma guardar
  dinheiro de terceiros até o sorteio.

## P4 — Reembolso: prazo, disputa e taxa

- **Reembolso só até 2 horas antes do sorteio.** Depois disso o botão some e
  o servidor recusa. **[decidido]**
- **Disputa no administrador geral**: quem decide se o reembolso é devido
  passa a ser o painel do administrador geral, não mais a organização
  sozinha. **[decidido]**
- **[aberto]** A regra dos 70/30 precisa ser confirmada. A leitura
  proposta: num reembolso aprovado, o comprador recebe 70% do valor pago, a
  plataforma retém 30% como taxa administrativa, e a comissão do afiliado
  daquela venda é cancelada.
- **[você]** Advogado: reter parte do valor num reembolso pode ser
  questionado pelo Código de Defesa do Consumidor; a taxa precisa estar no
  regulamento da rifa e aparecer antes da compra.

## P5 — Marketing e tráfego pago

- Pixels por organização e da plataforma: Meta, Google Ads/GA4, TikTok.
- A compra conta pelo servidor, na confirmação do pagamento (não pelo
  navegador), para o anúncio não contar Pix que não foi pago.
- Links com UTM e relatório "vendas por origem".
- Aviso de cookies (LGPD): pixel só carrega depois do aceite.
- **[você]** Meta e Google restringem anúncio de sorteio: confirmar que a
  conta de anúncios pode rodar esse tipo de campanha antes de investir.

---

## Ordem de entrega

| # | Etapa | Depende de |
|---|---|---|
| 1 | P0 dados legais da campanha | — |
| 2 | P1a conta do apostador (senha) | — |
| 3 | P1b endereço e estado | — |
| 4 | P4 prazo de 2 h antes do sorteio | — |
| 5 | P2 vitrine: estados, cartões, perfil, seguir | P1b |
| 6 | P2 banners da plataforma e stories | R2 |
| 7 | P2 patrocínio por clique | Pix da plataforma |
| 8 | P3 afiliado multi-organização e termo | — |
| 9 | P3 custódia, cadastro fiscal e recibo | contador |
| 10 | P4 disputa e taxa 70/30 | resposta [aberto] |
| 11 | P1a login com Google | cliente OAuth |
| 12 | P5 marketing | conta de anúncios |
