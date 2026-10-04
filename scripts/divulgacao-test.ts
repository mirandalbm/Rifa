/**
 * Prova da divulgação de terceiros (afiliado influenciador e apostador),
 * pela API de verdade:
 *
 * - o afiliado sem vínculo, com vínculo pendente, ou sem o aceite do termo da
 *   rifa é barrado (403) — a mesma régua da comissão;
 * - modo da organização: padrão pede autorização; no modo direto a peça já
 *   nasce no ar; o modo só muda pela dona (o vizinho não mexe);
 * - texto com link, telefone ou Pix por fora é recusado (422) e o Pix por
 *   fora vira denúncia automática;
 * - decisão dupla: dois cliques ao mesmo tempo, um 200 e um 409;
 * - recorte entre duas organizações: o pedido do vizinho é 404 (ler e
 *   decidir) e a fila de uma não traz a da outra;
 * - nada da rifa muda (preço, cotas, prêmio, título);
 * - o afiliado só escolhe mídia da própria rifa;
 * - perder o vínculo tira a peça do ar;
 * - apostador: interruptor desligado = 404; ligado, só com compra paga, só
 *   texto e sempre com autorização;
 * - vídeo próprio do afiliado: medido no servidor (longo, pesado ou que não
 *   abre é recusado), foto ou vídeo (nunca os dois), sempre pela organização,
 *   as três portas com `Range` e o recorte, e recusado ou retirado sai do banco;
 *   o apostador não manda vídeo.
 *
 *   npm run divulgacao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";
import sharp from "sharp";
import { affiliates, campaignMedia, campaignStats, campaigns, denuncias, divulgacaoFotos, divulgacaoVideos, divulgacoes, notificacoes, orders, organizations, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

/** Lê uma foto (bytes), para conferir a porta que a serve. */
async function foto(cliente: { cookie: string } | null, caminho: string) {
  const r = await fetch(URL + caminho, { headers: cliente?.cookie ? { Cookie: cliente.cookie } : {} });
  return { status: r.status, tipo: r.headers.get("content-type") ?? "", cache: r.headers.get("cache-control") ?? "" };
}

/** Uma foto de verdade (PNG pequeno), em data URL. */
async function pngDe(cor: string) {
  const b = await sharp({ create: { width: 40, height: 30, channels: 3, background: cor } }).png().toBuffer();
  return `data:image/png;base64,${b.toString("base64")}`;
}

/* MP4 sintético: o servidor mede duração e tamanho pelo container (a mesma régua do story). */
function caixa(tipo: string, conteudo: Buffer) {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(conteudo.length + 8, 0);
  h.write(tipo, 4, "ascii");
  return Buffer.concat([h, conteudo]);
}
function mp4(segundos: number, largura: number, altura: number, extra = 2048) {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(segundos * 1000), 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeInt32BE(0x10000, 40);
  tkhd.writeInt32BE(0x10000, 56);
  tkhd.writeUInt32BE(largura * 65536, 76);
  tkhd.writeUInt32BE(altura * 65536, 80);
  const moov = caixa("moov", Buffer.concat([caixa("mvhd", mvhd), caixa("trak", caixa("tkhd", tkhd))]));
  const arquivo = Buffer.concat([caixa("ftyp", Buffer.from("isomiso2avc1mp41", "ascii")), moov, caixa("mdat", Buffer.alloc(extra, 7))]);
  return { arquivo, url: `data:video/mp4;base64,${arquivo.toString("base64")}` };
}

/** Lê um vídeo com `Range`, para conferir o 206 (o Safari não toca sem ele). */
async function faixa(cliente: { cookie: string } | null, caminho: string) {
  const r = await fetch(URL + caminho, { headers: { Range: "bytes=0-9", ...(cliente?.cookie ? { Cookie: cliente.cookie } : {}) } });
  return { status: r.status, tipo: r.headers.get("content-type") ?? "", faixa: r.headers.get("content-range") ?? "", bytes: Buffer.from(await r.arrayBuffer()).length };
}

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

const SLUGS = ["divulgacao-teste-a", "divulgacao-teste-b"];
const EMAILS = ["divulgacao-org-a@teste.rifa", "divulgacao-org-b@teste.rifa", "divulgacao-afiliado@teste.rifa"];
const SENHA = "senha-divulgacao-1";
const TEL_AFILIADO = "11955550000";
const TEL_APOSTADOR = "11955551111";

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.raw(`('${ids.join("','")}')`);
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from quota_alloc where campaign_id in ${l}`);
      await db.execute(sql`delete from free_pool where campaign_id in ${l}`);
      await db.execute(sql`delete from commissions where campaign_id in ${l}`);
      await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in ${l})`);
      await db.execute(sql`delete from orders where campaign_id in ${l}`);
    }
    await db.execute(sql`delete from denuncias where organization_id in ${lista}`);
    await db.execute(sql`delete from termo_aceites where termo_id in (select id from organizacao_termos where organization_id in ${lista})`);
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email in ${sql.raw(`('${EMAILS.join("','")}')`)})`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1195555%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'divulgacao:%'`);
}

