# Ordem de execução das pendências até o lançamento

Montada em 05/10/2026 a partir de `docs/PENDENCIAS.md`. A ordem é pela
dependência: cada etapa destrava a seguinte, e o que demora por causa de
terceiros (Meta, advogado, provedor de pagamento) **começa no dia 1**, em
paralelo, para não segurar o resto. Marque aqui mesmo o que for fechando.

## Dia 1 — disparar o que depende de terceiros (demora semanas)

O **CNPJ já é o oficial** (confirmado em 08/10/2026): no fim muda só a
**razão social**. Então a Meta e o pagamento **não esperam mais** — a
verificação e o pedido aos provedores saem com o CNPJ de hoje. Quando a razão
social mudar, a Meta e o provedor pedem o cartão CNPJ novo para atualizar o
cadastro (o roteiro do dia está na etapa 5, "Dia da troca da razão social").

- [ ] **Meta / WhatsApp**: verificar a empresa Sorte Nacional na Central de
  Segurança (CNPJ, endereço, site, documento). É o que libera o modelo
  `codigo_acesso`; sem ele ninguém entra em "Minhas cotas" nem pede
  reembolso. No mesmo dia: completar o perfil e aceitar os termos de
  desenvolvedor.
- [ ] **Advogado**: **todo o conteúdo aprovado em 08/10/2026** — contrato
  plataforma ↔ promotora e anexos A a E (com as ressalvas), termo do
  afiliado, consentimento biométrico (A.1 e A.2), aviso de cookies,
  reembolso, fluxo do pedido, regulamento e apuração (itens 2 a 9), Termos
  de uso e Privacidade. O registro de cada resposta está em
  `docs/PENDENCIAS.md`. Faltam só duas leituras, cada uma esperando um passo
  de fora:
  - a **versão final do contrato da promotora** (prevista para 09/10/2026),
    com os quatro pontos dele: cláusula 1.1 (autorização da promotora para a
    guarda da comissão), Anexo C (cópia da autorização do SCPC), Anexo E
    (documento de imunidade quando invocado) e a plataforma como mandatária
    na guarda;
  - o **aprovado final dos Termos e da Privacidade com os dados da empresa
    trocados** (e-mail institucional, encarregado com o cargo, endereço
    oficial) — depende da etapa 5: publicados os dados, os dois textos são
    gerados do site e vão a ele. Trocar só a razão social depois não pede
    nova leitura: o texto é o mesmo, com o nome novo.
  A frase completa da A.2 só entra depois do opt-out da AWS (etapa 7), sem
  nova leitura dele.
- [x] **Contador** (respondido em 07/10/2026): a comissão guardada é
  dinheiro de terceiro em trânsito — entra a débito de Banco e a crédito de
  "Valores a repassar — afiliados" (passivo) e sai no pagamento, sem passar
  pelo resultado (sem PIS, COFINS, IRPJ, CSLL e ISS). A nota do afiliado
  descreve "promoção de vendas" (CNAE 7319-0/02) e, na guarda, sai contra a
  International Lottery Ltda; MEI e Simples não sofrem retenção. A receita
  da plataforma é só a taxa ou a mensalidade, com NFS-e mensal contra cada
  promotora. Pendências que sobraram: seção 5 de `docs/PENDENCIAS.md`.
- [ ] **Pagamento**: pedir por escrito ao Mercado Pago e ao Asaas se aceitam
  promoção comercial com autorização SPA/MF. A resposta decide o provedor
  (etapa 4).
- [ ] **Meta e Google Ads**: perguntar se a conta de anúncios pode rodar
  anúncio de sorteio (só importa para o Marketing, etapa 7).

## Etapa 2 — segurança da casa (antes de qualquer deploy)

- [ ] Railway: `SESSION_SECRET` e `COFRE_CHAVE` definidas e longas
  (`openssl rand -base64 32`; **guarde a `COFRE_CHAVE` fora do Railway**:
  perder a chave é perder os documentos fiscais e trancar o segundo fator).
- [ ] Apagar `ADMIN_PASSWORD` do Railway; confirmar que o seed nunca rodou
  em produção (nenhuma senha de exemplo entra).
- [ ] Trocar a senha do administrador; redefinir a do organizador; ativar o
  segundo fator do administrador.
- [ ] Apagar na Meta o token temporário antigo; confirmar que o token em uso
  é de usuário do sistema com validade "Nunca".
- [ ] Apagar as branches antigas no GitHub (`fix/duplicate-routes`,
  `feature-media-library-page`, `claude/zen-davinci-rw3i6v`,
  `claude/rename-jogo-do-bicho-glo23j`).

## Etapa 3 — o deploy da versão inicial

