/**
 * Buscar: a grade das publicações mais novas e a busca por texto. Regras em
 * `shared/buscar.ts`.
 *
 * - **Só o que a vitrine mostraria**: rifa no ar, não travada, não
 *   demonstração, de organização que não está arquivada nem banida.
 * - **Sem `OFFSET`**: a grade anda por chave (`publicada em` + id), e o
 *   servidor pede uma linha a mais para saber se há próxima — sem `COUNT(*)`.
 * - **O texto é dado, nunca SQL**: vai como parâmetro e `%`/`_` viram letras.
 *   Sem acento e sem diferença de maiúscula dos dois lados.
 * - **Pessoa não é vitrine**: o apostador só aparece com o tipo ligado pela
 *   plataforma, pelo `@apelido` **exato**, e só com foto e apelido.
 * - **Limite por pessoa/aparelho** (`hit`): campo que digita e grade que
 *   pagina chamam muito, e varrer a base por tentativa é o que se barra.
 */
import type { Request } from "express";
import { and, desc, eq, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, organizacaoFotos, organizations } from "@shared/schema";
import {
  BUSCAS_POR_MINUTO,
  BUSCA_ORGANIZACOES_MAX,
  BUSCA_PAGINA,
  escaparCuringa,
  fazerCursorDeCurtidas,
  interpretarEstado,
  interpretarOrdem,
  interpretarTermo,
  lerCursorDeCurtidas,
  type ConfigBusca,
  type OrdemDaBusca,
  type TermoDaBusca,
} from "@shared/buscar";
import { cortarPagina, lerCursor } from "@shared/paginacao";
import type { UF } from "@shared/endereco";
import { hit, identify } from "./antifraude";
import { getPlataforma } from "./settings";
import { midiasDas, urlDaFoto } from "./perfil";
import { urlDaFotoDoApostador } from "./perfilApostador";

export class BuscaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BuscaError";
  }
}

