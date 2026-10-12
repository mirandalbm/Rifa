import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Empty, Filtros, Pill } from "@/components/bits";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
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
    <PanelShell title="Medição e campanhas">
      {error ? (
        <Empty>Não disponível.</Empty>
      ) : !data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-2">
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
    <CartaoDoPainel titulo={dados.plataforma ? "Pixels da plataforma" : "Pixels da sua organização"}>
      <form
        className="space-y-3 px-5 pb-5 text-sm"
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
        {/* O rótulo longo ("Rótulo da conversão do Google Ads") quebra para cima: cada campo encosta no pé da linha, alinhado ao vizinho. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CAMPOS_DE_PIXEL.map((c) => (
            <Campo key={c} rotulo={nomeDoPixel(c)} className="flex flex-col justify-end">
              <input
                value={pixels[c] ?? ""}
                onChange={(e) => setPixels({ ...pixels, [c]: e.target.value })}
                placeholder={exemploDoPixel(c)}
                className="campo tnum"
              />
            </Campo>
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
              <li key={c} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                {/* A chave nunca volta para a tela: o que se sabe é se existe, e isso vai em texto (a pílula), nunca no valor. */}
                <Campo
                  rotulo={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {NOME_DA_CREDENCIAL[c]}
                      {dados.credenciais[c] ? <Pill status="draft">chave cadastrada</Pill> : null}
                    </span>
                  }
                >
                  <input
                    type="password"
                    autoComplete="off"
                    value={chaves[c] ?? ""}
                    onChange={(e) => setChaves({ ...chaves, [c]: e.target.value })}
                    placeholder={dados.credenciais[c] ? "digite para trocar" : "não configurada"}
                    className="campo"
                  />
                </Campo>
                {dados.credenciais[c] ? (
                  <Button type="button" variant="cinza" onClick={() => salvar.mutate(c)}>
                    Apagar a chave
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </form>
    </CartaoDoPainel>
  );
}

const SITUACAO_DO_ENVIO: { chave: "enviado" | "pendente" | "falhou"; status: string; rotulo: string }[] = [
  { chave: "enviado", status: "paid", rotulo: "enviadas" },
  { chave: "pendente", status: "pending", rotulo: "na fila" },
  { chave: "falhou", status: "expired", rotulo: "falharam" },
];

function EnviosCard({ dados }: { dados: Painel }) {
  const porProvedor = new Map<string, Record<string, number>>();
  for (const e of dados.envios) porProvedor.set(e.provedor, { ...(porProvedor.get(e.provedor) ?? {}), [e.status]: e.n });
  return (
    <CartaoDoPainel titulo="Compras enviadas pelo servidor">
      {porProvedor.size ? (
        <ul aria-label="Compras enviadas por plataforma" className="divide-y divide-line text-sm">
          {[...porProvedor.entries()].map(([p, n]) => (
            <li key={p} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="font-medium">{NOME_ENVIO[p] ?? p}</span>
              {/* A situação de cada fila em pílula com texto: enviadas, na fila, falharam. A que está em zero fica neutra. */}
              <span className="flex flex-wrap gap-1.5">
                {SITUACAO_DO_ENVIO.map((sit) => {
                  const total = n[sit.chave] ?? 0;
                  return (
                    <Pill key={sit.chave} status={total ? sit.status : "draft"}>
                      {sit.rotulo} <span className="tnum">{groupNumber(total)}</span>
                    </Pill>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhuma compra enviada no período. Precisa de pixel e chave da mesma plataforma.</Empty>
      )}
      <p className="border-t border-line px-5 py-2 text-[11px] text-muted">
        Falha de envio nunca afeta o pagamento: a compra fica na fila e o sistema tenta de novo, com espera crescente, até
        cinco vezes.
      </p>
    </CartaoDoPainel>
  );
}

const PERIODOS = [7, 30, 90] as const;
type Periodo = `${(typeof PERIODOS)[number]}`;

function CampanhasCard({ dados, dias, setDias }: { dados: Painel; dias: number; setDias: (d: number) => void }) {
  return (
    <CartaoDoPainel titulo="Vendas por campanha (UTM)">
      {/* O período fica na linha do título no computador (como no Figma); abaixo disso desce para a própria linha, senão o título quebraria ou encostaria nas fichas. */}
      <div className="flex justify-end px-5 pb-3 lg:-mt-[42px] lg:pb-2">
        <Filtros<Periodo>
          rotulo="Período"
          exclusivo
          opcoes={PERIODOS.map((d) => ({
            valor: `${d}` as Periodo,
            rotulo: (
              <>
                <span className="tnum">{d}</span> dias
              </>
            ),
          }))}
          ativa={`${dias}` as Periodo}
          aoMudar={(v) => setDias(Number(v))}
        />
      </div>
      {dados.campanhas.length ? (
        <TabelaOuCartoes
          aria="Vendas por campanha"
          itens={dados.campanhas}
          chave={(c) => `${c.fonte}|${c.meio}|${c.campanha}`}
          colunas={[
            {
              titulo: "Fonte / meio",
              celula: (c) => (
                <>
                  {c.fonte} <span className="text-muted">/ {c.meio}</span>
                </>
              ),
            },
            { titulo: "Campanha", celula: (c) => c.campanha },
            { titulo: "Pedidos", celula: (c) => <span className="tnum">{groupNumber(c.pedidos)}</span>, direita: true },
            { titulo: "Vendas", celula: (c) => <span className="tnum">{groupNumber(c.vendas)}</span>, direita: true },
            {
              titulo: "Receita",
              celula: (c) => <span className="tnum whitespace-nowrap text-green-deep">{formatBRL(c.receitaCents)}</span>,
              direita: true,
            },
          ]}
          cartao={(c) => (
            <div className="grid grid-cols-1 gap-1 text-sm">
              <p className="min-w-0 break-words font-medium">{c.campanha}</p>
              <p className="text-xs text-muted">
                {c.fonte} / {c.meio}
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  Pedidos <span className="tnum">{groupNumber(c.pedidos)}</span>
                </span>
                <span>
                  Vendas <span className="tnum">{groupNumber(c.vendas)}</span>
                </span>
                <span className="tnum font-medium text-green-deep">{formatBRL(c.receitaCents)}</span>
              </p>
            </div>
          )}
        />
      ) : (
        <Empty>Nenhuma venda com UTM no período. Use utm_source, utm_medium e utm_campaign nos links dos anúncios.</Empty>
      )}
      <p className="border-t border-line px-5 py-2 text-[11px] text-muted">
        Receita é venda paga. Os números vêm do link do anúncio (UTM, gclid, fbclid, ttclid) e são estatística: não
        decidem comissão nem dinheiro.
      </p>
    </CartaoDoPainel>
  );
}
