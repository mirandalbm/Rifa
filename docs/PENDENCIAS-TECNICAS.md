# Pendências técnicas

Lista viva do que falta no código e na verificação. Atualizada ao fim de cada
ciclo de implementação (o ciclo que fecha um item marca aqui no mesmo PR).
O que depende de decisão de produto ou de ação fora do código está em
`docs/CHECKLIST-AJUSTES.md` e `docs/PENDENCIAS.md`, não aqui.

Última atualização: 2026-10-17 (leva 20 parcial, com 189 a 196 e 198 a 200 fechadas; resta a 197).

## Abertas

| # | Item | Estado | O que falta |
|---|---|---|---|
| T1 | Leva do registro de versões do celular | em andamento (leva 20 parcial) | Os dois temas do `npm run telas` (243 capturas cada, 0 reprovadas, 0 avisos) e a rodada do papel apostador em 390 após a correção da aba "Republicações" estão feitos. Fechadas na leva 20: 189, 190, 191, 192, 193, 194, 195, 196, 198, 199 e 200, conferidas com contas de teste no banco local e capturas em 390, 820 e 1440. Fica aguardando só a 197 (ícone do app instalado): confere-se no aparelho, não aqui |
| T2 | Acessibilidade: modais, abas e formulários depois de enviar | não medido | abrir cada `Janela` e aba pelo navegador, rodar axe, corrigir o que aparecer |
| T3 | Acessibilidade: páginas com dados reais (rifa, pedido, carrinho/Pix, estado, perfis) | não medido pelo axe | rodar axe nas rotas com slug do banco de exemplo (o `telas` mede nome e `alt`, não contraste) |
| T4 | Acessibilidade: tema escuro com axe | não medido | rodar axe com `prefers-color-scheme: dark` e com `data-theme="dark"` |
| T5 | Acessibilidade: achados do scanner estático não confirmados | em aberto | `landmark-no-main`/`nav`/`skip-link` (149/149/154), `aria-live-missing` (127), `img-alt-empty-informative` (26): reproduzir ou descartar. `media-no-captions` (3): ver se os vídeos têm trilha de áudio |
| T6 | Acessibilidade: teclado de ponta a ponta e leitor de tela | não feito | roteiro manual: entrar, comprar, comentar, abrir janelas, Esc, foco de volta |
| T7 | Carrossel de banners: espaçamento dos pontos | mudou sem olho humano | conferir no celular e no computador que os pontos (agora com área de 24 px) não ficaram esparsos demais |
| T8 | Gráficos de gasto e receita com muitas barras | mudou sem olho humano | `/admin/marketing/publicidade` e `/admin/resultados`: barras com 24 px de largura mínima agora rolam no celular. Layout de publicidade e resultados conferido em 820 e 1440 (claro e escuro) na leva 20, mas as capturas saíram sem venda, então as barras não apareceram cheias. Falta a leitura com barras preenchidas (banco com vendas pagas em 820 e 1440) |
| T9 | Alvos de toque menores que 24 px (`npm run telas`, avisos, tema claro) | corrigido, 4 de 5 medidos | Os cinco avisos eram: "Denunciar" na rifa (69×16 e 63×17, 390 px, anônimo e apostador), "Ver em tabela" em publicidade (84×16, organizador e plataforma) e "Ver meu perfil" (99×20, apostador). Correção: `min-h-6 items-center` nos quatro. Medido no navegador em 390 px: os quatro agora têm 24 px de altura (69×24, 63×24, 84×24). "Ver meu perfil" segue sem medida: precisa de login de apostador. Confirmado pelo `npm run telas` da leva 20 (243 capturas em cada tema, 0 avisos) |

## Concluídas

| # | Item | Quando | Onde |
|---|---|---|---|
| — | Contraste do texto apagado no tema claro (`--muted`) | 2026-10-16 | `client/src/index.css` (`87bf51b`) |
| — | Alvos de toque, nomes de botões, barras sem nome, rolagem pelo teclado, ordem de títulos, coluna sem nome | 2026-10-16 | `87bf51b` |
| — | Contraste do cartão do próximo sorteio no Painel | 2026-10-16 | `client/src/pages/admin.tsx` (`f971328`) |
| — | Alvos de toque de 16 e 20 px nos links e botões sublinhados (T9) | 2026-10-17 | `adminPatrocinio.tsx`, `adminResultados.tsx`, `PerfilDoApostador.tsx`, `Seguranca.tsx` (`BotaoDenunciar`) |
| — | Barra de acessos do Painel virou barra de áreas do menu | 2026-10-15 | `client/src/components/BarraDeAcessos.tsx` (`9de490c`) |
| — | Pendências de CI da PR #266 (job de Postgres com erro do Docker Hub) | 2026-10-15 | reexecução do run `38676581902`, verde |
