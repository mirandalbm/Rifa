import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, groupNumber } from "@shared/format";
import {
  CAMPOS_DE_CREDENCIAL,
  CAMPOS_DE_PIXEL,
  NOME_DA_CREDENCIAL,
  PROVEDORES,
  exemploDoPixel,
  nomeDoPixel,
  type Pixels,
} from "@shared/marketing";

interface Painel {
  plataforma: boolean;
  dias: number;
  pixels: Pixels;
  credenciais: Record<(typeof CAMPOS_DE_CREDENCIAL)[number], boolean>;
  campanhas: { fonte: string; meio: string; campanha: string; pedidos: number; vendas: number; receitaCents: number }[];
  envios: { provedor: string; status: string; n: number }[];
}

const NOME_ENVIO: Record<string, string> = { meta: PROVEDORES.meta, ga4: PROVEDORES.ga4, tiktok: PROVEDORES.tiktok };

/**
 * Marketing e tráfego pago (etapa 16). A mesma tela nos dois recortes: a
 * plataforma cuida dos pixels dela (todas as páginas); a organização, dos
 * dela (perfil e rifas dela).
 */
export function AdminMarketing() {
  const [dias, setDias] = useState(30);
  const { data, error } = useQuery<Painel>({ queryKey: ["/api/admin/marketing", { dias }] });
  return (
    <PanelShell title="Marketing">
      {error ? (
        <Empty>Não disponível.</Empty>
      ) : !data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <ConfigCard dados={data} />
            <EnviosCard dados={data} />
          </div>
          <CampanhasCard dados={data} dias={dias} setDias={setDias} />
        </div>
      )}
    </PanelShell>
  );
}

