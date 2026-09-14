import type { ReactNode } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { roleSatisfies, type Role } from "@shared/access";

import Vitrine from "@/pages/Vitrine";
import Rifa from "@/pages/Rifa";
import Pedido from "@/pages/Pedido";
import MinhasCotas from "@/pages/MinhasCotas";
import Login from "@/pages/Login";
import CadastroAfiliado from "@/pages/CadastroAfiliado";
import Bilhete from "@/pages/Bilhete";
import {
  CambistaVenda,
  CambistaVendas,
  CambistaAcerto,
} from "@/pages/cambista";
import {
  AfiliadoPainel,
  AfiliadoLinks,
  AfiliadoComissoes,
  AfiliadoSaques,
} from "@/pages/afiliado";
import { AdminCambistas } from "@/pages/adminCambistas";
import { AdminAntifraude } from "@/pages/adminAntifraude";
import { AdminExportacoes } from "@/pages/adminExportacoes";
import {
  AdminPainel,
  AdminCampanhas,
  AdminPedidos,
  AdminAfiliados,
  AdminFinanceiro,
  AdminSorteios,
  AdminConfiguracoes,
} from "@/pages/admin";

/**
 * Um app para as três superfícies. A rota existe para todo mundo; quem
 * decide é o papel da sessão. Isto aqui é conveniência de navegação —
 * a barreira real está no requireRole() do servidor.
 */
function Guarded({ requires, children }: { requires: Role; children: ReactNode }) {
  const { data: session, isLoading } = useSession();

  if (isLoading) {
    return <p className="py-24 text-center text-sm text-muted">Carregando…</p>;
  }
  if (!session || !roleSatisfies(session.role, requires)) {
    return <Redirect to="/entrar" />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
      <h1 className="font-display text-2xl font-extrabold">Página não encontrada</h1>
      <a href="/" className="text-sm text-green-deep underline">
        voltar para as rifas
      </a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          {/* Público */}
          <Route path="/" component={Vitrine} />
          <Route path="/r/:slug" component={Rifa} />
          <Route path="/pedido/:code" component={Pedido} />
          <Route path="/minhas-cotas" component={MinhasCotas} />
          <Route path="/entrar" component={Login} />
          <Route path="/seja-afiliado" component={CadastroAfiliado} />
          <Route path="/bilhete/:code" component={Bilhete} />

          {/* Afiliado */}
          <Route path="/afiliado">
            <Guarded requires="affiliate">
              <AfiliadoPainel />
            </Guarded>
          </Route>
          <Route path="/afiliado/links">
            <Guarded requires="affiliate">
              <AfiliadoLinks />
            </Guarded>
          </Route>
          <Route path="/afiliado/comissoes">
            <Guarded requires="affiliate">
              <AfiliadoComissoes />
            </Guarded>
          </Route>
          <Route path="/afiliado/saques">
            <Guarded requires="affiliate">
              <AfiliadoSaques />
            </Guarded>
          </Route>

          {/* Cambista — venda física */}
          <Route path="/cambista">
            <Guarded requires="cambista">
              <CambistaVenda />
            </Guarded>
          </Route>
          <Route path="/cambista/vendas">
            <Guarded requires="cambista">
              <CambistaVendas />
            </Guarded>
          </Route>
          <Route path="/cambista/acerto">
            <Guarded requires="cambista">
              <CambistaAcerto />
            </Guarded>
          </Route>

          {/* Administrador geral */}
          <Route path="/admin">
            <Guarded requires="admin">
              <AdminPainel />
            </Guarded>
          </Route>
          <Route path="/admin/campanhas">
            <Guarded requires="admin">
              <AdminCampanhas />
            </Guarded>
          </Route>
          <Route path="/admin/pedidos">
            <Guarded requires="admin">
              <AdminPedidos />
            </Guarded>
          </Route>
          <Route path="/admin/afiliados">
            <Guarded requires="admin">
              <AdminAfiliados />
            </Guarded>
          </Route>
          <Route path="/admin/cambistas">
            <Guarded requires="admin">
              <AdminCambistas />
            </Guarded>
          </Route>
          <Route path="/admin/financeiro">
            <Guarded requires="admin">
              <AdminFinanceiro />
            </Guarded>
          </Route>
          <Route path="/admin/sorteios">
            <Guarded requires="admin">
              <AdminSorteios />
            </Guarded>
          </Route>
          <Route path="/admin/antifraude">
            <Guarded requires="admin">
              <AdminAntifraude />
            </Guarded>
          </Route>
          <Route path="/admin/exportacoes">
            <Guarded requires="admin">
              <AdminExportacoes />
            </Guarded>
          </Route>
          <Route path="/admin/configuracoes">
            <Guarded requires="admin">
              <AdminConfiguracoes />
            </Guarded>
          </Route>

          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
