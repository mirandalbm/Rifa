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
| P2 / X.10 | Taxa Pix no estorno conforme o motivo | Decidido e no sistema (abaixo, "Pergunta 2"): `taxaPixFicaNoEstorno()`, lido do chamado dentro de `refundOrder()`; a plataforma marca "Falha da plataforma" no Atendimento |
| P3 / X.3 | Aviso de 30 dias para mudar a tabela | Decidido e no sistema (abaixo, "Pergunta 3"): a tabela agendada, o aviso no sino, na Cobrança e no cartão da rifa |
| P4 / X.13 (a) | Bloquear publicação só depois de notificar pelo painel e de 10 dias sem regularizar; implementar antes de publicar a cláusula (segunda resposta dele) | No sistema (abaixo, "Pergunta 4"): a plataforma notifica na Carteira; passados 10 dias com a taxa notificada em aberto, rifa nova não publica; o acerto regulariza |

## 2. Conferência, item por item

### 2.1 Cláusula de remuneração (contrato da promotora)
A cláusula está aceita, com três correções antes de publicar a versão nova do
contrato (quem publica é a plataforma, em Configurações → Contrato):

- **X.9**: o sistema compara a **taxa da venda por cota** (não "as taxas") e
  só no modo por cota. Redação corrigida: *"No modo por cota, o valor por cota
  nunca pode ser igual ou maior que o preço da cota. Pacote com desconto ou
  cupom de afiliado que leve o preço de cada cota abaixo da taxa da venda por
  cota é recusado pelo sistema, com aviso na tela."*
- **X.10**: reescrita pela decisão da pergunta 2 (abaixo).
- **X.3, parágrafo único**: reescrito pela decisão da pergunta 3 (abaixo).
- **X.5**: "as duas taxas incidem sobre a parte da Promotora" pode ser lido
  como "calculadas sobre a parte dela". O sistema calcula sobre o valor pago
  e desconta da parte da promotora. Redação corrigida na cláusula final.
- **X.13**: os valores (juros de 1% ao mês e multa de 2%) servem num contrato
  entre empresas. Os fundamentos citados, porém, não são os desses valores:
  - o art. 52, §1º, do CDC trata de crédito ao consumidor;
  - o art. 421-A do Código Civil trata da paridade dos contratos empresariais,
    não da função social (que está no art. 421);
  - o art. 406 do Código Civil passou, desde a Lei 14.905/2024, a remeter à
    taxa legal (Selic menos IPCA).

  Juros de 1% ao mês cabem como juros convencionados (CC, art. 406, que só
  remete à taxa legal quando não há taxa convencionada); entre pessoas
  jurídicas, a Lei de Usura deixou de se aplicar (Lei 14.905/2024, art. 3º)
  e, mesmo onde se aplica, 1% ao mês fica dentro dos 12% ao ano. A multa de
  2% é cláusula penal (CC, arts. 408 a 412). Pedir a ele que confira e troque
  os fundamentos, não os números.

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

### Pergunta 2 (estorno) — decidido em 10/10/2026
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

**Decisão (aplicada no sistema)**:
- A taxa da venda é sempre cancelada (como hoje).
- A taxa Pix **fica com a plataforma** no reembolso com taxa, na devolução do
  provedor (MED) e no adiamento (o adiamento é pedido da promotora).
- A taxa Pix **é cancelada** no arrependimento, como ele pediu, e quando a
  plataforma marcar o estorno como "falha da plataforma" (caixa só da
  plataforma, ao estornar o chamado no Atendimento).
- A fraude do comprador chega como devolução do provedor (MED): a taxa Pix
  fica, como ele pediu na hipótese (b).

### Pergunta 3 (aviso de 30 dias) — decidido em 10/10/2026
Os fundamentos citados não se aplicam:
- o CDC, art. 6º, III, protege o consumidor, e a promotora contrata como
  empresa;
- o art. 473 do Código Civil trata do aviso para encerrar o contrato, não
  para mudar preço.

O aviso de 30 dias é, mesmo assim, boa prática comercial e evita discussão.

**Decisão (aplicada no sistema)**: a **tabela agendada**.
- **Aumento** de qualquer taxa (percentual, por cota ou a taxa Pix em algum
  volume do mês) só vale com data de vigência de no mínimo 30 dias à frente.
- **Redução** pode valer na hora.
- Antes de qualquer promotora aceitar o contrato, a tabela é montada sem
  aviso: não há a quem avisar.
- As organizações são avisadas **pelo painel**: no sino, na Cobrança e no
  cartão "Cobrança da plataforma" da rifa em rascunho. O sistema não manda
  e-mail; a cláusula diz "pelo painel".
- A rifa publicada a partir da data grava a tabela nova. Até lá, vale a
  atual.

### Pergunta 4 (inadimplência) — decidido em 10/10/2026
Aceita. Ressalva sobre o aviso dele de que MEI ou associação seriam
consumidores: a promotora autorizada pela SPA/MF contrata a plataforma para a
atividade dela, e não é consumidora por ser MEI ou associação. Ainda assim, a
cautela dele custa pouco. **Decisão**: notificação prévia pelo painel, com
10 dias para regularizar, antes de bloquear publicações, para todas as
promotoras.

