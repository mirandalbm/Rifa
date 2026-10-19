/**
 * SEO por endereço (docs/PLANO-SUBDOMINIO.md, cap. 4): o que o servidor escreve
 * no `<head>` do `index.html`, o `robots.txt` e o `sitemap.xml` de cada host.
 * Só funções puras: quem busca os dados e decide o host é
 * `server/services/seo.ts`.
 *
 * Nada aqui confia em texto de fora: todo valor entra escapado no atributo, e
 * endereço só vale `http(s)` sem usuário.
 */

/** Marcador do `index.html` que o servidor troca por requisição. */
export const MARCADOR_DE_META = "<!--rifa-meta-->";

/**
 * Páginas de conta, de dinheiro e dos painéis: nunca entram no buscador, em
 * nenhum host (`noindex, nofollow` no cabeçalho e no `<meta>`, `Disallow` no
 * `robots.txt`). Prefixo de caminho, comparado no segmento inteiro.
 */
export const CAMINHOS_QUE_NAO_INDEXAM = [
  "/admin",
  "/afiliado",
  "/cambista",
  "/entrar",
  "/criar-conta",
  "/conta",
  "/minhas-compras",
  "/minhas-cotas",
  "/perfil",
  "/carrinho",
  "/pedido",
  "/bilhete",
  "/recibo",
  "/mensagens",
  "/notificacoes",
  "/publicar",
  "/seja-afiliado",
] as const;

export function caminhoNaoIndexa(caminho: string): boolean {
  const c = caminho.split("?")[0]!.split("#")[0]!.toLowerCase();
  return CAMINHOS_QUE_NAO_INDEXAM.some((p) => c === p || c.startsWith(`${p}/`));
}

