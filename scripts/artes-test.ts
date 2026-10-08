/**
 * Prova das artes prontas (Fase A do `docs/PLANO-FERRAMENTAS.md`), contra a
 * API e o banco de verdade:
 * - o painel desenha a arte da própria rifa, nos três formatos, em JPEG com a
 *   medida certa; a rifa do vizinho é 404 (também no `npm run isolation`);
 * - só existe a arte que a rifa tem agora: tipo ou formato desconhecido,
 *   resultado antes do sorteio, rifa de demonstração ou travada são 404;
 * - o afiliado só tem arte da rifa em que recebe comissão, e o link do QR
 *   leva o código dele, tirado da sessão — `?ref=` na URL não muda nada;
 * - desenhar tem limite por pessoa (429);
 * - o editor de imagem (Fase C), no painel e no kit do afiliado (o QR com o
 *   código dele, só onde recebe): os dados da própria rifa (preço e selo do
 *   banco), o texto conferido antes de virar imagem — link e telefone são
 *   422, o Pix por fora é 422 e vira denúncia —, o vizinho 404 e o limite.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { affiliates, afiliadoVinculos, campaignStats, campaigns, denuncias, organizations, users } from "../shared/schema";
import { CONFERENCIAS_POR_JANELA, camadaNova } from "../shared/editorImagem";
import { ARTES_POR_JANELA, PACOTES_POR_JANELA } from "../server/routes/artesRotas";

/** Os arquivos do ZIP (pelo diretório central): nome e conteúdo. */
function lerZip(zip: Buffer): Map<string, Buffer> {
  const fim = zip.length - 22;
  if (zip.readUInt32LE(fim) !== 0x06054b50) throw new Error("ZIP sem o fim do diretório");
  const arquivos = new Map<string, Buffer>();
  let p = zip.readUInt32LE(fim + 16);
  for (let i = 0; i < zip.readUInt16LE(fim + 10); i++) {
    const tamanho = zip.readUInt32LE(p + 24);
    const n = zip.readUInt16LE(p + 28);
    const nome = zip.subarray(p + 46, p + 46 + n).toString("utf8");
    const local = zip.readUInt32LE(p + 42);
    const ln = zip.readUInt16LE(local + 26);
    arquivos.set(nome, zip.subarray(local + 30 + ln, local + 30 + ln + tamanho));
    p += 46 + n;
  }
  return arquivos;
}

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
    const corpoLido = tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, tipo, json: tipo.includes("json") ? (corpoLido as any) : null, bytes: corpoLido instanceof Buffer ? corpoLido : null, headers: r.headers };
  }
}

const SLUGS = ["artes-teste-org-a", "artes-teste-org-b"];
const EMAILS = ["artes-org-a@teste.rifa", "artes-org-b@teste.rifa", "artes-afiliado@teste.rifa", "artes-afiliado-sem@teste.rifa"];
const CODIGOS = ["ARTEAF01", "ARTEAF02"];
const SENHA = "senha-das-artes-1";
const DIA = 86_400_000;

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from draws where campaign_id in ${l}`);
      await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    }
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
    await db.delete(denuncias).where(inArray(denuncias.organizationId, ids));
  }
  const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, EMAILS));
  if (us.length) await db.delete(affiliates).where(inArray(affiliates.userId, us.map((u) => u.id)));
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'arte:%' or bucket like 'arte-pacote:%' or bucket like 'editor:%'`);
}

async function rifa(orgId: string, slug: string, extra: Partial<typeof campaigns.$inferInsert> = {}) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug,
      title: `Rifa ${slug}`,
      prizeTitle: "Moto 0 km com documentação",
      totalQuotas: 1000,
      priceCents: 1500,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 10 * DIA),
      authorizationCode: "SPA-ARTE-1",
      metodoApuracao: "federal_direta",
      ...extra,
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id, soldCount: 400 });
  return c;
}

async function entrar(email: string) {
  const c = new Cliente();
  const r = await c.req("POST", "/api/auth/login", { email, password: SENHA });
  if (r.status !== 200) throw new Error(`login de ${email}: HTTP ${r.status}`);
  return c;
}

