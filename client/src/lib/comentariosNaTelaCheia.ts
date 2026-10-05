/**
 * Os comentários do sorteio oficial na tela cheia do vídeo, como no chat da
 * Twitch: ao lado do vídeo (com o celular deitado o vídeo encolhe e a
 * conversa fica à direita; em pé, embaixo) ou por cima dele, num canto, com
 * as últimas mensagens sobre um fundo escuro. Onde ficam e o lado são da
 * pessoa e ficam no aparelho (`rifa.sorteio.comentarios`), como o som do
 * Reels: perder só devolve o padrão. O fundo não é escolha de quem assiste
 * (o YouTube e a Twitch não dão): por padrão não há fundo — só as
 * mensagens, com sombra no texto —, e só a plataforma pode pôr um fundo
 * escuro (`fundoDaConversaPct` em `shared/plataforma.ts`). É só
 * apresentação — os comentários são os mesmos de embaixo do vídeo, com as
 * mesmas regras.
 */

export const MODOS_NA_TELA_CHEIA = [
  { valor: "auto", rotulo: "Automático (ao lado deitado, por cima em pé)" },
  { valor: "lado", rotulo: "Ao lado do vídeo" },
  { valor: "sobre", rotulo: "Por cima do vídeo" },
  { valor: "oculto", rotulo: "Escondidos" },
] as const;
export type ModoNaTelaCheia = (typeof MODOS_NA_TELA_CHEIA)[number]["valor"];

export const LADOS_NA_TELA_CHEIA = [
  { valor: "direita", rotulo: "Direita" },
  { valor: "esquerda", rotulo: "Esquerda" },
] as const;
export type LadoNaTelaCheia = (typeof LADOS_NA_TELA_CHEIA)[number]["valor"];

export interface PreferenciaNaTelaCheia {
  modo: ModoNaTelaCheia;
  lado: LadoNaTelaCheia;
}

export const PREFERENCIA_PADRAO: PreferenciaNaTelaCheia = { modo: "auto", lado: "direita" };

/** Quantas mensagens ficam por cima do vídeo (as mais novas). */
export const MENSAGENS_POR_CIMA = 6;

const CHAVE = "rifa.sorteio.comentarios";

function conhecido<T extends string>(lista: readonly { valor: T }[], v: unknown, padrao: T): T {
  return lista.some((x) => x.valor === v) ? (v as T) : padrao;
}

/** Só as chaves e os valores conhecidos; o resto vira o padrão. */
export function lerPreferenciaGuardada(bruta: string | null): PreferenciaNaTelaCheia {
  let p: Record<string, unknown> = {};
  try {
    const lida = bruta ? JSON.parse(bruta) : null;
    if (lida && typeof lida === "object" && !Array.isArray(lida)) p = lida as Record<string, unknown>;
  } catch {
    // Guardado estragado: vale o padrão.
  }
  return {
    modo: conhecido(MODOS_NA_TELA_CHEIA, p.modo, PREFERENCIA_PADRAO.modo),
    lado: conhecido(LADOS_NA_TELA_CHEIA, p.lado, PREFERENCIA_PADRAO.lado),
  };
}

export function lerPreferencia(): PreferenciaNaTelaCheia {
  try {
    return lerPreferenciaGuardada(localStorage.getItem(CHAVE));
  } catch {
    return PREFERENCIA_PADRAO;
  }
}

export function guardarPreferencia(p: PreferenciaNaTelaCheia) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem armazenamento (aba anônima): vale só nesta visita.
  }
}

/** Onde os comentários ficam agora: o "automático" segue a posição do aparelho. */
export function modoNaTela(p: PreferenciaNaTelaCheia, deitado: boolean): "lado" | "sobre" | "oculto" {
  if (p.modo === "auto") return deitado ? "lado" : "sobre";
  return p.modo;
}

/** A opacidade do fundo da conversa por cima do vídeo, da escolha da plataforma (0 = sem fundo, 100 = sólido). */
export function alfaDoFundo(pct: number): number {
  return Number.isFinite(pct) ? Math.min(1, Math.max(0, pct / 100)) : 0;
}

/**
 * A cor de cada pessoa na conversa por cima do vídeo, como no chat da
 * Twitch: parece sorteada, mas sai do próprio apelido — a mesma pessoa tem
 * sempre a mesma cor, e a conversa não troca de cor a cada 10 s. **É a
 * exceção à paleta do sistema** (como as cores das loterias): vale só aqui,
 * é identidade de quem escreve e nunca estado — por isso o vermelho puro
 * (erro) fica de fora. Todas claras, com contraste ≥ 4,5:1 contra o preto da
 * sombra — o teste confere.
 */
export const CORES_DOS_NOMES = [
  "#FB923C", // laranja
  "#F472B6", // rosa
  "#C084FC", // lilás
  "#FDE047", // amarelo
  "#4ADE80", // verde
  "#38BDF8", // celeste
  "#22D3EE", // ciano
  "#A3E635", // lima
  "#FCA5A5", // coral
  "#818CF8", // anil
  "#2DD4BF", // turquesa
  "#E879F9", // magenta
] as const;

export function corDoNome(nome: string): string {
  // FNV-1a e a finalização do murmur3: apelidos parecidos caem em cores sem relação.
  let h = 0x811c9dc5;
  for (let i = 0; i < nome.length; i++) h = Math.imul(h ^ nome.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return CORES_DOS_NOMES[(h >>> 0) % CORES_DOS_NOMES.length];
}

interface ComentarioLido {
  id: string;
  nome: string;
  texto: string;
  createdAt: string;
  respostas?: ComentarioLido[];
}

/**
 * As últimas mensagens para pôr por cima do vídeo, como no chat da Twitch: o
 * comentário e as respostas na mesma fila, da mais antiga para a mais nova
 * (a mais nova embaixo, perto do polegar).
 */
export function ultimasMensagens(lista: ComentarioLido[], n = MENSAGENS_POR_CIMA): { id: string; nome: string; texto: string }[] {
  const todas: ComentarioLido[] = [];
  for (const c of lista) {
    todas.push(c);
    for (const r of c.respostas ?? []) todas.push(r);
  }
  return todas
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    .slice(-n)
    .map(({ id, nome, texto }) => ({ id, nome, texto }));
}

/**
 * O contorno das letras da conversa por cima do vídeo, como legenda de
 * filme: 1 px preto em volta de cada letra (as oito direções) e uma sombra
 * leve por fora. Sem fundo atrás da conversa, é ele que deixa o nome e o
 * texto legíveis em cima de qualquer cor do vídeo.
 */
export const CONTORNO_DAS_LETRAS = [
  "-1px -1px 0 #000",
  "0 -1px 0 #000",
  "1px -1px 0 #000",
  "-1px 0 0 #000",
  "1px 0 0 #000",
  "-1px 1px 0 #000",
  "0 1px 0 #000",
  "1px 1px 0 #000",
  "0 0 4px rgba(0,0,0,0.8)",
].join(", ");
