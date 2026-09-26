import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { UFS, ufValida } from "@shared/endereco";
import { lerRegiao, gravarRegiao, regiaoEfetiva, type EscolhaDeRegiao } from "@/lib/regiao";
import { useSession } from "@/lib/session";
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
  const { data: sessao } = useSession();
  const naConta = Boolean(sessao?.buyer?.conta);
  // Com conta, a região vem do CEP do cadastro — sem ninguém precisar
  // escolher. O seletor de estado muda só neste aparelho.
  const { data: conta } = useQuery<{ uf: string | null; cidade: string | null }>({
    queryKey: ["/api/public/conta"],
    enabled: naConta,
  });
  const [escolha, setEscolha] = useState<EscolhaDeRegiao>(() => lerRegiao());
  const regiao = regiaoEfetiva(escolha, conta);
  const { data, isLoading } = useQuery<CampaignCard[]>({
    queryKey: ["/api/public/campaigns", regiao ? { uf: regiao.uf, cidade: regiao.cidade ?? undefined } : undefined],
  });
  const escolher = (r: EscolhaDeRegiao) => {
    gravarRegiao(r);
    setEscolha(r);
  };

  return (
    <PublicShell>
      <div className="flex items-center gap-2 pb-1">
        <MapPin size={16} aria-hidden className="shrink-0 text-muted" />
        <label htmlFor="vitrine-uf" className="text-sm text-ink-2">
          Rifas perto de
        </label>
        <select
          id="vitrine-uf"
          value={escolha === "todos" ? "" : (regiao?.uf ?? "")}
          onChange={(e) => {
            const uf = e.target.value;
            if (!uf) return escolher("todos");
            // Voltar ao estado da conta devolve também a cidade dela.
            if (conta?.uf === uf) return escolher(null);
            if (ufValida(uf)) escolher({ uf, cidade: null });
          }}
          className="min-w-0 flex-1 rounded-md border border-line-2 bg-white px-2 py-1.5 text-sm font-semibold sm:flex-none"
        >
          <option value="">Todo o Brasil</option>
          {Object.entries(UFS).map(([sigla, nome]) => (
            <option key={sigla} value={sigla}>
              {nome}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? <p className="py-2 text-sm text-muted">Carregando rifas…</p> : null}
      <PerfisSeguidos />

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
                className="relative flex aspect-[16/9] items-end overflow-hidden p-4"
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
                <span className="relative font-display text-xl font-extrabold leading-tight text-branco">
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
          <li key={o.slug} className="w-20 shrink-0 text-center">
            <Link href={`/o/${o.slug}`} className="block">
              <span className="mx-auto block w-fit rounded-full border-2 border-line-2 p-[2px]">
                <FotoDoPerfil nome={o.nome} foto={o.foto} tamanho={66} />
              </span>
              <span className="mt-1 block truncate text-xs text-ink-2">{o.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