- [x] Instalar o `ffmpeg` na imagem de produção (`railpack.json`, `deploy.aptPackages`).
- [ ] **`npm run db:push`** (cria a extensão `pg_trgm` antes; o usuário do
  banco precisa poder criar extensão) e, **logo depois, uma vez**:
  `UPDATE stories SET publica_em = created_at WHERE publica_em > created_at`.
  O rascunho criado antes da apuração pela Federal fica sem método: a
  publicação pede a escolha nos dados legais (e o total em potência de 10).
  A tabela `retencoes_cautelares` (retenção de saldo no banimento) também
  sobe aqui. E as colunas do contrato da promotora (`texto_sha256`,
  `contratos_promotora.modelo` e `campaigns.contrato_promotora_id`); se já houver contrato publicado, logo
  depois, uma vez: `UPDATE contratos_promotora SET texto_sha256 =
  encode(sha256(convert_to(texto, 'UTF8')), 'hex') WHERE texto_sha256 IS NULL`
  e o mesmo em `contrato_promotora_aceites`.
  As tabelas dos anexos do contrato (`contrato_anexos`,
  `contrato_anexo_aceites`) e a coluna `campaigns.contrato_anexo_ids` também.
  E as da fila de trabalho (`trabalhos`, `trabalho_arquivos`, `trabalhadores`).
  E as do tráfego pago (`trafego_campanhas`, `trafego_gastos`, com as
  colunas `cliques`, `origem` e `excedente_cents` da fase 2, e
  `trafego_criacoes` da fase 3 — sem ela, o painel do tráfego dá 500) e as
  colunas `trafego_campanhas.taxa_cobrada_em`, `taxa_aceite_em`,
  `taxa_aceite_versao` e `taxa_aceite_sha256` da taxa cobrada na aprovação
  (sem elas, o pedido e a lista dão 500; a campanha de antes fica com a
  marca nula e segue com a taxa diária).
- [ ] Deploy. Conferir a verificação de saúde e os relógios no log.
- [ ] Criar o serviço do trabalhador (o gerador de vídeo) no Railway, com
  `npm run start:worker` e só o `DATABASE_URL` (passo a passo em
  `docs/PENDENCIAS.md`). Pode vir depois do lançamento: sem ele, o pedido
  de vídeo espera na fila e a tela diz isso.
- [ ] Conferir em Antifraude que os IPs chegam diferentes (um IP só para
  todos é proxy a mais no caminho).
- [ ] Testar num celular de verdade: instalar o app, seguir um organizador,
  publicar uma rifa de teste, vídeo com som e "Assistir novamente",
  publicar um reels pelo celular; no iPhone, a tela cheia do sorteio.

## Etapa 4 — dinheiro

- [ ] Escolher o provedor (pela resposta do dia 1) em Configurações →
  Pagamentos e estorno; chaves e webhook no Railway (`MP_*` ou `ASAAS_*`).
- [ ] Asaas: no sandbox, um Pix de carrinho com duas carteiras (split com
  dois destinos) e a devolução parcial de um pedido; confirmar com o Asaas
  como estornar o split.
- [ ] Se houve venda com split antes da taxa retida: dar baixa à mão nas
  linhas antigas na Cobrança.
- [ ] Reembolso: ligar "Aceitar pedidos de reembolso" quando decidir; cada
  organização confere o prazo e o WhatsApp do aviso. (Depende do
  `codigo_acesso` da Meta para o comprador conseguir pedir.)

## Etapa 5 — a plataforma pronta para o público

- [ ] Aparência → Dados da empresa (razão social, CNPJ, endereço, e-mail,
  encarregado de dados), com os dados oficiais, e **publicar o template**.
  Até lá, `/termos` e `/privacidade` dizem que os dados ainda não foram
  publicados, e o contrato da promotora com campos da empresa não publica
  (422) — os dois esperam este passo.
- [ ] **Dia da troca da razão social** (o CNPJ não muda; nenhum código
  muda). Na ordem:
  1. Aparência → Rodapé e empresa → Dados da empresa: a razão social nova,
     **Salvar** o cartão e **publicar o template**. Sem publicar, fica só no
     rascunho. Na hora, os Termos de uso, a Privacidade e a nota fiscal que o
     afiliado emite contra a plataforma (comissão guardada) passam a mostrar
     o nome novo.
  2. Configurações → Contrato da promotora: o cartão avisa que os dados da
     empresa mudaram; **publicar a versão seguinte** (o mesmo texto, com o
     nome novo). Fazer o mesmo em **cada anexo** que mostrar o aviso. A
     versão em vigor nunca muda sozinha: o aceite é a prova do texto lido.
  3. Avisar as organizações: cada uma **aceita a versão nova** (do contrato e
     dos anexos que usa) antes de publicar a próxima rifa. As rifas já no ar
     seguem na versão com que foram publicadas (cláusula 6.2).
  4. Fora do sistema: mandar o cartão CNPJ novo à Meta (verificação da
     empresa) e ao provedor do Pix.
  O que **não** muda: o regulamento e o bilhete (trazem a promotora), o
  consentimento da foto (traz o e-mail do encarregado) e os recibos já
  emitidos (são o retrato do dia; os da comissão guardada dizem
  "Plataforma").
