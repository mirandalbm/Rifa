/**
 * Os comentários do sorteio oficial na tela cheia do vídeo, como no chat da
 * Twitch: ao lado do vídeo (com o celular deitado o vídeo encolhe e a
 * conversa fica à direita; em pé, embaixo) ou por cima dele, num canto, com
 * as últimas mensagens sobre um fundo escuro transparente. A escolha é da
 * pessoa e fica no aparelho (`rifa.sorteio.comentarios`), como o som do
 * Reels: perder só devolve o padrão. É só apresentação — os comentários são
 * os mesmos de embaixo do vídeo, com as mesmas regras.
 */

export const MODOS_NA_TELA_CHEIA = [
  { valor: "auto", rotulo: "Automático (ao lado deitado, por cima em pé)" },
  { valor: "lado", rotulo: "Ao lado do vídeo" },
  { valor: "sobre", rotulo: "Por cima do vídeo" },
  { valor: "oculto", rotulo: "Escondidos" },
] as const;
export type ModoNaTelaCheia = (typeof MODOS_NA_TELA_CHEIA)[number]["valor"];

/**
 * O fundo dos comentários por cima do vídeo. O mais leve ainda deixa o texto
 * branco legível sobre qualquer imagem (com a sombra do texto).
 */
export const FUNDOS_NA_TELA_CHEIA = [
  { valor: "leve", rotulo: "Mais transparente", alfa: 0.45 },
  { valor: "medio", rotulo: "Médio", alfa: 0.6 },
  { valor: "forte", rotulo: "Mais escuro", alfa: 0.8 },
] as const;
export type FundoNaTelaCheia = (typeof FUNDOS_NA_TELA_CHEIA)[number]["valor"];

export const LADOS_NA_TELA_CHEIA = [
  { valor: "direita", rotulo: "Direita" },
  { valor: "esquerda", rotulo: "Esquerda" },
] as const;
export type LadoNaTelaCheia = (typeof LADOS_NA_TELA_CHEIA)[number]["valor"];

export interface PreferenciaNaTelaCheia {
  modo: ModoNaTelaCheia;
  fundo: FundoNaTelaCheia;
  lado: LadoNaTelaCheia;
}

export const PREFERENCIA_PADRAO: PreferenciaNaTelaCheia = { modo: "auto", fundo: "medio", lado: "direita" };

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
    fundo: conhecido(FUNDOS_NA_TELA_CHEIA, p.fundo, PREFERENCIA_PADRAO.fundo),
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

export function alfaDoFundo(f: FundoNaTelaCheia): number {
  return FUNDOS_NA_TELA_CHEIA.find((x) => x.valor === f)?.alfa ?? 0.6;
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
