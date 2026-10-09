# Consulta ao contador e ao advogado — tráfego pago (09/10/2026)

Registro das perguntas feitas e das respostas recebidas sobre o **tráfego
pago** (modelo A, a taxa de gestão cobrada na aprovação e o modelo B). O que
vira trabalho de código está na seção 4; o que é decisão do dono, na seção 5.

**Situação**

| Quem | Situação |
|---|---|
| Contador | **Respondeu** (09/10/2026). Respostas na seção 2; análise na seção 4. |
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
- Com o contador: regime (Simples, Presumido ou Real); se a competência vale
  mesmo no Simples; o **Anexo e o Fator R** do item 17.06 no Simples (a resposta
  falou de Anexo III com 6%, mas conferir se publicidade cai no Anexo V); e
  **conferir a Solução de Consulta nº 6.006** citada.
- Abrir **contas bancárias separadas** para a mídia e para a taxa.
- Guardar por 5 anos extratos, faturas e comprovantes das redes.
- CNAE **73.11-4-00** e serviço **17.06** no cartão do CNPJ e na inscrição
  municipal (a prefeitura só emite a NFS-e de serviço cadastrado).
