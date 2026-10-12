# Plano da reformulação dos painéis — RASCUNHO, nada aplicado

Situação: **plano para aprovação**. Nenhuma linha de código foi mexida.
Data: 09/10/2026. Este documento só vira PR se você disser.

## 0. Ordem: primeiro o jurídico e o contábil (decisão de 10/10/2026)

O dono decidiu ir por partes: advogado e contador **finalizados antes** de
refazer o sistema, para não haver mudança por causa deles depois. A Parte 1
está em `docs/FECHAMENTO-JURIDICO-CONTABIL.md` (situação, perguntas na ordem
de envio, dependências e o critério para começar). Este plano é a **Parte 2**
e só inicia quando aquele critério passar. Duas áreas pedem cuidado: o menu
e os papéis (perfis de equipe e Tesouraria dependem de respostas ainda não
dadas) e a área "Dinheiro" (depende do parecer sobre o saldo pré-pago).

As dúvidas **não** estão todas sanadas. Fechado: termos de uso, anexos A a E,
termo do afiliado, apuração, IRRF. Aberto: o saldo pré-pago, o modelo de
tráfego, os influenciadores (R16 a R23), a Tesouraria e os perfis de equipe, o
parecer conjunto e o município da sede.

### Decisões de 10/10/2026 (noite) que entram no desenho

- **Menu e papéis**: os 6 perfis de equipe (`docs/PLANO-FINANCEIRO.md`,
  seção 9) e o grupo **Tesouraria reservado** (entra depois do lançamento).
- **Área "Dinheiro"**: **sem saldo pré-pago** (cada compra com o próprio
  Pix e a sobra devolvida), **conta de recebimento obrigatória** da
  promotora no gateway (provável Pagar.me) — uma tela nova de cadastro — e
  o tráfego pago no **modelo da promotora** (a conta de anúncio é dela).
- Detalhe em `docs/FECHAMENTO-JURIDICO-CONTABIL.md`, "Decisões do dono por
  blocos".

### Fase 0 — situação (10/10/2026)

Feita: `docs/REFORMULACAO-MATRIZ.md`, **gerada do código** (`npm run matriz`):
66 telas, 41 seções de acesso, os cartões de cada tela, as 477 rotas da API
com a prova que cada uma tem e a lista das que nenhuma prova cita; e o teste
`tests/matrizReformulacao.test.ts`, que falha se a matriz ficar velha ou se
tela, seção ou cartão novo não tiver linha em
`docs/reformulacao-destinos.json`. Todos os destinos estão como "a decidir":
é a fase 2 que os preenche. Falta: ler a matriz (você), a tag
`marco-antes-da-reformulacao` (depois que o PR for mesclado) e as capturas do
"antes" (`npm run telas`, em `capturas/`, fora do git).

## 1. Diagnóstico: por que o painel parece "escrito"

Medido no repositório (51 páginas, 89 componentes, cerca de 60 telas no
`npm run telas`):

1. **Texto explica o que o desenho deveria mostrar.** Os cartões trazem
   parágrafos de regra (as seções do `CLAUDE.md` viraram avisos na tela).
2. **Quase toda tela abre num formulário ou numa lista**, não numa pergunta
   ("o que eu faço agora?").
3. **Sem trilha.** Publicar uma rifa exige autorização, dados legais, mídia,
   contrato, telefone aprovado, sócios, anexos… e o painel mostra isso como
   cartões soltos em quatro abas, não como um caminho com progresso.
4. **Estado em prosa.** Pílulas existem, mas muita situação ainda é frase.
5. **Gráficos só no Painel e em Resultados.** Funil, linha do tempo da rifa,
   medidor de cotas, mapa por estado, comparativos: quase nada.
6. **Estado vazio é texto.** Falta ilustração e botão de próximo passo.

## 2. Lista total de pendências (64 itens abertos em `docs/PENDENCIAS.md` + planos)

Dono: **V** = você, **C** = código (Claude), **A** = advogado, **K** = contador.

