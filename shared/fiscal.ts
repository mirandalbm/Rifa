/**
 * Cadastro fiscal do afiliado e recibo de pagamento. Puro, sem banco: o
 * servidor valida com isto e a tela mostra o erro antes de enviar.
 *
 * O cadastro existe para a comissão ser paga a uma pessoa identificada, na
 * conta dela, com recibo. Os dados e os documentos ficam **criptografados** no
 * banco (`server/services/cofre.ts`), só a plataforma abre, e cada abertura
 * vai para a auditoria antes de o dado sair. O organizador nunca vê.
 */
import { cnpjValido, cpfValido } from "./format";
import { validarEndereco, type Endereco } from "./endereco";

export const STATUS_FISCAL = {
  incompleto: "Incompleto",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
} as const;
export type StatusFiscal = keyof typeof STATUS_FISCAL;

export const DOCUMENTOS = {
  identidade_frente: "Documento com foto (frente)",
  identidade_verso: "Documento com foto (verso)",
  comprovante_residencia: "Comprovante de residência",
  comprovante_cnpj: "Comprovante do CNPJ (CCMEI ou cartão CNPJ)",
} as const;
export type TipoDeDocumento = keyof typeof DOCUMENTOS;

export const DOCUMENTO_MAX_BYTES = 6 * 1024 * 1024;
export const MIMES_DE_DOCUMENTO = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export interface ContaBancaria {
  banco: string;
  agencia: string;
  conta: string;
  tipo: "corrente" | "poupanca";
}

/**
 * O saque só sai para MEI ou empresa (decisão do produto sobre a resposta
 * 6.4 do advogado, 06/10/2026): pagar comissão a pessoa física obrigaria a
 * fonte pagadora a emitir RPA, reter IRRF e INSS e recolher o INSS patronal.
 * Com CNPJ, o afiliado emite a nota fiscal de cada saque e ninguém retém
 * nada. A pessoa (nome, CPF, documentos) segue no cadastro: é o titular, e o
 * CPF continua sendo a chave de "um cadastro por pessoa".
 */
export const TIPOS_DE_EMPRESA = { mei: "MEI", empresa: "Empresa (ME, EPP ou outra)" } as const;
export type TipoDeEmpresa = keyof typeof TIPOS_DE_EMPRESA;

export interface EmpresaDoAfiliado {
  tipo: TipoDeEmpresa;
  cnpj: string;
  razaoSocial: string;
}

export interface DadosFiscais {
  nomeCompleto: string;
  cpf: string;
  rg: string;
  nascimento: string;
  endereco: Endereco;
  conta: ContaBancaria;
  /** Nulo só no cadastro de antes da regra: ele não saca até completar. */
  empresa?: EmpresaDoAfiliado | null;
}

/**
 * O serviço que o afiliado descreve na nota do saque (contador, 07/10/2026):
 * promoção de vendas, CNAE 7319-0/02. MEI e Simples Nacional não sofrem
 * retenção na fonte, e o saque sai pelo valor cheio.
 */
export const DESCRICAO_DA_NOTA_DO_AFILIADO = "Serviços de promoção de vendas (divulgação e publicidade online)";

export const MENSAGEM_SAQUE_SO_COM_CNPJ =
  "O saque é pago a MEI ou empresa: cadastre o CNPJ em Meus dados e aguarde a aprovação. Cada saque vai com a nota fiscal do valor.";

/** CNPJ do MEI ou da empresa, conferido pelo dígito. Só chaves conhecidas. */
export function validarEmpresa(bruto: unknown): EmpresaDoAfiliado {
  const e = (bruto ?? {}) as Record<string, unknown>;
  const tipo = e.tipo === "mei" || e.tipo === "empresa" ? e.tipo : null;
  if (!tipo) throw new Error("Diga se é MEI ou empresa: o saque só é pago a CNPJ.");
  const cnpj = String(e.cnpj ?? "").replace(/\D/g, "");
  if (!cnpjValido(cnpj)) throw new Error("CNPJ inválido.");
  const razaoSocial = limpo(e.razaoSocial);
  if (razaoSocial.length < 3 || razaoSocial.length > 150) throw new Error("Informe a razão social, como no comprovante do CNPJ.");
  return { tipo, cnpj, razaoSocial };
}

const limpo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Maior de idade na data de hoje (rifa é proibida para menores). */
export function maiorDeIdade(nascimento: string, hoje = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento);
  if (!m) return false;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const n = new Date(Date.UTC(a, mes - 1, dia));
  if (n.getUTCMonth() !== mes - 1 || n.getUTCDate() !== dia) return false;
  let idade = hoje.getUTCFullYear() - a;
  if (hoje.getUTCMonth() + 1 < mes || (hoje.getUTCMonth() + 1 === mes && hoje.getUTCDate() < dia)) idade--;
  return idade >= 18 && idade < 120;
}

