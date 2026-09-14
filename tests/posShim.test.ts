import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O shim é o que liga o app web à maquininha. Aqui ele é carregado do
 * arquivo que vai dentro do APK e exercitado contra um lado nativo de
 * mentira — se o contrato mudar de um lado só, este teste quebra.
 */
const SHIM = readFileSync(
  resolve(import.meta.dirname, "../android/app/src/main/assets/rifa-pos-shim.js"),
  "utf8",
);

interface Nativo {
  version(): string;
  terminalName(): string;
  hasPrinter(): boolean;
  payAsync(json: string, id: string): void;
  printAsync(texto: string, id: string): void;
}

function carregarShim(nativo: Nativo | null) {
  const janela = globalThis as unknown as Record<string, unknown>;
  delete janela.RifaPOS;
  delete janela.__rifaPosResolve;
  janela.RifaPOSNative = nativo ?? undefined;
  janela.window = janela;
  // eslint-disable-next-line no-new-func
  new Function(SHIM)();
  return janela.RifaPOS as
    | {
        version: string;
        terminal: string;
        hasPrinter: boolean;
        pay(r: unknown): Promise<{ ok: boolean; authCode?: string; message?: string }>;
        print(t: string): Promise<void>;
      }
    | undefined;
}

function nativoFalso(overrides: Partial<Nativo> = {}): Nativo {
  return {
    version: () => "1.0",
    terminalName: () => "Moderninha Smart 2",
    hasPrinter: () => true,
    payAsync: () => {},
    printAsync: () => {},
    ...overrides,
  };
}

function responder(id: string, resposta: unknown) {
  (globalThis as unknown as Record<string, Function>).__rifaPosResolve(id, resposta);
}

describe("shim da maquininha", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("não cria ponte quando não há lado nativo — é o caso do navegador", () => {
    expect(carregarShim(null)).toBeUndefined();
  });

  it("expõe versão, modelo e impressora vindos do aparelho", () => {
    const ponte = carregarShim(nativoFalso())!;
    expect(ponte.version).toBe("1.0");
    expect(ponte.terminal).toBe("Moderninha Smart 2");
    expect(ponte.hasPrinter).toBe(true);
  });

  it("transforma o callback do Android em Promise resolvida", async () => {
    let capturado = "";
    const ponte = carregarShim(
      nativoFalso({ payAsync: (_json, id) => { capturado = id; } }),
    )!;

    const promessa = ponte.pay({ amountCents: 1470, orderCode: 48219, method: "credito" });
    responder(capturado, { ok: true, authCode: "NSU884201", terminal: "Smart 2" });

    await expect(promessa).resolves.toMatchObject({ ok: true, authCode: "NSU884201" });
  });

  it("entrega a requisição serializada como o Android espera", () => {
    let recebido = "";
    const ponte = carregarShim(
      nativoFalso({ payAsync: (json) => { recebido = json; } }),
    )!;
    ponte.pay({ amountCents: 500, orderCode: 7, method: "debito" });
    expect(JSON.parse(recebido)).toEqual({
      amountCents: 500,
      orderCode: 7,
      method: "debito",
    });
  });

  it("devolve recusa como resultado, não como exceção", async () => {
    let id = "";
    const ponte = carregarShim(nativoFalso({ payAsync: (_j, c) => { id = c; } }))!;
    const promessa = ponte.pay({ amountCents: 100, orderCode: 1, method: "credito" });
    responder(id, { ok: false, message: "Cartão sem saldo." });
    await expect(promessa).resolves.toEqual({ ok: false, message: "Cartão sem saldo." });
  });

  it("não deixa a Promise pendurada quando o nativo não responde", async () => {
    const ponte = carregarShim(nativoFalso())!;
    const promessa = ponte.pay({ amountCents: 100, orderCode: 1, method: "credito" });
    vi.advanceTimersByTime(120_001);
    await expect(promessa).resolves.toMatchObject({ ok: false });
  });

  it("resposta atrasada depois do prazo não explode", async () => {
    let id = "";
    const ponte = carregarShim(nativoFalso({ payAsync: (_j, c) => { id = c; } }))!;
    const promessa = ponte.pay({ amountCents: 100, orderCode: 1, method: "credito" });
    vi.advanceTimersByTime(120_001);
    await promessa;
    expect(() => responder(id, { ok: true })).not.toThrow();
  });

  it("erro do lado nativo vira recusa com motivo", async () => {
    const ponte = carregarShim(
      nativoFalso({
        payAsync: () => {
          throw new Error("ponte caiu");
        },
      }),
    )!;
    await expect(
      ponte.pay({ amountCents: 100, orderCode: 1, method: "credito" }),
    ).resolves.toEqual({ ok: false, message: "ponte caiu" });
  });

  it("impressão falha alto: quem chamou precisa saber que não saiu papel", async () => {
    let id = "";
    const ponte = carregarShim(nativoFalso({ printAsync: (_t, c) => { id = c; } }))!;
    const promessa = ponte.print("BILHETE");
    responder(id, { ok: false, message: "Sem papel." });
    await expect(promessa).rejects.toThrow("Sem papel.");
  });

  it("impressão bem-sucedida resolve sem valor", async () => {
    let id = "";
    const ponte = carregarShim(nativoFalso({ printAsync: (_t, c) => { id = c; } }))!;
    const promessa = ponte.print("BILHETE");
    responder(id, { ok: true });
    await expect(promessa).resolves.toBeUndefined();
  });

  it("injetar duas vezes não cria duas pontes", () => {
    const primeira = carregarShim(nativoFalso())!;
    // eslint-disable-next-line no-new-func
    new Function(SHIM)();
    expect((globalThis as unknown as Record<string, unknown>).RifaPOS).toBe(primeira);
  });
});
