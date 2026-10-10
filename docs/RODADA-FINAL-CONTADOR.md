# Rodada final ao contador — fechar de vez (10/10/2026)

A parte do advogado está fechada (`docs/RODADA-FINAL-ADVOGADO.md`). Esta é a
**única rodada** ao contador, na mesma forma: pergunta com **Padrão**, prazo
único e regra de encerramento.

## O que mudou desde a última conversa com você

1. **O foco de divulgação passou para influenciadores** (comissão sobre venda
   paga; acordo com cachê **só com MEI ou empresa**, pago pela organização
   direto, sem a plataforma mover dinheiro).
2. **No tráfego pago, o produto principal é o modelo B**: a promotora é a
   anunciante e **paga a mídia direto à rede**; a plataforma só gerencia e cobra
   uma **taxa de gestão sobre o gasto lido**, debitada de um **saldo de taxa**.
   O modelo A (a plataforma paga a rede em nome próprio) está **suspenso**.
3. **Consequência:** caem as perguntas sobre crédito de PIS/COFINS na compra de
   mídia, "revenda", imposto da rede embutido (os 12,15%), ISS sobre a mídia e
   taxa antecipada. **Se o modelo A voltar, reabrimos.** A SC Cosit 8/2024, o PN
   5/2018 e os acórdãos do CARF **não precisam mais de anexo agora**.
4. O regime é **Lucro Real** (já informado).

## O que o advogado já decidiu e vale para você (10/10/2026)

(`docs/TERMO-DE-ENCERRAMENTO-ADVOGADO.md`; você não precisa reabrir nada disto.)

1. **Modelo B é o produto de tráfego**; o modelo A fica suspenso.
2. **Saldo pré-pago:** o parecer de direito bancário é necessário. Até lá:
   reembolso em dinheiro desligado, sem saque nem transferência, tráfego pago
   desligado e saldo em conta segregada. A **segregação é mitigação, não
   solução**: o enquadramento como conta de pagamento é pergunta do parecer
   bancário, **não sua**.
3. **O saldo não volta em dinheiro** (só estorno ao mesmo pagador, a pedido); a
   sobra volta como **crédito**, com validade de 12 meses e aviso de 30 dias.
4. **Comissão guardada:** o documento fiscal espelho **não é NFS-e pelo valor
   bruto** (viraria receita com ISS); é **documento interno de controle**. A
   **forma** é sua (C5, item c).
5. **Acordo com cachê** só com **MEI ou empresa**, pago pela organização; PF
   fica fora da plataforma. A plataforma não cobra nada pelo registro.
6. **Guarda:** 6 meses (registros de acesso), 12 meses (log interno) e **5 anos**
   (contábil e fiscal).

## Regras de encerramento

1. **Uma resposta única**, em 5 dias úteis, em tabela:
   `Item | De acordo / Altera para… | Norma ou ato e artigo`.
2. Cada item tem **Padrão**. "De acordo" basta.
3. **Sem fonte oficial** = **regra de trabalho** com uma linha sua sobre o
   risco, revisada quando a lei ou a prefeitura mudar. Não reabrimos.
4. **Sem resposta no prazo:** vale o Padrão, como **decisão do dono sem parecer
   do contador**, e o registro diz isso.
5. **Termo de encerramento** ao fim, com as decisões e os riscos residuais.

---

## PARTE 0 — O que só o dono responde (você precisa disto para responder)

| # | Pergunta | Quem |
|---|---|---|
| V1 | Município da sede da plataforma | dono |
| V2 | Item de serviço (você escolhe, ver C2) | contador |

## PARTE 1 — Seis decisões que precisam do seu parecer

### C1. Como a taxa de gestão do modelo B é reconhecida

**Contexto.** A organização abastece um **saldo de taxa** por Pix para a conta
da plataforma. Conforme o gasto lido na API da rede, o sistema **debita a taxa**
(percentual sobre o gasto **sem imposto**). Não há taxa antecipada. O saldo
não usado volta como **crédito**, e o crédito vencido (12 meses) é baixado.

**Perguntas**
- a) A **receita é a taxa debitada no mês do gasto lido** (competência), e não
  o abastecimento do saldo? O abastecimento é **adiantamento de cliente**
  (passivo)?
- b) O **crédito vencido** baixado vira receita tributável no mês da baixa?
- c) A **NFS-e** sai **uma por organização e mês**, sobre as taxas debitadas?

**Padrão:** (a) sim, (b) sim, (c) sim.

### C2. Item de serviço e local do ISS

