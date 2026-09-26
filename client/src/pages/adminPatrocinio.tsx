import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";
import { PATROCINADAS_NO_AR, PATROCINIOS_POR_ORGANIZACAO } from "@shared/patrocinio";

interface Retorno {
  campaignId: string;
  titulo: string;
  cliques: number;
  gastoCents: number;
  vendas: number;
  receitaCents: number;
  custoPorVendaCents: number | null;
}
interface Config {
  ligado: boolean;
  precoCliqueCents: number;
  recargaMinimaCents: number;
}
type Painel =
  | { plataforma: true; config: Config; organizacoes: { id: string; nome: string; saldoCents: number }[]; retorno: Retorno[] }
  | {
      plataforma: false;
      config: Config;
      saldoCents: number;
      ativos: { id: string; campaignId: string; titulo: string; status: string; desde: string }[];
      rifas: { id: string; titulo: string }[];
      extrato: { valorCents: number; motivo: string; descricao: string | null; createdAt: string }[];
      recargaPendente: { codigo: number; valorCents: number; pixQr: string | null; pixCopyPaste: string | null; expiresAt: string } | null;
      retorno: Retorno[];
    };

/** "12,50" → 1250. Nulo quando não é um valor em reais. */
function centavos(texto: string): number | null {
  const t = texto.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * Rifas patrocinadas por clique (etapa 15). A mesma tela para os dois lados:
 * a organização vê o saldo, a recarga e as rifas dela; a plataforma, a
 * configuração, o saldo de todas e o ajuste.
 */
export function AdminPatrocinio() {
  const { data } = useQuery<Painel>({ queryKey: ["/api/admin/patrocinio"], refetchInterval: 15_000 });
  if (!data) return <PanelShell title="Patrocínio"><Empty>Carregando…</Empty></PanelShell>;
  return (
    <PanelShell title="Patrocínio">
      {data.plataforma ? <DaPlataforma dados={data} /> : <DaOrganizacao dados={data} />}
      <div className="mt-3">
        <RetornoCard retorno={data.retorno} />
      </div>
    </PanelShell>
  );
}

function Aviso({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>;
}

function DaOrganizacao({ dados }: { dados: Extract<Painel, { plataforma: false }> }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState(reais(dados.config.recargaMinimaCents));
  const [rifa, setRifa] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message });
  const recarga = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/patrocinio/recargas", { valorCents: centavos(valor) }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Pix gerado. Assim que for pago, o saldo entra sozinho." });
      recarregar();
    },
    onError: falhou,
  });
  const patrocinar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rifa }),
    onSuccess: () => {
      setRifa("");
      setMsg({ ok: true, texto: "Rifa patrocinada." });
      recarregar();
    },
    onError: falhou,
  });
  const pausar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/patrocinio/patrocinios/${id}/pausar`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const livres = dados.rifas.filter((r) => !dados.ativos.some((a) => a.campaignId === r.id));
  const semSaldo = dados.saldoCents < dados.config.precoCliqueCents;

  return (
    <div className="space-y-3">
      {!dados.config.ligado ? (
        <p className="rounded-md bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
          As rifas patrocinadas ainda não estão ativas na plataforma. O saldo fica guardado.
        </p>
      ) : null}
      <Aviso msg={msg} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Saldo" right={<Money cents={dados.saldoCents} className="text-lg font-bold text-green-deep" />}>
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted">
              Cada clique de visitante novo custa <strong className="tnum">{formatBRL(dados.config.precoCliqueCents)}</strong>. O mesmo
              aparelho conta uma vez a cada 24 horas, e robô não conta. Sem saldo para um clique, as rifas saem do bloco
              até a próxima recarga.
            </p>
            {semSaldo ? <Pill status="expired">sem saldo para clique</Pill> : null}
            {dados.recargaPendente ? (
              <div className="space-y-2 rounded-md border border-yellow bg-yellow-soft p-3">
                <p className="font-semibold text-yellow-deep">
                  Recarga de <span className="tnum">{formatBRL(dados.recargaPendente.valorCents)}</span> esperando o Pix
                </p>
                {dados.recargaPendente.pixQr ? <img src={dados.recargaPendente.pixQr} alt="QR do Pix da recarga" className="h-40 w-40" /> : null}
                {dados.recargaPendente.pixCopyPaste ? (
                  <p className="tnum break-all rounded bg-white px-2 py-1 text-xs">{dados.recargaPendente.pixCopyPaste}</p>
                ) : null}
                <p className="tnum text-xs text-muted">
                  pedido {dados.recargaPendente.codigo} · vale até {new Date(dados.recargaPendente.expiresAt).toLocaleTimeString("pt-BR")}
                </p>
              </div>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMsg(null);
                  recarga.mutate();
                }}
              >
                <label className="block">
                  <span className="label-xs">Recarregar (R$)</span>
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    inputMode="decimal"
                    className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2"
                  />
                </label>
                <Button type="submit" disabled={!dados.config.ligado || centavos(valor) === null || recarga.isPending}>
                  Gerar Pix
                </Button>
                <span className="w-full text-xs text-muted">Mínimo de {formatBRL(dados.config.recargaMinimaCents)}. O Pix vai para a conta da plataforma.</span>
              </form>
            )}
          </div>
        </Card>

        <Card title="Rifas patrocinadas" right={<span className="tnum text-xs text-muted">{dados.ativos.length} de {PATROCINIOS_POR_ORGANIZACAO}</span>}>
          {dados.ativos.length ? (
            <ul className="divide-y divide-line">
              {dados.ativos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 font-semibold">{a.titulo}</span>
                  <Pill status={a.status === "published" && !semSaldo ? "active" : "pending"}>
                    {a.status === "published" ? (semSaldo ? "sem saldo" : "no bloco") : "rifa fora do ar"}
                  </Pill>
                  <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => pausar.mutate(a.id)}>
                    Pausar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma rifa patrocinada.</Empty>
          )}
          {livres.length && dados.ativos.length < PATROCINIOS_POR_ORGANIZACAO ? (
            <form
              className="flex flex-wrap items-end gap-2 border-t border-line p-4 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                patrocinar.mutate();
              }}
            >
              <label className="block min-w-0 flex-1">
                <span className="label-xs">Patrocinar a rifa</span>
                <select value={rifa} onChange={(e) => setRifa(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 px-2 py-2">
                  <option value="">—</option>
                  {livres.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titulo}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={!rifa || !dados.config.ligado || patrocinar.isPending}>
                Patrocinar
              </Button>
              <span className="w-full text-xs text-muted">
                O bloco mostra até {PATROCINADAS_NO_AR} rifas por visita, sorteadas entre as de todas as organizações com saldo.
              </span>
            </form>
          ) : null}
        </Card>
      </div>

      <Card title="Extrato do saldo">
        {dados.extrato.length ? (
          <ul className="divide-y divide-line">
            {dados.extrato.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {e.descricao ?? e.motivo}
                  <span className="tnum block text-xs text-muted">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>
                </span>
                <Money cents={e.valorCents} className={e.valorCents > 0 ? "text-green-deep" : ""} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma recarga ainda. Os cliques aparecem no retorno, abaixo.</Empty>
        )}
      </Card>
    </div>
  );
}

function DaPlataforma({ dados }: { dados: Extract<Painel, { plataforma: true }> }) {
  const qc = useQueryClient();
  const [ligado, setLigado] = useState(dados.config.ligado);
  const [preco, setPreco] = useState(reais(dados.config.precoCliqueCents));
  const [minima, setMinima] = useState(reais(dados.config.recargaMinimaCents));
  const [ajuste, setAjuste] = useState({ organizationId: "", valor: "", descricao: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    setLigado(dados.config.ligado);
    setPreco(reais(dados.config.precoCliqueCents));
    setMinima(reais(dados.config.recargaMinimaCents));
  }, [dados.config.ligado, dados.config.precoCliqueCents, dados.config.recargaMinimaCents]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message });
  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/patrocinio/config", { ligado, precoCliqueCents: centavos(preco), recargaMinimaCents: centavos(minima) }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo." });
      recarregar();
    },
    onError: falhou,
  });
  const ajustar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/patrocinio/ajustes", {
        organizationId: ajuste.organizationId,
        valorCents: centavos(ajuste.valor),
        descricao: ajuste.descricao,
      }),
    onSuccess: () => {
      setAjuste({ organizationId: "", valor: "", descricao: "" });
      setMsg({ ok: true, texto: "Saldo ajustado." });
      recarregar();
    },
    onError: falhou,
  });

  return (
    <div className="space-y-3">
      <Aviso msg={msg} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Configuração" right={<Pill status={dados.config.ligado ? "active" : "draft"}>{dados.config.ligado ? "ligado" : "desligado"}</Pill>}>
          <div className="space-y-3 p-4 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--green)]" />
              <span>
                Rifas patrocinadas por clique
                <span className="block text-xs text-muted">
                  Ligado, as organizações recarregam saldo por Pix (para a conta da plataforma) e escolhem rifas para o bloco
                  "Patrocinadas" da vitrine. Desligado, o bloco some, clique não é cobrado e recarga não sai; o saldo fica.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label-xs">Preço do clique (R$)</span>
                <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2" />
              </label>
              <label className="block">
                <span className="label-xs">Recarga mínima (R$)</span>
                <input value={minima} onChange={(e) => setMinima(e.target.value)} inputMode="decimal" className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2" />
              </label>
            </div>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || centavos(preco) === null || centavos(minima) === null}>
              Salvar
            </Button>
          </div>
        </Card>

        <Card title="Saldo das organizações">
          {dados.organizacoes.length ? (
            <ul className="divide-y divide-line">
              {dados.organizacoes.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                  <Money cents={o.saldoCents} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma organização.</Empty>
          )}
          <form
            className="space-y-2 border-t border-line p-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              ajustar.mutate();
            }}
          >
            <span className="label-xs">Ajuste de saldo (crédito ou débito)</span>
            <select
              value={ajuste.organizationId}
              onChange={(e) => setAjuste({ ...ajuste, organizationId: e.target.value })}
              className="w-full rounded-md border border-line-2 px-2 py-2"
            >
              <option value="">Organização</option>
              {dados.organizacoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <input
                value={ajuste.valor}
                onChange={(e) => setAjuste({ ...ajuste, valor: e.target.value })}
                placeholder="-10,00 ou 50,00"
                inputMode="decimal"
                className="tnum rounded-md border border-line-2 px-3 py-2"
              />
              <input
                value={ajuste.descricao}
                onChange={(e) => setAjuste({ ...ajuste, descricao: e.target.value })}
                placeholder="Motivo (vai para o extrato)"
                className="rounded-md border border-line-2 px-3 py-2"
              />
            </div>
            <Button type="submit" variant="ghost" disabled={!ajuste.organizationId || centavos(ajuste.valor) === null || ajustar.isPending}>
              Lançar ajuste
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function RetornoCard({ retorno }: { retorno: Retorno[] }) {
  return (
    <Card title="Retorno nos últimos 30 dias">
      {retorno.length ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="label-xs text-left">
                <th className="w-2/5 px-4 py-2">Rifa</th>
                <th className="px-2 py-2 text-right">Cliques</th>
                <th className="px-2 py-2 text-right">Gasto</th>
                <th className="hidden px-2 py-2 text-right sm:table-cell">Vendas</th>
                <th className="px-4 py-2 text-right">Por venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {retorno.map((r) => (
                <tr key={r.campaignId}>
                  <td className="truncate px-4 py-2" title={r.titulo}>
                    {r.titulo}
                  </td>
                  <td className="tnum px-2 py-2 text-right">{r.cliques}</td>
                  <td className="tnum px-2 py-2 text-right">{formatBRL(r.gastoCents)}</td>
                  <td className="tnum hidden px-2 py-2 text-right sm:table-cell">
                    {r.vendas} · {formatBRL(r.receitaCents)}
                  </td>
                  <td className="tnum px-4 py-2 text-right">{r.custoPorVendaCents === null ? "—" : formatBRL(r.custoPorVendaCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nenhum clique ainda.</Empty>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Vendas contam quando a compra veio de um clique no bloco (origem "Rifa patrocinada"), pagas no período.
      </p>
    </Card>
  );
}
