import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { abrirAssistente, fecharAssistente, removerAssistente, type SessaoDoAssistente } from "@/lib/assistente";

/**
 * O botão do assistente de IA na barra de cima do painel (master e
 * organizador). Só existe se a plataforma ligou e o servidor entregou a
 * sessão; o script do Chatbase só carrega no primeiro toque. Ao sair do
 * painel, o assistente é desmontado por inteiro.
 */
export function AssistenteDoPainel() {
  const { data } = useQuery<SessaoDoAssistente>({ queryKey: ["/api/admin/ia/sessao"], staleTime: 5 * 60_000 });
  const [aberto, setAberto] = useState(false);
  const agente = useRef<string | undefined>(undefined);
  agente.current = data?.agenteId;

  useEffect(() => () => removerAssistente(agente.current), []);

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