**Contexto.** Para a taxa de gestão há três candidatos na lista da LC 116:
**10.08** (agenciamento de publicidade e propaganda, inclusive de veiculação),
**17.06** (propaganda e publicidade, planejamento de campanhas) e **17.25**
(inserção de material publicitário, LC 157/2016). A resposta anterior sobre
"10.08 corretagem" foi corrigida: o 10.08 é agenciamento de publicidade.

**Perguntas**
- a) Qual item é o da taxa de gestão de tráfego pago no modelo B?
- b) Onde o ISS é devido (município da sede ou do tomador) para esse item?
- c) O **CNAE** da sede precisa incluir **73.11-4-00** (agências de
  publicidade) além do **63.11-9/00** (taxa por venda)? Confira no cartão do
  CNPJ e na inscrição municipal.

**Padrão:** (a) o que você indicar; sem indicação, **10.08**. (c) incluir o
73.11-4-00.

### C3. Retenções na fonte quando a organização paga a taxa

**Pergunta.** Quando a organização (pessoa jurídica) paga a taxa de gestão, ela
retém **IRRF, CSRF (PIS/COFINS/CSLL) ou ISS**? Em que casos e percentuais? Como a
NFS-e deve destacá-los?

**Padrão:** a plataforma destaca na NFS-e o que você indicar; o sistema só
registra o líquido e o retido, sem calcular.

### C4. Preço da taxa por cenário (a pergunta que nunca foi respondida)

**Contexto.** A taxa de fábrica é **20%** do gasto. No modelo B não há imposto da
rede embutido, então a base é o gasto líquido.

**Pergunta.** Para um gasto de **R$ 1.000**, com taxa de 10%, 15%, 20% e 25%,
quanto sobra depois de **ISS (alíquota do município da sede), PIS/COFINS no
Lucro Real e IRPJ/CSLL**? Qual é a **taxa mínima** para que o serviço cubra o
custo da plataforma? (O dono informa o custo e a margem desejada.)

**Padrão:** manter **20%** até a simulação.

### C5. Influenciadores: comissão e cachê

**Contexto.** (1) A **comissão** do afiliado é paga sobre venda paga; o saque é
**só para MEI ou empresa**, com nota do bruto e retenção de **1,5% de IRRF** no
Lucro Presumido ou Real (já respondido). (2) O **cachê** é pago pela
**organização** direto ao influenciador (**só MEI ou empresa**); a plataforma
registra o acordo e **não cobra nada por ele**.

**Perguntas**
- a) A **plataforma tem algum tributo** sobre o registro do acordo (não cobra
  nada, não move o dinheiro)? **Padrão: não.**
- b) Quando a organização paga o cachê a MEI ou PJ, **quais retenções ela faz**?
  O sistema só avisa, não calcula.
- c) **Comissão guardada pela plataforma:** o advogado decidiu que o espelho é
  **documento interno de controle, sem natureza de NFS-e** (valor recebido da
  promotora, valor repassado ao afiliado, IRRF retido e segregação contábil). Qual
  é a **forma** (recibo, extrato ou nota de débito/crédito) e ela precisa de
  algum requisito fiscal? **Padrão:** o **demonstrativo mensal de repasse** à
  promotora, sem valor fiscal; a nota do afiliado é contra quem paga.

### C6. Saldos e créditos (patrocínio, banner, assistente de IA)

**Contexto.** Esses saldos existem hoje e são abastecidos por Pix. A receita nasce
no **consumo**: patrocínio por clique, banner por dia, assistente por mensagem.
O advogado exige o parecer bancário e mantém as medidas provisórias (sem saque,
conta segregada).

**Perguntas**
- a) O abastecimento é **adiantamento de cliente** e a **NFS-e sai no consumo**
  (mensal), não na recarga?
- b) Qual a **conta contábil** do saldo e a do **presente** (crédito devido à
  promotora, repassado no acerto) e da **comissão guardada** ("valores de
  terceiros")?
- c) A **Tesouraria** (painel do administrador, só leitura) precisa de qual
  **plano de contas** e quais linhas do **fechamento mensal**? Você manda o plano?

**Padrão:** (a) sim; (b) e (c): você entrega o plano de contas e o sistema
espelha.

---

## PARTE 2 — Propostas para aprovar ou alterar

- **P1. Modelo A suspenso:** o parecer registra a posição fiscal já dada
  (conta própria × conta alheia; PN 5/2018; SC 8/2024) **como histórico** e só
  se reabre se o modelo A voltar.
- **P2. Extrato mensal para você** (por organização e mês, CSV pt-BR, com a taxa
  debitada, o gasto lido, o abastecimento, o crédito baixado, a competência e o
  CNPJ da organização). Número da NFS-e e retenções lançados à mão. **De acordo?**
