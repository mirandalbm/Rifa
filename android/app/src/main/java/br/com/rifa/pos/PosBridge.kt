package br.com.rifa.pos

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * A ponte que o JavaScript enxerga.
 *
 * Métodos marcados com @JavascriptInterface são **síncronos** e rodam numa
 * thread do WebView — cobrar cartão ali travaria a tela por dez segundos.
 * Por isso o contrato aqui é de mão dupla: o JavaScript manda um `chamadaId`,
 * o trabalho acontece fora da thread principal e a resposta volta por
 * `window.__rifaPosResolve(chamadaId, json)`.
 *
 * O invólucro de Promise fica no shim injetado (`rifa-pos-shim.js`), então a
 * página web continua vendo `RifaPOS.pay(...)` devolvendo uma Promise.
 */
class PosBridge(
    private val webView: WebView,
    private val terminal: Terminal,
    private val escopo: CoroutineScope,
) {

    @JavascriptInterface
    fun version(): String = "1.0"

    @JavascriptInterface
    fun terminalName(): String = terminal.nome

    @JavascriptInterface
    fun hasPrinter(): Boolean = terminal.temImpressora

    /**
     * Cobra e devolve o resultado por callback.
     *
     * @param requisicaoJson `{ amountCents, orderCode, method, installments }`
     */
    @JavascriptInterface
    fun payAsync(requisicaoJson: String, chamadaId: String) {
        escopo.launch {
            val resposta = try {
                val json = JSONObject(requisicaoJson)
                val resultado = withContext(Dispatchers.IO) {
                    terminal.cobrar(
                        PedidoDeCobranca(
                            valorCentavos = json.getInt("amountCents"),
                            codigoPedido = json.getInt("orderCode"),
                            forma = json.optString("method", "credito"),
                            parcelas = json.optInt("installments", 1),
                        ),
                    )
                }
                JSONObject().apply {
                    put("ok", resultado.aprovado)
                    put("authCode", resultado.autorizacao)
                    put("terminal", resultado.terminal ?: terminal.nome)
                    put("message", resultado.mensagem)
                }
            } catch (erro: Throwable) {
                // Exceção aqui vira recusa com motivo, nunca Promise pendurada:
                // o cambista ficaria olhando a tela sem saber o que houve.
                JSONObject().apply {
                    put("ok", false)
                    put("message", erro.message ?: "Falha na maquininha.")
                }
            }

            resolver(chamadaId, resposta)
        }
    }

    @JavascriptInterface
    fun printAsync(texto: String, chamadaId: String) {
        escopo.launch {
            val resposta = try {
                withContext(Dispatchers.IO) { terminal.imprimir(texto) }
                JSONObject().put("ok", true)
            } catch (erro: Throwable) {
                JSONObject().apply {
                    put("ok", false)
                    put("message", erro.message ?: "Falha ao imprimir.")
                }
            }
            resolver(chamadaId, resposta)
        }
    }

    /** A resposta precisa voltar na thread principal: é ela que fala com o WebView. */
    private suspend fun resolver(chamadaId: String, resposta: JSONObject) {
        withContext(Dispatchers.Main) {
            val json = resposta.toString().replace("'", "\\'")
            webView.evaluateJavascript(
                "window.__rifaPosResolve && window.__rifaPosResolve('$chamadaId', $json);",
                null,
            )
        }
    }
}
