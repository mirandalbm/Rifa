# Auditoria do acesso da plataforma (administrador geral)

Item 14 do `docs/CHECKLIST-AJUSTES.md`, para o acesso **plataforma** (papel
`admin`, organização nula, painel inteiro, com o grupo Marketing). Feita em
18/10/2026 sobre a `main` no commit `13923e2`, com banco próprio e servidor
próprio, lendo o código e provando contra a API de verdade.

O que corre por conta de outro acesso (organizador, afiliado, cambista,
apostador, público) só aparece aqui quando a plataforma também o alcança.

## 1. O que foi conferido

### Rotas

- **267 rotas** de `adminRouter` (`server/routes/admin.ts`) mais as 7 da
  verificação do perfil (`montarRotasDaVerificacao`). Lista tirada do código,
  não do documento.
- **Como a porta foi provada.** Entrei como organizador e chamei cada rota com
  id válido: as que são só da plataforma devem dar 403 antes de qualquer
  gravação. Todas dão. As que ficaram sem prova no `npm run isolation` eram
  **cinco** (`PUT /antifraude/limites`, `POST` e `DELETE` de
  `/antifraude/bloqueios`, `POST /organizacoes`, `POST /organizacoes/:id/acessos`);
  entraram lá. `PUT /media/raw` não é da plataforma: quem manda é a assinatura
  da URL do envio.
- **Como o 500 foi procurado.** Entrei como a plataforma e chamei todas as
  rotas com: id fora do formato; corpo vazio, lista, e dois corpos com todos os
  campos do sistema com o tipo trocado; e (com linhas de verdade, semeadas) as
  decisões com corpo torto. Antes: 73 rotas com 500 por id fora do formato,
  mais 4 por tipo errado no corpo. Depois: zero nas três rodadas.
- **Dado pessoal e segredo em resposta.** Todas as listas e os detalhes das
  filas (chamados, Pix a devolver, saldo retido, denúncias, solicitações,
  verificações, fiscal, Caixa, organizações, usuários, afiliados, pedidos,
  antifraude, cobrança, auditoria, configuração da plataforma, IA, marketing,
  tráfego, WhatsApp): nenhum hash de senha, segredo do autenticador, chave de
  API, JWK do Stream, credencial de marketing ou CPF volta em resposta; telefone
  de comprador só mascarado no detalhe do chamado. A semente do sorteio só sai
  depois do sorteio, também para a plataforma (lista de rifas, `/draw` e
  exportação).
- **Atos com segundo fator.** `conferirSegundoFatorAgora()` está em lançar o
  resultado e em registrar nova extração do globo, e agora também em arquivar
  organização.

### Telas

`npm run telas -- --papel plataforma`: **38 rotas** (`scripts/telas.ts`, antes
eram 16) — a Caixa de entrada, os seis grupos do menu do master e as abas de
Atendimento, Antifraude, Aparência e Configurações — em **390, 820 e 1440**,
tema claro e escuro, com o banco semeado (organização de nome comprido,
pedidos, chamados, Pix a devolver, denúncia, saldo retido, sorteios oficiais,
cobrança em aberto, verificação). Mede estouro lateral, controle sem nome,
campo com menos de 16 px no celular, alvo menor que 24 px, erro na página e
resposta 5xx.

## 2. Achados e correções

| # | Achado | Gravidade | Situação |
|---|---|---|---|
| 1 | Id fora do formato de UUID na URL (73 rotas) ou no corpo (comprar anúncio) respondia 500; corpo com número, lista ou objeto no lugar do texto em `PATCH /organizacoes/:id` e `PUT /organizer` também | Baixa | **Corrigido** `3f46757` |
| 2 | Arquivar organização tinha cópia própria da conferência de senha e código, sem o limite de tentativas de `conferirSegundoFatorAgora()` | Média | **Corrigido** `afd3c91` |
| 3 | O resultado do sorteio oficial gravava a auditoria depois, fora da transação | Média | **Corrigido** `283a74e` |
| 4 | Aprovar telefone, destravar rifa e decidir denúncia gravavam a auditoria **antes**, e a recusa deixava "aprovado", "destravada" ou "banir" que nunca aconteceram; na denúncia a ação vinha solta do corpo | Baixa | **Corrigido** `98bec4e` |
| 5 | Configuração: campo que não vem voltava ao padrão em `PUT /antifraude/limites`, `/payment-methods`, `/banner-pago/config`, `/ia/config` (preços zerados, assistente desligado) e `/patrocinio/config`; `setPlataforma()` lia, juntava e gravava sem trava e `PUT /bonus/config` espalhava a configuração lida antes da trava (dois cartões salvos juntos perdiam um); a prova de acessos lia a chave errada (`limites` em vez de `limits`) e regravava os padrões a cada rodada | Média | **Corrigido** `d17f6b8` |
| 6 | O mesmo em `PUT /plataforma` (mandar só a taxa desligava "Aceitar pedidos de reembolso" e voltava o provedor ao automático) e em `PUT /cobranca/tabela` (sem o valor por cota ele zerava; sem as faixas do Pix voltavam as de fábrica; redução vale na hora) | Média, **dinheiro** | **Corrigido** `4c108b9` — **aguarda o parecer do `revisor-de-invariantes`** |
| 7 | Rascunho, dados da empresa e logo da plataforma não deixavam rastro | Baixa | **Corrigido** `ece06eb` |
| 8 | Teste do WhatsApp: modelo `constructor` dava 500 e não havia teto de envios | Baixa | **Corrigido** `102fc45` |
| 9 | Resultados: o filtro de organização (largura automática) estourava a página com nome comprido | Baixa | **Corrigido** `4fb1ad6` |
| 10 | Menu lateral dos três painéis: a logo escrita era cortada pelo botão de recolher | Baixa | **Corrigido** `0b97cc9` |
| 11 | O `npm run telas` do master cobria 16 rotas; e uma aba do Chromium que cai (máquina carregada) derrubava o resto da rodada | — | **Corrigido** `8caddda` e o commit de robustez do `telas` (aba nova e a mesma rota de novo; `--rotas` repete só a ponta) |
| 12 | Cobrança: os números do aviso das faixas do Pix fora da `tnum` | Aviso | **Corrigido** junto do de robustez |

