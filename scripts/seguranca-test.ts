/**
 * Prova da segurança contra organizador fraudulento, pela API de verdade:
 *
 * - telefone do organizador: sem código confirmado e aprovação da
 *   plataforma, a rifa não publica; trocar o número recomeça;
 * - denúncia do apostador (só com conta, uma aberta por organização) e a
 *   automática, quando o texto do organizador pede pagamento por fora;
 * - só a plataforma vê e decide (403 para organizador); dois cliques, uma
 *   decisão; travar para as vendas e tira da vitrine; banir fecha a porta e
 *   trava todas as rifas; destravar não vale para banida.
 *
 *   npm run seguranca      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, denuncias, organizations, users } from "../shared/schema";
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

const SLUG = "seguranca-teste";
const EMAIL = "org@seguranca-teste.br";
const SENHA = "seguranca-teste-1";
const TELEFONE_COMPRADOR = "11975550001";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'denuncia:%' or bucket like 'otp%' or bucket like 'cadastro:%' or bucket like 'comentario:%' or bucket like 'login%'`);
  const org = sql`(select id from organizations where slug = ${SLUG})`;
  await db.execute(sql`delete from denuncias where organization_id in ${org}`);
  await db.execute(sql`delete from comentarios where organization_id in ${org}`);
  await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${org})`);
  await db.execute(sql`delete from campaigns where organization_id in ${org}`);
  await db.execute(sql`delete from users where email = ${EMAIL}`);
  await db.execute(sql`delete from organizations where slug = ${SLUG}`);
  await db.execute(sql`delete from buyers where phone = ${TELEFONE_COMPRADOR}`);
}

async function main() {
  console.log("\n=== segurança do organizador ===\n");
  await limpar();

  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Segurança Teste", cidade: "Recife", uf: "PE" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Segurança", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const base = {
    organizationId: org.id,
    title: "Rifa segura",
    prizeTitle: "Moto",
    totalQuotas: 100,
    priceCents: 500,
    drawAt: new Date(Date.now() + 7 * 86_400_000),
    authorizationCode: "SPA-SEG-1",
  };
  const [rascunho] = await db.insert(campaigns).values({ ...base, slug: `${SLUG}-rascunho`, status: "draft" }).returning();
  const [noAr] = await db
    .insert(campaigns)
    .values({ ...base, slug: `${SLUG}-no-ar`, status: "published", publishedAt: new Date() })
    .returning();
  const [outra] = await db
    .insert(campaigns)
    .values({ ...base, slug: `${SLUG}-outra`, status: "published", publishedAt: new Date() })
    .returning();
  for (const c of [noAr, outra]) await db.insert(campaignStats).values({ campaignId: c.id });

  const organizador = new Cliente();
  let r = await organizador.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
  if (r.status !== 200) throw new Error(`login do organizador: HTTP ${r.status}`);
  const admin = new Cliente();
  r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const apostador = new Cliente();
  r = await apostador.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x",
    nome: "Paula Denuncia",
    telefone: TELEFONE_COMPRADOR,
    cpf: "39053344705",
    cep: "01310-100",
    senha: "senha-denuncia-1",
    lembrar: true,
  });
  if (r.status >= 300) throw new Error(`conta: HTTP ${r.status} ${r.json?.message}`);

  try {
    console.log("  telefone do organizador:");
    const bloqueios = async () =>
      ((await organizador.req("GET", `/api/admin/campaigns/${rascunho.id}/blockers`)).json?.blockers ?? []) as string[];
    const falaDoTelefone = (b: string[]) => b.some((x) => /telefone/i.test(x));
    checa("sem telefone aprovado, a rifa não publica", falaDoTelefone(await bloqueios()), (await bloqueios()).join(" | "));
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/telefone`, { telefone: "(81) 99888-7766" });
    const codigo = r.json?.devCode as string;
    checa("pedir o código (em desenvolvimento ele volta na resposta)", r.status === 200 && /^\d{6}$/.test(codigo ?? ""), `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/telefone/aprovar`);
    checa("o organizador não aprova o próprio telefone (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/${org.id}/telefone/aprovar`);
    checa("a plataforma não aprova número ainda não confirmado (422)", r.status === 422, `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/telefone/confirmar`, { codigo: codigo === "000000" ? "111111" : "000000" });
    checa("código errado: 401", r.status === 401, `HTTP ${r.status}`);
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/telefone/confirmar`, { codigo });
    checa("código certo confirma o número", r.status === 200 && Boolean(r.json?.confirmadoEm), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("confirmado ainda não basta para publicar", falaDoTelefone(await bloqueios()));
    r = await admin.req("POST", `/api/admin/organizacoes/${org.id}/telefone/aprovar`);
    checa("a plataforma aprova", r.status === 200 && Boolean(r.json?.aprovadoEm), `HTTP ${r.status}`);
    checa("aprovado: o telefone sai dos bloqueios da publicação", !falaDoTelefone(await bloqueios()), (await bloqueios()).join(" | "));
    r = await organizador.req("POST", `/api/admin/organizacoes/${org.id}/telefone`, { telefone: "(81) 91111-2222" });
    const [depois] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    checa("trocar o número zera confirmação e aprovação", !depois.telefoneConfirmadoEm && !depois.telefoneAprovadoEm);

    console.log("\n  denúncias:");
    r = await new Cliente().req("POST", "/api/public/denuncias", { rifa: noAr.slug, motivo: "pix_fora" });
    checa("sem conta não denuncia (401)", r.status === 401, `HTTP ${r.status}`);
    r = await apostador.req("POST", "/api/public/denuncias", { rifa: noAr.slug, motivo: "inventado" });
    checa("motivo desconhecido: 400", r.status === 400, `HTTP ${r.status}`);
    r = await apostador.req("POST", "/api/public/denuncias", { rifa: noAr.slug, motivo: "pix_fora", texto: "Me pediram Pix no WhatsApp" });
    checa("o apostador denuncia a rifa e recebe o protocolo", r.status === 201 && /^DN-\d{8}-\d{6}$/.test(r.json?.protocolo ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await apostador.req("POST", "/api/public/denuncias", { organizacao: SLUG, motivo: "golpe" });
    checa("uma denúncia aberta por pessoa e organização (409)", r.status === 409, `HTTP ${r.status}`);
    r = await organizador.req("GET", "/api/admin/denuncias");
    checa("a organização não vê denúncias (403)", r.status === 403, `HTTP ${r.status}`);

    // A organização pede Pix por fora num comentário: vira denúncia automática.
    r = await organizador.req("POST", `/api/public/campaigns/${noAr.slug}/comentarios`, { texto: "Quem quiser, me manda um pix que eu garanto o número" });
    checa("o comentário da organização entra (quem decide é a plataforma)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await new Promise((ok) => setTimeout(ok, 400));
    const automaticas = await db.select().from(denuncias).where(eq(denuncias.organizationId, org.id));
    const auto = automaticas.find((d) => d.origem === "automatica");
    checa("…e vira denúncia automática, com o trecho que acendeu",
      Boolean(auto) && /manda um pix/.test(auto?.evidencia ?? ""), auto?.evidencia ?? "nenhuma");

    console.log("\n  decisão:");
    const doApostador = automaticas.find((d) => d.origem === "apostador")!;
    r = await admin.req("POST", `/api/admin/denuncias/${doApostador.id}/decidir`, { acao: "travar", resposta: "curto" });
    checa("travar sem motivo de verdade: 400", r.status === 400, `HTTP ${r.status}`);
    const [d1, d2] = await Promise.all([
      admin.req("POST", `/api/admin/denuncias/${doApostador.id}/decidir`, { acao: "travar", resposta: "Pediu Pix fora da plataforma" }),
      admin.req("POST", `/api/admin/denuncias/${doApostador.id}/decidir`, { acao: "travar", resposta: "Pediu Pix fora da plataforma" }),
    ]);
    checa("dois cliques: uma decisão e um 409", [d1.status, d2.status].sort().join(",") === "200,409", `${d1.status},${d2.status}`);
    const [travada] = await db.select().from(campaigns).where(eq(campaigns.id, noAr.id));
    checa("a rifa fica travada, com o motivo", Boolean(travada.travadaEm) && travada.travadaMotivo === "Pediu Pix fora da plataforma");
    r = await apostador.req("POST", "/api/public/orders", { campaignId: noAr.id, quantity: 1, buyer: { name: "Paula Denuncia", phone: TELEFONE_COMPRADOR } });
    checa("rifa travada não vende (409)", r.status === 409 && /suspensas/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await new Cliente().req("GET", "/api/public/campaigns");
    const naVitrine = (r.json ?? []).map((c: any) => c.slug);
    checa("sai da vitrine; a outra rifa continua", !naVitrine.includes(noAr.slug) && naVitrine.includes(outra.slug));
    r = await new Cliente().req("GET", `/api/public/campaigns/${noAr.slug}`);
    checa("a página da rifa avisa que está travada", r.json?.campaign?.travada === true);
    r = await organizador.req("POST", `/api/admin/campaigns/${noAr.id}/destravar`);
    checa("o organizador não destrava (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${noAr.id}/destravar`);
    const [destravada] = await db.select({ t: campaigns.travadaEm }).from(campaigns).where(eq(campaigns.id, noAr.id));
    checa("a plataforma destrava", r.status === 200 && !destravada.t, `HTTP ${r.status}`);

    r = await admin.req("POST", `/api/admin/denuncias/${auto!.id}/decidir`, { acao: "banir", resposta: "Pix fora da plataforma confirmado" });
    checa("banir a organização", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const publicadas = (
      await db.select({ t: campaigns.travadaEm, s: campaigns.status }).from(campaigns).where(eq(campaigns.organizationId, org.id))
    ).filter((c) => c.s === "published");
    checa("banida: todas as rifas publicadas travam", publicadas.length === 2 && publicadas.every((c) => Boolean(c.t)));
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
    checa("banida: o organizador não entra mais", r.status !== 200, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", `/api/public/o/${SLUG}`);
    checa("banida: o perfil some (404)", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${outra.id}/destravar`);
    checa("rifa de organização banida não destrava (422)", r.status === 422, `HTTP ${r.status}`);
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
