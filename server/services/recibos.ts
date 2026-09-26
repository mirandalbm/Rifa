/**
 * Recibo de cada saque pago. Emitido na **mesma transação** que dá baixa no
 * saque: baixa sem recibo, ou recibo de saque que não foi pago, não existem.
 *
 * O recibo guarda o retrato (`snapshot`), o SHA-256 do texto canônico e a
 * assinatura da plataforma (HMAC, chave do cofre). O PDF é gerado dele a
 * cada download e leva o código e o QR da conferência pública — que refaz o
 * hash e a assinatura e diz se o recibo é autêntico, sem mostrar o CPF.
 */
import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { db } from "../db";
import { affiliates, organizations, payouts, recibos, users } from "@shared/schema";
import { canonico, codigoDeRecibo, reciboFecha, type ReciboSnapshot } from "@shared/fiscal";
import { formatBRL, maskCpf } from "@shared/format";
import { assinar, assinaturaConfere, sha256 } from "./cofre";
import { identificacaoParaRecibo } from "./fiscal";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ReciboError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ReciboError";
  }
}

/** Emite o recibo do saque (dentro da transação que dá baixa nele). */
export async function emitirRecibo(tx: Tx, payoutId: string) {
  const [p] = await tx
    .select({
      payout: payouts,
      codigoAfiliado: affiliates.code,
      nomeDaConta: users.name,
      orgNome: organizations.name,
      orgCnpj: organizations.cnpj,
    })
    .from(payouts)
    .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
    .innerJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(organizations, eq(organizations.id, payouts.organizationId))
    .where(eq(payouts.id, payoutId));
  if (!p) throw new ReciboError("Saque não encontrado.", 404);

  const origem = await tx.execute(sql`
    select c.title as rifa, count(*)::int as pedidos, sum(k.amount_cents)::int as comissao
      from commissions k join campaigns c on c.id = k.campaign_id
     where k.payout_id = ${payoutId}::uuid
     group by c.title
     order by c.title`);
  const id = await identificacaoParaRecibo(p.payout.affiliateId);

  const snapshot: ReciboSnapshot = {
    codigo: codigoDeRecibo(randomInt),
    emitidoEm: new Date().toISOString(),
    pagador: { nome: p.orgNome ?? "Plataforma", cnpj: p.orgCnpj ?? null },
    beneficiario: { nome: id?.nome ?? p.nomeDaConta, cpf: id?.cpf ?? null, codigoAfiliado: p.codigoAfiliado },
    valorCents: p.payout.amountCents,
    pagamento: { forma: "pix", destino: p.payout.pixKey },
    origem: (origem.rows as { rifa: string; pedidos: number; comissao: number }[]).map((o) => ({
      rifa: o.rifa,
      pedidos: Number(o.pedidos),
      comissaoCents: Number(o.comissao),
    })),
  };
  // Recibo que não fecha não sai: o valor do saque é a soma das comissões.
  if (!reciboFecha(snapshot)) throw new ReciboError("A soma das comissões não bate com o valor do saque.", 409);

  const texto = canonico(snapshot);
  const [novo] = await tx
    .insert(recibos)
    .values({
      codigo: snapshot.codigo,
      payoutId,
      organizationId: p.payout.organizationId,
      affiliateId: p.payout.affiliateId,
      snapshot,
      hash: sha256(texto),
      assinatura: assinar(texto),
    })
    .returning({ codigo: recibos.codigo });
  return novo.codigo;
}

export async function reciboPorCodigo(codigo: string) {
  const [r] = await db.select().from(recibos).where(eq(recibos.codigo, codigo.toUpperCase()));
  return r ?? null;
}

/** Autêntico: o hash bate com o texto e a assinatura é da plataforma. */
export function reciboAutentico(r: { snapshot: unknown; hash: string; assinatura: string }) {
  const texto = canonico(r.snapshot as ReciboSnapshot);
  return sha256(texto) === r.hash && assinaturaConfere(texto, r.assinatura);
}

/** A conferência pública: sem CPF, sem chave Pix — só o que prova o recibo. */
export async function conferirRecibo(codigo: string) {
  const r = await reciboPorCodigo(codigo);
  if (!r) throw new ReciboError("Recibo não encontrado.", 404);
  const s = r.snapshot as ReciboSnapshot;
  return {
    codigo: s.codigo,
    autentico: reciboAutentico(r),
    emitidoEm: s.emitidoEm,
    pagador: s.pagador.nome,
    beneficiario: s.beneficiario.nome.split(" ")[0],
    valorCents: s.valorCents,
    hash: r.hash,
  };
}

/** O PDF do recibo, gerado do retrato guardado. */
export async function pdfDoRecibo(r: { snapshot: unknown; hash: string; assinatura: string }, urlDeConferencia: string): Promise<Buffer> {
  const s = r.snapshot as ReciboSnapshot;
  const qr = await QRCode.toBuffer(urlDeConferencia, { margin: 1, width: 180 });
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Recibo ${s.codigo}` } });
  const partes: Buffer[] = [];
  doc.on("data", (b: Buffer) => partes.push(b));
  const fim = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(partes))));

  const data = new Date(s.emitidoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  doc.font("Helvetica-Bold").fontSize(16).text("RECIBO DE PAGAMENTO DE COMISSÃO");
  doc.font("Helvetica").fontSize(10).fillColor("#555").text(`Recibo ${s.codigo} · emitido em ${data}`);
  doc.moveDown(1.2).fillColor("#000").fontSize(11);
  const cpf = s.beneficiario.cpf ? `, CPF ${maskCpf(s.beneficiario.cpf)}` : "";
  const cnpj = s.pagador.cnpj ? ` (CNPJ ${s.pagador.cnpj})` : "";
  doc.text(
    `Recebi de ${s.pagador.nome}${cnpj} a importância de ${formatBRL(s.valorCents)}, referente a comissão por divulgação de rifas (afiliado ${s.beneficiario.codigoAfiliado}), paga por Pix para a chave ${s.pagamento.destino}.`,
    { align: "justify" },
  );
  doc.moveDown(0.6).text(`Beneficiário: ${s.beneficiario.nome}${cpf}.`);

  doc.moveDown(1).font("Helvetica-Bold").text("Origem");
  doc.font("Helvetica").fontSize(10);
  for (const o of s.origem) {
    doc.text(`${o.rifa} — ${o.pedidos} venda(s)`, { continued: true }).text(`  ${formatBRL(o.comissaoCents)}`, { align: "right" });
  }
  doc.font("Helvetica-Bold").text(`Total  ${formatBRL(s.valorCents)}`, { align: "right" });

  doc.moveDown(2).font("Helvetica").fontSize(8).fillColor("#555");
  doc.text(`Confira a autenticidade em ${urlDeConferencia}`);
  doc.text(`SHA-256: ${r.hash}`);
  doc.text(`Assinatura da plataforma: ${r.assinatura}`);
  doc.image(qr, doc.page.width - 56 - 110, doc.y + 8, { width: 110 });
  doc.end();
  return fim;
}