- [ ] Aparência: banners da vitrine, logos e redes do rodapé.
- [ ] Sorteios oficiais: cadastrar o id do canal da Caixa (@caixa) e os
  próximos concursos da Federal.
- [ ] Ligar os interruptores em Aparência → Topo do app: Reels, Mensagens,
  Buscar (e "publicar apostador", se quiser).
- [ ] WhatsApp: criar o modelo `chamado_novo` pelo painel, esperar a
  aprovação e mandar um teste com um modelo aprovado.
- [ ] Google OAuth: cliente e `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  (sem elas o botão não aparece; nunca `GOOGLE_PROVA` em produção).

## Etapa 6 — cada organização (um roteiro para mandar a elas)

- [ ] **Aceitar o contrato da plataforma** em Configurações → Organização e
  perfil (depois que você publicar o texto do advogado lá): sem o aceite,
  nenhuma rifa dela é publicada.
- [ ] **Aceitar os anexos das modalidades em que vai vender** (no mesmo
  cartão): rifa da Federal, com cota premiada, com bônus ou com entidade
  beneficiada não publica sem o anexo daquela modalidade.
- [ ] Confirmar o telefone pelo código em Configurações; **você aprova** em
  Organizações → "Aprovar telefone" (sem isso ela não publica).
- [ ] Endereço; foto e bio; capa, cor e links do perfil público.
- [ ] Publicar o termo de adesão de afiliado (versão nova).
- [ ] Certificado de autorização SPA/MF de cada rifa (número e arquivo), e
  conferir a autorização antes de aprovar qualquer adiamento.

## Etapa 7 — depois que o advogado e o contador responderem

- [x] Ajustar textos que eles pedirem (Termos, Privacidade, reembolso,
  termo do afiliado) e subir `VIGENCIA_DOS_TERMOS` — feito até 08/10/2026
  (#205 a #209).
- [ ] Ligar, na ordem: Presente (Bônus → Presente), Programa de bônus,
  Guarda da comissão.
- [ ] Marketing: cadastrar pixels e chaves (só com o ok da Meta e do Google).
- [ ] Verificação com comparação automática da foto (opcional): conta na
  AWS **com o opt-out de serviços de IA ativado** e o contrato conferido
  (condição de ativação do advogado), `ROSTO_*` no Railway e, no mesmo PR, a
  frase completa da A.2 com a versão do consentimento subida (o texto está
  em `docs/PENDENCIAS.md`).

## Etapa 8 — receita extra (quando quiser vender)

- [ ] Banner pago: preço do dia e vagas, e ligar o produto.
- [ ] Patrocinadas: conferir a tabela e a conta que recebe as recargas;
  decidir sobre o botão de reembolso do saldo.
- [ ] Assistente de IA (o Lucky): conta e agente no Chatbase com as
  instruções do roteiro e os arquivos de `npm run base-ia`, chave no Railway,
  id em Aparência, cadastrar as 11 ações como tipo Client e ligar só para o
  master (D8); os preços antes de liberar organização e afiliado.
- [ ] Cloudflare Stream: ativar, token, chave de assinatura (guarde o
  `jwk`), `VIDEO_PROCESSOR=cloudflare-stream` e
  `CLOUDFLARE_STREAM_ENTREGA=hls`. Só quando houver vídeo de rifa com
  audiência (cobra por minuto).
- [ ] Cloudflare R2: só quando houver mais de uma réplica ou muito tráfego
  de imagem.

## Etapa 9 — abrir ao público

- [ ] **Reset geral**: remover o perfil de demonstração e todo dado de
  teste.
- [ ] Teste da Stone numa maquininha (`docs/MAQUININHAS.md`), se for usar
  cambista com maquininha no lançamento; senão, fica para depois.
- [ ] Abrir.

## Depois de 1 a 2 semanas no ar

- [ ] Olhar o log de produção (`[csp]`) com os pixels ligados; o que for
  nosso entra na lista e a política de conteúdo passa de relatório a
  valendo (código, comigo).

## Fica para depois da versão inicial (código, comigo)

- Ligar o globo da plataforma como método de apuração, depois de homologado
  (o código está pronto: é ligar em "Métodos de apuração", sem deploy).
- Ferramentas de imagem e vídeo (`docs/PLANO-FERRAMENTAS.md`, fases B a F; a
  A — artes prontas — e a G — pacote para postar — já estão feitas).
- APK das maquininhas (precisa de máquina com o Android SDK).
- O que foi deixado de fora de propósito: vídeo do afiliado pelo Stream,
  perfil público do afiliado, hashtags, moderador de grupo.
