# Auditoria do acesso APOSTADOR — 18/10/2026

Item 14 do `docs/CHECKLIST-AJUSTES.md`, linha "Apostador (conta)". Escopo:
comprador com conta ou com sessão de código do WhatsApp, sem painel — telas
(conta, Minhas compras, bilhetes, pedido e Pix, carrinho, perfil e
`/u/<apelido>`, Configurações, avisos, mensagens e grupos, reels, comentários,
presente, bônus, verificação, reembolso/chamado/disputa, excluir conta) e as
rotas de `/api/public` que a sessão do apostador alcança.

Método: leitura do código das rotas e serviços; varredura automática de todas
as rotas de `server/routes/public.ts` com id e corpo fora do formato, com e sem
sessão, com mensagens, grupos, divulgação e Reels ligados; sondas com duas
contas e um comprador convidado; e `npm run telas` com a conta de apostador
(390, 820 e 1440, claro e escuro) com pedido pago, pedido com Pix aberto,
carrinho, chamado e as quatro abas de Minhas compras.

## Corrigido

| # | Gravidade | Achado | Commit |
|---|---|---|---|
| 1 | Média | Dez rotas mandavam id ou código do navegador cru ao Postgres e respondiam **500**: `GET /orders/:code` e `/carrinho/pedidos/:codigo` (texto e inteiro maior que o `int4`), `GET /stories/:id/imagem` e `/poster`, `GET /chamados/:id`, `/chamados/anexos/:id`, `POST /chamados/:id/mensagens` e `/disputa`, `POST /chamados` com `orderCode` inválido, `POST /bonus/resgatar` com rifa inválida, `PUT /conta/perfil` sem campo conhecido. Agora 404 (ou 200 sem mudar nada, no perfil) | `417967e` |
| 2 | **Alta** | **Trocar a senha e excluir a conta sem saber a senha**: `trocarSenha()` e `excluirConta()` tratavam "sessão confirmada" como prova de dono, mas a sessão de quem entrou **pela senha** numa conta de telefone confirmado também é confirmada. Cookie roubado, aparelho emprestado ou o "lembrar" de 30 dias trocavam a senha (trancando o dono, já que a troca derruba as outras sessões) ou excluíam a conta sem digitar nada. Agora só a senha atual ou o código do WhatsApp provado nesta sessão há no máximo 30 minutos (`porCodigoEm`). Excluir com senha errada passou a contar no limite do login | `a223c74` |
| 3 | **Alta** | **Quem se cadastra com o telefone de outra pessoa herdava o bônus e os avisos dela.** O comprador convidado (sem CPF gravado) vira conta de quem digitar o número; as compras já ficavam escondidas, mas `GET /bonus` mostrava o saldo, o progresso e o extrato e `POST /bonus/resgatar` deixava **gastar o saldo da vítima em cotas grátis** (provado: saldo 3, resgate 201), e `GET /notificacoes` trazia "sorteio chegando" e "saiu o resultado" das rifas dela. Agora, com o telefone não provado: bônus zerado e resgate 403; avisos de compra de rifa em que a linha tem pedido pago que a conta não enxerga ficam de fora. Quem comprou dentro da conta e quem só segue a organização veem tudo | `1f70d17` |
| 4 | **Alta** | **Sessão expulsa voltava** (a suspeita de 12/10 em `docs/SEGURANCA.md`, agora provada): uma requisição em andamento da sessão expulsa a regravava depois do `DELETE` (`INSERT … ON CONFLICT` do `connect-pg-simple`); 24 requisições em laço contra `/conta/google/entrar` bastaram. Coluna nova `buyers.sessoes_validas_desde` (**`db:push` antes do código**), `entrouEm` na sessão e middleware em `setupAuth` | `b77bbf0` |
| 5 | Baixa | Limites ausentes: `GET /cep/:cep` (proxy aberto para o ViaCEP), `PUT /conta/cep` e a troca de foto do perfil (abre imagem de até 5 MB). Agora 120 em 10 min por endereço (o CEP aberto), 20 por hora por conta (trocar o CEP) e 20 por hora por conta (a foto) | `24b3fc7` |
| 6 | Baixa | Tela: "Ver mais rifas" no fim do feed tinha 20 px de altura no celular (alvo < 24 px, WCAG 2.5.8) | `908188e` |
| 7 | Baixa (texto) | Privacidade dizia que o `rifa.sid` vale 7 dias; com "Lembrar de mim" (padrão da tela de entrar) são 30. `SESSAO_LEMBRAR_DIAS` é a fonte única; `VIGENCIA_DOS_TERMOS` sobe para 2026-10-18 | `9711799` |
| 8 | Baixa (texto) | Privacidade dizia que a plataforma "não guarda dados bancários de quem compra"; o pedido de reembolso guarda a chave Pix informada, o motivo, a conversa e o print, e a exclusão da conta não os apaga. O texto diz a exceção | `5d15d0f` |
| 9 | Ferramenta | **O "login de apostador" que falhava**: `npm run telas` entrava de novo em cada largura (3 por papel) e `guardLogin` conta também a tentativa que acerta (8 em 15 min); na terceira rodada seguida o papel era barrado, escrevia "não entrou — pulando" e saía com **0 reprovações** — o acesso passava sem ser auditado. Agora um login por papel (`storageState`) e papel que não entra reprova a rodada. Também passou a abrir pedido, bilhete, Pix, `/carrinho`, carrinho Pix e as abas Reembolsos, Bônus e Salvos com dado de verdade | `f9894a6`, `e2dd949` |