As provas novas: `isolation` (403 das cinco rotas, id torto em 8 rotas e no
corpo, tipo errado em 3), `sorteios` (arquivar com o mesmo segundo fator e o
limite que conta; uma linha de auditoria do resultado), `seguranca` (a recusa
não grava auditoria), `acessos` (campo único não volta o resto ao padrão; três
cartões salvos ao mesmo tempo oito vezes — sem a trava o terceiro se perde; teste do WhatsApp),
`cobranca` (só o percentual não zera o valor por cota), `aparencia` (rastro do
rascunho, da empresa e da logo).

## 3. Texto (só apontado)

- **Pagamentos → "Aceitar pedidos de reembolso"** diz "Desligado por padrão:
  numa rifa, a compra é participação". O `CLAUDE.md` (resposta 3.7 do
  advogado) diz que o interruptor é operacional, não jurídico: desligado, o
  art. 49 do CDC continua valendo e plataforma e promotora respondem juntas.
  O texto induz a plataforma a achar o contrário.
- **Pagamentos → saque do afiliado** diz "(sem RPA nem retenção)", mas no
  Lucro Presumido ou Real o saque retém **1,5% de IRRF** (`irrfDoSaque()`).
- **Cadastros fiscais → "A lista não traz dado nenhum"**: a lista traz nome e
  e-mail da conta do afiliado (não os dados fiscais).
- **Caixa → "O que entra aqui"** não cita dois tipos que a Caixa lista:
  "devolução a conferir no provedor" e "contestação parcial do Pix".
- **Atendimento → Verificações**: a regra diz que a fila não traz dado pessoal,
  mas ela mostra o nome real do apostador ou do afiliado (o CPF e os documentos
  só no detalhe, com auditoria antes).

## 4. O que fica aberto

1. **Parecer do revisor.** Os commits de dinheiro (`4c108b9`; também os de
   configuração de preço do patrocínio e do banner dentro de `d17f6b8`) não
   passaram pelo `revisor-de-invariantes`: esta sessão não tem como chamar
   outro agente. O ponto a conferir é que o aumento de taxa segue passando por
   `problemaNaVigencia()` (a tabela nova é comparada com a vigente, como antes).
2. **Auditoria antes da decisão** continua em `solicitacoes/:id/decidir`,
   `verificacoes/:id/decidir` e `campaigns/:id/tirar-do-ar`/`demonstracao`
   (esta última depois, fora da transação). É a escolha "se a auditoria falhar,
   nada acontece" contra "só registra o que aconteceu": decisão de produto.
3. **Atos sensíveis sem segundo fator na hora**, fora do que o `CLAUDE.md`
   manda (arquivar, resultado, nova extração): redefinir a senha de outra
   pessoa e desligar conta (`/usuarios/:id`), banir organização, mudar o
   provedor do Pix, a tabela de cobrança e o contrato da promotora, dar baixa
   em saque e em cobrança. Hoje basta a sessão aberta: nem a senha de quem
   redefine é pedida (`POST /usuarios/:id/senha`, que alcança também outro
   administrador geral). Decisão de produto.
4. **`PUT /cobranca/tabela` ainda confere o aviso de 30 dias lendo a
   configuração fora da trava** (a gravação em si é serializada). Duas
   mudanças da tabela no mesmo instante podem se cruzar.
5. **A logo da plataforma troca no mesmo lugar** (`salvarLogo`): a logo
   pública muda sem publicar o template. Já está dito no código; agora deixa
   rastro (`template.logo`), mas continua sem passar pelo publicar.
6. **Trilha de auditoria** (Configurações → Trilha de auditoria) mostra só as
   200 últimas ações, sem filtro nem paginação.
7. **`POST /organizacoes/:id/acessos`** não confere o formato do e-mail.
8. **Telas**: a leitura do `h1` (0) aparece de vez em quando quando a tela
   ainda carrega, e o Chromium cai ("Target crashed") de vez em quando com a
   máquina carregada por outras sessões; as duas coisas somem repetindo a rodada
   e não são defeito de tela.

## 5. Provas

Servidor desta cópia (porta 5130, banco `rifa_aud_plataforma`, apagado no fim):

- `npm run check`; `vitest` completo (136 arquivos, 1405 testes); `npm run build`.
- `npm run isolation`, `sorteios`, `seguranca`, `acessos`, `cobranca`,
  `aparencia`: sem nenhuma falha.
- `npm run telas -- --papel plataforma`, 38 rotas: **claro** em 390, 820 e
  1440 e **escuro** em 820: 0 reprovadas. **Escuro** em 390 e 1440: a rodada
  completa caiu perto do fim (o navegador foi fechado de fora, nas duas, no
  mesmo ponto: Configurações), sem nenhuma reprova até ali; as rotas de
  Configurações foram repetidas com `--rotas configuracoes`: 0 reprovadas.
  Sobraram avisos de "0 h1" (tela ainda carregando) e, no celular, os links do
  título das rifas em Resultados com 20 px de altura (já era assim).