/** Escapa para valor de atributo entre aspas duplas. */
export function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Texto de uma linha, no tamanho que o buscador e a prévia aguentam. */
export function resumir(texto: string | null | undefined, max: number): string {
  const limpo = (texto ?? "").replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Só `http(s)` sem usuário e senha; devolve a forma normalizada ou `null`. */
export function urlSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    const u = new URL(valor);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type MetaDaPagina = {
  titulo: string;
  descricao: string;
  /** Endereço canônico absoluto. Sem ele, não há `canonical` nem `og:url`. */
  canonico?: string | null;
  /** Imagem absoluta da prévia. */
  imagem?: string | null;
  /** `noindex, nofollow` (página de conta, host desconhecido). */
  naoIndexar?: boolean;
  /** Está no endereço de uma organização: a SPA lê isto antes do primeiro desenho. */
  noEnderecoDaOrganizacao?: boolean;
};

/**
 * O trecho do `<head>` que substitui o marcador. O `<title>` e a `description`
 * do `index.html` são os da plataforma; a SPA troca o título depois, e este
 * bloco existe para quem não roda JavaScript (o robô do WhatsApp, do Google).
 */
export function blocoDeMeta(m: MetaDaPagina): string {
  const linhas: string[] = [];
  const a = escaparAtributo;
  const canonico = urlSegura(m.canonico);
  const imagem = urlSegura(m.imagem);
  if (canonico) linhas.push(`<link rel="canonical" href="${a(canonico)}" />`);
  linhas.push(`<meta property="og:type" content="website" />`);
  linhas.push(`<meta property="og:locale" content="pt_BR" />`);
  linhas.push(`<meta property="og:title" content="${a(resumir(m.titulo, 90))}" />`);
  linhas.push(`<meta property="og:description" content="${a(resumir(m.descricao, 200))}" />`);
  if (canonico) linhas.push(`<meta property="og:url" content="${a(canonico)}" />`);
  if (imagem) {
    linhas.push(`<meta property="og:image" content="${a(imagem)}" />`);
    linhas.push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    linhas.push(`<meta name="twitter:card" content="summary" />`);
  }
  if (m.naoIndexar) linhas.push(`<meta name="robots" content="noindex, nofollow" />`);
  if (m.noEnderecoDaOrganizacao) linhas.push(`<meta name="rifa:endereco" content="organizacao" />`);
  return linhas.join("\n    ");
}

export type ClasseDoHost = "principal" | "organizacao" | "outro";

/**
 * `robots.txt` do host. O host que não é da casa não se indexa. Nos outros, só
 * as áreas públicas; o sitemap só aparece quando a plataforma ligou a
 * indexação (`SEO_INDEXAR=1`).
 */
export function robotsTxt(classe: ClasseDoHost, sitemap: string | null): string {
  if (classe === "outro") return "User-agent: *\nDisallow: /\n";
  // `/api` e `/uploads` ficam de fora: é por eles que saem as imagens da prévia.
  const linhas = ["User-agent: *", ...CAMINHOS_QUE_NAO_INDEXAM.map((p) => `Disallow: ${p}`)];
  linhas.push("Allow: /");
  const url = urlSegura(sitemap);
  if (url) linhas.push("", `Sitemap: ${url}`);
  return `${linhas.join("\n")}\n`;
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Teto do protocolo: 50.000 endereços por arquivo. */
export const SITEMAP_MAX = 50_000;

export function sitemapXml(entradas: { loc: string; lastmod?: Date | null }[]): string {
  const itens: string[] = [];
  for (const e of entradas) {
    const loc = urlSegura(e.loc);
    if (!loc) continue;
    if (itens.length >= SITEMAP_MAX) break;
    const mod = e.lastmod && !Number.isNaN(e.lastmod.getTime()) ? `<lastmod>${e.lastmod.toISOString()}</lastmod>` : "";
    itens.push(`<url><loc>${escaparXml(loc)}</loc>${mod}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${itens.join("")}</urlset>\n`;
}

/** A indexação é decisão da plataforma: ligada por variável, desligada de fábrica. */
export function indexacaoLigada(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEO_INDEXAR === "1";
}

/** A identificação da plataforma no rodapé do endereço (R31): razão social, CNPJ e e-mail. */
export type IdentificacaoDaPlataforma = { razaoSocial: string; cnpj: string; email: string | null };

/** O título do `index.html`: enquanto a página não tem o dela, nada é trocado. */
export const TITULO_PADRAO = "Loterias do Bem";

export type Caminho = { tipo: "inicio" } | { tipo: "perfil"; slug: string } | { tipo: "rifa"; slug: string; org?: string } | { tipo: "outra" };

/** O caminho que a pessoa abriu, no endereço da organização ou no principal. */
export function lerCaminho(caminho: string): Caminho {
  const c = caminho.split("?")[0]!.replace(/\/+$/, "") || "/";
  if (c === "/") return { tipo: "inicio" };
  let m = /^\/o\/([^/]+)$/.exec(c);
  if (m) return { tipo: "perfil", slug: m[1]!.toLowerCase() };
  m = /^\/o\/([^/]+)\/r\/([^/]+)$/.exec(c);
  if (m) return { tipo: "rifa", slug: m[2]!.toLowerCase(), org: m[1]!.toLowerCase() };
  m = /^\/r\/([^/]+)$/.exec(c);
  if (m) return { tipo: "rifa", slug: m[1]!.toLowerCase() };
  return { tipo: "outra" };
}

/** O HTML com o marcador trocado. Sem marcador (arquivo de outra versão), devolve como veio. */
export function comMeta(html: string, marcador: string, meta: MetaDaPagina): string {
  if (!html.includes(marcador)) return html;
  let out = html.replace(marcador, () => blocoDeMeta(meta));
  // Quem não roda JavaScript (o robô da prévia, o buscador) lê o <title> e a
  // descrição daqui: na página da organização ou da rifa, são os dela.
  if (meta.titulo !== TITULO_PADRAO) {
    out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${escaparAtributo(resumir(meta.titulo, 90))}</title>`);
    out = out.replace(/(<meta name="description" content=")[^"]*(")/, (_t, a: string, b: string) => `${a}${escaparAtributo(resumir(meta.descricao, 200))}${b}`);
  }
  return out;
}
