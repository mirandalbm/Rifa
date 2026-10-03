# Pendências

Lista viva do que falta para a rifa vender em produção. Atualizada a cada
etapa — quem fechar um item marca aqui no mesmo PR.

Última atualização: 01/10/2026 (painéis no padrão Materialize).

Legenda: **[você]** depende do responsável pela conta (cadastro, documento,
senha); **[código]** é trabalho no repositório.

## 1. WhatsApp

- [ ] **[você]** Verificar a empresa **Sorte Nacional** na Meta (Central de
  Segurança). É o que libera o modelo `codigo_acesso` — sem ele o comprador
  não recebe o código para entrar em "Minhas cotas". Pede CNPJ, endereço,
  site/domínio e documento da empresa.
  https://business.facebook.com/latest/settings/security_center/?business_id=4025268954442633
- [ ] **[você]** Completar o perfil da empresa e aceitar os termos de
  desenvolvedor na Meta.
- [ ] **[você]** Cadastrar o número de WhatsApp de verdade da Sorte Nacional
  (o de teste só manda para até 5 telefones cadastrados).
- [ ] **[você]** Confirmar que o token no Railway é permanente (usuário do
  sistema, validade "Nunca").
- [ ] **[você]** Mandar um teste com um modelo aprovado (Configurações →
  WhatsApp → Enviar teste).
- [x] Integração no código, modelos criados pelo painel, token e IDs no
  Railway. 7 de 8 modelos aceitos pela Meta; falta só o `codigo_acesso`
  (depende da verificação acima).

## 1b. Painéis (padrão Materialize)

