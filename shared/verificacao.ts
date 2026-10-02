/**
 * Perfil verificado — apostador, afiliado e organização. Puro, sem banco: o
 * servidor valida com isto e a tela mostra o mesmo.
 *
 * A verificação **destaca, não barra**: quem não é verificado continua
 * comprando, divulgando e fazendo rifa. O selo (um trevo com o sinal de
 * confirmação) diz que a plataforma conferiu os documentos — e, para
 * pessoa, que a foto do perfil é de quem está no documento.
 *
 * Os dados e os documentos vão cifrados para o cofre (`server/services/
 * cofre.ts`), como o cadastro fiscal. Só a plataforma analisa; a
 * organização verifica a si mesma, nunca os outros.
 */
import { cnpjValido, cpfValido } from "./format";
import { maiorDeIdade, validarContaBancaria, type ContaBancaria } from "./fiscal";

export const SUJEITOS = ["apostador", "afiliado", "organizacao"] as const;
export type Sujeito = (typeof SUJEITOS)[number];

export const NOME_SUJEITO: Record<Sujeito, string> = {
  apostador: "Apostador",
  afiliado: "Afiliado",
  organizacao: "Organização",
};

/** Pessoa compara a foto do perfil com a do documento; organização não (a foto dela é a marca). */
export const comparaFoto = (s: Sujeito) => s !== "organizacao";

export const STATUS_VERIFICACAO = {
  incompleto: "Incompleta",
  em_analise: "Documentos em análise",
  foto_em_analise: "Foto em análise",
  foto_divergente: "Foto não confere",
  verificado: "Verificado",
  recusado: "Recusada",
} as const;
export type StatusVerificacao = keyof typeof STATUS_VERIFICACAO;

/** Cor da `<Pill>` (que sempre traz o rótulo em texto). */
export const PILL_VERIFICACAO: Record<StatusVerificacao, string> = {
  incompleto: "draft",
  em_analise: "pending",
  foto_em_analise: "pending",
  foto_divergente: "expired",
  verificado: "paid",
  recusado: "expired",
};

/* ------------------------------------------------------------------ *
 * Documentos
 * ------------------------------------------------------------------ */

export const DOCUMENTOS_VERIFICACAO = {
  identidade_frente: "RG ou CNH — frente (com a foto)",
  identidade_verso: "RG ou CNH — verso",
  cpf: "CPF (se não aparece no documento com foto)",
  cartao_cnpj: "Cartão CNPJ",
  comprovante_endereco: "Comprovante de endereço (residência ou empresa)",
} as const;
export type DocumentoVerificacao = keyof typeof DOCUMENTOS_VERIFICACAO;

/** Os documentos que cada um envia; os de `OPCIONAIS` não travam o envio. */
export const DOCUMENTOS_DO_SUJEITO: Record<Sujeito, DocumentoVerificacao[]> = {
  apostador: ["identidade_frente", "identidade_verso", "cpf"],
  afiliado: ["identidade_frente", "identidade_verso", "cpf"],
  organizacao: ["identidade_frente", "identidade_verso", "cpf", "cartao_cnpj", "comprovante_endereco"],
};
export const DOCUMENTOS_OPCIONAIS: DocumentoVerificacao[] = ["cpf"];

export const DOCUMENTO_VERIFICACAO_MAX_BYTES = 6 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Pix
 * ------------------------------------------------------------------ */

export const TIPOS_DE_PIX = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Chave aleatória",
} as const;
export type TipoDePix = keyof typeof TIPOS_DE_PIX;
export interface ChavePix {
  tipo: TipoDePix;
  chave: string;
}

/** Normaliza a chave pelo tipo; recusa a que não tem o formato. */
export function validarPix(bruto: unknown): ChavePix {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const tipo = String(b.tipo ?? "") as TipoDePix;
  if (!(tipo in TIPOS_DE_PIX)) throw new Error("Escolha o tipo da chave Pix.");
  const v = String(b.chave ?? "").trim();
  if (tipo === "cpf") {
    const d = v.replace(/\D/g, "");
    if (!cpfValido(d)) throw new Error("A chave Pix (CPF) não é um CPF válido.");
    return { tipo, chave: d };
  }
  if (tipo === "cnpj") {
    const d = v.replace(/\D/g, "");
    if (!cnpjValido(d)) throw new Error("A chave Pix (CNPJ) não é um CNPJ válido.");
    return { tipo, chave: d };
  }
  if (tipo === "email") {
    const e = v.toLowerCase();
    if (e.length > 77 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error("A chave Pix (e-mail) não é um e-mail válido.");
    return { tipo, chave: e };
  }
  if (tipo === "telefone") {
    let d = v.replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
    if (!/^[1-9]{2}9\d{8}$/.test(d)) throw new Error("A chave Pix (celular) precisa ter DDD e 9 dígitos.");
    return { tipo, chave: `+55${d}` };
  }
  const a = v.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a)) {
    throw new Error("A chave aleatória tem 32 letras e números, com os tracinhos.");
  }
  return { tipo, chave: a };
}

/* ------------------------------------------------------------------ *
 * Dados
 * ------------------------------------------------------------------ */

