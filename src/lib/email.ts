/// Envio de e-mail transacional via Resend (HTTP, sem SDK).
/// Quando RESEND_API_KEY não está configurada, o envio vira um no-op registrado
/// no log: a ausência de e-mail nunca derruba a confirmação de um pagamento.

type Email = {
  para: string;
  assunto: string;
  html: string;
};

export async function enviarEmail({ para, assunto, html }: Email): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;

  if (!chave || !remetente) {
    console.warn(`E-mail não enviado (RESEND_API_KEY/EMAIL_REMETENTE ausentes): "${assunto}" para ${para}`);
    return false;
  }

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html }),
    });

    if (!resposta.ok) {
      console.error("Falha ao enviar e-mail:", await resposta.text());
      return false;
    }
    return true;
  } catch (erro) {
    console.error("Erro ao enviar e-mail:", erro);
    return false;
  }
}

export function montarEmailConfirmacao(dados: {
  nome: string;
  rifa: string;
  premio: string;
  codigo: string;
  numeros: string[];
  valorTotal: string;
  dataSorteio: Date;
  organizacao: string;
}): { assunto: string; html: string } {
  const numeros = dados.numeros
    .map(
      (numero) =>
        `<span style="display:inline-block;background:#2f8f5b;color:#fff;font-family:monospace;font-size:16px;font-weight:bold;padding:8px 12px;border-radius:6px;margin:0 6px 6px 0">${numero}</span>`,
    )
    .join("");

  return {
    assunto: `Pagamento confirmado — seus números da ${dados.rifa}`,
    html: `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <h1 style="color:#1c5c39;font-size:22px">Pagamento confirmado!</h1>
  <p>Olá, ${dados.nome}. Recebemos seu pagamento e seus números estão garantidos.</p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0">
    <p style="margin:0 0 4px;color:#64748b;font-size:13px">Seus números</p>
    <div style="margin:8px 0">${numeros}</div>
    <p style="margin:12px 0 0;color:#64748b;font-size:13px">
      Código da compra: <strong style="font-family:monospace;color:#0f172a">${dados.codigo}</strong>
    </p>
  </div>

  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#64748b">Rifa</td><td style="text-align:right">${dados.rifa}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Prêmio</td><td style="text-align:right">${dados.premio}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Valor pago</td><td style="text-align:right">R$ ${dados.valorTotal}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Sorteio</td><td style="text-align:right">${dados.dataSorteio.toLocaleDateString("pt-BR")}</td></tr>
  </table>

  <p style="margin-top:24px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px">
    O sorteio é apurado pelo 1º prêmio da Loteria Federal e pode ser conferido publicamente no site
    da Caixa Econômica Federal. Guarde o código da compra para consultar seus números a qualquer momento.
  </p>
  <p style="font-size:13px;color:#64748b">${dados.organizacao}</p>
</div>`,
  };
}
