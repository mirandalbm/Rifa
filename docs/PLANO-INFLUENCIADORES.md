# Divulgação por influenciadores e outros canais — plano

Rascunho de 09/10/2026. **Decidido pelo dono**: sair do tráfego pago nas
redes (Meta, Google, TikTok) como foco e **concentrar a divulgação nos
influenciadores que já usam as plataformas**, com outros meios (portais,
anúncios nativos) em seguida. **Aprovadas as fases 1 e 2** deste plano
(seções 4 e 5); a 3 (seção 6) fica para depois das respostas por escrito dos
veículos. **Nada disto está no código**: é o plano para aprovar antes de
começar.

O tráfego pago (`docs/PLANO-TRAFEGO-PAGO.md`) **continua no código, desligado**
(`trafegoPago` nasce desligado). Nada é removido; o modelo A segue suspenso
(`docs/CONSULTA-CONTADOR-E-ADVOGADO.md`, seções 22 e 23).

## 1. Por que este caminho

- **Não passa dinheiro de mídia pela plataforma.** Com o influenciador pago
  por comissão sobre venda, não há saldo pré-pago de anúncio. Isso tira de cena
  o parecer de direito bancário sobre o saldo, o imposto da rede embutido no
  total pago (os 12,15% da Meta) e o ISS sobre a taxa de gestão da mídia.
- **O sistema já tem a base.** Afiliado avulso com vínculo por organização,
  termo com aceite (cláusula 7: "#publi", preço, data e autorização), kit de
  artes e pacote para postar, divulgação de terceiros com aprovação da
  organização, comissão (inclusive a guardada pela plataforma), cadastro fiscal
  só para MEI ou empresa, recibo, link com UTM e venda atribuída.
- **Ressalva honesta**: a restrição de rifa acompanha o *conteúdo*, não o
  modelo. Sair da conta de anúncios não tira a rifa da mira das regras de cada
  rede e do CONAR (seção 3). Muda quem responde e onde.

## 2. O que já existe e é reaproveitado

| Peça | Onde | Serve para |
|---|---|---|
| Afiliado avulso, vínculo por organização, termo versionado com aceite | `shared/afiliados.ts`, `server/services/afiliados.ts` | O influenciador adere à organização que quiser, com as regras dela |
| Divulgação de terceiros (legenda, mídia da rifa, foto e vídeo próprios, agenda, fila de aprovação) | `shared/divulgacao.ts`, `server/services/divulgacao.ts` | A peça passa pela organização antes de ir ao ar (foto e vídeo, sempre) |
| Kit: artes prontas, pacote para postar, editor de imagem, textos com "#publi" | `shared/artes.ts`, `shared/editorImagem.ts` | O influenciador baixa o material já dentro do termo |
| Comissão com carência, guarda pela plataforma, saque só a MEI ou empresa, recibo | `shared/pricing.ts`, `shared/fiscal.ts` | Pagar o influenciador sem a plataforma virar contratante de pessoa física |
| Link `?ref=<código>`, UTM, venda atribuída | `shared/marketing.ts`, `shared/resultados.ts` | Medir o que cada influenciador trouxe |
| Cadastro público de afiliado e "Seja um colaborador" | `POST /afiliados/cadastro`, `client/src/pages/CadastroAfiliado.tsx` | A porta de entrada que já existe |
| Verificação com selo de trevo | `shared/verificacao.ts` | Distinguir o influenciador conferido |
| Tráfego pago (fila, pedido, gasto, redes) | `server/services/trafego.ts` | Base para a fase 3 (mídia em portais) |

## 3. O que as regras dizem hoje (conferido, e o que não foi)

