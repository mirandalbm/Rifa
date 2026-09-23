import crypto from "crypto";
import { promisify } from "util";
import session from "express-session";
import connectPg from "connect-pg-simple";
import * as oidc from "openid-client";
import { z } from "zod";
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser, User } from "@shared/schema";
import { storage } from "./storage";
import { sendEmail, sendSms, isEmailConfigured, isSmsConfigured } from "./services/authMessagingService";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    googleAuth?: { state: string; codeVerifier: string; nonce: string };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const isProduction = process.env.NODE_ENV === "production";
const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || "5000"}`).replace(/\/+$/, "");

const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  console.warn("⚠️ SESSION_SECRET is not set - using a random secret (sessions reset on every restart).");
  return crypto.randomBytes(32).toString("hex");
})();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
// Without an SMS provider, codes are only printed to the server log, so phone login is offered in development only
const isPhoneLoginEnabled = isSmsConfigured() || !isProduction;

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_CODE_MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

const DEFAULT_COUNTRY_CODE = (process.env.DEFAULT_COUNTRY_CODE || "55").replace(/\D/g, "");

/** Normalizes to E.164 (`+5511999999999`). Numbers without a country code get DEFAULT_COUNTRY_CODE. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length <= 11) digits = DEFAULT_COUNTRY_CODE + digits.replace(/^0+/, "");
  const phone = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

// ---------------------------------------------------------------------------
// Access control lists
// ---------------------------------------------------------------------------

function parseList(value: string | undefined, normalize: (item: string) => string | null): string[] {
  return (value || "")
    .split(",")
    .map((item) => normalize(item.trim()))
    .filter((item): item is string => Boolean(item));
}

const normalizeEmail = (email: string) => (email ? email.toLowerCase() : null);

// Who may use the dashboard. When both are empty, anyone who signs up can use it.
const ALLOWED_EMAILS = parseList(process.env.ALLOWED_EMAILS, normalizeEmail);
const ALLOWED_PHONES = parseList(process.env.ALLOWED_PHONES, normalizePhone);
// Who may use developer tools (terminal, file editor, raw SQL). Defaults to the lists above;
// when everything is empty those tools are disabled.
const ADMIN_EMAILS_RAW = parseList(process.env.ADMIN_EMAILS, normalizeEmail);
const ADMIN_PHONES_RAW = parseList(process.env.ADMIN_PHONES, normalizePhone);
const hasAdminList = ADMIN_EMAILS_RAW.length > 0 || ADMIN_PHONES_RAW.length > 0;
const ADMIN_EMAILS = hasAdminList ? ADMIN_EMAILS_RAW : ALLOWED_EMAILS;
const ADMIN_PHONES = hasAdminList ? ADMIN_PHONES_RAW : ALLOWED_PHONES;
const hasAllowList = ALLOWED_EMAILS.length > 0 || ALLOWED_PHONES.length > 0;

if (!hasAllowList) {
  console.warn(
    "⚠️ ALLOWED_EMAILS / ALLOWED_PHONES are not set - anyone who creates an account can control this dashboard. " +
    "Set them to comma-separated lists of permitted emails / phone numbers."
  );
}

function isEmailAllowed(email: string | null | undefined): boolean {
  return !hasAllowList || (!!email && ALLOWED_EMAILS.includes(email.toLowerCase()));
}

function isPhoneAllowed(phone: string | null | undefined): boolean {
  return !hasAllowList || (!!phone && ALLOWED_PHONES.includes(phone));
}

// Only verified identities count: an unverified email could belong to anyone.
function isUserAllowed(user: User): boolean {
  return (user.emailVerified && isEmailAllowed(user.email)) || (!!user.phone && isPhoneAllowed(user.phone)) || !hasAllowList;
}

function isUserAdmin(user: User): boolean {
  const email = user.emailVerified ? user.email?.toLowerCase() : undefined;
  return (!!email && ADMIN_EMAILS.includes(email)) || (!!user.phone && ADMIN_PHONES.includes(user.phone));
}

// ---------------------------------------------------------------------------
// Secrets: passwords, tokens, codes
// ---------------------------------------------------------------------------

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

// Compared against when the account doesn't exist, so response time doesn't reveal which emails are registered
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const hashPhoneCode = (phone: string, code: string) =>
  crypto.createHmac("sha256", SESSION_SECRET).update(`${phone}:${code}`).digest("hex");

async function issueEmailToken(userId: string, type: "verify_email" | "reset_password", ttlMs: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await storage.createAuthToken({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function sendVerificationEmail(user: User): Promise<void> {
  const token = await issueEmailToken(user.id, "verify_email", EMAIL_TOKEN_TTL_MS);
  const link = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await sendEmail(
    user.email!,
    "Confirme seu e-mail - DarkNews Autopilot",
    `Olá! Para ativar sua conta, abra este link (válido por 24 horas):\n\n${link}\n\nSe você não criou esta conta, ignore este e-mail.`
  );
}

async function sendPasswordResetEmail(user: User): Promise<void> {
  const token = await issueEmailToken(user.id, "reset_password", RESET_TOKEN_TTL_MS);
  const link = `${APP_URL}/reset-password?token=${token}`;
  await sendEmail(
    user.email!,
    "Redefinir senha - DarkNews Autopilot",
    `Recebemos um pedido para redefinir sua senha. Abra este link (válido por 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail.`
  );
}

// ---------------------------------------------------------------------------
// Rate limiting (in memory, per process)
// ---------------------------------------------------------------------------

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

setInterval(() => {
  const now = Date.now();
  rateBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  });
}, 10 * 60 * 1000).unref();

function rateLimit(name: string, limit: number, windowMs: number): RequestHandler {
  return (req, res, next) => {
    if (isRateLimited(`${name}:${req.ip}`, limit, windowMs)) {
      return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

function startSession(req: Request, user: User): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // New session id on login prevents session fixation
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  }).then(() => {
    storage.updateUser(user.id, { lastLoginAt: new Date() }).catch(() => {});
  });
}

function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const PgStore = connectPg(session);
  return session({
    secret: SESSION_SECRET,
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    }),
    name: "darknews.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

// ---------------------------------------------------------------------------
// Google (OpenID Connect)
// ---------------------------------------------------------------------------

let googleConfigPromise: Promise<oidc.Configuration> | null = null;

function getGoogleConfig(): Promise<oidc.Configuration> {
  if (!googleConfigPromise) {
    googleConfigPromise = oidc
      .discovery(new URL("https://accounts.google.com"), GOOGLE_CLIENT_ID!, GOOGLE_CLIENT_SECRET!)
      .catch((error) => {
        googleConfigPromise = null; // retry discovery on the next attempt
        throw error;
      });
  }
  return googleConfigPromise;
}

const GOOGLE_CALLBACK_URL = `${APP_URL}/api/auth/google/callback`;

async function findOrCreateGoogleUser(claims: oidc.IDToken): Promise<User> {
  const googleId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const emailVerified = claims.email_verified === true;
  const profile = {
    firstName: typeof claims.given_name === "string" ? claims.given_name : undefined,
    lastName: typeof claims.family_name === "string" ? claims.family_name : undefined,
    profileImageUrl: typeof claims.picture === "string" ? claims.picture : undefined,
  };

  const byGoogleId = await storage.getUserByGoogleId(googleId);
  if (byGoogleId) return byGoogleId;

  if (email && emailVerified) {
    const byEmail = await storage.getUserByEmail(email);
    if (byEmail) {
      return storage.updateUser(byEmail.id, {
        googleId,
        emailVerified: true,
        // Someone else may have registered this address without confirming it; drop their password
        passwordHash: byEmail.emailVerified ? byEmail.passwordHash : null,
        profileImageUrl: byEmail.profileImageUrl || profile.profileImageUrl,
        firstName: byEmail.firstName || profile.firstName,
        lastName: byEmail.lastName || profile.lastName,
      });
    }
  }

  return storage.createUser({
    googleId,
    email: email && emailVerified ? email : null,
    emailVerified: Boolean(email && emailVerified),
    ...profile,
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(254);
const passwordSchema = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(128, "Senha muito longa");

function sendValidationError(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: error.errors[0]?.message || "Dados inválidos" });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Load the signed-in user for API requests
  app.use("/api", async (req, _res, next) => {
    try {
      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user) req.user = user;
        else delete req.session.userId;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/providers", (_req, res) => {
    res.json({ email: true, google: isGoogleConfigured, phone: isPhoneLoginEnabled });
  });

  app.get("/api/auth/user", isAuthenticated, (req, res) => {
    res.json(toPublicUser(req.user!));
  });

  // --- Email + password -----------------------------------------------------

  app.post("/api/auth/register", rateLimit("register", 10, 60 * 60 * 1000), async (req, res) => {
    const parsed = z.object({
      email: emailSchema,
      password: passwordSchema,
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { email, password, firstName, lastName } = parsed.data;

    if (!isEmailAllowed(email)) {
      return res.status(403).json({ message: "Este e-mail não tem permissão para acessar o sistema." });
    }

    try {
      const existing = await storage.getUserByEmail(email);
      if (existing?.emailVerified) {
        return res.status(409).json({ message: "Este e-mail já está cadastrado. Entre ou use \"Esqueci minha senha\"." });
      }

      const passwordHash = await hashPassword(password);
      // An unconfirmed registration can be taken over: only whoever confirms the email gets the account
      const user = existing
        ? await storage.updateUser(existing.id, { passwordHash, firstName: firstName || existing.firstName, lastName: lastName || existing.lastName })
        : await storage.createUser({ email, passwordHash, firstName, lastName, emailVerified: false });

      await sendVerificationEmail(user);
      res.status(201).json({ message: "Conta criada! Enviamos um link de confirmação para o seu e-mail." });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Não foi possível criar a conta." });
    }
  });

  app.post("/api/auth/login", rateLimit("login", 20, 15 * 60 * 1000), async (req, res) => {
    const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe e-mail e senha." });
    const { email, password } = parsed.data;

    if (isRateLimited(`login-account:${email}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ message: "Muitas tentativas para esta conta. Aguarde alguns minutos." });
    }

    try {
      const user = await storage.getUserByEmail(email);
      const valid = user?.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : (await verifyPassword(password, await DUMMY_PASSWORD_HASH), false);

      if (!user || !valid) {
        return res.status(401).json({ message: "E-mail ou senha incorretos." });
      }
      if (!user.emailVerified) {
        return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada." });
      }
      if (!isUserAllowed(user)) {
        return res.status(403).json({ message: "Esta conta não tem permissão para acessar o sistema." });
      }

      await startSession(req, user);
      res.json(toPublicUser(user));
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Não foi possível entrar." });
    }
  });

  app.post("/api/auth/resend-verification", rateLimit("resend", 5, 60 * 60 * 1000), async (req, res) => {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      const user = await storage.getUserByEmail(parsed.data.email);
      if (user && !user.emailVerified && user.passwordHash) {
        await sendVerificationEmail(user);
      }
    } catch (error) {
      console.error("Resend verification error:", error);
    }
    // Same answer whether or not the account exists
    res.json({ message: "Se houver uma conta pendente com este e-mail, enviamos um novo link." });
  });

  app.get("/api/auth/verify-email", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    try {
      const record = token ? await storage.consumeAuthToken("verify_email", sha256(token)) : undefined;
      if (!record) return res.redirect("/login?error=invalid_token");

      const user = await storage.updateUser(record.userId, { emailVerified: true });
      if (!isUserAllowed(user)) return res.redirect("/login?error=not_allowed");

      await startSession(req, user);
      res.redirect("/?verified=1");
    } catch (error) {
      console.error("Email verification error:", error);
      res.redirect("/login?error=server");
    }
  });

  app.post("/api/auth/forgot-password", rateLimit("forgot", 5, 60 * 60 * 1000), async (req, res) => {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      const user = await storage.getUserByEmail(parsed.data.email);
      if (user?.email) await sendPasswordResetEmail(user);
    } catch (error) {
      console.error("Forgot password error:", error);
    }
    res.json({ message: "Se existir uma conta com este e-mail, enviamos um link para redefinir a senha." });
  });

  app.post("/api/auth/reset-password", rateLimit("reset", 10, 60 * 60 * 1000), async (req, res) => {
    const parsed = z.object({ token: z.string().min(1).max(200), password: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      const record = await storage.consumeAuthToken("reset_password", sha256(parsed.data.token));
      if (!record) return res.status(400).json({ message: "Link inválido ou expirado. Peça um novo." });

      // Opening the emailed link proves ownership of the address
      const user = await storage.updateUser(record.userId, {
        passwordHash: await hashPassword(parsed.data.password),
        emailVerified: true,
      });
      if (!isUserAllowed(user)) {
        return res.status(403).json({ message: "Senha alterada, mas esta conta não tem permissão para acessar o sistema." });
      }
      await startSession(req, user);
      res.json(toPublicUser(user));
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Não foi possível redefinir a senha." });
    }
  });

  // --- Google ----------------------------------------------------------------

  app.get("/api/auth/google", rateLimit("google", 30, 15 * 60 * 1000), async (req, res) => {
    if (!isGoogleConfigured) return res.redirect("/login?error=google_disabled");
    try {
      const config = await getGoogleConfig();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      req.session.googleAuth = { state, codeVerifier, nonce };
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: GOOGLE_CALLBACK_URL,
        scope: "openid email profile",
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state,
        nonce,
        prompt: "select_account",
      });
      req.session.save(() => res.redirect(url.href));
    } catch (error) {
      console.error("Google login error:", error);
      res.redirect("/login?error=google");
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const pending = req.session.googleAuth;
    delete req.session.googleAuth;
    if (!isGoogleConfigured || !pending) return res.redirect("/login?error=google");

    try {
      const config = await getGoogleConfig();
      const currentUrl = new URL(req.originalUrl, APP_URL);
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
      });
      const claims = tokens.claims();
      if (!claims) return res.redirect("/login?error=google");

      const email = typeof claims.email === "string" ? claims.email : null;
      if (hasAllowList && !(claims.email_verified === true && isEmailAllowed(email))) {
        return res.redirect("/login?error=not_allowed");
      }

      const user = await findOrCreateGoogleUser(claims);
      if (!isUserAllowed(user)) return res.redirect("/login?error=not_allowed");

      await startSession(req, user);
      res.redirect("/");
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("/login?error=google");
    }
  });

  // --- Phone (SMS code) ------------------------------------------------------

  const phoneSchema = z.string().max(32).transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Número de telefone inválido. Use DDD + número, ex.: 11 99999-9999." });
      return z.NEVER;
    }
    return phone;
  });

  app.post("/api/auth/phone/send-code", rateLimit("sms", 10, 60 * 60 * 1000), async (req, res) => {
    if (!isPhoneLoginEnabled) return res.status(404).json({ message: "Login por telefone não está disponível." });
    const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { phone } = parsed.data;

    if (!isPhoneAllowed(phone)) {
      return res.status(403).json({ message: "Este número não tem permissão para acessar o sistema." });
    }

    try {
      const latest = await storage.getActivePhoneCode(phone);
      if (latest?.createdAt && Date.now() - latest.createdAt.getTime() < 60 * 1000) {
        return res.status(429).json({ message: "Aguarde 1 minuto antes de pedir outro código." });
      }
      if (await storage.countPhoneCodesSince(phone, new Date(Date.now() - 60 * 60 * 1000)) >= 5) {
        return res.status(429).json({ message: "Muitos códigos enviados para este número. Tente novamente mais tarde." });
      }

      const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
      await storage.createPhoneCode({ phone, codeHash: hashPhoneCode(phone, code), expiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS) });
      await sendSms(phone, `Seu código de acesso DarkNews: ${code}. Ele expira em 10 minutos.`);
      res.json({ message: "Código enviado por SMS.", phone });
    } catch (error) {
      console.error("Send SMS code error:", error);
      res.status(500).json({ message: "Não foi possível enviar o SMS." });
    }
  });

  app.post("/api/auth/phone/verify", rateLimit("sms-verify", 30, 15 * 60 * 1000), async (req, res) => {
    if (!isPhoneLoginEnabled) return res.status(404).json({ message: "Login por telefone não está disponível." });
    const parsed = z.object({ phone: phoneSchema, code: z.string().trim().regex(/^\d{6}$/, "O código tem 6 dígitos.") }).safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { phone, code } = parsed.data;

    try {
      const record = await storage.getActivePhoneCode(phone);
      if (!record || record.attempts >= PHONE_CODE_MAX_ATTEMPTS) {
        return res.status(400).json({ message: "Código inválido ou expirado. Peça um novo código." });
      }

      const expected = Buffer.from(record.codeHash, "hex");
      const actual = Buffer.from(hashPhoneCode(phone, code), "hex");
      if (!crypto.timingSafeEqual(expected, actual)) {
        await storage.incrementPhoneCodeAttempts(record.id);
        return res.status(400).json({ message: "Código incorreto." });
      }
      await storage.markPhoneCodeUsed(record.id);

      const user = (await storage.getUserByPhone(phone)) ?? (await storage.createUser({ phone }));
      if (!isUserAllowed(user)) {
        return res.status(403).json({ message: "Este número não tem permissão para acessar o sistema." });
      }

      await startSession(req, user);
      res.json(toPublicUser(user));
    } catch (error) {
      console.error("Verify SMS code error:", error);
      res.status(500).json({ message: "Não foi possível verificar o código." });
    }
  });

  // --- Sign out ----------------------------------------------------------------

  const logout = (req: Request, res: Response, respond: () => void) => {
    req.session.destroy(() => {
      res.clearCookie("darknews.sid");
      respond();
    });
  };
  app.post("/api/auth/logout", (req, res) => logout(req, res, () => res.json({ message: "Sessão encerrada." })));
  app.get("/api/logout", (req, res) => logout(req, res, () => res.redirect("/")));
  app.get("/api/login", (_req, res) => res.redirect("/login"));

  if (!isEmailConfigured()) {
    console.warn("⚠️ SENDGRID_API_KEY / EMAIL_FROM not set - verification and password reset links are printed to the server log.");
  }
  if (!isGoogleConfigured) {
    console.log("ℹ️ Google login disabled (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it).");
  }
  if (!isPhoneLoginEnabled) {
    console.log("ℹ️ Phone login disabled (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to enable it).");
  }
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!isUserAllowed(req.user)) {
    return res.status(403).json({ message: "Access denied: this account is not allowed to use the dashboard" });
  }
  next();
};

// Guards developer tools that can read/modify the server (files, terminal, raw SQL).
export const isAdmin: RequestHandler = (req, res, next) => {
  isAuthenticated(req, res, (err?: any) => {
    if (err) return next(err);

    if (ADMIN_EMAILS.length === 0 && ADMIN_PHONES.length === 0) {
      return res.status(403).json({
        message: "Developer tools are disabled. Set ADMIN_EMAILS / ADMIN_PHONES (or ALLOWED_EMAILS / ALLOWED_PHONES) to enable them for your account.",
      });
    }
    if (!isUserAdmin(req.user!)) {
      return res.status(403).json({ message: "Access denied: administrator only" });
    }
    next();
  });
};