- [x] Casca dos três painéis no padrão do kit (menu em grupos, barra de
  cima, cartões "papel"), Painel e Rifas em grade de capas (#80).
- [x] Caixa de entrada unificada (`/admin/caixa`): uma lista só com disputas,
  reembolsos, edições e adiamentos, denúncias, selos, cadastros fiscais e
  telefones por aprovar; decidir continua na tela de cada tipo.
- [x] A busca do painel acha pedido (pelo código), cliente (pelo ID) e,
  para a plataforma, organização (pelo nome), além da tela — dentro do
  recorte, sem nome nem telefone de comprador, e abre a tela já no item.
  Também acha gente da casa (usuário, afiliado, cambista) por nome, e-mail
  ou código, no mesmo recorte.

- [x] **[código]** Chatbase AI, **pelo servidor**: a conversa passa pelo nosso
  servidor (API v2 do Chatbase, `CHATBASE_API_KEY` só no servidor), numa coluna
  à direita do painel do master, do organizador e do afiliado; telefone, CPF e
  e-mail barrados antes de sair; uso contado por mensagem (`ia_uso`, pelos
  créditos que o Chatbase informa). Nasce desligado; organizador e afiliado têm
  interruptores à parte, desligados até a cobrança. O widget da primeira fatia
  (script de terceiro no painel) saiu.
- [x] **[código]** Chatbase AI, **cobrança**: **assinatura mensal com franquia
  de créditos** (ciclo de 30 dias; renovar antes estende e soma) e **pacotes
  avulsos** (não vencem; só com a assinatura ativa), pagos por **Pix da
  plataforma** sem split. Preços em Aparência → Assistente de IA. Cada mensagem
  debita o que o Chatbase informa, franquia primeiro; sem assinatura ou sem
  saldo, 402 antes de falar com o Chatbase. Titular: a organização ou o
  afiliado; o master não paga. O plano e o Pix ficam na própria coluna.
- [x] **[código]** Chatbase AI, **ajuste de crédito pela plataforma**
  (cortesia ou correção, no avulso, com motivo e auditoria) e o **relatório de
  uso e receita** por conta (7/30/90 dias), com o extrato de cada conta — em
  Aparência → "Uso e receita do assistente". O Pix estornado no provedor já
  tira os créditos sozinho. Fica como está: o Pix vencido não é cancelado no
  provedor (no Asaas o QR vale até o fim do dia); se for pago tarde, credita
  normalmente.
- [x] **[código]** Chatbase AI, **ações** no sistema (as "client actions" do
  Chatbase): consultar rifas, vendas, pedido e pendências (e, para o afiliado,
  as comissões) na hora; publicar, trocar a legenda, apagar a rifa e estornar
  um chamado aprovado só depois de a pessoa confirmar na coluna. No recorte de
  `orgOf`, pelos mesmos serviços das rotas e com `audit_log` como feita pela IA.
- [ ] **[você]** Chatbase: em Actions, cadastrar cada ação da lista de
  Aparência → Assistente de IA ("Ações do assistente") como ação do tipo
  **Client**, com o mesmo nome e os mesmos parâmetros. Ação não cadastrada lá
  simplesmente não é pedida.
- [ ] **[você]** Chatbase: criar a conta e o agente (treinado com a ajuda do
  painel), copiar o **id do agente** e criar uma **chave da API** (Settings →
  API keys). A chave vai só no Railway (`CHATBASE_API_KEY`); o id vai em
  Aparência → Assistente de IA, e só então liga. Para liberar organizador e
  afiliado, defina ali o **preço da assinatura, a franquia e os pacotes**
  (pense no custo do crédito no seu plano do Chatbase). O plano do Chatbase precisa ter créditos de mensagem para
  o uso de todos (a plataforma paga o Chatbase e cobra de quem usa).

## 2. Para a rifa vender

- [ ] **[você]** Pagamento: escolher **Mercado Pago** ou **Asaas** (os dois
  estão prontos no sistema; a escolha é em Configurações → Pagamentos e
  estorno). Antes de decidir, confirmar por escrito com o provedor que ele
  aceita **promoção comercial com autorização SPA/MF**.
  - Mercado Pago: `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` no Railway.
  - Asaas: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` no Railway; cadastrar o
    webhook `/api/webhooks/asaas` no painel do Asaas; cadastrar a carteira
    (walletId) de cada organização em Organizações para o split.
- [x] Asaas integrado ao lado do Mercado Pago: split para a carteira do
  promotor, CPF no checkout, cancelamento da cobrança de reserva vencida.
- [x] Comissão: cada organização escolhe "depois do sorteio" ou "na hora".
- [x] Reembolso por chamado: o comprador logado pede em "Minhas cotas" com
  CPF e print do bilhete; a organização conversa e decide em Atendimento;
  protocolo e prazo de devolução (definido por cada organização) saem
  sozinhos. O botão solto de estorno em Pedidos foi retirado. Todo comprador
  tem um ID de cliente (`C-XXXXXXXX`).
- [x] Aviso de chamado novo: WhatsApp para a organização (modelo
  `chamado_novo`) e contador em "Atendimento" no menu.
- [ ] **[você]** Criar o modelo novo `chamado_novo` na Meta: Configurações →
  WhatsApp → "Criar modelos que faltam na Meta" (cria só ele; depois esperar a
  aprovação).
- [ ] **[você]** Cada organização informar o WhatsApp do aviso em
  Configurações → "Reembolso: prazo e aviso" (vazio, avisa os organizadores
  que têm WhatsApp no cadastro).
- [ ] **[você]** Ligar "Aceitar pedidos de reembolso" (Configurações →
  Pagamentos e estorno) quando decidir aceitar, e cada organização conferir
  o prazo de reembolso em Configurações.
- [ ] **[você]** O comprador só entra em "Minhas cotas" pelo código do
  WhatsApp: **sem o modelo `codigo_acesso` aprovado (item 1), ninguém
  consegue pedir reembolso** — nem ver as cotas.
- [x] Imagens enviadas sobreviviam só até o próximo deploy (disco do
  contêiner). Agora ficam no volume `rifa-uploads` do Railway, montado em
  `/data`, com `UPLOAD_DIR=/data/uploads`. As que sumiram antes do volume
  precisam ser enviadas de novo. Arquivo que falta responde 404 (antes: a
  página do app com 200, e a imagem quebrava sem nada no log).
- [ ] **[você]** Cloudflare R2: criar o bucket e gerar as chaves. O volume
  resolve para uma réplica; com várias, ou muito tráfego de imagem, o R2
  entra (basta `R2_BUCKET` e as chaves — o código já escolhe sozinho).
- [x] **Endereço público = o domínio do Railway** (`rifa-production-d8a4.up.railway.app`).
  Decisão do dono: **nenhum domínio próprio por enquanto** — todo endereço de
  retorno e de webhook (`PUBLIC_BASE_URL`, o retorno do Google, os webhooks do
  Mercado Pago, do Asaas e da Meta) usa esse e só esse. O domínio personalizado
  que estava ligado ao serviço sem ter sido comprado foi removido pelo dono
  (conferido no Railway em 02/10/2026). Quando um domínio próprio existir,
  troca-se `PUBLIC_BASE_URL` e os endereços cadastrados nos provedores, nesta
  ordem.
- [x] Excluir rifa pelo painel (Campanhas → Excluir): rascunho, rifa no ar
  sem nenhuma cota vendida, ou rifa marcada como teste. Apaga a rifa, o
  sorteio, as mídias e os pedidos não pagos; com venda, não se apaga (o
  caminho é o estorno). O organizador apaga a dele.
- [x] Editar rifa (Campanhas → Editar): rascunho muda na hora; publicada, a
  organização pede e a plataforma aprova ou recusa em Atendimento → Rifas,
  com conversa. O prêmio, o preço e o total não mudam depois de publicar.
- [x] Adiar sorteio por não atingir a meta (Campanhas → Editar → Adiar
  sorteio): pedido com nova data e motivo, analisado pela plataforma; ao
  aprovar, quem comprou e quem segue recebe o aviso e a página da rifa
  mostra a data de antes.
- [x] Vitrine como o Instagram: fileira de stories no topo (no lugar dos
  estados), perfil da promotora por cima da imagem no feed, e o trevo no
  topo (era o coração) com a central de avisos (`/notificacoes`).
- [x] Comentários na publicação da rifa (apostador com conta; a organização
  responde e modera) e o organizador vendo a plataforma pelo próprio perfil.
- [x] Aviso ao organizador de comentário novo: o sino do painel lista os
  comentários de apostador nas rifas dele (e as pendências do atendimento),
  com o número no rótulo; abrir marca como visto.
- [x] Comentários como no Instagram (apelido, foto, curtidas, respostas
  recolhidas, reações) e perfil do apostador `/u/<apelido>` com o primeiro e
  o último nome reais. A organização pede a remoção de comentário; a
  plataforma decide.
- [x] Segurança do organizador: telefone confirmado por código e aprovado
  pela plataforma antes da primeira rifa, denúncias (do apostador e
  automáticas quando o organizador pede Pix por fora), travar rifa e banir
  organização.
- [ ] **[você]** Aprovar o telefone de cada organização que já existe
  (Organizações → "Aprovar telefone", depois que ela confirmar o código em
  Configurações). Sem isso, ela não publica rifa nova.
- [x] Carrinho e comprar na barra da publicação (no lugar do salvar):
  carrinho no aparelho, separado por organização, preço do servidor, e
  "Comprar" abrindo a compra rápida da rifa no tamanho escolhido.
- [x] Carrinho num Pix só, pago à plataforma, com o split do Asaas levando
  a parte de cada promotora no mesmo pagamento; tudo ou nada na reserva,
  vencimento conjunto, estorno pedido a pedido com valor explícito.
- [ ] **[você]** Conferir no Asaas (sandbox) um Pix de carrinho com duas
  organizações com carteira: o split com dois destinos e a devolução
  parcial de um pedido.
- [x] Presente pelos comentários: desconto de primeira compra pago pela
  plataforma (percentual e teto no painel, nasce desligado), crédito da
  promotora acertado na cobrança, bônus de indicação para quem convida.
- [x] Página da rifa: abre sempre no +10; o +0 abre o mapa (sem o
  "esconder o mapa"), com a faixa da página, a busca e as setas no topo e
  os números livres em azul (claro) / verde (escuro), em negrito.
- [x] Cotas premiadas escolhidas pela organização no cadastro (rascunho);
  quem compra ganha na hora e fica fixo no topo dos comentários com 🏆 e a
  cota.
- [x] Vídeo como no Instagram: botão de som no canto de baixo à direita e
  "Assistir novamente" no fim.
- [x] Comentários: o ícone abre a janela de baixo para cima; campo sutil com
  o envio verde dentro (e pelo "Enviar" do teclado); presente à direita,
  sempre à vista (desligado, vira convite sem desconto).
- [x] Página da rifa no computador em duas colunas: publicação à esquerda e
  a compra fixa à direita, com o Pix no pé; topo e faixa de baixo deixaram
  de ficar transparentes.
- [x] Mapa de números com cada página embaralhada; a busca contorna o
  número e rola até ele. Número escolhido na cor da cartela (azul/verde,
  texto branco); vendido cinza e riscado.
- [x] Mapa e cartelas em casas quadradas, azuis e verdes ao acaso nos dois
  temas (a cor sai do número, a mesma em toda tela), o escolhido destacado
  com ✓; o mesmo formato na janela do "+" e no carrinho.
- [x] Cota surpresa: presente animado na publicação (só com cota premiada),
  que revela o número comprado; o aviso amarelo saiu. Cartela com trocar,
  carrinho e Pagar numa linha, e várias cartelas da mesma rifa no carrinho.
- [x] Vários bilhetes por rifa no carrinho, cada um listado e removível; a
  janela do "+" fica aberta ("Adicionar") e troca a cartela adicionada.
- [x] Vitrine no computador: feed em 3 colunas e "Sorteios chegando" ao lado
  do banner.
- [x] Perfil da organização no computador: cartão do perfil à esquerda e
  rifas em 2 colunas.
- [x] Painel do organizador em grade bento: receita, cotas, comissão,
  próximo sorteio, o que falta fazer e últimas vendas.
- [x] Carrinho, página do estado e perfil do apostador no computador
  (formulários e textos seguem na coluna estreita).
- [ ] **[você]** Conferir o vídeo no celular (som e "Assistir novamente"): o
  banco de testes não tem vídeo, então não saiu captura dele.
- [ ] **[ligar]** Presente (desconto pago pela plataforma): ligar em Bônus →
  Presente quando a validação jurídica e contábil (promoção comercial, nota
  da plataforma) estiver em ordem — já combinado, não bloqueia o código.
- [ ] **[você]** Antes de aprovar um adiamento, conferir se a autorização
  SPA/MF da rifa cobre a nova data (a plataforma não tem como checar isso
  sozinha).
- [ ] **Antes de abrir para o público: reset geral.** Apagar o perfil de
  demonstração (Organizações → Perfil de demonstração → Remover, ou apagar
  a organização `demonstracao` e as rifas `demonstracao-*` no reset) e os
  dados de teste. As rifas de demonstração não vendem, mas não devem ficar
  na vitrine do lançamento.
- [x] Campos de autorização SPA/MF (número e arquivo do certificado) e data
  do sorteio no cadastro da campanha (Campanhas → Ajustar → "Dados legais
  da rifa"), com a lista do que falta para publicar. Travam ao publicar.
- [ ] **[você]** Certificado de autorização SPA/MF de cada rifa (número e
  arquivo) — sem ele a rifa não publica.
- [x] Criar campanha: o formulário barrava todo organizador com "Dados
  inválidos" (a validação exigia a organização vinda da tela). Corrigido, e
  os erros de validação agora dizem o campo e o que fazer.

## 3. Segurança e acessos (no painel)

- [ ] **[você]** Ativar o segundo fator (Configurações). Também é exigido
  para arquivar organização.
- [ ] **[você]** Trocar a senha do administrador (passou pela conversa) e
  apagar a variável `ADMIN_PASSWORD` no Railway.
- [ ] **[você]** Redefinir a senha do organizador (Usuários → senha).
- [ ] **[você]** Apagar na Meta o token temporário antigo (também passou pela
  conversa).
- [ ] **[você]** Publicar a revisão de segurança logo (o repositório é
  público: a correção fica visível antes de estar no ar).
- [ ] **[você]** Conferir no Railway: `SESSION_SECRET` e `COFRE_CHAVE`
  definidas e longas, e nenhum acesso com senha de exemplo do seed
  (`admin123`, `organizador123`…) — o seed nunca deve ter rodado no banco de
  produção, e agora ele se recusa.
- [ ] **[você]** Conferir em Antifraude que os registros mostram endereços
  diferentes: o limite por IP depende de o Railway entregar o IP de quem
  acessa (um único IP para todos seria sinal de proxy a mais no caminho).
- [x] Revisão de erros e de segurança (28/09/2026): 25 provas contra a API,
  180 capturas, log do servidor e `npm audit`; uma falha alta e quatro médias
  corrigidas, com prova. Registro e o que ficou para depois em
  `docs/SEGURANCA.md`.

## 3b. Decisões de produto (1º/10/2026)

Respostas do dono do produto, para quem for implementar. Cada item vira
código só depois do plano combinado com ele.

- **Console (Reels → Mensagens → Buscar):** planejar nesta ordem, da
  esquerda para a direita, uma tela por vez.
- **Banner pago:** é receita da plataforma. **Preço e regra de tempo no topo
  são editáveis no painel do administrador** (como a tabela do patrocínio),
  nunca fixos no código. Usa o saldo e o Pix da plataforma que já existem.
- **Story em vídeo:** aceitar vídeo curto **sem transcode**, já preparado
  para a forma final (medição de duração no servidor, limite, formato e
  pôster no mesmo lugar em que o Cloudflare Stream entrar depois). O pôster
  já foi feito; falta só o transcode.
- **Login com Google:** feito (ver o fim da seção 5). A conta nasce
  incompleta e pede CPF e telefone antes de comprar; o e-mail do Google
  nunca liga sozinho a uma conta que já existe.
- **Bônus no perfil e "seguidores da mesma rifa":** o incentivo é por
  **seguir**. A invariante do bônus continua: cota grátis só com o
  regulamento prevendo e o advogado confirmando; o interruptor nasce
  desligado. Se a recompensa por seguir for outra coisa que não cota, a
  regra é decidida junto com o advogado antes de ligar.
- **Chatbase AI nos painéis:** é **receita da plataforma** — o uso é **pago**
  para organizador e afiliado e **gratuito para o administrador master**
  (propriedade da empresa). Todas as telas seguem **livres no uso manual**;
  só a IA é cobrada. **Hoje o master, o organizador e o afiliado têm a coluna
  (os dois últimos desligados até a cobrança); o afiliado tem os mesmos
  direitos do organizador, no recorte do login dele.** Alcance: afiliado —
  gestão e edição das publicações;
  organizador — tudo, inclusive lançar uma campanha com passo a passo e
  gestão e edição de publicações; master — tudo. Regras que não mudam: o
  recorte de `orgOf` vale para a IA como para a pessoa; nada de dado
  pessoal de comprador no contexto; ação que mexe em dinheiro, estorno,
  publicação ou exclusão pede confirmação da pessoa e entra em `audit_log`
  como feita pela IA.
- **Cobrança da IA: fora do saldo.** O saldo do patrocínio (e o livro
  `patrocinio_lancamentos`) **não** paga a IA e não é tocado por ela. A IA é
  paga **por fora**, de dois jeitos: **assinatura** (plano recorrente) ou
  **compra de créditos avulsos**. O modelo de cobrança (provedor, planos,
  preço do crédito, o que consome crédito) é decisão de produto e entra no
  plano da IA; o administrador master não paga.

## 4. Limpeza no GitHub

- [ ] **[você]** Apagar as branches antigas (o assistente não tem permissão):
  `claude/youthful-gates-c7xzgz`, `fix/duplicate-routes`,
  `feature-media-library-page`, `claude/zen-davinci-rw3i6v`,
  `claude/rename-jogo-do-bicho-glo23j` (esta já copiada para o repositório do
  jogo do bicho).

## 5. Fase 5 (plano em `docs/PLANO-FASE5.md`)

Na ordem de entrega do plano:

- [x] Conta do apostador: criar conta e entrar com telefone, CPF ou e-mail
  + senha; "Cadastrar" no topo; depois de entrar, a casa é a vitrine e o menu
  tem Minhas compras (por rifa, com o organizador e a 2ª via do bilhete),
  Reembolsos e Minha conta; exclusão pela LGPD. Compras antigas com o mesmo
  CPF vêm junto; o ID do cliente sai no bilhete.
- [x] De quem é o cliente: no painel do organizador (pedidos, exportações,
  atendimento), dados completos só de quem comprou com cambista e do
  ganhador; cliente da plataforma aparece pelo ID. Afiliado vê só o primeiro
  nome. Todo comprador ganha ID desde a primeira compra.
- [x] Reembolso pela lei do consumidor: 100% até 7 dias da compra online,
  taxa da plataforma (0 a 10%, padrão 10%, Configurações → Pagamentos e
  estorno) depois disso ou na venda do cambista, pedidos fecham 2 h antes do
  sorteio. A regra aparece antes da compra; o valor fica gravado no chamado
  e a devolução parcial sai pelo provedor.
- [ ] **[você]** Asaas com split: a devolução parcial sai da conta da
  plataforma, não da do promotor. Confirmar com o Asaas como estornar o
  split antes de ligar reembolso com o Asaas.
- [x] Endereço completo do organizador (CEP preenche o resto) e estado da
  rifa: a vitrine põe primeiro as rifas da cidade e do estado de quem olha,
  sem esconder nenhuma. Organização com "Cidade/UF" antigo já ordena pelo
  estado; o endereço completo é pedido em Configurações.
- [x] A vitrine ordena pela região do apostador sem ele escolher: o CEP é
  pedido no cadastro (e trocado em Minha conta → Minha região); o seletor de
  estado fica no topo da vitrine para quem quiser ver outro estado.
- [ ] **[você]** Cada organização conferir o endereço em Configurações →
  Endereço da organização (aparece "falta cadastrar" enquanto não tiver).
- [x] Tema claro e escuro: segue o celular por padrão; a pessoa troca no
  rodapé da loja, no menu da conta ou no menu do painel. O bilhete continua
  branco (é papel).
- [x] Perfil do organizador no formato do Instagram (`/o/:slug`): foto, nome,
  rifas realizadas, seguidores, compartilhar (WhatsApp, Telegram, Facebook;
  Instagram e TikTok copiam o link), seguir com sino, menu ⋮ (seja afiliado,
  seja colaborador pelo WhatsApp da organização, sobre, copiar URL,
  compartilhar, QR code), bio do organizador + bio automática da rifa no ar,
  "seguido por" só de quem liga o perfil público, destaques (rifas
  sorteadas) e grade com carrossel. A rifa abre dentro do perfil e tem
  seguir/sino. A vitrine mostra os perfis seguidos no topo.
- [x] ~~Item "Bônus" do menu do perfil e "seguidores da mesma rifa"~~: o
  item aparece em `/perfil` com o programa ligado; a meta "Siga N
  organizações" entra nas metas do Bônus; e a página da rifa mostra "quem
  também joga" (compra paga + perfil público, só apelido e foto). A regra da
  recompensa por seguir segue sendo cota grátis, **desligada até o advogado**.
- [ ] **[você]** Cada organização pôr foto e bio em Configurações → Perfil
  público.
- [x] Notificações no celular (Web Push): rifa nova de quem a pessoa segue
  (sino ligado), sorteio chegando (24 h e 1 h antes), resultado e resposta
  de reembolso. A permissão é pedida ao seguir/ligar o sino ou em Minha
  conta → Avisos neste aparelho. No iPhone, só com o app instalado.
- [ ] **[você]** Testar num celular de verdade depois do deploy: instalar o
  app, seguir um organizador e publicar uma rifa de teste. (Opcional:
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` no Railway; sem
  elas, as chaves são criadas sozinhas e guardadas no banco.)
