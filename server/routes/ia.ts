import { Router, type NextFunction, type Request, type Response } from "express";
import { currentRole } from "../auth";
import { papelTemIA } from "@shared/ia";
import { ChatbaseError } from "../services/chatbase";
import { IAError, conversarComIA, historicoDaIA, novaConversaDaIA, sessaoDaIA } from "../services/ia";

/**
 * O assistente de IA dos painéis: master, organizador e afiliado. Cada um fala
 * pela própria sessão (o titular do uso sai dela); cambista e apostador não
 * têm assistente. Nada aqui é guardado em cache.
 */
export const iaRouter = Router();

iaRouter.use((req: Request, res: Response, next: NextFunction) => {
  const role = currentRole(req);
  if (role === "guest") return res.status(401).json({ message: "Entre para continuar." });
  if (!papelTemIA(role)) return res.status(403).json({ message: "Sua conta não tem acesso a esta área." });
  res.set("Cache-Control", "no-store");
  next();
});

/** Erro de regra ou do Chatbase volta com a mensagem em português (o tratador geral esconderia o 5xx). */
function responderErro(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof IAError || err instanceof ChatbaseError) return res.status(err.status).json({ message: err.message });
  next(err);
}

iaRouter.get("/sessao", async (req, res, next) => {
  try {
    res.json(await sessaoDaIA(req));
  } catch (err) {
    responderErro(err, res, next);
  }
});

iaRouter.get("/conversa", async (req, res, next) => {
  try {
    res.json({ mensagens: await historicoDaIA(req) });
  } catch (err) {
    responderErro(err, res, next);
  }
});

iaRouter.delete("/conversa", async (req, res, next) => {
  try {
    await novaConversaDaIA(req);
    res.status(204).end();
  } catch (err) {
    responderErro(err, res, next);
  }
});

iaRouter.post("/mensagens", async (req, res, next) => {
  try {
    res.json(await conversarComIA(req, req.body?.texto));
  } catch (err) {
    responderErro(err, res, next);
  }
});
