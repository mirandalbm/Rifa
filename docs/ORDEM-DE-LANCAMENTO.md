# Ordem de execução das pendências até o lançamento

Montada em 05/10/2026 a partir de `docs/PENDENCIAS.md`. A ordem é pela
dependência: cada etapa destrava a seguinte, e o que demora por causa de
terceiros (Meta, advogado, provedor de pagamento) **começa no dia 1**, em
paralelo, para não segurar o resto. Marque aqui mesmo o que for fechando.

## Dia 1 — disparar o que depende de terceiros (demora semanas)

- [ ] **Meta / WhatsApp**: verificar a empresa Sorte Nacional na Central de
  Segurança (CNPJ, endereço, site, documento). É o que libera o modelo
  `codigo_acesso`; sem ele ninguém entra em "Minhas cotas" nem pede
  reembolso. No mesmo dia: completar o perfil e aceitar os termos de
  desenvolvedor.
- [ ] **Advogado** (um pacote só, para uma reunião): Termos de uso e
  Privacidade; texto do reembolso e a taxa depois dos 7 dias; cláusula da
  cota de bônus; prêmio em dinheiro e itens proibidos (Decreto 70.951/72);
  texto-base do termo do afiliado; consentimento biométrico; a fórmula exata
  do modo "Autorizado MF" (séries e números da sorte da Federal) e se a
  regra da aproximação atual é aceita.
  **Termos de uso validados em 05/10/2026**; o pacote dos itens 2 a 9 foi
  reenviado. Ele também redige o **contrato plataforma ↔ promotora**
  (regresso, autorização e IR por conta dela, Pix por fora, prêmio
  desembaraçado). **Item 8 respondido em 05/10/2026** (a leitura direta da
  Federal, numeração a partir de zero, total em potência de 10): já está no
  código (`npm run apuracao`). **Item 9 respondido em 05/10/2026**
  (aproximação alternada e circular na Federal, cota de bônus conta, fim da
  "promotora completa" na rifa autorizada, ressorteio no globo): também no
  código. **Item 3 respondido em 06/10/2026**: as regras de reembolso
  ficaram como estão, com um ajuste já no código (3.6: devolução integral em
  até 3 dias úteis; os 1 a 30 dias da promotora só no reembolso com taxa).
  **Item 4 validado em 06/10/2026** (cota de bônus; a cláusula dele no
  regulamento; faltam 4.2, 4.4 e 4.5). **Item 6 validado em 06/10/2026**
  (termo do afiliado, sem mudança; faltam 6.4 e 6.5, tributo e guarda).
  **Item 5 validado em 06/10/2026** (vale-brinde, itens proibidos,
  impedidos, fita circular, 30 dias de entrega, 180 dias ao Tesouro), com a
  trava do prêmio em dinheiro já no código (falta 5.1: a lista exata dos
  itens proibidos, confirmada depois). **Item 7 respondido em 06/10/2026**
  (consentimento biométrico: texto novo, todos autorizam de novo, só o
  resultado guardado — no código). **6.5, 4.2, 4.4, 4.5, 5.1 e C.1 (as três
  frases do item 9) respondidos.** 6.4 decidido e no código: o saque é pago
  só a MEI ou empresa, com a nota fiscal de cada saque.
- [ ] **Contador**: guarda da comissão pela plataforma (o advogado, 6.5: é
  mandato — a comissão guardada **não** entra como receita da plataforma,
  senão paga PIS/COFINS/ISS sobre dinheiro de terceiro) e a nota fiscal
  dos afiliados (6.4: o saque é só para MEI ou empresa, com a nota anexada —
  confirmar com ele o serviço da nota e quem é o tomador na guarda).
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

- [ ] Instalar o `ffmpeg` na imagem de produção (ou `FFMPEG_PATH`).
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
- [ ] Deploy. Conferir a verificação de saúde e os relógios no log.
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
  encarregado de dados) e **publicar o template**.
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
- [ ] Confirmar o telefone pelo código em Configurações; **você aprova** em
  Organizações → "Aprovar telefone" (sem isso ela não publica).
- [ ] Endereço; foto e bio; capa, cor e links do perfil público.
- [ ] Publicar o termo de adesão de afiliado (versão nova).
- [ ] Certificado de autorização SPA/MF de cada rifa (número e arquivo), e
  conferir a autorização antes de aprovar qualquer adiamento.

## Etapa 7 — depois que o advogado e o contador responderem

- [ ] Ajustar textos que eles pedirem (Termos, Privacidade, reembolso,
  termo do afiliado) e subir `VIGENCIA_DOS_TERMOS`.
- [ ] Ligar, na ordem: Presente (Bônus → Presente), Programa de bônus,
  Guarda da comissão.
- [ ] Marketing: cadastrar pixels e chaves (só com o ok da Meta e do Google).
- [ ] Verificação com comparação automática da foto (opcional): conta na
  AWS, `ROSTO_*` no Railway e o texto do consentimento revisado.

## Etapa 8 — receita extra (quando quiser vender)

- [ ] Banner pago: preço do dia e vagas, e ligar o produto.
- [ ] Patrocinadas: conferir a tabela e a conta que recebe as recargas;
  decidir sobre o botão de reembolso do saldo.
- [ ] Assistente de IA: conta e agente no Chatbase, chave no Railway, id em
  Aparência, preços, e cadastrar as ações como tipo Client.
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
- Ferramentas de imagem e vídeo (`docs/PLANO-FERRAMENTAS.md`, fases A a G).
- APK das maquininhas (precisa de máquina com o Android SDK).
- O que foi deixado de fora de propósito: vídeo do afiliado pelo Stream,
  perfil público do afiliado, hashtags, moderador de grupo.
