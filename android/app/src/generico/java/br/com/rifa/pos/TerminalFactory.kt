package br.com.rifa.pos

import android.content.Context

/**
 * Sabor genérico: nenhuma SDK de adquirente. Serve para rodar o APK em
 * celular comum, emulador ou aparelho sem maquininha — a ponte existe e
 * responde honestamente que não dá para cobrar aqui.
 */
fun criarTerminal(context: Context): Terminal = TerminalAusente()

private class TerminalAusente : Terminal {
    override val nome: String = "sem maquininha"
    override val temImpressora: Boolean = false

    override fun cobrar(pedido: PedidoDeCobranca): ResultadoDeCobranca =
        ResultadoDeCobranca(
            aprovado = false,
            mensagem = "Este aparelho não tem maquininha integrada.",
        )

    override fun imprimir(texto: String) {
        throw UnsupportedOperationException("Este aparelho não tem impressora.")
    }
}
