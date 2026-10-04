package br.com.rifa.pos

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cobrança e impressão no POS Android da Stone/Ton, **por deeplink**: o app
 * abre o aplicativo de pagamento (ou de impressão) da Stone, que já vem no
 * aparelho, e recebe a resposta por outro deeplink. Não usa a SDK — por isso
 * este sabor compila sem a dependência da Stone nem credencial.
 *
 * O protocolo (nomes dos parâmetros e das respostas) é o do deeplink do POS
 * Android da Stone (`sdkandroid.stone.com.br`, "Deeplink" e "Pagamento").
 * **Não foi compilado nem testado numa maquininha**: confira na primeira
 * venda de teste (docs/MAQUININHAS.md, "Stone por deeplink").
 *
 * - Pagamento: `payment-app://pay?amount=<centavos>&order_id=…&transaction_type=…
 *   &installment_type=…&return_scheme=<nosso esquema>`; volta em
 *   `<nosso esquema>://pay-response?code=0&atk=…&authorization_code=…` quando
 *   aprova, ou com `success=false&message=…` quando não.
 * - Impressão: `printer-app://print?SHOW_FEEDBACK_SCREEN=false&SCHEME_RETURN=…
 *   &PRINTABLE_CONTENT=<JSON>`; volta com `DEEPLINK_RETURN=SUCCESS` ou o erro da
 *   impressora (`PRINTER_OUT_OF_PAPER`, …).
 */
class TerminalStone(private val context: Context) : Terminal {

    override val nome: String = "Ton POS Android"

    /** A T3 Smart tem bobina; a T1 não. Ajuste conforme o parque de aparelhos. */
    override val temImpressora: Boolean = true

    override fun cobrar(pedido: PedidoDeCobranca): ResultadoDeCobranca {
        val tipo = when (pedido.forma) {
            "debito" -> "DEBIT"
            "pix" -> "PIX"
            else -> "CREDIT"
        }
        val uri = Uri.Builder()
            .scheme("payment-app")
            .authority("pay")
            .appendQueryParameter("amount", pedido.valorCentavos.toString())
            // Vira a referência da venda no extrato da Stone: é o que permite
            // conciliar a transação com o pedido depois.
            .appendQueryParameter("order_id", pedido.codigoPedido.toString())
            // O valor vem do servidor: o cambista não muda na tela da Stone.
            .appendQueryParameter("editable_amount", "0")
            .appendQueryParameter("transaction_type", tipo)
            .appendQueryParameter("return_scheme", ESQUEMA_PAGAMENTO)
            .apply {
                // Parcela só existe no crédito: à vista é NONE; parcelado, sem juros do lojista.
                if (tipo == "CREDIT") {
                    if (pedido.parcelas > 1) {
                        appendQueryParameter("installment_type", "MERCHANT")
                        appendQueryParameter("installment_count", pedido.parcelas.toString())
                    } else {
                        appendQueryParameter("installment_type", "NONE")
                    }
                }
            }
            .build()

        val volta = try {
            RetornoDeApp.esperar(ESQUEMA_PAGAMENTO, PRAZO_PAGAMENTO_MS) { abrir(uri) }
        } catch (erro: Throwable) {
            return ResultadoDeCobranca(
                aprovado = false,
                // Sem resposta no prazo, a cobrança pode ter passado mesmo assim: o
                // cambista confere na maquininha antes de cobrar de novo.
                mensagem = if (RetornoDeApp.esgotou(erro)) {
                    "A maquininha não respondeu a tempo. Confira na Stone se a venda foi aprovada antes de cobrar de novo."
                } else {
                    erro.message ?: "Não consegui abrir o pagamento da Stone."
                },
            )
        }

        return if (volta.getQueryParameter("code") == "0") {
            ResultadoDeCobranca(
                aprovado = true,
                // O ATK identifica a transação na Stone (cancelamento, reimpressão);
                // sem ele, o código de autorização.
                autorizacao = volta.getQueryParameter("atk") ?: volta.getQueryParameter("authorization_code"),
                terminal = nome,
            )
        } else {
            ResultadoDeCobranca(
                aprovado = false,
                // A mensagem da adquirente é o que o cambista precisa ler para
                // saber se tenta outro cartão ou pede dinheiro.
                mensagem = volta.getQueryParameter("message") ?: "Pagamento não aprovado.",
            )
        }
    }

