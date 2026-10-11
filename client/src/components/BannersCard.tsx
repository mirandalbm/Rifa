import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, Caixa, Campo, Empty, Pill } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
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
    <CartaoDoPainel
      titulo="Banners da vitrine"
      subtitulo={
        <>
          Entram no ar na hora, sem publicar o template. Onde aparecem na tela inicial é o bloco &quot;Banners da
          plataforma&quot;, logo abaixo.
        </>
      }
      acao={
        <span className="tnum font-mono text-xs text-muted" aria-label={`${banners.length} de ${BANNERS_MAX} banners`}>
          {banners.length}/{BANNERS_MAX}
        </span>
      }
    >
      {banners.length === 0 ? <Empty>Nenhum banner. O bloco some da vitrine até ter um no ar.</Empty> : null}
      <ul className="divide-y divide-line border-t border-line empty:hidden">
        {banners.map((b, i) => (
          <li key={b.id} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm">
            <div className="flex items-start gap-3">
              <img src={b.imagem} alt="" className="aspect-[2/1] w-28 shrink-0 rounded-md border border-line object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-semibold">{b.titulo}</p>
                <p className="truncate text-xs text-muted">{b.link ?? "sem link"}</p>
                <Pill status={b.noAr ? "paid" : "pending"}>{b.noAr ? "no ar" : b.ativo ? "fora da janela" : "desligado"}</Pill>
              </div>
              <div className="flex shrink-0 items-center">
                <button type="button" aria-label={`Subir o banner ${b.titulo}`} disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1.5 hover:bg-mist disabled:opacity-30">
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button type="button" aria-label={`Descer o banner ${b.titulo}`} disabled={i === banners.length - 1} onClick={() => mover(i, 1)} className="rounded p-1.5 hover:bg-mist disabled:opacity-30">
                  <ArrowDown size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Apagar o banner ${b.titulo}`}
                  onClick={() => {
                    if (window.confirm(`Apagar o banner "${b.titulo}"?`)) apagar.mutate(b.id);
                  }}
                  className="rounded p-1.5 text-red hover:bg-mist"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>
            <Caixa marcada={b.ativo} aoMudar={(v) => alterar.mutate({ id: b.id, ativo: v })}>
              Ligado
            </Caixa>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <Campo rotulo="Segundos" className="min-w-0">
                <input
                  type="number"
                  min={BANNER_SEGUNDOS.min}
                  max={BANNER_SEGUNDOS.max}
                  defaultValue={b.segundos}
                  onBlur={(e) => Number(e.target.value) !== b.segundos && alterar.mutate({ id: b.id, segundos: Number(e.target.value) })}
                  className="campo tnum block w-20 text-sm"
                />
              </Campo>
              <Campo rotulo="De" className="min-w-0">
                <input
                  type="datetime-local"
                  defaultValue={paraCampo(b.inicio)}
                  onBlur={(e) => doCampo(e.target.value) !== b.inicio && alterar.mutate({ id: b.id, inicio: doCampo(e.target.value) })}
                  className="campo tnum text-sm"
                />
              </Campo>
              <Campo rotulo="Até" className="min-w-0">
                <input
                  type="datetime-local"
                  defaultValue={paraCampo(b.fim)}
                  onBlur={(e) => doCampo(e.target.value) !== b.fim && alterar.mutate({ id: b.id, fim: doCampo(e.target.value) })}
                  className="campo tnum text-sm"
                />
              </Campo>
            </div>
          </li>
        ))}
      </ul>
      {msg ? (
        <p role="alert" className="mx-5 mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {msg}
        </p>
      ) : null}
      {banners.length < BANNERS_MAX ? <NovoBanner onCriado={recarregar} /> : null}
    </CartaoDoPainel>
  );
}

function NovoBanner({ onCriado }: { onCriado: () => void }) {
  const [imagem, setImagem] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [link, setLink] = useState("");
  const [segundos, setSegundos] = useState<number>(BANNER_SEGUNDOS.padrao);
  const [msg, setMsg] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

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
      className="grid grid-cols-1 gap-3 border-t border-line px-5 pb-5 pt-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate();
      }}
    >
      <p className="label-xs">Novo banner</p>
      <div className="flex flex-wrap items-center gap-3">
        {imagem ? (
          <div className="aspect-[2/1] w-40 overflow-hidden rounded-md border border-line bg-mist-2">
            <img src={imagem} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        {/* O botão abre o campo de arquivo escondido: o nativo mostraria "Choose File" na língua do navegador. */}
        <Button type="button" variant="claro" onClick={() => arquivo.current?.click()}>
          {imagem ? "Trocar imagem" : "Escolher imagem"}
        </Button>
        <input
          ref={arquivo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Imagem do banner"
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            setMsg(null);
            if (!f) return;
            if (f.size > IMAGEM_MAX) return setMsg("A imagem passa de 5 MB.");
            const r = new FileReader();
            r.onload = () => setImagem(String(r.result));
            r.readAsDataURL(f);
          }}
        />
        <span className="basis-full text-[11px] text-muted">
          2 por 1 (recortada em <span className="tnum">1200 × 600</span>). JPG, PNG ou WebP até 5 MB.
        </span>
      </div>
      <Campo rotulo="Título (lido por quem usa leitor de tela)" erro={titulo && problema ? problema : null}>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} />
      </Campo>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Campo rotulo="Link (opcional)" className="min-w-0">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/r/minha-rifa ou https://…" />
        </Campo>
        <Campo rotulo="Segundos na tela" className="min-w-0">
          <input
            type="number"
            min={BANNER_SEGUNDOS.min}
            max={BANNER_SEGUNDOS.max}
            value={segundos}
            onChange={(e) => setSegundos(Number(e.target.value))}
            className="campo tnum block w-24 text-sm"
          />
        </Campo>
      </div>
      {msg ? (
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
          {msg}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={!imagem || Boolean(problema) || criar.isPending}>
          {criar.isPending ? "Enviando…" : "Adicionar banner"}
        </Button>
      </div>
    </form>
  );
}
