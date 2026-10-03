import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Button, Campo, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useConfigDoApp } from "@/components/Console";
import { useSession } from "@/lib/session";
import { STATUS_DA_DIVULGACAO, podeEditar, type StatusDaDivulgacao } from "@shared/divulgacao";
import { LEGENDA_MAX } from "@shared/publicacao";
import { PILL_DA_DIVULGACAO } from "@/pages/afiliadoDivulgar";

interface Minha {
  id: string;
  slug: string;
  title: string;
  legenda: string;
  status: StatusDaDivulgacao;
  motivo: string | null;
  editadaEm: string | null;
  versao: number;
}

/**
 * A publicação do apostador (só com o interruptor `publicarApostador` da
 * plataforma): um texto sobre uma rifa em que ele comprou. Sem imagem, sem
 * link, sem telefone — e **sempre** com a autorização da organização antes
 * de aparecer na página da rifa.
 */
export default function Publicar() {
  const qc = useQueryClient();
  const { data: sessao } = useSession();
  const { publicarApostador } = useConfigDoApp();
  const ligado = publicarApostador && Boolean(sessao?.buyer?.conta);
  const { data: rifas = [] } = useQuery<{ slug: string; title: string }[]>({ queryKey: ["/api/public/divulgacoes/rifas"], enabled: ligado });
  const { data: minhas = [] } = useQuery<Minha[]>({ queryKey: ["/api/public/divulgacoes/minhas"], enabled: ligado });
  const [slug, setSlug] = useState("");
  const [legenda, setLegenda] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // O texto que está sendo corrigido (nulo: publicação nova).
  const [editando, setEditando] = useState<{ id: string; versao: number } | null>(null);

  const publicar = useMutation({
    mutationFn: () =>
      editando
        ? apiRequest("PATCH", `/api/public/divulgacoes/${editando.id}`, { legenda, versao: editando.versao })
        : apiRequest("POST", "/api/public/divulgacoes", { slug, legenda }),
    onSuccess: () => {
      setMsg({
        ok: true,
        texto: editando
          ? "Editada. Volta para a página da rifa quando a organização autorizar."
          : "Enviada. Aparece na página da rifa quando a organização autorizar.",
      });
      setLegenda("");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["/api/public/divulgacoes/minhas"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const editar = (m: Minha) => {
    setSlug(m.slug);
    setLegenda(m.legenda);
    setEditando({ id: m.id, versao: m.versao });
    setMsg(null);
    document.getElementById("publicar-texto")?.focus();
  };
  const retirar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/public/divulgacoes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/public/divulgacoes/minhas"] }),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <PublicShell>
      <div className="px-4 py-4">
        <Link href="/perfil" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2">
          <ArrowLeft size={16} aria-hidden /> Voltar
        </Link>
        <h1 className="font-display text-xl font-extrabold">Publicar sobre uma rifa</h1>
        {!ligado ? (
          <p className="mt-3 text-sm text-muted">
            {sessao?.buyer?.conta ? "A publicação de apostadores ainda não está disponível." : "Entre na sua conta para publicar."}
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted">
              Conte o que você achou de uma rifa em que comprou. A organização lê antes de aparecer; link, telefone e
              pedido de Pix por fora não são aceitos.
            </p>
            {rifas.length === 0 ? (
              <p className="rounded-md bg-mist px-3 py-2 text-muted">Você precisa ter uma compra paga em uma rifa no ar para publicar sobre ela.</p>
            ) : (
              <>
                <Campo rotulo="Rifa">
                  <select value={slug} disabled={Boolean(editando)} onChange={(e) => setSlug(e.target.value)}>
                    <option value="">Escolha uma rifa</option>
                    {rifas.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  rotulo={editando ? "Corrija o seu texto" : "O que você quer dizer"}
                  dica={editando ? "Depois de editada, a publicação sai da página da rifa até a organização ler de novo." : `Até ${LEGENDA_MAX} caracteres.`}
                >
                  <textarea id="publicar-texto" rows={4} maxLength={LEGENDA_MAX} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
                </Campo>
                {msg ? <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={publicar.isPending || !slug || legenda.trim().length < 3} onClick={() => publicar.mutate()}>
                    {editando ? "Salvar edição" : "Enviar para autorização"}
                  </Button>
                  {editando ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditando(null);
                        setLegenda("");
                      }}
                    >
                      Cancelar edição
                    </Button>
                  ) : null}
                </div>
              </>
            )}
            {minhas.length ? (
              <section aria-label="Minhas publicações" className="pt-2">
                <h2 className="font-display text-sm font-bold">Minhas publicações</h2>
                <ul className="mt-1 divide-y divide-line">
                  {minhas.map((m) => (
                    <li key={m.id} className="space-y-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill status={PILL_DA_DIVULGACAO[m.status]}>{STATUS_DA_DIVULGACAO[m.status]}</Pill>
                        <span className="font-semibold">{m.title}</span>
                        {m.editadaEm ? <span className="text-xs text-muted">Editada</span> : null}
                      </div>
                      <p className="break-words text-muted">{m.legenda}</p>
                      {m.motivo ? <p className="text-xs text-muted">Motivo: {m.motivo}</p> : null}
                      {podeEditar(m.status) ? (
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={editando?.id === m.id} onClick={() => editar(m)}>
                            Editar
                          </Button>
                          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={retirar.isPending} onClick={() => retirar.mutate(m.id)}>
                            Retirar
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
