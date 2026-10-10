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

## 5. Segunda versão do contador (10/10/2026)

Ele aceitou as seis objeções da seção 2 e devolveu a **parte contábil**
corrigida, ainda sem assinatura, sem data e sem CRC. O texto corrigido mantém
todo o resto da seção 1.

| Objeção | O que mudou | Situação |
|---|---|---|
| CSRF | A não retenção fica, **registrada como risco** (tabelas de mercado listam publicidade; texto oficial não localizado), com a divergência documentada | **Resolvido no texto.** Ver a observação 1 abaixo sobre "provisionar" |
| IRRF e a IN 1.234/2012 | O risco voltou ao parecer: a IN pode ter deslocado a base legal dos arts. 714 e 718; confirmar o texto oficial antes da primeira retenção | **Resolvido no texto**; a verificação continua com ele |
| Quando se retém o IRRF | Diz que o abastecimento é adiantamento (sem retenção) e que a retenção ocorre "no consumo", quando o tomador "paga pelo serviço"; registra a assimetria e a manda ao advogado | **Não resolvido.** Ver a observação 2 |
| Citações sem conferência | O art. 223 da IN 1.700/2017 fica marcado "não verificado"; as soluções de consulta, o PN e o acórdão ficam como "ementa lida, texto não conferido"; os anexos 5 a 9 só entram depois de lidos no texto oficial | **Resolvido no texto.** "Ementa lida" é declaração dele; eu não li nenhuma |
| Assinatura | É só a parte contábil; falta o advogado (com `{{OAB}}`) e as duas assinaturas | **Resolvido** |
| Pedidos de código | Saem do corpo e viram lista anexa, sem caráter vinculante | **Resolvido** |

### Observações minhas sobre a segunda versão

1. **"Provisionar o risco" do CSRF** pode estar no lugar errado. A retenção é
   obrigação do **tomador**, a promotora: se ela não retém, a multa e os juros
   são dela. A plataforma, como prestadora, paga os próprios PIS, COFINS e CSLL
   de qualquer jeito, e a retenção seria só antecipação. Peço ao contador que diga
   quem tem o risco e quem provisiona. Isso também define uma **cláusula do anexo
   do advogado**: as retenções na fonte são de responsabilidade do tomador, nos
   termos da lei, e a plataforma só informa o que entende aplicável
   (cláusula 10 do pedido, que ganha esta linha).
2. **A retenção do IRRF continua sem resposta prática.** Ele diz que retém "o
   tomador, no consumo". Mas no modelo B o tomador já pagou tudo no abastecimento;
   no consumo a plataforma só debita o saldo e não há pagamento a reter. Se a
   retenção ocorre ali, a promotora teria de recolher o DARF do bolso, tendo já
   pago o valor bruto. Se ocorre no abastecimento, a nota ainda não existe.
   Mandar isso ao advogado não resolve: **é matéria tributária**, e o contador
   deve dizer o momento do pagamento, quem recolhe e como a promotora recupera.
3. O "registro de decisões" que ele cita (C1 a C6 e P1 a P5) não é o da seção 8 do
   fechamento, que é o das decisões do dono e dos profissionais (V1 a V6, A e C).
   Não muda nada, só para não confundir.

### Pendências depois da segunda versão

| Pendência | De quem |
|---|---|
| Quem tem o risco do CSRF e quem provisiona | Contador |
| Momento, responsável e recuperação do IRRF no modelo pré-pago | Contador |
| Textos oficiais: IN 1.700 (art. 223), IN 1.234, SCs, PN, acórdão de Recife | Contador |
| Regra de retenção do ISS em São Paulo | Contador |
| CNAE (uma só recomendação) | Contador e advogado |
| Anexo do modelo B, com a cláusula das retenções (cláusula 10) | Advogado |
| Cláusula de revisão de 90 dias; domínio até 12/10/2026; data do pedido ao advogado | Dono |
| Parecer bancário (A13) | Dono |

## 6. Terceira versão do contador (10/10/2026): CSRF e IRRF

Ele respondeu às duas observações da seção 5 sem mandar nada ao advogado.

### CSRF: resolvido
- O risco é do **tomador** (a promotora): a obrigação de reter é dela, e multa e
  juros também.
- A plataforma **não provisiona** o CSRF. Paga os próprios PIS, COFINS e CSLL
  sobre a taxa de qualquer jeito, e uma retenção seria só antecipação.
