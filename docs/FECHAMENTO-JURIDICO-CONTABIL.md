# Fechamento jurídico e contábil — a Parte 1, antes da reformulação

Situação: **plano, nada aplicado.** Data: 10/10/2026.

Decisão do dono (10/10/2026): "vamos por parte"; o advogado e o contador
precisam estar **finalizados** antes de o sistema ser refeito, para que depois
não haja mudança nem atualização por causa deles. Este documento é a Parte 1.
A reformulação visual (`docs/PLANO-REFORMULACAO.md`) é a Parte 2 e só começa
quando a Parte 1 passar no critério da seção 1.

## 1. O que quer dizer "finalizado"

Um assunto só fecha quando tem **os quatro**:

1. **Resposta por escrito** de quem decide (advogado ou contador), com o
   fundamento, não só "sim".
2. **Fonte primária conferida**: a norma ou política foi lida no texto oficial
   (por ele, com a cópia anexada) — ver o caso da SC Cosit 8/2024 e do PN
   5/2018, que o contador citou e nenhum dos dois tinha aberto.
3. **Decisão do dono registrada** (modelo A ou B, preço, município…).
4. **Efeito no sistema listado e feito**: texto, constante ou regra que a
   resposta muda, já alterado e provado, **antes** da Parte 2.

Ao fim, um **registro de decisões** (uma linha por assunto: resposta, data,
quem, documento) e um **PR de adequação** com tudo o que o jurídico e o
contábil mudam no código. Depois disso o texto legal só muda por **versão
publicada pelo painel**, nunca por deploy (seção 7).

## 2. Situação por assunto

Fechado = os quatro itens da seção 1. Parcial = resposta existe, falta
fonte, decisão ou efeito.

| Assunto | Advogado | Contador | Você | Situação |
|---|---|---|---|---|
| Termos de uso e Privacidade (revisão formal) | revisou (08/10) | — | trocar e-mail institucional, e-mail e cargo do encarregado, endereço oficial | **parcial** (falta dado seu) |
| Contrato da promotora + anexos A a E | anexos aprovados (08/10); **versão final ainda não recebida por ele** | — | mandar a versão final e publicar | **parcial** |
| Termo do afiliado | aprovado (07/10) | validou o tratamento (07/10) | afiliados antigos publicam a versão nova | **fechado** no texto |
| Guarda da comissão pela plataforma | 3 providências (conta separada no Asaas, prazo de repasse no termo, prestação de contas à promotora) | modelo validado; **falta o documento espelho** | decidir o prazo e abrir a conta | **parcial** |
| IRRF 1,5% do saque da empresa | — | confirmou (07/10) | — | **fechado** |
| CNAE da taxa (6311-9/00) | — | indicou | conferir no cartão do CNPJ e na inscrição municipal | **parcial** (falta conferir) |
| Apuração (Federal, globo), aproximação, impedidos, vale-brinde | respondeu os itens 1 a 9 | — | globo: **fica desligado** até valer o custo do cartório | **fechado** (globo, futuro) |
| Comparador de rosto | opt-out da AWS é bloqueante | — | ativar o opt-out e conferir o contrato AWS | **parcial** (só se for ligar) |
| Tráfego pago, modelo A | "não implementar como está" (prioridades 1 e 2) | posição fiscal dada; **falta o parecer conjunto** | decidir A reprecificado ou B | **aberto** |
| Tráfego pago, modelo B | "caminho mais seguro"; falta o anexo do contrato e as consultas formais | ISS só sobre a taxa | decidir | **aberto** |
| Saldo pré-pago (patrocínio, banner, IA, tráfego) | **risco sério**; exige parecer de direito bancário | tratamento como adiantamento | contratar o parecer | **aberto** (o mais grave) |
| Influenciadores (R16 a R23) | **não respondidas** | cachê a MEI/PF: **não respondida** | mandar | **aberto** |
| Tesouraria e perfis de equipe (E1 a E7) | prioridade 3: **não tocou** | plano de contas e DRE: **parcial** | — | **aberto** |
| Parecer conjunto | só começa quando ele concordar com a estrutura | só começa com o município da sede | município e item de serviço | **aberto** |

## 3. Perguntas abertas, na ordem de envio

Numeração única. Cada linha diz **o que muda no sistema** conforme a resposta,
que é o motivo de fechar antes da Parte 2.

### 3.1 Primeiro: o que só você responde (destrava os dois)

| # | Pergunta | Destrava |
|---|---|---|
| V1 | **Município da sede** da plataforma | alíquota de ISS, o parecer conjunto, o extrato e a tabela de municípios do contador |
| V2 | **Item de serviço**: 17.06 (publicidade) ou 10.08 | nome da operação no contrato, na NFS-e e no CNAE da prefeitura |
| V3 | **Tráfego pago**: reprecificar o modelo A ou priorizar o B (o advogado já inclina ao B; o A fica suspenso) | todo o capítulo do tráfego e do saldo |
| V4 | **Autorização/certificação em nome da plataforma**: existe, será pedida, em que estágio está a homologação do globo | R23: o que se pode afirmar nas peças; a análise de "agregador" |
| V5 | Dados da empresa: e-mail institucional, e-mail e cargo do encarregado, endereço oficial | publicar Termos e Privacidade |
| V6 | O que é "UOL Host" na sua estratégia | catálogo de canais e R22 |

### 3.2 Advogado

**Bloco 1 — decide a estrutura (primeiro, porque o contador espera por ele):**

| # | Pergunta (origem) | O que muda se a resposta for… |
|---|---|---|
| A1 | Estrutura do parecer conjunto: quem escreve o quê (consulta §17, §21) | libera o contador |
| A2 | R1/R13: "contas segregadas por promotora" é o modelo B? Quem pede a autorização da Meta | desenho do módulo de tráfego (a promotora liga a conta; a plataforma só gere) |
| A3 | R12: "agregador" do Google olha a conta ou o site de destino? | se olha o site, o destino das divulgações vira domínio ou página da promotora: **muda a vitrine e o link do afiliado** |
| A4 | R23: o que a plataforma pode dizer do globo e de "sem manipulação" antes da homologação | textos de marketing, ajuda, regulamento e peças |
| A5 | R14: redigir (a) o anexo do modelo B, (b) as consultas formais à Meta e ao Google, (c) a revisão trimestral | contrato e anexos novos |

**Bloco 2 — influenciadores (a estratégia nova depende disto):**

| # | Pergunta | Muda |
|---|---|---|
| A6 | R16: responsabilidade por post de influenciador (plataforma × organização) | cláusulas do termo do afiliado e do contrato da promotora |
| A7 | R17: guia do CONAR vigente desde 01/06/2026 em rifa e sorteio; "#publi" e parceria paga bastam? | `textosDoKit()`, legenda sugerida, kit |
| A8 | R18: Decreto 70.951/72 e a divulgação: o número da autorização vai em toda peça (story, reels)? em que formato? | `shared/artes.ts` e o editor de imagem (campo obrigatório) |
| A9 | R19: regras das redes sobre conteúdo orgânico de rifa autorizada | o que o kit permite postar em cada rede |
| A10 | R20: WhatsApp Business e "jogo com dinheiro real" | risco no canal de mensagens que já existe |
| A11 | R21: acordo com cachê, a organização paga direto; PF sem CNPJ | desenho da Fase 2 (acordo) |
| A12 | R22: anúncio em portal (Taboola, Outbrain, UOL) | só entra a Fase 3 se for permitido |

**Bloco 3 — saldo, taxa e crédito (dinheiro que a organização deixa na plataforma):**

| # | Pergunta | Muda |
|---|---|---|
| A13 | **Parecer de direito bancário** sobre o saldo pré-pago (Res. BCB 96/2021): é conta de pagamento? | **pode reestruturar toda a área "Dinheiro"**: com saldo, sem saldo, saque, segregação |
| A14 | R8: medidas provisórias para o saldo que já existe | o que fica desligado até o parecer |
| A15 | R5 e B3: base legal dos 12 meses, aviso prévio, baixa do vencido, saldo na rescisão e no banimento | o livro passa a guardar vencimento; relógio de baixa; aviso na tela |
| A16 | B1/B2: taxa que não volta × CDC e B2B; exceção por falha da plataforma (crédito) | `taxa_cents`, ação "devolver taxa como crédito" |
| A17 | R7: carência do Pix de 7 dias e a reposição por estorno (MED) | tempo até o saldo valer |
| A18 | R6 e B5: pausa aos 10% do saldo, excedente cobrável, obrigação de meio | texto do aceite e do produto de tráfego |
| A19 | R9: IP e aparelho (hash) no aceite da taxa | pequena mudança de código (já decidida) |
| A20 | R10: B1, B6, C1, C2 do modelo B, "o que a autorização permite dizer" | contrato do modelo B |

**Bloco 4 — equipe, dados e Tesouraria (prioridade 3, nunca respondida):** D2 a
D4 e E1 a E7 (perfis de equipe, termo de confidencialidade, log de acesso,
contador externo, fechamento imutável, consentimento do envio de conversão).
**Isto muda a navegação**: perfis de equipe são papéis novos em
`shared/access.ts`, e a Tesouraria é um grupo novo do menu. Precisa estar
fechado antes de desenhar o menu.

**Bloco 5 — operação já no ar:** versão final do contrato da promotora (os
quatro pontos); as três providências da guarda da comissão; opt-out da AWS se
for ligar o comparador; globo (cartório) quando houver demanda.

### 3.3 Contador

| # | Pergunta | Muda |
|---|---|---|
| C1 | **Anexar o texto oficial** da SC Cosit 8/2024, dos itens 40 a 44 do PN 5/2018, da SC 6.006 e dos dois acórdãos do CARF | o parecer só se apoia em norma lida |
| C2 | Esclarecer o crédito de PIS/COFINS: redução de custo (já disse) e o fundamento por escrito | DRE do parecer |
| C3 | **Preço da taxa por cenário e município** (C24, nunca respondida) | `taxa de gestão` de fábrica; imposto da rede (÷ 0,8785) hoje **não** modelado: margem e excedente ficam otimistas |
| C4 | Taxa virar receita **na aprovação** (diferir ou não; competência do ISS) | extrato mensal e o texto do aceite |
| C5 | **Cachê a MEI e pessoa física**: nota, retenção, quem é a fonte pagadora | Fase 2 dos influenciadores (acordo registrado) |
| C6 | Documento fiscal **espelho** na guarda da comissão | cláusula 10 do termo do afiliado |
| C7 | A palavra "revenda": nome oficial da operação para contrato e nota | textos de contrato, ajuda e telas |
| C8 | Tabela de municípios (alíquota e fonte) e como marcar por organização | cadastro fiscal por organização |
| C9 | Tesouraria: plano de contas, "valores de terceiros", fechamento mensal (parcial) | grupo Tesouraria do menu |
| C10 | CNAE 6311-9/00 e 73.11-4-00 conferidos no CNPJ | só conferência sua |

### 3.4 Terceiros (fora do advogado e do contador)

| # | O quê | Quem |
|---|---|---|
| T1 | Parecer de direito bancário e de pagamentos | escritório especializado (a contratar) |
| T2 | Consulta formal à **Meta**: agência pode obter a autorização para várias promotoras? | advogado redige; você envia |
| T3 | Consulta formal ao **Google**: "agregador" e certificação para rifa autorizada | idem |
| T4 | Consulta à **UOL/Taboola/Outbrain** sobre rifa autorizada | só se a Fase 3 for adiante |
| T5 | Verificar a empresa na Meta, número de WhatsApp real e modelos aprovados | você |

## 4. Ordem e dependências

