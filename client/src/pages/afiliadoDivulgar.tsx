import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Campo, Empty, Pill } from "@/components/bits";
import { FotosProprias, useFotosProprias } from "@/components/FotosProprias";
import { apiRequest } from "@/lib/queryClient";
import { DIVULGACAO_MIDIAS_MAX, STATUS_DA_DIVULGACAO, podeEditar, type ModoDeDivulgacao, type StatusDaDivulgacao } from "@shared/divulgacao";
import { LEGENDA_MAX } from "@shared/publicacao";

interface RifaParaDivulgar {
  slug: string;
  title: string;
  organizacao: string;
  modo: ModoDeDivulgacao;
  midias: { id: string; role: string; url: string; poster: string | null; alt: string | null }[];
}
interface Minha {
  id: string;
  slug: string;
  title: string;
  legenda: string;
  midias: string[];
  status: StatusDaDivulgacao;
  motivo: string | null;
  criadaEm: string;
  editadaEm: string | null;
  versao: number;
  fotos: string[];
}

export const PILL_DA_DIVULGACAO: Record<StatusDaDivulgacao, string> = {
  em_analise: "pending",
  publicada: "published",
  recusada: "expired",
  removida: "draft",
};

/**
 * O influenciador publica com o material da organização: escolhe uma rifa
 * (só as de organização com vínculo aprovado e termo aceito), as mídias que
 * ela já publicou, até 4 fotos dele e a legenda. A organização escolhe se a
 * peça vai direto ao ar ou só depois da autorização — a tela diz qual vale.
 * Com foto dele, a peça sempre passa pela organização.
 */
