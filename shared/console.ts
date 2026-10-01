/**
 * O console do app (a barra fixa da base, como no Instagram) e o topo.
 *
 * Um código só para as três larguras: no celular e no tablet o console é a
 * barra de baixo; no computador (a partir de `lg`) os mesmos botões viram o
 * menu da lateral esquerda, com o trevo de avisos e a publicação junto.
 *
 * Os botões que ainda não existem aparecem mesmo assim — o app em
 * desenvolvimento mostra o panorama da forma final — e levam a uma tela
 * "Em breve" que diz o que vem. Quando um ficar pronto, `pronto: true`.
 */
import { PALETA_DO_SELO, type CorDoSelo } from "./verificacao";

export const BOTOES_DO_CONSOLE = [
  { chave: "inicio", rotulo: "Início", caminho: "/", pronto: true },
  { chave: "reels", rotulo: "Reels", caminho: "/reels", pronto: false },
  { chave: "mensagens", rotulo: "Mensagens", caminho: "/mensagens", pronto: false },
  { chave: "buscar", rotulo: "Buscar", caminho: "/buscar", pronto: false },
  { chave: "carrinho", rotulo: "Carrinho", caminho: "/carrinho", pronto: true },
  { chave: "perfil", rotulo: "Perfil", caminho: "/perfil", pronto: true },
] as const;

export type BotaoDoConsole = (typeof BOTOES_DO_CONSOLE)[number]["chave"];

/**
 * O botão aceso para o endereço de agora. A rifa, o perfil de organização e
 * o estado são "Início" (vêm da vitrine); as telas da conta são "Perfil".
 */
export function botaoAtivo(caminho: string): BotaoDoConsole | null {
  const c = caminho.split("?")[0];
  if (c === "/" || c.startsWith("/r/") || c.startsWith("/o/") || c.startsWith("/estado/")) return "inicio";
  if (c.startsWith("/reels")) return "reels";
  if (c.startsWith("/mensagens")) return "mensagens";
  if (c.startsWith("/buscar")) return "buscar";
  if (c.startsWith("/carrinho")) return "carrinho";
  if (["/perfil", "/minhas-compras", "/minhas-cotas", "/entrar", "/criar-conta", "/ajuda"].some((p) => c === p || c.startsWith(`${p}/`)))
    return "perfil";
  return null;
}

/** O que cada tela "Em breve" promete — o texto sai daqui, não da tela. */
export const EM_BREVE: Record<Exclude<BotaoDoConsole, "inicio" | "carrinho" | "perfil">, { titulo: string; texto: string }> = {
  reels: {
    titulo: "Reels",
    texto: "Os vídeos das rifas em tela cheia, um atrás do outro, com o carrinho e a compra rápida no próprio vídeo.",
  },
  mensagens: {
    titulo: "Mensagens",
    texto: "Conversas com amigos e sobre as rifas que vocês comentaram. Em cima, quem está online e as conversas ainda não lidas.",
  },
  buscar: {
    titulo: "Buscar",
    texto: "As últimas publicações, reels e rifas das organizações, para descobrir o que está no ar.",
  },
};

/* ------------------------------------------------------------------ *
 * Aviso no trevo (o lugar do coração do Instagram)
 * ------------------------------------------------------------------ */

/**
 * Como o trevo avisa que há novidade: um **ponto** no canto (o padrão, como
 * o ponto vermelho do Instagram) ou o trevo **cheio** na cor escolhida. Só
 * a plataforma troca — para datas comemorativas e edições especiais.
 */
export const ESTILOS_DO_AVISO = { ponto: "Ponto no canto", cheio: "Trevo cheio" } as const;
export type EstiloDoAviso = keyof typeof ESTILOS_DO_AVISO;

