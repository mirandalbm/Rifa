# Checklist de ajustes — 15/10/2026

Lista dos ajustes pedidos depois da entrega do topo, do ícone do app e do
seletor de estado, por urgência. Cada item diz o estado, o que falta e quem
decide. Quando um item fechar, marque aqui **e** em `docs/PENDENCIAS.md`
(seção 0) no mesmo PR.

Legenda: **[decisão]** depende de uma resposta de produto antes de codar;
**[código]** dá para fazer já; **[você]** depende de ação na conta ou no
aparelho.

## Urgente — visível ao apostador, pequeno

- [ ] **1. Ícone e nome do app instalado ainda antigos** — **[você]** + **[código]**
  - O ícone novo (trevo maior, maskable transparente) está no PR #266 (rascunho, CI verde). Falta marcar como pronto e mesclar — **aguarda autorização**.
  - O nome vem do template **publicado** em Aparência → Identidade. O nome foi trocado no rascunho; falta **publicar**.
  - Depois do deploy, **desinstalar e reinstalar** o app no aparelho (o sistema guarda o ícone no momento da instalação).
  - Tela de carregamento (linha cinza em volta do trevo): conferir no aparelho depois do deploy; se persistir, opção 3 da conversa (tirar o maskable do manifesto).
- [x] **2. Largura da publicação da rifa fora do padrão da vitrine** — **[decisão]** (18/10/2026: fica a atual, 1408 px)
  - Hoje a página da rifa abre `larga ampla` (até 1408 px no computador). A vitrine usa `max-w-3xl` no celular e feed em `md:max-w-none`.
  - Decidir: a publicação da rifa deve ter **a mesma largura do cartão do feed** (`PublicShell` sem `larga`), ou só a mesma **proporção** do cartão?
- [x] **4. Cores dos ícones de compra não mudaram** — **[decisão]** (18/10/2026: o "+" vermelho nos dois temas; a sacola verde)
  - Hoje: o "+" do carrinho é vermelho no tema claro (`--mais`, pedido de 14/10), a sacola de comprar é verde (`text-green-deep`).
  - Decidir para qual cor ir (e se vale no claro e no escuro). Ação de comprar não pode ser vermelha se o vermelho é reservado a erro — ver a regra de paleta no `CLAUDE.md`.
- [x] **5. Ícone do topo à esquerda não centralizado verticalmente** — **[código]** (feito em 18/10/2026)
  - Feito: o link da marca no topo (`PublicShell`) passou a `flex items-center`; o trevo e a frase ficam no mesmo centro vertical dos botões (28 px) em 390 e 820, claro e escuro. Registro 201 de `docs/VERSOES.md`.
  - Ajuste de alinhamento no topo mobile (`AppShell.tsx`, bloco `<header … lg:hidden>`, a `Marca`). Precisa conferir nas três larguras com `npm run telas` antes do PR.
- [ ] **6. Seletor "Rifas perto de" vira "Locais"** — **[decisão]**
  - Trocar o texto, tirar o `<select>` e abrir um painel com **todos os estados**.
  - Bandeiras: o projeto não tem imagens de bandeiras de estado. Opções: (a) vocês enviam as imagens das bandeiras; (b) usamos a sigla do estado num selo como ícone enquanto isso.
- [ ] **3. Texto oficial abaixo do nome e da logo no "roadmap" de baixo** — **[decisão]**
  - Não sei qual rodapé/faixa é o "roadmap". Preciso do texto exato e do lugar (rodapé da plataforma, faixa do console, ou outro).

## Produto — rifas nacionais e estados

Tudo abaixo cria conceito novo: hoje **toda rifa é nacional** e a
localização só ordena (`shared/endereco.ts`). A rifa não tem UF próprio —
o estado é o da promotora (`organizations.uf`).

- [ ] **7. Cada estado mostra só as rifas daquele estado** — **[código, já existe]**
  - `GET /api/public/campaigns?estado=UF` filtra por `organizacao.uf` (`server/routes/public.ts`). A página `/estado/UF` já usa. Confirmar com o time se é isso que o item pede; se for outra coisa, detalhar.
- [ ] **8. Todos os estados e as rifas nacionais no seletor** — **[decisão]**
  - Depende do item 6 (painel com todos os estados). "Rifas nacionais" precisa de definição (ver 9–11).
