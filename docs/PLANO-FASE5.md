# Plano da Fase 5 — marketplace social de rifas

A plataforma vira um **marketplace social white label**:

- **marketplace** — todos os organizadores dentro da mesma plataforma, e o
  apostador joga em qualquer rifa de qualquer um;
- **social** — perfil de organizador no formato do Instagram, seguir,
  stories, destaques, compartilhar;
- **white label** — cada organizador personaliza o próprio perfil, e o
  administrador geral personaliza a plataforma inteira sem mexer em código.

Decisões do responsável até 26/09/2026. Cada etapa sai num PR próprio;
`docs/PENDENCIAS.md` marca o que fechou.

Legenda: **[decidido]** respondido; **[aberto]** falta resposta;
**[você]** depende de conta, documento ou profissional externo.

---

## 0. Feito

- **Dados legais da campanha** — número e arquivo do certificado SPA/MF e
  data do sorteio, travados ao publicar (PR #16).

---

## 1. Contas e dados do apostador

### 1.1 Conta do apostador **[decidido]**
- Entrar com **telefone, CPF ou e-mail + senha**, ou **Google**.
- "Criar conta" na tela Entrar e no topo da vitrine; a mesma conta joga em
  todas as rifas de todos os organizadores.
- Tira "Minhas cotas" e o reembolso da dependência do código do WhatsApp.
- **Feito:** conta com telefone confirmado só pelo código do WhatsApp; sem
  confirmar, a conta enxerga apenas o que comprou dentro dela.
- **[você]** Google: cliente OAuth no Google Cloud.

### 1.2 Exclusão de conta e dos dados (LGPD) **[decidido]**
- O apostador pede a exclusão pelo app; os dados pessoais são apagados ou
  anonimizados.
- Compras, bilhetes, recibos e o que o fisco ou a SPA/MF exigem ficam
  guardados pelo prazo legal, sem ligação com o perfil apagado.

### 1.3 De quem é o cliente **[decidido — feito]**

Dois tipos de apostador, com donos diferentes:

- **Cliente da plataforma** — quem se cadastra sozinho: direto no app, pelo
  link de um afiliado ou por qualquer caminho voluntário. Os dados pessoais
  (nome completo, telefone, CPF, e-mail) são da plataforma e **não aparecem
  no controle do organizador**: nas listas ele vê o pedido, as cotas e o
  valor, com o cliente identificado só pelo ID (`C-XXXXXXXX`).
- **Cliente do cambista** — quem compra na mão de um cambista, sem conta no
  app. Para jogar e poder receber o prêmio, ele é **cadastrado pelo
  cambista** (nome, telefone e CPF obrigatórios). Esse cliente é da
  organização do cambista e **é o único que aparece com os dados completos
  no controle do organizador** (pedidos, exportação de compradores,
  atendimento, ranking).

Como fica no sistema:
- A visibilidade vale **por venda**: venda feita por cambista mostra o
  cliente ao organizador; venda online mostra só o ID. A mesma pessoa pode
  ter as duas — o organizador enxerga só o lado que é dele.
- **Ganhador cliente da plataforma**: o promotor responde pela entrega do
  prêmio (Lei 5.768/71), então os dados do ganhador são liberados ao
  organizador **no momento do sorteio**, só para aquela cota premiada, com
  registro em auditoria.
- Reembolso de cliente da plataforma: o atendimento continua na organização,
  mas com o cliente identificado pelo ID (como já é hoje).
- O administrador geral vê tudo, como hoje.

### 1.4 Endereço do organizador e estado da rifa **[feito]**
- CEP, rua, número, bairro, cidade e UF (o CEP preenche o resto).
- Toda rifa é nacional; a localização só **ordena** (cidade → estado →
  resto) e alimenta o carrossel de estados.

---

## 2. Reembolso pela lei do consumidor **[decidido — feito]**

| Quando o pedido é feito | Devolução | Taxa |
|---|---|---|
| Compra online, até **7 dias** da compra e antes do sorteio (direito de arrependimento, art. 49 do CDC) | **100%** | nenhuma |
| Depois de 7 dias, ou compra presencial (cambista), e antes do sorteio | **no mínimo 90%** | até **10%**, taxa administrativa da plataforma (art. 51 do CDC) |
| Depois do sorteio | nenhuma | — |

- **Corte técnico: 2 horas antes do sorteio.** Depois disso o pedido não
  abre — o quadro de números precisa estar fechado para o sorteio.
- Em qualquer reembolso aprovado, a **comissão do afiliado daquela venda é
  cancelada** e as cotas voltam ao estoque (o que `refundOrder` já faz).
- A taxa é configurável pelo administrador geral entre 0% e 10%, aparece no
  regulamento e **antes da compra**.
- A decisão final em disputa passa a ser do **administrador geral** (painel
  de disputa), não só da organização.
- **[você]** Advogado: confirmar a regra, em especial o caso de quem compra a
  menos de 7 dias do sorteio (o direito de arrependimento esbarra no corte de
  2 horas). O modelo desta plataforma é promoção comercial autorizada pela
  SPA/MF (Lei 5.768/71), não título de capitalização (SUSEP).

---

## 3. Aparência: tema claro e escuro, e o construtor de templates

### 3.1 Tema claro e escuro **[decidido — feito]**
- As duas opções em todo o sistema; segue o celular por padrão e o usuário
  pode trocar.
- As cores viram variáveis: claro e escuro têm o mesmo significado (verde =
  dinheiro que entrou, amarelo = espera e prêmio, vermelho = erro).

### 3.2 Construtor de templates no painel do administrador geral **[decidido]**
Mudar a plataforma quando quiser, sem código:
- **Identidade**: logotipo, nome, cores de destaque (claro e escuro), fonte
  (de uma lista), arredondamento dos cantos.
- **Tela inicial em blocos**: banners, estados, stories, rifas patrocinadas,
  feed de rifas, destaques, texto livre, central de ajuda. Cada bloco pode
  ser ligado, desligado, reordenado e configurado (título, quantidade,
  tempo do carrossel).
- **Textos**: rodapé, aviso de jogo responsável, regulamento padrão.
- **Pré-visualização** no celular e no computador antes de publicar.
- **Versões**: cada publicação guarda a anterior; voltar é um clique.
- O mesmo mecanismo, com menos opções, é o **white label do organizador**
  (logo, capa, cor de destaque, bio, links).

O que fica de fora de propósito: HTML e script livres (risco de invasão e
de quebrar o celular). Tudo o que o construtor monta passa por blocos que o
sistema já sabe desenhar bem nas duas telas e nos dois temas.

---

## 4. Perfil do organizador no formato do Instagram **[decidido — feito, exceto o que depende de outras etapas: ver PENDENCIAS]**

Cada organizador tem uma página de perfil, e **cada rifa abre dentro do
perfil** (`/o/organizador/r/rifa`) — é isso que faz a plataforma funcionar
como marketplace.

Topo:
1. **Nome da empresa em negrito** no topo.
2. **Foto de perfil com anel de story** — story novo acende o anel.
3. Botão **Seguindo** à esquerda do **sino**; seguir liga o sino
   automaticamente (alerta de rifa nova, sorteio chegando, resultado).
4. **⋮ (três pontos)** à direita do sino, com:
   - Seja um afiliado
   - Bônus (metas cumpridas e recompensas — ver seção 8)
   - Seja um colaborador (pedir para ser cambista deste organizador)
   - Sobre essa conta (CNPJ, cidade, desde quando, rifas realizadas,
     autorizações)
   - Copiar URL do perfil
   - Compartilhar esse perfil
   - QR code
   - Deixar de seguir fica no próprio botão "Seguindo".

Contadores:
5. **Rifas realizadas** (no lugar de "posts").
6. **Seguidores**, com contador.
7. No lugar de "seguindo": botão **Compartilhar** para WhatsApp, Telegram,
   Facebook, Instagram e TikTok — compartilhar conta para o **bônus**
   (seção 8).

Bio:
8. **Bio automática com a rifa atual**: prêmio, data e hora do sorteio,
   local ou transmissão, autorização SPA/MF, preço da cota — atualizada
   sozinha quando uma rifa é publicada. O organizador escreve o resto.
9. **"Seguido por fulano e outras N pessoas"** e seguidores da mesma rifa,
   em micro perfis. **Só aparece quem liga o perfil público** — participar de
   rifa é dado pessoal, então o padrão é privado (LGPD).

Destaques e grade:
10. **Destaques = rifas passadas**, automaticamente, com só a data embaixo.
11. **Grade de rifas, uma por linha** (maior e mais visível que a grade de 3
    do Instagram), cada uma em **carrossel**: capa (foto do ganhador depois
    do sorteio; antes, a foto do prêmio), até 5 fotos e 1 vídeo.

Tela inicial do apostador:
- **Stories dos perfis que ele segue** no topo, como no Instagram.
- **Seguir** e **sino** funcionam também de dentro da página da rifa.

---

## 5. Vitrine (tela inicial) **[decidido]**

Ordem padrão (reordenável pelo construtor, seção 3.2):

1. **Banners da plataforma** — até 5, avisos e marketing, tempo por banner
   ou igual para todos. Organizador pode **pagar** por mais tempo no topo.
2. **Stories** dos perfis seguidos.
3. **Estados** — círculos com a bandeira de cada estado com rifa no ar;
   toque leva a `/estado/UF`.
4. **Rifas patrocinadas** — 5 banners comprados **por clique** no painel do
   organizador; preço do clique definido pelo administrador geral; saldo
   pago antes; clique conta uma vez por visitante em 24 h; robô não conta.
5. **Feed de rifas** em formato de publicação (retrato 4:5), com o perfil do
   organizador no topo de cada cartão e o selo **"Autorizada SPA/MF"**.

**[você]** Cloudflare R2: banners, fotos de perfil, capas e stories são
arquivos grandes demais para o banco.

---

## 6. Notificações no celular **[decidido — feito]**

- Notificação do app instalado (PWA): rifa nova de quem o apostador segue,
  sorteio chegando, resultado, reembolso respondido.
- O sino do perfil liga e desliga por organizador; o WhatsApp continua para
  o que é transação (pagamento, bilhete, reembolso).

---

## 7. Transparência **[feito]**

- **Central de ajuda** **[decidido]**: perguntas frequentes da plataforma e
  **regulamento de cada rifa**, visível antes da compra (inclui a regra de
  reembolso da seção 2).
- **Transmissão do sorteio** **[decidido]**: link da live ou do vídeo na
  página da rifa e no destaque, com o número sorteado e a conferência da
  semente publicada.

---

## 8. Crescimento: indicação, bônus e gamificação **[decidido]**

- **Indicação de apostador**: quem traz outro apostador ganha bônus (cotas
  grátis ou desconto na próxima compra) — diferente do afiliado, que ganha
  dinheiro.
- **Compartilhar perfil conta ponto** (seção 4, item 7), com limite contra
  abuso: conta o compartilhamento que gera visita de alguém novo.
- **Metas** definidas pela plataforma ou pelo organizador (comprar em 3
  rifas, indicar 5 amigos…) liberam o bônus; o menu "Bônus" do perfil mostra
  o progresso.
- **[você]** Advogado: cota grátis numa promoção autorizada precisa estar
  prevista no regulamento aprovado pela SPA/MF.

---

## 9. Afiliado de todas as organizações **[decidido]**

- **Afiliado avulso**: cadastro sem organização; escolhe as rifas que quer
  divulgar e adere a quantas organizações quiser.
- **Termo de adesão** por organização, com percentual, quando recebe, quem
  paga e regras; o aceite fica registrado com cópia do texto, data, versão,
  IP e aparelho.
- **O termo não muda com rifa em andamento**: é fotografado na publicação de
  cada rifa e vale até o sorteio. Versão nova vale para as rifas publicadas
  depois; o afiliado precisa aceitá-la, ou o vínculo é desfeito (sem perder
  o que já ganhou).
- **Comissão guardada pela plataforma**, não pelo organizador, e paga
  **sempre depois do resultado do sorteio**. A opção "na hora do pagamento"
  deixa de existir.
- **Cadastro fiscal do afiliado na plataforma**: RG, CPF, comprovante de
  residência e conta bancária, com cópia dos documentos (criptografada,
  acesso auditado, nunca visível ao organizador).
- **Recibo assinado a cada pagamento**, em PDF, com dados, valor e origem.
- **Extrato por origem**: organização, rifa e pedido de cada comissão.
- **"Seja um colaborador"**: o mesmo fluxo para quem quer ser cambista de um
  organizador — pedido, aprovação do organizador, termo.
- **[você]** Contador: RPA/nota do afiliado e a plataforma guardar dinheiro
  de terceiros até o sorteio.

---

## 10. Painel de resultados do organizador **[decidido]**

- Vendas por dia, por canal (site, afiliado, cambista, anúncio, perfil),
  ticket médio, rifas que mais vendem, seguidores ganhos, retorno das rifas
  patrocinadas.

---

## 11. Marketing e tráfego pago

- Pixels por organização e da plataforma (Meta, Google Ads/GA4, TikTok);
  compra contada pelo servidor na confirmação do pagamento; UTM; relatório
  de vendas por origem; aviso de cookies (LGPD).
- **[você]** Confirmar com Meta e Google que a conta de anúncios pode rodar
  anúncio de sorteio.

---

## Ordem de entrega

| # | Etapa | Seção | Depende de |
|---|---|---|---|
| ✓ | Dados legais da campanha | 0 | — |
| 1 | Conta do apostador (senha) e exclusão LGPD | 1.1, 1.2 | — |
| 1b | De quem é o cliente: dados só da venda do cambista no painel do organizador; ganhador liberado no sorteio | 1.3 | 1 |
| ✓ | Reembolso pela lei do consumidor (7 dias, 10%, corte de 2 h) | 2 | — |
| ✓ | Endereço do organizador e estado da rifa | 1.4 | — |
| ✓ | Tema claro e escuro | 3.1 | — |
| ✓ | Perfil do organizador: topo, seguir, sino, bio, destaques, grade, menu, rifa dentro do perfil | 4 | 3 |
| ✓ | Notificações no celular (sino) | 6 | 5 |
| ✓ | Central de ajuda, regulamento e transmissão do sorteio | 7 | — |
| 8 | Construtor de templates e white label do organizador | 3.2 | 4 |
| 9 | Vitrine: banners, stories, estados, feed | 5 | 5, R2 |
| 10 | Painel de resultados do organizador | 10 | — |
| 11 | Afiliado multi-organização, termo, colaborador | 9 | — |
| 12 | Guarda da comissão, cadastro fiscal e recibo | 9 | contador |
| 13 | Indicação, bônus e gamificação | 8 | 5, advogado |
| 14 | Disputa de reembolso no administrador geral | 2 | 2 |
| 15 | Rifas patrocinadas por clique | 5 | Pix da plataforma |
| 16 | Marketing e tráfego pago | 11 | conta de anúncios |
| 17 | Login com Google | 1.1 | cliente OAuth |
