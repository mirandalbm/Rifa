/**
 * O lado do servidor do editor de imagem (Fase C): o que a tela recebe para
 * montar a imagem — as fotos da rifa, as informações oficiais, a foto da
 * organização e o endereço do QR — e a conferência do texto antes de ele
 * virar pixel. A régua mora em `shared/editorImagem.ts`; o recorte é da rota.
 */
import { ehUuid } from "@shared/uuid";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { campaignMedia, campaigns, organizacaoFotos, organizations } from "@shared/schema";
import { formatBRL } from "@shared/format";
import { pedePagamentoPorFora } from "@shared/seguranca";
import { textosDasCamadas, validarCamadas, type Camada, type Foco } from "@shared/editorImagem";
import { focoDosBytes } from "./foco";
import { ROTULO_DA_ARTE } from "@shared/artes";
import { storage } from "./storage";
import { urlDaFoto } from "./perfil";
import { artesDaRifa, rifaDaArte, type RifaDaArte } from "./artes";
import { varrerTextoDoOrganizador } from "./seguranca";
import { emSegundoPlano } from "./push";
import { dataDoSorteio, quemApura } from "@shared/artes";
import { TIPOS_DE_SUGESTAO, type DadosParaSugerir, type TipoDeSugestao } from "@shared/sugestaoIA";
import { IAError, sugerirComIA } from "./ia";
import { ChatbaseError } from "./chatbase";
import { CobrancaIAError } from "./iaCobranca";
import type { Request } from "express";

export class EditorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Tudo que a tela usa; nada disso é digitado por ela. `null` = rifa
 * inexistente. `link` é o endereço do QR: no painel, o da rifa; no kit do
 * afiliado, o dele (tirado da sessão pela rota).
 */
export async function dadosDoEditor(campaignId: string, link: string, rifa?: RifaDaArte) {
  const r = rifa ?? (await rifaDaArte(campaignId));
  if (!r) return null;
  const [org] = await db
    .select({ slug: organizations.slug, fotoEm: organizacaoFotos.updatedAt })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(eq(campaigns.id, campaignId));
  // As fotos prontas da rifa (banner e carrossel): o vídeo e o reels não entram.
  const fotos = await db
    .select({ id: campaignMedia.id, role: campaignMedia.role, key: campaignMedia.storageKey, alt: campaignMedia.altText, mime: campaignMedia.mime })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.status, "ready"), inArray(campaignMedia.role, ["banner", "photo"])))
    .orderBy(asc(campaignMedia.role), asc(campaignMedia.position));
  const store = storage();
  return {
    slug: r.slug,
    link,
    organizacao: { nome: r.orgNome, foto: org ? urlDaFoto(org.slug, org.fotoEm) : null },
    oficiais: {
      preco: `${formatBRL(r.dados.precoCents)} a cota`,
      selo: r.dados.autorizacao ? `Autorizada SPA/MF nº ${r.dados.autorizacao}` : null,
    },
    fundos: fotos
      .filter((f) => f.mime.startsWith("image/"))
      .map((f, i) => ({ id: f.id, url: store.publicUrl(f.key), rotulo: f.role === "banner" ? "Banner da rifa" : f.alt || `Foto ${i + 1}` })),
    artes: artesDaRifa(r).map((tipo) => ({ tipo, rotulo: ROTULO_DA_ARTE[tipo] })),
  };
}

/**
 * Confere as camadas antes de a tela desenhar a imagem final. O pedido de Pix
 * por fora é **recusado** aqui (na imagem, nenhuma varredura o leria de novo)
 * e vira denúncia automática em segundo plano, como o texto de terceiro.
 */
