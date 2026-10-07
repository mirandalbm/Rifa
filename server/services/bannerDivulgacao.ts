/**
 * A entidade beneficiada pela rifa e o banner dela (regras em
 * `shared/bannerDivulgacao.ts`): só existe quando o organizador destina a
 * rifa a uma ONG, fundação ou outra organização. Não é termo da rifa
 * (prêmio, preço, autorização): muda a qualquer hora, antes ou depois de
 * publicar. O recorte é da rota (`assertCampaignInScope`).
 *
 * - As imagens nunca são servidas como vieram: um envio só, reprocessado em
 *   WebP (o banner 1200×400 e a grande até 1200 px), sem metadados, aberto
 *   com teto de 40 megapixels, conferido **antes** de gravar.
 * - Nome e texto na régua da legenda (sem link e sem telefone), com a
 *   varredura do Pix por fora; site e redes em campo próprio, conferidos.
 * - Público só com a rifa publicada ou sorteada (rascunho é 404, como toda
 *   rota por `slug`), a promotora nem arquivada nem banida e os documentos
 *   da entidade conferidos pela plataforma (resposta 2.5 do advogado: CNPJ
 *   ativo, ata da diretoria e certidão de regularidade fiscal; CEBAS
 *   opcional). Trocar nome, CNPJ ou documento volta à análise.
 */
import sharp from "sharp";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { campaignBannersDivulgacao, campaigns, entidadeDocumentos, organizations } from "@shared/schema";
import {
  BANNER_DIVULGACAO_ALTURA,
  BANNER_DIVULGACAO_LARGURA,
  EntidadeInvalida,
  IMAGEM_GRANDE_LADO,
  urlDoBannerDeDivulgacao,
  validarEntidade,
  DOCUMENTOS_DA_ENTIDADE,
  DOCUMENTO_DA_ENTIDADE_MAX_BYTES,
  situacaoDepoisDoEnvio,
  validarDecisaoDaEntidade,
  type DadosDaEntidade,
  type SituacaoDosDocumentos,
} from "@shared/bannerDivulgacao";
import { cifrar, decifrar } from "./cofre";
import { emSegundoPlano } from "./push";
import { varrerTextoDoOrganizador } from "./seguranca";

/** O que o navegador manda: até 5 MB de imagem (a tela reduz antes). */
const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;

export class BannerDivulgacaoError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

