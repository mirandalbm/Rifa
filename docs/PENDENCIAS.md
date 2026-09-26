# Pendências

Lista viva do que falta para a rifa vender em produção. Atualizada a cada
etapa — quem fechar um item marca aqui no mesmo PR.

Última atualização: 26/09/2026 (reembolso por chamado).

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
- [ ] **[você]** Ligar "Aceitar pedidos de reembolso" (Configurações →
  Pagamentos e estorno) quando decidir aceitar, e cada organização conferir
  o prazo de reembolso em Configurações.
- [ ] **[você]** O comprador só entra em "Minhas cotas" pelo código do
  WhatsApp: **sem o modelo `codigo_acesso` aprovado (item 1), ninguém
  consegue pedir reembolso** — nem ver as cotas.
- [ ] **[você]** Cloudflare R2: criar o bucket e gerar as chaves (sem isso,
  não sobe banner nem foto de rifa).
- [ ] **[você]** Domínio próprio apontado para o Railway.
- [ ] **[você]** Código de autorização SPA/MF de cada rifa (sem ele a rifa
  não publica).
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

## 5. Código, para depois

- [ ] **[código]** Maquininha Stone no invólucro Android: faltam os nomes de
  classe do SDK da Stone (a do PagBank está pronta).
- [ ] **[código]** Compilar o APK das maquininhas — precisa de máquina com o
  Android SDK.
- [ ] **[código]** Pôster e transcode dos vídeos das rifas (Cloudflare Stream
  resolve os dois).
- [ ] **[código]** Aviso ao organizador quando chega chamado novo (hoje a
  tela de Atendimento se atualiza sozinha, mas não há WhatsApp/e-mail para
  ele).
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
