# Perguntas ao advogado — tráfego pago, saldo, Tesouraria e acessos (09/10/2026)

Lista **única e enxuta**, para repassar ao advogado. Ela substitui as perguntas
das seções 3, 10, 16 e 17 de `docs/CONSULTA-CONTADOR-E-ADVOGADO.md` (que ficam
como histórico): as repetidas foram juntadas e as que o contador já fechou
saíram ou ganharam o contexto novo. A numeração é a desta lista.

**Situação (09/10/2026):** o advogado respondeu a **prioridade 1 (A1 a A6)** e a **prioridade 2
(B a D1)** de forma resumida; **não tocou a prioridade 3**. As respostas e a
conferência estão na **seção 22** de `docs/CONSULTA-CONTADOR-E-ADVOGADO.md`. A
**"Segunda rodada"**, no fim deste arquivo, junta o que ficou sem resposta e as
correções.

**Como responder (pedido ao advogado).** Para cada pergunta: **sim / não / sim
com ressalva**, o **fundamento** em uma ou duas linhas e, onde houver, a
**cláusula** que recomenda. Marcamos a prioridade: **[1]** decide se o modelo A
pode existir; **[2]** vai para o contrato e para a tela antes de ligar o
produto; **[3]** pode esperar o lançamento.

## O que o advogado precisa saber

**A plataforma** vende rifas autorizadas pela SPA/MF; cada **organização** é a
promotora (a autorização é dela). Agora oferece, como serviço, **anunciar a rifa
da organização** no Meta (Facebook e Instagram), no Google e no TikTok. A
plataforma é **Lucro Real**.

**Dois modelos de tráfego pago:**
- **Modelo A — a campanha roda na conta de anúncios da plataforma.** A
  organização paga à plataforma, do **saldo pré-pago** dela, a **mídia** (o
  "pacote": R$ 50, 100, 250, 500 ou outro valor) mais uma **taxa de gestão**
  (20% de fábrica, ajustável) **por cima**. A plataforma é quem contrata e paga
  a rede, em nome próprio.
- **Modelo B — a organização liga a própria conta de anúncios.** Ela paga a mídia
  direto à rede; a plataforma gerencia, mede e cobra **só a taxa**, debitada de
  um saldo de taxa conforme lê o gasto.

**O que já está decidido no produto (não precisa perguntar de novo, só validar):**
1. A **taxa é cobrada inteira na aprovação da campanha** e **não é devolvida**.
2. A **mídia não gasta volta ao saldo como crédito, nunca em dinheiro**.
3. A organização dá um **aceite explícito** (caixa "Li e concordo", com o texto
   exato do pedido, data, versão e impressão SHA-256 gravados). Texto atual: *"A
   taxa de gestão de X% (R$ Y neste pedido) é cobrada quando a plataforma aprova
   a campanha e não é devolvida, mesmo que a campanha termine antes de gastar
   tudo. O valor em anúncios que não for usado volta ao seu saldo como crédito,
   não em dinheiro, e pode ser usado em outra campanha."*
4. O **reembolso em dinheiro do saldo** existe, mas **nasce desligado**.
5. Existe um **contrato da plataforma com a promotora**, com aceite versionado
   (regresso, autorização SPA/MF e IR por conta dela, Pix por fora, prêmio
   desembaraçado, retenção cautelar de saldo).

**O que o contador fechou e muda a redação do contrato:**
- No modelo A a operação é **em conta própria**: a plataforma contrata a rede e
  responde por ela. Não é mandato nem repasse. O contador **recomenda evitar a
  palavra "revenda de mídia"** (risco de enquadramento fiscal) e usar algo como
  *"prestação de serviço de publicidade com fornecimento de mídia por
  subcontratação, em conta própria"*; a nota fiscal diz o mesmo.
- O **ISS incide sobre mídia + taxa** no município da plataforma; o crédito de
  PIS/COFINS sobre a fatura da rede é defensável, com risco.
- **O imposto da rede está dentro do que se paga**: no checkout do Meta, R$ 60.000
  pagos viram R$ 52.710 de saldo de anúncios (ISS 2,9% e PIS/COFINS 9,25% sobre o
  total). Cada R$ 100 de anúncio custa à plataforma cerca de R$ 113,83.
- Com isso a **taxa de 20% não sustenta o modelo A** se a mídia for vendida a
  R$ 100 por R$ 100 de anúncio. As saídas em estudo: discriminar o imposto da
  rede ao cliente, fazer como o Meta (o pacote vira R$ 87,85 de anúncio) ou
  subir a taxa.

