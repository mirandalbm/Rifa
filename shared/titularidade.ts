/**
 * De quem é o cliente — regra pura (ver `docs/PLANO-FASE5.md`, seção 1.3).
 *
 * - **Cliente do cambista**: comprou na mão de um cambista, cadastrado por ele.
 *   É da organização do cambista, e o organizador vê os dados completos.
 * - **Cliente da plataforma**: se cadastrou sozinho (direto, pelo link de
 *   afiliado, por qualquer caminho voluntário). Os dados são da plataforma: o
 *   organizador vê o pedido, as cotas e o valor, e o cliente só pelo ID.
 *
 * A regra vale **por venda**: a mesma pessoa pode ter comprado dos dois
 * jeitos, e o organizador enxerga só o lado que é dele. Exceção: o
 * **ganhador** — o promotor responde pela entrega do prêmio (Lei 5.768/71),
 * então os dados do ganhador aparecem para ele.
 */

export interface VendaParaPainel {
  /** A sessão é da plataforma (administrador geral): vê tudo. */
  daPlataforma: boolean;
  /** Venda feita por cambista (`orders.seller_id`). */
  vendaDeCambista: boolean;
  /** Pedido ganhou o sorteio ou reclamou uma cota premiada. */
  ganhador: boolean;
}

export function clienteVisivel(v: VendaParaPainel): boolean {
  return v.daPlataforma || v.vendaDeCambista || v.ganhador;
}

export interface DadosDoCliente {
  nome: string;
  telefone: string | null;
  cpf?: string | null;
  email?: string | null;
  codigo: string | null;
}

/** Como o cliente aparece no painel desta sessão. */
export function clienteNoPainel(c: DadosDoCliente, v: VendaParaPainel) {
  if (clienteVisivel(v)) return { ...c, completo: true as const };
  return {
    nome: rotuloDoCliente(c.codigo),
    telefone: null,
    cpf: null,
    email: null,
    codigo: c.codigo,
    completo: false as const,
  };
}

/** Cliente da plataforma aparece assim no painel do organizador. */
export function rotuloDoCliente(codigo: string | null): string {
  return codigo ? `Cliente ${codigo}` : "Cliente da plataforma";
}