| Ponto | O que achei | Fonte | Grau |
|---|---|---|---|
| Identificação da publicidade pelo influenciador | O guia do CONAR foi atualizado em maio de 2026 e vale desde 1º de junho de 2026: a identificação tem de ser clara, visível e imediata, na primeira tela do conteúdo, sem rolar nem abrir a bio; prioriza a ferramenta nativa ("parceria paga") somada a "#publi" ou "#publicidade"; deixa de exigir controle editorial — basta relação comercial. | Meio & Mensagem; AMD Jus | Imprensa e escritório, **não li o guia** |
| Rifa no guia do CONAR | Nada específico apareceu nas buscas | — | **Não verificado** |
| YouTube | Desde 19/03/2025, o criador não pode levar o espectador a site de jogo de azar *não aprovado* (link, imagem, texto, logo ou fala). Prometer retorno garantido pode derrubar o vídeo mesmo com operador aprovado. Conteúdo que promove cassino online passa a ter restrição de idade. | Influencer Marketing Hub; Lindsey Gamble | Imprensa, **não li a política** |
| TikTok orgânico | Não é brecha: a plataforma olha incentivo financeiro, código promocional, URL, menção de marca e chamada para ação para dizer se o conteúdo é comercial. A política de anúncios de jogos exige certificação. | Track360; TikTok Ads | Imprensa e página oficial parcial |
| WhatsApp Business | A política lista "Real Money Gambling and Gaming" como proibido por padrão, com exceções que dependem de autorização da Meta. Nas listas de terceiros, o Brasil não aparece entre os países com jogo permitido. **Risco a conferir também para as mensagens que a própria plataforma já manda** (confirmação de compra, lembrete de reserva). | business.whatsapp.com/policy; Hubtype; Wati | Política oficial citada em guias de terceiros, **lista atual de países não confirmada** |
| Kwai | Não achei a política oficial de jogos. A reportagem do Aos Fatos mostrou o app pagando "missões" para divulgar jogos ilegais, e o Kwai respondeu que o link do anúncio é assunto do anunciante. | Aos Fatos; Reclame Aqui | **Não usar como base** |
| Taboola | A página de jogos que achei trata só dos EUA, por estado. Nada sobre rifa ou loteria no Brasil. | Taboola Help Center | **Não verificado para o Brasil** |
| Outbrain | Nenhuma política de jogos encontrada | — | **Não verificado** |
| UOL | Não pesquisei; e "UOL Host" pode ser a hospedagem — falta o dono dizer o que quis | — | **Pendente** |
| Marketplaces de influência | Squid (comprada pela Locaweb em 2021, mais de 100 mil criadores na época), Influency.me (um concorrente aponta contrato anual de cerca de US$ 20 mil — valor **não confirmado**), Airfluencers. Se aceitam rifa, não sei. | Startupi; ABC da Comunicação; Influencer Hero | **Não verificado** |

**Consequência**: a fase 1 não pode prometer ao influenciador que "pode postar
em qualquer rede". O termo e a tela dizem o que a plataforma sabe e o que não
sabe, e a organização e o influenciador respondem pelo que publicam.

## 4. Fase 1 — o influenciador como canal principal

Quase tudo é reaproveitamento. Entra o que falta para a organização **encontrar,
convidar, acompanhar e comparar** influenciadores.

**4.1 Porta de entrada.** A página de cadastro de afiliado ganha o caminho
"Sou influenciador": nome, redes (só `https:` no domínio da própria rede, a
régua de `REDES_DO_RODAPE`), nicho, cidade. Sem seguidores digitados — número
que o sistema não confere não vira dado de decisão. O selo de verificado
(já existente) é o que distingue.

**4.2 Convite da organização.** A organização gera um link de convite para um
influenciador específico. O convite é de uso único, guarda só a impressão
(hash), vence (7 dias) e **só encurta o caminho**: o aceite do termo e a
aprovação continuam valendo. Quem decide que o convite foi usado é um `UPDATE`
condicional (`aberto` → `usado`), nunca um `SELECT` antes.

**4.3 Vitrine de rifas para divulgar.** Para quem tem vínculo, uma lista das
rifas da organização que aceitam divulgação, cada uma com a comissão que vale
nela (`pctDaComissao`, do termo da rifa) e o material pronto. Só rifa publicada,
não demonstração, não travada, de promotora no ar (a régua `rifaParaDivulgar`).

**4.4 Desempenho por influenciador** (organização e plataforma), no recorte
de `orgOf`: cliques no link, pedidos pagos, valor, comissão gerada e a
situação dela (pendente, disponível, paga, estornada), por rifa e por
período. **A venda atribuída pelo link `?ref=` é a que paga comissão** (já é
dinheiro hoje); a tabela de UTM por canal segue estatística e a tela diz
isso. Ranking só por venda paga; nunca por seguidores.

**4.5 Conformidade na tela, antes de postar.** Lista de conferência (não
trava, avisa): "#publi" e a ferramenta nativa de parceria paga; preço, data e
número da autorização SPA/MF; sem promessa de ganho; sem Pix por fora; sem
menores; 18+. A peça com foto ou vídeo próprio já passa pela organização em
qualquer modo.