**A proteção de gasto (desenho do dono):** a plataforma conta o crédito e o gasto
de cada campanha, **pausa a campanha na rede sozinha quando o saldo restante cai
a 10%**, e, se não conseguir, **alerta uma fila de gestão de marketing**, que tem
um botão **"Travar agora"** (só o perfil Marketing ou o administrador). O teto do
orçamento no próprio Meta é a primeira trava.

**A Tesouraria** é um painel de **controladoria** do administrador geral: calcula
e registra, **não move dinheiro**. Haverá **perfis de equipe** (financeiro,
marketing, atendimento…) com login criado pelo administrador.

---

## A. O modelo A existe? (prioridade 1)

**A1. [1] Termos das redes: vários anunciantes na conta da plataforma.** Meta,
Google e TikTok permitem rodar campanhas de **vários anunciantes** na **mesma
conta de anúncios** da plataforma (revenda/agência)? Que identificação do
anunciante real e de quem paga é exigida? **Rifa é "jogo de azar online"** na
política do Meta e exige **autorização da conta de anúncios** (licença, revisão
manual): ela é pedida **em nome da plataforma ou de cada promotora**? Se a conta
única for restrita por causa de **uma** organização, quem responde perante a rede
e perante as outras organizações? Isso **inviabiliza o modelo A** para rifas?

**A2. [1] Estrutura do contrato do modelo A.** Saem o mandato e o repasse; entra a
prestação de serviço de publicidade com fornecimento de mídia por subcontratação,
em conta própria. Como redigir: (a) a **responsabilidade pelo conteúdo** do
anúncio (da organização) e pela **reprovação** pela rede; (b) o **saldo-crédito**;
(c) o **aceite da taxa** (hoje redigido para o cenário de repasse); (d) o **nome da
operação**, que o contrato e a nota devem usar igual, sem "revenda de mídia".

**A3. [1] Responsabilidade perante a organização e o consumidor.** Sendo a
plataforma a contratante da rede, aumenta a responsabilidade dela (CDC e
solidariedade, art. 7º, parágrafo único) por falha da campanha? E o regresso
contra a organização, que o contrato da promotora já prevê, continua valendo para
o tráfego pago?

**A4. [1] Risco de crédito e de estorno.** A plataforma paga a rede (inclusive o
gasto que passa do saldo, o "excedente") e a organização pagou o saldo por Pix:
que cláusula cobre (a) o **estorno do Pix** do saldo depois de a mídia ter sido
consumida, (b) o **prazo para repor o saldo**, (c) o **direito de pausar** a
campanha, (d) **garantias**?

**A5. [1] Imposto da rede no preço.** O contrato pode dizer que **o pacote é o
total pago e o saldo de anúncios é esse total menos o imposto da rede** (como o
próprio Meta faz: R$ 60.000 viram R$ 52.710 de saldo), ou que o imposto é
**discriminado e somado**? Que **informação prévia** (CDC arts. 6º, III, e 31;
Decreto 7.962/2013) a tela e o aceite precisam trazer?

**A6. [1] Saldo pré-pago e dinheiro de terceiros.** O **saldo pré-pago** das
organizações (patrocínio, banner pago, tráfego, assistente de IA) caracteriza
**arranjo ou instituição de pagamento** (Banco Central) ou **captação indevida**?
O reembolso em dinheiro **desligado por padrão** reduz o risco? O **bloco de
mídia** (dinheiro das organizações reservado para pagar as redes) exige **conta
bancária segregada** por lei ou contrato, ou basta o controle contábil? Que
cláusula impede que esse dinheiro **responda por dívida da plataforma**? O painel
da Tesouraria só calcula e registra: isso muda a análise?

## B. Taxa, aceite e crédito (prioridade 2)

**B1. [2] Validade da taxa que não volta e do crédito que não vira dinheiro.** O
texto do aceite é suficiente? A organização pode ser **pessoa física, MEI,
associação ou empresa**: o **CDC se aplica**? Em relação **B2B** a taxa não
reembolsável vale? E se for consumidora? Se a organização **encerra a campanha
logo depois de aprovada**, a taxa **inteira** é defensável, ou há dever de devolver
a parte do serviço não prestado? (O contador pensa em diferir a receita e devolver.)

