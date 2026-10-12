import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Pill, Empty } from "@/components/bits";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
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

/** Lê `?q=` da barra: a busca do painel manda para cá com o e-mail da pessoa. */
function buscaDaUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("q") ?? "";
  } catch {
    return "";
  }
}

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
 *
 * A lista é `TabelaOuCartoes`: cartão por pessoa até o tablet, tabela a
 * partir de `xl`. Clicar no nome abre os dados que não cabem na linha —
 * dentro do cartão no celular, numa faixa embaixo da tabela no computador.
 */
export function AdminUsuarios() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const plataforma = session?.role === "admin";

  const [organizacao, setOrganizacao] = useState(organizacaoDaUrl);
  const [papel, setPapel] = useState("");
  const [busca, setBusca] = useState(buscaDaUrl);
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
  const usuarioAberto = usuarios?.find((u) => u.id === aberto) ?? null;

  const nome = (u: Usuario) => (
    <button
      type="button"
      onClick={() => setAberto(aberto === u.id ? null : u.id)}
      className="min-h-6 text-left font-medium text-green-deep hover:underline"
      aria-expanded={aberto === u.id}
    >
      {u.name}
    </button>
  );
  const organizacaoDe = (u: Usuario) => (
    <>
      {u.organizacao ?? <span className="text-muted">plataforma</span>}
      {u.organizacaoArquivada ? (
        <span className="ml-1">
          <Pill status="blocked">arquivada</Pill>
        </span>
      ) : null}
    </>
  );
  const segundoFator = (u: Usuario) => (
    <Pill status={u.doisFatores ? "paid" : "pending"}>{u.doisFatores ? "ligado" : "desligado"}</Pill>
  );
  const situacao = (u: Usuario) => (
    <Pill status={u.active ? "active" : "blocked"}>{u.active ? "ativo" : "desligado"}</Pill>
  );
  const acoes = (u: Usuario) => {
    const souEu = u.email === session?.user?.email;
    // Afiliado visto pela organização: a conta é da plataforma, o vínculo é em Afiliados.
    const contaDaPlataforma = !plataforma && u.role === "affiliate";
    if (souEu) return <span className="text-xs text-muted">você</span>;
    if (contaDaPlataforma) return <span className="text-xs text-muted">conta da plataforma</span>;
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="contorno"
          onClick={() => {
            setSenhaDe(u);
            setSenha("");
            setAviso(null);
          }}
        >
          senha
        </Button>
        <Button variant="contorno" onClick={() => alternar.mutate(u)}>
          {u.active ? "desligar" : "ligar"}
        </Button>
      </div>
    );
  };

  return (
    <PanelShell title="Usuários">
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="mb-3 rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
          {aviso}
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {plataforma ? (
          <Campo rotulo="Organização" className="sm:w-auto sm:min-w-[14rem]">
            <select
              id="f-org"
              value={organizacao}
              onChange={(e) => setOrganizacao(e.target.value)}
              className="campo text-sm"
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
          </Campo>
        ) : null}
        <Campo rotulo="Papel" className="sm:w-auto sm:min-w-[8rem]">
          <select
            id="f-papel"
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="campo text-sm"
          >
            <option value="">todos</option>
            {plataforma ? <option value="admin">administrador</option> : null}
            <option value="organizer">organizador</option>
            <option value="affiliate">afiliado</option>
            <option value="cambista">cambista</option>
          </select>
        </Campo>
        <Campo rotulo="Buscar nome, e-mail ou telefone" className="sm:min-w-[14rem] sm:flex-1">
          <input id="f-busca" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
      </div>

      <div className={senhaDe ? "grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[1fr_320px]" : ""}>
        <CartaoDoPainel
          titulo="Pessoas com acesso"
          subtitulo="Clique no nome para ver todos os dados da pessoa."
          acao={<span className="tnum text-xs text-muted">{usuarios?.length ?? 0}</span>}
        >
          {isLoading ? (
            <Empty>Carregando…</Empty>
          ) : usuarios?.length ? (
            <>
              <TabelaOuCartoes
                itens={usuarios}
                chave={(u) => u.id}
                aria="Pessoas com acesso"
                colunas={[
                  { titulo: "Nome", celula: nome },
                  { titulo: "E-mail", celula: (u) => u.email },
                  { titulo: "Papel", celula: (u) => PAPEL[u.role] },
                  { titulo: "Organização", celula: organizacaoDe },
                  { titulo: "Segundo fator", celula: segundoFator },
                  { titulo: "Situação", celula: situacao },
                  { titulo: "", celula: acoes, direita: true },
                ]}
                cartao={(u) => (
                  <div className="space-y-1.5 text-sm">
                    {nome(u)}
                    <Linha rotulo="e-mail">{u.email}</Linha>
                    <Linha rotulo="papel">{PAPEL[u.role]}</Linha>
                    <Linha rotulo="organização">{organizacaoDe(u)}</Linha>
                    <Linha rotulo="segundo fator">{segundoFator(u)}</Linha>
                    <Linha rotulo="situação">{situacao(u)}</Linha>
                    {aberto === u.id ? <DadosDaPessoa u={u} /> : null}
                    <div className="pt-1">{acoes(u)}</div>
                  </div>
                )}
              />
              {usuarioAberto ? (
                <div className="hidden border-t border-line bg-mist px-5 py-4 xl:block">
                  <p className="mb-2 text-sm font-semibold">Dados de {usuarioAberto.name}</p>
                  <DadosDaPessoa u={usuarioAberto} />
                </div>
              ) : null}
            </>
          ) : (
            <Empty>Ninguém encontrado com esses filtros.</Empty>
          )}
        </CartaoDoPainel>

        {senhaDe ? (
          <CartaoDoPainel titulo="Redefinir senha">
            <form
              className="space-y-3 px-5 pb-5"
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
              <Campo rotulo={`Nova senha (mínimo ${minimoSenha(senhaDe.role)} caracteres)`} erro={problemaSenha}>
                <input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={!senha || Boolean(problemaSenha) || redefinir.isPending}
                >
                  Salvar senha
                </Button>
                <Button type="button" variant="cinza" onClick={() => setSenhaDe(null)}>
                  cancelar
                </Button>
              </div>
            </form>
          </CartaoDoPainel>
        ) : null}
      </div>
    </PanelShell>
  );
}

/** Uma linha do cartão: o rótulo pequeno em mono e o valor ao lado. */
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="font-mono text-[11px] text-muted">{rotulo}:</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** O que não cabe na linha: WhatsApp, data, código, chave Pix e comissão. */
function DadosDaPessoa({ u }: { u: Usuario }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
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
      {u.comissaoPct !== null ? <Dado rotulo="Comissão" valor={`${u.comissaoPct}%`} tnum /> : null}
    </dl>
  );
}

function Dado({ rotulo, valor, tnum = false }: { rotulo: string; valor: string | null; tnum?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-xs">{rotulo}</dt>
      <dd className={`break-words ${tnum ? "tnum" : ""}`}>{valor || <span className="text-muted">—</span>}</dd>
    </div>
  );
}
