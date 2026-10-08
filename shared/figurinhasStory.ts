/**
 * Figurinhas do story da organização, como as do Instagram: a contagem até o
 * sorteio da rifa do story, o botão Comprar (que leva à compra rápida dela),
 * um texto curto e um emoji, cada uma num ponto da tela. São **dados**, nunca
 * HTML: quem desenha é a tela, e o texto passa pela régua do comentário (sem
 * link e sem telefone) e pela varredura do Pix por fora. As regras ficam aqui,
 * puras: o servidor confere e a tela avisa antes.
 */
import { temLinkOuTelefone } from "./comentarios";

export const TIPOS_DE_FIGURINHA = ["contagem", "comprar", "texto", "emoji"] as const;
export type TipoDeFigurinha = (typeof TIPOS_DE_FIGURINHA)[number];

export const FIGURINHAS_MAX = 4;
export const FIGURINHA_TEXTO_MAX = 60;

/**
 * Os emojis que entram (lista fixa, com o nome que vai no `aria-label`): o
 * emoji livre deixaria entrar qualquer sequência de caracteres na tela.
 */
export const EMOJIS_DA_FIGURINHA: { emoji: string; nome: string }[] = [
  { emoji: "🍀", nome: "trevo" },
  { emoji: "🎉", nome: "festa" },
  { emoji: "🔥", nome: "fogo" },
  { emoji: "⏰", nome: "despertador" },
  { emoji: "🏆", nome: "troféu" },
  { emoji: "🎁", nome: "presente" },
  { emoji: "🤞", nome: "dedos cruzados" },
  { emoji: "💚", nome: "coração verde" },
  { emoji: "💙", nome: "coração azul" },
  { emoji: "⭐", nome: "estrela" },
  { emoji: "🚀", nome: "foguete" },
  { emoji: "👀", nome: "olhos" },
];

/**
 * Onde a figurinha fica: o centro dela, em fração da largura e da altura do
 * story. A margem guarda a figurinha dentro da tela (e longe da barra de cima,
 * onde ficam o tempo e o fechar).
 */
export const POSICAO_MIN = 0.1;
export const POSICAO_MAX = 0.9;

export type Figurinha =
  | { tipo: "contagem"; x: number; y: number }
  | { tipo: "comprar"; x: number; y: number }
  | { tipo: "texto"; x: number; y: number; texto: string }
  | { tipo: "emoji"; x: number; y: number; emoji: string };

/**
 * A figurinha como sai para a tela: a contagem com a data de agora, o Comprar
 * com o endereço da rifa (só enquanto ela vende).
 */
export type FigurinhaNaTela =
  | { tipo: "contagem"; x: number; y: number; drawAt: Date | string | null; sorteada: boolean }
  | { tipo: "comprar"; x: number; y: number; slug: string }
  | { tipo: "texto"; x: number; y: number; texto: string }
  | { tipo: "emoji"; x: number; y: number; emoji: string };

/** Os pontos que a tela oferece (o teclado e o leitor de tela escolhem por aqui). */
export const POSICOES_HORIZONTAIS = [
  { valor: 0.25, rotulo: "Esquerda" },
  { valor: 0.5, rotulo: "Centro" },
  { valor: 0.75, rotulo: "Direita" },
] as const;
export const POSICOES_VERTICAIS = [
  { valor: 0.2, rotulo: "Topo" },
  { valor: 0.35, rotulo: "Acima do meio" },
  { valor: 0.5, rotulo: "Meio" },
  { valor: 0.65, rotulo: "Abaixo do meio" },
  { valor: 0.8, rotulo: "Base" },
] as const;

function posicao(bruta: unknown, eixo: string): number {
  if (typeof bruta !== "number" || !Number.isFinite(bruta) || bruta < 0 || bruta > 1) {
    throw new Error(`A posição ${eixo} da figurinha veio fora da tela.`);
  }
  // Três casas bastam e cabem no limite da tela.
  return Math.round(Math.min(Math.max(bruta, POSICAO_MIN), POSICAO_MAX) * 1000) / 1000;
}