- **P3. Tabela de municípios:** você a compila (alíquota e fonte); o sistema
  deixa marcar o município **por organização**, validado contra a tabela.
- **P4. Guarda de 5 anos** das faturas, extratos e comprovantes.
- **P5. Contas bancárias separadas** para o saldo de terceiros e para a receita
  (também exigência do advogado).

## PARTE 3 — O que o dono entrega a você

Município da sede (V1), o **custo** e a **margem desejada** (C4) e a **razão
social e CNPJ** (para a NFS-e).

## Resumo

6 decisões (C1 a C6), 5 propostas (P1 a P5). Tudo o que era do modelo A fica
**suspenso e registrado**; o histórico de `docs/CONSULTA-CONTADOR-E-ADVOGADO.md`
continua valendo se ele voltar.

---

## Respostas do contador (10/10/2026) e conferência

Ele respondeu C1 a C6 e P1 a P5 na tabela pedida. A conferência usou buscas
(fontes secundárias; os sites oficiais não abrem do nosso ambiente).

| Item | Posição | Situação |
|---|---|---|
| C1a, C1b, C1c | De acordo: receita da taxa na competência do gasto lido; abastecimento é adiantamento de cliente; crédito vencido baixado vira receita; uma NFS-e por organização e mês | **Fechado.** O art. 223, § 2º da IN RFB 1.700/2017 que ele cita **não conferi** (a IN existe; o conteúdo do artigo não apareceu) e a "aplicação analógica" da C1b é frágil: regra de trabalho |
| C2a | **10.08** (agenciamento de publicidade e propaganda) | **Fechado** (é o Padrão). A SF/DEJUG nº 2/2024 existe e trata da **base de cálculo** do ISS nos itens 10.08 e 17.06 **em São Paulo**; não escolhe entre 10.08 e 17.25 e só serve se a sede for São Paulo |
| C2b | ISS no município do estabelecimento prestador (LC 116, art. 3º, caput) | **Fechado** (Padrão). Regra municipal de retenção fica por conta do V1 |
| C2c | Incluir o CNAE 73.11-4/00 | **Fechado** |
| C3 | Destacar ISS, **IRRF 1,5% "art. 647, I, do RIR/2018"** e **CSRF 4,65%** "(IN RFB 1.234/2012; Lei 9.430/1996)" | **Reabrir (um ponto só).** O art. 647 é a numeração do **RIR/99**; as buscas indicam o **RIR/2018, art. 718, II** para o 1,5% em propaganda e publicidade. A **IN RFB 1.234/2012 regula pagamentos de órgãos públicos**, não de organizações privadas. E as buscas indicam que a **CSRF (PIS/COFINS/CSLL) não se aplica a "propaganda e publicidade"** (não consta do art. 30 da Lei 10.833/2003), podendo se aplicar a "assessoria mercadológica". Falta ele dizer qual norma vale e **em qual categoria a gestão de tráfego se enquadra** |
| C4 | Mantém 20%; simulação "no parecer"; ISS de 5% "consome 25% da taxa" | **Reabrir (conta errada).** O ISS incide sobre a **taxa** (a mídia não passa pela plataforma): 5% de R$ 200 são **R$ 10, isto é, 5% da taxa**, não 25%. Os 25% saem de aplicar 5% ao gasto. IRPJ/CSLL de 34% é sobre o **lucro** (o adicional de 10% só acima do limite), não sobre a receita. A simulação depende de V1 e do custo e margem do dono |
| C5a | Não há tributo sobre o registro do acordo | **Fechado** |
| C5b | A organização retém ISS se o município exigir; MEI dispensado; empresa no Lucro Presumido ou Real sofre IRRF 1,5% e CSRF 4,65% (IN RFB 1.234/2012, art. 4º, I) | **Reabrir junto com a C3.** Mesma norma citada fora do alcance (órgãos públicos) e mesma dúvida sobre a CSRF. O MEI sem retenção é plausível, mas o fundamento está errado |
| C5c | Demonstrativo mensal de repasse à promotora, sem valor fiscal | **Fechado** (é o Padrão) |
| C6a | Adiantamento de cliente; NFS-e no consumo, mensal | **Fechado** |
| C6b | Contas 2.1.5.01 (Adiantamento de Clientes), 2.1.5.02 (Valores a Repassar a Promotora) e 2.1.9.01 (Valores de Terceiros – Comissões Guardadas) | **Fechado** como proposta dele; o plano de contas é dele (NBC TG 26) |
| C6c | Entrega o plano de contas e as linhas do fechamento | **Fechado** (entrega dele) |
| P1 a P5 | De acordo em todas | **Fechado** |

