import { describe, expect, it } from "vitest";
import {
  PAGARME_PADRAO,
  autorizacaoBasic,
  baseDoPagarme,
  chaveDoEstorno,
  corpoDoPedidoPagarme,
  documentoDoPagarme,
  erroDoPagarme,
  estornadaInteira,
  eventoDoPagarme,
  idDeCobrancaValido,
  idDeEventoValido,
  lerCobrancaPagarme,
  lerPedidoPagarme,
  payloadDoPagarme,
  problemaNoEstornoParcial,
  problemaNoPagadorDoPagarme,
  segredoConfere,
  consultaIndisponivel,
  contestacaoInteira,
  ErroDoPagarme,
  telefoneDoPagarme,
  venceEmDoPagarme,
} from "../server/payments/pagarme";
import { EXIGE_CPF, EXIGE_EMAIL, PROVEDORES_PIX, CREDENCIAIS_PROVEDOR, NOME_PROVEDOR } from "../shared/plataforma";
import { emailValido } from "../shared/format";

const PIX = "00020126580014BR.GOV.BCB.PIX0136abc5204000053039865802BR6009SAO PAULO62070503***6304ABCD";
const dados = (mudar: Record<string, unknown> = {}) => ({
  orderCode: 12345678,
  amountCents: 1990,
  description: "Rifa do carro — 2 cota(s)",
  payer: { name: "Ana Souza", phone: "11987654321", cpf: "529.982.247-25", email: "ana@exemplo.com.br" },
  expiresAt: new Date("2026-10-12T15:30:45.123Z"),
  ...mudar,
});

describe("Pagar.me: registro do provedor", () => {
  it("entra na lista, com as duas variáveis, o CPF e o e-mail obrigatórios", () => {
    expect(PROVEDORES_PIX).toContain("pagarme");
    expect(NOME_PROVEDOR.pagarme).toBe("Pagar.me");
    expect(CREDENCIAIS_PROVEDOR.pagarme).toEqual(["PAGARME_SECRET_KEY", "PAGARME_WEBHOOK_TOKEN"]);
    expect(EXIGE_CPF.pagarme).toBe(true);
    expect(EXIGE_EMAIL.pagarme).toBe(true);
    expect(EXIGE_EMAIL.asaas).toBe(false);
    expect(EXIGE_EMAIL.mercadopago).toBe(false);
  });
});

describe("Pagar.me: endereço e chave", () => {
  it("troca o endereço só fora de produção", () => {
    expect(baseDoPagarme({ NODE_ENV: "production", PAGARME_API_URL: "http://127.0.0.1:1/core/v5" })).toBe(PAGARME_PADRAO);
    expect(baseDoPagarme({ NODE_ENV: "development", PAGARME_API_URL: "http://127.0.0.1:1/core/v5/" })).toBe("http://127.0.0.1:1/core/v5");
    expect(baseDoPagarme({ NODE_ENV: "development" })).toBe(PAGARME_PADRAO);
  });
  it("Basic com a chave e senha vazia", () => {
    expect(autorizacaoBasic("sk_test_x")).toBe(`Basic ${Buffer.from("sk_test_x:").toString("base64")}`);
  });
  it("o segredo do webhook confere só igual", () => {
    expect(segredoConfere("abc123", "abc123")).toBe(true);
    expect(segredoConfere("abc124", "abc123")).toBe(false);
    expect(segredoConfere("abc", "abc123")).toBe(false);
    expect(segredoConfere(undefined, "abc123")).toBe(false);
    expect(segredoConfere(["abc123"], "abc123")).toBe(false);
    expect(segredoConfere("", "")).toBe(false);
  });
});

