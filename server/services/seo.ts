/**
 * SEO por endereço (PR 6 do docs/PLANO-SUBDOMINIO.md, cap. 4): o que o servidor
 * escreve no `<head>` do `index.html`, o `robots.txt` e o `sitemap.xml` de cada
 * host. Os dados são os que a vitrine já mostra (rifa no ar, não travada, não
 * demonstração, promotora nem arquivada nem banida) — nunca rascunho, nunca
 * preço (muda; vale a página).
 *
 * O endereço canônico sai do banco (a organização dona), nunca do `Host`: o
 * `Host` só diz em que casa a pessoa chegou.
 */
import type { Request, Response } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { campaigns, organizacaoFotos, organizations } from "@shared/schema";
import { db } from "../db";
import { hostEhConhecido } from "../../shared/subdominio";
import {
  TITULO_PADRAO,
  caminhoNaoIndexa,
  indexacaoLigada,
  lerCaminho,
  resumir,
  sitemapXml,
  type ClasseDoHost,
  type MetaDaPagina,
} from "../../shared/seo";
import { enderecoDaOrganizacao } from "./urls";
import { enderecoPublicoDaOrganizacao, type EnderecoDaRequisicao } from "./enderecoDaOrganizacao";
import { subdominioBaseDoAmbiente } from "./subdominio";

const ehProducao = () => process.env.NODE_ENV === "production";

/** A casa principal (`PUBLIC_BASE_URL`, sem barra), ou `null` sem ela. */
function origemPrincipal(): string | null {
  const publica = process.env.PUBLIC_BASE_URL?.trim();
  if (!publica) return null;
  try {
    const u = new URL(publica);
    return u.origin;
  } catch {
    return null;
  }
}

export { comMeta } from "../../shared/seo";

export function classeDoHost(req: Request, res: Response): ClasseDoHost {
  const e = res.locals.endereco as EnderecoDaRequisicao | undefined;
  if (e?.tipo === "organizacao") return "organizacao";
  const conhecido = hostEhConhecido(req.headers.host, process.env.PUBLIC_BASE_URL?.trim(), subdominioBaseDoAmbiente(), ehProducao());
  // Sem `PUBLIC_BASE_URL` (desenvolvimento, prova) não há como saber: é a casa.
  return conhecido || !process.env.PUBLIC_BASE_URL?.trim() ? "principal" : "outro";
}

const GENERICA: MetaDaPagina = {
  titulo: TITULO_PADRAO,
  descricao: "Rifas online com pagamento por Pix e sorteio auditável.",
};

async function organizacaoPublica(slug: string) {
  const [o] = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name, bio: organizations.bio, fotoEm: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt), isNull(organizations.banidaEm)))
    .limit(1);
  return o ?? null;
}

