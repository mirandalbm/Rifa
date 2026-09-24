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
  cartao_maquininha: "Cartão (maquininha)",
  pix_maquininha: "Pix (maquininha)",
};

export const SITUACAO_LABEL: Record<string, string> = {
  pending: "AGUARDANDO PAGAMENTO",
  paid: "PAGO",
  expired: "EXPIRADO",
  refunded: "ESTORNADO",
};

/** Colunas de uma bobina de 58 mm na fonte padrão. */
const LARGURA = 32;

function linha(char = "-"): string {
  return char.repeat(LARGURA);
}

function centro(texto: string): string {
  const t = texto.slice(0, LARGURA);
  const espaco = Math.max(0, Math.floor((LARGURA - t.length) / 2));
  return " ".repeat(espaco) + t;
}

/** "TOTAL              R$ 24,50" — rótulo à esquerda, valor à direita. */
function parEsquerdaDireita(rotulo: string, valor: string): string {
  const limpo = valor.replace(/[\u00a0\u202f]/g, " ");
  const espaco = Math.max(1, LARGURA - rotulo.length - limpo.length);
  return rotulo + " ".repeat(espaco) + limpo;
}

function quebrar(texto: string): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if ((`${atual} ${palavra}`).trim().length > LARGURA) {
      if (atual) linhas.push(atual.trim());
      // Palavra sozinha maior que a bobina: corta, senão estoura a linha.
      atual = palavra.length > LARGURA ? palavra.slice(0, LARGURA) : palavra;
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
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Texto puro do bilhete, pronto para a impressora da maquininha. */
export function escPosTicket(t: TicketData): string {
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
