import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role, Section } from "@shared/access";
import { apiRequest } from "./queryClient";
import { definirAssistenteAberto } from "./assistente";

/**
 * O que é da pessoa e não pode passar para quem entrar em seguida na mesma
 * aba: a conversa com o assistente sai do cache (não basta invalidar — a tela
 * mostraria a de quem saiu até a nova chegar), e a coluna fecha.
 */
function esquecerAssistente(qc: ReturnType<typeof useQueryClient>, fecharColuna: boolean) {
  qc.removeQueries({ queryKey: ["/api/ia/conversa"] });
  qc.removeQueries({ queryKey: ["/api/ia/sessao"] });
  if (fecharColuna) definirAssistenteAberto(false);
}

export interface SessionInfo {
  role: Role;
  user: { name: string; email: string } | null;
  /** Apostador na sessão: `conta` = entrou numa conta; `confirmado` = telefone provado. */
  buyer: { phone: string; name: string; conta: boolean; confirmado: boolean } | null;
  sections: Section[];
  home: string;
  /** Organizador: a organização dele (ele vê a plataforma pelo próprio perfil). */
  organizacao?: { slug: string; nome: string } | null;
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
    mutationFn: async (creds: {
      email: string;
      password: string;
      token?: string;
      lembrar?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return (await res.json()) as SessionInfo;
    },
    onSuccess: () => {
      esquecerAssistente(qc, false);
      return qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      esquecerAssistente(qc, true);
      return qc.invalidateQueries();
    },
  });
}