async function novaRifa(orgId: string, sufixo: string, status: "draft" | "published") {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `divulgacao-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-DV-${sufixo}`,
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  if (status === "published") await db.insert(campaignStats).values({ campaignId: c.id });
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `x-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `y-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

async function main() {
  console.log("\n=== divulgação de terceiros ===\n");
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do admin: HTTP ${r.status}`);
  const app0 = (await new Cliente().req("GET", "/api/public/app")).json;
  const ajustarApostador = (ligado: boolean) => admin.req("PUT", "/api/admin/app", { ...app0, publicarApostador: ligado });

  const orgs: { id: string; slug: string }[] = [];
  const organizadores: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Divulgação ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date() })
      .returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    organizadores.push(c);
  }
  const [A, B] = orgs;
  const [orgA, orgB] = organizadores;
  const a1 = await novaRifa(A.id, "a1", "published");
  const b1 = await novaRifa(B.id, "b1", "published");
  const [antes] = await db.select().from(campaigns).where(eq(campaigns.id, a1.id));

  try {
    // ---------------------------------------------------------- afiliado
    const anon = new Cliente();
    r = await anon.req("POST", "/api/public/afiliados/cadastro", { name: "Ana Influencer", email: EMAILS[2], phone: TEL_AFILIADO, password: SENHA });
    if (r.status !== 201) throw new Error(`cadastro do afiliado: HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigo = r.json.code as string;
    const afiliada = new Cliente();
    await afiliada.req("POST", "/api/auth/login", { email: EMAILS[2], password: SENHA });
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.code, codigo));
    // A decisão leva a versão lida (obrigatória): a prova manda a do banco, salvo quando testa outra.
    const dec = async (c: Cliente, id: string, corpo: Record<string, unknown>) => {
      const [d] = await db.select({ versao: divulgacoes.versao }).from(divulgacoes).where(eq(divulgacoes.id, id));
      return c.req("POST", `/api/admin/divulgacoes/${id}`, { versao: d?.versao ?? 0, ...corpo });
    };
    const peca = (slug: string, extra: Record<string, unknown> = {}) => afiliada.req("POST", "/api/affiliate/divulgacoes", { slug, legenda: "Bora participar dessa rifa!", ...extra });

    r = await peca(a1.slug);
    checa("sem vínculo, o afiliado é barrado (403)", r.status === 403, `HTTP ${r.status}`);
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/rifas");
    checa("sem vínculo, nenhuma rifa para divulgar", Array.isArray(r.json) && r.json.length === 0);

    await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, {});
    r = await peca(a1.slug);
    checa("vínculo pendente ainda é barrado (403)", r.status === 403, `HTTP ${r.status}`);

    r = await orgA.req("PATCH", `/api/admin/affiliates/${aff.id}`, { status: "active" });
    checa("a organização aprova o vínculo", r.status === 200);
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/rifas");
    const rifaA = r.json?.find((x: any) => x.slug === a1.slug);
    checa("agora a rifa dela aparece, com as mídias para escolher", Boolean(rifaA) && rifaA.midias.length === 2 && !r.json.some((x: any) => x.slug === b1.slug));
    r = await peca(b1.slug);
    checa("na rifa de outra organização, sem vínculo, 403", r.status === 403, `HTTP ${r.status}`);

    // Modo padrão: pede autorização.
    r = await orgA.req("GET", "/api/admin/divulgacoes/config");
    checa("o modo nasce pedindo autorização", r.json?.modo === "autorizacao", JSON.stringify(r.json));
    r = await peca(a1.slug, { midias: [rifaA.midias[0].id] });
    checa("no modo padrão a peça espera a organização", r.status === 201 && r.json?.status === "em_analise", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const id1 = r.json?.id as string;
    r = await peca(a1.slug);
    checa("uma em análise por rifa (409)", r.status === 409, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    checa("em análise não aparece na página da rifa", Array.isArray(r.json) && r.json.length === 0);

    // Texto.
    r = await peca(a1.slug, { legenda: "Compre em https://golpe.com" });
    checa("link na legenda: 422", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { legenda: "Me chama 11 98888-7777" });
    checa("telefone na legenda: 422", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { legenda: "Faz um pix pra mim que eu garanto sua cota" });
    checa("Pix por fora: 422", r.status === 422, `HTTP ${r.status}`);
    await new Promise((x) => setTimeout(x, 400));
    const [{ n: denunciadas }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(denuncias)
      .where(and(eq(denuncias.organizationId, A.id), eq(denuncias.origem, "automatica"), eq(denuncias.motivo, "pix_fora")));
    checa("o Pix por fora vira denúncia automática", denunciadas === 1, String(denunciadas));
    r = await peca(a1.slug, { legenda: "Paguei com Pix pelo site, é tranquilo" });
    checa("falar do Pix pelo site (o caminho certo) não é barrado como texto", r.status === 409, `HTTP ${r.status} (409 = já há uma em análise)`);

    // Mídia de outra rifa e de nada.
    await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${id1}`);
    const [mediaDaB] = await db.select().from(campaignMedia).where(eq(campaignMedia.campaignId, b1.id));
    r = await peca(a1.slug, { midias: [mediaDaB.id] });
    checa("mídia de outra rifa: 422", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { fotos: Array(5).fill(await pngDe("#15803d")) });
    checa("o afiliado manda no máximo 4 fotos próprias (422)", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { midias: ["../../etc/passwd"] });
    checa("mídia que não é id: 422", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { legenda: "" });
    checa("sem legenda e sem mídia: 422", r.status === 422, `HTTP ${r.status}`);

    // Recorte da fila.
    r = await peca(a1.slug, { midias: [rifaA.midias[1].id] });
    const id2 = r.json?.id as string;
    checa("nova peça em análise", r.status === 201 && r.json?.status === "em_analise");
    r = await orgA.req("GET", "/api/admin/chamados/pendentes");
    checa("o sino da A conta a peça esperando a autorização dela", (r.json?.divulgacoes ?? 0) >= 1, JSON.stringify(r.json));
    r = await orgB.req("GET", "/api/admin/chamados/pendentes");
    checa("o sino da B não conta a peça da A", r.json?.divulgacoes === 0, JSON.stringify(r.json));
    r = await afiliada.req("POST", "/api/affiliate/avisos/vistos");
    checa("o afiliado marca o sino como visto (204)", r.status === 204, `HTTP ${r.status}`);
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/novidades");
    checa("antes da decisão, nada decidido para o afiliado", r.json?.decididas === 0, JSON.stringify(r.json));
    r = await orgB.req("GET", "/api/admin/divulgacoes");
    checa("a B não vê a fila da A", Array.isArray(r.json) && !r.json.some((x: any) => x.id === id2));
    r = await orgA.req("GET", "/api/admin/divulgacoes");
    const naFila = r.json?.find((x: any) => x.id === id2);
    checa("a A vê, com o nome curto e o código — sem telefone nem e-mail", Boolean(naFila) && naFila.quem.includes(codigo) && !JSON.stringify(r.json).includes(TEL_AFILIADO) && !JSON.stringify(r.json).includes(EMAILS[2]));
    r = await dec(orgB, id2, { acao: "aprovar" });
    checa("a B não aprova a peça da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgB.req("PUT", "/api/admin/divulgacoes/config", { modo: "direta" });
    r = await orgA.req("GET", "/api/admin/divulgacoes/config");
    checa("a B mexendo no modo dela não muda o da A", r.json?.modo === "autorizacao");
    r = await dec(afiliada, id2, { acao: "aprovar" });
    checa("o afiliado não decide a própria peça (403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/divulgacoes/${id2}`, { acao: "aprovar" });
    checa("decidir sem a versão lida é recusado (422)", r.status === 422, `HTTP ${r.status}`);
    r = await dec(orgA, id2, { acao: "recusar" });
    checa("recusar sem motivo é recusado (422)", r.status === 422, `HTTP ${r.status}`);

    // Decisão dupla: um 200, um 409.
    const [d1, d2] = await Promise.all([
      dec(orgA, id2, { acao: "aprovar" }),
      dec(orgA, id2, { acao: "recusar", motivo: "Mudei de ideia" }),
    ]);
    const codigos = [d1.status, d2.status].sort();
    checa("dois cliques, uma decisão: um 200 e um 409", codigos[0] === 200 && codigos[1] === 409, codigos.join(","));
    const [linha] = await db.select().from(divulgacoes).where(eq(divulgacoes.id, id2));
    checa("a decisão que valeu ficou gravada", linha.status === "publicada" || linha.status === "recusada", linha.status);
    // Para o resto da prova, garante a peça no ar.
    if (linha.status === "recusada") {
      await db.update(divulgacoes).set({ status: "publicada" }).where(eq(divulgacoes.id, id2));
    }
    r = await dec(orgA, id2, { acao: "aprovar" });
    checa("decidir de novo é 409", r.status === 409, `HTTP ${r.status}`);
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/novidades");
    checa("decidida pela organização, o sino do afiliado conta 1", r.json?.decididas === 1, JSON.stringify(r.json));
    await afiliada.req("POST", "/api/affiliate/avisos/vistos");
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/novidades");
    checa("aberto o sino, volta a zero", r.json?.decididas === 0, JSON.stringify(r.json));

    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    const publica = r.json?.[0];
    checa("no ar, aparece na página da rifa com o link do afiliado", r.json?.length === 1 && publica?.link === `/r/${a1.slug}?ref=${codigo}` && publica.midias.length === 1);
    checa("a peça do afiliado traz o código dele (a entrada para a mensagem)", publica?.codigo === codigo, String(publica?.codigo));
    checa("a página pública não traz telefone, e-mail nem id de afiliado", !/telefone|email|phone|affiliateId|buyerId/i.test(JSON.stringify(r.json)));

    // Editar a peça no ar: volta para a fila (modo autorização) e a organização
    // decide a versão que leu.
    const midiaB1 = (await db.select({ id: campaignMedia.id }).from(campaignMedia).where(eq(campaignMedia.campaignId, b1.id)))[0]?.id;
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Corrigindo: chama no 84999998888" });
    checa("editar com telefone: 422", r.status === 422, `HTTP ${r.status}`);
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Faz um pix direto pra mim que eu garanto" });
    checa("editar pedindo Pix por fora: 422", r.status === 422, `HTTP ${r.status}`);
    if (midiaB1) {
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "ok", midias: [midiaB1] });
      checa("editar com mídia de outra rifa: 422", r.status === 422, `HTTP ${r.status}`);
    }
    r = await orgA.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "a organização não edita" });
    checa("a organização não edita a peça do afiliado (403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/divulgacoes");
    const versaoLida = r.json?.find((x: any) => x.id === id2)?.versao as number;
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Versão com número errado", versao: "3" });
    checa("versão em formato errado na edição: 422", r.status === 422, `HTTP ${r.status}`);
    const [antesDaEdicao] = await db.select({ midias: divulgacoes.midiaIds }).from(divulgacoes).where(eq(divulgacoes.id, id2));
    // Sem `midias` no corpo: ficam as que a peça já tinha.
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Versão corrigida da minha divulgação" });
    checa("a afiliada edita a peça no ar: volta para a autorização", r.status === 200 && r.json?.status === "em_analise", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const [depoisDaEdicao] = await db.select({ midias: divulgacoes.midiaIds }).from(divulgacoes).where(eq(divulgacoes.id, id2));
    checa(
      "editar só a legenda mantém as mídias escolhidas",
      antesDaEdicao.midias.length > 0 && JSON.stringify(depoisDaEdicao.midias) === JSON.stringify(antesDaEdicao.midias),
      JSON.stringify(depoisDaEdicao.midias),
    );
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    checa("editada, sai da página da rifa até a nova aprovação", Array.isArray(r.json) && !r.json.some((x: any) => x.id === id2));
    r = await orgA.req("GET", "/api/admin/chamados/pendentes");
    checa("a peça editada volta a contar no sino da organização", (r.json?.divulgacoes ?? 0) >= 1, JSON.stringify(r.json));
    r = await dec(orgA, id2, { acao: "aprovar", versao: versaoLida });
    checa("aprovar a versão de antes da edição: 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    // A plataforma vê a fila de todas as organizações, com o nome de cada uma, e decide.
    r = await admin.req("GET", "/api/admin/divulgacoes?status=em_analise");
    const naFilaDaPlataforma = r.json?.find((x: any) => x.id === id2);
    checa(
      "a plataforma vê a peça da A na fila de todas, com a organização e a versão nova",
      Boolean(naFilaDaPlataforma) && naFilaDaPlataforma.organizacao === "Divulgação A" && naFilaDaPlataforma.versao === versaoLida + 1 && Boolean(naFilaDaPlataforma.editadaEm),
      JSON.stringify(naFilaDaPlataforma ?? null),
    );
    r = await dec(admin, id2, { acao: "aprovar", versao: naFilaDaPlataforma?.versao });
    checa("a plataforma aprova a versão que leu, sem escolher a organização", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    const editadaNoAr = r.json?.find((x: any) => x.id === id2);
    checa("de volta à página, com o texto novo e a marca de editada", editadaNoAr?.legenda === "Versão corrigida da minha divulgação" && editadaNoAr?.editada === true, JSON.stringify(editadaNoAr ?? null));
    {
      // Duas edições ao mesmo tempo: uma grava, a outra é 409 (a versão decide).
      // Duas abas abertas na mesma versão.
      const vAberta = (await afiliada.req("GET", "/api/affiliate/divulgacoes")).json?.find((x: any) => x.id === id2)?.versao;
      const [e1, e2] = await Promise.all([
        afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Edição simultânea um", versao: vAberta }),
        afiliada.req("PATCH", `/api/affiliate/divulgacoes/${id2}`, { legenda: "Edição simultânea dois", versao: vAberta }),
      ]);
      const cods = [e1.status, e2.status].sort();
      checa("duas abas na mesma versão: um 200 e um 409", cods[0] === 200 && cods[1] === 409, cods.join(","));
      const [v] = await db.select({ versao: divulgacoes.versao }).from(divulgacoes).where(eq(divulgacoes.id, id2));
      checa("…e a versão subiu uma vez só", v?.versao === versaoLida + 2, String(v?.versao));
      r = await admin.req("GET", "/api/admin/divulgacoes?status=em_analise");
      const v2 = r.json?.find((x: any) => x.id === id2)?.versao;
      r = await dec(orgA, id2, { acao: "aprovar", versao: v2 });
      checa("a organização aprova a versão atual", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }

    // Nada da rifa mudou.
    const [depois] = await db.select().from(campaigns).where(eq(campaigns.id, a1.id));
    checa(
      "a rifa não mudou (preço, cotas, prêmio, título, autorização, legenda)",
      depois.priceCents === antes.priceCents &&
        depois.totalQuotas === antes.totalQuotas &&
        depois.prizeTitle === antes.prizeTitle &&
        depois.title === antes.title &&
        depois.authorizationCode === antes.authorizationCode &&
        depois.legenda === antes.legenda,
    );

    // Modo direto.
    r = await orgA.req("PUT", "/api/admin/divulgacoes/config", { modo: "qualquer" });
    checa("modo desconhecido é recusado (422)", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("PUT", "/api/admin/divulgacoes/config", { modo: "direta" });
    checa("a A passa para publicação direta", r.status === 200 && r.json?.modo === "direta");
    await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${id2}`);
    r = await peca(a1.slug, { legenda: "Essa vai direto pro ar" });
    checa("no modo direto a peça já nasce no ar", r.status === 201 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const idDireta = r.json?.id as string;
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idDireta}`, { legenda: "Direto pro ar, corrigida" });
    checa("no modo direto, a peça editada segue no ar", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    await afiliada.req("POST", "/api/affiliate/avisos/vistos");
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/novidades");
    checa("o que o afiliado retirou, editou e o que nasceu no ar não viram aviso", r.json?.decididas === 0, JSON.stringify(r.json));
    r = await dec(orgB, idDireta, { acao: "remover", motivo: "Não é minha" });
    checa("a B não retira a peça da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await dec(orgA, idDireta, { acao: "remover", motivo: "Fora do combinado" });
    checa("a A retira a peça no ar", r.status === 200 && r.json?.status === "removida", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes");
    checa("o afiliado lê o motivo da retirada", r.json?.some((x: any) => x.id === idDireta && x.motivo === "Fora do combinado"));
    r = await afiliada.req("GET", "/api/affiliate/divulgacoes/novidades");
    checa("a retirada pela organização vira aviso no sino do afiliado", r.json?.decididas === 1, JSON.stringify(r.json));
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idDireta}`, { legenda: "Quero de volta" });
    checa("peça retirada não se edita (409): envia outra", r.status === 409, `HTTP ${r.status}`);

    // Foto própria do afiliado: passa pela organização mesmo no modo direto
    // (a varredura do Pix por fora só lê texto).
    r = await peca(a1.slug, { legenda: "Eu com o prêmio na loja", fotos: [await pngDe("#1d4ed8")] });
    checa("no modo direto, a peça com foto do afiliado espera a organização", r.status === 201 && r.json?.status === "em_analise", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const idFotoAf = r.json?.id as string;
    {
      r = await afiliada.req("GET", "/api/affiliate/divulgacoes");
      const minha = r.json?.find((x: any) => x.id === idFotoAf);
      checa("o afiliado vê a foto da própria peça", minha?.fotos?.length === 1 && (await foto(afiliada, minha.fotos[0])).status === 200);
      checa("sem sessão, a foto do afiliado não abre (401)", (await foto(null, minha.fotos[0])).status === 401);
      r = await orgA.req("GET", "/api/admin/divulgacoes");
      const naFila = r.json?.find((x: any) => x.id === idFotoAf);
      checa("a organização vê a foto do afiliado antes de autorizar", naFila?.fotos?.length === 1 && (await foto(orgA, naFila.fotos[0])).status === 200);
      checa("a B não abre a foto do afiliado na peça da A (404)", (await foto(orgB, naFila.fotos[0])).status === 404);
      const publica = `/api/public/divulgacoes/${idFotoAf}/fotos/${naFila.fotos[0].split("/").pop()}`;
      checa("em análise, a foto do afiliado não é pública (404)", (await foto(null, publica)).status === 404);
      r = await dec(orgA, idFotoAf, { acao: "aprovar" });
      checa("a A aprova a peça com a foto", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
      checa("no ar, a foto do afiliado abre para qualquer um", (await foto(null, publica)).status === 200);
      r = await anon.req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
      checa("a página da rifa mostra a foto do afiliado", r.json?.find((x: any) => x.id === idFotoAf)?.fotos?.length === 1);
      // Editar o texto e manter a foto: volta para a fila, mesmo no modo direto.
      let versao = (await afiliada.req("GET", "/api/affiliate/divulgacoes")).json?.find((x: any) => x.id === idFotoAf)?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idFotoAf}`, { legenda: "Eu com o prêmio, corrigida", versao });
      checa("editada com a foto, volta para a fila mesmo no modo direto", r.status === 200 && r.json?.status === "em_analise", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
      checa("fora do ar, a foto sai da página pública (404)", (await foto(null, publica)).status === 404);
      // Tirar as fotos no modo direto: volta ao ar sem esperar.
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idFotoAf}`, { legenda: "Agora sem foto", fotos: [], versao: r.json?.versao });
      checa("sem foto, no modo direto, a edição volta ao ar", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
      const sobra = await db.select({ id: divulgacaoFotos.id }).from(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, idFotoAf));
      checa("as fotos tiradas saem do banco", sobra.length === 0, String(sobra.length));
      versao = r.json?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idFotoAf}`, { legenda: "", fotos: [], versao });
      checa("sem legenda, mídia nem foto: 422", r.status === 422, `HTTP ${r.status}`);
      await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${idFotoAf}`);
    }

    // Vídeo próprio do afiliado: medido no servidor, sempre pela organização,
    // foto ou vídeo (nunca os dois), três portas com `Range`.
    {
      // Cada peça nova conta no limite do dia (10): o bloco do vídeo zera o balde antes e depois.
      const zerarLimite = () => db.execute(sql`delete from rate_events where bucket like 'divulgacao%'`);
      await zerarLimite();
      const bom = mp4(20, 1080, 1920);
      const contadas = async () => Number((await db.execute(sql`select count(*)::int as n from rate_events where bucket like 'divulgacao:afiliado:%'`)).rows[0]?.n ?? 0);
      const antesDoLimite = await contadas();
      r = await peca(a1.slug, { legenda: "Vídeo longo", video: mp4(75, 1080, 1920).url });
      checa("vídeo de mais de 60 s: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      checa("o vídeo recusado na medida não gasta o limite do dia", (await contadas()) === antesDoLimite, `${antesDoLimite} → ${await contadas()}`);
      r = await peca(a1.slug, { legenda: "Vídeo pesado", video: mp4(10, 1080, 1920, 16 * 1024 * 1024).url });
      checa("vídeo de mais de 15 MB: 413", r.status === 413, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await peca(a1.slug, { legenda: "Não é vídeo", video: "data:video/mp4;base64," + Buffer.from("isto não é um vídeo").toString("base64") });
      checa("arquivo que não é vídeo: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await peca(a1.slug, { legenda: "Formato errado", video: "data:video/webm;base64,AAAA" });
      checa("WebM (não sabemos medir): 422", r.status === 422, `HTTP ${r.status}`);
      r = await peca(a1.slug, { legenda: "Os dois", fotos: [await pngDe("#1d4ed8")], video: bom.url });
      checa("foto e vídeo na mesma peça: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await peca(a1.slug, { video: bom.url });
      const idVid = r.json?.id as string;
      checa("só com o vídeo, no modo direto, a peça espera a organização", r.status === 201 && r.json?.status === "em_analise", `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [gravado] = await db.select().from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid));
      checa("o vídeo fica como veio, com a duração e as medidas lidas do arquivo", Boolean(gravado) && gravado.bytes.equals(bom.arquivo) && Math.round(gravado.segundos) === 20 && gravado.largura === 1080 && gravado.altura === 1920, JSON.stringify(gravado ? { s: gravado.segundos, w: gravado.largura, h: gravado.altura } : null));
      r = await afiliada.req("GET", "/api/affiliate/divulgacoes");
      const minha = r.json?.find((x: any) => x.id === idVid);
      const doAutor = await faixa(afiliada, minha?.video?.url ?? "/x");
      checa("o afiliado assiste ao próprio vídeo, com Range (206)", doAutor.status === 206 && doAutor.tipo.startsWith("video/mp4") && doAutor.faixa === `bytes 0-9/${bom.arquivo.length}` && doAutor.bytes === 10, JSON.stringify(doAutor));
      checa("sem sessão, o vídeo do afiliado não abre (401)", (await faixa(null, minha?.video?.url ?? "/x")).status === 401);
      r = await orgA.req("GET", "/api/admin/divulgacoes");
      const naFila = r.json?.find((x: any) => x.id === idVid);
      checa("a organização assiste ao vídeo antes de autorizar (206)", (await faixa(orgA, naFila?.video?.url ?? "/x")).status === 206, JSON.stringify(naFila?.video ?? null));
      checa("a B não abre o vídeo da peça da A (404)", (await faixa(orgB, naFila?.video?.url ?? "/x")).status === 404);
      const publico = `/api/public/divulgacoes/${idVid}/video`;
      checa("em análise, o vídeo não é público (404)", (await faixa(null, publico)).status === 404);
      checa("o pôster que não existe é 404 (sem ffmpeg ou ainda gerando)", [200, 404].includes((await foto(null, `${publico}?poster=1`)).status));
      r = await dec(orgA, idVid, { acao: "aprovar" });
      checa("a A aprova a peça com o vídeo", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const meio = await fetch(URL + publico, { headers: { Range: "bytes=100-199" } });
      const meioBytes = Buffer.from(await meio.arrayBuffer());
      checa("a faixa do meio vem exata, lida só ela do banco", meio.status === 206 && meioBytes.equals(bom.arquivo.subarray(100, 200)), `HTTP ${meio.status} ${meioBytes.length}`);
      const fora = await fetch(URL + publico, { headers: { Range: `bytes=${bom.arquivo.length + 10}-` } });
      checa("faixa fora do arquivo: 416", fora.status === 416, `HTTP ${fora.status}`);
      const pub = await faixa(null, publico);
      checa("no ar, o vídeo abre para qualquer um, com Range", pub.status === 206 && pub.faixa === `bytes 0-9/${bom.arquivo.length}`, JSON.stringify(pub));
      r = await anon.req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
      const naPagina = r.json?.find((x: any) => x.id === idVid);
      checa("a página da rifa mostra o vídeo com as medidas", naPagina?.video?.url?.startsWith(publico) && naPagina?.video?.largura === 1080 && naPagina?.video?.altura === 1920, JSON.stringify(naPagina?.video ?? null));
      // Editar só o texto mantém o vídeo e volta para a fila, mesmo no modo direto.
      let versao = (await afiliada.req("GET", "/api/affiliate/divulgacoes")).json?.find((x: any) => x.id === idVid)?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idVid}`, { legenda: "Com legenda agora", versao });
      checa("editada com o vídeo, volta para a fila mesmo no modo direto", r.status === 200 && r.json?.status === "em_analise", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
      checa("editar só o texto mantém o vídeo", (await db.select({ id: divulgacaoVideos.id }).from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid))).length === 1);
      checa("fora do ar, o vídeo sai da página pública (404)", (await faixa(null, publico)).status === 404);
      versao = r.json?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idVid}`, { fotos: [await pngDe("#15803d")], versao });
      checa("pôr fotos mantendo o vídeo: 422", r.status === 422, `HTTP ${r.status}`);
      // Trocar o vídeo: o novo ganha outro id (o pôster do antigo não grava nele).
      const outro = mp4(30, 1920, 1080);
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idVid}`, { legenda: "Vídeo novo", video: outro.url, versao });
      const [trocado] = await db.select().from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid));
      checa("trocar o vídeo grava o novo (deitado vale)", r.status === 200 && Boolean(trocado) && trocado.bytes.equals(outro.arquivo) && trocado.id !== gravado?.id, `HTTP ${r.status}`);
      // Recusar apaga o vídeo na mesma transação.
      r = await dec(orgA, idVid, { acao: "recusar", motivo: "Vídeo fora do combinado" });
      checa("a A recusa a peça com o vídeo", r.status === 200 && r.json?.status === "recusada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
      checa("recusada, o vídeo sai do banco", (await db.select({ id: divulgacaoVideos.id }).from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid))).length === 0);
      // Retirar pelo próprio afiliado também apaga.
      r = await peca(a1.slug, { video: bom.url });
      const idVid2 = r.json?.id as string;
      checa("nova peça com vídeo", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      r = await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${idVid2}`);
      checa("retirada pelo afiliado, o vídeo sai do banco", r.status === 200 && (await db.select({ id: divulgacaoVideos.id }).from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid2))).length === 0, `HTTP ${r.status}`);
      // Tirar o vídeo (`video: null`) de uma peça em análise deixa só o texto.
      r = await peca(a1.slug, { legenda: "Com vídeo e texto", video: bom.url });
      const idVid3 = r.json?.id as string;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idVid3}`, { legenda: "Só o texto agora", video: null, versao: 0 });
      checa("tirar o vídeo (video: null) no modo direto volta ao ar sem esperar", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
      checa("o vídeo tirado sai do banco", (await db.select({ id: divulgacaoVideos.id }).from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, idVid3))).length === 0);
      await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${idVid3}`);
      await zerarLimite();
    }

    // Agendar: no modo direto a peça nasce no ar, mas só aparece na rifa na hora marcada.
    r = await peca(a1.slug, { legenda: "Amanhã cedo tem novidade", publicaEm: new Date(Date.now() - 3_600_000).toISOString() });
    checa("agendar no passado: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await peca(a1.slug, { legenda: "Amanhã cedo tem novidade", publicaEm: new Date(Date.now() + 31 * 86_400_000).toISOString() });
    checa("agendar além de 30 dias: 422", r.status === 422, `HTTP ${r.status}`);
    r = await peca(a1.slug, { legenda: "Amanhã cedo tem novidade", publicaEm: new Date(Date.now() + 3_600_000).toISOString() });
    const idAgendada = r.json?.id as string;
    checa("no modo direto, a peça agendada nasce no ar", r.status === 201 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    {
      const naPagina = async () => ((await anon.req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`)).json ?? []).some((x: any) => x.id === idAgendada);
      checa("antes da hora, a peça não aparece na página da rifa", !(await naPagina()));
      r = await afiliada.req("GET", "/api/affiliate/divulgacoes");
      const minha = r.json?.find((x: any) => x.id === idAgendada);
      checa("o afiliado vê a hora agendada", Boolean(minha?.publicaEm));
      r = await orgA.req("GET", "/api/admin/divulgacoes");
      checa("a organização vê a hora agendada na fila", Boolean(r.json?.find((x: any) => x.id === idAgendada)?.publicaEm));
      // Chegou a hora: aparece sem nada a fazer.
      await db.update(divulgacoes).set({ publicaEm: new Date(Date.now() - 1000) }).where(eq(divulgacoes.id, idAgendada));
      checa("passada a hora, a peça aparece na página", await naPagina());
      // Reagendar e tirar a agenda pela edição (sem `publicaEm`, a agenda fica).
      let versao = (await afiliada.req("GET", "/api/affiliate/divulgacoes")).json?.find((x: any) => x.id === idAgendada)?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idAgendada}`, { legenda: "Novidade às 10h", publicaEm: new Date(Date.now() + 7_200_000).toISOString(), versao });
      checa("reagendar pela edição tira da página até a hora nova", r.status === 200 && !(await naPagina()), `HTTP ${r.status} ${r.json?.message ?? ""}`);
      versao = r.json?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idAgendada}`, { legenda: "Novidade às 10h, corrigida", versao });
      checa("editar sem mandar a agenda mantém a agenda", r.status === 200 && !(await naPagina()), `HTTP ${r.status}`);
      versao = r.json?.versao;
      r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idAgendada}`, { legenda: "Agora mesmo", publicaEm: null, versao });
      checa("tirar a agenda põe na página na hora", r.status === 200 && (await naPagina()), `HTTP ${r.status}`);
      await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${idAgendada}`);
    }

    // Termo: rifa publicada com termo exige o aceite daquela versão.
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 12, textoExtra: "" });
    const a2 = await novaRifa(A.id, "a2", "draft");
    await publishCampaign(a2.id);
    r = await peca(a2.slug);
    checa("rifa com termo e sem o aceite: 403", r.status === 403, `HTTP ${r.status}`);
    await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: 1 });
    r = await peca(a2.slug);
    checa("depois de aceitar o termo, divulga", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // Perder o vínculo tira a peça do ar.
    r = await new Cliente().req("GET", `/api/public/campaigns/${a2.slug}/divulgacoes`);
    checa("a peça nova está no ar", r.json?.length === 1);
    await afiliada.req("DELETE", `/api/affiliate/organizacoes/${A.slug}`);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a2.slug}/divulgacoes`);
    checa("sem o vínculo, a peça some da página", r.json?.length === 0);
    r = await peca(a1.slug);
    checa("e ele não publica mais (403)", r.status === 403, `HTTP ${r.status}`);

    // ---------------------------------------------------------- apostador
    await ajustarApostador(false);
    const pessoa = new Cliente();
    r = await pessoa.req("POST", "/api/public/conta", { apelido: "dv" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 10) + "x", nome: "Caio Apostador", telefone: TEL_APOSTADOR, cpf: "11144477735", cep: "01310-100", senha: SENHA, lembrar: true });
    if (r.status !== 201) throw new Error(`conta: HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Rifa boa" });
    checa("interruptor desligado: publicar é 404", r.status === 404, `HTTP ${r.status}`);
    r = await pessoa.req("GET", "/api/public/divulgacoes/rifas");
    checa("interruptor desligado: a lista de rifas é 404", r.status === 404, `HTTP ${r.status}`);

    await ajustarApostador(true);
    r = await new Cliente().req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Rifa boa" });
    checa("sem conta: 401", r.status === 401, `HTTP ${r.status}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Rifa boa" });
    checa("sem compra paga na rifa: 403", r.status === 403, `HTTP ${r.status}`);

    const compra = await pessoa.req("POST", "/api/public/orders", { campaignId: a1.id, quantity: 1, buyer: { name: "Caio Apostador", phone: TEL_APOSTADOR } });
    if (compra.status !== 201) throw new Error(`compra: HTTP ${compra.status} ${compra.json?.message ?? ""}`);
    await fetch(`${URL}/api/dev/pay/${compra.json.code}`, { method: "POST" });
    r = await pessoa.req("GET", "/api/public/divulgacoes/rifas");
    checa("com compra paga, a rifa aparece para publicar", r.json?.some((x: any) => x.slug === a1.slug));
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Rifa boa", midias: [rifaA.midias[0].id] });
    checa("apostador não manda mídia (422)", r.status === 422, `HTTP ${r.status}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Chama no https://x.com" });
    checa("link na publicação do apostador: 422", r.status === 422, `HTTP ${r.status}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: b1.slug, legenda: "Rifa boa" });
    checa("rifa em que não comprou: 403", r.status === 403, `HTTP ${r.status}`);
    const fotoAzul = await pngDe("#1d4ed8");
    const fotoVerde = await pngDe("#15803d");
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Com vídeo", video: mp4(10, 1080, 1920).url });
    checa("o apostador não manda vídeo (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Muitas fotos", fotos: Array(5).fill(fotoAzul) });
    checa("mais de 4 fotos: 422", r.status === 422, `HTTP ${r.status}`);
    {
      const grande = `data:image/jpeg;base64,${Buffer.alloc(3 * 1024 * 1024 + 10, 7).toString("base64")}`;
      r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Foto pesada", fotos: [grande] });
      checa("foto acima de 3 MB: 413 com o motivo", r.status === 413 && /3 MB/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Foto que não abre", fotos: ["data:image/png;base64,AAAA"] });
    checa("foto que não abre: 422 e nada fica gravado", r.status === 422, `HTTP ${r.status}`);
    r = await pessoa.req("POST", "/api/public/divulgacoes", { slug: a1.slug, legenda: "Joguei e gostei, bora!", fotos: [fotoAzul, fotoVerde] });
    checa("o apostador publica e espera a organização — mesmo no modo direto", r.status === 201 && r.json?.status === "em_analise", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const idAp = r.json?.id as string;
    {
      const gravadas = await db.select({ id: divulgacaoFotos.id }).from(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, idAp));
      checa("as duas fotos ficam com a peça", gravadas.length === 2, String(gravadas.length));
      const minhas = (await pessoa.req("GET", "/api/public/divulgacoes/minhas")).json as any[];
      const minha = minhas.find((x) => x.id === idAp);
      checa("quem publicou vê as fotos dele", minha?.fotos?.length === 2);
      const f = await foto(pessoa, minha.fotos[0]);
      checa("…em JPEG reprocessado, sem cache", f.status === 200 && f.tipo.startsWith("image/jpeg") && f.cache.includes("no-store"), `${f.status} ${f.tipo} ${f.cache}`);
      checa("sem conta, a foto do autor é 401", (await foto(null, minha.fotos[0])).status === 401);
      const fila = (await orgA.req("GET", "/api/admin/divulgacoes?status=em_analise")).json as any[];
      const naFila = fila.find((x) => x.id === idAp);
      checa("a organização vê as fotos antes de autorizar", naFila?.fotos?.length === 2);
      checa("…e abre cada uma", (await foto(orgA, naFila.fotos[0])).status === 200);
      checa("a B não abre a foto da peça da A (404)", (await foto(orgB, naFila.fotos[0])).status === 404);
      const publica = `/api/public/divulgacoes/${idAp}/fotos/${naFila.fotos[0].split("/").pop()}`;
      checa("em análise, a foto não é pública (404)", (await foto(null, publica)).status === 404);
    }
    r = await dec(orgB, idAp, { acao: "aprovar" });
    checa("a B não aprova a do apostador da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/divulgacoes?status=em_analise");
    const filaAp = r.json?.find((x: any) => x.id === idAp);
    checa("a A vê pelo apelido — nunca pelo telefone", Boolean(filaAp) && filaAp.quem.startsWith("@") && !JSON.stringify(r.json).includes(TEL_APOSTADOR));
    r = await dec(orgA, idAp, { acao: "aprovar" });
    checa("a A aprova", r.status === 200 && r.json?.status === "publicada");
    {
      // O aviso sai em segundo plano: espera um pouco pela central do apostador.
      const [d] = await db.select({ buyerId: divulgacoes.buyerId }).from(divulgacoes).where(eq(divulgacoes.id, idAp));
      let aviso: { titulo: string; corpo: string } | undefined;
      for (let i = 0; i < 20 && !aviso; i++) {
        [aviso] = await db
          .select({ titulo: notificacoes.titulo, corpo: notificacoes.corpo })
          .from(notificacoes)
          .where(and(eq(notificacoes.buyerId, d.buyerId!), eq(notificacoes.tipo, "divulgacao")));
        if (!aviso) await new Promise((ok) => setTimeout(ok, 250));
      }
      checa("o apostador recebe o aviso da aprovação no trevo", aviso?.titulo === "Sua divulgação está no ar", JSON.stringify(aviso));
      checa("…sem telefone no aviso", !JSON.stringify(aviso ?? {}).includes(TEL_APOSTADOR));
    }
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    checa("aparece na rifa com o apelido, sem link de afiliado", r.json?.some((x: any) => x.autor === "apostador" && x.link === `/r/${a1.slug}`));
    {
      const peca = r.json?.find((x: any) => x.id === idAp);
      checa("no ar, a página mostra as duas fotos", peca?.fotos?.length === 2, JSON.stringify(peca?.fotos ?? null));
      const f = await foto(null, peca.fotos[0]);
      checa("…e a foto abre para qualquer um", f.status === 200 && f.tipo.startsWith("image/jpeg"), `${f.status} ${f.tipo}`);
    }
    checa("o apostador não expõe código de afiliado", r.json?.filter((x: any) => x.autor === "apostador").every((x: any) => x.codigo === null));
    r = await afiliada.req("DELETE", `/api/affiliate/divulgacoes/${idAp}`);
    checa("a afiliada não retira a peça do apostador (404)", r.status === 404, `HTTP ${r.status}`);
    r = await afiliada.req("PATCH", `/api/affiliate/divulgacoes/${idAp}`, { legenda: "não é minha" });
    checa("a afiliada não edita a peça do apostador (404)", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("PATCH", `/api/public/divulgacoes/${idAp}`, { legenda: "sem conta" });
    checa("sem conta, não edita (401)", r.status === 401, `HTTP ${r.status}`);
    r = await pessoa.req("PATCH", `/api/public/divulgacoes/${idAp}`, { legenda: "Corrigi: joguei e gostei muito!", midias: [] });
    checa("o apostador edita e volta para a autorização", r.status === 200 && r.json?.status === "em_analise", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await pessoa.req("PATCH", `/api/public/divulgacoes/${idAp}`, { legenda: "Mídia não", midias: ["00000000-0000-0000-0000-000000000000"] });
    checa("o apostador não põe mídia na edição (422)", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/divulgacoes?status=em_analise");
    r = await dec(orgA, idAp, { acao: "aprovar", versao: r.json?.find((x: any) => x.id === idAp)?.versao });
    checa("a organização aprova a versão editada", r.status === 200 && r.json?.status === "publicada", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    {
      // Aprovada de novo depois da edição é outra decisão: o apostador é avisado de novo.
      const [d] = await db.select({ buyerId: divulgacoes.buyerId }).from(divulgacoes).where(eq(divulgacoes.id, idAp));
      let n = 0;
      for (let i = 0; i < 20 && n < 2; i++) {
        n = (await db.select({ id: notificacoes.id }).from(notificacoes).where(and(eq(notificacoes.buyerId, d.buyerId!), eq(notificacoes.tipo, "divulgacao")))).length;
        if (n < 2) await new Promise((ok) => setTimeout(ok, 250));
      }
      checa("a reaprovação da versão editada avisa o apostador de novo", n === 2, String(n));
    }
    {
      // A edição sem `fotos` manteve as duas; mandar a lista troca todas, na mesma transação.
      const antes = await db.select({ id: divulgacaoFotos.id }).from(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, idAp));
      checa("editar só o texto mantém as fotos", antes.length === 2, String(antes.length));
      const versao = (await orgA.req("GET", "/api/admin/divulgacoes")).json.find((x: any) => x.id === idAp)?.versao;
      r = await pessoa.req("PATCH", `/api/public/divulgacoes/${idAp}`, { legenda: "Agora com uma foto só", fotos: [fotoVerde], versao });
      const depois = await db.select({ id: divulgacaoFotos.id }).from(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, idAp));
      checa("trocar as fotos deixa só as novas", r.status === 200 && depois.length === 1 && !antes.some((a) => a.id === depois[0].id), `HTTP ${r.status} ${depois.length}`);
      const publicaAntiga = `/api/public/divulgacoes/${idAp}/fotos/${antes[0].id}`;
      checa("a foto trocada não abre mais (404)", (await foto(null, publicaAntiga)).status === 404);
      r = await dec(orgA, idAp, { acao: "aprovar" });
      checa("a organização aprova a versão com a foto nova", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    const [aindaNoAr] = await db.select({ status: divulgacoes.status }).from(divulgacoes).where(eq(divulgacoes.id, idAp));
    checa("a peça do apostador segue no ar", aindaNoAr?.status === "publicada", aindaNoAr?.status);
    // O estorno desfaz a compra: quem não joga mais não divulga.
    await db.update(orders).set({ status: "refunded" }).where(eq(orders.code, compra.json.code));
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    checa("compra estornada: a peça do apostador sai da página", !r.json?.some((x: any) => x.autor === "apostador"));
    await db.update(orders).set({ status: "paid" }).where(eq(orders.code, compra.json.code));
    await ajustarApostador(false);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}/divulgacoes`);
    checa("desligar o interruptor tira as do apostador do ar", !r.json?.some((x: any) => x.autor === "apostador"));
    r = await pessoa.req("PATCH", `/api/public/divulgacoes/${idAp}`, { legenda: "Interruptor desligado" });
    checa("interruptor desligado: editar é 404", r.status === 404, `HTTP ${r.status}`);
    await ajustarApostador(true);
    r = await pessoa.req("DELETE", `/api/public/divulgacoes/${idAp}`);
    checa("o apostador retira a própria peça", r.status === 200);
    {
      const sobra = await db.select({ id: divulgacaoFotos.id }).from(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, idAp));
      checa("retirada, as fotos saem junto", sobra.length === 0, String(sobra.length));
    }
    r = await pessoa.req("DELETE", `/api/public/divulgacoes/${idAp}`);
    checa("retirar de novo: 404", r.status === 404, `HTTP ${r.status}`);
  } finally {
    await admin.req("PUT", "/api/admin/app", app0).catch(() => {});
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
