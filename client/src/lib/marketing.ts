import { useSyncExternalStore } from "react";
import { cookiesDeMedicao, dominiosDoCookie, gravarEscolha, lerEscolha, utmDaUrl, type Escolha, type Pixels, type Utm } from "@shared/marketing";

/**
 * Marketing no navegador (etapa 16): aviso de cookies, UTM e pixels.
 *
 * - A escolha do aviso fica no aparelho (`rifa.cookies`), como o tema e a
 *   região: perder só faz o aviso aparecer de novo.
 * - **Nenhum script de rastreamento carrega antes do "aceito".** Recusou,
 *   nada carrega — nem depois de navegar.
 * - Os IDs chegam do servidor já conferidos por formato (`validarPixels`),
 *   e mesmo assim o código daqui nunca monta HTML: só chama as funções
 *   oficiais de cada pixel com o número.
 * - Cada evento vai **só** para os pixels da página (`trackSingle`,
 *   `send_to`, `ttq.instance`): o pixel da promotora A não recebe o que
 *   acontece na rifa da B, mesmo com a navegação sem recarregar a página.
 */

const CHAVE_ESCOLHA = "rifa.cookies";
const CHAVE_UTM = "rifa.utm";

/* ------------------------------------------------------------------ *
 * Escolha do aviso de cookies
 * ------------------------------------------------------------------ */

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function escolhaAtual(): Escolha | null {
  try {
    return lerEscolha(localStorage.getItem(CHAVE_ESCOLHA));
  } catch {
    return null;
  }
}

export function escolher(e: Escolha) {
  try {
    localStorage.setItem(CHAVE_ESCOLHA, gravarEscolha(e));
  } catch {
    // armazenamento bloqueado: vale só nesta visita
  }
  memoria = e;
  if (e === "recusado") {
    apagarCookiesDeMedicao();
    // Pixel já carregado nesta página segue rodando (e regravaria o cookie):
    // só recarregar o tira da memória. Sem pixel carregado, nada a recarregar.
    if (algumPixelIniciado()) {
      window.location.reload();
      return;
    }
  }
  avisar();
}

/**
 * Recusou: apaga os cookies de medição já gravados (o aviso diz isso). Vale
 * também ao abrir o site com a recusa guardada — o que um pixel deixou antes
 * não fica.
 */
export function apagarCookiesDeMedicao() {
  try {
    for (const nome of cookiesDeMedicao(document.cookie)) {
      document.cookie = `${nome}=; Max-Age=0; path=/`;
      for (const d of dominiosDoCookie(window.location.hostname)) {
        document.cookie = `${nome}=; Max-Age=0; path=/; domain=${d}`;
      }
    }
  } catch {
    // cookie bloqueado pelo navegador: não há o que apagar
  }
}

/** Reabre o aviso (link "Cookies" no rodapé). */
export function reabrirAviso() {
  try {
    localStorage.removeItem(CHAVE_ESCOLHA);
  } catch {
    // idem
  }
  memoria = null;
  avisar();
}

let memoria: Escolha | null | undefined;
const lerMemoria = () => (memoria === undefined ? (memoria = escolhaAtual()) : memoria);

export function useEscolha(): Escolha | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerMemoria,
    () => null,
  );
}

/** O que vai no pedido: o aparelho aceitou? (Sem isto a compra não sai pelo servidor.) */
export const consentiu = () => lerMemoria() === "aceito";

/* ------------------------------------------------------------------ *
 * UTM (último clique pago da aba)
 * ------------------------------------------------------------------ */

export function guardarUtmDaUrl(busca = window.location.search) {
  const u = utmDaUrl(busca);
  if (!u) return;
  try {
    sessionStorage.setItem(CHAVE_UTM, JSON.stringify(u));
  } catch {
    // estatística: perder não estraga nada
  }
}

