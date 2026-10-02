/**
 * Ações do assistente de IA no sistema — regras puras, lidas pelo servidor
 * (que executa) e pela tela (o cartão de confirmação e a lista que a
 * plataforma cadastra no Chatbase).
 *
 * Como funciona (as "client actions" da API v2 do Chatbase): a resposta do
 * agente traz partes `tool-call` com o nome da ação e a entrada; o nosso
 * servidor confere, executa no recorte da sessão e devolve o resultado
 * (`tool-result`); o agente continua a conversa com ele.
 *
 * - **A entrada vem da IA, e a IA lê o que qualquer um escreve**: é tratada
 *   como corpo de requisição — só as chaves conhecidas, com formato
 *   (`validarEntrada`). O recorte é sempre o da sessão de quem conversa.
 * - **Ler é na hora; gravar só com confirmação.** Toda ação que grava
 *   (publicar, legenda, excluir, estorno) vira um pedido pendente que a pessoa
 *   confirma na coluna; o resumo que ela lê é montado pelo servidor com os
 *   dados de verdade, nunca o texto da IA.
 * - **Nada de dado pessoal no resultado**: telefone, CPF, e-mail e nome de
 *   comprador nunca saem para o Chatbase. O resultado é montado sem eles e
 *   ainda passa pela mesma barreira da mensagem (`resultadoSemDadoPessoal`).
 */
import { normalizarParaChecar, problemaNaMensagemDaIA } from "./ia";

export type QuemUsa = "plataforma" | "organizacao" | "afiliado";

export interface ParametroDaAcao {
  nome: string;
  tipo: "string" | "number";
  descricao: string;
  obrigatorio: boolean;
}

export interface AcaoDaIA {
  nome: NomeDaAcao;
  /** O que a IA lê para decidir quando usar (vai na configuração do Chatbase). */
  descricao: string;
  parametros: ParametroDaAcao[];
  quem: readonly QuemUsa[];
  /** Grava alguma coisa: só com a confirmação da pessoa, e entra em `audit_log`. */
  grava: boolean;
}

export const NOMES_DAS_ACOES = [
  "listar_rifas",
  "resumo_de_vendas",
  "consultar_pedido",
  "pendencias",
  "minhas_comissoes",
  "publicar_rifa",
  "atualizar_legenda",
  "excluir_rifa",
  "estornar_chamado",
] as const;
export type NomeDaAcao = (typeof NOMES_DAS_ACOES)[number];

const RIFA: ParametroDaAcao = {
  nome: "rifa",
  tipo: "string",
  descricao: "O endereço (slug) da rifa, como aparece em listar_rifas.",
  obrigatorio: true,
};

const PAINEL: readonly QuemUsa[] = ["plataforma", "organizacao"];

export const ACOES_DA_IA: readonly AcaoDaIA[] = [
  {
    nome: "listar_rifas",
    descricao:
      "Lista as rifas do painel (até 20, as mais novas primeiro): título, endereço (slug), situação, cotas vendidas, total e data do sorteio.",
    parametros: [
      {
        nome: "situacao",
        tipo: "string",
        descricao: "Opcional: rascunho, no_ar, encerrada ou sorteada.",
        obrigatorio: false,
      },
    ],
    quem: PAINEL,
    grava: false,
  },
  {
    nome: "resumo_de_vendas",
    descricao:
      "Receita paga, pedidos pagos, cotas vendidas e estornos dos últimos N dias (fuso de São Paulo).",
    parametros: [
      {
        nome: "dias",
        tipo: "number",
        descricao: "Quantos dias para trás, de 1 a 90 (padrão 30).",
        obrigatorio: false,
      },
    ],
    quem: PAINEL,
    grava: false,
  },
  {
    nome: "consultar_pedido",
    descricao:
      "A situação de um pedido pelo código de 8 dígitos: rifa, quantidade, valor, canal e datas. Nunca traz nome nem telefone do comprador.",
    parametros: [
      {
        nome: "codigo",
        tipo: "string",
        descricao: "O código do pedido, 8 dígitos.",
        obrigatorio: true,
      },
    ],
    quem: PAINEL,
    grava: false,
  },
  {
    nome: "pendencias",
    descricao:
      "O que espera ação no painel: chamados de reembolso abertos, reembolsos aprovados esperando o estorno, rascunhos e Pix aguardando pagamento.",
    parametros: [],
    quem: PAINEL,
    grava: false,
  },
  {
    nome: "minhas_comissoes",
    descricao:
      "O saldo de comissão do afiliado (aguardando, disponível, paga) e as vendas pelo link dele.",
    parametros: [],
    quem: ["afiliado"],
    grava: false,
  },
  {
    nome: "publicar_rifa",
    descricao:
      "Publica uma rifa em rascunho. Pede a confirmação da pessoa. Se faltar algo (banner, autorização SPA/MF, data do sorteio), devolve o que falta.",
    parametros: [RIFA],
    quem: PAINEL,
    grava: true,
  },
  {
    nome: "atualizar_legenda",
    descricao:
      "Troca a legenda da publicação de uma rifa (o texto embaixo das fotos). Sem link e sem telefone. Pede a confirmação da pessoa.",
    parametros: [
      RIFA,
      {
        nome: "legenda",
        tipo: "string",
        descricao: "O texto novo da legenda (vazio apaga).",
        obrigatorio: true,
      },
    ],
    quem: PAINEL,
    grava: true,
  },
  {
    nome: "excluir_rifa",
    descricao:
      "Apaga de vez uma rifa em rascunho, de teste ou no ar sem nenhuma venda. Pede a confirmação da pessoa.",
    parametros: [RIFA],
    quem: PAINEL,
    grava: true,
  },
  {
    nome: "estornar_chamado",
    descricao:
      "Faz o estorno de um reembolso já aprovado, pelo protocolo do chamado. O dinheiro volta a quem pagou. Pede a confirmação da pessoa.",
    parametros: [
      {
        nome: "protocolo",
        tipo: "string",
        descricao: "O protocolo do chamado (como aparece em Atendimento).",
        obrigatorio: true,
      },
    ],
    quem: PAINEL,
    grava: true,
  },
];