describe("Pagar.me: documento, telefone e e-mail", () => {
  it("CPF é pessoa, CNPJ é empresa, dígito errado não passa", () => {
    expect(documentoDoPagarme("529.982.247-25")).toEqual({ document: "52998224725", type: "individual" });
    expect(documentoDoPagarme("11.222.333/0001-81")).toEqual({ document: "11222333000181", type: "company" });
    expect(documentoDoPagarme("529.982.247-24")).toBeNull();
    expect(documentoDoPagarme("111.111.111-11")).toBeNull();
    expect(documentoDoPagarme(undefined)).toBeNull();
  });
  it("telefone com DDD, celular de 9 começando por 9, fixo de 8, com ou sem 55", () => {
    expect(telefoneDoPagarme("(11) 98765-4321")).toEqual({ country_code: "55", area_code: "11", number: "987654321" });
    expect(telefoneDoPagarme("5521 2218-0513")).toEqual({ country_code: "55", area_code: "21", number: "22180513" });
    expect(telefoneDoPagarme("11 88765-4321")).toBeNull();
    expect(telefoneDoPagarme("01 98765-4321")).toBeNull();
    expect(telefoneDoPagarme("987654321")).toBeNull();
    expect(telefoneDoPagarme("11 99999-9999")).toBeNull();
    expect(telefoneDoPagarme("pendente:abc")).toBeNull();
  });
  it("e-mail no formato", () => {
    expect(emailValido("ana@exemplo.com.br")).toBe(true);
    expect(emailValido(" ana@exemplo.com ")).toBe(true);
    expect(emailValido("ana@exemplo")).toBe(false);
    expect(emailValido("ana exemplo@x.com")).toBe(false);
    expect(emailValido("")).toBe(false);
    expect(emailValido(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

describe("Pagar.me: corpo do pedido", () => {
  it("um item em centavos, o cliente com os quatro dados, Pix com o vencimento, sem split", () => {
    const c = corpoDoPedidoPagarme({ ...dados(), split: [{ walletId: "x", percentual: 90 }] } as never);
    expect(c.items).toEqual([{ amount: 1990, description: "Rifa do carro — 2 cota(s)", quantity: 1, code: "12345678" }]);
    expect(c.customer).toEqual({
      name: "Ana Souza",
      email: "ana@exemplo.com.br",
      type: "individual",
      document: "52998224725",
      phones: { mobile_phone: { country_code: "55", area_code: "11", number: "987654321" } },
    });
    expect(c.payments).toEqual([{ payment_method: "pix", pix: { expires_at: "2026-10-12T15:30:45" } }]);
    expect(c.code).toBe("12345678");
    expect(c.metadata).toEqual({ pedido: "12345678" });
    expect(JSON.stringify(c)).not.toContain("split");
  });
  it("vencimento em UTC sem os milissegundos", () => {
    expect(venceEmDoPagarme(new Date("2026-01-02T03:04:05.999Z"))).toBe("2026-01-02T03:04:05");
  });
  it("recusa (400) sem e-mail, sem documento, sem telefone ou sem nome", () => {
    const erro = (m: Record<string, unknown>) => {
      try {
        corpoDoPedidoPagarme(dados(m) as never);
        return null;
      } catch (e) {
        return e as { status?: number; message: string };
      }
    };
    const semEmail = erro({ payer: { name: "Ana", phone: "11987654321", cpf: "52998224725" } });
    expect(semEmail?.status).toBe(400);
    expect(semEmail?.message).toMatch(/e-mail/);
    expect(erro({ payer: { name: "Ana", phone: "11987654321", email: "a@b.co" } })?.status).toBe(400);
    expect(erro({ payer: { name: "Ana", phone: "", cpf: "52998224725", email: "a@b.co" } })?.status).toBe(400);
    expect(erro({ payer: { name: " ", phone: "11987654321", cpf: "52998224725", email: "a@b.co" } })?.status).toBe(400);
    expect(erro({ amountCents: 0 })).not.toBeNull();
  });
});

describe("Pagar.me: leitura das respostas", () => {
  const vence = new Date("2026-10-12T15:30:00Z");
  it("o id é o da cobrança, não o do pedido, com o copia e cola", () => {
    const r = lerPedidoPagarme(
      { id: "or_abc", charges: [{ id: "ch_abc123", payment_method: "pix", status: "pending", last_transaction: { status: "waiting_payment", qr_code: PIX, expires_at: "2026-10-12T15:30:00Z" } }] },
      vence,
    );
    expect(r).toEqual({ chargeId: "ch_abc123", copyPaste: PIX, expiresAt: vence });
  });
  it("vencimento de lá só vale se for antes do nosso", () => {
    const depois = lerPedidoPagarme({ charges: [{ id: "ch_a", last_transaction: { qr_code: PIX, expires_at: "2026-10-13T00:00:00Z" } }] }, vence);
    expect(depois.expiresAt).toEqual(vence);
    const antes = lerPedidoPagarme({ charges: [{ id: "ch_a", last_transaction: { qr_code: PIX, expires_at: "2026-10-12T15:00:00Z" } }] }, vence);
    expect(antes.expiresAt).toEqual(new Date("2026-10-12T15:00:00Z"));
  });
  it("transação em falha, sem cobrança, sem código ou id estranho é erro", () => {
    expect(() => lerPedidoPagarme({ charges: [{ id: "ch_a", status: "failed", last_transaction: { status: "failed" } }] }, vence)).toThrow();
    expect(() => lerPedidoPagarme({ charges: [] }, vence)).toThrow();
    expect(() => lerPedidoPagarme({ charges: [{ id: "ch_a", last_transaction: {} }] }, vence)).toThrow();
    expect(() => lerPedidoPagarme({ charges: [{ id: "ch_../x", last_transaction: { qr_code: PIX } }] }, vence)).toThrow();
    expect(() => lerPedidoPagarme(null, vence)).toThrow();
  });
  it("a cobrança lida só com inteiros", () => {
    expect(lerCobrancaPagarme({ id: "ch_a", status: "paid", amount: 1990, paid_amount: 1990 })).toEqual({
      id: "ch_a",
      status: "paid",
      amountCents: 1990,
      pagoCents: 1990,
      canceladoCents: 0,
    });
    expect(lerCobrancaPagarme({ id: "ch_a", status: "paid", amount: "1990", paid_amount: 19.9 }).pagoCents).toBeNull();
    expect(() => lerCobrancaPagarme({ status: "paid" })).toThrow();
  });
  it("o id do evento e o da cobrança só no formato", () => {
    expect(idDeEventoValido("hook_ABC123")).toBe(true);
    expect(idDeEventoValido("hook_")).toBe(false);
    expect(idDeEventoValido("ch_ABC")).toBe(false);
    expect(idDeCobrancaValido("ch_ABC123")).toBe(true);
    expect(idDeCobrancaValido("ch_A/B")).toBe(false);
    expect(idDeCobrancaValido(123)).toBe(false);
  });
});

describe("Pagar.me: o evento depois da consulta", () => {
  const c = (status: string, mudar: Partial<{ amountCents: number; pagoCents: number | null; canceladoCents: number }> = {}) => ({
    status,
    amountCents: 1000,
    pagoCents: 1000,
    canceladoCents: 0,
    ...mudar,
  });
  it("charge.paid só paga com a cobrança paga; pendente pede nova entrega", () => {
    expect(eventoDoPagarme("charge.paid", c("paid"))).toBe("paid");
    expect(eventoDoPagarme("charge.paid", c("pending"))).toBeNull();
    expect(eventoDoPagarme("charge.paid", c("processing"))).toBeNull();
    expect(eventoDoPagarme("charge.paid", c("canceled"))).toBe("ignored");
    expect(eventoDoPagarme("charge.paid", c("failed"))).toBe("ignored");
  });
  it("charge.refunded só com o estorno inteiro", () => {
    expect(eventoDoPagarme("charge.refunded", c("refunded", { canceladoCents: 1000 }))).toBe("refunded");
    expect(eventoDoPagarme("charge.refunded", c("canceled", { canceladoCents: 1000 }))).toBe("refunded");
    // Sem o valor cancelado, na dúvida, não desfaz nada.
    expect(eventoDoPagarme("charge.refunded", c("refunded"))).toBe("ignored");
    expect(eventoDoPagarme("charge.refunded", c("paid", { canceladoCents: 300 }))).toBe("ignored");
    expect(eventoDoPagarme("charge.refunded", c("refunded", { canceladoCents: 300 }))).toBe("ignored");
    expect(eventoDoPagarme("charge.refunded", c("canceled", { canceladoCents: 0 }))).toBe("ignored");
    expect(eventoDoPagarme("charge.refunded", c("paid"))).toBe("ignored");
  });
  it("o resto, inclusive a devolução parcial, é ignorado", () => {
    expect(eventoDoPagarme("charge.partial_canceled", c("paid", { canceladoCents: 300 }))).toBe("ignored");
    expect(eventoDoPagarme("order.paid", c("paid"))).toBe("ignored");
    expect(estornadaInteira(c("pending"))).toBe(false);
  });
});

describe("Pagar.me: pago a mais, a menos e contestação", () => {
  const c = (status: string) => ({ status, amountCents: 1000, pagoCents: 1000, canceladoCents: 0 });
  it("overpaid paga; underpaid é ignorado", () => {
    expect(eventoDoPagarme("charge.paid", c("overpaid"))).toBe("paid");
    expect(eventoDoPagarme("charge.overpaid", c("overpaid"))).toBe("paid");
    expect(eventoDoPagarme("charge.paid", c("underpaid"))).toBe("ignored");
    expect(eventoDoPagarme("charge.underpaid", c("underpaid"))).toBe("ignored");
  });
  it("contestação confirmada pela API desfaz; sem a API confirmar, não", () => {
    const contestada = (cancelado: number) => ({ ...c("chargedback"), canceladoCents: cancelado });
    expect(eventoDoPagarme("charge.chargedback", contestada(1000))).toBe("refunded");
    expect(eventoDoPagarme("charge.refunded", contestada(1000))).toBe("refunded");
    // Contestação parcial, ou sem o valor contestado: ignorada (vai ao log).
    expect(eventoDoPagarme("charge.chargedback", contestada(400))).toBe("ignored");
    expect(eventoDoPagarme("charge.chargedback", contestada(0))).toBe("ignored");
    expect(contestacaoInteira(contestada(1000))).toBe(true);
    expect(contestacaoInteira(contestada(999))).toBe(false);
    expect(eventoDoPagarme("charge.chargedback", c("paid"))).toBe("ignored");
    // O status sozinho não vale: o evento precisa ser de devolução.
    expect(eventoDoPagarme("charge.paid", c("chargedback"))).toBe("ignored");
  });
});

describe("Pagar.me: quem paga, antes de reservar", () => {
  it("e-mail no formato e até 64, telefone no formato do Pagar.me", () => {
    expect(problemaNoPagadorDoPagarme({ email: "ana@exemplo.com", phone: "11987654321" })).toBeNull();
    expect(problemaNoPagadorDoPagarme({ email: "", phone: "11987654321" })).toMatch(/e-mail/);
    expect(problemaNoPagadorDoPagarme({ email: `${"a".repeat(60)}@x.com`, phone: "11987654321" })).toMatch(/até 64/);
    expect(problemaNoPagadorDoPagarme({ email: "ana@exemplo.com", phone: "11 88765-4321" })).toMatch(/WhatsApp/);
    expect(problemaNoPagadorDoPagarme({ email: "ana@exemplo.com", phone: null })).toMatch(/WhatsApp/);
  });
  it("o corpo recusa o e-mail longo, nunca corta", () => {
    const longo = `${"a".repeat(60)}@x.com`;
    expect(() =>
      corpoDoPedidoPagarme({ ...dados(), payer: { name: "Ana", phone: "11987654321", cpf: "52998224725", email: longo } } as never),
    ).toThrow(/até 64/);
  });
});

describe("Pagar.me: o que fica do webhook", () => {
  it("só o id, o tipo e a cobrança — nunca o cliente", () => {
    const raw = JSON.stringify({
      id: "hook_ABC",
      type: "charge.paid",
      data: { id: "ch_X", customer: { name: "Ana", email: "ana@x.com", document: "52998224725", phones: {} } },
    });
    const g = payloadDoPagarme(raw);
    expect(g).toEqual({ id: "hook_ABC", type: "charge.paid", data: { id: "ch_X" } });
    expect(JSON.stringify(g)).not.toMatch(/Ana|ana@|52998224725/);
    expect(payloadDoPagarme("não é json")).toEqual({ id: null, type: null, data: { id: null } });
  });
});

describe("Pagar.me: a consulta fora do ar", () => {
  it("sem resposta ou 5xx é indisponível (503 no webhook); 4xx e outro erro não", () => {
    const semResposta = new ErroDoPagarme("rede");
    semResposta.semResposta = true;
    const de500 = new ErroDoPagarme("500");
    de500.httpStatus = 502;
    const de404 = new ErroDoPagarme("404");
    de404.httpStatus = 404;
    expect(consultaIndisponivel(semResposta)).toBe(true);
    expect(consultaIndisponivel(de500)).toBe(true);
    expect(consultaIndisponivel(de404)).toBe(false);
    expect(consultaIndisponivel(new Error("outro"))).toBe(false);
    expect(new ErroDoPagarme("x").depoisDeChamar).toBe(false);
  });
});

describe("Pagar.me: estorno parcial conferido", () => {
  it("saiu exatamente o pedido: ok; repetição com a transação do valor: ok", () => {
    expect(problemaNoEstornoParcial(300, 0, { canceled_amount: 300 })).toBeNull();
    expect(problemaNoEstornoParcial(300, 500, { canceled_amount: 800 })).toBeNull();
    expect(problemaNoEstornoParcial(300, 300, { canceled_amount: 300, last_transaction: { amount: 300 } })).toBeNull();
  });
  it("o Pagar.me ignorou o amount, devolveu outro valor ou não disse: erro", () => {
    expect(problemaNoEstornoParcial(300, 0, { canceled_amount: 1000 })).toMatch(/1000/);
    expect(problemaNoEstornoParcial(300, 0, { canceled_amount: 200 })).not.toBeNull();
    expect(problemaNoEstornoParcial(300, 0, {})).toMatch(/não confirmou/);
    expect(problemaNoEstornoParcial(300, 300, { canceled_amount: 300 })).not.toBeNull();
  });
});

describe("Pagar.me: estorno", () => {
  it("a chave leva a cobrança, quem devolve e o valor", () => {
    expect(chaveDoEstorno("ch_a", 300, "pedido-1")).toBe("estorno-ch_a-pedido-1-300");
    expect(chaveDoEstorno("ch_a")).toBe("estorno-ch_a-cobranca-total");
    expect(chaveDoEstorno("ch_a", 300, "pedido-1")).not.toBe(chaveDoEstorno("ch_a", 300, "pedido-2"));
  });
  it("o erro não leva o corpo inteiro", () => {
    expect(erroDoPagarme(500, '{"message":"Erro interno"}')).toBe("Pagar.me recusou (500): Erro interno");
    expect(erroDoPagarme(502, "<html>ana@exemplo.com</html>")).toBe("Pagar.me recusou (502).");
  });
});