export function lerUtm(): Utm | undefined {
  try {
    const v = sessionStorage.getItem(CHAVE_UTM);
    return v ? (JSON.parse(v) as Utm) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * A organização da página (para os pixels dela)
 * ------------------------------------------------------------------ */

let organizacaoDaPagina: string | null = null;
const ouvintesOrg = new Set<() => void>();

/** Rifa e perfil dizem de quem é a página; ao sair, voltam a `null`. */
export function definirOrganizacaoDaPagina(slug: string | null) {
  if (organizacaoDaPagina === slug) return;
  organizacaoDaPagina = slug;
  ouvintesOrg.forEach((f) => f());
}

export function useOrganizacaoDaPagina() {
  return useSyncExternalStore(
    (f) => {
      ouvintesOrg.add(f);
      return () => ouvintesOrg.delete(f);
    },
    () => organizacaoDaPagina,
    () => null,
  );
}

/* ------------------------------------------------------------------ *
 * Pixels
 * ------------------------------------------------------------------ */

type Fn = (...args: unknown[]) => void;
interface Janela {
  fbq?: Fn & { queue?: unknown[]; callMethod?: Fn; loaded?: boolean; version?: string; push?: Fn };
  _fbq?: unknown;
  dataLayer?: unknown[];
  gtag?: Fn;
  ttq?: Fn & { load?: (id: string) => void; instance?: (id: string) => { track: Fn; page: Fn }; _i?: Record<string, unknown>; methods?: string[] };
  TiktokAnalyticsObject?: string;
}
const w = () => window as unknown as Janela;

function script(src: string) {
  if (document.querySelector(`script[data-rifa-pixel="${src}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  s.dataset.rifaPixel = src;
  document.head.appendChild(s);
}

const iniciados = { meta: new Set<string>(), google: new Set<string>(), tiktok: new Set<string>() };
const algumPixelIniciado = () => iniciados.meta.size + iniciados.google.size + iniciados.tiktok.size > 0;

function iniciarMeta(id: string) {
  const j = w();
  if (!j.fbq) {
    const fbq = function (...args: unknown[]) {
      fbq.callMethod ? fbq.callMethod(...args) : fbq.queue!.push(args);
    } as NonNullable<Janela["fbq"]>;
    fbq.queue = [];
    fbq.push = fbq as unknown as Fn;
    fbq.loaded = true;
    fbq.version = "2.0";
    j.fbq = fbq;
    j._fbq = fbq;
    script("https://connect.facebook.net/en_US/fbevents.js");
  }
  if (!iniciados.meta.has(id)) {
    j.fbq!("init", id);
    iniciados.meta.add(id);
  }
}

function iniciarGoogle(id: string) {
  const j = w();
  if (!j.gtag) {
    j.dataLayer = j.dataLayer ?? [];
    j.gtag = function (...args: unknown[]) {
      j.dataLayer!.push(args);
    };
    j.gtag("js", new Date());
    script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  }
  if (!iniciados.google.has(id)) {
    // Página vista é mandada por nós, a cada troca de rota.
    j.gtag("config", id, { send_page_view: false });
    iniciados.google.add(id);
  }
}

function iniciarTiktok(id: string) {
  const j = w();
  if (!j.ttq) {
    const fila: unknown[] = [];
    const ttq = function (...args: unknown[]) {
      fila.push(args);
    } as NonNullable<Janela["ttq"]>;
    ttq._i = {};
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    ttq.load = (pid: string) => {
      ttq._i![pid] = [];
      script(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pid)}&lib=ttq`);
    };
    ttq.instance = (pid: string) => {
      const inst = ttq._i![pid] as unknown[];
      const chama = (m: string) => (...a: unknown[]) => inst.push([m, ...a]);
      return { track: chama("track"), page: chama("page") };
    };
    j.TiktokAnalyticsObject = "ttq";
    j.ttq = ttq;
  }
  if (!iniciados.tiktok.has(id)) {
    j.ttq!.load!(id);
    iniciados.tiktok.add(id);
  }
}

/** Carrega os pixels (só depois do "aceito" — quem chama confere). */
export function carregarPixels(alvos: Pixels[]) {
  for (const p of alvos) {
    if (p.meta) iniciarMeta(p.meta);
    if (p.ga4) iniciarGoogle(p.ga4);
    if (p.googleAds) iniciarGoogle(p.googleAds);
    if (p.tiktok) iniciarTiktok(p.tiktok);
  }
}

export type Evento =
  | { tipo: "pagina" }
  | { tipo: "ver_rifa"; campanhaId: string; titulo: string; valorCents: number }
  | { tipo: "checkout"; campanhaId: string; titulo: string; valorCents: number; quantidade: number }
  | { tipo: "compra"; campanhaId: string; titulo: string; valorCents: number; quantidade: number; idDoEvento: string };

const META: Record<Evento["tipo"], string> = { pagina: "PageView", ver_rifa: "ViewContent", checkout: "InitiateCheckout", compra: "Purchase" };
const GOOGLE: Record<Evento["tipo"], string> = { pagina: "page_view", ver_rifa: "view_item", checkout: "begin_checkout", compra: "purchase" };
const TIKTOK: Record<Evento["tipo"], string> = { pagina: "", ver_rifa: "ViewContent", checkout: "InitiateCheckout", compra: "CompletePayment" };

/** Manda o evento só para os pixels desta página. */
export function rastrear(e: Evento, alvos: Pixels[]) {
  const j = w();
  const valor = "valorCents" in e ? e.valorCents / 100 : undefined;
  const dados =
    e.tipo === "pagina"
      ? {}
      : { currency: "BRL", value: valor, content_ids: [e.campanhaId], content_name: e.titulo, content_type: "product", ...("quantidade" in e ? { num_items: e.quantidade } : {}) };
  for (const p of alvos) {
    if (p.meta && j.fbq) j.fbq("trackSingle", p.meta, META[e.tipo], dados, e.tipo === "compra" ? { eventID: e.idDoEvento } : undefined);
    if (j.gtag) {
      const googleDados =
        e.tipo === "pagina"
          ? { page_location: window.location.href, page_title: document.title }
          : {
              currency: "BRL",
              value: valor,
              items: [{ item_id: e.campanhaId, item_name: e.titulo, quantity: "quantidade" in e ? e.quantidade : 1 }],
              ...(e.tipo === "compra" ? { transaction_id: e.idDoEvento } : {}),
            };
      if (p.ga4) j.gtag("event", GOOGLE[e.tipo], { ...googleDados, send_to: p.ga4 });
      if (p.googleAds && e.tipo === "compra" && p.googleAdsRotulo) {
        j.gtag("event", "conversion", { send_to: `${p.googleAds}/${p.googleAdsRotulo}`, value: valor, currency: "BRL", transaction_id: e.idDoEvento });
      }
    }
    if (p.tiktok && j.ttq?.instance) {
      const t = j.ttq.instance(p.tiktok);
      if (e.tipo === "pagina") t.page();
      else t.track(TIKTOK[e.tipo], { ...dados, ...(e.tipo === "compra" ? { event_id: e.idDoEvento } : {}) });
    }
  }
}

/** Compra no navegador uma vez por pedido neste aparelho (recarregar a página não conta de novo). */
export function compraJaContada(codigo: number): boolean {
  const k = `rifa.compra-contada.${codigo}`;
  try {
    if (localStorage.getItem(k)) return true;
    localStorage.setItem(k, "1");
  } catch {
    // sem armazenamento: conta; o servidor e o event_id cuidam da duplicata
  }
  return false;
}
