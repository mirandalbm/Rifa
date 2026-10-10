# Resposta do advogado: textos da nova cobrança (10/10/2026)

Resposta ao `docs/PEDIDO-ADVOGADO-COBRANCA.md`. Abaixo, o que ele respondeu,
a conferência de cada item e o que já entrou no sistema.

## 1. O que já entrou no sistema

| Item | O que ele pediu | No sistema |
|---|---|---|
| 2.2 Termos | Meios de pagamento (sem cartão) e "a plataforma é remunerada pela promotora" | Seção 3 dos Termos (`shared/legal.ts`), vigência 10/10/2026 — com a redação ajustada (ver 2.2 abaixo) |
| 2.3 Regulamento | Forma de pagamento no regulamento; a remuneração da plataforma fica fora | `formaDePagamento()` em `shared/regulamento.ts`, montada dos meios ligados, no item 4 (Participação) |
| 2.4 Termo do afiliado | Cláusula 3 com "as taxas da plataforma" e a frase da tabela vigente na publicação | `shared/afiliados.ts`. O painel avisa que o termo está desatualizado, e cada organização publica a versão nova (novo aceite) |
| P1 | Extrato das taxas para o orçamento do pedido de autorização | A exportação "Cobrança da plataforma" agora filtra pela rifa escolhida (`server/services/exports.ts`) |
| P5 | Motivo específico e alternativa na recusa pelo cupom | Texto dele em `problemaNoTotalDoPedido()` (`shared/cobranca.ts`) |
| P6 | Avisar "só Pix" antes da compra | Na página da rifa e no carrinho (`PAGAMENTO_SO_PIX`, perto do botão de pagar), no cartão do feed ("cota R$ x · Pix") e nos Termos |

## 2. Conferência, item por item

### 2.1 Cláusula de remuneração (contrato da promotora)
A cláusula está aceita, com três correções antes de publicar a versão nova do
contrato (quem publica é a plataforma, em Configurações → Contrato):

- **X.9**: o sistema compara a **taxa da venda por cota** (não "as taxas") e
  só no modo por cota. Redação corrigida: *"No modo por cota, o valor por cota
  nunca pode ser igual ou maior que o preço da cota. Pacote com desconto ou
  cupom de afiliado que leve o preço de cada cota abaixo da taxa da venda por
  cota é recusado pelo sistema, com aviso na tela."*
- **X.10**: depende da decisão 1 (abaixo).
- **X.3, parágrafo único**: depende da decisão 2 (abaixo).
- **X.13**: os valores (juros de 1% ao mês e multa de 2%) servem num contrato
  entre empresas. Os fundamentos citados, porém, não são os desses valores:
  - o art. 52, §1º, do CDC trata de crédito ao consumidor;
  - o art. 421-A do Código Civil trata da paridade dos contratos empresariais,
    não da função social (que está no art. 421);
  - o art. 406 do Código Civil passou, desde a Lei 14.905/2024, a remeter à
    taxa legal (Selic menos IPCA).

  Juros de 1% ao mês cabem como juros convencionados (teto da Lei de Usura,
  12% ao ano). Pedir a ele que troque os fundamentos, não os números.