| Bloco | O que há | Dono | Trava a reformulação? |
|---|---|---|---|
| A. WhatsApp e Meta | verificar a empresa, perfil, número real, token permanente, modelo `chamado_novo`, teste | V | não |
| B. Deploy | `npm run db:push` antes do código; variáveis (Meta, Windsor, COFRE_CHAVE, SESSION_SECRET); trabalhador no Railway | V | não |
| C. Pagamento | escolher Mercado Pago ou Asaas; conferir split, Pix de carrinho e devolução parcial no sandbox | V | não |
| D. Infra | bucket R2 e chaves; domínio; Google OAuth; AWS (opcional); apagar branches | V | não |
| E. Segurança de acessos | segundo fator, trocar senhas que passaram pela conversa, apagar token antigo da Meta, publicar a revisão de segurança | V | não |
| F. Chatbase | agente Lucky, ações, base de conhecimento (`npm run base-ia`) | V | não |
| G. Cada organização | endereço, foto/bio, capa/cor/links, termo de afiliado, aprovar telefone | V (por org) | não |
| H. Ligar interruptores | presente, bônus, guarda da comissão, reembolso | V | não |
| I. Antes de abrir | reset geral (apagar o perfil de demonstração), conferir vídeo no celular, tabela de patrocinadas e banner pago | V | não |
| J. Advogado | ver `FECHAMENTO-JURIDICO-CONTABIL.md` (A1 a A20): estrutura do parecer, influenciadores, saldo pré-pago (direito bancário), equipe e Tesouraria, contrato final da promotora, globo | V + A | **sim** (menu, papéis e Dinheiro) |
| K. Contador | ver `FECHAMENTO-JURIDICO-CONTABIL.md` (C1 a C10): parecer conjunto, preço da taxa, cachê, município e item de serviço, "revenda", Tesouraria | V + K | **sim** (Tesouraria) |
| L. Marketing (decisão) | modelo A suspenso ou reajustado; priorizar o B; consultas por escrito a Meta, Google, Taboola, Outbrain, UOL; o que é "UOL Host" | V | não |
| M. Código aberto | influenciadores PR 1 (convite e vitrine), PR 2 (desempenho), dossiê de conformidade, PR 3 (termo; espera R16-R19, R23), PR 4 (acordo com cachê; espera R21 e contador); Tesouraria (`PLANO-FINANCEIRO.md`, não existe no código); APK das maquininhas (precisa do Android SDK); ferramentas de publicação que ficaram; CSP valendo (depende do log) | C | não (competem por agenda) |
| N. **Reformulação dos painéis** | este plano | C + V | — |

Regra de convivência: a reformulação **não muda regra de negócio**
(`shared/` e serviços ficam). Os PRs M continuam nas mesmas telas; por isso a
Onda de cada painel começa só depois que o PR M daquele painel for mesclado ou
adiado.

## 3. Mapa do sistema (fase 0, para nada se perder)

Insumos já existentes: `docs/REMODELAGEM.md` (inventário), `docs/VERSOES.md`
(mapa de ~60 telas × 3 larguras), `MENUS` em `shared/access.ts`,
`tests/menu.test.ts` e `tests/versoes.test.ts` (conferem menu e mapa contra o
`App.tsx`), Graphify (grafo do repositório).

A fase 0 produz a **matriz de cobertura** (`docs/REFORMULACAO-MATRIZ.md`):
uma linha por cartão/ferramenta, com

`papel · rota · arquivo · componente · rota da API · invariante · prova (npm run …) · destino na tela nova · decisão (manter / fundir / mover / sair)`

Critério de saída: nenhuma linha sem destino, e um teste que falha se uma
rota, seção de acesso ou `title=` do "antes" não tiver destino (a mesma
conferência mecânica da seção 6 de `docs/REMODELAGEM.md`, agora automática).
Linha de base: `npm run telas` guardado (capturas do "antes") e o commit
atual marcado como tag `marco-antes-da-reformulacao`.

## 4. Princípios para o painel ficar didático

1. **Uma pergunta por tela.** Cada tela abre respondendo "o que faço agora?"
   (próxima melhor ação), depois números, depois detalhe.
