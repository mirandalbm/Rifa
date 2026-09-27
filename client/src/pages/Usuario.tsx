import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { FotoDoApostador } from "@/components/PerfilDoApostador";

interface PerfilDoApostador {
  apelido: string;
  nomeReal: string;
  foto: string | null;
  desde: string | null;
}

/**
 * O perfil público do apostador (`/u/<apelido>`): foto, apelido e sempre o
 * nome real — primeiro e último. Nada de telefone, CPF ou e-mail.
 */
export default function Usuario() {
  const { apelido } = useParams<{ apelido: string }>();
  const { data, isLoading, error } = useQuery<PerfilDoApostador>({ queryKey: [`/api/public/u/${apelido}`] });
  return (
    <PublicShell>
      {isLoading ? <p className="text-sm text-muted">Carregando…</p> : null}
      {error ? <Empty>Perfil não encontrado.</Empty> : null}
      {data ? (
        <section className="flex flex-col items-center gap-3 py-6 text-center">
          <FotoDoApostador nome={data.apelido} foto={data.foto} tamanho={112} />
          <div>
            <h1 className="font-display text-xl font-bold">@{data.apelido}</h1>
            <p className="text-ink-2">{data.nomeReal}</p>
            {data.desde ? (
              <p className="mt-1 text-xs text-muted">
                no rifa.br desde{" "}
                <span className="tnum">
                  {new Date(data.desde).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </PublicShell>
  );
}
