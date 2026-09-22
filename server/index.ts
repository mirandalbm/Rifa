// PRIMEIRO de tudo, antes de qualquer import que leia `process.env`:
// `server/db.ts` exige DATABASE_URL no momento em que o módulo carrega, e os
// imports do ES rodam antes de qualquer linha deste arquivo. Carregar o .env
// depois daqui já seria tarde. Os scripts de `scripts/` fazem o mesmo.
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import path from "node:path";
import { ZodError } from "zod";
import { registerRoutes } from "./routes";
import { webhookRouter } from "./routes/webhooks";
import { setupAuth } from "./auth";
import { startJobs } from "./jobs";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

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
        message: "Dados inválidos.",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ message: err.message ?? "Erro interno." });
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
