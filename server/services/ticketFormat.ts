/**
 * Formatação do bilhete — funções puras, sem banco.
 *
 * Fica separada da montagem porque é isto que os testes exercitam: o recorte
 * de 32 colunas da bobina, o alinhamento do total e a ausência de acento são
 * regras de impressão, não de dados.
 */
import { formatBRL } from "@shared/format";
import type { OrganizerInfo } from "@shared/schema";

export interface TicketData {
  /** Número do bilhete: é o próprio código do pedido. */
  codigo: number;
  emitidoEm: string;
  administradora: OrganizerInfo;
  apostador: {
    nome: string;
    telefone: string;
    cpf: string | null;
    /** ID do cliente (C-XXXXXXXX): é por ele que o atendimento o encontra. */
    id?: string | null;
  };
  rifa: {
    titulo: string;
    premio: string;
    totalCotas: number;
    precoCota: number;
    autorizacao: string | null;
  };
  sorteio: {
    data: string | null;
    metodo: string;
    /** Compromisso público: o hash publicado antes da primeira venda. */
    seedHash: string | null;
  };
  numeros: string[];
  pagamento: {
    metodo: string;
    situacao: string;
    total: number;
    desconto: number;
    autorizacao: string | null;
  };
  vendedor: { nome: string; codigo: string } | null;
}

export const METODO_LABEL: Record<string, string> = {
  pix_online: "Pix",
  dinheiro: "Dinheiro",
  pix_maquininha: "Pix (maquininha)",
};

export const SITUACAO_LABEL: Record<string, string> = {
  pending: "AGUARDANDO PAGAMENTO",
  paid: "PAGO",
  expired: "EXPIRADO",
  refunded: "ESTORNADO",
};

/**
 * Colunas de cada bobina na fonte padrão: 58 mm dá 32, 80 mm dá 48. O padrão
 * é 58 mm, o tamanho das maquininhas.
 */
export const COLUNAS = { 58: 32, 80: 48 } as const;
export type Papel = keyof typeof COLUNAS;

function linhaDe(largura: number, char = "-"): string {
  return char.repeat(largura);
}

function centroDe(largura: number, texto: string): string {
  const t = texto.slice(0, largura);
  const espaco = Math.max(0, Math.floor((largura - t.length) / 2));
  return " ".repeat(espaco) + t;
}

/** "TOTAL              R$ 24,50" — rótulo à esquerda, valor à direita. */
function parDe(largura: number, rotulo: string, valor: string): string {
  const limpo = valor.replace(/[\u00a0\u202f]/g, " ");
  const espaco = Math.max(1, largura - rotulo.length - limpo.length);
  return rotulo + " ".repeat(espaco) + limpo;
}

function quebrarDe(largura: number, texto: string): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if ((`${atual} ${palavra}`).trim().length > largura) {
      if (atual) linhas.push(atual.trim());
      // Palavra sozinha maior que a bobina: corta, senão estoura a linha.
      atual = palavra.length > largura ? palavra.slice(0, largura) : palavra;
    } else {
      atual = `${atual} ${palavra}`.trim();
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Prepara o texto para a bobina: sem acento, que a tabela padrão não tem, e
 * sem espaço não-quebrável — o `R$ 14,70` do toLocaleString vem com U+00A0,
 * que a térmica imprime como caractere estranho no meio do valor.
 */
function paraBobina(texto: string): string {
  return texto
    .replace(/[  ]/g, " ")
    .replace(/º/g, "o")
    .replace(/ª/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Texto puro do bilhete, pronto para a impressora térmica. `papel` escolhe a
 * largura da bobina (58 ou 80 mm); a linha nunca passa dela.
 */
export function escPosTicket(t: TicketData, papel: Papel = 58): string {
  const L = COLUNAS[papel];
  const linha = (char = "-") => linhaDe(L, char);
  const centro = (texto: string) => centroDe(L, texto);
  const parEsquerdaDireita = (rotulo: string, valor: string) => parDe(L, rotulo, valor);
  const quebrar = (texto: string) => quebrarDe(L, texto);
  const partes: string[] = [];

  partes.push(centro(t.administradora.nome.toUpperCase()));
  if (t.administradora.cnpj) partes.push(centro(`CNPJ ${t.administradora.cnpj}`));
  if (t.administradora.cidade) partes.push(centro(t.administradora.cidade));
  partes.push(linha("="));

  partes.push(centro("BILHETE DE RIFA"));
  partes.push(centro(`No ${t.codigo}`));
  partes.push(linha());

  partes.push(...quebrar(t.rifa.premio.toUpperCase()));
  partes.push(parEsquerdaDireita("Cota", formatBRL(t.rifa.precoCota)));
  partes.push(
    parEsquerdaDireita(
      "Sorteio",
      t.sorteio.data
        ? new Date(t.sorteio.data).toLocaleDateString("pt-BR")
        : "a definir",
    ),
  );
  partes.push(...quebrar(`Metodo: ${t.sorteio.metodo}`));
  partes.push(linha());

  partes.push("APOSTADOR");
  partes.push(...quebrar(t.apostador.nome));
  if (t.apostador.id) partes.push(`ID ${t.apostador.id}`);
  partes.push(t.apostador.telefone);
  if (t.apostador.cpf) partes.push(`CPF ${t.apostador.cpf}`);
  partes.push(linha());

  partes.push(`NUMEROS (${t.numeros.length})`);
  // Os números são o coração do bilhete: quatro por linha, legíveis.
  for (let i = 0; i < t.numeros.length; i += 4) {
    partes.push(t.numeros.slice(i, i + 4).join(" "));
  }
  partes.push(linha());

  partes.push(parEsquerdaDireita("Pagamento", t.pagamento.metodo));
  if (t.pagamento.desconto > 0) {
    partes.push(parEsquerdaDireita("Desconto", `-${formatBRL(t.pagamento.desconto)}`));
  }
  partes.push(parEsquerdaDireita("TOTAL", formatBRL(t.pagamento.total)));
  partes.push(centro(t.pagamento.situacao));
  if (t.pagamento.autorizacao) {
    partes.push(parEsquerdaDireita("Autorizacao", t.pagamento.autorizacao));
  }

  if (t.vendedor) {
    partes.push(linha());
    partes.push(parEsquerdaDireita("Vendedor", t.vendedor.codigo));
    partes.push(...quebrar(t.vendedor.nome));
  }

  partes.push(linha());
  if (t.rifa.autorizacao) {
    partes.push(...quebrar(`Autorizacao SPA/MF: ${t.rifa.autorizacao}`));
  }
  if (t.sorteio.seedHash) {
    partes.push("Semente (hash):");
    partes.push(t.sorteio.seedHash.slice(0, 32));
  }
  if (t.administradora.observacao) {
    partes.push(...quebrar(t.administradora.observacao));
  }
  partes.push(centro(new Date(t.emitidoEm).toLocaleString("pt-BR")));
  partes.push("");
  partes.push("");

  return partes.map(paraBobina).join("\n");
}
