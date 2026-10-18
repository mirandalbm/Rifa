# Roteiro do globo com o tabelionato (18/10/2026)

O responsável decidiu em **18/10/2026** homologar o globo da plataforma já,
sem esperar a demanda comercial (a posição de 07/10/2026, repetida em P8 da
`docs/RODADA-FINAL-ADVOGADO.md`, era "fica desligado"). Este roteiro diz **o
que contratar, o que perguntar ao cartório, o que fazer no dia da sessão, o que
o sistema exige em cada campo da ata e o que conferir antes de ligar o globo**.

**Só documentação.** O código do globo está pronto desde as respostas 8.9 a
8.12 do advogado e **não muda** aqui. O globo segue **desligado** em Sorteios
oficiais (o calendário) → "Métodos de apuração" até o checklist da seção 4 estar
inteiro.

**Regra deste documento.** Nome de cartório, preço, prazo e artigo de lei que
não têm fonte no repositório aparecem como **"a confirmar com o cartório"** ou
**"a confirmar com o advogado"**. Nada abaixo é promessa do cartório: é a lista
do que perguntar e do que o sistema já exige.

Onde está o quê:

| Assunto | Arquivo |
|---|---|
| As regras puras (leitura das 6 bolas, a ata, a nova extração) | `shared/apuracao.ts` (`lerGlobo`, `clausulaDoGlobo`), `shared/sorteiosOficiais.ts` (`validarAtaDoGlobo`, `validarNovaExtracao`) |
| Calendário, resultado, arquivo da ata | `server/services/sorteiosOficiais.ts`, rotas `/sorteios-oficiais*` em `server/routes/admin.ts` |
| Nova extração e sorteio da rifa | `registrarNovaExtracao()`, `executarSorteio()` em `server/services/sortear.ts` |
| As telas da plataforma | `client/src/pages/adminSorteiosOficiais.tsx` (`LancarResultado`, `AtaDaSessao`, `NovaExtracao`, `MetodosDeApuracao`) |
| Prova contra a API | `npm run apuracao` (o globo de ponta a ponta), `npm run sorteios` |
| O que o advogado já disse | `docs/PENDENCIAS.md` (seção 6, "Globo da plataforma pronto"; item "Homologar o globo"), `docs/RESPOSTAS-ADVOGADO.md` (Q39, F13), `docs/RODADA-FINAL-ADVOGADO.md` (P8) |

> O texto literal das respostas 8.9 a 8.12 **não está no repositório**: o que
> temos é o que o código e o `docs/PENDENCIAS.md` registram delas. Este roteiro
> segue isso e **não contraria** o advogado; o que parece conflitar (Q39) vai
> como pergunta (seção 5), não como decisão.

---

## 1. O que contratar e obter

### 1.1. Visão geral

Cada **sessão do globo** precisa de quatro coisas, todas **fora do código**:

1. **Um Tabelionato de Notas** que lave a **ata notarial** da sessão (é o que o
   regulamento promete e o que o campo "Tabelionato que lavra a ata" exige).
   Ata notarial, em geral, é o instrumento em que o tabelião atesta fatos que
   presenciou (**a confirmar com o advogado**: base legal, CPC art. 384 e a lei
   dos notários, e se ela basta para a SPA/MF).
2. **Quem acompanha o tabelião**: **um auditor independente** *ou* **pelo menos
   2 testemunhas sem vínculo com as promotoras**. Atenção: isto é a alternativa
   *dentro* da ata. **Não substitui o tabelião** — o sistema sempre pede o
   tabelionato, e a cláusula do regulamento diz "ata notarial lavrada por
   tabelião" (`clausulaDoGlobo()`).
3. **O globo físico**: 6 globos independentes, cada um com 10 bolas numeradas
   de 0 a 9, extraídos em sequência do 1º ao 6º (a cláusula do regulamento).
   Quem fornece, quem guarda, como se lacra e se precisa de laudo é **decisão
   aberta** (perguntas R37 e R38, seção 5).
4. **A transmissão ao vivo** da sessão (link conferido pelo sistema, seção 2).

E, do lado do negócio, antes da primeira sessão: **o anexo "globo" do contrato
da promotora publicado** (seção 4) e a **resposta do advogado** sobre o que
exatamente é "homologar" (seção 5, R36).

### 1.2. Como o sistema aceita auditor e testemunhas

Tal como `validarAtaDoGlobo()` exige hoje:

| Situação | O sistema aceita? |
|---|---|
| Tabelionato + auditor independente (sem testemunhas) | Sim |
| Tabelionato + 2 a 6 testemunhas (sem auditor) | Sim |
| Tabelionato + auditor **e** testemunhas | Sim |
| Tabelionato + 1 testemunha, sem auditor | **Não** (mínimo 2) |
| Auditor ou testemunhas, **sem** tabelionato | **Não** (o campo é obrigatório) |

