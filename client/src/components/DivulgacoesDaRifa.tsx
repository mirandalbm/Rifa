import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface Divulgacao {
  id: string;
  autor: "afiliado" | "apostador";
  quem: string;
  apelido: string | null;
  legenda: string;
  criadaEm: string;
  link: string;
  midias: { role: string; url: string; poster: string | null; srcSet: string | null; alt: string | null }[];
}

/**
 * O que influenciadores (afiliados com vínculo aprovado) e apostadores
 * publicaram sobre esta rifa, já autorizado pela organização. É divulgação
 * de terceiro: o texto diz isso, e a compra pelo link do afiliado paga a
 * comissão dele — nada aqui muda a rifa. Sem nenhuma, a seção não existe.
 */
export function DivulgacoesDaRifa({ slug }: { slug: string }) {
  const { data } = useQuery<Divulgacao[]>({ queryKey: [`/api/public/campaigns/${slug}/divulgacoes`], staleTime: 30_000 });
  if (!data || data.length === 0) return null;
  return (
    <section aria-label="Divulgações desta rifa" className="mt-3 px-4 lg:px-0">
      <h2 className="font-display text-sm font-bold">Divulgações</h2>
      <p className="text-xs text-muted">Publicadas por influenciadores e apostadores, com a autorização da organização.</p>
      <ul className="mt-2 space-y-3">
        {data.map((d) => {
          const imagens = d.midias.map((m) => (m.role === "video" ? m.poster : m.url)).filter((u): u is string => Boolean(u));
          return (
            <li key={d.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="text-xs text-muted">
                {d.autor === "afiliado" ? "Influenciador" : "Apostador"} ·{" "}
                {d.apelido ? (
                  <Link href={`/u/${d.apelido}`} className="font-semibold text-ink underline">
                    {d.quem}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink">{d.quem}</span>
                )}
              </p>
              {imagens.length ? (
                <ul className="mt-2 flex gap-2 overflow-x-auto">
                  {imagens.map((u, i) => (
                    <li key={`${u}-${i}`} className="shrink-0">
                      <img src={u} alt={d.midias[i]?.alt ?? "Imagem da rifa"} loading="lazy" className="h-24 w-24 rounded-lg object-cover" />
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.legenda ? <p className="mt-2 whitespace-pre-line break-words">{d.legenda}</p> : null}
              {d.autor === "afiliado" ? (
                <a href={d.link} className="mt-2 inline-block text-xs font-semibold text-green-deep underline">
                  Comprar pelo link de {d.quem}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
