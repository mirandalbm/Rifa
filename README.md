# DarkNews Autopilot

Sistema automatizado que busca notícias, gera roteiros no estilo "dark mystery", cria narração e vídeos com avatar de IA e publica em canais do YouTube em vários idiomas. Inclui um painel para acompanhar a produção, aprovar conteúdo e ver métricas.

## Tecnologias

- **Frontend:** React + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, wouter
- **Backend:** Node.js + Express (TypeScript)
- **Banco de dados:** PostgreSQL com Drizzle ORM (funciona com Postgres local ou hospedado: Neon, Supabase, RDS…)
- **Login:** e-mail e senha, Google e telefone (código por SMS), com sessões guardadas no Postgres

## Como rodar

Requisitos: Node.js 20.12 ou mais novo e um banco PostgreSQL.

```bash
npm install
cp .env.example .env      # preencha pelo menos DATABASE_URL, SESSION_SECRET, API_ENCRYPTION_KEY e APP_URL
npm run db:push           # cria/atualiza as tabelas no banco
npm run dev               # http://localhost:5000
```

Para produção:

```bash
npm run build
npm start
```

O servidor lê o arquivo `.env` automaticamente. Variáveis definidas no ambiente (ex.: no painel da hospedagem) têm prioridade sobre o arquivo.

## Login e acesso

Na página `/login` a pessoa pode:

- **Criar conta com e-mail e senha.** A conta só funciona depois de confirmar o e-mail pelo link enviado. Há também "Esqueci minha senha".
- **Entrar com Google** (aparece quando `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` estão configurados).
- **Entrar com telefone:** recebe um código de 6 dígitos por SMS (Twilio).

Quem pode entrar é definido pelas listas abaixo:

| Variável | Para que serve |
|---|---|
| `ALLOWED_EMAILS` / `ALLOWED_PHONES` | E-mails e telefones que podem usar o painel (separados por vírgula). **Se ficarem vazias, qualquer pessoa que criar uma conta terá acesso**; um aviso aparece no log. |
| `ADMIN_EMAILS` / `ADMIN_PHONES` | Quem pode usar as ferramentas de desenvolvedor em `/api/cline/*` (terminal, editor de arquivos, SQL, navegador, git). Se ficarem vazias, valem as listas `ALLOWED_*`; se tudo estiver vazio, essas ferramentas ficam desligadas. |

Só contam identidades confirmadas: e-mail confirmado pelo link (ou pelo Google) e telefone confirmado por SMS.

### Configurar o login com Google

1. Em [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials), crie um **OAuth client ID** do tipo *Web application*.
2. Em *Authorized redirect URIs*, adicione `<APP_URL>/api/auth/google/callback` (ex.: `https://meusite.com/api/auth/google/callback`).
3. Coloque o Client ID e o Client Secret em `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

### E-mail e SMS

- **E-mail (SendGrid):** `SENDGRID_API_KEY` e `EMAIL_FROM` (remetente verificado no SendGrid). Sem eles, os links de confirmação e de recuperação de senha são impressos no log do servidor.
- **SMS (Twilio):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_FROM_NUMBER`. Sem eles, o login por telefone só fica disponível em desenvolvimento (o código aparece no log).
- Números digitados sem `+` recebem o código do país de `DEFAULT_COUNTRY_CODE` (padrão `55`, Brasil).

## Segurança

- Senhas guardadas com scrypt; tokens de e-mail e códigos SMS guardados só como hash, de uso único e com validade.
- Limite de tentativas em login, cadastro, envio de SMS e recuperação de senha.
- As chaves de API salvas no painel são criptografadas com AES-256-GCM usando `API_ENCRYPTION_KEY`. Não troque essa chave depois de salvar credenciais, senão elas não poderão mais ser lidas.

## Estrutura

```
client/   Frontend React (páginas em client/src/pages)
server/   API Express, autenticação (server/auth.ts), serviços e workers
shared/   Schema do banco (Drizzle) e tipos compartilhados
```

## Pipeline de conteúdo

1. **Busca de notícias:** NewsAPI e NewsData.io, com ranking por potencial viral
2. **Roteiro:** geração com GPT no estilo documentário "dark"
3. **Narração:** ElevenLabs, com vozes por idioma
4. **Vídeo:** avatares de IA com HeyGen
5. **Tradução/dublagem:** vários idiomas
6. **Publicação:** YouTube Data API, com metadados otimizados

As chaves desses serviços podem ser configuradas no painel (Configurações → Integrações) ou por variáveis de ambiente (veja `.env.example`).
