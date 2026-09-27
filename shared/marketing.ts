/**
 * Marketing e tráfego pago (etapa 16) — regras puras, lidas pelo servidor
 * (que valida, guarda e envia a compra) e pela tela (que carrega os pixels
 * e mostra o aviso de cookies).
 *
 * Três ideias seguram tudo:
 * - **Só dados.** O organizador informa o *número* do pixel, nunca um
 *   script: quem monta o código que roda no navegador é o sistema, com IDs
 *   conferidos por formato. Um campo de texto livre viraria script de
 *   terceiro na tela de todo apostador.
 * - **Consentimento antes do pixel** (LGPD). Sem o "aceito" do aviso de
 *   cookies, nenhum script de rastreamento carrega e a compra não sai pelo
 *   servidor. A escolha fica no aparelho.
 * - **A compra conta pelo servidor**, na confirmação do pagamento, com o
 *   mesmo `event_id` do navegador — as plataformas juntam os dois e não
 *   contam em dobro. O navegador sozinho perde a compra de quem fecha a aba
 *   antes do Pix cair.
 */

export const PROVEDORES = {
  meta: "Meta (Facebook e Instagram)",
  ga4: "Google Analytics 4",
  googleAds: "Google Ads",
  tiktok: "TikTok",
} as const;
export type Provedor = keyof typeof PROVEDORES;

/** Os números de rastreamento. Públicos por natureza: aparecem no navegador. */
export interface Pixels {
  meta?: string;
  ga4?: string;
  googleAds?: string;
  /** Rótulo da conversão de compra no Google Ads (o "AW-…/rótulo"). */
  googleAdsRotulo?: string;
  tiktok?: string;
}

const FORMATOS: Record<keyof Pixels, { re: RegExp; nome: string; exemplo: string }> = {
  meta: { re: /^\d{10,20}$/, nome: "Pixel da Meta", exemplo: "1234567890123456" },
  ga4: { re: /^G-[A-Z0-9]{4,16}$/, nome: "ID do Google Analytics 4", exemplo: "G-ABC123XYZ9" },
  googleAds: { re: /^AW-\d{6,14}$/, nome: "ID do Google Ads", exemplo: "AW-123456789" },
  googleAdsRotulo: { re: /^[A-Za-z0-9_-]{4,40}$/, nome: "Rótulo da conversão do Google Ads", exemplo: "AbC-D_efGhIjK" },
  tiktok: { re: /^[A-Z0-9]{15,25}$/, nome: "Pixel do TikTok", exemplo: "C1A2B3C4D5E6F7G8H9I0" },
};
export const CAMPOS_DE_PIXEL = Object.keys(FORMATOS) as (keyof Pixels)[];
export const exemploDoPixel = (c: keyof Pixels) => FORMATOS[c].exemplo;
export const nomeDoPixel = (c: keyof Pixels) => FORMATOS[c].nome;

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

/**
 * Só as chaves conhecidas, cada uma no formato do provedor. Vazio apaga.
 * Isto vem do corpo da requisição e vai parar dentro de um script na tela
 * de todo apostador: qualquer caractere fora do formato é recusado.
 */
export function validarPixels(bruto: unknown): Pixels {
  if (bruto === undefined || bruto === null) return {};
  if (typeof bruto !== "object" || Array.isArray(bruto)) throw erro("Pixels inválidos.");
  const b = bruto as Record<string, unknown>;
  const saida: Pixels = {};
  for (const c of CAMPOS_DE_PIXEL) {
    const v = typeof b[c] === "string" ? (b[c] as string).trim() : b[c] == null ? "" : String(b[c]);
    if (!v) continue;
    const t = c === "ga4" || c === "tiktok" ? v.toUpperCase() : c === "googleAds" ? v.toUpperCase() : v;
    if (!FORMATOS[c].re.test(t)) throw erro(`${FORMATOS[c].nome} fora do formato (ex.: ${FORMATOS[c].exemplo}).`);
    saida[c] = t;
  }
  if (saida.googleAdsRotulo && !saida.googleAds) throw erro("Informe o ID do Google Ads junto com o rótulo da conversão.");
  return saida;
}

