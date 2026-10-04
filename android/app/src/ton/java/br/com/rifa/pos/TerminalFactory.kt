package br.com.rifa.pos

import android.content.Context

/**
 * Stone / Ton — POS Android (T3, T3 Smart), por deeplink: abre o app de
 * pagamento e o de impressão da Stone que já vêm no aparelho. Não depende da
 * SDK da Stone, então este sabor compila sem credencial.
 */
fun criarTerminal(context: Context): Terminal = TerminalStone(context)
