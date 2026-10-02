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
 *
 * Entrega em HLS (com `VIDEO_PROCESSOR=cloudflare-stream`,
 * `CLOUDFLARE_STREAM_ENTREGA=hls`, `CLOUDFLARE_ACCOUNT_ID`,
 * `CLOUDFLARE_STREAM_TOKEN` e `CLOUDFLARE_API_URL=http://127.0.0.1:<porta>/client/v4`,
 * os mesmos no servidor e aqui): a prova sobe um Stream de mentira nessa porta
 * e confere que o vídeo da rifa fica nele com o HLS conferido, que a tela
 * recebe o HLS (e nunca o `uid`), que HLS estranho apaga o vídeo e que apagar
 * a mídia ou a rifa apaga no Stream. Sem essas variáveis, a parte é pulada.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { campaignMedia, campaignStats, campaigns, organizations, stories, streamPendentes, users } from "../shared/schema";
import { limparStreamPendente } from "../server/services/streamPendentes";
import { entregaHlsLigada } from "../shared/stream";

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

/* ---------- Stream de mentira (só com a entrega ligada e o endereço trocado) ---------- */
const API_FALSA = process.env.CLOUDFLARE_API_URL?.trim() ?? "";
const comEntrega = entregaHlsLigada(process.env) && /^http:\/\/127\.0\.0\.1:\d+\//.test(API_FALSA);
const stream = {
  modo: "normal" as "normal" | "estranho",
  apagarFalha: false,
  criados: [] as string[],
  apagados: [] as string[],
  semToken: 0,
};
const hlsDe = (uid: string) => `https://customer-prova.cloudflarestream.com/${uid}/manifest/video.m3u8`;
function subirStreamFalso(): Promise<http.Server> {
  const porta = Number(new globalThis.URL(API_FALSA).port);
  const servidor = http.createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (b) => partes.push(b));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN?.trim()}`) stream.semToken++;
      const m = /\/accounts\/[^/]+\/stream(?:\/([a-f0-9]{32}))?$/.exec(req.url ?? "");
      const json = (corpo: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(corpo));
      };
      if (!m) return json({ success: false }, 404);
      const uid = m[1];
      if (req.method === "POST" && !uid) {
        const novo = randomBytes(16).toString("hex");
        stream.criados.push(novo);
        return json({ success: true, result: { uid: novo } });
      }
      if (req.method === "DELETE" && uid) {
        if (stream.apagarFalha) return json({ success: false }, 503);
        stream.apagados.push(uid);
        return json({ success: true });
      }
      if (req.method === "GET" && uid) {
        // Sem `thumbnail`: o pôster cai no ffmpeg (a reserva), e a prova não sai para a internet.
        const hls = stream.modo === "estranho" ? "https://evil.example.com/x.m3u8" : hlsDe(uid);
        return json({ success: true, result: { readyToStream: true, status: { state: "ready" }, playback: { hls } } });
      }
      json({ success: false }, 400);
    });
  });
  return new Promise((ok) => servidor.listen(porta, "127.0.0.1", () => ok(servidor)));
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
  const falso_stream = comEntrega ? await subirStreamFalso() : null;
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

    // O teto de bytes vai na assinatura: corpo maior que o prometido, ou teto adulterado, não entra.
    {
      const pequeno = Buffer.from("0123456789");
      const tk = await marina.req("POST", `/api/admin/campaigns/${rifa.id}/media/upload-url`, { role: "video", filename: "v.mp4", mime: "video/mp4", bytes: pequeno.length });
      const grande = Buffer.alloc(pequeno.length + 1000, 1);
      checa("envio com mais bytes do que o prometido é recusado (413)", (await marina.enviar(tk.json.url, grande, "video/mp4")) === 413);
      checa("teto adulterado na URL invalida a assinatura (403)", (await marina.enviar(String(tk.json.url).replace(/max=\d+/, "max=2000000000"), grande, "video/mp4")) === 403);
      checa("o tamanho prometido passa (200)", (await marina.enviar(tk.json.url, pequeno, "video/mp4")) === 200);
    }
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

    /* ----------------------------- entrega em HLS ----------------------------- */
    if (!comEntrega) {
      console.log("\n  entrega em HLS: pulada (sem CLOUDFLARE_STREAM_ENTREGA=hls e CLOUDFLARE_API_URL local)");
    } else {
      console.log("\n  entrega em HLS pelo Stream (de mentira):");
      const daMidia = async (id: string) =>
        (await db.select({ uid: campaignMedia.streamUid, hls: campaignMedia.streamHls, poster: campaignMedia.posterKey }).from(campaignMedia).where(eq(campaignMedia.id, id)))[0];

      stream.modo = "normal";
      r = await subir(falso, { streamUid: "a".repeat(32), streamHls: "https://evil.example.com/x.m3u8", hls: "https://evil.example.com/y.m3u8" });
      const id = r.json?.id as string;
      checa("o envio sai sem esperar o Stream (201)", r.status === 201 && !!id, `HTTP ${r.status}`);
      checa("…e o uid e o HLS mandados pelo navegador são ignorados", !r.json?.hls && !r.json?.streamUid && !r.json?.streamHls);
      const linha = id ? await esperaPor(async () => (await daMidia(id))?.uid ? daMidia(id) : null) : null;
      checa("o vídeo fica no Stream: a mídia guarda o uid", !!linha?.uid && stream.criados.includes(linha.uid), String(linha?.uid));
      checa("…e o HLS conferido do próprio vídeo", linha?.hls === hlsDe(linha?.uid ?? ""), String(linha?.hls));
      checa("…sem apagar no Stream", !stream.apagados.includes(linha?.uid ?? ""));
      const naLista = async (uid: string) => (await db.select().from(streamPendentes).where(eq(streamPendentes.uid, uid))).length > 0;
      checa("…e, com dono, sai da lista do relógio", !!linha?.uid && !(await naLista(linha.uid)));
      if (linha?.uid) {
        pub = await anon.req("GET", `/api/public/campaigns/${SLUG}`);
        const peca = pub.json?.media?.find((m: any) => m.role === "video");
        checa("a página pública traz o HLS (e o original de reserva)", peca?.hls === linha.hls && typeof peca?.url === "string", String(peca?.hls));
        const perfil = await anon.req("GET", `/api/public/o/${slugOrg}`);
        const doPerfil = (perfil.json?.rifas ?? []).find((x: any) => x.slug === SLUG)?.midias?.find((m: any) => m.role === "video");
        checa("o perfil e o feed (pecaPublica) também", doPerfil?.hls === linha.hls, String(doPerfil?.hls));
        const painel = await marina.req("GET", `/api/admin/campaigns/${rifa.id}/media`);
        const tudo = JSON.stringify([pub.json, perfil.json, painel.json]);
        checa("o campo `streamUid` nunca sai numa resposta (só dentro do endereço do HLS)", !tudo.includes('"streamUid"') && !tudo.includes(`/${linha.uid}"`) && painel.status === 200);
        r = await marina.req("DELETE", `/api/admin/media/${id}`);
        checa("apagar a mídia apaga o vídeo no Stream", r.status === 200 && stream.apagados.includes(linha.uid));
      }

      // HLS fora do próprio vídeo: o servidor não guarda e apaga na hora.
      stream.modo = "estranho";
      const antes = stream.criados.length;
      r = await subir(falso);
      const idEstranho = r.json?.id as string;
      const uidEstranho = await esperaPor(async () => (stream.criados.length > antes ? stream.criados[antes] : null));
      const apagou = uidEstranho ? await esperaPor(async () => stream.apagados.includes(uidEstranho)) : null;
      checa("HLS fora do próprio vídeo: o Stream apaga e a mídia fica sem entrega", !!apagou && !(await daMidia(idEstranho))?.uid);
      if (idEstranho) await marina.req("DELETE", `/api/admin/media/${idEstranho}`);

      // O DELETE que falha não esquece o vídeo: o relógio tenta de novo.
      stream.modo = "normal";
      r = await subir(falso);
      const idFalha = r.json?.id as string;
      const uidFalha = idFalha ? (await esperaPor(async () => (await daMidia(idFalha))?.uid))! : null;
      stream.apagarFalha = true;
      await marina.req("DELETE", `/api/admin/media/${idFalha}`);
      stream.apagarFalha = false;
      checa("DELETE recusado pelo Stream: o vídeo fica anotado para o relógio", !!uidFalha && !stream.apagados.includes(uidFalha) && (await naLista(uidFalha)));
      // Vídeo de um processo que caiu no meio (enviado, nunca gravado) e um com dono.
      const orfao = randomBytes(16).toString("hex");
      const velho = new Date(Date.now() - 2 * 3600_000);
      await db.insert(streamPendentes).values({ uid: orfao, criadoEm: velho });
      if (uidFalha) await db.update(streamPendentes).set({ criadoEm: velho }).where(eq(streamPendentes.uid, uidFalha));
      r = await subir(falso);
      const idDono = r.json?.id as string;
      const uidDono = idDono ? (await esperaPor(async () => (await daMidia(idDono))?.uid))! : null;
      if (uidDono) await db.insert(streamPendentes).values({ uid: uidDono, criadoEm: velho }).onConflictDoNothing();
      const recente = randomBytes(16).toString("hex");
      await db.insert(streamPendentes).values({ uid: recente });
      const rodada = await limparStreamPendente();
      checa(
        "o relógio apaga no Stream o órfão e o DELETE que falhou",
        stream.apagados.includes(orfao) && !!uidFalha && stream.apagados.includes(uidFalha) && !(await naLista(orfao)),
        JSON.stringify(rodada),
      );
      checa("…tira da lista o que tem dono, sem apagar", !!uidDono && !stream.apagados.includes(uidDono) && !(await naLista(uidDono)));
      checa("…e espera a folga do envio em andamento", !stream.apagados.includes(recente) && (await naLista(recente)));
      await db.delete(streamPendentes).where(eq(streamPendentes.uid, recente));
      if (idDono) await marina.req("DELETE", `/api/admin/media/${idDono}`);

      // Apagar a rifa (sem venda) leva o vídeo guardado junto.
      stream.modo = "normal";
      r = await subir(falso);
      const idDaRifa = r.json?.id as string;
      const uidDaRifa = idDaRifa ? (await esperaPor(async () => (await daMidia(idDaRifa))?.uid))! : null;
      r = await marina.req("DELETE", `/api/admin/campaigns/${rifa.id}`);
      checa("excluir a rifa apaga no Stream o vídeo guardado", r.status === 200 && !!uidDaRifa && stream.apagados.includes(uidDaRifa), `HTTP ${r.status}`);
      checa("todo pedido ao Stream levou o token no cabeçalho", stream.semToken === 0, String(stream.semToken));
    }
  } finally {
    for (const id of storiesCriados) await marina.req("DELETE", `/api/admin/stories/${id}`).catch(() => {});
    if (storiesCriados.length) await db.delete(stories).where(inArray(stories.id, storiesCriados));
    await limpar();
    await fs.rm(pasta, { recursive: true, force: true });
    falso_stream?.close();
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
