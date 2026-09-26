import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/bits";
import { FotoDoPerfil } from "@/components/Seguir";
import { apiRequest } from "@/lib/queryClient";
import {
  BIO_MAX,
  LINKS_MAX,
  ROTULO_MAX,
  validarBio,
  validarDestaque,
  validarLinks,
  type CorDeDestaque,
  type LinkDoPerfil,
} from "@shared/perfil";
import { TEMPLATE_PADRAO } from "@shared/template";
import { DestaqueOrg } from "@/components/DestaqueOrg";

const FOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * O perfil público (`/o/:slug`) e o white label do organizador: foto, capa,
 * bio, cor de destaque e links. A parte da rifa atual (prêmio, sorteio,
 * cota, autorização) entra sozinha. Foto e capa são reprocessadas no
 * servidor; o arquivo enviado nunca é servido como veio. As regras são as
 * mesmas do servidor (`shared/perfil.ts`): o erro aparece antes de salvar.
 */
export function PerfilPublicoForm({
  organizacaoId,
  slug,
  nome,
  bio: bioAtual,
  foto: fotoAtual,
  capa: capaAtual = null,
  destaque: destaqueAtual = null,
  links: linksAtuais = [],
  onSalvo,
}: {
  organizacaoId: string;
  slug: string;
  nome: string;
  bio: string | null;
  foto: string | null;
  capa?: string | null;
  destaque?: CorDeDestaque | null;
  links?: LinkDoPerfil[];
  onSalvo?: () => void;
}) {
  const [bio, setBio] = useState(bioAtual ?? "");
  const [foto, setFoto] = useState<string | null | undefined>(undefined);
  const [capa, setCapa] = useState<string | null | undefined>(undefined);
  const [destaque, setDestaque] = useState<CorDeDestaque | null>(destaqueAtual);
  const [links, setLinks] = useState<LinkDoPerfil[]>(linksAtuais);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => setBio(bioAtual ?? ""), [bioAtual]);
  const chaveDestaque = JSON.stringify(destaqueAtual);
  useEffect(() => setDestaque(destaqueAtual), [chaveDestaque]); // eslint-disable-line react-hooks/exhaustive-deps
  const chaveLinks = JSON.stringify(linksAtuais);
  useEffect(() => setLinks(linksAtuais), [chaveLinks]); // eslint-disable-line react-hooks/exhaustive-deps

  const conferir = (f: () => unknown): string | null => {
    try {
      f();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const problemaBio = conferir(() => validarBio(bio));
  const problemaCor = conferir(() => validarDestaque(destaque));
  const problemaLinks = conferir(() => validarLinks(links));
  const problema = problemaBio ?? problemaCor ?? problemaLinks;

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/organizacoes/${organizacaoId}/perfil`, {
        bio,
        destaque,
        links,
        ...(foto !== undefined ? { foto } : {}),
        ...(capa !== undefined ? { capa } : {}),
      }),
    onSuccess: () => {
      setFoto(undefined);
      setCapa(undefined);
      setMsg({ ok: true, texto: "Perfil salvo." });
      onSalvo?.();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  function lerImagem(arquivo: File | undefined, oQue: string, guardar: (d: string) => void) {
    setMsg(null);
    if (!arquivo) return;
    if (arquivo.size > FOTO_MAX_BYTES) {
      setMsg({ ok: false, texto: `A ${oQue} passa de 5 MB.` });
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => guardar(String(leitor.result));
    leitor.readAsDataURL(arquivo);
  }
  const escolherArquivo = (a: File | undefined) => lerImagem(a, "foto", setFoto);

  const mostrada = foto === undefined ? fotoAtual : foto;
  const capaMostrada = capa === undefined ? capaAtual : capa;
  const mudarLink = (i: number, campo: keyof LinkDoPerfil, valor: string) => {
    setMsg(null);
    setLinks(links.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div>
        <p className="label-xs">Capa</p>
        <div className="mt-1 aspect-[3/1] w-full max-w-md overflow-hidden rounded-md border border-line bg-mist-2">
          {capaMostrada ? (
            <img src={capaMostrada} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-muted">sem capa</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <label className="inline-block cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
            {capaMostrada ? "Trocar capa" : "Escolher capa"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => lerImagem(e.target.files?.[0], "capa", setCapa)}
            />
          </label>
          {capaMostrada ? (
            <button type="button" onClick={() => setCapa(null)} className="text-xs text-red underline">
              tirar capa
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted">
          Faixa larga no topo do perfil (3 por 1, recortada em{" "}
          <span className="tnum">1500 × 500</span>). JPG, PNG ou WebP até 5 MB.
        </p>
      </div>

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
        <p className={`tnum text-right text-[11px] ${problemaBio ? "text-red" : "text-muted"}`}>
          {bio.trim().length}/{BIO_MAX}
        </p>
        <p className="text-[11px] text-muted">
          Prêmio, data do sorteio, cota e autorização da rifa no ar entram sozinhos embaixo da bio.
        </p>
      </div>

      <fieldset>
        <legend className="label-xs">Cor de destaque</legend>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={destaque !== null}
              onChange={(e) => {
                setMsg(null);
                setDestaque(e.target.checked ? { ...TEMPLATE_PADRAO.identidade.cor } : null);
              }}
            />
            Usar uma cor própria
          </label>
          {destaque ? (
            <>
              {(["claro", "escuro"] as const).map((tema) => (
                <label key={tema} className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={destaque[tema]}
                    aria-label={`Cor no tema ${tema}`}
                    onChange={(e) => {
                      setMsg(null);
                      setDestaque({ ...destaque, [tema]: e.target.value });
                    }}
                    className="h-7 w-9 cursor-pointer rounded border border-line-2 p-0"
                  />
                  <span className="text-xs text-muted">tema {tema}</span>
                </label>
              ))}
            </>
          ) : (
            <span className="text-xs text-muted">sem cor própria, vale a da plataforma</span>
          )}
        </div>
        {destaque ? (
          <DestaqueOrg cor={destaque} className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-marca px-3 py-1 text-xs font-semibold text-white">Seguir</span>
            <span className="text-xs font-semibold text-marca">link da bio</span>
          </DestaqueOrg>
        ) : null}
        {problemaCor ? <p className="mt-1 text-[11px] text-red">{problemaCor}</p> : null}
        <p className="text-[11px] text-muted">
          Vale no botão Seguir, nos links e nos destaques do perfil. Precisa aparecer no fundo claro e no
          escuro. Verde do dinheiro, amarelo e vermelho não mudam.
        </p>
      </fieldset>

      <fieldset>
        <legend className="label-xs">Links da bio</legend>
        <ul className="mt-1 space-y-2">
          {links.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={l.rotulo}
                maxLength={ROTULO_MAX}
                placeholder="Rótulo (opcional)"
                aria-label={`Rótulo do link ${i + 1}`}
                onChange={(e) => mudarLink(i, "rotulo", e.target.value)}
                className="w-32 rounded-md border border-line-2 px-2 py-1.5 text-sm"
              />
              <input
                value={l.url}
                inputMode="url"
                placeholder="https://instagram.com/…"
                aria-label={`Endereço do link ${i + 1}`}
                onChange={(e) => mudarLink(i, "url", e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-line-2 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                className="text-xs text-red underline"
              >
                tirar
              </button>
            </li>
          ))}
        </ul>
        {links.length < LINKS_MAX ? (
          <button
            type="button"
            onClick={() => setLinks([...links, { rotulo: "", url: "" }])}
            className="mt-2 rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist"
          >
            Adicionar link
          </button>
        ) : null}
        {problemaLinks ? <p className="mt-1 text-[11px] text-red">{problemaLinks}</p> : null}
        <p className="text-[11px] text-muted">
          Até <span className="tnum">{LINKS_MAX}</span>, só endereços https. Sem rótulo, aparece o nome da rede.
        </p>
      </fieldset>

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
