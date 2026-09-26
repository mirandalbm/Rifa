import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { UFS, maskCep, soDigitosCep, cepValido, cidadeUf, ufValida } from "@shared/endereco";
import { lerRegiao, gravarRegiao, type MinhaRegiao } from "@/lib/regiao";
import { FotoDoPerfil } from "@/components/Seguir";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Empty } from "@/components/bits";
import { groupNumber, percent } from "@shared/format";
import { InstalarApp } from "@/components/InstalarApp";

interface CampaignCard {
  id: string;
  slug: string;
  title: string;
  prizeTitle: string;
  priceCents: number;
  totalQuotas: number;
  drawAt: string | null;
  featured: boolean;
  soldCount: number;
  banner: string | null;
  organizacao: { nome: string; slug: string; local: string | null; uf: string | null } | null;
  /** 0 = na cidade de quem olha, 1 = no estado, 2 = o resto; nulo sem região. */
  perto: 0 | 1 | 2 | null;
}

const PERTO = ["na sua cidade", "no seu estado"] as const;

/** Vitrine multi-rifas: todas as campanhas no ar, banner na frente. */
export default function Vitrine() {
  const [regiao, setRegiao] = useState<MinhaRegiao | null>(() => lerRegiao());
  const { data, isLoading } = useQuery<CampaignCard[]>({
    queryKey: ["/api/public/campaigns", regiao ? { uf: regiao.uf, cidade: regiao.cidade ?? undefined } : undefined],
  });
  const escolher = (r: MinhaRegiao | null) => {
    gravarRegiao(r);
    setRegiao(r);
  };

  return (
    <PublicShell>
      <div className="pb-2">
        <h1 className="font-display text-2xl font-extrabold">
          {isLoading ? "Carregando rifas…" : `${data?.length ?? 0} rifa(s) no ar`}
        </h1>
        <p className="mt-1 text-sm text-muted">Escolha uma e garanta seus números.</p>
      </div>
      <PerfisSeguidos />
      <RegiaoBar regiao={regiao} escolher={escolher} />

      {!isLoading && (data?.length ?? 0) === 0 ? (
        <Empty>Nenhuma rifa publicada ainda.</Empty>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data?.map((c) => {
          const pct = percent(c.soldCount, c.totalQuotas);
          const finalStretch = pct >= 85;
          return (
            <Link
              key={c.id}
              href={c.organizacao ? `/o/${c.organizacao.slug}/r/${c.slug}` : `/r/${c.slug}`}
              className="overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-card"
            >
              <div
                className="relative flex h-28 items-end overflow-hidden p-3"
                style={{
                  background: c.banner
                    ? `center/cover url(${c.banner})`
                    : "linear-gradient(145deg,#0B1F14,#0d3a22 60%,#00873E)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(11,31,20,.85) 0%, rgba(11,31,20,.4) 55%, rgba(11,31,20,.05) 100%)",
                  }}
                />
                <span
                  className={`absolute right-2 top-2 z-10 rounded px-2 py-[2px] font-mono text-[10px] ${
                    finalStretch ? "bg-yellow text-on-yellow" : "bg-white text-green-deep"
                  }`}
                >
                  {finalStretch ? "reta final" : `${pct}% vendida`}
                </span>
                <span className="relative font-display text-base font-extrabold leading-tight text-branco">
                  {c.prizeTitle}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-baseline justify-between text-xs text-muted">
                  <span>
                    cota <Money cents={c.priceCents} className="text-sm text-green-deep" />
                  </span>
                  <span className="tnum">
                    {c.drawAt
                      ? `sorteio ${new Date(c.drawAt).toLocaleDateString("pt-BR")}`
                      : "sorteio a definir"}
                  </span>
                </div>
                <Progress
                  value={c.soldCount}
                  total={c.totalQuotas}
                  tone={finalStretch ? "yellow" : "green"}
                />
                <p className="label-xs">
                  {groupNumber(c.soldCount)} de {groupNumber(c.totalQuotas)} cotas
                </p>
                {c.organizacao ? (
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted">
                    <MapPin size={11} aria-hidden className="shrink-0" />
                    <span className="truncate">
                      {c.organizacao.nome}
                      {c.organizacao.local ? ` · ${c.organizacao.local}` : ""}
                    </span>
                    {c.perto === 0 || c.perto === 1 ? (
                      <span className="ml-auto shrink-0 rounded-full bg-mist-2 px-2 py-[1px] font-mono text-[10px] text-ink">
                        {PERTO[c.perto]}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
      <InstalarApp />
    </PublicShell>
  );
}

/**
 * "Perto de você": o CEP diz cidade e estado; sem CEP, basta o estado. Só
 * muda a ordem — toda rifa continua na lista.
 */
function RegiaoBar({
  regiao,
  escolher,
}: {
  regiao: MinhaRegiao | null;
  escolher: (r: MinhaRegiao | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [cep, setCep] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function porCep(valor: string) {
    const d = soDigitosCep(valor);
    if (d.length !== 8 || !cepValido(d)) return;
    setBuscando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/public/cep/${d}`);
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok || !ufValida(corpo.uf)) {
        setMsg(corpo.message ?? "Não achamos este CEP. Escolha o estado.");
        return;
      }
      escolher({ uf: corpo.uf, cidade: corpo.cidade ?? null });
      setEditando(false);
      setCep("");
    } catch {
      setMsg("Sem conexão para consultar o CEP. Escolha o estado.");
    } finally {
      setBuscando(false);
    }
  }

  if (regiao && !editando) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <MapPin size={13} aria-hidden />
        Primeiro as rifas perto de{" "}
        <strong className="text-ink">{cidadeUf(regiao.cidade, regiao.uf)}</strong>
        <button type="button" onClick={() => setEditando(true)} className="text-green-deep underline">
          trocar
        </button>
        <button type="button" onClick={() => escolher(null)} className="underline">
          ver na ordem de sempre
        </button>
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-mist p-3">
      <p className="flex items-center gap-1 text-xs font-medium">
        <MapPin size={13} aria-hidden /> Ver primeiro as rifas perto de você
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="vitrine-cep" className="label-xs block">
            Seu CEP
          </label>
          <input
            id="vitrine-cep"
            inputMode="numeric"
            autoComplete="postal-code"
            value={cep}
            onChange={(e) => {
              const v = maskCep(e.target.value);
              setCep(v);
              void porCep(v);
            }}
            placeholder="00000-000"
            className="tnum mt-1 w-32 rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
          />
        </div>
        <span className="pb-2 text-xs text-muted">ou</span>
        <div>
          <label htmlFor="vitrine-uf" className="label-xs block">
            Estado
          </label>
          <select
            id="vitrine-uf"
            value={regiao?.uf ?? ""}
            onChange={(e) => {
              if (!ufValida(e.target.value)) return;
              escolher({ uf: e.target.value, cidade: null });
              setEditando(false);
            }}
            className="mt-1 rounded-md border border-line-2 bg-white px-2 py-2 text-sm"
          >
            <option value="">escolha</option>
            {Object.entries(UFS).map(([sigla, nome]) => (
              <option key={sigla} value={sigla}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        {editando ? (
          <button type="button" onClick={() => setEditando(false)} className="pb-2 text-xs underline">
            cancelar
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {buscando
          ? "Consultando CEP…"
          : msg ?? "Todas as rifas continuam aparecendo; só muda a ordem. Fica guardado neste aparelho."}
      </p>
    </div>
  );
}

/**
 * Os perfis que a pessoa segue, em bolinhas, no topo — como os stories do
 * Instagram. Sem sessão ou sem ninguém seguido, não ocupa espaço.
 */
function PerfisSeguidos() {
  const { data } = useQuery<{ slug: string; nome: string; foto: string | null }[]>({
    queryKey: ["/api/public/seguindo"],
  });
  if (!data?.length) return null;
  return (
    <nav aria-label="Perfis que você segue" className="-mx-4 mt-3 overflow-x-auto px-4">
      <ul className="flex gap-3">
        {data.map((o) => (
          <li key={o.slug} className="w-16 shrink-0 text-center">
            <Link href={`/o/${o.slug}`} className="block">
              <span className="mx-auto block w-fit rounded-full border-2 border-line-2 p-[2px]">
                <FotoDoPerfil nome={o.nome} foto={o.foto} tamanho={52} />
              </span>
              <span className="mt-1 block truncate text-[11px] text-ink-2">{o.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
