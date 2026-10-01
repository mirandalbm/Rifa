/**
 * Prova do banner pago na vitrine, pela API de verdade: o produto nasce
 * desligado, só a plataforma liga e decide, o saldo anda pelo livro (uma
 * vez só, nunca negativo), um pedido em aberto por rifa mesmo ao mesmo
 * tempo, o recorte entre organizações (o do vizinho é 404), a vitrine só
 * mostra o que está no ar e a rifa que sai do ar leva o banner e devolve os
 * dias não usados. Devolve o estado de antes no fim.
 *
 *   npm run banner      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "../server/db";
import { bannerPedidos, campaignStats, campaigns, organizations, users } from "../shared/schema";
import { hashPassword } from "../server/auth";
import { encerrarBannersPagos } from "../server/services/bannerPago";
import { getPlataforma } from "../server/services/settings";

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
    return { status: r.status, tipo, json: tipo.includes("json") ? await r.json() : null };
  }
}

const VIZINHA = "banner-teste-vizinha";
const EMAIL_VIZINHA = "banner-vizinha@rifa.teste";
const SENHA_VIZINHA = "banner-vizinha-123";

async function arte() {
  const b = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#1d4ed8" } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${b.toString("base64")}`;
}

async function medir(caminho: string) {
  const r = await fetch(URL + caminho);
  if (r.status !== 200) return { status: r.status, tipo: "", largura: 0, altura: 0 };
  const m = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
  return { status: r.status, tipo: r.headers.get("content-type") ?? "", largura: m.width ?? 0, altura: m.height ?? 0 };
}

async function novaRifa(organizationId: string, slug: string, status: "published" | "draft" = "published") {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId,
      slug,
      title: `Rifa ${slug}`,
      prizeTitle: `Prêmio ${slug}`,
      totalQuotas: 500,
      priceCents: 300,
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 10 * 86_400_000),
      authorizationCode: "SPA-BANNER-1",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  return c;
}

async function saldoDe(orgId: string) {
  const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, orgId));
  return o.s;
}

async function limpar(orgIds: string[]) {
  await db.execute(sql`delete from banner_pedidos where organization_id in (select id from organizations where slug = ${VIZINHA}) or campaign_id in (select id from campaigns where slug like 'banner-teste-%')`);
  await db.execute(sql`delete from campaign_stats where campaign_id in (select id from campaigns where slug like 'banner-teste-%')`);
  await db.execute(sql`delete from campaigns where slug like 'banner-teste-%'`);
  await db.execute(sql`delete from users where email = ${EMAIL_VIZINHA}`);
  await db.execute(sql`delete from organizations where slug = ${VIZINHA}`);
  void orgIds;
}

async function main() {
  console.log("\n=== banner pago ===\n");
  const inicio = new Date();
  const configAntes = (await getPlataforma()).bannerPago;
  await limpar([]);

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const org = (await marina.req("GET", "/api/admin/organizer")).json;
  const saldoAntes = await saldoDe(org.organizacaoId);

  const [vizinha] = await db.insert(organizations).values({ slug: VIZINHA, name: "Vizinha do Banner", cidade: "Salvador", uf: "BA" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: vizinha.id, name: "Org Vizinha", email: EMAIL_VIZINHA, passwordHash: await hashPassword(SENHA_VIZINHA) });
  const rifaA = await novaRifa(org.organizacaoId, "banner-teste-a");
  const rifaB = await novaRifa(org.organizacaoId, "banner-teste-b");
  const rifaRascunho = await novaRifa(org.organizacaoId, "banner-teste-rascunho", "draft");
  const rifaVizinha = await novaRifa(vizinha.id, "banner-teste-vizinha");
  const vizinhaCli = new Cliente();
  r = await vizinhaCli.req("POST", "/api/auth/login", { email: EMAIL_VIZINHA, password: SENHA_VIZINHA });
  if (r.status !== 200) throw new Error(`login da vizinha: HTTP ${r.status}`);
  const anon = new Cliente();
  const imagem = await arte();
  const pedido = (cli: Cliente, campaignId: string, extra: Record<string, unknown> = {}) =>
    cli.req("POST", "/api/admin/banner-pago/pedidos", { campaignId, titulo: "Concorra à moto", imagem, dias: 3, ...extra });

  try {
    /* ---------------- desligado ---------------- */
    console.log("  — nasce desligado");
    await admin.req("PUT", "/api/admin/banner-pago/config", { ...configAntes, ligado: false });
    r = await marina.req("GET", "/api/admin/banner-pago");
    checa("desligado, a organização não vê o produto (404)", r.status === 404, `HTTP ${r.status}`);
    r = await pedido(marina, rifaA.id);
    checa("desligado, o pedido é 404", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/banner-pago");
    checa("a plataforma vê a tela para poder ligar", r.status === 200 && r.json?.config?.ligado === false, `HTTP ${r.status}`);

    /* ---------------- configuração ---------------- */
    console.log("  — configuração (só a plataforma)");
    r = await marina.req("PUT", "/api/admin/banner-pago/config", { ligado: true });
    checa("organizador não muda preço nem vagas (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/banner-pago/config", { ligado: true, precoDiaCents: 1000, diasMin: 1, diasMax: 5, vagas: 1, segundos: 5, golpe: "x" });
    checa("plataforma liga com preço, prazo e vagas", r.status === 200 && r.json?.precoDiaCents === 1000 && r.json?.ligado === true && !("golpe" in r.json), `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/banner-pago/config", { ligado: true, diasMin: 6, diasMax: 5 });
    checa("faixa de dias ao contrário é recusada", r.status === 400, r.json?.message);
    await admin.req("PUT", "/api/admin/banner-pago/config", { ligado: true, precoDiaCents: 1000, diasMin: 1, diasMax: 5, vagas: 1, segundos: 5 });

    // O saldo de partida: R$ 100,00 a mais que o de antes.
    r = await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: org.organizacaoId, valorCents: 10_000, descricao: "banner-teste: saldo de partida" });
    checa("a plataforma credita saldo para o teste", r.status === 200, `HTTP ${r.status}`);
    const base = saldoAntes + 10_000;

    /* ---------------- pedir ---------------- */
    console.log("  — pedir");
    r = await pedido(marina, rifaA.id, { dias: 99 });
    checa("dias fora da faixa: 400", r.status === 400, r.json?.message);
    r = await pedido(marina, rifaA.id, { titulo: "ab" });
    checa("título curto: 400", r.status === 400, r.json?.message);
    r = await pedido(marina, rifaA.id, { imagem: "data:text/html;base64,PHNjcmlwdD4=" });
    checa("arquivo que não é imagem: 400", r.status === 400, r.json?.message);
    r = await pedido(marina, rifaVizinha.id);
    checa("rifa do vizinho: 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedido(marina, rifaRascunho.id);
    checa("rascunho não tem banner (409)", r.status === 409, `HTTP ${r.status}`);
    r = await pedido(admin, rifaA.id);
    checa("a plataforma não compra pelo organizador (403)", r.status === 403, `HTTP ${r.status}`);
    r = await pedido(vizinhaCli, rifaVizinha.id);
    checa("sem saldo, nada fica (409)", r.status === 409 && /saldo/i.test(r.json?.message ?? ""), r.json?.message);
    const [{ n: semSaldo }] = await db.select({ n: sql<number>`count(*)::int` }).from(bannerPedidos).where(eq(bannerPedidos.organizationId, vizinha.id));
    checa("…nem o pedido sem saldo fica gravado", semSaldo === 0, `${semSaldo}`);
    checa("…e o saldo de quem não tem segue em zero", (await saldoDe(vizinha.id)) === 0);

    r = await pedido(marina, rifaA.id);
    const pA = r.json?.id as string;
    checa("pedido válido: 201, em análise", r.status === 201 && r.json?.status === "em_analise" && Boolean(pA), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("o saldo sai na hora (3 dias × R$ 10,00)", (await saldoDe(org.organizacaoId)) === base - 3000);
    r = await pedido(marina, rifaA.id);
    checa("segundo pedido na mesma rifa: 409", r.status === 409 && /em andamento/.test(r.json?.message ?? ""), r.json?.message);
    checa("…e o saldo não anda (a transação cai inteira)", (await saldoDe(org.organizacaoId)) === base - 3000);

    // Dois ao mesmo tempo na rifa B: o índice decide.
    const dois = await Promise.all([1, 2].map(() => pedido(marina, rifaB.id, { dias: 1 })));
    const codigos = dois.map((x) => x.status).sort();
    checa("dois pedidos ao mesmo tempo na mesma rifa: um 201 e um 409", codigos[0] === 201 && codigos[1] === 409, codigos.join(","));
    checa("…e o saldo foi debitado uma vez só", (await saldoDe(org.organizacaoId)) === base - 4000);
    const pB = dois.find((x) => x.status === 201)?.json?.id as string;

    /* ---------------- recorte ---------------- */
    console.log("  — recorte entre organizações");
    r = await vizinhaCli.req("GET", "/api/admin/banner-pago");
    checa("a vizinha não vê os pedidos da outra", r.status === 200 && !JSON.stringify(r.json).includes(pA) && r.json?.pedidos?.length === 0, JSON.stringify(r.json?.pedidos?.length));
    r = await vizinhaCli.req("GET", `/api/admin/banner-pago/pedidos/${pA}/imagem`);
    checa("a arte do pedido alheio é 404", r.status === 404, `HTTP ${r.status}`);
    r = await vizinhaCli.req("POST", `/api/admin/banner-pago/pedidos/${pA}/cancelar`);
    checa("cancelar pedido alheio é 404", r.status === 404, `HTTP ${r.status}`);
    r = await vizinhaCli.req("POST", `/api/admin/banner-pago/pedidos/${pA}/decisao`, { aprovar: true });
    checa("a vizinha não decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/banner-pago/pedidos/${pA}/decisao`, { aprovar: true });
    checa("a dona do pedido também não decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/banner-pago/pedidos/${pA}/imagem`);
    checa("a dona vê a própria arte", r.status === 200, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/banner-pago");
    checa("a plataforma vê os pedidos de todas, com o nome da organização", r.json?.pedidos?.some((p: any) => p.id === pA && p.organizacao), `HTTP ${r.status}`);
    r = await marina.req("GET", "/api/admin/banner-pago");
    checa("a organização vê o próprio saldo e não vê o nome das outras", r.json?.saldoCents === base - 4000 && r.json?.pedidos?.every((p: any) => p.organizacao === undefined));

    r = await anon.req("GET", "/api/public/banners");
    checa("em análise, não aparece na vitrine", !JSON.stringify(r.json).includes(pA));
    const publica = await medir(`/api/public/banners-pagos/${pA}/imagem`);
    checa("…nem a arte é pública", publica.status === 404, `HTTP ${publica.status}`);

    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa("a Caixa de entrada da plataforma lista o banner esperando", r.json?.some?.((p: any) => p.tipo === "banner" && p.chave === `banner:${pA}`) === true || r.json?.pendencias?.some?.((p: any) => p.chave === `banner:${pA}`) === true, `HTTP ${r.status}`);

    /* ---------------- recusar e cancelar ---------------- */
    console.log("  — recusar e cancelar devolvem o valor");
    r = await admin.req("POST", `/api/admin/banner-pago/pedidos/${pB}/decisao`, { aprovar: false });
    checa("recusar sem motivo é 400", r.status === 400, r.json?.message);
    const recusas = await Promise.all([1, 2].map(() => admin.req("POST", `/api/admin/banner-pago/pedidos/${pB}/decisao`, { aprovar: false, motivo: "A arte promete um prêmio que a rifa não tem." })));
    const sr = recusas.map((x) => x.status).sort();
    checa("dois cliques na recusa: uma decisão e um 409", sr[0] === 200 && sr[1] === 409, sr.join(","));
    checa("o valor voltou ao saldo uma vez só", (await saldoDe(org.organizacaoId)) === base - 3000);
    r = await marina.req("GET", "/api/admin/banner-pago");
    const recusado = r.json?.pedidos?.find((p: any) => p.id === pB);
    checa("a organização lê o motivo e o que voltou", recusado?.status === "recusado" && /prêmio/.test(recusado?.motivo ?? "") && recusado?.devolvidoCents === 1000);

    r = await pedido(marina, rifaB.id, { dias: 2 });
    const pB2 = r.json?.id as string;
    checa("depois da recusa, a rifa pode pedir de novo", r.status === 201, `HTTP ${r.status}`);
    const cancelamentos = await Promise.all([1, 2].map(() => marina.req("POST", `/api/admin/banner-pago/pedidos/${pB2}/cancelar`)));
    const sc = cancelamentos.map((x) => x.status).sort();
    checa("cancelar duas vezes: um 200 e um 409", sc[0] === 200 && sc[1] === 409, sc.join(","));
    checa("cancelado, o valor voltou inteiro, uma vez só", (await saldoDe(org.organizacaoId)) === base - 3000);

    /* ---------------- aprovar e vagas ---------------- */
    console.log("  — aprovar, vagas e a vitrine");
    r = await admin.req("POST", `/api/admin/banner-pago/pedidos/${pA}/decisao`, { aprovar: true });
    checa("a plataforma aprova a arte", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/banner-pago/pedidos/${pA}/decisao`, { aprovar: true });
    checa("aprovar de novo: 409", r.status === 409, `HTTP ${r.status}`);
    const [aprovadoA] = await db.select().from(bannerPedidos).where(eq(bannerPedidos.id, pA));
    const dias3 = 3 * 86_400_000;
    checa("havendo vaga, entra no ar na hora, por 3 dias a partir de agora", aprovadoA.status === "no_ar" && Boolean(aprovadoA.inicio) && Math.abs(aprovadoA.fim!.getTime() - aprovadoA.inicio!.getTime() - dias3) < 1000, aprovadoA.status);
    r = await anon.req("GET", "/api/public/banners");
    const naVitrine = (r.json ?? []).find((b: any) => b.id === pA);
    checa("a vitrine mostra, marcado como patrocinado, levando à rifa dentro do perfil", naVitrine?.patrocinado === true && naVitrine?.link === `/o/${(org as any).slug}/r/banner-teste-a`, JSON.stringify(naVitrine));
    const arteNoAr = await medir(naVitrine?.imagem ?? "/nada");
    checa("a arte pública é WebP 1200×600", arteNoAr.tipo === "image/webp" && arteNoAr.largura === 1200 && arteNoAr.altura === 600, `${arteNoAr.tipo} ${arteNoAr.largura}×${arteNoAr.altura}`);

    r = await pedido(marina, rifaB.id, { dias: 2, titulo: "Segunda arte" });
    const pB3 = r.json?.id as string;
    await admin.req("POST", `/api/admin/banner-pago/pedidos/${pB3}/decisao`, { aprovar: true });
    r = await marina.req("GET", "/api/admin/banner-pago");
    const espera = r.json?.pedidos?.find((p: any) => p.id === pB3);
    checa("sem vaga, o aprovado espera na fila, sem o relógio correr", espera?.status === "aprovado" && espera?.posicaoNaFila === 1 && espera?.inicio === null, JSON.stringify({ s: espera?.status, p: espera?.posicaoNaFila }));
    r = await anon.req("GET", "/api/public/banners");
    checa("e não aparece na vitrine (só 1 vaga paga)", !(r.json ?? []).some((b: any) => b.id === pB3));

    /* ---------------- a rifa sai do ar ---------------- */
    console.log("  — a rifa sai do ar");
    r = await admin.req("DELETE", `/api/admin/campaigns/${rifaA.id}`);
    checa("rifa com banner pago não se apaga (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, rifaA.id));
    r = await anon.req("GET", "/api/public/banners");
    checa("rifa encerrada: o banner some da vitrine na hora", !(r.json ?? []).some((b: any) => b.id === pA));
    const arteSumiu = await medir(`/api/public/banners-pagos/${pA}/imagem`);
    checa("…e a arte pública também", arteSumiu.status === 404, `HTTP ${arteSumiu.status}`);
    const saldoAntesDoRelogio = await saldoDe(org.organizacaoId);
    const rel = await encerrarBannersPagos();
    checa("o relógio encerra e devolve", rel.devolvidos >= 1, JSON.stringify(rel));
    const [encerradoA] = await db.select().from(bannerPedidos).where(eq(bannerPedidos.id, pA));
    // 3 dias a R$ 10,00, 1 dia usado: gasto R$ 10,00, sobra R$ 20,00.
    checa("encerrado, com os dias não usados devolvidos (R$ 20,00)", encerradoA.status === "encerrado" && encerradoA.devolvidoCents === 2000, `${encerradoA.status} ${encerradoA.devolvidoCents}`);
    checa("…e o saldo subiu R$ 20,00", (await saldoDe(org.organizacaoId)) === saldoAntesDoRelogio + 2000);
    await encerrarBannersPagos();
    checa("o relógio de novo não devolve outra vez", (await saldoDe(org.organizacaoId)) === saldoAntesDoRelogio + 2000);
    const [subiuB3] = await db.select().from(bannerPedidos).where(eq(bannerPedidos.id, pB3));
    checa("a vaga liberada vai para o próximo da fila", subiuB3.status === "no_ar" && Boolean(subiuB3.inicio), subiuB3.status);

    // Vence pelo prazo: encerra sem devolver nada.
    await db.update(bannerPedidos).set({ fim: new Date(Date.now() - 1000) }).where(eq(bannerPedidos.id, pB3));
    r = await anon.req("GET", "/api/public/banners");
    checa("passou do prazo: some da vitrine mesmo antes do relógio", !(r.json ?? []).some((b: any) => b.id === pB3));
    const saldoAntesDoVencimento = await saldoDe(org.organizacaoId);
    await encerrarBannersPagos();
    const [vencido] = await db.select().from(bannerPedidos).where(eq(bannerPedidos.id, pB3));
    checa("vencido: encerrado, sem devolução", vencido.status === "encerrado" && vencido.devolvidoCents === 0 && (await saldoDe(org.organizacaoId)) === saldoAntesDoVencimento);

    // Em análise e a rifa sai do ar: cancela e devolve tudo.
    const rifaC = await novaRifa(org.organizacaoId, "banner-teste-c");
    r = await pedido(marina, rifaC.id, { dias: 2 });
    const pC = r.json?.id as string;
    const saldoComC = await saldoDe(org.organizacaoId);
    await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, rifaC.id));
    await encerrarBannersPagos();
    const [cancelC] = await db.select().from(bannerPedidos).where(eq(bannerPedidos.id, pC));
    checa("em análise com a rifa fora do ar: cancelado, com tudo devolvido", cancelC.status === "cancelado" && cancelC.devolvidoCents === 2000 && (await saldoDe(org.organizacaoId)) === saldoComC + 2000, `${cancelC.status}`);

    /* ---------------- o livro fecha ---------------- */
    console.log("  — o livro de saldo fecha");
    const liquido = await db.execute(sql`select coalesce(sum(valor_cents),0)::int as s from patrocinio_lancamentos where organization_id = ${org.organizacaoId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and motivo like 'banner%'`);
    const gastoFinal = -(liquido.rows[0] as { s: number }).s;
    // Pagou: A 3000 + B 1000 + B2 2000 + B3 2000 + C 2000; voltou: B 1000, B2 2000, A 2000, C 2000.
    checa("pagos − devolvidos = o que ficou gasto (A 1 dia + B3 2 dias = R$ 30,00)", gastoFinal === 3000, `${gastoFinal}`);
    checa("e o saldo bate com o livro", (await saldoDe(org.organizacaoId)) === base - 3000);
  } finally {
    // Estado de antes.
    await db.execute(sql`delete from banner_pedidos where organization_id = ${org.organizacaoId}::uuid or organization_id = ${vizinha.id}::uuid`);
    await db.execute(sql`delete from patrocinio_lancamentos where organization_id = ${org.organizacaoId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and (motivo like 'banner%' or chave like 'ajuste:%')`);
    await db.update(organizations).set({ patrocinioSaldoCents: saldoAntes }).where(eq(organizations.id, org.organizacaoId));
    await limpar([]);
    await admin.req("PUT", "/api/admin/banner-pago/config", configAntes);
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} falha(s)\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