/**
 * As cores: o verde do sistema (que muda de tom com o tema) ou uma da
 * paleta do selo, já conferida com contraste ≥ 3:1 nos dois temas. Só as da
 * família do sistema — verdes, azuis e o grafite, com o laranja e o rosa
 * para datas comemorativas; roxo, violeta, magenta e índigo não são cor do
 * sistema e ficam de fora.
 */
const FORA_DO_SISTEMA = new Set<string>(["roxo", "violeta", "magenta", "indigo"]);
export const CORES_DO_AVISO = {
  sistema: { nome: "Verde do sistema", hex: null },
  ...Object.fromEntries(
    Object.entries(PALETA_DO_SELO)
      .filter(([k]) => !FORA_DO_SISTEMA.has(k))
      .map(([k, v]) => [k, { nome: v.nome, hex: v.hex as string | null }]),
  ),
} as Record<"sistema" | Exclude<CorDoSelo, "roxo" | "violeta" | "magenta" | "indigo">, { nome: string; hex: string | null }>;
export type CorDoAviso = keyof typeof CORES_DO_AVISO;

export interface AvisoDoTrevo {
  estilo: EstiloDoAviso;
  cor: CorDoAviso;
}

export const AVISO_DO_TREVO_PADRAO: AvisoDoTrevo = { estilo: "ponto", cor: "sistema" };

/** Só as chaves conhecidas; valor fora da lista volta ao padrão daquela chave. */
export function validarAvisoDoTrevo(v: unknown): AvisoDoTrevo {
  const e = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const estilo = typeof e.estilo === "string" && e.estilo in ESTILOS_DO_AVISO ? (e.estilo as EstiloDoAviso) : AVISO_DO_TREVO_PADRAO.estilo;
  const cor = typeof e.cor === "string" && e.cor in CORES_DO_AVISO ? (e.cor as CorDoAviso) : AVISO_DO_TREVO_PADRAO.cor;
  return { estilo, cor };
}

/* ------------------------------------------------------------------ *
 * Publicar (o ícone ao lado do trevo)
 * ------------------------------------------------------------------ */

export type QuemPublica = "organizador" | "influenciador" | "apostador" | null;

/**
 * Quem vê o ícone de publicação. Organização (e a plataforma) cria rifa,
 * story e legenda; o afiliado (influenciador) vai publicar com o material
 * das organizações; o apostador só com o interruptor da plataforma
 * (`publicarApostador`, nasce desligado). Sem conta, não aparece.
 */
export function quemPublica(
  sessao: { role?: string | null; apostador?: boolean } | null | undefined,
  publicarApostador: boolean,
): QuemPublica {
  if (!sessao) return null;
  if (sessao.role === "admin" || sessao.role === "organizer") return "organizador";
  if (sessao.role === "affiliate") return "influenciador";
  if (sessao.apostador && publicarApostador) return "apostador";
  return null;
}

/* ------------------------------------------------------------------ *
 * Pendências da conta (o ponto na foto do perfil, no console)
 * ------------------------------------------------------------------ */

export interface ContaParaPendencias {
  conta: boolean;
  confirmado: boolean;
  apelido: string | null | undefined;
  /** Conta criada pelo Google: o que ainda falta ("CPF", "telefone"). */
  falta?: string[];
}

/**
 * O que falta na conta do apostador — o ponto na foto do perfil, como o
 * do Instagram. Sem conta (só o código do WhatsApp) não há o que completar.
 * O texto vai no rótulo do botão e na tela do perfil, nunca só o ponto.
 */
export function pendenciasDaConta(c: ContaParaPendencias | null | undefined): string[] {
  if (!c?.conta) return [];
  const falta: string[] = [];
  if (!c.apelido) falta.push("Escolha seu apelido para comentar e republicar");
  if (c.falta?.includes("CPF")) falta.push("Informe seu CPF para comprar e pedir reembolso");
  if (c.falta?.includes("telefone")) falta.push("Informe e confirme seu telefone pelo WhatsApp");
  else if (!c.confirmado) falta.push("Confirme seu telefone pelo WhatsApp");
  return falta;
}
