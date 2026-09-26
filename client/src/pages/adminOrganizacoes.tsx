import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PRAZO_ESTORNO_MIN, PRAZO_ESTORNO_MAX } from "@shared/chamados";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { MIN_SENHA, senhaInvalida } from "@shared/senha";
import {
  LIBERACAO_COMISSAO,
  NOME_LIBERACAO,
  carteiraAsaasValida,
  type LiberacaoComissao,
} from "@shared/plataforma";

interface Organizacao {
  id: string;
  slug: string;
  name: string;
  cnpj: string | null;
  contato: string | null;
  cidade: string | null;
  observacao: string | null;
  billingMode: string;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  asaasWalletId: string | null;
  liberacaoComissao: LiberacaoComissao;
  prazoEstornoDias: number;
  campanhas: number;
  pessoas: number;
}

type Situacao = "ativas" | "arquivadas";

const VAZIA = { name: "", cnpj: "", contato: "", cidade: "", observacao: "" };
const ACESSO_VAZIO = { name: "", email: "", password: "" };

const COBRANCA: Record<string, string> = {
  gratis: "grátis",
  comissao: "comissão por venda",
  mensalidade: "mensalidade",
};

/**
 * Organizações — a carteira de clientes da plataforma.
 *
 * Só o administrador geral chega aqui. Cada organização é um promotor de
 * rifa: é o nome dela que sai no bilhete como administradora, e é dela que a
 * autorização SPA/MF é exigida — a Lei 5.768/71 autoriza o promotor, não a
 * plataforma.
 *
 * Arquivar tira da lista, não do banco: venda, cota e cobrança da
 * organização continuam nos relatórios, e ela aparece no filtro
 * "arquivadas".
 */
