import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { BONUS_POR_INDICACAO_MAX, RESGATE_MAX, TIPOS_DE_META, type Meta, type TipoDeMeta } from "@shared/bonus";

interface Painel {
  config: { bonusLigado: boolean; bonusPorIndicacao: number };
  metas: Meta[];
  resumo: { indicacoes: number; creditadas: number; resgatadas: number; rifas: number };
}

const vazia = { titulo: "", tipo: "rifas_compradas" as TipoDeMeta, alvo: "3", recompensa: "1" };

/**
 * Programa de bônus (etapa 13), só da plataforma. Nasce desligado: cota
 * grátis precisa estar prevista no regulamento aprovado de cada rifa, e
 * liga-se depois de o advogado confirmar.
 */
export function AdminBonus() {
  const qc = useQueryClient();
  const { data } = useQuery<Painel>({ queryKey: ["/api/admin/bonus"] });
  const [ligado, setLigado] = useState(false);
  const [porIndicacao, setPorIndicacao] = useState("1");
  const [nova, setNova] = useState(vazia);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setLigado(data.config.bonusLigado);
    setPorIndicacao(String(data.config.bonusPorIndicacao));
  }, [data]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/bonus"] });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message });
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/bonus/config", { bonusLigado: ligado, bonusPorIndicacao: Number(porIndicacao) }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo." });
      recarregar();
    },
    onError: falhou,
  });
  const criar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/bonus/metas", { ...nova, alvo: Number(nova.alvo), recompensa: Number(nova.recompensa) }),
    onSuccess: () => {
      setNova(vazia);
      setMsg({ ok: true, texto: "Meta criada." });
      recarregar();
    },
    onError: falhou,
  });
  const alternar = useMutation({
    mutationFn: (m: Meta) => apiRequest("PUT", `/api/admin/bonus/metas/${m.id}`, { ...m, ativa: !m.ativa }),
    onSuccess: recarregar,
    onError: falhou,
  });

  return (
    <PanelShell title="Bônus">
      {msg ? (
        <p className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Programa" right={<Pill status={data?.config.bonusLigado ? "active" : "draft"}>{data?.config.bonusLigado ? "ligado" : "desligado"}</Pill>}>
          <div className="space-y-3 p-4 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--green)]" />
              <span>
                Programa de indicação, metas e cotas de bônus
                <span className="block text-xs text-muted">
                  Ligado, cada apostador ganha um link de indicação e vê as metas em Minhas compras → Bônus. As cotas
                  de bônus só são resgatadas em rifas cujo regulamento as prevê (a organização marca nos dados legais,
                  antes de publicar). Ligue depois de o advogado confirmar. Desligado, nada acumula e nada se resgata;
                  o saldo de cada um fica guardado.
                </span>
              </span>
            </label>
            <label className="block">
              <span className="label-xs">Cotas de bônus por indicação confirmada (1 a {BONUS_POR_INDICACAO_MAX})</span>
              <input
                type="number"
                min={1}
                max={BONUS_POR_INDICACAO_MAX}
                value={porIndicacao}
                onChange={(e) => setPorIndicacao(e.target.value)}
                className="tnum mt-1 w-24 rounded-md border border-line-2 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-muted">
                Conta quando o indicado paga a primeira compra. Se essa compra for estornada, o bônus sai.
              </span>
            </label>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              Salvar
            </Button>
          </div>
        </Card>

        <Card title="Até agora">
          <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
            {(
              [
                ["Indicações confirmadas", data?.resumo.indicacoes],
                ["Cotas de bônus creditadas", data?.resumo.creditadas],
                ["Cotas resgatadas", data?.resumo.resgatadas],
                ["Rifas no ar que aceitam bônus", data?.resumo.rifas],
              ] as [string, number | undefined][]
            ).map(([rotulo, n]) => (
              <div key={rotulo}>
                <dt className="label-xs">{rotulo}</dt>
                <dd className="tnum text-lg font-semibold">{n ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Metas">
          {data?.metas.length ? (
            <ul className="divide-y divide-line">
              {data.metas.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.titulo}</span>
                    <span className="text-xs text-muted">
                      {TIPOS_DE_META[m.tipo].descreve(m.alvo)} → <span className="tnum">{m.recompensa}</span> cota(s)
                    </span>
                  </span>
                  <Pill status={m.ativa ? "active" : "draft"}>{m.ativa ? "ativa" : "pausada"}</Pill>
                  <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => alternar.mutate(m)}>
                    {m.ativa ? "Pausar" : "Ativar"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma meta ainda.</Empty>
          )}
        </Card>

        <Card title="Nova meta">
          <form
            className="space-y-3 p-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              criar.mutate();
            }}
          >
            <label className="block">
              <span className="label-xs">Título</span>
              <input
                value={nova.titulo}
                onChange={(e) => setNova({ ...nova, titulo: e.target.value })}
                placeholder="Ex.: Fã de rifas"
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="label-xs">O que conta</span>
              <select
                value={nova.tipo}
                onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoDeMeta })}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
              >
                {(Object.keys(TIPOS_DE_META) as TipoDeMeta[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_DE_META[t].nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label-xs">Alvo</span>
                <input
                  type="number"
                  min={1}
                  value={nova.alvo}
                  onChange={(e) => setNova({ ...nova, alvo: e.target.value })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="label-xs">Cotas de bônus (1 a {RESGATE_MAX})</span>
                <input
                  type="number"
                  min={1}
                  max={RESGATE_MAX}
                  value={nova.recompensa}
                  onChange={(e) => setNova({ ...nova, recompensa: e.target.value })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </label>
            </div>
            <p className="text-xs text-muted">
              {TIPOS_DE_META[nova.tipo].descreve(Number(nova.alvo) || 1)}. Cada pessoa ganha a recompensa uma vez.
            </p>
            <Button type="submit" disabled={criar.isPending || nova.titulo.trim().length < 3}>
              Criar meta
            </Button>
          </form>
        </Card>
      </div>
    </PanelShell>
  );
}