async function processarImagens(dataUrl: unknown): Promise<{ banner: Buffer; grande: Buffer }> {
  const m = typeof dataUrl === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl) : null;
  if (!m) throw new BannerDivulgacaoError("Envie uma imagem em JPG, PNG ou WebP.");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > IMAGEM_MAX_BYTES) throw new BannerDivulgacaoError("A imagem passa de 5 MB.", 413);
  try {
    const abrir = () => sharp(bruto, { limitInputPixels: 40_000_000 }).rotate();
    const [banner, grande] = await Promise.all([
      abrir()
        .resize(BANNER_DIVULGACAO_LARGURA, BANNER_DIVULGACAO_ALTURA, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toBuffer(),
      abrir()
        .resize(IMAGEM_GRANDE_LADO, IMAGEM_GRANDE_LADO, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
    ]);
    return { banner, grande };
  } catch {
    throw new BannerDivulgacaoError("Não consegui ler essa imagem. Envie em JPG ou PNG.");
  }
}

function conferir(corpo: unknown): DadosDaEntidade {
  try {
    return validarEntidade(corpo);
  } catch (e) {
    if (e instanceof EntidadeInvalida) throw new BannerDivulgacaoError(e.message);
    throw e;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Os tipos de documento já enviados (lidos na transação de quem chama). */
async function tiposEnviados(tx: Tx, campaignId: string): Promise<string[]> {
  const linhas = await tx.select({ tipo: entidadeDocumentos.tipo }).from(entidadeDocumentos).where(eq(entidadeDocumentos.campaignId, campaignId));
  return linhas.map((l) => l.tipo);
}

/** Volta (ou vai) à análise: o que a plataforma decidiu antes não vale mais. */
const reabrir = (situacao: SituacaoDosDocumentos) => ({
  documentosStatus: situacao,
  documentosEnviadosEm: situacao === "em_analise" ? new Date() : null,
  documentosMotivo: null,
  documentosDecididoEm: null,
  documentosDecididoPor: null,
});

/**
 * Grava (ou troca) a entidade. Sem `imagem` no corpo, muda só os dados do
 * que já existe; com imagem, troca tudo. Tudo é conferido antes de gravar.
 * Trocar o nome ou o CNPJ volta a conferência à análise (os documentos são
 * daquele nome e daquele CNPJ); texto, site, redes e imagem não.
 */
export async function salvarBannerDeDivulgacao(
  campaignId: string,
  organizationId: string | null,
  corpo: Record<string, unknown>,
) {
  const dados = conferir(corpo);
  const imagens = corpo.imagem === undefined ? null : await processarImagens(corpo.imagem);

  const linha = await db.transaction(async (tx) => {
    // A linha travada: a decisão da plataforma, um envio de documento ou
    // outra edição no meio esperam (nunca decidir sobre o CNPJ que mudou).
    const [atual] = await tx
      .select({ nome: campaignBannersDivulgacao.nome, cnpj: campaignBannersDivulgacao.cnpj })
      .from(campaignBannersDivulgacao)
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId))
      .for("update");
    if (!atual && !imagens) throw new BannerDivulgacaoError("Escolha a imagem da entidade.");
    const mudouQuem = !atual || atual.nome !== dados.nome || atual.cnpj !== dados.cnpj;
    const conferencia = mudouQuem ? reabrir(situacaoDepoisDoEnvio(await tiposEnviados(tx, campaignId))) : {};
    const valores = {
      ...dados,
      ...conferencia,
      ...(imagens ? { mime: "image/webp", bytes: imagens.banner, bytesGrande: imagens.grande } : {}),
      updatedAt: new Date(),
    };
    if (!atual) {
      // Duas primeiras gravações ao mesmo tempo: a chave decide, a outra é 409.
      const [nova] = await tx
        .insert(campaignBannersDivulgacao)
        .values({ campaignId, ...dados, ...conferencia, mime: "image/webp", bytes: imagens!.banner, bytesGrande: imagens!.grande })
        .onConflictDoNothing()
        .returning({ nome: campaignBannersDivulgacao.nome, situacao: campaignBannersDivulgacao.documentosStatus });
      if (!nova) throw new BannerDivulgacaoError("A entidade acabou de ser gravada por outra tela. Abra de novo e confira.", 409);
      return nova;
    }
    const [salva] = await tx
      .update(campaignBannersDivulgacao)
      .set(valores)
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId))
      .returning({ nome: campaignBannersDivulgacao.nome, situacao: campaignBannersDivulgacao.documentosStatus });
    return salva;
  });
  if (organizationId) {
    emSegundoPlano(
      varrerTextoDoOrganizador({
        organizationId,
        campaignId,
        onde: "entidade beneficiada da rifa",
        texto: `${dados.nome}\n${dados.texto}`,
      }),
      "varredura",
    );
  }
  return { ...dados, nome: linha.nome, documentos: linha.situacao as SituacaoDosDocumentos };
}

/** O tipo pelo conteúdo, não pelo que o navegador disse: foto ou PDF. */
function mimeDoDocumento(b: Buffer): string | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/**
 * Um documento da entidade, cifrado no cofre. Conferido antes da transação;
 * dentro dela, a entidade travada, o documento gravado (o do mesmo tipo é
 * trocado) e a conferência recalculada — completa vai à análise, aprovada que
 * mudou volta para ela.
 */
