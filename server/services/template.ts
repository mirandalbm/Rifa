/**
 * Template da plataforma: rascunho, publicação e versões.
 *
 * - O **rascunho** fica em `app_settings` e só o administrador geral vê (a
 *   pré-visualização lê dele).
 * - **Publicar** grava uma linha nova em `template_versoes`; a vitrine usa a
 *   mais recente. Nada é sobrescrito.
 * - **Voltar** publica de novo o conteúdo de uma versão antiga, como versão
 *   nova — o histórico continua linear e dá para desfazer o "voltar".
 *
 * Todo conteúdo passa por `validarTemplate()` antes de gravar, e de novo ao
 * ler (`completarTemplate`): versão guardada que não valide mais (regra
 * nova) cai no padrão em vez de derrubar a vitrine.
 */
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { appSettings, plataformaArquivos, templateVersoes, users } from "@shared/schema";
import {
  TEMPLATE_PADRAO,
  TemplateInvalido,
  completarTemplate,
  validarTemplate,
  type Template,
} from "@shared/template";

export class TemplateError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "TemplateError";
  }
}

const CHAVE_RASCUNHO = "template.rascunho";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** A vitrine lê o publicado a cada carga; 30 s de memória poupa o banco sem atrasar muito uma publicação em outra réplica. */
const MEMORIA_MS = 30_000;

let memoria: { em: number; valor: { template: Template; versao: string | null } } | null = null;

function validar(t: unknown): Template {
  try {
    return validarTemplate(t);
  } catch (e) {
    if (e instanceof TemplateInvalido) throw new TemplateError(e.message);
    throw e;
  }
}

export async function templatePublicado(): Promise<{ template: Template; versao: string | null }> {
  if (memoria && Date.now() - memoria.em < MEMORIA_MS) return memoria.valor;
  const [v] = await db.select().from(templateVersoes).orderBy(desc(templateVersoes.publicadoEm)).limit(1);
  const valor = v ? { template: completarTemplate(v.conteudo), versao: v.id } : { template: TEMPLATE_PADRAO, versao: null };
  memoria = { em: Date.now(), valor };
  return valor;
}

export async function rascunho(): Promise<Template> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, CHAVE_RASCUNHO));
  return r ? completarTemplate(r.value) : (await templatePublicado()).template;
}

export async function salvarRascunho(entrada: unknown): Promise<Template> {
  const t = validar(entrada);
  await db
    .insert(appSettings)
    .values({ key: CHAVE_RASCUNHO, value: t })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: t, updatedAt: new Date() } });
  return t;
}

export async function publicar(userId: string) {
  const t = validar(await rascunho());
  const [v] = await db.insert(templateVersoes).values({ conteudo: t, publicadoPor: userId }).returning();
  memoria = null;
  return v;
}

/** Volta a uma versão: publica o conteúdo dela como versão nova, e o rascunho acompanha. */
export async function restaurar(versaoId: string, userId: string) {
  const [antiga] = await db.select().from(templateVersoes).where(eq(templateVersoes.id, versaoId));
  if (!antiga) throw new TemplateError("Versão não encontrada.", 404);
  const t = validar(antiga.conteudo);
  await salvarRascunho(t);
  const [v] = await db
    .insert(templateVersoes)
    .values({ conteudo: t, publicadoPor: userId, restauradaDe: antiga.id })
    .returning();
  memoria = null;
  return v;
}

export async function versoes(limite = 20) {
  return db
    .select({
      id: templateVersoes.id,
      publicadoEm: templateVersoes.publicadoEm,
      restauradaDe: templateVersoes.restauradaDe,
      por: users.name,
    })
    .from(templateVersoes)
    .leftJoin(users, eq(users.id, templateVersoes.publicadoPor))
    .orderBy(desc(templateVersoes.publicadoEm))
    .limit(limite);
}

/* ------------------------------------------------------------------ *
 * Logo
 * ------------------------------------------------------------------ */

/**
 * A logo é reprocessada (até 96 px de altura, WebP, sem metadados) e o
 * endereço entra no **rascunho** — só vai ao ar quando publicar. O arquivo
 * anterior é substituído; o endereço leva a data, então a versão publicada
 * antiga passa a mostrar a logo nova (é o mesmo lugar). Serve bem para uma
 * plataforma só.
 */
export async function salvarLogo(dataUrl: unknown): Promise<Template> {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new TemplateError("Envie a logo em PNG, JPG ou WebP.");
  const bruto = Buffer.from(m[3], "base64");
  if (bruto.length > LOGO_MAX_BYTES) throw new TemplateError("A logo passa de 2 MB.");
  let bytes: Buffer;
  try {
    bytes = await sharp(bruto, { limitInputPixels: 25_000_000 })
      .resize({ height: 96, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new TemplateError("Não consegui ler essa imagem.");
  }
  const agora = new Date();
  await db
    .insert(plataformaArquivos)
    .values({ chave: "logo", mime: "image/webp", bytes, updatedAt: agora })
    .onConflictDoUpdate({ target: plataformaArquivos.chave, set: { bytes, mime: "image/webp", updatedAt: agora } });
  const t = await rascunho();
  return salvarRascunho({ ...t, identidade: { ...t.identidade, logo: `/api/public/marca/logo?v=${agora.getTime()}` } });
}

export async function logo() {
  const [f] = await db.select().from(plataformaArquivos).where(eq(plataformaArquivos.chave, "logo"));
  return f ?? null;
}
