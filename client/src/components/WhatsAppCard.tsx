import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Modelo {
  nome: string;
  categoria: string;
  status: string;
  motivo: string | null;
  exemplo: string;
}

type Estado =
  | { configurado: false; faltando: string[] }
  | {
      configurado: true;
      contaInformada: boolean;
      idioma: string;
      numero: string | null;
      nome: string | null;
      qualidade: string | null;
      modelos: Modelo[];
    };

/** Situação na Meta → forma e rótulo, nunca só cor. */
const SITUACAO: Record<string, [string, string]> = {
  APPROVED: ["paid", "aprovado"],
  PENDING: ["pending", "em análise"],
  IN_APPEAL: ["pending", "em recurso"],
  REJECTED: ["expired", "recusado"],
  PAUSED: ["expired", "pausado"],
  DISABLED: ["expired", "desativado"],
  NAO_CRIADO: ["draft", "não criado"],
};

/**
 * WhatsApp — a conta que manda as mensagens de todas as rifas.
 *
 * Mostra se cada modelo da rifa existe e foi aprovado na Meta, cria os que
 * faltam com o texto e a ordem de parâmetros que o código espera, e manda um
 * teste. Só a plataforma vê: o número é um só para todos os promotores.
 */
export function WhatsAppCard() {
  const qc = useQueryClient();
  const { data, error, isLoading, refetch, isFetching } = useQuery<Estado>({
    queryKey: ["/api/admin/whatsapp"],
  });
  const [telefone, setTelefone] = useState("");
  const [modeloTeste, setModeloTeste] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", "/api/admin/whatsapp/modelos")).json()) as {
        nome: string;
        ok: boolean;
        detalhe: string;
      }[],
    onSuccess: (r) => {
      const recusados = r.filter((m) => !m.ok);
      setFalha(recusados.length ? recusados.map((m) => `${m.nome}: ${m.detalhe}`).join(" · ") : null);
      setAviso(
        recusados.length
          ? null
          : "Modelos enviados para a Meta. A aprovação leva de minutos a algumas horas.",
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp"] });
    },
    onError: (e: Error) => setFalha(e.message),
  });

  const testar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/whatsapp/teste", {
        telefone,
        modelo: modeloTeste || aprovados[0]?.nome,
      }),
    onSuccess: () => {
      setFalha(null);
      setAviso("Mensagem de teste enviada. Confira o WhatsApp do telefone informado.");
    },
    onError: (e: Error) => {
      setAviso(null);
      setFalha(e.message);
    },
  });

  // Só dá para testar com modelo aprovado; o código de acesso vem primeiro
  // quando estiver entre eles.
  const aprovados = data?.configurado
    ? data.modelos.filter((m) => m.status === "APPROVED")
    : [];

  const faltaCriar =
    data?.configurado && data.modelos.some((m) => m.status === "NAO_CRIADO");

  return (
    <Card
      title="WhatsApp"
      right={
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-green-deep underline"
          disabled={isFetching}
        >
          {isFetching ? "conferindo…" : "conferir de novo"}
        </button>
      }
    >
      <div className="space-y-3 p-4">
        {falha ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{falha}</p>
        ) : null}
        {aviso ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">{aviso}</p>
        ) : null}

        {isLoading ? <Empty>Consultando a Meta…</Empty> : null}
        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {(error as Error).message}
          </p>
        ) : null}

        {data && !data.configurado ? (
          <p className="text-sm text-ink-2">
            Sem WhatsApp configurado: as mensagens só aparecem no log do servidor. Falta no
            Railway: <span className="tnum">{data.faltando.join(", ")}</span>.
          </p>
        ) : null}

        {data?.configurado ? (
          <>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="label-xs">Número</dt>
                <dd className="tnum">{data.numero ?? "—"}</dd>
              </div>
              <div>
                <dt className="label-xs">Nome exibido</dt>
                <dd>{data.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="label-xs">Qualidade</dt>
                <dd>{data.qualidade ?? "—"}</dd>
              </div>
            </dl>

            {!data.contaInformada ? (
              <p className="text-xs text-red">
                Falta WHATSAPP_WABA_ID no Railway: sem ele não dá para ver nem criar os modelos.
              </p>
            ) : null}

            <ul className="divide-y divide-line rounded-md border border-line">
              {data.modelos.map((m) => {
                const [status, rotulo] = SITUACAO[m.status] ?? ["draft", m.status.toLowerCase()];
                return (
                  <li key={m.nome} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="tnum">{m.nome}</span>
                      <Pill status={status}>{rotulo}</Pill>
                    </div>
                    <p className="mt-1 text-xs text-muted">{m.exemplo}</p>
                    {m.motivo ? <p className="mt-1 text-xs text-red">motivo: {m.motivo}</p> : null}
                  </li>
                );
              })}
            </ul>

            {faltaCriar ? (
              <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                {criar.isPending ? "Enviando…" : "Criar modelos que faltam na Meta"}
              </Button>
            ) : null}

            <form
              className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                testar.mutate();
              }}
            >
              <div className="min-w-[10rem]">
                <label htmlFor="wa-modelo" className="label-xs">
                  Modelo
                </label>
                <select
                  id="wa-modelo"
                  value={modeloTeste || aprovados[0]?.nome || ""}
                  onChange={(e) => setModeloTeste(e.target.value)}
                  disabled={aprovados.length === 0}
                  className="tnum mt-1 block w-full rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
                >
                  {aprovados.length === 0 ? <option value="">nenhum aprovado ainda</option> : null}
                  {aprovados.map((m) => (
                    <option key={m.nome} value={m.nome}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="wa-teste" className="label-xs">
                  Mandar teste para (com DDD)
                </label>
                <input
                  id="wa-teste"
                  inputMode="tel"
                  autoComplete="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="41 98765-4321"
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
              <Button
                type="submit"
                variant="ghost"
                disabled={
                  aprovados.length === 0 ||
                  telefone.replace(/\D/g, "").length < 10 ||
                  testar.isPending
                }
              >
                Enviar teste
              </Button>
            </form>
            {data.modelos.some((m) => m.categoria === "AUTHENTICATION" && m.status !== "APPROVED") ? (
              <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
                O código de acesso (usado pelo comprador para entrar em "Minhas cotas") é da
                categoria autenticação, que a Meta só libera para empresa verificada. Enquanto
                isso, o comprador não recebe o código.
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Com número de teste da Meta, só chegam mensagens para os telefones cadastrados na
              lista de destinatários do app (página de teste da API do WhatsApp).
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
