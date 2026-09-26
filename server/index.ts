// PRIMEIRO de tudo, antes de qualquer import que leia `process.env`:
// `server/db.ts` exige DATABASE_URL no momento em que o módulo carrega, e os
// imports do ES rodam antes de qualquer linha deste arquivo. Carregar o .env
// depois daqui já seria tarde. Os scripts de `scripts/` fazem o mesmo.
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import path from "node:path";
import { ZodError } from "zod";
import { mensagemDeValidacao } from "@shared/zodPt";
import { registerRoutes } from "./routes";
import { webhookRouter } from "./routes/webhooks";
import { setupAuth } from "./auth";
import { startJobs } from "./jobs";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.disable("x-powered-by");

// Cabeçalhos de defesa baratos: o navegador não adivinha tipo de arquivo
// (upload servido como página), a loja não abre dentro de iframe alheio
// (clickjacking no botão de pagar) e o código do pedido na URL não vaza
// no Referer para sites externos. Iframe só do próprio site: é a
// pré-visualização do construtor de templates (/admin/aparencia).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// O webhook precisa do corpo cru para validar assinatura: vem antes do JSON.
app.use("/api/webhooks", express.raw({ type: "*/*" }), webhookRouter);

// Mídia enviada em desenvolvimento (em produção o R2 serve direto).
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads"), {
    maxAge: "1h",
    index: false,
  }),
);

// O chamado leva o print do bilhete (até 5 MB em base64). Só estas rotas
// aceitam corpo maior; o resto segue no limite de 1 MB.
app.use(
  [
    "/api/public/chamados",
    "/api/admin/chamados",
    "/api/admin/campaigns/:id/legal",
    "/api/admin/template/logo",
    "/api/admin/banners",
    "/api/admin/banners/:id",
    "/api/admin/stories",
  ],
  express.json({ limit: "8mb" }),
);
// O perfil pode levar foto e capa juntas (até 5 MB cada, em base64).
app.use("/api/admin/organizacoes/:id/perfil", express.json({ limit: "16mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} em ${Date.now() - start}ms`);
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
