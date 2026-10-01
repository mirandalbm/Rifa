import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

/**
 * "Mensagem" no perfil: leva à caixa já com o destino preenchido (o `para`
 * é o @apelido ou o endereço da organização). Só aparece com as mensagens
 * ligadas pela plataforma; quem não tem conta é levado a entrar pela
 * própria tela de mensagens. A pergunta é a mesma do resto do app
 * (`/api/public/app`), sem depender do console.
 */
export function BotaoMensagem({ para, compacto = false }: { para: string; compacto?: boolean }) {
  const { data } = useQuery<{ mensagensLigado?: boolean }>({ queryKey: ["/api/public/app"], staleTime: 60_000 });
  if (!data?.mensagensLigado) return null;
  return (
    <Link
      href={`/mensagens?para=${encodeURIComponent(para)}`}
      className={`rounded-md border border-line-2 font-semibold text-ink hover:bg-mist ${compacto ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"}`}
    >
      Mensagem
    </Link>
  );
}