    override fun imprimir(texto: String) {
        // Uma linha de texto por item, alinhada à esquerda, letra pequena: o
        // bilhete já vem em 32 colunas, sem acento, pronto para a bobina.
        val conteudo = JSONArray()
        texto.split("\n").forEach { linha ->
            conteudo.put(
                JSONObject()
                    .put("type", "text")
                    // Linha vazia vira um espaço: o app da Stone recusa conteúdo vazio.
                    .put("content", linha.ifEmpty { " " })
                    .put("align", "left")
                    .put("size", "small"),
            )
        }
        val uri = Uri.Builder()
            .scheme("printer-app")
            .authority("print")
            .appendQueryParameter("SHOW_FEEDBACK_SCREEN", "false")
            .appendQueryParameter("SCHEME_RETURN", ESQUEMA_IMPRESSAO)
            .appendQueryParameter("PRINTABLE_CONTENT", conteudo.toString())
            .build()

        val volta = try {
            RetornoDeApp.esperar(ESQUEMA_IMPRESSAO, PRAZO_IMPRESSAO_MS) { abrir(uri) }
        } catch (erro: Throwable) {
            throw IllegalStateException(
                if (RetornoDeApp.esgotou(erro)) "A impressora não respondeu a tempo." else erro.message ?: "Falha ao imprimir.",
            )
        }
        val retorno = volta.getQueryParameter("DEEPLINK_RETURN")
        if (retorno != "SUCCESS") throw IllegalStateException(MOTIVOS_DA_IMPRESSORA[retorno] ?: "Falha ao imprimir.")
    }

    /** O app da Stone abre por cima do nosso; a volta chega na `MainActivity` (singleTask). */
    private fun abrir(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) == null) {
            throw IllegalStateException("O app de pagamento da Stone não está neste aparelho.")
        }
        context.startActivity(intent)
    }

    private companion object {
        /** Os esquemas de volta (os hosts são os da Stone: `pay-response` e `print`). Estão no AndroidManifest do sabor `ton`. */
        const val ESQUEMA_PAGAMENTO = "rifapos-pagamento"
        const val ESQUEMA_IMPRESSAO = "rifapos-impressao"

        /** Abaixo dos prazos do shim (120 s e 30 s): a resposta nativa chega antes de a página desistir. */
        const val PRAZO_PAGAMENTO_MS = 115_000L
        const val PRAZO_IMPRESSAO_MS = 28_000L

        /** Os erros da impressora que o app da Stone devolve, em português para o cambista. */
        val MOTIVOS_DA_IMPRESSORA = mapOf(
            "PRINTER_OUT_OF_PAPER" to "Impressora sem papel ou com a tampa da bobina aberta.",
            "PRINTER_INIT_ERROR" to "Não consegui ligar a impressora.",
            "PRINTER_LOW_ENERGY" to "A maquininha está com pouca bateria para imprimir.",
            "PRINTER_BUSY" to "A impressora está ocupada. Tente de novo em instantes.",
            "PRINTER_UNSUPPORTED_FORMAT" to "A impressora não aceitou o formato do bilhete.",
            "PRINTER_INVALID_DATA" to "O bilhete passou do tamanho que a impressora aceita.",
            "PRINTER_OVERHEATING" to "A impressora esquentou demais. Espere um pouco.",
            "PRINTER_PAPER_JAM" to "Papel preso na bobina.",
            "PRINTER_PRINT_ERROR" to "Falha na impressora.",
        )
    }
}