```
V1 município ─┐
V2 item de serviço ─┼─► C3 preço da taxa ─► parecer conjunto ─► registro de decisões
A1 estrutura do parecer ─┘                         ▲
A13 parecer bancário ─► A14/A15/A17 saldo ─────────┘
A2/A3/A4 + T2/T3 (Meta, Google) ─► V3 modelo A ou B ─► anexo do modelo B (A5)
A6..A12 (influenciadores) ─► termo do afiliado e kit
Bloco 4 (equipe, Tesouraria) ─► menu e papéis ─► Parte 2
```

Caminho crítico: **V1/V2 → A1 → C1/C3 → parecer conjunto** (semanas) e, em
paralelo e mais lento, **T1 (parecer bancário)** e **T2/T3 (Meta e Google)**.
Os dois últimos dependem de terceiros, e a Parte 2 não deve esperar por eles
inteiros: ver a seção 6.

## 5. Pacote de envio (o que preparo, sem aplicar nada)

1. **Dossiê ao advogado**: um só arquivo, A1 a A20, cada pergunta com sim /
   não / sim com ressalva, fundamento em uma linha, cláusula sugerida, e o
   resumo do que o sistema já faz (a base da seção "O que o advogado precisa
   saber" do `PERGUNTAS-AO-ADVOGADO.md`).
2. **Dossiê ao contador**: C1 a C10, com os números de cada cenário.
3. **Minutas de consulta** à Meta e ao Google (a pergunta objetiva, para o
   advogado revisar, já que ele se ofereceu a redigir).
4. **Quadro de decisões do dono** (V1 a V6), uma página.
5. **Registro de decisões** vazio, para preencher a cada resposta.

## 6. Como não travar a Parte 2 por causa de terceiros

Três assuntos dependem de gente de fora (parecer bancário, Meta, Google) e
podem levar semanas. A regra proposta:

- **Não esperam**: tudo o que já está fechado (apuração, termos, contrato,
  afiliado, IRRF).
- **Esperam o parecer, mas o desenho já assume o pior caso**: o saldo
  pré-pago e o tráfego pago. A Parte 2 desenha a área "Dinheiro" e
  "Marketing" **com o saldo e o tráfego atrás de interruptor**
  (já é como estão), sem mexer na regra. Se o parecer exigir mudar a regra,
  muda por trás, sem refazer a tela.
- **Bloqueiam a Parte 2**: perfis de equipe e Tesouraria (bloco 4), porque
  mudam o menu e os papéis.

## 7. Para o texto legal não depender de deploy

Hoje o texto vem das regras (`shared/legal.ts`, `shared/regulamento.ts`) e o
contrato é versionado pelo painel. Proposta, a confirmar na Parte 1:

1. **Inventário das constantes legais** (prazos, percentuais, textos de aceite,
   versões): quais estão no código e quais em dado. Sai com a lista de quem
   muda cada uma.
2. As que o advogado ou o contador podem mudar (prazo de resposta, validade
   do crédito, taxa de reembolso, textos de aceite) passam a ser **versão
   publicada pelo painel**, com aceite e impressão, como o contrato.
3. Toda mudança legal futura entra por **versão**, não por PR de código —
   exceto regra nova de negócio, que continua exigindo PR.

## 8. Critério para começar a Parte 2

- [ ] V1 a V6 respondidas.
- [ ] Advogado: A1 a A12 e A19 respondidos por escrito; bloco 4 respondido.
- [ ] Contador: C1 a C9 respondidos; parecer conjunto assinado.
- [ ] Registro de decisões completo; PR de adequação mesclado.
- [ ] A13 (parecer bancário) e T2/T3 em andamento, com o pior caso assumido
      na Parte 2 (seção 6).

---

## Respostas do dono V1 a V6 (10/10/2026)

| # | Pergunta | Resposta | Efeito |
|---|---|---|---|
| V1 | Município da sede | **São Paulo** | Libera a alíquota de ISS e a regra de retenção para o parecer. A SF/DEJUG nº 2/2024 (São Paulo) passa a valer para a base do ISS no item 10.08. **O contador confirma a alíquota** |
| — | Custo mensal e margem desejada | O dono pediu a explicação detalhada do que se precisa (abaixo) | **Aberto** |
| — | Razão social e CNPJ | **"North Ocean Brazil"**; CNPJ **ainda não informado** | **Divergência:** documentos antigos do repositório citam "International Lottery Ltda" e a marca "Sorte Nacional". Confirmar a razão social completa (com o tipo societário) e o CNPJ, e se os outros nomes são marca ou razão anterior |
| — | Domínio da empresa | **Ainda será feito** | Sem domínio não há e-mail institucional nem do encarregado; **os Termos de uso e a Privacidade não publicam** (o advogado exigiu sair do Gmail) |
| V3 | Modelo B como principal | **Sim, seguir** | O modelo A fica suspenso; modelo B é o produto (ainda não existe no código) |
| V4 | Autorização em nome da plataforma e homologação do globo | A plataforma é o **software**; o dono **vai pedir** autorização também, mas se não conseguir **não é problema**, porque a licença é do sorteio | Coerente com a D2 (cada promotora titular). **Nada nas peças ou no site afirma autorização da plataforma** enquanto não houver documento. O estágio da homologação do globo não foi informado: registrado como **desligado** |
| V6 | "UOL Host" | A imagem mostra o perfil **uolhost** (selo de verificado) com a peça "**UOL Anúncios** — Mais visibilidade começa com um anúncio — planos a partir de R$ 159,90/mês" (24 de julho) | Então é um **produto de anúncios** (e não só hospedagem). Não dá para saber, só pela peça, em que redes ou veículos esses planos veiculam. **Vai para a lista de consultas por escrito** (rifa autorizada pela SPA/MF; em que veículos roda; se há política de jogos); não entra em código antes da resposta |

### O que ainda se precisa do dono
1. **CNPJ** e a **razão social completa** (e a relação com "International Lottery
   Ltda" e "Sorte Nacional").
2. **Custo e margem** (explicação na resposta ao dono).
3. **Domínio**, e depois os e-mails institucional e do encarregado (com o cargo).
4. **Endereço oficial** na forma completa (rua, número, complemento, CEP).
5. **Estágio do globo** (se já há conversa com tabelionato).

### Respostas do dono, segunda leva (10/10/2026)

| Ponto | Resposta | Efeito |
|---|---|---|
| Razão social e CNPJ | **Serão definidos depois do lançamento**; sai da lista de pendências do dono | O anexo do advogado usa os campos `{{RAZAO_SOCIAL}}` e `{{CNPJ}}`. **Segue travando** a publicação de contrato, anexo, Termos e Privacidade (exigem os "Dados da empresa" completos) e as consultas à Meta e ao Google. Não vai ao advogado nem ao contador como pendência |
| Domínio | O dono decide **até segunda-feira, 12/10/2026** | Destrava os e-mails institucional e do encarregado |
| Autorização em nome da plataforma (V4) | Entendido; **não há necessidade de avisar agora** | Nenhuma peça ou página afirma autorização da plataforma. Sem aviso ao advogado nesta rodada |
| UOL Anúncios (V6) | Entendido | Entra na lista de consultas por escrito, depois do CNPJ |
| Anexo do modelo B | O dono pede o detalhamento para repassar ao advogado | `docs/PEDIDO-ANEXO-MODELO-B.md` |

### Contador: confirmação do anexo do modelo B (10/10/2026)

O contador confirmou os 8 pontos do modelo B, o nome "plataforma de gestão de
tráfego pago", os aceites independentes e o crédito de 12 meses (ver
`docs/RODADA-FINAL-CONTADOR.md`). **Segue travado**, e a pendência é do dono:
custo mensal, volume e margem desejada; e a razão social e o CNPJ, que ele pede
para o parecer e o plano de contas e que o dono deixou para depois do
lançamento. **Município (São Paulo) já está respondido e precisa ser
repassado a ele.**

### Contador: município e parecer (10/10/2026)

São Paulo recebido: ISS a **5%** para o item 10.08 (simulação). O parecer sai com
`{{RAZAO_SOCIAL}}` e `{{CNPJ}}` em aberto. **Recusei** a ação "sistema parametriza
ISS e retenção" (o sistema não calcula retenção nem emite NFS-e, Padrão do
segundo retorno). Ficaram abertas com ele: a fonte certa da retenção em São
Paulo (o art. 47-A do Decreto 58.175/2018 trata da base de cálculo) e o CNAE
(duas recomendações que se contradizem). Com o dono: custo, volume e margem, e em
qual base (sobre a receita da taxa ou sobre o custo).

### Contador: rascunho do parecer (10/10/2026)

Recebido o rascunho do parecer do modelo B (`docs/PARECER-CONTADOR-MODELO-B.md`),
com a revisão feita aqui. **Decisão do dono:** o custo mensal só aparece com a
plataforma ativa, então a simulação de custo e margem sai da Parte 1; o parecer
fica com a cláusula de revisão de preço aos 90 dias.

### Situação do critério da seção 8 (10/10/2026)

| Item | Situação |
|---|---|
| V1 a V6 | V1, V3, V4 e V6 respondidas; V2 é do contador (10.08, fechado); V5 (domínio) até 12/10/2026 |
| Advogado | Fechado, com as entregas dele pendentes (Portaria 7.638, art. 33, anexo do modelo B, consultas, termo de confidencialidade) |
| Contador | C1 a C6 e P1 a P5 fechados; rascunho do parecer recebido, **com pendências** (seção 3 do documento do parecer) |
| Parecer conjunto assinado | **Não**: falta a parte do advogado e as pendências do contador |
| Registro de decisões e PR de adequação | **Não**: o PR de adequação só sai com o seu aval |
| A13 (parecer bancário) e T2/T3 | A13 ainda **não foi contratado** (sua lista) |

A Parte 2 **ainda não começa** por este critério.

---

## Encerramento da fase do IRRF (10/10/2026)

Decisões do dono, com base na sugestão de encerramento:

| # | Decisão | Fundamento |
|---|---|---|
| I1 | **Modelo A**: retenção no pagamento do abastecimento; NFS-e no consumo, com IRRF destacado | É o único modelo cujos lançamentos fecham sem ativo ou passivo pendente (`docs/PARECER-CONTADOR-MODELO-B.md`, seções 14 a 16) |
| I2 | **Forma bruta**: a promotora abastece R$ 100,00 por R$ 100,00 de taxa, retém R$ 1,50 do pagamento e recolhe o DARF; a plataforma recebe R$ 98,50 e registra crédito de IRRF de R$ 1,50 | Mais simples no contrato, sem gross-up; a taxa que a promotora vê é a taxa que ela paga. O custo de caixa de R$ 1,50 fica com a plataforma |
| I3 | **Modelo B suspenso** até haver acordo de liquidação escrito (liquidação do IRRF a receber, quem paga o DARF) | Os dois desenhos de B não fecharam (seção 16). Isto **revê o V3** ("modelo B é o produto principal"): é decisão do dono e precisa ser lembrada na Parte 2 |

Condições registradas:
- O crédito de R$ 1,50 só se recupera se a plataforma tiver IRPJ a pagar no período; sem imposto a pagar, fica para compensação futura.
- No modelo A, a retenção é feita no pagamento, o que reduz o risco de multa por falta de retenção se a Receita entender que o momento é o pagamento. Se a Receita entender que o momento é o consumo, o recolhimento terá sido antecipado: é questão de prazo, a ser confirmada pelo advogado.

Riscos aceitos e responsáveis:

| Risco | Responsável | Situação |
|---|---|---|
| Momento do IRRF (pagamento ou consumo) | Advogado | Modelo A adotado; texto oficial dos arts. 209 e 718, II, ainda a ler |
| CSRF (4,65%) não retido sobre publicidade | Contador | Sem texto oficial que confirme a não retenção; SC Cosit 13/2022 não trata de CSRF |
| CNAE principal (73.11-4/00 para tráfego pago) | Dono e contador | Sem descrição oficial de tráfego; atividade principal (tráfego ou rifa) ainda não informada |
| ISS de promotora de outro município | Contador | Regra da lei de cada município não pesquisada; a plataforma informa, a promotora retém |
| Simulação de ISS e PIS/COFINS | Contador | Tabela corrigida; valores a usar: ISS 5% e PIS/COFINS 9,25% sobre a taxa |

Entregas que faltam para a parte contábil (prazo 19/10/2026):
- Lançamentos finais do modelo A, forma bruta, somando zero, com NFS-e de R$ 100,00 e o momento de cada lançamento.
- Quem paga o DARF e de qual valor (a promotora, R$ 1,50).
- Leitura dos arts. 209 e 718, II, do RIR/2018, anexada.
- Validação das decisões C1 a C6 e P1 a P5 quanto aos efeitos fiscais.
- Assinatura da parte contábil.

Cláusulas que o advogado precisa redigir no anexo do modelo B:
- Retenção de IRRF no pagamento do abastecimento, forma bruta, com a taxa de R$ 100,00 líquida de IRRF para a plataforma e o IRRF destacado na NFS-e.
- Responsabilidade da promotora pelo recolhimento do DARF, como fonte pagadora.
- Decisão sobre a responsabilidade solidária, que não foi verificada.

Esta fase **não encerra a Parte 1**. O critério da seção 8 continua valendo: parecer conjunto assinado, registro de decisões, PR de adequação e parecer de direito bancário.

---

## Plano para terminar a Parte 1 (10/10/2026) — em andamento, não fechada

Esta seção registra o caminho escolhido. Nenhum item abaixo está concluído.

| Etapa | O que falta | Responsável | Prazo | Situação |
|---|---|---|---|---|
| A | Parecer do advogado sobre os quatro pontos: base do IRRF (arts. 717 e 718 do RIR/2018, texto conferido); responsabilidade supletiva do beneficiário e regresso contra a promotora; mandato ou prestação de serviço sem mandato; troca de "modelo A" por "retenção no abastecimento" | Advogado | 5 dias úteis após o envio | Pedido enviado com a mensagem de 10/10; resposta pendente |
| A | Confirmação da Portaria SEAE/ME 7.638/2022 no DOU (vigência) | Advogado | 5 dias úteis | Pendente |
| A | Base do art. 33 da LGPD para hospedagem, armazenamento e IA; Anexo II das cláusulas-padrão da ANPD sem alteração | Advogado e dono | 5 dias úteis | Pendente |
| A | Consultas formais à Meta e ao Google | Advogado | 5 dias úteis, após razão social e CNPJ | Bloqueado até o lançamento |
| A | Termo de confidencialidade da equipe | Advogado | 5 dias úteis | Pendente |
| A | 15 cláusulas e 3 perguntas do anexo do modelo B | Advogado | 10 dias úteis | Suspenso até decisão sobre o modelo B |
| B | Parecer contábil: base legal corrigida (arts. 717 e 718); retirar "sem solidariedade" até a etapa A fechar; versão final assinada | Contador | 20/10/2026 | Parte contábil entregue em 19/10 com pendências; assinatura pendente |
| B | Assinatura do parecer conjunto (contábil e jurídico) | Contador e advogado | Após A e B | Pendente |
| C | Parecer de direito bancário contratado (critério da seção 8: "em andamento" basta) | Dono | Imediato | Não contratado |
| C | Domínio (V5) e endereço oficial completo para os dados da empresa | Dono | 12/10/2026 (domínio) | Pendente |
| C | Decisão sobre o anexo do modelo B (sai agora ou fica guardado) | Dono | Após a etapa A | Pendente |
| D | PR de adequação: decisões do IRRF (retenção no abastecimento, forma bruta), textos de contrato e Privacidade | Código, com aval do dono | Após a etapa B assinada | Não iniciado |
| D | Registro final de decisões | Dono e contador | Após a etapa B | Pendente |

Critério para declarar a Parte 1 fechada: etapas A e B concluídas, C com o parecer bancário em andamento, e D mesclado. Até lá, a Parte 2 continua parada.

Riscos aceitos até aqui (sem texto oficial que os confirme): momento do IRRF; CSRF sobre publicidade; CNAE 73.11-4/00 para tráfego pago; ISS de promotora de outro município; responsabilidade supletiva do beneficiário pelo IRRF não retido (Tema 333 do STF não decidido).

---

## Respostas do advogado e do contador aos quatro pontos (10/10/2026) — não aceitas ainda

Recebidas. Três pontos impedem o anexo e a parte contábil de fechar:

1. **"Prestação de serviço sem mandato" descreve o modelo A, não o B.** A resposta diz que a plataforma contrata a mídia em nome próprio e revende. Isso é conta própria, o modelo suspenso. No modelo B a promotora é titular da conta e paga a rede direto (V3 e D2). A escolha entre mandato e prestação sem mandato precisa ser refeita para o modelo B. O contador aceitou a descrição como "Modelo A" sem notar a contradição.
2. **Calendário da Reforma Tributária.** A resposta diz que a partir de 2026 PIS/COFINS e ISS são substituídos por IBS e CBS. Pela leitura da EC 132/2023 e da LC 214/2025 (a verificar no texto), a CBS substitui PIS/COFINS a partir de 2027, e o IBS entra gradualmente a partir de 2029. A simulação não deve ser refeita para 2026 com base nessa afirmação.
3. **Afirmações marcadas como "conferidas" e "a confirmar" ao mesmo tempo.** A Portaria 7.638 aparece como "confirmada" e, na mesma resposta, com o artigo "a confirmar". A data de publicação no DOU (20/10/2022) e o valor da CSLL retida (1,00%) não têm fonte citada. A pesquisa que fiz mostrou que a página do Ministério da Fazenda lista a portaria como "despublicada": a vigência continua sem confirmação.

Pontos ainda abertos:
- Aplicação do § 1º do art. 718 a plataformas digitais (Meta, Google, TikTok). A resposta não diz se a exclusão de valores repassados alcança a mídia paga na internet.
- Caminho do art. 33 da LGPD: o prazo das cláusulas-padrão da ANPD terminou em 23/08/2025. A resposta não diz se o caminho é o Anexo II sem alterações ou o consentimento específico, e o consentimento para hospedagem e IA é difícil de sustentar.
- Responsabilidade supletiva: concordo com o art. 128 do CTN e com a cláusula de comprovação do DARF. Isso fecha.

O que não fecha ainda: a parte contábil depende de um modelo que a resposta do advogado contradiz. Não incorporar "conta própria" ao anexo nem ao parecer contábil até que o advogado descreva a estrutura do modelo B.

---

## Terceira resposta do advogado (10/10/2026) — conferida, ainda não aceita

**Aceito:** a descrição do modelo B (promotora titular, paga a rede direto, plataforma presta gestão com acesso de parceiro, taxa sobre o gasto lido) e a redação do objeto do anexo do modelo B. A redação entra no rascunho do contrato, não em código.

**Não aceito ainda:**

1. **Contradição sobre agência.** Na rodada anterior ele disse que a plataforma não é agência de publicidade. Agora diz que, no modelo A, "a plataforma é a agência" para aplicar o § 1º do art. 718. Não pode ser as duas coisas. Isso afeta quem recolhe o IRRF.
2. **Solução de Consulta Cosit 30/2022 citada além do que trata.** Pela pesquisa, a SC 30/2022 trata de empresa que veicula propaganda em equipamentos próprios (televisores em pontos de venda). Não trata de plataforma que paga Google, Meta ou TikTok. A conclusão de que o valor da mídia fica fora da base não se sustenta com essa fonte.
3. **Solução de Consulta Cosit 234/2025 não foi considerada.** Pela pesquisa, ela diz que o IRRF sobre serviços de propaganda deve ser recolhido pela agência beneficiária dos rendimentos. Isso pode mudar quem responde pelo recolhimento, em direção oposta à tese da promotora como responsável. Precisa de leitura integral antes de qualquer cláusula.
4. **Alíquotas de CBS e IBS (8,7% e 19,5%) não têm fonte.** A pesquisa mostra referências de 8,8% e 17,7% em guias, e a LC 214 manda fixar as alíquotas por resolução do Senado; uma estimativa do CGIBS fala em 27,91%, acima da trava de 26,5%. Não usar valores fixos até a resolução. A LC 214 também foi alterada pela LC 227/2026, a verificar.
5. **Art. 53, II, da Lei 7.450/1985 "corresponde" ao art. 718, II.** Não confirmado. A pesquisa cita a Lei 7.450 com alíquota de 5%, o que é diferente do 1,5% do RIR/2018.
6. **ANPD continua sem resposta sobre os contratos.** Ainda não sabemos se Railway, Cloudflare e Chatbase incorporaram o Anexo II sem alterações. Isso é do dono, por meio dos contratos ou dos aditivos.

**Efeito:** a Parte 1 continua aberta no item do IRRF (responsável e base) e nas alíquotas da Reforma Tributária. O modelo B e o objeto do anexo podem avançar como rascunho.

---

## Solução para sair do ciclo (10/10/2026): premissas congeladas e rodada única de fechamento

### Pesquisa que mudou o caminho
- **Solução de Consulta Cosit 234/2025** (publicada no DOU em 21/11/2025, texto
  integral não lido): o IRRF sobre serviços de propaganda e publicidade é
  recolhido pela **agência beneficiária**, mesmo quando ela não distribui a
  propaganda aos veículos, e isso alcança a criação e o planejamento de campanhas.
  Pela resposta do advogado, a plataforma seria a beneficiária da taxa. Isso
  **inverte** a tese de que a promotora retém e recolhe. A alíquota citada nas
  fontes varia (1,5% no art. 718, II, do RIR/2018 e 4,8% na IN 1.234/2012 segundo
  uma fonte): **confirmar no texto antes de usar**.
- **CBS e IBS:** não há resolução do Senado fixando as alíquotas de referência. Em
  2026 as alíquotas são de teste (CBS 0,9%, IBS 0,1%). Os números de 8,7% e 19,5%
  não têm fonte e não entram na simulação. A simulação usa PIS/COFINS e ISS
  enquanto estiverem em vigor, e marca CBS/IBS como "a definir pelo Senado".

### Premissas congeladas (não reabrir sem fato novo)
| # | Premissa | Fonte |
|---|---|---|
| P1 | Modelo B: a promotora é titular da conta e paga a rede direto; a plataforma presta gestão com acesso de parceiro; taxa sobre o gasto lido | Advogado (3ª resposta), dono |
| P2 | Forma **bruta**: a taxa de R$ 100 é o valor pago pela promotora; a plataforma absorve o IRRF no caixa e apura o crédito contra o IRPJ | Dono (decisão de 10/10) |
| P3 | Sede em São Paulo; ISS de 5% no item 10.08 sobre a taxa | Contador, V1 |
| P4 | Não há solidariedade nem mandato: prestação de serviço em nome próprio perante o cliente (a promotora), com acesso de parceiro às redes | Advogado (3ª resposta) |
| P5 | Não há CBS/IBS fixados; PIS/COFINS e ISS seguem na simulação | Pesquisa acima |
| P6 | Número da autorização SPA/MF em toda peça, como política da plataforma | Advogado, D1 |
| P7 | Nome do IRRF: "IRRF a 1,5%", sem novo nome | Advogado |
| P8 | Modelos da fase IRRF renomeados: **"recolhimento pela plataforma"** (quando a plataforma é a beneficiária, SC 234/2025) e **"retenção pela promotora"** (tese anterior). O "A/B" sai dos documentos da fase | Esta seção |