/** O nome da ação na tela (cartão de confirmação e lista em Aparência). */
export const ROTULO_DA_ACAO: Record<NomeDaAcao, string> = {
  listar_rifas: "Listar as rifas",
  resumo_de_vendas: "Resumo de vendas",
  consultar_pedido: "Consultar um pedido",
  pendencias: "Pendências do painel",
  minhas_comissoes: "Minhas comissões",
  publicar_rifa: "Publicar a rifa",
  atualizar_legenda: "Trocar a legenda",
  excluir_rifa: "Apagar a rifa",
  estornar_chamado: "Estornar o reembolso",
};

export function acaoPeloNome(nome: unknown): AcaoDaIA | null {
  return ACOES_DA_IA.find((a) => a.nome === nome) ?? null;
}

/** As ações que este tipo de titular pode usar. */
export function acoesDe(quem: QuemUsa): AcaoDaIA[] {
  return ACOES_DA_IA.filter((a) => a.quem.includes(quem));
}

/** Uma ação pendente vence: confirmar depois disso pede de novo à IA. */
export const ACAO_PENDENTE_MIN = 10;

/** A entrada que a IA manda, em caracteres de JSON: acima disso não é guardada nem conferida. */
export const ENTRADA_DA_ACAO_MAX = 4096;

/** Rodadas de ação numa mesma mensagem: cada uma é outra chamada (paga) ao Chatbase. */
export const RODADAS_DE_ACAO_MAX = 3;

export const SITUACOES_DA_RIFA = {
  rascunho: "draft",
  no_ar: "published",
  encerrada: "closed",
  sorteada: "drawn",
} as const;
export type SituacaoDaRifa = keyof typeof SITUACOES_DA_RIFA;

export const NOME_DA_SITUACAO: Record<string, SituacaoDaRifa> = {
  draft: "rascunho",
  published: "no_ar",
  closed: "encerrada",
  drawn: "sorteada",
};

export const LEGENDA_IA_MAX = 2200;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** O protocolo do chamado de reembolso (`gerarProtocolo()` em `shared/chamados.ts`). */
const PROTOCOLO_RE = /^RB-\d{8}-\d{6}$/;

export type EntradaDaAcao =
  | { nome: "listar_rifas"; situacao: SituacaoDaRifa | null }
  | { nome: "resumo_de_vendas"; dias: number }
  | { nome: "consultar_pedido"; codigo: number }
  | { nome: "pendencias" }
  | { nome: "minhas_comissoes" }
  | { nome: "publicar_rifa"; rifa: string }
  | { nome: "atualizar_legenda"; rifa: string; legenda: string }
  | { nome: "excluir_rifa"; rifa: string }
  | { nome: "estornar_chamado"; protocolo: string };

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function slugDe(v: unknown): string | null {
  const s = texto(v).toLowerCase().replace(/^\/+|\/+$/g, "");
  // A IA às vezes manda o caminho inteiro (/r/minha-rifa): fica só o fim.
  const fim = s.split("/").pop() ?? "";
  return SLUG_RE.test(fim) ? fim : null;
}

/**
 * Confere a entrada que a IA mandou, como se fosse o corpo de uma requisição:
 * só as chaves conhecidas, no formato certo. O que não confere volta como erro
 * para a própria IA (ela pode pedir de novo à pessoa).
 */
