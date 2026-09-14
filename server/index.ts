import express, { type Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { registerRoutes } from "./routes";
import { webhookRouter } from "./routes/webhooks";
import { setupAuth } from "./auth";
import { startJobs } from "./jobs";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// O webhook precisa do corpo cru para validar assinatura: vem antes do JSON.
app.use("/api/webhooks", express.raw({ type: "*/*" }), webhookRouter);

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
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`rifa.br no ar em :${port}`);
  });
})();
