# Checklist de lançamento para o primeiro usuário real

Lista única do que precisa mudar antes de vender para gente de verdade.
Cada item tem um dono: **[você]** é ação fora do código (painel, Railway,
advogado, Meta); **[código]** é trabalho no repositório. Quando fechar um
item, marque aqui e, se ele estiver em `docs/PENDENCIAS.md` ou em
`docs/ORDEM-DE-LANCAMENTO.md`, marque lá também.

Esta lista não substitui os documentos: ela junta o que bloqueia a venda.

## 1. Pagamento (prioridade atual)

- [ ] **[código]** Mesclar o PR #253 (Pagar.me sem split) no `main`.
- [ ] **[você]** Autorizar o merge do PR #253 (CI verde, sem conflito).
- [ ] **[você]** `npm run db:push` a partir do `main` novo, com a lista de
      mudanças conferida antes de confirmar qualquer `drop`.
- [ ] **[você]** Redeploy do serviço `Rifa` e checagem do healthcheck nos logs.
- [ ] **[você]** Conferir no Railway: `PAGARME_SECRET_KEY` começa com
      `sk_test_` (nesta fase) e `PAGARME_WEBHOOK_TOKEN` é idêntica à senha do
      `?t=` no painel do Pagar.me.
- [ ] **[você]** Webhook do Pagar.me cadastrado com `charge.paid`,
      `charge.refunded`, `charge.partial_canceled` e `charge.chargedback`.
- [ ] **[código]** Teste de Pix pela API (script `teste-pix-api.sh`).
- [ ] **[código]** Teste de Pix pelo site, numa rifa de teste, com o webhook
      confirmando o pagamento uma única vez.
- [ ] **[código]** Teste de estorno de uma compra de teste pelo chamado.
- [ ] **[você]** Confirmar com o contador e o advogado o modelo do repasse sem
      split (resposta escrita, ver `docs/PENDENCIAS.md`, seção 2).
- [ ] **[código]** Repasse à promotora (Pix manual com baixa e recibo).

## 2. Segurança (obrigatório antes do usuário real)

- [ ] **[você]** Trocar a senha do Postgres da Rifa (apareceu no chat) e
      atualizar a `DATABASE_URL` do serviço `Rifa`.
- [ ] **[você]** Trocar a senha do Postgres do North (também apareceu no chat).
- [ ] **[você]** Trocar a chave de teste do Pagar.me se o painel mostrar que ela
      foi exposta; depois, atualizar `PAGARME_SECRET_KEY`.
- [ ] **[você]** Trocar a senha do administrador (passou pela conversa) e
      apagar `ADMIN_PASSWORD` do Railway.
- [ ] **[você]** Trocar a senha do organizador (Usuários → senha).
- [ ] **[você]** Apagar na Meta o token temporário antigo.
- [ ] **[você]** `SESSION_SECRET` e `COFRE_CHAVE` definidas e longas. Trocar
      `COFRE_CHAVE` depois de cadastrar dados trava documentos fiscais e o
      segundo fator já ativado: só trocar com a migração prevista.
- [ ] **[você]** Ativar o segundo fator na conta do administrador.
- [ ] **[você]** Em Antifraude, conferir que os IPs chegam diferentes.

## 3. Dados da empresa e documentos legais

- [ ] **[você]** Aparência → Dados da empresa: razão social, CNPJ, endereço,
      e-mail e encarregado de dados (LGPD).
- [ ] **[você]** Publicar os Termos de uso e a Política de privacidade com
      esses dados.
- [ ] **[você]** Receber do advogado o contrato final da promotora (regresso,
      cláusula de remuneração, subcredenciadora).
- [ ] **[você]** Publicar o contrato da promotora no painel e cada organização
      aceitar.
- [ ] **[você]** Publicar o termo de adesão de afiliado (versão nova).
- [ ] **[você]** CNAE da taxa da plataforma confirmado com o contador.
- [ ] **[você]** Responder em até 5 dias às reclamações do consumidor (prazo
      do Decreto 7.962/2013 que os Termos prometem).

## 4. Organizações e rifas reais

- [ ] **[você]** Cada organização: CNPJ, endereço, foto, bio, capa e cor.
- [ ] **[você]** Cada organização: telefone confirmado e aprovado pela
      plataforma.
- [ ] **[você]** Certificado de autorização SPA/MF de cada rifa (número e
      arquivo).
- [ ] **[você]** Conferir a data do sorteio e a regra de apuração de cada rifa.
- [ ] **[você]** Reset geral: remover o perfil de demonstração e todos os dados
      de teste (pedidos, cobranças, rifas e organizações de teste).

## 5. Dados de teste e exemplos que não podem ir ao público

- [ ] **[você]** Apagar pedidos, cobranças e cotas de teste do banco.
- [ ] **[você]** Tirar os exemplos: rodapé de exemplo, banners de exemplo, logos
      "Exemplo" e a demonstração.
- [ ] **[você]** Conferir que nenhuma rifa de demonstração aparece na vitrine.

## 6. Serviços externos

- [ ] **[você]** WhatsApp (Meta): verificar a empresa Sorte Nacional, cadastrar
      o número real e criar o modelo `chamado_novo`.
- [ ] **[você]** Cloudflare R2: criar o bucket e as chaves da cópia de mídia.
- [ ] **[você]** Google OAuth: cliente de produção com o domínio do site.
- [ ] **[você]** Cloudflare Stream, Chatbase (Lucky) e Windsor: ativar só se
      forem usados no lançamento.
- [ ] **[você]** Meta e Google: pixels só com o ok das duas plataformas.

## 7. Depois do primeiro dia no ar

- [ ] **[você]** Olhar o log de produção (`[csp]`) com os pixels ligados. Passar
      a política de conteúdo para valer só com o log limpo.
- [ ] **[código]** Migrações versionadas no lugar do `drizzle-kit push` no
      pré-deploy.
- [ ] **[código]** Serviço do trabalhador no Railway (gerador de reels).
- [ ] **[código]** Compilar o APK das maquininhas (quando houver máquina com o
      Android SDK).
- [ ] **[você]** Limpar as branches antigas no GitHub.
