import { Clapperboard, Search, Send, type LucideIcon } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { EM_BREVE } from "@shared/console";

const ICONE: Record<keyof typeof EM_BREVE, LucideIcon> = { reels: Clapperboard, mensagens: Send, buscar: Search };

/**
 * Os botões do console que ainda não existem levam aqui: o app em
 * desenvolvimento mostra o panorama da forma final, e a tela diz o que vem.
 */
export function EmBreve({ tela }: { tela: keyof typeof EM_BREVE }) {
  const Icone = ICONE[tela];
  const { titulo, texto } = EM_BREVE[tela];
  return (
    <PublicShell>
      <section className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink">
          <Icone size={36} strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">{titulo}</h1>
        <p className="mt-1 inline-block rounded-full bg-yellow-soft px-3 py-0.5 text-xs font-semibold text-yellow-deep">Em breve</p>
        <p className="mt-3 max-w-sm text-sm text-ink-2">{texto}</p>
      </section>
    </PublicShell>
  );
}

export const Reels = () => <EmBreve tela="reels" />;
export const Mensagens = () => <EmBreve tela="mensagens" />;
export const Buscar = () => <EmBreve tela="buscar" />;