export function AfiliadoDivulgar() {
  const qc = useQueryClient();
  const { data: rifas = [], isLoading } = useQuery<RifaParaDivulgar[]>({ queryKey: ["/api/affiliate/divulgacoes/rifas"] });
  const { data: minhas = [] } = useQuery<Minha[]>({ queryKey: ["/api/affiliate/divulgacoes"] });
  const [slug, setSlug] = useState("");
  const [legenda, setLegenda] = useState("");
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // A peça que está sendo corrigida (nulo: peça nova).
  const [editando, setEditando] = useState<{ id: string; versao: number } | null>(null);
  const rifa = rifas.find((r) => r.slug === slug) ?? null;
  const fotos = useFotosProprias((texto) => setMsg({ ok: false, texto }));
  // Com foto própria, nem o modo direto põe no ar sem a organização.
  const direta = rifa?.modo === "direta" && fotos.quantas === 0;

  const limpar = () => {
    setLegenda("");
    setEscolhidas([]);
    setEditando(null);
    fotos.limpar();
  };
  const publicar = useMutation({
    mutationFn: () =>
      editando
        ? apiRequest("PATCH", `/api/affiliate/divulgacoes/${editando.id}`, { legenda, midias: escolhidas, versao: editando.versao, ...fotos.corpo(true) })
        : apiRequest("POST", "/api/affiliate/divulgacoes", { slug, legenda, midias: escolhidas, ...fotos.corpo(false) }),
    onSuccess: async (res) => {
      const j = (await res.json()) as { status: StatusDaDivulgacao };
      const editou = Boolean(editando);
      setMsg({
        ok: true,
        texto:
          j.status === "publicada"
            ? editou
              ? "Editada. A página da rifa já mostra a versão nova."
              : "Publicada. Já aparece na página da rifa."
            : editou
              ? "Editada. Volta para a página da rifa quando a organização autorizar."
              : "Enviada. Aparece na rifa quando a organização autorizar.",
      });
      limpar();
      qc.invalidateQueries({ queryKey: ["/api/affiliate/divulgacoes"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const editar = (m: Minha) => {
    if (!rifas.some((r) => r.slug === m.slug)) {
      setMsg({ ok: false, texto: "Esta rifa não está mais disponível para você divulgar." });
      return;
    }
    setSlug(m.slug);
    setLegenda(m.legenda);
    setEscolhidas(m.midias);
    fotos.carregar(m.fotos);
    setEditando({ id: m.id, versao: m.versao });
    setMsg(null);
    document.getElementById("nova-divulgacao")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const retirar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/affiliate/divulgacoes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/affiliate/divulgacoes"] }),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const alternar = (id: string) =>
    setEscolhidas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : atual.length < DIVULGACAO_MIDIAS_MAX ? [...atual, id] : atual));

  return (
    <PanelShell title="Divulgar">
      <p className="mb-3 text-sm text-muted">
        Publique com as fotos e os vídeos que a organização já pôs na rifa e, se quiser, com fotos suas. A sua peça
        leva o seu link, e a compra por ele paga a sua comissão. Não dá para mudar preço, cotas nem prêmio — só
        divulgar.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
        <Card title={editando ? "Editar divulgação" : "Nova divulgação"}>
          <div id="nova-divulgacao" className="space-y-3 p-4 text-sm">
            {isLoading ? null : rifas.length === 0 ? (
              <p className="text-muted">
                Nenhuma rifa disponível. Para divulgar é preciso vínculo aprovado com a organização e o aceite do termo
                dela — veja em <Link href="/afiliado/organizacoes" className="underline">Organizações</Link>.
              </p>
            ) : (
              <>
                <Campo rotulo="Rifa">
                  <select
                    value={slug}
                    disabled={Boolean(editando)}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setEscolhidas([]);
                      fotos.limpar();
                      setMsg(null);
                    }}
                  >
                    <option value="">Escolha uma rifa</option>
                    {rifas.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.title} — {r.organizacao}
                      </option>
                    ))}
                  </select>
                </Campo>
                {rifa ? (
                  <>
                    <p className="text-xs text-muted">
                      {direta
                        ? `${rifa.organizacao} deixa você publicar direto: a peça vai ao ar na hora${editando ? ", e a edição também" : ""}.`
                        : rifa.modo === "direta"
                          ? `${rifa.organizacao} deixa você publicar direto, mas a peça com foto sua só vai ao ar depois da aprovação.`
                          : editando
                          ? `${rifa.organizacao} autoriza antes: a peça editada só aparece na rifa depois da nova aprovação.`
                          : `${rifa.organizacao} autoriza antes: a peça só vai ao ar depois da aprovação.`}
                    </p>
                    <fieldset>
                      <legend className="label-xs">
                        Mídias da rifa (até <span className="tnum">{DIVULGACAO_MIDIAS_MAX}</span>)
                      </legend>
                      <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {rifa.midias.map((m, i) => {
                          const img = m.role === "video" ? m.poster : m.url;
                          const marcada = escolhidas.includes(m.id);
                          return (
                            <li key={m.id}>
                              <label className={`relative block cursor-pointer overflow-hidden rounded-lg border-2 ${marcada ? "border-green" : "border-line"}`}>
                                <input type="checkbox" className="sr-only" checked={marcada} onChange={() => alternar(m.id)} />
                                {img ? (
                                  <img src={img} alt={m.alt ?? `Mídia ${i + 1}`} className="aspect-square w-full object-cover" />
                                ) : (
                                  <span className="flex aspect-square items-center justify-center bg-mist text-xs text-muted">Vídeo</span>
                                )}
                                <span className="absolute left-1 top-1 rounded bg-white px-1 text-[10px] font-semibold text-ink">
                                  {m.role === "video" ? "Vídeo" : m.role === "banner" ? "Capa" : "Foto"}
                                  {marcada ? " ✓" : ""}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                    <FotosProprias
                      estado={fotos}
                      editando={Boolean(editando)}
                      dica="Só fotos suas ou de quem autorizou, sem menores de 18 anos. A organização vê cada uma antes de publicar."
                    />
                    <Campo rotulo="Legenda" dica={`Sem link e sem telefone, e sem pedir pagamento por fora. Até ${LEGENDA_MAX} caracteres.`}>
                      <textarea rows={4} maxLength={LEGENDA_MAX} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
                    </Campo>
                    {msg ? <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={publicar.isPending || (!legenda.trim() && escolhidas.length === 0 && fotos.quantas === 0)} onClick={() => publicar.mutate()}>
                        {editando ? "Salvar edição" : direta ? "Publicar" : "Enviar para autorização"}
                      </Button>
                      {editando ? (
                        <Button variant="ghost" onClick={limpar}>
                          Cancelar edição
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card title="Minhas divulgações">
          {minhas.length === 0 ? (
            <Empty>Você ainda não divulgou nada.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {minhas.map((m) => (
                <li key={m.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill status={PILL_DA_DIVULGACAO[m.status]}>{STATUS_DA_DIVULGACAO[m.status]}</Pill>
                    <span className="font-semibold">{m.title}</span>
                    {m.editadaEm ? <span className="text-xs text-muted">Editada</span> : null}
                  </div>
                  {m.legenda ? <p className="line-clamp-3 break-words text-muted">{m.legenda}</p> : null}
                  {m.fotos.length ? (
                    <ul className="flex gap-2">
                      {m.fotos.map((f, i) => (
                        <li key={f}>
                          <img src={f} alt={`Foto ${i + 1} da divulgação`} loading="lazy" className="h-14 w-14 rounded-md object-cover" />
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
          )}
        </Card>
      </div>
    </PanelShell>
  );
}
