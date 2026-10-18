import type { Express } from "express";
import { createServer, type Server } from "http";
import { requireRole, requireAffiliateAccount } from "../auth";
import { authRouter } from "./auth";
import { publicRouter } from "./public";
import { affiliateRouter } from "./affiliate";
import { sellerRouter } from "./seller";
import { adminRouter } from "./admin";
import { iaRouter } from "./ia";
import { devRouter } from "./dev";
import { clicarLinkDoPerfil, resolverLinkCurto } from "../services/links";

/**
 * Um app, três superfícies. O que separa é o guard por escopo: cada router
 * é montado atrás do papel mínimo definido em shared/access.ts, então rota
 * nova nasce protegida sem ninguém precisar lembrar.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/auth", authRouter);
  // Quase toda leitura pública varia com a sessão (quem segue, quem curtiu, a
  // conta): sem uma diretiva, um cache compartilhado no meio do caminho (CDN,
  // proxy da operadora) podia servir a resposta de uma pessoa a outra. O padrão
  // é `private, no-cache` (só o aparelho guarda, e revalida pelo ETag); a rota
  // que é igual para todos e quer cache diz o dela (`public, max-age`), e a de
  // dado pessoal diz `no-store`.
  app.use("/api/public", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") res.setHeader("Cache-Control", "private, no-cache");
    next();
  });
  app.use("/api/public", publicRouter);
  app.use("/api/affiliate", requireRole("affiliate"), requireAffiliateAccount, affiliateRouter);
  app.use("/api/seller", requireRole("cambista"), requireAffiliateAccount, sellerRouter);
  app.use("/api/admin", requireRole("organizer"), adminRouter);
  // O assistente de IA: master, organizador e afiliado (o guard é do próprio router).
  app.use("/api/ia", iaRouter);
  app.use("/api/dev", devRouter);

  // Endereço curto e links do perfil: redirecionam só para destino guardado
  // (services/links.ts), nunca para o que vier na URL. 302, sem cache: a
  // contagem precisa ver cada acesso.
  app.get("/c/:codigo", async (req, res, next) => {
    try {
      const destino = await resolverLinkCurto(req.params.codigo, req.get("user-agent"));
      if (!destino) return res.redirect(302, "/");
      res.set("Cache-Control", "no-store");
      res.redirect(302, destino);
    } catch (err) {
      next(err);
    }
  });
  app.get("/l/:slug/:indice", async (req, res, next) => {
    try {
      const url = await clicarLinkDoPerfil(req.params.slug, Number(req.params.indice), req.get("user-agent"));
      if (!url) return res.status(404).send("Link não encontrado.");
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Rota não encontrada." });
  });

  return createServer(app);
}