**No sistema (10/10/2026)**, depois de o advogado apontar que publicar a
cláusula sem o bloqueio seria prometer um direito que a plataforma não
consegue exercer:
- **Notificar é ato da plataforma**, na Carteira da Cobrança ("notificar
  falta de pagamento"). A taxa em aberto não tem vencimento (o acerto é
  combinado), então não há relógio que notifique sozinho.
- A notificação guarda **as taxas em aberto daquele instante**: a venda
  feita depois não entra nela.
- Só se notifica o que o crédito da promotora (a parte dela nos presentes)
  não cobre; se cobre, o caminho é o acerto, que compensa — a alínea (b).
- A promotora vê a notificação no sino e no topo da Cobrança, com o valor,
  a data e o último dia para regularizar.
- **O prazo**: 10 dias, excluído o dia da notificação e incluído o último
  (Código Civil, art. 132), no horário de Brasília. Notificada no dia 10,
  regulariza até o fim do dia 20; o bloqueio começa no dia 21.
- Passado o prazo com taxa notificada ainda em aberto, **rifa nova não
  publica** (nem a agendada). As rifas no ar seguem vendendo.
- O acerto ("dar baixa") encerra a notificação na mesma transação, e a
  publicação volta na hora. A plataforma também pode cancelar a
  notificação, com motivo. Tudo fica na auditoria.
- Os juros e a multa (alínea (c)) seguem calculados à mão, no acerto.

### Perguntas 5 e 6
Aceitas e aplicadas (tabela 1).

## 3. O que falta

1. **Ao advogado**, para o aval formal: o texto final abaixo. Na segunda
   resposta (10/10/2026) ele concordou com os critérios da X.10 e da X.3
   (parágrafo único) e com as correções da X.5, da X.9 e da X.13, e
   condicionou a publicação ao bloqueio da X.13 (a), que agora existe no
   sistema. O texto da cláusula não mudou desde a conferência dele. Seguem
   em aberto com ele a redação dos Termos (2.2) e o texto da Portaria 7.638
   (pergunta 1).
2. **Publicar a versão nova do contrato da promotora** com a cláusula final
   (Configurações → Contrato), depois da confirmação dele. Toda versão nova
   exige novo aceite das organizações para publicar rifa.
3. **Montar a tabela de cobrança antes do primeiro aceite** do contrato
   (Cobrança): depois dele, aumentar qualquer taxa exige 30 dias de aviso.
4. Ele se ofereceu para assinar a parte jurídica em
   `docs/FECHAMENTO-JURIDICO-CONTABIL.md`. A Parte 1 continua aberta pelos
   itens que estão lá (CNAE, endereço, contador).

## 4. Cláusula final (para publicar como versão nova do contrato)

É a redação dele com as correções acima. Cada item descreve o que o sistema
já faz; a coluna da direita aponta onde. Os dados da plataforma (razão
social, CNPJ, endereço, e-mail) são preenchidos pelo sistema, como no resto
do contrato. O número da cláusula ("X") é o que ela tiver no contrato.

**Cláusula X — Remuneração da Plataforma**

**X.1.** A Plataforma é remunerada exclusivamente pelas taxas previstas
nesta cláusula. Não há mensalidade, anuidade ou qualquer valor fixo pela
manutenção da conta ou pela publicação de rifas. Ficam revogadas as
disposições anteriores sobre mensalidade ou percentual por organização.

**X.2.** Antes de publicar cada rifa, a Promotora escolhe um dos dois modos
de remuneração:
(a) percentual sobre a venda — percentual sobre o valor pago em cada pedido;
ou
(b) valor fixo por cota vendida — valor por cota efetivamente vendida.
A escolha é registrada no momento da publicação e permanece inalterada até o
encerramento da rifa.

**X.3.** Os percentuais, os valores por cota e as faixas da taxa de
transação Pix são os da tabela de cobrança publicada no painel da
Plataforma. No momento da publicação, o sistema grava na rifa a tabela
vigente naquele dia. A alteração posterior da tabela não produz efeito sobre
rifas já publicadas.

*Parágrafo único.* A Plataforma pode alterar a tabela de cobrança a
qualquer tempo, indicando a data a partir da qual a tabela nova vale. A
alteração vale apenas para as rifas publicadas a partir dessa data. A
alteração que aumente qualquer taxa exige aviso prévio de 30 (trinta) dias
à Promotora, pelo painel; a que apenas reduza taxas pode valer de imediato.

**X.4.** Em todo Pix pago pelo site incide também a taxa de transação Pix,
percentual calculado em faixas conforme o volume mensal de transações Pix
pagas da Promotora, apurado por mês civil, horário de Brasília. Cada pedido
é regido pela faixa vigente no momento de sua criação.

**X.5.** As duas taxas são calculadas sobre o valor pago e descontadas da
parte da Promotora. O comprador paga exatamente o preço anunciado da cota.