**Ele aponta como risco sem fonte oficial:** o local do ISS (C2b), as retenções
do MEI (C5b) e as contas contábeis (C6b). Registrado.

### Conta de referência da C4 (aritmética, não é parecer)

Gasto lido de **R$ 1.000**; só a **taxa** é receita da plataforma. ISS entre 2%
e 5% (faixa da lei, a alíquota real depende do município da sede) e PIS/COFINS
de 9,25% **sem descontar créditos** (o teto). Sobra antes de custos,
IRPJ e CSLL:

| Taxa | Receita da taxa | ISS a 2% | ISS a 5% | PIS/COFINS 9,25% | Sobra (ISS 2%) | Sobra (ISS 5%) |
|---|---|---|---|---|---|---|
| 10% | R$ 100,00 | R$ 2,00 | R$ 5,00 | R$ 9,25 | R$ 88,75 | R$ 85,75 |
| 15% | R$ 150,00 | R$ 3,00 | R$ 7,50 | R$ 13,88 | R$ 133,12 | R$ 128,62 |
| 20% | R$ 200,00 | R$ 4,00 | R$ 10,00 | R$ 18,50 | R$ 177,50 | R$ 171,50 |
| 25% | R$ 250,00 | R$ 5,00 | R$ 12,50 | R$ 23,13 | R$ 221,87 | R$ 214,37 |

O que sobra ainda paga o custo da plataforma e o IRPJ/CSLL sobre o lucro. A
taxa mínima só sai com o **custo** que o dono informar.

### O que fica com ele (fim do ciclo)
1. **Retenções (C3 e C5b), uma entrega só:** a norma certa (RIR/2018, art. 718,
   II, para o IRRF; Lei 10.833/2003, art. 30, para a CSRF) e **em qual categoria
   a gestão de tráfego se enquadra** (propaganda e publicidade, ou assessoria
   mercadológica). Prazo: 5 dias úteis. **Padrão se não vier:** o sistema **não
   calcula nem destaca retenção**; só avisa a organização que pode haver, e o
   contador lança as retenções à mão na NFS-e.
2. **Simulação da C4 no parecer**, depois do município da sede e do custo e
   margem do dono. **Padrão:** taxa de 20%.
3. **Plano de contas e linhas do fechamento (C6c)** e a **tabela de municípios
   (P3)**, como entregas dele.

### Termo de encerramento (contador): riscos residuais
| Item | Risco | Como a plataforma se comporta |
|---|---|---|
| IN RFB 1.700/2017, art. 223, § 2º | Fundamento não conferido | Competência do gasto lido; adiantamento no passivo |
| Retenções na fonte | Norma e categoria a confirmar | O sistema não calcula retenção |
| Local do ISS | Pode haver regra municipal | Sede; marcação por organização |
| Contas contábeis | Proposta dele | Plano de contas dele |
| Modelo A | Suspenso | Histórico; reabre se voltar |

**Dependências do dono para o parecer conjunto:** município da sede (V1), custo
e margem desejada, razão social e CNPJ. Sem elas o parecer não sai.

---

## Segundo retorno do contador (10/10/2026): fim da parte dele

Ele aceitou as correções e entregou a posição final.

| Item | Posição final | Situação |
|---|---|---|
| C3 e C5b | **IRRF de 1,5%** (RIR/2018, art. 718, II) quando o tomador for pessoa jurídica; **CSRF (4,65%) não se aplica** à taxa de gestão, porque propaganda e publicidade não constam do art. 30 da Lei 10.833/2003 e a gestão de tráfego é atividade-fim de publicidade, não "assessoria mercadológica"; **ISS retido** só se o município do tomador exigir. A IN RFB 1.234/2012 era das compras públicas e saiu | **Fechado.** É posição profissional dele, não texto de norma; a fronteira com "assessoria mercadológica" fica como **risco residual**. Uma fonte divergente das buscas diz que a IN 1.234/2012 teria substituído os arts. 714 e 718 do RIR/2018; não resolvido |
| C4 | Aceita a correção: o ISS incide só sobre a taxa (5% de R$ 200 = R$ 10). A tabela de referência fica. Simulação completa depois de município, custo e margem | **Fechado** no que depende dele; a simulação espera o dono |
| Padrão | O sistema não calcula nem destaca retenção; só avisa. O contador lança as retenções à mão na NFS-e | **Vale.** O sistema não emite NFS-e |