export async function salvarDocumentoDaEntidade(campaignId: string, tipo: string, dataUrl: unknown) {
  if (!(tipo in DOCUMENTOS_DA_ENTIDADE)) throw new BannerDivulgacaoError("Tipo de documento desconhecido.", 400);
  const m = /^data:[a-z/+.-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new BannerDivulgacaoError("Envie uma foto (JPG, PNG, WebP) ou um PDF.", 400);
  const bruto = Buffer.from(m[1], "base64");
  if (bruto.length > DOCUMENTO_DA_ENTIDADE_MAX_BYTES) throw new BannerDivulgacaoError("O arquivo passa de 5 MB.", 413);
  const mime = mimeDoDocumento(bruto);
  if (!mime) throw new BannerDivulgacaoError("O arquivo não é foto nem PDF.", 400);
  const c = cifrar(bruto);
  return db.transaction(async (tx) => {
    const [entidade] = await tx
      .select({ campaignId: campaignBannersDivulgacao.campaignId })
      .from(campaignBannersDivulgacao)
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId))
      .for("update");
    if (!entidade) throw new BannerDivulgacaoError("Cadastre a entidade antes de enviar os documentos.", 409);
    const valores = { mime, tamanho: bruto.length, dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, createdAt: new Date() };
    await tx
      .insert(entidadeDocumentos)
      .values({ campaignId, tipo, ...valores })
      .onConflictDoUpdate({ target: [entidadeDocumentos.campaignId, entidadeDocumentos.tipo], set: valores });
    const situacao = situacaoDepoisDoEnvio(await tiposEnviados(tx, campaignId));
    await tx
      .update(campaignBannersDivulgacao)
      .set({ ...reabrir(situacao), updatedAt: new Date() })
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
    return situacao;
  });
}

/** Os documentos enviados, sem o conteúdo (tipo, formato, tamanho, data). */
export async function documentosEnviados(campaignId: string) {
  return db
    .select({ tipo: entidadeDocumentos.tipo, mime: entidadeDocumentos.mime, tamanho: entidadeDocumentos.tamanho, em: entidadeDocumentos.createdAt })
    .from(entidadeDocumentos)
    .where(eq(entidadeDocumentos.campaignId, campaignId))
    .orderBy(asc(entidadeDocumentos.tipo));
}

/** A fila da plataforma: as entidades em análise, a mais antiga primeiro. Sem conteúdo dos documentos. */
export async function entidadesParaConferir() {
  const linhas = await db
    .select({
      campaignId: campaignBannersDivulgacao.campaignId,
      nome: campaignBannersDivulgacao.nome,
      cnpj: campaignBannersDivulgacao.cnpj,
      site: campaignBannersDivulgacao.site,
      versao: campaignBannersDivulgacao.documentosEnviadosEm,
      rifa: campaigns.title,
      organizacao: organizations.name,
    })
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(eq(campaignBannersDivulgacao.documentosStatus, "em_analise"))
    .orderBy(asc(campaignBannersDivulgacao.documentosEnviadosEm))
    .limit(200);
  return Promise.all(linhas.map(async (l) => ({ ...l, documentos: await documentosEnviados(l.campaignId) })));
}

/** Um documento decifrado (a auditoria é gravada pela rota, antes). */
export async function documentoDaEntidade(campaignId: string, tipo: string) {
  if (!(tipo in DOCUMENTOS_DA_ENTIDADE)) return null;
  const [d] = await db
    .select()
    .from(entidadeDocumentos)
    .where(and(eq(entidadeDocumentos.campaignId, campaignId), eq(entidadeDocumentos.tipo, tipo)));
  if (!d) return null;
  return { mime: d.mime, bytes: decifrar({ dados: d.dados, iv: d.iv, tag: d.tag, versao: d.chaveVersao }) };
}

/**
 * A plataforma decide a versão que conferiu (`documentos_enviados_em`):
 * `UPDATE` condicional — dois cliques, uma decisão; documento novo ou CNPJ
 * trocado no meio, 409.
 */
