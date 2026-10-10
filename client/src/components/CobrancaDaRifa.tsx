import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";
import {
  MODOS_DE_COBRANCA,
  NOME_DO_MODO,
  textoDaFaixa,
  textoPct,
  dataDaVigencia,
  type CobrancaDaRifa,
  type ConfigCobranca,
  type ModoDeCobranca,
  type TabelasDaCobranca,
} from "@shared/cobranca";

/**
 * Como a plataforma cobra por esta rifa (`shared/cobranca.ts`): percentual
 * sobre a venda ou valor fixo por cota vendida, mais a taxa do Pix em faixas
 * pelo volume do mês. A organização escolhe no rascunho; a publicação
 * fotografa a tabela daquele dia e a escolha trava.
 */
export function CobrancaDaRifaCard({
  rifa,
}: {
  rifa: { id: string; status: string; priceCents: number; cobrancaModo: string; cobranca: CobrancaDaRifa | null };
}) {
  const qc = useQueryClient();
  const nome = useId();
  const rascunho = rifa.status === "draft";
  const { data: tabelas } = useQuery<TabelasDaCobranca>({
    queryKey: ["/api/admin/cobranca/tabela"],
    enabled: rascunho,
  });
  // Publicada: vale a tabela fotografada, nunca a de hoje.
  const tabela: ConfigCobranca | undefined = rascunho ? tabelas?.vigente : (rifa.cobranca ?? undefined);
  const proxima = rascunho ? (tabelas?.proxima ?? null) : null;
  const [modo, setModo] = useState<ModoDeCobranca>(rifa.cobrancaModo === "por_cota" ? "por_cota" : "percentual");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    setModo(rifa.cobrancaModo === "por_cota" ? "por_cota" : "percentual");
    setAviso(null);
  }, [rifa.id, rifa.cobrancaModo]);

  const salvar = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/campaigns/${rifa.id}`, { cobrancaModo: modo }),
    onSuccess: () => {
      setAviso({ ok: true, texto: "Forma de cobrança salva." });
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });

  /** O que cada modo cobra numa cota desta rifa, para comparar. */
  const porCota = (m: ModoDeCobranca) =>
    !tabela
      ? null
      : m === "percentual"
        ? `${textoPct(tabela.percentualPct)} de cada venda (${formatBRL(Math.floor((rifa.priceCents * tabela.percentualPct) / 100))} numa cota de ${formatBRL(rifa.priceCents)})`
        : `${formatBRL(tabela.porCotaCents)} por cota vendida`;

  const semPublicacao = !rascunho && !rifa.cobranca;

  return (
    <Card
      title="Cobrança da plataforma"
      right={!rascunho ? <Pill status="closed">travada na publicação</Pill> : undefined}
    >
      <div className="space-y-3 p-4 text-sm">
        {semPublicacao ? (
          <p className="text-muted">Esta rifa foi publicada antes da cobrança por rifa: a plataforma não cobra taxa dela.</p>
        ) : (
          <fieldset className="space-y-2" disabled={!rascunho}>
            <legend className="font-medium">Como a plataforma cobra por esta rifa</legend>
            {MODOS_DE_COBRANCA.map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-3 py-2">
                <input
                  type="radio"
                  name={nome}
                  value={m}
                  checked={(rascunho ? modo : rifa.cobranca?.modo) === m}
                  onChange={() => setModo(m)}
                  className="mt-1"
                />
                <span>
                  <b>{NOME_DO_MODO[m]}</b>
                  {porCota(m) ? <span className="tnum block text-xs text-muted">{porCota(m)}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {tabela ? (
          <div className="text-xs text-muted">
            <p>
              Mais a taxa de transação Pix, sobre cada Pix pago pelo site e descontada da organização (nunca de quem
              compra) — quanto mais transações no mês, menor:
            </p>
            <ul className="tnum mt-1 list-disc pl-5">
              {tabela.faixasPix.map((_, i) => (
                <li key={i}>{textoDaFaixa(tabela.faixasPix, i)}</li>
              ))}
            </ul>
            <p className="mt-1">As duas taxas saem antes da comissão do afiliado. A escolha trava ao publicar.</p>
          </div>
        ) : null}

        {proxima ? (
          <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs">
            <b>Tabela nova a partir de <span className="tnum">{dataDaVigencia(proxima.vigenteEm)}</span>:</b>{" "}
            publicada desse dia em diante, a rifa grava{" "}
            <span className="tnum">
              {textoPct(proxima.tabela.percentualPct)} de cada venda ou {formatBRL(proxima.tabela.porCotaCents)} por cota
            </span>
            , com as faixas Pix novas. Publicada antes, segue a de hoje.
          </p>
        ) : null}

        {rascunho ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || modo === rifa.cobrancaModo}>
              Salvar forma de cobrança
            </Button>
            {aviso ? (
              <span role="status" className={`text-sm ${aviso.ok ? "text-green-deep" : "text-red"}`}>
                {aviso.texto}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