async function main() {
  console.log("\n=== artes prontas ===\n");
  await limpar();
  const orgs: { id: string }[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Artes ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", destaqueClaro: "#1d4ed8" })
      .returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
  }
  const affIds: string[] = [];
  for (const [i, code] of CODIGOS.entries()) {
    const [u] = await db
      .insert(users)
      .values({ role: "affiliate", organizationId: null, name: `Afiliado ${i}`, email: EMAILS[2 + i], passwordHash: await hashPassword(SENHA) })
      .returning({ id: users.id });
    const [a] = await db.insert(affiliates).values({ userId: u.id, code, status: "active" }).returning({ id: affiliates.id });
    affIds.push(a.id);
  }
  // Só o primeiro afiliado tem vínculo aprovado com a organização A.
  await db.insert(afiliadoVinculos).values({ affiliateId: affIds[0], organizationId: orgs[0].id, status: "aprovado", decididoEm: new Date() });

  try {
    const a = await rifa(orgs[0].id, "artes-teste-a");
    const b = await rifa(orgs[1].id, "artes-teste-b");
    const orgA = await entrar(EMAILS[0]);
    let ultimoDoEditor = 0;

    // ------------------------------------------------ painel
    let r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes`);
    checa("a lista da própria rifa", r.status === 200, `HTTP ${r.status}`);
    const tipos = (r.json?.artes ?? []).map((x: { tipo: string }) => x.tipo).join(",");
    checa("a rifa no ar tem arte da rifa, faltam e data — sem resultado", tipos === "rifa,faltam,contagem", tipos);
    checa("o link do painel não leva código de afiliado", typeof r.json?.link === "string" && r.json.link.endsWith("/r/artes-teste-a"), r.json?.link);

    const medidas = { retrato: [1080, 1350], quadrado: [1080, 1080], vertical: [1080, 1920] } as const;
    for (const [formato, [w, h]] of Object.entries(medidas)) {
      r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/faltam?formato=${formato}`);
      const meta = r.bytes ? await sharp(r.bytes).metadata() : null;
      checa(`arte "faltam" ${formato} em JPEG ${w}×${h}`, r.status === 200 && r.tipo.startsWith("image/jpeg") && meta?.width === w && meta?.height === h, `HTTP ${r.status} ${meta?.width}×${meta?.height}`);
    }
    checa("a arte não fica em cache compartilhado", r.headers.get("cache-control") === "private, max-age=60", r.headers.get("cache-control") ?? "");
    checa("sem metadados na arte", !(r.bytes && (await sharp(r.bytes).metadata()).exif));

    for (const [nome, caminho] of [
      ["tipo desconhecido", `/api/admin/campaigns/${a.id}/artes/inventada`],
      ["formato desconhecido", `/api/admin/campaigns/${a.id}/artes/rifa?formato=gigante`],
      ["resultado antes do sorteio", `/api/admin/campaigns/${a.id}/artes/resultado`],
      ["cota premiada sem nenhuma reclamada", `/api/admin/campaigns/${a.id}/artes/premiada`],
      ["a lista da rifa do vizinho", `/api/admin/campaigns/${b.id}/artes`],
      ["a arte da rifa do vizinho", `/api/admin/campaigns/${b.id}/artes/rifa`],
    ] as const) {
      r = await orgA.req("GET", caminho);
      checa(`${nome} é 404`, r.status === 404, `HTTP ${r.status}`);
    }

    // Demonstração e travada: nenhuma arte (seria anunciar o que não vende).
    await db.update(campaigns).set({ demonstracao: true }).where(eq(campaigns.id, a.id));
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes`);
    checa("rifa de demonstração não tem arte", r.status === 200 && r.json?.artes?.length === 0, JSON.stringify(r.json?.artes));
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/rifa`);
    checa("a arte da demonstração é 404", r.status === 404, `HTTP ${r.status}`);
    await db.update(campaigns).set({ demonstracao: false, travadaEm: new Date() }).where(eq(campaigns.id, a.id));
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/rifa`);
    checa("a arte da rifa travada é 404", r.status === 404, `HTTP ${r.status}`);
    await db.update(campaigns).set({ travadaEm: null }).where(eq(campaigns.id, a.id));

    // Esgotada: sai o "faltam".
    await db.update(campaignStats).set({ soldCount: 1000 }).where(eq(campaignStats.campaignId, a.id));
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/faltam`);
    checa("rifa esgotada não tem 'faltam'", r.status === 404, `HTTP ${r.status}`);
    await db.update(campaignStats).set({ soldCount: 400 }).where(eq(campaignStats.campaignId, a.id));

    // Sorteada: a arte do resultado aparece (o número como a tela mostra).
    const sorteada = await rifa(orgs[0].id, "artes-teste-sorteada", { status: "drawn", drawAt: new Date(Date.now() - DIA) });
    await db.execute(sql`insert into draws (campaign_id, seed, seed_hash, result_number, winner_number, executed_at) values (${sorteada.id}, 'semente', 'hash', 140, 140, now())`);
    r = await orgA.req("GET", `/api/admin/campaigns/${sorteada.id}/artes`);
    const tiposSorteada = (r.json?.artes ?? []).map((x: { tipo: string }) => x.tipo).join(",");
    checa("a rifa sorteada só tem a arte do resultado", tiposSorteada === "resultado", tiposSorteada);
    r = await orgA.req("GET", `/api/admin/campaigns/${sorteada.id}/artes/resultado?formato=quadrado`);
    checa("a arte do resultado sai", r.status === 200 && r.tipo.startsWith("image/jpeg"), `HTTP ${r.status}`);

    // ------------------------------------------------ pacote (Fase G)
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes`);
    const legendaDaLista = r.json?.artes?.find((x: { tipo: string }) => x.tipo === "rifa")?.legenda ?? "";
    checa("a legenda do painel leva o endereço curto da rifa", /\/c\/[A-Za-z0-9]+/.test(legendaDaLista) && !legendaDaLista.includes("#publi"), legendaDaLista.split("\n").join(" | "));
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/faltam/pacote`);
    checa("o pacote é um ZIP para baixar", r.status === 200 && r.tipo.startsWith("application/zip") && (r.headers.get("content-disposition") ?? "").startsWith("attachment"), `HTTP ${r.status} ${r.tipo}`);
    const pacote = r.bytes ? lerZip(r.bytes) : new Map<string, Buffer>();
    checa("o pacote traz os três formatos e a legenda", [...pacote.keys()].sort().join(",") === "arte-artes-teste-a-faltam-quadrado.jpg,arte-artes-teste-a-faltam-retrato.jpg,arte-artes-teste-a-faltam-vertical.jpg,legenda.txt", [...pacote.keys()].join(","));
    const vertical = pacote.get("arte-artes-teste-a-faltam-vertical.jpg");
    checa("a arte do pacote é a de 9:16", Boolean(vertical) && (await sharp(vertical!).metadata()).height === 1920);
    checa("a legenda do pacote diz quantas faltam", (pacote.get("legenda.txt")?.toString("utf8") ?? "").includes("Faltam 600 cotas"));
    r = await orgA.req("GET", `/api/admin/campaigns/${b.id}/artes/rifa/pacote`);
    checa("o pacote da rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/resultado/pacote`);
    checa("pacote de arte que a rifa não tem é 404", r.status === 404, `HTTP ${r.status}`);

    // ------------------------------------------------ afiliado
    const comVinculo = await entrar(EMAILS[2]);
    const semVinculo = await entrar(EMAILS[3]);
    r = await comVinculo.req("GET", "/api/affiliate/artes/artes-teste-a?ref=OUTRO");
    checa("o afiliado com vínculo vê as artes", r.status === 200 && r.json?.artes?.length === 3, `HTTP ${r.status}`);
    checa("o QR leva o código dele, não o da URL", typeof r.json?.link === "string" && r.json.link.endsWith(`/r/artes-teste-a?ref=${CODIGOS[0]}`), r.json?.link);
    const legendaDoKit = r.json?.artes?.find((x: { tipo: string }) => x.tipo === "rifa")?.legenda ?? "";
    checa("a legenda do afiliado leva o link dele e o #publi", legendaDoKit.includes(`?ref=${CODIGOS[0]}`) && legendaDoKit.endsWith("#publi"), legendaDoKit.split("\n").join(" | "));
    r = await comVinculo.req("GET", "/api/affiliate/artes/artes-teste-a/rifa/pacote");
    const doKit = r.bytes && r.status === 200 ? lerZip(r.bytes) : new Map<string, Buffer>();
    checa("o afiliado baixa o pacote com a legenda dele", (doKit.get("legenda.txt")?.toString("utf8") ?? "").includes(`?ref=${CODIGOS[0]}`), `HTTP ${r.status}`);
    r = await semVinculo.req("GET", "/api/affiliate/artes/artes-teste-a/rifa/pacote");
    checa("o afiliado sem vínculo não tem o pacote", r.status === 404, `HTTP ${r.status}`);
    r = await comVinculo.req("GET", "/api/affiliate/links");
    const textos: string[] = r.json?.find((l: { slug: string }) => l.slug === "artes-teste-a")?.texts ?? [];
    checa(
      "os textos do kit levam #publi, a autorização e nenhum 'últimas cotas' (termo, cláusula 7)",
      textos.length === 3 && textos.every((t) => t.includes("#publi") && t.includes("SPA-ARTE-1") && !/últimas/i.test(t)),
      textos.join(" || "),
    );
    r = await comVinculo.req("GET", "/api/affiliate/artes/artes-teste-a/rifa?formato=vertical");
    const meta = r.bytes ? await sharp(r.bytes).metadata() : null;
    checa("o afiliado baixa a arte 9:16", r.status === 200 && meta?.height === 1920, `HTTP ${r.status}`);
    r = await comVinculo.req("GET", "/api/affiliate/artes/artes-teste-b");
    checa("rifa de organização sem vínculo é 404", r.status === 404, `HTTP ${r.status}`);
    r = await semVinculo.req("GET", "/api/affiliate/artes/artes-teste-a/rifa");
    checa("o afiliado sem vínculo não tem a arte", r.status === 404, `HTTP ${r.status}`);
    r = await comVinculo.req("GET", "/api/affiliate/artes/nao-existe");
    checa("rifa inexistente é 404", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/affiliate/artes/artes-teste-a");
    checa("a organização não entra pela porta do afiliado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);
    // ------------------------------------------------ editor no kit do afiliado
    r = await comVinculo.req("GET", "/api/affiliate/editor/artes-teste-a?ref=OUTRO");
    checa("o afiliado com vínculo abre o editor", r.status === 200, `HTTP ${r.status}`);
    checa("o QR do editor leva o código dele, não o da URL", typeof r.json?.link === "string" && r.json.link.endsWith("?ref=ARTEAF01"), r.json?.link);
    checa("o preço e o selo do editor saem da rifa", r.json?.oficiais?.selo === "Autorizada SPA/MF nº SPA-ARTE-1", JSON.stringify(r.json?.oficiais));
    r = await semVinculo.req("GET", "/api/affiliate/editor/artes-teste-a");
    checa("o afiliado sem vínculo não tem o editor", r.status === 404, `HTTP ${r.status}`);
    r = await comVinculo.req("GET", "/api/affiliate/editor/artes-teste-b");
    checa("rifa de organização sem vínculo não tem editor", r.status === 404, `HTTP ${r.status}`);
    r = await semVinculo.req("POST", "/api/affiliate/editor/artes-teste-a/conferir", { camadas: [] });
    checa("o afiliado sem vínculo não confere texto", r.status === 404, `HTTP ${r.status}`);
    r = await comVinculo.req("POST", "/api/affiliate/editor/artes-teste-a/conferir", { camadas: [{ ...camadaNova("texto"), texto: "Concorra a uma moto" }, camadaNova("qr")] });
    checa("texto limpo do afiliado passa", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await comVinculo.req("POST", "/api/affiliate/editor/artes-teste-a/conferir", { camadas: [{ ...camadaNova("texto"), texto: "chave pix no meu perfil" }] });
    checa("Pix por fora do afiliado é 422", r.status === 422, `HTTP ${r.status}`);
    let denunciaDoAfiliado = null;
    for (let i = 0; i < 20 && !denunciaDoAfiliado; i++) {
      [denunciaDoAfiliado] = await db
        .select({ evidencia: denuncias.evidencia })
        .from(denuncias)
        .where(and(eq(denuncias.organizationId, orgs[0].id), sql`${denuncias.evidencia} like '%afiliado ARTEAF01%'`));
      if (!denunciaDoAfiliado) await new Promise((ok) => setTimeout(ok, 100));
    }
    checa("vira denúncia como texto de terceiro", Boolean(denunciaDoAfiliado?.evidencia?.includes("texto de terceiro (afiliado ARTEAF01)")), denunciaDoAfiliado?.evidencia ?? "nenhuma");
    r = await orgA.req("GET", "/api/affiliate/editor/artes-teste-a");
    checa("a organização não entra no editor pela porta do afiliado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);
    r = await comVinculo.req("GET", `/api/admin/campaigns/${a.id}/editor`);
    checa("o afiliado não abre o editor do painel", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    r = await new Cliente().req("GET", `/api/admin/campaigns/${a.id}/artes/rifa`);
    checa("sem login, a arte do painel é 401", r.status === 401, `HTTP ${r.status}`);

    // ------------------------------------------------ editor de imagem (Fase C)
    r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/editor`);
    checa("os dados do editor da própria rifa", r.status === 200 && r.json?.slug === "artes-teste-a", `HTTP ${r.status}`);
    checa("o preço e o selo saem da rifa", r.json?.oficiais?.preco?.includes("15,00") && r.json?.oficiais?.selo === "Autorizada SPA/MF nº SPA-ARTE-1", JSON.stringify(r.json?.oficiais));
    checa("os dados do editor não ficam em cache", r.headers.get("cache-control") === "no-store", r.headers.get("cache-control") ?? "");
    r = await orgA.req("GET", `/api/admin/campaigns/${b.id}/editor`);
    checa("o editor da rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    const texto = (t: string) => [{ ...camadaNova("texto"), texto: t }, camadaNova("preco"), camadaNova("selo"), camadaNova("qr")];
    r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: texto("Sorteio neste sábado") });
    checa("texto limpo passa a conferência", r.status === 200 && r.json?.camadas?.length === 4, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: texto("veja em golpe.com") });
    checa("link no texto da imagem é 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: texto("chama no 84 99999-1234") });
    checa("telefone no texto da imagem é 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: texto("faz um pix direto pra mim") });
    checa("Pix por fora no texto da imagem é 422", r.status === 422, `HTTP ${r.status}`);
    let denuncia = null;
    for (let i = 0; i < 20 && !denuncia; i++) {
      [denuncia] = await db
        .select({ evidencia: denuncias.evidencia })
        .from(denuncias)
        .where(and(eq(denuncias.organizationId, orgs[0].id), sql`${denuncias.evidencia} like 'texto do editor de imagem%'`));
      if (!denuncia) await new Promise((ok) => setTimeout(ok, 100));
    }
    checa("o Pix por fora vira denúncia automática", Boolean(denuncia?.evidencia?.includes("editor de imagem")), denuncia?.evidencia ?? "nenhuma");
    r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: [{ tipo: "html", x: 0.5, y: 0.5, tamanho: 0.1 }] });
    checa("camada desconhecida é 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${b.id}/editor/conferir`, { camadas: texto("Sorteio") });
    checa("conferir na rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: [] });
    checa("sem login, conferir é 401", r.status === 401, `HTTP ${r.status}`);
    await db.execute(sql`delete from rate_events where bucket like 'editor:%'`);
    for (let i = 0; i <= CONFERENCIAS_POR_JANELA.limite; i++) {
      ultimoDoEditor = (await orgA.req("POST", `/api/admin/campaigns/${a.id}/editor/conferir`, { camadas: [] })).status;
    }
    checa(`passou de ${CONFERENCIAS_POR_JANELA.limite} conferências em ${CONFERENCIAS_POR_JANELA.minutos} min: 429`, ultimoDoEditor === 429, `HTTP ${ultimoDoEditor}`);

    // ------------------------------------------------ limite
    await db.execute(sql`delete from rate_events where bucket like 'arte:%'`);
    let ultimo = 0;
    for (let i = 0; i <= ARTES_POR_JANELA.limite; i++) {
      ultimo = (await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/rifa`)).status;
    }
    checa(`passou de ${ARTES_POR_JANELA.limite} artes em ${ARTES_POR_JANELA.minutos} min: 429`, ultimo === 429, `HTTP ${ultimo}`);
    await db.execute(sql`delete from rate_events where bucket like 'arte-pacote:%'`);
    for (let i = 0; i <= PACOTES_POR_JANELA.limite; i++) {
      ultimo = (await orgA.req("GET", `/api/admin/campaigns/${a.id}/artes/rifa/pacote`)).status;
    }
    checa(`passou de ${PACOTES_POR_JANELA.limite} pacotes em ${PACOTES_POR_JANELA.minutos} min: 429`, ultimo === 429, `HTTP ${ultimo}`);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
