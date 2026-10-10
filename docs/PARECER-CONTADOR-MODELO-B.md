# Parecer técnico contábil e tributário: modelo B (rascunho do contador, 10/10/2026)

**Situação: rascunho recebido, sem data, sem assinatura (`{{DATA}}`, `{{CRC}}`) e
sem os anexos que ele cita.** Não é ainda o parecer conjunto: falta a parte do
advogado e as pendências da seção 3. O texto abaixo resume o que o contador
escreveu; a revisão feita aqui (seção 2) não altera o texto dele.

Empresa `{{RAZAO_SOCIAL}}`, CNPJ `{{CNPJ}}`, sede São Paulo/SP, Lucro Real,
plataforma de gestão de tráfego pago (modelo B), item 10.08 da LC 116/2003,
CNAE 73.11-4/00 "a incluir" (principal ou secundário: em aberto).

## 1. O que o contador adotou

| Ponto | Posição |
|---|---|
| Receita | Só a taxa de gestão (sobre o gasto lido). A mídia não passa pela plataforma: sem ISS, PIS/COFINS, IRPJ ou CSLL sobre ela, sem crédito de PIS/COFINS, sem custo de mídia, sem nota sobre ela |
| Item de serviço | **10.08** (agenciamento de publicidade e propaganda). Não é 17.06 nem 17.25 |
| ISS | Devido em São Paulo, **5%** (Lei 13.701/2003), só sobre a taxa. O sistema não calcula nem emite NFS-e; o contador lança à mão |
| Competência | Abastecimento = adiantamento de cliente (passivo). Gasto lido = receita da taxa no mês. Crédito vencido (12 meses) = receita tributável no mês da baixa. **Uma NFS-e por organização e mês**. Fundamento citado: art. 223, § 2º, da IN RFB 1.700/2017 |
| IRRF | 1,5% sobre a taxa quando o tomador é PJ (art. 718, II, do RIR/2018) |
| CSRF (4,65%) | **Não se aplica**: propaganda e publicidade não constam do art. 30 da Lei 10.833/2003 e "assessoria mercadológica" não alcança a gestão de tráfego |
| ISS retido | Depende do município do tomador; São Paulo ainda a confirmar (Lei 14.042/2005 e CPOM) |
| Operação do sistema | Não calcula retenção, não emite NFS-e, só avisa a organização. O contador lança |
| Preço | Tabela de teto (abaixo) e **cláusula de revisão após 90 dias** com os custos reais; 20% é o parâmetro inicial |
| Saldos | 2.1.5.01 Adiantamento de Clientes (saldo de taxa); 2.1.5.02 Valores a Repassar à Promotora (crédito do presente); 2.1.9.01 Valores de Terceiros (comissão guardada). Fundamento: NBC TG 26 |
| Comissão guardada | **Demonstrativo mensal de repasse**, sem valor fiscal e sem NFS-e. Leva CNPJ da promotora, período, comissões, base e valor |
| Influenciadores | O registro do acordo não é fato gerador; o cachê é pago pela organização a MEI ou empresa; a plataforma não movimenta o valor |
| Guarda | 6 meses (acesso), 12 meses (log), 5 anos (contábil e fiscal, CTN arts. 173 e 174) |
| Extrato mensal | CSV pt-BR por organização e mês: taxa debitada, gasto lido, abastecimento, crédito baixado, competência, CNPJ |
| Município | O sistema marca o município por organização, validado contra uma tabela que o contador compila |
| Banco | Contas separadas: saldo de terceiros e receita da plataforma |
| Modelo A | Suspenso, só como histórico, com os riscos que ele lista (PN Cosit 5/2018, SC Cosit 8/2024, SC Cosit 32/2021, SC 6.006/2019, acórdão 012/25 de Recife) |

### Simulação de teto (gasto de R$ 1.000, PIS/COFINS 9,25% sem créditos)

| Taxa | Receita | Sobra com ISS 2% | Sobra com ISS 5% |
|---|---|---|---|
| 10% | R$ 100 | R$ 88,75 | R$ 85,75 |
| 15% | R$ 150 | R$ 133,12 | R$ 128,62 |
| 20% | R$ 200 | R$ 177,50 | R$ 171,50 |
| 25% | R$ 250 | R$ 221,87 | R$ 214,37 |

