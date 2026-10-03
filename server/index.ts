// PRIMEIRO de tudo, antes de qualquer import que leia `process.env`:
// `server/db.ts` exige DATABASE_URL no momento em que o módulo carrega, e os
// imports do ES rodam antes de qualquer linha deste arquivo. Carregar o .env
// depois daqui já seria tarde. Os scripts de `scripts/` fazem o mesmo.
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { mensagemDeValidacao } from "@shared/zodPt";
import { registerRoutes } from "./routes";
import { webhookRouter } from "./routes/webhooks";
import { setupAuth } from "./auth";
import { startJobs } from "./jobs";
import { LocalDiskStorage, chaveRestauravel, storage } from "./services/storage";
import { manifestDaPlataforma } from "./services/template";
import { setupVite, serveStatic, log } from "./vite";
import { montarCsp, hashesDosScriptsEmLinha, ROTA_DO_RELATORIO_CSP } from "@shared/csp";
import { registrarRelatorioCsp } from "./services/csp";
import { hit, identify } from "./services/antifraude";


const app = express();
app.disable("x-powered-by");

// Cabeçalhos de defesa baratos: o navegador não adivinha tipo de arquivo
// (upload servido como página), a loja não abre dentro de iframe alheio
// (clickjacking no botão de pagar) e o código do pedido na URL não vaza
// no Referer para sites externos. Iframe só do próprio site: é a
// pré-visualização do construtor de templates (/admin/aparencia).
const producao = process.env.NODE_ENV === "production";
// Política de conteúdo em modo relatório, só em produção (em desenvolvimento
// o Vite injeta scripts próprios e os relatórios seriam ruído). O hash do
// script do tema sai do `index.html` construído.
const cspRelatorio = producao
  ? montarCsp({
      hashesDeScript: (() => {
        try {
          return hashesDosScriptsEmLinha(fs.readFileSync(path.resolve(import.meta.dirname, "public", "index.html"), "utf8"));
        } catch {
          return [];
        }
      })(),
      midiaPublica: process.env.R2_PUBLIC_URL,
    })
  : null;
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  if (cspRelatorio) res.setHeader("Content-Security-Policy-Report-Only", cspRelatorio);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Em produção o site é só HTTPS: o navegador passa a recusar a versão sem
  // cadeado (quem estiver no meio do caminho não rebaixa para HTTP e lê o
  // cookie da sessão). Sem `includeSubDomains`: outro subdomínio do domínio
  // não é deste sistema.
  if (producao) res.setHeader("Strict-Transport-Security", "max-age=15552000");
  next();
});

// Relatório da política de conteúdo: o navegador manda sem sessão, com tipo
// próprio. Corpo pequeno, 204 sempre, e o log agrupa (`services/csp.ts`).
app.post(
  ROTA_DO_RELATORIO_CSP,
  express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }),
  async (req, res) => {
    try {
      // Limite por IP: a rota é aberta, e girar pares (diretiva, origem)
      // inventados encheria o log.
      const limite = await hit(`csp:${identify(req).ipHash ?? "?"}`, 10, 30);
      if (!limite.excedeu) {
        const corpo = Array.isArray(req.body) ? req.body.map((x: { body?: unknown }) => x?.body ?? x) : [req.body];
        for (const c of corpo.slice(0, 20)) registrarRelatorioCsp(c);
      }
    } catch {
      // relatório malformado: nada a registrar
    }
    res.status(204).end();
  },
);

// O webhook precisa do corpo cru para validar assinatura: vem antes do JSON.
app.use("/api/webhooks", express.raw({ type: "*/*" }), webhookRouter);

// O manifesto do app instalado segue o template publicado (nome, cor, logo).
// Antes do arquivo estático e do Vite; se o banco falhar, segue para o
// arquivo de fábrica em `client/public` — instalar o app nunca quebra.
app.get("/manifest.webmanifest", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("application/manifest+json").send(JSON.stringify(await manifestDaPlataforma()));
  } catch (err) {
    console.error("[manifest] usei o arquivo de fábrica:", (err as Error).message);
    res.removeHeader("Cache-Control");
    next();
  }
});

// Mídia enviada em desenvolvimento (em produção o R2 serve direto).
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads"), {
    maxAge: "1h",
    index: false,
  }),
);
// Arquivo que não existe é 404 — nunca a página do app. Sem isto o curinga
// da SPA respondia 200 com HTML, a imagem quebrava na tela e o log não
// mostrava nada (foi assim que o disco apagado a cada deploy passou calado).
// Antes do 404: com cópia de segurança (`BACKUP_S3_*`), o arquivo que sumiu
// do disco volta da cópia, fica gravado de novo e é servido na hora.
app.use("/uploads", async (req, res, next) => {
  try {
    const store = storage();
    if (!(store instanceof LocalDiskStorage) || !store.temCopia || req.method !== "GET") return next();
    const key = decodeURIComponent(req.path.replace(/^\/+/, ""));
    if (!key || key.includes("..") || !chaveRestauravel(key) || !(await store.restaurar(key))) return next();
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(store.caminho(key));
  } catch (err) {
    console.error("[backup] não restaurei da cópia:", (err as Error).message);
    next();
  }
});
app.use("/uploads", (_req, res) => {
  res.status(404).end();
});