**Observação:** ele explicou o erro da C4 como "ISS sobre R$ 1.200"; o que dava
25% era o ISS sobre o gasto de R$ 1.000. É detalhe: a correção, que o ISS é só
sobre a taxa, é a que vale.

### Encerramento da parte do contador
- **Fechado:** C1, C2, C3, C4 (no que é dele), C5, C6 e P1 a P5.
- **Entregas dele, sem nova pergunta:** a simulação completa no parecer
  (depende de V1, custo e margem), o plano de contas e as linhas do fechamento
  (C6c) e a tabela de municípios (P3).
- **Riscos residuais:** os da seção anterior, mais o enquadramento da gestão de
  tráfego fora de "assessoria mercadológica" e a vigência dos arts. 714 e 718 do
  RIR/2018.
- **O que trava o parecer conjunto:** município da sede (V1), custo, margem
  desejada, razão social e CNPJ. **Tudo isso é do dono.**

---

## Terceiro retorno do contador (10/10/2026): o anexo do modelo B

Ele leu o desenho do anexo (`docs/PEDIDO-ANEXO-MODELO-B.md`) e respondeu só no que é dele.

| Item | Posição | Situação |
|---|---|---|
| Os 8 pontos do modelo B | Confirmados como descrição da operação. Os que sustentam o enquadramento: a promotora é titular da conta e paga a rede direto; acesso de parceiro, sem login e senha; taxa debitada de saldo sobre o gasto lido (receita só da taxa, item 10.08; o abastecimento é adiantamento de cliente, passivo). Pede que a **pausa aos 90%** conste do contrato | **Fechado.** A pausa aos 90% já é a cláusula 7 do pedido |
| Crédito vence em 12 meses | De acordo; a baixa do crédito vencido é receita no mês da baixa (C1b) | **Fechado** (já estava fechado) |
| Limitação à taxa dos 12 meses | Sem impacto tributário; devolução de taxa por decisão judicial reduz a base de ISS, PIS e COFINS do mês da devolução | **Fechado.** Registro do efeito fiscal |
| Foro e as outras 12 cláusulas | Não são dele; remete ao advogado | Vão ao advogado |
| Nome "agência de publicidade" | **Evitar.** Usar "plataforma de gestão de tráfego pago". CNAE 63.11-9/00 como principal e 73.11-4/00 como secundário (C2c, já fechado) | **Fechado** quanto ao nome. Ver a observação abaixo |
| Aceites independentes (anexo e taxa) | De acordo; cada pedido tem o fato gerador na competência do gasto lido (C1a) | **Fechado** pelo lado fiscal; o jurídico é do advogado |
| Relação empresarial, não de consumo | De acordo, remete ao advogado a redação e o fundamento | Vai ao advogado |
| Campos `{{RAZAO_SOCIAL}}`, `{{CNPJ}}`… no anexo | De acordo | **Fechado** |

### Observações minhas (para não virarem erro no anexo)

1. **O fundamento fiscal do nome não está limpo.** Ele diz que "agência de
   publicidade" puxa para o item 17.06; mas o texto do item 10.08, que ele mesmo
   adota, é "agenciamento de publicidade e propaganda". A conclusão (não usar
   "agência" no anexo) é a mesma do pedido ao advogado, então **não muda nada no
   documento**; a razão é para o contador e o advogado conciliarem no parecer.
   Ele mesmo sugere "prestadora de serviços de agenciamento de publicidade"
   como alternativa: **o anexo usa "plataforma de gestão de tráfego pago"**, o
   nome que não tem a palavra "agência".
2. **A citação do CDC.** Ele cita o art. 3º, § 2º, que define "serviço". O que
   afasta a promotora da definição de consumidora é o **art. 2º** (destinatário
   final), com a ressalva do **art. 29** (equiparação). Não é minha alçada
   decidir; fica anotado para o advogado.
3. **"Município da sede" já foi respondido**: **São Paulo** (V1, 10/10/2026).
   Ele ainda o lista como pendente, então precisa receber a resposta.
4. **A razão social e o CNPJ ainda travam o parecer, segundo ele**, para o
   cabeçalho e o plano de contas. O dono decidiu defini-los **depois do
   lançamento**. Isso é uma decisão do dono (ver `docs/FECHAMENTO-JURIDICO-CONTABIL.md`).
5. **A confiança** de que 63.11-9/00 "já existe" na sede não foi conferida por
   mim: depende do cartão CNPJ, que ainda não existe.

### O que trava o parecer conjunto agora
- **Resolvido:** município (V1 = São Paulo).
- **Do dono:** custo mensal, volume e margem desejada (itens A, C e D do pedido
  anterior), e a decisão sobre razão social e CNPJ.
