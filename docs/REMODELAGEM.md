# Remodelagem do web e dos painéis — o que não pode se perder

Depois que a etapa do aplicativo (topo, console e os seis botões) estiver
concluída, o layout do computador e os painéis (organizador, plataforma,
afiliado e cambista) serão remodelados. Este documento é a rede de proteção:
o ponto de partida guardado, o inventário de tudo o que existe em cada tela e
a lista de conferência para não perder funcionalidade no caminho.

## 1. O ponto de partida

- **Marco no git:** o commit `ef66bef` do `main` (o último antes do
  console) é o "antes". Qualquer tela, regra ou texto pode ser recuperado de
  lá (`git show ef66bef:<arquivo>`). Se quiser um nome fixo, crie a tag
  `marco-antes-da-remodelagem` nesse commit pelo GitHub.
- **Capturas de referência:** `npm run telas` gera as 60+ telas em três
  larguras em `capturas/` (fora do git). Rode **antes** de começar e guarde
  a pasta: é o "antes" para comparar tela a tela.
- **As regras não moram nas telas.** Preço, recorte, reembolso, limites e
  permissões estão em `shared/` e no servidor, cobertos pelos testes e pelas
  provas contra a API (`npm run isolation` e as outras 24). A remodelagem mexe
  em arranjo e navegação; se uma mudança de tela exigir mexer numa regra, é
  outra tarefa.

## 2. Regras que a remodelagem precisa manter

- **Um código só, três larguras** (`docs/VERSOES.md`): nada de segundo
  componente para o computador; a grade reorganiza por `lg:`/`xl:`.
- **O mesmo painel para organizador e plataforma** — o que muda é o recorte
  (`orgOf`). Tela nova só para organizador é sinal de recorte no lugar errado.
- **Seções vêm da sessão** (`shared/access.ts`): o menu do painel é montado
  do que o servidor devolve; o cliente não tem lista fixa de telas.
- **Estado nunca só por cor**, números com `tnum`, campo com rótulo e 16 px
  no celular, alvo de toque de 24 px — o `npm run telas` reprova o contrário.
- **Tema claro e escuro por variável**, nunca hex no componente.

## 3. Inventário: painéis

Cada tela, com os cartões e componentes que ela tem hoje. Na remodelagem,
cada item precisa ter um lugar novo — ou uma decisão explícita de sair.

| Tela (rota) | Arquivo | O que tem |
|---|---|---|
| Painel (`/admin`) | `pages/admin.tsx` | padrão Materialize: estatísticas (receita, cotas, comissão, próximo sorteio), gráfico, o que falta, últimas vendas, top afiliados |
| Campanhas (`/admin/campanhas`) | `pages/admin.tsx` | Nova campanha; por rifa: mídia (`MediaManager`), dados legais (`DadosLegaisCard`), legenda (`LegendaCard`), transmissão (`TransmissaoCard`), editar e adiar (`EditarRifaCard`, `AdiarSorteioCard`), cotas premiadas, demonstração, tirar do ar, excluir, links curtos |
| Pedidos (`/admin/pedidos`) | `pages/admin.tsx` | lista com recorte e titularidade do cliente |
| Resultados (`/admin/resultados`) | `pages/adminResultados.tsx` | Receita por dia, Por canal, Rifas que mais vendem |
| Stories (`/admin/stories`) | `pages/adminStories.tsx` | Novo story, No ar agora |
| Atendimento (`/admin/atendimento`) | `pages/adminAtendimento.tsx` | Chamados, disputas, solicitações de rifa, denúncias, verificações |
| Patrocínio (`/admin/patrocinio`) | `pages/adminPatrocinio.tsx` | Funil, Gasto × receita, De onde vieram, Seus anúncios, Extrato, Encerrados, Novo anúncio, Saldo, Fila das vitrines, Configuração, Saldo das organizações, reembolsos |
| Marketing (`/admin/marketing`) | `pages/adminMarketing.tsx` | pixels e chaves (`ConfigCard`), Compras enviadas pelo servidor, Vendas por campanha (UTM) |
| Afiliados (`/admin/afiliados`) | `pages/admin.tsx` | Divulgação, Pedidos de adesão, Novo afiliado, Termo de adesão, Cupons, Comissão por afiliado |
| Cambistas (`/admin/cambistas`) | `pages/adminCambistas.tsx` | A receber, Novo cambista, Acertos fechados, Querem ser colaboradores |
| Usuários (`/admin/usuarios`) | `pages/adminUsuarios.tsx` | Pessoas com acesso, Redefinir senha |
| Financeiro (`/admin/financeiro`) | `pages/admin.tsx` | Saques solicitados, Saques pagos (com recibo), guarda da comissão |
| Sorteios (`/admin/sorteios`) | `pages/admin.tsx` | Executar sorteio, Foto do ganhador |
| Exportações (`/admin/exportacoes`) | `pages/adminExportacoes.tsx` | Recorte, Antes de baixar |
| Cobrança (`/admin/cobranca`) | `pages/adminCobranca.tsx` | Carteira, Lançamentos |
| Configurações (`/admin/configuracoes`) | `pages/admin.tsx` | Segundo fator, Meios de pagamento, Administradora da rifa, Endereço, Perfil público (capa, cor, links), telefone do organizador, verificação, WhatsApp, reembolso, pagamentos da plataforma, cores do selo, Trilha de auditoria |
| Organizações (`/admin/organizacoes`, plataforma) | `pages/adminOrganizacoes.tsx` | Nova organização, lista com arquivar, Perfil de demonstração, preencher com exemplo |
| Antifraude (`/admin/antifraude`, plataforma) | `pages/adminAntifraude.tsx` | Limites, Bloqueios manuais, O que foi barrado, Últimas recusas |
| Aparência (`/admin/aparencia`, plataforma) | `pages/adminAparencia.tsx` | Identidade, Tela inicial (blocos), banners, Topo do app (aviso do trevo, publicação do apostador), Textos do rodapé, Pré-visualização, Versões |
| Cadastros fiscais (`/admin/fiscal`, plataforma) | `pages/adminFiscal.tsx` | Em análise; Aprovados, recusados e incompletos |
| Bônus (`/admin/bonus`, plataforma) | `pages/adminBonus.tsx` | Programa, Presente, Até agora, Metas, Nova meta |
| Senha (`/conta/senha`) | `App.tsx` (rota) | troca da própria senha |
| Afiliado (`/afiliado/*`) | `pages/afiliado.tsx`, `afiliadoDados.tsx` | Visão geral (vendas por dia), Meus links (kit), Organizações (vínculo, termo, aceite), Comissões, Saques (saldo, chave Pix com senha, sacar, histórico), Meus dados (dados, documentos, foto, verificação) |
| Cambista (`/cambista/*`) | `pages/cambista.tsx` | Nova venda (montar, maquininha, concluída), Minhas vendas, Meu acerto |

A loja (vitrine, rifa, perfil, carrinho, conta) está no mapa de
`docs/VERSOES.md`, com o que cada tela faz em cada largura.

## 4. Lista de conferência da remodelagem

- [ ] Capturas do "antes" guardadas (`npm run telas`).
- [ ] Cada linha do inventário acima tem destino na tela nova.
- [ ] O mapa de `docs/VERSOES.md` atualizado junto (o teste confere o mapa
      contra o `App.tsx`).
- [ ] `npm run telas` sem reprovação nas três larguras.
- [ ] `npm run isolation` e as provas da API passando (a remodelagem não deve
      mudar nenhuma — se mudar, algo além do layout foi mexido).
- [ ] `CLAUDE.md` (seção "Layout no computador") reescrita para o arranjo novo.