**X.6.** A ordem do rateio é: primeiro as taxas da Plataforma; depois, sobre
o que sobra, a comissão do afiliado ou do cambista; o restante é da
Promotora.

**X.7.** A Plataforma recebe:
(a) por divisão no próprio Pix, quando a Promotora mantém carteira no
provedor de pagamento, indo a parte dela direto para a carteira e ficando as
taxas com a Plataforma; ou
(b) como valor devido, quando não há divisão ou quando a venda é feita pelo
cambista, sendo acertado no painel.

**X.8.** Na venda pelo cambista, incide a taxa da venda, mas não a taxa de
transação Pix, porque o pagamento não passa pela Plataforma.

**X.9.** No modo por cota, o valor por cota nunca pode ser igual ou maior
que o preço da cota. Pacote com desconto ou cupom de afiliado que leve o
preço de cada cota abaixo da taxa da venda por cota é recusado pelo
sistema, com aviso na tela.

**X.10.** No estorno de um pedido, a taxa da venda daquele pedido é sempre
cancelada. A taxa de transação Pix:
(a) é cancelada no estorno por arrependimento do comprador no prazo legal
(art. 49 do Código de Defesa do Consumidor) e no estorno que a Plataforma
reconhecer como decorrente de falha dela, caso em que a Plataforma absorve
o custo;
(b) permanece devida à Plataforma, por ser custo de transação já incorrido,
no reembolso feito depois do prazo de arrependimento, no estorno por
adiamento do sorteio e na devolução determinada pelo provedor de pagamento
(inclusive por fraude, contestação ou Mecanismo Especial de Devolução).
A transação permanece contando no volume do mês. O valor devolvido ao
comprador segue os Termos de uso e não é alterado por esta cláusula.

*Parágrafo único.* O Pix pago depois do vencimento da reserva, ou depois do
sorteio, não gera taxa e é devolvido integralmente a quem pagou.

**X.11.** No presente (desconto pago pela Plataforma na primeira compra), as
taxas incidem sobre o preço cheio, e a parte da Promotora no desconto vira
crédito dela, já descontada a mesma proporção das taxas.

**X.12.** Os meios de pagamento aceitos são: Pix pelo site; dinheiro ou Pix
na maquininha, na venda pelo cambista. Cartão de crédito e de débito não são
aceitos.

**X.13.** O não pagamento do valor devido autoriza a Plataforma a:
(a) bloquear a publicação de novas rifas, depois de notificar a Promotora
pelo painel e de decorridos 10 (dez) dias sem a regularização;
(b) compensar o valor devido com créditos da Promotora junto à Plataforma,
quando líquidos e vencidos; e
(c) cobrar juros de mora de 1% (um por cento) ao mês e multa de 2% (dois por
cento) sobre o valor devido,
sem prejuízo da rescisão.

### Onde cada item está no sistema

| Item | No sistema |
|---|---|
| X.1 | Sem mensalidade: removida em 10/10/2026 (`docs/DECISOES-COBRANCA.md`, P2) |
| X.2 | `campaigns.cobranca_modo`, escolhido no rascunho e travado ao publicar |
| X.3 | `publishCampaign()` grava `campaigns.cobranca` com a tabela vigente (`tabelaDeCobrancaAgora()`) |
| X.3, p.ú. | `cobrancaProxima` e `problemaNaVigencia()`; aviso no sino, na Cobrança e no cartão da rifa |
| X.4 | `pix_volume_mensal` e `taxaDoPedido()` (faixa fotografada no pedido) |
| X.5 e X.6 | `splitOrder()` com as taxas: a plataforma sai antes, o centavo fica com a promotora |
| X.7 | Split do Asaas (linha `retida`) ou lançamento `aberta` em `platform_charges`, com "dar baixa" |
| X.8 | `taxaDoPedido({ pixOnline })`: sem taxa Pix fora do Pix online |
| X.9 | `problemaNaCobranca()` (publicação e pacotes) e `problemaNoTotalDoPedido()` (cupom) |
| X.10 | `motivoDoEstorno()`/`taxaPixFicaNoEstorno()` em `refundOrder()`; "Falha da plataforma" no Atendimento |
| X.10, p.ú. | Fila "Pix a devolver" (`pix_tardios`): o pedido não chega a ser pago, nenhuma taxa é lançada |
| X.11 | `creditoDoPresente({ taxa })` |
| X.12 | `shared/payments.ts` (sem cartão); `PAGAMENTO_SO_PIX` na compra |
| X.13 | (a) `shared/inadimplencia.ts`: a plataforma notifica na Carteira (`POST /admin/cobranca/:id/notificar`), a promotora vê no sino e na Cobrança, e passados 10 dias com a taxa notificada em aberto `publishBlockers`/`publishCampaign()` barram rifa nova; o acerto regulariza; (b) o acerto (`darBaixa()`) já compensa o crédito do presente com as taxas devidas, e não se notifica o que o crédito cobre; (c) à mão, no acerto |
