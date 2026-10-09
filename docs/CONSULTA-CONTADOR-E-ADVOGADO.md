# Consulta ao contador e ao advogado — tráfego pago (09/10/2026)

Registro das perguntas feitas e das respostas recebidas sobre o **tráfego
pago** (modelo A, a taxa de gestão cobrada na aprovação e o modelo B). O que
vira trabalho de código está na seção 4; o que é decisão do dono, na seção 5.

**Situação**

| Quem | Situação |
|---|---|
| Contador | **Respondeu** (09/10/2026). Primeira rodada na seção 2, doação à ONG na seção 7, segunda rodada (Tesouraria) na seção 11; terceira rodada respondida na seção 13; **quarta rodada respondida na seção 15 (muda a posição fiscal do modelo A: revenda)**; quinta, mínima (4 dúvidas), na seção 16; **comentários finais e o parecer conjunto na seção 17**; **respostas a C11–C16 e a minha conferência na seção 18**; **respostas a C17–C20 e aos pontos que não fechavam na seção 19 (a revenda fica sem a exclusão do ISS)**; **última rodada (C21–C24, que ele não leu) na seção 20: falta só o que depende do parecer e de você**; **normas lidas e crédito como redução de custo na seção 21**. |
| Regime da plataforma | **Lucro Real** (informado pelo dono em 09/10/2026) — ver a seção 8, que muda a leitura de várias respostas. |
| Advogado | **Respondeu as prioridades 1 e 2 (seção 22) e mandou um guia de adequação por rede (seção 23)**: o modelo A não deve ser implementado como está; o **modelo B é o caminho mais seguro** (Meta e Google); **TikTok fora** para rifa; o saldo pré-pago exige parecer de direito bancário. Faltam os itens que ele não tocou. A lista que se repassa é `docs/PERGUNTAS-AO-ADVOGADO.md`. |

## 1. O que o sistema faz hoje (o que foi levado a eles)

- A plataforma anuncia nas contas de anúncio **dela** (Meta, Google, TikTok) e
  cobra a organização do **saldo pré-pago**: a mídia (o pacote) mais a **taxa
  de gestão** (20% de fábrica, ajustável no painel) por cima.
- A taxa é **cobrada inteira quando a plataforma aprova a campanha** e
  **nunca volta**; a mídia que não for gasta volta ao saldo **como crédito,
  nunca em dinheiro** (PR #237, decisão do dono de 09/10/2026).
- O Meta cobra a plataforma pelo preço cheio, com ISS (2,9%) e PIS/COFINS
  (9,25%) já embutidos; o sistema só conta o preço cobrado.
- O gasto da rede além da verba (ou depois da parada) é **custo da
  plataforma**, guardado à parte (`excedente_cents`).

## 2. Respostas do contador (09/10/2026)

### A. Natureza da receita

1. **A mídia repassada não é receita bruta da plataforma**: é repasse (valor de
   terceiros), operação em conta alheia. Citou a Solução de Consulta nº 6.006
   da Receita Federal (valores recebidos para repasse a veículos de
   comunicação, por conta e ordem do anunciante, ficam fora da base do Simples
   Nacional). **Risco**: o fisco descaracterizar e tratar o total como receita
   de agenciamento — a defesa é contrato claro separando a taxa do repasse e
   fluxo financeiro transparente.
2. **A receita é exclusivamente a taxa de gestão.** Código de serviço (LC
   116/2003) **17.06** — propaganda e publicidade, planejamento de campanhas.
   CNAE recomendado **73.11-4-00** (agências de publicidade); alternativa
   73.19-0-99.
3. **O saldo é passivo** ("Adiantamentos de Clientes", passivo circulante). O
   contrato deve dizer o **prazo de validade do crédito**; sem prazo, prescreve
   em 5 anos (Código Civil). Recomenda **6 ou 12 meses** e, vencido, baixar o
   passivo — a baixa **gera receita tributável**.

### B. Fato gerador da taxa

4–5. O fato gerador é a **prestação do serviço**; a cobrança na aprovação cria
o direito de receber. No **regime de competência** (Presumido e Real) a taxa
deve ser **diferida** (receita diferida no passivo) e apropriada ao longo da
campanha: encerrada no dia seguinte, só uma parte ínfima seria receita
realizada, "e o restante deve ser devolvido ou mantido como crédito". No
**regime de caixa** (permitido no Simples) a taxa paga já é receita. Recomenda
competência.

6. **Erro da plataforma** (anúncio reprovado, campanha que não rodou): a taxa
**não é receita realizada** e deve ser **devolvida em dinheiro ou, se o
contrato permitir, compensada como crédito**. Disse que a cláusula "nunca
volta" seria **abusiva e ilegal nesse caso** (CDC, boa-fé objetiva) — ponto
**jurídico, a confirmar com o advogado** (seção 3).

### C. Tributos sobre a taxa

7. Simples (até R$ 4,8 mi/ano; Anexo III, alíquota inicial de 6%). Lucro
Presumido (até R$ 78 mi): IRPJ 4,8% efetivo, CSLL 2,88%, PIS/COFINS cumulativo
3,65%, ISS de 2% a 5% conforme o município. Lucro Real: PIS/COFINS 9,25% com
créditos.
8. **NFS-e na cobrança (na aprovação)** ou, no máximo, mensal (até o dia 5 do
mês seguinte, conforme o município). O tomador é a organização contratante.
9. **Retenções quando o tomador é pessoa jurídica**: IRRF 1,5%; CSRF/PCC 4,65%
(o optante do Simples não sofre, com a declaração do tomador); ISS retido
conforme o município do tomador. O sistema deve registrar cada retenção em
passivo (tributos a recolher) e a receita líquida em resultado.

### D. Tributos sobre a mídia

10. As faturas do Meta/Google/TikTok **geram crédito de PIS/COFINS no Lucro
Real** (STJ: publicidade é insumo); no Presumido e no Simples, não.
11. **Não emitir nota do valor da mídia**; a NFS-e é só da taxa.
12. O repasse se comprova por: extrato de transações das plataformas de
anúncio, faturas/boletos, comprovantes de pagamento e o contrato com o
cliente.

### E. Excedente e custos

13. O excedente cobrado pela rede é **custo da plataforma** (despesa
operacional); no Lucro Real é dedutível se necessário, usual e comprovado (a
fatura da rede); no Presumido não afeta a base presumida.
14. Conta de anúncios brasileira cobrada em reais: sem IOF nem câmbio. Conta no
exterior: IOF/câmbio na remessa.

### F. Modelo B

15. Viável: a plataforma não movimenta a verba; a receita é só a taxa
(calculada sobre o gasto lido por API). O contrato deve dizer que o cliente é
o único responsável por pagar as redes, que a plataforma presta gestão e
monitoramento com a taxa sobre o gasto lido, e que ela não responde por
problema de faturamento do cliente.

### G. Relatório mensal e ONGs

16. **Campos do extrato mensal**: data (aprovação, para competência; ou
pagamento, para caixa), organização (nome e CNPJ/CPF do tomador), valor da
mídia, taxa de gestão, tributo estimado (ISS, IRPJ, CSLL, PIS, COFINS, para
provisão), número da NFS-e, retenções (IRRF, CSRF/PCC, ISS) e excedente.
17. **ONG/entidade beneficente**: a imunidade vale para as atividades
essenciais dela; a taxa de gestão é contraprestação por serviço comercial e
**continua tributável** (verificar só isenção municipal de ISS). O relatório
deve trazer a natureza do tomador.

### Recomendações finais do contador

1. **Contas bancárias separadas** para a verba de mídia (repasse) e para a taxa
   (receita própria) — é a defesa do modelo de repasse.
2. **Contrato robusto** com: natureza de repasse da mídia; **prazo de validade
   do crédito**; **política de devolução/compensação em erro da plataforma**;
   base de cálculo da taxa.
3. NFS-e **só da taxa**, código **17.06** (ou o municipal correspondente).
4. **Regime de competência**, diferindo a taxa ao longo da campanha.
5. Guardar **por 5 anos** extratos, faturas e comprovantes da mídia.
6. No Simples, a **mídia não entra na base do DAS**: o sistema deve segregar.
7. Implementar o relatório mensal com os campos do item 16.

## 3. Perguntas ao advogado (aguardando resposta)

Contexto: o aceite que a organização vê é "A taxa de gestão de X% (R$ Y neste
pedido) é cobrada quando a plataforma aprova a campanha e não é devolvida,
mesmo que a campanha termine antes de gastar tudo. O valor em anúncios que não
for usado volta ao seu saldo como crédito, não em dinheiro, e pode ser usado em
outra campanha." (`textoDoAceiteDaTaxa()`, versão 1).

**A. Validade da cláusula e do aceite**
1. O texto é suficiente? É válido que a taxa não volte e que o crédito não
   volte em dinheiro?
2. O CDC se aplica (a organização pode ser pessoa física, MEI, associação ou
   empresa)? Em B2B a taxa não reembolsável vale? E se for consumidora?
3. Risco de abusividade se a campanha for reprovada pela rede, a conta for
   restrita ou o anúncio nunca rodar **por culpa nossa**? *(O contador diz que
   nesse caso a taxa tem de voltar.)*
4. O aceite por caixa "Li e concordo" com texto exato, data, versão e SHA-256
   serve de prova? Falta IP/aparelho?
5. Prender o texto que a pessoa viu (409 se a taxa mudar entre abrir a tela e
   clicar) basta como consentimento informado?

**B. Contrato da promotora**
6. Que cláusula entra para a taxa não reembolsável e o crédito sem devolução em
   dinheiro? **Prazo de validade do crédito** (o contador pede 6 ou 12 meses)?
   E o saldo no encerramento da conta, na rescisão e no banimento (relação com
   a retenção cautelar)?
7. Quem responde por anúncio reprovado, conta de anúncios restrita ou suspensa
   por conteúdo da organização? Dá para repassar esse risco?

**C. Política de anúncios de rifa**
8. O Meta trata rifa como "jogo de azar online" e exige autorização da conta de
   anúncios. Em nome de quem se pede (plataforma ou promotora)? Responsabilidade
   se a conta única da plataforma for restrita por causa de uma organização?
9. O mesmo no Google e no TikTok? O que a autorização SPA/MF permite dizer no
   anúncio?

**D. Modelo B**
10. Gerir a conta de anúncios do cliente (parceiro, só permissão de gestão):
    mandato, LGPD, responsabilidade por violação de política, revogação de
    acesso, campanha ativa.
11. Taxa sobre o gasto lido da conta do cliente: cláusula da base de cálculo e
    do direito de auditar.

**E. Conferência prévia e assistente**
12. "Pré-aprovada pela plataforma" (nunca "aprovada pelo Meta"): pode usar? Há
    responsabilidade se a rede reprovar depois?
13. O assistente (Lucky) orientando campanhas: que ressalvas legais constar?

**F. Saldo, LGPD e dinheiro**
14. Saldo pré-pago de organizações caracteriza arranjo/instituição de
    pagamento (Banco Central) ou captação indevida? O reembolso em dinheiro
    desligado por padrão reduz o risco?
15. LGPD no envio de dados de conversão (pixel/CAPI, telefone em hash) a Meta,
    Google e TikTok e a transferência internacional; o aviso de cookies (versão
    2) basta? Controladoras conjuntas?
16. Publicidade da rifa: como identificar como publicidade e que advertências
    são obrigatórias (18+, jogo responsável, número da autorização)?
17. Excedente de gasto da rede fica por conta da plataforma: pode virar
    cobrança contra a organização? Que cláusula, se for o caso?

**G. Pontos novos que vêm da resposta do contador** (levar junto)
18. O contador quer **contrato com cláusula de repasse** (a mídia é de
    terceiros), de **validade do crédito** e de **devolução/compensação em erro
    da plataforma**: redigir as três, compatíveis com o aceite da taxa.
19. A **baixa do saldo vencido** vira receita tributável: o vencimento do
    crédito pode ser imposto sem devolução em dinheiro? Há prazo mínimo?
20. Se a organização encerra a campanha **logo depois de aprovada**, a taxa
    inteira (cobrada na aprovação) é defensável, ou há dever de devolver a parte
    do serviço não prestado (o contador pensa em diferir e devolver)?

## 4. O que a resposta do contador muda no sistema

**Já está de acordo**
- Receita só da taxa; mídia como repasse; NFS-e só da taxa — é como o livro,
  a margem e o extrato de mídia já separam as coisas.
- Excedente como custo da plataforma, fora da conta da organização.
- Modelo B: o contador valida o desenho (taxa sobre o gasto lido).
- O saldo já anda por livro com chave única; a base do "Adiantamentos de
  Clientes" é esse livro.

**Muda no código (depende das decisões da seção 5)**
- **A. Extrato mensal para o contador** (próximo PR): um por organização e mês,
  CSV pt-BR (a infraestrutura de `shared/exports.ts`, com auditoria antes do
  download e `LEFT JOIN`), só para a plataforma, com os campos do item 16 mais
  o que a competência pede: aprovada em, encerrada em, mídia aprovada, mídia
  gasta, taxa, percentual executado, excedente, natureza do tomador
  (ONG/entidade) e o CNPJ/CPF da organização (já existe em `organizations.cnpj`).
  Número da NFS-e e retenções são **lançados à mão pela plataforma** (o sistema
  não emite nota): colunas novas em `trafego_campanhas` (`db:push` antes do
  código). O tributo estimado vem de alíquotas que a plataforma cadastra
  (regime, ISS do município) — estimativa, e a tela diz isso.