export function AdminOrganizacoes() {
  const qc = useQueryClient();
  const [situacao, setSituacao] = useState<Situacao>("ativas");
  const { data: orgs, isLoading } = useQuery<Organizacao[]>({
    queryKey: ["/api/admin/organizacoes", { situacao }],
  });

  const [nova, setNova] = useState(VAZIA);
  const [aberta, setAberta] = useState<string | null>(null);
  const [acessoPara, setAcessoPara] = useState<Organizacao | null>(null);
  const [acesso, setAcesso] = useState(ACESSO_VAZIO);
  const [arquivar, setArquivar] = useState<Organizacao | null>(null);
  const [confirma, setConfirma] = useState({ password: "", code: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });
  };
  const falhou = (err: Error) => {
    setAviso(null);
    setErro(err.message);
  };

  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/organizacoes", nova),
    onSuccess: () => {
      setNova(VAZIA);
      setErro(null);
      setAviso("Organização criada. Agora crie o acesso do organizador em \"acesso\".");
      recarregar();
    },
    onError: falhou,
  });

  const alternar = useMutation({
    mutationFn: (o: Organizacao) =>
      apiRequest("PATCH", `/api/admin/organizacoes/${o.id}`, { active: !o.active }),
    onSuccess: () => {
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });

  const criarAcesso = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/organizacoes/${acessoPara!.id}/acessos`, acesso),
    onSuccess: () => {
      setAviso(`Acesso criado para ${acesso.email}. A entrada é pela mesma página: /entrar.`);
      setAcesso(ACESSO_VAZIO);
      setAcessoPara(null);
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });

  const confirmarArquivo = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/organizacoes/${arquivar!.id}/arquivar`, confirma),
    onSuccess: () => {
      setAviso(
        `${arquivar!.name} foi arquivada. Nada foi apagado: o histórico segue nos relatórios e no filtro "arquivadas".`,
      );
      setArquivar(null);
      setConfirma({ password: "", code: "" });
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });

  const restaurar = useMutation({
    mutationFn: (o: Organizacao) =>
      apiRequest("POST", `/api/admin/organizacoes/${o.id}/restaurar`),
    onSuccess: (_r, o) => {
      setAviso(`${o.name} voltou para a lista, suspensa. Reative quando quiser.`);
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });

  const problemaAcesso = acesso.password ? senhaInvalida(acesso.password, "organizer") : null;

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

      <div className="mb-3 flex gap-1" role="tablist" aria-label="Situação das organizações">
        {(["ativas", "arquivadas"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={situacao === s}
            onClick={() => {
              setSituacao(s);
              setAberta(null);
            }}
            className={
              situacao === s
                ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green"
                : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <Card title={situacao === "ativas" ? "Promotores" : "Arquivadas"}>
          {isLoading ? (
            <Empty>Carregando…</Empty>
          ) : orgs?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
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
                    <LinhaOrganizacao
                      key={o.id}
                      o={o}
                      aberta={aberta === o.id}
                      alternarAberta={() => setAberta(aberta === o.id ? null : o.id)}
                      acoes={
                        o.archivedAt ? (
                          <Button variant="ghost" onClick={() => restaurar.mutate(o)}>
                            restaurar
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setAcessoPara(o);
                                setArquivar(null);
                                setAviso(null);
                              }}
                            >
                              acesso
                            </Button>
                            <Button variant="ghost" onClick={() => alternar.mutate(o)}>
                              {o.active ? "suspender" : "reativar"}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setArquivar(o);
                                setAcessoPara(null);
                                setConfirma({ password: "", code: "" });
                                setAviso(null);
                              }}
                            >
                              arquivar
                            </Button>
                          </>
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {situacao === "ativas"
                ? "Nenhuma organização ainda."
                : "Nenhuma organização arquivada."}
            </Empty>
          )}

          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Suspender fecha a porta do organizador; as rifas continuam no ar.
            Arquivar tira da lista e fecha a porta de todos da organização, mas
            não apaga nada: venda, cota, comissão e cobrança continuam nos
            relatórios.
          </p>
        </Card>

        <div className="space-y-3">
          {arquivar ? (
            <Card title={`Arquivar ${arquivar.name}`}>
              <form
                className="space-y-3 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmarArquivo.mutate();
                }}
              >
                <p className="text-xs text-muted">
                  Confirme com a sua senha e o código do aplicativo autenticador.
                  Rifa no ar ou esperando sorteio impede o arquivamento.
                </p>
                <div>
                  <label htmlFor="arq-senha" className="label-xs">
                    Sua senha
                  </label>
                  <input
                    id="arq-senha"
                    type="password"
                    autoComplete="current-password"
                    value={confirma.password}
                    onChange={(e) => setConfirma({ ...confirma, password: e.target.value })}
                    className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="arq-codigo" className="label-xs">
                    Código do autenticador
                  </label>
                  <input
                    id="arq-codigo"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={confirma.code}
                    onChange={(e) =>
                      setConfirma({ ...confirma, code: e.target.value.replace(/\D/g, "") })
                    }
                    className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={
                      !confirma.password || confirma.code.length !== 6 ||
                      confirmarArquivo.isPending
                    }
                  >
                    Arquivar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setArquivar(null)}>
                    cancelar
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {acessoPara ? (
            <Card title={`Acesso de organizador · ${acessoPara.name}`}>
              <form
                className="space-y-3 p-4"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  criarAcesso.mutate();
                }}
              >
                <p className="text-xs text-muted">
                  Quem entrar com este acesso vê as mesmas telas do painel, com
                  as rifas, os pedidos e o caixa desta organização — e de mais
                  nenhuma. A entrada é a mesma de todos: /entrar.
                </p>
                {(
                  [
                    ["name", "Nome", "text", "off"],
                    ["email", "E-mail", "email", "off"],
                    ["password", `Senha (mínimo ${MIN_SENHA} caracteres)`, "password", "new-password"],
                  ] as const
                ).map(([campo, rotulo, tipo, auto]) => (
                  <div key={campo}>
                    <label htmlFor={`ac-${campo}`} className="label-xs">
                      {rotulo}
                    </label>
                    <input
                      id={`ac-${campo}`}
                      type={tipo}
                      autoComplete={auto}
                      value={acesso[campo]}
                      onChange={(e) => setAcesso({ ...acesso, [campo]: e.target.value })}
                      className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                {problemaAcesso ? <p className="text-xs text-red">{problemaAcesso}</p> : null}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={
                      !acesso.name || !acesso.email || !acesso.password ||
                      Boolean(problemaAcesso) || criarAcesso.isPending
                    }
                  >
                    Criar acesso
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAcessoPara(null)}>
                    cancelar
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {situacao === "ativas" ? (
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
                      autoComplete="off"
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
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}

function LinhaOrganizacao({
  o,
  aberta,
  alternarAberta,
  acoes,
}: {
  o: Organizacao;
  aberta: boolean;
  alternarAberta: () => void;
  acoes: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-line align-top last:border-0">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={alternarAberta}
            aria-expanded={aberta}
            className="text-left font-medium underline decoration-line-2 underline-offset-2"
          >
            {o.name}
          </button>
          <span className="block font-mono text-[11px] text-muted">
            {o.slug}
            {o.cidade ? ` · ${o.cidade}` : ""}
          </span>
        </td>
        <td className="tnum px-4 py-3">{o.campanhas}</td>
        <td className="tnum px-4 py-3">
          <Link
            href={`/admin/usuarios?organizacao=${o.id}`}
            className="text-green-deep underline"
          >
            {o.pessoas}
          </Link>
        </td>
        <td className="px-4 py-3">
          {o.archivedAt ? (
            <Pill status="blocked">arquivada</Pill>
          ) : (
            <Pill status={o.active ? "active" : "blocked"}>{o.active ? "ativa" : "suspensa"}</Pill>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-wrap justify-end gap-2">{acoes}</div>
        </td>
      </tr>
      {aberta ? (
        <tr className="border-b border-line bg-mist">
          <td colSpan={5} className="px-4 py-3">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Dado rotulo="CNPJ" valor={o.cnpj} tnum />
              <Dado rotulo="Contato" valor={o.contato} />
              <Dado rotulo="Cidade/UF" valor={o.cidade} />
              <Dado rotulo="Cobrança" valor={COBRANCA[o.billingMode] ?? o.billingMode} />
              <Dado rotulo="Criada em" valor={new Date(o.createdAt).toLocaleDateString("pt-BR")} tnum />
              {o.archivedAt ? (
                <Dado
                  rotulo="Arquivada em"
                  valor={new Date(o.archivedAt).toLocaleDateString("pt-BR")}
                  tnum
                />
              ) : null}
              <div className="sm:col-span-3">
                <Dado rotulo="Texto do bilhete" valor={o.observacao} />
              </div>
            </dl>
            <Link
              href={`/admin/usuarios?organizacao=${o.id}`}
              className="mt-3 inline-block text-sm text-green-deep underline"
            >
              ver as pessoas desta organização
            </Link>
            {o.archivedAt ? null : <PagamentoDaOrganizacao o={o} />}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Dado({ rotulo, valor, tnum = false }: { rotulo: string; valor: string | null; tnum?: boolean }) {
  return (
    <div>
      <dt className="label-xs">{rotulo}</dt>
      <dd className={tnum ? "tnum" : ""}>{valor || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

/**
 * Para onde vai o dinheiro da organização e quando a comissão dela libera.
 * A carteira só a plataforma cadastra (a rota confere); a liberação o próprio
 * organizador também escolhe, em Configurações.
 */
function PagamentoDaOrganizacao({ o }: { o: Organizacao }) {
  const qc = useQueryClient();
  const [carteira, setCarteira] = useState(o.asaasWalletId ?? "");
  const [liberacao, setLiberacao] = useState<LiberacaoComissao>(o.liberacaoComissao);
  const [prazo, setPrazo] = useState(String(o.prazoEstornoDias ?? 7));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const carteiraOk = carteira.trim() === "" || carteiraAsaasValida(carteira);
  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/organizacoes/${o.id}`, {
        asaasWalletId: carteira.trim() || null,
        liberacaoComissao: liberacao,
        prazoEstornoDias: Number(prazo),
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo. Vale para as próximas vendas." });
      qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`carteira-${o.id}`} className="label-xs">
          Carteira Asaas (walletId)
        </label>
        <input
          id={`carteira-${o.id}`}
          value={carteira}
          onChange={(e) => {
            setMsg(null);
            setCarteira(e.target.value);
          }}
          placeholder="00000000-0000-0000-0000-000000000000"
          autoComplete="off"
          className="tnum mt-1 w-full rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
        />
        <p className={`mt-1 text-[11px] ${carteiraOk ? "text-muted" : "text-red"}`}>
          {carteiraOk
            ? "Com a carteira, a parte do promotor cai direto na conta dele quando o Asaas estiver em uso. Vazio: tudo entra na conta da plataforma."
            : "Formato inválido: o walletId tem 36 caracteres, com hífens."}
        </p>
      </div>
      <div>
        <label htmlFor={`liberacao-${o.id}`} className="label-xs">
          Comissão dos divulgadores
        </label>
        <select
          id={`liberacao-${o.id}`}
          value={liberacao}
          onChange={(e) => {
            setMsg(null);
            setLiberacao(e.target.value as LiberacaoComissao);
          }}
          className="mt-1 block w-full rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
        >
          {LIBERACAO_COMISSAO.map((m) => (
            <option key={m} value={m}>
              {NOME_LIBERACAO[m]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`prazo-${o.id}`} className="label-xs">
          Prazo de reembolso (dias após aprovar)
        </label>
        <input
          id={`prazo-${o.id}`}
          type="number"
          min={PRAZO_ESTORNO_MIN}
          max={PRAZO_ESTORNO_MAX}
          value={prazo}
          onChange={(e) => {
            setMsg(null);
            setPrazo(e.target.value);
          }}
          className="tnum mt-1 w-24 rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button onClick={() => salvar.mutate()} disabled={!carteiraOk || salvar.isPending}>
          Salvar pagamento
        </Button>
        {msg ? (
          <span className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>{msg.texto}</span>
        ) : null}
      </div>
    </div>
  );
}