- [x] Central de ajuda (`/ajuda`, com busca), regulamento de cada rifa
  (montado dos dados dela + disposições da promotora, visível antes da
  compra) e transmissão do sorteio (link da live/vídeo na página da rifa).
  Depois do sorteio a página mostra o número, a Federal e a semente, e o
  botão "Conferir o sorteio" refaz a conta no aparelho de quem olha.
- [x] **[código]** Regulamento-modelo (`shared/regulamento.ts`) alinhado ao
  dos sorteios autorizados: entrega em até 30 dias, prescrição em 180 dias
  com o valor recolhido ao Tesouro Nacional (Lei 5.768/71, Decreto
  70.951/72) e **regra da aproximação** — número sorteado não vendido passa
  ao vendido e pago imediatamente acima, senão ao imediatamente abaixo
  (`contempladoPorAproximacao()`, `draws.winner_number`, aplicado no sorteio
  e mostrado na página da rifa). **Falta no ambiente**: `db:push` (coluna
  `draws.winner_number`) antes do código. Fica para o advogado só conferir
  o texto final.
- [x] **[código]** Mínimo de cotas vendidas para sortear, definido pela
  promotora nos dados legais (% do total, trava ao publicar, entra no
  regulamento); abaixo dele o sorteio não roda e a promotora pede o
  adiamento. **Falta no ambiente**: `db:push` (coluna
  `campaigns.minimo_vendido_pct`) antes do código.
