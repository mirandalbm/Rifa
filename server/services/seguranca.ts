/**
 * Segurança contra organizador fraudulento: telefone provado e aprovado,
 * denúncias (do apostador e automáticas), rifa travada e organização banida.
 * Regras em `shared/seguranca.ts`.
 *
 * - **Telefone**: o código vai no WhatsApp e fica só na sessão (em hash),
 *   como o do comprador; a aprovação é da plataforma e exige o número já
 *   provado. Trocar o número zera as duas marcas. Sem aprovação, a rifa
 *   não publica (`publishBlockers`).
 * - **Denúncia**: só a plataforma vê e decide (403 para organizador — a
 *   denunciada nunca lê quem a denunciou). Uma aberta por pessoa e
 *   organização (índice parcial); a automática não repete o mesmo trecho.
 * - **Decidir é `UPDATE` condicional** (`status = 'aberta'`): dois cliques,
 *   uma decisão. Travar para as vendas na hora (`createOrder` recusa);
 *   banir fecha a porta de todos da organização e trava todas as rifas.
 */
import { randomInt } from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, comentarios, denuncias, organizations } from "@shared/schema";
import {
  DENUNCIAS_POR_DIA,
  DENUNCIA_TEXTO_MAX,
  MOTIVOS_DE_DENUNCIA,
  motivoValido,
  pedePagamentoPorFora,
  type StatusDenuncia,
} from "@shared/seguranca";
import { normalizePhone } from "@shared/format";
import { nomeRealPublico } from "@shared/perfilApostador";
import { hashCodigo, verifyPassword } from "../auth";
import { isUniqueViolation } from "../pgError";
import { notify, notificationProvider } from "../notifications";
import { guardOtp, hit, identify } from "./antifraude";
import { orgOf } from "./orgs";

export class SegurancaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SegurancaError";
  }
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_TENTATIVAS = 5;

/** A organização no recorte de quem pede: a do vizinho é 404. */
function noRecorte(req: Request, orgId: string) {
  const org = orgOf(req);
  if (org && org !== orgId) throw new SegurancaError("Organização não encontrada.", 404);
}

/* ------------------------------------------------------------------ *
 * Telefone do organizador
 * ------------------------------------------------------------------ */

