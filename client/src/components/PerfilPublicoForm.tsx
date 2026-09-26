import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/bits";
import { FotoDoPerfil } from "@/components/Seguir";
import { apiRequest } from "@/lib/queryClient";
import { BIO_MAX, validarBio } from "@shared/perfil";

const FOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Foto e bio do perfil público (`/o/:slug`). A parte da rifa atual (prêmio,
 * sorteio, cota, autorização) entra sozinha — aqui é só o texto da
 * organização. A foto é reprocessada no servidor; o arquivo enviado nunca é
 * servido como veio.
 */
export function PerfilPublicoForm({
  organizacaoId,
  slug,
  nome,
  bio: bioAtual,
  foto: fotoAtual,
  onSalvo,
}: {
  organizacaoId: string;
  slug: string;
  nome: string;
  bio: string | null;
  foto: string | null;
  onSalvo?: () => void;
}) {
  const [bio, setBio] = useState(bioAtual ?? "");
  const [foto, setFoto] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => setBio(bioAtual ?? ""), [bioAtual]);

  let problema: string | null = null;
  try {
    validarBio(bio);
  } catch (e) {
    problema = (e as Error).message;
  }

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/organizacoes/${organizacaoId}/perfil`, {
        bio,
        ...(foto !== undefined ? { foto } : {}),
      }),
    onSuccess: () => {
      setFoto(undefined);
      setMsg({ ok: true, texto: "Perfil salvo." });
      onSalvo?.();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  function escolherArquivo(arquivo: File | undefined) {
    setMsg(null);
    if (!arquivo) return;
    if (arquivo.size > FOTO_MAX_BYTES) {
      setMsg({ ok: false, texto: "A foto passa de 5 MB." });
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setFoto(String(leitor.result));
    leitor.readAsDataURL(arquivo);
  }

  const mostrada = foto === undefined ? fotoAtual : foto;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <FotoDoPerfil nome={nome} foto={mostrada} tamanho={64} />
        <div className="space-y-1 text-sm">
          <label className="inline-block cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
            {mostrada ? "Trocar foto" : "Escolher foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => escolherArquivo(e.target.files?.[0])}
            />
          </label>
          {mostrada ? (
            <button
              type="button"
              onClick={() => setFoto(null)}
              className="ml-2 text-xs text-red underline"
            >
              tirar foto
            </button>
          ) : null}
          <p className="text-[11px] text-muted">Quadrada fica melhor. JPG, PNG ou WebP até 5 MB.</p>
        </div>
      </div>

      <div>
        <label htmlFor={`bio-${organizacaoId}`} className="label-xs">
          Bio
        </label>
        <textarea
          id={`bio-${organizacaoId}`}
          value={bio}
          rows={4}
          maxLength={BIO_MAX + 50}
          onChange={(e) => {
            setMsg(null);
            setBio(e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        />
        <p className={`tnum text-right text-[11px] ${problema ? "text-red" : "text-muted"}`}>
          {bio.trim().length}/{BIO_MAX}
        </p>
        <p className="text-[11px] text-muted">
          Prêmio, data do sorteio, cota e autorização da rifa no ar entram sozinhos embaixo da bio.
        </p>
      </div>

      {msg ? (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={Boolean(problema) || salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar perfil"}
        </Button>
        <Link href={`/o/${slug}`} className="text-sm text-green-deep underline">
          ver perfil
        </Link>
      </div>
    </form>
  );
}
