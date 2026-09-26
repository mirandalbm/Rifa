import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { consultarCep, limparCacheDeCep } from "../server/services/cep";

describe("consulta de CEP", () => {
  let chamadas: string[];

  beforeEach(() => {
    chamadas = [];
    limparCacheDeCep();
  });
  afterEach(() => vi.unstubAllGlobals());

  function responde(status: number, corpo: unknown) {
    vi.stubGlobal("fetch", async (url: string) => {
      chamadas.push(url);
      return new Response(JSON.stringify(corpo), { status });
    });
  }

  it("traduz a resposta do ViaCEP e guarda", async () => {
    responde(200, {
      cep: "13015-904",
      logradouro: "Rua Barão de Jaguara",
      bairro: "Centro",
      localidade: "Campinas",
      uf: "SP",
    });
    const r = await consultarCep("13015-904");
    expect(r).toEqual({
      cep: "13015904",
      logradouro: "Rua Barão de Jaguara",
      bairro: "Centro",
      cidade: "Campinas",
      uf: "SP",
    });
    await consultarCep("13015904");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain("/13015904/json/");
  });

  it("CEP inexistente vem como 200 com erro", async () => {
    responde(200, { erro: true });
    expect(await consultarCep("99999998")).toBe("nao_encontrado");
  });

  it("CEP malformado nem sai para a rede", async () => {
    responde(200, {});
    expect(await consultarCep("123")).toBe("invalido");
    expect(await consultarCep("123456789")).toBe("invalido");
    expect(chamadas).toHaveLength(0);
  });

  it("serviço fora do ar vira resposta, não exceção, e não fica guardado", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    expect(await consultarCep("01310100")).toBe("indisponivel");
    responde(500, {});
    expect(await consultarCep("01310100")).toBe("indisponivel");
    responde(200, { localidade: "São Paulo", uf: "SP", bairro: "Bela Vista", logradouro: "Avenida Paulista" });
    expect(await consultarCep("01310100")).toMatchObject({ cidade: "São Paulo" });
  });
});
