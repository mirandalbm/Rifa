package br.com.rifa.pos

import android.content.Context

/**
 * Cobrança e impressão no POS Android da Stone/Ton.
 *
 * A Stone oferece dois caminhos: a SDK Android e a integração por deeplink,
 * em que o app chama o aplicativo da Stone passando os dados do pagamento.
 *
 * Os dois pontos de encaixe estão marcados abaixo. **Não preenchi com nomes
 * de classe inventados de propósito**: a API muda entre versões da SDK, e
 * método que não existe descoberto só na hora de compilar é melhor do que
 * método plausível que compila e falha no balcão. Copie as chamadas da
 * documentação da versão que você baixar — a estrutura em volta (thread,
 * tratamento de recusa, formato do resultado) já está pronta e é a mesma.
 */
class TerminalStone(private val context: Context) : Terminal {

    override val nome: String = "Ton POS Android"

    /** A T3 Smart tem bobina; a T1 não. Ajuste conforme o parque de aparelhos. */
    override val temImpressora: Boolean = true

    override fun cobrar(pedido: PedidoDeCobranca): ResultadoDeCobranca {
        // ENCAIXE 1 — pagamento.
        //
        // Pela SDK: montar a transação com valor (pedido.valorCentavos),
        // tipo (pedido.forma → crédito/débito/pix) e a referência
        // "RIFA${pedido.codigoPedido}", executar e ler o retorno.
        //
        // Por deeplink: montar o Intent para o app da Stone com os mesmos
        // dados e tratar o retorno em onActivityResult.
        //
        // Aprovado  → ResultadoDeCobranca(aprovado = true, autorizacao = <ATK/NSU>, terminal = nome)
        // Recusado  → ResultadoDeCobranca(aprovado = false, mensagem = <motivo da adquirente>)
        return ResultadoDeCobranca(
            aprovado = false,
            mensagem = "Integração com a Stone ainda não configurada neste APK.",
        )
    }

    override fun imprimir(texto: String) {
        // ENCAIXE 2 — impressão.
        //
        // A SDK da Stone imprime texto direto, sem precisar virar imagem como
        // no PlugPag: basta enviar as linhas de `texto` (já vêm em 32 colunas,
        // sem acento, prontas para a bobina).
        throw UnsupportedOperationException(
            "Integração de impressão com a Stone ainda não configurada neste APK.",
        )
    }
}
