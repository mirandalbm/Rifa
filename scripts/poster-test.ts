/**
 * Prova do pôster dos vídeos, pela API de verdade: o vídeo do story e o da
 * rifa ganham um pôster (WebP, no máximo 720 px de largura) tirado em segundo
 * plano quando o servidor tem `ffmpeg`; sem ele — ou com um arquivo que ele
 * não abre — o envio segue igual, só sem pôster. A prova passa nos dois
 * casos e diz qual percorreu.
 *
 *   npm run poster      (com `npm run dev` no ar e o seed aplicado)
 *
 * Confere também: a chave do pôster nunca vem do navegador, apagar a mídia
 * apaga o pôster, o pôster do story some quando o story vence, e a rota
 * pública só serve pôster de story no ar.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { campaignMedia, campaignStats, campaigns, organizations, stories, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  async enviar(caminho: string, corpo: Buffer, tipo: string) {
    const r = await fetch(URL + caminho, { method: "PUT", headers: { "Content-Type": tipo, ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: corpo });
    return r.status;
  }
}

const SLUG = "poster-teste-rifa";
// Mesmo programa que o servidor usaria (`FFMPEG_PATH`): apontá-lo para um caminho
// inexistente, nos dois lados, prova o caminho sem ffmpeg.
const temFfmpeg = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]).status === 0;

/* MP4 sintético: o servidor mede duração e tamanho pelo container, mas nenhum decodificador o abre. */
function caixa(tipo: string, conteudo: Buffer) {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(conteudo.length + 8, 0);
  h.write(tipo, 4, "ascii");
  return Buffer.concat([h, conteudo]);
}
function mp4Falso(segundos: number, largura: number, altura: number) {
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

/** Vídeo de verdade (vermelho, em pé, 2 s), feito pelo ffmpeg do ambiente. */
async function mp4Real(pasta: string, largura = 1080, altura = 1920) {
  const f = path.join(pasta, "real.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=red:s=${largura}x${altura}:d=2:r=10`, "-pix_fmt", "yuv420p", f]);
  if (r.status !== 0) throw new Error("ffmpeg não gerou o vídeo de teste");
  return fs.readFile(f);
}

async function limpar() {
  await db.execute(sql`delete from campaigns where slug = ${SLUG}`);
}

async function esperaPor<T>(f: () => Promise<T | null | undefined | false>, ms = 15000): Promise<T | null> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await f();
    if (v) return v as T;
    await espera(300);
  }
  return null;
}

