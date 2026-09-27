/**
 * Prova da publicação da rifa, pela API de verdade: o apelido nasce no
 * cadastro (e não repete); a barra de ações (curtir com o trevo,
 * republicar, salvar, compartilhar) com os contadores sem `COUNT(*)` e sem
 * dobrar com toques simultâneos; salvos privados; republicações no perfil;
 * a legenda da organização (régua e recorte); o carrossel de até 10 peças.
 *
 *   npm run publicacao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignMedia, campaignStats, campaigns, users } from "../shared/schema";
import { MAX_CARROSSEL } from "../shared/publicacao";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  constructor(readonly aparelho = `aparelho-${Math.random()}`) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-device-id": this.aparelho,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

/** CPF válido a partir de 9 dígitos — só desta prova. */
function cpf(base: string) {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const PESSOAS = [
  { nome: "Gabi Publica Souza", telefone: "11973330001", cpf: cpf("573104201"), apelido: "gabi.publica" },
  { nome: "Hugo Publica Lima", telefone: "11973330002", cpf: cpf("573104202"), apelido: "hugo_publica" },
  { nome: "Iris Publica Rocha", telefone: "11973330003", cpf: cpf("573104203"), apelido: "iris.publica" },
];
const SLUG = "publicacao-teste-rifa";
const RASCUNHO = "publicacao-teste-rascunho";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:%'`);
  await db.execute(sql`delete from campaigns where slug in (${SLUG}, ${RASCUNHO})`);
  await db.delete(buyers).where(inArray(buyers.phone, PESSOAS.map((p) => p.telefone)));
}

