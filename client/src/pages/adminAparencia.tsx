import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Monitor, Smartphone, Trash2 } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import {
  CONTRASTE_MIN,
  FONTES,
  FUNDO,
  RAIOS,
  TIPOS_DE_BLOCO,
  contraste,
  corValida,
  validarTemplate,
  type Bloco,
  type Fonte,
  type Raio,
  type Template,
} from "@shared/template";

interface Estado {
  rascunho: Template;
  publicado: Template;
  versaoAtual: string | null;
  versoes: { id: string; publicadoEm: string; restauradaDe: string | null; por: string | null }[];
}

const NOME_RAIO: Record<Raio, string> = { reto: "Retos", suave: "Suaves", redondo: "Redondos" };

/**
 * Construtor de templates: a aparência da plataforma sem código. Edita um
 * rascunho, vê na pré-visualização (celular ou computador) e publica; cada
 * publicação guarda a anterior, e voltar é um clique.
 */
export function AdminAparencia() {
  const qc = useQueryClient();
  const { data } = useQuery<Estado>({ queryKey: ["/api/admin/template"] });
  const [t, setT] = useState<Template | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tela, setTela] = useState<"celular" | "computador">("celular");
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    if (data && !t) setT(data.rascunho);
  }, [data, t]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/template"] });
  const salvar = useMutation({
    mutationFn: async (novo: Template) => (await apiRequest("PUT", "/api/admin/template/rascunho", novo)).json(),
    onSuccess: () => {
      setSujo(false);
      setMsg({ ok: true, texto: "Rascunho salvo — a pré-visualização já mostra." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const publicar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/template/publicar"),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Publicado: a plataforma já está com esta aparência." });
      recarregar();
      qc.invalidateQueries({ queryKey: ["/api/public/template"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const restaurar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/template/versoes/${id}/restaurar`),
    onSuccess: async () => {
      setMsg({ ok: true, texto: "Versão restaurada e publicada." });
      setT(null);
      await recarregar();
      qc.invalidateQueries({ queryKey: ["/api/public/template"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const enviarLogo = useMutation({
    mutationFn: async (dataUrl: string) => (await apiRequest("PUT", "/api/admin/template/logo", { dataUrl })).json(),
    onSuccess: (novo: Template) => {
      setT((atual) => (atual ? { ...atual, identidade: { ...atual.identidade, logo: novo.identidade.logo } } : novo));
      setMsg({ ok: true, texto: "Logo enviada para o rascunho." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  if (!t || !data) {
    return (
      <PanelShell title="Aparência">
        <p className="text-sm text-muted">Carregando…</p>
      </PanelShell>
    );
  }

  let problema: string | null = null;
  try {
    validarTemplate(t);
  } catch (e) {
    problema = (e as Error).message;
  }
  const mudar = (novo: Template) => {
    setMsg(null);
    setSujo(true);
    setT(novo);
  };
  const id = t.identidade;
  const mudarId = (p: Partial<Template["identidade"]>) => mudar({ ...t, identidade: { ...id, ...p } });
  const mudarBloco = (i: number, p: Partial<Bloco>) =>
    mudar({ ...t, blocos: t.blocos.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const mover = (i: number, d: -1 | 1) => {
    const blocos = [...t.blocos];
    const [b] = blocos.splice(i, 1);
    blocos.splice(i + d, 0, b);
    mudar({ ...t, blocos });
  };
  const rascunhoDiferente = JSON.stringify(data.rascunho) !== JSON.stringify(data.publicado);

  return (
    <PanelShell title="Aparência">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-3">
          <Card title="Identidade">
            <div className="grid gap-4 p-4 text-sm sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-nome" className="label-xs">Nome da plataforma</label>
                <input
                  id="tpl-nome"
                  value={id.nome}
                  maxLength={40}
                  onChange={(e) => mudarId({ nome: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </div>
              <div>
                <span className="label-xs">Logo (troca o nome no topo)</span>
                <div className="mt-1 flex items-center gap-3">
                  {id.logo ? <img src={id.logo} alt="" className="h-8 rounded border border-line bg-branco p-1" /> : null}
                  <label className="cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
                    {id.logo ? "Trocar" : "Enviar logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = () => enviarLogo.mutate(String(r.result));
                        r.readAsDataURL(f);
                      }}
                    />
                  </label>
                  {id.logo ? (
                    <button type="button" className="text-xs text-red underline" onClick={() => mudarId({ logo: null })}>
                      usar o nome
                    </button>
                  ) : null}
                </div>
              </div>
              {(["claro", "escuro"] as const).map((tema) => {
                const c = id.cor[tema];
                const ok = corValida(c);
                const razao = ok ? contraste(c, FUNDO[tema]) : 0;
                return (
                  <div key={tema}>
                    <label htmlFor={`tpl-cor-${tema}`} className="label-xs">Cor de marca — tema {tema}</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`Escolher cor do tema ${tema}`}
                        value={ok ? c : "#000000"}
                        onChange={(e) => mudarId({ cor: { ...id.cor, [tema]: e.target.value } })}
                        className="h-9 w-12 cursor-pointer rounded border border-line-2 bg-white"
                      />
                      <input
                        id={`tpl-cor-${tema}`}
                        value={c}
                        onChange={(e) => mudarId({ cor: { ...id.cor, [tema]: e.target.value.trim() } })}
                        className="tnum w-28 rounded-md border border-line-2 px-2 py-2"
                      />
                      <span
                        className="tnum rounded px-2 py-1 text-xs"
                        style={{ background: FUNDO[tema], color: ok ? c : undefined, border: "1px solid var(--line)" }}
                      >
                        {ok ? `${razao.toFixed(1)}:1` : "—"}
                      </span>
                    </div>
                    {ok && razao < CONTRASTE_MIN ? (
                      <p className="mt-1 text-xs text-red">Quase não aparece no fundo {tema} (mínimo {CONTRASTE_MIN}:1).</p>
                    ) : null}
                  </div>
                );
              })}
              <div>
                <label htmlFor="tpl-fonte" className="label-xs">Fonte do texto</label>
                <select
                  id="tpl-fonte"
                  value={id.fonte}
                  onChange={(e) => mudarId({ fonte: e.target.value as Fonte })}
                  className="mt-1 w-full rounded-md border border-line-2 bg-white px-2 py-2"
                >
                  {Object.entries(FONTES).map(([k, f]) => (
                    <option key={k} value={k}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="label-xs">Cantos</legend>
                <div className="mt-1 flex gap-2">
                  {(Object.keys(RAIOS) as Raio[]).map((r) => (
                    <label
                      key={r}
                      className={`flex cursor-pointer items-center gap-1 border px-3 py-1.5 text-xs ${id.raio === r ? "border-marca font-semibold" : "border-line-2"}`}
                      style={{ borderRadius: RAIOS[r] }}
                    >
                      <input type="radio" name="tpl-raio" className="sr-only" checked={id.raio === r} onChange={() => mudarId({ raio: r })} />
                      {NOME_RAIO[r]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-muted sm:col-span-2">
                A cor de marca vale para logo, links e destaques. Verde de dinheiro, amarelo de espera e
                vermelho de erro não mudam — são significado, não enfeite.
              </p>
            </div>
          </Card>

          <Card title="Tela inicial (blocos)">
            <ul className="divide-y divide-line">
              {t.blocos.map((b, i) => (
                <li key={b.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={b.ligado}
                      aria-label={`Mostrar ${TIPOS_DE_BLOCO[b.tipo]}`}
                      onChange={(e) => mudarBloco(i, { ligado: e.target.checked })}
                    />
                    <span className="flex-1 font-semibold">{TIPOS_DE_BLOCO[b.tipo]}</span>
                    <Pill status={b.ligado ? "active" : "pending"}>{b.ligado ? "ligado" : "desligado"}</Pill>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 hover:bg-mist disabled:opacity-30">
                      <ArrowUp size={15} aria-hidden />
                    </button>
                    <button type="button" aria-label="Descer" disabled={i === t.blocos.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 hover:bg-mist disabled:opacity-30">
                      <ArrowDown size={15} aria-hidden />
                    </button>
                    {b.tipo === "texto" ? (
                      <button
                        type="button"
                        aria-label="Remover bloco"
                        onClick={() => mudar({ ...t, blocos: t.blocos.filter((_, j) => j !== i) })}
                        className="rounded p-1 text-red hover:bg-mist"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  {b.tipo === "rifas" || b.tipo === "texto" || b.tipo === "ajuda" ? (
                    <div className="grid gap-2 pl-6 sm:grid-cols-[1fr_auto]">
                      <input
                        value={b.titulo ?? ""}
                        placeholder="Título (opcional)"
                        maxLength={80}
                        aria-label="Título do bloco"
                        onChange={(e) => mudarBloco(i, { titulo: e.target.value })}
                        className="rounded-md border border-line-2 px-3 py-1.5"
                      />
                      {b.tipo === "rifas" ? (
                        <label className="flex items-center gap-2 text-xs text-muted">
                          mostrar
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={b.quantidade ?? 0}
                            onChange={(e) => mudarBloco(i, { quantidade: Number(e.target.value) })}
                            className="tnum w-16 rounded-md border border-line-2 px-2 py-1.5"
                          />
                          (0 = todas)
                        </label>
                      ) : null}
                      {b.tipo === "texto" ? (
                        <textarea
                          value={b.corpo ?? ""}
                          rows={3}
                          maxLength={600}
                          aria-label="Texto do bloco"
                          onChange={(e) => mudarBloco(i, { corpo: e.target.value })}
                          className="rounded-md border border-line-2 px-3 py-2 sm:col-span-2"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-3">
              <Button
                variant="ghost"
                disabled={t.blocos.length >= 12}
                onClick={() =>
                  mudar({
                    ...t,
                    blocos: [...t.blocos, { id: `texto-${Date.now().toString(36)}`, tipo: "texto", ligado: true, titulo: "", corpo: "" }],
                  })
                }
              >
                + Bloco de texto
              </Button>
            </div>
          </Card>

          <Card title="Textos do rodapé">
            <div className="space-y-3 p-4 text-sm">
              <div>
                <label htmlFor="tpl-rodape" className="label-xs">Rodapé (CNPJ, contato, avisos)</label>
                <textarea
                  id="tpl-rodape"
                  rows={2}
                  maxLength={300}
                  value={t.textos.rodape}
                  onChange={(e) => mudar({ ...t, textos: { ...t.textos, rodape: e.target.value } })}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="tpl-jogo" className="label-xs">Aviso de jogo responsável</label>
                <input
                  id="tpl-jogo"
                  maxLength={200}
                  value={t.textos.jogoResponsavel}
                  onChange={(e) => mudar({ ...t, textos: { ...t.textos, jogoResponsavel: e.target.value } })}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </div>
            </div>
          </Card>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-card">
            <Button variant="ghost" disabled={Boolean(problema) || salvar.isPending || !sujo} onClick={() => salvar.mutate(t)}>
              {salvar.isPending ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button disabled={sujo || !rascunhoDiferente || publicar.isPending} onClick={() => publicar.mutate()}>
              {publicar.isPending ? "Publicando…" : "Publicar"}
            </Button>
            <span className="text-xs">
              {problema ? (
                <span className="text-red">{problema}</span>
              ) : msg ? (
                <span className={msg.ok ? "text-green-deep" : "text-red"}>{msg.texto}</span>
              ) : sujo ? (
                <span className="text-muted">Alterações ainda não salvas.</span>
              ) : rascunhoDiferente ? (
                <span className="text-muted">Rascunho diferente do que está no ar.</span>
              ) : (
                <span className="text-muted">O que está no ar é igual ao rascunho.</span>
              )}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <Card
            title="Pré-visualização do rascunho"
            right={
              <div className="flex gap-1">
                <button type="button" aria-pressed={tela === "celular"} onClick={() => setTela("celular")} className={`rounded p-1 ${tela === "celular" ? "bg-mist-2" : ""}`} aria-label="Celular">
                  <Smartphone size={16} aria-hidden />
                </button>
                <button type="button" aria-pressed={tela === "computador"} onClick={() => setTela("computador")} className={`rounded p-1 ${tela === "computador" ? "bg-mist-2" : ""}`} aria-label="Computador">
                  <Monitor size={16} aria-hidden />
                </button>
              </div>
            }
          >
            <div className="flex justify-center overflow-hidden bg-mist p-3">
              {tela === "celular" ? (
                <iframe title="Pré-visualização no celular" src="/?previa=1" className="h-[700px] w-[375px] rounded-xl border border-line bg-white" />
              ) : (
                <div className="h-[430px] w-[400px] overflow-hidden rounded-lg border border-line bg-white">
                  <iframe
                    title="Pré-visualização no computador"
                    src="/?previa=1"
                    className="origin-top-left bg-white"
                    style={{ width: 1280, height: 1376, transform: "scale(0.3125)" }}
                  />
                </div>
              )}
            </div>
            <p className="px-4 pb-3 text-[11px] text-muted">Mostra o último rascunho salvo; atualiza sozinha.</p>
          </Card>

          <Card title="Versões publicadas">
            <ul className="divide-y divide-line text-sm">
              {data.versoes.length === 0 ? <li className="px-4 py-3 text-muted">Ainda no template padrão.</li> : null}
              {data.versoes.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="tnum flex-1">
                    {new Date(v.publicadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    <span className="block text-[11px] text-muted">
                      {v.por ?? "—"}
                      {v.restauradaDe ? " · restauração" : ""}
                    </span>
                  </span>
                  {v.id === data.versaoAtual ? (
                    <Pill status="active">no ar</Pill>
                  ) : (
                    <Button variant="ghost" disabled={restaurar.isPending} onClick={() => restaurar.mutate(v.id)}>
                      Voltar para esta
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PanelShell>
  );
}
