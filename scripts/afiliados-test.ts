/**
 * Prova do afiliado de todas as organizações, pela API de verdade:
 *
 * - cadastro avulso (sem organização) e adesão pelo painel;
 * - **sem vínculo aprovado, o link não dá comissão** (antes dava na rifa de
 *   qualquer organização);
 * - termo por versão, fotografado na publicação: a rifa publicada com a v1
 *   paga a v1 só a quem aceitou a v1; aceite de versão velha é 409;
 * - cupom de uma organização não vale na rifa de outra;
 * - saque por organização (cada uma vê e paga só o dela);
 * - sair desfaz o vínculo sem apagar o que já ganhou;
 * - "Seja um colaborador" com um pedido em aberto por organização;
 * - recorte: a organização vizinha não vê nem mexe em nada disso;
 * - migração do afiliado antigo (organização no usuário) para vínculo.
 *
 *   npm run afiliados      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";
import { migrarAfiliadosAntigos } from "../server/services/afiliados";
import {
  affiliates,
  afiliadoVinculos,
  buyers,
  campaignMedia,
  campaignStats,
  campaigns,
  commissions,
  orders,
  organizations,
  users,
} from "../shared/schema";

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

const SLUGS = ["afiliados-teste-a", "afiliados-teste-b"];
const EMAILS = ["afiliados-org-a@teste.rifa", "afiliados-org-b@teste.rifa", "afiliado-avulso@teste.rifa", "afiliado-antigo@teste.rifa"];
const TEL_AFILIADO = "11944440000";
const TEL_COLAB = "11944449999";
const SENHA = "senha-afiliados-1";

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const lista = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from quota_alloc where campaign_id in ${lista}`);
      await db.execute(sql`delete from free_pool where campaign_id in ${lista}`);
      await db.execute(sql`delete from commissions where campaign_id in ${lista}`);
      await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in ${lista})`);
      await db.execute(sql`delete from draws where campaign_id in ${lista}`);
      await db.delete(orders).where(inArray(orders.campaignId, cs));
    }
    await db.execute(sql`delete from recibos where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from payouts where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from coupons where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from termo_aceites where termo_id in (select id from organizacao_termos where organization_id in ${sql.raw(`('${ids.join("','")}')`)})`);
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email in ${sql.raw(`('${EMAILS.join("','")}')`)})`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1194444%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'cadastro:%'`);
}

async function novaRifa(orgId: string, sufixo: string, status: "draft" | "published") {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `afiliados-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-AF-${sufixo}`,
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  if (status === "published") await db.insert(campaignStats).values({ campaignId: c.id });
  else {
    await db.insert(campaignMedia).values([
      { campaignId: c.id, role: "banner", storageKey: "x", mime: "image/webp", status: "ready" },
      { campaignId: c.id, role: "photo", storageKey: "y", mime: "image/webp", status: "ready" },
    ]);
  }
  return c;
}

let telefone = 11944441000;
/** Compra pelo link do afiliado, paga pela rota de desenvolvimento. */
async function compraPeloLink(campaignId: string, codigoAfiliado: string, cupom?: string) {
  const r = await new Cliente().req("POST", "/api/public/orders", {
    campaignId,
    quantity: 1,
    buyer: { name: "Comprador Teste", phone: String(telefone++) },
    affiliateCode: codigoAfiliado,
    ...(cupom ? { couponCode: cupom } : {}),
  });
  if (r.status !== 201) return { status: r.status, message: r.json?.message as string };
  await fetch(`${URL}/api/dev/pay/${r.json.code}`, { method: "POST" });
  const [o] = await db.select().from(orders).where(eq(orders.code, r.json.code));
  const [k] = await db.select().from(commissions).where(eq(commissions.orderId, o.id));
  return { status: 201, pedido: o, comissao: k ?? null };
}

