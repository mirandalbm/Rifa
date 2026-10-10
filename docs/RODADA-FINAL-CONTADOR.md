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
- c) **Comissão guardada pela plataforma:** que **documento fiscal espelho**
  (cláusula 10 do termo do afiliado) é preciso, se for? **Padrão:** a plataforma
  emite um **demonstrativo mensal de repasse** à promotora (sem valor fiscal);
  a nota do afiliado é contra quem paga.

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
