import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Gift, Heart, MessageCircle, X } from "lucide-react";
import { Button, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { EditarPerfilPublico, FotoDoApostador } from "@/components/PerfilDoApostador";
import { COMENTARIO_MAX, EMOJI_SO_VERIFICADO, problemaNoComentario, temEmoji } from "@shared/comentarios";
import { SeloVerificado } from "@/components/SeloVerificado";
import { REACOES } from "@shared/perfilApostador";
import { textoDoPresente } from "@shared/presente";

interface Comentario {
  id: string;
  autor: "comprador" | "organizacao";
  nome: string;
  perfil: string | null;
  foto: string | null;
  verificado: boolean;
  texto: string;
  curtidas: number;
  curti: boolean;
  createdAt: string;
  meu: boolean;
  podeApagar: boolean;
  podePedirRemocao: boolean;
  remocaoEmAnalise: boolean;
}

interface Lista {
  organizacao: { nome: string; slug: string; verificada: boolean };
  podeComentar: boolean;
  comoOrganizacao: boolean;
  precisaApelido: boolean;
  podeCurtir: boolean;
  podeUsarEmoji: boolean;
  lista: (Comentario & { respostas: Comentario[] })[];
}

const tempo = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} d` : `${Math.floor(d / 7)} sem`;
};

/** Nome com link para o perfil (do apostador ou da organização). */
function Nome({ c }: { c: Comentario }) {
  const selo = c.verificado ? <SeloVerificado sujeito={c.autor === "organizacao" ? "organizacao" : "apostador"} tamanho={14} /> : null;
  return (
    <span className="inline-flex items-center gap-1">
      {c.perfil ? (
        <Link href={c.perfil} className="font-semibold hover:underline">
          {c.nome}
        </Link>
      ) : (
        <b className="font-semibold">{c.nome}</b>
      )}
      {selo}
    </span>
  );
}

function Linha({
  c,
  resposta,
  podeCurtir,
  aoResponder,
  aoMudar,
}: {
  c: Comentario;
  resposta?: boolean;
  podeCurtir: boolean;
  aoResponder?: () => void;
  aoMudar: () => void;
}) {
  const org = c.autor === "organizacao";
  const [curtido, setCurtido] = useState({ curti: c.curti, n: c.curtidas });
  useEffect(() => setCurtido({ curti: c.curti, n: c.curtidas }), [c.curti, c.curtidas]);
  const curtir = useMutation({
    mutationFn: async (valor: boolean) =>
      (await (await apiRequest("PUT", `/api/public/comentarios/${c.id}/curtida`, { curtir: valor })).json()) as {
        curtidas: number;
        curti: boolean;
      },
    onMutate: (valor) => setCurtido((v) => ({ curti: valor, n: v.n + (valor ? 1 : -1) })),
    onSuccess: (r) => setCurtido({ curti: r.curti, n: r.curtidas }),
    onError: () => setCurtido({ curti: c.curti, n: c.curtidas }),
  });
  const apagar = useMutation({
    mutationFn: (motivo?: string) => apiRequest("DELETE", `/api/public/comentarios/${c.id}`, motivo ? { motivo } : undefined),
    onSuccess: aoMudar,
    onError: (e: Error) => window.alert(e.message),
  });

  return (
    <div className={`flex gap-3 ${resposta ? "pl-12" : ""}`}>
      {c.perfil ? (
        <Link href={c.perfil} aria-hidden tabIndex={-1} className="shrink-0">
          <FotoDoApostador nome={c.nome} foto={c.foto} tamanho={resposta ? 28 : 36} />
        </Link>
      ) : (
        <FotoDoApostador nome={c.nome} foto={c.foto} tamanho={resposta ? 28 : 36} />
      )}
      <div className="min-w-0 flex-1 text-[14px] leading-[18px]">
        <p className="flex flex-wrap items-center gap-x-2">
          <Nome c={c} />
          <span className="text-[12px] text-muted">
            <span className="tnum">{tempo(c.createdAt)}</span>
            {/* Quem é dono da publicação, como o "Author" do Instagram. */}
            {org ? <span> • Autor</span> : null}
          </span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words">{c.texto}</p>
        <p className="mt-1.5 flex flex-wrap gap-4 text-[12px] font-semibold text-muted">
          {aoResponder ? (
            <button type="button" className="hover:text-ink" onClick={aoResponder}>
              Responder
            </button>
          ) : null}
          {c.podeApagar ? (
            <button
              type="button"
              className="hover:text-red"
              onClick={() => window.confirm("Apagar este comentário?") && apagar.mutate(undefined)}
            >
              Apagar
            </button>
          ) : null}
          {c.podePedirRemocao ? (
            <button
              type="button"
              className="hover:text-red"
              onClick={() => {
                const motivo = window.prompt(
                  "A remoção vai para análise da plataforma (comentário pode ser denúncia). Por que ele deve sair?",
                );
                if (motivo) apagar.mutate(motivo);
              }}
            >
              Pedir remoção
            </button>
          ) : null}
          {c.remocaoEmAnalise ? <Pill status="pending">remoção em análise</Pill> : null}
        </p>
      </div>
      <button
        type="button"
        disabled={!podeCurtir || curtir.isPending}
        onClick={() => curtir.mutate(!curtido.curti)}
        aria-pressed={curtido.curti}
        aria-label={`${curtido.curti ? "Descurtir" : "Curtir"} (${curtido.n} curtida${curtido.n === 1 ? "" : "s"})`}
        className="flex w-8 shrink-0 flex-col items-center pt-1 text-muted disabled:opacity-60"
      >
        <Heart size={16} aria-hidden className={curtido.curti ? "fill-current text-marca" : ""} />
        {curtido.n ? <span className="tnum text-[12px]">{curtido.n}</span> : null}
      </button>
    </div>
  );
}

/**
 * A barra de baixo, como no Instagram: reações rápidas em cima e o campo
 * "Participe da conversa…", com o presente ao lado.
 */
function Escrever({
  slug,
  respostaA,
  aoEnviar,
  rotulo,
  foco,
  podeUsarEmoji,
  comoOrganizacao,
}: {
  slug: string;
  respostaA: { id: string; nome: string } | null;
  aoEnviar: () => void;
  rotulo: string;
  foco: number;
  podeUsarEmoji: boolean;
  comoOrganizacao: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [presenteAberto, setPresenteAberto] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (foco) campo.current?.focus();
  }, [foco]);
  const enviar = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/public/campaigns/${slug}/comentarios`, { texto, respostaA: respostaA?.id }),
    onSuccess: () => {
      setTexto("");
      setErro(null);
      aoEnviar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  return (
    <div className="space-y-2 border-t border-line pt-2">
      <div
        className={`flex justify-between px-1 text-2xl ${podeUsarEmoji ? "" : "opacity-40 grayscale"}`}
        role="group"
        aria-label={podeUsarEmoji ? "Reações rápidas" : "Reações rápidas (só para perfil verificado)"}
      >
        {REACOES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={!podeUsarEmoji}
            className="rounded-md px-1 hover:bg-mist disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label={`Inserir ${r}`}
            onClick={() => {
              setTexto((t) => (t + r).slice(0, COMENTARIO_MAX));
              campo.current?.focus();
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {podeUsarEmoji ? null : (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
          <SeloVerificado sujeito={comoOrganizacao ? "organizacao" : "apostador"} tamanho={14} />
          <span>
            Emojis são para perfis verificados.{" "}
            <Link href={comoOrganizacao ? "/admin/configuracoes#verificacao" : "/minhas-cotas?aba=conta#verificacao"} className="font-semibold text-marca">
              Verificar meu perfil
            </Link>
          </span>
        </p>
      )}
      <form
        ref={formulario}
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = problemaNoComentario(texto) ?? (!podeUsarEmoji && temEmoji(texto) ? EMOJI_SO_VERIFICADO : null);
          if (p) return setErro(p);
          if (!enviar.isPending) enviar.mutate();
        }}
      >
        <label htmlFor={`comentar-${slug}`} className="sr-only">
          {rotulo}
        </label>
        {/* O campo sutil do Instagram: pílula fina, com o envio dentro dela. */}
        <div className="flex min-w-0 flex-1 items-end rounded-full border border-line-2 bg-white py-1 pl-4 pr-1 focus-within:border-ink-2">
          <textarea
            id={`comentar-${slug}`}
            ref={campo}
            rows={1}
            maxLength={COMENTARIO_MAX}
            value={texto}
            enterKeyHint="send"
            placeholder={respostaA ? `Responder @${respostaA.nome}…` : rotulo}
            onChange={(e) => {
              setErro(null);
              setTexto(e.target.value);
            }}
            onKeyDown={(e) => {
              // "Enviar" do teclado do celular (e Enter no computador) publica;
              // Shift+Enter quebra a linha.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (texto.trim()) formulario.current?.requestSubmit();
              }
            }}
            className="max-h-24 min-h-[30px] flex-1 resize-none bg-transparent py-[6px] text-[14px] leading-[18px] outline-none placeholder:text-muted"
          />
          {texto.trim() ? (
            <button
              type="submit"
              disabled={enviar.isPending}
              aria-label="Publicar comentário"
              className="ml-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-green text-on-green disabled:opacity-60"
            >
              <ArrowUp size={18} strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
        </div>
        {comoOrganizacao ? null : <BotaoDePresente aberto={presenteAberto} aoAlternar={() => setPresenteAberto((v) => !v)} />}
      </form>
      {erro ? <p className="text-xs text-red">{erro}</p> : null}
      {presenteAberto && !comoOrganizacao ? <Presentear slug={slug} /> : null}
    </div>
  );
}

/** O ícone de presente, à direita do campo de comentário — sempre à vista. */
function BotaoDePresente({ aberto, aoAlternar }: { aberto: boolean; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAlternar}
      aria-expanded={aberto}
      aria-label="Mandar um presente para um amigo"
      className={`mb-0.5 rounded-full p-1.5 hover:bg-mist ${aberto ? "text-marca" : "text-ink"}`}
    >
      <Gift size={26} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * Mandar o presente: o link desta rifa com o código de indicação de quem
 * manda. Quem recebe, com conta, ganha o desconto na primeira compra, pago
 * pela plataforma; quem manda ganha o bônus de indicação (se ligado).
 */
function Presentear({ slug }: { slug: string }) {
  const { data, error } = useQuery<{ ligado: boolean; codigo?: string; pct?: number; tetoCents?: number }>({
    queryKey: ["/api/public/presente/meu"],
    retry: false,
  });
  const [aviso, setAviso] = useState<string | null>(null);
  if (error) {
    return (
      <p className="rounded-md bg-mist px-3 py-2 text-xs text-ink-2">
        <Link href={`/entrar?volta=${encodeURIComponent(window.location.pathname)}`} className="font-semibold underline">
          Entre na sua conta
        </Link>{" "}
        para mandar um presente.
      </p>
    );
  }
  if (!data?.codigo) return <p className="text-xs text-muted">Carregando…</p>;
  // Com o presente ligado, leva o desconto; desligado, é convite para a rifa.
  const oferta = data.ligado ? textoDoPresente({ pct: data.pct!, tetoCents: data.tetoCents! }) : null;
  const link = `${window.location.origin}/r/${slug}?ind=${data.codigo}${oferta ? "&presente=1" : ""}`;
  const mensagem = oferta
    ? `Um presente para você: ${oferta}. Crie sua conta e escolha seus números:`
    : "Olha esta rifa — escolha seus números:";
  return (
    <div className="space-y-2 rounded-lg border border-line bg-mist px-3 py-3 text-sm" role="region" aria-label="Mandar um presente">
      <p className="flex items-start gap-2">
        <Gift size={18} aria-hidden className="mt-0.5 shrink-0 text-marca" />
        <span>
          {oferta ? (
            <>
              Mande um presente: quem receber ganha <b>{oferta}</b>. Vale uma vez por pessoa, com conta, na primeira compra.
            </>
          ) : (
            <>Convide um amigo para esta rifa pelo seu link.</>
          )}
        </span>
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1 py-2 text-sm"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: "Um presente para você", text: mensagem, url: link });
              else {
                await navigator.clipboard.writeText(`${mensagem} ${link}`);
                setAviso("Convite copiado. Cole na conversa com seu amigo.");
              }
            } catch {
              /* cancelou o menu do aparelho */
            }
          }}
        >
          {oferta ? "Mandar presente" : "Convidar"}
        </Button>
        <Button
          variant="ghost"
          className="py-2 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setAviso("Link copiado.");
          }}
        >
          Copiar link
        </Button>
      </div>
      {aviso ? (
        <p className="text-xs text-muted" role="status">
          {aviso}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Comentários na publicação da rifa, como no Instagram: foto, apelido e
 * data; curtir; respostas recolhidas em "Ver mais N respostas"; reações
 * rápidas. Apostador com conta comenta (com apelido); a organização dona
 * responde com o selo "organização" e **pede** a remoção — quem decide é a
 * plataforma, porque comentário pode ser denúncia.
 */
export function Comentarios({ slug, dentroDoPainel }: { slug: string; dentroDoPainel?: boolean }) {
  const qc = useQueryClient();
  const chave = [`/api/public/campaigns/${slug}/comentarios`];
  const { data } = useQuery<Lista>({ queryKey: chave });
  const [respondendo, setRespondendo] = useState<{ id: string; nome: string } | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState(0);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["/api/public/campaigns"] });
  };

  // Chegou pelo aviso ou pelo cartão do feed (#comentarios): rola até aqui
  // quando a lista carregar (na SPA o navegador não faz isso sozinho).
  const carregou = Boolean(data);
  useEffect(() => {
    if (!dentroDoPainel && carregou && window.location.hash === "#comentarios") {
      document.getElementById("comentarios")?.scrollIntoView({ block: "start" });
    }
  }, [carregou, dentroDoPainel]);

  const total = data?.lista.reduce((n, c) => n + 1 + c.respostas.length, 0) ?? 0;

  return (
    // Tamanho e fonte do Instagram: 14 px na fonte do sistema do aparelho, 12 px nos detalhes.
    <section id={dentroDoPainel ? undefined : "comentarios"} aria-label="Comentários" className="scroll-mt-20 font-instagram">
      {dentroDoPainel ? null : (
        <h2 className="mb-3 mt-6 flex items-center gap-2 font-display text-lg font-bold">
          <MessageCircle size={20} aria-hidden />
          Comentários <span className="tnum text-sm font-normal text-muted">({total})</span>
        </h2>
      )}


      <ul className="space-y-5">
        {data?.lista.map((c) => {
          const aberta = abertas.has(c.id);
          return (
            <li key={c.id} className="space-y-3">
              <Linha
                c={c}
                podeCurtir={Boolean(data.podeCurtir)}
                aoMudar={recarregar}
                aoResponder={
                  data.podeComentar && !data.precisaApelido
                    ? () => {
                        setRespondendo({ id: c.id, nome: c.nome });
                        setFoco((f) => f + 1);
                      }
                    : undefined
                }
              />
              {c.respostas.length ? (
                <button
                  type="button"
                  className="flex items-center gap-3 pl-12 text-xs font-semibold text-muted hover:text-ink"
                  onClick={() =>
                    setAbertas((s) => {
                      const n = new Set(s);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                  aria-expanded={aberta}
                >
                  <span aria-hidden className="h-px w-6 bg-line-2" />
                  {aberta
                    ? "Ocultar respostas"
                    : `Ver mais ${c.respostas.length} resposta${c.respostas.length === 1 ? "" : "s"}`}
                </button>
              ) : null}
              {aberta
                ? c.respostas.map((r) => (
                    <Linha key={r.id} c={r} resposta podeCurtir={Boolean(data.podeCurtir)} aoMudar={recarregar} />
                  ))
                : null}
            </li>
          );
        })}
      </ul>
      {data && data.lista.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Ainda sem comentários. Comece a conversa.</p>
      ) : null}

      <div className={`mt-4 ${dentroDoPainel ? "sticky bottom-0 bg-white pb-2" : ""}`}>
        {!data ? null : !data.podeComentar ? (
          <p className="rounded-xl border border-line bg-mist px-3 py-2 text-sm">
            <Link href="/entrar" className="font-semibold text-marca">
              Entre na sua conta
            </Link>{" "}
            para comentar e conversar com {data.organizacao.nome}.
          </p>
        ) : data.precisaApelido ? (
          // Conta antiga, de antes do apelido no cadastro: completa em Minha conta.
          <p className="rounded-xl border border-line bg-mist px-3 py-2 text-sm">
            Para comentar, complete seu cadastro com um apelido em{" "}
            <Link href="/minhas-cotas?aba=conta" className="font-semibold text-marca">
              Minha conta
            </Link>
            .
          </p>
        ) : (
          <>
            {respondendo ? (
              <p className="mb-1 flex items-center justify-between text-xs text-muted">
                Respondendo a @{respondendo.nome}
                <button type="button" aria-label="Cancelar resposta" onClick={() => setRespondendo(null)}>
                  <X size={14} aria-hidden />
                </button>
              </p>
            ) : null}
            <Escrever
              slug={slug}
              respostaA={respondendo}
              foco={foco}
              podeUsarEmoji={Boolean(data.podeUsarEmoji)}
              comoOrganizacao={data.comoOrganizacao}
              rotulo={data.comoOrganizacao ? `Comentar como ${data.organizacao.nome}…` : "Participe da conversa…"}
              aoEnviar={() => {
                if (respondendo) setAbertas((s) => new Set(s).add(respondendo.id));
                setRespondendo(null);
                recarregar();
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Os comentários em painel que sobe de baixo, por cima do feed — como no
 * Instagram. Fecha pelo X, pelo fundo ou pelo Esc.
 */
export function PainelDeComentarios({ slug, onFechar }: { slug: string; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comentários"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-line py-3 text-center">
          <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-line-2" />
          <h2 className="font-semibold">Comentários</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar comentários"
            className="absolute right-3 top-3 rounded-md p-1 hover:bg-mist"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pt-4">
          <Comentarios slug={slug} dentroDoPainel />
        </div>
      </div>
    </div>
  );
}
