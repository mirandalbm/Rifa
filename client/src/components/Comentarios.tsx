import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { COMENTARIO_MAX, problemaNoComentario } from "@shared/comentarios";

interface Comentario {
  id: string;
  autor: "comprador" | "organizacao";
  nome: string;
  texto: string;
  createdAt: string;
  meu: boolean;
  podeApagar: boolean;
}

interface Lista {
  organizacao: { nome: string; slug: string };
  podeComentar: boolean;
  comoOrganizacao: boolean;
  lista: (Comentario & { respostas: Comentario[] })[];
}

const tempo = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString("pt-BR");
};

function Inicial({ nome, organizacao }: { nome: string; organizacao: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold ${
        organizacao ? "bg-marca text-white" : "bg-mist-2 text-ink"
      }`}
    >
      {nome.charAt(0).toUpperCase()}
    </span>
  );
}

/** Caixa de escrever: a mesma régua do servidor (sem link, sem telefone). */
function Escrever({
  slug,
  respostaA,
  rotulo,
  aoEnviar,
}: {
  slug: string;
  respostaA?: string;
  rotulo: string;
  aoEnviar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/public/campaigns/${slug}/comentarios`, { texto, respostaA }),
    onSuccess: () => {
      setTexto("");
      setErro(null);
      aoEnviar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const id = `comentar-${respostaA ?? "novo"}`;
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        const p = problemaNoComentario(texto);
        if (p) return setErro(p);
        enviar.mutate();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={id}
          rows={1}
          maxLength={COMENTARIO_MAX}
          value={texto}
          placeholder={rotulo}
          onChange={(e) => {
            setErro(null);
            setTexto(e.target.value);
          }}
          className="min-h-[40px] flex-1 resize-y rounded-2xl border border-line-2 px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={enviar.isPending || !texto.trim()} className="px-3 py-2 text-sm">
          Publicar
        </Button>
      </div>
      {erro ? <p className="text-xs text-red">{erro}</p> : null}
    </form>
  );
}

function Linha({
  c,
  aoApagar,
  aoResponder,
  resposta,
}: {
  c: Comentario;
  aoApagar: (id: string) => void;
  aoResponder?: () => void;
  resposta?: boolean;
}) {
  const org = c.autor === "organizacao";
  return (
    <div className={`flex gap-2 ${resposta ? "pl-10" : ""}`}>
      <Inicial nome={c.nome} organizacao={org} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words">
          <b className="mr-1">{c.nome}</b>
          {org ? (
            <span className="mr-1 align-middle">
              <Pill status="published">organização</Pill>
            </span>
          ) : null}
          <span className="whitespace-pre-wrap">{c.texto}</span>
        </p>
        <p className="mt-0.5 flex gap-3 text-xs text-muted">
          <span className="tnum">{tempo(c.createdAt)}</span>
          {aoResponder ? (
            <button type="button" className="font-semibold hover:text-ink" onClick={aoResponder}>
              Responder
            </button>
          ) : null}
          {c.podeApagar ? (
            <button
              type="button"
              className="hover:text-red"
              onClick={() => {
                if (window.confirm("Apagar este comentário?")) aoApagar(c.id);
              }}
            >
              Apagar
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/**
 * Comentários na publicação da rifa, como no Instagram. Apostador com conta
 * comenta e responde; a organização dona responde (com o selo
 * "organização") e apaga o que precisar. Sem conta, o convite para entrar.
 */
export function Comentarios({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const chave = [`/api/public/campaigns/${slug}/comentarios`];
  const { data } = useQuery<Lista>({ queryKey: chave });
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["/api/public/campaigns"] });
  };
  const apagar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/public/comentarios/${id}`),
    onSuccess: recarregar,
  });

  // Chegou pelo aviso ou pelo cartão do feed (#comentarios): rola até aqui
  // quando a lista carregar (na SPA o navegador não faz isso sozinho).
  const carregou = Boolean(data);
  useEffect(() => {
    if (carregou && window.location.hash === "#comentarios") {
      document.getElementById("comentarios")?.scrollIntoView({ block: "start" });
    }
  }, [carregou]);

  const total = data?.lista.reduce((n, c) => n + 1 + c.respostas.length, 0) ?? 0;

  return (
    <section id="comentarios" aria-label="Comentários" className="mt-6 scroll-mt-20">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <MessageCircle size={20} aria-hidden />
        Comentários <span className="tnum text-sm font-normal text-muted">({total})</span>
      </h2>

      <div className="mt-3">
        {data?.podeComentar ? (
          <Escrever
            slug={slug}
            rotulo={data.comoOrganizacao ? `Comentar como ${data.organizacao.nome}…` : "Adicione um comentário…"}
            aoEnviar={recarregar}
          />
        ) : data ? (
          <p className="rounded-xl border border-line bg-mist px-3 py-2 text-sm">
            <Link href="/entrar" className="font-semibold text-marca">
              Entre na sua conta
            </Link>{" "}
            para comentar e conversar com {data.organizacao.nome}.
          </p>
        ) : null}
      </div>

      <ul className="mt-4 space-y-4">
        {data?.lista.map((c) => (
          <li key={c.id} className="space-y-3">
            <Linha
              c={c}
              aoApagar={(id) => apagar.mutate(id)}
              aoResponder={data.podeComentar ? () => setRespondendo(respondendo === c.id ? null : c.id) : undefined}
            />
            {c.respostas.map((r) => (
              <Linha key={r.id} c={r} resposta aoApagar={(id) => apagar.mutate(id)} />
            ))}
            {respondendo === c.id ? (
              <div className="pl-10">
                <Escrever
                  slug={slug}
                  respostaA={c.id}
                  rotulo={`Responder ${c.nome}…`}
                  aoEnviar={() => {
                    setRespondendo(null);
                    recarregar();
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data && data.lista.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Ainda sem comentários. Seja o primeiro.</p>
      ) : null}
    </section>
  );
}