export async function estadoDoTelefone(req: Request, orgId: string) {
  noRecorte(req, orgId);
  const [o] = await db
    .select({
      telefone: organizations.telefoneOrganizador,
      confirmadoEm: organizations.telefoneConfirmadoEm,
      aprovadoEm: organizations.telefoneAprovadoEm,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!o) throw new SegurancaError("Organização não encontrada.", 404);
  return o;
}

/**
 * Manda o código para o número. Número novo zera "confirmado" e "aprovado"
 * no mesmo `UPDATE` — é assim que trocar o telefone não herda a aprovação
 * do número antigo.
 */
export async function pedirCodigoDoTelefone(req: Request, orgId: string, telefone: unknown) {
  noRecorte(req, orgId);
  const phone = normalizePhone(String(telefone ?? ""));
  if (phone.length < 10 || phone.length > 11) throw new SegurancaError("Informe o WhatsApp com DDD.");
  const veredito = await guardOtp(phone, identify(req));
  if (!veredito.allowed) throw new SegurancaError(veredito.reason ?? "Muitas tentativas. Espere um pouco.", 429);

  await db
    .update(organizations)
    .set({ telefoneOrganizador: phone, telefoneConfirmadoEm: null, telefoneAprovadoEm: null, telefoneAprovadoPor: null })
    .where(
      and(
        eq(organizations.id, orgId),
        sql`${organizations.telefoneOrganizador} is distinct from ${phone}`,
      ),
    );

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  req.session.otpOrganizador = {
    orgId,
    phone,
    codeHash: await hashCodigo(codigo),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };
  await notify({
    to: phone,
    template: "codigo_acesso",
    params: { codigo },
    dedupeKey: `otp-org:${orgId}:${Date.now()}`,
  });
  // Sem WhatsApp configurado (desenvolvimento), o código volta na resposta.
  const eco =
    notificationProvider().name === "console" && process.env.NODE_ENV !== "production" ? { devCode: codigo } : {};
  return { enviado: true, ...eco };
}

export async function confirmarTelefone(req: Request, orgId: string, codigo: unknown) {
  noRecorte(req, orgId);
  const otp = req.session.otpOrganizador;
  if (!otp || otp.orgId !== orgId) throw new SegurancaError("Peça um código novo.");
  if (Date.now() > otp.expiresAt || otp.attempts >= OTP_MAX_TENTATIVAS) {
    delete req.session.otpOrganizador;
    throw new SegurancaError("Código expirado. Peça um novo.");
  }
  otp.attempts += 1;
  if (!(await verifyPassword(String(codigo ?? "").trim(), otp.codeHash))) {
    throw new SegurancaError("Código incorreto.", 401);
  }
  delete req.session.otpOrganizador;
  // Só confirma o número que recebeu o código (se trocaram no meio, não vale).
  const r = await db
    .update(organizations)
    .set({ telefoneConfirmadoEm: new Date() })
    .where(and(eq(organizations.id, orgId), eq(organizations.telefoneOrganizador, otp.phone)))
    .returning({ id: organizations.id });
  if (!r.length) throw new SegurancaError("O número mudou. Peça um código novo.", 409);
  return estadoDoTelefone(req, orgId);
}

/** A plataforma aprova o número já provado (403 para organizador). */
export async function aprovarTelefone(req: Request, orgId: string) {
  const r = await db
    .update(organizations)
    .set({ telefoneAprovadoEm: new Date(), telefoneAprovadoPor: req.user!.id })
    .where(
      and(
        eq(organizations.id, orgId),
        sql`${organizations.telefoneConfirmadoEm} is not null`,
        isNull(organizations.telefoneAprovadoEm),
      ),
    )
    .returning({ id: organizations.id });
  if (!r.length) {
    throw new SegurancaError("Só dá para aprovar telefone já confirmado pelo código e ainda não aprovado.", 422);
  }
  return estadoDoTelefone(req, orgId);
}

/* ------------------------------------------------------------------ *
 * Denúncias
 * ------------------------------------------------------------------ */

const protocolo = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replace(/-/g, "");
  return `DN-${d}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
};

/** Contra quem: a organização sai da rifa, do comentário ou do perfil. */
async function alvoDaDenuncia(entrada: { rifa?: unknown; comentario?: unknown; organizacao?: unknown }) {
  if (entrada.comentario) {
    const id = String(entrada.comentario);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SegurancaError("Comentário não encontrado.", 404);
    const [c] = await db
      .select({ org: comentarios.organizationId, campanha: comentarios.campaignId })
      .from(comentarios)
      .where(eq(comentarios.id, id));
    if (!c) throw new SegurancaError("Comentário não encontrado.", 404);
    return { organizationId: c.org, campaignId: c.campanha, comentarioId: id };
  }
  if (entrada.rifa) {
    const [c] = await db
      .select({ id: campaigns.id, org: campaigns.organizationId, status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.slug, String(entrada.rifa)));
    if (!c || c.status === "draft") throw new SegurancaError("Rifa não encontrada.", 404);
    return { organizationId: c.org, campaignId: c.id, comentarioId: null };
  }
  if (entrada.organizacao) {
    const [o] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, String(entrada.organizacao)));
    if (!o) throw new SegurancaError("Organização não encontrada.", 404);
    return { organizationId: o.id, campaignId: null, comentarioId: null };
  }
  throw new SegurancaError("Diga o que você está denunciando.");
}

/** O apostador (com conta) denuncia. Erro de preenchimento sai antes de contar. */
export async function denunciar(
  req: Request,
  entrada: { rifa?: unknown; comentario?: unknown; organizacao?: unknown; motivo?: unknown; texto?: unknown },
) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new SegurancaError("Entre na sua conta para denunciar.", 401);
  if (!motivoValido(entrada.motivo)) throw new SegurancaError("Escolha o motivo da denúncia.");
  const texto = String(entrada.texto ?? "").trim().slice(0, DENUNCIA_TEXTO_MAX) || null;
  const alvo = await alvoDaDenuncia(entrada);
  const limite = await hit(`denuncia:${buyerId}`, 24 * 60, DENUNCIAS_POR_DIA);
  if (limite.excedeu) throw new SegurancaError("Muitas denúncias hoje. Tente amanhã.", 429);

  for (let i = 0; i < 5; i++) {
    try {
      const [d] = await db
        .insert(denuncias)
        .values({ ...alvo, protocolo: protocolo(), origem: "apostador", buyerId, motivo: entrada.motivo, texto })
        .returning({ protocolo: denuncias.protocolo });
      return d;
    } catch (err) {
      if (isUniqueViolation(err, "uq_denuncia_aberta_por_pessoa")) {
        throw new SegurancaError("Você já tem uma denúncia em análise contra esta organização. A plataforma vai olhar.", 409);
      }
      if (!isUniqueViolation(err, "uq_denuncia_protocolo")) throw err;
    }
  }
  throw new SegurancaError("Não consegui registrar. Tente de novo.", 500);
}

/**
 * Varre texto que o próprio organizador escreveu. Se pede pagamento por
 * fora, vira denúncia automática — sem barrar o que ele fez (quem decide é
 * a plataforma) e sem nunca derrubar o fluxo: falha aqui só vai ao log.
 */
export async function varrerTextoDoOrganizador(dados: {
  organizationId: string;
  campaignId?: string | null;
  comentarioId?: string | null;
  onde: string;
  texto: string | null | undefined;
}) {
  try {
    const trecho = dados.texto ? pedePagamentoPorFora(dados.texto) : null;
    if (!trecho) return null;
    // A mesma evidência, aberta, não repete (o organizador salva a bio duas vezes).
    const [ja] = await db
      .select({ id: denuncias.id })
      .from(denuncias)
      .where(
        and(
          eq(denuncias.organizationId, dados.organizationId),
          eq(denuncias.origem, "automatica"),
          eq(denuncias.status, "aberta"),
          eq(denuncias.evidencia, `${dados.onde}: "${trecho}"`),
        ),
      );
    if (ja) return null;
    const [d] = await db
      .insert(denuncias)
      .values({
        protocolo: protocolo(),
        organizationId: dados.organizationId,
        campaignId: dados.campaignId ?? null,
        comentarioId: dados.comentarioId ?? null,
        origem: "automatica",
        motivo: "pix_fora",
        texto: dados.texto!.slice(0, DENUNCIA_TEXTO_MAX),
        evidencia: `${dados.onde}: "${trecho}"`,
      })
      .returning({ protocolo: denuncias.protocolo });
    return d;
  } catch (err) {
    console.error("[seguranca] varredura:", (err as Error).message);
    return null;
  }
}

export async function listarDenuncias(status?: string) {
  return db
    .select({
      id: denuncias.id,
      protocolo: denuncias.protocolo,
      origem: denuncias.origem,
      motivo: denuncias.motivo,
      status: denuncias.status,
      createdAt: denuncias.createdAt,
      organizacao: organizations.name,
      rifa: campaigns.title,
    })
    .from(denuncias)
    .innerJoin(organizations, eq(organizations.id, denuncias.organizationId))
    .leftJoin(campaigns, eq(campaigns.id, denuncias.campaignId))
    .where(status ? eq(denuncias.status, status as StatusDenuncia) : undefined)
    .orderBy(desc(denuncias.createdAt))
    .limit(200);
}

export async function denunciasAbertas() {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM denuncias WHERE status = 'aberta'`);
  return (r.rows[0] as { n: number }).n;
}

