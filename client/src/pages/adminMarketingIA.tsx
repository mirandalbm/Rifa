import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChartLine, PenLine } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Card, Empty, Pill } from "@/components/bits";
import { ArtesParaDivulgar } from "@/components/ArtesParaDivulgar";
import { ReelsDaRifa } from "@/components/ReelsDaRifa";

interface Campanha {
  campaign: { id: string; title: string; prizeTitle: string; status: string; travadaEm?: string | null; demonstracao?: boolean };
}

/**
 * Marketing AI (menu Marketing): as ferramentas que criam o material de
 * divulgação de uma rifa num lugar só. "Criativos" junta o que já existia na
 * aba Publicação de cada rifa — artes prontas nos três formatos, o editor de
 * imagem (com as frases sugeridas pelo assistente) e o vídeo gerado com as
 * fotos. As mesmas rotas, o mesmo recorte e as mesmas regras de lá; esta tela
 * só escolhe a rifa. O plano de divulgação, os textos de anúncio e a leitura
 * dos resultados vêm em seguida, pelo assistente.
 */
export function AdminMarketingIA() {
  const { data: campanhas } = useQuery<Campanha[]>({ queryKey: ["/api/admin/campaigns"] });
  // As artes só existem para a rifa no ar, de verdade e não travada (a régua de `artesDisponiveis()`).
  const rifas = (campanhas ?? []).filter((c) => c.campaign.status === "published" && !c.campaign.travadaEm && !c.campaign.demonstracao);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const rifa = rifas.find((r) => r.campaign.id === escolhida) ?? rifas[0] ?? null;

  return (
    <PanelShell title="Marketing AI">
      <div className="space-y-3">
        <Card title="Criativos da rifa">
          <div className="space-y-3 px-4 py-3">
            <p className="text-sm text-ink-2">
              Artes prontas com os dados da rifa, o editor de imagem com frases sugeridas pelo assistente e o vídeo em pé gerado com as fotos.
            </p>
            {!campanhas ? (
              <p className="text-sm text-muted">Carregando…</p>
            ) : !rifas.length ? (
              <Empty>Nenhuma rifa no ar. Os criativos aparecem quando a rifa é publicada.</Empty>
            ) : (
              <label className="block max-w-md">
                <span className="label-xs">Rifa</span>
                <select className="campo mt-1" value={rifa?.campaign.id ?? ""} onChange={(e) => setEscolhida(e.target.value)}>
                  {rifas.map((r) => (
                    <option key={r.campaign.id} value={r.campaign.id}>
                      {r.campaign.title || r.campaign.prizeTitle}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </Card>
        {rifa ? (
          <div key={rifa.campaign.id} className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="min-w-0">
              <ArtesParaDivulgar base={`/api/admin/campaigns/${rifa.campaign.id}/artes`} />
            </div>
            <div className="min-w-0">
              <ReelsDaRifa campaignId={rifa.campaign.id} />
            </div>
          </div>
        ) : null}

        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Próximas ferramentas do assistente">
          <EmBreve icone={<CalendarRange size={18} />} titulo="Plano de divulgação">
            O assistente monta o calendário de posts e stories até o sorteio, com os textos prontos e as artes de cada dia.
          </EmBreve>
          <EmBreve icone={<PenLine size={18} />} titulo="Textos de anúncio">
            Títulos e descrições para o Google e o Meta, no limite de caracteres de cada rede, conferidos pela régua da legenda.
          </EmBreve>
          <EmBreve icone={<ChartLine size={18} />} titulo="Leitura dos resultados">
            O assistente lê as vendas por campanha e o gasto e diz onde vale investir mais e o que pausar.
          </EmBreve>
        </ul>
      </div>
    </PanelShell>
  );
}

function EmBreve({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="cartao space-y-1 rounded-lg border border-line bg-white p-3">
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-green-deep" aria-hidden>
          {icone}
        </span>
        {titulo}
        <Pill status="pending">Em breve</Pill>
      </span>
      <p className="text-xs text-muted">{children}</p>
    </li>
  );
}