**B2. [2] Exceção por falha da plataforma.** O contador diz que, se a campanha for
**reprovada na rede, a conta for restrita ou o anúncio nunca rodar por culpa
nossa**, a taxa **não pode ficar como receita** e tem de voltar. Nossa proposta:
**só nesse caso, devolver a taxa como crédito** no saldo (não em dinheiro),
mantendo "não volta" quando a causa é a decisão da organização (encerrar, verba
que acaba, rifa que sai do ar, reprovação por conteúdo dela). É defensável? Como
redigir a cláusula e **quem prova a culpa**? O crédito basta ou há dever de
devolver em dinheiro?

**B3. [2] Validade do crédito.** O contador recomenda **6 ou 12 meses**, e a baixa
do vencido **vira receita tributável**. Proposta: **12 meses**, contados do
lançamento. O vencimento do crédito pode ser **imposto sem devolução em
dinheiro**? Há **prazo mínimo legal**, exige **aviso prévio**? E o que acontece com
o saldo no **encerramento da conta**, na **rescisão** e no **banimento** (relação
com a **retenção cautelar** de saldo que o contrato da promotora prevê)?

**B4. [2] Prova do aceite.** Caixa "Li e concordo" + texto exato + data + versão +
SHA-256: serve de prova? Falta **IP e aparelho** (o contrato da promotora já
guarda)? **Prender o texto que a pessoa viu** (a tela recusa o pedido se a taxa
mudou entre abrir a tela e clicar) basta como consentimento informado?

**B5. [2] Excedente e proteção de gasto.** A rede cobra a plataforma pelo gasto
que acontece **entre duas leituras** ou depois da pausa (o "excedente"), e a
plataforma hoje **absorve** esse custo. (a) Pode virar **cobrança contra a
organização**, com que cláusula? (b) A plataforma promete **pausar sozinha aos 10%
do saldo**, tem fila de alerta e botão "Travar agora": isso cria **obrigação de
resultado**? Que **limitação de responsabilidade**, "melhor esforço" e prazo de
leitura do gasto devem constar? (c) Os **10% de reserva** continuam sendo saldo da
organização, voltam como crédito se a campanha encerra: precisa constar do
contrato?

**B6. [2] Anúncio reprovado, conta restrita ou suspensa por conteúdo da
organização.** Quem responde? Dá para **repassar esse risco** (indenização,
multa)? E o que fazer com o **Pix por fora**, a promessa de ganho e outros
conteúdos que as redes e o CDC proíbem?

## C. Modelo B: a organização liga a própria conta (prioridade 2)

**C1. [2] Gerir a conta de anúncios do cliente.** Como parceiro, só com permissão
de gestão: que **mandato**, que cuidados de **LGPD**, quem responde por **violação
de política da rede**, como fica a **revogação** do acesso e o que acontece com
**campanha ativa** quando ele é revogado.

**C2. [2] Taxa sobre o gasto lido.** A taxa é calculada sobre o **gasto sem
imposto** que o Ads Manager mostra (lido por API) e **debitada de um saldo de
taxa** conforme a leitura; sem saldo de taxa, a campanha pausa. Que cláusula fixa
a **base de cálculo**, o **direito de a organização auditar** e a pausa?

## D. Publicidade e conformidade (prioridade 2 e 3)

**D1. [2] Anúncio de rifa.** Como identificar como **publicidade** e que
**advertências** são obrigatórias (18+, jogo responsável, número da autorização
SPA/MF)? O que a **autorização SPA/MF permite dizer** no anúncio e o que não?

**D2. [3] "Pré-aprovada pela plataforma".** Podemos usar esse rótulo para a
conferência que fazemos antes de enviar à rede (**nunca** "aprovada pelo Meta")?
Há responsabilidade se a rede reprovar depois?

**D3. [3] Assistente de IA (Lucky).** Ele orienta campanhas e sugere textos de
anúncio. Que **ressalvas legais** devem constar na tela e nos termos?

**D4. [3] Doação de parte da taxa a uma ONG.** Se a plataforma disser ao cliente
que "parte da taxa é doada à ONG X", que cuidados valem (publicidade enganosa,
comprovação, percentual real, a ONG ser a **mesma entidade beneficiada** de uma
rifa)? A doação pode ser **vinculada ao pedido** ou só a uma **política geral** da
empresa? A política precisa de **ata** ou documento interno?

## E. Dados pessoais e equipe (prioridade 3)