export async function decidirEntidade(campaignId: string, bruto: unknown, userId: string | null) {
  let d;
  try {
    d = validarDecisaoDaEntidade(bruto);
  } catch (e) {
    if (e instanceof EntidadeInvalida) throw new BannerDivulgacaoError(e.message);
    throw e;
  }
  const [feita] = await db
    .update(campaignBannersDivulgacao)
    .set({ documentosStatus: d.status, documentosMotivo: d.motivo, documentosDecididoEm: new Date(), documentosDecididoPor: userId })
    .where(
      and(
        eq(campaignBannersDivulgacao.campaignId, campaignId),
        eq(campaignBannersDivulgacao.documentosStatus, "em_analise"),
        sql`date_trunc('milliseconds', ${campaignBannersDivulgacao.documentosEnviadosEm}) = ${new Date(d.versao).toISOString()}::timestamp`,
      ),
    )
    .returning({ nome: campaignBannersDivulgacao.nome });
  if (!feita) throw new BannerDivulgacaoError("Esta entidade mudou ou já foi decidida. Abra de novo e confira.", 409);
  return { status: d.status, motivo: d.motivo, nome: feita.nome };
}

export async function removerBannerDeDivulgacao(campaignId: string) {
  // Os documentos saem com a entidade: sem ela, não há para que guardá-los.
  await db.transaction(async (tx) => {
    await tx.delete(entidadeDocumentos).where(eq(entidadeDocumentos.campaignId, campaignId));
    await tx.delete(campaignBannersDivulgacao).where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  });
}

const dadosSemBytes = {
  nome: campaignBannersDivulgacao.nome,
  cnpj: campaignBannersDivulgacao.cnpj,
  documentos: campaignBannersDivulgacao.documentosStatus,
  motivo: campaignBannersDivulgacao.documentosMotivo,
  texto: campaignBannersDivulgacao.texto,
  site: campaignBannersDivulgacao.site,
  redes: campaignBannersDivulgacao.redes,
  em: campaignBannersDivulgacao.updatedAt,
};

/** Para o painel (no recorte da rota): os dados e a data, sem os bytes. */
export async function bannerDoPainel(campaignId: string) {
  const [b] = await db.select(dadosSemBytes).from(campaignBannersDivulgacao).where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

export async function imagemDoPainel(campaignId: string) {
  const [b] = await db
    .select({ mime: campaignBannersDivulgacao.mime, bytes: campaignBannersDivulgacao.bytes })
    .from(campaignBannersDivulgacao)
    .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

/**
 * A régua do público: rifa publicada ou já sorteada (nunca rascunho),
 * promotora no ar e os documentos da entidade conferidos pela plataforma.
 */
const noAr = (slug: string) =>
  and(
    eq(campaigns.slug, slug),
    ne(campaigns.status, "draft"),
    isNull(organizations.archivedAt),
    isNull(organizations.banidaEm),
    eq(campaignBannersDivulgacao.documentosStatus, "aprovado"),
  );

/** O que a página da rifa recebe (a rota já conferiu que ela não é rascunho). */
export async function bannerPublico(campaignId: string, slug: string) {
  // A mesma régua da imagem: promotora arquivada ou banida, a entidade não sai.
  const [b] = await db
    .select(dadosSemBytes)
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaignBannersDivulgacao.campaignId, campaignId), noAr(slug)));
  if (!b) return null;
  return {
    nome: b.nome,
    texto: b.texto,
    site: b.site,
    redes: b.redes,
    url: urlDoBannerDeDivulgacao(slug, b.em),
    urlGrande: urlDoBannerDeDivulgacao(slug, b.em, true),
  };
}

export async function imagemPublica(slug: string, grande: boolean) {
  const [b] = await db
    .select({
      mime: campaignBannersDivulgacao.mime,
      bytes: grande ? campaignBannersDivulgacao.bytesGrande : campaignBannersDivulgacao.bytes,
    })
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(noAr(slug));
  return b ?? null;
}
