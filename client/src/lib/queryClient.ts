import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Identificador do aparelho: um número aleatório guardado no próprio
 * navegador. Não identifica a pessoa — serve para o antifraude perceber
 * que cinquenta compras vieram do mesmo celular.
 */
function deviceId(): string {
  try {
    const guardado = localStorage.getItem("rifa.device");
    if (guardado) return guardado;
    const novo = crypto.randomUUID();
    localStorage.setItem("rifa.device", novo);
    return novo;
  } catch {
    // Navegador anônimo ou armazenamento bloqueado: segue sem identificador.
    return "";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Motivo legível por código, quando o servidor manda um (ex.: totp_required). */
    readonly code?: string,
    /** O corpo inteiro da resposta de erro (ex.: `slug` da rifa do carrinho). */
    readonly corpo?: Record<string, unknown>,
  ) {
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
  let code: string | undefined;
  let corpo: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(text) as { message?: string; code?: string };
    if (parsed?.message) message = parsed.message;
    code = parsed?.code;
    corpo = parsed as Record<string, unknown>;
  } catch {
    // resposta não-JSON: fica o texto mesmo
  }
  throw new ApiError(message, res.status, code, corpo);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  const aparelho = deviceId();
  if (aparelho) headers["x-device-id"] = aparelho;

  const res = await fetch(url, {
    method,
    headers,
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
    
    // O aparelho vai também nas leituras: a lista de patrocinadas assina o
    // comprovante de exibição para ele, e sem o cabeçalho nenhum clique seria cobrado.
    const aparelho = deviceId();
    const res = await fetch(url, {
      credentials: "include",
      headers: aparelho ? { "x-device-id": aparelho } : undefined,
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
