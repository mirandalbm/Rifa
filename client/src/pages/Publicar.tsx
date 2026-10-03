import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Button, Campo, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useConfigDoApp } from "@/components/Console";
import { useSession } from "@/lib/session";
import { DIVULGACAO_FOTOS_MAX, STATUS_DA_DIVULGACAO, podeEditar, type StatusDaDivulgacao } from "@shared/divulgacao";
import { lerFoto } from "@/lib/anexo";
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
  fotos: string[];
}

/**
 * A publicação do apostador (só com o interruptor `publicarApostador` da
 * plataforma): um texto, e até 4 fotos dele, sobre uma rifa em que ele
 * comprou. Sem link, sem telefone — e **sempre** com a autorização da
 * organização antes de aparecer na página da rifa (a foto, quem lê é ela).
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
  // As fotos escolhidas agora (já reduzidas no aparelho). Na edição, `fotosAtuais`
  // são as da peça: só vão de novo se a pessoa trocar (`trocouFotos`).
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotosAtuais, setFotosAtuais] = useState<string[]>([]);
  const [trocouFotos, setTrocouFotos] = useState(false);

  const escolherFotos = async (arquivos: FileList | null) => {
    if (!arquivos) return;
    try {
      const lidas = await Promise.all(Array.from(arquivos).map((a) => lerFoto(a)));
      setFotos((atual) => [...atual, ...lidas].slice(0, DIVULGACAO_FOTOS_MAX));
      setTrocouFotos(true);
      setFotosAtuais([]);
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    }
  };
  const limpar = () => {
    setLegenda("");
    setEditando(null);
    setFotos([]);
    setFotosAtuais([]);
    setTrocouFotos(false);
  };

  const publicar = useMutation({
    mutationFn: () =>
      editando
        ? apiRequest("PATCH", `/api/public/divulgacoes/${editando.id}`, {
            legenda,
            versao: editando.versao,
            // Sem trocar, as fotos da peça ficam como estão.
            ...(trocouFotos ? { fotos } : {}),
          })
        : apiRequest("POST", "/api/public/divulgacoes", { slug, legenda, fotos }),
    onSuccess: () => {
      setMsg({
        ok: true,
        texto: editando
          ? "Editada. Volta para a página da rifa quando a organização autorizar."
          : "Enviada. Aparece na página da rifa quando a organização autorizar.",
      });
      limpar();
      qc.invalidateQueries({ queryKey: ["/api/public/divulgacoes/minhas"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const editar = (m: Minha) => {
    setSlug(m.slug);
    setLegenda(m.legenda);
    setEditando({ id: m.id, versao: m.versao });
    setFotos([]);
    setFotosAtuais(m.fotos);
    setTrocouFotos(false);
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
              Conte o que você achou de uma rifa em que comprou, com até {DIVULGACAO_FOTOS_MAX} fotos suas. A
              organização lê antes de aparecer; link, telefone e pedido de Pix por fora não são aceitos.
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
                <fieldset>
                  <legend className="label-xs">
                    Fotos (até <span className="tnum">{DIVULGACAO_FOTOS_MAX}</span>, opcional)
                  </legend>
                  {(trocouFotos ? fotos : fotosAtuais).length ? (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {(trocouFotos ? fotos : fotosAtuais).map((f, i) => (
                        <li key={`${i}-${f.slice(-16)}`} className="relative">
                          <img src={f} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                          {trocouFotos ? (
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded bg-white px-1.5 text-xs font-semibold text-ink"
                              aria-label={`Tirar a foto ${i + 1}`}
                              onClick={() => setFotos((atual) => atual.filter((_, j) => j !== i))}
                            >
                              ✕
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fotos.length < DIVULGACAO_FOTOS_MAX ? (
                      <label className="inline-flex cursor-pointer items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                        {editando && !trocouFotos && fotosAtuais.length ? "Trocar as fotos" : "Escolher fotos"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            void escolherFotos(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                    {editando && !trocouFotos && fotosAtuais.length ? (
                      <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          setTrocouFotos(true);
                          setFotos([]);
                          setFotosAtuais([]);
                        }}
                      >
                        Tirar as fotos
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">Só fotos suas. A organização vê cada uma antes de publicar.</p>
                </fieldset>
                {msg ? <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={publicar.isPending || !slug || legenda.trim().length < 3} onClick={() => publicar.mutate()}>
                    {editando ? "Salvar edição" : "Enviar para autorização"}
                  </Button>
                  {editando ? (
                    <Button variant="ghost" onClick={limpar}>
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
                      {m.fotos.length ? (
                        <ul className="flex gap-2">
                          {m.fotos.map((f, i) => (
                            <li key={f}>
                              <img src={f} alt={`Foto ${i + 1} da publicação`} loading="lazy" className="h-14 w-14 rounded-md object-cover" />
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
              </section>
            ) : null}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