async function main() {
  console.log("\n=== publicação da rifa ===\n");
  await limpar();
  const marina = new Cliente();
  let r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const base = {
    organizationId: eu.org!,
    title: "Rifa publicada",
    prizeTitle: "Moto 0 km",
    totalQuotas: 100,
    priceCents: 500,
    drawAt: new Date(Date.now() + 7 * 86_400_000),
    authorizationCode: "SPA-PUBLICA",
  };
  const [rifa] = await db.insert(campaigns).values({ ...base, slug: SLUG, status: "published", publishedAt: new Date() }).returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });
  const [rascunho] = await db.insert(campaigns).values({ ...base, slug: RASCUNHO, status: "draft" }).returning();

  const [gabi, hugo, iris, anon] = [new Cliente(), new Cliente(), new Cliente(), new Cliente()];
  const contador = async () => (await db.select().from(campaigns).where(eq(campaigns.id, rifa.id)))[0];

  try {
    console.log("  apelido no cadastro:");
    const corpo = (p: (typeof PESSOAS)[number]) => ({ nome: p.nome, telefone: p.telefone, cpf: p.cpf, cep: "01310-100", senha: "senha-publica-1", lembrar: true });
    r = await gabi.req("POST", "/api/public/conta", corpo(PESSOAS[0]));
    checa("sem apelido o cadastro não sai (400)", r.status === 400 && /Apelido/.test(r.json?.message ?? ""), r.json?.message);
    r = await gabi.req("POST", "/api/public/conta", { ...corpo(PESSOAS[0]), apelido: "@Gabi.Publica" });
    const [g] = await db.select({ apelido: buyers.apelido }).from(buyers).where(eq(buyers.phone, PESSOAS[0].telefone));
    checa("o apelido entra no cadastro, em minúsculas e sem @", r.status < 300 && g?.apelido === "gabi.publica", `HTTP ${r.status} ${g?.apelido}`);
    r = await hugo.req("POST", "/api/public/conta", { ...corpo(PESSOAS[1]), apelido: "gabi.publica" });
    checa("apelido repetido: 409 (o índice decide)", r.status === 409 && /apelido/.test(r.json?.message ?? ""), r.json?.message);
    r = await hugo.req("POST", "/api/public/conta", { ...corpo(PESSOAS[1]), apelido: PESSOAS[1].apelido });
    r = await iris.req("POST", "/api/public/conta", { ...corpo(PESSOAS[2]), apelido: PESSOAS[2].apelido });
    checa("os outros cadastros saem", r.status < 300, `HTTP ${r.status}`);

    console.log("\n  a barra de ações:");
    const acao = (c: Cliente, a: string, ligar: boolean, slug = SLUG) => c.req("PUT", `/api/public/campaigns/${slug}/acoes/${a}`, { ligar });
    r = await acao(anon, "curtida", true);
    checa("sem conta: curtir dá 401", r.status === 401, `HTTP ${r.status}`);
    r = await acao(gabi, "curtida", true, RASCUNHO);
    checa("rascunho não tem publicação (404)", r.status === 404, `HTTP ${r.status}`);
    r = await acao(gabi, "desconhecida", true);
    checa("ação desconhecida: 404", r.status === 404, `HTTP ${r.status}`);
    const toques = await Promise.all(Array.from({ length: 5 }, () => acao(gabi, "curtida", true)));
    checa("cinco toques simultâneos, uma curtida", toques.every((t) => t.status === 200) && (await contador()).curtidasCount === 1, `${(await contador()).curtidasCount}`);
    r = await acao(hugo, "curtida", true);
    checa("a resposta traz o contador e a marca de quem tocou", r.json?.curtidas === 2 && r.json?.curti === true, JSON.stringify(r.json));
    r = await acao(hugo, "curtida", false);
    r = await acao(hugo, "curtida", false);
    checa("descurtir duas vezes desconta uma", (await contador()).curtidasCount === 1 && r.json?.curti === false);

    r = await acao(gabi, "republicacao", true);
    await acao(iris, "republicacao", true);
    checa("republicar conta", r.status === 200 && (await contador()).republicacoesCount === 2, `${(await contador()).republicacoesCount}`);
    await db.update(buyers).set({ apelido: null }).where(eq(buyers.phone, PESSOAS[1].telefone));
    r = await acao(hugo, "republicacao", true);
    checa("sem apelido não republica (aparece no perfil): 409", r.status === 409, `HTTP ${r.status}`);
    await db.update(buyers).set({ apelido: PESSOAS[1].apelido }).where(eq(buyers.phone, PESSOAS[1].telefone));
    r = await anon.req("GET", "/api/public/u/gabi.publica/republicacoes");
    checa("o perfil mostra o que foi republicado", r.status === 200 && r.json?.[0]?.slug === SLUG, `HTTP ${r.status}`);

    r = await acao(gabi, "salvo", true);
    checa("salvar não tem contador público", r.status === 200 && r.json?.salvei === true && !("salvos" in (r.json ?? {})));
    r = await gabi.req("GET", "/api/public/conta/salvos");
    checa("os salvos aparecem para a própria pessoa", r.status === 200 && r.json?.length === 1 && r.json[0].slug === SLUG);
    r = await hugo.req("GET", "/api/public/conta/salvos");
    checa("…e não para outra", r.status === 200 && r.json?.length === 0);
    r = await anon.req("GET", "/api/public/conta/salvos");
    checa("sem conta: 401", r.status === 401, `HTTP ${r.status}`);

    const aparelho = new Cliente("aparelho-fixo-publicacao");
    await Promise.all([aparelho.req("POST", `/api/public/campaigns/${SLUG}/compartilhamentos`), aparelho.req("POST", `/api/public/campaigns/${SLUG}/compartilhamentos`)]);
    await gabi.req("POST", `/api/public/campaigns/${SLUG}/compartilhamentos`);
    r = await gabi.req("POST", `/api/public/campaigns/${SLUG}/compartilhamentos`);
    checa("compartilhar conta uma vez por pessoa ou aparelho", r.json?.compartilhamentos === 2, JSON.stringify(r.json));

    r = await gabi.req("GET", "/api/public/campaigns");
    const cartao = r.json?.find((c: { slug: string }) => c.slug === SLUG);
    checa(
      "a vitrine traz os contadores e o que quem olha já fez",
      cartao?.interacoes?.curtidas === 1 && cartao.interacoes.republicacoes === 2 && cartao.interacoes.compartilhamentos === 2 && cartao.interacoes.curti && cartao.interacoes.salvei,
      JSON.stringify(cartao?.interacoes),
    );
    r = await hugo.req("GET", `/api/public/campaigns/${SLUG}`);
    checa("a página da rifa também", r.json?.campaign?.interacoes?.curtidas === 1 && r.json.campaign.interacoes.curti === false);

    console.log("\n  a legenda da organização:");
    const L = `/api/admin/campaigns/${rifa.id}/legenda`;
    r = await marina.req("PUT", L, { legenda: "Chama no zap 11 98765-4321" });
    checa("telefone na legenda: 422", r.status === 422, r.json?.message);
    r = await marina.req("PUT", L, { legenda: "compre em www.outro.com" });
    checa("link na legenda: 422", r.status === 422, r.json?.message);
    r = await marina.req("PUT", L, { legenda: "Moto 0 km   na garagem!\n\n\n\nSorteio pela Loteria Federal." });
    checa("legenda salva e limpa", r.status === 200 && r.json?.legenda === "Moto 0 km na garagem!\n\nSorteio pela Loteria Federal.", JSON.stringify(r.json));
    r = await anon.req("GET", `/api/public/campaigns/${SLUG}`);
    checa("a legenda sai na página", r.json?.campaign?.legenda?.startsWith("Moto 0 km"));
    r = await marina.req("PUT", L, { legenda: "" });
    checa("vazia apaga", r.status === 200 && r.json?.legenda === null);

    console.log("\n  carrossel de até 10 peças:");
    const pecas = Array.from({ length: MAX_CARROSSEL - 1 }, (_, i) => ({
      campaignId: rascunho.id,
      role: (i % 3 === 2 ? "video" : "photo") as "photo" | "video",
      position: i,
      storageKey: `teste/publicacao-${i}`,
      mime: i % 3 === 2 ? "video/mp4" : "image/jpeg",
      status: "ready" as const,
    }));
    await db.insert(campaignMedia).values(pecas);
    r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/media/upload-url`, { role: "photo", filename: "x.jpg", mime: "image/jpeg", bytes: 1000 });
    checa("com 9 fotos e vídeos, a décima (fora o banner) é recusada (409)", r.status === 409 && /10 peças/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/media/upload-url`, { role: "banner", filename: "b.jpg", mime: "image/jpeg", bytes: 1000 });
    checa("o banner ainda cabe (é a décima peça)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/admin/campaigns/${rifa.id}/media/upload-url`, { role: "video", filename: "v.mp4", mime: "video/mp4", bytes: 3 * 1024 * 1024 * 1024 });
    checa("vídeo acima de 2 GB é recusado antes do envio (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  } finally {
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
