/**
 * Perfil público do apostador: apelido, foto e o nome real (primeiro e
 * último). Regras em `shared/perfilApostador.ts`.
 *
 * - O apelido é único entre contas pelo índice (`uq_buyers_apelido`), não
 *   por um `SELECT` antes: dois cadastros ao mesmo tempo, um 409.
 * - A foto fica no banco, reprocessada (320 px, WebP, sem metadados) — o
 *   arquivo enviado nunca é servido como veio.
 * - Conta excluída (LGPD) perde apelido e foto; o perfil some (404).
 */
import sharp from "sharp";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, compradorFotos } from "@shared/schema";
import { nomeRealPublico, validarApelido } from "@shared/perfilApostador";
import { isUniqueViolation } from "../pgError";
import { depoisDaFoto, fotoMudouNaTransacao } from "./verificacao";
import type { StatusVerificacao } from "@shared/verificacao";

export class PerfilApostadorError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PerfilApostadorError";
  }
}

const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export function urlDaFotoDoApostador(apelido: string | null, em: Date | null) {
  return apelido && em ? `/api/public/u/${apelido}/foto?v=${em.getTime()}` : null;
}

async function processarFoto(dataUrl: string) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new PerfilApostadorError("Envie uma imagem (JPG, PNG ou WebP).");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > FOTO_MAX_BYTES) throw new PerfilApostadorError("A foto passa de 5 MB.");
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(320, 320, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new PerfilApostadorError("Não consegui ler essa imagem. Envie uma foto em JPG ou PNG.");
  }
}

async function contaDe(buyerId: string) {
  const [b] = await db
    .select({ id: buyers.id, nome: buyers.name, apelido: buyers.apelido, fotoEm: buyers.fotoEm, conta: buyers.passwordHash, verificadoEm: buyers.verificadoEm })
    .from(buyers)
    .where(and(eq(buyers.id, buyerId), isNull(buyers.excluidoEm)));
  if (!b?.conta) throw new PerfilApostadorError("Entre na sua conta.", 401);
  return b;
}

export async function meuPerfilPublico(buyerId: string) {
  const b = await contaDe(buyerId);
  return {
    apelido: b.apelido,
    foto: urlDaFotoDoApostador(b.apelido, b.fotoEm),
    nomeReal: nomeRealPublico(b.nome),
    verificado: Boolean(b.verificadoEm),
  };
}

/**
 * Salva apelido e/ou foto. Tudo é conferido (inclusive abrir a imagem)
 * antes de gravar: recusa não deixa nada pela metade. `foto: null` apaga.
 */
export async function salvarPerfilPublico(buyerId: string, entrada: { apelido?: unknown; foto?: unknown }) {
  const b = await contaDe(buyerId);
  let apelido: string | undefined;
  if (entrada.apelido !== undefined) {
    const v = validarApelido(entrada.apelido);
    if (!v.ok) throw new PerfilApostadorError(v.erro);
    apelido = v.apelido;
  }
  const foto =
    typeof entrada.foto === "string" ? await processarFoto(entrada.foto) : entrada.foto === null ? null : undefined;
  if ((apelido ?? b.apelido) === null && foto) {
    throw new PerfilApostadorError("Escolha um apelido antes da foto.");
  }

  let statusDaVerificacao: StatusVerificacao | null = null;
  try {
    await db.transaction(async (tx) => {
      const agora = new Date();
      if (foto) {
        await tx
          .insert(compradorFotos)
          .values({ buyerId, mime: "image/webp", bytes: foto, updatedAt: agora })
          .onConflictDoUpdate({ target: compradorFotos.buyerId, set: { bytes: foto, updatedAt: agora } });
      } else if (foto === null) {
        await tx.delete(compradorFotos).where(eq(compradorFotos.buyerId, buyerId));
      }
      await tx
        .update(buyers)
        .set({
          ...(apelido !== undefined ? { apelido } : {}),
          ...(foto !== undefined ? { fotoEm: foto ? agora : null } : {}),
        })
        .where(eq(buyers.id, buyerId));
      // Foto nova tira o selo aqui mesmo, até ser conferida de novo.
      if (foto !== undefined) statusDaVerificacao = await fotoMudouNaTransacao(tx, "apostador", buyerId);
    });
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_apelido")) {
      throw new PerfilApostadorError("Esse apelido já é de outra pessoa. Escolha outro.", 409);
    }
    throw err;
  }
  depoisDaFoto("apostador", buyerId, statusDaVerificacao);
  return meuPerfilPublico(buyerId);
}

