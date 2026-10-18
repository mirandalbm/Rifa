/**
 * O que cada caminho faz quando chega pelo endereço de uma organização
 * (`<rotulo>.<base>`). **Lista fechada, nega por padrão**: rota nova que
 * ninguém classificou responde 404 no endereço — o painel, a API de painel e os
 * webhooks existem só no domínio principal. Só funções puras; o servidor
 * (`server/services/enderecoDaOrganizacao.ts`) aplica a decisão, e o teste
 * (`tests/enderecoRotas.test.ts`) reprova rota registrada sem classe.
 *
 * Ver docs/PLANO-SUBDOMINIO.md, cap. 1.1, 1.5 e 1.6.
 */

export type Decisao =
  /** Responde como no domínio principal. */
  | { acao: "seguir" }
  /** Não existe neste endereço. */
  | { acao: "404" }
  /** É da plataforma: página vai ao principal (302), API responde 404. */
  | { acao: "principal" }
  /** Mesmo conteúdo, caminho curto (301): `/o/<este rótulo>…` → `…`. */
  | { acao: "canonico"; para: string }
  /** Só segue se a rifa (por `slug`) for da organização do endereço. */
  | { acao: "conferir-rifa"; slug: string }
  /** Só segue se `:slug` for o da organização do endereço. */
  | { acao: "conferir-organizacao"; slug: string }
  /** Só segue se a rifa do corpo (`campaignId` ou `itens[].slug`) for da organização. */
  | { acao: "conferir-corpo"; campo: "campaignId" | "itens" };

type Regra = { metodo?: string; padrao: RegExp; faz: (m: RegExpExecArray, slugDoEndereco: string) => Decisao };

const SEGUIR: Decisao = { acao: "seguir" };
const PRINCIPAL: Decisao = { acao: "principal" };
const NEGADO: Decisao = { acao: "404" };

const seguir = () => SEGUIR;
const principal = () => PRINCIPAL;

/**
 * `/api/public/…`, já sem o prefixo. A ordem importa: a primeira que casa vale.
 */
const API_PUBLICA: Regra[] = [
  // — da organização e da rifa: o dono tem de ser o do endereço —
  { padrao: /^\/o\/([^/]+)(?:\/.*)?$/, faz: (m) => ({ acao: "conferir-organizacao", slug: m[1]! }) },
  { padrao: /^\/campaigns\/([^/]+)(?:\/.*)?$/, faz: (m) => ({ acao: "conferir-rifa", slug: m[1]! }) },
  { padrao: /^\/mensagens\/grupos\/rifa\/([^/]+)$/, faz: (m) => ({ acao: "conferir-rifa", slug: m[1]! }) },
  // O campo é da rota: o corpo traz outros que o handler ignora, e conferir o errado libera a rifa do vizinho.
  { metodo: "POST", padrao: /^\/orders$/, faz: () => ({ acao: "conferir-corpo", campo: "campaignId" }) },
  { metodo: "POST", padrao: /^\/carrinho(?:\/checkout)?$/, faz: () => ({ acao: "conferir-corpo", campo: "itens" }) },

  // — da plataforma inteira: nada de organização no caminho —
  { padrao: /^\/conta\/google(?:\/.*)?$/, faz: principal }, // o login do Google é só do principal (cap. 7)
  { padrao: /^\/(?:banners|banners-pagos)(?:\/.*)?$/, faz: principal },
  { padrao: /^\/(?:buscar|estados|reels|seguindo|vitrine|patrocinadas|sorteio-oficial|afiliados|marcacoes)(?:\/.*)?$/, faz: principal },
  { padrao: /^\/campaigns$/, faz: principal },
  { padrao: /^\/stories$/, faz: principal },
  { padrao: /^\/u\/.*$/, faz: principal },
  { padrao: /^\/mensagens(?:\/.*)?$/, faz: principal },

  // — por id ou por sessão: valem em qualquer endereço —
  { padrao: /^\/stories\/[^/]+\/(?:imagem|poster|enquete)$/, faz: seguir },
  { padrao: /^\/divulgacoes\/[^/]+\/(?:fotos\/[^/]+|video)$/, faz: seguir },
  { padrao: /^\/divulgacoes\/minhas\/[^/]+\/fotos\/[^/]+$/, faz: seguir },
  { padrao: /^\/divulgacoes(?:\/.*)?$/, faz: principal },
  {
    padrao: /^\/(?:app|template|checkout|marketing|selos|endereco|track-click|denuncias|cep\/[^/]+|conta(?:\/.*)?|my-quotas(?:\/.*)?|notificacoes(?:\/.*)?|push\/.*|tickets\/.*|recibos\/[^/]+|orders\/[^/]+|carrinho\/pedidos\/[^/]+|chamados(?:\/.*)?|bonus(?:\/.*)?|presente(?:\/.*)?|comentarios\/.*|marca\/.*)$/,
    faz: seguir,
  },
];

/** `/api/…` fora de `/api/public`: só o que o SPA precisa para saber quem está logado. */
const API_FORA_DA_PUBLICA: Regra[] = [
  { metodo: "GET", padrao: /^\/auth\/me$/, faz: seguir },
  { metodo: "POST", padrao: /^\/auth\/logout$/, faz: seguir },
  { padrao: /^\/csp-relatorio$/, faz: seguir },
];

/**
 * O destino do 301 é sempre um caminho do próprio endereço: `/o/a//evil.com/x`
 * não vira `Location: //evil.com/x` (o navegador seguiria para outro site).
 */
function caminhoCanonico(resto: string): Decisao {
  if (resto.includes("\\")) return NEGADO;
  const para = `/${resto.replace(/^\/+/, "")}`;
  return { acao: "canonico", para };
}