export function validarEntrada(nome: NomeDaAcao, entrada: unknown): Resultado<EntradaDaAcao> {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  switch (nome) {
    case "listar_rifas": {
      const s = texto(e.situacao);
      if (!s) return { ok: true, valor: { nome, situacao: null } };
      if (!(s in SITUACOES_DA_RIFA)) return falha("Situação desconhecida: use rascunho, no_ar, encerrada ou sorteada.");
      return { ok: true, valor: { nome, situacao: s as SituacaoDaRifa } };
    }
    case "resumo_de_vendas": {
      const d = e.dias === undefined || e.dias === null || e.dias === "" ? 30 : Number(e.dias);
      if (!Number.isInteger(d) || d < 1 || d > 90) return falha("Os dias vão de 1 a 90.");
      return { ok: true, valor: { nome, dias: d } };
    }
    case "consultar_pedido": {
      const c = texto(String(e.codigo ?? "")).replace(/\D/g, "");
      if (!/^\d{8}$/.test(c)) return falha("O código do pedido tem 8 dígitos.");
      return { ok: true, valor: { nome, codigo: Number(c) } };
    }
    case "pendencias":
    case "minhas_comissoes":
      return { ok: true, valor: { nome } };
    case "publicar_rifa":
    case "excluir_rifa": {
      const rifa = slugDe(e.rifa);
      if (!rifa) return falha("Informe o endereço (slug) da rifa, como aparece em listar_rifas.");
      return { ok: true, valor: { nome, rifa } };
    }
    case "atualizar_legenda": {
      const rifa = slugDe(e.rifa);
      if (!rifa) return falha("Informe o endereço (slug) da rifa, como aparece em listar_rifas.");
      if (typeof e.legenda !== "string") return falha("Informe o texto da legenda.");
      const legenda = e.legenda.trim();
      if (legenda.length > LEGENDA_IA_MAX) return falha(`A legenda passa de ${LEGENDA_IA_MAX} caracteres.`);
      return { ok: true, valor: { nome, rifa, legenda } };
    }
    case "estornar_chamado": {
      const p = texto(e.protocolo).toUpperCase();
      if (!PROTOCOLO_RE.test(p)) return falha("Informe o protocolo do chamado, como aparece em Atendimento.");
      return { ok: true, valor: { nome, protocolo: p } };
    }
  }
}

/**
 * O resultado que vai ao Chatbase não pode levar dado pessoal: cada texto do
 * resultado passa pela mesma barreira da mensagem (e-mail, CPF, telefone,
 * dígitos demais). É a segunda linha de defesa — a primeira é montar o
 * resultado sem esses campos. Número (dinheiro em centavos, contagem) não é
 * texto livre e não passa por ela; data sai em ISO, tirada antes de conferir.
 */
export function resultadoSemDadoPessoal(saida: unknown): boolean {
  const textos: string[] = [];
  const andar = (v: unknown, fundo: number) => {
    if (fundo > 6) return;
    if (typeof v === "string") textos.push(v);
    else if (Array.isArray(v)) v.forEach((x) => andar(x, fundo + 1));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => andar(x, fundo + 1));
  };
  andar(saida, 0);
  return textos.every((t) => {
    const semData = t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "data");
    return !semData.trim() || problemaNaMensagemDaIA(normalizarParaChecar(semData)) === null;
  });
}

/** O que a coluna mostra de uma ação que espera confirmação. Sem a entrada crua da IA. */
export interface AcaoPendentePublica {
  id: string;
  nome: NomeDaAcao;
  /** Montado pelo servidor com os dados de verdade (título da rifa, valor). */
  resumo: string;
  venceEm: string;
}

export type SaidaDaAcao = { status: "success"; data: unknown } | { status: "error"; error: string };

/** A chamada de ação que veio na resposta do Chatbase. */
export interface ChamadaDeAcao {
  toolCallId: string;
  nome: string;
  entrada: unknown;
}

/** As partes `tool-call` de uma resposta, lidas com cuidado (formato de terceiro). */
export function chamadasDasPartes(partes: unknown): ChamadaDeAcao[] {
  if (!Array.isArray(partes)) return [];
  const saida: ChamadaDeAcao[] = [];
  for (const p of partes) {
    const o = (p ?? {}) as { type?: unknown; toolCallId?: unknown; toolName?: unknown; input?: unknown };
    if (o.type !== "tool-call" || typeof o.toolCallId !== "string" || typeof o.toolName !== "string") continue;
    if (!o.toolCallId || o.toolCallId.length > 200) continue;
    saida.push({ toolCallId: o.toolCallId, nome: o.toolName, entrada: o.input ?? {} });
  }
  return saida;
}