export interface Identificacao {
  nomeCompleto: string;
  cpf: string;
  rg: string;
  nascimento: string;
}

export interface DadosPessoa extends Identificacao {
  conta: ContaBancaria;
  pix: ChavePix;
}

export interface DadosOrganizacao {
  razaoSocial: string;
  cnpj: string;
  /** O dono (ou sócio responsável): quem responde pela rifa. */
  responsavel: Identificacao;
  conta: ContaBancaria;
  pix: ChavePix;
}

export type DadosVerificacao = DadosPessoa | DadosOrganizacao;

const limpo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

function validarIdentificacao(b: Record<string, unknown>): Identificacao {
  const nomeCompleto = limpo(b.nomeCompleto);
  if (nomeCompleto.split(" ").length < 2 || nomeCompleto.length < 5) throw new Error("Informe o nome completo, como no documento.");
  if (nomeCompleto.length > 120) throw new Error("Nome longo demais.");
  const cpf = String(b.cpf ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) throw new Error("CPF inválido.");
  const rg = limpo(b.rg).toUpperCase();
  if (!/^[0-9A-Z.\-/ ]{5,20}$/.test(rg)) throw new Error("RG inválido.");
  const nascimento = String(b.nascimento ?? "");
  if (!maiorDeIdade(nascimento)) throw new Error("Data de nascimento inválida (é preciso ter 18 anos ou mais).");
  return { nomeCompleto, cpf, rg, nascimento };
}

/** Confere e normaliza. Só chaves conhecidas saem daqui (isto vem do corpo da requisição). */
export function validarDadosDaVerificacao(sujeito: Sujeito, bruto: unknown): DadosVerificacao {
  const b = (bruto ?? {}) as Record<string, unknown>;
  if (sujeito !== "organizacao") {
    return { ...validarIdentificacao(b), conta: validarContaBancaria(b.conta), pix: validarPix(b.pix) };
  }
  const razaoSocial = limpo(b.razaoSocial);
  if (razaoSocial.length < 3 || razaoSocial.length > 150) throw new Error("Informe a razão social, como no cartão CNPJ.");
  const cnpj = String(b.cnpj ?? "").replace(/\D/g, "");
  if (!cnpjValido(cnpj)) throw new Error("CNPJ inválido.");
  return {
    razaoSocial,
    cnpj,
    responsavel: validarIdentificacao((b.responsavel ?? {}) as Record<string, unknown>),
    conta: validarContaBancaria(b.conta),
    pix: validarPix(b.pix),
  };
}

/** O CPF que identifica a pessoa verificada (o do dono, na organização). */
export const cpfDaVerificacao = (d: DadosVerificacao) => ("responsavel" in d ? d.responsavel.cpf : d.cpf);

/** O que falta para ir à análise: dados, documentos obrigatórios e — pessoa — a foto do perfil. */
export function faltaNaVerificacao(
  sujeito: Sujeito,
  e: { temDados: boolean; documentos: string[]; temFoto: boolean; temConsentimento?: boolean },
): string[] {
  const falta: string[] = [];
  if (!e.temDados) falta.push("seus dados");
  for (const tipo of DOCUMENTOS_DO_SUJEITO[sujeito]) {
    if (DOCUMENTOS_OPCIONAIS.includes(tipo)) continue;
    if (!e.documentos.includes(tipo)) falta.push(DOCUMENTOS_VERIFICACAO[tipo].toLowerCase());
  }
  if (comparaFoto(sujeito) && !e.temFoto) falta.push("uma foto sua no perfil (é ela que comparamos com o documento)");
  if (comparaFoto(sujeito) && e.temConsentimento === false) {
    falta.push("a sua autorização para comparar a foto do perfil com a do documento");
  }
  return falta;
}

/* ------------------------------------------------------------------ *
 * Consentimento biométrico (LGPD, arts. 8º, 9º e 11, I)
 * ------------------------------------------------------------------ */

/**
 * Sobe quando o texto muda. O consentimento gravado guarda a versão e a
 * impressão (SHA-256) do texto exato que a pessoa viu: é a prova que a lei
 * pede de quem trata o dado (art. 8º, § 2º).
 */
export const CONSENTIMENTO_BIOMETRICO_VERSAO = 1;

/**
 * O texto que a pessoa lê e autoriza, destacado do resto da tela: para quê,
 * o quê, quem compara, por quanto tempo, que é opcional e como revogar. Muda
 * com o comparador automático (`automatico`): se ele está ligado, a pessoa
 * precisa saber que um serviço de fora processa a imagem.
 */
export function textoDoConsentimentoBiometrico(o: { automatico: boolean }): string[] {
  return [
    "Autorizo a plataforma a comparar a foto do meu perfil com a foto do meu documento de identidade, só para confirmar que o perfil é meu e dar o selo de perfil verificado. A comparação usa dado biométrico (LGPD, art. 11).",
    o.automatico
      ? "A comparação é feita por um serviço de reconhecimento facial (Amazon Rekognition), que recebe as duas imagens, devolve só o grau de semelhança e não as guarda; abaixo do limite, uma pessoa da plataforma compara."
      : "A comparação é feita por uma pessoa da plataforma, olhando as duas imagens lado a lado.",
    "As imagens ficam cifradas e só a plataforma as abre, com registro de cada acesso. Guardamos o resultado (verificado ou não, e o grau de semelhança) enquanto a verificação existir.",
    "A verificação é opcional: sem ela eu compro e comento normalmente.",
    "Posso revogar esta autorização a qualquer momento nesta mesma tela. Ao revogar, o selo sai e a foto deixa de ser comparada; ao excluir a conta, a verificação é apagada.",
  ];
}