**4.6 Texto-base do termo.** Nova versão do termo base (`montarTermo()`) com:
a identificação nos moldes do guia do CONAR vigente; que as regras de cada
rede valem para o influenciador e ele responde por elas; a proibição de
divulgar fora das regras da rede onde posta; e que a plataforma e a
organização podem pedir a retirada da peça. **Mudar o texto-base não reescreve
versão publicada**: a tela já avisa a organização para publicar a seguinte.
O texto é do advogado (seção 7).

**4.7 Medição.** O link do influenciador leva `utm_source=influenciador` e
`utm_campaign=<código>` (estatística, no relatório "Vendas por campanha").

**4.8 Antifraude de afiliado.** A autoindicação já é bloqueada por telefone;
somar CPF, e o teto de cliques por IP e aparelho já usado no patrocínio, para
o influenciador não inflar o próprio desempenho com cliques.

**Provas**: `npm run influenciadores` (nova) contra a API de verdade:
convite de uso único, convite vencido, vínculo só com o aceite, vitrine só com
rifa que aceita divulgação, desempenho no recorte (o vizinho não aparece), e
`npm run isolation` ganha as rotas novas.

## 5. Fase 2 — contratar com cachê, sem a plataforma mover o dinheiro

**Decisão de desenho (a confirmar com o advogado e o contador): a plataforma
registra o acordo e as entregas; o pagamento do cachê é da organização para o
influenciador, fora da plataforma.** Pagar pela plataforma (guardar o valor
até a entrega) é conta de pagamento e fica de fora (parecer de direito
bancário, `docs/PERGUNTAS-AO-ADVOGADO.md`).

**5.1 O acordo.** A organização propõe a um influenciador vinculado: o que
será entregue (tipo de peça, quantidade, rede), prazo, valor combinado (em
centavos, **só registro**) e se soma comissão por venda. O influenciador
aceita ou recusa. Um acordo em aberto por organização, influenciador e rifa:
quem decide é o índice parcial, nunca um `SELECT` antes. O texto do acordo
fica fotografado com a impressão SHA-256 (a régua do aceite do contrato).

**5.2 As entregas.** Cada peça é uma `divulgacao` existente, ligada ao acordo.
Situação do acordo: `proposto` → `aceito` → `em_entrega` → `entregue` →
`concluido` (ou `recusado`, `cancelado`, `em_disputa`). Toda troca é `UPDATE`
condicional à situação lida. A prova da publicação é o endereço da peça no ar
(só `https:` do domínio da rede) mais o print opcional, reprocessado.

**5.3 Dinheiro e fiscal.** O influenciador emite a nota para a organização: a
mesma régua do saque (só MEI ou empresa, cadastro fiscal aprovado). A
organização marca "pago", com a data e o comprovante opcional; **a plataforma
não confirma o pagamento**, só registra. Comissão por venda, quando houver,
segue o caminho de sempre (carência, saque, recibo).

**5.4 Disputa.** Se a entrega não bate com o acordo, a organização e o
influenciador conversam pela mensagem do acordo (como o Atendimento) e a
plataforma é a instância final, com a mesma regra da disputa de reembolso
(decide a versão que leu, `UPDATE` condicional, auditoria).

**5.5 O que não entra nesta fase**: pagamento pela plataforma, adiantamento,
escrow, e cachê para pessoa física (a plataforma não é a fonte pagadora, mas a
tela diz ao influenciador sem CNPJ que o acordo não gera nota e que o IR é
dele; **perguntar ao contador**).

**Provas**: `npm run acordos` contra a API de verdade (um acordo em aberto,
dois aceites simultâneos, entrega fora do prazo, disputa, recorte de
organização) e `isolation` com as rotas.

## 6. Fase 3 — portais e anúncios nativos (Taboola, UOL e afins)

**Fora do escopo desta aprovação.** Só começa depois da resposta *por escrito*
de cada veículo sobre rifa autorizada pela SPA/MF no Brasil (seção 3). O que
reaproveita: o pedido de campanha, a fila, o gasto lançado ou importado e a
margem do tráfego pago, com a "rede" nova. Antes de qualquer integração, o
`pesquisador-de-integracao` lê a documentação oficial do veículo.

## 7. Perguntas novas ao advogado

Entram em `docs/PERGUNTAS-AO-ADVOGADO.md` como **terceira rodada** (R16 a R22):