- **B. Exceção da falha da plataforma** (se a decisão 1 for aceita): ação só da
  plataforma, com motivo, que devolve a taxa ao saldo como crédito (livro
  `trafego-taxa-devolvida:<id>`, uma vez só, auditoria na mesma transação),
  para a campanha aprovada que não rodou por erro nosso (reprovada na rede,
  conta restrita, falha na criação).
- **C. Validade do crédito** (se a decisão 2 for aceita): o saldo é um só para
  patrocínio, banner pago e tráfego; vencimento por lançamento (o livro precisa
  guardar a data) e baixa por relógio. **Fica para depois do advogado.**

**Não é código**
- Competência e diferimento da taxa, alíquotas, retenções, emissão da NFS-e e
  provisões: é a contabilidade; o extrato só entrega os dados.
- Contas bancárias separadas, guarda por 5 anos das faturas das redes, CNAE
  73.11-4-00 e item 17.06 na prefeitura (hoje só o 6311-9/00 da taxa por venda
  está nas pendências).

## 5. Decisões do dono (a registrar)

1. **Taxa "nunca volta" × erro da plataforma.** A decisão de 09/10/2026 diz que
   a taxa nunca volta. O contador diz que, se o erro for nosso, não pode ser
   receita realizada e tem de voltar (dinheiro ou crédito). Proposta: manter
   "nunca volta" para a decisão da organização (encerrar, verba que acaba, rifa
   que sai do ar) e abrir **uma exceção só da plataforma** para falha dela, como
   **crédito** no saldo — a ser confirmada pelo advogado (pergunta 3 e 20).
2. **Validade do crédito** de 6 ou 12 meses (o contador recomenda). Proposta:
   **12 meses** contados do lançamento, após o advogado dizer se vale e se
   precisa de aviso prévio.
3. **Diferir a taxa** é contabilidade: o sistema não muda a cobrança; o extrato
   leva as datas e o percentual executado para o contador diferir.

## 6. Do lado de fora do código (você)

- Levar as perguntas da seção 3 (inclusive as novas, 18 a 20) ao advogado.
- Com o contador: as perguntas novas da seção 8 (o regime é Lucro Real, então
  as respostas sobre Simples e Presumido não valem; o Anexo e o Fator R do
  Simples deixam de importar) e **conferir a Solução de Consulta nº 6.006**
  citada (não consegui verificar).
- Abrir **contas bancárias separadas** para a mídia e para a taxa.
- Guardar por 5 anos extratos, faturas e comprovantes das redes.
- CNAE **73.11-4-00** e serviço **17.06** no cartão do CNPJ e na inscrição
  municipal (a prefeitura só emite a NFS-e de serviço cadastrado).

## 7. Segunda consulta ao contador: doar parte da taxa a uma ONG (09/10/2026)

Pergunta do dono: é viável doar parte da taxa de gestão (20%) a uma ONG?
Resposta do contador:

- **É viável**: a taxa é receita da plataforma, é dinheiro dela, não do cliente.
- **Lucro Real** (o regime da plataforma): a doação é **despesa operacional
  dedutível** do IRPJ e da CSLL, **limitada a 2% do lucro operacional** (antes
  de computar a própria dedução); o que passar disso não deduz e volta na
  apuração. A ONG tem de ser entidade civil constituída no Brasil, sem fins
  lucrativos, que preste serviços gratuitos à comunidade ou aos empregados; a
  certificação como OSCIP não é mais obrigatória (ele citou a Solução de
  Consulta Cosit nº 110 — **não verifiquei**). Não gera crédito de PIS/COFINS.
  Economia de até 34% do valor doado (15% IRPJ + 9% CSLL + 10% do adicional,
  quando incide), respeitado o teto.
- **Presumido e Simples**: nenhum benefício fiscal (despesa não dedutível; não
  reduz a base nem o DAS). Não se aplica à plataforma, que é Lucro Real.
- **Como proceder (em qualquer regime)**: pagar **da conta da taxa**, nunca da
  conta da mídia (a segregação é a defesa do modelo de repasse); formalizar
  com **recibo da ONG** (qualificação das duas partes, valor e finalidade);
  contabilizar em despesa operacional ("Doações a Entidades Sem Fins
  Lucrativos") contra caixa/banco.
- **Recomendação**: uma **política de doações** com um percentual da taxa
  destinado a causas sociais, dentro do teto de 2% no Lucro Real.

**O que isto muda no sistema: nada por enquanto.** A doação sai da conta da
plataforma e é contabilidade; o sistema só entra se o dono quiser **mostrar**
a doação ao cliente ("parte da taxa vai para…"). Isso vira promessa pública e
tem de passar pelo advogado antes (publicidade e CDC; vincular a doação ao
pedido cria dever de comprovar). Pergunta nova ao advogado:

21. Se a plataforma disser ao cliente que "parte da taxa de gestão é doada à
    ONG X", que cuidados valem (publicidade enganosa, comprovação, o
    percentual real, a ONG poder ser a mesma entidade beneficiada de uma
    rifa)? A doação pode ser vinculada a cada pedido ou só a uma política
    geral da empresa?

## 8. O regime é Lucro Real: o que isso muda nas respostas da seção 2

- **Competência é obrigatória** (não há a opção de caixa do Simples): a taxa
  tem de ser **diferida ao longo da campanha** na contabilidade. O extrato
  mensal deixa de ser "útil" e passa a ser a base da escrituração: mídia
  aprovada, mídia gasta, **percentual executado**, datas de aprovação e de
  encerramento.
- **Nós sofremos retenção, sem a saída do Simples**: quando o tomador é pessoa
  jurídica, retém IRRF 1,5% e CSRF/PCC 4,65% (e o ISS, conforme o município).
  O contador disse que o optante do Simples escapa com a declaração; **a
  plataforma não escapa**. As colunas de retenção do extrato (lançadas à mão
  pela plataforma) são obrigatórias, não opcionais.
- **PIS/COFINS não cumulativo (9,25%) com créditos** sobre a taxa.
- **Contradição para o contador esclarecer**: ele disse (a) que a mídia é
  repasse, valor de terceiros, que "não passa pelo resultado", e (b) que as
  faturas do Meta/Google/TikTok geram crédito de PIS/COFINS no Lucro Real. Se a
  mídia é conta alheia, a fatura da rede não é insumo da plataforma; o crédito
  parece caber só no **excedente** (que é custo próprio). Perguntar qual
  tratamento vale e se tomar o crédito enfraquece a tese do repasse (ele mesmo
  apontou o risco de o fisco tratar tudo como receita de agenciamento).
  **Esclarecimento do dono (09/10/2026):** o ISS e o PIS/COFINS embutidos na
  fatura do Meta são tributos **do próprio Meta** (ele os gera e recolhe); a
  plataforma, como cliente, **paga o preço cheio**, e só esse preço importa.
  Logo, o sistema não modela imposto da rede, e a plataforma **não conta com
  crédito de PIS/COFINS sobre a mídia** (que é repasse). A pergunta ao contador
  fica só para o excedente e para confirmar que tomar crédito sobre a fatura
  da rede não é necessário nem recomendável.
- **Excedente dedutível** se necessário, usual e comprovado pela fatura da rede
  (já dito, agora vale de fato).
- **Pergunta nova ao contador (a)**: com o IRRF/CSRF retidos sobre a taxa,
  como o extrato deve apresentar bruto, retenção e líquido por NFS-e?