async function main() {
  console.log(`\n=== pôster dos vídeos (${temFfmpeg ? "com ffmpeg" : "sem ffmpeg: só a degradação"}) ===\n`);
  await limpar();
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "poster-prova-"));
  const marina = new Cliente();
  const anon = new Cliente();
  let r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: eu.org!,
      slug: SLUG,
      title: "Rifa do pôster",
      prizeTitle: "Moto 0 km",
      totalQuotas: 100,
      priceCents: 500,
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-POSTER",
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });
  const storiesCriados: string[] = [];
  const [{ slugOrg }] = await db.select({ slugOrg: organizations.slug }).from(organizations).where(eq(organizations.id, eu.org!));

  try {
    const real = temFfmpeg ? await mp4Real(pasta) : null;
    const falso = mp4Falso(10, 1080, 1920);

    /* ------------------------------ story ------------------------------ */
    console.log("  story em vídeo:");
    const dataUrl = (b: Buffer) => `data:video/mp4;base64,${b.toString("base64")}`;

    r = await marina.req("POST", "/api/admin/stories", { video: dataUrl(falso) });
    const idFalso = r.json?.id as string;
    if (idFalso) storiesCriados.push(idFalso);
    checa("vídeo que o ffmpeg não abre: o envio sai igual (201)", r.status === 201 && !!idFalso, `HTTP ${r.status}`);
    await espera(2500);
    r = await anon.req("GET", `/api/public/stories/${idFalso}/poster`);
    checa("…e fica sem pôster (404 no pôster)", r.status === 404, `HTTP ${r.status}`);
    const painelFalso = (await marina.req("GET", "/api/admin/stories")).json?.find((s: any) => s.id === idFalso);
    checa("…com `poster: null` no JSON, e o vídeo segue servido", painelFalso?.poster === null && painelFalso?.tipo === "video");
    const inteiro = await fetch(URL + painelFalso.imagem);
    checa("o vídeo original continua saindo inteiro", inteiro.status === 200 && Buffer.from(await inteiro.arrayBuffer()).equals(falso));

    if (real) {
      r = await marina.req("POST", "/api/admin/stories", { video: dataUrl(real), legenda: "Com pôster" });
      const id = r.json?.id as string;
      if (id) storiesCriados.push(id);
      checa("vídeo de verdade: o envio sai sem esperar o pôster (201)", r.status === 201 && !!id, `HTTP ${r.status}`);
      const poster = await esperaPor(async () => {
        const p = await fetch(URL + `/api/public/stories/${id}/poster`);
        return p.status === 200 ? Buffer.from(await p.arrayBuffer()) : null;
      });
      checa("o pôster aparece em segundo plano", !!poster);
      if (poster) {
        const meta = await sharp(poster).metadata();
        checa("é WebP, em pé e com no máximo 720 px de largura", meta.format === "webp" && meta.width! <= 720 && meta.height! > meta.width!, `${meta.format} ${meta.width}x${meta.height}`);
        const { channels } = await sharp(poster).stats();
        checa("é o quadro do vídeo (vermelho), não um quadro vazio", channels[0].mean > 180 && channels[1].mean < 80 && channels[2].mean < 80, channels.map((c) => Math.round(c.mean)).join("/"));
      }
      const noPerfil = (await anon.req("GET", `/api/public/o/${slugOrg}/stories`)).json?.stories?.find((s: any) => s.id === id);
      checa("o perfil público traz o endereço do pôster", noPerfil?.poster === `/api/public/stories/${id}/poster`, String(noPerfil?.poster));
      const img = (await marina.req("GET", "/api/admin/stories")).json?.find((s: any) => s.id === id);
      checa("o painel também", img?.poster === `/api/public/stories/${id}/poster`);
      const doBanco = await db.select({ p: sql<number>`octet_length(${stories.poster})` }).from(stories).where(eq(stories.id, id));
      checa("o pôster fica no banco, junto do story", Number(doBanco[0]?.p) > 100);

      await db.update(stories).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(stories.id, id));
      r = await anon.req("GET", `/api/public/stories/${id}/poster`);
      checa("story vencido: o pôster some na hora (404)", r.status === 404, `HTTP ${r.status}`);
    }
    r = await anon.req("GET", `/api/public/stories/00000000-0000-0000-0000-000000000000/poster`);
    checa("pôster de story que não existe: 404", r.status === 404);

    /* ----------------------------- mídia da rifa ----------------------------- */
    console.log("\n  vídeo da rifa:");
    const subir = async (arquivo: Buffer, corpoExtra: Record<string, unknown> = {}) => {
      let t = await marina.req("POST", `/api/admin/campaigns/${rifa.id}/media/upload-url`, { role: "video", filename: "v.mp4", mime: "video/mp4", bytes: arquivo.length });
      if (t.status !== 200) return { status: t.status, json: t.json };
      const put = await marina.enviar(t.json.url, arquivo, "video/mp4");
      if (put >= 300) return { status: put, json: null };
      return marina.req("POST", `/api/admin/campaigns/${rifa.id}/media`, { role: "video", storageKey: t.json.storageKey, mime: "video/mp4", ...corpoExtra });
    };

    r = await subir(falso, { posterKey: "campanhas/outra/poster-forjado.webp", poster: "https://exemplo.com/x.webp", width: 1, height: 1 });
    const idFalsa = r.json?.id as string;
    checa("vídeo que o ffmpeg não abre entra normalmente (201)", r.status === 201 && !!idFalsa, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a medida e o pôster mandados pelo navegador são ignorados", r.json?.width === 1080 && r.json?.height === 1920 && !r.json?.posterKey, `${r.json?.width}x${r.json?.height} ${r.json?.posterKey}`);
    await espera(2500);
    const [semPoster] = await db.select({ k: campaignMedia.posterKey }).from(campaignMedia).where(eq(campaignMedia.id, idFalsa));
    checa("…e fica sem pôster, sem erro", semPoster?.k === null);
    let pub = await anon.req("GET", `/api/public/campaigns/${SLUG}`);
    checa("a página pública diz `poster: null` para ele", pub.json?.media?.find((m: any) => m.role === "video")?.poster === null);
    await marina.req("DELETE", `/api/admin/media/${idFalsa}`);

    if (real) {
      r = await subir(real);
      const id = r.json?.id as string;
      checa("vídeo de verdade: o envio sai sem esperar o pôster (201)", r.status === 201 && !!id, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const chave = await esperaPor(async () => (await db.select({ k: campaignMedia.posterKey }).from(campaignMedia).where(eq(campaignMedia.id, id)))[0]?.k);
      checa("o pôster é gravado junto da mídia (posterKey)", !!chave, String(chave));
      if (chave) {
        checa("a chave é da pasta da rifa e é WebP", chave.startsWith(`campanhas/${rifa.id}/poster-`) && chave.endsWith(".webp"));
        pub = await anon.req("GET", `/api/public/campaigns/${SLUG}`);
        const peca = pub.json?.media?.find((m: any) => m.role === "video");
        checa("a página pública traz o endereço do pôster", peca?.poster === `/uploads/${chave}`, String(peca?.poster));
        const arq = await fetch(URL + peca.poster);
        const buf = Buffer.from(await arq.arrayBuffer());
        const meta = await sharp(buf).metadata();
        checa("o endereço serve o WebP em pé, até 720 px", arq.status === 200 && meta.format === "webp" && meta.width! <= 720 && meta.height! > meta.width!, `HTTP ${arq.status} ${meta.format} ${meta.width}x${meta.height}`);

        // A chave de pôster não passa por chave de envio: o navegador não adota o arquivo dele como mídia.
        r = await marina.req("POST", `/api/admin/campaigns/${rifa.id}/media`, { role: "video", storageKey: chave, mime: "video/mp4" });
        checa("confirmar a chave do pôster como se fosse mídia: 400", r.status === 400, `HTTP ${r.status}`);

        // Quem lista no perfil (feed) também leva o pôster.
        const perfil = await anon.req("GET", `/api/public/o/${slugOrg}`);
        const doPerfil = (perfil.json?.rifas ?? []).find((x: any) => x.slug === SLUG)?.midias?.find((m: any) => m.role === "video");
        checa("o perfil e o feed (pecaPublica) também levam o pôster", doPerfil?.poster === `/uploads/${chave}`, String(doPerfil?.poster));

        r = await marina.req("DELETE", `/api/admin/media/${id}`);
        const depois = await fetch(URL + `/uploads/${chave}`);
        checa("apagar a mídia apaga o pôster do armazenamento", r.status === 200 && depois.status === 404, `HTTP ${depois.status}`);
      }

      // Vídeo curto demais para o salto de 0,5 s: cai no primeiro quadro.
      const curto = path.join(pasta, "curto.mp4");
      spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=720x1280:d=0.2:r=10", "-pix_fmt", "yuv420p", curto]);
      r = await subir(await fs.readFile(curto));
      const idCurto = r.json?.id as string;
      const chaveCurta = idCurto ? await esperaPor(async () => (await db.select({ k: campaignMedia.posterKey }).from(campaignMedia).where(eq(campaignMedia.id, idCurto)))[0]?.k) : null;
      checa("vídeo de 0,2 s: o pôster sai do primeiro quadro", !!chaveCurta);
      if (idCurto) await marina.req("DELETE", `/api/admin/media/${idCurto}`);
    }
  } finally {
    for (const id of storiesCriados) await marina.req("DELETE", `/api/admin/stories/${id}`).catch(() => {});
    if (storiesCriados.length) await db.delete(stories).where(inArray(stories.id, storiesCriados));
    await limpar();
    await fs.rm(pasta, { recursive: true, force: true });
  }

  console.log(falhas ? `\n✗ ${falhas} verificação(ões) falharam\n` : "\n✓ tudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
