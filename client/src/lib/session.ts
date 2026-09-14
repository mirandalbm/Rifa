import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role, Section } from "@shared/access";
import { apiRequest } from "./queryClient";

export interface SessionInfo {
  role: Role;
  user: { name: string; email: string } | null;
  buyer: { phone: string } | null;
  sections: Section[];
  home: string;
}

/**
 * A sessão manda no app inteiro: o mesmo build atende comprador, afiliado e
 * administrador, e é o papel devolvido aqui que decide o que aparece.
 * Esconder no cliente é conveniência — quem barra de verdade é o servidor.
 */
export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ["/api/auth/me"],
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return (await res.json()) as SessionInfo;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
