package br.com.rifa.pos

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPag
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagPaymentData
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagPrinterData
import java.io.File
import java.io.FileOutputStream

/**
 * Cobrança e impressão na Moderninha Smart.
 *
 * Um detalhe que costuma pegar quem integra: a impressão livre do PlugPag
 * imprime **imagem**, não texto. Por isso o bilhete de 32 colunas que vem do
 * servidor é desenhado num bitmap antes de ir para a bobina.
 */
class TerminalPlugPag(private val context: Context) : Terminal {

    private val plugPag by lazy { PlugPag(context) }

    override val nome: String = "PagBank Smart"
    override val temImpressora: Boolean = true

    override fun cobrar(pedido: PedidoDeCobranca): ResultadoDeCobranca {
        val tipo = when (pedido.forma) {
            "debito" -> PlugPag.TYPE_DEBITO
            "pix" -> PlugPag.TYPE_PIX
            else -> PlugPag.TYPE_CREDITO
        }

        val dados = PlugPagPaymentData(
            type = tipo,
            amount = pedido.valorCentavos,
            installmentType = PlugPag.INSTALLMENT_TYPE_A_VISTA,
            installments = pedido.parcelas,
            // Vira a referência da venda no extrato da adquirente: é o que
            // permite conciliar a transação com o pedido depois.
            userReference = "RIFA${pedido.codigoPedido}",
            printReceipt = false,
        )

        val resposta = plugPag.doPayment(dados)

        return if (resposta.result == PlugPag.RET_OK) {
            ResultadoDeCobranca(
                aprovado = true,
                autorizacao = resposta.transactionCode ?: resposta.transactionId,
                terminal = nome,
            )
        } else {
            ResultadoDeCobranca(
                aprovado = false,
                // A mensagem da adquirente é o que o cambista precisa ler para
                // saber se tenta outro cartão ou pede dinheiro.
                mensagem = resposta.message ?: "Pagamento não aprovado.",
            )
        }
    }

    override fun imprimir(texto: String) {
        val arquivo = desenharBilhete(texto)
        val dados = PlugPagPrinterData(
            filePath = arquivo.absolutePath,
            printerQuality = QUALIDADE,
            step = 0,
        )
        val resultado = plugPag.printFromFile(dados)
        if (resultado.result != PlugPag.RET_OK) {
            throw IllegalStateException(resultado.message ?: "Falha ao imprimir.")
        }
        arquivo.delete()
    }

    /** Texto monoespaçado de 32 colunas virando imagem de 384 px — a largura da bobina. */
    private fun desenharBilhete(texto: String): File {
        val linhas = texto.split("\n")
        val pincel = Paint().apply {
            color = Color.BLACK
            textSize = TAMANHO_FONTE
            typeface = Typeface.MONOSPACE
            isAntiAlias = true
        }

        val alturaLinha = pincel.fontSpacing
        val altura = (alturaLinha * linhas.size + MARGEM * 2).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(LARGURA_BOBINA, altura, Bitmap.Config.ARGB_8888)

        Canvas(bitmap).apply {
            drawColor(Color.WHITE)
            linhas.forEachIndexed { indice, linha ->
                drawText(linha, MARGEM, MARGEM + alturaLinha * (indice + 1), pincel)
            }
        }

        val arquivo = File(context.cacheDir, "bilhete_${System.currentTimeMillis()}.png")
        FileOutputStream(arquivo).use { saida ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, saida)
        }
        bitmap.recycle()
        return arquivo
    }

    private companion object {
        /** Bobina de 58 mm a 203 dpi. */
        const val LARGURA_BOBINA = 384
        const val TAMANHO_FONTE = 21f
        const val MARGEM = 8f
        const val QUALIDADE = 4
    }
}
