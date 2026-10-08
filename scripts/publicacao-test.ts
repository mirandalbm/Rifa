/**
 * Prova da publicação da rifa, pela API de verdade: o apelido nasce no
 * cadastro (e não repete); a barra de ações (curtir com o trevo,
 * republicar, salvar, compartilhar) com os contadores sem `COUNT(*)` e sem
 * dobrar com toques simultâneos; salvos privados; republicações no perfil;
 * a legenda da organização (régua e recorte); o carrossel de até 10 peças;
 * o carrinho (rifa e quantidade vão, preço e disponibilidade voltam do
 * servidor, nada é reservado).
 *
 *   npm run publicacao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignMedia, campaignStats, campaigns, quotaAlloc, quotaPackages, users } from "../shared/schema";
import { MAX_CARROSSEL } from "../shared/publicacao";
import { priceOrder } from "../shared/pricing";

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

/* MP4 sintético: o servidor mede duração e tamanho pelo container. */
function caixa(tipo: string, conteudo: Buffer) {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(conteudo.length + 8, 0);
  h.write(tipo, 4, "ascii");
  return Buffer.concat([h, conteudo]);
}
function mp4(segundos: number, largura: number, altura: number) {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(segundos * 1000), 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeInt32BE(0x10000, 40);
  tkhd.writeInt32BE(0x10000, 56);
  tkhd.writeUInt32BE(largura * 65536, 76);
  tkhd.writeUInt32BE(altura * 65536, 80);
  const moov = caixa("moov", Buffer.concat([caixa("mvhd", mvhd), caixa("trak", caixa("tkhd", tkhd))]));
  return Buffer.concat([caixa("ftyp", Buffer.from("isomiso2avc1mp41", "ascii")), moov, caixa("mdat", Buffer.alloc(2048, 7))]);
}