Conferi as contas de cada linha: batem (arredondadas para baixo). Para o item 10.08 em
São Paulo vale a coluna de **5%**. A sobra ainda paga o custo e o IRPJ/CSLL.
**Custo, volume e margem só serão apurados com a plataforma ativa** (decisão do
dono): o parecer fica com a cláusula de revisão de 90 dias.

## 2. Revisão (o que conferi e o que fica de pé)

1. **CSRF é o ponto mais frágil.** O parecer diz que propaganda e publicidade
   não estão no art. 30. Fontes de contabilidade (UNICENTRO e NetCPA) dizem o
   mesmo, mas uma tabela de retenções lista "propaganda e publicidade" com 1,5% de
   IR **e** as contribuições, citando o art. 718. Não achei o texto oficial. Fica
   **risco residual**: a decisão de não reter pode ser contestada, e o parecer
   não o registra. Peço que entre na seção 15.
2. **IRRF: o risco que ele mesmo registrou antes sumiu.** No segundo retorno havia
   uma fonte divergente dizendo que a IN RFB 1.234/2012 teria substituído os
   arts. 714 e 718 do RIR/2018. O parecer não a menciona.
3. **Quando se retém o IRRF no modelo B?** A promotora paga a taxa por Pix **no
   abastecimento** (adiantamento), e a NFS-e sai depois, no consumo. A retenção
   acontece no pagamento ou crédito; num Pix pago por inteiro não há o que reter.
   O parecer não diz quem recolhe nem quando. É pergunta para o contador.
4. **Art. 223, § 2º, da IN RFB 1.700/2017**: citado como "fundamento" sem
   ressalva. Não consegui ler o artigo. No segundo retorno eu já o tinha como não
   conferido e a "aplicação analógica" da baixa do crédito como frágil.
5. **Anexos 5 a 9** (textos de SC, PN, acórdão, legislação de São Paulo): estão
   listados, mas **não foram entregues**. As referências da seção 15 (PN Cosit
   5/2018, SC Cosit 8/2024, SC Cosit 32/2021, SC 6.006/2019, acórdão 012/25 de
   Recife) **não foram conferidas** por mim; ficam como citações dele.
6. **IRPJ/CSLL "34% sobre o lucro"**: é a soma da alíquota máxima; o adicional de
   10% só incide sobre o lucro acima do limite mensal. Na simulação isso só
   importa depois do custo, que ainda não existe.
7. **A tabela de ISS tem 2% e 5%.** Para São Paulo vale 5%. A coluna de 2% serve
   só de referência.
8. **O sistema marca o município por organização (seção 12) e gera o extrato
   (seção 11)** são **pedidos de código novos**, não decididos. Entram no PR de
   adequação só com o seu aval (seção 4).
9. **Contas bancárias separadas** dependem do parecer de direito bancário e do
   provedor de Pix (a plataforma hoje recebe por Asaas e Mercado Pago). Não é
   código.

## 3. Pendências (consolidadas)

| Pendência | De quem | Situação |
|---|---|---|
| Fonte certa da retenção do ISS em São Paulo | Contador | Lei 14.042/2005 e CPOM citados, texto não lido |
| CNAE (principal ou secundário) | Contador e advogado | As recomendações dele se contradizem |
| Registrar o risco do CSRF e da IN 1.234/2012 | Contador | Não consta do parecer |
| Quando e como se retém o IRRF no pagamento do abastecimento | Contador | Não respondido |
| Anexos 5 a 9, plano de contas final, tabela de municípios, assinatura e data | Contador | Não entregues |
| Aceitar a cláusula de revisão de 90 dias | Dono | Aguarda |
| Razão social e CNPJ | Dono | Depois do lançamento |
| Custo, volume e margem | Dono | Depois de 90 dias de operação |
| Pedido do anexo ao advogado (data) | Dono | Aguarda |
| Domínio | Dono | Até 12/10/2026 |

## 4. Pedidos de código que saem do parecer (a decidir pelo dono)

1. **Extrato mensal em CSV** por organização e mês (taxa debitada, gasto lido,
   abastecimento, crédito baixado, competência, CNPJ), pela regra das
   exportações (`neutralizarFormula`, auditoria antes do download, sem `OFFSET`).
2. **Município por organização** com tabela de alíquota e fonte (marcador, sem
   calcular imposto).
3. **Demonstrativo mensal de repasse da comissão guardada** à promotora.
4. **Tesouraria** de leitura (`docs/PLANO-FINANCEIRO.md`): as contas da seção 1.

Nenhum entra antes de o modelo B existir e do aval do dono.