**O que o sistema não confere** (quem lança responde): que o auditor e as
testemunhas realmente não têm vínculo com as promotoras; que o tabelionato
existe; que a hora das bolas bate com a hora do vídeo. A tela só avisa "sem
vínculo com as promotoras". Recomendação a confirmar com o advogado (R37): que o
vínculo também exclua a **plataforma** e seus sócios, não só as promotoras.

### 1.3. Perguntas para o cartório

Faça a mesma lista a **pelo menos dois** tabelionatos. Anote a resposta por
escrito (e-mail), porque vai para o advogado.

**Custo**

- Quanto custa **uma ata por sessão**? Como o valor é calculado (tabela de
  emolumentos do estado, por página, por hora de atendimento)? *(A confirmar com
  o cartório: a tabela é estadual.)*
- O atendimento **fora da sede** (diligência) tem acréscimo? Deslocamento, hora
  extra, fim de semana, noite, feriado?
- A **nova extração no mesmo ato** (se o número sair sem dono) custa a mais ou
  cabe na mesma ata? Há cobrança por hora de espera?
- Cada **cópia ou certidão** da ata tem preço? Quantas vias vêm incluídas?
- Há **taxa de remarcação ou cancelamento** se a sessão mudar de dia?
- Existe tabela para **várias sessões por mês** (pacote, contrato de
  recorrência)?

**Prazo**

- Em quantos dias úteis o cartório **entrega a ata**? Existe entrega urgente?
  (Importa: o arquivo é anexado *depois* do resultado — seção 2.4 — e o advogado
  ainda deve dizer se há prazo máximo, R40.)
- A ata sai **assinada digitalmente**? Em PDF? De que tamanho? (O sistema aceita
  **PDF, JPG ou PNG até 8 MB**.)

**Escopo da ata** — peça que a ata registre, no mínimo:

- identificação do **local** (endereço completo), da **data** e da **hora de
  abertura e de encerramento**;
- quem estava presente: tabelião ou preposto, **auditor ou testemunhas** (nome
  completo e identificação), representante da plataforma;
- a conferência dos **6 globos e das bolas** (10 por globo, de 0 a 9) *antes*
  da extração, e o estado do equipamento (lacre, se houver);
- **cada bola retirada, na ordem, com a hora de cada uma** (HH:MM:SS) — o
  sistema pede exatamente isso;
- o **número formado** pelos 6 algarismos, na ordem dos globos;
- **cada nova extração** do mesmo ato, quando houver (seção 2.3);
- a identificação da **transmissão** (link) e eventual interrupção dela;
- o nº da sessão e o calendário (para casar a ata com `Nº da sessão do globo`).

Pergunte também: o tabelião aceita atestar **o que viu ao vivo e o que o vídeo
mostra**? Quais são os limites do que ele atesta (ele atesta o fato, não a
aleatoriedade do equipamento — **a confirmar com o cartório e o advogado**)?

**Atendimento externo e online**

- O tabelionato atende **fora do município** e **em horário noturno e fim de
  semana** (a Federal sorteia quartas e sábados às 19h; o globo pode seguir o
  mesmo horário, mas a data é escolha nossa)?
- Há atendimento **por videoconferência** (ato notarial eletrônico, e-Notariado
  — **a confirmar com o cartório e o advogado** se vale para atestar um globo
  físico)? Se vale, como a ata assina?
- Há **mais de um tabelião ou preposto** disponível, para o caso de
  impedimento no dia?

**Agenda**

- Antecedência mínima para marcar? Dias e horários em que não atende?
- O cartório reserva **uma janela fixa** (por exemplo, sempre a mesma hora no
  mesmo dia da semana)?
- Quanto tempo o tabelião fica no local? Há limite de horas?

**Dados pessoais**

- A ata será **pública** na página do sorteio, com o nome do auditor ou das
  testemunhas (`ata` no `/campaigns/:slug/sorteio`). O cartório faz objeção?
  Como as testemunhas autorizam? (Pergunta ao advogado: R39.)

### 1.4. Auditor independente (se esse for o caminho)

Se a escolha for auditor em vez de testemunhas: quem é (pessoa ou empresa, o
sistema guarda só o **nome** e um **registro opcional**), como se prova que é
independente, quanto cobra por sessão e se emite relatório próprio (o sistema
não guarda esse relatório; o arquivo da ata é um só — se houver relatório do
auditor, ele fica fora do sistema ou entra no mesmo PDF). *A confirmar com o
advogado: se a auditoria é obrigatória além da ata (R37).*

---

## 2. Roteiro do dia da sessão

**T** é a **hora do sorteio** que está no calendário (`Data e hora do sorteio`).
Tudo marcado **[sistema]** o código faz sozinho; **[manual]** é com a equipe.

Quem opera: o **administrador geral** (master), com **senha e código do
autenticador na hora** nos dois atos que decidem o ganhador (lançar o resultado
e registrar nova extração). Sem segundo fator ligado na conta dele, o ato
responde 409; com código errado, 401.

### 2.1. Antes