/** O envio de verdade, nos três passos (URL assinada, o arquivo, a confirmação). */
async function enviarReels(quem: Cliente, campanhaId: string, arquivo: Buffer, legenda: string) {
  const t = await quem.req("POST", `/api/admin/campaigns/${campanhaId}/media/upload-url`, { role: "reels", filename: "r.mp4", mime: "video/mp4", bytes: arquivo.length });
  if (t.status !== 200) return t;
  const put = await fetch(URL + t.json.url, { method: "PUT", headers: { ...t.json.headers, Cookie: quem.cookie }, body: arquivo });
  if (!put.ok) return { status: put.status, json: null };
  return quem.req("POST", `/api/admin/campaigns/${campanhaId}/media`, { role: "reels", storageKey: t.json.storageKey, mime: "video/mp4", legenda });
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

    console.log("\n  o carrinho:");
    await db.insert(quotaPackages).values([
      { campaignId: rifa.id, quantity: 10, discountPct: 10, highlight: true },
      { campaignId: rifa.id, quantity: 25, discountPct: 15 },
    ]);
    r = await anon.req("GET", "/api/public/campaigns");
    checa("a vitrine diz que a rifa vende (a barra mostra carrinho e comprar)", r.json?.find((c: { slug: string }) => c.slug === SLUG)?.vende === true);
    r = await anon.req("POST", "/api/public/carrinho", {
      itens: [
        { slug: SLUG, quantidade: 0, precoCents: 1 },
        { slug: RASCUNHO, quantidade: 5 },
        { slug: "rifa-que-nao-existe", quantidade: 5 },
        { slug: "<script>", quantidade: 5 },
      ],
    });
    const [item, draft, sumiu] = r.json?.itens ?? [];
    checa("sem conta, o carrinho responde (200) e ignora o que não é rifa", r.status === 200 && r.json.itens.length === 3, `HTTP ${r.status} ${r.json?.itens?.length}`);
    checa(
      "quantidade 0 vira a sugerida (o pacote em destaque), com o total do servidor",
      item?.quantidade === 10 && item.totalCents === priceOrder({ quantity: 10, unitCents: 500, packages: [{ quantity: 10, discountPct: 10 }] }).totalCents,
      JSON.stringify({ q: item?.quantidade, t: item?.totalCents }),
    );
    checa("o preço mandado pelo aparelho não conta", item?.totalCents === 4500, `${item?.totalCents}`);
    checa("a promotora vem junto (o carrinho separa por organização)", Boolean(item?.organizacao?.slug) && item.vende === true);
    checa("rascunho e rifa inexistente voltam indisponíveis", draft?.indisponivel === true && sumiu?.indisponivel === true);
    r = await anon.req("POST", "/api/public/carrinho", { itens: [{ slug: SLUG, quantidade: 5000 }] });
    checa("quantidade acima do que resta é cortada", r.json?.itens?.[0]?.quantidade === 100, `${r.json?.itens?.[0]?.quantidade}`);
    const alocadas = await db.select({ n: sql<number>`count(*)::int` }).from(quotaAlloc).where(eq(quotaAlloc.campaignId, rifa.id));
    const [st] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, rifa.id));
    checa("o carrinho não reserva nada", alocadas[0].n === 0 && st.reservedCount === 0 && st.soldCount === 0);
    await db.update(campaigns).set({ travadaEm: new Date() }).where(eq(campaigns.id, rifa.id));
    r = await anon.req("POST", "/api/public/carrinho", { itens: [{ slug: SLUG, quantidade: 10 }] });
    checa("rifa travada fica no carrinho, mas não vende", r.json?.itens?.[0]?.vende === false);
    await db.update(campaigns).set({ travadaEm: null }).where(eq(campaigns.id, rifa.id));

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

    console.log("\n  reels:");
    const admin = new Cliente();
    await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
    const antes = (await anon.req("GET", "/api/public/app")).json?.reelsLigado === true;
    const ajustar = (ligado: boolean) => admin.req("PUT", "/api/admin/app", { avisoDoTrevo: { estilo: "ponto", cor: "verde" }, publicarApostador: false, reelsLigado: ligado });
    try {
      await ajustar(false);
      r = await anon.req("GET", "/api/public/reels");
      checa("desligado, a lista vem vazia", r.status === 200 && r.json?.ligado === false && r.json.itens.length === 0);
      r = await marina.req("PUT", "/api/admin/app", { reelsLigado: true });
      checa("organizador não liga o Reels (403)", r.status === 403, `HTTP ${r.status}`);
      await db.insert(campaignMedia).values([
        { campaignId: rifa.id, role: "video", position: 20, storageKey: "teste/reels-em-pe", mime: "video/mp4", width: 720, height: 1280, durationS: 30, status: "ready" },
        { campaignId: rascunho.id, role: "video", position: 20, storageKey: "teste/reels-rascunho", mime: "video/mp4", width: 720, height: 1280, durationS: 30, status: "ready" },
      ]);
      await ajustar(true);
      r = await anon.req("GET", "/api/public/reels?limite=50");
      const meu = r.json?.itens?.find((c: { slug: string }) => c.slug === SLUG);
      checa("ligado, a rifa com vídeo em pé aparece, com o vídeo escolhido", r.status === 200 && r.json?.ligado === true && Boolean(meu?.reels), JSON.stringify(r.json?.itens?.map((c: { slug: string }) => c.slug)));
      checa("rascunho não aparece", !r.json?.itens?.some((c: { slug: string }) => c.slug === RASCUNHO));
      await db.update(campaignMedia).set({ width: 1280, height: 720 }).where(eq(campaignMedia.storageKey, "teste/reels-em-pe"));
      r = await anon.req("GET", "/api/public/reels?limite=50");
      checa("vídeo deitado não é reels", !r.json?.itens?.some((c: { slug: string }) => c.slug === SLUG));
      r = await anon.req("GET", "/api/public/reels?aba=seguindo");
      checa("a aba Seguindo pede conta", r.status === 200 && r.json?.precisaEntrar === true && r.json.itens.length === 0);
      r = await anon.req("GET", "/api/public/reels?limite=1");
      checa("o lote respeita o limite", (r.json?.itens?.length ?? 0) <= 1);

      console.log("\n  reels publicado pela organização:");
      await db.update(campaignMedia).set({ width: 720, height: 1280 }).where(eq(campaignMedia.storageKey, "teste/reels-em-pe"));
      r = await enviarReels(marina, rifa.id, mp4(20, 1920, 1080), "");
      checa("vídeo deitado não entra no Reels (422)", r.status === 422 && /em pé/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await enviarReels(marina, rifa.id, mp4(240, 1080, 1920), "");
      checa("4 minutos não entram no Reels (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await enviarReels(marina, rifa.id, mp4(20, 1080, 1920), "Chama no 11 98888-7777");
      checa("legenda com telefone é recusada (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const recusados = await db.select({ id: campaignMedia.id }).from(campaignMedia).where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.role, "reels")));
      checa("nada recusado ficou gravado", recusados.length === 0, String(recusados.length));
      r = await enviarReels(marina, rifa.id, mp4(20, 1080, 1920), "Primeiro reels   da moto!");
      const reels1 = r.json;
      checa("reels em pé de 20 s entra, medido no servidor, com a legenda limpa", r.status === 201 && reels1?.role === "reels" && reels1?.durationS === 20 && reels1?.legenda === "Primeiro reels da moto!", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
      r = await enviarReels(marina, rifa.id, mp4(15, 1080, 1920), "Segundo reels");
      const reels2 = r.json;
      checa("o segundo também", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await anon.req("GET", `/api/public/campaigns/${SLUG}`);
      checa("o reels não entra no carrossel da página da rifa", r.status === 200 && !(r.json?.media ?? []).some((m: { role: string }) => m.role === "reels"), JSON.stringify((r.json?.media ?? []).map((m: { role: string }) => m.role)));
      r = await anon.req("GET", "/api/public/reels?limite=12");
      const meus = (r.json?.itens ?? []).filter((c: { slug: string }) => c.slug === SLUG);
      checa(
        "cada vídeo é um item, do mais antigo ao mais novo (o do carrossel e os do Reels)",
        meus.length === 3 && meus[1].reelsId === reels1?.id && meus[2].reelsId === reels2?.id && meus[0].id === rifa.id,
        JSON.stringify(meus.map((c: { reelsId: string }) => c.reelsId)),
      );
      checa("a legenda do item é a do vídeo", meus[1]?.legenda === "Primeiro reels da moto!", meus[1]?.legenda);
      r = await anon.req("GET", "/api/public/reels?limite=1");
      const primeiro = r.json?.itens?.[0]?.reelsId;
      r = await anon.req("GET", `/api/public/reels?limite=50&depois=${r.json?.proximo}`);
      checa("o lote seguinte anda pela posição, sem repetir", Boolean(primeiro) && !(r.json?.itens ?? []).some((c: { reelsId: string }) => c.reelsId === primeiro));
      r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/media/upload-url`, { role: "reels", filename: "r.mp4", mime: "video/mp4", bytes: 2048 });
      checa("com o carrossel cheio, o reels ainda cabe (não ocupa vaga dele)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await marina.req("PUT", `/api/admin/media/${reels1?.id}/legenda`, { legenda: "veja em https://golpe.example" });
      checa("trocar a legenda: link é 422", r.status === 422, `HTTP ${r.status}`);
      r = await marina.req("PUT", `/api/admin/media/${reels1?.id}/legenda`, { legenda: "Legenda nova" });
      checa("trocar a legenda", r.status === 200 && r.json?.legenda === "Legenda nova", JSON.stringify(r.json));
      const [foto] = await db.select({ id: campaignMedia.id }).from(campaignMedia).where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.role, "video")));
      r = await marina.req("PUT", `/api/admin/media/${foto?.id}/legenda`, { legenda: "x" });
      checa("vídeo do carrossel não tem legenda própria (409)", r.status === 409, `HTTP ${r.status}`);

      // Figurinhas do reels (Fase D): a régua das do story, sempre com a rifa do vídeo.
      console.log("\n  figurinhas do reels:");
      const figs = [
        { tipo: "contagem", x: 0.5, y: 0.2 },
        { tipo: "comprar", x: 0.5, y: 0.8 },
        { tipo: "texto", x: 0.25, y: 0.5, texto: "  Última   semana!  " },
        { tipo: "emoji", x: 0.75, y: 0.35, emoji: "🍀" },
      ];
      r = await marina.req("PUT", `/api/admin/media/${reels1?.id}/figurinhas`, { figurinhas: figs, posicao: "forjada" });
      checa(
        "as quatro figurinhas entram, com o texto limpo",
        r.status === 200 && r.json?.figurinhas?.length === 4 && r.json.figurinhas[2].texto === "Última semana!",
        `HTTP ${r.status} ${JSON.stringify(r.json)}`,
      );
      r = await anon.req("GET", "/api/public/reels?limite=50");
      const comFigs = ((r.json?.itens ?? []) as { reelsId: string; reelsFigurinhas?: { tipo: string; slug?: string; drawAt?: string }[] }[]).find((c) => c.reelsId === reels1?.id);
      const tipos = (comFigs?.reelsFigurinhas ?? []).map((f) => f.tipo);
      checa("o Reels leva as figurinhas do vídeo", tipos.join(",") === "contagem,comprar,texto,emoji", JSON.stringify(comFigs?.reelsFigurinhas));
      checa(
        "a contagem traz a data do sorteio da rifa e o Comprar o endereço dela (nada do navegador)",
        comFigs?.reelsFigurinhas?.[1]?.slug === SLUG && Boolean(comFigs?.reelsFigurinhas?.[0]?.drawAt),
        JSON.stringify(comFigs?.reelsFigurinhas?.slice(0, 2)),
      );
      for (const [nome, corpo] of [
        ["texto com telefone", [{ tipo: "texto", x: 0.5, y: 0.5, texto: "chama no 11 98888-7777" }]],
        ["cinco figurinhas", Array.from({ length: 5 }, () => ({ tipo: "emoji", x: 0.5, y: 0.5, emoji: "🍀" }))],
        ["duas contagens", [{ tipo: "contagem", x: 0.5, y: 0.2 }, { tipo: "contagem", x: 0.5, y: 0.4 }]],
        ["emoji fora da lista", [{ tipo: "emoji", x: 0.5, y: 0.5, emoji: "💣" }]],
        ["tipo inventado", [{ tipo: "html", x: 0.5, y: 0.5, html: "<script>" }]],
        ["posição fora da tela", [{ tipo: "comprar", x: 2, y: 0.5 }]],
      ] as [string, unknown][]) {
        r = await marina.req("PUT", `/api/admin/media/${reels1?.id}/figurinhas`, { figurinhas: corpo });
        checa(`figurinha recusada (${nome}): 422`, r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      }
      r = await marina.req("PUT", `/api/admin/media/${foto?.id}/figurinhas`, { figurinhas: [] });
      checa("vídeo do carrossel não leva figurinha (409)", r.status === 409, `HTTP ${r.status}`);
      r = await anon.req("PUT", `/api/admin/media/${reels1?.id}/figurinhas`, { figurinhas: [] });
      checa("figurinhas sem login: 401", r.status === 401, `HTTP ${r.status}`);
      r = await marina.req("PUT", `/api/admin/media/${reels1?.id}/figurinhas`, { figurinhas: [] });
      checa("lista vazia tira as figurinhas", r.status === 200 && r.json?.figurinhas?.length === 0, JSON.stringify(r.json));
      // O cursor no reels1 (o do meio: o reels2 vem depois); apagado o reels1, a fila não recomeça.
      r = await anon.req("GET", "/api/public/reels?limite=50");
      const todos = (r.json?.itens ?? []) as { reelsId: string }[];
      const meio = await anon.req("GET", `/api/public/reels?limite=${todos.findIndex((c) => c.reelsId === reels1?.id) + 1}`);
      await marina.req("DELETE", `/api/admin/media/${reels1?.id}`);
      r = await anon.req("GET", `/api/public/reels?limite=50&depois=${encodeURIComponent(meio.json?.proximo ?? "")}`);
      const seguintes = ((r.json?.itens ?? []) as { reelsId: string }[]).map((c) => c.reelsId);
      checa(
        "o último visto apagado não faz a fila recomeçar",
        Boolean(meio.json?.proximo) && seguintes.includes(reels2?.id) && !seguintes.includes(todos[0]?.reelsId),
        `${meio.json?.proximo} → ${JSON.stringify(seguintes)}`,
      );
      r = await marina.req("DELETE", `/api/admin/media/${reels2?.id}`);
      r = await anon.req("GET", "/api/public/reels?limite=50");
      checa("apagado, sai do Reels", !(r.json?.itens ?? []).some((c: { reelsId: string }) => c.reelsId === reels2?.id));

      // A última vaga: dois envios ao mesmo tempo, um entra.
      const jaTem = (await db.select({ id: campaignMedia.id }).from(campaignMedia).where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.role, "reels")))).length;
      await db.insert(campaignMedia).values(
        Array.from({ length: 9 - jaTem }, (_, i) => ({ campaignId: rifa.id, role: "reels" as const, position: 50 + i, storageKey: `teste/reels-cheio-${i}`, mime: "video/mp4", width: 720, height: 1280, durationS: 10, status: "ready" as const })),
      );
      const corrida = await Promise.all([enviarReels(marina, rifa.id, mp4(10, 1080, 1920), ""), enviarReels(marina, rifa.id, mp4(11, 1080, 1920), "")]);
      const total = (await db.select({ id: campaignMedia.id }).from(campaignMedia).where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.role, "reels")))).length;
      checa(
        "na última vaga, dois envios ao mesmo tempo: um 201 e um 409, e a rifa fica com 10",
        corrida.map((x) => x.status).sort().join(",") === "201,409" && total === 10,
        `${corrida.map((x) => x.status)} total ${total}`,
      );
    } finally {
      await ajustar(antes);
      await db.delete(campaignMedia).where(sql`storage_key like 'teste/reels-%'`);
      await db.delete(campaignMedia).where(and(eq(campaignMedia.campaignId, rifa.id), eq(campaignMedia.role, "reels")));
    }
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
