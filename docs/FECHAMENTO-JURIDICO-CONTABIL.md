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
