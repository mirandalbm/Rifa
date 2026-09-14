import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { randomBytes, scrypt, timingSafeEqual, randomInt } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, affiliates } from "@shared/schema";
import { type Role, roleSatisfies } from "@shared/access";
import { verifyTotp } from "./services/totp";

const scryptAsync = promisify(scrypt);

/* ------------------------------------------------------------------ *
 * Senha — scrypt do próprio node, sem dependência extra
 * ------------------------------------------------------------------ */

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/* ------------------------------------------------------------------ *
 * Sessão
 * ------------------------------------------------------------------ */

declare module "express-session" {
  interface SessionData {
    /** Identidade leve do comprador, criada depois do código por WhatsApp. */
    buyer?: { id: string; phone: string; name: string };
    /** Código de acesso pendente: guardado na sessão, nunca no banco. */
    otp?: { phone: string; codeHash: string; expiresAt: number; attempts: number };
    /** Segredo do 2FA ainda não confirmado: só vira definitivo após o código. */
    pendingTotpSecret?: string;
    /** Afiliado que trouxe a visita — primeiro clique, 30 dias. */
    affiliateCode?: string;
    affiliateSince?: number;
  }
}

export interface SessionUser {
  id: string;
  role: "admin" | "affiliate";
  name: string;
  email: string;
  affiliateId?: string;
}

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function setupAuth(app: Express) {
  const PgStore = connectPg(session);
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET é obrigatória em produção.");
  }

  app.set("trust proxy", 1);
  app.use(
    session({
      name: "rifa.sid",
      secret: process.env.SESSION_SECRET ?? "dev-secret-nao-use-em-producao",
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: ONE_WEEK_MS,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passReqToCallback: true },
      async (req, email, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()));

        // Mesma resposta para e-mail inexistente e senha errada.
        if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
          return done(null, false, { message: "E-mail ou senha incorretos." });
        }

        // Segundo fator: a senha certa sozinha não entra.
        if (user.totpSecret) {
          const token = String((req.body as { token?: string })?.token ?? "");
          if (!token) {
            return done(null, false, {
              message: "Digite o código do aplicativo autenticador.",
              code: "totp_required",
            } as never);
          }
          if (!verifyTotp(user.totpSecret, token)) {
            return done(null, false, {
              message: "Código do autenticador incorreto ou expirado.",
              code: "totp_invalid",
            } as never);
          }
        }

        const sessionUser: SessionUser = {
          id: user.id,
          role: user.role,
          name: user.name,
          email: user.email,
        };

        if (user.role === "affiliate") {
          const [aff] = await db
            .select()
            .from(affiliates)
            .where(eq(affiliates.userId, user.id));
          if (!aff || aff.status !== "active") {
            return done(null, false, {
              message:
                aff?.status === "blocked"
                  ? "Seu acesso de afiliado está bloqueado."
                  : "Seu cadastro de afiliado ainda não foi aprovado.",
            });
          }
          sessionUser.affiliateId = aff.id;
        }

        return done(null, sessionUser);
      } catch (err) {
        return done(err as Error);
      }
      },
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user || !user.active) return done(null, false);

      const sessionUser: SessionUser = {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
      };
      if (user.role === "affiliate") {
        const [aff] = await db
          .select()
          .from(affiliates)
          .where(eq(affiliates.userId, user.id));
        if (!aff || aff.status !== "active") return done(null, false);
        sessionUser.affiliateId = aff.id;
      }
      done(null, sessionUser);
    } catch (err) {
      done(err as Error);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Papel efetivo e guard de rota
 * ------------------------------------------------------------------ */

export function currentRole(req: Request): Role {
  if (req.user) return req.user.role;
  if (req.session?.buyer) return "buyer";
  return "guest";
}

/**
 * Guard único de todas as rotas protegidas. O papel exigido vem da matriz
 * em shared/access.ts, então servidor e cliente nunca discordam.
 */
export function requireRole(required: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = currentRole(req);
    if (!roleSatisfies(role, required)) {
      return res.status(role === "guest" ? 401 : 403).json({
        message:
          role === "guest"
            ? "Entre para continuar."
            : "Sua conta não tem acesso a esta área.",
      });
    }
    next();
  };
}

/**
 * Exige um cadastro de afiliado de verdade, não só o papel. Protege as
 * rotas que respondem "o saldo de quem?" — sem cadastro, não há resposta.
 */
export function requireAffiliateAccount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user?.affiliateId) {
    return res.status(403).json({
      message: "Esta área é do afiliado. Sua conta não tem cadastro de afiliado.",
    });
  }
  next();
}

/** Afiliado autenticado, com o id do cadastro já resolvido. */
export function affiliateId(req: Request): string {
  const id = req.user?.affiliateId;
  if (!id) throw new Error("Rota de afiliado sem afiliado na sessão.");
  return id;
}

/* ------------------------------------------------------------------ *
 * Comprador: código de acesso por telefone, sem senha
 * ------------------------------------------------------------------ */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export async function issueOtp(req: Request, phone: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  req.session.otp = {
    phone,
    codeHash: await hashPassword(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };
  return code;
}

export async function checkOtp(req: Request, code: string): Promise<boolean> {
  const otp = req.session.otp;
  if (!otp) return false;
  if (Date.now() > otp.expiresAt || otp.attempts >= OTP_MAX_ATTEMPTS) {
    delete req.session.otp;
    return false;
  }
  otp.attempts += 1;
  const ok = await verifyPassword(code, otp.codeHash);
  if (ok) delete req.session.otp;
  return ok;
}
