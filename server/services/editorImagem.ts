/**
 * O lado do servidor do editor de imagem (Fase C): o que a tela recebe para
 * montar a imagem — as fotos da rifa, as informações oficiais, a foto da
 * organização e o endereço do QR — e a conferência do texto antes de ele
 * virar pixel. A régua mora em `shared/editorImagem.ts`; o recorte é da rota.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { campaignMedia, campaigns, organizacaoFotos, organizations } from "@shared/schema";
import { formatBRL } from "@shared/format";
import { pedePagamentoPorFora } from "@shared/seguranca";
import { textosDasCamadas, validarCamadas, type Camada } from "@shared/editorImagem";
import { ROTULO_DA_ARTE } from "@shared/artes";
import { storage } from "./storage";
import { urlDaFoto } from "./perfil";
import { artesDaRifa, rifaDaArte } from "./artes";
import { varrerTextoDoOrganizador } from "./seguranca";
import { emSegundoPlano } from "./push";

export class EditorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Tudo que a tela usa; nada disso é digitado por ela. `null` = rifa inexistente. */
export async function dadosDoEditor(campaignId: string, link: string) {
  const r = await rifaDaArte(campaignId);
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
        onde: "texto do editor de imagem (recusado, não virou imagem)",
        texto,
      }),
      "varredura do editor de imagem",
    );
    throw new EditorError(422, "O texto da imagem pede pagamento por fora da plataforma. Só vale bilhete pago pela plataforma.");
  }
  return camadas;
}