- **Pergunta nova ao contador (b)**: a taxa cobrada na aprovação e diferida, no
  Lucro Real, gera tributo (PIS/COFINS, ISS) no recebimento ou na apropriação?
  Isso define quando emitir a NFS-e (o contador disse "na aprovação ou
  mensalmente").

## 9. Dúvidas ao contador sobre a Tesouraria (aguardando)

Contexto: o painel do master vai mostrar o saldo bruto do mês (receita própria
da plataforma), as áreas de destinação (doação, despesas, salários, impostos,
consultoria, etc., cada uma com valor fixo, percentual ou valor do mês) e o
saldo final, e fechar o mês com um retrato imutável. A mídia das redes fica em
bloco à parte; só a % da plataforma entra na receita. O sistema **não move
dinheiro**: só calcula e registra. Regime: Lucro Real.

**Saldo bruto e competência**
1. O **saldo bruto do mês** deve ser a receita em **competência** (reconhecida)
   ou o dinheiro recebido (caixa)? Hoje há recargas de saldo pré-pago
   (patrocínio, banner, assistente de IA) e a taxa de gestão do tráfego cobrada
   na aprovação. Para cada uma, a receita é reconhecida (a) no recebimento,
   (b) no consumo (cliques gastos, dias de banner usados, créditos usados) ou
   (c) no vencimento do que não foi usado? Peço o tratamento de cada origem.
2. O painel pode mostrar **os dois** (competência e caixa) lado a lado no
   fechamento? Qual deles o contador usa para as guias do mês?
3. **Estornos e devoluções** reduzem a receita bruta como "dedução"? A taxa de
   gestão não devolvida e a taxa retida no split do Asaas entram como receita no
   mês em que foram retidas ou no pagamento?

**Impostos e a base de cada linha**
4. No Lucro Real, que linhas de imposto o painel deve mostrar e **qual a base
   de cada uma**: ISS (sobre a receita de serviço, município), PIS e COFINS
   (9,25% não cumulativo, com crédito de quê?), IRPJ (15% + adicional de 10%
   acima de R$ 20 mil/mês) e CSLL (9%)? O **IRPJ e a CSLL** dependem do lucro
   contábil do período, que inclui despesas que o sistema não conhece (folha
   real, aluguel real): o painel mostra uma **estimativa** (com a base "lucro
   antes dos impostos" e as despesas que o master informa) ou isso fica fora
   do painel?
5. **Apuração**: trimestral ou anual com estimativa mensal? O fechamento
   mensal do painel precisa de provisão de IRPJ/CSLL (balancete de suspensão)?
6. O exemplo cita **ICMS**: confirmo que não incide sobre a taxa de gestão,
   a mensalidade e o patrocínio (serviço de publicidade, ISS)? Há outro
   tributo que eu esteja esquecendo (INSS patronal da folha, FGTS, CPRB)?
7. **Retenções que sofremos** (IRRF 1,5%, CSRF 4,65%, ISS) reduzem o que
   entra no caixa. No painel, o bruto é antes das retenções e elas aparecem
   como linha à parte (valor a compensar)? Como compensar no IRPJ/CSLL?

**Destinações (áreas)**
8. **Doação**: o teto de 2% é do **lucro operacional** (antes da própria
   dedução). Como o painel deve calcular essa base para avisar o limite, se o
   lucro real fecha só no balanço? Sugestão: estimar com o lucro antes dos
   impostos do próprio painel e avisar "estimativa".
9. **Salários e encargos**: a linha de folha leva só o salário ou também
   encargos (INSS, FGTS, férias, 13º) e pró-labore dos sócios? Qual o
   percentual de encargo a usar como padrão?
10. **Despesas operacionais**: que categorias o contador quer separadas para
    a escrituração (aluguel, energia, água, combustível, software, honorários,
    tarifas do provedor Pix, Chatbase)? O plano de contas dele pode ser
    importado?
11. **Consultoria e pagamentos a PJ**: retenções na fonte que **nós** fazemos
    ao pagar (IRRF, CSRF, ISS retido) devem aparecer como linha própria?

**Mídia e repasse (bloco à parte)**
12. O **bloco de mídia** deve mostrar: recebido dos clientes (reservas),
    gasto lançado, repassado às redes, **saldo a repassar** (passivo) e o
    **excedente** (custo nosso). Falta algum campo para a defesa do repasse?
13. Para a defesa do repasse, a **conta bancária da mídia** precisa ser outra
    conta jurídica ou basta conta separada (subconta/Asaas)?

**Fechamento mensal**
14. **Reabrir um mês fechado** (com motivo e auditoria) pode conflitar com a
    escrituração (ECD, SPED, balancete já enviado)? Se o mês já foi
    escriturado, o ajuste vira lançamento no mês seguinte, sem reabrir?
15. O retrato do fechamento (valores, regra de cada linha, saldo final e
    impressão SHA-256) serve como **documento de apoio** à escrituração?
    Falta algum dado (CNPJ, período, regime)?

**Acessos da equipe**
16. O **contador externo** precisa de um acesso de **só leitura** com
    exportação (extrato, retenções, retrato do mês)? Que telas ele quer?
17. Quem na empresa fecha o mês e quem pode reabrir? Há exigência de
    **segregação de funções** (quem lança não aprova) para auditoria?

**Segunda rodada ao contador (dúvidas que ficaram depois de ler as respostas)**
18. **O "saldo da empresa" do fechamento é gerencial, não é lucro contábil.**
    Como rotular para não ser confundido com resultado apurado? E ele pode
    orientar a **retirada dos sócios**: há regra em vigor sobre distribuição de
    lucros e tributação de dividendos (mudanças de 2026) que o painel deva
    respeitar ou avisar?
19. **NFS-e**: uma por campanha aprovada (na aprovação) ou consolidada por
    organização no mês? Para organização **pessoa física**, sem CNPJ? O ISS é
    devido ao município do prestador ou do tomador no item 17.06?
20. **Recargas de saldo** (patrocínio, banner, assistente de IA) pagas por Pix:
    a nota sai **na recarga** ou **no consumo**? Antes do consumo é só
    adiantamento (passivo), sem fato gerador?
21. **Diferimento da taxa de gestão**: o critério é o **período planejado** da
    campanha (da aprovação até a data final) ou o **gasto proporcional** da
    mídia (percentual executado)? O extrato do sistema entrega os dois; qual
    ele usa?
22. **Crédito de PIS/COFINS** sobre o que **é custo nosso**: tarifa do provedor
    de Pix, Chatbase, hospedagem (Railway), armazenamento, domínio. Quais geram
    crédito no Lucro Real não cumulativo, e como o painel separa essas
    despesas?
23. **Presente** (desconto de primeira compra pago pela plataforma): é
    despesa promocional, redução da receita ou outra coisa? O crédito devido à
    promotora é passivo até o repasse?
24. **Mensalidade e taxa por venda** (CNAE 6311-9/00) e **taxa de gestão do
    tráfego** (73.11-4-00, item 17.06): as duas atividades na mesma inscrição
    municipal, com alíquotas de ISS diferentes? O painel mostra o ISS por
    atividade?
25. **Percentuais padrão da linha "Impostos"**: o painel pode provisionar ISS,
    PIS/COFINS e IRPJ/CSLL com percentuais que o contador informa (ISS por
    município, PIS/COFINS líquido de créditos), e quem os mantém atualizados?
26. **Prazo do fechamento**: até que dia do mês seguinte o contador precisa do
    extrato e do retrato para escriturar?
27. Pode **enviar os números e links** da Solução de Consulta nº 6.006 (repasse
    a veículos de comunicação) e da Solução de Consulta Cosit nº 110 (doação
    sem OSCIP) para conferirmos e anexarmos ao dossiê?

## 10. Dúvidas ao advogado sobre a Tesouraria e os acessos (aguardando)

**Dinheiro de terceiros**
1. O **bloco de mídia** (dinheiro das organizações reservado para pagar as
   redes) exige **conta segregada** por lei ou contrato, ou basta o controle
   contábil? Que cláusula garante que esse dinheiro não responde por dívida da
   plataforma?
2. O painel passa a mostrar saldos de terceiros (pré-pago, comissão guardada,
   mídia): isso muda a análise de **arranjo de pagamento / instituição de
   pagamento** (pergunta 14)? A plataforma só calcula e registra, não move.

**Equipe e dados pessoais (LGPD)**
3. O que a **equipe** pode ver: atendimento com ID do cliente (sem CPF),
   financeiro sem dado pessoal, compliance com documentos. Esse **desenho de
   perfis** atende ao princípio da necessidade (LGPD, art. 6º, III)?
4. A **equipe** deve aceitar um **termo de confidencialidade e uso aceitável**
   no primeiro acesso, com o aceite gravado (texto, versão, SHA-256, data, IP)
   como o contrato da promotora? Quem redige?
5. Funcionário é **operador** ou parte do controlador? Precisa de contrato de
   trabalho/estágio com cláusula de dados, e de treinamento registrado?
6. **Retenção dos registros de acesso** (quem leu o quê): por quanto tempo
   guardar o log de auditoria da equipe? (hoje: sem prazo; LGPD pede
   minimização, a guarda fiscal é de 5 anos).
7. **Contador externo** com acesso de leitura ao painel: precisa de contrato
   de operador e de cláusula de sigilo? Pode receber os extratos por e-mail ou
   só por download autenticado?

**Doação e política interna**
8. A **política de doações** da empresa (percentual da taxa) precisa de ata ou
   documento interno? E a pergunta 21 anterior (divulgar a doação ao cliente).

**Fechamento**
9. O **retrato imutável** do fechamento mensal, com a impressão SHA-256, vale
   como prova interna? Há prazo mínimo de guarda?

## 11. Respostas da segunda rodada do contador (09/10/2026)

(Os números dele pulam a partir do 18; aqui seguem os da pergunta.)

- **18. Saldo ≠ lucro.** Saldo em conta é posição patrimonial (ativo) e pode ter
  dinheiro de terceiros. Rótulos que ele recomenda no painel: **"Disponível em
  Caixa"** (saldo bancário total), **"Saldo de Mídia (Passivo)"** (o que é dos
  clientes), **"Caixa Livre da Empresa"** (a diferença: o que pode pagar
  despesas e distribuição) e **"Lucro Acumulado (Contábil)"** (resultado da DRE,
  a base da distribuição). **Dividendos a partir de 2026 (Lei 15.270/2025):**
  lucros e dividendos pagos pela mesma empresa à mesma pessoa física que
  passem de **R$ 50.000 por mês** sofrem **IRRF de 10% sobre o valor integral**
  (não só o excedente), em qualquer regime (inclusive Simples). O painel deve
  **alertar e calcular** a retenção quando a distribuição mensal a um sócio
  passar disso, mostrando o líquido e o IRRF a recolher.
- **19. Diferimento da taxa de gestão:** pelo **gasto proporcional da mídia**
  (ou o período de veiculação), não pelo período planejado — se a campanha
  encerra antes, o planejado superavaliaria a receita. Metade da verba gasta =
  metade da taxa reconhecida; o resto fica como **receita diferida** (passivo).
- **20. NFS-e:** a prática recomendada é **uma por tomador (organização) por
  mês**, descrição "Serviços de gestão de tráfego pago – competência mês/ano".
  Se o município exigir nota por campanha, o sistema se adapta.
- **21. Pessoa física:** pode emitir NFS-e com o CPF do tomador (padrão ABRASF).
  O contrato qualifica o tomador (nome, CPF, endereço); o sistema deve permitir
  preencher à mão se o município não aceitar a nota sem identificação.
- **22. ISS no 17.06:** regra geral, no município do **prestador**, mas a lei
  municipal pode mandar o **tomador reter** (ele cita São Paulo: o tomador
  paulistano retém o ISS de prestador de fora). O sistema deve conhecer o
  município do tomador e aplicar a retenção local.
- **23. Recargas de saldo:** são adiantamento de cliente (passivo); a nota da
  **taxa de gestão sai na aprovação da campanha**. Para serviço que a
  plataforma presta direto (ex.: assistente de IA), a receita é o valor
  cobrado, **reconhecido no consumo**, não na recarga.
- **24. Crédito de PIS/COFINS (Lucro Real):** serviços de desenvolvimento e
  manutenção de sistema e infraestrutura têm argumento de insumo (ele cita a
  Solução de Consulta nº 87/2011 e o STJ). **Tarifa do Pix** é despesa
  financeira: em regra, **sem crédito**. Chatbase, Railway, armazenamento e
  domínio têm "forte argumento" de insumo, mas ele recomenda um especialista
  caso a caso.
- **25. Presente:** desconto **incondicional** na venda é redução da receita
  bruta; valor pago depois (tipo cashback) pode ser despesa promocional. O
  crédito devido à promotora é **passivo** até o repasse.
- **26. Duas atividades:** podem coexistir no mesmo CNPJ, com inscrições
  municipais distintas se os códigos de serviço e alíquotas diferirem. A taxa
  por venda/mensalidade provavelmente cai em outro item da lista (ele sugere o
  10.04, agenciamento/intermediação). O sistema deve **segregar a receita por
  atividade** e mostrar o ISS por atividade.
- **27. Percentuais da linha "Impostos":** o painel pode provisionar com
  percentuais parametrizáveis; **o contador os informa** periodicamente e o
  sistema precisa de uma **tela de alíquotas**.
- **28. Prazo:** o extrato mensal completo até o **5º dia útil** do mês
  seguinte.
- **29. Citações:** ele corrigiu as referências — **Solução de Consulta
  SRRF06/Disit nº 6.006, de 26/02/2019** (repasse a veículos por conta e ordem
  do anunciante fora da base do Simples) e **Solução de Consulta Cosit nº 110,
  de 28/08/2018** (doação a OSC sem exigir OSCIP, art. 13, § 2º, III, da Lei
  9.249/1995). Não mandou link direto, só "buscar pelo número" em
  `normas.receita.fazenda.gov.br/sijut2consulta`.

**Conferência feita por mim (09/10/2026, fontes secundárias, não o site
oficial):**
- A **Cosit 110/2018 existe** e diz isso mesmo (ementa reproduzida em
  [okai](https://okai.com.br/documento/2018-08-28/solucao-de-consulta-cosit-nº-110-de-28-de-agosto-de-2018)
  e [IBET](https://www.ibet.com.br/solucao-de-consulta-cosit-no-110-de-28-de-agosto-de-2018/)).
- A **6.006/2019** aparece em portais contábeis com o entendimento descrito
  (conta alheia fica fora da base do Simples; **conta própria entra na receita
  bruta**; a agência precisa **provar** que foi só intermediária). **Atenção**:
  um portal cita também uma "DISIT/SRRF06 nº 6006" de **2023** sobre doação a
  OSC, então o número pode estar repetido ou trocado — **confirmar no site
  oficial**. E ela é sobre o **Simples**; a plataforma é **Lucro Real**.
- A **Lei 15.270/2025** confirma o essencial (10% sobre o total acima de R$ 50
  mil por mês da mesma fonte à mesma pessoa física, vale para o Simples,
  recolhimento pelo código 1841, informado na EFD-Reinf e DCTFWeb; há regra de
  transição para lucros apurados até 2025 e controvérsias em discussão). Fonte:
  [Jornal Contábil](https://jornalcontabil.com.br/noticia/lei-15-270-define-regras-para-taxacao-de-lucros-e-dividendos-a-partir-de-2026/).
- **Não consegui conferir** a Solução de Consulta nº 87/2011 (crédito de
  insumo) nem o "Tema 1.412 do STJ" (bonificações) que ele citou na 24 e na 25.
  Nada do sistema se apoia nelas; o contador deve mandar o texto.

## 12. O que ficou em aberto com o contador (terceira rodada, curta)

- **C1. Nota da taxa: na aprovação ou mensal?** Ele disse as duas coisas: na
  20 recomenda **uma nota mensal por organização**; na 23 diz que a nota da
  taxa **sai na aprovação**. Qual vale? E, se a nota sai na aprovação e a receita
  é diferida, o ISS é devido na emissão ou na apropriação?
- **C2. Patrocínio, banner e assistente de IA são serviços próprios da
  plataforma, não mídia de terceiros.** Ele os tratou "como a mídia" e disse
  que a receita é "apenas a taxa de gestão vinculada". Só o **tráfego pago** tem
  mídia de terceiros. Confirmo que nos outros três **100% do valor consumido** é
  receita da plataforma (cliques gastos, dias de banner usados, créditos
  usados) e o que não foi consumido é adiantamento?
- **C3. Encerramento da campanha.** Encerrada antes de gastar tudo (a taxa não
  volta): o saldo ainda **diferido** da taxa é reconhecido de uma vez no
  encerramento (serviço encerrado, taxa não reembolsável) ou continua diferido?
- **C4. Repasse no Lucro Real.** A 6.006 trata do **Simples**. Qual a base
  legal para a mídia ficar fora da receita bruta do **Lucro Real** (IRPJ, CSLL,
  PIS/COFINS)? E que prova ele quer guardar ("por conta e ordem do anunciante e
  em nome dele"): a campanha é criada na conta de anúncios da plataforma, em
  nome da plataforma — isso derruba a tese de "conta alheia"? (Pergunta
  também ao advogado.)
- **C5. Presente: o desconto é na taxa ou no bilhete?** O desconto de
  primeira compra incide no **preço do bilhete** (receita da promotora); a
  plataforma **paga a diferença à promotora** (crédito). Para a plataforma isso
  é despesa promocional (de aquisição), redução da receita da taxa ou o
  quê? Ele respondeu como se o desconto fosse na nossa taxa.
- **C6. O que o sistema não sabe.** O painel calcula pelos livros ("Saldo de
  Mídia", valores de terceiros, receita por origem, taxa diferida), mas **não
  conhece o saldo bancário nem o lucro contábil**. Proposta: "Disponível em
  Caixa" e "Lucro Acumulado (Contábil)" são **informados** no fechamento (por
  quem fecha, ou pelo contador), com a data e quem informou, e o painel mostra
  a diferença para o que os livros esperam. Aceita? Em que dia do mês ele
  informa o lucro contábil?
- **C7. Distribuição de lucros no painel.** Para o alerta de R$ 50 mil por
  sócio/mês, a linha "Distribuição de lucros" precisa dos **sócios da
  plataforma** (nome e CPF, em cofre) e do valor por sócio. O contador quer o
  painel calculando o IRRF de 10% ou só alertando? E o painel também deve
  mostrar o **IRRF de dividendos a recolher** (código 1841) como obrigação?
- **C8. Retenção de ISS pelo tomador.** O sistema guarda o município de cada
  organização (cadastro de endereço). Basta o master informar, por organização,
  "tomador retém ISS: sim/não e alíquota", ou o contador quer uma tabela de
  municípios?

## 13. Respostas da terceira rodada do contador (09/10/2026)

- **C1. Nota e ISS.** Recomenda **NFS-e mensal consolidada por organização**,
  descrição "Serviços de gestão de tráfego pago – competência [mês/ano]", **com o
  valor da taxa efetivamente reconhecida como receita no mês** (não o total
  cobrado na aprovação). O ISS segue a **mesma proporção** (50% da taxa
  reconhecida, 50% do ISS devido no mês), para casar a competência contábil com
  a tributária. Isto **substitui** o "nota na aprovação" da resposta 23.
- **C2. Patrocínio, banner e IA.** Corrigido: são **serviços próprios**;
  **100% do valor consumido é receita bruta** (ISS, PIS/COFINS, IRPJ e CSLL sobre
  o total), nota sobre o valor total do serviço; contas separadas da taxa de
  gestão.
- **C3. Encerramento.** A receita diferida que sobrar é **reconhecida de uma vez
  no encerramento** (o serviço de gestão acabou). **Exceção:** campanha
  encerrada por **erro da plataforma** → a taxa é **devolvida ou compensada**,
  não reconhecida. Se o contrato previr retenção integral (não reembolso) e for
  válido, reconhece-se no encerramento.
- **C4. Repasse no Lucro Real.** A 6.006 é do Simples, mas o conceito de conta
  alheia vale para todos. Ele cita o **art. 224 do RIR/2018** e "outras
  Soluções de Consulta". **Risco que ele mesmo admite:** a campanha criada na
  conta de anúncios **da plataforma, em nome dela**, enfraquece a tese. Mitigação
  por contrato: o cliente é o anunciante e titular da campanha; a plataforma é
  mera intermediadora de pagamento; o risco de inadimplência da rede é do
  cliente; a plataforma não ganha sobre a mídia. Recomenda o advogado.
- **C5. Presente.** O que a plataforma paga à promotora para cobrir o desconto
  é **despesa promocional** (marketing), dedutível no Lucro Real com documento
  idôneo; o valor recebido para repassar à promotora é **passivo**, e o repasse
  não gera tributo.
- **C6. Saldo bancário e lucro contábil.** Concorda em serem **informados**: o
  saldo bancário **até o 5º dia útil** (ou diário, se houver integração) e o
  **lucro contábil até o 10º dia útil**, com data e quem informou. O painel
  mostra a diferença entre "Disponível em Caixa" e "Lucro Acumulado (Contábil)",
  com o aviso de que saldo bancário não é lucro.
- **C7. Distribuição de lucros.** Com os **sócios em cofre** (nome e CPF) o painel
  **calcula** o IRRF de 10% e a obrigação; sem os dados, só alerta e o contador
  calcula. Recomenda guardar em cofre.
- **C8. ISS retido.** Recomenda uma **tabela de municípios** (retém? alíquota?),
  mantida com a lista que ele fornece; a marcação manual por organização é a
  alternativa, com alerta se o município não estiver na tabela.

**Conferência minha (09/10/2026):** o artigo do RIR/2018 que define a receita
bruta é o **208** (e não o 224): ele repete o art. 12 do Decreto-Lei 1.598/1977,
com a redação da Lei 12.973/2014 — a receita bruta compreende o produto da venda
em **conta própria**, o preço dos serviços e **"o resultado auferido nas
operações de conta alheia"**; isto é, na conta alheia só entra o **resultado**,
não o valor repassado (fonte:
[legjur, art. 208](https://www.legjur.com/legislacao/art/DEC_00095802018-208)).
Uma Solução de Consulta Cosit nº 40/2017 (Lucro Presumido: valores por conta e
ordem de terceiros não são receita) aparece como apoio
([Jornal Contábil](https://jornalcontabil.com.br/noticia/recursos-de-terceiros-nao-e-base-de-calculo-para-o-irpj-e-csll-no-lucro-presumido/amp/)),
mas é anterior à Lei 12.973 e pede conferência. Pedir ao contador que corrija o
número do artigo no dossiê.

### O ponto que mais pesa: conta alheia ou conta própria (modelo A)

No **modelo A** a campanha é criada **na conta de anúncios da plataforma, em nome
dela**; a rede (Meta) fatura **a plataforma**, e já dissemos que "como cliente,
pagamos o preço cheio". Isso descreve **conta própria**: a plataforma compra a
mídia e a revende ao cliente. O contador também disse, na primeira rodada, que a
fatura da rede gera **crédito de PIS/COFINS** — o que só faz sentido na conta
própria. Já a tese de **repasse** (mídia fora da receita) só se sustenta se a
operação for de conta alheia. As duas leituras não convivem:

| | Conta alheia (repasse) | Conta própria (revenda) |
|---|---|---|
| Receita da plataforma | só a taxa de gestão | a mídia **mais** a taxa |
| A fatura da rede | não é custo nem gera crédito | é custo; PIS/COFINS pode gerar crédito |
| ISS | só sobre a taxa | pode alcançar o valor cobrado do cliente (conforme o município) |
| Fundamento | art. 208, III, RIR/2018 | regra geral |
| Força no modelo A | **fraca** (nome da plataforma na conta) | forte |
| Força no modelo B (cliente paga a rede) | **forte** | não se aplica |

**Efeito no sistema:** o painel e o extrato foram desenhados no cenário de
repasse (mídia em bloco à parte, só a taxa na receita). Se o cenário for conta
própria, o **"saldo bruto" muda** (mídia entra na receita e na despesa). Isto é
**decisão de posição fiscal**, do contador com o advogado — e o sistema deve
comportar os dois (um parâmetro da Tesouraria), sem apagar o histórico.

## 14. Dúvidas que sobraram (quarta rodada, mínima)

- **C9. Conta própria × conta alheia no modelo A.** Dado que a campanha fica na
  conta da plataforma, que fatura a rede em nome dela: qual posição ele adota
  (repasse ou revenda)? Qual o **custo tributário do cenário conservador**
  (mídia como receita e a fatura da rede como custo, com o crédito de
  PIS/COFINS), principalmente o **ISS**? Qual das duas ele escreve na escrituração?
- **C10. Receita diferida e nota mensal.** O dinheiro da taxa entra **na
  aprovação** (cobrado inteiro) e a nota só sai no mês, pelo valor reconhecido.
  A **prefeitura aceita** emitir a nota depois do recebimento, ou exige nota na
  data do pagamento? E o que se faz com a taxa já recebida e ainda não
  reconhecida no fechamento (passivo "receita diferida")?
- **Para o dono**: a **exceção da falha da plataforma** (taxa devolvida ou
  compensada em erro nosso) segue pendente da sua decisão; o contador confirma
  que, nesse caso, a taxa **não é receita**.

## 15. Respostas da quarta rodada do contador (09/10/2026): a posição fiscal do modelo A

- **C9. No modelo A, a posição é REVENDA (conta própria).** Fundamento dele: a
  campanha é criada na conta de anúncios **da plataforma, em nome dela**, e o
  Meta fatura a plataforma pelo preço cheio, "como cliente direto"; "não há como
  sustentar que a plataforma atua em nome do anunciante"; e o crédito de
  PIS/COFINS sobre a fatura é atributo da conta própria. **Isto substitui a
  tese de repasse da primeira rodada (seção 2) para o modelo A.**
  Custo tributário do cenário (conforme ele):
  - **ISS** incide sobre o valor total da mídia **mais** a taxa — "o maior
    impacto";
  - **PIS/COFINS** (9,25%): a receita da mídia entra na base e a fatura do Meta
    gera crédito de 9,25% sobre o mesmo valor, anulando o efeito; o saldo a
    recolher fica sobre a margem;
  - **IRPJ/CSLL**: receita da mídia e custo da fatura se anulam; o lucro
    tributável é, na prática, a taxa;
  - **Simples**: não se aplica (a plataforma é Lucro Real; seria o cenário mais
    oneroso).
  Recomendação dele: **parâmetro "Posição Fiscal" (Repasse ou Revenda)**; no
  modelo A, **Revenda**; a Tesouraria avisa que o saldo de caixa inclui valores
  que, para fins fiscais, são receita.
- **C10. Nota e diferimento.**
  1. A taxa recebida na aprovação é **adiantamento de cliente (passivo)**.
  2. Com a campanha rodando, reconhece-se a receita proporcional (gasto da
     mídia ou período) e emite-se a **NFS-e da parcela do mês**.
  3. No encerramento, reconhece-se o **saldo remanescente de uma vez** e emite-se a
     NFS-e correspondente.
  A prefeitura **aceita** a nota depois do recebimento, porque a emissão segue
  a **competência da prestação**, não o pagamento (ele cita o "Acórdão nº
  012/25 do Recife" — **não conferido**). A taxa recebida e não reconhecida fica
  como **"Receita Diferida" (passivo)**, nunca como lucro ou receita disponível.
- **Resumo dele para o modelo A:** mídia = receita bruta (revenda); fatura do Meta
  = custo com crédito de PIS/COFINS; ISS sobre mídia + taxa; taxa recebida =
  passivo; taxa reconhecida = receita + NFS-e; saldo diferido = receita
  diferida.
- **A decisão final (repasse × revenda) é do dono com o advogado**, diz ele, mas
  a recomendação técnica é revenda, porque "os fatos apontam para a conta
  própria".

### O que isto muda (leitura minha)

1. **O preço da taxa.** Se o ISS passa a incidir sobre a mídia, o custo sobe.
   Exemplo (alíquota máxima de 5%, só para dar a ordem de grandeza): pacote de
   R$ 100 + taxa de 20% = R$ 120; ISS sobre R$ 120 = R$ 6,00, contra R$ 1,00 se
   fosse só sobre a taxa — **R$ 5,00 a mais, um quarto da taxa**. Os 20% foram
   pensados no cenário de repasse; **a taxa padrão precisa ser revista com o
   contador** (e o ISS do município da plataforma decide o número real).
2. **A premissa de "ISS sobre tudo" precisa de conferência.** Em muitos
   municípios as **agências de publicidade** pagam ISS sobre a comissão e os
   honorários, e **não** sobre o custo de veiculação pago a veículos; a regra
   municipal manda. Pedir a **lei do município da plataforma** (e dos principais
   tomadores) com o artigo, em vez de aceitar "incide sobre o total".
3. **A mídia deixa de ser "bloco à parte" para a contabilidade fiscal**, mas pode
   continuar sendo para a **gestão**: a Tesouraria terá duas visões lado a lado — a
   **gerencial** (decisão do dono: só a % da plataforma entra no saldo bruto) e a
   **fiscal** (receita bruta com a mídia de revenda, custo da fatura da rede, crédito
   de PIS/COFINS, base do ISS). O extrato do contador entrega a fiscal.
4. **Nova base para as linhas de imposto**: além do bruto, do saldo restante e
   do lucro antes dos impostos, **a receita bruta fiscal**.
5. **A nota passa a incluir a mídia consumida** (e não só a taxa), o que
   contradiz a recomendação da primeira rodada de "emitir nota só da taxa". A
   reconciliar com o contador (C11).
6. **O contrato deixa de ser mandato.** A cláusula de "mera intermediadora de
   pagamento" (que ele sugeriu como mitigação em C4) não combina com revenda.
   O contrato passa a descrever a **prestação de serviço de publicidade com
   fornecimento de mídia**. Isso é para o advogado.
7. **O modelo B volta a ser o caminho do repasse puro** (o cliente paga a rede):
   é onde a tese de conta alheia é forte e o ISS fica só sobre a gestão. Um
   argumento a mais para entregar o modelo B.
8. **Termos das redes.** Rodar campanha de vários anunciantes na conta de
   anúncios da própria plataforma (revenda) pode ser tratado pelo Meta, Google e
   TikTok de forma diferente (conta de agência/parceiro, identificação do
   anunciante real, regras de jogos de azar). Isso é para o advogado e para a
   pesquisa de integração antes de crescer.

## 16. Dúvidas que sobraram (quinta rodada, mínima)

- **C11. Revenda: o que a nota inclui e quando se reconhece a mídia.** Na
  revenda, a receita da mídia é reconhecida no **consumo** (gasto lançado do
  dia)? A NFS-e mensal inclui a mídia consumida **mais** a taxa reconhecida,
  no mesmo código de serviço? O que acontece com a mídia **não consumida**
  (volta ao saldo como crédito): adiantamento de cliente, sem nota?
- **C12. Base do ISS sobre mídia.** Em que **artigo da lei do município** da
  plataforma se apoia a incidência do ISS sobre a mídia revendida? Existe regra
  de **dedução do custo de veiculação** para agência de propaganda (conta
  própria, com nota do veículo em nome da agência)? Qual o ISS efetivo do cenário
  de revenda, em reais, para o pacote de R$ 100 + 20%?
- **C13. Excedente da rede.** Na revenda, o gasto da rede acima da verba (que
  nós pagamos e não cobramos) é custo da mídia sem receita correspondente:
  é despesa dedutível e gera crédito de PIS/COFINS, como a fatura?
- **C14. Os textos.** Pedir o texto (ou link oficial) do "Acórdão nº 012/25 do
  Recife", da Solução de Consulta 6.006 e da 87/2011, que ele citou.
- **Para o advogado (itens 10 a 12 da seção 10):** ver abaixo.

### Perguntas novas ao advogado (itens 10 a 12 da seção 10)

10. **Estrutura do contrato na revenda (modelo A).** Sai o mandato e entra a
    prestação de serviço de publicidade com fornecimento de mídia: como ficam a
    cláusula de responsabilidade pelo conteúdo, a rejeição pela rede, o
    saldo-crédito e o aceite da taxa (hoje redigido no cenário de repasse)?
11. **Termos do Meta, Google e TikTok.** É permitido rodar campanhas de vários
    anunciantes na conta de anúncios da plataforma (revenda)? Que identificação do
    anunciante real e da entidade que paga é exigida, principalmente em
    **jogos de azar/rifas autorizadas**? Quem responde por reprovação e por
    restrição da conta?
12. **Posição fiscal e responsabilidade.** Com a revenda, a plataforma deixa de
    ser "intermediária" e passa a ser a vendedora da mídia perante a organização.
    Isso altera a responsabilidade (CDC, solidariedade) e o regime do saldo
    pré-pago (pergunta 14)?

## 17. Comentários finais do contador sobre a revenda e o esclarecimento do dono (09/10/2026)

**O contador concorda com os oito pontos da seção 15 e acrescenta:**

1. **Preço da taxa (o mais urgente).** Com ISS de 5% sobre o total, o pacote de
   R$ 100 + R$ 20 recolhe R$ 6,00 de ISS (R$ 5,00 sobre a mídia + R$ 1,00 sobre
   a taxa) em vez de R$ 1,00; os R$ 5,00 a mais consomem 25% da taxa, e o fee
   efetivo de 20% cai para algo entre **14% e 15%** da mídia, conforme o município.
   O 20% foi calibrado para o repasse; **precisa ser refeito para a revenda, ou o
   modelo A migra para o B.** (Ele fala do Simples Nacional como "inviável" na
   revenda — não se aplica: a plataforma é **Lucro Real**; ele recomenda
   simular Presumido e Real com seriedade.)
2. **ISS sobre tudo precisa de conferência.** Em vários municípios a base do ISS
   da agência de publicidade **exclui o custo de veiculação** (está na lei
   municipal, não na LC 116): ele precisa da **lei do município com o artigo**.
   Nuance nova: a veiculação é prestada por empresas **estrangeiras**
   (Meta/Google/TikTok); se o município trata como **serviço importado**, o ISS é
   devido **pelo tomador (a plataforma)** e a base muda. Analisar com o município
   e o advogado. (O Meta fatura as contas brasileiras com ISS embutido, o que
   sugere entidade brasileira e não importação — **confirmar** com a fatura.)
3. **Tesouraria com duas visões**, com o parâmetro "posição fiscal"
   **versionado por competência, nunca retroativo**: protege o histórico.
4. **Contrato:** de mandato para prestação de serviço de publicidade com
   fornecimento de mídia. **Risco de crédito novo:** na revenda a plataforma
   continua devendo ao Meta se o cliente não paga; precisa estar **precificado na
   taxa** ou **mitigado** (cobrança antecipada, garantias). "Não é só nomenclatura;
   é posição econômica."
5. **Termos das redes:** rodar vários anunciantes na mesma conta da plataforma
   pode violar as políticas, em especial **jogos de azar** (licença por
   anunciante); a responsabilidade perante a rede é da plataforma. Pode
   **inviabilizar o modelo A** para certas categorias.
6. **Modelo B** preserva a economia original: o ISS incide só sobre a taxa e os
   20% voltam a fazer sentido. Argumento para priorizá-lo.
7. **Reconhecimento da receita** (taxa pelo gasto; mídia, patrocínio, banner e
   IA pelo consumo; recargas como passivo; lucro contábil e saldo bancário
   informados): confirmado.
8. **Parecer conjunto** (contador e advogado) antes de qualquer parametrização
   definitiva: a posição do modelo A com fundamentos, o custo tributário de cada
   cenário com simulações, o preço da taxa por cenário e os riscos contratuais e
   das redes. "Sem ele, qualquer parametrização é provisória."

**Esclarecimento do dono sobre o modelo B:** o organizador **paga à plataforma
apenas as taxas** (a mídia ele paga direto à rede); os **20%** são referentes ao
**pagamento dos créditos** e aos **serviços de campanhas automáticas** que a
plataforma fornece às promotoras. Isto fixa a leitura do modelo B: a plataforma
**não toca a mídia**, e a taxa de 20% é a receita dela, sobre o gasto da campanha
(a confirmar a forma de cobrar, abaixo).

**Pendente de confirmação (leitura minha do esclarecimento):** no modelo B a
organização compra na plataforma só o **crédito da taxa** (os 20%), e o sistema
**debita a taxa à medida que lê o gasto** na conta de anúncios dela; sem saldo de
taxa, a campanha pausa. Assim a taxa só existe sobre o que foi gasto de fato — não
há "cobrada inteira na aprovação" nem devolução a discutir no modelo B — e a
receita é reconhecida **no mesmo momento** do débito. É isso, ou a taxa do modelo B
também é cobrada inteira na aprovação, sobre o orçamento planejado?

**Perguntas novas:**
- **Ao contador (C15):** o Meta que fatura as contas brasileiras é entidade
  brasileira (fatura com ISS)? Se sim, não há ISS de importação. E se for
  estrangeira, quem recolhe o ISS e sobre que base?
- **Ao contador (C16):** no modelo B, a taxa é reconhecida no débito (gasto
  lido); a NFS-e mensal consolida o mês? Há risco de a rede ou o cliente
  questionarem a base (o gasto lido na conta do cliente)?
- **Ao advogado (item 13):** risco de crédito na revenda — cobrança antecipada,
  garantia, prazo para o cliente repor o saldo, direito de pausar a campanha.
- **Ao advogado (item 14):** aprovar com o contador o **parecer conjunto** e a
  posição do modelo A.

## 18. Respostas do contador a C11–C16 e a minha conferência (09/10/2026)

O contador respondeu as seis dúvidas da seção 16, já com a correção do art. 208
do RIR/2018 e a posição de **revenda (conta própria)** para o modelo A. Abaixo,
o que ele disse, o que eu consegui conferir e o que **ainda não fecha**.

### O que ele respondeu

- **C11 – Mídia na receita bruta.** Na revenda, a mídia entra na receita bruta
  fiscal. A NFS-e discrimina (1) fornecimento de mídia, pelo valor total da
  mídia, e (2) gestão de tráfego pago, pela taxa, **ambas no item 17.06** (ou o
  código municipal equivalente). A fatura da rede é custo e gera crédito de
  PIS/COFINS no Lucro Real. O ISS incide sobre o total, salvo se a lei
  municipal excluir a veiculação da base.
- **C12 – Base do ISS.** Em **São Paulo**, o **art. 47-A do Regulamento do ISS**
  (incluído pelo Decreto 58.175/2018): no 10.08 (agenciamento) a base é a receita
  bruta de comissões, honorários, fees, criação, redação e veiculação; no
  **17.06** é o preço da produção em geral, "soma de todo e qualquer ingresso
  financeiro", ainda que parte seja executada por terceiros. O **§ 2º** tira da
  base o preço do serviço do 17.06 **efetivamente prestado por terceiro**.
  Exemplo dele, com alíquota de 5%: ISS sobre o total (base R$ 120) = R$ 6,00,
  sobra R$ 14,00 da taxa; ISS só sobre a taxa (base R$ 20) = R$ 1,00, sobra R$ 19,00.
- **C13 – Excedente.** Custo da plataforma, **dedutível no Lucro Real** com
  documento idôneo (fatura, extrato da conta de anúncios, comprovante); lançar
  como despesa operacional ("Serviços de Terceiros – Mídia Excedente").
- **C14 – Textos.** Acórdão 012/25 de Recife (D.O.M. nº 095, 02/08/2025): a
  fiscalização pode apropriar à competência receitas diferidas, e a diferença
  entre a NFS-e emitida e a apropriação deve ser ajustada. Solução de Consulta
  SRRF06/Disit **nº 6.006, de 26/02/2019**: conta alheia, só o resultado é receita
  bruta; conta própria, o valor cobrado do anunciante entra inteiro. SC SRRF09/Disit
  nº 87, de 10/03/2011: desenvolvimento e manutenção de sistemas como insumo de
  PIS/COFINS.
- **C15 – Fornecedor.** Desde janeiro de 2026 o Meta fatura as contas brasileiras
  pela **Facebook Serviços Online do Brasil Ltda.** (CNPJ 13.347.016/0001-17),
  com ISS (2,9%) e PIS/COFINS (9,25%) na fatura. Entidade brasileira: **não há ISS
  de importação**, e o crédito de PIS/COFINS é de 9,25% sobre a mídia.
- **C16 – Modelo B.** A receita é só a taxa, reconhecida **proporcionalmente ao
  gasto** (lido por API na conta do cliente); NFS-e **mensal, consolidada por
  organização**; ISS **só sobre a taxa**; o contrato diz que o cliente paga a
  rede direto. Sobre a reserva de 10%: se for retenção contratual, é
  **adiantamento (passivo)** até a prestação; se for provisão de custo futuro, é
  despesa e não mexe na receita da taxa.
- **Municípios:** deu uma tabela (SP, RJ, BH, Curitiba, Porto Alegre,
  Florianópolis, Brasília, Londrina) com alíquotas de 2% a 5% e retenção pelo
  tomador PJ; recomenda o sistema ter uma **tabela de municípios** (retém ou
  não, alíquota), a ser fornecida por ele.
- **Parecer conjunto:** reforça que ele e o advogado emitam um parecer formal
  (posição do modelo A com fundamentos, custo de cada cenário com simulação,
  preço da taxa por cenário, riscos contratuais e das redes) **antes de
  qualquer parametrização definitiva**.

### O que eu consegui conferir (busca em fontes abertas, 09/10/2026)

| Ponto | Resultado |
|---|---|
| Art. 47-A do RISS de São Paulo | **Confere na estrutura** (fontes secundárias): inciso I (10.08), inciso II (17.06, "todos os ingressos"), § 1º (se prestar os dois serviços ao mesmo cliente, bases distintas e **NFS-e distintas**) e § 2º (serviço do 17.06 prestado por terceiro não entra na base). **Não conferi o texto consolidado nem se está em vigor hoje** — falta o texto da Prefeitura. |
| SC SRRF06/Disit nº 6.006/2019 | **Existe, e a ementa bate** (sites de terceiros; o texto oficial não apareceu). Ela é do **Simples Nacional** e remete à SC Cosit 70/2016. Serve por analogia (conta alheia × conta própria), não como regra do Lucro Real. A dúvida de antes (número confundido com outra solução) fica **resolvida**. |
| Acórdão 012/25 de Recife | Não conferi o link; a ementa que ele cita trata de **competência × NFS-e**, o que **apoia** a NFS-e mensal pelo valor reconhecido. |
| SC 87/2011 | Trata de **software como insumo**; **não serve de base** para crédito sobre mídia. O crédito sobre a fatura do Meta se apoia no conceito de insumo (essencialidade), a confirmar por ele. |
| Facebook Serviços Online do Brasil e CNPJ | A entidade e as alíquotas (ISS 2,9% e PIS/COFINS 9,25%) **confirmam** (comunicados da Meta e o checkout do dono). **O CNPJ não confirmei.** O imposto fica **dentro** do total pago, não por cima; veja o ponto crítico abaixo. |
| Tabela de municípios | Sem fonte: **não é base para código**. Alíquota e retenção mudam por lei municipal e por tomador. |

### O ponto crítico: o imposto do Meta fica DENTRO do que se paga, mas reduz o saldo de anúncios

As fontes abertas que achei diziam que o Meta **soma** os impostos ao orçamento
(+12,15%). **O dono conferiu no checkout do próprio Meta (09/10/2026) e a leitura
correta é outra**: o imposto fica **embutido no total pago**, nada é somado por
cima do que se paga. A captura do "Add funds", pagando com Mercado Pago:

| Linha | Valor |
|---|---|
| Subtotal (o que vira saldo de anúncios) | R$ 52.710,00 |
| ISS estimado (2,9% **do total**) | R$ 1.740,00 |
| PIS/COFINS estimado (9,25% **do total**) | R$ 5.550,00 |
| Impostos estimados (12,15% do total) | R$ 7.290,00 |
| **Total pago** | **R$ 60.000,00** |

(1.740 ÷ 0,029 = 60.000 e 5.550 ÷ 0,0925 = 60.000: **as duas alíquotas incidem
sobre o total pago**, não sobre o subtotal.) Fica corrigida a minha afirmação
anterior de que o imposto vinha "por cima"; o que está no `CLAUDE.md` ("ISS e
PIS/COFINS já dentro") **estava certo quanto ao que se paga**. Mas o checkout
mostra o que a frase não mostrava:

- **O saldo de anúncios é 87,85% do que se paga.** Cada R$ 100 de gasto (o que o
  Ads Manager e o Windsor leem) custa à plataforma **R$ 113,83** (100 ÷ 0,8785),
  não R$ 100. O gasto que o sistema lê é líquido de imposto; o custo real em
  dinheiro é 13,83% maior.
- No **modelo A (revenda)**, por R$ 100 de mídia vendida ao cliente (a minha
  simulação grosseira, antes de IRPJ/CSLL, supondo o crédito de PIS/COFINS
  sobre o total da fatura): receita 120 − custo 113,83 − ISS próprio 6,00 −
  PIS/COFINS líquido (11,10 − crédito 10,53 = 0,57) = **≈ −R$ 0,40**; com o ISS só
  sobre a taxa (R$ 1,00), **≈ +R$ 4,60**. **Os 20% não sustentam o modelo A se a
  mídia for vendida a R$ 100 por R$ 100 de anúncio.**
- No **modelo B** o custo da rede é do cliente (ele paga o Meta, com os impostos
  dele). Resta definir a **base da taxa**: o gasto líquido que o Ads Manager
  mostra (a leitura natural, e a que a API entrega).
- A **trava de 10%** e o teto do Meta (`lifetime_budget`) **não mudam**: os dois
  falam em gasto líquido, que é o que sai do saldo de R$ 52.710. Só a margem e o
  custo do excedente mudam (o excedente também custa 13,83% mais do que o gasto
  lido).

**Duas coisas a confirmar ainda**: (1) que o gasto da campanha desconta o saldo
**1 para 1** (o Ads Manager mostra R$ 52.710 de saldo e cada real gasto sai dele)
— conferir numa campanha de verdade; (2) se a conta da plataforma é **pré-paga**
("Add funds", como na captura) ou **cartão/fatura**: a captura é do pré-pago, e o
comunicado do Meta fala que para cartão ou faturamento mensal o valor pode
mudar. Os números do checkout são **estimativas** do Meta.

**Opções de produto para o modelo A (decisão do dono, depois do parecer):**
(a) vender a mídia **com o imposto da rede discriminado**: o cliente paga
R$ 113,83 por R$ 100 de anúncio; (b) fazer como o próprio Meta: o cliente paga
R$ 100 e o **pacote vira R$ 87,85 de anúncio**, com a linha do imposto na tela;
(c) subir a taxa. A (b) é a mais transparente e igual ao que o anunciante já vê
no Meta.

### Onde a resposta ainda não fecha

1. **Uma conta, duas leituras.** O contador trata a mídia como **conta própria**
   para a receita federal (tudo é receita bruta) e usa o § 2º do art. 47-A, que
   exclui da base do ISS o serviço **prestado por terceiro**, como saída para
   baixar o ISS. A mesma operação pode ser "própria" no federal e "de terceiro"
   no ISS? É para o **parecer conjunto** dizer, com a lei do município.
2. **Item de serviço.** Ele cita 17.06 em C11 e "17.06 ou 10.08" em C16. Em São
   Paulo as bases dos dois são **diferentes** (no 10.08 a veiculação faz parte da
   receita bruta). Qual é a nossa atividade, e qual item entra no cadastro?
3. **Que município.** A resposta é de São Paulo. A plataforma está **em qual
   município**? Sem isso, a lei é outra.
4. **"Nota segregada".** Ele diz que a exclusão do § 2º exige nota emitida de forma
   segregada. O § 1º fala de notas distintas para 10.08 e 17.06, **não** da
   exclusão do terceiro. Pedir o texto do § 2º e o que ele exige como prova.
5. **A tabela de ISS é só de ISS.** O "fee efetivo" dele não tem PIS/COFINS
   líquido nem IRPJ/CSLL; a simulação certa é a do parecer.
6. **Mídia não consumida** (C11, última parte): ele não respondeu se o que volta
   ao saldo como crédito é adiantamento de cliente **sem nota**. Pela posição
   anterior (recarga é passivo, mídia é receita no consumo), parece que sim —
   confirmar.
7. **A reserva de 10%.** Ele a tratou como retenção contratual ou provisão. **Ela
   não é nenhuma das duas**: é a **margem de proteção** da trava automática. O
   saldo dos 10% **continua do cliente** (passivo, adiantamento), volta como
   crédito se a campanha encerrar, e nada disso vira receita nem despesa. Vale
   dizer a ele assim.

### Perguntas novas

**Ao contador:**
- **C17.** No Meta, ISS 2,9% e PIS/COFINS 9,25% incidem sobre o **total pago**
  (R$ 60.000 pagos → R$ 52.710 de saldo de anúncios; captura do checkout na
  seção acima). O crédito de PIS/COFINS na revenda é calculado sobre o valor
  **total** da fatura (R$ 60.000) e o ISS de 2,9% é custo sem crédito, que se soma
  ao nosso ISS sobre a nota (cascata)? Como contabilizar a diferença entre o que
  se paga e o saldo de anúncios (adiantamento de R$ 60.000 ou de R$ 52.710)?
- **C18.** No modelo B, a **base da taxa** é o gasto **sem** imposto (o que o
  Ads Manager mostra) ou com?
- **C19.** Qual item de serviço (10.08 ou 17.06), qual município e qual artigo da
  lei municipal valem para a **nossa** empresa?
- **C20.** O crédito de PIS/COFINS sobre mídia se apoia em quê (a SC 87/2011 trata
  de software)? Existe solução de consulta ou decisão sobre **mídia de anúncio**
  como insumo?

**Ao advogado:** acrescentar ao item 12 a pergunta **se a revenda é possível sem
repassar o imposto da rede** ao cliente (preço da mídia com o imposto
discriminado na proposta e no aceite), e ao item 11 se a identificação do
anunciante real pesa mais com o imposto cobrado em nome da plataforma. No item 12,
se o contrato pode dizer que o pacote contratado é o **total pago** e o saldo de
anúncios é esse total menos o imposto da rede (como o próprio Meta faz).

### O que isto muda

- **Preço da taxa:** a decisão de manter 20% fica **suspensa** até o parecer.
  No modelo A a mídia tem de ser **vendida já contando o imposto da rede** (o
  saldo de anúncios é 87,85% do pago); no modelo B os 20% seguem fazendo
  sentido.
- **Código:** nada muda agora. No planejamento entram dois parâmetros
  **versionados por competência**: a posição fiscal (revenda ou repasse) e o
  **imposto da rede retido do pagamento** (12,15% do total pago, hoje 0% no
  código; o custo de um gasto G é G ÷ (1 − 12,15%)), usados pela margem e pelo
  custo do excedente. A trava e a taxa do modelo B seguem o gasto líquido.
- **Tabela de municípios:** vira parâmetro **cadastrado pelo contador, com
  fonte e data**, nunca constante no código.

## 19. Respostas do contador a C17–C20 e aos pontos que não fechavam (09/10/2026)

O contador reconheceu as imprecisões da seção 18 e respondeu. O que mais pesa:
**a contradição foi resolvida contra a saída que reduzia o ISS** — veja o item 1.

### O que ele respondeu

- **C17 – Imposto do Meta.** No Lucro Real o crédito de PIS/COFINS é sobre o valor
  **total** da fatura (9,25% de R$ 60.000 = **R$ 5.550**, não de R$ 52.710). O
  ISS de 2,9% (R$ 1.740) é **custo sem crédito**, despesa definitiva, que se soma
  ao nosso ISS sobre a nota. A diferença entre o pago (R$ 60.000) e o saldo de
  anúncios (R$ 52.710): PIS/COFINS como **crédito a recuperar** (ativo) e ISS como
  despesa (custo da mídia). Com a posição de **conta alheia** não haveria compra
  nem crédito: por isso a contradição era insustentável.
- **C18 – Modelo B.** A base da taxa é o **gasto de mídia sem imposto**, o que o
  Ads Manager mostra; os impostos que o cliente paga à rede não entram na base,
  porque a plataforma não os movimenta.
- **C19 – Cadastro.** Gestão de tráfego pago é **17.06**; se também intermediar
  entre anunciante e veículo, pode caber o **10.08**. O ISS é devido no município
  do **estabelecimento prestador**. O artigo da lei municipal depende do município
  da sede (em São Paulo, art. 47-A do Decreto 58.175/2018): **ele precisa saber o
  município**.
- **C20 – Crédito sobre mídia.** O fundamento é o conceito de insumo do STJ
  (**REsp 1.221.170/PR**, essencialidade e relevância). Citou a **SC Cosit nº 32,
  de 18/03/2021** (gastos com publicidade não eram insumo para aquela
  contribuinte). Não há solução de consulta específica sobre mídia de anúncio
  para plataforma de gestão de tráfego; o argumento é caso a caso.
- **Pendências antigas.** SC 6.006: apontou de novo só a página de busca; Acórdão
  de Recife: o Diário Oficial do Município; municípios: a planilha de alíquotas
  dos 5.571 municípios do **Portal Nacional da NFS-e**, com a regra de retenção a
  consultar por município e a tabela do sistema alimentada com ela.

### Os cinco pontos da seção 18, fechados

1. **Conta própria × conta alheia.** Ele concorda: a mesma operação não pode ser
   própria no federal e de terceiro no municipal. Como a campanha está na conta
   da plataforma e o Meta fatura a plataforma, é **revenda**, e a plataforma **não
   é mera intermediadora**: **a exclusão do § 2º do art. 47-A não se aplica**. Em
   São Paulo o ISS incide sobre **mídia + taxa**.
2. **Fee efetivo.** A tabela dele só tinha ISS; a simulação com PIS/COFINS e
   IRPJ/CSLL entra no **parecer conjunto**.
3. **Mídia não consumida.** Adiantamento de cliente (passivo), **sem nota**; a nota
   sai só na prestação (veiculação).
4. **Reserva de 10%.** Entendida: margem de proteção da trava, saldo do cliente,
   passivo, **nem receita nem despesa**; não afeta a competência (a receita da taxa
   segue o gasto da mídia).
5. **Item de serviço e município.** Depende de você me dizer (ver a lista abaixo).

### A minha conferência

| Ponto | Resultado |
|---|---|
| Crédito de PIS/COFINS de R$ 5.550 sobre o total | **Bate** com a minha simulação da seção 18 (crédito de 9,25% sobre o total da fatura). O custo líquido de cada R$ 100 de gasto é R$ 103,30 depois do crédito. |
| Contabilização ("o custo para a DRE é R$ 60.000" e "o crédito reduz o custo") | **Duas frases que não combinam.** Com o crédito de R$ 5.550 a recuperar, o custo da mídia na DRE é R$ 54.450 (R$ 52.710 consumidos + R$ 1.740 de ISS), não R$ 60.000. Pedir a ele a frase certa no parecer. |
| "PIS/COFINS e ISS cobrados **por fora**" (C18) | **Contradiz o checkout do dono**: no "Add funds" o imposto está **dentro** dos R$ 60.000. A conclusão (base da taxa = gasto líquido) não muda, mas a frase está errada ou vale para outra forma de pagamento (cartão ou fatura). |
| REsp 1.221.170/PR | **Confere**: é o julgamento do STJ que fixou o critério de essencialidade e relevância. |
| SC Cosit 32/2021 | **Existe** (aparece citada como vinculante em soluções posteriores) e **nega** crédito de publicidade para o caso dela, que trata de um prestador de limpeza de móveis. **Não conferi o texto oficial.** Ela é contra a tese, não a favor. |
| O que ele **não citou** e pesa mais | A **SC Cosit 8/2024** (parcialmente vinculada à 32/2021): para o **prestador de serviços de publicidade**, o crédito é admitido sobre a **subcontratação de terceiros** para prestar o serviço, com requisitos, e negado para veiculação em rádio, TV, jornal e revista. Mídia digital do Meta cabe melhor aqui. Também o **Parecer Normativo Cosit 5/2018**, que diz que **na revenda de bens não há insumo**, só crédito sobre o bem adquirido para revenda. **Risco**: o fisco chamar a operação de "revenda de mídia". Mídia é serviço, não bem, mas a classificação é para o parecer. **Só encontrei fontes secundárias**: o texto oficial das duas fica para ele. |
| Planilha de alíquotas dos 5.571 municípios no Portal Nacional da NFS-e | **Não conferi.** É alíquota, não regra de retenção. |
| SC 6.006 e Acórdão de Recife | Ele não deu o texto oficial nem o link direto. Pendência de baixa prioridade. |

### O que isto muda

- **O modelo A fica sem a saída do ISS.** Com revenda confirmada e o § 2º
  afastado, o ISS incide sobre mídia + taxa. A minha simulação da seção 18
  (≈ −R$ 0,40 por R$ 100 de mídia com ISS de 5%) passa a ser o **cenário base**
  de São Paulo. Com ISS de 2% sobra cerca de **+R$ 3,20**. **O modelo A só fecha
  com preço novo** (as opções (a), (b) e (c) da seção 18) **ou migrando para o
  modelo B**, onde o ISS é só sobre a taxa e os 20% fazem sentido.
- **O crédito de PIS/COFINS é parte do preço do modelo A**: sem ele (se o fisco
  negar), a conta piora em R$ 10,53 por R$ 100 de mídia. O parecer precisa dizer
  qual a segurança jurídica do crédito (SC Cosit 8/2024, REsp 1.221.170).
- **Modelo B**: base da taxa = gasto líquido que a API entrega. Nada a mudar no
  que está planejado.
- **Código**: nada muda agora. Os parâmetros do planejamento ficam: posição fiscal
  (revenda ou repasse, por competência), imposto da rede retido do pagamento
  (12,15%) e a **tabela de municípios** (alíquota e retenção, com fonte e data,
  alimentada pelo contador).

### Perguntas que sobram ao contador

- **C21.** O que o contador quis dizer com "por fora" (C18), se no checkout o
  imposto está dentro do total pago? Vale para cartão e fatura?
- **C22.** A SC Cosit 8/2024 (e a 32/2021 de que depende) sustenta o crédito de
  PIS/COFINS sobre a fatura do Meta na revenda? E o risco do Parecer Normativo
  Cosit 5/2018 ("revenda não gera insumo")? Pedir o número e o link oficiais.
- **C23.** A frase certa da DRE: custo da mídia de R$ 54.450 (com o crédito) ou
  R$ 60.000?
- **C24.** Na revenda, qual taxa mantém a margem-alvo em cada município (2%, 3%,
  5% de ISS), com PIS/COFINS líquido e IRPJ/CSLL: **a simulação do parecer**.
- **Ao advogado:** o item 11 (termos das redes) passa a ser o mais urgente,
  porque a revenda é a posição confirmada.

### O que ainda é seu

- Dizer **o município da sede** e **o item de serviço do cadastro**: sem isso o
  contador não busca a lei.
- Decidir entre reprecificar o modelo A (opções (a), (b) ou (c)) ou priorizar o
  modelo B.

## 20. Última rodada do contador: o que ficou resolvido e o que depende do parecer (09/10/2026)

O contador respondeu de novo, mas **não leu o texto das minhas C21 a C24**: ele
escreveu que não as recebeu e "deduziu" as perguntas. As numerações dele não
são as nossas; abaixo vai o casamento, pergunta por pergunta.

### O que ele corrigiu

1. **"Por fora" × "por dentro."** Reconhece que estava errado: os R$ 7.290 de
   imposto já estão **dentro** dos R$ 60.000 do checkout do Meta. A conclusão (o
   crédito é sobre o valor total da fatura) fica; a premissa estava errada.
2. **Custo da mídia na DRE.** **Bruto R$ 60.000; líquido R$ 54.450** (depois do
   crédito de PIS/COFINS de R$ 5.550). Fecha a frase que não combinava.
3. **SC Cosit 32/2021** é contra a tese (prestador de limpeza); o que sustenta é a
   **SC Cosit 8/2024**.
4. **Parecer Normativo Cosit 5/2018**: o risco existe — o fisco pode chamar a
   operação de **revenda de mídia** e negar o crédito (o parecer diz que na
   revenda de bens não há insumo, só crédito sobre o bem comprado para revenda). A
   defesa dele: a mídia é **meio** da prestação do serviço de gestão, não o fim.
   Recomenda **manter o crédito, provisionar o risco e documentar a
   essencialidade**, e levar o ponto ao parecer conjunto.

### Casamento com as minhas perguntas

| Minha pergunta | Situação |
|---|---|
| **C21** (o "por fora") | **Respondida** (item 1 acima). |
| **C22** (SC 8/2024 e o risco do PN 5/2018) | **Respondida com risco** (item 4): manter o crédito, provisionar. |
| **C23** (frase da DRE) | **Respondida** (item 2): bruto R$ 60.000, líquido R$ 54.450. |
| **C24** (taxa que mantém a margem em cada município, com PIS/COFINS líquido e IRPJ/CSLL) | **Não respondida.** Fica para o **parecer conjunto**. |
| Município da sede e item de serviço (C19) | **Esperando você.** Ele repete que precisa saber o município. |

As respostas que ele rotulou "C23" (reserva de 10%) e "C24" (modelo B: base da
taxa sem imposto) **repetem o que já estava fechado** na seção 19.

### O que eu conferi

- **A SC Cosit 8/2024 e o PN 5/2018 voltaram "da boca" dele, mas vieram de mim**:
  ele escreveu "a SC 8/2024, que você citou". Eu só tinha **fontes secundárias**
  (seção 19). **O parecer não pode se apoiar numa norma que nenhum dos dois leu
  no texto oficial**: pedir a ele que abra a SC 8/2024, a 32/2021 e os itens do
  PN 5/2018 que cita ("itens 40 a 44", que não conferi) e confirme o que dizem.
- **"Receita financeira (ou redução de custo)."** Ele chama o crédito de
  PIS/COFINS de uma coisa **ou** da outra. Não são equivalentes (uma entra na
  receita e muda a base; a outra reduz o custo). Para a DRE do parecer ele
  precisa **escolher e dizer o fundamento**.
- **As "pendências antigas" voltaram iguais**: SC 6.006 e Acórdão de Recife
  seguem só com a página de busca e o Diário Oficial, sem o texto; a planilha de
  alíquotas do Portal Nacional da NFS-e não foi conferida por mim e **é só
  alíquota, não regra de retenção**. Nada mudou; ficam de baixa prioridade.
- **Item 11 (termos das redes)**: ele concorda que é o mais urgente e que pode
  **inviabilizar o modelo A** para certas categorias. É assunto do advogado.

### Onde estamos

O contador **não tem mais dúvida pendente do lado dele** além do que o parecer
conjunto vai responder (simulação por município, segurança do crédito, preço da
taxa) e do que **só você** sabe (município da sede e item de serviço). O que
destrava o planejamento:

1. **Você**: município, item de serviço e a decisão entre **reprecificar o
   modelo A** ou **priorizar o modelo B**.
2. **O advogado**: itens 1 a 14 (em especial o 11, os termos das redes na revenda
   e em jogo de azar).
3. **O parecer conjunto**, com a simulação completa e o preço da taxa por cenário.

## 21. O contador diz ter lido as normas no texto oficial (09/10/2026)

Ele aceitou a cobrança (norma de fonte secundária não entra em parecer) e
respondeu com a análise de cada norma, os links e a posição sobre o crédito.

### O que ele disse

- **SC Cosit 8/2024** (DOU 05/03/2024): nega crédito de PIS/COFINS para (a) a
  publicidade das próprias atividades, (b) rádio, TV, jornal e revista (excluídos
  da base) e (c) a compra do direito de comercializar espaço publicitário para
  ceder a terceiros; **admite** o crédito das despesas de **subcontratação de
  terceiros** para prestar serviço de publicidade, na modalidade aquisição de
  insumos. Meta, Google e TikTok seriam os terceiros subcontratados: **é o melhor
  fundamento que há**.
- **SC Cosit 32/2021** (DOU 25/03/2021): contra a tese, mas de caso diferente
  (empresa de limpeza de bens móveis, publicidade como despesa de marketing,
  atividade-meio). Aqui a publicidade é a atividade-fim.
- **Parecer Normativo Cosit 5/2018** (itens 40 a 44): na revenda de bens não há
  insumo, só crédito sobre o bem adquirido para revenda (art. 3º, I, das Leis
  10.637/2002 e 10.833/2003). **O risco** é o fisco enquadrar a operação como
  "revenda de mídia". A defesa: a atividade é prestação de serviço de publicidade
  (17.06), com a mídia como insumo essencial, lido o parecer em conjunto com o
  critério da essencialidade. Cita ainda os acórdãos do CARF **3402-003.989** e
  **9303-012.426**.
- **SC 6.006/2019**: o texto da ementa citado agora é o integral e **dá o link
  direto** (`normas.receita.fazenda.gov.br/…/anexoOutros.action?idArquivoBinario=51537`).
  Conclusão dele: no modelo A a campanha está no nome da plataforma, é **conta
  própria**, e a tese de repasse não se sustenta.
- **Acórdão 012/25 de Recife**: confirma que a fiscalização pode exigir o ISS pela
  **competência contábil** (receita apropriada), não só pela data da NFS-e;
  reforça alinhar a emissão da NFS-e à competência.
- **Crédito de PIS/COFINS**: **não é receita financeira**. É crédito a recuperar
  (ativo) com a **redução do custo** como contrapartida: a fatura do Meta entra
  no custo por R$ 60.000 e o crédito de R$ 5.550 o reduz. **O custo da mídia na
  DRE é o líquido, R$ 54.450.** (Fecha o ponto aberto na seção 20.)
- **Municípios**: vai compilar uma tabela inicial (SP, RJ, BH, Curitiba, Porto
  Alegre, Florianópolis, Brasília, Londrina) com alíquota usual e a fonte (lei
  municipal), revista de tempos em tempos; o sistema deve permitir a marcação
  manual por organização, validada contra essa tabela.
- **Parecer conjunto**: cinco itens (posição do modelo A com o art. 208, III do
  RIR/2018 e a SC 6.006; simulações com ISS, PIS/COFINS e IRPJ/CSLL; preço da taxa
  por cenário; riscos das redes; estratégia de defesa do crédito diante do PN
  5/2018). Só começa quando você disser o **município da sede** e o advogado
  concordar com a estrutura.

### O que eu consegui conferir

- **Nada disto eu abri.** Tentei os dois links dele (a SC 6.006 e o acórdão de
  Recife) e **os dois endereços não abrem do meu ambiente** (sem rede para esses
  sites). Os textos, as datas do DOU e os itens 40 a 44 do PN 5/2018 seguem
  **como ele os descreve**, não como eu os li. Os dois acórdãos do CARF vêm
  **sem link**: não conferi nem a existência.
- **O que bate com o que eu já tinha**: a ementa da SC 6.006 agora citada **bate**
  com a que eu havia achado em sites de terceiros (conta alheia: só o resultado é
  receita; conta própria: o valor cobrado entra inteiro), e a SC 8/2024 segue o
  que apareceu nas buscas (admite crédito na subcontratação de terceiros).
- **A SC 6.006 é do Simples Nacional.** A plataforma é Lucro Real, e o parecer o
  cita ao lado do art. 208, III do RIR/2018. Vale pela **analogia** da distinção
  conta própria × conta alheia, não como regra do Lucro Real: o parecer precisa
  dizer isso com todas as letras.
- **A palavra "revenda" é o gatilho do risco.** O PN 5/2018 nega insumo à
  **revenda de bens**; a SC 8/2024 admite crédito na **subcontratação para prestar
  serviço de publicidade**. A operação do modelo A é **conta própria** (a
  plataforma contrata o Meta e responde por ele), e isso **não é** revenda de
  bens: é prestação de serviço com mídia subcontratada. Se o contrato, a nota e a
  documentação disserem "revenda de mídia", o fisco recebe o enquadramento de
  graça. **Minha leitura, a confirmar com ele e com o advogado**: o parecer deve
  fixar o nome da operação (por exemplo, "prestação de serviço de publicidade com
  fornecimento de mídia por subcontratação, em conta própria") e o contrato e a
  NFS-e usarem o mesmo.
- **Este documento e o código também dizem "revenda"** (seções 15 a 20 e o
  `docs/PLANO-TRAFEGO-PAGO.md`): é termo de trabalho nosso, **não** o que vai ao
  contrato; ajustar quando o parecer fixar o nome.

### Onde estamos

Contador sem dúvida pendente do lado dele. **Falta para o parecer sair**:
1. **Você**: município da sede e item de serviço (17.06 ou 10.08).
2. **O advogado**: concordar com a estrutura do parecer e responder os itens 1 a 14
   (em especial o 11, os termos das redes).
3. **O contador**: anexar ao parecer **cópia dos trechos oficiais** que cita (SC
   8/2024, itens 40 a 44 do PN 5/2018, a SC 6.006) e os dois acórdãos do CARF.

## 22. Respostas do advogado às prioridades 1 e 2 (09/10/2026)

Ele respondeu a lista de `docs/PERGUNTAS-AO-ADVOGADO.md`, blocos A (prioridade 1)
e B a D1 (prioridade 2). **Não respondeu a prioridade 3** (D2 a D4 e E1 a E7).

### O que ele disse

**A1 — termos das redes.** O modelo A, como descrito, é de **altíssimo risco**:
- **Meta**: exige autorização prévia para "jogos de azar e jogos online", que
  inclui rifas e loterias; a autorização é do **anunciante** (quem paga), vinculada
  à conta de anúncios e à prova de licença do regulador. Com a conta da plataforma,
  **ela** precisa da autorização e responde pela veiculação; se uma promotora for
  penalizada, a plataforma, como titular da conta principal, pode responder
  **solidariamente** perante a Meta e as outras promotoras.
- **Google**: desde 01/01/2025 exige licença válida do Ministério da Fazenda para
  certificar anunciantes de apostas e jogos online no Brasil; a plataforma, como
  agência, pode precisar da certificação **na conta principal**, com o mesmo risco
  de responsabilidade centralizada.
- **TikTok**: proíbe jogos de azar, **inclusive rifas**; só loterias, com permissão
  e representante dedicado. **Inviável para rifa.**
- Conclusão: viável na Meta e no Google (com certificação), inviável no TikTok; a
  centralização das contas cria risco de responsabilidade solidária e de bloqueio
  de **toda** a operação.

**A2 — contrato.** Redigir como **"prestação de serviços de gestão de mídia
paga"**, nunca "revenda de mídia" (a revenda poderia configurar representação
comercial ou intermediação, com outras consequências tributárias e de
responsabilidade). A plataforma adquire a mídia em nome próprio; a remuneração é
a taxa de gestão.

**A3 — responsabilidade.** Ao contratar a rede, a plataforma assume a
responsabilidade **primária perante a rede**, e aumenta a perante a promotora (obrigação
de meio, salvo promessa de resultado) e perante o consumidor (CDC, arts. 3º, 37 e
38: publicidade enganosa ou abusiva em nome da promotora, solidariedade). O
**regresso** do contrato da promotora (cláusula 5.1) segue essencial, mas **não
protege de condenação solidária**.

**A4 — risco de crédito.** O Pix da promotora estornado depois de a plataforma ter
pago a rede é prejuízo da plataforma. Recomenda: **carência para o estorno do Pix
(ex.: 7 dias)** antes de o saldo poder pagar a rede, e cláusula de **reposição do
saldo** em caso de estorno, sob pena de rescisão e cobrança judicial.

**A5 — imposto da rede.** A ideia está correta: o contrato diz que o valor pago é
o total e que o saldo de anúncios é o total **menos os impostos retidos pela
rede** ("gross-up", prática de mercado), com clareza no contrato e no painel.

**A6 — saldo pré-pago.** **Risco regulatório sério.** O saldo pode ser
caracterizado como **conta de pagamento pré-paga** (Resolução BCB nº 96/2021) e,
se for, a plataforma exerceria atividade regulada sem autorização. Mitigar com
(1) **conta segregada**, (2) contrato dizendo que o saldo é **crédito pré-pago
para um serviço específico**, sem saque nem transferência a terceiros e (3)
**parecer de escritório especializado em direito bancário e de pagamentos**.

**B — taxa, crédito e excedente.**
- A taxa de gestão, incorrida, **não é reembolsável**, e o contrato diz isso.
- **Exceção por falha da plataforma: crédito, não dinheiro**, é prática aceitável
  se estiver no contrato.
- **12 meses** de validade do crédito é razoável; tem de constar no contrato.
- **Aceite eletrônico**: registrar hash, **IP**, data, como nos outros documentos.
- **Excedente**: pausar sozinha "ao atingir 10% de excedente" e **notificar a
  promotora**, para não cobrar o que ela não autorizou.

**C — modelo B.** "Mais complexo e arriscado": a plataforma passa a responder por
**erros de gestão** (gastar mais do que o autorizado, não otimizar). Pede
**taxa mais alta** e **cláusulas de limitação de responsabilidade** muito bem
redigidas.

**D1 — publicidade.** Cita a **Lei 14.790/2023** e a **Portaria SPA/MF nº
1.231/2024**: a publicidade leva o **número da autorização** da SPA/MF, não pode
se dirigir a menores de 18 e não pode associar a rifa a riqueza, sucesso ou saída
de dívidas; a plataforma, ao criar o anúncio, responde por incluir isso.

**Conclusão e recomendação dele.** (1) **Não implementar o modelo A como
descrito**, ou só com **contas de anúncio segregadas por promotora** (o que acaba
com a economia de escala). (2) O **saldo pré-pago (A6) é o risco mais grave**.
(3) A plataforma não se exime da responsabilidade perante o consumidor.
**Antes de investir**: contratar o **parecer de direito bancário** sobre o saldo e
**consultar formalmente a Meta e o Google** se uma agência pode obter a
certificação para anunciar em nome de várias promotoras.

### O que eu consegui conferir (busca em fontes abertas, 09/10/2026)

| Ponto | Resultado |
|---|---|
| **Meta**: autorização para rifa e loteria | **Confere** na política oficial ("Online Gambling and Games"): exige permissão por escrito para loterias e rifas, pedida por formulário, com prova de licença ou legalidade no território. **A página não diz nada sobre agência** (a pergunta de fundo do A1 segue aberta). |
| **Google**: licença do Ministério da Fazenda desde 01/01/2025 | **Confere**, mas a política oficial fala de **apostas esportivas e cassino online**. Que **rifa autorizada pela SPA/MF** caia nessa certificação **não aparece**. |
| **TikTok**: "proíbe rifas" | **Só em parte.** A política de anúncios do TikTok é de **certificação por mercado** (loterias estão no escopo); quem **proíbe rifa** é a política do **TikTok Shop**, outra coisa. O que vale para o Brasil está numa seção de requisitos por mercado que **eu não li**. A conclusão "inviável" é plausível, **não está provada**. |
| **Lei 14.790 e Portaria SPA/MF 1.231/2024** para a rifa (D1) | **Não confere como está.** A portaria trata de **apostas de quota fixa** (bets: jogo responsável, publicidade e promoção desses operadores). Nada encontrado a liga a **rifa ou promoção comercial** (Lei 5.768/71). Pode valer por analogia, mas **não é a norma da nossa rifa**. |
| Resolução BCB nº 96/2021 (conta de pagamento) | Não conferi o texto; o enquadramento é o que se espera, e a recomendação de parecer especializado é a certa. |
| CDC, art. 26, § 3º, citado para o prazo do crédito | **Inadequado**: o art. 26 trata do prazo para reclamar de vício, não da validade de crédito. A base dos 12 meses precisa ser outra. |

### O que ele disse que não bate com o que fizemos

- **Excedente.** Ele escreveu "pausar ao atingir **10% de excedente**". O desenho é
  **pausar quando o saldo restante cai a 10%** (o excedente é o que a rede gasta
  **além** da verba). São coisas diferentes e precisam ser corrigidas com ele.
- **Aceite.** "Registrar hash, **IP** e data como já fazemos": no aceite da **taxa**
  do tráfego o sistema grava só **data, versão e SHA-256**; IP e aparelho (em hash)
  existem no **contrato da promotora**, não no aceite da taxa. **Falta
  acrescentar** (mudança de código pequena, depois de decidido).
- **Exemplo do gross-up** (R$ 1.000 → R$ 970): usa 3% de imposto. O real é de
  **12,15% sobre o total** (R$ 1.000 → R$ 878,50 de saldo de anúncios).
- **Modelo B "mais arriscado".** O contador via o B como a saída que preserva a
  economia (ISS só sobre a taxa). O advogado vê o risco de **gestão**: é um risco
  real, mas **contratual** (obrigação de meio, orçamento fixado pelo cliente,
  aprovação prévia antes de ligar), não um impedimento. E a própria saída dele
  para o A ("contas de anúncio segregadas por promotora") **é, na prática, o B**:
  cada promotora é a anunciante, com a **própria** autorização e a **própria**
  responsabilidade.
- **A restrição das redes pesa nos dois modelos.** A exigência de autorização para
  rifa e a restrição do TikTok são **do conteúdo do anúncio**, não do modelo: no
  B a promotora precisa dela na conta dela. O que muda no B é **quem responde**:
  deixa de ser a plataforma, por uma conta única.

### Perguntas que sobram

Estão em `docs/PERGUNTAS-AO-ADVOGADO.md`, na "Segunda rodada". Resumo: confirmar
que "contas segregadas por promotora" = modelo B e como limitar a
responsabilidade de gestão; a base do TikTok e do Google para **rifa**; qual
norma rege a **publicidade da rifa** (não a das bets); a base dos 12 meses; o
"10%"; a carência do Pix; e **tudo que ele não tocou** (B1, B3, B6, C1 e C2 em
detalhe, prioridade 3).

### O que isto muda

- **O modelo A fica suspenso.** Nada de código do modelo A (criar campanha na
  conta da plataforma para várias promotoras) até **duas** respostas: o parecer de
  direito bancário e a consulta formal à Meta e ao Google. **O modelo B passa a
  ser o caminho mais provável**, com o contrato certo.
- **TikTok sai** da lista de redes com conta pronta, no que tange a rifa, até
  ler a política de mercado do Brasil.
- **O saldo pré-pago já existe no sistema** (patrocínio, banner pago, assistente de
  IA) **e o parecer de direito bancário vale para todos**, não só para o tráfego.
  Enquanto não sair: manter **desligado** o reembolso em dinheiro do saldo, sem
  saque nem transferência, e conta bancária **segregada** para esse dinheiro.
- **Já decidido por ele e a fazer no código, quando o planejamento começar**: IP
  e aparelho (hash) no aceite da taxa.

## 23. Guia de adequação às políticas das redes, do advogado (09/10/2026)

Depois da seção 22 ele mandou um guia **por rede**, que muda o peso de duas
coisas: o modelo B vira **o caminho mais seguro**, e o TikTok sai.

### O que ele disse

**Meta — viável, com autorização prévia.** Rifa se enquadra na definição de
jogo de azar (valor monetário na entrada e no prêmio). A autorização é pedida por
escrito, **concedida à conta de anúncios** (não à promotora) e exige prova de que
a atividade é licenciada pelo regulador: no Brasil, o **número da autorização da
SPA/MF de cada rifa**, que a plataforma teria de manter atualizado. É proibido
segmentar menores de 18. A **página de destino** também está sujeita à política.
**Risco da conta única**: uma promotora que viole a política derruba a conta
inteira, de todas. Solução: **segregar por promotora ou, no mínimo, por rifa**.

**Google — gravemente restrito.** Aceita loteria com licença e certificação do
Google, mas **proíbe "agregadores de jogos de azar de qualquer tipo" no Brasil
desde 30/09/2024**. A plataforma, ao gerir anúncios de várias promotoras na
própria conta, **pode ser vista como agregadora**, o que a impediria de certificar
e de veicular qualquer rifa. Caminhos: (1) **descaracterizar a função de
agregador** (agência de gestão de mídia, nunca marketplace), (2) **modelo B**,
com a certificação e a licença **no nome da promotora**, (3) **consultar o Google**
para saber se uma agência pode se certificar. Se negar, o modelo A não pode ter
Google Ads.

**TikTok — inviável.** A política de anúncios do TikTok para o Brasil proíbe
anúncios de jogos de azar, **incluindo loterias**, apostas esportivas e jogos de
azar virtuais; a do TikTok Shop proíbe "bilhetes de rifa". **Sem caminho** para
anúncio pago de rifa; só conteúdo orgânico de marca, ainda sujeito às diretrizes.

**Quadro dele:** Meta, sim, com autorização, **contas segregadas por promotora**;
Google, improvável, **modelo B**; TikTok, não.

**Recomendações finais.** (1) Rever a arquitetura do modelo A (a conta única é o
ponto mais frágil). (2) **Consultar formalmente a Meta e o Google, por escrito**,
antes de qualquer desenvolvimento. (3) Escolher entre o **modelo B para Google e
Meta** ("reduz a escala e aumenta a complexidade, mas é o caminho mais seguro") ou
**só a Meta**. (4) **Blindar o contrato**, qualquer que seja o modelo: a promotora
mantém a autorização SPA/MF válida; **regresso integral** da plataforma por
bloqueio de conta por culpa dela; **limitação de responsabilidade** (a plataforma
não garante resultado nem responde por bloqueio por política das redes); a
promotora fornece **criativos e informações legais**; **indenização** por bloqueio
decorrente de informação falsa. (5) **Revisão trimestral** do guia e dos contratos.
Ele se oferece para **redigir as consultas formais** e **revisar os contratos**.

### O que eu consegui conferir

| Ponto | Resultado |
|---|---|
| Meta: permissão por escrito para loteria e rifa; sem segmentar menores | **Confere** (política oficial). O **nome da aba** "Autorizações e Verificações" **não conferi**. Que a autorização seja da **conta de anúncios** e como funciona para **agência** **não está** na política que li. |
| Google: "agregadores de jogos de azar de qualquer tipo" proibidos após 30/09/2024 | **Confere** (a atualização de setembro de 2024 da política do Google para o Brasil diz isso, e que operadores de loteria precisaram **recertificar**). **O que "agregador" quer dizer** para a rifa **não está claro**: no Google, é quem direciona tráfego a operadores. Veja o ponto crítico abaixo. |
| TikTok: política de anúncios proíbe loteria e a do Shop proíbe bilhete de rifa | **A do Shop confere** (proíbe loteria e rifa). **A de anúncios, não**: o que li é **certificação por mercado**, com loteria no escopo, e a seção do Brasil eu não vi. **Ele mudou de versão**: na seção 22 disse "só loteria, com permissão e representante dedicado"; agora diz "proíbe loteria". A conclusão (**tratar o TikTok como desligado**) é a prudente, mas **o fundamento oscila**. |

### O ponto crítico: "agregador" olha o site, não a conta de anúncios

O advogado coloca o risco de "agregador" na **conta de anúncios** (várias promotoras
numa só) e diz que no **modelo B** ele **diminui**. Mas o que o Google chama de
agregador é, pelo que li, quem **reúne e leva tráfego a operadores de jogo**. A
**nossa plataforma, em si, é um site que reúne rifas de várias promotoras**: o
anúncio, em qualquer modelo, leva a `/o/<org>/r/<rifa>` — uma página **da
plataforma**. Se o Google lê "agregador" pelo **destino**, o risco **continua no
modelo B**, porque a página de destino é a mesma. É a **pergunta decisiva ao
Google** e ao advogado (R12).

### Pontos que não fecham

- **Meta, passo 1 × passo 5.** Pede a autorização **para a conta da plataforma** e
  logo depois diz para **segregar por promotora ou rifa**. São estruturas
  diferentes (uma conta da plataforma com prova de cada rifa; várias contas; ou a
  conta da promotora). A segunda é o **modelo B**.
- **"Landing page com promoção de jogo de azar é rejeitada"**: para nós a página
  **é** a rifa. Com a permissão, o anúncio é aceito; sem ela, rejeitado. A frase
  está imprecisa.
- **Modelo B**: na seção 22 era "mais complexo e arriscado"; agora é "o caminho
  mais seguro". Os dois valem: B é **mais seguro quanto à política das redes e à
  regulação**, e **mais arriscado quanto à gestão**; a segunda parte se resolve
  com contrato.

### O que isto muda

- **O modelo B vira o produto principal; o A fica suspenso.** Meta e Google em B,
  com a **promotora anunciante e titular da conta e da autorização**; a plataforma
  gere e cobra a taxa.
- **TikTok fica desligado** para rifa.
- **A parte que dá trabalho e nunca é prometida em código**: **cada promotora
  precisa da autorização da Meta** (e, se houver, a certificação do Google) **na
  conta dela**, e provar a autorização SPA/MF de cada rifa. A plataforma pode
  **facilitar**, com o número da autorização e o certificado que já guarda
  (`campaign_certificados`), mas **não pede nem obtém por ela**.
- **Contrato do modelo B**: as cinco cláusulas do advogado (autorização válida,
  regresso, limitação, criativos e informações legais, indenização) mais as de
  gestão da seção 22 (obrigação de meio, orçamento teto, aprovação prévia).
- **Próximos passos práticos**: (1) o advogado **redige as consultas formais**
  à Meta e ao Google (ele se ofereceu) e o anexo do contrato do modelo B; (2) as
  consultas dizem que o destino é uma página da plataforma (R12); (3) o parecer de
  direito bancário sobre o saldo continua valendo.
