import { Suspense, lazy, useEffect, useId, useState } from "react";
import { Copy, Download, Package, Palette, Share2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { nomeDoArquivoDaArte, nomeDoPacote, type FormatoDaArte, type TipoDeArte } from "@shared/artes";

const EditorDeImagem = lazy(() => import("@/components/EditorDeImagem").then((m) => ({ default: m.EditorDeImagem })));

/**
 * A entrada do editor de imagem (Fase C) no painel: o editor (canvas, QR)
 * só baixa quando abre.
 */
export function AbrirEditorDeImagem({ campaignId }: { campaignId: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
      <p className="min-w-0 text-xs text-ink-2">Monte a sua imagem: foto, formato, texto, preço, selo e QR por cima.</p>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border-2 border-green bg-white px-4 text-sm font-semibold text-green-deep"
      >
        <Palette size={16} aria-hidden /> Criar imagem
      </button>
      {aberto ? (
        <Suspense fallback={<span role="status" className="text-xs text-muted">Abrindo o editor…</span>}>
          <EditorDeImagem campaignId={campaignId} onFechar={() => setAberto(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

interface ListaDeArtes {
  slug: string;
  link: string;
  artes: { tipo: TipoDeArte; rotulo: string; legenda: string }[];
  formatos: { formato: FormatoDaArte; rotulo: string }[];
}

/** O navegador compartilha arquivo? (no computador, quase nunca; no celular, sim). */
function compartilhaArquivo(): boolean {
  try {
    const teste = new File([new Blob(["x"], { type: "image/jpeg" })], "teste.jpg", { type: "image/jpeg" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [teste] });
  } catch {
    return false;
  }
}

/**
 * As artes prontas da rifa (Fase A): a pessoa escolhe a arte e o formato, vê
 * a prévia e baixa ou compartilha. Quem desenha é o servidor, com os dados
 * da rifa; o QR leva o link de `link` (no kit do afiliado, com o código dele).
 * Uma imagem por escolha — a mesma serve a prévia, o baixar e o compartilhar.
 */
export function ArtesParaDivulgar({ base }: { base: string }) {
  const { data, isError } = useQuery<ListaDeArtes>({ queryKey: [base] });
  const [tipo, setTipo] = useState<TipoDeArte | null>(null);
  const [formato, setFormato] = useState<FormatoDaArte>("retrato");
  const [imagem, setImagem] = useState<{ chave: string; url: string; blob: Blob } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [podeCompartilhar] = useState(compartilhaArquivo);
  const [copiada, setCopiada] = useState(false);
  const id = useId();

  const escolhido = tipo && data?.artes.some((a) => a.tipo === tipo) ? tipo : (data?.artes[0]?.tipo ?? null);
  const chave = escolhido ? `${escolhido}|${formato}` : null;

  useEffect(() => {
    if (!escolhido) return;
    let vivo = true;
    let url: string | null = null;
    setErro(null);
    fetch(`${base}/${escolhido}?formato=${formato}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const corpo = await r.json().catch(() => null);
          throw new Error(corpo?.message ?? "Não foi possível desenhar a arte agora.");
        }
        const blob = await r.blob();
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setImagem({ chave: `${escolhido}|${formato}`, url, blob });
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [base, escolhido, formato]);

  if (isError) return <p className="text-xs text-red">Não foi possível carregar as artes.</p>;
  if (!data) return <p className="text-xs text-muted">Carregando as artes…</p>;
  if (data.artes.length === 0) {
    return <p className="text-xs text-muted">Esta rifa ainda não tem arte: as artes aparecem com a rifa no ar (rifa de teste ou travada não tem).</p>;
  }

  const pronta = imagem && imagem.chave === chave ? imagem : null;
  const daEscolhida = data.artes.find((a) => a.tipo === escolhido);
  const rotuloDoTipo = daEscolhida?.rotulo ?? "";
  const legenda = daEscolhida?.legenda ?? "";
  const rotuloDoFormato = data.formatos.find((f) => f.formato === formato)?.rotulo ?? "";
  const nome = escolhido ? nomeDoArquivoDaArte(data.slug, escolhido, formato) : "arte.jpg";

  async function compartilhar() {
    if (!pronta) return;
    try {
      await navigator.share({ files: [new File([pronta.blob], nome, { type: "image/jpeg" })], text: legenda });
    } catch {
      // Cancelar o compartilhamento não é erro.
    }
  }

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(legenda);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      setCopiada(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
      <div className="min-w-0 space-y-3">
        <fieldset>
          <legend className="label-xs mb-1">Arte</legend>
          <div className="flex flex-wrap gap-2">
            {data.artes.map((a) => (
              <label key={a.tipo} className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ${a.tipo === escolhido ? "border-green bg-green-soft text-green-deep" : "border-line text-ink-2"}`}>
                <input type="radio" name={`${id}-tipo`} className="sr-only" checked={a.tipo === escolhido} onChange={() => setTipo(a.tipo)} />
                {a.tipo === escolhido ? <span aria-hidden>✓</span> : null}
                {a.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label-xs mb-1">Formato</legend>
          <div className="flex flex-wrap gap-2">
            {data.formatos.map((f) => (
              <label key={f.formato} className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ${f.formato === formato ? "border-green bg-green-soft text-green-deep" : "border-line text-ink-2"}`}>
                <input type="radio" name={`${id}-formato`} className="sr-only" checked={f.formato === formato} onChange={() => setFormato(f.formato)} />
                {f.formato === formato ? <span aria-hidden>✓</span> : null}
                {f.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">
          O QR leva a <span className="tnum break-all text-ink-2">{data.link.replace(/^https?:\/\//, "")}</span>. Os números são os de agora: baixe de novo quando
          mudarem.
        </p>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="label-xs">Legenda sugerida</span>
            <button type="button" onClick={copiarLegenda} className="inline-flex min-h-6 items-center gap-1 text-xs font-semibold text-green-deep">
              <Copy size={14} aria-hidden /> {copiada ? "Copiada" : "Copiar"}
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words rounded-md border border-line px-3 py-2 text-xs leading-snug text-ink-2">{legenda}</p>
          <p className="mt-1 text-[11px] text-muted">O pacote traz esta arte nos três formatos e a legenda num arquivo de texto.</p>
        </div>
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <a
            href={pronta?.url}
            download={nome}
            aria-disabled={!pronta}
            className={`inline-flex min-h-9 items-center gap-2 rounded-md bg-green px-4 text-sm font-semibold text-on-green ${pronta ? "" : "pointer-events-none opacity-50"}`}
          >
            <Download size={16} aria-hidden /> Baixar
          </a>
          {escolhido ? (
            <a
              href={`${base}/${escolhido}/pacote`}
              download={nomeDoPacote(data.slug, escolhido)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border-2 border-green bg-white px-4 text-sm font-semibold text-green-deep"
            >
              <Package size={16} aria-hidden /> Baixar pacote
            </a>
          ) : null}
          {podeCompartilhar ? (
            <button
              type="button"
              onClick={compartilhar}
              disabled={!pronta}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border-2 border-green bg-white px-4 text-sm font-semibold text-green-deep disabled:opacity-50"
            >
              <Share2 size={16} aria-hidden /> Compartilhar
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-lg border border-line bg-mist" style={{ aspectRatio: formato === "vertical" ? "9 / 16" : formato === "quadrado" ? "1 / 1" : "4 / 5" }}>
          {pronta ? (
            <img src={pronta.url} alt={`Prévia da arte: ${rotuloDoTipo}, ${rotuloDoFormato}`} className="h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-xs text-muted" role="status">
              {erro ? "Sem prévia" : "Desenhando…"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
