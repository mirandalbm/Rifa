/**
 * Construtor de templates: a aparência da plataforma, editada pelo
 * administrador geral sem código.
 *
 * Nada de HTML ou script livre — só dados: identidade (nome, logo, cor de
 * marca, fonte de uma lista, cantos), a tela inicial em **blocos** que o
 * sistema já sabe desenhar nos dois temas, e os textos do rodapé. Tudo o
 * que entra passa por `validarTemplate()`, que só guarda chaves conhecidas.
 *
 * A cor de marca é **marca**, não significado: logo, links, item ativo do
 * menu. Verde de dinheiro, amarelo de espera e vermelho de erro não mudam
 * com o template (CLAUDE.md, Convenções).
 */

export const FONTES = {
  instrument: { nome: "Instrument Sans", google: "Instrument+Sans:wght@400;500;600" },
  inter: { nome: "Inter", google: "Inter:wght@400;500;600" },
  dmsans: { nome: "DM Sans", google: "DM+Sans:wght@400;500;600" },
  nunito: { nome: "Nunito Sans", google: "Nunito+Sans:wght@400;600;700" },
  poppins: { nome: "Poppins", google: "Poppins:wght@400;500;600" },
} as const;
export type Fonte = keyof typeof FONTES;

export const RAIOS = { reto: 2, suave: 9, redondo: 16 } as const;
export type Raio = keyof typeof RAIOS;

export const TIPOS_DE_BLOCO = {
  seguidos: "Perfis que a pessoa segue",
  regiao: "Seletor de estado",
  rifas: "Rifas no ar",
  texto: "Texto livre",
  ajuda: "Atalho para a central de ajuda",
} as const;
export type TipoDeBloco = keyof typeof TIPOS_DE_BLOCO;

export interface Bloco {
  id: string;
  tipo: TipoDeBloco;
  ligado: boolean;
  titulo?: string;
  /** Só no bloco de texto. */
  corpo?: string;
  /** Só no bloco de rifas: quantas mostrar (0 = todas). */
  quantidade?: number;
}

export interface Template {
  identidade: {
    nome: string;
    /** Endereço da logo (preenchido pelo servidor ao enviar o arquivo). */
    logo: string | null;
    cor: { claro: string; escuro: string };
    fonte: Fonte;
    raio: Raio;
  };
  blocos: Bloco[];
  textos: { rodape: string; jogoResponsavel: string };
}

/** Fundo de cada tema (o mesmo de `index.css`): a cor de marca tem de aparecer nele. */
export const FUNDO = { claro: "#ffffff", escuro: "#0e1712" } as const;
/** Contraste mínimo de elemento gráfico e texto grande (WCAG 1.4.11). */
export const CONTRASTE_MIN = 3;

export const TEMPLATE_PADRAO: Template = {
  identidade: {
    nome: "rifa.br",
    logo: null,
    cor: { claro: "#00873e", escuro: "#5dd394" },
    fonte: "instrument",
    raio: "suave",
  },
  blocos: [
    { id: "regiao", tipo: "regiao", ligado: true },
    { id: "seguidos", tipo: "seguidos", ligado: true },
    { id: "rifas", tipo: "rifas", ligado: true, quantidade: 0 },
    { id: "ajuda", tipo: "ajuda", ligado: false, titulo: "Dúvidas? Veja a central de ajuda" },
  ],
  textos: {
    rodape: "",
    jogoResponsavel: "Jogue com responsabilidade. Proibido para menores de 18 anos.",
  },
};

/* ------------------------------------------------------------------ *
 * Cor
 * ------------------------------------------------------------------ */

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Contraste WCAG entre duas cores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function corValida(c: unknown): c is string {
  return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
}

/* ------------------------------------------------------------------ *
 * Validação
 * ------------------------------------------------------------------ */

export class TemplateInvalido extends Error {}

const texto = (v: unknown, max: number, campo: string): string => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new TemplateInvalido(`${campo} precisa ser texto.`);
  const t = v.replace(/\r\n?/g, "\n").trim();
  if (t.length > max) throw new TemplateInvalido(`${campo} passa de ${max} caracteres.`);
  return t;
};

