import { BadgeDollarSign, ChartNoAxesCombined, ClipboardList, MousePointerClick } from "lucide-react";
import type { ReactNode } from "react";
import { PanelShell } from "@/components/AppShell";
import { Card, Pill } from "@/components/bits";
import { useSession } from "@/lib/session";

/**
 * Tráfego pago (menu Marketing): a plataforma anuncia a rifa no Google, no
 * Meta (Facebook e Instagram) e no TikTok pelas contas dela, e cobra o
 * investimento mais uma taxa de gestão sobre o gasto, do saldo da
 * organização. O plano está em `docs/PLANO-TRAFEGO-PAGO.md`. Enquanto a
 * fase 1 não entra, a tela explica como vai funcionar — nunca um botão que
 * não faz nada.
 */
export function AdminTrafego() {
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  return (
    <PanelShell title="Tráfego pago">
      <div className="space-y-3">
        <Card
          title="Anúncios da sua rifa no Google, no Instagram e no TikTok"
          right={
            <span className="shrink-0 whitespace-nowrap">
              <Pill status="pending">Em breve</Pill>
            </span>
          }
        >
          <p className="px-4 py-3 text-sm text-ink-2">
            {plataforma
              ? "A plataforma monta e acompanha as campanhas das organizações nas contas de anúncios dela, debita do saldo de cada uma o que gastou mais a taxa de gestão e vê aqui a margem de cada campanha."
              : "Você escolhe a rifa e quanto quer investir; a plataforma monta a campanha, acompanha todo dia e mostra quanto gastou e quantas vendas o anúncio trouxe. Você paga o que for gasto mais uma taxa de gestão, do mesmo saldo da publicidade."}
          </p>
        </Card>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Passo icone={<ClipboardList size={18} />} titulo="Pedido">
            Rifa publicada, valor total e por dia, onde anunciar e para que região. O valor fica reservado no saldo.
          </Passo>
          <Passo icone={<MousePointerClick size={18} />} titulo="Campanha">
            A plataforma monta o anúncio com as artes e o vídeo da própria rifa e confere as regras de cada rede.
          </Passo>
          <Passo icone={<BadgeDollarSign size={18} />} titulo="Cobrança">
            Do saldo sai o que foi gasto no dia mais a taxa — nunca além do reservado. Pausou, o que sobrou volta ao saldo.
          </Passo>
          <Passo icone={<ChartNoAxesCombined size={18} />} titulo="Resultado">
            Gasto, cliques, vendas e custo por venda. A venda atribuída ao anúncio é estimativa e a tela diz isso.
          </Passo>
        </ul>
      </div>
    </PanelShell>
  );
}

function Passo({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="cartao space-y-1 rounded-lg border border-line bg-white p-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-green-deep" aria-hidden>
          {icone}
        </span>
        {titulo}
      </span>
      <p className="text-xs text-muted">{children}</p>
    </li>
  );
}
