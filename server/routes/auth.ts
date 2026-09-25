import { Router } from "express";
import passport from "passport";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, auditLog } from "@shared/schema";
import { currentRole, hashPassword, verifyPassword, type SessionUser } from "../auth";
import { senhaInvalida } from "@shared/senha";
import { guardLogin, identify } from "../services/antifraude";
import { sectionsFor, homeFor } from "@shared/access";

export const authRouter = Router();

/** Quem sou eu e o que eu alcanço — o cliente monta o menu com isto. */
authRouter.get("/me", (req, res) => {
  const role = currentRole(req);
  res.json({
    role,
    user: req.user ? { name: req.user.name, email: req.user.email } : null,
    buyer: req.session.buyer?.phone ? { phone: req.session.buyer.phone } : null,
    sections: sectionsFor(role),
    home: homeFor(role),
  });
});

/** Uma porta de entrada só: o papel no banco decide onde a pessoa cai. */
authRouter.post("/login", async (req, res, next) => {
  // Força bruta é barrada antes de a senha ser sequer comparada.
  const veredito = await guardLogin(String(req.body?.email ?? ""), identify(req));
  if (!veredito.allowed) {
    return res.status(429).json({ message: veredito.reason, code: veredito.rule });
  }

  passport.authenticate(
    "local",
    (
      err: Error | null,
      user: SessionUser | false,
      info?: { message?: string; code?: string },
    ) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({
          message: info?.message ?? "Não foi possível entrar.",
          // A tela usa isto para pedir o código em vez de repetir a senha.
          code: info?.code,
        });
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({
          role: user.role,
          user: { name: user.name, email: user.email },
          sections: sectionsFor(user.role),
          home: homeFor(user.role),
        });
      });
    },
  )(req, res, next);
});

/**
 * Trocar a própria senha. Pede a atual mesmo com a sessão aberta: quem pegou
 * um computador destrancado não pode trancar o dono do lado de fora. A senha
 * atual errada conta na mesma janela de força bruta do login.
 */
authRouter.post("/senha", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Entre para continuar." });

    const veredito = await guardLogin(req.user.email, identify(req));
    if (!veredito.allowed) {
      return res.status(429).json({ message: veredito.reason, code: veredito.rule });
    }

    const atual = String(req.body?.atual ?? "");
    const nova = String(req.body?.nova ?? "");
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    if (!user || !(await verifyPassword(atual, user.passwordHash))) {
      return res.status(401).json({ message: "A senha atual não confere." });
    }
    const invalida = senhaInvalida(nova, user.role);
    if (invalida) return res.status(400).json({ message: invalida });
    if (nova === atual) {
      return res.status(400).json({ message: "A nova senha é igual à atual." });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(nova) })
      .where(eq(users.id, user.id));
    await db.insert(auditLog).values({
      actorId: user.id,
      actorRole: user.role,
      action: "usuario.senha.trocada",
      entity: "user",
      entityId: user.id,
      ip: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ ok: true }));
  });
});
