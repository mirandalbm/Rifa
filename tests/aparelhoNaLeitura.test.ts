import { afterEach, describe, expect, it, vi } from "vitest";

// O comprovante do clique patrocinado é assinado para o aparelho que pediu a
// lista: se a leitura (GET pelo React Query) não levar o `x-device-id`, o
// servidor devolve comprovante nulo e nenhum clique de verdade é cobrado.
describe("leitura pelo React Query leva o aparelho", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("o GET manda x-device-id, o mesmo do POST", async () => {
    const guardado = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
    });
    const chamadas: { url: string; headers?: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
      chamadas.push({ url, headers: init?.headers });
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const { getQueryFn, apiRequest } = await import("../client/src/lib/queryClient");
    const ler = getQueryFn({ on401: "throw" }) as (ctx: { queryKey: unknown[] }) => Promise<unknown>;
    await ler({ queryKey: ["/api/public/patrocinadas"] });
    await apiRequest("POST", "/api/public/patrocinadas/x/clique", {});
    const [get, post] = chamadas;
    expect(get.headers?.["x-device-id"]).toBeTruthy();
    expect(get.headers?.["x-device-id"]).toBe(post.headers?.["x-device-id"]);
  });
});
