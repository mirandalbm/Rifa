import { randomUUID } from "node:crypto";
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

/**
 * Logo de apoio do rodapé: reprocessada como a logo (até 96 px de altura,
 * WebP, sem metadados), guardada com um id novo. Devolve o endereço para o
 * rascunho — entra no ar só ao publicar, com nome e link conferidos por
 * `validarApoios()`.
 */
export async function salvarApoio(dataUrl: unknown): Promise<{ id: string; imagem: string }> {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new TemplateError("Envie o logo em PNG, JPG ou WebP.");
  const bruto = Buffer.from(m[3], "base64");
  if (bruto.length > LOGO_MAX_BYTES) throw new TemplateError("O logo passa de 2 MB.");
  let bytes: Buffer;
  try {
    bytes = await sharp(bruto, { limitInputPixels: 25_000_000 })
      .resize({ height: 96, width: 320, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new TemplateError("Não consegui ler essa imagem.");
  }
  const id = randomUUID();
  const agora = new Date();
  await db.insert(plataformaArquivos).values({ chave: `apoio:${id}`, mime: "image/webp", bytes, updatedAt: agora });
  return { id, imagem: `/api/public/marca/apoio/${id}?v=${agora.getTime()}` };
}

/**
 * Quatro ícones neutros (coração, mão, folha, casa) em azul e verde — a
 * paleta do sistema, sem marca de ninguém. Servem só para ver o rodapé
 * preenchido antes de ter os logos de verdade.
 */
const ICONES_DE_EXEMPLO: { nome: string; cor: string; desenho: string }[] = [
  {
    nome: "Exemplo: casa de apoio",
    cor: "#0b6fb8",
    desenho: '<path d="M48 22 20 46h8v26h40V46h8z" fill="#fff"/><rect x="42" y="52" width="12" height="20" fill="#0b6fb8"/>',
  },
  {
    nome: "Exemplo: projeto ambiental",
    cor: "#00873e",
    desenho:
      '<path d="M48 18c18 6 26 22 20 40-14 4-30-2-34-22 0-8 6-14 14-18z" fill="#fff"/><path d="M40 70c2-14 8-24 18-34" stroke="#00873e" stroke-width="4" fill="none"/>',
  },
  {
    nome: "Exemplo: projeto de saúde",
    cor: "#0b6fb8",
    desenho: '<path d="M40 22h16v18h18v16H56v18H40V56H22V40h18z" fill="#fff"/>',
  },
  {
    nome: "Exemplo: ação social",
    cor: "#00873e",
    desenho:
      '<path d="M48 72C22 54 18 38 28 28c8-8 18-4 20 4 2-8 12-12 20-4 10 10 6 26-20 44z" fill="#fff"/>',
  },
];

/**
 * Preenche o **rascunho** do rodapé com exemplo — redes, logos e o texto de
 * apresentação — para ver o desenho antes de ter o material de verdade.
 *
 * - Só preenche o que está vazio: nunca sobrescreve o que a plataforma já
 *   cadastrou, e rodar de novo não duplica nada.
 * - Não publica. O exemplo só chega ao público se a plataforma publicar —
 *   e a tela avisa para trocar antes: "Projetos que apoiamos" com apoiador
 *   inventado seria uma afirmação falsa para quem olha.
 * - Os links das redes são a raiz do domínio de cada rede (nunca uma conta
 *   de alguém), e os logos levam "Exemplo" no nome (é o texto alternativo).
 */
export async function preencherRodapeComExemplo(): Promise<{ template: Template; ids: string[] }> {
  const t = await rascunho();
  const ids: string[] = [];
  const apoios = [...(t.apoios ?? [])];
  if (apoios.length === 0) {
    for (const ic of ICONES_DE_EXEMPLO) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="46" fill="${ic.cor}"/>${ic.desenho}</svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const a = await salvarApoio(`data:image/png;base64,${png.toString("base64")}`);
      ids.push(a.id);
      apoios.push({ id: a.id, nome: ic.nome, imagem: a.imagem, link: null });
    }
  }
  const redes =
    (t.redes ?? []).length > 0
      ? t.redes!
      : [
          { rede: "instagram" as const, link: "https://www.instagram.com/" },
          { rede: "whatsapp" as const, link: "https://wa.me/" },
          { rede: "youtube" as const, link: "https://www.youtube.com/" },
          { rede: "facebook" as const, link: "https://www.facebook.com/" },
        ];
  const rodape =
    t.textos.rodape ||
    "Texto de exemplo: apresente aqui a plataforma e a promotora. Troque pelo texto oficial em Aparência.";
  const template = await salvarRascunho({ ...t, apoios, redes, textos: { ...t.textos, rodape } });
  return { template, ids };
}

export async function apoio(id: string) {
  if (!/^[a-z0-9-]{8,40}$/.test(id)) return null;
  const [f] = await db.select().from(plataformaArquivos).where(eq(plataformaArquivos.chave, `apoio:${id}`));
  return f ?? null;
}

export async function logo() {
  const [f] = await db.select().from(plataformaArquivos).where(eq(plataformaArquivos.chave, "logo"));
  return f ?? null;
}
