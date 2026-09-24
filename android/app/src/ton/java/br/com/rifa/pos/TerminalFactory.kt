package br.com.rifa.pos

import android.content.Context

/**
 * Stone / Ton — POS Android (T3, T3 Smart).
 *
 * ATENÇÃO: este arquivo só compila depois que a dependência da SDK da Stone
 * entrar em `app/build.gradle.kts`. Ele não é compilado pelo sabor `generico`.
 */
fun criarTerminal(context: Context): Terminal = TerminalStone(context)