/** Banco (3 dígitos), agência, conta com dígito e o tipo. Usado também na verificação do perfil. */
export function validarContaBancaria(bruto: unknown): ContaBancaria {
  const c = (bruto ?? {}) as Record<string, unknown>;
  const banco = String(c.banco ?? "").replace(/\D/g, "");
  const agencia = String(c.agencia ?? "").replace(/\D/g, "");
  const conta = String(c.conta ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!/^\d{3}$/.test(banco)) throw new Error("Código do banco com 3 dígitos (ex.: 001, 237, 260).");
  if (!/^\d{3,5}$/.test(agencia)) throw new Error("Agência inválida.");
  if (!/^\d{3,13}[0-9X]$/.test(conta)) throw new Error("Conta inválida (com o dígito).");
  const tipo = c.tipo === "poupanca" ? "poupanca" : c.tipo === "corrente" ? "corrente" : null;
  if (!tipo) throw new Error("Escolha conta corrente ou poupança.");
  return { banco, agencia, conta, tipo };
}

/** Confere e normaliza. Só chaves conhecidas saem daqui. */
export function validarCadastroFiscal(bruto: unknown): DadosFiscais {
  const b = (bruto ?? {}) as Record<string, any>;
  const nomeCompleto = limpo(b.nomeCompleto);
  if (nomeCompleto.split(" ").length < 2 || nomeCompleto.length < 5) throw new Error("Informe o nome completo, como no documento.");
  if (nomeCompleto.length > 120) throw new Error("Nome longo demais.");
  const cpf = String(b.cpf ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) throw new Error("CPF inválido.");
  const rg = limpo(b.rg).toUpperCase();
  if (!/^[0-9A-Z.\-/ ]{5,20}$/.test(rg)) throw new Error("RG inválido.");
  const nascimento = String(b.nascimento ?? "");
  if (!maiorDeIdade(nascimento)) throw new Error("Data de nascimento inválida (é preciso ter 18 anos ou mais).");

  let endereco: Endereco;
  try {
    endereco = validarEndereco(b.endereco ?? {});
  } catch (e) {
    throw new Error((e as Error).message);
  }

  const conta = validarContaBancaria(b.conta);
  const empresa = validarEmpresa(b.empresa);
  return { nomeCompleto, cpf, rg, nascimento, endereco, conta, empresa };
}

/** O cadastro está completo para ir à análise? Dados (com o CNPJ) e os documentos. */
export function faltaNoCadastro(temDados: boolean, documentos: string[], temEmpresa = true): string[] {
  const falta: string[] = [];
  if (!temDados) falta.push("seus dados");
  else if (!temEmpresa) falta.push("o CNPJ do seu MEI ou da sua empresa");
  for (const [tipo, nome] of Object.entries(DOCUMENTOS)) {
    if (!documentos.includes(tipo)) falta.push(nome.charAt(0).toLowerCase() + nome.slice(1));
  }
  return falta;
}

/* ------------------------------------------------------------------ *
 * Recibo
 * ------------------------------------------------------------------ */

export interface ReciboSnapshot {
  codigo: string;
  emitidoEm: string;
  pagador: { nome: string; cnpj: string | null };
  /** Com CNPJ (a regra de hoje), o nome é a razão social e o `cnpj` vem junto. */
  beneficiario: { nome: string; cpf: string | null; cnpj?: string; codigoAfiliado: string };
  valorCents: number;
  pagamento: { forma: "pix" | "transferencia"; destino: string };
  origem: { rifa: string; pedidos: number; comissaoCents: number }[];
}

/**
 * O texto canônico do recibo: chaves em ordem fixa, sem espaço. É ele que
 * vai no hash e na assinatura — mudar um centavo ou uma letra muda os dois.
 */
export function canonico(r: ReciboSnapshot): string {
  const ordenar = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordenar)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(ordenar(r));
}

/** A soma da origem bate com o valor — recibo que não fecha não sai. */
export function reciboFecha(r: ReciboSnapshot): boolean {
  return r.origem.reduce((s, o) => s + o.comissaoCents, 0) === r.valorCents;
}

/** Código do recibo: sorteado, sem caractere ambíguo (como o ID do cliente). */
export const ALFABETO_RECIBO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function codigoDeRecibo(aleatorio: (n: number) => number): string {
  let s = "R-";
  for (let i = 0; i < 10; i++) s += ALFABETO_RECIBO[aleatorio(ALFABETO_RECIBO.length)];
  return s;
}

/* ------------------------------------------------------------------ *
 * Nota fiscal do saque
 * ------------------------------------------------------------------ */

/** A nota fiscal que o afiliado anexa a cada saque: PDF, XML da NF-e/NFS-e ou foto. */
export const NOTA_FISCAL_MAX_BYTES = 3 * 1024 * 1024;

/** O tipo pelo conteúdo, não pelo que o navegador disse. Puro, para o servidor e o teste. */
export function mimeDaNotaFiscal(b: Uint8Array): string | null {
  const ini = (n: number) => String.fromCharCode(...b.subarray(0, n));
  if (ini(4) === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ini(4).slice(1) === "PNG") return "image/png";
  // XML da nota: começa no "<" (com ou sem o BOM do UTF-8), e é uma nota.
  const texto = String.fromCharCode(...b.subarray(0, 2048)).replace(/^\uFEFF|^\xEF\xBB\xBF/, "").trimStart();
  if (texto.startsWith("<") && /<(\w+:)?(NFe|nfeProc|CompNfse|Nfse|NFSe|nfse|DPS|ConsultarNfse)/i.test(texto)) return "application/xml";
  return null;
}
