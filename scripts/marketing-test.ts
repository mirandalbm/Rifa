/**
 * Prova do marketing e tráfego pago (etapa 16), pela API de verdade:
 *
 * - desligado (padrão): nenhum pixel na página pública, o organizador não
 *   vê o menu e o painel dele é 404, e compra paga não vira evento;
 * - só a plataforma liga; pixel fora do formato (cara de script) é 400 e
 *   não mexe em nada; ligar não mexe no resto da configuração;
 * - chaves de API: cifradas no banco, nunca voltam em resposta nenhuma;
 * - cada organização mexe só nos pixels dela, e a página pública de uma
 *   rifa traz os pixels da promotora dela — nunca os da vizinha;
 * - compra paga com consentimento vira um evento por destino (pixel com
 *   chave), uma vez só mesmo com o pagamento confirmado duas vezes; sem
 *   consentimento, nenhum;
 * - o envio: corpo de cada API com o mesmo event_id do navegador, telefone
 *   só em hash; falha fica na fila e desiste depois de 5 tentativas;
 * - vendas por campanha (UTM) no recorte de cada organização.
 *
 *   npm run marketing      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { appSettings, campaignStats, campaigns, marketingEventos, orders, organizations, users } from "../shared/schema";
import { enviarEventosPendentes } from "../server/services/marketing";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const NAVEGADOR = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

class Cliente {
  cookie = "";
  constructor(readonly aparelho?: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": NAVEGADOR,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.aparelho ? { "x-device-id": this.aparelho } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const texto = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(texto);
    } catch {
      // não é JSON
    }
    return { status: r.status, json, texto };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status}`);
    return this;
  }
}

const SLUGS = ["marketing-a", "marketing-b"];
const EMAILS = ["marketing-a@teste.rifa", "marketing-b@teste.rifa"];
const SENHA = "senha-marketing-1";
const TOKEN_META = "EAABmetaTokenDeTeste1234567890";
const SEGREDO_GA4 = "segredoGa4DeTeste_99";
const TOKEN_TIKTOK = "tiktokTokenDeTeste1234567";

async function limpar() {
  const os = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = os.map((o) => o.id);
  await db.execute(sql`delete from marketing_credenciais where dono = 'plataforma-teste-restaurar'`);
  if (ids.length) {
    const l = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from marketing_credenciais where dono in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in ${l}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from campaigns where organization_id in ${l}`);
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1194445%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

async function main() {
  console.log("\n=== marketing e tráfego pago ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));
  const credsAntes = (await db.execute(sql`select * from marketing_credenciais where dono = 'plataforma'`)).rows[0] as Record<string, unknown> | undefined;

  const orgs: { id: string; slug: string }[] = [];
  const rifas: { id: string; slug: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db.insert(organizations).values({ slug, name: `Marketing ${i ? "B" : "A"}`, cnpj: "11222333000181" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: o.id,
        slug: `${slug}-rifa`,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: "SPA-MARKETING",
        authorizationFileKey: "certificado-teste",
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    orgs.push(o);
    rifas.push(c);
    clientes.push(await new Cliente().entrar(EMAILS[i], SENHA));
  }
  const [A, B] = orgs;
  const [rA, rB] = rifas;
  const [orgA, orgB] = clientes;
  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  let telefone = 11944450000;
  const comprar = async (rifa: { id: string }, extra: Record<string, unknown> = {}) => {
    const r = await new Cliente(`aparelho-${telefone}`).req("POST", "/api/public/orders", {
      campaignId: rifa.id,
      quantity: 2,
      buyer: { name: "Comprador Marketing", phone: String(++telefone) },
      ...extra,
    });
    if (r.status !== 201) throw new Error(`compra: HTTP ${r.status} ${r.texto}`);
    return r.json.code as number;
  };
  const pagar = (code: number) => fetch(`${URL}/api/dev/pay/${code}`, { method: "POST" });
  const eventosDo = async (code: number) => {
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, code));
    return db.select().from(marketingEventos).where(eq(marketingEventos.orderId, o.id));
  };

  try {
    // Desligado.
    await admin.req("PUT", "/api/admin/marketing", { ligado: false });
    let r = await new Cliente().req("GET", `/api/public/marketing?organizacao=${A.slug}`);
    checa("desligado: a página pública não recebe pixel", r.status === 200 && r.json?.ligado === false && !("plataforma" in (r.json ?? {})));
    r = await orgA.req("GET", "/api/admin/marketing");
    checa("desligado: painel do organizador é 404", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("PUT", "/api/admin/marketing", { pixels: { meta: "1234567890123" } });
    checa("desligado: organizador não salva (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/auth/me");
    checa("desligado: o menu do organizador não tem Marketing", !r.json?.sections?.some((s: any) => s.key === "adminMarketing"));
    r = await admin.req("GET", "/api/auth/me");
    checa("a plataforma vê o menu sempre", r.json?.sections?.some((s: any) => s.key === "adminMarketing"));
    let code = await comprar(rA, { marketing: true });
    await pagar(code);
    checa("desligado: compra paga não vira evento", (await eventosDo(code)).length === 0);

    // Ligar.
    const cfgAntes = (await admin.req("GET", "/api/admin/plataforma")).json;
    r = await admin.req("PUT", "/api/admin/marketing", { ligado: true, pixels: { meta: "123');alert(1);//" } });
    checa("pixel com cara de script: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/marketing");
    checa("e nada mudou", r.json?.ligado === false);
    r = await admin.req("PUT", "/api/admin/marketing", {
      ligado: true,
      pixels: { meta: "1111222233334444", ga4: "G-PLATAFORMA1" },
      credenciais: { metaToken: TOKEN_META, ga4Segredo: SEGREDO_GA4 },
    });
    checa("a plataforma liga com pixels e chaves", r.status === 200 && r.json?.ligado === true && r.json?.credenciais?.metaToken === true, `HTTP ${r.status} ${r.texto}`);
    checa("a chave não volta na resposta", !r.texto.includes(TOKEN_META) && !r.texto.includes(SEGREDO_GA4));
    const cfgDepois = (await admin.req("GET", "/api/admin/plataforma")).json;
    checa("ligar não mexe no resto", cfgDepois.estornoManual === cfgAntes.estornoManual && cfgDepois.patrocinioLigado === cfgAntes.patrocinioLigado);
    const guardada = (await db.execute(sql`select dados from marketing_credenciais where dono = 'plataforma'`)).rows[0] as { dados: Buffer };
    checa("no banco, a chave está cifrada", Boolean(guardada) && !Buffer.from(guardada.dados).toString("latin1").includes(TOKEN_META));
    r = await orgA.req("PUT", "/api/admin/marketing", { ligado: false });
    r = await admin.req("GET", "/api/admin/marketing");
    checa("organizador não desliga o programa", r.json?.ligado === true);

    // Pixels de cada organização.
    r = await orgA.req("GET", "/api/auth/me");
    checa("ligado: o organizador vê o menu Marketing", r.json?.sections?.some((s: any) => s.key === "adminMarketing"));
    r = await orgA.req("PUT", "/api/admin/marketing", { pixels: { tiktok: "C1A2B3C4D5E6F7G8H9I0" }, credenciais: { tiktokToken: TOKEN_TIKTOK } });
    checa("organização A salva os dela", r.status === 200 && r.json?.pixels?.tiktok === "C1A2B3C4D5E6F7G8H9I0" && r.json?.credenciais?.tiktokToken === true, `HTTP ${r.status} ${r.texto}`);
    checa("sem devolver a chave", !r.texto.includes(TOKEN_TIKTOK));
    r = await orgB.req("GET", "/api/admin/marketing");
    checa("organização B não vê os pixels nem a chave da A", r.status === 200 && !r.json?.pixels?.tiktok && r.json?.credenciais?.tiktokToken === false);
    r = await admin.req("GET", "/api/admin/marketing");
    checa("a plataforma vê os dela, não os da A", r.json?.pixels?.meta === "1111222233334444" && !r.json?.pixels?.tiktok);
    r = await new Cliente().req("GET", `/api/public/marketing?organizacao=${A.slug}`);
    checa("página da rifa de A: pixels da plataforma e da A", r.json?.plataforma?.meta === "1111222233334444" && r.json?.organizacao?.tiktok === "C1A2B3C4D5E6F7G8H9I0");
    r = await new Cliente().req("GET", `/api/public/marketing?organizacao=${B.slug}`);
    checa("página da rifa de B: nunca os da A", r.json?.organizacao === null);
    checa("nenhuma chave em resposta pública", !r.texto.includes("Token") && !r.texto.includes("segredo"));
    r = await new Cliente().req("GET", `/api/public/orders/${code}`);
    checa("o pedido público diz de quem é a rifa", r.json?.organizacao === A.slug && r.json?.campaign?.id === rA.id);

    // Compra com consentimento.
    code = await comprar(rA, { marketing: true, utm: { source: "instagram", medium: "cpc", campaign: "moto-junho", fbclid: "FBCLID123", outra: "x" } });
    await Promise.all([pagar(code), pagar(code)]);
    let evs = await eventosDo(code);
    checa(
      "compra paga vira um evento por destino, uma vez só",
      evs.length === 3 && ["plataforma:meta", "plataforma:ga4", `${A.id}:tiktok`].every((k) => evs.some((e) => `${e.dono}:${e.provedor}` === k)),
      evs.map((e) => `${e.dono}:${e.provedor}`).join(),
    );
    const [pedido] = await db.select().from(orders).where(eq(orders.code, code));
    checa("o pedido guarda a UTM limpa e o consentimento", pedido.marketingConsentimento === true && pedido.utm?.campaign === "moto-junho" && !("outra" in (pedido.utm ?? {})));
    const semConsentimento = await comprar(rA, { utm: { source: "google" } });
    await pagar(semConsentimento);
    checa("sem consentimento, nenhum evento", (await eventosDo(semConsentimento)).length === 0);
    const naB = await comprar(rB, { marketing: true });
    await pagar(naB);
    evs = await eventosDo(naB);
    checa("na rifa de B, só os destinos da plataforma", evs.length === 2 && evs.every((e) => e.dono === "plataforma"));

    // Envio (sem rede: o envio é injetado).
    const enviados: { url: string; corpo: any }[] = [];
    await enviarEventosPendentes(async (url, init) => {
      enviados.push({ url, corpo: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => "{}" };
    });
    evs = await eventosDo(code);
    checa("enviados e marcados", evs.every((e) => e.status === "enviado" && e.tentativas === 1), evs.map((e) => `${e.provedor}:${e.status}`).join());
    const meta = enviados.find((e) => e.url.includes("graph.facebook.com/v19.0/1111222233334444/events") && e.corpo.data[0].event_id === `compra-${code}`);
    const telHash = createHash("sha256").update(`55${pedido.buyerId ? (await db.execute(sql`select phone from buyers where id = ${pedido.buyerId}::uuid`)).rows[0].phone : ""}`).digest("hex");
    checa("Meta: mesmo event_id do navegador, telefone em hash e o fbc do clique", Boolean(meta) && meta!.corpo.data[0].user_data.ph[0] === telHash && /\.FBCLID123$/.test(meta!.corpo.data[0].user_data.fbc) && meta!.corpo.data[0].custom_data.value === 10);
    checa("GA4: measurement_id e segredo na URL, transaction_id igual", enviados.some((e) => e.url.includes("measurement_id=G-PLATAFORMA1") && e.url.includes(`api_secret=${SEGREDO_GA4}`) && e.corpo.events[0].params.transaction_id === `compra-${code}`));
    checa("TikTok: no pixel da A, com o token dela", enviados.some((e) => e.url.includes(`access_token=${TOKEN_TIKTOK}`) && e.corpo.event_source_id === "C1A2B3C4D5E6F7G8H9I0"));
    const antesDeRodarDeNovo = enviados.length;
    await enviarEventosPendentes(async (url, init) => {
      enviados.push({ url, corpo: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => "{}" };
    });
    checa("rodar de novo não reenvia", enviados.length === antesDeRodarDeNovo);

    // Falha: fica na fila, e desiste na quinta.
    const falha = await comprar(rB, { marketing: true });
    await pagar(falha);
    const quebrado = async () => ({ ok: false, status: 500, text: async () => "erro do provedor" });
    await enviarEventosPendentes(quebrado);
    evs = await eventosDo(falha);
    checa("falhou: continua na fila, com o erro e espera", evs.every((e) => e.status === "pendente" && e.tentativas === 1 && /500/.test(e.ultimoErro ?? "") && e.proximaTentativa > new Date()));
    await enviarEventosPendentes(quebrado);
    checa("antes da espera, não tenta de novo", (await eventosDo(falha)).every((e) => e.tentativas === 1));
    const [f] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, falha));
    await db.update(marketingEventos).set({ tentativas: 4, proximaTentativa: new Date(Date.now() - 1000) }).where(eq(marketingEventos.orderId, f.id));
    await enviarEventosPendentes(quebrado);
    checa("na quinta falha, desiste", (await eventosDo(falha)).every((e) => e.status === "falhou" && e.tentativas === 5));

    // Relatório por campanha.
    r = await orgA.req("GET", "/api/admin/marketing?dias=7");
    const linha = r.json?.campanhas?.find((c: any) => c.campanha === "moto-junho");
    checa("A vê a venda da campanha", r.json?.dias === 7 && linha?.fonte === "instagram" && linha?.vendas === 1 && linha?.receitaCents === 1000, JSON.stringify(r.json?.campanhas));
    checa("A vê só os envios dela", r.json?.envios?.every((e: any) => e.provedor === "tiktok"));
    r = await orgB.req("GET", "/api/admin/marketing");
    checa("B não vê a campanha de A", !r.json?.campanhas?.some((c: any) => c.campanha === "moto-junho"));

    // Desligar de novo.
    await admin.req("PUT", "/api/admin/marketing", { ligado: false });
    r = await new Cliente().req("GET", `/api/public/marketing?organizacao=${A.slug}`);
    checa("desligado de novo: página sem pixel", r.json?.ligado === false);
    code = await comprar(rA, { marketing: true });
    await pagar(code);
    checa("desligado de novo: compra não vira evento", (await eventosDo(code)).length === 0);
    r = await orgA.req("GET", "/api/admin/marketing");
    checa("desligado de novo: painel do organizador 404", r.status === 404);
  } finally {
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
    await db.execute(sql`delete from marketing_credenciais where dono = 'plataforma'`);
    if (credsAntes) {
      await db.execute(sql`insert into marketing_credenciais (dono, dados, iv, tag, chave_versao, atualizado_em)
        values ('plataforma', ${credsAntes.dados}, ${credsAntes.iv}, ${credsAntes.tag}, ${credsAntes.chave_versao}, ${credsAntes.atualizado_em})`);
    }
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