2. **Orçamento de texto.** Título + 1 frase + dado. O resto vai para "Como
   funciona" (recolhível, com ícone e, onde ajudar, um GIF de 5 s).
3. **Trilha em vez de cartões soltos.** Publicar rifa vira assistente em
   passos com progresso (rascunho → autorização → mídia → contrato → revisão
   → no ar → vendendo → sorteio → entrega). Cada passo mostra o que falta com
   ícone, e o botão leva ao ponto.
4. **Desenho antes de frase.** Linha do tempo da rifa, medidor de cotas,
   funil (visita → carrinho → pago), mapa do Brasil por estado, comparativo
   com o período anterior, sparkline em toda estatística.
5. **Estado vazio com próximo passo** (ilustração leve + um botão).
6. **Status em chip com ícone e texto**, nunca só cor (já é regra).
7. **Linguagem do dono de rifa, não da lei**: o jargão fica num glossário
   (balão "?"), e a regra completa continua no regulamento e nos Termos.
8. **Mesma regra de sempre**: `tnum`, rótulo visível, 16 px no celular, alvo
   de 24 px, três larguras, dois temas, 404/403 intactos.

## 5. Variáveis de alto nível da simulação (tokens)

A simulação usa os **tokens reais** de `client/src/index.css`, estendidos:

| Grupo | O que se define |
|---|---|
| Cor | as atuais (claro: branco, azul, verde; escuro: preto, verde, azul; sem amarelo) + escala neutra de 10 passos + paleta de gráficos (série única verde; comparativo azul; categorias a partir de verde/azul/neutros, contraste ≥ 3:1) |
| Tipografia | escala de 8 tamanhos (Inter nos painéis), pesos, `tnum` para números, altura de linha |
| Espaço e raio | grade de 4/8 px; raios 6/10/16; densidade confortável e compacta |
| Elevação | 3 níveis (papel, flutuante, modal) nos dois temas |
| Movimento | durações 120/200/320 ms, curva única, respeito a `prefers-reduced-motion` |
| Ícones | Solar (já em uso, CC BY 4.0), tamanhos 16/20/24 |
| Ilustração | conjunto único de estados vazios e de sucesso, mesmo traço |
| Componentes novos | `ProximaAcao`, `Trilha`, `Funil`, `Medidor`, `LinhaDoTempo`, `MapaBR`, `EstadoVazio`, `ComoFunciona`, `Glossario` |

## 6. Organização das ferramentas (fase 2)

Proposta de partida, a ser desenhada e testada na simulação:

| Papel | Hoje | Proposta |
|---|---|---|
| Organizador | Painel + muitas telas/abas | **Início** (próxima ação, rifa em andamento, números) · **Minhas rifas** (com a trilha) · **Vender** (pedidos, cambistas, afiliados) · **Divulgar** (Marketing: artes, vídeo, patrocínio, banner, tráfego) · **Dinheiro** (resultados, cobrança, saques) · **Conta** |
| Plataforma | Caixa + 6 grupos | **Mesa de decisão** (Caixa como cartões por tipo, com contagem e prazo) · **Saúde** (semáforo: pagamentos, antifraude, filas, trabalhador) · **Organizações e pessoas** · **Dinheiro** (+ Tesouraria quando existir) · **Plataforma** (aparência, apuração, sorteios, integrações) |
| Afiliado | 6 telas | **Ganhos** (funil e saldo) · **Divulgar** (link, QR, artes, kit) · **Organizações** · **Meus dados** |
| Cambista | 3 telas | **Vender** em modo caixa (botões grandes) · Acerto |
| Loja | mapa de `VERSOES.md` | mantida; só ajustes de consistência |

## 7. Fases e entregas