export async function detalheDaDenuncia(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SegurancaError("Denúncia não encontrada.", 404);
  const [d] = await db
    .select({
      denuncia: denuncias,
      org: { nome: organizations.name, slug: organizations.slug, telefone: organizations.telefoneOrganizador, banidaEm: organizations.banidaEm },
      rifa: { titulo: campaigns.title, slug: campaigns.slug, travadaEm: campaigns.travadaEm },
      quem: { apelido: buyers.apelido, nome: buyers.name },
    })
    .from(denuncias)
    .innerJoin(organizations, eq(organizations.id, denuncias.organizationId))
    .leftJoin(campaigns, eq(campaigns.id, denuncias.campaignId))
    .leftJoin(buyers, eq(buyers.id, denuncias.buyerId))
    .where(eq(denuncias.id, id));
  if (!d) throw new SegurancaError("Denúncia não encontrada.", 404);
  const [c] = d.denuncia.comentarioId
    ? await db.select({ texto: comentarios.texto }).from(comentarios).where(eq(comentarios.id, d.denuncia.comentarioId))
    : [];
  return {
    ...d.denuncia,
    motivoTexto: MOTIVOS_DE_DENUNCIA[d.denuncia.motivo as keyof typeof MOTIVOS_DE_DENUNCIA] ?? d.denuncia.motivo,
    organizacao: d.org,
    rifa: d.rifa?.slug ? d.rifa : null,
    comentario: c?.texto ?? null,
    quem: d.quem?.nome ? { apelido: d.quem.apelido, nomeReal: nomeRealPublico(d.quem.nome) } : null,
  };
}

