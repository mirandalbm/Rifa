/**
 * A busca única do painel: o que o texto digitado quer dizer, e o formato
 * do que volta. Pura, porque o servidor decide o que procurar e a tela
 * decide o que mostrar — e os dois precisam ler o texto do mesmo jeito.
 *
 * Pedido e cliente são achados pelo identificador, nunca por nome: o pedido
 * pelo código (8 dígitos) e o cliente pelo ID (`C-XXXXXXXX`). Nome ou
 * telefone de **comprador** não entram na busca: seria uma consulta à
 * carteira de clientes pela barra de cima, fora da regra de titularidade.
 * O resto do texto procura gente **da casa** — organização (só a plataforma),
 * e usuário, afiliado e cambista por nome, e-mail ou código — dentro do
 * recorte de quem busca.
 */

/** O código do pedido tem 8 dígitos (`ORDER_CODE_MIN`/`MAX` em `services/orders.ts`). */
const CODIGO_DO_PEDIDO = /^#?(\d{8})$/;

/** O ID do cliente: `C-` e 8 caracteres do alfabeto sem 0/O, 1/I/L (`gerarCodigoCliente`). */
const ID_DO_CLIENTE = /^C-?([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})$/;
/** O mesmo ID já no formato guardado (`C-XXXXXXXX`), para a rota de pedidos filtrar. */
export const ID_DO_CLIENTE_VALIDO = /^C-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export const BUSCA_MIN = 2;
export const BUSCA_MAX = 60;
export const ACHADOS_MAX = 5;

export type ConsultaDoPainel =
  | { tipo: "pedido"; codigo: number }
  | { tipo: "cliente"; codigo: string }
  | { tipo: "texto"; texto: string }
  | null;

/**
 * Lê o texto digitado: `#12345678` ou `12345678` é pedido; `C-ABCD2345`
 * (em qualquer caixa, com ou sem o hífen) é cliente; o resto, com 2 ou mais
 * letras, é texto livre (organização e pessoas da casa). Curto demais, ou
 * longo demais, é nada.
 */
export function interpretarBusca(texto: string): ConsultaDoPainel {
  const t = texto.trim();
  if (t.length < BUSCA_MIN || t.length > BUSCA_MAX) return null;
  const pedido = CODIGO_DO_PEDIDO.exec(t);
  if (pedido) return { tipo: "pedido", codigo: Number(pedido[1]) };
  const cliente = ID_DO_CLIENTE.exec(t.toUpperCase());
  if (cliente) return { tipo: "cliente", codigo: `C-${cliente[1]}` };
  return { tipo: "texto", texto: t };
}

export type TipoDoAchado = "pedido" | "cliente" | "organizacao" | "pessoa";

export interface AchadoDaBusca {
  tipo: TipoDoAchado;
  /** O que aparece na lista: "Pedido #12345678", "Cliente C-…", o nome da organização. */
  rotulo: string;
  /** A linha de baixo: rifa e situação, quantos pedidos, cidade/UF. */
  detalhe: string;
  /** A tela que abre já no item (`/admin/pedidos?codigo=…`). */
  caminho: string;
}

export const NOME_DO_TIPO: Record<TipoDoAchado, string> = {
  pedido: "Pedido",
  cliente: "Cliente",
  organizacao: "Organização",
  pessoa: "Pessoa",
};

/** O caminho de cada tipo, num lugar só: a tela de destino lê o mesmo parâmetro. */
export function caminhoDoAchado(
  a:
    | { tipo: "pedido"; codigo: number }
    | { tipo: "cliente"; codigo: string }
    | { tipo: "organizacao"; id: string }
    | { tipo: "pessoa"; papel: string; codigo: string | null; email: string },
): string {
  switch (a.tipo) {
    case "pedido":
      return `/admin/pedidos?codigo=${a.codigo}`;
    case "cliente":
      return `/admin/pedidos?cliente=${encodeURIComponent(a.codigo)}`;
    case "organizacao":
      return `/admin/organizacoes?aberta=${encodeURIComponent(a.id)}`;
    case "pessoa":
      // Afiliado tem tela própria (filtrada pelo código). Cambista e os
      // demais usuários vão para a lista de usuários filtrada pelo e-mail —
      // a de Cambistas só lista quem tem acerto, e a busca não pode levar a
      // uma tela onde a pessoa não aparece.
      return a.papel === "affiliate" && a.codigo
        ? `/admin/afiliados?q=${encodeURIComponent(a.codigo)}`
        : `/admin/usuarios?q=${encodeURIComponent(a.email)}`;
  }
}