/**
 * Confere e normaliza. Só chaves conhecidas saem daqui — isto vem do corpo
 * da requisição, e o template vai para a tela de todo mundo.
 */
export function validarTemplate(entrada: unknown): Template {
  if (!entrada || typeof entrada !== "object") throw new TemplateInvalido("Template inválido.");
  const e = entrada as Record<string, any>;
  const id = e.identidade ?? {};

  const nome = texto(id.nome, 40, "O nome");
  if (nome.length < 2) throw new TemplateInvalido("Informe o nome da plataforma.");

  const cor = { claro: String(id.cor?.claro ?? "").toLowerCase(), escuro: String(id.cor?.escuro ?? "").toLowerCase() };
  for (const tema of ["claro", "escuro"] as const) {
    if (!corValida(cor[tema])) throw new TemplateInvalido(`Cor do tema ${tema} inválida (use #rrggbb).`);
    const c = contraste(cor[tema], FUNDO[tema]);
    if (c < CONTRASTE_MIN) {
      throw new TemplateInvalido(
        `A cor do tema ${tema} quase não aparece no fundo (contraste ${c.toFixed(1)}:1; mínimo ${CONTRASTE_MIN}:1).`,
      );
    }
  }

  if (!(id.fonte in FONTES)) throw new TemplateInvalido("Escolha uma fonte da lista.");
  if (!(id.raio in RAIOS)) throw new TemplateInvalido("Escolha o formato dos cantos.");

  const logo = typeof id.logo === "string" && id.logo.startsWith("/api/public/marca/logo") ? id.logo : null;

  if (!Array.isArray(e.blocos) || e.blocos.length === 0) throw new TemplateInvalido("A tela inicial precisa de blocos.");
  if (e.blocos.length > 12) throw new TemplateInvalido("No máximo 12 blocos na tela inicial.");
  const ids = new Set<string>();
  const blocos: Bloco[] = e.blocos.map((b: any, i: number) => {
    if (!b || !(b.tipo in TIPOS_DE_BLOCO)) throw new TemplateInvalido(`Bloco ${i + 1}: tipo desconhecido.`);
    const bid = typeof b.id === "string" && /^[a-z0-9-]{1,40}$/.test(b.id) ? b.id : "";
    if (!bid || ids.has(bid)) throw new TemplateInvalido(`Bloco ${i + 1}: identificador inválido ou repetido.`);
    ids.add(bid);
    const bloco: Bloco = { id: bid, tipo: b.tipo, ligado: b.ligado !== false };
    const titulo = texto(b.titulo, 80, `Título do bloco ${i + 1}`);
    if (titulo) bloco.titulo = titulo;
    if (b.tipo === "texto") {
      const corpo = texto(b.corpo, 600, `Texto do bloco ${i + 1}`);
      if (!corpo && bloco.ligado) throw new TemplateInvalido(`Bloco ${i + 1}: escreva o texto.`);
      bloco.corpo = corpo;
    }
    if (b.tipo === "rifas") {
      const q = Number(b.quantidade ?? 0);
      if (!Number.isInteger(q) || q < 0 || q > 60) throw new TemplateInvalido(`Bloco ${i + 1}: quantidade de 0 a 60.`);
      bloco.quantidade = q;
    }
    return bloco;
  });
  // Sem o feed de rifas ligado a vitrine não vende nada — e a tela não
  // denunciaria isso (a mesma lógica de "pelo menos um meio de pagamento").
  if (!blocos.some((b) => b.tipo === "rifas" && b.ligado)) {
    throw new TemplateInvalido("Deixe o bloco \"Rifas no ar\" ligado: sem ele a vitrine não vende.");
  }

  return {
    identidade: { nome, logo, cor, fonte: id.fonte, raio: id.raio },
    blocos,
    textos: {
      rodape: texto(e.textos?.rodape, 300, "O rodapé"),
      jogoResponsavel: texto(e.textos?.jogoResponsavel, 200, "O aviso de jogo responsável"),
    },
  };
}

/** Template guardado de uma versão antiga: completa o que faltar com o padrão. */
export function completarTemplate(guardado: unknown): Template {
  try {
    return validarTemplate(guardado);
  } catch {
    return TEMPLATE_PADRAO;
  }
}