- **R16. [1] Responsabilidade por post de influenciador.** A plataforma
  responde pela peça que o influenciador publica com o link dela? E a
  organização? Que cláusulas do termo do afiliado (e do contrato da
  promotora) separam essas responsabilidades?
- **R17. [1] O que o guia do CONAR (vigente desde 1º/06/2026) exige em
  rifa e sorteio?** Existe regra própria para promoção com autorização
  SPA/MF? O "#publi" mais a ferramenta nativa bastam?
- **R18. [1] Decreto 70.951/1972 e a divulgação.** A publicidade da rifa tem de
  trazer o número da autorização? Em que formato, em todas as peças (inclusive
  o story e o reels)?
- **R19. [1] Regras das redes sobre o conteúdo orgânico.** YouTube, TikTok,
  Instagram e Kwai: a rifa autorizada pela SPA/MF conta como "aprovada" ou
  "licenciada" para essas políticas? O criador que posta responde sozinho?
- **R20. [2] WhatsApp Business.** A política proíbe "jogo com dinheiro real"
  por padrão. As mensagens de compra que a plataforma manda (confirmação,
  lembrete, resultado) correm risco de bloqueio do número? Há como pedir a
  autorização da Meta?
- **R21. [2] Acordo com cachê (fase 2).** O modelo "a plataforma registra, a
  organização paga direto" evita ser contratante do influenciador? Que
  cláusulas o acordo precisa ter? Pessoa física sem CNPJ pode ser contratada
  pela organização nesse formato?
- **R22. [2] Anúncio em portal e rede nativa.** Há regra que proíba ou limite
  rifa autorizada em publicidade paga fora das redes (portais, Taboola,
  Outbrain)? A mesma resposta de "agregador" do Google vale aqui?

E ao **contador**: cachê pago pela organização a MEI e a pessoa física (nota,
IR); se a plataforma tem algum tributo sobre o registro do acordo (não cobra
nada por ele); e se a comissão do influenciador na fase 1 muda alguma coisa do
que já foi respondido (resposta 6.4, retenção).

## 8. Canais para divulgação, campanhas e marketing

Legenda: **Sim** = a política que li permite com condições; **Cond.** =
depende de autorização ou certificação; **?** = não verificado; **Não** =
vedado. "No sistema" diz como o canal se liga ao que já existe.

### 8.1 Redes sociais (conteúdo do influenciador e da organização)

| Canal | Orgânico (influenciador) | Pago | Observação | No sistema |
|---|---|---|---|---|
| Instagram | ? | Cond.: autorização por escrito da Meta | Reels, stories, carrossel e Direct são o centro da divulgação | Kit de artes (feed 4:5, quadrado, story), reels gerado, pacote para postar |
| Facebook | ? | Cond. (mesma da Meta) | Grupos e páginas regionais costumam render para rifa | Kit; link com `?ref=` |
| YouTube | Cond.: não levar a site não aprovado; sem retorno garantido | Cond. (Google, sem agregador) | Vídeo longo e Shorts | Reels em pé serve para Shorts |
| TikTok | Cond.: olhar incentivo, código e chamada para ação | Não, para rifa (conclusão do advogado, fundamento oscila) | Alcance alto, risco alto | Reels gerado |
| Kwai | ? | ? | Política não encontrada; reportagens apontam fiscalização frouxa | **Não basear em Kwai** |
| X (Twitter), Threads | ? | ? | Texto curto, notícia | Legenda sugerida |
| Pinterest | ? | ? | Imagem de prêmio, busca visual | Arte da rifa |
| Telegram (canais) | ? | ? | Comunidade de sorteios é grande no Brasil | Link com `?ref=` |
| Discord, Twitch | ? | ? | Nichos de jogo e streaming | — |
| WhatsApp (canais, comunidades, listas) | Cond.: política proíbe jogo por padrão | Cond. | Também vale para as mensagens transacionais (R20) | Mensagens transacionais já existem |

### 8.2 Portais, rede nativa e mídia programática

| Canal | Situação | Observação |
|---|---|---|
| Taboola | **?** (só achei jogos nos EUA) | Consulta por escrito (fase 3) |
| Outbrain | **?** | Idem |
| Revcontent, MGID e afins | **?** | Idem |
| UOL (publicidade) | **Pendente** | Falta o dono dizer o que quis dizer com "UOL Host" |
| Globo (ge, g1), R7, Terra, iG, Folha, Estadão, Metrópoles | **?** | Venda direta de mídia; cada veículo tem política própria |
| Portais e blogs regionais | **?** | Costuma ser o melhor custo para rifa de cidade ou estado |