export const temPixel = (p: Pixels | null | undefined) => Boolean(p && (p.meta || p.ga4 || p.googleAds || p.tiktok));

/* ------------------------------------------------------------------ *
 * Chaves de API (compra pelo servidor): segredo, nunca volta para a tela
 * ------------------------------------------------------------------ */

export interface Credenciais {
  /** Token da API de Conversões da Meta. */
  metaToken?: string;
  /** "api_secret" do Measurement Protocol do GA4. */
  ga4Segredo?: string;
  /** Token da Events API do TikTok. */
  tiktokToken?: string;
}
export const CAMPOS_DE_CREDENCIAL = ["metaToken", "ga4Segredo", "tiktokToken"] as const;
export const NOME_DA_CREDENCIAL: Record<(typeof CAMPOS_DE_CREDENCIAL)[number], string> = {
  metaToken: "Token da API de Conversões (Meta)",
  ga4Segredo: "Segredo do Measurement Protocol (GA4)",
  tiktokToken: "Token da Events API (TikTok)",
};

/**
 * Mescla o que veio com o que já estava: campo ausente mantém, string vazia
 * apaga. A tela nunca recebe o valor guardado — só se existe.
 */
export function mesclarCredenciais(atuais: Credenciais, bruto: unknown): Credenciais {
  if (bruto === undefined || bruto === null) return atuais;
  if (typeof bruto !== "object" || Array.isArray(bruto)) throw erro("Chaves inválidas.");
  const b = bruto as Record<string, unknown>;
  const saida: Credenciais = { ...atuais };
  for (const c of CAMPOS_DE_CREDENCIAL) {
    if (!(c in b)) continue;
    const v = String(b[c] ?? "").trim();
    if (!v) {
      delete saida[c];
      continue;
    }
    if (!/^[A-Za-z0-9_\-.|=]{8,400}$/.test(v)) throw erro(`${NOME_DA_CREDENCIAL[c]} fora do formato.`);
    saida[c] = v;
  }
  return saida;
}

export const quaisCredenciais = (c: Credenciais) => ({
  metaToken: Boolean(c.metaToken),
  ga4Segredo: Boolean(c.ga4Segredo),
  tiktokToken: Boolean(c.tiktokToken),
});

/* ------------------------------------------------------------------ *
 * UTM: de onde veio o clique pago
 * ------------------------------------------------------------------ */

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
}
const CAMPOS_UTM: [keyof Utm, string][] = [
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaign", "utm_campaign"],
  ["content", "utm_content"],
  ["term", "utm_term"],
  ["fbclid", "fbclid"],
  ["gclid", "gclid"],
  ["ttclid", "ttclid"],
];

const limpar = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[^\p{L}\p{N} _.+\-%|:/]/gu, "")
        .trim()
        .slice(0, max)
    : "";

/** Da barra de endereço. Nada, se não veio de anúncio. */
export function utmDaUrl(busca: string): Utm | null {
  const p = new URLSearchParams(busca);
  const u: Utm = {};
  for (const [k, q] of CAMPOS_UTM) {
    const v = limpar(p.get(q), k.endsWith("clid") ? 200 : 100);
    if (v) u[k] = v;
  }
  return Object.keys(u).length ? u : null;
}

/** Do corpo da requisição: só as chaves conhecidas, limpas e curtas. É estatística. */
export function validarUtm(bruto: unknown): Utm | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const u: Utm = {};
  for (const [k] of CAMPOS_UTM) {
    const v = limpar(b[k], k.endsWith("clid") ? 200 : 100);
    if (v) u[k] = v;
  }
  return Object.keys(u).length ? u : null;
}

/** A linha do relatório: fonte / meio / campanha, com "(sem …)" no que faltar. */
export function rotuloDaCampanha(u: Utm | null | undefined) {
  return {
    fonte: u?.source || (u?.gclid ? "google" : u?.fbclid ? "facebook" : u?.ttclid ? "tiktok" : "(sem fonte)"),
    meio: u?.medium || (u?.gclid || u?.fbclid || u?.ttclid ? "cpc" : "(sem meio)"),
    campanha: u?.campaign || "(sem campanha)",
  };
}

