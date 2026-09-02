"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Midia = { id: string; tipo: "BANNER" | "IMAGEM" | "VIDEO" };

type Props = {
  rifaId: string;
  banner: Midia | null;
  imagens: Midia[];
  video: Midia | null;
  limiteImagens: number;
};

export default function GerenciarMidia({ rifaId, banner, imagens, video, limiteImagens }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const referencias = {
    BANNER: useRef<HTMLInputElement>(null),
    IMAGEM: useRef<HTMLInputElement>(null),
    VIDEO: useRef<HTMLInputElement>(null),
  };

  async function enviar(tipo: "BANNER" | "IMAGEM" | "VIDEO", arquivo: File) {
    setEnviando(tipo);
    setErro(null);

    const dados = new FormData();
    dados.append("tipo", tipo);
    dados.append("arquivo", arquivo);

    const resposta = await fetch(`/api/organizadora/rifas/${rifaId}/midia`, {
      method: "POST",
      body: dados,
    });

    setEnviando(null);
    if (referencias[tipo].current) referencias[tipo].current.value = "";

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      setErro(corpo.erro ?? "Não foi possível enviar o arquivo.");
      return;
    }

    router.refresh();
  }

  async function remover(midiaId: string) {
    if (!window.confirm("Remover este arquivo?")) return;

    const resposta = await fetch(`/api/organizadora/rifas/${rifaId}/midia`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ midiaId }),
    });

    if (!resposta.ok) {
      setErro("Não foi possível remover o arquivo.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="cartao space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Fotos e vídeo do prêmio</h2>
        <p className="text-sm text-slate-600">
          JPG, PNG ou WEBP até 5 MB por imagem; MP4 ou WEBM até 50 MB no vídeo. O banner e o vídeo
          são únicos — enviar outro substitui o atual.
        </p>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {/* Banner de capa */}
      <div>
        <h3 className="mb-2 font-medium">Banner de capa</h3>
        {banner ? (
          <div className="flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/midia/${banner.id}`}
              alt="Banner de capa da rifa"
              className="h-32 w-full max-w-md rounded-lg object-cover"
            />
            <button type="button" onClick={() => remover(banner.id)} className="botao-secundario">
              Remover
            </button>
          </div>
        ) : (
          <p className="mb-2 text-sm text-slate-500">Nenhum banner enviado.</p>
        )}
        <input
          ref={referencias.BANNER}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-2 block text-sm"
          disabled={enviando !== null}
          onChange={(e) => e.target.files?.[0] && enviar("BANNER", e.target.files[0])}
        />
        {enviando === "BANNER" && <p className="text-sm text-slate-500">Enviando…</p>}
      </div>

      {/* Galeria */}
      <div>
        <h3 className="mb-2 font-medium">
          Imagens do prêmio ({imagens.length}/{limiteImagens})
        </h3>
        {imagens.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-3">
            {imagens.map((imagem) => (
              <div key={imagem.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/midia/${imagem.id}`}
                  alt="Foto do prêmio"
                  className="h-24 w-24 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => remover(imagem.id)}
                  aria-label="Remover imagem"
                  className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-red-600 text-xs font-bold text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {imagens.length < limiteImagens ? (
          <input
            ref={referencias.IMAGEM}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block text-sm"
            disabled={enviando !== null}
            onChange={(e) => e.target.files?.[0] && enviar("IMAGEM", e.target.files[0])}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Limite de {limiteImagens} imagens atingido. Remova uma para enviar outra.
          </p>
        )}
        {enviando === "IMAGEM" && <p className="text-sm text-slate-500">Enviando…</p>}
      </div>

      {/* Vídeo */}
      <div>
        <h3 className="mb-2 font-medium">Vídeo do prêmio</h3>
        {video ? (
          <div className="flex flex-wrap items-start gap-3">
            <video src={`/api/midia/${video.id}`} controls className="h-40 rounded-lg bg-black" />
            <button type="button" onClick={() => remover(video.id)} className="botao-secundario">
              Remover
            </button>
          </div>
        ) : (
          <p className="mb-2 text-sm text-slate-500">Nenhum vídeo enviado.</p>
        )}
        <input
          ref={referencias.VIDEO}
          type="file"
          accept="video/mp4,video/webm"
          className="mt-2 block text-sm"
          disabled={enviando !== null}
          onChange={(e) => e.target.files?.[0] && enviar("VIDEO", e.target.files[0])}
        />
        {enviando === "VIDEO" && (
          <p className="text-sm text-slate-500">Enviando vídeo… pode levar alguns segundos.</p>
        )}
      </div>
    </section>
  );
}
