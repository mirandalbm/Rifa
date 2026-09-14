import { Router } from "express";
import passport from "passport";
import { currentRole, type SessionUser } from "../auth";
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
authRouter.post("/login", (req, res, next) => {
  passport.authenticate(
    "local",
    (err: Error | null, user: SessionUser | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message ?? "Não foi possível entrar." });
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

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ ok: true }));
  });
});