### Rodada única de fechamento (advogado e contador)
Seis perguntas fechadas, cada uma com a opção padrão. Prazo de **5 dias úteis** a
partir do envio. Sem resposta, vale o padrão, como decisão do dono. Depois disso,
só fato novo reabre.

1. **Quem recolhe o IRRF sobre a taxa?** Padrão: a plataforma, como beneficiária
   (SC 234/2025), sem retenção pela promotora. Alternativa: retenção pela promotora
   com a tese anterior.
2. **Base do IRRF:** R$ 100 (taxa), e não o gasto de mídia. Padrão: taxa.
3. **Texto do art. 718, II, do RIR/2018 e da IN 1.234/2012** (alíquota: 1,5% ou 4,8%).
   Padrão: 1,5% do art. 718, II, até o texto mostrar outra coisa.
4. **Portaria SEAE/ME 7.638/2022:** vigência no DOU. Padrão: mantida como base
   da política do número de autorização (P6).
5. **Cláusulas-padrão da ANPD para Railway, Cloudflare e Chatbase:** ver item abaixo.
6. **Objeto do anexo do modelo B:** redação de P1 e P4. Padrão: a redação aceita
   pelo advogado na terceira resposta.

### O que é do dono (4 decisões, sem novas perguntas aos profissionais)
- Atividade principal: tráfego (73.11-4/00) ou rifa. Padrão: 73.11-4/00.
- Domínio (até 12/10) e endereço completo.
- Contrato com Railway, Cloudflare e Chatbase: verificar se incorporam o Anexo II da
  ANPD sem alterações (é o único caminho sem consentimento para hospedagem e IA).
- Contratar o parecer de direito bancário.

### O que fecha a Parte 1
1. Respostas da rodada única (ou padrão após 5 dias úteis).
2. Parte contábil reemitida com P1 a P8, assinada pelo contador.
3. Parte jurídica assinada pelo advogado.
4. Decisões do dono acima.
5. PR de adequação: só depois de 1 a 4 e com o seu aval.

Regra de ouro daqui em diante: nenhuma resposta parcial reabre premissa; cada
resposta entra uma vez, com veredito (aceita, recusada ou pendente).

---

## Respostas definitivas do advogado (10/10/2026) — veredito por item

| # | Item | Veredito | Motivo |
|---|---|---|---|
| 1 | Quem recolhe o IRRF | **Recusado como escrito** | Diz "Padrão aplicado: a plataforma, como beneficiária" e, no texto, descreve a promotora retendo e recolhendo. O padrão era a plataforma, por SC 234/2025. A SC 234/2025 não é citada. Precisa de uma única resposta |
| 2 | Base do IRRF | Aceito, condicionado | Taxa de R$ 100 no modelo B. Citações de SC 223/2024 e do §1º dependem de texto |
| 3 | Art. 718, II, e IN 1.234/2012 | **Pendente** | Usa a IN 1.234/2012, art. 16, §1º, II, como regra para agência privada. A contadora anterior disse que a IN 1.234 é de órgãos públicos. Contradição a resolver. O "Manual MAFON 2025" e o texto do art. 718 foram dados como conferidos, sem link |
| 4 | Portaria 7.638/2022 | **Pendente de prova** | Afirma vigência "confirmada" com página "atualizada em 25/08/2026", sem link. A pesquisa anterior indicou listagem como "despublicada". Precisa de captura do DOU ou do ato de revogação |
| 5 | Cláusulas-padrão ANPD | Aceito como caminho; **depende de você** | O art. 11 da Res. 19/2024 é citado sem texto. A verificação dos contratos é sua |
| 6 | Objeto do anexo (modelo B) | **Aceito** | Coincide com P1 e P4 |

Decisões do dono:
- Atividade principal: **73.11-4/00** (aceito, conforme padrão).
- Domínio e endereço: pendentes.
- Verificação dos contratos Railway, Cloudflare e Chatbase: pendente.
- Parecer de direito bancário: recomendado, não contratado.

### Pedido de correção (única rodada, 5 dias úteis)
1. Item 1: uma resposta só. Se a plataforma é a beneficiária (SC 234/2025), o recolhimento é dela e a promotora não retém. Se a promotora retém, explicar por que a SC 234/2025 não se aplica. Não aceito as duas teses juntas.
2. Item 3: explicar por que a IN 1.234/2012 se aplica a agência privada, dado o que o contador já registrou. Se não se aplica, retirar a citação.
3. Item 4: anexar captura do DOU ou do ato de revogação/republicação. Sem isso, a Portaria fica como política da plataforma, não como base legal.
4. Para todos os itens: link ou captura da fonte oficial. "Conferido" sem fonte não entra no parecer.

### Efeito na Parte 1
A Parte 1 continua aberta no item 1 (responsável pelo IRRF), que muda a cláusula e o lançamento contábil. Os itens 2, 5 e 6 podem ser redigidos. O item 4 depende de prova. O item 3 depende de resposta. Sem a correção do item 1, a parte contábil não pode ser reemitida.

---

## Correção do advogado (10/10/2026) — veredito

**Item 1 (quem recolhe o IRRF): aceito em tese, com duas consequências.**
- A tese é uma só: a plataforma recolhe; a promotora paga R$ 100,00 e não retém. A citação da SC 234/2025 bate com o resumo que pesquisei (beneficiária recolhe). O texto integral não foi lido por mim.
- **Contradição de qualificação:** ele diz que "a plataforma é a agência de propaganda beneficiária". Nas rodadas anteriores disse o contrário e o anexo deve evitar a palavra "agência". Se a plataforma é agência para o IRRF, a qualificação precisa estar explícita, com a consequência para o CNAE 73.11-4/00. Uma só qualificação, por escrito.
- **Muda o encerramento da fase do IRRF:** as decisões I1 e I2 (retenção pela promotora, forma bruta) estavam baseadas na tese antiga. Com a tese nova, a promotora não retém e a plataforma recolhe o DARF do próprio caixa. Lançamentos resultantes (simples e fechados):
  - Abastecimento: Caixa R$ 100,00 (D) / Adiantamento de cliente R$ 100,00 (C).
  - Consumo: Adiantamento de cliente R$ 100,00 (D) / Receita de taxa R$ 100,00 (C).
  - Recolhimento do DARF: IRRF a compensar R$ 1,50 (D) / Caixa R$ 1,50 (C).
  Somam zero em cada etapa. O crédito de R$ 1,50 fica no ativo até a compensação com o IRPJ.
- **Decisão do dono necessária:** confirmar a mudança de I1 e I2 (recolhimento pela plataforma). Sem isso, a cláusula e os lançamentos anteriores continuam valendo.

**Item 3 (IN 1.234/2012): aceito a retirada.** Substitui por IN SRF 123/1992 e PN CST 7/1986. Os dois últimos não foram lidos por mim.

**Item 4 (Portaria 7.638/2022): não aceito como prova ainda.**
- A "captura do DOU" é uma tabela digitada, não uma imagem ou PDF da página. Para o parecer, é preciso a captura real (PDF ou imagem da edição de 20/10/2022, seção 1, página 25).
- A afirmação de que não há ato de revogação é uma ausência, e a página do Governo Federal que pesquisei listava a portaria como "despublicada". Essa divergência continua sem explicação.
- Até chegar a captura, a Portaria fica como política da plataforma (P6), não como base legal.

**Efeito na Parte 1:** o item 1 fecha a cláusula do IRRF e os lançamentos, mas depende de (a) uma qualificação única de agência, (b) a sua confirmação de I1 e I2. O item 3 fecha com as normas que o advogado citou, depois de conferidas. O item 4 fecha com a captura.

---

## Resposta do advogado sobre I1/I2 e qualificação (10/10/2026) — veredito

**Confirmação de I1 e I2 pelo advogado: não vale.** A decisão de mudar o recolhimento
é do dono. Ela só fica registrada quando o dono confirmar por escrito. Até lá, I1 e I2
seguem como estavam, com a nota de que dependem dessa confirmação.

**Cláusula do IRRF (plataforma recolhe, promotora paga a taxa integral): aceita como
rascunho.** Sem a palavra "agência" na descrição comercial.

**Qualificação "agência de propaganda beneficiária" para fins de IRRF: não aceita.**
- Não é "tese única": a qualificação comercial ("prestadora de serviço") e a tributária
  ("agência") divergem no mesmo contrato. A Receita verifica a substância, e uma
  declaração que contradiz o contrato é um risco.
- A SC 234/2025 fala de "agência de propaganda beneficiária", e o advogado afirma que
  basta ser beneficiária. Essa é uma interpretação dele, não o texto da SC.
- Uma solução de consulta, pela regra geral, vincula a Receita em relação ao consulente.
  Não é norma para a plataforma. O advogado não diz por que a SC vale para nós. A
  verificar.
- A definição de agência de propaganda vem da Lei 4.680/1965 e do regime de
  agências. Não foi citada nem aplicada. Antes de qualificar a plataforma como agência,
  é preciso dizer se ela atende a essa definição.
- Pedido: qualificar pelo que a plataforma faz (serviço de propaganda e publicidade
  prestado à promotora), sem o rótulo "agência", e demonstrar que essa qualificação
  basta para o recolhimento sob a SC 234/2025.

**Endereço "Rua Torre da Alfândega, 163, Vila Amália, CEP 02618-200": não usar.**
Nenhuma fonte deste processo informou esse endereço. O dono disse que o endereço oficial
está pendente. Um endereço inventado nos dados da empresa iria ao Termo de uso, à
Privacidade e ao contrato.

**Pendências do dono (sem mudança):**
- Confirmar I1 e I2 (recolhimento pela plataforma), por escrito.
- Domínio (até 12/10) e endereço oficial, informado pelo dono e comprovado (ex.: contrato
  social ou cartão CNPJ). Não usar o endereço da correção do advogado.
- Verificar os contratos de Railway, Cloudflare e Chatbase com o Anexo II da ANPD.
- Contratar o parecer bancário (recomendado).

**Pendências do advogado:** a qualificação pela substância, a regra sobre vinculação da
SC 234/2025 e a comparação com a Lei 4.680/1965; e a origem do endereço apresentado.

---

## Decisões do dono (10/10/2026): endereço, recolhimento e CNAE

**Endereço:** o dono informa que "Rua Torre da Alfândega, 163, Vila Amália, CEP 02618-200" é o endereço da alteração do CNPJ em andamento. Fica como **informado, não comprovado**. Não vai aos Termos, à Privacidade nem ao contrato até o cartão CNPJ alterado ou o comprovante de protocolo estar no dossiê. O complemento ("[complemento]" na resposta do advogado) ainda está em branco.

**Recolhimento do IRRF pela plataforma (I1 e I2): confirmado pelo dono.** A promotora paga a taxa integral e não retém. Os lançamentos antigos com retenção pela promotora devem ser estornados e refeitos. Lançamentos do recolhimento:
- Abastecimento: Caixa R$ 100 (D) / Adiantamento R$ 100 (C).
- Consumo: Adiantamento R$ 100 (D) / Receita de taxa R$ 100 (C).
- Recolhimento do DARF: IRRF a compensar R$ 1,50 (D) / Caixa R$ 1,50 (C).

**Qualificação "agência": não.** A plataforma não se qualifica como agência de propaganda, nem para o IRRF nem para o contrato.
- O IRRF do art. 718, II, incide sobre a natureza do serviço (propaganda e publicidade), não sobre o CNAE. O CNAE não decide a retenção.
- Resta uma confirmação do advogado, em uma linha: que o recolhimento pelo beneficiário vale pela natureza do serviço do art. 718, II, sem a qualificação de agência. Padrão: sim.