- [x] **[código]** Rifa cheia: a promotora escolhe o modo do sorteio nos
  dados legais — na data (com o mínimo dela), cheia na data, cheia com
  sorteio quando completar (a data é marcada sozinha na próxima Federal) ou a
  promotora fica com as cotas não vendidas. **Falta no ambiente**: `db:push`
  (coluna `campaigns.modo_sorteio`). **Para o advogado**: confirmar que o
  plano de operação aceita o modo "a promotora completa" (o prêmio pode não
  ser entregue a participante).
- [ ] **[lançamento]** Prêmio em dinheiro e itens proibidos (Decreto
  70.951/72, art. 10: remédio, arma, munição, explosivo, fogos, bebida
  alcoólica, tabaco): o cadastro do prêmio é texto livre e as cotas
  premiadas aceitam "R$ … no Pix". Confirmar com o advogado o que o plano de
  operação permite antes de travar no código.
- [x] Construtor de templates da plataforma (Painel → Aparência): nome,
  logo, cor de marca nos dois temas (com conferência de contraste), fonte,
  cantos, tela inicial em blocos (ligar, ordenar, título, bloco de texto),
  rodapé e aviso de jogo responsável; pré-visualização no celular e no
  computador; publicar e voltar a qualquer versão.
- [x] White label do organizador (Configurações → Perfil público): capa,
  cor de destaque nos dois temas (com conferência de contraste) e até 5
  links na bio (só https), além da foto e da bio que já existiam. A cor vale
  no perfil e na faixa da promotora dentro da rifa.
- [ ] **[você]** Cada organização subir capa, escolher a cor e cadastrar os
  links (Instagram, WhatsApp, site) no perfil público.
- [x] O nome e o ícone do app instalado seguem o template publicado
  (`/manifest.webmanifest` montado em `shared/manifest.ts`: nome, cor de
  marca e, com logo, três ícones feitos dela). Quem já instalou recebe o
  novo nome e ícone quando o sistema atualiza o manifesto (o Android, em
  geral, em até um dia; o iPhone só ao reinstalar).
- [x] Vitrine: banners da plataforma (até 5, janela de datas, tempo por
  banner, em Aparência), stories do organizador (24 h, até 10 no ar, painel
  → Stories, anel aceso na vitrine e no perfil), estados com rifa no ar
  (círculos e `/estado/UF`) e feed em formato de publicação (4:5, perfil no
  topo, selo "Autorizada SPA/MF").
- [x] ~~Bandeira de cada estado nos círculos~~: os círculos de estado saíram
  da fileira do topo (a fileira é de stories) e a página `/estado/UF` não os
  usa. Item encerrado, sem código.
- [x] ~~**Story em vídeo**~~: até 30 s, 15 MB, em pé, MP4/MOV, medido no
  servidor e sem transcode (seção Vitrine do `CLAUDE.md`). O pôster saiu
  depois (item "Pôster dos vídeos" da seção 6); a recompressão segue no item
  do Cloudflare Stream.
- [x] ~~Banner pago~~: pacote de dias pago do saldo do patrocínio, arte
  aprovada pela plataforma, vagas e preço editáveis, dias não usados devolvidos
  (seção "Banner pago na vitrine" do `CLAUDE.md`). Nasce desligado.
