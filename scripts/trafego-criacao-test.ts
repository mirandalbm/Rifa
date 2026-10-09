/**
 * Prova da fase 3 do tráfego pago: a campanha no ar criada no Meta pela API,
 * contra a API de verdade e um Meta de mentira que a própria prova sobe.
 * Confere o que chegou ao Meta (nome com o código, orçamento por dia, fim pela
 * verba, PAUSADO, alvo e idade, link com a UTM, texto sem telefone, o token só
 * no cabeçalho), o interruptor desligado, o 403 do organizador, a rifa fora do
 * ar e o texto fora da régua (nada é chamado), o 409 do segundo clique e do
 * clique simultâneo, a falha no meio (campanha criada, conjunto recusado) e o
 * tentar de novo (a metade fica anotada), a cidade que o Meta não acha (nada
 * criado), o recorte (a organização só sabe "criada"), e a pausa ao encerrar —
 * pela organização, pela plataforma e pelo relógio —, inclusive quando o Meta
 * falha (o encerramento segue). Devolve o estado de antes.
 *
 *   META_ADS_TOKEN=… META_AD_ACCOUNT_ID=act_… META_PAGE_ID=… META_API_URL=http://127.0.0.1:5096/v22.0 npm run dev
 *   (as mesmas variáveis) npm run trafego-criacao
 */
import "dotenv/config";
import http from "node:http";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, organizations, trafegoCriacoes } from "../shared/schema";
import { encerrarTrafegoForaDoAr } from "../server/services/trafego";
import { getPlataforma } from "../server/services/settings";
import { codigoDaCampanha } from "../shared/trafego";

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
    const texto = await r.text();
    return { status: r.status, texto, json: tipo.includes("json") && texto ? JSON.parse(texto) : null };
  }
}

const PREFIXO = "trafego-meta-teste-";
const BASE = 500_000;

/* ---------------- o Meta de mentira ---------------- */

const TOKEN = process.env.META_ADS_TOKEN?.trim() ?? "";
const CONTA = process.env.META_AD_ACCOUNT_ID?.trim() ?? "";
const PAGINA = process.env.META_PAGE_ID?.trim() ?? "";
const URL_META = process.env.META_API_URL?.trim() ?? "";

interface Pedido {
  metodo: string;
  caminho: string;
  url: string;
  auth: string;
  consulta: URLSearchParams;
  corpo: any;
}
const pedidos: Pedido[] = [];
const meta = { falharConjunto: false, falharPausa: false, demora: 0 };
let proximoId = 120_200_000_000_000;

function subirMeta(): Promise<http.Server> {
  const prefixo = new globalThis.URL(URL_META).pathname.replace(/\/+$/, "");
  const servidor = http.createServer((req, res) => {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", async () => {
      const u = new globalThis.URL(req.url ?? "/", "http://x");
      const caminho = u.pathname.startsWith(prefixo) ? u.pathname.slice(prefixo.length).replace(/^\/+/, "") : u.pathname;
      let corpo: any = null;
      try {
        corpo = bruto ? JSON.parse(bruto) : null;
      } catch {
        corpo = bruto;
      }
      pedidos.push({ metodo: req.method ?? "", caminho, url: req.url ?? "", auth: String(req.headers.authorization ?? ""), consulta: u.searchParams, corpo });
      const responde = (status: number, j: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(j));
      };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return responde(401, { error: { code: 190, message: "Invalid OAuth access token" } });
      if (meta.demora) await new Promise((ok) => setTimeout(ok, meta.demora));
      if (req.method === "GET" && caminho === "search") {
        const q = u.searchParams.get("q") ?? "";
        const tipos = u.searchParams.get("location_types") ?? "";
        const todos = [
          { key: "460", name: "Sao Paulo", type: "region", country_code: "BR", region: "Sao Paulo", region_id: 460 },
          { key: "2481", name: "Campinas", type: "city", country_code: "BR", region: "Goiás", region_id: 450 },
          { key: "248", name: "Campinas", type: "city", country_code: "BR", region: "São Paulo", region_id: 460 },
        ];
        const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return responde(200, { data: todos.filter((l) => tipos.includes(l.type) && sem(l.name).startsWith(sem(q).slice(0, 4))) });
      }
      if (req.method === "POST" && caminho === `${CONTA}/adimages`) return responde(200, { images: { "x.jpg": { hash: "0123456789abcdef0123456789abcdef", url: "https://x" } } });
      if (req.method === "POST" && caminho === `${CONTA}/campaigns`) return responde(200, { id: String(proximoId++) });
      if (req.method === "POST" && caminho === `${CONTA}/adsets`) {
        if (meta.falharConjunto) return responde(400, { error: { code: 100, error_subcode: 1487, message: `Invalid parameter ${TOKEN}`, fbtrace_id: "abc" } });
        return responde(200, { id: String(proximoId++) });
      }
      if (req.method === "POST" && caminho === `${CONTA}/adcreatives`) return responde(200, { id: String(proximoId++) });
      if (req.method === "POST" && caminho === `${CONTA}/ads`) return responde(200, { id: String(proximoId++) });
      if (req.method === "POST" && /^\d+$/.test(caminho)) {
        if (meta.falharPausa) return responde(500, { error: { code: 2, message: "Service temporarily unavailable" } });
        return responde(200, { success: true });
      }
      responde(404, { error: { code: 803, message: "Unknown path" } });
    });
  });
  return new Promise((ok) => servidor.listen(Number(new globalThis.URL(URL_META).port), "127.0.0.1", () => ok(servidor)));
}

