import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Organizacao {
  id: string;
  slug: string;
  name: string;
  cnpj: string | null;
  contato: string | null;
  cidade: string | null;
  active: boolean;
  campanhas: number;
  pessoas: number;
}

const VAZIA = { name: "", cnpj: "", contato: "", cidade: "", observacao: "" };
const ACESSO_VAZIO = { name: "", email: "", password: "" };

/**
 * Organizações — a carteira de clientes da plataforma.
 *
 * Só o administrador geral chega aqui. Cada organização é um promotor de
 * rifa: é o nome dela que sai no bilhete como administradora, e é dela que a
 * autorização SPA/MF é exigida — a Lei 5.768/71 autoriza o promotor, não a
 * plataforma.
 */
export function AdminOrganizacoes() {
  const qc = useQueryClient();
  const { data: orgs } = useQuery<Organizacao[]>({
    queryKey: ["/api/admin/organizacoes"],
  });

  const [nova, setNova] = useState(VAZIA);
  const [acessoPara, setAcessoPara] = useState<string | null>(null);
  const [acesso, setAcesso] = useState(ACESSO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] });

  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/organizacoes", nova),
    onSuccess: () => {
      setNova(VAZIA);
      setErro(null);
      recarregar();
    },
    onError: (err: Error) => setErro(err.message),
  });

  const alternar = useMutation({
    mutationFn: (o: Organizacao) =>
      apiRequest("PATCH", `/api/admin/organizacoes/${o.id}`, { active: !o.active }),
    onSuccess: recarregar,
    onError: (err: Error) => setErro(err.message),
  });

  const criarAcesso = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/organizacoes/${acessoPara}/acessos`, acesso),
    onSuccess: () => {
      setAviso(`Acesso criado para ${acesso.email}.`);
      setAcesso(ACESSO_VAZIO);
      setAcessoPara(null);
      setErro(null);
      recarregar();
    },
    onError: (err: Error) => setErro(err.message),
  });

  return (
    <PanelShell title="Organizações">
      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}
      {aviso ? (
        <p className="mb-3 rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
          {aviso}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <Card title="Promotores no ar">
          {orgs?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2 font-medium text-muted">Organização</th>
                  <th className="px-4 py-2 font-medium text-muted">Rifas</th>
                  <th className="px-4 py-2 font-medium text-muted">Pessoas</th>
                  <th className="px-4 py-2 font-medium text-muted">Situação</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{o.name}</span>
                      <span className="block font-mono text-[11px] text-muted">
                        {o.slug}
                        {o.cidade ? ` · ${o.cidade}` : ""}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3">{o.campanhas}</td>
                    <td className="tnum px-4 py-3">{o.pessoas}</td>
                    <td className="px-4 py-3">
                      <Pill status={o.active ? "active" : "blocked"}>
                        {o.active ? "ativa" : "suspensa"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setAcessoPara(o.id);
                            setAviso(null);
                          }}
                        >
                          acesso
                        </Button>
                        <Button variant="ghost" onClick={() => alternar.mutate(o)}>
                          {o.active ? "suspender" : "reativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nenhuma organização ainda.</Empty>
          )}

          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Suspender não apaga nada: as rifas continuam no ar e o acesso do
            organizador para de entrar. Organização com rifa não pode ser
            removida — apagá-la levaria junto venda, cota e comissão.
          </p>
        </Card>

        <div className="space-y-3">
          <Card title="Nova organização">
            <div className="space-y-3 p-4">
              {(
                [
                  ["name", "Nome (sai no bilhete)"],
                  ["cnpj", "CNPJ"],
                  ["cidade", "Cidade/UF"],
                  ["contato", "Contato"],
                ] as const
              ).map(([campo, rotulo]) => (
                <div key={campo}>
                  <label htmlFor={`org-${campo}`} className="label-xs">
                    {rotulo}
                  </label>
                  <input
                    id={`org-${campo}`}
                    value={nova[campo]}
                    onChange={(e) => setNova({ ...nova, [campo]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <Button
                onClick={() => criar.mutate()}
                disabled={nova.name.trim().length < 2 || criar.isPending}
              >
                Criar organização
              </Button>
            </div>
          </Card>

          {acessoPara ? (
            <Card title="Acesso de organizador">
              <div className="space-y-3 p-4">
                <p className="text-xs text-muted">
                  Quem entrar com este acesso vê as mesmas telas do painel, com
                  as rifas, os pedidos e o caixa desta organização — e de mais
                  nenhuma.
                </p>
                {(
                  [
                    ["name", "Nome", "text"],
                    ["email", "E-mail", "email"],
                    ["password", "Senha", "password"],
                  ] as const
                ).map(([campo, rotulo, tipo]) => (
                  <div key={campo}>
                    <label htmlFor={`ac-${campo}`} className="label-xs">
                      {rotulo}
                    </label>
                    <input
                      id={`ac-${campo}`}
                      type={tipo}
                      value={acesso[campo]}
                      onChange={(e) => setAcesso({ ...acesso, [campo]: e.target.value })}
                      className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    onClick={() => criarAcesso.mutate()}
                    disabled={
                      !acesso.name || !acesso.email || acesso.password.length < 8
                    }
                  >
                    Criar acesso
                  </Button>
                  <Button variant="ghost" onClick={() => setAcessoPara(null)}>
                    cancelar
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}