| Fase | O que sai | Quem | Aprovação |
|---|---|---|---|
| 0 Mapa e linha de base | matriz de cobertura, capturas do "antes", tag | Haiku (extração), Opus (conferência) | você lê a matriz |
| 1 Direção visual | pesquisa, 3 moodboards, escolha de 1 direção, tokens | Fable | **você escolhe** |
| 2 Arquitetura da informação | árvore de navegação, "onde mora cada ferramenta", fluxos | Opus | **você aprova** |
| 3 Simulação | (a) fluxos em baixa fidelidade, (b) telas em alta fidelidade com os tokens reais, (c) protótipo clicável com dados de exemplo; 2 rodadas de ajuste; tarefas de teste ("publique uma rifa", "ache o pedido X") com tempo e cliques | Fable (visual), Sonnet (volume), Opus (fluxos) | **você aprova cada painel** |
| 4 Congelar o desenho | especificação por tela + critérios de aceite | Opus | você assina |
| 5 Produção (ondas) | 1 base e componentes → 2 organizador → 3 plataforma → 4 afiliado/cambista → 5 loja | Sonnet, Opus nos fluxos críticos | PR por onda, rascunho, revisor de invariantes, capturas |
| 6 Recriação final | passada de coerência, a11y, desempenho, `npm run telas` sem reprova, docs | Fable (visual), Sonnet, Haiku | você confere |

Cada PR de produção: `/provar`, `revisor-de-invariantes` (quando toca recorte,
dinheiro ou rota), `conferente-de-telas`, `docs/VERSOES.md`, `CLAUDE.md` e
`docs/REMODELAGEM.md` atualizados no mesmo PR.

## 8. Modelos por nível de complexidade (agora com Haiku)

| Nível | Modelo | Para quê |
|---|---|---|
| 1 Mecânico, em volume | **Haiku 5.5** | extrair inventário, montar a matriz, rodar capturas, procurar texto longo/jargão, checar links, renomear em lote, conferir que cada `title=` do "antes" existe |
| 2 Baixa e média | **Sonnet 5.5 high** | implementar tela/componente já desenhado, testes, provas, microtexto, acessibilidade, a leva das versões |
| 3 Alta complexidade | **Opus 5.5** | arquitetura da informação, navegação e `MENUS`/acesso, assistente de rifa (estado e validações), Caixa/Mesa de decisão, qualquer coisa que toque recorte, dinheiro ou rota; revisão de invariantes; decisões de migração |
| 4 Visual | **Fable 5.1 high** | direção visual, tokens, ilustração, simulação, protótipo, revisão visual final |

Regra de escalada: tarefa que o nível falhar duas vezes sobe um nível. Tarefa
que toca invariante do `CLAUDE.md` nunca fica abaixo do nível 3.

## 9. Agentes propostos

Já existem: `implementador-da-rifa`, `revisor-de-invariantes`,
`conferente-de-telas`, `pesquisador-de-integracao`, `analista-de-csp`.
Novos (arquivos em `.claude/agents/`, em português, só depois do seu ok):

| Agente | Modelo | Faz | Não faz |
|---|---|---|---|
| `cartografo-do-sistema` | Haiku | matriz de cobertura, lista de rotas/seções/cartões | decidir destino |
| `conferente-mecanico` | Haiku | capturas, links, texto acima do orçamento, jargão | mudar tela |
| `arquiteto-de-informacao` | Opus | árvore de navegação, trilhas, onde mora cada ferramenta | desenhar pixels |
| `diretor-visual` | Fable | direção, tokens, referências, coerência | mexer em regra |
| `prototipador` | Fable | simulação em alta fidelidade e clicável | produzir código final |
| `redator-de-interface` | Sonnet | microtexto curto, glossário, estados vazios | texto jurídico |
| `auditor-de-acessibilidade` | Sonnet | foco, contraste, leitor de tela, alvo de toque | redesenhar |
| `revisor-visual-final` | Fable | passada de coerência entre telas e temas | regra de negócio |

Os existentes ganham o modelo certo: implementador Sonnet (Opus nos fluxos
críticos), revisor Opus, conferente Sonnet, pesquisador Sonnet.

## 10. Cowork

Mecânica disponível aqui: sessão remota no ambiente `remote_cowork`, com
`model` por sessão. **A verificar antes de depender**: o Cowork ignora o
repositório (só prompt, título, modelo e tags), então serve para **pesquisa,
direção visual, simulação, documentos e a matriz**; o **código** roda em Claude
Code com cópia separada. Um agente por tarefa, com o modelo da seção 8; você
pode também indicar o agente à mão por tarefa.

