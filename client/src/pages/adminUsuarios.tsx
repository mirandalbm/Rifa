import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { minimoSenha, senhaInvalida } from "@shared/senha";

interface Usuario {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "organizer" | "affiliate" | "cambista";
  active: boolean;
  doisFatores: boolean;
  createdAt: string;
  organizationId: string | null;
  organizacao: string | null;
  organizacaoArquivada: boolean;
  codigo: string | null;
  tipo: string | null;
  cadastro: string | null;
  pix: string | null;
  comissaoPct: number | null;
}

interface Org {
  id: string;
  name: string;
  archivedAt: string | null;
}

const PAPEL: Record<Usuario["role"], string> = {
  admin: "administrador",
  organizer: "organizador",
  affiliate: "afiliado",
  cambista: "cambista",
};

/** Lê `?organizacao=` da barra: a tela de organizações manda para cá. */
function organizacaoDaUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("organizacao") ?? "";
  } catch {
    return "";
  }
}

/**
 * Usuários — todo mundo que entra no painel, com os dados de cada um.
 *
 * A mesma tela serve às duas pontas: o organizador vê as pessoas da
 * organização dele; o administrador geral vê todas e filtra por uma. Quem
 * recorta é o servidor, não este filtro.
 */
export function AdminUsuarios() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const plataforma = session?.role === "admin";

  const [organizacao, setOrganizacao] = useState(organizacaoDaUrl);
  const [papel, setPapel] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const filtros = {
    organizacao: organizacao || undefined,
    papel: papel || undefined,
    q: busca.trim() || undefined,
  };
  const { data: usuarios, isLoading } = useQuery<Usuario[]>({
    queryKey: ["/api/admin/usuarios", filtros],
  });
  const { data: orgs } = useQuery<Org[]>({
    queryKey: ["/api/admin/organizacoes", { situacao: "todas" }],
    enabled: plataforma,
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });

  const alternar = useMutation({
    mutationFn: (u: Usuario) =>
      apiRequest("PATCH", `/api/admin/usuarios/${u.id}`, { active: !u.active }),
    onSuccess: () => {
      setErro(null);
      recarregar();
    },
    onError: (err: Error) => setErro(err.message),
  });

  const redefinir = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/usuarios/${senhaDe!.id}/senha`, { password: senha }),
    onSuccess: () => {
      setAviso(`Senha de ${senhaDe!.email} redefinida. Peça para trocar no primeiro acesso.`);
      setSenhaDe(null);
      setSenha("");
      setErro(null);
    },
    onError: (err: Error) => setErro(err.message),
  });

  const problemaSenha = senhaDe && senha ? senhaInvalida(senha, senhaDe.role) : null;

  return (
    <PanelShell title="Usuários">
      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}
      {aviso ? (
        <p className="mb-3 rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
          {aviso}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        {plataforma ? (
          <div>
            <label htmlFor="f-org" className="label-xs">
              Organização
            </label>
            <select
              id="f-org"
              value={organizacao}
              onChange={(e) => setOrganizacao(e.target.value)}
              className="mt-1 block rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
            >
              <option value="">todas</option>
              <option value="plataforma">plataforma (administradores)</option>
              {orgs?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.archivedAt ? " (arquivada)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="f-papel" className="label-xs">
            Papel
          </label>
          <select
            id="f-papel"
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="mt-1 block rounded-md border border-line-2 bg-white px-3 py-2 text-sm"
          >
            <option value="">todos</option>
            {plataforma ? <option value="admin">administrador</option> : null}
            <option value="organizer">organizador</option>
            <option value="affiliate">afiliado</option>
            <option value="cambista">cambista</option>
          </select>
        </div>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="f-busca" className="label-xs">
            Buscar nome, e-mail ou telefone
          </label>
          <input
            id="f-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className={senhaDe ? "grid gap-3 xl:grid-cols-[1fr_320px]" : ""}>
        <Card
          title="Pessoas com acesso"
          right={<span className="tnum label-xs">{usuarios?.length ?? 0}</span>}
        >
          {isLoading ? (
            <Empty>Carregando…</Empty>
          ) : usuarios?.length ? (
            <div className="overflow-x-auto">
              <p className="border-b border-line px-3 py-2 text-xs text-muted">
                Clique no nome para ver todos os dados da pessoa.
              </p>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-mist">
                    {["Nome", "E-mail", "Papel", "Organização", "Segundo fator", "Situação", ""].map(
                      (h) => (
                        <th key={h} className="label-xs px-3 py-2 text-left">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <FragmentoUsuario
                      key={u.id}
                      u={u}
                      aberto={aberto === u.id}
                      alternarAberto={() => setAberto(aberto === u.id ? null : u.id)}
                      souEu={u.email === session?.user?.email}
                      onSenha={() => {
                        setSenhaDe(u);
                        setSenha("");
                        setAviso(null);
                      }}
                      onAlternar={() => alternar.mutate(u)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Ninguém encontrado com esses filtros.</Empty>
          )}
        </Card>

        {senhaDe ? (
          <Card title="Redefinir senha">
            <form
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                redefinir.mutate();
              }}
            >
              <p className="text-xs text-muted">
                Nova senha para <span className="font-medium text-ink">{senhaDe.name}</span> (
                {senhaDe.email}). Você vai saber esta senha: peça para a pessoa trocar em
                "trocar senha" assim que entrar.
              </p>
              <div>
                <label htmlFor="nova-senha" className="label-xs">
                  Nova senha (mínimo {minimoSenha(senhaDe.role)} caracteres)
                </label>
                <input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
              {problemaSenha ? <p className="text-xs text-red">{problemaSenha}</p> : null}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!senha || Boolean(problemaSenha) || redefinir.isPending}
                >
                  Salvar senha
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSenhaDe(null)}>
                  cancelar
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </PanelShell>
  );
}

function FragmentoUsuario({
  u,
  aberto,
  alternarAberto,
  souEu,
  onSenha,
  onAlternar,
}: {
  u: Usuario;
  aberto: boolean;
  alternarAberto: () => void;
  souEu: boolean;
  onSenha: () => void;
  onAlternar: () => void;
}) {
  return (
    <>
      <tr className="border-t border-line align-top">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={alternarAberto}
            className="text-left font-medium text-ink underline decoration-line-2 underline-offset-2"
            aria-expanded={aberto}
          >
            {u.name}
          </button>
        </td>
        <td className="px-3 py-2">{u.email}</td>
        <td className="px-3 py-2">{PAPEL[u.role]}</td>
        <td className="px-3 py-2">
          {u.organizacao ?? <span className="text-muted">plataforma</span>}
          {u.organizacaoArquivada ? (
            <span className="ml-1">
              <Pill status="blocked">arquivada</Pill>
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <Pill status={u.doisFatores ? "paid" : "pending"}>
            {u.doisFatores ? "ligado" : "desligado"}
          </Pill>
        </td>
        <td className="px-3 py-2">
          <Pill status={u.active ? "active" : "blocked"}>{u.active ? "ativo" : "desligado"}</Pill>
        </td>
        <td className="px-3 py-2 text-right">
          {souEu ? (
            <span className="text-[11px] text-muted">você</span>
          ) : (
            <div className="flex justify-end gap-2 whitespace-nowrap">
              <Button variant="ghost" onClick={onSenha}>
                senha
              </Button>
              <Button variant="ghost" onClick={onAlternar}>
                {u.active ? "desligar" : "ligar"}
              </Button>
            </div>
          )}
        </td>
      </tr>
      {aberto ? (
        <tr className="bg-mist">
          <td colSpan={7} className="px-3 py-3">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Dado rotulo="WhatsApp" valor={u.phone} tnum />
              <Dado rotulo="Criado em" valor={new Date(u.createdAt).toLocaleString("pt-BR")} tnum />
              {u.codigo ? <Dado rotulo="Código" valor={u.codigo} tnum /> : null}
              {u.tipo ? <Dado rotulo="Venda" valor={u.tipo === "cambista" ? "física (cambista)" : "online"} /> : null}
              {u.cadastro ? (
                <Dado
                  rotulo="Cadastro"
                  valor={{ pending: "aguardando aprovação", active: "aprovado", blocked: "bloqueado" }[u.cadastro] ?? u.cadastro}
                />
              ) : null}
              {u.pix ? <Dado rotulo="Chave Pix" valor={u.pix} tnum /> : null}
              {u.comissaoPct !== null ? (
                <Dado rotulo="Comissão" valor={`${u.comissaoPct}%`} tnum />
              ) : null}
            </dl>
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