- [ ] **9. Rifa nacional com valor mínimo** — **[decisão]**
  - Valor mínimo de quê: do prêmio, da cota, ou do total arrecadado? Qual valor (número)? Vale também para as rifas estaduais?
  - Implicação: campo novo em `campaigns` (ex.: `abrangencia` = `nacional` | `estadual`, e `valorMinimoNacional`), validação em `publishBlockers` e nos dados legais, texto no regulamento.
- [ ] **10. Rifa nacional só publica com aprovação do admin** — **[decisão]**
  - Hoje a publicação é do próprio organizador (com as travas de autorização e contrato). Proposta: rifa nacional entra numa fila (como o banner pago) e só vai ao ar depois de aprovada na Caixa de entrada. Confirmar.
  - Implicação: status novo `em_analise_nacional` (ou tabela de pedido), tipo novo em `shared/caixa.ts`, `UPDATE` condicional na decisão, auditoria.
- [ ] **11. Rifas nacionais sempre no topo** — **[decisão]** de ordem
  - Pelas regras atuais, a vitrine ordena por região (`ordenarPorProximidade`) e nunca esconde. Colocar nacionais no topo muda a regra "localização ordena, nunca esconde" — confirmar que a ordem nova vale para todas as telas (vitrine, página do estado, busca, feed de divulgação).

## Marketing — banners por estado

- [ ] **12. Carrossel de 5 banners no topo, em todos os estados, além do nacional** — **[decisão]**
  - Hoje existem: banners da plataforma (até 5, `BANNERS_MAX`, sem segmentação) e banners pagos (`banner_pedidos`, por rifa, com dias de topo). Falta segmentação por estado.
  - Decidir: os 5 banners são **por estado** (cada estado tem o seu conjunto) ou **um conjunto de 5 que muda conforme o estado escolhido**? E o nacional continua como carrossel próprio?
- [ ] **13. Mecanismo no admin para todos os banners no portal de marketing** — **[código, depende de 12]**
  - Tela em Marketing → Publicidade (aba "Banner na vitrine" já existe). Falta: cadastro por estado (ou nacional), ordem, ligar/desligar, pré-visualização. Os banners pagos continuam na sua fila.

## Auditoria — item 14

- [ ] **14. Auditoria de cada acesso** — **[código]** depois dos itens urgentes
  - Para cada papel, conferir: telas (`npm run telas`, 3 larguras), recorte de organização (`npm run isolation`), rotas novas no mapa (`docs/VERSOES.md`), textos e pendências.

| Acesso | Telas a auditar | Prova que já existe |
|---|---|---|
| Público (visitante) | vitrine, rifa, estado, perfil, buscar, reels, sorteio, ajuda | `npm run publico`, `npm run telas` |
| Apostador (conta) | Minhas compras, bilhetes, mensagens, carrinho, pedido, Pix, perfil | `npm run conta`, `npm run bilhetes`, `npm run mensagens` |
| Organizador | painel: rifas, pedidos, afiliados, cobrança, marketing, aparência, atendimento | `npm run isolation`, `npm run solicitacoes`, `npm run cobranca` |
| Afiliado | painel: divulgar, comissões, saque, cadastro fiscal, kit | `npm run afiliados`, `npm run fiscal`, `npm run artes` |
| Cambista | venda física, acerto | `npm run cambista` |
| Plataforma (master) | caixa de entrada, atendimento, cobrança, sorteios oficiais, aparência, marketing | `npm run aparencia`, `npm run sorteios`, `tests/caixa.test.ts` — **auditado em 18/10/2026: `docs/AUDITORIA-ACESSO-PLATAFORMA.md`** |
| Marketing (tráfego, publicidade, banners) | tráfego pago, Marketing AI, publicidade em abas | `npm run trafego`, `npm run banner`, `npm run patrocinio` |

## Ordem sugerida

1. Decisões: itens 2, 3, 4, 6, 9, 10, 11, 12 (responder nesta conversa).
2. Autorizar o merge do PR #266 e publicar o template (item 1).
3. Código dos itens 5 e 6 (com as três larguras conferidas).
4. Decisão e código das rifas nacionais (9, 10, 11) e a fila de aprovação.
5. Banners por estado (12, 13).
6. Auditoria por acesso (14), um PR por acesso, com `npm run telas`.
