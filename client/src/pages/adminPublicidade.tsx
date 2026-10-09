import { useSearch } from "wouter";
import { PanelShell } from "@/components/AppShell";
import { Abas } from "@/components/painel";
import { RifasPatrocinadas } from "@/pages/adminPatrocinio";
import { BannerNaVitrine } from "@/pages/adminBannerPago";

/**
 * Publicidade da plataforma (menu Marketing): a propaganda dentro do próprio
 * site, numa tela com abas — as rifas patrocinadas por clique e o banner pago
 * no topo da vitrine. Os dois pagam com o mesmo saldo. A organização vê os
 * anúncios e pedidos dela; a plataforma, a fila, a configuração e os saldos.
 * Os endereços de antes (`/admin/patrocinio`, `/admin/banner-pago`) abrem a
 * aba certa.
 */
export function AdminPublicidade() {
  // Um link de dentro da tela (`?aba=…`) remonta as abas na aba pedida.
  const aba = new URLSearchParams(useSearch()).get("aba") ?? "";
  return (
    <PanelShell title="Publicidade da plataforma">
      <Abas
        key={aba}
        rotulo="Tipos de publicidade"
        abas={[
          { id: "patrocinadas", titulo: "Rifas patrocinadas", conteudo: <RifasPatrocinadas /> },
          { id: "banner", titulo: "Banner na vitrine", conteudo: <BannerNaVitrine /> },
        ]}
      />
    </PanelShell>
  );
}
