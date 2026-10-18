import { useQuery } from "@tanstack/react-query";
import { TONS_DO_BOTAO } from "@/components/bits";
import { noEnderecoDaOrganizacao } from "@/lib/endereco";

/**
 * "Continuar com o Google": só aparece se a plataforma tiver o acesso
 * configurado. É um link comum — a ida e a volta são redirecionamentos do
 * navegador, e o servidor decide quem entrou. `volta` é caminho do próprio
 * site (o servidor descarta qualquer outro).
 */
export function BotaoGoogle({ volta = "/" }: { volta?: string }) {
  const { data } = useQuery<{ ligado: boolean }>({ queryKey: ["/api/public/conta/google/disponivel"] });
  // O login do Google é um só, no domínio principal (a URL de retorno é uma): no endereço da organização não há o botão.
  if (!data?.ligado || noEnderecoDaOrganizacao()) return null;
  return (
    <div>
      <a
        href={`/api/public/conta/google/entrar?volta=${encodeURIComponent(volta)}`}
        className={`flex h-10 w-full items-center justify-center gap-3 rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.cinza}`}
      >
        {/* Marca oficial do Google: as cores são dela, não da paleta do sistema. */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.100 1.4-4.8 2.3-8.4 2.300-6.300 0-11.600-4.1-13.5-9.8l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
        </svg>
        Continuar com o Google
      </a>
      {/* O "ou" entre as duas portas, com o traço dos dois lados (só desenho). */}
      <p className="mt-3.5 flex items-center gap-3 text-xs text-muted">
        <span aria-hidden className="h-px flex-1 bg-line" />
        ou
        <span aria-hidden className="h-px flex-1 bg-line" />
      </p>
    </div>
  );
}
