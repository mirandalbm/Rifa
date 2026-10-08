/**
 * Prova da fila de trabalho pesado e do reels gerado (Fase F do
 * `docs/PLANO-FERRAMENTAS.md`), contra a API e o banco de verdade:
 * - o painel pede o vídeo da própria rifa (202) e o pedido entra na fila com
 *   as fotos já no 9:16 e a faixa; um em aberto por rifa (409); rascunho,
 *   demonstração e Reels cheio são 409; a legenda com telefone é 422 e não
 *   conta no limite; o vizinho é 404 (também no `npm run isolation`); o
 *   limite por pessoa é 429;
 * - dois trabalhadores ao mesmo tempo: um só toma o trabalho (SKIP LOCKED);
 *   o MP4 volta pelo banco e as entradas saem;
 * - o relógio do site recebe o vídeo pela ingestão de sempre: a mídia nasce no
 *   Reels, em pé, com a legenda e as figurinhas da contagem e do Comprar, e a
 *   saída sai do banco;
 * - a falha passageira volta para a fila com espera; a definitiva falha com o
 *   motivo; o trabalho preso (processo que caiu) volta ou falha pelo prazo; o
 *   trabalho que não é mais de um trabalhador não é terminado por ele;
 * - a tela sabe se o gerador está no ar (o aviso do trabalhador).
 *
 * O trabalhador roda dentro desta prova (`executarUm`, `iniciarTrabalhador`):
 * o servidor de desenvolvimento é só o site, como em produção.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { db, pool, poolDasTravas } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaignMedia, campaignStats, campaigns, organizations, trabalhadores, trabalhoArquivos, trabalhos, users } from "../shared/schema";
import { mediaKey, storage } from "../server/services/storage";
import { devolverPresos, enfileirar, terminarTrabalho, tomarTrabalho } from "../server/services/fila";
import { executarUm, iniciarTrabalhador } from "../server/trabalhos/trabalhador";
import { PRAZO_DO_TRABALHO_MS, TENTATIVAS_DO_TRABALHO } from "../shared/fila";
import { REELS_GERADOS_POR_HORA, TIPO_REELS_GERADO, duracaoDoReelsGerado } from "../shared/reelsGerado";
import { REELS_POR_RIFA } from "../shared/reels";

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
    const json = (r.headers.get("content-type") ?? "").includes("json") ? ((await r.json()) as any) : null;
    return { status: r.status, json, headers: r.headers };
  }
}

const SLUGS = ["fila-teste-org-a", "fila-teste-org-b"];
const EMAILS = ["fila-org-a@teste.rifa", "fila-org-b@teste.rifa"];
const SENHA = "senha-da-fila-1";
const DIA = 86_400_000;
const CHAVE_TESTE = "teste-da-fila:";

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      // Os arquivos da mídia (fotos, o vídeo gerado e o pôster) saem do armazenamento antes.
      const midias = await db.select({ key: campaignMedia.storageKey, poster: campaignMedia.posterKey }).from(campaignMedia).where(inArray(campaignMedia.campaignId, cs));
      for (const m of midias) {
        await storage().remove(m.key).catch(() => {});
        if (m.poster) await storage().remove(m.poster).catch(() => {});
      }
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    }
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.delete(trabalhos).where(like(trabalhos.chave, `${CHAVE_TESTE}%`));
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'reels-gerado:%'`);
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
      authorizationCode: "SPA-FILA-1",
      metodoApuracao: "federal_direta",
      ...extra,
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id, soldCount: 100 });
  return c;
}

/** Uma foto deitada (o site corta no 9:16) gravada no armazenamento como mídia pronta da rifa. */
async function foto(campaignId: string, role: "banner" | "photo", cor: string, position: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="${cor}"/><circle cx="800" cy="600" r="300" fill="#fff"/></svg>`;
  const bytes = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const key = mediaKey(campaignId, role, "image/jpeg");
  await storage().write(key, bytes, "image/jpeg");
  await db.insert(campaignMedia).values({ campaignId, role, position, storageKey: key, mime: "image/jpeg", status: "ready", width: 1600, height: 1200, altText: "Foto da prova" });
}

async function entrar(email: string) {
  const c = new Cliente();
  const r = await c.req("POST", "/api/auth/login", { email, password: SENHA });
  if (r.status !== 200) throw new Error(`login de ${email}: HTTP ${r.status}`);
  return c;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\n=== fila de trabalho e reels gerado ===\n");
  await limpar();
  // Nenhum trabalhador de outra prova fica "no ar" aqui.
  await db.delete(trabalhadores);
  const orgs: { id: string }[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db.insert(organizations).values({ slug, name: `Fila ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
  }
  const a = await rifa(orgs[0].id, "fila-teste-a");
  const rascunho = await rifa(orgs[0].id, "fila-teste-rascunho", { status: "draft", publishedAt: null });
  const demo = await rifa(orgs[0].id, "fila-teste-demo", { demonstracao: true });
  const b = await rifa(orgs[1].id, "fila-teste-b");
  await foto(a.id, "photo", "#2255aa", 2);
  await foto(a.id, "banner", "#aa3322", 0);
  await foto(b.id, "photo", "#22aa55", 1);
  const orgA = await entrar(EMAILS[0]);

  // ------------------------------------------------ pedir
  let r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/reels-gerado`);
  checa("situação sem pedido", r.status === 200 && r.json?.ultimo === null && r.json?.geradorNoAr === false, JSON.stringify(r.json));
  checa("situação sem cache", r.headers.get("cache-control") === "no-store");

  r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/reels-gerado`, { legenda: "Chama no 84 99999-1234" });
  checa("legenda com telefone é 422", r.status === 422, `HTTP ${r.status}`);
  const [{ n: contados }] = (await db.execute(sql`select count(*)::int as n from rate_events where bucket like 'reels-gerado:%'`)).rows as { n: number }[];
  checa("o erro de preenchimento não conta no limite", contados === 0, `${contados}`);

  r = await orgA.req("POST", `/api/admin/campaigns/${rascunho.id}/reels-gerado`, {});
  checa("rascunho não gera (409)", r.status === 409 && /publicada/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
  r = await orgA.req("POST", `/api/admin/campaigns/${demo.id}/reels-gerado`, {});
  checa("demonstração não gera (409)", r.status === 409, `HTTP ${r.status}`);
  r = await orgA.req("POST", `/api/admin/campaigns/${b.id}/reels-gerado`, {});
  checa("a rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);

  r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/reels-gerado`, { legenda: "Concorra à moto!" });
  checa("pedido aceito (202) e na fila", r.status === 202 && r.json?.ultimo?.situacao === "pendente" && r.json?.geradorNoAr === false, JSON.stringify(r.json));
  const trabalhoId: string = r.json?.id;
  const entradas = await db.select({ nome: trabalhoArquivos.nome, bytes: trabalhoArquivos.bytes }).from(trabalhoArquivos).where(and(eq(trabalhoArquivos.trabalhoId, trabalhoId), eq(trabalhoArquivos.papel, "entrada")));
  const nomes = entradas.map((e) => e.nome).sort();
  checa("as entradas: as duas fotos e a faixa", nomes.join(",") === "faixa.png,foto-0.jpg,foto-1.jpg", nomes.join(","));
  const medida = await sharp(Buffer.from(entradas.find((e) => e.nome === "foto-0.jpg")!.bytes)).metadata();
  checa("a foto já vai no 9:16", medida.width === 1080 && medida.height === 1920, `${medida.width}x${medida.height}`);
  const [t0] = await db.select({ dados: trabalhos.dados, pedidoPor: trabalhos.pedidoPor }).from(trabalhos).where(eq(trabalhos.id, trabalhoId));
  const dados0 = t0.dados as Record<string, unknown>;
  checa("a legenda vai nos dados, sem dado pessoal", Object.keys(dados0).sort().join(",") === "fotos,legenda" && dados0.legenda === "Concorra à moto!" && dados0.fotos === 2, JSON.stringify(dados0));

  r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/reels-gerado`, {});
  checa("um em aberto por rifa (409)", r.status === 409, `HTTP ${r.status}`);

  // ------------------------------------------------ trabalhador
  const [um, dois] = await Promise.all([executarUm("prova-1"), executarUm("prova-2")]);
  checa("dois trabalhadores: um só tomou", Number(um) + Number(dois) === 1, `${um} ${dois}`);
  const temFfmpeg = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]).status === 0;
  if (!temFfmpeg) {
    // Sem ffmpeg (o CI instala, mas a falha da instalação não derruba a rodada): o trabalho volta para a fila.
    const [t1] = await db.select({ situacao: trabalhos.situacao, tentativas: trabalhos.tentativas, erro: trabalhos.erro }).from(trabalhos).where(eq(trabalhos.id, trabalhoId));
    checa("sem ffmpeg, o trabalho volta para a fila com o motivo", t1.situacao === "pendente" && t1.tentativas === 1 && /ffmpeg/.test(t1.erro ?? ""), `${t1.situacao} ${t1.erro}`);
    console.log("  (sem ffmpeg: o recebimento pelo relógio não é provado nesta rodada)");
    await db.delete(trabalhos).where(eq(trabalhos.id, trabalhoId));
  } else {
    let [t1] = await db.select({ situacao: trabalhos.situacao, tentativas: trabalhos.tentativas, resultado: trabalhos.resultado }).from(trabalhos).where(eq(trabalhos.id, trabalhoId));
    checa("o trabalho ficou pronto", t1.situacao === "pronto" && t1.tentativas === 1, `${t1.situacao}/${t1.tentativas}`);
    const arquivos = await db.select({ papel: trabalhoArquivos.papel, nome: trabalhoArquivos.nome }).from(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, trabalhoId));
    checa("as entradas saíram e o MP4 chegou", arquivos.length === 1 && arquivos[0].papel === "saida" && arquivos[0].nome === "reels.mp4", JSON.stringify(arquivos));

    // ------------------------------------------------ o site recebe (relógio)
    let situacao: any = null;
    for (let i = 0; i < 40; i++) {
      situacao = (await orgA.req("GET", `/api/admin/campaigns/${a.id}/reels-gerado`)).json;
      if (situacao?.ultimo?.situacao === "concluido" || situacao?.ultimo?.situacao === "falhou") break;
      await esperar(1500);
    }
    checa("o relógio do site recebeu o vídeo", situacao?.ultimo?.situacao === "concluido" && typeof situacao?.ultimo?.mediaId === "string", JSON.stringify(situacao?.ultimo));
    const [midia] = await db.select().from(campaignMedia).where(eq(campaignMedia.id, situacao?.ultimo?.mediaId ?? randomUUID()));
    checa("a mídia nasceu no Reels, em pé", midia?.role === "reels" && midia?.width === 1080 && midia?.height === 1920, `${midia?.role} ${midia?.width}x${midia?.height}`);
    checa("medida pelo servidor: a duração do roteiro", midia?.durationS === Math.round(duracaoDoReelsGerado(2)), `${midia?.durationS}`);
    checa("com a legenda pedida", midia?.legenda === "Concorra à moto!", `${midia?.legenda}`);
    checa("com a contagem e o Comprar como figurinhas", JSON.stringify((midia?.figurinhas ?? []).map((f: { tipo: string }) => f.tipo)) === '["contagem","comprar"]', JSON.stringify(midia?.figurinhas));
    const sobras = await db.select({ nome: trabalhoArquivos.nome }).from(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, trabalhoId));
    checa("a saída saiu do banco", sobras.length === 0, `${sobras.length}`);
    checa("o MP4 está no armazenamento", (await storage().size(midia.storageKey).catch(() => 0)) > 0);
  }

  // ------------------------------------------------ Reels cheio
  const enchimento: string[] = [];
  const jaTem = (await db.select({ id: campaignMedia.id }).from(campaignMedia).where(and(eq(campaignMedia.campaignId, a.id), eq(campaignMedia.role, "reels")))).length;
  for (let i = jaTem; i < REELS_POR_RIFA; i++) {
    const [m] = await db
      .insert(campaignMedia)
      .values({ campaignId: a.id, role: "reels", position: i, storageKey: `campanhas/${a.id}/reels-${randomUUID()}.mp4`, mime: "video/mp4", status: "ready", width: 1080, height: 1920, durationS: 9 })
      .returning({ id: campaignMedia.id });
    enchimento.push(m.id);
  }
  r = await orgA.req("POST", `/api/admin/campaigns/${a.id}/reels-gerado`, {});
  checa(`com ${REELS_POR_RIFA} vídeos no Reels, não gera (409)`, r.status === 409 && /já tem/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
  await db.delete(campaignMedia).where(inArray(campaignMedia.id, enchimento));

  // ------------------------------------------------ falhas e prazo
  const tipos = { teste_passageiro: async () => { throw new Error("falhou em /tmp/rifa-x/arquivo.jpg"); } };
  const idPassageiro = await enfileirar(db, { tipo: "teste_passageiro", chave: `${CHAVE_TESTE}passageiro` });
  await executarUm("prova-1", tipos);
  let [tp] = await db.select().from(trabalhos).where(eq(trabalhos.id, idPassageiro!));
  checa("falha passageira volta para a fila com espera", tp.situacao === "pendente" && tp.tentativas === 1 && tp.disponivelEm.getTime() > Date.now() + 20_000, `${tp.situacao} ${tp.tentativas}`);
  checa("o motivo vai sem o caminho do arquivo", tp.erro === "falhou em …", `${tp.erro}`);
  checa("e ninguém toma antes da hora", (await tomarTrabalho(["teste_passageiro"], "prova-1")) === null);

  const idDefinitivo = await enfileirar(db, { tipo: TIPO_REELS_GERADO, chave: `${CHAVE_TESTE}definitivo`, entradas: [{ nome: "foto-0.jpg", bytes: Buffer.from("x") }] });
  await executarUm("prova-1");
  let [td] = await db.select().from(trabalhos).where(eq(trabalhos.id, idDefinitivo!));
  checa("sem a faixa, falha de vez, com o motivo", td.situacao === "falhou" && /faixa/.test(td.erro ?? ""), `${td.situacao} ${td.erro}`);
  const restoDefinitivo = await db.select({ nome: trabalhoArquivos.nome }).from(trabalhoArquivos).where(eq(trabalhoArquivos.trabalhoId, idDefinitivo!));
  checa("e os arquivos saem", restoDefinitivo.length === 0);

  const antigo = new Date(Date.now() - PRAZO_DO_TRABALHO_MS - 60_000);
  const idPreso = await enfileirar(db, { tipo: "teste_preso", chave: `${CHAVE_TESTE}preso` });
  const idEsgotado = await enfileirar(db, { tipo: "teste_preso", chave: `${CHAVE_TESTE}esgotado` });
  await db.update(trabalhos).set({ situacao: "executando", tomadoPor: "caiu", tomadoEm: antigo, tentativas: 1 }).where(eq(trabalhos.id, idPreso!));
  await db.update(trabalhos).set({ situacao: "executando", tomadoPor: "caiu", tomadoEm: antigo, tentativas: TENTATIVAS_DO_TRABALHO }).where(eq(trabalhos.id, idEsgotado!));
  checa("o trabalhador que caiu não termina o que não é mais dele", !(await terminarTrabalho(idPreso!, "outro", [])));
  await devolverPresos();
  const [tPreso] = await db.select({ situacao: trabalhos.situacao }).from(trabalhos).where(eq(trabalhos.id, idPreso!));
  const [tEsgotado] = await db.select({ situacao: trabalhos.situacao }).from(trabalhos).where(eq(trabalhos.id, idEsgotado!));
  checa("preso com tentativa sobrando volta para a fila", tPreso.situacao === "pendente", tPreso.situacao);
  checa("preso sem tentativa sobrando falha", tEsgotado.situacao === "falhou", tEsgotado.situacao);
  checa("o trabalhador que caiu não termina depois de devolvido", !(await terminarTrabalho(idPreso!, "caiu", [])));

  // ------------------------------------------------ gerador no ar
  const trabalhador = iniciarTrabalhador({ esperaMs: 200 });
  await esperar(800);
  r = await orgA.req("GET", `/api/admin/campaigns/${a.id}/reels-gerado`);
  checa("com o trabalhador no ar, a tela sabe", r.json?.geradorNoAr === true, JSON.stringify(r.json?.geradorNoAr));
  await trabalhador.parar();

  // ------------------------------------------------ limite
  await db.execute(sql`delete from rate_events where bucket like 'reels-gerado:%'`);
  let ultimo = 0;
  for (let i = 0; i <= REELS_GERADOS_POR_HORA; i++) ultimo = (await orgA.req("POST", `/api/admin/campaigns/${rascunho.id}/reels-gerado`, {})).status;
  checa(`limite de ${REELS_GERADOS_POR_HORA} pedidos por hora (429)`, ultimo === 429, `HTTP ${ultimo}`);

  await limpar();
  await db.delete(trabalhadores).where(like(trabalhadores.nome, "%"));
  console.log(falhas ? `\n${falhas} falha(s)\n` : "\nTudo certo.\n");
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await Promise.allSettled([pool.end(), poolDasTravas.end()]);
    process.exit(falhas ? 1 : 0);
  });
