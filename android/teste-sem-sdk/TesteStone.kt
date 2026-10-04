import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import br.com.rifa.pos.*
import org.json.JSONArray

var falhas = 0
fun checa(nome: String, ok: Boolean, d: String = "") { println("  ${if (ok) "✓" else "✗"} $nome${if (d.isNotEmpty()) " ($d)" else ""}"); if (!ok) falhas++ }

/** O app da Stone de mentira: recebe o deeplink e, noutra thread, devolve o que `responder` disser. */
class Aparelho(val temStone: Boolean = true, val responder: (Uri) -> Uri?) : Context() {
  var ultimo: Uri? = null; var flags = 0
  override fun getPackageManager(): PackageManager? = if (temStone) object : PackageManager() {} else null
  override fun startActivity(intent: Intent) {
    ultimo = intent.data; flags = intent.flags
    val volta = responder(intent.data!!) ?: return
    Thread { Thread.sleep(50); RetornoDeApp.entregar(volta) }.start()
  }
}
fun volta(esquema: String, host: String, vararg q: Pair<String, String>) = Uri(esquema, host, linkedMapOf(*q))

fun main() {
  // Aprovado no crédito à vista
  var ap = Aparelho { u -> volta(u.getQueryParameter("return_scheme")!!, "pay-response", "code" to "0", "atk" to "ATK123", "authorization_code" to "AUT9") }
  var r = TerminalStone(ap).cobrar(PedidoDeCobranca(4655, 12345678, "credito"))
  checa("aprovado devolve o ATK", r.aprovado && r.autorizacao == "ATK123", r.toString())
  val u = ap.ultimo!!
  checa("abre payment-app://pay com o valor em centavos e o pedido", u.scheme == "payment-app" && u.getAuthority() == "pay" && u.getQueryParameter("amount") == "4655" && u.getQueryParameter("order_id") == "12345678")
  checa("crédito à vista: CREDIT e NONE, sem parcelas", u.getQueryParameter("transaction_type") == "CREDIT" && u.getQueryParameter("installment_type") == "NONE" && u.getQueryParameter("installment_count") == null)
  checa("o valor não é editável na tela da Stone", u.getQueryParameter("editable_amount") == "0")
  checa("abre em tarefa nova", ap.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
  // Parcelado
  ap = Aparelho { u2 -> volta(u2.getQueryParameter("return_scheme")!!, "pay-response", "code" to "0", "authorization_code" to "AUT1") }
  r = TerminalStone(ap).cobrar(PedidoDeCobranca(10000, 1, "credito", 3))
  checa("parcelado: MERCHANT e 3 parcelas; sem ATK, o código de autorização", ap.ultimo!!.getQueryParameter("installment_type") == "MERCHANT" && ap.ultimo!!.getQueryParameter("installment_count") == "3" && r.autorizacao == "AUT1")
  // Débito e Pix não levam parcela
  ap = Aparelho { u2 -> volta(u2.getQueryParameter("return_scheme")!!, "pay-response", "code" to "0", "atk" to "A") }
  TerminalStone(ap).cobrar(PedidoDeCobranca(500, 2, "debito"))
  checa("débito: DEBIT sem installment_type", ap.ultimo!!.getQueryParameter("transaction_type") == "DEBIT" && ap.ultimo!!.getQueryParameter("installment_type") == null)
  TerminalStone(ap).cobrar(PedidoDeCobranca(500, 3, "pix"))
  checa("pix: PIX", ap.ultimo!!.getQueryParameter("transaction_type") == "PIX")
  // Recusado
  ap = Aparelho { u2 -> volta(u2.getQueryParameter("return_scheme")!!, "pay-response", "success" to "false", "message" to "Saldo insuficiente") }
  r = TerminalStone(ap).cobrar(PedidoDeCobranca(500, 4, "debito"))
  checa("recusa é resultado com o motivo da Stone (não exceção)", !r.aprovado && r.mensagem == "Saldo insuficiente", r.toString())
  // Volta de outro esquema é ignorada (não completa a espera errada) — e sem volta, o prazo vale
  // (o prazo real é 115 s; aqui só confere que a volta de outro esquema não entra)
  // Sem o app da Stone no aparelho
  r = TerminalStone(Aparelho(temStone = false) { null }).cobrar(PedidoDeCobranca(500, 5, "credito"))
  checa("sem o app da Stone: recusa com motivo claro", !r.aprovado && r.mensagem!!.contains("não está neste aparelho"), r.toString())
  // Impressão
  ap = Aparelho { u2 -> volta(u2.getQueryParameter("SCHEME_RETURN")!!, "print", "DEEPLINK_RETURN" to "SUCCESS") }
  TerminalStone(ap).imprimir("RIFA\n\nTOTAL     R$ 46,55")
  val pu = ap.ultimo!!
  val itens = JSONArray(pu.getQueryParameter("PRINTABLE_CONTENT"))
  checa("imprime por printer-app://print, uma linha por item", pu.scheme == "printer-app" && pu.getAuthority() == "print" && itens.length() == 3)
  checa("linha vazia vira espaço; texto à esquerda, pequeno", itens.getJSONObject(1).getString("content") == " " && itens.getJSONObject(2).getString("align") == "left" && itens.getJSONObject(2).getString("size") == "small")
  ap = Aparelho { u2 -> volta(u2.getQueryParameter("SCHEME_RETURN")!!, "print", "DEEPLINK_RETURN" to "PRINTER_OUT_OF_PAPER") }
  val erro = runCatching { TerminalStone(ap).imprimir("x") }.exceptionOrNull()
  checa("sem papel: erro em português para o cambista", erro?.message?.contains("sem papel") == true, erro?.message ?: "")
  // Uma operação por vez
  val lento = Aparelho { _ -> Thread.sleep(400); null }
  val t = Thread { runCatching { RetornoDeApp.esperar("rifapos-pagamento", 600) { lento.startActivity(Intent(Intent.ACTION_VIEW, Uri("x","y", linkedMapOf()))) } } }
  t.start(); Thread.sleep(100)
  r = TerminalStone(Aparelho { null }).cobrar(PedidoDeCobranca(1, 6, "credito"))
  checa("segunda cobrança no meio da primeira é recusada", !r.aprovado && r.mensagem!!.contains("outra operação"), r.toString())
  t.join()
  // A volta de outro esquema não completa a espera
  val outra = Thread { Thread.sleep(50); RetornoDeApp.entregar(volta("outro-esquema", "pay-response", "code" to "0")) }
  outra.start()
  val esgotou = runCatching { RetornoDeApp.esperar("rifapos-pagamento", 300) {} }.exceptionOrNull()
  checa("volta de outro esquema não entra; sem volta, o prazo esgota", esgotou != null && RetornoDeApp.esgotou(esgotou), esgotou?.javaClass?.simpleName ?: "nenhum erro")
  println(if (falhas == 0) "  tudo certo" else "  $falhas falha(s)")
  if (falhas > 0) System.exit(1)
}
