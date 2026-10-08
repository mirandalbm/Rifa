import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as PE } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, ImagePlus, Share2, Trash2, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Janela } from "@/components/Janela";
import { Campo } from "@/components/bits";
import { SugestaoDoAssistente } from "@/components/SugestaoDoAssistente";
import { camadaNoPonto, carregarFontesDoEditor, desenharImagem, type Caixa, type RecursosDoDesenho } from "@/lib/desenharArte";
import { FORMATOS_DA_ARTE, FORMATOS_DA_ARTE_LISTA, type FormatoDaArte, type TipoDeArte } from "@shared/artes";
import { EMOJIS_DA_FIGURINHA } from "@shared/figurinhasStory";
import {
  CAMADAS_MAX,
  CORES_DO_TEXTO,
  ENQUADRAMENTO_INICIAL,
  FONTES_DO_EDITOR,
  POSICAO_MAX,
  POSICAO_MIN,
  ROTULO_DA_CAMADA,
  TAMANHO_MAX,
  TAMANHO_MIN,
  TEXTO_DA_CAMADA_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  camadaNova,
  enquadramentoLimitado,
  medidasDoFormato,
  nomeDaImagemDoEditor,
  problemaNoTextoDaCamada,
  type Camada,
  type CorDoTexto,
  type Enquadramento,
  type FonteDoEditor,
  type TipoDeCamada,
} from "@shared/editorImagem";

interface DadosDoEditor {
  slug: string;
  link: string;
  organizacao: { nome: string; foto: string | null };
  oficiais: { preco: string; selo: string | null };
  fundos: { id: string; url: string; rotulo: string }[];
  artes: { tipo: TipoDeArte; rotulo: string }[];
}

/**
 * Onde o editor fala com o servidor: no painel, as rotas da rifa (e o envio
 * ao carrossel); no kit do afiliado, as dele — sem carrossel, que é da
 * organização.
 */
export interface PortasDoEditor {
  dados: string;
  conferir: string;
  /** A base das artes prontas (`…/artes`), para usar uma como fundo. */
  artes: string;
  /** A base das mídias da rifa (`…/media`): só no painel. */
  carrossel?: string;
  /** Onde pedir as frases ao assistente (`…/sugerir`); some se o assistente não estiver ligado. */
  sugerir?: string;
}

type Fundo = { origem: "nenhum" } | { origem: "foto"; id: string } | { origem: "arte"; tipo: TipoDeArte } | { origem: "aparelho"; nome: string };

/** A prévia desenha na metade da medida final: leve, e nítida o bastante na tela. */
const ESCALA_DA_PREVIA = 0.5;
const FOTO_DO_APARELHO_MAX_BYTES = 20 * 1024 * 1024;

const pilula = (ativa: boolean) =>
  `flex min-h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ${ativa ? "border-green bg-green-soft text-green-deep" : "border-line text-ink-2"}`;

/** Abre a imagem de um endereço do próprio site (ou `blob:`) sem sujar o canvas. */
async function abrirImagem(url: string): Promise<HTMLImageElement> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Não foi possível abrir a imagem.");
  return abrirBlob(await r.blob());
}

function abrirBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error("Esse arquivo não é uma imagem que o navegador abre."));
    img.src = url;
  });
}

async function modulosDoQr(link: string): Promise<boolean[][]> {
  const { create } = await import("qrcode");
  const m = create(link, { errorCorrectionLevel: "M" }).modules;
  return Array.from({ length: m.size }, (_, i) => Array.from({ length: m.size }, (_, j) => Boolean(m.data[i * m.size + j])));
}

function compartilhaArquivo(): boolean {
  try {
    const teste = new File([new Blob(["x"], { type: "image/jpeg" })], "teste.jpg", { type: "image/jpeg" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [teste] });
  } catch {
    return false;
  }
}

/**
 * O editor de imagem da rifa (Fase C do `docs/PLANO-FERRAMENTAS.md`): fundo,
 * formato e figurinhas por cima, desenhados no canvas do navegador. Antes de
 * a imagem sair (baixar, compartilhar ou ir para o carrossel), o servidor
 * confere o texto (`/editor/conferir`); a imagem entra pelo envio de sempre.
 */
