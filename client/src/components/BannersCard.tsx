import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { BANNERS_MAX, BANNER_SEGUNDOS, validarBanner } from "@shared/vitrine";

interface Banner {
  id: string;
  titulo: string;
  link: string | null;
  segundos: number;
  ativo: boolean;
  inicio: string | null;
  fim: string | null;
  imagem: string;
  noAr: boolean;
}

const IMAGEM_MAX = 5 * 1024 * 1024;

/** `2026-10-01T09:00` (campo do navegador, hora local) ↔ ISO. */
const paraCampo = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const doCampo = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Banners do topo da vitrine (até 5). Cada um tem título (que é o texto
 * alternativo da imagem), link opcional, tempo na tela e uma janela de
 * datas opcional. A imagem é recortada em 2:1 no servidor.
 */
export function BannersCard() {
  const qc = useQueryClient();
  const chave = ["/api/admin/banners"];
  const { data: banners = [] } = useQuery<Banner[]>({ queryKey: chave });
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["/api/public/banners"] });
  };
  const [msg, setMsg] = useState<string | null>(null);
  const erro = (e: Error) => setMsg(e.message);

  const alterar = useMutation({
    mutationFn: ({ id, ...campos }: Partial<Banner> & { id: string }) =>
      apiRequest("PATCH", `/api/admin/banners/${id}`, campos),
    onSuccess: recarregar,
    onError: erro,
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/banners/${id}`),
    onSuccess: recarregar,
    onError: erro,
  });
  const ordenar = useMutation({
    mutationFn: (ids: string[]) => apiRequest("PUT", "/api/admin/banners/ordem", { ids }),
    onSuccess: recarregar,
    onError: erro,
  });
  const mover = (i: number, d: -1 | 1) => {
    const ids = banners.map((b) => b.id);
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x);
    ordenar.mutate(ids);
  };

  return (
    <Card
      title="Banners da vitrine"
      right={
        <span className="tnum text-xs text-muted">
          {banners.length}/{BANNERS_MAX}
        </span>
      }
    >
      <p className="border-b border-line px-4 py-2 text-[11px] text-muted">
        Entram no ar na hora, sem publicar o template. Onde aparecem na tela inicial é o bloco
        "Banners da plataforma", logo abaixo.
      </p>
      {banners.length === 0 ? <Empty>Nenhum banner. O bloco some da vitrine até ter um no ar.</Empty> : null}
      <ul className="divide-y divide-line">
        {banners.map((b, i) => (
          <li key={b.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-start gap-3">
              <img src={b.imagem} alt="" className="aspect-[2/1] w-28 shrink-0 rounded-md border border-line object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-semibold">{b.titulo}</p>
                <p className="truncate text-xs text-muted">{b.link ?? "sem link"}</p>
                <Pill status={b.noAr ? "active" : "pending"}>{b.noAr ? "no ar" : b.ativo ? "fora da janela" : "desligado"}</Pill>
              </div>
              <div className="flex shrink-0 items-center">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 hover:bg-mist disabled:opacity-30">
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button type="button" aria-label="Descer" disabled={i === banners.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 hover:bg-mist disabled:opacity-30">
                  <ArrowDown size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Apagar o banner ${b.titulo}`}
                  onClick={() => {
                    if (window.confirm(`Apagar o banner "${b.titulo}"?`)) apagar.mutate(b.id);
                  }}
                  className="rounded p-1 text-red hover:bg-mist"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={b.ativo} onChange={(e) => alterar.mutate({ id: b.id, ativo: e.target.checked })} />
                ligado
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={BANNER_SEGUNDOS.min}
                  max={BANNER_SEGUNDOS.max}
                  defaultValue={b.segundos}
                  onBlur={(e) => Number(e.target.value) !== b.segundos && alterar.mutate({ id: b.id, segundos: Number(e.target.value) })}
                  className="tnum w-14 rounded-md border border-line-2 px-2 py-1"
                />
                segundos
              </label>
              <label className="flex items-center gap-1.5">
                de
                <input
                  type="datetime-local"
                  defaultValue={paraCampo(b.inicio)}
                  onBlur={(e) => doCampo(e.target.value) !== b.inicio && alterar.mutate({ id: b.id, inicio: doCampo(e.target.value) })}
                  className="tnum rounded-md border border-line-2 px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1.5">
                até
                <input
                  type="datetime-local"
                  defaultValue={paraCampo(b.fim)}
                  onBlur={(e) => doCampo(e.target.value) !== b.fim && alterar.mutate({ id: b.id, fim: doCampo(e.target.value) })}
                  className="tnum rounded-md border border-line-2 px-2 py-1"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
      {msg ? <p className="mx-4 mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{msg}</p> : null}
      {banners.length < BANNERS_MAX ? <NovoBanner onCriado={recarregar} /> : null}
    </Card>
  );
}

function NovoBanner({ onCriado }: { onCriado: () => void }) {
  const [imagem, setImagem] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [link, setLink] = useState("");
  const [segundos, setSegundos] = useState<number>(BANNER_SEGUNDOS.padrao);
  const [msg, setMsg] = useState<string | null>(null);

  let problema: string | null = null;
  try {
    validarBanner({ titulo, link, segundos });
  } catch (e) {
    problema = (e as Error).message;
  }

  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/banners", { imagem, titulo, link, segundos }),
    onSuccess: () => {
      setImagem(null);
      setTitulo("");
      setLink("");
      setMsg(null);
      onCriado();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <form
      className="space-y-2 border-t border-line p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate();
      }}
    >
      <p className="label-xs">Novo banner</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="aspect-[2/1] w-40 overflow-hidden rounded-md border border-line bg-mist-2">
          {imagem ? <img src={imagem} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <label className="inline-block cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
          {imagem ? "Trocar imagem" : "Escolher imagem"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setMsg(null);
              if (!f) return;
              if (f.size > IMAGEM_MAX) return setMsg("A imagem passa de 5 MB.");
              const r = new FileReader();
              r.onload = () => setImagem(String(r.result));
              r.readAsDataURL(f);
            }}
          />
        </label>
        <span className="text-[11px] text-muted">
          2 por 1 (recortada em <span className="tnum">1200 × 600</span>). JPG, PNG ou WebP até 5 MB.
        </span>
      </div>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={80}
        placeholder="Título (lido por quem usa leitor de tela)"
        aria-label="Título do banner"
        className="w-full rounded-md border border-line-2 px-3 py-1.5"
      />
      <div className="flex flex-wrap gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link: /r/minha-rifa ou https://…"
          aria-label="Link do banner"
          className="min-w-0 flex-1 rounded-md border border-line-2 px-3 py-1.5"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="number"
            min={BANNER_SEGUNDOS.min}
            max={BANNER_SEGUNDOS.max}
            value={segundos}
            onChange={(e) => setSegundos(Number(e.target.value))}
            className="tnum w-14 rounded-md border border-line-2 px-2 py-1.5"
          />
          segundos na tela
        </label>
      </div>
      {titulo && problema ? <p className="text-[11px] text-red">{problema}</p> : null}
      {msg ? <p className="rounded-md bg-red-soft px-3 py-2 text-red">{msg}</p> : null}
      <Button type="submit" disabled={!imagem || Boolean(problema) || criar.isPending}>
        {criar.isPending ? "Enviando…" : "Adicionar banner"}
      </Button>
    </form>
  );
}
