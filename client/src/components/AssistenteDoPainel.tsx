import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { SessaoDaIA } from "@shared/ia";
import { abrirAssistente, assistenteAberto, cicloDoPainel, fecharAssistente } from "@/lib/assistente";

/**
 * O botão do assistente de IA na barra de cima do painel (master e
 * organizador). Só existe se a plataforma ligou e o servidor entregou a
 * sessão; o script do Chatbase só carrega no primeiro toque. O assistente
 * segue aberto ao trocar de tela do painel e é desmontado por inteiro ao sair
 * do painel ou da conta (`cicloDoPainel`).
 */
export function AssistenteDoPainel() {
  const { data } = useQuery<SessaoDaIA>({ queryKey: ["/api/admin/ia/sessao"], staleTime: 5 * 60_000 });
  const [aberto, setAberto] = useState(assistenteAberto);

  useEffect(() => {
    cicloDoPainel.montou();
    return () => cicloDoPainel.desmontou();
  }, []);

  if (!data?.ligado) return null;
  return (
    <button
      type="button"
      aria-pressed={aberto}
      aria-label={aberto ? "Fechar o assistente" : "Abrir o assistente"}
      title="Assistente"
      onClick={() => {
        if (aberto) fecharAssistente();
        else abrirAssistente(data);
        setAberto(!aberto);
      }}
      className={`rounded-md p-1.5 hover:bg-mist-2 ${aberto ? "bg-mist-2 text-green-deep" : "text-ink-2"}`}
    >
      <Sparkles size={20} aria-hidden />
    </button>
  );
}