// O chamado leva o print do bilhete (até 5 MB em base64). Só estas rotas
// aceitam corpo maior; o resto segue no limite de 1 MB.
app.use(
  [
    "/api/public/chamados",
    "/api/public/mensagens/conversas/:id/mensagens",
    "/api/admin/chamados",
    "/api/admin/campaigns/:id/legal",
    "/api/admin/template/logo",
    "/api/admin/banners",
    "/api/admin/banner-pago/pedidos",
    "/api/admin/banners/:id",
    "/api/admin/campaigns/:id/foto-ganhador",
    "/api/admin/template/apoio",
    // Foto do perfil do apostador e do afiliado: foto de celular passa de
    // 1 MB fácil, e o limite geral recusava com 413 antes de chegar à régua
    // de 5 MB do serviço.
    "/api/public/conta/perfil",
    "/api/affiliate/foto",
  ],
  express.json({ limit: "8mb" }),
);
// A peça do apostador e a do afiliado levam até 4 fotos de 3 MB (a tela já
// reduz a foto do celular). Só o POST da peça e o PATCH da edição: o resto de
// `/api/public/divulgacoes*` e `/api/affiliate/divulgacoes*` segue em 1 MB.
const corpoDaPecaComFotos = express.json({ limit: "18mb" });
app.use((req, res, next) =>
  (req.method === "POST" && /^\/api\/(public|affiliate)\/divulgacoes$/.test(req.path)) ||
  (req.method === "PATCH" && /^\/api\/(public|affiliate)\/divulgacoes\/[0-9a-f-]{36}$/i.test(req.path))
    ? corpoDaPecaComFotos(req, res, next)
    : next(),
);
// Story em vídeo: até 15 MB em base64 (sem transcode, o arquivo vai como veio).
app.use("/api/admin/stories", express.json({ limit: "22mb" }));
// O perfil pode levar foto e capa juntas (até 5 MB cada, em base64).
app.use("/api/admin/organizacoes/:id/perfil", express.json({ limit: "16mb" }));
// Documento do cadastro fiscal: até 6 MB, em base64.
app.use(
  [
    "/api/affiliate/fiscal/documentos/:tipo",
    // Documentos da verificação (até 6 MB): foto do documento tirada no celular.
    "/api/public/conta/verificacao/documentos/:tipo",
    "/api/affiliate/verificacao/documentos/:tipo",
    "/api/admin/organizacoes/:id/verificacao/documentos/:tipo",
  ],
  express.json({ limit: "10mb" }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  // O caminho é lido aqui, na entrada: dentro de um roteador montado o
  // Express corta o prefixo (`/api/public/orders` vira `/orders`), e lido no
  // `finish` o log só pegava as respostas que voltavam ao nível do app — as
  // vendas com sucesso sumiam do registro. Sem a query string: ela pode levar
  // dado de quem pede.
  const caminho = req.path;
  res.on("finish", () => {
    if (caminho.startsWith("/api")) {
      log(`${req.method} ${caminho} ${res.statusCode} em ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  setupAuth(app);
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: mensagemDeValidacao(err.issues),
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const status = err.status ?? err.statusCode ?? 500;
    // O corpo passou do limite da rota: a mensagem do Express vem em inglês.
    // O 413 da régua de um serviço já vem em português e diz o que passou.
    if (status === 413 && err.type === "entity.too.large") {
      return res.status(413).json({ message: "O arquivo é grande demais. Escolha uma imagem menor." });
    }
    if (status >= 500) {
      // Erro inesperado: o detalhe (SQL, caminho de arquivo, pilha) vai para o
      // log, nunca para o navegador. Erro de regra (4xx) já vem em português.
      console.error(err);
      return res.status(status).json({ message: "Erro interno. Tente novamente." });
    }
    res.status(status).json({ message: err.message ?? "Erro na requisição." });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  startJobs();

  const port = parseInt(process.env.PORT ?? "5000", 10);

  /**
   * Duas escolhas aqui, as duas aprendidas apanhando fora do Linux.
   *
   * **Sem `host`.** Parece descuido, mas é o contrário: assim o Node escolhe
   * a família de endereços conforme a máquina — `::` em pilha dupla onde há
   * IPv6, `0.0.0.0` onde não há. Fixar `0.0.0.0` prende em IPv4, e no Windows
   * `localhost` resolve para `::1` primeiro: a página respondia
   * ERR_EMPTY_RESPONSE com o servidor no ar. Fixar `::` seria pior ainda —
   * quebra em contêiner sem IPv6, com EAFNOSUPPORT.
   *
   * **`reusePort` só no Linux.** SO_REUSEPORT deixa réplicas dividirem a
   * porta no mesmo host; no Windows não existe, e o Node recusa com ENOTSUP
   * em vez de ignorar — o servidor nem subia.
   */
  server.listen(
    { port, reusePort: process.platform === "linux" },
    () => log(`rifa.br no ar em :${port}`),
  );
})();