**CNAE: recomendação para encerrar.**
- **Principal: 73.19-0/99 (Outras atividades de publicidade não especificadas anteriormente).** Descreve a gestão de mídia paga prestada à promotora sem usar a palavra "agência". O 73.11-4/00 sai da principal.
- **Secundário: 63.11-9/00 (provedores de aplicação e hospedagem), somente se a plataforma de software for mantida na mesma empresa.** Isso precisa ser confirmado pelo dono.
- O ISS continua no item 10.08 da LC 116/2003. O item de serviço não depende do CNAE.
- A regra usual para a atividade principal é a que gera a maior receita. Se a taxa de venda de rifas for maior que a taxa de gestão, o código principal muda. Essa informação ainda não foi dada pelo dono.
- A alteração do CNPJ em andamento é o momento de registrar o CNAE. Não precisa de outra alteração depois.

**O que fecha a Parte 1 agora:**
1. Advogado: uma linha confirmando o recolhimento pelo beneficiário sem qualificação de agência (padrão: sim).
2. Contador: reemitir a parte contábil com o CNAE 73.19-0/99, o recolhimento pela plataforma e os lançamentos acima, e assinar.
3. Dono: cartão CNPJ alterado (com endereço e CNAE) ou protocolo; domínio até 12/10; verificação dos contratos Railway, Cloudflare e Chatbase (Anexo II da ANPD); contratar o parecer bancário.
4. Advogado: assinar a parte jurídica depois de 1 a 3.
5. PR de adequação, somente depois de 1 a 4 e com o seu aval.

---

## Estado da Parte 1 em 10/10/2026: não encerrada

Pedido do dono: encerrar. Não foi registrado como encerrado, porque quatro itens
impedem o fechamento e um deles afeta o cartão CNPJ em alteração.

| Item | Responsável | Por que impede | Ação mínima |
|---|---|---|---|
| Maior receita própria: taxa de gestão e comissão sobre rifas (valores mensais) | Dono | Define o CNAE principal. Sem isso, o CNAE pode sair errado no CNPJ | Estimativa basta |
| CNAE secundário para a comissão sobre rifas (sem 92.00-3/00) | Advogado | Se a comissão for receita própria, precisa de código | Indicar código |
| §1º do art. 718: alcança plataforma digital (Meta, Google, TikTok)? | Advogado | Define se a base do IRRF é a taxa ou o valor total | Uma linha com fonte |
| CSLL retida: alíquota e norma | Advogado | Entra na simulação | Uma linha com fonte |
| Reforma Tributária: a resposta do contador repete que IBS e CBS substituem PIS/COFINS/ISS "a partir de 2026". Está errado: 2026 é ano de teste (CBS 0,9%, IBS 0,1%). A substituição começa em 2027 (CBS) e 2029 (IBS) | Contador | Corrige a simulação | Reemitir com o calendário certo |

Além disso, sem ação do dono: cartão CNPJ alterado (ou protocolo com CNAE),
domínio (até 12/10), verificação dos contratos com o Anexo II da ANPD, e parecer
de direito bancário (recomendado).

**Decisão que cabe ao dono agora (escolha uma):**
- **A.** Informar a receita própria (estimativa). Com isso, o CNAE principal fecha hoje.
- **B.** Encerrar com CNAE principal provisório **73.19-0/99** e risco aceito, sujeito a
  revisão quando a receita de rifas for conhecida. Só vale se o CNPJ ainda não foi
  protocolado com outro CNAE.

---

## Cláusula de remuneração (cobrança por rifa): aval do advogado (10/10/2026)

A cláusula X.1 a X.13 do contrato da promotora (texto em
`docs/RESPOSTA-ADVOGADO-COBRANCA.md`, seção 4) foi **aprovada** pelo
advogado, com a publicação autorizada; o bloqueio por falta de pagamento
(X.13 a), que ele tinha condicionado, existe no sistema. Ele assina aqui a
parte jurídica, com a data, quando receber a confirmação de que:

- [ ] a tabela de cobrança foi montada (Cobrança → Tabela de cobrança), antes
      do primeiro aceite;
- [ ] a versão nova do contrato da promotora, com a cláusula X, foi publicada
      (Configurações → Contrato da promotora).

Assinatura da parte jurídica: _pendente_.

Isto não encerra a Parte 1: os itens da seção "Estado da Parte 1" acima seguem
como estão.


---

## Decisões do dono, tarde (10/10/2026): CNAE, receita principal e gateway

| # | Decisão | Efeito |
|---|---|---|
| K-CNAE | **Opção B**: o CNAE principal é o do **serviço de software da plataforma**, não o de publicidade. Proposta ao contador: principal 63.11-9/00; secundários 74.90-1/04 (se a taxa da venda for lida como intermediação) e 73.19-0/99 (patrocinado, banner e tráfego); nunca 92.00-3 | Substitui a recomendação 73.19-0/99 e a opção A/B da seção "Estado da Parte 1". Conferência do contador em `docs/PEDIDO-CONTADOR-COBRANCA.md` (K1) |
| K-RECEITA | A receita principal é o serviço de software (a taxa por rifa vendida e a taxa Pix). **O tráfego pago é serviço secundário, incluído no serviço da plataforma** | O pedido ao contador sobre a tributação da cobrança por rifa, que ainda não tinha sido enviado, sai agora (`docs/PEDIDO-CONTADOR-COBRANCA.md`, K2 a K12) |
| K-GATEWAY | **Pagar.me (Stone)**, com recebedor por promotora e divisão do Pix na origem. Pela pesquisa do dono, **Asaas e Mercado Pago não aceitam rifa**. Ficaram de fora: os gateways credenciados pela LOTEP (servem a operadores de loteria estadual, outro regime — a rifa aqui é promoção comercial autorizada pela SPA/MF) e os citados sem confirmação | Integração nova no código (`docs/PENDENCIAS.md`, seção 2). O advogado confirma que a conclusão de 07/10 ("a plataforma não é subcredenciadora, porque o provedor recebe e divide") vale igual com o Pagar.me. O parecer bancário trata o Pagar.me no lugar do Asaas |

O que segue aberto da Parte 1 não muda: a assinatura do advogado (tabela e
contrato), as respostas do contador (agora K1 a K12 e a reemissão), o
domínio e o endereço, os contratos com o Anexo II da ANPD, o parecer
bancário, a Tesouraria e os perfis de equipe, e o saldo pré-pago.

---

## Decisões do dono por blocos (10/10/2026, noite): equipe, saldo e tráfego

| # | Pergunta | Decisão | O que muda |
|---|---|---|---|
| A1 | Perfis de equipe | **Os 6 perfis**: Atendimento, Financeiro, Verificação, Gestão da plataforma, Marketing e Contador (só leitura, desligado no início). O mecanismo é feito uma vez; o master liga os que usar | Papel `equipe` com perfis fechados em `shared/access.ts`; o servidor barra por seção; `npm run isolation` prova cada perfil (`docs/PLANO-FINANCEIRO.md`, seção 9). Entra no menu da reformulação |
| A2 | Tesouraria | **Depois do lançamento**, com o lugar reservado no menu | Até lá, Cobrança e Exportações cobrem o mês. Depende das respostas do contador |
| A3 | Resultado do sorteio oficial | **Só o master, com senha e código do autenticador** (também na nova extração do globo) | Hoje esses dois atos não pedem o segundo fator: entra no código |
| A4 | Contador externo | **Sem login**: o master baixa o extrato do mês, sem dado pessoal | O perfil Contador entra com a Tesouraria e o contrato de operador (E6) |
| A5 | Segundo fator | **Obrigatório para toda a equipe e o master**; para o organizador, recomendado | Entra no código junto com os perfis |
| B1 | Saldo pré-pago | **Acaba: cada compra tem o próprio Pix** (anúncio patrocinado, banner, taxa do tráfego); a sobra volta em dinheiro pela devolução parcial do próprio Pix (depois de 90 dias, por transferência — a confirmar no gateway). O reembolso do saldo deixa de existir. Os créditos do assistente ficam como estão ("créditos de uso") | Refaz o livro do patrocínio, a recarga, o banner, a reserva do tráfego e a retenção cautelar (que passa a segurar o crédito do presente e as devoluções pendentes) |
| B2 | Créditos avulsos do assistente | **Vencem em 12 meses, com aviso 30 dias antes**; a franquia segue vencendo no ciclo | Vencimento, aviso e baixa no livro; texto no contrato; tratamento contábil na K10 |
| B3 | Conta de recebimento da promotora | **Obrigatória em qualquer gateway** para vender online (sem ela, só pelo cambista). O gateway provável é o Pagar.me, ainda a confirmar | A plataforma nunca segura dinheiro de rifa; a parte da promotora vai direto para ela |
| B4 | Tráfego pago no lançamento | **Entra no lançamento**; nunca sai do dinheiro da rifa; é sempre pago à parte, e a verba de cada campanha é só dela, do que foi pago para ela | Sem saldo guardado, não depende do parecer bancário |
| B5 | De quem é a conta de anúncio | **Da promotora**: ela paga o Meta e o Google direto; a plataforma gere com acesso de parceiro e cobra a taxa por Pix próprio | É o modelo B, que **não existe no código**: código novo. O modelo A (a plataforma compra a mídia) fica no código, desligado. Depende do anexo do modelo B (advogado), da K11 (contador) e da autorização do Meta para cada promotora |
| — | Parecer bancário | **Espera**, com uma linha do advogado confirmando; contratar antes de ligar a guarda da comissão | Sai da lista do lançamento se o advogado confirmar |

**Ponto a fechar no plano do tráfego (B5):** a taxa da plataforma no modelo
da promotora é cobrada **sobre a verba, inteira na aprovação** (a regra que
já vale para a taxa), ou **sobre o gasto lido**, cobrada depois como valor
devido? Sem saldo, não há "saldo de taxa" para debitar.

**Ao advogado (duas linhas):** (1) "a plataforma não é subcredenciadora"
vale com o gateway novo, com a conta de recebimento obrigatória da
promotora; (2) sem saldo guardado e com a guarda da comissão desligada, o
parecer bancário pode esperar.

## Decisões do dono (13/10/2026): subdomínio, selo, carteira e contenção

Registro das respostas do dono às perguntas da análise do contrato. Cada
item vira código, texto ou pergunta, conforme indicado.