**E1. [3] Envio de conversão às redes.** Eventos de compra com **telefone em hash**
a Meta, Google e TikTok (pixel e API de conversões) e a **transferência
internacional**: o aviso de cookies atual basta? Elas são **controladoras
conjuntas**?

**E2. [3] Perfis de equipe e necessidade.** A equipe terá perfis fechados:
atendimento com o **ID do cliente** (sem CPF), financeiro **sem dado pessoal**,
compliance com documentos. Esse desenho atende ao **princípio da necessidade**
(LGPD, art. 6º, III)?

**E3. [3] Termo de confidencialidade e uso aceitável.** A equipe aceita um termo
no **primeiro acesso**, com o aceite gravado (texto, versão, SHA-256, data, IP)
como o contrato da promotora? **Quem redige?**

**E4. [3] Funcionário e dados.** O funcionário é **operador** ou parte do
controlador? Precisa de **contrato de trabalho ou estágio com cláusula de dados**
e de **treinamento registrado**?

**E5. [3] Registros de acesso.** Por quanto tempo guardar o **log de quem leu o
quê** (hoje sem prazo; a LGPD pede minimização, a guarda fiscal é de 5 anos)?

**E6. [3] Contador externo.** Com acesso de leitura ao painel: precisa de **contrato
de operador** e **cláusula de sigilo**? Pode receber os extratos **por e-mail** ou
só por **download autenticado**?

**E7. [3] Fechamento mensal imutável.** O **retrato** do fechamento (com a
impressão SHA-256) vale como **prova interna**? Há **prazo mínimo de guarda**?

---

## Para o parecer conjunto com o contador

O contador e o advogado vão assinar um **parecer conjunto** antes de qualquer
parametrização definitiva (a posição do modelo A com fundamentos, o custo
tributário de cada cenário, o **preço da taxa por cenário** e os riscos
contratuais e das redes). **O advogado é quem decide a estrutura do parecer**
(o contador só começa quando o advogado concordar) e é dele a análise dos
**termos das redes (A1)**, o ponto que pode mudar tudo.

---

## Segunda rodada (depois da primeira resposta, 09/10/2026)

O advogado concluiu: **não implementar o modelo A como descrito**; só com **contas
de anúncio segregadas por promotora**; **parecer de direito bancário** sobre o
saldo pré-pago; **consulta formal à Meta e ao Google** sobre agência. Perguntas
novas, e o que ficou em aberto:

**R1. [1] "Contas segregadas por promotora" é o modelo B?** Cada promotora é a
**anunciante, titular da conta de anúncios e da autorização**, e a plataforma
tem só acesso de parceiro para gerir? Se for isso, as restrições de política
**do conteúdo** (autorização de jogo de azar na Meta, certificação no Google e
TikTok) valem para **cada promotora na conta dela**, e a plataforma deixa de
responder por uma conta única? Ou há uma terceira estrutura (uma conta por
promotora **dentro** do gerenciador da plataforma, titular a plataforma)?

**R2. [1] Responsabilidade de gestão no modelo B.** Que cláusulas limitam o risco
de **erro de gestão** que o advogado apontou (gasto acima do autorizado, falta de
otimização): **obrigação de meio**, **orçamento teto fixado pela promotora** (e
posto no próprio Meta), **aprovação prévia do anúncio** antes de ligar, relatório,
prazo de reclamação. A **taxa mais alta** que ele sugere é necessária?

**R3. [1] TikTok e Google para rifa.** A conclusão "TikTok inviável" vem da
política de **anúncios** ou da do **TikTok Shop** (que proíbe rifa)? O que a
**política de mercado do Brasil** do TikTok diz de loteria e rifa autorizada pela
SPA/MF? No Google, a certificação do Ministério da Fazenda (apostas e cassino)
alcança **rifa autorizada pela SPA/MF** ou há categoria própria? Vale para o
modelo B também?

**R4. [2] Norma da publicidade da rifa.** A **Lei 14.790/2023 e a Portaria SPA/MF
nº 1.231/2024** tratam de **apostas de quota fixa**. Qual norma rege a
publicidade de **rifa autorizada** (Lei 5.768/71, Decreto 70.951/72 e as portarias
da SPA/MF para promoção comercial)? As exigências (número da autorização, 18+,
não associar a riqueza) vêm de qual delas?

