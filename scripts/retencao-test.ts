/**
 * Prova da retenção cautelar de saldo (`shared/retencao.ts`), pela API de
 * verdade:
 *
 * - só a plataforma vê, retém, libera e abate (403 para organizador);
 * - motivo obrigatório; uma retenção ativa por organização (409);
 * - retido: o reembolso do saldo não é aprovado nem recebe baixa (409) e o
 *   acerto recebe as taxas mas não repassa o crédito do presente;
 * - abater: nunca mais que o saldo; tira pelo livro e marca o presente
 *   como abatido; dois cliques, uma decisão (200 e 409);
 * - banir cria a retenção na mesma transação, com o retrato dos valores;
 *   liberar devolve tudo ao normal;
 * - a Caixa de entrada mostra a retenção ativa; tudo vai à auditoria.
 *
 *   npm run retencao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { baseUrl } from "./base-url";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  auditLog,
  denuncias,
  organizations,
  patrocinioLancamentos,
  patrocinioReembolsos,
  platformCharges,
  presenteCreditos,
  retencoesCautelares,
  users,
} from "../shared/schema";
import { hashPassword } from "../server/auth";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUG = "retencao-teste";
const EMAIL = "org@retencao-teste.br";
const SENHA = "retencao-teste-1";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'login%'`);
  const org = sql`(select id from organizations where slug = ${SLUG})`;
  await db.execute(sql`delete from audit_log where entity = 'organization' and entity_id in (select id::text from organizations where slug = ${SLUG})`);
  await db.execute(sql`delete from retencoes_cautelares where organization_id in ${org}`);
  await db.execute(sql`delete from denuncias where organization_id in ${org}`);
  await db.execute(sql`delete from presente_creditos where organization_id in ${org}`);
  await db.execute(sql`delete from platform_charges where organization_id in ${org}`);
  await db.execute(sql`delete from patrocinio_reembolsos where organization_id in ${org}`);
  await db.execute(sql`delete from patrocinio_lancamentos where organization_id in ${org}`);
  await db.execute(sql`delete from users where email = ${EMAIL}`);
  await db.execute(sql`delete from organizations where slug = ${SLUG}`);
}

async function main() {
  console.log("\n=== retenção cautelar de saldo ===\n");
  await limpar();

  const [org] = await db
    .insert(organizations)
    .values({ slug: SLUG, name: "Retenção Teste", cidade: "Recife", uf: "PE", patrocinioSaldoCents: 10_000 })
    .returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Retenção", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const novoCredito = (cents: number) => db.insert(presenteCreditos).values({ organizationId: org.id, orderId: randomUUID(), amountCents: cents }).returning();
  await novoCredito(500);
  await novoCredito(700);
  const [aprovado] = await db
    .insert(patrocinioReembolsos)
    .values({ organizationId: org.id, protocolo: `PR-RT${Date.now() % 10000}`, status: "aprovado", valorCents: 2000, devolverCents: 2000, chavePix: "chave@teste.br", motivo: "pedido de teste" })
    .returning();
  const [aberto] = await db
    .insert(patrocinioReembolsos)
    .values({ organizationId: org.id, protocolo: `PR-RU${Date.now() % 10000}`, status: "aberto", valorCents: 1000, chavePix: "chave@teste.br", motivo: "outro pedido" })
    .returning();
  await db.insert(platformCharges).values({ organizationId: org.id, kind: "mensalidade", competencia: "2026-09", amountCents: 3000, status: "aberta" } as never);

  const organizador = new Cliente();
  let r = await organizador.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
  if (r.status !== 200) throw new Error(`login do organizador: HTTP ${r.status}`);
  const admin = new Cliente();
  r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);

  try {
    // Só a plataforma.
    r = await organizador.req("GET", "/api/admin/retencoes");
    checa("organizador não lista retenções (403)", r.status === 403, `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/retencao`, { motivo: "tentando me reter" });
    checa("organizador não retém (403)", r.status === 403, `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/retencoes/${randomUUID()}/liberar`, { motivo: "quero meu dinheiro" });
    checa("organizador não libera (403)", r.status === 403, `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/retencoes/${randomUUID()}/abater`, { patrocinioCents: 1, motivo: "quero abater sozinho" });
    checa("organizador não abate (403)", r.status === 403, `HTTP ${r.status}`);

    // Reter sem banir.
    r = await admin.req("POST", `/api/admin/organizacoes/${org.id}/retencao`, { motivo: "curto" });
    checa("motivo curto é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    const [x, y] = await Promise.all([
      admin.req("POST", `/api/admin/organizacoes/${org.id}/retencao`, { motivo: "Suspeita de Pix por fora em apuração" }),
      admin.req("POST", `/api/admin/organizacoes/${org.id}/retencao`, { motivo: "Suspeita de Pix por fora em apuração" }),
    ]);
    checa("duas retenções ao mesmo tempo: uma 201 e uma 409", [x.status, y.status].sort().join() === "201,409", `${x.status} ${y.status}`);
    const ret1 = (x.status === 201 ? x : y).json;
    checa(
      "o retrato traz os três saldos",
      ret1?.patrocinioCents === 10_000 && ret1?.presenteCents === 1200 && ret1?.reembolsoCents === 2000,
      JSON.stringify({ p: ret1?.patrocinioCents, pr: ret1?.presenteCents, rb: ret1?.reembolsoCents }),
    );

    // Retido: nada sai.
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`);
    checa("reembolso aprovado não recebe baixa (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${aberto.id}/decisao`, { aprovar: true, retidoCents: 0, explicacao: "aprovado para devolver" });
    checa("reembolso aberto não é aprovado (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/baixa`);
    const creditos = await db.select({ s: presenteCreditos.status }).from(presenteCreditos).where(eq(presenteCreditos.organizationId, org.id));
    const [taxa] = await db.select({ s: platformCharges.status }).from(platformCharges).where(eq(platformCharges.organizationId, org.id));
    checa("o acerto recebe a taxa e segura o presente", r.status === 200 && taxa.s === "paga" && creditos.every((c) => c.s === "devido"), `${taxa.s} ${creditos.map((c) => c.s)}`);

    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    const naCaixa = (r.json?.pendencias ?? r.json ?? []).some?.((p: any) => p.chave === `retencao:${ret1.id}`);
    checa("a Caixa de entrada mostra o saldo retido", Boolean(naCaixa));
    r = await admin.req("GET", "/api/admin/retencoes");
    const naLista = (r.json ?? []).find((l: any) => l.id === ret1.id);
    checa("a lista traz o valor de agora", naLista?.agora?.presenteCents === 1200 && naLista?.agora?.patrocinioCents === 10_000);

    // Abater.
    r = await admin.req("POST", `/api/admin/retencoes/${ret1.id}/abater`, { patrocinioCents: 10_001, motivo: "cobrir a condenação do processo" });
    checa("abater mais que o saldo é recusado (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/retencoes/${ret1.id}/abater`, { patrocinioCents: 0, motivo: "cobrir a condenação do processo" });
    checa("abater nada é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    const corpo = { patrocinioCents: 3000, presente: true, motivo: "cobrir a condenação do processo" };
    const [a1, a2] = await Promise.all([
      admin.req("POST", `/api/admin/retencoes/${ret1.id}/abater`, corpo),
      admin.req("POST", `/api/admin/retencoes/${ret1.id}/abater`, corpo),
    ]);
    checa("abater duas vezes ao mesmo tempo: 200 e 409", [a1.status, a2.status].sort().join() === "200,409", `${a1.status} ${a2.status}`);
    const [o1] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, org.id));
    const livro = await db.select().from(patrocinioLancamentos).where(eq(patrocinioLancamentos.chave, `retencao-abate:${ret1.id}`));
    const depois = await db.select({ s: presenteCreditos.status }).from(presenteCreditos).where(eq(presenteCreditos.organizationId, org.id));
    const [fim1] = await db.select().from(retencoesCautelares).where(eq(retencoesCautelares.id, ret1.id));
    checa("o saldo cai pelo livro, uma vez", o1.s === 7000 && livro.length === 1 && livro[0].valorCents === -3000, `saldo ${o1.s}, livro ${livro.length}`);
    checa("o presente vira abatido", depois.every((c) => c.s === "abatido"));
    checa("a retenção termina abatida, com o total", fim1.status === "abatida" && fim1.abatidoCents === 4200, `${fim1.status} ${fim1.abatidoCents}`);
    r = await admin.req("POST", `/api/admin/retencoes/${ret1.id}/liberar`, { motivo: "liberar depois de abatida" });
    checa("decidida não se decide de novo (409)", r.status === 409, `HTTP ${r.status}`);

    // Banir cria a retenção na mesma transação.
    await novoCredito(900);
    const [den] = await db
      .insert(denuncias)
      .values({ protocolo: `DN-RT${Date.now() % 100000}`, organizationId: org.id, origem: "automatica", motivo: "pix_por_fora", evidencia: "teste" })
      .returning();
    r = await admin.req("POST", `/api/admin/denuncias/${den.id}/decidir`, { acao: "banir", resposta: "Pix fora da plataforma confirmado" });
    checa("banir a organização", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [ret2] = await db
      .select()
      .from(retencoesCautelares)
      .where(and(eq(retencoesCautelares.organizationId, org.id), eq(retencoesCautelares.status, "ativa")));
    checa(
      "o banimento retém o saldo, com o retrato",
      ret2?.origem === "banimento" && ret2.denunciaId === den.id && ret2.patrocinioCents === 7000 && ret2.presenteCents === 900 && ret2.reembolsoCents === 2000,
      JSON.stringify(ret2 ?? null),
    );
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`);
    checa("banida: o reembolso aprovado segue sem baixa (409)", r.status === 409, `HTTP ${r.status}`);

    // Liberar.
    r = await organizador.req("POST", `/api/admin/retencoes/${ret2.id}/liberar`, { motivo: "quero meu dinheiro" });
    // Banida, a sessão dele já fecha (401); antes de banir seria 403 — os dois barram.
    checa("o organizador não libera (401 banido)", r.status === 401, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/retencoes/${ret2.id}/liberar`, { motivo: "Sem passivo depois de 90 dias" });
    checa("a plataforma libera", r.status === 200 && r.json?.status === "liberada", `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/patrocinio/reembolsos/${aprovado.id}/pago`);
    checa("liberada: o reembolso recebe baixa", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/cobranca/${org.id}/baixa`);
    const [credito] = await db.select({ s: presenteCreditos.status }).from(presenteCreditos).where(and(eq(presenteCreditos.organizationId, org.id), eq(presenteCreditos.amountCents, 900)));
    checa("liberada: o acerto repassa o presente", credito.s === "pago", credito.s);

    const acoes = (await db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, org.id))).map((l) => l.a);
    checa(
      "tudo na auditoria",
      acoes.filter((a) => a === "retencao.criar").length === 2 && acoes.includes("retencao.abater") && acoes.includes("retencao.liberar"),
      acoes.join(","),
    );
  } finally {
    await limpar();
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
