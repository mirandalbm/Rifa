# Pendências

Lista viva do que falta para a rifa vender em produção. Atualizada a cada
etapa — quem fechar um item marca aqui no mesmo PR.

Última atualização: 26/09/2026 (de quem é o cliente).

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
- [ ] **[você]** Cloudflare R2: criar o bucket e gerar as chaves (sem isso,
  não sobe banner nem foto de rifa).
- [ ] **[você]** Domínio próprio apontado para o Railway.
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
- [ ] **[código]** Ainda do perfil, depende de outras etapas: anel de story
  (vitrine), item "Bônus" do menu (gamificação), foto do ganhador como capa depois do sorteio (painel de
  resultados), pedido de colaborador dentro do app e "seguidores da mesma
  rifa".
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
- [ ] **[código]** Central de ajuda, regulamento e transmissão do sorteio.
- [ ] **[código]** Construtor de templates e white label do organizador.
- [ ] **[código]** Vitrine: banners, stories, estados, feed.
- [ ] **[código]** Painel de resultados do organizador.
- [ ] **[código]** Afiliado multi-organização, termo por rifa, colaborador.
- [ ] **[código]** Guarda da comissão pela plataforma, cadastro fiscal e
  recibo.
- [ ] **[código]** Indicação, bônus e gamificação.
- [ ] **[código]** Disputa de reembolso no administrador geral.
- [ ] **[código]** Rifas patrocinadas por clique.
- [ ] **[código]** Marketing e tráfego pago.
- [ ] **[código]** Login com Google.
- [ ] **[você]** Advogado: regra de reembolso (arrependimento × corte de
  2 h), cota grátis de bônus no regulamento.
- [ ] **[você]** Contador: guarda da comissão pela plataforma e RPA/nota
  dos afiliados.
- [ ] **[você]** Cliente OAuth do Google.

## 6. Código, para depois

- [ ] **[código]** Maquininha Stone no invólucro Android: faltam os nomes de
  classe do SDK da Stone (a do PagBank está pronta).
- [ ] **[código]** Compilar o APK das maquininhas — precisa de máquina com o
  Android SDK.
- [ ] **[código]** Pôster e transcode dos vídeos das rifas (Cloudflare Stream
  resolve os dois).
- [ ] **[código]** Revisão completa das telas, com prints, para ajustes de uso.
- [ ] **[código]** Cobrança com Asaas: nas vendas com split, a taxa da
  plataforma já fica retida na origem, mas a tela de Cobrança ainda a lista
  como devida pela organização. Até marcar essas taxas como "recebidas no
  split", **não cobre de novo** a taxa de organização com carteira Asaas.

## Feito

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
