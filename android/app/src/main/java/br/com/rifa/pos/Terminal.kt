package br.com.rifa.pos

/**
 * O que a maquininha sabe fazer.
 *
 * Cada adquirente implementa esta interface no próprio sabor de build. O
 * resto do app — inclusive a página web — não sabe qual delas está rodando.
 */
interface Terminal {

    /** Modelo do aparelho, como aparece no registro da venda. */
    val nome: String

    /** Nem todo terminal tem bobina; o app precisa saber antes de mandar imprimir. */
    val temImpressora: Boolean

    /**
     * Cobra no aparelho. Bloqueia até a adquirente responder — quem chama
     * já está fora da thread principal.
     */
    fun cobrar(pedido: PedidoDeCobranca): ResultadoDeCobranca

    /** Imprime texto puro de 32 colunas na bobina. */
    fun imprimir(texto: String)
}

data class PedidoDeCobranca(
    val valorCentavos: Int,
    val codigoPedido: Int,
    /** "credito", "debito" ou "pix" — o vocabulário do app web. */
    val forma: String,
    val parcelas: Int = 1,
)

data class ResultadoDeCobranca(
    val aprovado: Boolean,
    /** NSU ou código de autorização devolvido pela adquirente. */
    val autorizacao: String? = null,
    val terminal: String? = null,
    /** Motivo da recusa, em português, para o cambista ler na hora. */
    val mensagem: String? = null,
)