### 8.3 Influência, creators e redes de afiliados

| Canal | Situação | Observação |
|---|---|---|
| Influenciadores diretos (fase 1) | Cond. (regras da rede onde postam) | Convite pela organização; comissão por venda |
| Marketplaces de influência (Squid, Influency.me, Airfluencers e outros) | **?** (se aceitam rifa) | Pagamento passa por eles; fora do nosso fluxo |
| Agências de influência | ? | Mesma dúvida; contrato direto com a organização |
| Redes de afiliados (Hotmart, Awin, Lomadee, Afilio e semelhantes) | **?** (costumam restringir jogo) | Não verificado |
| Microinfluenciadores locais | Cond. | Metade da base de criadores no Brasil tem menos de 10 mil seguidores (estudo da Squid, via ABC da Comunicação) |

### 8.4 Canais próprios (sem política de terceiro a mais)

| Canal | Observação | No sistema |
|---|---|---|
| Vitrine, Reels, Buscar e stories da plataforma | O público já está comprando rifa | Já existe |
| Grupos da rifa e Mensagens | Conversa entre apostadores | Já existe |
| Push no celular e central de avisos | Quem seguiu e quem comprou | Já existe |
| E-mail e SMS da própria base | Só com consentimento; fora do escopo hoje | Não existe |
| Indicação e presente (bônus) | Apostador chama apostador | Já existe (desligado até o advogado) |
| Página da organização (`/o/<org>`) e endereço curto (`/c/…`) | Link na bio, cartão, QR | Já existe |
| Busca do Google (SEO) e Google Meu Negócio | Páginas públicas das rifas | A página da rifa existe; falta o trabalho de SEO |
| QR code e material impresso | Ponto de venda, lojas, eventos | O QR já sai nas artes |

### 8.5 Mídia tradicional e local

| Canal | Observação |
|---|---|
| Rádio local, TV regional, jornal | Forte em rifa de cidade; o número da autorização na peça é pergunta R18 |
| Carro de som, panfleto, outdoor, faixa | Muito comum; mesma pergunta |
| Parceria com comércio e eventos | O prêmio vira atração; contrato direto |

### 8.6 Ferramentas de operação (não são canais)

Agendamento e métricas de redes (Metricool), Canva e as nossas artes, vidIQ
para vídeo, Windsor.ai e Supermetrics para importar gasto. São do time, não do
produto; entram só onde já existem (importação do gasto, fase 2 do tráfego).

## 9. O que não pode afrouxar (quando for ao código)

1. **Nenhum cachê passa pela plataforma.** O acordo é registro; o pagamento é
   da organização. Mudar isso é decisão do advogado e do contador.
2. **A comissão segue o caminho de hoje.** Carência, guarda, saque só a MEI ou
   empresa, recibo. Nada de percentual novo no corpo da requisição.
3. **Atribuição para pagar é o link `?ref=` conferido pelo servidor**
   (`comissaoNaRifa()`); a UTM e o ranking são estatística.
4. **Convite e acordo se decidem por `UPDATE` condicional e índice único.**
5. **Recorte em tudo**: o influenciador do vizinho e o acordo do vizinho são
   404; o desempenho da organização A nunca soma a B; a plataforma vê tudo.
6. **Nada de dado pessoal no desempenho**: só código e nome curto do
   influenciador; nunca CPF, CNPJ, telefone ou chave Pix.
7. **A peça é conferida antes de ir ao ar** (a régua da divulgação) e a
   identificação como publicidade nunca é opcional no texto pronto do kit.
8. **Sem número de seguidor digitado como dado de decisão.**

## 10. Ordem de execução proposta

1. **PR 1 — Convite e vitrine de rifas** (4.2 e 4.3), com a prova nova.
2. **PR 2 — Desempenho por influenciador** (4.4, 4.7 e 4.8).
3. **PR 3 — Termo-base novo e conferência na tela** (4.5 e 4.6), *depois* da
   resposta do advogado às R16 a R19.
4. **PR 4 — Acordo e entregas** (fase 2), *depois* de R21 e do contador.
5. Fase 3 só com as respostas por escrito dos veículos.

Cada PR sai como rascunho, com `npm run isolation` e a prova da fase, e passa
pelo `revisor-de-invariantes` quando mexer em comissão, vínculo ou recorte.