function ConfigCard({ dados }: { dados: Painel }) {
  const qc = useQueryClient();
  const [pixels, setPixels] = useState<Record<string, string>>({});
  const [chaves, setChaves] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    setPixels(Object.fromEntries(CAMPOS_DE_PIXEL.map((c) => [c, dados.pixels[c] ?? ""])));
  }, [dados.pixels]);

  const salvar = useMutation({
    mutationFn: (apagar?: string) =>
      apiRequest("PUT", "/api/admin/marketing", {
        pixels,
        // Só vai o que foi digitado (ou o que se pediu para apagar): o que já está guardado fica.
        credenciais: apagar
          ? { [apagar]: "" }
          : Object.fromEntries(Object.entries(chaves).filter(([, v]) => v.trim())),
      }),
    onSuccess: () => {
      setChaves({});
      setMsg({ ok: true, texto: "Salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/marketing"] });
      qc.invalidateQueries({ queryKey: ["/api/public/marketing"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <Card
      title={dados.plataforma ? "Pixels da plataforma" : "Pixels da sua organização"}
    >
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate(undefined);
        }}
      >
        {msg ? (
          <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
        ) : null}
        <p className="text-xs text-muted">
          {dados.plataforma
            ? "Valem em todas as páginas do site, para quem aceitar os cookies."
            : "Valem no seu perfil e nas páginas das suas rifas, para quem aceitar os cookies."}{" "}
          Informe só o número de cada pixel — o sistema monta o código. Sem nenhum pixel, nada carrega e o aviso de
          cookies não aparece.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPOS_DE_PIXEL.map((c) => (
            <label key={c} className="block">
              <span className="label-xs">{nomeDoPixel(c)}</span>
              <input
                value={pixels[c] ?? ""}
                onChange={(e) => setPixels({ ...pixels, [c]: e.target.value })}
                placeholder={exemploDoPixel(c)}
                className="campo tnum"
              />
            </label>
          ))}
        </div>
        <div>
          <span className="label-xs">Compra pelo servidor (chaves de API)</span>
          <p className="mt-1 text-xs text-muted">
            Com a chave, a compra paga é enviada pelo servidor — conta mesmo de quem fecha a página antes do Pix cair. Só
            vai compra de quem aceitou os cookies. A chave fica cifrada e nunca volta para esta tela.
          </p>
          <ul className="mt-2 space-y-2">
            {CAMPOS_DE_CREDENCIAL.map((c) => (
              <li key={c} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block">
                  <span className="text-xs">{NOME_DA_CREDENCIAL[c]}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={chaves[c] ?? ""}
                    onChange={(e) => setChaves({ ...chaves, [c]: e.target.value })}
                    placeholder={dados.credenciais[c] ? "•••••••• (guardada — digite para trocar)" : "não configurada"}
                    className="campo"
                  />
                </label>
                {dados.credenciais[c] ? (
                  <button type="button" onClick={() => salvar.mutate(c)} className="text-xs text-red underline sm:pb-2">
                    apagar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}

function EnviosCard({ dados }: { dados: Painel }) {
  const porProvedor = new Map<string, Record<string, number>>();
  for (const e of dados.envios) porProvedor.set(e.provedor, { ...(porProvedor.get(e.provedor) ?? {}), [e.status]: e.n });
  return (
    <Card title="Compras enviadas pelo servidor">
      {porProvedor.size ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="label-xs border-b border-line text-left">
              <th className="px-4 py-2 font-normal">Plataforma</th>
              <th className="px-2 py-2 text-right font-normal">Enviadas</th>
              <th className="px-2 py-2 text-right font-normal">Na fila</th>
              <th className="px-4 py-2 text-right font-normal">Falharam</th>
            </tr>
          </thead>
          <tbody>
            {[...porProvedor.entries()].map(([p, n]) => (
              <tr key={p} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{NOME_ENVIO[p] ?? p}</td>
                <td className="tnum px-2 py-2 text-right">{groupNumber(n.enviado ?? 0)}</td>
                <td className="tnum px-2 py-2 text-right">{groupNumber(n.pendente ?? 0)}</td>
                <td className={`tnum px-4 py-2 text-right ${n.falhou ? "text-red" : ""}`}>{groupNumber(n.falhou ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>Nenhuma compra enviada no período. Precisa de pixel e chave da mesma plataforma.</Empty>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Falha de envio nunca afeta o pagamento: a compra fica na fila e o sistema tenta de novo, com espera crescente, até
        cinco vezes.
      </p>
    </Card>
  );
}

function CampanhasCard({ dados, dias, setDias }: { dados: Painel; dias: number; setDias: (d: number) => void }) {
  return (
    <Card
      title="Vendas por campanha (UTM)"
      right={
        <span className="flex gap-1" role="tablist" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={dias === d}
              onClick={() => setDias(d)}
              className={dias === d ? "rounded-md bg-green px-2 py-1 text-xs font-semibold text-on-green" : "rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-mist-2"}
            >
              <span className="tnum">{d}</span> dias
            </button>
          ))}
        </span>
      }
    >
      {dados.campanhas.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="label-xs border-b border-line text-left">
                <th className="px-3 py-2 font-normal sm:px-4">Fonte / meio</th>
                <th className="px-2 py-2 font-normal">Campanha</th>
                <th className="px-2 py-2 text-right font-normal">Pedidos</th>
                <th className="px-2 py-2 text-right font-normal">Vendas</th>
                <th className="px-3 py-2 text-right font-normal sm:px-4">Receita</th>
              </tr>
            </thead>
            <tbody>
              {dados.campanhas.map((c) => (
                <tr key={`${c.fonte}|${c.meio}|${c.campanha}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 sm:px-4">
                    {c.fonte} <span className="text-muted">/ {c.meio}</span>
                  </td>
                  <td className="px-2 py-2">{c.campanha}</td>
                  <td className="tnum px-2 py-2 text-right">{groupNumber(c.pedidos)}</td>
                  <td className="tnum px-2 py-2 text-right">{groupNumber(c.vendas)}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-green-deep sm:px-4">{formatBRL(c.receitaCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nenhuma venda com UTM no período. Use utm_source, utm_medium e utm_campaign nos links dos anúncios.</Empty>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Receita é venda paga. Os números vêm do link do anúncio (UTM, gclid, fbclid, ttclid) e são estatística: não
        decidem comissão nem dinheiro.
      </p>
    </Card>
  );
}