| # | Tema | Decisão | O que muda |
|---|---|---|---|
| A2 | Modelos de tráfego | Os **dois modelos (A e B) ficam disponíveis**; a análise é caso a caso | Os dois continuam no código; a escolha é por campanha |
| A3 | Agregador do Google e destino | **Subdomínio por organização e por afiliado**; a divulgação sai como white label | `shared/subdominio.ts` (PR #257); o domínio base é de configuração. Site novo a comprar: loteriasnacional.com ou .com.br |
| A4 | Globo sem manifestação | Nada é dito sobre o globo antes da homologação; **selo "em aberto"** que vira selo quando o documento sobe; **nenhum recurso é travado** pelo selo; auditoria técnica da plataforma | Estado novo do selo, sem bloqueio. **Ajuste:** o selo aparece na tela de vídeo do globo quando ele está **ao vivo** |
| A5 | Diretrizes no contrato de concordância | As regras do serviço são copiadas para o termo de aceite; o Lucky faz análise periódica | Painel de análise para o advogado (página publicada) |
| A12 | Portal (Taboola, Outbrain, UOL, portais) | A verificar por análise com IA | Pendente |
| A13 | Carteira do usuário | **Cada usuário tem uma carteira**; de lá direciona créditos ou dinheiro para os serviços (tráfego, campanhas, banners e outros). No painel do organizador, um **painel de hierarquia** lista todos os serviços cobrados por ali | Modelo de carteira, a definir com o advogado (ver perguntas) |
| A15 | Saldo na rescisão ou banimento | O saldo dos serviços da plataforma é **sacável proporcionalmente** ao restante. O que for de plataforma de terceiros é tratado **diretamente** pela promotora | Conflito com a retenção cautelar no banimento (ver perguntas) |
| A16 | Taxa e erro | Erro **comprovado da plataforma**: o valor pode ser solicitado. Erro do usuário: vale o que o contrato aceito prevê | Pedido de devolução com prova |
| A17 | Carência do Pix | Entra no **fechamento como os demais recursos** | Contabilização (contador) |
| A18 | Excedente | A plataforma **não cobra excedente**; deve existir **mecanismo de contenção**: não ultrapassa o saldo e **sempre deixa um mínimo** | Contenção no tráfego (código a construir, ver perguntas) |
| Item 7 | Taxa de gestão | Taxa sobre o valor total da verba, debitada integralmente; repassada à plataforma; sobra vira **crédito, não dinheiro** | Já é o comportamento do código |

## Decisões do dono (13/10/2026, rodada 2): créditos, mínimo, selo e pipeline

| # | Tema | Decisão | O que muda |
|---|---|---|---|
| A4 | Selo do globo | **Sim**: o selo aparece sobre a tela de vídeo do globo quando ele estiver **ao vivo** | Selo na tela do vídeo, só com o globo no ar; nunca bloqueia recurso |
| A13 | Carteira | **Não é carteira com dinheiro real**. O usuário tem **créditos** que usa nos serviços que quiser (tráfego, campanhas, banners e outros). O painel do organizador mostra a hierarquia de todos os serviços cobrados por esse painel | Modelo de créditos de uso, sem resgate em dinheiro. Ver perguntas ao advogado |
| A14 | Medidas provisórias | No painel do admin, cada caso traz as **opções acima** para o responsável do setor escolher, conforme a análise | Ações por caso no painel do admin, com as opções (a), (b) e (c) já descritas |
| A15 | Saldo na rescisão ou banimento | (decisão anterior) saque proporcional dos serviços da plataforma | Sem mudança |
| A18 | Mínimo da contenção | **R$ 5,00** sempre sem gastar | Valor fixo de contenção no tráfego |
| Pipeline | Análise de documentos | **Pipeline simples**: entrada do documento → análise → revisão do advogado → **recusado** ou **concluído** | Fluxo de estados para documentos (contrato, anexos e outros), com o advogado na etapa de revisão |

## Decisões do dono (13/10/2026, rodada 3): wallet de créditos, saque, contenção e pipeline

| # | Tema | Decisão | O que muda |
|---|---|---|---|
| A13 | Wallet | **Wallet de créditos para serviços**, sem fluxo de dinheiro. O usuário usa os créditos nos serviços da plataforma | Modelo de crédito de uso, sem saque como regra de negócio. O saque tem regra própria (A15) |
| A15 | Cálculo do saque na rescisão ou banimento | Valor = **saldo da carteira + taxa de saque** (sinal a confirmar, ver perguntas) | Cálculo do saque proporcional |
| A16 | Erro da plataforma | Estorno **integral** para o usuário | Devolução integral quando o erro for comprovado da plataforma |
| A18 | Contenção | A plataforma **arca com o custo + R$ 5,00**; o valor vira **saldo negativo da promotora**, debitado automaticamente quando ela repõe o saldo | Mecanismo de dívida automática (ver perguntas: conflito com "sem excedente") |
| A14 | Medidas provisórias | Sem risco jurídico: a avaliação vem direto do advogado, que determina o que é resolvido. O admin escolhe, por caso, a opção da análise | Ações por caso no painel do admin |
| Pipeline | Análise de casos | Recebe contratos, quebras de contrato, contabilidade, problemas técnicos e financeiros. Uma pessoa ou a IA analisa o caso e **direciona para o setor certo**. O status é atualizado para o solicitante. **Não é atendimento ao vivo**: a resolução pode levar tempo. Liga **todos os setores** da plataforma | Fluxo de status por caso, com triagem e direcionamento |
| Nome do site | Domínio | Só depois de ver a disponibilidade | Pendente |
| Setores (A1 e A3 de perfis) | Equipe | Os seis setores já listados e aceitos: Atendimento, Financeiro, Verificação, Gestão da plataforma, Marketing e Contador | Sem mudança |
| Receita de créditos não usados (item 8) | Contabilização | Entra na **conta central como receita**, com os impostos descontados normalmente | Contador confirma o tratamento |
| ISS do sobra (item 10) | Tributação | Se já foi tributado uma vez, **não é tributado de novo** | Regra de não bis in idem na sobra |
| Sobra do tráfego (item 11) | Sobra | **Volta como crédito**; o usuário pode pedir o saldo em dinheiro, respeitando as regras | Resolve o conflito B1 × item 7 |
| Serviços dos créditos (item 12) | Escopo | **Todos os serviços já existentes** no sistema e no cronograma | Sem mudança |
| Carência do Pix (item 9) | Advogado e contador | O **advogado** recomenda carência de 7 dias para o estorno do Pix antes de o saldo pagar a rede, e cláusula de reposição do saldo em caso de estorno. Nas notas do contador, o Pix estornado após o pagamento à rede é prejuízo da plataforma | Carência de 7 dias para o saldo valer |

## Decisões do dono (13/10/2026, rodada 4): saque, contenção com prejuízo, triagem e conflito de ISS

| # | Tema | Decisão | O que muda |
|---|---|---|---|
| A15 | Cálculo do saque | **Saldo da carteira − taxa de saque** ("descontado") | Fórmula do saque proporcional |
| A18 | Margem e inadimplência | A plataforma dá a **margem de R$ 5,00** sobre o custo. Se a promotora não pagar, **a plataforma arca com o prejuízo**, registrado na contabilidade e no fechamento de Caixa. O saldo negativo da promotora é debitado quando ela repõe o saldo | Prejuízo de inadimplência como despesa da plataforma; saldo negativo recuperável |
| Pipeline (triagem) | Quem triagem | **Humano e IA**, para ninguém sobrecarregar. A IA pode ter direcionamento automático ou só com supervisão humana (ainda a definir). Precisa de **mecanismo de folga** para o humano, sem acúmulo de casos | Fila de triagem com regra de cobertura e escalonamento (ver perguntas) |
| Item 8 | Créditos não usados | **Contador**: entra como receita na conta central, tributada normalmente | Confirmado pelo contador |
| Item 10 | Sobra já tributada | **Conflito**: o dono decidiu que não é tributada de novo. O contador afirma que a Prefeitura de São Paulo trata a apropriação do crédito como **novo fato gerador de ISS** e cita Lei 13.701/2003 (arts. 1º e 14) e Solução de Consulta SF/DEJUG 41/2013. **Citações ainda não conferidas**. Antes de fechar, o advogado confirma o texto da lei e da solução de consulta | Pendente de confirmação; não aplicar a regra de não bis in idem até decidir |
| Maior receita própria | CNAE | Contador espera a confirmação do dono: taxa de gestão ou comissão de rifas | Pendente do dono |
| Domínio | Site | O dono verifica hoje | Pendente |

## Decisões do dono (13/10/2026, rodada 5): ISS da sobra, triagem com interruptor e receita principal

| # | Tema | Decisão | O que muda |
|---|---|---|---|
| Item 10 | ISS da sobra já tributada | **Vale o que o contador disse**: a apropriação do crédito não usado é novo fato gerador de ISS. As citações (Lei 13.701/2003, arts. 1º e 14; SF/DEJUG 41/2013) ainda devem ser conferidas pelo advogado antes de virar cláusula | Sobra com ISS na apropriação; a regra "não tributar de novo" sai |
| Triagem (item 2) | Modo de atendimento | **Interruptor**: o humano aciona a **IA autônoma** ou a **IA supervisionada** conforme a demanda. Com muita demanda, o usuário troca o fluxo para manter o equilíbrio. Há **vários atendentes** disponíveis | Interruptor de modo de triagem no painel; regra de quais casos a IA pode decidir sozinha ainda a definir |
| Receita principal | CNAE e item de serviço | A **maior receita é da rifa**, porque a gestão é opcional | Pergunta ao advogado e ao contador sobre o item de serviço (ver perguntas) |
| Item 3 | Não respondido | Em branco na resposta | Pendente |

## Parecer do advogado sobre as perguntas de 13/10/2026 (rodada 6)

O advogado respondeu as perguntas 1 a 9. A 10 (competência do ISS na
apropriação) é do contador e não veio. As perguntas 11 a 19 não têm resposta.
**Nenhuma fonte citada nesta resposta foi conferida no texto oficial.** O que
está como "aceito" é a tese; a citação só vale depois de lida.

| # | Tema | O que o advogado respondeu | Veredito | Motivo e o que falta |
|---|---|---|---|---|
| 1 | Compensação automática do saldo negativo | Sim, se o contrato prevê (CC, art. 368). Para promotora consumidora (MEI ou associação), ressalva do CDC, art. 51, IV, com notificação e 5 dias antes do débito | **Aceito como rascunho** | Redação sugerida para o contrato. Depende da pergunta 5 (a promotora é consumidora?) |
| 2 | Título executivo | Não: contrato sem duas testemunhas não é título (CPC, art. 784, III). Caminho: confissão de dívida prévia no contrato | **Aceito** | Cláusula de confissão de dívida no contrato da promotora |
| 3 | Juros, correção e multa | 1% ao mês (CC, art. 406; Lei 14.905/2024), IPCA, multa de 2% (CDC, art. 52, §1º, e CC, art. 413) | **Pendente de correção** | Três erros de citação: (a) o CC, art. 406, depois da Lei 14.905/2024, é a taxa legal (Selic menos IPCA), não 1%; (b) o CDC, art. 52, §1º, limita a 2% a multa de mora, não os juros; (c) o CC, art. 413 trata de redução de multa excessiva, não de base para multa. **Conflita com a nota anterior de que X.13(c) "está correto"**: a cláusula X foi aprovada em 10/10, então os números precisam ser confirmados antes da próxima versão publicada |
| 4 | Bloqueio por inadimplência | CC, art. 476. Suspende só novas publicações, com notificação e 10 dias; rifas no ar seguem | **Aceito como rascunho** | Igual à X.13 (a). Ressalva do CDC, art. 51, IV, se a promotora for consumidora |
| 5 | Teto de exposição e reincidência | Teto de R$ [valor] por promotora; 10 dias de regularização; rescisão na segunda notificação | **Pendente do dono** | Falta o valor do teto. O advogado diz que é gestão de risco, não limite de responsabilidade |
| 6 | Natureza da margem de R$ 5,00 | Liberalidade (sem receita, sem ISS) ou taxa (receita com ISS e PIS/COFINS). "Na dúvida, liberalidade" | **Pendente do dono, com conflito** | A decisão A18 (rodada 4) diz que a margem é cobrada, e o saldo negativo é debitado da promotora. Liberalidade não casa com isso. Escolher uma redação e pedir ao advogado que a confirme |
| 7 | Prejuízo absorvido pela plataforma | Não cria obrigação perante a promotora nem o fisco; registrar como despesa operacional; não perdoar a dívida (CC, art. 385; Lei 6.404, art. 187) | **Aceito, com ressalva de citação** | Registro: despesa mais saldo negativo ainda recuperável (A18). A Lei 6.404 vale para S.A.; confirmar se a plataforma é LTDA. O art. 385 trata de remissão por documento particular; confirmar a aplicação |
| 8 | Citações do ISS da sobra (Lei 13.701/2003; SF/DEJUG 41/2013) | Lei 13.701/2003, arts. 1º e 14. A SF/DEJUG 41/2013 "não foi localizada"; cita a 41/2018 como "existente", mas diz que ela trata de fundos. Sugere a SF/DEJUG 13/2013 para os itens 10.08 e 17.06 | **Não aceito: citações pendentes** | O próprio parecer se contradiz sobre a 41. A Lei 13.701/2003 é lei municipal de São Paulo, não federal; o parecer a trata como norma geral. Item 10.08: pelo que consigo verificar, o agenciamento de publicidade da LC 116/2003 é o 10.05; conferir na lista. Precisa do texto oficial lido antes de a regra da sobra ir ao contrato |
| 9 | Prazo de uso do crédito | Sem vencimento para consumidor; para empresa, 5 anos (CTN, arts. 173 e 174) | **Não aceito: respondeu outra coisa** | O parecer tratou o crédito como crédito tributário de ISS. O crédito de uso (a carteira) não é crédito tributário. CTN 173 e 174 são decadência e prescrição do fisco. A decisão B2 (rodada 2) já fixou 12 meses, com aviso 30 dias antes. Refazer a pergunta sobre a validade do crédito de uso |

### Correções para devolver ao advogado (uma rodada)

1. **Juros e multa (3):** corrigir CC, art. 406 (Lei 14.905/2024), CDC, art. 52, §1º, e CC, art. 413, com o texto de cada um.
2. **ISS da sobra (8):** texto oficial da Lei 13.701/2003, dizendo se é municipal; SF/DEJUG 41/2013 ou 41/2018, a que existir de fato; item de serviço na LC 116/2003 (10.05 ou 10.08).
3. **Validade do crédito de uso (9):** responder de novo, separando crédito de uso de crédito tributário.
4. **Margem (6):** dizer qual redação vale com a decisão A18 e as consequências de cada uma.
5. **Promotora consumidora ou não (1 e 4):** MEI e associação são consumidores para o CDC? Isso muda a ressalva de compensação e de bloqueio.
6. **Citações de empresa (7):** aplicabilidade da Lei 6.404 e do CC, art. 385 a LTDA.

### Decisões do dono necessárias

- **Margem de R$ 5,00 (6):** cobrada (receita, com ISS e PIS/COFINS) ou liberalidade. A decisão A18 pressupõe cobrança.
- **Valor do teto de exposição (5):** a definir por promotora.
- **Validade do crédito de uso (9):** confirmar os 12 meses da B2 antes de o advogado responder de novo.
- **Domínio (18 e 19):** verificar hoje e informar o nome final.
- **Item 3 da sua lista:** em branco na mensagem. Preciso que você diga qual era.

### Sem resposta nesta rodada

- **10 (contador):** competência do ISS na apropriação e o que acontece com a nota.
- **11 e 12:** taxa de saque, com base legal e limite; o saque como atividade regulada (depende do parecer bancário, A13).
- **13 a 15 (triagem com IA):** casos que a IA pode decidir sozinha (LGPD, art. 20), resposta ao solicitante e prazo de guarda do histórico.
- **16 e 17:** item de serviço (10.08 ou 17.06, com a rifa como receita principal) e CNAE principal.

### Efeito

- Nada do código muda agora.
- A compensação (1) e a confissão de dívida (2) entram no rascunho do contrato da promotora como cláusula nova. Isso vira nova versão, que só se publica com juros e multa corrigidos (3).
- O teto (5), a margem (6) e a validade do crédito (9) ficam pendentes; sem eles não há regra de saldo negativo nem de carteira para construir.
- Triagem, carteira e contenção seguem esperando o parecer e as decisões acima.

## Resposta do contador às perguntas 10 a 17 (13/10/2026, rodada 7)

A resposta vem **sem assinatura válida**: traz `{{RAZAO_SOCIAL}}`, `{{CNPJ}}` e
`{{CRC}}` sem preencher. O conteúdo fica registrado, mas a parte contábil só
fecha com assinatura e CRC reais. O CNPJ e a razão social são pendência do
dono até depois do lançamento.

| # | Tema | O que o contador respondeu | Veredito | Motivo e o que falta |
|---|---|---|---|---|
| 10 | Competência da apropriação | Mês do vencimento do crédito (prazo de 12 meses); NFS-e no mesmo mês, sem nota retroativa. Lançamento: Adiantamento (D) / Receita de créditos não utilizados (C). Tributos como "despesa" de ISS, PIS, COFINS, IRPJ e CSLL, "conforme alíquotas" | **Pendente de fonte e de classificação** | O fundamento é a Lei 13.701/2003, art. 1º, que ainda não foi conferida (pergunta 8 da rodada anterior). ISS, PIS e COFINS sobre receita, em regra, são deduções da receita bruta, não despesa. IRPJ e CSLL não se lançam por alíquota nesse evento. **Falta dizer qual serviço é prestado na apropriação**: o crédito não usado não corresponde a serviço entregue, e o fato gerador do ISS é a prestação de serviço. Falta também o regime tributário da plataforma, que não consta no documento |
| 11 | Taxa de saque | Receita própria, tributada (ISS, PIS/COFINS, IRPJ/CSLL); item a definir ("10.08 ou item financeiro") | **Parcial** | Base legal e limite são do advogado. "Item financeiro" não foi identificado. A cobrança depende de decisão do dono |
| 12 | Saque do crédito e conta de pagamento | Atividade regulada, dependente do parecer bancário | **Pendente** | Depende de contratar o parecer (A13); o dono ainda não contratou |
| 13 | Decisão automatizada (LGPD, art. 20) | Remete ao advogado | **Pendente do advogado** | — |
| 14 | Comunicação ao solicitante | Remete ao advogado | **Pendente do advogado** | — |
| 15 | Guarda dos casos e logs | Histórico de 5 anos "alinhado ao CTN, arts. 173 e 174"; registros de acesso de 6 meses (Marco Civil); log interno de 12 meses | **Não aceito o fundamento** | CTN 173 e 174 tratam de decadência e prescrição do fisco; não fixam prazo de guarda de caso de atendimento. O mesmo erro da rodada anterior (pergunta 9). O Marco Civil, art. 15 (6 meses), vale para registros de acesso a aplicações: confirmar o texto. O log de 12 meses não tem base. O prazo de guarda de dado pessoal precisa de base na LGPD (art. 16 e finalidade), a confirmar pelo advogado |
| 16 | Item de serviço | 17.06 não cabe; 10.02 se intermedeia bilhete; 10.08 se só gestão de tráfego; decisão conjunta com o advogado, com a operação real informada pelo dono | **Pendente do dono e do advogado** | Depende de a plataforma só gerir tráfego ou também intermediar bilhete, o que o dono ainda não descreveu. **Conferir os códigos no texto da LC 116/2003**: o contador indica 10.08 como "agenciamento de publicidade"; pelo que consigo verificar, esse agenciamento é o 10.05. A descrição do 10.02 também precisa de leitura do texto antes de qualquer NFS-e |
| 17 | CNAE principal | Definido pela maior receita; com rifa, não é o 73.19-0/99; 92.00-3/00 fora; intermediação de bilhete sem CNAE específico | **Conflito com decisões anteriores** | A decisão K-CNAE (10/10) escolheu principal **63.11-9/00** (software), com secundários 74.90-1/04 e **73.19-0/99**. A rodada 5 (13/10) disse que a maior receita é da rifa. O contador tirou o 73.19-0/99 da lista que a decisão K-CNAE mantinha. O dono escolhe entre as duas posições antes de o CNAE ser informado à Receita |

Os pontos 18 e 19 (nome do site e domínio) não são do contador: seguem como
pendências do dono.

### Correções para devolver ao contador (uma rodada)

1. **Pergunta 10:** qual serviço é prestado na apropriação (fato gerador); ISS, PIS e COFINS como dedução da receita; IRPJ e CSLL fora do lançamento do evento; regime tributário da plataforma.
2. **Pergunta 15:** retirar CTN 173 e 174 como base dos prazos; fundamentar a guarda pela LGPD (art. 16 e finalidade) e o Marco Civil (art. 15) com o texto lido.
3. **Pergunta 16:** conferir no texto da LC 116/2003 os códigos 10.02, 10.05 e 10.08, e apontar o que cabe.
4. **Pergunta 17:** resolver o conflito com a decisão K-CNAE.
5. **Assinatura:** reenviar com nome, CRC e CNPJ (ou protocolo da alteração em andamento).

### Decisões do dono necessárias

- **Operação real:** só gestão de tráfego (publicidade) ou também intermediação de bilhete. Define o item de serviço (pergunta 16).
- **Receita principal para o CNAE:** software (decisão K-CNAE) ou rifa (rodada 5). Não dá para ter as duas.
- **Taxa de saque:** existe ou não. O contador já tributa, mas a cobrança é decisão do dono.
- **Parecer bancário (A13):** contratar, para a pergunta 12 avançar.
- **Assinatura com CNPJ:** o contador precisa de CNPJ e razão social para assinar a parte contábil, e o dono deixou isso para depois do lançamento. Escolher: usar o CNPJ da alteração em andamento ou esperar.

### Efeito

- Nada no código muda agora.
- A apropriação (10) só entra no fechamento depois de o contador dizer o fato gerador e a classificação, e de o advogado confirmar a Lei 13.701/2003.
- A guarda de casos e logs (15) fica sem prazo fixo até a LGPD e o advogado fundamentarem.
- O item de serviço (16) e o CNAE (17) bloqueiam a emissão de NFS-e e a abertura do CNPJ alterado.

## Decisão do dono (13/10/2026, rodada 8): margem da plataforma sem burocracia e sem cobrança judicial

| # | Decisão | O que muda |
|---|---|---|
| D8.1 | A plataforma disponibiliza o custo **mais R$ 5,00 da parte dela**. Não queremos burocracia na cobrança da promotora | A margem sai da cobrança à promotora: é aporte da plataforma, não taxa cobrada. Leitura nossa, a confirmar com o dono: a pergunta 6 (natureza da margem) fica resolvida como **liberalidade**, sem ISS e sem receita, e o conflito com a A18 some |
| D8.2 | Se a promotora não pagar esse valor, o **saldo negativo fica registrado na conta** e **não é cobrado judicialmente pela plataforma** | Muda as perguntas 2 e 5 (título executivo e teto com cobrança), e a 3 (juros) só se o dono quiser juros sobre o saldo registrado. Continua valendo a compensação automática quando a promotora repõe o saldo (pergunta 1) |

### O que cada pergunta vira

| # | Pergunta | Situação com a D8 |
|---|---|---|
| 1 | Compensação automática | **Continua valendo**: o saldo negativo é debitado quando a promotora repõe. Redação precisa dizer que o registro é o único efeito de inadimplência |
| 2 | Título executivo e confissão de dívida | **Não é mais necessário**, porque a plataforma não cobra judicialmente. Sai do contrato, a menos que o advogado veja outra razão |
| 3 | Juros e correção | **Só se o dono quiser juros sobre o saldo registrado.** Se não quiser, a correção dos números de X.13(c) muda de tamanho: a cláusula pode ficar sem juros e multa. Continua pendente a citação errada |
| 4 | Bloqueio por inadimplência | **Continua**: é a única consequência que a plataforma aplica. Precisa de aceite, porque é a única forma de cobrança |
| 5 | Teto de exposição | **Vira teto do saldo negativo registrado**, sem cobrança. Falta o valor |
| 6 | Natureza da margem | **Resolvida como aporte da plataforma (liberalidade), a confirmar** |
| 7 | Prejuízo absorvido | Com a D8.2 o saldo negativo não é perdido: fica registrado até a reposição. O prejuízo só se confirma se a promotora deixar de repor. **Falta o contador definir a perda esperada e o registro contábil** |

### Para devolver ao advogado (rodada curta)

1. A renúncia à cobrança judicial do saldo negativo registrado é válida no contrato com a promotora? Redação da cláusula, com o aceite.
2. Sem cobrança judicial, o registro do saldo negativo basta como efeito de inadimplência? Ou a plataforma precisa de algo mais para manter o direito de compensar quando a promotora repõe?
3. Juros sobre o saldo registrado: se o dono quiser, qual base (art. 406 pós-Lei 14.905/2024, ou sem juros)?
4. A margem como aporte da plataforma: a redação "liberalidade" e a regra de que não há receita. Confirmar sem dúvida de natureza.

### Para o contador

1. Como registrar o saldo negativo que a plataforma não cobra: perda esperada (provisão) desde o aporte, ou só quando a promotora deixar de repor?
2. O aporte de custo mais R$ 5,00 pela plataforma é receita, ou é despesa de contenção? Hoje o documento diz que a margem é aporte, então não deveria ser receita.
3. Conferir se a decisão K-CNAE e o item de serviço continuam valendo, já que a margem deixa de ser cobrança.

### Para o dono

- **Juros:** o saldo registrado tem juros, ou não?
- **Valor do teto:** o teto do saldo negativo registrado por promotora. Continua em aberto.
- **Confirmação:** a leitura de D8.1 (margem como aporte da plataforma, não cobrada) está certa?

### Efeito no sistema

- Nada muda no código agora. Quando o parecer chegar, o saldo negativo vira um registro com teto e compensação automática, sem fluxo de cobrança judicial, e o bloqueio por inadimplência fica como consequência.
- A contenção no tráfego (A18) continua com o mínimo de R$ 5,00, agora como aporte da plataforma e sem cobrança.

## Fechamento das decisões do dono (13/10/2026, rodada 9)

| Ponto | Decisão do dono | Efeito |
|---|---|---|
| Margem (D8.1) | Ok: aporte da plataforma (custo mais R$ 5,00), não cobrado da promotora | Pergunta 6 resolvida como liberalidade, a confirmar pelo advogado |
| Cobrança | Ok: sem cobrança judicial pela plataforma | Perguntas 2 e 5 saem do escopo de cobrança |
| Teto | Ok como mecanismo. **Valor por promotora ainda não informado** | Pendência do dono |
| Juros | **Não haverá**, porque não há cobrança | Pergunta 3 encerrada; X.13(c) sem juros, multa a confirmar pelo advogado |
| Mantidos | Ok: compensação automática e bloqueio por inadimplência | Continuam como cláusula |

**Ainda não fechado:** a Parte 1 segue aberta. Faltam as respostas do advogado e do contador, a assinatura do contador (campos `{{RAZAO_SOCIAL}}`, `{{CNPJ}}` e `{{CRC}}` em aberto), o valor do teto, o domínio, o CNAE principal e o parecer bancário. O pacote de envio está em `scratchpad/pacote-fechamento.md`, entregue ao dono.

## Respostas revisadas do advogado e do contador (13/10/2026, rodada 10): veredito

### Advogado

| Item | Resposta | Veredito | Problema |
|---|---|---|---|
| A. Cláusula de saldo negativo | Três opções: (a) compensar, (b) cobrar judicialmente, (c) renunciar; a renúncia vira despesa operacional. Cita CC, art. 385 e Lei 6.404, art. 187 | **Aceito com correção** | A opção (b) contraria a decisão do dono (sem cobrança judicial): sai da cláusula. Lei 6.404 vale para S.A.; confirmar o tipo societário |
| B. Multa da X.13(c) | CDC, art. 52, §1º (2%) e CC, art. 413, com o texto citado | **Parcial** | A redação sugerida **mantém juros de 1% ao mês**, contra a decisão do dono (sem juros). Os textos citados batem com o que conheço, mas não foram conferidos na fonte oficial |
| C. Margem de R$ 5,00 | Renúncia como liberalidade, sem receita; cita CC, art. 385 | **Aceito com ressalva** | CC, art. 385 trata de perdão de dívida. Margem não cobrada não é dívida perdoada: a citação não se aplica. **Conflita com o contador** (ver abaixo) |
| D. Crédito de uso × crédito tributário | 12 meses, baixa como receita com aviso de 30 dias. Crédito tributário com 5 anos (CTN, arts. 173 e 174) | **Prazo aceito; baixa como receita não aceita** | A decisão do dono (rodada 3, item 11) diz que a sobra volta como crédito e o usuário pode pedir o saldo em dinheiro. A cláusula tira esse direito e pode ser questionada no CDC, art. 51. CTN 173 e 174 de novo usados como prazo de validade, o erro já apontado |
| E. ISS da sobra | Lei 13.701/2003, arts. 1º e 14, com texto citado; SC SF/DEJUG 42/2013 e 26/2016 | **Não aceito: fontes sem cópia** | A ementa da SC 42/2013 citada contradiz a própria cláusula de ISS (incide ou não sobre veiculação). Sem cópia do texto de cada norma e solução, não entra |
| F. MEI e associação | MEI é consumidor como destinatário final; associação depende do uso; na dúvida, tratar como consumidora | **Aceito como orientação** | "MEI equiparado a consumidor" não é equiparação legal (CDC, art. 2º, parágrafo único, trata de coletividade). O REsp 476.428/SC não foi conferido |
| G. Triagem com IA (LGPD, art. 20) | Aviso com triagem automatizada e revisão humana; resposta em 15 dias | **Aceito como redação** | O prazo de 15 dias é política da plataforma, não exigência do art. 20 |

### Contador

| Item | Resposta | Veredito | Problema |
|---|---|---|---|
| 1. Fato gerador do ISS | Serviço é a própria apropriação (gestão de saldo), item 10.05 (intermediação de bens móveis ou imóveis) | **Não aceito** | "Gestão de saldo" não é item da lista da LC 116/2003. O 10.05 descrito como bens contradiz a rodada 7, em que o contador indicou 10.08. A Lei 13.701/2003, art. 1º ainda não foi lida |
| 1. Classificação e regime | Receita própria; **Lucro Real**, "conforme você definiu" | **Não aceito** | **O dono não definiu o regime tributário.** O Lucro Real foi suposto. IRPJ, CSLL, PIS e COFINS dependem dessa decisão |
| 2. Provisão do saldo negativo | Provisão quando a perda é provável, pela NBC TG 25 | **Parcial: norma errada** | O saldo negativo é ativo financeiro. A referência é a CPC 48 / NBC TG 48 (perda de crédito esperada), não a TG 25 (provisões). Conferir |
| 3. Margem como aporte | Débito Caixa, crédito Capital Social (ou AFAC); fora do resultado | **Não aceito: lançamento incoerente** | Aporte de capital é o sócio pondo dinheiro na sociedade. Aqui o dinheiro da plataforma vai para a promotora. Capital social não é a conta. **Conflita com a cláusula C do advogado**, que manda registrar como despesa |
| 4. Guarda de casos e logs | Marco Civil, art. 15 para logs de 12 meses; LGPD, art. 16, II | **Não aceito: citações erradas** | Marco Civil, art. 15 fixa 6 meses, não 12. LGPD, art. 16, II trata de estudo por órgão de pesquisa; a obrigação legal é o inciso I. Log de 12 meses sem base |
| 5. Códigos do item de serviço | 10.08 publicidade; 10.05 bens; 10.02 contratos quaisquer | **Pendente de texto** | Advogado e contador descrevem o 10.05 e o 10.08 de forma diferente nesta mesma troca. Exigir o texto da lista da LC 116/2003 antes de qualquer NFS-e |
| 6. Assinatura | Campos `{{RAZAO_SOCIAL}}`, `{{CNPJ}}` e `{{CRC}}` em aberto | **Pendente** | Sem CNPJ, CRC e nome, não assina |

### Decisões que faltam para fechar o veredito

1. **Regime tributário:** o dono define (Lucro Real, Presumido ou outro). Sem isso, nenhum cálculo de IRPJ, CSLL, PIS ou COFINS vale.
2. **Margem de R$ 5,00:** despesa operacional (advogado), capital (contador, mas com lançamento errado) ou ativo a receber da promotora. Advogado e contador precisam chegar a uma só. O dono confirma qual.
3. **Sobra do crédito de uso:** volta como crédito com pedido em dinheiro (decisão da rodada 3), ou baixa como receita (cláusula D do advogado)? As duas não cabem juntas.
4. **Juros:** a X.13(c) sai sem juros, como decidido em rodada 9. O advogado corrige a redação.

### Pedido de correção (uma rodada, com fonte)

- **Advogado:** retirar a opção (b) da cláusula de saldo negativo; retirar os juros da X.13(c); conferir as fontes das normas e soluções de consulta (texto oficial, com cópia); revisar a citação do CC, art. 385 na margem; a sobra conforme a decisão da rodada 3.
- **Contador:** dizer o fato gerador do ISS com item da lista da LC 116/2003 lido; trocar a norma da provisão para CPC 48; corrigir a citação do Marco Civil (art. 15, 6 meses) e da LGPD (art. 16, I); corrigir o lançamento da margem conforme a decisão de (2); aguardar o regime.

### Efeito

A Parte 1 segue aberta. A cláusula de saldo negativo só entra no contrato depois do pedido de correção acima. A margem e a sobra dependem das decisões 1 a 3.

## Decisões finais do dono (13/10/2026, rodada 11): regime, margem, sobra e juros

| # | Tema | Decisão | Efeito |
|---|---|---|---|
| 1 | Regime tributário | **Lucro Real** | Refazer a apuração de IRPJ, CSLL, PIS e COFINS (não cumulativo) |
| 2 | Margem de R$ 5,00 e saldo negativo | **Margem é despesa operacional. Saldo negativo é saldo a receber** | Lançamentos separados (ver `scratchpad/redacao-clausulas.md`) |
| 3 | Sobra do crédito de uso | **Segue a sugestão do advogado**: baixa como receita, com aviso de 30 dias. **Substitui a decisão da rodada 3** (devolução em dinheiro) | Cláusula de crédito de uso; risco de CDC, art. 51 registrado |
| 4 | Juros | **Sem juros** | X.13(c) sem juros. A multa de 2% segue a sugestão do advogado, a confirmar pelo dono |

Redação das cláusulas: `scratchpad/redacao-clausulas.md`, entregue ao dono. Pendências que sobram: valor do teto, item do ISS (texto oficial da LC 116/2003), perda esperada do saldo a receber (CPC 48, técnica do contador) e a assinatura com CNPJ e CRC.

**Ajuste do dono (13/10/2026, rodada 12):** a margem de R$ 5,00 e o saldo negativo valem **só para promotora com CNPJ**. Versão 2 da redação em `scratchpad/redacao-clausulas-v2.md`. A sobra do crédito de uso vale para todas as promotoras; o risco do CDC, art. 51 segue para decisão do dono sobre o MEI (manter a baixa ou devolver em dinheiro).

**Decisão do dono (13/10/2026, rodada 13): taxa de saque.** Existe só quando há saque de saldo, e é igual ao custo bancário da transferência, sem margem. A plataforma não tem lucro com ela. Substitui o padrão "não cobrar" adotado no documento de padrões (item A6). Efeito: cláusula de taxa de saque pelo custo comprovado; contador define se o repasse entra como receita ou como reembolso de custo, sem lucro.
