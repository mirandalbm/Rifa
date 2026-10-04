package br.com.rifa.pos

import android.net.Uri
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * A volta de outro app por deeplink (o app de pagamento ou de impressão da
 * adquirente). Quem chama abre o outro app e espera aqui, fora da thread
 * principal; a `MainActivity` (singleTask) recebe o deeplink de volta em
 * `onNewIntent` e entrega por `entregar()`.
 *
 * Uma espera por vez: o cambista não cobra dois cartões ao mesmo tempo, e uma
 * segunda chamada no meio da primeira é recusada em vez de roubar a resposta.
 */
object RetornoDeApp {

    private class Espera(val esquema: String, val futuro: CompletableFuture<Uri>)

    @Volatile
    private var atual: Espera? = null

    /**
     * Abre (por `abrir`) e espera a volta pelo `esquema` até o prazo. Sem
     * volta no prazo, lança `TimeoutException`; com outra espera em curso,
     * `IllegalStateException`.
     */
    fun esperar(esquema: String, prazoMs: Long, abrir: () -> Unit): Uri {
        val espera = Espera(esquema, CompletableFuture())
        synchronized(this) {
            if (atual != null) throw IllegalStateException("A maquininha já está atendendo outra operação.")
            atual = espera
        }
        try {
            abrir()
            return espera.futuro.get(prazoMs, TimeUnit.MILLISECONDS)
        } finally {
            synchronized(this) { if (atual === espera) atual = null }
        }
    }

    /** O deeplink de volta: só completa a espera do mesmo esquema; o resto é ignorado. */
    fun entregar(uri: Uri) {
        val espera = atual ?: return
        if (uri.scheme == espera.esquema) espera.futuro.complete(uri)
    }

    /** Tempo esgotado é distinguível de recusa: quem chama decide a mensagem. */
    fun esgotou(erro: Throwable): Boolean = erro is TimeoutException
}