/** A chave do texto mostrado: a versão e o modo. A tela devolve a mesma chave ao autorizar. */
export function chaveDoConsentimento(o: { automatico: boolean }): string {
  return `${CONSENTIMENTO_BIOMETRICO_VERSAO}:${o.automatico ? "automatico" : "manual"}`;
}

/* ------------------------------------------------------------------ *
 * A foto
 * ------------------------------------------------------------------ */

/**
 * Semelhança (0 a 100) a partir da qual o comparador automático verifica
 * sozinho. Abaixo disso não recusa: a foto vai para a análise de uma
 * pessoa, que compara lado a lado — o comparador só adianta o caso claro.
 */
export const LIMIAR_ROSTO = 90;

export function decisaoDoRosto(similaridade: number | null): "verificado" | "manual" {
  return similaridade !== null && similaridade >= LIMIAR_ROSTO ? "verificado" : "manual";
}

/* ------------------------------------------------------------------ *
 * O selo
 * ------------------------------------------------------------------ */

/**
 * As 12 cores que o administrador geral pode dar ao selo. Todas têm
 * contraste ≥ 3:1 com o fundo dos **dois** temas e com o sinal branco
 * dentro do trevo (`tests/verificacao.test.ts` confere). O vermelho
 * fica de fora: é o erro na paleta da plataforma.
 */
export const PALETA_DO_SELO = {
  verde: { nome: "Verde", hex: "#16a34a" },
  roxo: { nome: "Roxo", hex: "#9333ea" },
  azul: { nome: "Azul", hex: "#2563eb" },
  ceu: { nome: "Azul-céu", hex: "#0284c7" },
  ciano: { nome: "Ciano", hex: "#0891b2" },
  turquesa: { nome: "Turquesa", hex: "#0d9488" },
  laranja: { nome: "Laranja", hex: "#ea580c" },
  rosa: { nome: "Rosa", hex: "#db2777" },
  magenta: { nome: "Magenta", hex: "#c026d3" },
  indigo: { nome: "Índigo", hex: "#6366f1" },
  violeta: { nome: "Violeta", hex: "#8b5cf6" },
  grafite: { nome: "Grafite", hex: "#64748b" },
} as const;
export type CorDoSelo = keyof typeof PALETA_DO_SELO;
export type CoresDoSelo = Record<Sujeito, CorDoSelo>;

export const CORES_DO_SELO_PADRAO: CoresDoSelo = { apostador: "verde", afiliado: "roxo", organizacao: "azul" };

/**
 * Uma cor da paleta para cada um, e **três cores diferentes**: o selo diz
 * de quem é pela cor — com duas iguais, afiliado e organização se
 * confundiriam. (O rótulo em texto vem junto, para quem não distingue cor.)
 */
export function validarCoresDoSelo(bruto: unknown): CoresDoSelo {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const cores = {} as CoresDoSelo;
  for (const s of SUJEITOS) {
    const c = String(b[s] ?? CORES_DO_SELO_PADRAO[s]);
    if (!(c in PALETA_DO_SELO)) throw new Error("Cor do selo fora da paleta.");
    cores[s] = c as CorDoSelo;
  }
  if (new Set(Object.values(cores)).size !== SUJEITOS.length) {
    throw new Error("Use uma cor diferente para apostador, afiliado e organização — é a cor que diz de quem é o selo.");
  }
  return cores;
}

/** O rótulo que acompanha o selo (texto alternativo e dica): estado nunca só por cor. */
export const ROTULO_DO_SELO: Record<Sujeito, string> = {
  apostador: "Apostador verificado",
  afiliado: "Afiliado verificado",
  organizacao: "Organização verificada",
};

/** O que a pessoa ganha ao se verificar — a tela usa para incentivar. */
export const VANTAGENS_DA_VERIFICACAO: Record<Sujeito, string[]> = {
  apostador: [
    "O selo de trevo ao lado do seu nome, nos comentários e no seu perfil.",
    "Comentar com emojis — só perfis verificados podem.",
    "Mais confiança de quem lê o que você escreve.",
  ],
  afiliado: [
    "O selo de trevo ao lado do seu nome, para as organizações verem.",
    "Mais confiança na hora de pedir vínculo com uma organização.",
    "Comentar com emojis, quando comentar como apostador verificado.",
  ],
  organizacao: [
    "O selo de trevo ao lado do nome da organização, no perfil, na vitrine e em cada rifa.",
    "Diferencia a organização que mostrou CNPJ, dono e conta de quem só abriu um perfil.",
    "Comentar com emojis nas suas rifas.",
  ],
};
