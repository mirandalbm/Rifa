import { Repeat2 } from "lucide-react";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { FotoDoApostador } from "@/components/PerfilDoApostador";
import { SeloVerificado } from "@/components/SeloVerificado";

interface PerfilDoApostador {
  apelido: string;
  nomeReal: string;
  foto: string | null;
  desde: string | null;
  verificado: boolean;
}

/**
 * O perfil público do apostador (`/u/<apelido>`): foto, apelido e sempre o
 * nome real — primeiro e último. Nada de telefone, CPF ou e-mail.
 */
export default function Usuario() {
  const { apelido } = useParams<{ apelido: string }>();
  const { data, isLoading, error } = useQuery<PerfilDoApostador>({ queryKey: [`/api/public/u/${apelido}`] });
  return (
    <PublicShell larga>
      {isLoading ? <p className="text-sm text-muted">Carregando…</p> : null}
      {error ? <Empty>Perfil não encontrado.</Empty> : null}
      {data ? (
        <section className="flex flex-col items-center gap-3 py-6 text-center">
          <FotoDoApostador nome={data.apelido} foto={data.foto} tamanho={112} />
          <div>
            <h1 className="flex items-center justify-center gap-1.5 font-display text-xl font-extrabold">
              @{data.apelido}
              {data.verificado ? <SeloVerificado sujeito="apostador" tamanho={20} /> : null}
            </h1>
            {data.verificado ? <p className="text-xs text-muted">Apostador verificado: documentos e foto conferidos pela plataforma.</p> : null}
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
      {data ? <Republicacoes apelido={data.apelido} /> : null}
    </PublicShell>
  );
}

/** O que a pessoa republicou (o botão de republicar da publicação) aparece no perfil dela. */
function Republicacoes({ apelido }: { apelido: string }) {
  const { data } = useQuery<RifaDoFeed[]>({ queryKey: [`/api/public/u/${apelido}/republicacoes`] });
  if (!data?.length) return null;
  return (
    <section aria-label="Republicações" className="mt-2">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Repeat2 size={20} aria-hidden /> Republicações
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((r) => (
          <CartaoDoFeed key={r.id} rifa={r} />
        ))}
      </div>
    </section>
  );
}
