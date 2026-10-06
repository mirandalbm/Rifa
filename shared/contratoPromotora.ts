/**
 * Contrato da plataforma com a promotora (termos de uso para organizações).
 *
 * O texto é do advogado e a plataforma cola inteiro. Os campos da empresa
 * (razão social, CNPJ, endereço, e-mail) não são digitados no texto: ficam
 * como marcadores (`{{RAZAO_SOCIAL}}`…) e a plataforma os preenche, na
 * publicação, com os "Dados da empresa" publicados em Aparência
 * (`preencherContrato`). O que as organizações leem, aceitam e o hash prova
 * é o texto já preenchido. Cada publicação é uma versão nova (nunca edita a
 * anterior: o aceite é prova daquele texto), e enquanto houver versão em
 * vigor a organização só publica rifa depois de aceitá-la.
 */
import { formatarCnpj, type DadosDaEmpresa } from "./legal";

export const CONTRATO_MIN = 200;
export const CONTRATO_MAX = 60_000;

export class ContratoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Só a chave `texto`; o resto do corpo é ignorado. */
export function validarContrato(bruto: unknown): { texto: string } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  if (typeof b.texto !== "string") throw new ContratoError("Cole o texto do contrato.");
  // Quebras de linha do Windows viram \n: o mesmo texto não vira duas versões.
  const texto = b.texto.replace(/\r\n?/g, "\n").trim();
  if (texto.length < CONTRATO_MIN) {
    throw new ContratoError(`O contrato precisa ter pelo menos ${CONTRATO_MIN} caracteres.`);
  }
  if (texto.length > CONTRATO_MAX) {
    throw new ContratoError(`O contrato passa de ${CONTRATO_MAX.toLocaleString("pt-BR")} caracteres.`);
  }
  return { texto };
}

/** A versão que a tela leu volta no aceite: número inteiro positivo. */
export function versaoLida(bruto: unknown): number {
  const v = Number(bruto);
  if (!Number.isInteger(v) || v < 1) throw new ContratoError("Informe a versão do contrato que você leu.");
  return v;
}

/** A frase que barra a publicação. */
export function bloqueioDoContrato(versao: number): string {
  return `Aceite o contrato da plataforma (versão ${versao}) em Configurações → Organização e perfil antes de publicar.`;
}

/**
 * Os campos que a plataforma preenche, com o nome que vai na tela. O texto do
 * advogado traz os campos entre colchetes (`[RAZÃO SOCIAL DA PLATAFORMA]`,
 * `[00.000.000/0001-00]`): os que dá para reconhecer viram o campo certo
 * (`apelidos`), e qualquer outro colchete por preencher barra a publicação —
 * nunca vai ao ar um contrato com "[...]" no lugar do nome.
 */
export const CAMPOS_DO_CONTRATO = {
  RAZAO_SOCIAL: { rotulo: "Razão social", valor: (e: DadosDaEmpresa) => e.razaoSocial, apelidos: [/RAZ[ÃA]O\s+SOCIAL/i] },
  CNPJ: { rotulo: "CNPJ", valor: (e: DadosDaEmpresa) => (e.cnpj ? formatarCnpj(e.cnpj) : ""), apelidos: [/CNPJ/i, /^0{2}\.0{3}\.0{3}\/0{3}\d-\d{2}$/] },
  ENDERECO: { rotulo: "Endereço", valor: (e: DadosDaEmpresa) => e.endereco, apelidos: [/ENDERE[ÇC]O/i] },
  EMAIL: { rotulo: "E-mail de contato", valor: (e: DadosDaEmpresa) => e.contato, apelidos: [/E-?MAIL/i] },
} as const;
export type CampoDoContrato = keyof typeof CAMPOS_DO_CONTRATO;
export const NOMES_DOS_CAMPOS = Object.keys(CAMPOS_DO_CONTRATO) as CampoDoContrato[];

export interface ContratoPreenchido {
  /** O texto com os campos trocados — o que vai ao ar. */
  texto: string;
  /** Campos usados no texto que os "Dados da empresa" ainda não têm. */
  faltando: CampoDoContrato[];
  /** Marcadores que não são campo conhecido (`{{OUTRO}}`, `[NOME DO SÓCIO]`). */
  desconhecidos: string[];
}

function campoDoApelido(dentro: string): CampoDoContrato | null {
  const t = dentro.trim();
  for (const nome of NOMES_DOS_CAMPOS) {
    if (CAMPOS_DO_CONTRATO[nome].apelidos.some((re) => re.test(t))) return nome;
  }
  return null;
}

/**
 * Troca os campos pelos dados da empresa. `{{CAMPO}}` é o marcador do
 * sistema; `[...]` é o jeito do advogado. Colchete com letra minúscula é texto
 * comum (ex.: "[sic]") e fica como está; colchete em maiúsculas ou com a
 * máscara do CNPJ é campo — reconhecido, é preenchido; não reconhecido, é
 * `desconhecido` e a publicação recusa.
 */
export function preencherContrato(modelo: string, empresa: DadosDaEmpresa): ContratoPreenchido {
  const faltando = new Set<CampoDoContrato>();
  const desconhecidos = new Set<string>();
  const valorDe = (nome: CampoDoContrato, marcador: string) => {
    const v = CAMPOS_DO_CONTRATO[nome].valor(empresa);
    if (!v) {
      faltando.add(nome);
      return marcador;
    }
    return v;
  };
  let texto = modelo.replace(/\{\{\s*([A-Za-z_]+)\s*\}\}/g, (m, nome: string) => {
    const n = nome.toUpperCase();
    if (n in CAMPOS_DO_CONTRATO) return valorDe(n as CampoDoContrato, m);
    desconhecidos.add(m);
    return m;
  });
  texto = texto.replace(/\[([^\[\]\n]{2,80})\]/g, (m, dentro: string) => {
    const pareceCampo = !/[a-zà-ü]/.test(dentro) || /0{2}\.0{3}\.0{3}/.test(dentro);
    if (!pareceCampo) return m;
    const nome = campoDoApelido(dentro);
    if (nome) return valorDe(nome, m);
    desconhecidos.add(m);
    return m;
  });
  return { texto, faltando: [...faltando], desconhecidos: [...desconhecidos] };
}

/** O que barra publicar a versão: campo sem dado na empresa ou marcador que não é campo. */
export function problemaNoPreenchimento(p: ContratoPreenchido): string | null {
  if (p.desconhecidos.length) {
    return `Há campo que a plataforma não sabe preencher: ${p.desconhecidos.join(", ")}. Use ${NOMES_DOS_CAMPOS.map((n) => `{{${n}}}`).join(", ")}, ou troque o trecho pelo texto definitivo.`;
  }
  if (p.faltando.length) {
    return `Preencha em Aparência → Dados da empresa (e publique o template): ${p.faltando.map((n) => CAMPOS_DO_CONTRATO[n].rotulo).join(", ")}.`;
  }
  return null;
}