/** O texto da coluna sem acento e minúsculo — o mesmo tratamento do texto digitado. */
const semAcentoSql = (coluna: SQL | unknown) =>
  sql`translate(lower(${coluna}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;

const contem = (coluna: unknown, texto: string) => sql`${semAcentoSql(coluna)} like ${`%${escaparCuringa(texto)}%`} escape '\\'`;

const orgVisivel = and(isNull(organizations.archivedAt), isNull(organizations.banidaEm))!;

async function rifasDaGrade(termo: TermoDaBusca | null, depois: unknown, ordem: OrdemDaBusca, estado: UF | null) {
  const filtros: SQL[] = [
    eq(campaigns.status, "published"),
    isNull(campaigns.travadaEm),
    eq(campaigns.demonstracao, false),
    isNotNull(campaigns.publishedAt),
    orgVisivel,
  ];
  if (termo) {
    filtros.push(or(contem(campaigns.title, termo.texto), contem(campaigns.prizeTitle, termo.texto), contem(organizations.name, termo.texto))!);
  }
  if (estado) filtros.push(eq(organizations.uf, estado));
  const porCurtidas = ordem === "curtidas";
  if (porCurtidas) {
    const c = lerCursorDeCurtidas(depois);
    if (c) {
      filtros.push(or(lt(campaigns.curtidasCount, c.curtidas), and(eq(campaigns.curtidasCount, c.curtidas), lt(campaigns.id, c.id)))!);
    }
  } else {
    const cursor = lerCursor(depois);
    if (cursor) {
      filtros.push(
        or(
          lt(campaigns.publishedAt, cursor.criadoEm),
          and(eq(campaigns.publishedAt, cursor.criadoEm), lt(campaigns.id, cursor.id)),
        )!,
      );
    }
  }
  const linhas = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      premio: campaigns.prizeTitle,
      publicadaEm: campaigns.publishedAt,
      curtidas: campaigns.curtidasCount,
      orgNome: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(...filtros))
    .orderBy(...(porCurtidas ? [desc(campaigns.curtidasCount), desc(campaigns.id)] : [desc(campaigns.publishedAt), desc(campaigns.id)]))
    .limit(BUSCA_PAGINA + 1);
  const temMais = linhas.length > BUSCA_PAGINA;
  const itens = linhas.slice(0, BUSCA_PAGINA);
  const ultima = itens[itens.length - 1];
  // O cursor é o da última linha MOSTRADA; sem COUNT(*) — uma linha a mais diz se há próxima.
  const proximo = temMais && ultima ? (porCurtidas ? fazerCursorDeCurtidas(ultima.curtidas, ultima.id) : `${ultima.publicadaEm!.toISOString()}|${ultima.id}`) : null;
  // A capa é a primeira imagem da publicação (o banner, senão a primeira foto) — nunca o vídeo.
  const midias = await midiasDas(itens.map((i) => i.id));
  return {
    proximo,
    itens: itens.map((i) => {
      const capa = (midias.get(i.id) ?? []).find((m) => m.role !== "video") ?? null;
      return {
        slug: i.slug,
        premio: i.premio,
        organizacao: i.orgNome,
        caminho: `/o/${i.orgSlug}/r/${i.slug}`,
        capa: capa ? { url: capa.url, srcSet: capa.srcSetWebp ?? null, lqip: capa.lqip ?? null } : null,
      };
    }),
  };
}

async function organizacoesDoTexto(termo: TermoDaBusca) {
  const linhas = await db
    .select({ nome: organizations.name, slug: organizations.slug, cidade: organizations.cidade, uf: organizations.uf, verificadaEm: organizations.verificadaEm, fotoEm: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(orgVisivel, or(contem(organizations.name, termo.texto), contem(organizations.slug, termo.texto))!))
    .orderBy(sql`(case when ${semAcentoSql(organizations.name)} like ${`${escaparCuringa(termo.texto)}%`} escape '\\' then 0 else 1 end)`, organizations.name)
    .limit(BUSCA_ORGANIZACOES_MAX);
  return linhas.map((o) => ({
    nome: o.nome,
    caminho: `/o/${o.slug}`,
    local: o.cidade && o.uf ? `${o.cidade}/${o.uf}` : (o.uf ?? null),
    foto: urlDaFoto(o.slug, o.fotoEm),
    verificada: Boolean(o.verificadaEm),
  }));
}

/** Pelo apelido exato: nenhuma lista, nunca aproximado. Só apelido e foto. */
async function apostadorPeloApelido(termo: TermoDaBusca) {
  const [b] = await db
    .select({ apelido: buyers.apelido, fotoEm: buyers.fotoEm, verificadoEm: buyers.verificadoEm })
    .from(buyers)
    .where(sql`lower(${buyers.apelido}) = ${termo.texto}`);
  if (!b?.apelido) return [];
  return [{ apelido: b.apelido, caminho: `/u/${b.apelido}`, foto: urlDaFotoDoApostador(b.apelido, b.fotoEm), verificado: Boolean(b.verificadoEm) }];
}

export async function buscar(req: Request, q: { q?: unknown; depois?: unknown; ordem?: unknown; estado?: unknown }) {
  const config = await getPlataforma();
  if (!config.buscarLigado) return { ligado: false as const };
  const tipos: ConfigBusca = config.buscarTipos;

  const id = identify(req);
  const limite = await hit(`busca:${id.deviceHash ?? id.ipHash ?? "sem-origem"}`, 1, BUSCAS_POR_MINUTO);
  if (limite.excedeu) throw new BuscaError("Muitas buscas seguidas. Espere um minuto.", 429);

  const termo = interpretarTermo(q.q);
  const ordem = interpretarOrdem(q.ordem);
  const estado = interpretarEstado(q.estado);
  // Cursor fora do formato (de qualquer das duas ordens) é a primeira página.
  const primeiraPagina = !(ordem === "curtidas" ? lerCursorDeCurtidas(q.depois) : lerCursor(q.depois));
  const comTexto = typeof q.q === "string" && q.q.trim().length > 0;
  // Texto curto demais não busca (e não devolve a grade como se tivesse buscado).
  if (comTexto && !termo) return { ligado: true as const, tipos, curto: true, rifas: [], organizacoes: [], apostadores: [], proximo: null };

  const rifas = tipos.rifas ? await rifasDaGrade(termo, q.depois, ordem, estado) : { itens: [], proximo: null };
  const organizacoes = termo && primeiraPagina && tipos.organizacoes && !termo.apelido ? await organizacoesDoTexto(termo) : [];
  const apostadores = termo && primeiraPagina && tipos.apostadores ? await apostadorPeloApelido(termo) : [];
  return {
    ligado: true as const,
    tipos,
    ordem,
    estado,
    curto: false,
    rifas: rifas.itens,
    organizacoes,
    apostadores,
    proximo: rifas.proximo,
  };
}
