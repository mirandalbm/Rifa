import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerImagem } from "@/lib/anexo";
import { APELIDO_MAX, validarApelido } from "@shared/perfilApostador";
import { SeloVerificado } from "@/components/SeloVerificado";

interface MeuPerfil {
  apelido: string | null;
  foto: string | null;
  nomeReal: string;
  verificado?: boolean;
}

/** A foto redonda do apostador (ou a inicial, sem foto). */
export function FotoDoApostador({ nome, foto, tamanho = 36 }: { nome: string; foto: string | null; tamanho?: number }) {
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
      className="flex shrink-0 items-center justify-center rounded-full bg-mist-2 font-display font-extrabold text-ink"
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
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const valor = apelido ?? data?.apelido ?? "";

  const salvar = useMutation({
    mutationFn: (corpo: { apelido?: string; foto?: string | null }) =>
      apiRequest("PUT", "/api/public/conta/perfil", corpo),
    onSuccess: () => {
      setErro(null);
      setOk("Perfil salvo.");
      setApelido(null);
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
                salvar.mutate({ foto: await lerImagem(f) });
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
          <Link href={`/u/${data.apelido}`} className="text-marca underline">
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

export function PerfilPublicoCard() {
  return (
    <Card title="Meu perfil público">
      <EditarPerfilPublico />
    </Card>
  );
}
