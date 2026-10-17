import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerFoto } from "@/lib/anexo";
import { APELIDO_MAX, BIO_MAX, NOTA_MAX, validarApelido, validarBio, validarLinkDoApostador } from "@shared/perfilApostador";
import { SeloVerificado } from "@/components/SeloVerificado";

interface MeuPerfil {
  apelido: string | null;
  foto: string | null;
  nomeReal: string;
  verificado?: boolean;
  bio?: string | null;
  link?: string | null;
  nota?: string | null;
  notaAte?: string | null;
}

/**
 * A nota de 24 horas, como balão sobre a foto. Quem vê a nota é quem segue a
 * pessoa e a própria pessoa (o servidor decide: aqui só se mostra o que veio).
 * `invertida`: sobre a faixa escura do perfil público.
 */
export function BalaoDaNota({ nota, invertida = false }: { nota: string | null | undefined; invertida?: boolean }) {
  if (!nota) return null;
  return (
    <p
      className={`max-w-[16rem] break-words rounded-2xl px-3 py-1.5 text-center text-[13px] leading-snug ${
        invertida ? "bg-black/25 text-current" : "border border-line-2 bg-mist-2 text-ink"
      }`}
    >
      <span className="sr-only">Nota: </span>
      {nota}
    </p>
  );
}

/**
 * A foto redonda do apostador (ou a inicial, sem foto). `invertida`: sobre a
 * faixa escura do perfil público (`.faixa-escura`), a inicial herda a cor da
 * faixa sobre um círculo um pouco mais escuro — lê nos dois temas.
 */