/* ------------------------------------------------------------------ *
 * Consentimento (aviso de cookies)
 * ------------------------------------------------------------------ */

/** Mudou o texto do aviso de um jeito que peça novo "aceito"? Suba a versão. */
export const VERSAO_DO_AVISO = 1;
export type Escolha = "aceito" | "recusado";

export function lerEscolha(bruta: string | null): Escolha | null {
  if (!bruta) return null;
  try {
    const v = JSON.parse(bruta) as { v?: number; e?: string };
    if (v.v !== VERSAO_DO_AVISO) return null;
    return v.e === "aceito" || v.e === "recusado" ? v.e : null;
  } catch {
    return null;
  }
}
export const gravarEscolha = (e: Escolha) => JSON.stringify({ v: VERSAO_DO_AVISO, e });

/* ------------------------------------------------------------------ *
 * A compra, montada para cada API
 * ------------------------------------------------------------------ */

/** O mesmo no navegador e no servidor: é assim que a plataforma de anúncio junta os dois. */
export const idDoEventoDeCompra = (codigoDoPedido: number) => `compra-${codigoDoPedido}`;

export interface Compra {
  codigo: number;
  valorCents: number;
  quantidade: number;
  campanhaId: string;
  campanhaTitulo: string;
  pagoEm: Date;
  /** SHA-256 do telefone normalizado (55 + DDD + número) — só com consentimento. */
  telefoneHash?: string;
  /** Identificador de clique do anúncio da Meta, montado como "fbc". */
  fbclid?: string;
  ttclid?: string;
  /** Aparelho (hash) como client_id do GA4. */
  clienteId: string;
  urlDaRifa: string;
}

/** Telefone para o hash das APIs: só dígitos, com o 55 do Brasil. */
export function telefoneParaHash(telefone: string): string | null {
  const d = telefone.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

const reais = (c: number) => Math.round(c) / 100;

export function corpoMeta(c: Compra) {
  const segundos = Math.floor(c.pagoEm.getTime() / 1000);
  return {
    data: [
      {
        event_name: "Purchase",
        event_time: segundos,
        event_id: idDoEventoDeCompra(c.codigo),
        action_source: "website",
        event_source_url: c.urlDaRifa,
        user_data: {
          ...(c.telefoneHash ? { ph: [c.telefoneHash] } : {}),
          ...(c.fbclid ? { fbc: `fb.1.${segundos * 1000}.${c.fbclid}` } : {}),
        },
        custom_data: {
          currency: "BRL",
          value: reais(c.valorCents),
          content_ids: [c.campanhaId],
          content_type: "product",
          num_items: c.quantidade,
        },
      },
    ],
  };
}

export function corpoGa4(c: Compra) {
  return {
    client_id: c.clienteId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: idDoEventoDeCompra(c.codigo),
          currency: "BRL",
          value: reais(c.valorCents),
          items: [{ item_id: c.campanhaId, item_name: c.campanhaTitulo, quantity: c.quantidade, price: reais(c.valorCents) / Math.max(1, c.quantidade) }],
        },
      },
    ],
  };
}

export function corpoTiktok(pixel: string, c: Compra) {
  return {
    event_source: "web",
    event_source_id: pixel,
    data: [
      {
        event: "CompletePayment",
        event_time: Math.floor(c.pagoEm.getTime() / 1000),
        event_id: idDoEventoDeCompra(c.codigo),
        user: {
          ...(c.telefoneHash ? { phone: c.telefoneHash } : {}),
          ...(c.ttclid ? { ttclid: c.ttclid } : {}),
        },
        page: { url: c.urlDaRifa },
        properties: {
          currency: "BRL",
          value: reais(c.valorCents),
          contents: [{ content_id: c.campanhaId, content_name: c.campanhaTitulo, quantity: c.quantidade }],
        },
      },
    ],
  };
}

/** Quantas tentativas o relógio faz antes de desistir de um envio. */
export const TENTATIVAS_MAX = 5;
