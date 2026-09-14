package br.com.rifa.pos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope

/**
 * Uma tela só: o app web inteiro dentro de uma WebView, com a ponte da
 * maquininha injetada. Nenhuma regra de negócio mora aqui — se você se pegar
 * escrevendo preço ou cota neste arquivo, está no lugar errado.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            // A tela do terminal é pequena; deixar o app web mandar no zoom.
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.builtInZoomControls = false
        }
        setContentView(webView)

        val terminal = criarTerminal(this)
        webView.addJavascriptInterface(
            PosBridge(webView, terminal, lifecycleScope),
            NOME_DA_PONTE,
        )

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                // O shim precisa existir antes de a página tentar usar a ponte.
                view.evaluateJavascript(lerShim(), null)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) mostrarFalhaDeConexao()
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack() else finish()
                }
            },
        )

        webView.loadUrl(BuildConfig.APP_URL)
    }

    private fun lerShim(): String =
        assets.open("rifa-pos-shim.js").bufferedReader().use { it.readText() }

    private fun mostrarFalhaDeConexao() {
        val html = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{font-family:sans-serif;display:flex;flex-direction:column;
                   align-items:center;justify-content:center;height:100vh;margin:0;
                   color:#0B1F14;background:#fff;text-align:center;padding:24px}
              button{background:#00873E;color:#fff;border:0;border-radius:8px;
                     padding:12px 20px;font-size:16px;margin-top:16px}
            </style></head>
            <body>
              <p>${getString(R.string.sem_conexao)}</p>
              <button onclick="location.href='${BuildConfig.APP_URL}'">
                ${getString(R.string.tentar_novamente)}
              </button>
            </body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    companion object {
        /** O shim procura por este nome; mudar aqui exige mudar lá. */
        const val NOME_DA_PONTE = "RifaPOSNative"
    }
}