async function main() {
  console.log("\n=== afiliado de todas as organizações ===\n");
  await limpar();

  const orgs: { id: string; slug: string }[] = [];
  const organizadores: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db.insert(organizations).values({ slug, name: `Afiliados ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    const c = new Cliente();
    const r = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (r.status !== 200) throw new Error(`login da organização ${i}: HTTP ${r.status}`);
    organizadores.push(c);
  }
  const [A, B] = orgs;
  const [orgA, orgB] = organizadores;
  const a1 = await novaRifa(A.id, "a1", "published");
  const b1 = await novaRifa(B.id, "b1", "published");

  try {
    // Cadastro avulso.
    const anon = new Cliente();
    let r = await anon.req("POST", "/api/public/afiliados/cadastro", { name: "Ana Divulga", email: EMAILS[2], phone: TEL_AFILIADO, password: SENHA });
    checa("cadastro avulso, sem organização", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigo = r.json?.code as string;
    const [conta] = await db.select().from(users).where(eq(users.email, EMAILS[2]));
    checa("a conta não tem organização", conta?.organizationId === null);
    const afiliada = new Cliente();
    r = await afiliada.req("POST", "/api/auth/login", { email: EMAILS[2], password: SENHA });
    checa("entra na hora (a aprovação é por organização)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.code, codigo));

    r = await afiliada.req("GET", "/api/affiliate/links");
    checa("sem vínculo, nenhuma rifa para divulgar", Array.isArray(r.json) && !r.json.some((l: any) => l.slug === a1.slug || l.slug === b1.slug));
    let v = await compraPeloLink(a1.id, codigo);
    checa("sem vínculo, o link não dá comissão (nem afiliado no pedido)", v.status === 201 && v.pedido?.affiliateId === null && v.comissao === null);

    // Adesão à A e aprovação.
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, {});
    checa("pede adesão à A", r.status === 200 && r.json?.status === "pendente", JSON.stringify(r.json));
    r = await orgB.req("GET", "/api/admin/affiliates");
    checa("a B não vê o pedido feito à A", !r.json?.some((x: any) => x.affiliate.id === aff.id));
    r = await orgB.req("PATCH", `/api/admin/affiliates/${aff.id}`, { status: "active" });
    checa("a B não aprova o vínculo com a A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/affiliates");
    checa("a A vê o pedido pendente", r.json?.some((x: any) => x.affiliate.id === aff.id && x.vinculo?.status === "pendente"));
    v = await compraPeloLink(a1.id, codigo);
    checa("pendente ainda não recebe", v.comissao === null);
    r = await orgA.req("PATCH", `/api/admin/affiliates/${aff.id}`, { status: "active" });
    checa("a A aprova", r.status === 200 && r.json?.status === "aprovado", `HTTP ${r.status}`);

    v = await compraPeloLink(a1.id, codigo);
    checa("aprovada: a rifa sem termo paga o padrão dela (10%)", v.comissao?.pct === 10, String(v.comissao?.pct));
    v = await compraPeloLink(b1.id, codigo);
    checa("na rifa da B, sem vínculo, nada", v.comissao === null && v.pedido?.affiliateId === null);

    // Termo v1 e a rifa publicada com ele.
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 12, textoExtra: "Sem spam em grupo." });
    checa("a A publica o termo v1 (12%)", r.status === 201 && r.json?.versao === 1, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgB.req("GET", "/api/admin/termo-afiliado");
    checa("o termo da A não aparece para a B", r.json?.termo === null);
    const a2 = await novaRifa(A.id, "a2", "draft");
    await publishCampaign(a2.id);
    const [a2pub] = await db.select().from(campaigns).where(eq(campaigns.id, a2.id));
    checa("a rifa publicada fotografa o termo em vigor", Boolean(a2pub.termoId));
    v = await compraPeloLink(a2.id, codigo);
    checa("sem aceitar o termo da rifa, não recebe", v.comissao === null);
    r = await afiliada.req("GET", "/api/affiliate/links");
    checa("o link aparece com o aviso de termo pendente", r.json?.some((l: any) => l.slug === a2.slug && l.termoPendente === true));
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: 1 });
    checa("aceita a v1 (continua aprovada)", r.status === 200 && r.json?.status === "aprovado", JSON.stringify(r.json));
    v = await compraPeloLink(a2.id, codigo);
    checa("com o aceite, a rifa paga o termo (12%)", v.comissao?.pct === 12, String(v.comissao?.pct));
    v = await compraPeloLink(a1.id, codigo);
    checa("e a rifa de antes do termo segue com o padrão dela (10%)", v.comissao?.pct === 10, String(v.comissao?.pct));

    // Versão nova não mexe na rifa em andamento.
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 15, textoExtra: "" });
    checa("a A publica a v2 (15%)", r.json?.versao === 2);
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: 1 });
    checa("aceitar olhando a versão velha: 409", r.status === 409, `HTTP ${r.status}`);
    v = await compraPeloLink(a2.id, codigo);
    checa("a rifa publicada com a v1 continua pagando a v1 (12%)", v.comissao?.pct === 12, String(v.comissao?.pct));
    const [aceite] = await db.execute(sql`select texto, versao from termo_aceites where versao = 1 limit 1`).then((x) => x.rows as { texto: string; versao: number }[]);
    checa("o aceite guarda a cópia do texto", Boolean(aceite?.texto?.includes("12% sobre o valor pago")));

    // Cupom da A na rifa da B.
    r = await orgA.req("POST", "/api/admin/coupons", { code: "AFTESTEA", discountPct: 5, affiliateId: aff.id });
    checa("a A cria cupom para a afiliada", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    v = await compraPeloLink(b1.id, codigo, "AFTESTEA");
    checa("cupom da A não vale na rifa da B", v.status === 400 && /não vale/.test(v.message ?? ""), v.message);
    r = await orgB.req("DELETE", `/api/admin/coupons/${(await db.execute(sql`select id from coupons where code = 'AFTESTEA'`)).rows[0]?.id}`);
    checa("a B não apaga o cupom da A (404)", r.status === 404, `HTTP ${r.status}`);

    // Saque por organização.
    await db.update(commissions).set({ status: "available" }).where(eq(commissions.affiliateId, aff.id));
    await afiliada.req("PATCH", "/api/affiliate/pix-key", { pixKey: "ana@exemplo.com" });
    r = await afiliada.req("GET", "/api/affiliate/saldo");
    const saldoA = r.json?.find((s: any) => s.organizacaoId === A.id);
    checa("saldo separado por organização", saldoA?.disponivelCents > 0 && !r.json?.some((s: any) => s.organizacaoId === B.id));
    r = await afiliada.req("POST", "/api/affiliate/payouts", { organizacaoId: A.id });
    checa("saque pedido à A", r.status === 201 && r.json?.organizationId === A.id && r.json?.amountCents === saldoA?.disponivelCents, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const saque = r.json?.id as string;
    r = await orgB.req("GET", "/api/admin/finance");
    checa("a B não vê o saque nem a comissão da A", !r.json?.payoutsRequested?.some((p: any) => p.id === saque) && !r.json?.perAffiliate?.some((p: any) => p.affiliateId === aff.id));
    r = await orgB.req("POST", `/api/admin/payouts/${saque}/paid`, {});
    checa("a B não dá baixa no saque da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/finance");
    checa("a A vê o saque dela", r.json?.payoutsRequested?.some((p: any) => p.id === saque));
    r = await orgA.req("POST", `/api/admin/payouts/${saque}/paid`, {});
    checa("e dá baixa", r.status === 200, `HTTP ${r.status}`);

    // Sair.
    r = await afiliada.req("DELETE", `/api/affiliate/organizacoes/${A.slug}`);
    checa("sai da A", r.status === 200);
    v = await compraPeloLink(a1.id, codigo);
    checa("depois de sair, o link não dá comissão", v.comissao === null);
    const [{ n: ganhas }] = await db.select({ n: sql<number>`count(*)::int` }).from(commissions).where(eq(commissions.affiliateId, aff.id));
    checa("o que já ganhou continua lá", ganhas >= 3, String(ganhas));

    // Seja um colaborador.
    const pessoa = new Cliente();
    r = await pessoa.req("POST", "/api/public/conta", { nome: "Bia Colaboradora", telefone: TEL_COLAB, cpf: "11144477735", cep: "01310-100", senha: SENHA, lembrar: true });
    if (r.status !== 201) throw new Error(`conta: HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await anon.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal" });
    checa("sem entrar, não pede (401)", r.status === 401, `HTTP ${r.status}`);
    r = await pessoa.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal", mensagem: "Vendo na feira." });
    checa("pede para ser colaboradora da A", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pessoa.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal" });
    checa("um pedido em aberto por organização (409)", r.status === 409, `HTTP ${r.status}`);
    r = await orgB.req("GET", "/api/admin/colaboradores/pedidos");
    const pedidoNaB = r.json?.find((p: any) => p.nome === "Bia Colaboradora");
    checa("a B não vê o pedido feito à A", !pedidoNaB);
    r = await orgA.req("GET", "/api/admin/colaboradores/pedidos");
    const pedido = r.json?.find((p: any) => p.nome === "Bia Colaboradora");
    checa("a A vê o pedido, com nome e WhatsApp", pedido?.telefone === TEL_COLAB && pedido?.cidade === "Natal");
    r = await orgB.req("POST", `/api/admin/colaboradores/pedidos/${pedido?.id}`, { status: "recusado" });
    checa("a B não decide o pedido da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/colaboradores/pedidos/${pedido?.id}`, { status: "atendido" });
    checa("a A atende", r.status === 200);

    // Afiliado antigo (organização no usuário) vira vínculo.
    const [antigo] = await db
      .insert(users)
      .values({ role: "affiliate", organizationId: B.id, name: "Antigo", email: EMAILS[3], passwordHash: await hashPassword(SENHA) })
      .returning();
    const [affAntigo] = await db.insert(affiliates).values({ userId: antigo.id, code: "AFANTIGO", status: "active" }).returning();
    await migrarAfiliadosAntigos();
    const [vAntigo] = await db
      .select()
      .from(afiliadoVinculos)
      .where(and(eq(afiliadoVinculos.affiliateId, affAntigo.id), eq(afiliadoVinculos.organizationId, B.id)));
    checa("o afiliado antigo ganha o vínculo aprovado com a organização dele", vAntigo?.status === "aprovado");
    v = await compraPeloLink(b1.id, "AFANTIGO");
    checa("e segue recebendo na rifa dela", v.comissao?.pct === 10, String(v.comissao?.pct));
    v = await compraPeloLink(a1.id, "AFANTIGO");
    checa("mas não na rifa de outra organização", v.comissao === null);
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