## 11. Skills, conectores e plugins

**Conectores já ligados e úteis:** Figma (telas, variáveis, biblioteca,
`generate_diagram`), Miro (fluxos, protótipo), Canva e Adobe Express (apoio de
ilustração/arte; Adobe manda dashboards para `frontend-design`, que o projeto
tirou — usar só o conector de fontes/paletas), Mermaid Chart e tldraw
(diagramas), Graphify (mapa do código), Context7 (documentação de biblioteca),
Claude Docs/Artifact (HTML clicável e documento), Notion (memória: vazio),
Railway (prévia/deploy), Windsor e Supermetrics (dados reais dos painéis de
marketing depois), Playwright/Chromium (capturas).

**Bloqueado:** Mobbin respondeu "requer plano pago" — sem ele a busca de
telas de referência não roda aqui.

**Skills do projeto:** `provar`, `pr-check`. **Já instaladas:**
`ux-researcher-designer`, `apple-hig-expert`, `a11y-audit`, `webapp-testing`,
`performance-profiler`, `copywriting`, `copy-editing`, `page-cro`,
`signup-flow-cro`, `agent-development`, `dispatching-parallel-agents`,
`verification-before-completion`; nativas `dataviz` e `artifact-design`.
**Skills do Figma** (`figma-use`, `figma-generate-design`,
`figma-generate-library`, `figma-design-to-code`, via `get_figma_skill`) para
ligar tokens do código ao arquivo de design.

**Exceção a decidir:** `frontend-design`, `ui-design-system`, `design-system`
e `brand-guidelines` estão fora **de propósito** (propõem identidade nova).
Se você escolher a direção B da seção 12, entram só para a fase 1, passando
pelo `skill-security-auditor`, e o `CLAUDE.md` muda com o seu ok.

**Plugins:** buscar no catálogo (`SearchPlugins`) no início da fase 1; nada
instalado sem você ver o card.

## 12. Decisão que muda tudo (identidade visual)

O `CLAUDE.md` fixa: claro = branco, azul e verde; escuro = preto, verde e
azul; **sem amarelo**; padrão Materialize nos painéis. Duas leituras do seu
pedido:

- **A. Evolução (recomendada):** mantém marca, paleta e Materialize; muda o
  **desenho da informação** (trilhas, gráficos, estados vazios, menos texto).
  É onde está o "muito escrito". Risco baixo, ganho alto.
- **B. Nova linguagem visual:** nova família de componentes, possivelmente
  outra paleta/tipografia. Pede mudar o `CLAUDE.md`, os testes de tema e o
  `index.css`, e toca as 60 telas.

## 13. Inspiração: o que foi achado (e o que não)

- Mobbin: bloqueado (plano pago).
- Busca na web: só encontrou listagens (Dribbble: "Sales & Analytics —
  Marketplace Admin UI", painéis fintech; um estudo de caso de carteira
  digital de 27/08/2026 que prioriza saldo e atividade recente) e roundups que
  citam Linear (hierarquia), Stripe (densidade de dados) e Vercel (restrição
  de cor). **Não achei o Behance e não li as páginas das referências**: fontes
  são de terceiros e não validei os visuais.
- Próximo passo da pesquisa (fase 1): abrir cada referência, tirar o que
  serve (padrão, não cópia), e montar 3 moodboards. Se você preferir
  escolher um modelo de plataforma, diga qual.

## 14. Riscos

1. **Conflito com PRs de funcionalidade** nas mesmas telas — por isso as
   ondas esperam o PR M daquele painel.
2. **Perder função** — matriz + teste automático + mapa de telas.
3. **Quebrar recorte/isolamento** — nada de rota nova; `npm run isolation`
   em todo PR; Opus revisa.
4. **Bonito e não didático** — tarefas de teste com tempo e cliques na
   simulação, e orçamento de texto por tela.
5. **Escopo infinito** — desenho congelado na fase 4; mudança depois entra na
   fila da onda seguinte.
