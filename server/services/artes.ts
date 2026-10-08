/**
 * O desenho das artes prontas (Fase A do `docs/PLANO-FERRAMENTAS.md`). As
 * regras — quais artes a rifa tem e o que cada uma diz — moram em
 * `shared/artes.ts`; aqui a rifa vira imagem.
 *
 * - **O texto vira contorno** (fontkit sobre as fontes do `@fontsource`): o
 *   desenho não depende de fonte instalada no servidor, e o mesmo arquivo
 *   sai igual em qualquer máquina.
 * - **Nada do navegador entra no desenho**: os dados vêm da rifa no banco,
 *   e o endereço do QR é montado pela rota (com o código do afiliado da
 *   sessão, nunca de um parâmetro).
 * - **A imagem de fundo nunca é servida como veio**: o `sharp` corta,
 *   escurece e regrava em JPEG, sem metadados.
 */
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import sharp, { type OverlayOptions } from "sharp";
import { db } from "../db";
import {
  buyers,
  campaignMedia,
  campaignStats,
  campaigns,
  draws,
  orders,
  organizacaoFotos,
  organizations,
  prizedQuotas,
} from "@shared/schema";
import { FORMATOS_DA_ARTE, artesDisponiveis, type TipoDeArte } from "@shared/artes";
import { rifaAVenda } from "@shared/carrinho";
import { nomeCurto } from "@shared/aoVivo";
import { getPaymentMethods } from "./settings";
import { storage } from "./storage";
import { fotoDoGanhador } from "./ganhador";
import { camadaDaArte, type PedidoDeArte, type RifaDaArte } from "./arteDesenho";

export type { PedidoDeArte, RifaDaArte };

// ---------------------------------------------------------------- dados

const VERDE = "#00873e";
const COR_VALIDA = /^#[0-9a-f]{6}$/i;

/** A rifa com tudo que a arte usa, ou `null`. O recorte é da rota, antes. */
export async function rifaDaArte(campaignId: string): Promise<RifaDaArte | null> {
  const [c] = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      status: campaigns.status,
      premio: campaigns.prizeTitle,
      precoCents: campaigns.priceCents,
      totalQuotas: campaigns.totalQuotas,
      drawAt: campaigns.drawAt,
      metodoApuracao: campaigns.metodoApuracao,
      autorizacao: campaigns.authorizationCode,
      demonstracao: campaigns.demonstracao,
      travadaEm: campaigns.travadaEm,
      organizationId: campaigns.organizationId,
      orgNome: organizations.name,
      orgArquivada: organizations.archivedAt,
      orgBanida: organizations.banidaEm,
      destaque: organizations.destaqueClaro,
      vendidas: campaignStats.soldCount,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.id, campaignId));
  if (!c) return null;

  const [sorteio] = await db
    .select({ numero: draws.winnerNumber, sorteado: draws.resultNumber, nome: buyers.name })
    .from(draws)
    .leftJoin(orders, eq(orders.id, draws.winnerOrderId))
    .leftJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(eq(draws.campaignId, c.id), isNotNull(draws.executedAt)))
    .orderBy(desc(draws.executedAt))
    .limit(1);
  const numeroDoResultado = sorteio ? (sorteio.numero ?? sorteio.sorteado) : null;

  // Só a cota premiada já reclamada por pedido pago — o número em jogo nunca sai.
  const premiadas = await db
    .select({ numero: prizedQuotas.number, premio: prizedQuotas.prizeLabel, nome: buyers.name })
    .from(prizedQuotas)
    .innerJoin(orders, eq(orders.id, prizedQuotas.claimedByOrderId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(eq(prizedQuotas.campaignId, c.id), eq(orders.status, "paid")))
    .orderBy(desc(prizedQuotas.claimedAt))
    .limit(5);

  const midias = await db
    .select({ role: campaignMedia.role, mime: campaignMedia.mime, key: campaignMedia.storageKey, poster: campaignMedia.posterKey, position: campaignMedia.position })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, c.id), eq(campaignMedia.status, "ready"), ne(campaignMedia.role, "reels")));
  midias.sort((a, b) => Number(b.role === "banner") - Number(a.role === "banner") || a.position - b.position);
  const imagem = midias.find((m) => m.mime.startsWith("image/"));
  const capaKey = imagem?.key ?? midias.find((m) => m.poster)?.poster ?? null;

  const pix = (await getPaymentMethods()).pix_online;
  const travada = Boolean(c.travadaEm) || Boolean(c.orgArquivada) || Boolean(c.orgBanida);
  const vendidas = c.vendidas ?? 0;
  return {
    id: c.id,
    slug: c.slug,
    organizationId: c.organizationId,
    orgNome: c.orgNome,
    destaque: c.destaque && COR_VALIDA.test(c.destaque) ? c.destaque : VERDE,
    capaKey,
    dados: {
      premio: c.premio,
      precoCents: c.precoCents,
      totalQuotas: c.totalQuotas,
      vendidas,
      drawAt: c.drawAt,
      metodoApuracao: c.metodoApuracao,
      autorizacao: c.autorizacao,
      status: c.status,
      demonstracao: c.demonstracao,
      travada,
      vende: rifaAVenda({ status: c.status, demonstracao: c.demonstracao, travada, soldCount: vendidas, totalQuotas: c.totalQuotas, pixOnline: pix }),
      resultado: numeroDoResultado == null ? null : { numero: numeroDoResultado, nome: sorteio?.numero != null && sorteio.nome ? nomeCurto(sorteio.nome) : null },
      premiadas: premiadas.map((p) => ({ numero: p.numero, premio: p.premio, nome: nomeCurto(p.nome) })),
    },
  };
}