const ARQUIVO_ESTATICO = /\.[a-z0-9]{2,5}$/i;
const PREFIXOS_ESTATICOS = ["/assets/", "/icons/", "/intro/", "/bandeiras/", "/uploads/", "/@", "/src/", "/node_modules/"];

/** Páginas do SPA (o que o navegador navega). */
const PAGINAS: Regra[] = [
  { padrao: /^\/$/, faz: seguir },
  { padrao: /^\/(?:c|l)\/.+$/, faz: seguir }, // endereço curto e link do perfil (cap. 1.6)
  { padrao: /^\/o\/([^/]+)((?:\/.*)?)$/, faz: (m, slug) => (m[1] === slug ? caminhoCanonico(m[2] ?? "") : PRINCIPAL) },
  { padrao: /^\/r\/([^/]+)(?:\/regulamento)?$/, faz: (m) => ({ acao: "conferir-rifa", slug: m[1]! }) },
  {
    padrao: /^\/(?:pedido\/[^/]+|carrinho(?:\/pix\/[^/]+)?|entrar|criar-conta|minhas-compras|minhas-cotas|notificacoes|perfil(?:\/bilhetes|\/configuracoes)?|ajuda|termos|privacidade|bilhete\/[^/]+|recibo\/[^/]+)$/,
    faz: seguir,
  },
  { padrao: /^\/(?:reels|buscar|mensagens(?:\/[^/]+)?|u\/[^/]+|publicar|seja-afiliado|estado\/[^/]+)$/, faz: principal },
  { padrao: /^\/(?:admin|afiliado|cambista)(?:\/.*)?$/, faz: () => NEGADO },
  { padrao: /^\/conta\/senha$/, faz: () => NEGADO },
];

function aplicar(regras: Regra[], metodo: string, caminho: string, slug: string): Decisao | null {
  for (const r of regras) {
    if (r.metodo && r.metodo !== metodo) continue;
    const m = r.padrao.exec(caminho);
    if (m) return r.faz(m, slug);
  }
  return null;
}

/** É arquivo da casca (script, imagem, ícone, manifesto, mídia)? */
export function ehArquivoEstatico(caminho: string): boolean {
  if (ehCaminhoDeApi(caminho) || ehCaminhoDePainel(caminho)) return false;
  return (
    caminho === "/sw.js" ||
    caminho === "/manifest.webmanifest" ||
    PREFIXOS_ESTATICOS.some((p) => caminho.startsWith(p)) ||
    ARQUIVO_ESTATICO.test(caminho)
  );
}

/**
 * `/api` em qualquer caixa: o Express casa rota sem diferenciar maiúscula
 * (`/API/Public/…` chega ao mesmo handler), então a lista fechada não pode
 * ler só a forma minúscula.
 */
export function ehCaminhoDeApi(caminho: string): boolean {
  return /^\/api(?:\/|$)/i.test(caminho);
}

const PAINEL = /^\/(?:admin|afiliado|cambista)(?:\/|$)/i;
export function ehCaminhoDePainel(caminho: string): boolean {
  return PAINEL.test(caminho);
}

/**
 * Diz o que fazer com `metodo caminho` no endereço da organização
 * `slugDoEndereco`. `caminho` é o caminho puro (sem consulta), como chegou.
 */
export function decidirNoEndereco(metodo: string, caminho: string, slugDoEndereco: string): Decisao {
  const m = metodo.toUpperCase();
  if (!caminho.startsWith("/")) return NEGADO; // forma absoluta (`GET http://x/…`) ou lixo
  if (caminho.startsWith("/api/public/")) {
    return aplicar(API_PUBLICA, m, caminho.slice("/api/public".length), slugDoEndereco) ?? NEGADO;
  }
  if (caminho.startsWith("/api/")) {
    return aplicar(API_FORA_DA_PUBLICA, m, caminho.slice("/api".length), slugDoEndereco) ?? NEGADO;
  }
  if (ehCaminhoDeApi(caminho)) return NEGADO; // `/API/…`, `/Api`: não é a forma que classificamos
  // `/o/<rótulo>/…` é página (canonicalização), mesmo que termine como nome de arquivo (`…/evil.com`).
  if (!caminho.startsWith("/o/") && ehArquivoEstatico(caminho)) return SEGUIR;
  return aplicar(PAGINAS, m, caminho, slugDoEndereco) ?? NEGADO;
}

/**
 * Para o teste de cobertura: a rota registrada (`/campaigns/:slug/foo`) tem
 * classe **escrita**? Troca os `:parâmetros` por um valor de exemplo e exige que
 * a decisão não seja o padrão (404) — salvo as rotas que o plano nega de
 * propósito (`negadasDeProposito`).
 */
export function exemploDeCaminho(rota: string): string {
  return rota.replace(/:([A-Za-z]+)/g, (_t, nome: string) => (nome === "id" || nome === "fotoId" ? "00000000-0000-4000-8000-000000000000" : "exemplo"));
}

/** O caminho tem classe escrita (e não só o 404 de quem ninguém classificou)? */
export function temClasse(metodo: string, caminho: string): boolean {
  const m = metodo.toUpperCase();
  if (!caminho.startsWith("/") || (ehCaminhoDeApi(caminho) && !caminho.startsWith("/api/"))) return false;
  if (caminho.startsWith("/api/public/")) return aplicar(API_PUBLICA, m, caminho.slice("/api/public".length), "x") !== null;
  if (caminho.startsWith("/api/")) return aplicar(API_FORA_DA_PUBLICA, m, caminho.slice("/api".length), "x") !== null;
  return ehArquivoEstatico(caminho) || aplicar(PAGINAS, m, caminho, "x") !== null;
}
