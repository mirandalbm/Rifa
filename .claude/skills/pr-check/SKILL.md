---
name: pr-check
description: O rito de todo PR da Rifa — provas, docs obrigatórios (CLAUDE.md, VERSOES, PENDENCIAS), capturas, commit, PR em rascunho, acompanhamento e a mesclagem só com o "pode mesclar". Use quando o código estiver pronto para virar PR.
argument-hint: "[número do PR, para só conferir um PR já aberto]"
disable-model-invocation: true
---

# PR da Rifa

O passo a passo que vale para todo PR deste repositório. Ele existe porque
cada passo já foi esquecido uma vez.

## 1. Antes de commitar

1. **Branch certa**: a designada para a sessão. Se o PR anterior dela já foi
   mesclado, a branch recomeça da `main` (`git fetch origin main && git
   checkout -B <branch> origin/main`) — PR mesclado não recebe commit novo.
2. **Provas**: rode `/provar` (tipo, vitest e as provas da área).
3. **Docs no mesmo PR** — o teste ou o revisor reprova sem eles:
   - `CLAUDE.md`: regra nova ou mudada, e a linha de "Onde mexer" se
     apareceu arquivo novo. Quebrar invariante é bug grave: confira a lista.
   - `docs/VERSOES.md`: **toda mudança no celular** vira linha, situação
     `aguardando leva`. A cada 10 aguardando, o PR seguinte é a **leva**
     (confere as três larguras e arruma tablet e computador).
     `tests/versoes.test.ts` falha na 11ª. Rota nova entra no mapa de telas.
     Mudança só de tablet/computador (classes `md:`/`lg:`) não vira linha.
   - `docs/PENDENCIAS.md`: atualize no mesmo PR que fechar um item.
4. **Trabalho feito por agente** (`implementador-da-rifa` numa cópia
   separada): traga os commits dele para a branch da sessão com `git
   cherry-pick`, reinicie o servidor e rode as provas **você mesmo** — o
   relatório do agente não é prova. Leia a seção "Suposições não
   conferidas" do relatório e leve as que importam ao usuário.
5. **Revisão**: se mexeu em dinheiro, cota, estorno, rota do painel,
   antifraude, dado de comprador, número de cota na tela ou apuração do
   sorteio (invariante 16) ou o assistente de IA (a chave, o que sai
   para o Chatbase, o uso contado, as ações que ele executa), chame o agente `revisor-de-invariantes`
   antes de abrir o PR. Corrigiu o que ele achou? Peça uma segunda leitura
   só das correções: correção também abre problema novo.
6. **Capturas** de qualquer mudança visível (claro e escuro; celular, tablet
   e computador conforme o caso) — mande ao usuário com `SendUserFile`. Em
   rodapé e telas fixas, esconda a faixa "Baixe o app" na captura.

## 2. Commit, push e PR

- Mensagem em português, assunto curto e corpo dizendo **o porquê**. Termine
  com as linhas de atribuição que o ambiente indicar para commits.
- `git push -u origin <branch>` (em falha de rede, repita até 4 vezes: 2, 4,
  8, 16 s).
- Abra o PR **como rascunho** (`mcp__github__create_pull_request`, `draft:
  true`), seguindo o modelo de PR do repositório se houver. Corpo: o que
  muda, como funciona, o que foi conferido. Termine com as linhas de
  atribuição de PR que o ambiente indicar.
- `subscribe_pr_activity` no PR e um `send_later` de uns 50 minutos para
  conferir CI e revisões.
- **Nunca ponha identificador de modelo** em commit, PR ou código.

## 3. Depois de abrir

- CI vermelho ou conflito é trabalho agora, não espera: conserte e empurre.
  Nunca pule, desligue ou isole teste para ficar verde; nunca commit vazio
  para reiniciar o CI.
- O usuário vê as capturas **antes** de mesclar quando ele pediu. Não mescle
  sem o "pode mesclar" dele.

## 4. "Pode mesclar"

1. Confira os checks do PR (todos verdes, na cabeça atual).
2. `update_pull_request` com `draft: false`.
3. Mescle com **commit de mesclagem** (`merge_method: merge`, nunca squash
   nem rebase — é o que a `main` usa desde sempre), com o SHA de 40
   caracteres da cabeça conferida no passo 1.
4. `delete_trigger` do check-in e `unsubscribe_pr_activity`.
5. `git fetch origin main && git checkout -B <branch> origin/main && git push
   --force-with-lease -u origin <branch>`.
6. Diga ao usuário o que foi ao ar e o que ficou pendente do lado dele.

Com número de PR no argumento (`/pr-check 74`), só confira o estado desse PR:
checks, mergeabilidade, comentários abertos — e diga o que falta.
