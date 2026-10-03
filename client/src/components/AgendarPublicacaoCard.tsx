import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { CampoDeAgenda, paraCampoLocal, paraInstante, quandoCurto } from "@/components/CampoDeAgenda";
import { RIFA_AGENDA_MAX_DIAS } from "@shared/agenda";

interface Rifa {
  id: string;
  status: string;
  publicarEm?: string | null;
  publicacaoAgendadaFalha?: string | null;
}

/**
 * Publicação agendada do rascunho. Na hora, o sistema publica pelo mesmo
 * caminho do botão "Publicar": confere tudo de novo e trava ali o total, a
 * autorização e a data. Se faltar algo, não publica e o motivo aparece aqui.
 */
export function AgendarPublicacaoCard({ rifa }: { rifa: Rifa }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState(paraCampoLocal(rifa.publicarEm));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const salvar = useMutation({
    mutationFn: async (publicarEm: string | null) => {
      const r = await apiRequest("PUT", `/api/admin/campaigns/${rifa.id}/agendar-publicacao`, { publicarEm });
      return (await r.json()) as { publicarEm: string | null; pendencias: string[] };
    },
    onSuccess: (r) => {
      setMsg(
        r.publicarEm
          ? {
              ok: r.pendencias.length === 0,
              texto: r.pendencias.length
                ? `Agendada para ${quandoCurto(r.publicarEm)}. Hoje ainda falta: ${r.pendencias.join(" ")} Se faltar na hora, a rifa não vai ao ar.`
                : `Agendada para ${quandoCurto(r.publicarEm)}. Na hora, ela vai ao ar sozinha.`,
            }
          : { ok: true, texto: "Agenda tirada. A rifa só vai ao ar quando você publicar." },
      );
      if (!r.publicarEm) setValor("");
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  if (rifa.status !== "draft") return null;
  return (
    <Card
      title="Publicação agendada"
      right={rifa.publicarEm ? <Pill status="pending">{`Agendada · ${quandoCurto(rifa.publicarEm)}`}</Pill> : null}
    >
      <div className="space-y-3 p-4 text-sm">
        {rifa.publicacaoAgendadaFalha ? (
          <p role="status" className="rounded-md bg-red-soft px-3 py-2 text-red">
            A publicação agendada não aconteceu: {rifa.publicacaoAgendadaFalha}
          </p>
        ) : null}
        <CampoDeAgenda
          id={`agenda-rifa-${rifa.id}`}
          valor={valor}
          aoMudar={(v) => {
            setValor(v);
            setMsg(null);
          }}
          dica={`Até ${RIFA_AGENDA_MAX_DIAS} dias à frente e pelo menos 1 hora antes do sorteio. Na hora, a publicação confere tudo de novo — autorização, telefone, fotos, data — e trava o total de cotas e a autorização, como o botão "Publicar".`}
        />
        {msg ? (
          <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-yellow-soft text-yellow-deep"}`}>
            {msg.texto}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!valor || salvar.isPending} onClick={() => salvar.mutate(paraInstante(valor))}>
            {rifa.publicarEm ? "Mudar a hora" : "Agendar publicação"}
          </Button>
          {rifa.publicarEm ? (
            <Button variant="ghost" disabled={salvar.isPending} onClick={() => salvar.mutate(null)}>
              Tirar a agenda
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
