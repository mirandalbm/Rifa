import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BotaoMensagem } from "@/components/BotaoMensagem";
import { VideoDaDivulgacao, type VideoDaPeca } from "@/components/VideoProprio";

export interface Divulgacao {
  id: string;
  autor: "afiliado" | "apostador";
  quem: string;
  apelido: string | null;
  /** Código público do afiliado (já está no link dele); apostador não tem. */
  codigo: string | null;
  legenda: string;
  criadaEm: string;
  /** Quem publicou corrigiu depois (a organização autorizou a versão nova). */
  editada: boolean;
  /** Fotos de quem publicou (apostador ou afiliado), autorizadas pela organização. */
  fotos: string[];
  /** O vídeo do afiliado (no lugar das fotos), autorizado pela organização. */
  video: VideoDaPeca | null;
  link: string;
  /** A rifa de que a peça fala (o feed da vitrine leva a ela). */
  rifa?: { slug: string; titulo: string; premio: string; organizacao: string; organizacaoSlug: string };
  midias: { role: string; url: string; poster: string | null; srcSet: string | null; alt: string | null }[];
}

/**
 * O corpo de uma peça de terceiro: quem publicou, as imagens da rifa que o
 * afiliado escolheu, as fotos ou o vídeo de quem publicou, a legenda e, do
 * afiliado, o link dele e o "Mensagem". O mesmo na página da rifa e no feed.
 */
export function PecaDeDivulgacao({ d, comLinkDaCompra = true }: { d: Divulgacao; comLinkDaCompra?: boolean }) {
  const imagens = d.midias.map((m) => (m.role === "video" ? m.poster : m.url)).filter((u): u is string => Boolean(u));
  const fotos = d.fotos ?? [];
  return (
    <>
      <p className="text-xs text-muted">
        {d.autor === "afiliado" ? "Influenciador" : "Apostador"} ·{" "}
        {d.apelido ? (
          <Link href={`/u/${d.apelido}`} className="font-semibold text-ink underline">
            {d.quem}
          </Link>
        ) : (
          <span className="font-semibold text-ink">{d.quem}</span>
        )}
        {d.editada ? " · Editada" : ""}
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
      {fotos.length ? (
        <ul className="mt-2 flex gap-2 overflow-x-auto">
          {fotos.map((u, i) => (
            <li key={u} className="shrink-0">
              <img src={u} alt={`Foto ${i + 1} de ${d.quem}`} loading="lazy" className="h-24 w-24 rounded-lg object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      {d.video ? (
        <div className="mt-2">
          <VideoDaDivulgacao video={d.video} rotulo={`Vídeo de ${d.quem}`} />
        </div>
      ) : null}
      {d.legenda ? <p className="mt-2 whitespace-pre-line break-words">{d.legenda}</p> : null}
      {d.autor === "afiliado" ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {comLinkDaCompra ? (
            <a href={d.link} className="inline-block text-xs font-semibold text-green-deep underline">
              Comprar pelo link de {d.quem}
            </a>
          ) : null}
          {/* A entrada para conversar com o afiliado: ele não tem perfil, mas tem o código. */}
          {d.codigo ? <BotaoMensagem para={d.codigo} compacto /> : null}
        </div>
      ) : null}
    </>
  );
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
        {data.map((d) => (
          <li key={d.id} className="rounded-xl border border-line p-3 text-sm">
            <PecaDeDivulgacao d={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A divulgação no feed da vitrine, entre as rifas: marcada "Divulgação" em
 * texto (é peça de terceiro, não da organização), o corpo da peça e, embaixo,
 * a rifa de que ela fala, que leva à página da rifa — pelo link do afiliado,
 * quando é dele (a compra paga a comissão dele).
 */
export function CartaoDeDivulgacao({ d }: { d: Divulgacao }) {
  const rifa = d.rifa;
  return (
    <article aria-label={`Divulgação de ${d.quem}${rifa ? ` sobre ${rifa.titulo}` : ""}`} className="rounded-xl border border-line px-4 py-3 text-sm md:mx-0">
      <p className="mb-1">
        <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-ink-2">Divulgação</span>
      </p>
      <PecaDeDivulgacao d={d} comLinkDaCompra={false} />
      {rifa ? (
        <a href={d.link} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-mist">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{rifa.premio}</span>
            <span className="block truncate text-xs text-muted">{rifa.organizacao}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-green-deep">Ver a rifa →</span>
        </a>
      ) : null}
    </article>
  );
}