Cada defeito tem prova contra a API de verdade em `scripts/conta-test.ts`
(seção "auditoria do acesso apostador"), `scripts/bonus-test.ts` (cenário
"conta cadastrada com o telefone de outra pessoa") e `tests/contaComprador.test.ts`,
`tests/legal.test.ts`. A matriz (`docs/REFORMULACAO-MATRIZ.md`) foi regenerada
(`57cc3df`). Mudança de tela registrada em `docs/VERSOES.md` (linha 203).

## Conferido, sem achado

- **Dado de outro comprador é 404**: pedido de outro no `POST /chamados`
  (404), chamado, mensagem, disputa e anexo de outro (404), `GET /my-quotas`
  sem o pedido de outro, conversa, foto, grupo e peça de outro (provas
  `chamados`, `mensagens`, `grupos`, `divulgacao`, `isolation`, todas verdes).
- `pedidoVisivel()` / `podePedirReembolso()`: sem furo nas rotas de compra,
  bilhete privado e chamado. O furo estava em dois dados que **não** passavam
  por elas (achado 3).
- Sessão regenerada ao entrar; troca de senha e primeira prova do telefone
  derrubam as outras sessões (agora também pela marca); excluir derruba tudo.
- Mensagens, grupos, comentários, divulgação, Reels e Buscar: nenhum 500 com id
  ou corpo fora do formato, com o recurso ligado.
- Presente e código de indicação: 31⁸ combinações, sem enumeração útil.
- Telas: 0 reprovações nas larguras 390/820/1440, claro e escuro, anônimo e
  apostador (carrinho, pedido, bilhete e Pix incluídos); sem estouro lateral,
  controle sem nome, campo < 16 px no celular, erro de JavaScript ou 5xx.
  Avisos que sobram são "0 h1" intermitentes (a página ainda desenhava) e o
  WebSocket do Vite (só em desenvolvimento).

## Aberto

| Item | Por quê |
|---|---|
| O painel (`users`: organizador, afiliado, cambista, master) tem o mesmo desenho de sessão e a mesma corrida de regravação depois do `DELETE` (`encerrarSessoesDoUsuario`). Só o apostador foi coberto | Outro acesso na auditoria; a correção é a mesma marca em `users` |
| Cadastro com o telefone de outra pessoa ainda **renomeia** o titular do comprador convidado (o nome aparece no bilhete e na consulta pública do pedido, que já é público por código) | Decisão de produto: exigir o código do WhatsApp para adotar um telefone que já tem compra mudaria o cadastro de quem volta. Quem compra sem entrar já renomeia a linha digitando outro nome |
| Pedido de reembolso concluído: a chave Pix, o motivo, a conversa e o print ficam para sempre e não saem na exclusão da conta | Prazo de guarda e o que sai na exclusão são do advogado (o texto agora diz a verdade) |
| `GET /orders/:code`, `/carrinho/pedidos/:codigo` e o bilhete mostram o nome de quem comprou e o Pix copia-e-cola a quem tem o código (8 dígitos, sorteado, varredura barrada) | Risco já aceito em `docs/SEGURANCA.md` |
| `POST /carrinho` lê até 20 rifas por pedido sem limite por IP | Rota pública (acesso Público); medir antes de limitar, a tela chama a cada mudança |
| Conta só do Google cria senha com o telefone confirmado da sessão (não há senha atual a conferir) | Pedir o código ali exigiria uma tela nova; hoje depende de a sessão do Google ser do dono |
| Sessões de antes da marca (`entrouEm` ausente) só caem quando a conta ganha a marca | Inevitável sem forçar um logout geral; some em 30 dias |
| As mudanças de acesso em rota de cota (`POST /bonus/resgatar` negando sem telefone provado) **não passaram pelo `revisor-de-invariantes`** | Não há como acioná-lo daqui; é só uma negação antes do caminho de reserva de sempre, mas peça o parecer antes de mesclar |

## Como conferir

```
npm run check && npm test
npm run conta bonus push chamados bilhetes senha acessos mensagens grupos google verificacao divulgacao carrinho isolation
npm run telas -- --papel anonimo,apostador          # claro
npm run telas -- --papel anonimo,apostador --tema escuro
```
