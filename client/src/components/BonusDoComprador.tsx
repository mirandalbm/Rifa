import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { RESGATE_MAX } from "@shared/bonus";

export interface EstadoBonus {
  ligado: true;
  saldo: number;
  codigo: string;
  link: string;
  porIndicacao: number;
  metas: { id: string; titulo: string; descricao: string; alvo: number; feito: number; alcancada: boolean; recompensa: number }[];
  rifas: { id: string; titulo: string; slug: string; drawAt: string | null; organizacao: string }[];
  extrato: { quantidade: number; motivo: string; descricao: string | null; createdAt: string }[];
}

/**
 * Minhas compras → Bônus (etapa 13): o link de indicação, o progresso das
 * metas e o resgate de cotas grátis nas rifas que as aceitam.
 */
export function BonusDoComprador({ dados }: { dados: EstadoBonus }) {
  const qc = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const [rifa, setRifa] = useState(dados.rifas[0]?.id ?? "");
  const [qtd, setQtd] = useState("1");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const resgatar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", "/api/public/bonus/resgatar", { campaignId: rifa, quantidade: Number(qtd) })).json()) as {
        code: number;
        numbers: number[];
      },
    onSuccess: (r) => {
      setMsg({ ok: true, texto: `Resgatado: pedido #${r.code}, ${r.numbers.length} cota(s). Veja em Minhas compras.` });
      qc.invalidateQueries({ queryKey: ["/api/public/bonus"] });
      qc.invalidateQueries({ queryKey: ["/api/public/my-quotas"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const compartilhar = async () => {
    const texto = `Participe das rifas pelo meu link: ${dados.link}`;
    try {
      if (navigator.share) await navigator.share({ text: texto, url: dados.link });
      else {
        await navigator.clipboard.writeText(dados.link);
        setCopiado(true);
      }
    } catch {
      // compartilhamento cancelado: nada a fazer
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <Card title="Seu saldo" right={<span className="tnum text-lg font-bold text-yellow-deep">{dados.saldo} cota(s)</span>}>
        <div className="space-y-2 p-4 text-sm">
          <p className="text-muted">
            Cotas de bônus são grátis e concorrem como as pagas, nas rifas cujo regulamento as aceita. Não têm
            reembolso nem valor em dinheiro.
          </p>
          {msg ? (
            <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
          ) : null}
          {dados.rifas.length ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                resgatar.mutate();
              }}
            >
              <label className="block min-w-0 flex-1 basis-48">
                <span className="label-xs">Rifa</span>
                <select value={rifa} onChange={(e) => setRifa(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 px-2 py-2">
                  {dados.rifas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titulo} — {r.organizacao}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-20">
                <span className="label-xs">Cotas</span>
                <input
                  type="number"
                  min={1}
                  max={Math.min(RESGATE_MAX, Math.max(1, dados.saldo))}
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-2 py-2"
                />
              </label>
              <Button type="submit" disabled={dados.saldo < 1 || resgatar.isPending}>
                {resgatar.isPending ? "Resgatando…" : "Resgatar"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted">Nenhuma rifa no ar aceita cotas de bônus agora.</p>
          )}
        </div>
      </Card>

      <Card title="Indique e ganhe">
        <div className="space-y-2 p-4 text-sm">
          <p className="text-muted">
            Quem fizer a primeira compra pelo seu link vale <strong className="tnum">{dados.porIndicacao}</strong> cota(s) de bônus
            para você, quando o pagamento for confirmado.
          </p>
          <p className="tnum break-all rounded-md bg-mist px-3 py-2 text-xs">{dados.link}</p>
          <Button variant="ghost" onClick={compartilhar}>
            {copiado ? "Link copiado" : "Compartilhar link"}
          </Button>
        </div>
      </Card>

      <Card title="Metas">
        {dados.metas.length ? (
          <ul className="divide-y divide-line">
            {dados.metas.map((m) => (
              <li key={m.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{m.titulo}</span>
                  {m.alcancada ? <Pill status="paid">alcançada</Pill> : <Pill status="pending">em andamento</Pill>}
                </div>
                <p className="text-xs text-muted">
                  {m.descricao} → <span className="tnum">{m.recompensa}</span> cota(s)
                </p>
                <div
                  className="h-2 overflow-hidden rounded-full bg-mist-2"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={m.alvo}
                  aria-valuenow={m.feito}
                  aria-label={`${m.feito} de ${m.alvo}`}
                >
                  <div className="h-full bg-yellow" style={{ width: `${(100 * m.feito) / m.alvo}%` }} />
                </div>
                <p className="tnum text-xs text-muted">
                  {m.feito} de {m.alvo}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma meta no momento.</Empty>
        )}
      </Card>

      <Card title="Extrato">
        {dados.extrato.length ? (
          <ul className="divide-y divide-line">
            {dados.extrato.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {e.descricao ?? e.motivo}
                  <span className="tnum block text-xs text-muted">{new Date(e.createdAt).toLocaleDateString("pt-BR")}</span>
                </span>
                <span className={`tnum font-semibold ${e.quantidade > 0 ? "text-yellow-deep" : "text-muted"}`}>
                  {e.quantidade > 0 ? `+${e.quantidade}` : e.quantidade}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            Nada ainda. <Link href="/" className="underline">Ver as rifas</Link>
          </Empty>
        )}
      </Card>
    </div>
  );
}