### 2.2 Termos de uso
A redação sugerida ("a plataforma é remunerada pela promotora por uma taxa
sobre a venda; essa taxa já está incluída no preço") é imprecisa em dois
pontos:
- são duas taxas (a da venda, percentual ou por cota, e a do Pix);
- "incluída no preço" sugere que o comprador paga a taxa.

O sistema usa: *"O preço que você vê é o preço que você paga. A plataforma é
remunerada pela promotora, por taxas sobre as vendas (percentual ou valor por
cota) e sobre as transações Pix; essas taxas são custo da promotora e não são
cobradas de você à parte."* Mandar a ele para confirmar.

### Pergunta 1 (autorização SPA/MF)
A resposta cita a Portaria SEAE/ME 7.638/2022, art. 6º, e o Decreto
70.951/72, art. 4º, **sem o texto**. A vigência da Portaria 7.638 já estava em
aberto (`docs/FECHAMENTO-JURIDICO-CONTABIL.md`). A conclusão prática não muda
o sistema: a promotora inclui a taxa no orçamento, e o extrato por rifa já
existe. Fica como "fonte não conferida".

### Pergunta 2 (estorno) — decisão sua
A recomendação dele (devolver ou não a taxa Pix conforme o motivo do estorno)
é viável. Os fundamentos têm três problemas:

1. **O CDC protege o comprador, e ele já recebe tudo de volta** em qualquer
   estorno. Quem fica com a taxa Pix é assunto entre plataforma e promotora:
   não é o art. 49 que decide. Devolver a taxa no arrependimento é escolha
   comercial, não exigência legal.
2. **Pix não tem "chargeback".** O equivalente é o MED (Mecanismo Especial de
   Devolução), por fraude ou falha operacional, que chega ao sistema como
   "Pix devolvido pelo provedor".
3. **Os casos do sistema não batem com as três hipóteses dele.** O sistema
   tem cinco tipos de estorno:
   - arrependimento (até 7 dias, devolução integral);
   - adiamento do sorteio (devolução integral);
   - reembolso com taxa (depois dos 7 dias);
   - devolução avisada pelo provedor (MED, contestação);
   - Pix que chegou tarde (este não gera taxa, porque o pedido não chegou a
     ser pago).

   "Falha da plataforma" não tem como o sistema saber sozinho: precisaria de
   uma marcação manual da plataforma.

**Recomendação**:
- A taxa da venda é sempre cancelada (como hoje).
- A taxa Pix **fica com a plataforma** no reembolso com taxa, na devolução do
  provedor (MED) e no adiamento (o adiamento é pedido da promotora).
- A taxa Pix **é cancelada** no arrependimento, como ele pediu, e quando a
  plataforma marcar o estorno como "falha da plataforma".

### Pergunta 3 (aviso de 30 dias) — decisão sua
Os fundamentos citados não se aplicam:
- o CDC, art. 6º, III, protege o consumidor, e a promotora contrata como
  empresa;
- o art. 473 do Código Civil trata do aviso para encerrar o contrato, não
  para mudar preço.

O aviso de 30 dias é, mesmo assim, boa prática comercial e evita discussão.
Para isso, o sistema precisa de uma **tabela agendada**: a plataforma salva a
tabela nova com data de vigência de no mínimo 30 dias à frente, as
organizações recebem o aviso (sino do painel e e-mail), e a rifa publicada a
partir daquela data grava a tabela nova. Até lá, vale a atual.

### Pergunta 4 (inadimplência)
Aceita. Ressalva sobre o aviso dele de que MEI ou associação seriam
consumidores: a promotora autorizada pela SPA/MF contrata a plataforma para a
atividade dela, e não é consumidora por ser MEI ou associação. Ainda assim, a
cautela dele custa pouco. Recomendo **notificação prévia com prazo** (por
exemplo, 10 dias) antes de bloquear publicações, para todas as promotoras.

### Perguntas 5 e 6
Aceitas e aplicadas (tabela 1).

## 3. O que falta

1. **Sua decisão sobre a pergunta 2** (taxa Pix no estorno). Mudança no
   sistema: o estorno passa a manter a taxa Pix nos casos escolhidos.
2. **Sua decisão sobre a pergunta 3** (aviso de 30 dias). Mudança no sistema:
   tabela agendada e aviso às organizações.
3. **Ao advogado**:
   - a correção da X.9;
   - os fundamentos da X.13;
   - a redação dos Termos (2.2);
   - o texto da Portaria 7.638 (pergunta 1).
4. **Publicar a versão nova do contrato da promotora** com a cláusula final,
   depois das decisões 1 e 2.
5. Ele se ofereceu para assinar a parte jurídica em
   `docs/FECHAMENTO-JURIDICO-CONTABIL.md`. A Parte 1 continua aberta pelos
   itens que estão lá (CNAE, endereço, contador).
