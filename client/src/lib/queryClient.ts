import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * O servidor responde erro como { message }. Extrair aqui é o que faz a
 * mensagem chegar legível na tela — sem isso o usuário lê JSON cru.
 */
async function throwIfResNotOk(res: Response) {
  if (res.ok) return;

  const text = (await res.text()) || res.statusText;
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (parsed?.message) message = parsed.message;
  } catch {
    // resposta não-JSON: fica o texto mesmo
  }
  throw new ApiError(message, res.status);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Handle query parameters properly - only join string parts of queryKey
    const baseUrl = queryKey[0] as string;
    const params = queryKey[1] as Record<string, any> | undefined;
    
    let url = baseUrl;
    if (params && typeof params === 'object') {
      // Convert params object to URL search params
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== 'all') {
          searchParams.append(key, String(value));
        }
      });
      const paramString = searchParams.toString();
      if (paramString) {
        url += `?${paramString}`;
      }
    }
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
