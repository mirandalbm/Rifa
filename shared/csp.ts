/**
 * Política de conteúdo (CSP), primeiro em **modo relatório**: o navegador não
 * bloqueia nada, só avisa (`/api/csp-relatorio`) o que carregaria de fora da
 * lista. Quando os relatórios de produção ficarem só com o que já está aqui,
 * a mesma política passa a valer de verdade (`Content-Security-Policy`).
 *
 * A lista é o que o sistema já usa: os pixels de marketing (Meta, Google,
 * TikTok — `client/src/lib/marketing.ts`), as fontes do Google, o vídeo do
 * Stream e os players da transmissão (`videoDaTransmissao()`). Origem nova no
 * código entra aqui no mesmo PR — `tests/csp.test.ts` confere as conhecidas.
 * Puro: o servidor monta o cabeçalho e o teste lê.
 */
import { createHash } from "node:crypto";

export const ROTA_DO_RELATORIO_CSP = "/api/csp-relatorio";

const PIXELS_SCRIPT = ["https://connect.facebook.net", "https://www.googletagmanager.com", "https://analytics.tiktok.com"];
const PIXELS_CONEXAO = [
  "https://www.facebook.com",
  "https://connect.facebook.net",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://www.googletagmanager.com",
  "https://www.google.com",
  "https://googleads.g.doubleclick.net",
  "https://analytics.tiktok.com",
];
const STREAM = "https://*.cloudflarestream.com";
const PLAYERS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://player.twitch.tv", "https://www.facebook.com"];

/** O hash de cada `<script>` em linha do `index.html` (o do tema, que roda antes do primeiro desenho). */
export function hashesDosScriptsEmLinha(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    out.push(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  return out;
}

/** A origem (`https://host`) de um endereço público de mídia, ou nada se não for `https`. */
function origemHttps(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function montarCsp(opcoes: { hashesDeScript?: string[]; midiaPublica?: string } = {}): string {
  const midia = origemHttps(opcoes.midiaPublica);
  const diretivas: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", ...(opcoes.hashesDeScript ?? []), ...PIXELS_SCRIPT]],
    // O React escreve `style=` em linha (largura de barra, posição da tela flutuante).
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],
    // Imagem de pixel (1×1 dos anúncios) e a foto do link do organizador: `https:` inteiro.
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "blob:", STREAM, ...(midia ? [midia] : [])]],
    ["connect-src", ["'self'", STREAM, ...PIXELS_CONEXAO, ...(midia ? [midia] : [])]],
    ["frame-src", ["'self'", ...PLAYERS]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
    ["report-uri", [ROTA_DO_RELATORIO_CSP]],
  ];
  return diretivas.map(([d, v]) => `${d} ${[...new Set(v)].join(" ")}`).join("; ");
}

/**
 * O que importa de um relatório do navegador: a diretiva e a origem do que
 * foi barrado — nunca a URL inteira (pode levar código de pedido na consulta)
 * nem a página de quem olhava.
 */
export function resumoDoRelatorioCsp(corpo: unknown): { diretiva: string; origem: string } | null {
  const r = (corpo && typeof corpo === "object" && "csp-report" in corpo ? (corpo as Record<string, unknown>)["csp-report"] : corpo) as
    | Record<string, unknown>
    | undefined;
  if (!r || typeof r !== "object") return null;
  // Só letras e hífen: o valor vem de quem quiser postar, e uma quebra de linha
  // aqui escreveria uma linha falsa no log.
  const diretiva = String(r["effective-directive"] ?? r["violated-directive"] ?? "")
    .split(/\s/)[0]
    .replace(/[^a-z-]/gi, "")
    .slice(0, 40);
  const bloqueado = String(r["blocked-uri"] ?? "").slice(0, 300);
  if (!diretiva) return null;
  let origem = bloqueado;
  try {
    origem = new URL(bloqueado).origin;
  } catch {
    origem = bloqueado.replace(/[^a-z-]/gi, "").slice(0, 20) || "desconhecida"; // inline, eval, data…
  }
  return { diretiva, origem };
}