/** O perfil que qualquer um vê em `/u/<apelido>`. */
export async function perfilPublicoDoApostador(apelidoBruto: string) {
  const apelido = apelidoBruto.toLowerCase();
  const [b] = await db
    .select({ nome: buyers.name, apelido: buyers.apelido, fotoEm: buyers.fotoEm, desde: buyers.contaCriadaEm, verificadoEm: buyers.verificadoEm })
    .from(buyers)
    .where(and(eq(buyers.apelido, apelido), isNull(buyers.excluidoEm)));
  if (!b) throw new PerfilApostadorError("Perfil não encontrado.", 404);
  return {
    apelido: b.apelido,
    nomeReal: nomeRealPublico(b.nome),
    foto: urlDaFotoDoApostador(b.apelido, b.fotoEm),
    desde: b.desde,
    verificado: Boolean(b.verificadoEm),
  };
}

export async function fotoDoApostador(apelido: string) {
  const [f] = await db
    .select({ bytes: compradorFotos.bytes, mime: compradorFotos.mime })
    .from(buyers)
    .innerJoin(compradorFotos, eq(compradorFotos.buyerId, buyers.id))
    .where(and(eq(buyers.apelido, apelido.toLowerCase()), isNull(buyers.excluidoEm)));
  return f ?? null;
}


/* ------------------------------------------------------------------ *
 * Quem também joga a mesma rifa
 * ------------------------------------------------------------------ */

export const QUEM_JOGA_MAX = 6;
const CACHE_QUEM_JOGA_MS = 15_000;
const cacheQuemJoga = new Map<string, { em: number; v: { pessoas: { apelido: string; foto: string | null }[]; mais: boolean } }>();

/**
 * Mini-perfis de quem comprou (pago) esta rifa **e** abriu o perfil público
 * (`buyers.perfil_publico`, nasce desligado — participar de rifa é dado
 * pessoal, LGPD). Só apelido e foto; nunca nome, telefone, CPF, id ou quantas
 * cotas. A consulta parte de quem abriu o perfil (poucos, índice parcial) e
 * confere a compra com `EXISTS` — nunca varre os pedidos da rifa. Pede uma
 * pessoa a mais que o máximo só para saber se há "e outras", sem contar
 * ninguém. Rascunho, demonstração, rifa travada e organização arquivada ou
 * banida não mostram ninguém.
 */
export async function quemTambemJoga(slug: string) {
  const cache = cacheQuemJoga.get(slug);
  if (cache && Date.now() - cache.em < CACHE_QUEM_JOGA_MS) return cache.v;
  const r = await db.execute(sql`
    select b.apelido, b.foto_em
      from campaigns c
      join organizations o on o.id = c.organization_id
      join buyers b on b.perfil_publico and b.apelido is not null and b.excluido_em is null
     where c.slug = ${slug}
       and c.status in ('published','closed','drawn')
       and not c.demonstracao and c.travada_em is null
       and o.archived_at is null and o.banida_em is null
       and exists (select 1 from orders ord where ord.buyer_id = b.id and ord.campaign_id = c.id and ord.status = 'paid')
     order by b.apelido
     limit ${QUEM_JOGA_MAX + 1}`);
  const linhas = r.rows as { apelido: string; foto_em: string | Date | null }[];
  const v = {
    // `foto_em` vem de SQL cru: timestamp sem fuso, em UTC.
    pessoas: linhas.slice(0, QUEM_JOGA_MAX).map((l) => ({
      apelido: l.apelido,
      foto: urlDaFotoDoApostador(l.apelido, l.foto_em ? new Date(l.foto_em instanceof Date ? l.foto_em : `${String(l.foto_em).replace(" ", "T")}Z`) : null),
    })),
    mais: linhas.length > QUEM_JOGA_MAX,
  };
  cacheQuemJoga.set(slug, { em: Date.now(), v });
  if (cacheQuemJoga.size > 500) cacheQuemJoga.clear();
  return v;
}