async function rifaPublica(slug: string) {
  const [r] = await db
    .select({
      slug: campaigns.slug,
      titulo: campaigns.title,
      premio: campaigns.prizeTitle,
      organizationId: campaigns.organizationId,
      orgSlug: organizations.slug,
      orgNome: organizations.name,
      fotoEm: organizacaoFotos.updatedAt,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(
      and(
        eq(campaigns.slug, slug),
        eq(campaigns.status, "published"),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    )
    .limit(1);
  return r ?? null;
}

function imagemDaOrganizacao(origem: string | null, slug: string, em: Date | null | undefined): string | null {
  return origem && em ? `${origem}/api/public/o/${slug}/foto?v=${em.getTime()}` : null;
}

/**
 * O meta desta requisição. Nunca lança: quem chama serve a página de qualquer
 * jeito, e o erro do banco vira a meta genérica.
 */
export async function metaDaRequisicao(req: Request, res: Response): Promise<MetaDaPagina> {
  const classe = classeDoHost(req, res);
  const e = res.locals.endereco as EnderecoDaRequisicao | undefined;
  const noEndereco = e?.tipo === "organizacao";
  const caminho = req.originalUrl.split("?")[0] ?? "/";
  const principal = origemPrincipal();
  const base: MetaDaPagina = { ...GENERICA, noEnderecoDaOrganizacao: noEndereco };
  if (classe === "outro") return { ...base, naoIndexar: true };
  if (caminhoNaoIndexa(caminho)) return { ...base, naoIndexar: true };
  try {
    const lido = lerCaminho(caminho);
    if (noEndereco && e.tipo === "organizacao") {
      const origem = (await enderecoDaOrganizacao(e.id)) ?? null;
      if (lido.tipo === "inicio") {
        const o = await organizacaoPublica(e.slug);
        if (!o) return { ...base, naoIndexar: true };
        return {
          ...base,
          titulo: o.nome,
          descricao: resumir(o.bio, 200) || `Rifas de ${o.nome}, com pagamento por Pix e sorteio auditável.`,
          canonico: origem ? `${origem}/` : null,
          imagem: imagemDaOrganizacao(origem, o.slug, o.fotoEm),
        };
      }
      if (lido.tipo === "rifa") {
        const r = await rifaPublica(lido.slug);
        if (!r || r.organizationId !== e.id) return { ...base, naoIndexar: true };
        return {
          ...base,
          titulo: r.titulo,
          descricao: resumir(`Concorra a ${r.premio}. Rifa de ${r.orgNome}, com pagamento por Pix e sorteio auditável.`, 200),
          canonico: origem ? `${origem}/r/${r.slug}` : null,
          imagem: imagemDaOrganizacao(origem, r.orgSlug, r.fotoEm),
        };
      }
      return { ...base, naoIndexar: lido.tipo === "outra" };
    }
    // Domínio principal: a página da organização que tem endereço aponta para ele.
    if (lido.tipo === "perfil") {
      const o = await organizacaoPublica(lido.slug);
      if (!o) return { ...base, naoIndexar: true };
      const rotulo = await enderecoPublicoDaOrganizacao(o.id);
      const origem = rotulo ? await enderecoDaOrganizacao(o.id) : null;
      return {
        ...base,
        titulo: o.nome,
        descricao: resumir(o.bio, 200) || `Rifas de ${o.nome}, com pagamento por Pix e sorteio auditável.`,
        canonico: origem ? `${origem}/` : principal ? `${principal}/o/${o.slug}` : null,
        imagem: imagemDaOrganizacao(principal, o.slug, o.fotoEm),
      };
    }
    if (lido.tipo === "rifa") {
      const r = await rifaPublica(lido.slug);
      if (!r) return { ...base, naoIndexar: true };
      const rotulo = await enderecoPublicoDaOrganizacao(r.organizationId);
      const origem = rotulo ? await enderecoDaOrganizacao(r.organizationId) : null;
      return {
        ...base,
        titulo: r.titulo,
        descricao: resumir(`Concorra a ${r.premio}. Rifa de ${r.orgNome}, com pagamento por Pix e sorteio auditável.`, 200),
        canonico: origem ? `${origem}/r/${r.slug}` : principal ? `${principal}/r/${r.slug}` : null,
        imagem: imagemDaOrganizacao(principal, r.orgSlug, r.fotoEm),
      };
    }
    return { ...base, canonico: principal && lido.tipo === "inicio" ? `${principal}/` : null };
  } catch (err) {
    console.error("[seo] meta da página:", err);
    return base;
  }
}

const TETO_DO_SITEMAP = 5000;

/** As rifas que a vitrine mostraria, com a organização dona. */
async function rifasDaVitrine(organizationId?: string) {
  return db
    .select({
      slug: campaigns.slug,
      organizationId: campaigns.organizationId,
      orgSlug: organizations.slug,
      em: sql<Date | null>`coalesce(${campaigns.publishedAt}, ${campaigns.createdAt})`,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.status, "published"),
        isNull(campaigns.travadaEm),
        eq(campaigns.demonstracao, false),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
        organizationId ? eq(campaigns.organizationId, organizationId) : undefined,
      ),
    )
    .orderBy(asc(campaigns.slug))
    .limit(TETO_DO_SITEMAP);
}

/**
 * O `sitemap.xml` do host, ou `null` quando a indexação não está ligada
 * (`SEO_INDEXAR=1`) ou o host não é da casa.
 *
 * - Endereço da organização: o perfil e as rifas dela, no próprio endereço.
 * - Principal: a vitrine, as páginas legais e a ajuda, mais o perfil e as rifas
 *   das organizações **sem** endereço ligado (as que têm estão no sitemap do
 *   endereço delas — a mesma página nos dois seria duplicata).
 */
export async function sitemapDaRequisicao(req: Request, res: Response): Promise<string | null> {
  if (!indexacaoLigada()) return null;
  const classe = classeDoHost(req, res);
  if (classe === "outro") return null;
  const e = res.locals.endereco as EnderecoDaRequisicao | undefined;
  if (e?.tipo === "organizacao") {
    const origem = await enderecoDaOrganizacao(e.id);
    if (!origem) return null;
    const rifas = await rifasDaVitrine(e.id);
    return sitemapXml([{ loc: `${origem}/` }, ...rifas.map((r) => ({ loc: `${origem}/r/${r.slug}`, lastmod: r.em ? new Date(r.em) : null }))]);
  }
  const principal = origemPrincipal();
  if (!principal) return null;
  const entradas = [{ loc: `${principal}/` }, { loc: `${principal}/ajuda` }, { loc: `${principal}/termos` }, { loc: `${principal}/privacidade` }] as {
    loc: string;
    lastmod?: Date | null;
  }[];
  const vistas = new Set<string>();
  for (const r of await rifasDaVitrine()) {
    if (await enderecoPublicoDaOrganizacao(r.organizationId)) continue;
    if (!vistas.has(r.orgSlug)) {
      vistas.add(r.orgSlug);
      entradas.push({ loc: `${principal}/o/${r.orgSlug}` });
    }
    entradas.push({ loc: `${principal}/r/${r.slug}`, lastmod: r.em ? new Date(r.em) : null });
  }
  return sitemapXml(entradas);
}

/** A linha `Sitemap:` do `robots.txt`: o endereço do próprio host, só com a indexação ligada. */
export async function enderecoDoSitemap(req: Request, res: Response): Promise<string | null> {
  if (!indexacaoLigada()) return null;
  const e = res.locals.endereco as EnderecoDaRequisicao | undefined;
  if (e?.tipo === "organizacao") {
    const origem = await enderecoDaOrganizacao(e.id);
    return origem ? `${origem}/sitemap.xml` : null;
  }
  const principal = origemPrincipal();
  return principal ? `${principal}/sitemap.xml` : null;
}
