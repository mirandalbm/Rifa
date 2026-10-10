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

## 7. Quarta versão do contador (10/10/2026): o momento do IRRF vira risco

Ele aceitou as observações 2 e 4 da seção 6 e a nota da cláusula 10.

| Ponto | Posição |
|---|---|
| Momento do IRRF | **Deixa de ser afirmado.** Passa a risco: pode ser o abastecimento (pagamento) ou o consumo (crédito). Cita agora o art. 685 do RIR/2018 como regra geral de "pagamento ou crédito", **também não lido**. Retira a citação do art. 720 até ler |
| Responsável e recuperação | Não mudam: promotora retém; a plataforma usa o IRRF como crédito contra o IRPJ |
| Fluxo de caixa | Decisão contratual, **depois** de resolvido o momento |
| Cláusula 10 | De acordo: não fixa taxa bruta ou líquida; só diz que as retenções são do tomador e que a plataforma informa o que entende aplicável |
| Parte 2 | Reconhece que o parecer conjunto assinado depende dele |

### Entregas dele e prazo
| Entrega | Prazo |
|---|---|
| Leitura dos textos oficiais (IN 1.700/2017 art. 223; IN 1.234/2012; arts. 685 e 720 do RIR/2018; SCs 6.006/2019, 8/2024 e 32/2021; PN 5/2018; acórdão 012/25) | 5 dias úteis |
| Regra de retenção do ISS em São Paulo | 5 dias úteis |
| Uma recomendação única de CNAE, com fundamento (hoje há três hipóteses: 63.11-9/00, 73.11-4/00 e 73.19-0/99) | 5 dias úteis |
| Assinatura do parecer | Depois das três entregas |

Ele pede a confirmação do dono do prazo de 5 dias úteis.

### Observações minhas
1. **Ele não respondeu à observação 1 da seção 6** (a aritmética das duas
   alternativas, que faz a promotora pagar R$ 101,50 por uma taxa de R$ 100). Diz
   só que o fluxo é "decisão contratual depois do momento". A conta refeita
   **não está na lista de entregas** e precisa entrar: sem ela o dono não tem o
   que escolher, e o preço (taxa bruta ou líquida) é decisão do dono.
2. **Dois itens da tabela dele estão trocados.** Diz que o parecer bancário "é do
   advogado": é um parecer de **direito bancário**, de um escritório especializado
   que o dono contrata (D3). E diz que o "registro de decisões" tem as decisões
   C1 a C6 e P1 a P5 "do dono": são as perguntas dele; as decisões do dono são V1 a V6.
3. **O art. 685 do RIR/2018** entra como nova citação sem leitura. Fica na lista
   de textos oficiais a conferir.
4. **Contagem do prazo:** 12/10/2026 (segunda-feira) é feriado nacional
   (Nossa Senhora Aparecida). Confirmado hoje, os 5 dias úteis começam em
   13/10 e terminam em **19/10/2026**.

## 8. Quinta versão do contador (10/10/2026): as três entregas

Ele entregou a leitura dos textos oficiais, a regra do ISS em São Paulo e a
recomendação de CNAE, no mesmo dia, e diz que o parecer pode ser assinado pela
parte contábil. **Eu não li o texto oficial de nenhum dos itens abaixo** (os sites
oficiais não abriram nesta sessão); o que segue é a conferência possível por busca.

