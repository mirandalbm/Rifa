import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Caixa, Campo, Empty, Pill } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { BONUS_POR_INDICACAO_MAX, RESGATE_MAX, TIPOS_DE_META, type Meta, type TipoDeMeta } from "@shared/bonus";
import { PRESENTE_PCT_MAX, textoDoPresente, type ConfigPresente } from "@shared/presente";

interface Painel {
  config: { bonusLigado: boolean; bonusPorIndicacao: number; presente: ConfigPresente };
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
  const [presente, setPresente] = useState({ ligado: false, pct: "10", teto: "10,00" });

  useEffect(() => {
    if (!data) return;
    setLigado(data.config.bonusLigado);
    setPorIndicacao(String(data.config.bonusPorIndicacao));
    const p = data.config.presente;
    setPresente({ ligado: p.ligado, pct: String(p.pct), teto: (p.tetoCents / 100).toFixed(2).replace(".", ",") });
  }, [data]);
  const presenteConfig = {
    ligado: presente.ligado,
    pct: Number(presente.pct),
    tetoCents: Math.round(Number(presente.teto.replace(/\./g, "").replace(",", ".")) * 100),
  };

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/bonus"] });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message });
  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/bonus/config", {
        bonusLigado: ligado,
        bonusPorIndicacao: Number(porIndicacao),
        presente: presenteConfig,
      }),
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

  const situacao = (ligadoAgora: boolean | undefined) => (
    <Pill status={ligadoAgora ? "paid" : "pending"}>{ligadoAgora ? "ligado" : "desligado"}</Pill>
  );

  return (
    <PanelShell title="Bônus">
      {msg ? (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}
        >
          {msg.texto}
        </p>
      ) : null}
      {/* O DOM na ordem do celular (programa, presente, até agora, metas, nova
          meta); no computador, programa e presente à esquerda, os números, as
          metas e a nova meta à direita. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6">
          <CartaoDoPainel titulo="Programa" acao={situacao(data?.config.bonusLigado)}>
            <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
              <Caixa
                marcada={ligado}
                aoMudar={setLigado}
                sub="Ligado, cada apostador ganha um link de indicação e vê as metas em Minhas compras → Bônus. As cotas de bônus só são resgatadas em rifas cujo regulamento as prevê (a organização marca nos dados legais, antes de publicar). Ligue depois de o advogado confirmar. Desligado, nada acumula e nada se resgata; o saldo de cada um fica guardado."
              >
                Programa de indicação, metas e cotas de bônus
              </Caixa>
              <Campo
                rotulo={`Cotas de bônus por indicação confirmada (1 a ${BONUS_POR_INDICACAO_MAX})`}
                dica="Conta quando o indicado paga a primeira compra. Se essa compra for estornada, o bônus sai."
              >
                <input
                  type="number"
                  min={1}
                  max={BONUS_POR_INDICACAO_MAX}
                  value={porIndicacao}
                  onChange={(e) => setPorIndicacao(e.target.value)}
                  className="campo tnum block w-28 text-sm"
                />
              </Campo>
              <div>
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  Salvar
                </Button>
              </div>
            </div>
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Presente" acao={situacao(data?.config.presente.ligado)}>
            <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
              <Caixa
                marcada={presente.ligado}
                aoMudar={(v) => setPresente({ ...presente, ligado: v })}
                sub={
                  <>
                    Quem tem conta manda um convite (o ícone de presente ao lado do campo de comentário). O convidado,
                    com conta, ganha desconto na primeira compra paga — <b>pago pela plataforma</b>: a promotora e o
                    afiliado recebem como se fosse o preço cheio, e a parte da promotora no desconto entra como crédito
                    dela em Cobrança. Quem convida ganha o bônus de indicação, se o programa acima estiver ligado.
                  </>
                }
              >
                Presente pelos comentários
              </Caixa>
              <div className="grid grid-cols-2 items-end gap-3">
                <Campo rotulo={`Desconto (1 a ${PRESENTE_PCT_MAX}%)`} className="min-w-0">
                  <input
                    type="number"
                    min={1}
                    max={PRESENTE_PCT_MAX}
                    value={presente.pct}
                    onChange={(e) => setPresente({ ...presente, pct: e.target.value })}
                    className="campo tnum text-sm"
                  />
                </Campo>
                <Campo rotulo="Teto em reais (1,00 a 100,00)" className="min-w-0">
                  <input
                    inputMode="decimal"
                    value={presente.teto}
                    onChange={(e) => setPresente({ ...presente, teto: e.target.value.replace(/[^\d,.]/g, "") })}
                    className="campo tnum text-sm"
                  />
                </Campo>
              </div>
              {presenteConfig.pct >= 1 && presenteConfig.tetoCents > 0 ? (
                <p className="text-xs text-muted">Aparece assim: “{textoDoPresente(presenteConfig)}”.</p>
              ) : null}
              <div>
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  Salvar
                </Button>
              </div>
            </div>
          </CartaoDoPainel>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6">
          <CartaoDoPainel titulo="Até agora">
            <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-sm">
              {(
                [
                  ["Indicações confirmadas", data?.resumo.indicacoes],
                  ["Cotas de bônus creditadas", data?.resumo.creditadas],
                  ["Cotas resgatadas", data?.resumo.resgatadas],
                  ["Rifas no ar que aceitam bônus", data?.resumo.rifas],
                ] as [string, number | undefined][]
              ).map(([rotulo, n]) => (
                <div key={rotulo} className="min-w-0">
                  <dt className="label-xs">{rotulo}</dt>
                  <dd className="tnum text-lg font-semibold">{n ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Metas">
            {data?.metas.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {data.metas.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold">{m.titulo}</span>
                      <span className="text-xs text-muted">
                        {TIPOS_DE_META[m.tipo].descreve(m.alvo)} → <span className="tnum">{m.recompensa}</span> cota(s)
                      </span>
                    </span>
                    <Pill status={m.ativa ? "paid" : "draft"}>{m.ativa ? "ativa" : "pausada"}</Pill>
                    <Button variant="contorno" onClick={() => alternar.mutate(m)} aria-label={`${m.ativa ? "Pausar" : "Ativar"} a meta ${m.titulo}`}>
                      {m.ativa ? "Pausar" : "Ativar"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma meta ainda. Crie a primeira em "Nova meta".</Empty>
            )}
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Nova meta">
            <form
              className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                criar.mutate();
              }}
            >
              <Campo rotulo="Título">
                <input
                  value={nova.titulo}
                  onChange={(e) => setNova({ ...nova, titulo: e.target.value })}
                  placeholder="Ex.: Fã de rifas"
                />
              </Campo>
              <Campo rotulo="O que conta">
                <select value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoDeMeta })}>
                  {(Object.keys(TIPOS_DE_META) as TipoDeMeta[]).map((t) => (
                    <option key={t} value={t}>
                      {TIPOS_DE_META[t].nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grid grid-cols-2 items-end gap-3">
                <Campo rotulo="Alvo" className="min-w-0">
                  <input
                    type="number"
                    min={1}
                    value={nova.alvo}
                    onChange={(e) => setNova({ ...nova, alvo: e.target.value })}
                    className="campo tnum text-sm"
                  />
                </Campo>
                <Campo rotulo={`Cotas de bônus (1 a ${RESGATE_MAX})`} className="min-w-0">
                  <input
                    type="number"
                    min={1}
                    max={RESGATE_MAX}
                    value={nova.recompensa}
                    onChange={(e) => setNova({ ...nova, recompensa: e.target.value })}
                    className="campo tnum text-sm"
                  />
                </Campo>
              </div>
              <p className="text-xs text-muted">
                {TIPOS_DE_META[nova.tipo].descreve(Number(nova.alvo) || 1)}. Cada pessoa ganha a recompensa uma vez.
              </p>
              <div>
                <Button type="submit" disabled={criar.isPending || nova.titulo.trim().length < 3}>
                  Criar meta
                </Button>
              </div>
            </form>
          </CartaoDoPainel>
        </div>
      </div>
    </PanelShell>
  );
}
