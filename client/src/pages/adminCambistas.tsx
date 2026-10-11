import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Money, Pill, Empty } from "@/components/bits";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";
import { senhaInvalida } from "@shared/senha";

interface SaldoAberto {
  sellerId: string;
  code: string;
  name: string;
  orderCount: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
}

interface AcertoFechado {
  settlement: {
    id: string;
    netCents: number;
    grossCents: number;
    commissionCents: number;
    orderCount: number;
    status: string;
    createdAt: string;
  };
  sellerCode: string;
  sellerName: string;
}

const FORM_VAZIO = { name: "", email: "", password: "", code: "", phone: "", commissionPct: "" };

/**
 * Cambistas e acertos.
 *
 * O cambista está com o dinheiro na mão: esta tela é a cobrança. Fechar o
 * acerto carimba as vendas incluídas, para nenhuma entrar em dois acertos.
 * Cada acerto diz o bruto (o que o cambista recolheu), a comissão dele e o
 * que ele entrega à casa — sempre em `tnum`.
 */
export function AdminCambistas() {
  const qc = useQueryClient();
  const { data } = useQuery<{ emAberto: SaldoAberto[]; historico: AcertoFechado[] }>({
    queryKey: ["/api/admin/settlements"],
  });

  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sellers", form),
    onSuccess: () => {
      setForm(FORM_VAZIO);
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });

  const fechar = useMutation({
    mutationFn: (sellerId: string) =>
      apiRequest("POST", `/api/admin/settlements/${sellerId}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
    onError: (err: Error) => setErro(err.message),
  });

  const receber = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/settlements/${id}/paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
  });

  const totalAberto = data?.emAberto.reduce((soma, s) => soma + s.netCents, 0) ?? 0;
  // A mesma régua do servidor (`senhaInvalida`, papel cambista), mostrada embaixo do campo antes de enviar.
  const problemaSenha = form.password ? senhaInvalida(form.password, "cambista") : null;

  const campos = [
    ["name", "Nome", "text"],
    ["email", "E-mail", "email"],
    ["phone", "WhatsApp", "tel"],
    ["password", "Senha", "password"],
    ["code", "Código", "text"],
    ["commissionPct", "Comissão % (opcional)", "text"],
  ] as const;

  return (
    <PanelShell title="Cambistas">
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}

      <PedidosDeColaborador onCriar={(p) => setForm({ ...form, name: p.nome, phone: p.telefone })} />

      {/* O DOM segue a ordem do celular (a receber, novo cambista, acertos); o computador põe o cadastro à direita. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <CartaoDoPainel
          titulo="A receber dos cambistas"
          acao={<span className="tnum text-sm font-medium text-green-deep">{formatBRL(totalAberto)}</span>}
        >
          {data?.emAberto.length === 0 ? (
            <Empty>Nenhuma venda física em aberto.</Empty>
          ) : (
            <ul aria-label="Cambistas com venda em aberto" className="divide-y divide-line">
              {data?.emAberto.map((s) => (
                <li key={s.sellerId} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {s.name} · <span className="tnum text-muted">{s.code}</span>
                    </span>
                    <Money cents={s.netCents} className="shrink-0 font-medium text-green-deep" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="tnum text-xs text-muted">
                      {s.orderCount} venda(s) · bruto {formatBRL(s.grossCents)} · comissão{" "}
                      {formatBRL(s.commissionCents)} · entrega {formatBRL(s.netCents)}
                    </span>
                    <Button variant="contorno" onClick={() => fechar.mutate(s.sellerId)}>
                      fechar acerto
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CartaoDoPainel>

        <CartaoDoPainel titulo="Novo cambista">
          <form
            className="space-y-3 px-5 pb-5"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              criar.mutate();
            }}
          >
            {campos.map(([campo, rotulo, tipo]) => (
              <Campo key={campo} rotulo={rotulo} erro={campo === "password" ? problemaSenha : null}>
                <input
                  id={`cambista-${campo}`}
                  type={tipo}
                  autoComplete={campo === "password" ? "new-password" : "off"}
                  value={form[campo]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [campo]: campo === "code" ? e.target.value.toUpperCase() : e.target.value,
                    })
                  }
                  className={campo === "commissionPct" || campo === "phone" || campo === "code" ? "tnum" : ""}
                />
              </Campo>
            ))}
            <Button type="submit" className="w-full" disabled={criar.isPending || Boolean(problemaSenha)}>
              Cadastrar cambista
            </Button>
            <p className="text-xs text-muted">
              O cambista entra no mesmo app, com acesso só à tela de venda, às vendas dele e ao
              próprio acerto.
            </p>
          </form>
        </CartaoDoPainel>
      </div>

      <div className="mt-4 md:mt-6">
        <CartaoDoPainel
          titulo="Acertos fechados"
          subtitulo="Fechar carimba os pedidos (settlement_id) com a linha do cambista travada; dar baixa é condicional."
        >
          {data?.historico.length === 0 ? (
            <Empty>Nenhum acerto fechado.</Empty>
          ) : (
            <TabelaOuCartoes
              itens={data?.historico ?? []}
              chave={(h) => h.settlement.id}
              aria="Acertos fechados"
              colunas={[
                { titulo: "Data", celula: (h) => <Data iso={h.settlement.createdAt} /> },
                {
                  titulo: "Cambista",
                  celula: (h) => (
                    <>
                      {h.sellerName} · <span className="tnum text-muted">{h.sellerCode}</span>
                    </>
                  ),
                },
                { titulo: "Vendas", celula: (h) => <span className="tnum">{h.settlement.orderCount}</span>, direita: true },
                { titulo: "Bruto", celula: (h) => <Money cents={h.settlement.grossCents} />, direita: true },
                { titulo: "Comissão", celula: (h) => <Money cents={h.settlement.commissionCents} />, direita: true },
                { titulo: "Entrega", celula: (h) => <Money cents={h.settlement.netCents} className="font-medium" />, direita: true },
                { titulo: "Situação", celula: (h) => <SituacaoDoAcerto status={h.settlement.status} /> },
                {
                  titulo: "",
                  celula: (h) =>
                    h.settlement.status !== "pago" ? (
                      <Button variant="contorno" onClick={() => receber.mutate(h.settlement.id)}>
                        recebi
                      </Button>
                    ) : null,
                  direita: true,
                },
              ]}
              cartao={(h) => (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">
                      {h.sellerName} · <span className="tnum font-normal text-muted">{h.sellerCode}</span>
                    </span>
                    <SituacaoDoAcerto status={h.settlement.status} />
                  </div>
                  <p className="tnum text-xs text-muted">
                    <Data iso={h.settlement.createdAt} /> · {h.settlement.orderCount} venda(s)
                  </p>
                  <p className="tnum text-xs text-muted">
                    bruto {formatBRL(h.settlement.grossCents)} · comissão {formatBRL(h.settlement.commissionCents)}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      entrega <Money cents={h.settlement.netCents} className="font-medium" />
                    </span>
                    {h.settlement.status !== "pago" ? (
                      <Button variant="contorno" onClick={() => receber.mutate(h.settlement.id)}>
                        recebi
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            />
          )}
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}

function Data({ iso }: { iso: string }) {
  return <span className="tnum">{new Date(iso).toLocaleDateString("pt-BR")}</span>;
}

function SituacaoDoAcerto({ status }: { status: string }) {
  return <Pill status={status === "pago" ? "paid" : "pending"}>{status === "pago" ? "recebido" : "a receber"}</Pill>;
}

interface PedidoDeColaborador {
  id: string;
  status: "pendente" | "atendido" | "recusado";
  cidade: string;
  mensagem: string;
  createdAt: string;
  nome: string;
  telefone: string;
  organizacao: string;
}

/**
 * "Seja um colaborador": quem pediu, pelo perfil, para vender para a
 * organização. Atender preenche o cadastro de cambista abaixo com o nome e o
 * WhatsApp; a senha e o código continuam sendo criados aqui.
 */
function PedidosDeColaborador({ onCriar }: { onCriar: (p: PedidoDeColaborador) => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery<PedidoDeColaborador[]>({ queryKey: ["/api/admin/colaboradores/pedidos"] });
  const decidir = useMutation({
    mutationFn: (v: { id: string; status: "atendido" | "recusado" }) =>
      apiRequest("POST", `/api/admin/colaboradores/pedidos/${v.id}`, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/colaboradores/pedidos"] }),
  });
  const abertos = data.filter((p) => p.status === "pendente");
  if (abertos.length === 0) return null;
  return (
    <div className="mb-4 md:mb-6">
      <CartaoDoPainel titulo="Querem ser colaboradores" acao={<Pill status="pending">{`${abertos.length} pedido(s)`}</Pill>}>
        <ul className="divide-y divide-line">
          {abertos.map((p) => (
            <li key={p.id} className="space-y-2 px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{p.nome}</span> ·{" "}
                  <a href={`https://wa.me/55${p.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="tnum text-green-deep underline">
                    {p.telefone}
                  </a>{" "}
                  · <span className="text-muted">{p.cidade}</span>
                </span>
                <span className="tnum text-xs text-muted">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
              {p.mensagem ? <p className="text-ink-2">{p.mensagem}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    onCriar(p);
                    decidir.mutate({ id: p.id, status: "atendido" });
                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                  }}
                >
                  Cadastrar como cambista
                </Button>
                <Button variant="cinza" onClick={() => decidir.mutate({ id: p.id, status: "recusado" })}>
                  Recusar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CartaoDoPainel>
    </div>
  );
}
