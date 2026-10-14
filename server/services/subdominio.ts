import type { NextFunction, Request, Response } from "express";
import { identificarHost, type DestinoDoHost } from "../../shared/subdominio";

/**
 * Lê o domínio base dos subdomínios (`SUBDOMINIO_BASE`, ex.: `loja.exemplo.com.br`).
 * Sem a variável, o endereço próprio fica desligado e nada muda no sistema.
 */
export function subdominioBaseDoAmbiente(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.SUBDOMINIO_BASE?.trim().toLowerCase();
  return base ? base : null;
}

/**
 * Diz de quem é o endereço que chegou, ou `null` (domínio principal, IP, endereço
 * de fora ou subdomínio desligado). Função pura: a rota não decide nada por aqui,
 * só recebe o destino para montar a página da organização ou do afiliado.
 */
export function destinoDoSubdominio(
  host: string | undefined,
  base: string | null = subdominioBaseDoAmbiente(),
): DestinoDoHost | null {
  if (!host) return null;
  return identificarHost(host, base);
}

/**
 * Middleware: põe o destino em `res.locals.subdominio`. Não responde nem
 * redireciona; quem decide o que mostrar é a rota.
 */
export function reconhecerSubdominio(req: Request, res: Response, next: NextFunction) {
  res.locals.subdominio = destinoDoSubdominio(req.headers.host);
  next();
}
