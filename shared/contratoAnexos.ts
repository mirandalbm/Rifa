/**
 * Anexos do contrato por modalidade (cláusula 7 do contrato da plataforma
 * com a promotora). O contrato-base vale para todas; o anexo vale só para a
 * rifa que usa aquela modalidade, e quem decide se ela usa é o **sistema**,
 * pelos dados da própria rifa — a promotora nunca escolhe o anexo. Sem o
 * aceite da versão em vigor de cada anexo que a rifa exige, ela não publica
 * (e, na rifa já no ar, a entidade beneficiada e a cota premiada nova não
 * entram). Puro: a tela e o servidor leem daqui.
 */
import { CONTRATO_MAX, ContratoError } from "./contratoPromotora";

export const MODALIDADES_DE_ANEXO = {
  federal: {
    rotulo: "Apuração pela Loteria Federal",
    quando: "rifa apurada pela leitura direta da Loteria Federal",
  },
  globo: {
    rotulo: "Apuração pelo globo da plataforma",
    quando: "rifa apurada pelo globo da plataforma (ata notarial)",
  },
  vale_brinde: {
    rotulo: "Cotas premiadas (vale-brinde, promoção mista)",
    quando: "rifa com cota premiada",
  },
  bonus: {
    rotulo: "Cota de bônus (distribuição promocional)",
    quando: "rifa que aceita cota de bônus",
  },
  entidade: {
    rotulo: "Entidade beneficiada (ONG, fundação)",
    quando: "rifa com entidade beneficiada cadastrada",
  },
} as const;
export type ModalidadeDeAnexo = keyof typeof MODALIDADES_DE_ANEXO;
export const MODALIDADES = Object.keys(MODALIDADES_DE_ANEXO) as ModalidadeDeAnexo[];

export const TITULO_MIN = 3;
export const TITULO_MAX = 120;
export const ANEXO_MIN = 50;

export function ehModalidade(v: unknown): v is ModalidadeDeAnexo {
  return typeof v === "string" && v in MODALIDADES_DE_ANEXO;
}

/** O que a rifa usa, lido dos dados dela — nunca de uma escolha da promotora. */
export interface DadosDaRifaParaAnexo {
  metodoApuracao: string | null;
  aceitaCotaBonus: boolean;
  temPremiadas: boolean;
  temEntidade: boolean;
}

export function modalidadesDaRifa(r: DadosDaRifaParaAnexo): ModalidadeDeAnexo[] {
  const m: ModalidadeDeAnexo[] = [];
  if (r.metodoApuracao === "federal_direta") m.push("federal");
  if (r.metodoApuracao === "globo") m.push("globo");
  if (r.temPremiadas) m.push("vale_brinde");
  if (r.aceitaCotaBonus) m.push("bonus");
  if (r.temEntidade) m.push("entidade");
  return m;
}

/** Corpo da publicação de um anexo: só as três chaves. O texto passa pelos campos da empresa como o contrato. */
export function validarAnexo(bruto: unknown): { modalidade: ModalidadeDeAnexo; titulo: string; texto: string } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  if (!ehModalidade(b.modalidade)) throw new ContratoError("Escolha a modalidade do anexo.");
  const titulo = typeof b.titulo === "string" ? b.titulo.replace(/\s+/g, " ").trim() : "";
  if (titulo.length < TITULO_MIN || titulo.length > TITULO_MAX) {
    throw new ContratoError(`O título do anexo tem de ${TITULO_MIN} a ${TITULO_MAX} caracteres.`);
  }
  if (typeof b.texto !== "string") throw new ContratoError("Cole o texto do anexo.");
  const texto = b.texto.replace(/\r\n?/g, "\n").trim();
  if (texto.length < ANEXO_MIN) throw new ContratoError(`O anexo precisa ter pelo menos ${ANEXO_MIN} caracteres.`);
  if (texto.length > CONTRATO_MAX) throw new ContratoError(`O anexo passa de ${CONTRATO_MAX.toLocaleString("pt-BR")} caracteres.`);
  return { modalidade: b.modalidade, titulo, texto };
}

/** A frase que barra: quais anexos faltam aceitar, e onde. */
export function bloqueioDosAnexos(faltando: { titulo: string; versao: number }[]): string {
  const lista = faltando.map((a) => `"${a.titulo}" (versão ${a.versao})`).join(", ");
  return faltando.length === 1
    ? `Aceite o anexo do contrato ${lista} em Configurações → Organização e perfil: esta rifa usa a modalidade dele.`
    : `Aceite os anexos do contrato ${lista} em Configurações → Organização e perfil: esta rifa usa as modalidades deles.`;
}
