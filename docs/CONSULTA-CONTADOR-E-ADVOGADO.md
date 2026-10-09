# Consulta ao contador e ao advogado — tráfego pago (09/10/2026)

Registro das perguntas feitas e das respostas recebidas sobre o **tráfego
pago** (modelo A, a taxa de gestão cobrada na aprovação e o modelo B). O que
vira trabalho de código está na seção 4; o que é decisão do dono, na seção 5.

**Situação**

| Quem | Situação |
|---|---|
| Contador | **Respondeu** (09/10/2026). Primeira rodada na seção 2, doação à ONG na seção 7, segunda rodada (Tesouraria) na seção 11; terceira rodada respondida na seção 13; **quarta rodada respondida na seção 15 (muda a posição fiscal do modelo A: revenda)**; **quinta, mínima (4 dúvidas), na seção 16**. |
| Regime da plataforma | **Lucro Real** (informado pelo dono em 09/10/2026) — ver a seção 8, que muda a leitura de várias respostas. |
| Advogado | **Perguntas enviadas, sem resposta ainda.** Perguntas na seção 3; as respostas entram aqui quando chegarem. |

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