const doPasso = (caminho: string, desde = 0) => pedidos.slice(desde).filter((p) => p.caminho === caminho);

async function novaRifa(organizationId: string, slug: string, premio = `Prêmio ${slug}`) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId,
      slug: PREFIXO + slug,
      title: `Rifa ${slug}`,
      prizeTitle: premio,
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 10 * 86_400_000),
      authorizationCode: "SEI/ME 18101.000123/2026-11",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  return c;
}

async function criacao(id: string) {
  const [l] = await db.select().from(trafegoCriacoes).where(eq(trafegoCriacoes.campanhaId, id));
  return l;
}

async function esperar<T>(f: () => Promise<T>, ok: (v: T) => boolean, ms = 8_000): Promise<T> {
  const fim = Date.now() + ms;
  let v = await f();
  while (!ok(v) && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 100));
    v = await f();
  }
  return v;
}

async function limpar() {
  const rifas = sql`(select id from campaigns where slug like ${PREFIXO + "%"})`;
  await db.execute(sql`delete from trafego_campanhas where campaign_id in ${rifas}`);
  await db.execute(sql`delete from campaign_stats where campaign_id in ${rifas}`);
  await db.execute(sql`delete from campaigns where slug like ${PREFIXO + "%"}`);
}

async function main() {
  console.log("\n=== tráfego pago, fase 3: criar no Meta ===\n");
  if (!TOKEN || !CONTA || !PAGINA || !URL_META) {
    throw new Error("Rode com META_ADS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID e META_API_URL (as mesmas do servidor).");
  }
  const inicio = new Date();
  const configAntes = (await getPlataforma()).trafegoPago;
  await limpar();

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
  const orgId: string = org.organizacaoId;
  const [antesOrg] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, orgId));
  await db.update(organizations).set({ patrocinioSaldoCents: BASE }).where(eq(organizations.id, orgId));

  const servidor = await subirMeta();
  const cfg = { ligado: true, taxaPct: 20, investimentoMinCents: 10_000, verbaDiaMinCents: 1_000, redes: ["google", "meta"] };

  // Pede e aprova uma campanha; devolve o id.
  const noAr = async (rifaId: string, extra: Record<string, unknown> = {}, aprovar = true) => {
    const p = await marina.req("POST", "/api/admin/trafego/campanhas", { campaignId: rifaId, redes: ["meta"], investimentoCents: 20_500, verbaDiaCents: 2_000, ...extra });
    if (p.status !== 201) throw new Error(`pedido: HTTP ${p.status} ${p.json?.message ?? ""}`);
    if (aprovar) {
      const d = await admin.req("POST", `/api/admin/trafego/campanhas/${p.json.id}/decisao`, { aprovar: true });
      if (d.status !== 200) throw new Error(`aprovação: HTTP ${d.status} ${d.json?.message ?? ""}`);
    }
    return p.json.id as string;
  };
  const criar = (cli: Cliente, id: string) => cli.req("POST", `/api/admin/trafego/campanhas/${id}/meta`);

  try {
    await admin.req("PUT", "/api/admin/trafego/config", { ...cfg, criarPelaApi: false });
    const rifaA = await novaRifa(orgId, "a");
    const rifaB = await novaRifa(orgId, "b");
    const rifaC = await novaRifa(orgId, "c");
    const rifaD = await novaRifa(orgId, "d");
    const rifaE = await novaRifa(orgId, "e");
    const rifaF = await novaRifa(orgId, "f");
    const rifaG = await novaRifa(orgId, "g");
    const rifaH = await novaRifa(orgId, "h", "Moto, chama no 11 98765-4321");

    const idA = await noAr(rifaA.id, { uf: "SP", cidade: "Campinas" });

    /* ---------------- portas fechadas: nada é chamado ---------------- */
    console.log("  — portas fechadas");
    let antes = pedidos.length;
    r = await criar(admin, idA);
    checa("interruptor desligado: 409 e nada chega ao Meta", r.status === 409 && pedidos.length === antes, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("GET", "/api/admin/trafego");
    checa("a tela da plataforma sabe que está desligado e não falta variável", r.json?.criacaoPelaApi?.ligado === false && r.json?.criacaoPelaApi?.meta?.faltam?.length === 0, JSON.stringify(r.json?.criacaoPelaApi));
    checa("…e nunca recebe o valor do token", !r.texto.includes(TOKEN));

    r = await admin.req("PUT", "/api/admin/trafego/config", { criarPelaApi: true });
    checa("ligar só o interruptor mantém o resto da config (parte da atual)", r.status === 200 && r.json?.criarPelaApi === true && r.json?.ligado === true && r.json?.redes?.includes("meta"), JSON.stringify(r.json));

    antes = pedidos.length;
    r = await criar(marina, idA);
    checa("o organizador não cria (403) e nada chega ao Meta", r.status === 403 && pedidos.length === antes, `HTTP ${r.status}`);
    r = await marina.req("GET", "/api/admin/trafego");
    checa("a organização não recebe a situação das variáveis", r.status === 200 && !("criacaoPelaApi" in (r.json ?? {})) && !r.texto.includes("META_"));

    const idB = await noAr(rifaB.id, {}, false);
    r = await criar(admin, idB);
    checa("campanha em análise (não aprovada) é 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const idC = await noAr(rifaC.id, { redes: ["google"] });
    r = await criar(admin, idC);
    checa("campanha sem o Meta é 409", r.status === 409, `HTTP ${r.status}`);
    const idD = await noAr(rifaD.id);
    await db.update(campaigns).set({ travadaEm: new Date() }).where(eq(campaigns.id, rifaD.id));
    r = await criar(admin, idD);
    checa("rifa travada (fora do ar): 409", r.status === 409 && /rifa saiu do ar/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await db.update(campaigns).set({ status: "closed", travadaEm: null }).where(eq(campaigns.id, rifaD.id));
    r = await criar(admin, idD);
    checa("rifa encerrada: 409", r.status === 409, `HTTP ${r.status}`);
    const idH = await noAr(rifaH.id);
    r = await criar(admin, idH);
    checa("prêmio com telefone: o texto não passa na régua (422)", r.status === 422 && /telefone/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…e em nenhum desses casos o Meta foi chamado", pedidos.length === antes, `${pedidos.length - antes} pedido(s)`);
    checa("…nem ficou linha de criação", !(await criacao(idB)) && !(await criacao(idC)) && !(await criacao(idD)) && !(await criacao(idH)));
    r = await admin.req("POST", "/api/admin/trafego/campanhas/00000000-0000-4000-8000-000000000000/meta");
    checa("campanha que não existe: 404", r.status === 404, `HTTP ${r.status}`);

    /* ---------------- criar: o que chega ao Meta ---------------- */
    console.log("  — criar no Meta");
    antes = pedidos.length;
    meta.demora = 150;
    const [c1, c2] = await Promise.all([criar(admin, idA), criar(admin, idA)]);
    meta.demora = 0;
    checa("dois cliques ao mesmo tempo: um 201 e um 409", [c1.status, c2.status].sort().join(",") === "201,409", `${c1.status},${c2.status}`);
    const feita = await criacao(idA);
    checa("a criação ficou criada, com os ids da rede", feita?.status === "criada" && Boolean(feita.ids.campanha && feita.ids.conjunto && feita.ids.criativo && feita.ids.anuncio && feita.ids.imagem), JSON.stringify(feita?.ids));
    const novos = pedidos.slice(antes);
    checa("uma campanha só chegou ao Meta", doPasso(`${CONTA}/campaigns`, antes).length === 1 && doPasso(`${CONTA}/ads`, antes).length === 1);
    checa("o token foi só no cabeçalho, em toda chamada", novos.length > 0 && novos.every((p) => p.auth === `Bearer ${TOKEN}` && !p.url.includes(TOKEN) && !JSON.stringify(p.corpo ?? "").includes(TOKEN)));
    const busca = doPasso("search", antes)[0];
    checa(
      "a cidade do pedido foi procurada no Brasil",
      Boolean(busca && busca.consulta.get("q") === "Campinas" && busca.consulta.get("country_code") === "BR" && busca.consulta.get("location_types")?.includes("city")),
      busca?.url,
    );
    const img = doPasso(`${CONTA}/adimages`, antes)[0];
    checa("a imagem é a arte pronta em JPEG", Boolean(img && typeof img.corpo?.bytes === "string" && Buffer.from(img.corpo.bytes, "base64").subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))));
    const camp = doPasso(`${CONTA}/campaigns`, antes)[0]?.corpo;
    const codigo = codigoDaCampanha(idA);
    checa("campanha: nome com o código e o título, tráfego, PAUSADA", camp?.name === `trafego-${codigo} · Rifa a` && camp?.objective === "OUTCOME_TRAFFIC" && camp?.status === "PAUSED", JSON.stringify(camp));
    const conj = doPasso(`${CONTA}/adsets`, antes)[0]?.corpo;
    const dias = conj ? (Date.parse(conj.end_time) - Date.parse(conj.start_time)) / 86_400_000 : 0;
    checa("conjunto: R$ 20,00 por dia em centavos, PAUSADO, ligado à campanha", conj?.daily_budget === 2_000 && conj?.status === "PAUSED" && conj?.campaign_id === feita?.ids.campanha, JSON.stringify(conj));
    checa("conjunto: o fim é quando a verba acaba pela conta (20.500 ÷ 2.000 = 10 dias)", dias === 10, String(dias));
    checa(
      "conjunto: a cidade achada no estado certo e maiores de 18",
      JSON.stringify(conj?.targeting?.geo_locations) === JSON.stringify({ cities: [{ key: "248", radius: 10, distance_unit: "kilometer" }] }) && conj?.targeting?.age_min === 18,
      JSON.stringify(conj?.targeting),
    );
    const criat = doPasso(`${CONTA}/adcreatives`, antes)[0]?.corpo;
    const link = criat?.object_story_spec?.link_data?.link ? new globalThis.URL(criat.object_story_spec.link_data.link) : null;
    checa(
      "criativo: o link é a página da rifa com a UTM da campanha (meta)",
      Boolean(link && link.pathname === `/o/${org.slug}/r/${rifaA.slug}` && link.searchParams.get("utm_source") === "meta" && link.searchParams.get("utm_campaign") === `trafego-${codigo}`),
      link?.toString(),
    );
    const msg: string = criat?.object_story_spec?.link_data?.message ?? "";
    checa(
      "criativo: o texto dos dados públicos, com a autorização e o aviso, sem telefone",
      msg.includes("Prêmio a") && msg.includes("SPA/MF nº SEI/ME 18101.000123/2026-11") && msg.includes("Só vale bilhete pago pela plataforma") && !/\(?\d{2}\)?\s?9\d{4}-?\d{4}/.test(msg),
      msg,
    );
    checa("criativo: assinado pela página da plataforma, com a imagem enviada", criat?.object_story_spec?.page_id === PAGINA && criat?.object_story_spec?.link_data?.image_hash === feita?.ids.imagem);
    const an = doPasso(`${CONTA}/ads`, antes)[0]?.corpo;
    checa("anúncio: PAUSADO, no conjunto, com o criativo", an?.status === "PAUSED" && an?.adset_id === feita?.ids.conjunto && an?.creative?.creative_id === feita?.ids.criativo, JSON.stringify(an));
    checa("nenhuma resposta ao navegador traz o token", ![c1.texto, c2.texto].some((t) => t.includes(TOKEN)));

    antes = pedidos.length;
    r = await criar(admin, idA);
    checa("criada, o terceiro clique é 409 e nada chega ao Meta", r.status === 409 && pedidos.length === antes, `HTTP ${r.status}`);

    r = await marina.req("GET", "/api/admin/trafego");
    const naOrg = (r.json?.campanhas ?? []).find((c: any) => c.id === idA);
    checa("a organização só sabe que foi criada no Meta (sem ids nem erro)", JSON.stringify(naOrg?.meta) === JSON.stringify({ status: "criada" }), JSON.stringify(naOrg?.meta));
    checa("…e nenhum id da rede aparece na resposta dela", !r.texto.includes(feita!.ids.campanha) && !r.texto.includes(feita!.ids.anuncio));
    r = await admin.req("GET", "/api/admin/trafego");
    const naPlataforma = (r.json?.campanhas ?? []).find((c: any) => c.id === idA);
    checa("a plataforma vê a situação e os ids", naPlataforma?.meta?.status === "criada" && naPlataforma?.meta?.ids?.anuncio === feita?.ids.anuncio);

    /* ---------------- falha no meio e tentar de novo ---------------- */
    console.log("  — falha no meio");
    const idE = await noAr(rifaE.id, { uf: "SP" });
    meta.falharConjunto = true;
    antes = pedidos.length;
    r = await criar(admin, idE);
    meta.falharConjunto = false;
    checa("conjunto recusado: 502 com o motivo em português", r.status === 502 && /conjunto de anúncios/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…sem o token nem a mensagem crua do Meta", !r.texto.includes(TOKEN) && !r.texto.includes("Invalid parameter"));
    const metade = await criacao(idE);
    checa("a falha fica gravada com a campanha criada pela metade", metade?.status === "falhou" && Boolean(metade.ids.campanha) && !metade.ids.conjunto && Boolean(metade.erro), JSON.stringify({ s: metade?.status, ids: metade?.ids }));
    const conjE = doPasso(`${CONTA}/adsets`, antes)[0]?.corpo;
    checa("o estado do pedido foi para o Meta como região", JSON.stringify(conjE?.targeting?.geo_locations) === JSON.stringify({ regions: [{ key: "460" }] }), JSON.stringify(conjE?.targeting));
    r = await admin.req("GET", "/api/admin/trafego");
    const eNaPlataforma = (r.json?.campanhas ?? []).find((c: any) => c.id === idE);
    checa("a plataforma vê o erro e a metade para apagar", eNaPlataforma?.meta?.status === "falhou" && eNaPlataforma?.meta?.ids?.campanha === metade?.ids.campanha && Boolean(eNaPlataforma?.meta?.erro));
    r = await marina.req("GET", "/api/admin/trafego");
    const eNaOrg = (r.json?.campanhas ?? []).find((c: any) => c.id === idE);
    checa("a organização não vê a falha técnica", eNaOrg && eNaOrg.meta === undefined && !r.texto.includes(metade!.erro!));

    const [t1, t2] = await Promise.all([criar(admin, idE), criar(admin, idE)]);
    checa("tentar de novo: um 201 e um 409", [t1.status, t2.status].sort().join(",") === "201,409", `${t1.status},${t2.status}`);
    const deNovo = await criacao(idE);
    checa(
      "criada na segunda tentativa; a metade da primeira fica em restos",
      deNovo?.status === "criada" && deNovo.tentativas === 2 && deNovo.restos.some((x) => x.campanha === metade?.ids.campanha) && deNovo.ids.campanha !== metade?.ids.campanha && !deNovo.erro,
      JSON.stringify({ t: deNovo?.tentativas, restos: deNovo?.restos }),
    );

    // A cidade que o Meta não acha: recusa com motivo, nada criado no Brasil todo.
    const idF = await noAr(rifaF.id, { uf: "SP", cidade: "Cidadeinventada" });
    antes = pedidos.length;
    r = await criar(admin, idF);
    checa("cidade que o Meta não acha: falha com o motivo", r.status === 502 && /não achou/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…e nada foi criado (nem com o Brasil todo)", doPasso(`${CONTA}/campaigns`, antes).length === 0 && doPasso(`${CONTA}/adimages`, antes).length === 0);

    const auditoria = await db.execute(sql`
      select action, count(*)::int as n from audit_log
       where entity_id in (${idA}, ${idE}, ${idF}) and action like 'trafego.meta.%' and created_at >= ${inicio.toISOString()}::timestamp
       group by action`);
    const porAcao = Object.fromEntries((auditoria.rows as { action: string; n: number }[]).map((x) => [x.action, x.n]));
    checa("auditoria: criar, criada e falhou", porAcao["trafego.meta.criar"] === 4 && porAcao["trafego.meta.criada"] === 2 && porAcao["trafego.meta.falhou"] === 2, JSON.stringify(porAcao));

    /* ---------------- encerrar pausa no Meta ---------------- */
    console.log("  — encerrar pausa no Meta");
    antes = pedidos.length;
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idA}/encerrar`);
    checa("a organização encerra (200)", r.status === 200 && r.json?.status === "encerrando", `HTTP ${r.status}`);
    const pausadaA = await esperar(() => criacao(idA), (l) => l?.pausa === "pausada");
    const pausa = doPasso(feita!.ids.campanha, antes)[0];
    checa("…e a campanha é pausada no Meta, em segundo plano", pausadaA?.pausa === "pausada" && pausa?.metodo === "POST" && pausa?.corpo?.status === "PAUSED" && pausa?.auth === `Bearer ${TOKEN}`, pausadaA?.pausa ?? "nada");
    antes = pedidos.length;
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/fechar`);
    await new Promise((ok) => setTimeout(ok, 300));
    checa("fechar a conta não pausa de novo a que já foi pausada", r.status === 200 && doPasso(feita!.ids.campanha, antes).length === 0, `HTTP ${r.status}`);

    meta.falharPausa = true;
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idE}/encerrar`);
    checa("com o Meta falhando, a plataforma encerra mesmo assim (200)", r.status === 200 && r.json?.status === "encerrando", `HTTP ${r.status}`);
    const falhouE = await esperar(() => criacao(idE), (l) => l?.pausa === "falhou");
    checa("…e a falha da pausa fica gravada, em português", falhouE?.pausa === "falhou" && Boolean(falhouE.pausaErro) && !falhouE.pausaErro!.includes(TOKEN), falhouE?.pausaErro ?? "");
    r = await admin.req("GET", "/api/admin/trafego");
    const ePausa = (r.json?.campanhas ?? []).find((c: any) => c.id === idE);
    checa("a tela da plataforma recebe a pausa que falhou", ePausa?.meta?.pausa === "falhou");
    meta.falharPausa = false;
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idE}/fechar`);
    const repausadaE = await esperar(() => criacao(idE), (l) => l?.pausa === "pausada");
    checa("fechar a conta tenta pausar de novo a que falhou", r.status === 200 && repausadaE?.pausa === "pausada", repausadaE?.pausa ?? "");

    // O relógio: a rifa sai do ar, a campanha para e é pausada no Meta.
    const idG = await noAr(rifaG.id);
    r = await criar(admin, idG);
    checa("campanha G criada", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, rifaG.id));
    await encerrarTrafegoForaDoAr();
    const pausadaG = await esperar(() => criacao(idG), (l) => l?.pausa === "pausada");
    checa("rifa fora do ar: o relógio para a campanha e pausa no Meta", pausadaG?.pausa === "pausada", pausadaG?.pausa ?? "nada");
    const pausas = await db.execute(sql`
      select count(*)::int as n from audit_log
       where entity_id in (${idA}, ${idE}, ${idG}) and action = 'trafego.meta.pausar' and created_at >= ${inicio.toISOString()}::timestamp`);
    checa("cada pausa entra na auditoria (as duas de E: a que falhou e a que pausou)", (pausas.rows[0] as { n: number }).n === 4, JSON.stringify(pausas.rows[0]));
  } finally {
    servidor.close();
    await db.execute(sql`delete from patrocinio_lancamentos where organization_id = ${orgId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and motivo like 'trafego%'`);
    await db.update(organizations).set({ patrocinioSaldoCents: antesOrg.s }).where(eq(organizations.id, orgId));
    await limpar();
    await admin.req("PUT", "/api/admin/trafego/config", configAntes);
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