- [ ] **[você]** Banner pago: definir o **preço do dia** e as **vagas** em
  Banner na vitrine e ligar o produto quando quiser vender (roda `db:push`
  antes: tabela `banner_pedidos`).
- [ ] **[você]** Subir os banners da plataforma (Aparência → Banners da
  vitrine) e orientar as organizações a postarem stories.
- [x] Painel de resultados do organizador (painel → Resultados): receita,
  pedidos, ticket médio, cotas, seguidores novos e estornos do período (7,
  30 ou 90 dias); receita por dia; vendas por canal (cambista, afiliado e,
  no site, vitrine, perfil, story, banner, página do estado ou anúncio);
  rifas que mais vendem. A plataforma escolhe a organização.
- [x] Foto do ganhador como capa depois do sorteio (painel → Sorteios).
- [x] Retorno das rifas patrocinadas (painel → Patrocínio): gasto, receita,
  retorno por real, vendas, custo por venda, cliques, taxa de clique e custo
  por clique em 7, 30 ou 90 dias; funil exibição → clique → pedido → venda;
  gasto × receita por dia; estado de quem viu; cliques barrados. A venda
  conta para o anúncio quando o mesmo aparelho clicou e comprou em 7 dias.
- [x] Afiliado de todas as organizações: cadastro avulso, adesão pelo
  painel do afiliado (Organizações), aprovação por organização, termo de
  adesão por versão fotografado na publicação de cada rifa, aceite com cópia
  do texto, IP e aparelho; cupom e saque por organização; "Seja um
  colaborador" dentro do app (pedido vai para Cambistas). O link sem vínculo
  deixou de dar comissão na rifa de outra organização.
- [x] Texto-base do termo de adesão completo (`montarTermo()`): natureza
  (parceria autônoma, sem vínculo de emprego), regras de divulgação
  (publicidade identificada, sem promessa de ganho, sem menores, sem Pix por
  fora), descumprimento, LGPD, tributos e recibo. O painel avisa quando o
  termo em vigor ficou atrás do texto de hoje (`npm run afiliados`).
- [x] Consentimento biométrico da verificação: texto destacado (finalidade,
  quem compara, guarda, opcional, revogação), gravado com a data e o
  SHA-256 do texto lido, revogável na própria tela (o selo sai), e a foto
  não é comparada sem ele — nem pelo serviço automático sem o texto que o
  cita (`npm run verificacao`). Quem foi verificado antes desta versão
  segue com o selo, sem consentimento gravado: a fila mostra "Sem
  autorização da foto"; decidir se pede a todos que autorizem de novo. Falta o advogado ler o
  texto (`textoDoConsentimentoBiometrico()` em `shared/verificacao.ts`).
- [x] Termos de uso e Política de privacidade (`/termos`, `/privacidade`),
  montados das regras do sistema (`shared/legal.ts`), no rodapé, no perfil
  e no Criar conta (`tests/legal.test.ts`).
- [ ] **[você]** Em Aparência → "Dados da empresa": razão social, CNPJ,
  endereço, e-mail de contato e o **encarregado de dados** (nome e e-mail),
  e publicar o template. Sem isso as páginas dizem que os dados ainda não
  foram publicados (Decreto 7.962/2013 e LGPD, art. 41, pedem os dois).
- [x] Devolução do Pix que chega tarde (reserva vencida ou depois do
  sorteio): o pagamento entra na fila `pix_tardios` (um por pedido), que a
  plataforma vê em Pedidos ("Pix a devolver") e na Caixa de entrada, e
  resolve devolvendo pelo provedor (valor explícito) ou marcando como
  resolvido por fora, com observação e auditoria (`npm run pix-tardio`).
  **Falta no ambiente**: `db:push` (tabela `pix_tardios`) **antes** do
  código.
- [x] Guarda de `fraud_events` e `fraud_blocks`: recusas saem com 180 dias e
  o bloqueio com prazo sai 30 dias depois de vencer (o sem prazo fica até a
  plataforma retirar) — relógio de limpeza, `purgarGuardaDoAntifraude()`. A
  Privacidade diz os dois prazos. **[você]** O advogado confirmar os prazos
  (`GUARDA_DAS_RECUSAS_DIAS`, `GUARDA_DO_BLOQUEIO_VENCIDO_DIAS` em
  `shared/antifraude.ts`).
- [x] O estorno desfaz as metas "rifas compradas" (de quem comprou) e
  "indicações" (de quem indicou) quando a meta deixa de ser cumprida;
  alcançar de novo paga de novo (`desfazerMetasNoEstorno()`, `npm run
  bonus`). Visitas e seguir não voltam atrás.
- [ ] **[você]** O advogado ler os Termos de uso e a Privacidade
  (`montarTermosDeUso()`/`montarPrivacidade()`), em especial: foro, CVV no
  jogo responsável, prazos de guarda e a lista de quem recebe dados.
- [ ] **[você]** Cada organização publicar o termo de adesão de afiliado
  (Afiliados → Termo) — quem já publicou vê o aviso para publicar a versão
  seguinte com o texto novo — e o advogado revisar o texto-base.
- [x] Cadastro fiscal do afiliado (Meus dados): nome, CPF, RG, nascimento,
  endereço, conta e três documentos, cifrados (AES-256-GCM) e conferidos só
  pela plataforma (Cadastros fiscais), com cada leitura na auditoria.
  Exigência para sacar é uma chave em Configurações, desligada por padrão.
- [x] Recibo assinado a cada saque pago (PDF com QR) e conferência pública
  em `/recibo/<código>`; extrato de comissão por organização.
- [ ] **[você]** Criar `COFRE_CHAVE` no Railway (32 bytes em base64:
  `openssl rand -base64 32`) **antes** de ligar o cadastro fiscal. Sem ela,
  em produção, o cadastro fiscal e o recibo recusam. Guardar uma cópia fora
  do Railway: perder a chave é perder os documentos.