- A defesa da plataforma é **documentar que informou** à promotora o que entende
  aplicável (IRRF de 1,5% e eventual ISS), e que reter é decisão dela. Isso é a
  cláusula 10 do pedido ao advogado.
- A linha "provisionar o risco do CSRF" **sai** do parecer.

### IRRF: o que ele respondeu
| Ponto | Resposta dele |
|---|---|
| Momento | No **consumo** (taxa debitada e NFS-e). O abastecimento é adiantamento e não sofre retenção (cita o "art. 720 do RIR/2018") |
| Quem retém e recolhe | A promotora, como fonte pagadora. A plataforma é a beneficiária e destaca na NFS-e |
| Recuperação | A plataforma usa o IRRF retido como **crédito contra o próprio IRPJ**. A promotora não "recupera": retém imposto da plataforma |
| Fluxo de caixa | Duas alternativas: (1) a plataforma debita **taxa + IRRF** (R$ 101,50 para uma taxa de R$ 100) e devolve R$ 1,50 à promotora para o DARF; (2) a plataforma debita só a taxa e a promotora paga o DARF do próprio caixa. Diz que é decisão contratual e **pede ao dono que escolha** |

### Observações minhas (o que não fecha)
1. **A aritmética das duas alternativas não é uma retenção.** Retenção é
   descontada de quem **recebe**. Para uma taxa de R$ 100 e IRRF de R$ 1,50, o
   desenho da lei é: a promotora paga R$ 98,50 à plataforma e R$ 1,50 ao fisco
   (R$ 100 no total). Na alternativa 1 a plataforma fica com os R$ 100 inteiros e
   a promotora desembolsa R$ 101,50. Na alternativa 2 acontece o mesmo: a
   plataforma recebe os R$ 100 e a promotora paga mais R$ 1,50 do bolso. Nos dois
   casos a promotora paga **1,5% a mais que a taxa combinada**, e a plataforma
   ainda leva o crédito de R$ 1,50 no IRPJ. Isso é um *gross-up* (a taxa
   passa a ser líquida de imposto) e não uma retenção. Pode ser uma escolha de
   preço do dono, mas então tem de ser dita assim no contrato, com o valor
   da nota recalculado (para líquido de R$ 100, a nota seria de cerca de R$ 101,52).
2. **O momento está afirmado, não provado.** O art. 720 do RIR/2018 não
   foi conferido. A regra geral de IRRF sobre serviços é na data do pagamento
   ou crédito, e o Pix de abastecimento é pagamento. Se o fisco o tratar como
   pagamento antecipado do serviço, a retenção cairia no abastecimento, onde o
   sistema não tem nota nem como destacar. Fica como **risco residual**, junto
   com os da IN 1.234/2012.
3. **O sistema fica sem calcular nem mover a retenção**, como no Padrão do
   segundo retorno. A alternativa 1 exigiria que o sistema devolvesse R$ 1,50 à
   promotora: dinheiro saindo da plataforma, que o contrato do saldo e o
   parecer de direito bancário não previram. **Não decido isto**: a escolha de
   fluxo é do dono, mas só depois de o contador refazer a conta (observação 1).
4. Ele diz que os quatro bloqueios da Parte 2 "não dependem do contador neste
   momento". O parecer conjunto assinado depende: faltam a assinatura dele, os
   textos oficiais e as pendências da seção 5.

### O que muda no parecer
| Item | Antes | Agora |
|---|---|---|
| CSRF | Provisionar | Risco do tomador; a plataforma não provisiona |
| IRRF, momento | Remete ao advogado | Consumo (não provado) |
| IRRF, responsável | Não dito | Promotora |
| IRRF, recuperação | Não dito | Crédito da plataforma contra o IRPJ |
| IRRF, fluxo de caixa | Não dito | Duas alternativas com a conta errada (observação 1); pendente |

### Pendências depois da terceira versão
| Pendência | De quem |
|---|---|
| Refazer a conta da retenção (o que a promotora paga e o que a plataforma recebe) e dizer se a taxa é bruta ou líquida | Contador |
| Texto do art. 720 do RIR/2018 e a regra sobre adiantamento | Contador |
| Os textos oficiais das seções anteriores, a regra do ISS em São Paulo e uma só recomendação de CNAE | Contador |
| Escolha de fluxo de caixa e do preço (taxa bruta ou líquida) | Dono, depois da conta refeita |