**R5. [2] Base dos 12 meses do crédito.** O art. 26, § 3º, do CDC trata do prazo
para reclamar de vício, não da validade de crédito. Em que norma ou prática se
apoiam os 12 meses? E o que ele não tratou: **baixa do crédito vencido**, **aviso
prévio**, o saldo no **encerramento da conta**, na **rescisão** e no **banimento**
(retenção cautelar que o contrato da promotora prevê).

**R6. [2] "Pausar aos 10% de excedente."** Nosso desenho é **pausar quando o saldo
restante cai a 10%**; "excedente" é o que a rede gasta **além** da verba. Sua
resposta vale para o nosso desenho? E o que ele não respondeu: o excedente
**pode ser cobrado da promotora**? Que **limitação de responsabilidade** e que
**prazo de leitura** do gasto a cláusula traz? A pausa automática é **obrigação de
resultado ou de meio**?

**R7. [2] Carência do Pix.** A **carência de 7 dias** do saldo depois do Pix atrasa
o início de toda campanha. Há alternativa (carência menor, valor máximo
liberado no primeiro mês, garantia)? O **Pix tem devolução por fraude (MED)** por
muito mais tempo que 7 dias: a cláusula de **reposição do saldo** basta?

**R8. [2] O saldo que já existe.** O saldo pré-pago já está no sistema (patrocínio,
banner pago, assistente de IA). Enquanto o parecer de direito bancário não sai,
que **medidas provisórias** o advogado recomenda (reembolso em dinheiro desligado,
sem saque nem transferência, conta segregada)? O saldo de **tráfego** deve
**esperar** o parecer?

**R9. [2] Aceite da taxa.** Concordamos em acrescentar **IP e aparelho (em hash)**
ao aceite da taxa (hoje só data, versão e SHA-256). Algo mais para o aceite valer
como prova?

**R10. [2] O que ficou sem resposta na prioridade 2:** **B1** (CDC e B2B; a taxa
inteira se a campanha for encerrada logo após a aprovação), **B6** (anúncio
reprovado ou conta restrita por conteúdo da organização: repassar o risco;
Pix por fora), **C1** (LGPD, revogação do acesso e campanha ativa no modelo B) e
**C2** (base de cálculo da taxa e direito de auditar), e o **"o que a autorização
SPA/MF permite dizer"** do D1.

**R11. [3] Prioridade 3 inteira:** D2 a D4 e E1 a E7.

**Providências que ele pediu (do dono):** (a) contratar o **parecer de direito
bancário** sobre o saldo; (b) **consultar formalmente a Meta e o Google** se uma
agência pode obter a certificação para anunciar em nome de várias promotoras.

**Depois do guia por rede (seção 23 da consulta):** o advogado afirmou que o
**modelo B é o caminho mais seguro** (Meta e Google), que o **TikTok está fora**
para rifa e se ofereceu para **redigir as consultas formais** e **revisar os
contratos**. R1 e R3 ficam em boa parte respondidas (a conta é da promotora; o
TikTok sai). Perguntas que sobram:

**R12. [1] "Agregador" no Google, e o destino do anúncio.** A proibição aos
"agregadores de jogos de azar de qualquer tipo" olha a **conta de anúncios** ou o
**site de destino**? Nosso anúncio leva a uma página **da plataforma**, que é um
site que reúne rifas de várias promotoras. No **modelo B** (conta da promotora)
a plataforma continua sendo vista como agregadora pelo **destino**? Que estrutura
afasta o risco (domínio da promotora, página própria da rifa, a plataforma só como
meio de pagamento)? Esta é a pergunta que mais precisa de **resposta por escrito
do Google**.

**R13. [1] Meta: quem pede a autorização no modelo B.** Cada promotora pede a
**própria** autorização para a conta dela e prova a SPA/MF de cada rifa. Que papel
a plataforma pode ter (preparar o dossiê, fornecer o número da autorização e o
certificado) **sem se tornar a anunciante**? E "contas segregadas **por rifa**" é
mais de uma conta por promotora?

**R14. [2] Redação, a pedido dele:** (a) o **anexo do contrato do modelo B** com as
cinco cláusulas da seção 23 e as de gestão da seção 22; (b) as **consultas formais
à Meta e ao Google**, incluindo R12; (c) a **revisão trimestral** que ele sugere:
quem faz e o que ela cobre.

**R15. [2] TikTok.** A fundamentação da proibição mudou entre as duas respostas.
Qual é a **cláusula da política de anúncios do TikTok** (versão, seção do
Brasil) que ele usa? Se a plataforma quiser anúncio de **marca** (sem rifa), o
que a política permite?
