/**
 * Endereço do organizador e a ordem da vitrine por proximidade.
 *
 * Toda rifa é nacional: a localização **só ordena**, nunca esconde. Quem
 * está em Campinas vê primeiro as rifas de Campinas, depois as de SP, depois
 * o resto — mas vê todas. O estado da rifa é o da organização que a promove.
 *
 * Puro, sem banco: o servidor valida com isto e a tela mostra com isto.
 */

export const UFS = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
} as const;

export type UF = keyof typeof UFS;

export function ufValida(uf: unknown): uf is UF {
  return typeof uf === "string" && Object.prototype.hasOwnProperty.call(UFS, uf);
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: UF;
}

export function soDigitosCep(cep: string): string {
  return String(cep ?? "").replace(/\D/g, "").slice(0, 8);
}

export function cepValido(cep: string): boolean {
  const d = String(cep ?? "").replace(/\D/g, "");
  return d.length === 8 && !/^(\d)\1{7}$/.test(d);
}

/** 01310100 → 01310-100, enquanto digita. */
export function maskCep(cep: string): string {
  const d = soDigitosCep(cep);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const LIMITE = 120;

/**
 * Confere e normaliza o que veio do formulário. Só as chaves conhecidas
 * saem daqui: isto vem do corpo da requisição.
 */
export function validarEndereco(input: Partial<Record<keyof Endereco, unknown>>): Endereco {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const cep = soDigitosCep(texto(input.cep));
  const uf = texto(input.uf).toUpperCase();
  const e = {
    cep,
    logradouro: texto(input.logradouro),
    numero: texto(input.numero),
    complemento: texto(input.complemento) || null,
    bairro: texto(input.bairro),
    cidade: texto(input.cidade),
    uf,
  };

  if (!cepValido(e.cep)) throw new Error("CEP inválido: são 8 números.");
  if (!ufValida(e.uf)) throw new Error("Escolha o estado (UF).");
  if (e.cidade.length < 2) throw new Error("Informe a cidade.");
  if (e.bairro.length < 2) throw new Error("Informe o bairro.");
  if (e.logradouro.length < 2) throw new Error("Informe a rua.");
  if (!e.numero) throw new Error('Informe o número (ou "s/n").');
  for (const [campo, valor] of Object.entries(e)) {
    if (typeof valor === "string" && valor.length > LIMITE) {
      throw new Error(`O campo ${campo} passou de ${LIMITE} caracteres.`);
    }
  }
  return e as Endereco;
}

/** "Campinas/SP" — o que sai no bilhete e no cartão da rifa. */
export function cidadeUf(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  const c = cidade?.trim();
  if (c && uf) return `${c}/${uf}`;
  return c || uf || null;
}

/** Uma linha só, para o rodapé e para o painel. */
export function enderecoEmUmaLinha(e: Endereco): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
  return `${rua} — ${e.bairro}, ${cidadeUf(e.cidade, e.uf)} — CEP ${maskCep(e.cep)}`;
}

/* ------------------------------------------------------------------ *
 * Ordem da vitrine
 * ------------------------------------------------------------------ */

/** Sem acento, sem caixa: "São Paulo" e "sao paulo" são a mesma cidade. */
export function chaveDaCidade(cidade: string | null | undefined): string {
  return String(cidade ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Regiao {
  uf?: string | null;
  cidade?: string | null;
}

/** 0 = mesma cidade, 1 = mesmo estado, 2 = o resto. */
export function distancia(rifa: Regiao, perto: Regiao): 0 | 1 | 2 {
  const uf = perto.uf?.toUpperCase();
  if (!uf || !rifa.uf || rifa.uf.toUpperCase() !== uf) return 2;
  const cidade = chaveDaCidade(perto.cidade);
  if (cidade && chaveDaCidade(rifa.cidade) === cidade) return 0;
  return 1;
}

/**
 * Cidade → estado → resto, **estável**: dentro de cada faixa fica a ordem
 * que já vinha (destaque, peso, mais nova). Sem região, a lista volta igual.
 */
export function ordenarPorProximidade<T extends Regiao>(rifas: readonly T[], perto: Regiao): T[] {
  if (!perto.uf) return [...rifas];
  return rifas
    .map((r, i) => ({ r, i, d: distancia(r, perto) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.r);
}

/**
 * O cadastro antigo tinha só "Cidade/UF" em texto livre. Lê "São Paulo/SP",
 * "Campinas - SP" e "Niterói, RJ"; qualquer outra coisa fica como está, para
 * a organização completar pelo endereço.
 */
export function separarCidadeUf(texto: string | null | undefined): { cidade: string; uf: UF } | null {
  const m = String(texto ?? "").trim().match(/^(.{2,}?)\s*(?:\/|-|–|,)\s*([A-Za-z]{2})$/);
  if (!m) return null;
  const uf = m[2].toUpperCase();
  return ufValida(uf) ? { cidade: m[1].trim(), uf } : null;
}
