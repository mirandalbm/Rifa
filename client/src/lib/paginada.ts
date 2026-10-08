import { useInfiniteQuery } from "@tanstack/react-query";

/**
 * Lista do painel que anda por chave (`shared/paginacao.ts`): a primeira
 * página abre sozinha, e "Ver mais" pede a seguinte com o cursor que o
 * servidor mandou no cabeçalho `X-Proximo` da página anterior. Sem cursor,
 * acabou — o botão some, e ninguém contou linha para saber disso.
 */
export function useListaPaginada<T>(
  url: string,
  params: Record<string, string | null | undefined> = {},
  opcoes: { enabled?: boolean } = {},
) {
  const consulta = useInfiniteQuery({
    queryKey: [url, params],
    enabled: opcoes.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      for (const [chave, valor] of Object.entries(params)) if (valor) q.set(chave, valor);
      if (pageParam) q.set("antes", pageParam);
      const res = await fetch(q.size ? `${url}?${q}` : url, { credentials: "include" });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(corpo?.message ?? `${res.status}: ${res.statusText}`);
      }
      return { dados: (await res.json()) as T, proximo: res.headers.get("x-proximo") };
    },
    getNextPageParam: (ultima) => ultima.proximo,
  });
  return {
    ...consulta,
    /** Todas as páginas já carregadas, na ordem. */
    paginas: consulta.data?.pages.map((p) => p.dados) ?? [],
  };
}
