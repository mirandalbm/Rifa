import type { Express } from "express";
import { createServer, type Server } from "http";
import { requireRole, requireAffiliateAccount } from "../auth";
import { authRouter } from "./auth";
import { publicRouter } from "./public";
import { affiliateRouter } from "./affiliate";
import { sellerRouter } from "./seller";
import { adminRouter } from "./admin";
import { devRouter } from "./dev";

/**
 * Um app, três superfícies. O que separa é o guard por escopo: cada router
 * é montado atrás do papel mínimo definido em shared/access.ts, então rota
 * nova nasce protegida sem ninguém precisar lembrar.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/auth", authRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/affiliate", requireRole("affiliate"), requireAffiliateAccount, affiliateRouter);
  app.use("/api/seller", requireRole("cambista"), requireAffiliateAccount, sellerRouter);
  app.use("/api/admin", requireRole("organizer"), adminRouter);
  app.use("/api/dev", devRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Rota não encontrada." });
  });

  return createServer(app);
}
