import { Link } from "wouter";
import { Lock, ShieldCheck, Trophy } from "lucide-react";
import { CabecalhoDaPublicacao, Carrossel, type Peca } from "@/components/Publicacao";
import { Money, Pill } from "@/components/bits";
import { corDaCasa, letraDoQuadro } from "@/lib/quadro";
import { dataEHora, numerosDoCartao, rotuloDosNumeros, situacaoDaRifa } from "@shared/bilhetes";
import { formatQuota, quotaDigits } from "@shared/format";

export interface BilheteDaConta {
  id: string;
  codigo: number;
  pagoEm: string;
  quantidade: number;
  totalCents: number;
  /** Os primeiros números (o teto do cartão); `quantidade` diz quantos são ao todo. */
  numeros: number[];
  /** Cota premiada que este pedido já reclamou — o número em jogo nunca vem. */
  premiadas: { number: number; label: string }[];
  rifa: { slug: string; titulo: string; premio: string; totalCotas: number; numeracaoZero: boolean; status: string; drawAt: string | null };
  midias: Peca[];
  organizacao: { nome: string; slug: string; foto: string | null } | null;
}

/**
 * Um bilhete como publicação **privada**: o mesmo carrossel e o mesmo topo
 * do feed (`Carrossel`, `CabecalhoDaPublicacao`), mas sem as ações sociais —
 * não há o que curtir, comentar nem compartilhar num bilhete. Só a própria
 * pessoa chega aqui (`/perfil/bilhetes`); nada disto aparece em `/u/<apelido>`.
 */
export function BilheteComoPublicacao({ bilhete: b }: { bilhete: BilheteDaConta }) {
  const href = b.organizacao ? `/o/${b.organizacao.slug}/r/${b.rifa.slug}` : `/r/${b.rifa.slug}`;
  const { visiveis, restantes } = numerosDoCartao(b.numeros, b.rifa.totalCotas, b.rifa.numeracaoZero);
  // `quantidade` é o total gravado na compra: o cartão mostra o teto e diz quantos faltam.
  const faltam = Math.max(restantes, b.quantidade - visiveis.length);
  const digitos = quotaDigits(b.rifa.totalCotas, b.rifa.numeracaoZero);
  const premiadas = new Set(b.premiadas.map((p) => p.number));

  return (
    <article
      className="-mx-4 overflow-hidden bg-white sm:mx-0 sm:rounded-2xl sm:border sm:border-line"
      aria-label={`Bilhete de ${b.rifa.premio}`}
    >
      <Carrossel
        pecas={b.midias}
        titulo={b.rifa.premio}
        href={href}
        perfilSobreNaWeb
        perfil={
          b.organizacao
            ? (sobreImagem) => (
                <CabecalhoDaPublicacao
                  slug={b.organizacao!.slug}
                  nome={b.organizacao!.nome}
                  foto={b.organizacao!.foto}
                  // Sem "Seguir": aqui é o bilhete, não a vitrine.
                  seguindo
                  sobreImagem={sobreImagem}
                  subtitulo="Seu bilhete"
                />
              )
            : undefined
        }
      />

      <div className="mx-3 mt-3 rounded-xl border border-line p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display text-base font-extrabold leading-tight">{b.rifa.premio}</h3>
          <Pill status="paid">Pago</Pill>
        </div>
        <p className="mt-1 text-xs text-ink-2">{b.rifa.titulo}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-2">
          <dt className="font-semibold">Comprado em</dt>
          <dd className="tnum">{dataEHora(b.pagoEm)}</dd>
          <dt className="font-semibold">Pedido</dt>
          <dd className="tnum">{b.codigo}</dd>
          <dt className="font-semibold">Cotas</dt>
          <dd>
            <span className="tnum">{b.quantidade}</span> · <Money cents={b.totalCents} className="font-semibold text-green-deep" />
          </dd>
          <dt className="font-semibold">Sorteio</dt>
          <dd className="tnum">{situacaoDaRifa(b.rifa)}</dd>
        </dl>

        <p className="mt-3 text-xs font-semibold text-ink-2">Seus números</p>
        {/* O mesmo quadriculado do mapa e das cartelas. */}
        <ul className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-6" aria-label={rotuloDosNumeros(visiveis, faltam)}>
          {b.numeros.slice(0, visiveis.length).map((n) => (
            <li key={n} className={`tnum quadro ${letraDoQuadro(digitos)} ${corDaCasa(n)}`}>
              {formatQuota(n, b.rifa.totalCotas, b.rifa.numeracaoZero)}
              {premiadas.has(n) ? <span className="sr-only"> (cota premiada)</span> : null}
            </li>
          ))}
        </ul>
        {faltam > 0 ? (
          <p className="mt-1.5 text-xs text-muted">
            e mais <span className="tnum">{faltam}</span> {faltam === 1 ? "número" : "números"} —{" "}
            <Link href={`/bilhete/${b.codigo}`} className="font-semibold underline">
              ver o bilhete inteiro
            </Link>
          </p>
        ) : null}

        {b.premiadas.length ? (
          <ul className="mt-3 space-y-1">
            {b.premiadas.map((p) => (
              <li key={p.number} className="flex items-center gap-1.5 text-xs font-semibold text-green-deep">
                <Trophy size={14} aria-hidden className="shrink-0" />
                <span>
                  Cota premiada <span className="tnum">{formatQuota(p.number, b.rifa.totalCotas, b.rifa.numeracaoZero)}</span>: {p.label}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-ink-2">
          <ShieldCheck size={13} aria-hidden className="text-marca" />
          Só vale bilhete pago pela plataforma
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-4 pt-2 text-xs">
        <span className="flex items-center gap-1 text-muted">
          <Lock size={12} aria-hidden /> Só você vê este bilhete
        </span>
        <span className="flex gap-4 font-semibold">
          <Link href={`/bilhete/${b.codigo}`} className="inline-flex min-h-6 items-center underline">
            Abrir bilhete
          </Link>
          <Link href={`/pedido/${b.codigo}`} className="inline-flex min-h-6 items-center underline">
            Ver pedido
          </Link>
        </span>
      </div>
    </article>
  );
}