/**
 * A palavra da plataforma: improcedente, travar a rifa ou banir a
 * organização. Tudo na mesma transação que encerra a denúncia.
 */
export async function decidirDenuncia(req: Request, id: string, entrada: { acao?: unknown; resposta?: unknown }) {
  const acao = String(entrada.acao ?? "");
  if (!["improcedente", "travar", "banir"].includes(acao)) throw new SegurancaError("Escolha a decisão.");
  const resposta = String(entrada.resposta ?? "").trim().slice(0, 1000);
  if (acao !== "improcedente" && resposta.length < 10) {
    throw new SegurancaError("Explique o motivo (fica registrado na rifa ou na organização).");
  }
  const d = await detalheDaDenuncia(id);
  const status: StatusDenuncia = acao === "travar" ? "rifa_travada" : acao === "banir" ? "organizacao_banida" : "improcedente";
  if (acao === "travar" && !d.campaignId) throw new SegurancaError("Esta denúncia não é de uma rifa: bana a organização ou recuse.");

  await db.transaction(async (tx) => {
    const r = await tx
      .update(denuncias)
      .set({ status, decisao: resposta || null, decididaPor: req.user!.id, decididaEm: new Date() })
      .where(and(eq(denuncias.id, id), eq(denuncias.status, "aberta")))
      .returning({ id: denuncias.id });
    if (!r.length) throw new SegurancaError("Esta denúncia já foi decidida.", 409);
    const agora = new Date();
    if (acao === "travar") {
      await tx
        .update(campaigns)
        .set({ travadaEm: agora, travadaMotivo: resposta })
        .where(and(eq(campaigns.id, d.campaignId!), isNull(campaigns.travadaEm)));
    }
    if (acao === "banir") {
      await tx
        .update(organizations)
        .set({ banidaEm: agora, banidaMotivo: resposta, active: false })
        .where(eq(organizations.id, d.organizationId));
      // Todas as rifas da banida param de vender na hora.
      await tx
        .update(campaigns)
        .set({ travadaEm: agora, travadaMotivo: `Organização banida: ${resposta}` })
        .where(
          and(
            eq(campaigns.organizationId, d.organizationId),
            inArray(campaigns.status, ["published", "closed"]),
            isNull(campaigns.travadaEm),
          ),
        );
    }
  });
  return { status };
}

/** Destravar: só a plataforma, e nunca rifa de organização banida. */
export async function destravarRifa(campaignId: string) {
  const r = await db.execute(sql`
    UPDATE campaigns SET travada_em = NULL, travada_motivo = NULL
     WHERE id = ${campaignId}::uuid AND travada_em IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = campaigns.organization_id AND o.banida_em IS NOT NULL)
    RETURNING id
  `);
  if (!r.rows.length) throw new SegurancaError("A rifa não está travada, ou a organização está banida.", 422);
  return { ok: true };
}
