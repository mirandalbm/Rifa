# Pendências técnicas

Lista viva do que falta no código e na verificação. Atualizada ao fim de cada
ciclo de implementação (o ciclo que fecha um item marca aqui no mesmo PR).
O que depende de decisão de produto ou de ação fora do código está em
`docs/CHECKLIST-AJUSTES.md` e `docs/PENDENCIAS.md`, não aqui.

Última atualização: 2026-10-17 (ciclo 1).

## Abertas

| # | Item | Estado | O que falta |
|---|---|---|---|
| T1 | Leva do registro de versões do celular | em andamento (ciclo 1) | `npm run telas` nos dois temas; conferir as telas alteradas em 390/820/1440; marcar linhas 189–198 como `leva N`; registrar as mudanças de acessibilidade (commits `87bf51b`, `f971328`, e a correção do Painel) como nova linha |
| T2 | Acessibilidade: modais, abas e formulários depois de enviar | não medido | abrir cada `Janela` e aba pelo navegador, rodar axe, corrigir o que aparecer |
| T3 | Acessibilidade: páginas com dados reais (rifa, pedido, carrinho/Pix, estado, perfis) | não medido pelo axe | rodar axe nas rotas com slug do banco de exemplo (o `telas` mede nome e `alt`, não contraste) |
| T4 | Acessibilidade: tema escuro com axe | não medido | rodar axe com `prefers-color-scheme: dark` e com `data-theme="dark"` |
| T5 | Acessibilidade: achados do scanner estático não confirmados | em aberto | `landmark-no-main`/`nav`/`skip-link` (149/149/154), `aria-live-missing` (127), `img-alt-empty-informative` (26): reproduzir ou descartar. `media-no-captions` (3): ver se os vídeos têm trilha de áudio |
| T6 | Acessibilidade: teclado de ponta a ponta e leitor de tela | não feito | roteiro manual: entrar, comprar, comentar, abrir janelas, Esc, foco de volta |
| T7 | Carrossel de banners: espaçamento dos pontos | mudou sem olho humano | conferir no celular e no computador que os pontos (agora com área de 24 px) não ficaram esparsos demais |
| T8 | Gráficos de gasto e receita com muitas barras | mudou sem olho humano | `/admin/marketing/publicidade` e `/admin/resultados`: barras com 24 px de largura mínima agora rolam no celular; conferir legibilidade |

## Concluídas

| # | Item | Quando | Onde |
|---|---|---|---|
| — | Contraste do texto apagado no tema claro (`--muted`) | 2026-10-16 | `client/src/index.css` (`87bf51b`) |
| — | Alvos de toque, nomes de botões, barras sem nome, rolagem pelo teclado, ordem de títulos, coluna sem nome | 2026-10-16 | `87bf51b` |
| — | Contraste do cartão do próximo sorteio no Painel | 2026-10-16 | `client/src/pages/admin.tsx` (`f971328`) |
| — | Barra de acessos do Painel virou barra de áreas do menu | 2026-10-15 | `client/src/components/BarraDeAcessos.tsx` (`9de490c`) |
| — | Pendências de CI da PR #266 (job de Postgres com erro do Docker Hub) | 2026-10-15 | reexecução do run `38676581902`, verde |