**De semanas a 24 h antes (cadastro)**

1. **[manual] Cadastrar a sessão** — Painel → Sorteios oficiais → "Novo
   sorteio": **Loteria = "Globo da plataforma"**, **Nº da sessão do globo** (1 a
   99999; o mesmo número na mesma loteria não entra duas vezes — o índice
   decide), **Data e hora do sorteio** (T), título (opcional) e **link da
   transmissão**.
   - A data não pode estar no passado nem passar de ~1 ano.
   - **Marque T com folga de quem organiza o cartório.** Depois que existe **rifa
     publicada** na sessão, **loteria, concurso e data não mudam** e a sessão
     **não é cancelada** (409): quem comprou comprou aquela data. Mudar só por
     adiamento aprovado, **rifa por rifa** (seção 5.1, risco 6).
2. **[manual] Link da transmissão**: cole o link **da live** (não do canal). O
   painel mostra, logo abaixo do campo, se o vídeo toca dentro da tela
   ("Certo") ou só abre em outra aba (`leituraDoLink()`). Serve YouTube,
   Vimeo, Twitch ou Facebook; qualquer outro link abre em nova aba. Só `https:`.
   O link muda até o resultado (inclusive depois de T), então dá para trocar a
   live se a primeira cair.
   - Não existe canal oficial do globo (o cartão "Canal oficial de cada loteria"
     é das loterias da Caixa): a live é **nossa**, criada para a sessão.