function limpar(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

/**
 * As figurinhas que vieram do painel. Ausente (ou `null`) é story sem
 * figurinha. Só as chaves conhecidas de cada tipo; contagem e Comprar uma vez
 * cada e só com rifa no story (é dela que contam e vendem).
 */
export function validarFigurinhas(bruta: unknown, opcoes: { temRifa: boolean }): Figurinha[] {
  if (bruta === null || bruta === undefined) return [];
  if (!Array.isArray(bruta)) throw new Error("As figurinhas vieram num formato que não reconheço.");
  if (bruta.length > FIGURINHAS_MAX) throw new Error(`No máximo ${FIGURINHAS_MAX} figurinhas.`);
  const vistas = new Set<string>();
  return bruta.map((item): Figurinha => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Uma figurinha veio num formato que não reconheço.");
    }
    const f = item as Record<string, unknown>;
    const tipo = f.tipo;
    if (typeof tipo !== "string" || !(TIPOS_DE_FIGURINHA as readonly string[]).includes(tipo)) {
      throw new Error("Esse tipo de figurinha não existe.");
    }
    const x = posicao(f.x, "horizontal");
    const y = posicao(f.y, "vertical");
    if (tipo === "contagem" || tipo === "comprar") {
      if (!opcoes.temRifa) {
        throw new Error(
          tipo === "contagem" ? "A contagem do sorteio precisa de uma rifa no story." : "O botão Comprar precisa de uma rifa no story.",
        );
      }
      if (vistas.has(tipo)) {
        throw new Error(tipo === "contagem" ? "Só cabe uma contagem do sorteio." : "Só cabe um botão Comprar.");
      }
      vistas.add(tipo);
      return { tipo, x, y };
    }
    if (tipo === "texto") {
      const texto = typeof f.texto === "string" ? limpar(f.texto) : "";
      if (!texto) throw new Error("Escreva o texto da figurinha.");
      if (texto.length > FIGURINHA_TEXTO_MAX) throw new Error(`O texto da figurinha tem até ${FIGURINHA_TEXTO_MAX} caracteres.`);
      const problema = temLinkOuTelefone(texto);
      if (problema) throw new Error(`No texto da figurinha: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}`);
      return { tipo, x, y, texto };
    }
    const emoji = typeof f.emoji === "string" ? f.emoji : "";
    if (!EMOJIS_DA_FIGURINHA.some((e) => e.emoji === emoji)) throw new Error("Escolha um dos emojis da lista.");
    return { tipo: "emoji", x, y, emoji };
  });
}

/**
 * As figurinhas gravadas como a tela as desenha, a partir da rifa de agora —
 * a mesma conta no story e no reels. A contagem leva a data do sorteio de
 * agora (o adiamento muda sozinho) e só conta para rifa pública que vai
 * sortear de verdade (`conta`: nem demonstração nem travada); o Comprar só sai
 * enquanto a rifa vende (`vende`, a régua de `rifaAVenda()`). Texto e emoji
 * ficam sempre.
 */
export function figurinhasParaATela(
  gravadas: Figurinha[] | null | undefined,
  rifa: { slug: string | null; drawAt: Date | string | null; sorteada: boolean; conta: boolean; vende: boolean },
): FigurinhaNaTela[] {
  return (gravadas ?? []).flatMap((f): FigurinhaNaTela[] => {
    if (f.tipo === "contagem") return rifa.conta ? [{ tipo: "contagem", x: f.x, y: f.y, drawAt: rifa.drawAt, sorteada: rifa.sorteada }] : [];
    if (f.tipo === "comprar") return rifa.vende && rifa.slug ? [{ tipo: "comprar", x: f.x, y: f.y, slug: rifa.slug }] : [];
    if (f.tipo === "texto") return [{ tipo: "texto", x: f.x, y: f.y, texto: f.texto }];
    return [{ tipo: "emoji", x: f.x, y: f.y, emoji: f.emoji }];
  });
}

/** Os textos das figurinhas, para a varredura do Pix por fora. */
export function textosDasFigurinhas(figurinhas: Figurinha[]): string {
  return figurinhas.flatMap((f) => (f.tipo === "texto" ? [f.texto] : [])).join(" · ");
}

/** O nome do emoji (para o `aria-label`), ou o próprio emoji se sair da lista. */
export function nomeDoEmoji(emoji: string): string {
  return EMOJIS_DA_FIGURINHA.find((e) => e.emoji === emoji)?.nome ?? emoji;
}

/**
 * O que a contagem diz agora. Sem data (rifa "quando completar"), o texto
 * diz isso; passada a hora ou sorteada, para de contar.
 */
export function textoDaContagem(drawAt: Date | string | null, sorteada: boolean, agora = new Date()): {
  partes: { valor: number; unidade: "d" | "h" | "m" | "s" }[] | null;
  texto: string;
} {
  if (sorteada) return { partes: null, texto: "Sorteio realizado" };
  if (!drawAt) return { partes: null, texto: "Sorteio quando a rifa completar" };
  const ms = new Date(drawAt).getTime() - agora.getTime();
  if (!Number.isFinite(ms)) return { partes: null, texto: "Sorteio em breve" };
  if (ms <= 0) return { partes: null, texto: "Sorteio agora" };
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const partes = [
    { valor: d, unidade: "d" as const },
    { valor: h, unidade: "h" as const },
    { valor: m, unidade: "m" as const },
    { valor: seg, unidade: "s" as const },
  ];
  const palavras = [
    d ? `${d} ${d === 1 ? "dia" : "dias"}` : null,
    h ? `${h} ${h === 1 ? "hora" : "horas"}` : null,
    m ? `${m} ${m === 1 ? "minuto" : "minutos"}` : null,
    !d && !h && !m ? `${seg} ${seg === 1 ? "segundo" : "segundos"}` : null,
  ].filter(Boolean);
  return { partes, texto: `Sorteio em ${palavras.join(", ")}` };
}