export function conferirCamadas(
  corpo: unknown,
  rifa: { id: string; organizationId: string; temSelo: boolean },
  /** Quem escreveu, para a evidência: a organização, ou o terceiro (o afiliado e o código dele). */
  quem: string | null = null,
): Camada[] {
  let camadas: Camada[];
  try {
    camadas = validarCamadas(corpo, { temSelo: rifa.temSelo });
  } catch (e) {
    throw new EditorError(422, (e as Error).message);
  }
  const texto = textosDasCamadas(camadas);
  if (texto && pedePagamentoPorFora(texto)) {
    emSegundoPlano(
      varrerTextoDoOrganizador({
        organizationId: rifa.organizationId,
        campaignId: rifa.id,
        onde: quem
          ? `texto de terceiro (${quem}) no editor de imagem, recusado e não virou imagem`
          : "texto do editor de imagem (recusado, não virou imagem)",
        texto,
      }),
      "varredura do editor de imagem",
    );
    throw new EditorError(422, "O texto da imagem pede pagamento por fora da plataforma. Só vale bilhete pago pela plataforma.");
  }
  return camadas;
}

/** Os dados públicos da rifa que vão no pedido de sugestão ao assistente — nunca dado de comprador. */
export function dadosParaSugerir(r: RifaDaArte): DadosParaSugerir {
  return {
    premio: r.dados.premio,
    preco: formatBRL(r.dados.precoCents),
    sorteio: r.dados.drawAt ? `${dataDoSorteio(r.dados.drawAt)} ${quemApura(r.dados.metodoApuracao)}` : null,
    organizacao: r.orgNome,
  };
}

/** O tipo pedido pela tela: só os conhecidos (o resto é 422). */
export function tipoDaSugestao(v: unknown): TipoDeSugestao {
  if (typeof v === "string" && (TIPOS_DE_SUGESTAO as readonly string[]).includes(v)) return v as TipoDeSugestao;
  throw new EditorError(422, "Esse tipo de sugestão não existe.");
}

/**
 * Pede a sugestão ao assistente com os dados da rifa (o recorte já foi feito
 * pela rota) e traduz os erros do assistente — desligado (404), sem saldo
 * (402), limite (429), Chatbase fora — em `EditorError` com a mensagem.
 */
export async function sugerirTexto(req: Request, tipo: TipoDeSugestao, r: RifaDaArte) {
  try {
    return await sugerirComIA(req, tipo, dadosParaSugerir(r));
  } catch (e) {
    if (e instanceof IAError || e instanceof ChatbaseError || e instanceof CobrancaIAError) throw new EditorError(e.status, e.message);
    throw e;
  }
}

/**
 * O assunto de uma foto da rifa (banner ou foto do carrossel, pronta): o
 * recorte atento do `sharp`, o mesmo das artes prontas. A chave do arquivo
 * nunca muda (a troca é outra mídia), então o resultado fica guardado na
 * memória. `null` = a foto não é desta rifa (a rota responde 404); `{ foco:
 * null }` = não deu para achar (a tela começa no meio).
 */
const FOCOS_GUARDADOS_MAX = 500;
const focos = new Map<string, Foco | null>();

export async function focoDaFoto(campaignId: string, mediaId: string): Promise<{ foco: Foco | null } | null> {
  if (!ehUuid(mediaId)) return null;
  const [m] = await db
    .select({ key: campaignMedia.storageKey, mime: campaignMedia.mime })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.id, mediaId), eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.status, "ready"), inArray(campaignMedia.role, ["banner", "photo"])));
  if (!m || !m.mime.startsWith("image/")) return null;
  if (focos.has(m.key)) return { foco: focos.get(m.key) ?? null };
  let bytes: Buffer;
  try {
    bytes = await storage().readAll(m.key);
  } catch {
    // Falha de leitura (disco, cópia) não fica guardada: a próxima vez tenta de novo.
    return { foco: null };
  }
  const foco = await focoDosBytes(bytes);
  if (focos.size >= FOCOS_GUARDADOS_MAX) focos.delete(focos.keys().next().value!);
  focos.set(m.key, foco);
  return { foco };
}