3. **[manual] Rifas entram na sessão.** Cada organização, **no rascunho**, escolhe
   em Autorização e sorteio o método **Globo** (liberado em "Métodos de
   apuração" — seção 4) e integra a rifa à sessão (`PUT
   /campaigns/:id/sorteio-oficial`). Regras que o sistema impõe:
   - só rifa do método globo entra em sessão do globo, e **só ela publica numa
     sessão do globo**;
   - faltando **menos de 24 h** para T, a rifa **não entra**;
   - "quando completar" **não vale** para o globo (a antecipação é da Federal);
   - total de cotas só em potência de 10 (100 a 1.000.000), e numeração a
     partir de zero na tela.
4. **[manual] Contrato**: cada organização precisa ter aceitado o **anexo "globo"**
   (cláusula 7 do contrato da promotora) para publicar a rifa do globo.

**Na véspera (D-1)**

5. **[manual] Conferir a lista de rifas** integradas na sessão (Sorteios
   oficiais mostra "Rifas integradas" com a organização de cada uma). Anote o
   total de cotas e o quanto cada uma vendeu: é o que diz **quantas extrações
   novas** a sessão pode exigir (seção 2.3).
6. **[manual] Testar o segundo fator** do master (código do autenticador
   correto, relógio do celular certo). **Sem ele, não há como lançar o
   resultado.** Tenha um plano para o master que perder o aparelho (seção 5.1,
   risco 9).
7. **[manual] Ensaio da transmissão**: câmera que mostre **os 6 globos, as bolas e
   o relógio**; áudio; internet com reserva (dois links, se possível); a live
   ligada em modo não listado, abrindo no link cadastrado.
8. **[manual] Confirmar com o cartório** o horário, o local, o nome do tabelião
   ou preposto e quem são o auditor ou as testemunhas (nomes **escritos como
   vão para a ata**: o campo do sistema só aceita letras — sem número).
9. **[manual] Confirmar o equipamento** (os 6 globos; 10 bolas de 0 a 9 em
   cada; lacre) conforme o que o advogado e o cartório definirem (R37).
10. **[sistema] Pedidos de reembolso fecham 2 horas antes de T.** Avise a equipe
    de atendimento: depois disso, o botão some e o servidor recusa.

**No dia, antes de T**

11. **[manual] T − 90 min**: equipe e tabelião no local; montagem; **o tabelião
    confere os globos e as bolas** e registra o estado do equipamento (o que
    ele atesta é combinado com o cartório).
12. **[manual] T − 45 min**: live ligada em teste; áudio e imagem conferidos; o
    **cronômetro/relógio visível no quadro**. Ninguém extrai nada ainda.
13. **[sistema] T − 30 min**: a tela do sorteio (celular e coluna ao vivo)
    **troca a contagem pelo vídeo** (`ANTECEDENCIA_DA_TRANSMISSAO_MS`). A live
    precisa estar no ar.
14. **[manual] T − 15 min**: o botão "Lançar resultado e ata" só aparece depois
    de T, mas deixe o painel de Sorteios oficiais aberto (já entrado), o
    autenticador à mão e uma segunda pessoa para **ler as horas em voz alta**
    na hora de digitar.

### 2.2. Durante

**T — hora marcada**

15. **[sistema] Vendas da sessão fecham em T**: a rifa integrada **não vende
    mais** (409 "As vendas fecharam"). Reserva criada antes de T segue valendo
    até vencer (padrão **15 min** por rifa, `reservation_ttl_min`).
16. **[manual] Nunca extrair antes de T.** O sistema só aceita o resultado
    depois de T, e extrair antes, com a venda aberta, seria sortear com o
    quadro ainda mudando. Se o cartório atrasar, a hora das bolas fica depois de
    T (o sistema não exige que a primeira bola seja à hora de T) — **registre o
    atraso em "Observações da ata"**.
17. **[manual] Abertura da ata**: o tabelião lê local, data, hora, presentes e a
    identificação do auditor ou das testemunhas. Anote a **hora de abertura**.

**As 6 bolas (sempre na ordem dos globos, 1º ao 6º)**

18. **[manual] Para cada globo, na sequência**: girar, extrair **uma** bola,
    mostrar à câmera, o tabelião confere e **lê em voz alta o algarismo e a
    hora (HH:MM:SS)**; a segunda pessoa anota. Só então passa ao próximo globo.
    - O sistema pede **uma bola de 0 a 9 por globo** e **as horas em ordem**: a
      hora de cada globo **não pode ser anterior** à do globo anterior (iguais
      passam no código, mas peça ao cartório o horário real de cada bola — a
      ata é o que vale).
    - Número formado: os 6 algarismos **na ordem dos globos**. Rifa menor fica
      com os N últimos (exemplo do regulamento: 6-7-8-1-3-9 → 678.139; em 1.000,
      139).

**Lançar o resultado (logo que a 6ª bola sair)**

19. **[manual] Master: Painel → Sorteios oficiais → a sessão → "Lançar resultado
    e ata"** (o botão só aparece depois de T). Preencher, **conferindo cada campo
    com quem anotou** (seção 3 traz a lista):
    - as **6 bolas** e, embaixo de cada uma, a **hora**;
    - local, tabelionato, registro (livro/folha/protocolo, se o cartório já
      souber), auditor ou testemunhas (**um por linha**), observações;
    - **senha e código do autenticador**.
    **Atenção: depois de lançado, o resultado e os dados da ata não mudam**
    (não há rota de edição; só o *arquivo* da ata pode ser trocado). A caixa de
    confirmação lembra disso; um erro de digitação vira erro permanente.
20. **[sistema]** Gravado o resultado (`UPDATE` condicional: dois cliques, um
    resultado e um 409), cada **rifa publicada** da sessão **sorteia na hora**,
    pelo mesmo caminho do botão: confere mínimo de cotas vendidas, reserva
    esperando Pix, e se o número lido tem dono. A auditoria (`sorteio_oficial.
    resultado`, `campaign.draw`) é gravada.
21. **[manual] Ler o resumo na tela**: "N rifa(s) sorteada(s)" e "N ainda não
    puderam sortear — o motivo aparece na rifa". Os motivos possíveis:
    - **Sorteio inválido – cota não vendida** (o número lido não tem dono):
      seção 2.3;
    - **cota reservada esperando Pix**: o sorteio espera (409) e o relógio
      (trava 811016) tenta de novo **a cada 5 minutos**;
    - **abaixo do mínimo de cotas vendidas** da rifa (a promotora pede o
      adiamento);
    - **nenhuma cota paga**: não há quem contemplar (pede adiamento).

### 2.3. Número sem dono: nova extração, no mesmo ato

No globo **não há aproximação** (resposta 9.5): se o número formado não foi
distribuído (nenhuma cota **paga** com ele), a rifa **não sorteia**, mostra
"Sorteio inválido – cota não vendida", e **o globo gira de novo no mesmo ato**.

22. **[manual]** A sessão **continua**, com o tabelião: gira-se de novo os 6
    globos, **na mesma sequência, com a hora de cada bola**. Cada nova extração
    é **por rifa**: rifas diferentes têm números diferentes, então uma sessão com
    várias rifas pode exigir várias novas extrações. A ata do cartório precisa
    cobrir todas (peça isso expressamente; R38).
23. **[manual] Registrar**: na rifa com o aviso, o botão "Nova extração do globo
    (mesmo ato)" — 6 bolas, 6 horas, **senha e código do autenticador**. As
    horas da nova extração vêm **depois da última bola já registrada** (a da
    sessão ou a da extração anterior); do contrário, 400.
24. **[sistema]** A rifa tenta sortear com a extração nova na hora. Se o número
    ainda não tem dono, o painel mostra "N-ª extração: 123456 — …" e a rifa pede
    outra. Repete-se até sair um número com dono. A conferência pública, o
    calendário e a prestação de contas listam **cada extração**, e cada uma vai
    à auditoria (`sorteio_oficial.reextracao`).
25. **Bloqueio por reserva**: o sistema **recusa registrar a nova extração**
    enquanto houver **cota reservada esperando pagamento** na rifa ("espere elas
    serem pagas ou vencerem antes de girar o globo de novo") — pois um Pix pago
    depois poderia dar dono ao número. Como a reserva dura até 15 min (padrão)
    depois de T, a nova extração pode ter de **esperar a reserva vencer** (ou a
    cota ser paga: nesse caso o número pode passar a ter dono e a nova extração
    nem cabe). Isto conflita com "no mesmo ato" — **pergunta R38**. Até o
    advogado responder, a regra de trabalho é: **conferir no painel se a rifa
    ainda tem reserva antes de girar o globo de novo**, e **combinar com o
    cartório que o ato fica aberto** até a rifa liberar.
26. **Não faça**: registrar nova extração para número que tem dono (o sistema
    recusa) nem girar o globo "para ver" fora do ato.

### 2.4. Depois

27. **[manual] Encerrar a ata** com o tabelião: hora de encerramento, leitura da
    ata ou resumo, assinaturas conforme o cartório (cada cartório decide se
    assina no ato ou depois — **a confirmar**). Guarde **a gravação da live** (a
    equipe, o arquivo original) e o relato escrito de quem anotou as horas.
28. **[manual] Conferir a página pública**: abra a rifa → conferência do sorteio.
    Devem aparecer: o número, a leitura passo a passo (6 bolas → número), as
    extrações (se houve) e a **ata** (local, tabelionato, auditor ou
    testemunhas, bolas com hora). Enquanto o arquivo do cartório não chega, a
    tela mostra "Arquivo do cartório ainda não anexado".
29. **[manual] Receber o arquivo da ata** do cartório (prazo: pergunta ao
    cartório, seção 1.3).
30. **[manual] Anexar**: Sorteios oficiais → a sessão → "Anexar o arquivo da
    ata" (`PUT /sorteios-oficiais/:id/ata`).
    - Só **depois do resultado**, só na sessão do **globo**, **só a plataforma**.
    - **PDF, JPG ou PNG, até 8 MB**, conferido pelo conteúdo (não pela
      extensão). PDF vai como veio; **foto é reprocessada** (JPEG, sem
      metadados, até 2.400 px de largura).
    - **Trocar substitui** (o cartório pode mandar a via definitiva). O envio
      vai à auditoria (`sorteio_oficial.ata`).
    - Se o PDF assinado digitalmente passar de 8 MB, **peça ao cartório uma via
      menor**; não comprima por conta própria (isso pode invalidar a assinatura
      — **a confirmar com o cartório**).
    - Anexado, o arquivo fica **público** em
      `/api/public/sorteio-oficial/<id>/ata` e o link aparece na conferência.
31. **[manual] Conferir o que foi digitado contra a ata do cartório.** Se houver
    divergência (nome, hora, local): **não existe edição**. O caminho é anexar a
    ata correta e **registrar a divergência com o advogado** antes de qualquer
    nova sessão (R40).
32. **[sistema] Avisos**: o ganhador de cada rifa, o push de resultado e o
    comentário fixo saem do fluxo de sempre; o prêmio prescrito em 180 dias e o
    texto de reembolso seguem o regulamento da rifa.

---

## 3. Lista de verificação: cada campo da ata, como o código exige hoje

`validarAtaDoGlobo(corpo, bolas)` em `shared/sorteiosOficiais.ts`. Só as chaves
abaixo entram; qualquer outra é ignorada. Os textos são aparados e os espaços
repetidos viram um só.

| # | Campo (tela) | Chave | Obrigatório | Regra exata hoje | Mensagem quando falha |
|---|---|---|---|---|---|
| 1 | Local da extração (endereço completo) | `local` | **sim** | de **5 a 200** letras | "Informe o local da extração (endereço completo)." |
| 2 | Tabelionato que lavra a ata | `tabelionato` | **sim** | de **3 a 120** letras (texto livre) | "Informe o tabelionato que lavra a ata notarial." |
| 3 | Livro, folha ou protocolo | `registro` | não | até **60** letras | "O registro da ata (livro, folha ou protocolo) passa de 60 letras." |
| 4 | Auditor independente (nome) | `auditor.nome` | **auditor ou 2+ testemunhas** | **3 a 80**, começa por letra; só letras (com acento), espaço, ponto, hífen e apóstrofo — **nunca número** | "O nome do auditor tem só letras (de 3 a 80)." |
| 5 | Registro do auditor | `auditor.registro` | não | até **60** letras | "O registro do auditor passa de 60 letras." |
| 6 | Testemunhas (uma por linha) | `testemunhas[]` | **2 a 6**, se não houver auditor | cada nome **3 a 80**, mesma regra de letras; **sem repetição** (maiúsculas e minúsculas contam igual); no máximo **6** | "O nome de cada testemunha tem só letras (de 3 a 80)." / "Há testemunha repetida." / "No máximo 6 testemunhas." |
| 7 | Auditor **ou** testemunhas | — | **sim** | sem auditor com nome válido, precisa de **pelo menos 2** testemunhas | "A ata precisa de um auditor independente ou de pelo menos 2 testemunhas sem vínculo com as promotoras." |
| 8 | Bolas (6, de 0 a 9) | `numeros` (no corpo do resultado) | **sim** | exatamente **6**, cada uma **um algarismo** | "Cada globo dá uma bola de 0 a 9." |
| 9 | Hora de cada bola | `bolas[i].hora` | **sim, as 6** | formato **HH:MM:SS** (24 h); a tela completa os segundos se o campo omitir; cada hora **não anterior** à do globo anterior | "Informe a hora em que saiu a bola do Nº globo (HH:MM:SS)." / "As bolas saem em sequência: …" |
| 10 | Quantidade de linhas do relato | — | **sim** | uma linha **por globo**, na ordem (6) | "O relato precisa ter uma linha por globo, na ordem." |
| 11 | Observações da ata | `observacoes` | não | até **1.000** letras | "As observações passam de 1.000 letras." |

Também exigido pelo ato (fora da ata):

- **Sessão** do globo, **depois de T**, **sem resultado** e **não cancelada**;
- **senha e código do autenticador** do master (segundo fator ligado);
- **um só lançamento**: o segundo clique recebe 409.

O algarismo de cada bola da ata **não é digitado duas vezes**: vem do resultado
lançado (`linhas.push({ globo, algarismo: bolas[i], hora })`). A ata guardada
(`sorteios_oficiais.ata`) tem: `local`, `tabelionato`, `registro`, `auditor`,
`testemunhas`, `bolas` (globo, algarismo, hora) e `observacoes`.

**Nova extração** (`validarNovaExtracao()`): as 6 bolas (0 a 9), as 6 horas
(HH:MM:SS), cada hora não anterior à anterior, e a **primeira** não anterior à
**última bola já registrada** (da sessão ou da extração passada). Não leva
tabelionato, testemunhas nem observações: **a ata do cartório é que atesta a
nova extração** (R38 pergunta se isso basta).

**O que o sistema não confere** (lista para a equipe checar à mão antes de
clicar): se o tabelionato é um cartório de verdade; se a hora da primeira bola é
próxima de T; se o auditor e as testemunhas são independentes; se o número do
registro da ata existe; se o local é o da transmissão.

**Aparece público** (conferência da rifa e prestação de contas): local,
tabelionato, registro, nome do auditor, nomes das testemunhas, as bolas com a
hora, as observações e o arquivo da ata. Nunca CPF ou telefone — por isso o
campo só aceita letras. Veja R39.

---

## 4. Checklist para ligar o globo

**Só ligue** em Sorteios oficiais (o calendário) → "Métodos de apuração" (marcar
"Globo da plataforma (ata notarial)" e "Salvar métodos"; 403 para organizador)
quando **todos** os itens estiverem feitos. Ligar não exige deploy.

**Documentos e decisões**

- [ ] **Resposta do advogado** às perguntas **R36 a R41** (seção 5) e, em
  especial, ao que significa "homologar" e a conciliação do Q39 (laudo e
  auditoria, faixa de R$ 15 mil a R$ 50 mil) com as respostas 8.9 a 8.12.
- [ ] **Documento da homologação em mãos**, se o advogado disser que existe
  (e de quem: da plataforma, da promotora ou de ambas). Sem documento, o
  responsável decidiu (13/10/2026, A4) que **nada é dito sobre o globo** nas
  peças e que o selo "em aberto" vira selo quando o documento sobe — **o selo
  ainda não existe no código** (`docs/FECHAMENTO-JURIDICO-CONTABIL.md`, A4). Ligar
  o globo não deve afirmar "homologado", "sem manipulação" nem "auditável" antes
  do documento (Q1c, `docs/RESPOSTAS-ADVOGADO.md`).
- [ ] **Tabelionato contratado** (ou ao menos acordo de agenda) e **resposta
  por escrito** a todas as perguntas da seção 1.3.
- [ ] **Auditor ou testemunhas** definidos para a primeira sessão, com os nomes
  como vão para a ata.
- [ ] **Equipamento** (6 globos, 10 bolas de 0 a 9 cada) definido, com o
  procedimento de lacre e guarda aprovado pelo advogado (R37).
- [ ] **Quem paga o cartório** decidido (plataforma, repasse às promotoras, taxa
  por sessão na tabela de cobrança). *Cobrar nova taxa da promotora tem as regras
  da cobrança (aumento exige 30 dias de aviso, `problemaNaVigencia()`) e o texto
  do contrato — a confirmar com o advogado e o contador (R41).*

**Contrato**

- [ ] **Anexo "globo" (cláusula 7) publicado** em Configurações → Contrato da
  plataforma → anexos (só a plataforma publica: texto do advogado, campos da
  empresa preenchidos). **Atenção**: modalidade **sem anexo publicado não barra
  nada** (`modalidadesDaRifa()`/`problemaDoContrato`): publicando o anexo
  **depois** de ligar o globo, as primeiras rifas publicariam sem aceite.
  Publique o anexo **antes**.
- [ ] As organizações que vão usar o globo **aceitaram** o anexo (cada
  organização vê o aceite no mesmo cartão; sem o aceite, a rifa do globo não
  publica).

**Texto público conferido** (nada novo no código, só ler)

- [ ] Regulamento da rifa do globo (`clausulaDoGlobo()`), ajuda (`shared/ajuda.ts`),
  Termos (`shared/legal.ts`) e Privacidade (ata com nome de auditor ou
  testemunhas) dizem o que o roteiro faz. Se o advogado pedir mudança, o texto
  muda por PR e a versão dos Termos sobe (`VIGENCIA_DOS_TERMOS`).

**Sistema (conferir no painel de produção)**

- [ ] O master tem **segundo fator ligado** e testado (seção 2.1, item 6).
- [ ] Um **canal de transmissão** (live) está pronto para a primeira sessão e o
  painel diz "Certo" para o link.
- [ ] Ensaio feito **num ambiente de teste** (banco local, nunca o de
  produção): `npm run apuracao` passa (globo de ponta a ponta) e, se quiser,
  uma sessão de ensaio foi cadastrada, lançada e recebeu uma ata de mentira.
  *Não ensaie em produção:* resultado lançado não se desfaz e a sessão fica
  no calendário público.
- [ ] Os **métodos liberados** hoje: só "Loteria Federal (leitura direta)". Ao
  ligar o globo, marque *só o globo a mais*, nunca desmarque a Federal (sem
  método liberado, **nenhuma rifa publica**).
- [ ] **Plano de contingência** lido pela equipe (seção 5.1, riscos 6 e 9).

**Depois de ligar**

- [ ] Conferir em "Autorização e sorteio" de um rascunho que a opção Globo
  aparece.
- [ ] Marcar no `docs/PENDENCIAS.md` o item "Homologar o globo" como feito (com
  a data e o documento) e atualizar `docs/ORDEM-DE-LANCAMENTO.md`.

---

## 5. Riscos e o que fica pendente do advogado

### 5.1. Riscos

1. **Conflito do Q39.** A resposta mais recente do advogado (Q39) fala em
   requerimento à SPA/MF, laudo técnico, auditoria, ata notarial e custo de
   R$ 15 mil a R$ 50 mil, **sem fonte**; as respostas 8.9 a 8.12, em ata
   notarial por sessão. A pergunta F13 (`docs/RESPOSTAS-ADVOGADO.md`) pediu a
   conciliação e **continua sem resposta**: P8 só diz "quando houver demanda,
   você entrega o roteiro da homologação com fonte". **A demanda agora existe
   (decisão de 18/10/2026)**: R36 cobra o roteiro. Nada neste documento fixa
   custo ou exige laudo; se o laudo for exigido, a conta muda.
2. **Digitação irreversível.** Resultado e dados da ata não têm edição depois
   do lançamento. Mitigação: segunda pessoa lendo; conferir cada hora; só
   clicar com a ata do cartório (ou rascunho dela) na frente.
3. **Rifa pouco vendida gira muitas vezes.** A cada giro, a chance de o número
   ter dono é, em média, **cotas vendidas ÷ total**. Rifa de 1.000.000 com 10%
   vendido exige, em média, 10 giros; com 1%, 100. Mitigação: os modos "rifa
   cheia na data" (mínimo 100%) ou mínimo de vendidas alto para o globo; a
   promotora escolhe — vale **orientação comercial** (e talvez limite)
   a definir. "Quando completar" não vale no globo.
4. **Reserva pendente × "no mesmo ato".** Ver seção 2.3, item 25 (R38).
5. **Ata chega depois do resultado.** O resultado público e as rifas sorteadas
   existem **antes** do arquivo do cartório (a tela mostra "arquivo ainda não
   anexado"). Se a ata demorar ou divergir do que foi lançado, a transparência
   fica fraca (R40: prazo máximo e consequência).
6. **Sessão que não acontece.** Com rifa publicada, a sessão **não cancela nem
   muda de data**: a saída é o **adiamento aprovado de cada rifa**
   (`pedirAdiamento()` com `sorteioOficialId`), pedido por cada organização e
   analisado pela plataforma, com reembolso integral para quem pedir. Mitigação:
   cartório confirmado com folga, tabelião substituto combinado, sessão marcada
   com margem, e orientar as promotoras a não publicar antes de o cartório
   confirmar por escrito.
7. **Transmissão cai ou o link não toca.** O link muda até o resultado;
   mantenha dois canais, grave localmente e registre a interrupção em
   "Observações da ata" (até 1.000 letras).
8. **Dados pessoais na ata pública** (nomes de testemunhas ou auditor, e quem
   aparece na gravação). R39.
9. **Perda do segundo fator do master.** Sem o código, não lança o resultado
   nem registra nova extração, e a sessão **não adia sozinha**. Mitigação:
   testar na véspera e ter um procedimento de recuperação da conta (**a definir**: não
   está descrito no repositório).
10. **Vício de comunicação.** Dizer "homologado", "sem manipulação" ou
    "auditável" nas peças, no kit do afiliado ou nos anúncios antes do
    documento (Q1c; R23; decisão A4). Vale também para o texto do convite ao
    cartório e à imprensa.
11. **Quem escolhe as bolas, quem manuseia.** O desenho do ato (quem gira,
    quem abre o globo, quem pode tocar nas bolas) é o que dá confiança à
    aleatoriedade e **não está no código**. Definir com o cartório e o advogado
    (R37).

### 5.2. Perguntas ainda abertas ao advogado

Só as que **não** estão respondidas nem já perguntadas (R1 a R23 já existem;
R23 trata do que dizer nas peças, e continua valendo). Numeração a partir de
**R36**, para não colidir com R24 a R35 (rodada do endereço próprio e perguntas
dos PRs abertos). Elas também estão no fim de `docs/PERGUNTAS-AO-ADVOGADO.md`.

- **R36. [1] O que é "homologar o globo" e o roteiro com fonte.** (a) Pelo P8
  da rodada final você ficou de entregar "o roteiro da homologação com fonte"
  quando houvesse demanda; **a demanda existe desde 18/10/2026**. Entregue o
  roteiro com a norma e o órgão. (b) Concilie o Q39 (requerimento à SPA/MF,
  laudo técnico, auditoria, R$ 15 mil a R$ 50 mil) com as respostas 8.9 a 8.12
  (ata notarial por sessão): o laudo e a auditoria vêm **além** da ata? De onde
  vem a faixa de valor? (c) A homologação é **da plataforma** (um ato único) ou
  **de cada promotora**, no plano de operação (8.11)? Que documento prova que o
  globo está homologado, para o selo "em aberto" virar selo?
- **R37. [1] Equipamento, independência e o papel do auditor.** (a) O globo
  físico (6 globos, 10 bolas de 0 a 9 cada) precisa de laudo, certificação ou
  lacre? Quem pode fornecê-lo e operá-lo? (b) A auditoria independente é
  **obrigatória** ou pode ser substituída por 2 testemunhas (como o sistema
  aceita hoje)? (c) Quem conta como "sem vínculo": exclui só as promotoras da
  sessão, ou também a plataforma, seus sócios e funcionários, e parentes?
- **R38. [1] Nova extração no mesmo ato e a ata.** (a) A ata notarial da sessão
  precisa descrever **cada** nova extração (por rifa)? Basta uma ata única da
  sessão? (b) O sistema impede registrar a nova extração enquanto há **reserva
  esperando Pix** (15 min por padrão): o ato pode ficar **aberto** esperando a
  reserva vencer, ou a espera descaracteriza o "mesmo ato"? (c) Quantas novas
  extrações são aceitáveis numa sessão antes de se reabrir a data (rifa pouco
  vendida)?
- **R39. [2] Dados pessoais na ata pública.** O nome do auditor e das
  testemunhas (e o nome do tabelionato) fica **público** na página da rifa, e a
  gravação da sessão fica na plataforma de vídeo. Qual a base legal (LGPD) e que
  autorização escrita dessas pessoas é necessária? Por quanto tempo guardar a
  gravação? O texto da Privacidade (`shared/legal.ts`) já diz que a ata é
  pública: está suficiente?
- **R40. [2] Prazo do arquivo da ata e divergência.** O sistema lança o
  resultado e **sorteia as rifas na hora**; o arquivo do cartório chega depois
  (dias). (a) O resultado vale antes de o arquivo existir? Há prazo máximo para
  anexá-lo e o que acontece se passar? (b) O prêmio pode ser entregue antes do
  arquivo? (c) Se o relato digitado no sistema divergir da ata do cartório,
  qual prevalece e qual o procedimento de correção (hoje o sistema não edita o
  relato)?
- **R41. [2] Quem paga o cartório e o anexo "globo".** (a) A despesa do cartório
  e do auditor por sessão pode ser **repassada às promotoras** (taxa por
  sessão, parte do preço da rifa, ou custo da plataforma)? Que cláusula do
  anexo "globo" (cláusula 7) e da tabela de cobrança (X.3, aviso de 30 dias)
  cobre isso? (b) Redija o **anexo "globo"** (texto de aceite da promotora) com:
  o método, a ata, a nova extração, a falta do tabelião e o adiamento por
  causa do cartório.

### 5.3. O que depende de gente fora do código

- **Responsável**: escolher o tabelionato (pelo menos dois orçamentos), fechar
  agenda, definir quem paga, fixar o auditor ou as testemunhas, montar o
  equipamento.
- **Advogado**: R36 a R41; o texto do anexo "globo"; o roteiro com fonte (P8).
- **Contador**: o tratamento da despesa do cartório (se houver repasse), junto
  de R41.
- **Código (depois, se o advogado pedir)**: o selo "em aberto" do globo
  (decisão A4 de 13/10/2026, ainda não implementado), uma tela de correção do
  relato da ata (hoje não existe) e qualquer mudança na ata (campo novo) —
  nada disso foi feito aqui.