export function FotoDoApostador({
  nome,
  foto,
  tamanho = 36,
  invertida = false,
}: {
  nome: string;
  foto: string | null;
  tamanho?: number;
  invertida?: boolean;
}) {
  return foto ? (
    <img
      src={foto}
      alt=""
      width={tamanho}
      height={tamanho}
      className="shrink-0 rounded-full border border-line object-cover"
      style={{ width: tamanho, height: tamanho }}
    />
  ) : (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-extrabold ${
        invertida ? "bg-black/25 text-current" : "bg-mist-2 text-ink"
      }`}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42 }}
    >
      {nome.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Escolher o apelido (e a foto) — pede antes do primeiro comentário e fica em
 * "Minha conta". O aviso diz o que o perfil mostra: apelido, foto e o
 * primeiro e último nome reais.
 */
export function EditarPerfilPublico({ compacto, aoSalvar }: { compacto?: boolean; aoSalvar?: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<MeuPerfil>({ queryKey: ["/api/public/conta/perfil"] });
  const [apelido, setApelido] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const valor = apelido ?? data?.apelido ?? "";
  const bioAtual = bio ?? data?.bio ?? "";
  const linkAtual = link ?? data?.link ?? "";

  const salvar = useMutation({
    mutationFn: (corpo: { apelido?: string; foto?: string | null; bio?: string | null; link?: string | null }) =>
      apiRequest("PUT", "/api/public/conta/perfil", corpo),
    onSuccess: () => {
      setErro(null);
      setOk("Perfil salvo.");
      setApelido(null);
      setBio(null);
      setLink(null);
      qc.invalidateQueries({ queryKey: ["/api/public/conta/perfil"] });
      // A foto é a que se compara com o documento: trocar mexe na verificação.
      qc.invalidateQueries({ queryKey: ["/api/public/conta/verificacao"] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/comentarios") });
      aoSalvar?.();
    },
    onError: (e: Error) => {
      setOk(null);
      setErro(e.message);
    },
  });

  if (!data) return null;
  return (
    <div className={compacto ? "space-y-2" : "space-y-3 p-4"}>
      <div className="flex items-center gap-3">
        <FotoDoApostador nome={valor || data.nomeReal} foto={data.foto} tamanho={compacto ? 40 : 64} />
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-1 font-semibold">
            {data.apelido ? `@${data.apelido}` : "Sem apelido ainda"}
            {data.verificado ? <SeloVerificado sujeito="apostador" /> : null}
          </p>
          <p className="text-muted">{data.nomeReal}</p>
        </div>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = validarApelido(valor);
          if (!v.ok) return setErro(v.erro);
          salvar.mutate({ apelido: v.apelido });
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="apelido" className="label-xs">
            Apelido (como o nome de usuário do Instagram)
          </label>
          <div className="mt-1 flex items-center rounded-md border border-line-2 bg-white px-2">
            <span className="text-muted">@</span>
            <input
              id="apelido"
              value={valor}
              maxLength={APELIDO_MAX}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => {
                setErro(null);
                setApelido(e.target.value.toLowerCase());
              }}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            />
          </div>
        </div>
        <Button type="submit" disabled={salvar.isPending || !valor.trim()}>
          Salvar apelido
        </Button>
      </form>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const b = validarBio(bioAtual);
          if (!b.ok) return setErro(b.erro);
          const l = validarLinkDoApostador(linkAtual);
          if (!l.ok) return setErro(l.erro);
          salvar.mutate({ bio: b.bio, link: l.link });
        }}
      >
        <div>
          <label htmlFor="bio-do-perfil" className="label-xs">
            Bio (até {BIO_MAX} caracteres, sem link nem telefone)
          </label>
          <textarea
            id="bio-do-perfil"
            value={bioAtual}
            maxLength={BIO_MAX}
            rows={2}
            onChange={(e) => {
              setErro(null);
              setBio(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-line-2 bg-white px-2 py-2 text-sm outline-none"
          />
        </div>
        <div>
          <label htmlFor="link-do-perfil" className="label-xs">
            Link (um só, https)
          </label>
          <input
            id="link-do-perfil"
            type="url"
            inputMode="url"
            value={linkAtual}
            placeholder="https://seusite.com.br"
            onChange={(e) => {
              setErro(null);
              setLink(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-line-2 bg-white px-2 py-2 text-sm outline-none"
          />
        </div>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar bio e link
        </Button>
      </form>
      {compacto ? null : <NotaDoApostador />}
      {data.apelido ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (data.verificado && !window.confirm("Trocar a foto tira o selo de verificado até a nova ser conferida. Trocar?")) {
                e.target.value = "";
                return;
              }
              try {
                salvar.mutate({ foto: await lerFoto(f, 1080) });
              } catch (err) {
                setErro((err as Error).message);
              }
              e.target.value = "";
            }}
          />
          <Button variant="ghost" className="text-sm" onClick={() => arquivo.current?.click()}>
            {data.foto ? "Trocar foto" : "Pôr foto"}
          </Button>
          {data.foto ? (
            <Button
              variant="ghost"
              className="text-sm"
              onClick={() =>
                (!data.verificado || window.confirm("Sem foto, o perfil perde o selo de verificado. Tirar a foto?")) &&
                salvar.mutate({ foto: null })
              }
            >
              Tirar foto
            </Button>
          ) : null}
          <Link href={`/u/${data.apelido}`} className="inline-flex min-h-6 items-center text-marca underline">
            Ver meu perfil
          </Link>
        </div>
      ) : null}
      <p className="text-[11px] text-muted">
        Seu perfil público mostra o apelido, a foto e o seu primeiro e último nome ({data.nomeReal}). Telefone, CPF e
        e-mail nunca aparecem.
      </p>
      {erro ? <p className="text-xs text-red">{erro}</p> : null}
      {ok && !compacto ? <p className="text-xs text-green-deep">{ok}</p> : null}
    </div>
  );
}

/**
 * Escrever ou apagar a nota de 24 horas (até 60 letras). O texto é conferido
 * no servidor (link, telefone e pedido de Pix por fora); aqui só o contador e
 * o prazo, para a pessoa saber até quando a nota aparece.
 */
export function NotaDoApostador() {
  const qc = useQueryClient();
  const { data } = useQuery<MeuPerfil>({ queryKey: ["/api/public/conta/perfil"] });
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const atual = data?.nota ?? "";
  const valor = texto ?? atual;

  const salvar = useMutation({
    mutationFn: (nota: string | null) => apiRequest("PUT", "/api/public/conta/nota", { nota }),
    onSuccess: (_r, nota) => {
      setTexto(null);
      setErro(null);
      setOk(nota ? "Nota salva." : "Nota apagada.");
      qc.invalidateQueries({ queryKey: ["/api/public/conta/perfil"] });
      if (data?.apelido) qc.invalidateQueries({ queryKey: [`/api/public/u/${data.apelido}`] });
    },
    onError: (e: Error) => {
      setOk(null);
      setErro(e.message);
    },
  });

  if (!data) return null;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate(valor.trim() || null);
      }}
    >
      <div>
        <label htmlFor="nota-do-perfil" className="label-xs">
          Nota de 24 horas (até {NOTA_MAX} letras, sem link nem telefone)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="nota-do-perfil"
            value={valor}
            maxLength={NOTA_MAX}
            onChange={(e) => {
              setErro(null);
              setOk(null);
              setTexto(e.target.value);
            }}
            className="min-w-0 flex-1 rounded-md border border-line-2 bg-white px-2 py-2 text-sm outline-none"
          />
          <span className="tnum shrink-0 text-xs text-muted">
            {valor.length}/{NOTA_MAX}
          </span>
        </div>
      </div>
      {atual && data.notaAte ? (
        <p className="text-xs text-muted">
          Quem você segue vê a nota até{" "}
          <span className="tnum">
            {new Date(data.notaAte).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
          .
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending || valor.trim() === atual.trim()}>
          Salvar nota
        </Button>
        {atual ? (
          <Button type="button" variant="ghost" className="text-sm" disabled={salvar.isPending} onClick={() => salvar.mutate(null)}>
            Apagar nota
          </Button>
        ) : null}
      </div>
      {erro ? <p role="alert" className="text-xs text-red">{erro}</p> : null}
      {ok ? <p className="text-xs text-green-deep">{ok}</p> : null}
    </form>
  );
}

export function PerfilPublicoCard() {
  return (
    <Card title="Meu perfil público">
      <EditarPerfilPublico />
    </Card>
  );
}

/**
 * O chip de link do perfil, como o do Instagram: com o endereço, leva a ele
 * (em outra aba, com o rótulo dizendo); sem, é "+ Adicionar" e leva a Minha conta.
 */
export function ChipDeLink({ link, claro = false }: { link: string | null; claro?: boolean }) {
  const classe = `inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold ${
    claro ? "border-current" : "border-line-2 text-ink"
  }`;
  if (!link) {
    return (
      <Link href="/minhas-compras?aba=conta" className={classe}>
        <span aria-hidden>+</span> Adicionar link
      </Link>
    );
  }
  const host = new URL(link).hostname.replace(/^www\./, "");
  return (
    <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className={`${classe} min-w-0`}>
      <span className="truncate">{host}</span>
      <span className="sr-only">(abre em outra aba)</span>
    </a>
  );
}
