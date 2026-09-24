package br.com.rifa.pos

import android.content.Context

/**
 * PagBank / PagSeguro — terminais Moderninha Smart, Smart 2, Moderninha X e
 * PagTotem, via PlugPagServiceWrapper.
 *
 * ATENÇÃO: este arquivo só compila depois que a dependência da SDK entrar em
 * `app/build.gradle.kts`. Ele não é compilado pelo sabor `generico`, então a
 * ausência da SDK não impede o build de desenvolvimento.
 *
 * As assinaturas abaixo seguem a SDK pública da PagBank; confirme nomes e
 * constantes contra a versão que você baixar antes de rodar em produção.
 */
fun criarTerminal(context: Context): Terminal = TerminalPlugPag(context)
