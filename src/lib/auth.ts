import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { PerfilUsuario } from "@prisma/client";

const COOKIE = "rifa_sessao";

export type Sessao = {
  usuarioId: string;
  organizacaoId: string;
  perfil: PerfilUsuario;
  nome: string;
};

function segredo(): Uint8Array {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error("JWT_SECRET não configurado");
  return new TextEncoder().encode(valor);
}

function duracaoHoras(): number {
  return Number(process.env.SESSAO_DURACAO_HORAS ?? 8);
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(sessao: Sessao): Promise<void> {
  const horas = duracaoHoras();
  const token = await new SignJWT({ ...sessao })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${horas}h`)
    .sign(segredo());

  const armazem = await cookies();
  armazem.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: horas * 3600,
  });
}

export async function lerSessao(): Promise<Sessao | null> {
  const armazem = await cookies();
  const token = armazem.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, segredo());
    return {
      usuarioId: String(payload.usuarioId),
      organizacaoId: String(payload.organizacaoId),
      perfil: payload.perfil as PerfilUsuario,
      nome: String(payload.nome),
    };
  } catch {
    return null;
  }
}

export async function encerrarSessao(): Promise<void> {
  const armazem = await cookies();
  armazem.delete(COOKIE);
}

/// Exige uma sessão com um dos perfis informados. Retorna null quando não
/// autorizado — cada rota decide se responde 401 ou redireciona.
export async function exigirPerfil(...perfis: PerfilUsuario[]): Promise<Sessao | null> {
  const sessao = await lerSessao();
  if (!sessao) return null;
  return perfis.includes(sessao.perfil) ? sessao : null;
}