export function EditorDeImagem({ portas, onFechar }: { portas: PortasDoEditor; onFechar: () => void }) {
  const { data, isError } = useQuery<DadosDoEditor>({ queryKey: [portas.dados] });
  const id = useId();
  const [formato, setFormato] = useState<FormatoDaArte>("retrato");
  const [fundo, setFundo] = useState<Fundo>({ origem: "nenhum" });
  const [imagemDoFundo, setImagemDoFundo] = useState<HTMLImageElement | null>(null);
  const [carregandoFundo, setCarregandoFundo] = useState(false);
  const [enquadramento, setEnquadramento] = useState<Enquadramento>(ENQUADRAMENTO_INICIAL);
  const [camadas, setCamadas] = useState<Camada[]>(() => [camadaNova("preco"), camadaNova("qr")]);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [qr, setQr] = useState<boolean[][] | null>(null);
  const [fontes, setFontes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pronta, setPronta] = useState<{ url: string; blob: Blob; nome: string } | null>(null);
  const [trabalhando, setTrabalhando] = useState<null | "conferindo" | "enviando">(null);
  const [descricao, setDescricao] = useState("");
  const [enviada, setEnviada] = useState(false);
  const [podeCompartilhar] = useState(compartilhaArquivo);
  const previa = useRef<HTMLCanvasElement>(null);
  const caixas = useRef<Caixa[]>([]);
  const arraste = useRef<{ alvo: number | "fundo"; x: number; y: number } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const { largura, altura } = medidasDoFormato(formato);
  const temSelo = Boolean(data?.oficiais.selo);

  // As fontes da plataforma chegam depois: desenha de novo quando chegarem.
  useEffect(() => {
    let vivo = true;
    carregarFontesDoEditor().then(() => vivo && setFontes((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let vivo = true;
    modulosDoQr(data.link).then((m) => vivo && setQr(m)).catch(() => vivo && setQr(null));
    if (data.organizacao.foto) abrirImagem(data.organizacao.foto).then((i) => vivo && setLogo(i)).catch(() => vivo && setLogo(null));
    return () => {
      vivo = false;
    };
  }, [data]);

  // A arte pronta muda com o formato; a foto, não.
  useEffect(() => {
    if (fundo.origem !== "arte" && fundo.origem !== "foto") return;
    let vivo = true;
    const url = fundo.origem === "arte" ? `${portas.artes}/${fundo.tipo}?formato=${formato}` : (data?.fundos.find((f) => f.id === fundo.id)?.url ?? null);
    if (!url) return;
    setCarregandoFundo(true);
    abrirImagem(url)
      .then((img) => {
        if (!vivo) return;
        setImagemDoFundo(img);
        setEnquadramento(ENQUADRAMENTO_INICIAL);
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregandoFundo(false));
    return () => {
      vivo = false;
    };
  }, [portas.artes, data, fundo, formato]);

  // Qualquer mudança desfaz a imagem pronta: o que sai é sempre o que está na tela.
  useEffect(() => {
    setPronta((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
    setEnviada(false);
  }, [formato, fundo, imagemDoFundo, enquadramento, camadas]);

  const recursos: RecursosDoDesenho = useMemo(
    () => ({
      fundo: fundo.origem === "nenhum" ? null : imagemDoFundo,
      medidaDoFundo: imagemDoFundo && fundo.origem !== "nenhum" ? { largura: imagemDoFundo.naturalWidth, altura: imagemDoFundo.naturalHeight } : null,
      logo,
      nomeDaOrganizacao: data?.organizacao.nome ?? "",
      qr,
      preco: data?.oficiais.preco ?? "",
      selo: data?.oficiais.selo ?? null,
    }),
    [fundo, imagemDoFundo, logo, qr, data],
  );

  const desenhar = useCallback(() => {
    const canvas = previa.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    caixas.current = desenharImagem(ctx, { largura, altura, escala: ESCALA_DA_PREVIA, enquadramento, camadas, recursos, selecionada });
  }, [largura, altura, enquadramento, camadas, recursos, selecionada]);

  useEffect(() => {
    desenhar();
  }, [desenhar, fontes]);

  // ------------------------------------------------------------- camadas

  const atual = selecionada != null ? camadas[selecionada] : null;
  const mudar = (i: number, m: Partial<Camada>) => setCamadas((cs) => cs.map((c, j) => (j === i ? ({ ...c, ...m } as Camada) : c)));
  const limitar = (v: number) => Math.min(POSICAO_MAX, Math.max(POSICAO_MIN, v));

  function adicionar(tipo: TipoDeCamada) {
    if (camadas.length >= CAMADAS_MAX) return;
    setCamadas((cs) => [...cs, camadaNova(tipo)]);
    setSelecionada(camadas.length);
  }
  function remover(i: number) {
    setCamadas((cs) => cs.filter((_, j) => j !== i));
    setSelecionada(null);
  }
  const oficialJaTem = (tipo: TipoDeCamada) => camadas.some((c) => c.tipo === tipo);
  /** A frase do assistente: troca o texto selecionado ou entra como texto novo. */
  function usarFrase(frase: string) {
    if (atual?.tipo === "texto" && selecionada != null) return mudar(selecionada, { texto: frase });
    if (camadas.length >= CAMADAS_MAX) return;
    const nova = camadaNova("texto");
    setCamadas((cs) => [...cs, { ...nova, texto: frase } as Camada]);
    setSelecionada(camadas.length);
  }

  // ------------------------------------------------------------- arrastar

  function ponto(e: PE<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * largura, y: ((e.clientY - r.top) / r.height) * altura };
  }
  function aoTocar(e: PE<HTMLCanvasElement>) {
    const p = ponto(e);
    const i = camadaNoPonto(caixas.current, p.x, p.y);
    setSelecionada(i);
    if (i == null && !recursos.fundo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { alvo: i ?? "fundo", ...p };
  }
  function aoMover(e: PE<HTMLCanvasElement>) {
    const a = arraste.current;
    if (!a) return;
    const p = ponto(e);
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    arraste.current = { ...a, ...p };
    if (a.alvo === "fundo") {
      const m = recursos.medidaDoFundo;
      if (!m) return;
      setEnquadramento((en) => {
        const zoomEscala = Math.max(largura / m.largura, altura / m.altura) * en.zoom;
        return enquadramentoLimitado(m, { largura, altura }, { ...en, cx: en.cx - dx / (m.largura * zoomEscala), cy: en.cy - dy / (m.altura * zoomEscala) });
      });
    } else {
      const i = a.alvo;
      setCamadas((cs) => cs.map((c, j) => (j === i ? { ...c, x: limitar(c.x + dx / largura), y: limitar(c.y + dy / altura) } : c)));
    }
  }
  function aoSoltar() {
    arraste.current = null;
  }

  // ------------------------------------------------------------- fundo

  async function escolherDoAparelho(file: File | undefined) {
    if (!file) return;
    setErro(null);
    if (!file.type.startsWith("image/")) return setErro("Escolha uma foto (JPG, PNG ou WebP).");
    if (file.size > FOTO_DO_APARELHO_MAX_BYTES) return setErro("A foto passa de 20 MB.");
    try {
      const img = await abrirBlob(file);
      setFundo({ origem: "aparelho", nome: file.name });
      setImagemDoFundo(img);
      setEnquadramento(ENQUADRAMENTO_INICIAL);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // ------------------------------------------------------------- sair

  async function gerar(): Promise<{ url: string; blob: Blob; nome: string } | null> {
    if (pronta) return pronta;
    if (!data) return null;
    setErro(null);
    setTrabalhando("conferindo");
    try {
      // O texto passa pela régua no servidor antes de virar pixel.
      await apiRequest("POST", portas.conferir, { camadas });
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("O navegador não deixou desenhar a imagem.");
      desenharImagem(ctx, { largura, altura, escala: 1, enquadramento, camadas, recursos, selecionada: null });
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) throw new Error("O navegador não conseguiu gerar a imagem.");
      const feita = { url: URL.createObjectURL(blob), blob, nome: nomeDaImagemDoEditor(data.slug, formato) };
      setPronta(feita);
      return feita;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setTrabalhando(null);
    }
  }

  async function baixar() {
    const p = await gerar();
    if (!p) return;
    const a = document.createElement("a");
    a.href = p.url;
    a.download = p.nome;
    a.click();
  }

  async function compartilhar() {
    const p = await gerar();
    if (!p) return;
    try {
      await navigator.share({ files: [new File([p.blob], p.nome, { type: "image/jpeg" })] });
    } catch {
      // Cancelar não é erro.
    }
  }

  async function porNoCarrossel() {
    const alt = descricao.trim();
    if (!alt) return setErro("Descreva a imagem para quem não enxerga antes de pôr no carrossel.");
    const chave = portas.carrossel;
    if (!chave) return;
    const p = await gerar();
    if (!p) return;
    setTrabalhando("enviando");
    try {
      const ticket = (await (
        await apiRequest("POST", `${chave}/upload-url`, { role: "photo", filename: p.nome, mime: "image/jpeg", bytes: p.blob.size })
      ).json()) as { url: string; storageKey: string; headers: Record<string, string> };
      const r = await fetch(ticket.url, { method: "PUT", body: p.blob, headers: ticket.headers ?? {}, credentials: "include" });
      if (!r.ok) throw new Error("Falha ao enviar a imagem. Confira a internet e tente de novo.");
      await apiRequest("POST", chave, { role: "photo", storageKey: ticket.storageKey, mime: "image/jpeg", altText: alt });
      await queryClient.invalidateQueries({ queryKey: [chave] });
      setEnviada(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setTrabalhando(null);
    }
  }

  // ------------------------------------------------------------- tela

  const problemaDoTexto = atual?.tipo === "texto" ? problemaNoTextoDaCamada(atual.texto.replace(/\s+/g, " ").trim()) : null;
  const ocupado = trabalhando !== null;
  const descricaoDaPrevia = `Prévia da imagem, ${FORMATOS_DA_ARTE[formato].rotulo}, com ${camadas.length} ${camadas.length === 1 ? "camada" : "camadas"}: ${camadas.map((c) => (c.tipo === "texto" ? `texto "${c.texto}"` : ROTULO_DA_CAMADA[c.tipo])).join(", ") || "nenhuma"}.`;

  return (
    <Janela onFechar={onFechar} rotuloPor={`${id}-titulo`} largura="sm:max-w-5xl" className="text-ink">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-3">
        <h2 id={`${id}-titulo`} className="text-base font-bold">
          Editor de imagem
        </h2>
        <button type="button" onClick={onFechar} aria-label="Fechar o editor" className="grid h-9 w-9 place-items-center rounded-full hover:bg-mist">
          <X size={20} aria-hidden />
        </button>
      </div>
      {isError ? (
        <p className="p-4 text-sm text-red">Não foi possível abrir o editor.</p>
      ) : !data ? (
        <p className="p-4 text-sm text-muted" role="status">
          Abrindo o editor…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          {/* No celular e no tablet a prévia fica presa embaixo do título (menor), para
              a pessoa ver o que muda enquanto rola até os controles. */}
          <div className="sticky top-[61px] z-10 -mx-4 -mt-4 min-w-0 border-b border-line bg-white px-4 pb-2 pt-3 lg:static lg:m-0 lg:border-0 lg:p-0">
            <div
              className="relative mx-auto w-full max-w-[calc(36svh*var(--razao))] lg:max-w-[calc(58svh*var(--razao))]"
              style={{ ["--razao" as string]: String(largura / altura) }}
            >
              <canvas
                ref={previa}
                width={largura * ESCALA_DA_PREVIA}
                height={altura * ESCALA_DA_PREVIA}
                role="img"
                aria-label={descricaoDaPrevia}
                onPointerDown={aoTocar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                className="block w-full touch-none rounded-lg border border-line bg-mist"
                style={{ aspectRatio: `${largura} / ${altura}` }}
              />
              {carregandoFundo ? (
                <span role="status" className="absolute left-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-branco">
                  Abrindo a foto…
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-center text-[11px] text-muted lg:mt-2 lg:text-xs">Arraste a figurinha para mudar de lugar; arraste a foto para enquadrar.</p>
          </div>

          <div className="min-w-0 space-y-4">
            <fieldset>
              <legend className="label-xs mb-1">Formato</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATOS_DA_ARTE_LISTA.map((f) => (
                  <label key={f} className={pilula(f === formato)}>
                    <input type="radio" name={`${id}-formato`} className="sr-only" checked={f === formato} onChange={() => setFormato(f)} />
                    {f === formato ? <span aria-hidden>✓</span> : null}
                    {FORMATOS_DA_ARTE[f].rotulo}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="label-xs mb-1">Fundo</legend>
              <div className="flex flex-wrap gap-2">
                <label className={pilula(fundo.origem === "nenhum")}>
                  <input type="radio" name={`${id}-fundo`} className="sr-only" checked={fundo.origem === "nenhum"} onChange={() => setFundo({ origem: "nenhum" })} />
                  {fundo.origem === "nenhum" ? <span aria-hidden>✓</span> : null}
                  Cor da casa
                </label>
                {data.fundos.map((f) => {
                  const ativo = fundo.origem === "foto" && fundo.id === f.id;
                  return (
                    <label key={f.id} className={pilula(ativo)}>
                      <input type="radio" name={`${id}-fundo`} className="sr-only" checked={ativo} onChange={() => setFundo({ origem: "foto", id: f.id })} />
                      {ativo ? <span aria-hidden>✓</span> : null}
                      {f.rotulo}
                    </label>
                  );
                })}
                {data.artes.map((a) => {
                  const ativo = fundo.origem === "arte" && fundo.tipo === a.tipo;
                  return (
                    <label key={a.tipo} className={pilula(ativo)}>
                      <input type="radio" name={`${id}-fundo`} className="sr-only" checked={ativo} onChange={() => setFundo({ origem: "arte", tipo: a.tipo })} />
                      {ativo ? <span aria-hidden>✓</span> : null}
                      Arte: {a.rotulo}
                    </label>
                  );
                })}
                <button type="button" onClick={() => arquivo.current?.click()} className={pilula(fundo.origem === "aparelho")}>
                  {fundo.origem === "aparelho" ? <span aria-hidden>✓</span> : <Upload size={14} aria-hidden />}
                  Foto do aparelho
                </button>
                <input
                  ref={arquivo}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Escolher uma foto do aparelho"
                  onChange={(e) => {
                    void escolherDoAparelho(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              {recursos.fundo ? (
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor={`${id}-zoom`} className="text-xs text-ink-2">
                    Aproximar
                  </label>
                  <input
                    id={`${id}-zoom`}
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={0.05}
                    value={enquadramento.zoom}
                    onChange={(e) => {
                      const m = recursos.medidaDoFundo;
                      const zoom = Number(e.target.value);
                      setEnquadramento((en) => (m ? enquadramentoLimitado(m, { largura, altura }, { ...en, zoom }) : { ...en, zoom }));
                    }}
                    className="min-w-0 flex-1 accent-green"
                  />
                  <button type="button" onClick={() => setEnquadramento(ENQUADRAMENTO_INICIAL)} className="min-h-8 text-xs font-semibold text-green-deep">
                    Centralizar
                  </button>
                </div>
              ) : null}
            </fieldset>

            <fieldset>
              <legend className="label-xs mb-1">
                Figurinhas (<span className="tnum">{camadas.length}</span> de <span className="tnum">{CAMADAS_MAX}</span>)
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["texto", "emoji", "preco", "selo", "logo", "qr"] as const).map((tipo) => {
                  const oficial = tipo !== "texto" && tipo !== "emoji";
                  const indisponivel = camadas.length >= CAMADAS_MAX || (oficial && oficialJaTem(tipo)) || (tipo === "selo" && !temSelo);
                  return (
                    <button
                      key={tipo}
                      type="button"
                      disabled={indisponivel}
                      onClick={() => adicionar(tipo)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-ink-2 disabled:opacity-40"
                    >
                      <ImagePlus size={14} aria-hidden /> {ROTULO_DA_CAMADA[tipo]}
                    </button>
                  );
                })}
              </div>
              {!temSelo ? <p className="mt-1 text-[11px] text-muted">O selo SPA/MF aparece com a autorização da rifa.</p> : null}
              {portas.sugerir ? (
                <div className="mt-3">
                  <SugestaoDoAssistente url={portas.sugerir} tipo="texto" onEscolher={usarFrase} />
                </div>
              ) : null}
              {camadas.length ? (
                <p className="mt-3 text-[11px] font-semibold text-ink-2">Na imagem — toque para mudar:</p>
              ) : null}
              {camadas.length ? (
                <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Figurinhas na imagem">
                  {camadas.map((c, i) => (
                    <li key={i}>
                      <button type="button" aria-pressed={i === selecionada} onClick={() => setSelecionada(i === selecionada ? null : i)} className={pilula(i === selecionada)}>
                        {i === selecionada ? <span aria-hidden>✓</span> : null}
                        <span className="max-w-[10rem] truncate">{c.tipo === "texto" ? c.texto || "Texto" : c.tipo === "emoji" ? c.emoji : ROTULO_DA_CAMADA[c.tipo]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </fieldset>

            {atual && selecionada != null ? (
              <div className="space-y-3 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{ROTULO_DA_CAMADA[atual.tipo]}</span>
                  <button type="button" onClick={() => remover(selecionada)} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-red">
                    <Trash2 size={14} aria-hidden /> Tirar
                  </button>
                </div>
                {atual.tipo === "texto" ? (
                  <>
                    <Campo rotulo="Texto" erro={problemaDoTexto} dica={`Até ${TEXTO_DA_CAMADA_MAX} caracteres, sem link e sem telefone.`}>
                      <input value={atual.texto} maxLength={TEXTO_DA_CAMADA_MAX} onChange={(e) => mudar(selecionada, { texto: e.target.value })} />
                    </Campo>
                    <fieldset>
                      <legend className="label-xs mb-1">Fonte</legend>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(FONTES_DO_EDITOR) as FonteDoEditor[]).map((f) => (
                          <label key={f} className={pilula(atual.fonte === f)} style={{ fontFamily: `"${FONTES_DO_EDITOR[f].familia}"` }}>
                            <input type="radio" name={`${id}-fonte`} className="sr-only" checked={atual.fonte === f} onChange={() => mudar(selecionada, { fonte: f })} />
                            {atual.fonte === f ? <span aria-hidden>✓</span> : null}
                            {FONTES_DO_EDITOR[f].rotulo}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="label-xs mb-1">Cor</legend>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(CORES_DO_TEXTO) as CorDoTexto[]).map((cor) => (
                          <label key={cor} className={pilula(atual.cor === cor)}>
                            <input type="radio" name={`${id}-cor`} className="sr-only" checked={atual.cor === cor} onChange={() => mudar(selecionada, { cor })} />
                            <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: CORES_DO_TEXTO[cor].hex }} />
                            {CORES_DO_TEXTO[cor].rotulo}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="inline-flex min-h-6 items-center gap-2">
                        <input type="checkbox" checked={atual.contorno} onChange={(e) => mudar(selecionada, { contorno: e.target.checked })} className="accent-green" />
                        Contorno
                      </label>
                      <label className="inline-flex min-h-6 items-center gap-2">
                        <input type="checkbox" checked={atual.sombra} onChange={(e) => mudar(selecionada, { sombra: e.target.checked })} className="accent-green" />
                        Sombra
                      </label>
                    </div>
                  </>
                ) : null}
                {atual.tipo === "emoji" ? (
                  <Campo rotulo="Emoji">
                    <select value={atual.emoji} onChange={(e) => mudar(selecionada, { emoji: e.target.value })}>
                      {EMOJIS_DA_FIGURINHA.map((e) => (
                        <option key={e.emoji} value={e.emoji}>
                          {e.emoji} {e.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ) : null}
                {atual.tipo === "preco" || atual.tipo === "selo" || atual.tipo === "qr" || atual.tipo === "logo" ? (
                  <p className="text-xs text-muted">
                    {atual.tipo === "preco"
                      ? `${data.oficiais.preco} — sai da rifa, não se edita.`
                      : atual.tipo === "selo"
                        ? `${data.oficiais.selo ?? ""} — sai da autorização da rifa.`
                        : atual.tipo === "qr"
                          ? `Leva a ${data.link.replace(/^https?:\/\//, "")}.`
                          : data.organizacao.foto
                            ? "A foto do perfil da organização."
                            : "Sem foto no perfil: vai a inicial da organização."}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <label htmlFor={`${id}-tamanho`} className="text-xs text-ink-2">
                    Tamanho
                  </label>
                  <input
                    id={`${id}-tamanho`}
                    type="range"
                    min={TAMANHO_MIN}
                    max={TAMANHO_MAX}
                    step={0.005}
                    value={atual.tamanho}
                    onChange={(e) => mudar(selecionada, { tamanho: Number(e.target.value) })}
                    className="min-w-0 flex-1 accent-green"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Mover a figurinha">
                  {(
                    [
                      ["Para a esquerda", ArrowLeft, -0.02, 0],
                      ["Para cima", ArrowUp, 0, -0.02],
                      ["Para baixo", ArrowDown, 0, 0.02],
                      ["Para a direita", ArrowRight, 0.02, 0],
                    ] as const
                  ).map(([rotulo, Icone, dx, dy]) => (
                    <button
                      key={rotulo}
                      type="button"
                      aria-label={`Mover ${rotulo.toLowerCase()}`}
                      onClick={() => mudar(selecionada, { x: limitar(atual.x + dx), y: limitar(atual.y + dy) })}
                      className="grid h-9 w-9 place-items-center rounded-md border border-line"
                    >
                      <Icone size={16} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {erro ? (
              <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
                {erro}
              </p>
            ) : null}

            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-[11px] text-muted">
                O texto é conferido antes de virar imagem: sem link, sem telefone e sem pedido de pagamento por fora. Só vale bilhete pago pela plataforma.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={baixar} disabled={ocupado} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-green px-4 text-sm font-semibold text-on-green disabled:opacity-50">
                  <Download size={16} aria-hidden /> {trabalhando === "conferindo" ? "Conferindo…" : "Baixar"}
                </button>
                {podeCompartilhar ? (
                  <button
                    type="button"
                    onClick={compartilhar}
                    disabled={ocupado}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border-2 border-green bg-white px-4 text-sm font-semibold text-green-deep disabled:opacity-50"
                  >
                    <Share2 size={16} aria-hidden /> Compartilhar
                  </button>
                ) : null}
              </div>
              {portas.carrossel ? (
                <>
              <Campo rotulo="Descrição para quem não enxerga" dica="Vai com a imagem no carrossel da rifa.">
                <input value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: a moto do prêmio com o preço da cota" />
              </Campo>
              <button
                type="button"
                onClick={porNoCarrossel}
                disabled={ocupado || enviada}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border-2 border-green bg-white px-4 text-sm font-semibold text-green-deep disabled:opacity-50"
              >
                <ImagePlus size={16} aria-hidden /> {trabalhando === "enviando" ? "Enviando…" : enviada ? "Está no carrossel" : "Pôr no carrossel da rifa"}
              </button>
              {enviada ? (
                <p role="status" className="text-xs text-green-deep">
                  ✓ A imagem entrou no carrossel da rifa.
                </p>
              ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Janela>
  );
}