| Item | O que ele entregou | Situação |
|---|---|---|
| IN RFB 1.700/2017, art. 223, § 2º | Adiantamento é receita no mês do faturamento ou da conclusão do serviço | **Aceito como posição dele.** Não li o artigo. Falta ele dizer em que capítulo e regime ele está (a IN trata Lucro Presumido e Lucro Real em partes diferentes; a empresa é Lucro Real) |
| RIR/2018, art. 685 | Citado como a regra geral de IRRF "no pagamento ou crédito" | **Não sustenta a conclusão.** O próprio texto que ele cita é sobre rendimentos pagos a **residentes no exterior**, e a busca confirma que o art. 685 está no capítulo dos residentes no exterior. Para serviços entre empresas no país ele continua com o art. 718, II, que **também não foi lido** |
| RIR/2018, art. 720 | Retirado | **Aceito.** Mas ele diz que "não foi localizado" e, na mesma frase, que trata de adiantamentos do trabalho: sem texto, não se pode dizer o que o artigo cobre |
| IN RFB 1.234/2012 | Retirada: é de órgãos públicos | **Aceito**, igual ao segundo retorno. O risco da "fonte divergente" fica sem leitura |
| SC 6.006/2019, SC Cosit 8/2024, SC Cosit 32/2021, PN Cosit 5/2018 | "Texto confirmado": conta alheia (Simples), crédito na subcontratação, contra a tese, nega insumo na revenda | **Aceitos como histórico do modelo A**, que está suspenso, e como apoio por analogia no modelo B. Não li os textos. O acórdão 012/25 de Recife ficou fora da resposta |
| Momento do IRRF | Fica como risco (abastecimento ou consumo) | **Aceito** |
| ISS em São Paulo | Alíquota 5% e código 06394 (SC SF/DEJUG 7/2014); o CPOM tornou-se opcional com a Lei 17.719/2021; sem retenção quando prestador e tomador são de São Paulo | **Parcial.** A alíquota e o fim da obrigatoriedade do CPOM conferem por busca ([Contábeis](https://www.contabeis.com.br/artigos/7119/cadastro-no-cpom-deixa-de-ser-obrigatorio-em-sao-paulo/)). Mas o CPOM só alcança **prestadores de fora** de São Paulo, então não decide nada para uma plataforma sediada lá. A frase "sem retenção quando os dois são de São Paulo" **contradiz a resposta anterior dele** (retenção do tomador PJ quando o prestador não é do Simples) e não cita o dispositivo. E a maioria das promotoras será de **outros municípios**, onde vale a regra de cada um |
| CNAE | **73.11-4/00 como principal**; o 63.11-9/00 só como secundário se houver tecnologia | **Contradiz de novo** o terceiro retorno (63.11-9/00 principal, 73.11-4/00 nunca principal). Falta o critério que decide a atividade principal: **de onde virá a maior receita**. Hoje o produto de toda a plataforma é a taxa por venda de rifas (tecnologia) e o tráfego é uma linha nova |

### Observações minhas
1. **A conta do IRRF segue sem resposta.** A aritmética das duas alternativas
   (a promotora pagando R$ 101,50 por uma taxa de R$ 100) não foi refeita, e ele
   ainda pede ao dono que escolha. O dono não deve escolher nada antes disso.
2. **Retenção do ISS: a pendência não fechou.** Falta a regra de São Paulo para
   o **tomador paulistano** de um prestador paulistano (se existe, qual dispositivo)
   e uma resposta para a promotora de **fora** de São Paulo.
3. **O CNAE precisa do critério da receita.** O dono decide a atividade
   principal; o contador deve dizer o que cada escolha implica no cartão do CNPJ
   e na inscrição municipal. Há ainda uma pergunta para o advogado: o nome
   "Agências de publicidade" do código tem algum efeito regulatório, já que o
   anexo evita a palavra "agência"? (Não afirmo que tenha.)
4. **O que ele chama de "texto confirmado"** vale como declaração dele até os
   textos chegarem como anexo ao parecer (os anexos 5 a 9 continuam não entregues).

### Pendências depois da quinta versão
| Pendência | De quem |
|---|---|
| Refazer a conta do IRRF (taxa bruta ou líquida) | Contador |
| Dispositivo legal do art. 718, II, e leitura que sustente o momento do IRRF | Contador |
| Regra do ISS para tomador e prestador de São Paulo, e para tomador de outro município | Contador |
| CNAE com o critério da receita | Contador, depois o dono |
| Capítulo e regime do art. 223 da IN 1.700/2017 | Contador |
| Anexos 5 a 9, acórdão 012/25, assinatura | Contador |
| Efeito do nome do CNAE sobre o anexo | Advogado |
| Cláusula de revisão de 90 dias, anexo ao advogado (data), domínio, parecer bancário | Dono |

## 9. Pesquisa externa própria (10/10/2026, sem o contador)

**Limite:** o Planalto e o legjur não resolvem nesta sessão (erro de DNS). Tudo
abaixo vem de busca e de fontes secundárias. Nada aqui é "texto oficial lido".
Cada item tem um grau: **confirmado por mais de uma fonte**, **único**, ou
**contradito**.

| Ponto | O que a pesquisa encontrou | Grau | Efeito no parecer |
|---|---|---|---|
| **Taxa de 4,65% (CSRF)** | A alíquota de 4,65% (0,65% PIS + 3% COFINS + 1% CSLL) está no **art. 31** da Lei 10.833/2003, não no art. 30. O art. 30 define **quais** serviços entram: limpeza, conservação, manutenção, vigilância, transporte de valores, locação de mão de obra, assessoria creditícia e mercadológica, e serviços profissionais | Confirmado por mais de uma fonte | Corrigir a citação do parecer: "art. 31 (alíquota) e art. 30 (escopo)" |
| **Publicidade no CSRF** | Fontes de contabilidade dizem que publicidade e propaganda **não** estão no art. 30. Uma solução da Cosit de 2022 (nº 13) é citada como concluindo a mesma coisa; **não li o texto**. Uma solução de 2019 (nº 77) tem um trecho que **parece** dizer que publicidade do art. 718 sofre retenção de CSLL, mas trata de processamento de dados e não é conclusão | **Contraditório** | A não retenção de CSRF continua **risco**, não conclusão. Precisa do texto da SC 13/2022 |
| **IRRF de 1,5% em publicidade** | O art. 714 do RIR/2018 fixa 1,5% para serviços profissionais entre pessoas jurídicas. O art. 718 traz hipóteses: inciso I (representação comercial e mediação de negócios), **inciso II (publicidade e propaganda, com exclusão de valores repassados a veículos)** | Confirmado por mais de uma fonte (secundária) | **O 1,5% no modelo B tem base sólida.** Cabe citar o art. 718, II, com ressalva de que o texto não foi lido |
| **Art. 685 do RIR/2018** | Trata de rendimentos pagos a **residentes no exterior** | Confirmado | A citação que o contador usou para o momento do IRRF **não serve**; sai do parecer |
| **IN RFB 1.700/2017, art. 223, § 2º** | O artigo está na seção do **lucro presumido**, regime de caixa, e o § 2º (adiantamento vira receita no mês do faturamento ou da conclusão do serviço) aparece citado por fonte da Receita Federal dentro desse regime | Confirmado, **mas no regime errado para a empresa** | A empresa é **Lucro Real**. O fundamento do adiamento de receita tem de ser a regra de competência (CPC 47 / NBC TG 47 e o RIR de Lucro Real). O parecer deve trocar a citação |
| **Momento do IRRF** | Sem fonte que decida. A regra geral é pagamento ou crédito, e o Pix de abastecimento é pagamento | Aberto | Continua **risco** |
| **ISS 5% em São Paulo (10.08)** | Alíquota de 5% e código 06394 confirmados por solução de consulta de 2014 | Confirmado | Mantém |
| **Retenção de ISS pelo tomador de São Paulo** | O regulamento antigo previa retenção quando o prestador era **de outro município** e não estava no cadastro; o cadastro CPOM foi tornado facultativo ou revogado para serviços tomados a partir de 27/11/2021. Uma fonte diz que a retenção depende de o serviço ser prestado em São Paulo. **As fontes conflitam** | Contraditório | Para a plataforma sediada em São Paulo, a retenção **não tem como se aplicar** pelo regime antigo (exige prestador de fora). Para a promotora **de fora**, vale a regra do município dela, que não está pesquisada |
| **CNAE 73.11-4/00** | A descrição inclui "colocação, em nome de clientes, de material publicitário ... na internet". Mas a operação de **páginas de publicidade na internet** é excluída (vai para 63.19-4/00). A "gestão de tráfego pago" **não consta** da descrição oficial. Uma lista de terceiros cita "gestão de publicidade em diversos canais" | Parcial | A 73.11-4/00 é a melhor candidata, mas **não há descrição oficial de tráfego pago**. Confirmar no CONCLA antes de fixar |
| **MEI** | Atividade de 73.11-4/00 não é permitida ao MEI | Único | A empresa precisa ser ME ou maior, o que já é o caso |

### O que muda no parecer por causa da pesquisa
1. **Art. 223 da IN 1.700 deve sair**, ou ser trocado pela regra de competência do Lucro Real. Não é "confirmado" para a empresa.
2. **Art. 685 sai** da explicação do IRRF.
3. **O IRRF de 1,5% (art. 718, II) passa a ter base**, com ressalva de texto não lido.
4. **O CSRF continua em risco.** A SC 13/2022 é a leitura que decide. Pedir o texto ao contador é o único caminho sem Planalto.
5. **A retenção de ISS de São Paulo** não se aplica à plataforma paulistana pelo regime antigo, e a regra de promotoras de outros municípios precisa de pesquisa à parte (não é da plataforma).
6. **CNAE:** fixar 73.11-4/00 como principal **só depois** de confirmar no CONCLA que tráfego pago cabe ali, ou o dono aceita o risco da classificação.

### O que não precisa mais de ida e volta com o contador
- IN 1.234/2012, art. 720, IRRF "no consumo": já resolvidos (saem ou viram risco).
- Alíquota de 5% do ISS: confirmada.
- Pergunta sobre o fluxo do IRRF (taxa bruta ou líquida): é do dono, depois de refeita a conta.

### O que ainda depende de terceiros (com a pesquisa esgotada)
- Texto da SC Cosit 13/2022 (CSRF e publicidade).
- Descrição oficial do CNAE para tráfego pago (CONCLA).
- Regra de ISS para promotora de outro município.
- Texto oficial do art. 718 e do art. 714 do RIR/2018 (Planalto fora do ar).

## 10. Recomendação do contador (10/10/2026) e revisão

O contador recomendou: IRRF na forma **bruta**; CSRF não retido, com risco
registrado; CNAE 73.11-4/00 como principal, com risco aceito; ISS de São Paulo
sem retenção, e ISS de promotora de outro município conforme a lei local dela.

### Onde a recomendação fecha
- **CSRF não retido, com risco:** de acordo com a seção 9. Continua risco até a
  SC Cosit 13/2022 ser lida.
- **ISS de promotora de outro município:** a plataforma destaca o ISS de São Paulo
  e informa; a retenção fica com a promotora, conforme a lei dela. Fecha a
  pergunta 3 da seção 9, mas a regra da lei de cada município continua não
  pesquisada.

### Onde não fecha
1. **A forma bruta não tem fluxo de caixa consistente com o abastecimento.** A
   promotora paga o saldo **antes** do consumo, então o R$ 1,50 de IRRF não tem
   de onde sair na hora da retenção. A tabela dele mostra a plataforma recebendo
   R$ 98,50 **depois** de ter recebido R$ 100 no abastecimento. Para fechar, há
   três caminhos, e cada um tem um custo econômico diferente:
   - **(a)** a promotora abastece R$ 101,52 para cada R$ 100 de taxa esperada:
     é a taxa líquida, na prática, paga antecipada;
   - **(b)** a promotora fica devendo R$ 1,50 à plataforma e paga no próximo
     abastecimento: a plataforma carrega o crédito e a promotora paga depois;
   - **(c)** a promotora paga o DARF do próprio caixa e a plataforma não recebe
     esse valor: a promotora paga 1,5% a mais que a taxa combinada, sem
     contrapartida no saldo.
   Nenhum dos três é "forma bruta" no sentido de a retenção sair do que foi
   pago. O contador deve dizer qual deles considera correto.
2. **"Adiantamento do imposto da plataforma"** é a tese de que o IRRF é crédito
   dela. Está em linha com o que ele já tinha dito; não há texto lido.
3. **A recomendação de CNAE troca a pergunta do dono.** Ele ainda não respondeu
   qual atividade gera mais receita. Se a taxa de rifas for a maior, o 73.11-4/00
   como principal está errado; é decisão sua, não do contador.

### Pendências do contador que sobram
- Texto da SC Cosit 13/2022.
- Base de Lucro Real para o adiamento de receita (o art. 223 é do lucro presumido).
- Descrição do CNAE para tráfego pago no CONCLA.
- Dispositivo do art. 718, II, do RIR/2018.
- Validação dos efeitos fiscais das decisões C1 a C6 e P1 a P5.
- Anexos 5 a 9 e acórdão 012/25.
- Assinatura, data e CRC.

### Decisão do dono
- Escolher entre (a), (b) e (c) do item 1 acima, depois de o contador confirmar
  qual é correto. Isso é comercial e contratual.
- Responder qual atividade é a principal (item 3).

## 11. Sexta resposta do contador e revisão (10/10/2026)

### IRRF: opção (a) escolhida, mas o mecanismo se contradiz
- Ele escolhe (a): abastecimento de R$ 101,52 para cada R$ 100 de taxa, com a
  retenção coberta pelo próprio abastecimento. A aritmética confere: 1,5% sobre
  R$ 101,52 = R$ 1,52.
- **Contradição:** a mesma resposta diz que a promotora "retém do saldo". Retenção
  na fonte acontece **no pagamento** à plataforma. Se a promotora retém R$ 1,52
  do abastecimento, a retenção ocorre no **abastecimento**, que na seção 5 e na
  revisão anterior ele tinha dito ser adiantamento **sem retenção**. Ele não
  pode ter as duas coisas. Ou o momento é o abastecimento (opção a, com a retenção
  ali), ou é o consumo (sem retenção no abastecimento, e então (a) não se sustenta).
- **Base:** a retenção de R$ 1,52 pressupõe NFS-e de R$ 101,52. Se a NFS-e
  sai pelos R$ 100 da taxa, a retenção é de R$ 1,50. O documento precisa dizer
  qual base usa.
- **Efeito econômico:** em qualquer das alternativas, a promotora paga R$ 1,52 a
  mais por cada R$ 100 de taxa, e a plataforma recebe os R$ 100 líquidos. É o
  custo do IRRF repassado à promotora; é decisão comercial.

### CNAE: a sugestão 92.00-3/00 não deve ser adotada pelo contador sozinho
- Ele sugere 92.00-3/00 (jogos de azar e apostas) como principal se a receita for
  da rifa. Isso classifica a atividade como **jogo de azar** perante a Receita,
  o CONCLA e, por consequência, a Meta e o Google. Contradiz a decisão D1 do
  advogado (a rifa não é aposta de quota fixa) e a própria tese do produto.
  **Não adotar sem o advogado**; a escolha do CNAE que classifica o negócio é
  jurídica além de fiscal.

### Correções nas referências
- **SC Cosit 13/2022**: ele agora diz que trata de Simples Nacional, marketing
  direto e promoção de vendas, **não de CSRF**. A fonte que eu citei na seção 9
  dizia o contrário, e estava errada. Consequência: **não há documento que sustente
  a não retenção de CSRF para publicidade**. O risco fica como risco, sem
  "fundamento" além da lista do art. 30 segundo fontes secundárias.
- **Art. 209 do RIR/2018** (regime de competência): citado sem texto. Não verificado.
- **Art. 718, II** (citação literal dele): não li o texto oficial; a busca confirma
  que o inciso II trata de publicidade e propaganda, mas não a redação. "Confirmado"
  na resposta dele vale como declaração, não como leitura.

### Pendências depois da sexta resposta
- Contador: escolher entre o momento abastecimento e consumo, e definir a base
  da retenção (R$ 100 ou R$ 101,52); validar C1 a C6 e P1 a P5; anexar textos
  (5 dias úteis); assinar.
- Advogado: a classificação (não aceitar 92.00-3 sem parecer); a cláusula de
  IRRF no anexo do modelo B (quem arca com o gross-up e como aparece na nota).
- Dono: a atividade principal (tráfego ou rifa), a aceitação do custo de 1,52% na
  taxa e a escolha do momento depois do contador.

## 12. Sétima resposta do contador e revisão (10/10/2026): o fluxo do IRRF não fecha

Ele fixa: momento **consumo**, base **R$ 100**, retenção **R$ 1,50**, abastecimento
**R$ 101,50**, com risco de momento registrado; retira 92.00-3/00 e mantém
73.11-4/00 como candidato.

### Por que o fluxo não fecha
A tabela dele lista: abastecimento R$ 101,50; plataforma recebe R$ 98,50; promotora
recolhe R$ 1,50 ao fisco; saldo remanescente R$ 0,00. Somando:
- Entra na plataforma: **R$ 101,50**.
- Sai da plataforma/promotora: **R$ 98,50** (para a plataforma) + **R$ 1,50** (para o fisco) = **R$ 100,00**.
- **Sobram R$ 1,50 sem destino.** O "saldo remanescente zero" da tabela é falso:
  101,50 − 100,00 = 1,50 continua no saldo, e ninguém diz para onde vai.

A conta só fecha em duas formas, cada uma com um comprador diferente:

| Forma | Abastecimento | Plataforma fica com | Quem paga o DARF | Quem absorve o IRRF |
|---|---|---|---|---|
| Bruta (retenção sai do que a plataforma recebe) | R$ 100,00 | R$ 98,50 | Promotora, dos R$ 100 | Plataforma (perde R$ 1,50) |
| Líquida (a promotora paga o IRRF por cima) | R$ 101,50 | R$ 100,00 | Promotora, dos R$ 101,50 | Promotora (paga R$ 1,50 a mais) |

A proposta atual mistura as duas e não tem terceira forma: pega a base da líquida
(R$ 101,50 de abastecimento) e o recebimento da bruta (R$ 98,50). É isso que
deixa R$ 1,50 solto.

### Momento: risco maior do que o parecer registra
- A "regra do crédito" que ele atribui ao art. 718, II, **não foi lida** e não
  está demonstrada na busca. Está registrada como fundamento, o que não pode ser.
- Se a Receita entender que o momento é o **pagamento** (abastecimento), a
  retenção de R$ 1,50 **não foi feita** e fica devida pela promotora, como fonte
  pagadora, com multa e juros. O parecer atual não diz isso. Isso precisa constar
  como consequência do risco, e não só como risco abstrato.

### CNAE e referências
- Retirada do 92.00-3/00: de acordo.
- **"Confirmo a existência e a aplicação"** do art. 718, II, e do art. 209 é uma
  afirmação sem leitura. Vale como declaração dele, não como verificação.
- SC Cosit 13/2022: o texto dele diz "não existe para CSRF", o que é ambíguo.
  A SC existe e trata de outro assunto. Escrever assim no parecer.

### Pendências depois da sétima resposta
- **Contador:** refazer a tabela até fechar o centavo, escolhendo a forma bruta
  ou a líquida; dizer quem paga o DARF e de qual valor; dizer o que acontece se a
  Receita entender que o momento é o abastecimento.
- **Contador:** prazo de 5 dias úteis para as entregas (até 19/10/2026, contando
  a partir de 13/10, porque 12/10 é feriado).
- **Dono:** escolher entre bruta e líquida (é comercial) e informar a atividade
  principal. Sem isso, a conta não fecha.
- **Advogado:** a cláusula do IRRF no anexo, com a forma escolhida; e a consulta
  sobre o momento (abastecimento ou consumo), que o contador não consegue responder
  com o texto que tem.

## 13. Oitava resposta do contador e revisão (10/10/2026)

A tabela bruta/líquida agora está correta. O texto que a acompanha ainda tem
três problemas, que precisam estar em lançamento contábil, não em frase.

1. **Forma bruta: "a plataforma não perde, porque o crédito compensa o IRPJ"**
   só vale se a plataforma tiver IRPJ a pagar no período em que a retenção
   ocorre. Com prejuízo fiscal ou lucro baixo, o crédito de R$ 1,50 fica para
   depois. Registrar como condição, não como regra.
2. **Forma bruta: o saldo.** Com abastecimento de R$ 100,00 e débito de taxa de
   R$ 100,00, a retenção de R$ 1,50 sai de onde? Se a promotora paga R$ 98,50 por
   Pix e retém R$ 1,50 para o DARF, o abastecimento credita R$ 98,50 e o débito é
   de R$ 100,00: a diferença de R$ 1,50 precisa de lançamento (crédito de IRRF a
   compensar, ou dívida da promotora, que vira a opção (b)). Ele não mostra isso.
3. **Forma líquida: a base da NFS.** Se o IRRF é creditado à plataforma, a NFS
   tem de sair pelo bruto (R$ 101,50), não pelos R$ 100,00 de taxa. Com NFS de
   R$ 100,00 e R$ 1,50 de crédito, a plataforma reconhece receita menor do que o
   documento. Além disso, "a plataforma devolve R$ 1,50" é um repasse que a
   forma líquida não precisa: a promotora paga R$ 100,00 à plataforma e R$ 1,50 ao
   fisco, e a conta fecha sem devolução.

### O que o parecer exige antes de fechar
- **Lançamentos de cada forma**, com débito e crédito nas contas do plano (caixa,
  adiantamento de clientes 2.1.5.01, receita 3.1.1.01, IRRF a compensar, DARF,
  obrigação com a promotora, se houver), somando zero nas duas formas.
- **Valor da NFS** em cada forma (R$ 100,00 na bruta; R$ 101,50 na líquida).
- **Momento de cada lançamento** (abastecimento e consumo separados).

### Risco solidário
A frase "a plataforma pode ser chamada a responder solidariamente" não tem
dispositivo citado nem texto lido. Entra como risco não verificado, não como
consequência.

### Decisão do dono (sem mudança)
- Bruta: a plataforma absorve os R$ 1,50 no caixa e recupera pelo IRPJ, se houver
  imposto a pagar no período.
- Líquida: a promotora paga R$ 1,50 a mais por cada R$ 100,00 de taxa, e a
  plataforma não tem o risco de caixa.

## 14. Nona resposta do contador e revisão (10/10/2026): lançamentos

Os lançamentos batem linha a linha, e a NFS e o momento estão escritos. Três
pontos ainda não fecham.

1. **O momento do IRRF não é o que os lançamentos mostram.** Na forma bruta, o
   abastecimento já lança "IRRF a compensar" de R$ 1,50, ou seja, a retenção é
   feita **no abastecimento** (o pagamento da promotora), e não no consumo. O
   texto diz consumo; o lançamento diz abastecimento. Ou o momento é o
   abastecimento, e a retenção ocorre na transferência de R$ 98,50, ou o
   lançamento precisa mudar, e não há pagamento no consumo para reter.
   Mesma coisa na forma líquida: o DARF sai da promotora no abastecimento.

2. **Forma líquida: o crédito sem contrapartida some com a NFS pelo bruto.** Se
   o IRRF é da plataforma, ela é tributada pelo bruto e tem crédito. Então a
   NFS é de R$ 101,50, a receita é de R$ 101,50, e o crédito de R$ 1,50 existe
   com contrapartida. Lançamentos corretos:
   - Abastecimento: Caixa D R$ 100,00; IRRF a compensar D R$ 1,50; Adiantamento
     de cliente C R$ 101,50.
   - Consumo: Adiantamento de cliente D R$ 101,50; Receita de taxa C R$ 101,50.
   Somam zero. A devolução de R$ 1,50 **não existe** nesta forma e sai do texto.
   A promotora paga R$ 100,00 à plataforma e R$ 1,50 ao fisco.

3. **O crédito de R$ 1,50 existe nas duas formas.** A diferença entre elas é só
   o que a plataforma recebe em caixa (R$ 98,50 na bruta, R$ 100,00 na líquida)
   e o que a promotora paga no total (R$ 100,00 na bruta, R$ 101,50 na líquida).
   O contador disse que na líquida "o crédito é da plataforma, mas não há como
   registrar sem contrapartida". Com a NFS de R$ 101,50, há.

### Consequência para a escolha do dono
- **Bruta:** a promotora paga R$ 100,00; a plataforma recebe R$ 98,50 em caixa e
  tem crédito de R$ 1,50 contra o IRPJ.
- **Líquida:** a promotora paga R$ 101,50; a plataforma recebe R$ 100,00 em caixa
  e tem o mesmo crédito de R$ 1,50 contra o IRPJ.

### Pendências
- **Contador:** alinhar o momento aos lançamentos (abastecimento, ou corrigir o
  texto para o consumo com o pagamento de onde sai a retenção); mudar a forma
  líquida para NFS de R$ 101,50 e retirar a devolução; validar os dois conjuntos
  de lançamentos.
- **Advogado:** o momento (abastecimento ou consumo), que agora decide os
  lançamentos.
- **Dono:** escolher entre bruta e líquida.
