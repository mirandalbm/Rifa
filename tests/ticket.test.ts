import { describe, it, expect } from "vitest";
import { escPosTicket, type TicketData } from "../server/services/ticketFormat";

const BILHETE: TicketData = {
  codigo: 48219,
  emitidoEm: "2026-09-14T12:00:00.000Z",
  administradora: {
    nome: "Rifas São José",
    cnpj: "12.345.678/0001-90",
    cidade: "São Paulo/SP",
    observacao: "Bilhete válido mediante pagamento confirmado.",
  },
  apostador: {
    nome: "Marina Souza Gonçalves",
    telefone: "(11) 98888-7777",
    cpf: "123.456.789-00",
  },
  rifa: {
    titulo: "iPhone 17 Pro Max",
    premio: "iPhone 17 Pro Max 256 GB",
    totalCotas: 1000,
    precoCota: 490,
    autorizacao: "SPA-MF-2026-1000",
  },
  sorteio: {
    data: "2026-09-28T00:00:00.000Z",
    metodo: "Loteria Federal + semente publicada (HMAC)",
    seedHash: "ea09a78139f33ac2d6d3a528fbd9a68c2b1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",
  },
  numeros: ["0010", "0011", "0016"],
  pagamento: {
    metodo: "Dinheiro",
    situacao: "PAGO",
    total: 1470,
    desconto: 0,
    autorizacao: null,
  },
  vendedor: { nome: "João Ribeiro", codigo: "JOAO7" },
};

describe("bilhete para a impressora térmica", () => {
  const texto = escPosTicket(BILHETE);
  const linhas = texto.split("\n");

  it("traz tudo que o apostador precisa conferir", () => {
    expect(texto).toContain("RIFAS SAO JOSE");
    expect(texto).toContain("48219");
    expect(texto).toContain("Marina Souza Goncalves");
    expect(texto).toContain("(11) 98888-7777");
    expect(texto).toContain("CPF 123.456.789-00");
    expect(texto).toContain("IPHONE 17 PRO MAX 256 GB");
    expect(texto).toContain("0010 0011 0016");
    expect(texto).toContain("PAGO");
    expect(texto).toContain("R$ 14,70");
  });

  it("identifica a administradora e a autorização da campanha", () => {
    expect(texto).toContain("CNPJ 12.345.678/0001-90");
    // Não cabe em 32 colunas, então quebra — e quebrar é o comportamento certo.
    expect(texto).toContain("Autorizacao SPA/MF:");
    expect(texto).toContain("SPA-MF-2026-1000");
  });

  it("registra o vendedor quando a venda foi na mão", () => {
    expect(texto).toContain("JOAO7");
    expect(texto).toContain("Joao Ribeiro");
  });

  it("publica o compromisso do sorteio", () => {
    expect(texto).toContain("Semente (hash):");
    expect(texto).toContain(BILHETE.sorteio.seedHash!.slice(0, 32));
  });

  it("cabe na bobina de 58 mm: nenhuma linha passa de 32 colunas", () => {
    for (const linha of linhas) {
      expect(linha.length, `linha larga demais: "${linha}"`).toBeLessThanOrEqual(32);
    }
  });

  it("não manda acento para a bobina, que imprimiria lixo", () => {
    expect(texto).not.toMatch(/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/);
  });

  it("não manda espaço não-quebrável, que sai como caractere estranho", () => {
    expect(texto).not.toMatch(/[\u00a0\u202f]/);
  });

  it("alinha o total à direita", () => {
    const total = linhas.find((l) => l.startsWith("TOTAL"));
    expect(total).toBeDefined();
    expect(total!.endsWith("R$ 14,70")).toBe(true);
  });

  it("quebra nome e prêmio longos em vez de cortar", () => {
    const longo = escPosTicket({
      ...BILHETE,
      apostador: {
        ...BILHETE.apostador,
        nome: "Maria Aparecida de Souza Albuquerque Cavalcanti",
      },
    });
    expect(longo).toContain("Maria Aparecida de Souza");
    expect(longo).toContain("Albuquerque Cavalcanti");
  });

  it("mostra desconto e autorização da maquininha quando existem", () => {
    const comCartao = escPosTicket({
      ...BILHETE,
      pagamento: {
        metodo: "Cartão (maquininha)",
        situacao: "PAGO",
        total: 1323,
        desconto: 147,
        autorizacao: "NSU 884201",
      },
    });
    expect(comCartao).toContain("Desconto");
    expect(comCartao).toContain("NSU 884201");
  });
});
