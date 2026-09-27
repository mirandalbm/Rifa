import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, CalendarClock, Gift, PartyPopper, ReceiptText, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  url: string;
  lida: boolean;
  createdAt: string;
}

const ICONE: Record<string, LucideIcon> = {
  rifa_nova: Gift,
  sorteio_chegando: CalendarClock,
  sorteio_adiado: CalendarClock,
  resultado: Trophy,
  reembolso: ReceiptText,
};

const tempo = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString("pt-BR");
};

/** Hoje, esta semana, antes — como a tela de notificações do Instagram. */
function grupo(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  return Date.now() - d.getTime() < 7 * 86_400_000 ? "Últimos 7 dias" : "Antes";
}

/**
 * A central de avisos do apostador (o coração no topo): rifa nova de quem
 * segue, sorteio chegando ou adiado, resultado e reembolso. Abrir marca
 * tudo como lido; o aviso novo fica destacado nesta visita.
 */
export default function Notificacoes() {
  const qc = useQueryClient();
  const [, navegar] = useLocation();
  const { data: sessao } = useSession();
  const logado = Boolean(sessao?.buyer);
  const { data, isLoading } = useQuery<{ naoLidas: number; lista: Aviso[] }>({
    queryKey: ["/api/public/notificacoes"],
    enabled: logado,
  });
  const ler = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/notificacoes/lidas"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/public/notificacoes/resumo"] }),
  });
  useEffect(() => {
    if (data?.naoLidas) ler.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.naoLidas]);

  const grupos = new Map<string, Aviso[]>();
  for (const a of data?.lista ?? []) {
    const g = grupo(a.createdAt);
    grupos.set(g, [...(grupos.get(g) ?? []), a]);
  }

  return (
    <PublicShell>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : navegar("/"))}
          className="rounded-md p-1 hover:bg-mist"
          aria-label="Voltar"
        >
          <ArrowLeft size={22} aria-hidden />
        </button>
        <h1 className="flex-1 font-display text-xl font-bold">Notificações</h1>
        <Link href="/minhas-compras" className="rounded-md p-1 hover:bg-mist" aria-label="Ligar avisos no celular">
          <Bell size={20} aria-hidden />
        </Link>
      </div>

      {!logado ? (
        <div className="space-y-3 rounded-xl border border-line p-4 text-sm">
          <p>Entre para ver seus avisos: rifas novas de quem você segue, sorteios e resultados.</p>
          <Link
            href="/entrar"
            className="inline-block rounded-md bg-green px-4 py-2 text-sm font-semibold text-on-green hover:brightness-95"
          >
            Entrar
          </Link>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : !data?.lista.length ? (
        <Empty>
          <span className="flex flex-col items-center gap-2">
            <PartyPopper size={28} aria-hidden />
            Nenhum aviso ainda. Siga um perfil e ligue o sino para saber das rifas novas.
          </span>
        </Empty>
      ) : (
        [...grupos.entries()].map(([nome, avisos]) => (
          <section key={nome} className="mb-4">
            <h2 className="mb-1 font-display text-base font-bold">{nome}</h2>
            <ul className="-mx-4 divide-y divide-line">
              {avisos.map((a) => {
                const Icone = ICONE[a.tipo] ?? Bell;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.url}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-mist ${a.lida ? "" : "bg-green-soft"}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 bg-white">
                        <Icone size={20} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <b>{a.titulo}</b> <span className="text-ink-2">{a.corpo}</span>{" "}
                        <span className="tnum text-xs text-muted">{tempo(a.createdAt)}</span>
                        {a.lida ? null : <span className="sr-only"> (novo)</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </PublicShell>
  );
}