- [x] Guarda da comissão pela plataforma, **atrás de um interruptor
  desligado** (Configurações → Pagamentos → "A plataforma guarda a comissão
  dos afiliados"): a comissão da venda online com afiliado sai do split da
  organização, só libera depois do sorteio e é paga pela plataforma.
- [ ] **[ligar]** Guarda da comissão: ligar quando o modelo contábil estiver
  validado (combinado, não bloqueia o código) (a plataforma segurando dinheiro de terceiro até o sorteio; RPA ou
  nota do afiliado).
- [x] Indicação, bônus e metas, **atrás de um interruptor desligado**
  (menu Bônus da plataforma): link de indicação, visitas novas, metas e
  cotas grátis de bônus, resgatadas só em rifa cujo regulamento as prevê.
- [ ] **[ligar]** Programa de bônus: ligar quando a cota grátis estiver
  validada no regulamento aprovado pela SPA/MF (combinado, não bloqueia o
  código); as organizações marcam
  "aceitar cotas de bônus" nos dados legais de cada rifa, antes de publicar.
- [x] Disputa de reembolso no administrador geral: o comprador leva à
  plataforma o chamado recusado (até 7 dias) ou sem resposta da organização
  (depois de 3 dias), antes do corte de 2 horas do sorteio. A plataforma
  decide (procedente: vira aprovado com o prazo da organização; improcedente:
  mantém a recusa), e a decisão encerra. Pedido premiado não tem disputa
  procedente.
- [x] Rifas patrocinadas por clique (painel → Patrocínio), sem interruptor
  geral: recarga de saldo por Pix para a
  conta da plataforma (ou crédito lançado por ela); anúncio = pacote de
  cliques com alcance cidade, estado ou Brasil, preço por alcance e desconto
  por volume da tabela da plataforma; fila por ordem de chegada com vagas
  por alcance — quem entra fica até gastar o pacote e o próximo entra
  sozinho; card da fila com a previsão de entrada; clique cobrado uma vez
  por aparelho em 24 h, robô não conta. Sem cancelamento de anúncio: quando
  a rifa sai do ar, o que não foi gasto volta ao saldo como crédito, para
  qualquer rifa. Reembolso em dinheiro do saldo pelo suporte, com conversa,
  atrás de um interruptor próprio (desligado, o botão nem aparece).
- [ ] **[você]** Conferir a tabela das patrocinadas (preço do clique por
  alcance, faixas de desconto, mínimo de cliques, vagas e recarga mínima —
  painel → Patrocínio) e a conta da plataforma que recebe o Pix das
  recargas.
- [ ] **[você]** Decidir se liga o botão "Pedir reembolso do saldo" do
  patrocínio (painel → Patrocínio → Configuração), depois de medir quantos
  organizadores pedem reembolso pelo atendimento.
- [x] Marketing e tráfego pago (painel → Marketing), sem interruptor —
  vale quando houver pixel cadastrado: pixels da plataforma e de cada organização (Meta,
  GA4, Google Ads, TikTok), aviso de cookies (LGPD) antes de qualquer pixel,
  compra enviada pelo servidor na confirmação do pagamento (API de
  Conversões da Meta, Measurement Protocol do GA4, Events API do TikTok),
  UTM no pedido e vendas por campanha.
- [ ] **[você]** Confirmar com a Meta e o Google que a conta de anúncios pode
  rodar anúncio de sorteio; depois cadastrar os pixels e as chaves de API da
  plataforma (painel → Marketing).
- [x] Perfil verificado (selo de trevo) para apostador, afiliado e
  organização: documentos cifrados, foto do perfil conferida lado a lado
  (Atendimento → Verificações), cores do selo em Configurações e emoji nos
  comentários só para verificado. Não barra ninguém de comprar ou fazer rifa.
- [ ] **[você]** Comparação automática da foto (opcional): criar conta na AWS
  e pôr no Railway `ROSTO_PROVEDOR=rekognition`, `ROSTO_AWS_ACCESS_KEY_ID`,
  `ROSTO_AWS_SECRET_ACCESS_KEY` e `ROSTO_AWS_REGION`. Sem isso, a plataforma
  confere a foto à mão. Confirmar com o advogado o texto do consentimento
  biométrico (LGPD, art. 11).
- [x] Publicação como no Instagram: carrossel de até 10 (reels até 3 min,
  vídeo do feed até 15 min), curtir com o trevo, comentar, republicar,
  compartilhar e salvar com contadores, legenda da organização, "• Autor"
  nos comentários e apelido obrigatório no cadastro.
- [x] Login com Google: entra, completa CPF e telefone depois e liga o
  Google a uma conta que já existe, de dentro dela (`npm run google`).
- [x] Reembolso: o arrependimento acaba no que vier primeiro (7 dias ou o
  fechamento, 2 h antes do sorteio), com a data e a hora exatas antes do Pix
  quando o prazo fica menor; sorteio adiado depois da compra devolve tudo
  (`npm run chamados`).
- [ ] **[lançamento]** Validação jurídica: o texto do reembolso
  (`regraDoReembolso()` e `avisoDePrazoCurto()` em `shared/reembolso.ts`) —
  se o aviso ao lado do Pix basta ou se pede uma caixa de "li e concordo";
  se a taxa depois dos 7 dias (até 10%) pode existir — e a cota grátis de
  bônus no regulamento (a cláusula, `clausulaDoBonus()`, já diz a quantidade
  autorizada e que a cota grátis não conta para o mínimo de vendidas; falta
  ele confirmar que o plano de operação da SPA/MF prevê a distribuição).
- [ ] **[lançamento]** Validação contábil: guarda da comissão pela plataforma
  e RPA/nota dos afiliados.
- [ ] **[você]** Cliente OAuth do Google (console.cloud.google.com → APIs e
  serviços → Credenciais → ID do cliente OAuth, tipo "Aplicativo da Web"):
  URI de redirecionamento autorizada
  `<PUBLIC_BASE_URL>/api/public/conta/google/retorno`; depois, no Railway,
  `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Sem as duas o botão não
  aparece. Nunca ponha `GOOGLE_PROVA` em produção (só vale fora dela).

## 6. Código, para depois

- [ ] **Sorteios oficiais** (o calendário da plataforma, a tela do sorteio no
  celular). **Fase 1 feita:** o master cadastra, muda, cancela e lança o
  resultado oficial (Federal, Mega-Sena, Quina, Lotofácil, cada dia na cor da
  loteria); a organização integra a rifa em rascunho pelo calendário (a data
  vira a do concurso e trava ao publicar); selo na rifa; a tela do sorteio no
  celular mostra só o sorteio oficial, com a fileira das rifas integradas.
  **Fase 2 feita:** lançar o resultado sorteia sozinha cada rifa publicada
  integrada, com as regras dela (mínimo, aproximação, a promotora completa);
  a que não pode (mínimo, reserva esperando Pix) guarda o motivo e o relógio
  tenta de novo; as quatro loterias recebem rifa (o número sai do resultado
  da loteria, e o regulamento e a conferência pública dizem qual); e o
  adiamento pode levar a rifa publicada para outro sorteio oficial, só com
  a aprovação da plataforma. **Fase 3 feita:** os comentários do sorteio
  oficial, embaixo do vídeo na tela do celular (todo mundo lê; conta com
  apelido escreve; emoji só verificado; a plataforma modera pelo
  calendário). **Denúncia feita:** o apostador com conta denuncia o
  comentário do sorteio ("Denunciar"), a plataforma decide em Atendimento →
  Denúncias e na Caixa de entrada, e procedente apaga o comentário.
  **Falta:** conferir as cores de `CORES_DA_CAIXA` contra o manual de identidade visual das
  Loterias Caixa; e o advogado confirmar que a autorização SPA/MF da rifa
  aceita apuração pela Mega-Sena, Quina ou Lotofácil (hoje a plataforma
  deixa a organização escolher — a autorização é dela, invariante 9).
- [x] **Reels** (tela cheia, vídeo em pé de até 3 min, ações na lateral):
  pronto, atrás do interruptor `reelsLigado` (Aparência → Topo do app, nasce
  desligado). **v2 feito:** o som escolhido fica lembrado no aparelho (cai
  para mudo se o navegador barrar). Ficou para depois: música/trilha (exige
  biblioteca licenciada), reações rápidas com emoji (hoje emoji é vantagem
  de verificado: decisão de produto) e aba "Friends" (aqui é "Seguindo").
  Pôster pronto (`ffmpeg` local); HLS pelo Cloudflare Stream quando a
  entrega estiver ligada (`reelsHls`).
- [x] **Mensagens** (caixa de um para um entre apostador, organização e
  afiliado): pronta, atrás do interruptor `mensagensLigado` (Aparência →
  Topo do app, nasce desligado). **Mensagens v2, parte 1 feita:** o painel
  da organização e do afiliado conta as não lidas no sino; a peça do
  afiliado na página da rifa tem o botão "Mensagem" (a entrada para
  conversar com ele, que não tem perfil); e a conversa denunciada entra na
  Caixa de entrada da plataforma (tipo "Conversa denunciada", sem texto).
  **Parte 2A feita:** foto na conversa (só o apostador envia; JPEG
  reprocessado, 5 MB, 20 por dia; a plataforma só vê a foto que está no
  trecho de uma denúncia, pela rota com auditoria) e "online agora" (opcional,
  desligado por padrão, recíproco, só em conversa aceita, nunca "visto por
  último"). Sobem com o `db:push` **antes** do código: `mensagem_imagens` e
  `mensagens_presenca`.
- [x] **Mensagens v2, parte 2B — grupos da rifa:** feito. Até 50 apostadores
  com compra paga na rifa, só texto, denúncia com trecho e decisão da
  plataforma que encerra o grupo (Caixa de entrada, tipo "Grupo denunciado").
  Sobem com o `db:push` **antes** do código: `grupos`, `grupo_membros`,
  `grupo_mensagens` e `grupo_denuncias`. Ficou para depois: moderador do
  grupo, aviso no celular e foto em grupo.
- [x] **Vídeo nas Mensagens: não haverá** (decisão de 03/10/2026). Nem na
  conversa de um para um nem nos grupos: entre os participantes só texto e,
  na conversa, a foto do apostador.
- [x] **Buscar** (grade das publicações mais novas e busca por texto):
  pronto, atrás do interruptor `buscarLigado` e da tabela do que aparece
  (`buscarTipos`: rifas, organizações e apostadores; apostador nasce
  desligado). **v2 feito:** a pessoa escolhe "Mais novas" ou "Mais curtidas"
  (contador real, sem mostrar o número) e filtra por estado. **Índice de
  texto feito** (`pg_trgm`: título, prêmio, nome e endereço da
  organização). **Falta no ambiente**: o `npm run db:push` agora cria a
  extensão `pg_trgm` antes do schema — o usuário do banco no Railway precisa
  poder criar extensão (o padrão do Postgres do Railway pode); se não puder,
  rodar `CREATE EXTENSION pg_trgm` uma vez como dono do banco. Ficou para
  depois: hashtags.
- [x] **Selo "ao vivo" no story** (anel com a transmissão): pronto. Acende
  quando a rifa tem link de transmissão, a hora do sorteio chegou e o sorteio
  não foi feito (janela de 3 h); só dado real. Ficou para depois: "ao vivo"
  declarado pela organização fora do sorteio (hoje só a transmissão do
  sorteio) e contador de espectadores (só com dado real do provedor).
- [x] **[código]** Perfil do usuário: os bilhetes como publicações privadas
  (uma por compra ou carrossel), com data, hora, prêmio e números.
  Feito em `/perfil/bilhetes` (`npm run bilhetes`): um cartão por compra
  paga, só para a própria conta.
- [x] **Ferramentas de publicação** (primeiro passo): o menu Criar da
  organização reúne rifa, story, legenda e as **divulgações de terceiros**;
  o afiliado publica com o material da organização (mídias da rifa e legenda
  própria, só com vínculo aprovado e termo aceito), em modo **direto** ou
  **só depois da autorização**, escolhido pela organização (padrão:
  autorização); o apostador publica um texto sobre rifa em que comprou,
  atrás do interruptor `publicarApostador`, sempre com autorização. Seção
  "Divulgação de terceiros" do `CLAUDE.md`, `npm run divulgacao`.
- [ ] **[produto]** Ferramentas de publicação, o que ficou para depois:
  (1) o influenciador **enviar mídia própria** — **feita a foto**: até 4
  fotos dele, e a peça com foto passa pela organização mesmo no modo direto
  (sem tabela nova: a mesma `divulgacao_fotos`); **ficou de fora o vídeo
  próprio** (precisaria do armazenamento e da medição da mídia da rifa, e o
  Stream) e **republicar** a peça da organização com legenda dele no feed —
  hoje a divulgação aparece numa seção da página da rifa, não no feed da
  vitrine nem no perfil do afiliado. O texto-base do termo do afiliado ganhou
  a regra da foto própria (item 7): as organizações com termo publicado veem
  o aviso de termo desatualizado e publicam a versão seguinte; (2) ~~a peça do apostador
  com **imagem**~~ — **feito**: texto e até 4 fotos dele, sempre pela fila da
  organização; **falta no ambiente** o `db:push` (tabela `divulgacao_fotos`)
  **antes** do código; (3) ~~avisos para a organização quando chega peça nova e
  para quem publicou quando é decidida~~ — **feito**: o sino da organização
  conta a fila, o apostador recebe push e trevo e o afiliado vê o número no
  sino do painel (seção "Divulgação de terceiros" do `CLAUDE.md`); (4) ~~editar a peça depois de
  enviada~~ — **feito**: quem publicou corrige (legenda; o afiliado também as
  mídias) e a peça volta para a fila, salvo o afiliado no modo direto; a
  organização decide a versão que leu (`versao`, 409 se mudou). **Falta no
  ambiente**: `db:push` (colunas `divulgacoes.versao` e `editada_em`)
  **antes** do código; (5) ferramentas do Instagram ainda
  sem equivalente: reels pela organização, agendar publicação (**story
  agendado feito**: até 7 dias, as 24 h contam da hora; **falta no
  ambiente** o `db:push` da coluna `stories.publica_em` **antes** do código —
  sem ela toda leitura de story falha; logo depois do push, uma vez,
  `UPDATE stories SET publica_em = created_at WHERE publica_em > created_at`
  (os stories que já estavam no ar ganhariam a hora do push e o anel
  acenderia de novo como "novo" para quem já viu); a peça de divulgação e a rifa
  agendadas vêm nos próximos PRs), enquete e figurinhas no story; (6) ~~a plataforma decidir sem escolher a
  organização~~ — **feito**: a plataforma vê a fila de todas, com o nome da
  organização, e decide qualquer peça (`npm run divulgacao` prova).
- [ ] **[código]** Remodelagem do web e dos painéis, depois do app
  (`docs/REMODELAGEM.md`: inventário e lista de conferência).

- [ ] **[código]** Maquininha Stone no invólucro Android: faltam os nomes de
  classe do SDK da Stone (a do PagBank está pronta).
- [ ] **[código]** Compilar o APK das maquininhas — precisa de máquina com o
  Android SDK.
- [x] **Pôster dos vídeos** (rifa, reels e story): o quadro sai em segundo
  plano pelo `ffmpeg` local, se o servidor o tiver, e degrada para "sem
  pôster" sem ele (seção "Pôster do vídeo" do `CLAUDE.md`, `npm run
  poster`). **Falta no ambiente**: instalar o `ffmpeg` na imagem de
  produção (ou `FFMPEG_PATH`); sem ele o pôster simplesmente não sai.
- [x] **[código]** Pôster pelo Cloudflare Stream (`CloudflareStream` em
  `server/services/videoProcessor.ts`, `VIDEO_PROCESSOR=cloudflare-stream`,
  `ffmpeg` de reserva). **Falta no ambiente**: ativar o Stream na conta e pôr
  `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_STREAM_TOKEN` (token com permissão de
  edição no Stream) no Railway.
- [x] **[código]** Entrega em HLS pelo Stream: o vídeo da rifa fica no
  Stream (`uid` e HLS conferido em `campaign_media`), a tela toca por HLS
  nativo ou `hls.js` e volta ao original, apagar a mídia ou a rifa apaga no
  Stream (seção "Entrega em HLS" do `CLAUDE.md`, `npm run poster`).
  **Falta no ambiente**: `db:push` (colunas `stream_uid`, `stream_hls` e a
  tabela `stream_pendentes`) **antes** do código; e, para ligar, `VIDEO_PROCESSOR=cloudflare-stream` e
  `CLOUDFLARE_STREAM_ENTREGA=hls` com as credenciais do item acima (o Stream
  cobra por minuto guardado). Ficou de fora: story em vídeo e enviar ao
  Stream o vídeo de antes (vídeo nas Mensagens não haverá).
- [x] **[código]** Custo de entrega do Stream: **URL assinada** (seção
  "Entrega em HLS" do `CLAUDE.md`): o vídeo guardado é marcado
  `requireSignedURLs`, a tela recebe o HLS com um token de 4 h assinado no
  servidor e a rifa que sai do ar para de tocar quando os tokens vencem; o
  relógio marca os vídeos de antes. **Falta no ambiente**: `db:push` (coluna
  `campaign_media.stream_assinado`) **antes** do código; criar a chave de
  assinatura na conta (`POST
  /accounts/<conta>/stream/keys` com o token do Stream — a resposta traz `id`
  e `jwk`) e pôr `CLOUDFLARE_STREAM_CHAVE_ID` (o `id`) e
  `CLOUDFLARE_STREAM_CHAVE_JWK` (o `jwk`, como veio) no Railway. **Guarde o
  `jwk`: a Cloudflare não mostra de novo.** Sem as duas, o HLS segue aberto.
  Ficou de fora `allowedOrigins` (o HLS nativo do iPhone pode não mandar
  `Origin`; a assinatura já fecha o custo).
- [x] **[código]** Pôster dos vídeos enviados antes do pôster existir: o
  relógio gera (seção "Pôster do vídeo" do `CLAUDE.md`, `npm run poster`),
  quatro por volta a cada 15 min, só o quadro. Fica de fora o envio
  retroativo ao Stream (o vídeo de antes de ligar a entrega segue tocando o
  original): se um dia for desejado, precisa de variável própria e só para
  rifa no ar, senão o Stream cobra minutos de vídeo que ninguém assiste.
- [x] Pôster, extras: **feitos.** O vídeo do bucket vem **em pedaços** de 4 MB
  para o arquivo temporário (a memória do processo web não guarda o vídeo
  inteiro); o `ffmpeg` roda no máximo 2 por vez (`FFMPEG_MAX_SIMULTANEOS`, 1 a
  8) e o resto espera a vez; `excluirRifa` apaga também os arquivos do
  armazenamento (original, pôster e variantes) depois que a transação fecha.
  Ficou: mídia enviada e nunca confirmada (sem linha no banco) não tem como
  ser achada para limpar.
- [x] Revisão completa das telas, com prints: `npm run telas` (60 telas,
  seis papéis, 390/820/1440 px) e o guia `docs/VERSOES.md` — regras entre as
  versões, mapa de cada tela e o registro das mudanças do celular (leva a
  cada 10).
- [x] **[código]** Segurança, para depois (`docs/SEGURANCA.md`): política de
  conteúdo (CSP) em modo relatório, segredo do segundo fator no cofre, custo
  do scrypt (a senha antiga é refeita no login), clique patrocinado só com o
  comprovante da exibição e com teto por IP, e rotas públicas de rascunho em
  404 (`npm run senha`, `npm run patrocinio`). **Falta no ambiente**:
  `db:push` (coluna `patrocinio_cliques.ip_hash`) **antes** do código.
- [ ] **[você]** Depois de uma ou duas semanas no ar, com os pixels ligados,
  olhar o log de produção (`[csp]`): o que aparecer ali e for nosso entra na
  lista (`shared/csp.ts`); limpo, a política passa de relatório a valendo.
- [x] **[código]** Pendências da revisão das versões (P1 a P14 em
  `docs/VERSOES.md`): todas feitas ou resolvidas pelo topo novo.
- [x] Cobrança com Asaas: nas vendas com split, a taxa da plataforma já
  retida na origem nasce "retida no split" (`platform_charges.status =
  retida`) e não entra no "em aberto" nem na baixa — a Cobrança mostra a
  linha e o total retido. Vale para o pedido avulso e, no carrinho, só para
  as promotoras que de fato entraram no split, e só com taxa no contrato na
  hora de gerar o Pix.
- [ ] **[você]** Se já houve venda com split do Asaas **antes** desta
  mudança, as taxas dessas vendas seguem "em aberto" no livro (não dá para
  reconstruir pelo código: a carteira pode ter sido cadastrada depois).
  Conferir na Cobrança e dar baixa à mão nessas linhas antes de cobrar.

## Feito

- [x] "Seu story" com o "+" na foto do próprio perfil (e a foto da
  organização na fileira) e o ponto verde na foto do perfil quando falta
  apelido ou telefone confirmado, com o quadro "Complete sua conta".

- [x] Topo e console do app como no Instagram: logo, publicação e trevo com
  ponto verde no topo; Início, Reels, Mensagens, Buscar, Carrinho e Perfil na
  base (os três do meio com "Em breve"); lateral esquerda no computador;
  "18+", ajuda, tema e cookies na tela do perfil; aviso do trevo e publicação
  do apostador escolhidos pela plataforma em Aparência.

- [x] Formatos da publicação como no Instagram: retrato 4:5, quadrado 1:1,
  paisagem 1,91:1 e vertical 9:16 (perfil por cima), pela primeira peça,
  com as medidas do vídeo lidas no servidor e a foto de celular em pé
  saindo em pé. A tela de mídia mostra o formato de cada peça e as medidas
  recomendadas.

- [x] Publicação no Railway: banco, variáveis, preparo do banco a cada
  versão, verificação de saúde e reinício automático.
- [x] Administrador geral criado.
- [x] Tela de Usuários, arquivar organização com senha + autenticador,
  trocar senha.
- [x] App instalável (PWA) com a faixa "Baixe o app" na tela inicial.
- [x] Botão "Entrar" na tela inicial.
- [x] Menu lateral recolhível (ícones / ícones + nomes).
- [x] Login com "Lembrar de mim", salvar senha no aparelho e ver a senha.
- [x] Testes automáticos do GitHub funcionando (cobrança da conta resolvida).