// ---------------------------------------------------------------- desenho

async function lerImagem(key: string): Promise<Buffer | null> {
  try {
    if (key.startsWith("data:")) {
      const m = /^data:[^;,]+;base64,(.*)$/s.exec(key);
      return m ? Buffer.from(m[1], "base64") : null;
    }
    return await storage().readAll(key);
  } catch {
    return null;
  }
}

/** O fundo: a foto cortada ao centro de interesse, ou o degradê da casa. */
async function fundo(largura: number, altura: number, imagem: Buffer | null): Promise<Buffer> {
  if (imagem) {
    try {
      return await sharp(imagem, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(largura, altura, { fit: "cover", position: "attention" })
        .removeAlpha()
        .png()
        .toBuffer();
    } catch {
      // Imagem que o sharp não abre: segue com o degradê.
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1f14"/><stop offset="1" stop-color="#00873e"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A foto da organização num círculo, para o canto de cima. */
async function logoRedondo(organizationId: string, lado: number): Promise<Buffer | null> {
  const [f] = await db.select({ bytes: organizacaoFotos.bytes }).from(organizacaoFotos).where(eq(organizacaoFotos.organizationId, organizationId));
  if (!f) return null;
  try {
    const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}"/></svg>`);
    return await sharp(Buffer.from(f.bytes), { limitInputPixels: 40_000_000 })
      .resize(lado, lado, { fit: "cover" })
      .composite([{ input: mascara, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

const GUARDA_MS = 60_000;
const GUARDA_MAX = 200;
const guardadas = new Map<string, { em: number; jpeg: Buffer }>();

/** Desenha a arte (JPEG). Guarda 60 s por rifa, tipo, formato e endereço. */
export async function desenharArte(p: PedidoDeArte): Promise<Buffer> {
  const chave = `${p.rifa.id}|${p.tipo}|${p.formato}|${p.url}`;
  const agora = Date.now();
  const guardada = guardadas.get(chave);
  if (guardada && agora - guardada.em < GUARDA_MS) return guardada.jpeg;

  const { largura, altura } = FORMATOS_DA_ARTE[p.formato];
  let imagem: Buffer | null = null;
  if (p.tipo === "resultado") {
    const f = await fotoDoGanhador(p.rifa.id);
    if (f) imagem = Buffer.from(f.bytes);
  }
  if (!imagem && p.rifa.capaKey) imagem = await lerImagem(p.rifa.capaKey);

  const [base, logo] = await Promise.all([fundo(largura, altura, imagem), logoRedondo(p.rifa.organizationId, 88)]);
  const camada = camadaDaArte(p, Boolean(logo));
  const sobre: OverlayOptions[] = [{ input: Buffer.from(camada.svg), top: 0, left: 0 }];
  if (logo) sobre.push({ input: logo, top: camada.logo.y, left: camada.logo.x });
  const jpeg = await sharp(base).composite(sobre).jpeg({ quality: 86, mozjpeg: true }).toBuffer();

  if (guardadas.size >= GUARDA_MAX) {
    for (const [k, v] of guardadas) if (agora - v.em >= GUARDA_MS || guardadas.size >= GUARDA_MAX) guardadas.delete(k);
  }
  guardadas.set(chave, { em: agora, jpeg });
  return jpeg;
}

/** As artes da rifa agora (a régua de `shared/artes.ts` sobre os dados do banco). */
export function artesDaRifa(r: RifaDaArte): TipoDeArte[] {
  return artesDisponiveis(r.dados);
}
