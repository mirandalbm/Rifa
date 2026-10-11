import { useEffect, useRef, useState } from "react";
import { AprovarTelefone } from "@/components/Seguranca";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PRAZO_ESTORNO_MIN, PRAZO_ESTORNO_MAX, telefoneDeAvisoValido } from "@shared/chamados";
import { maskPhone } from "@shared/format";
import { PanelShell } from "@/components/AppShell";
import { Button, Pill, Empty, Filtros, Campo } from "@/components/bits";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { MIN_SENHA, senhaInvalida } from "@shared/senha";
import { EnderecoForm } from "@/components/EnderecoForm";
import { PerfilPublicoForm } from "@/components/PerfilPublicoForm";
import type { CorDeDestaque, LinkDoPerfil } from "@shared/perfil";
import { cidadeUf, ufValida, type Endereco } from "@shared/endereco";
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
  uf: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  bio: string | null;
  foto: string | null;
  capa: string | null;
  destaque: CorDeDestaque | null;
  links: LinkDoPerfil[];
  observacao: string | null;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  asaasWalletId: string | null;
  liberacaoComissao: LiberacaoComissao;
  prazoEstornoDias: number;
  avisoTelefone: string | null;
  telefoneOrganizador: string | null;
  telefoneConfirmadoEm: string | null;
  telefoneAprovadoEm: string | null;
  banidaEm: string | null;
  banidaMotivo: string | null;
  campanhas: number;
  pessoas: number;
}

type Situacao = "ativas" | "arquivadas";

const VAZIA = { name: "", cnpj: "", contato: "", observacao: "" };

/** O endereço inteiro, ou `null` enquanto a organização não cadastrou. */
function enderecoDe(o: Organizacao): Endereco | null {
  if (!o.cep || !ufValida(o.uf) || !o.cidade || !o.logradouro) return null;
  return {
    cep: o.cep,
    logradouro: o.logradouro,
    numero: o.numero ?? "",
    complemento: o.complemento,
    bairro: o.bairro ?? "",
    cidade: o.cidade,
    uf: o.uf,
  };
}
const ACESSO_VAZIO = { name: "", email: "", password: "" };

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
  // A busca do painel manda `?aberta=<id>`: a tela abre já naquela
  // organização, e na lista das arquivadas se for o caso.
  const pedida = new URLSearchParams(useSearch()).get("aberta");
  const { data: todas } = useQuery<Organizacao[]>({
    queryKey: ["/api/admin/organizacoes", { situacao: "todas" }],
    enabled: Boolean(pedida),
  });
  const pedidaArquivada = Boolean(pedida && todas?.find((o) => o.id === pedida)?.archivedAt);
  const [situacaoEscolhida, setSituacao] = useState<Situacao | null>(null);
  const situacao: Situacao = situacaoEscolhida ?? (pedidaArquivada ? "arquivadas" : "ativas");
  const { data: orgs, isLoading } = useQuery<Organizacao[]>({
    queryKey: ["/api/admin/organizacoes", { situacao }],
  });

  const [nova, setNova] = useState(VAZIA);
  const [aberta, setAberta] = useState<string | null>(pedida);
  const [acessoPara, setAcessoPara] = useState<Organizacao | null>(null);
  const [acesso, setAcesso] = useState(ACESSO_VAZIO);
  const [arquivar, setArquivar] = useState<Organizacao | null>(null);
  const [confirma, setConfirma] = useState({ password: "", code: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Quem tem saldo retido (a retenção cautelar ativa): a pílula "retida" na situação.
  const { data: retencoes } = useQuery<{ organizationId: string; status: string }[]>({
    queryKey: ["/api/admin/retencoes"],
  });
  const retidas = new Set((retencoes ?? []).filter((r) => r.status === "ativa").map((r) => r.organizationId));
  // O formulário de arquivar ou de acesso abre na coluna ao lado (no celular,
  // embaixo da lista): a página vai até ele e o primeiro campo recebe o foco.
  const formulario = useRef<HTMLDivElement>(null);
  const formularioAberto = arquivar ? `arquivar:${arquivar.id}` : acessoPara ? `acesso:${acessoPara.id}` : null;
  useEffect(() => {
    if (!formularioAberto || !formulario.current) return;
    formulario.current.scrollIntoView({ block: "nearest" });
    formulario.current.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [formularioAberto]);

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

  // As ações de cada organização: as mesmas no cartão (celular e tablet) e na
  // coluna de 120 px da tabela (computador), uma embaixo da outra.
  const acoesDe = (o: Organizacao) =>
    o.archivedAt ? (
      <Button variant="contorno" className="w-full" onClick={() => restaurar.mutate(o)} aria-label={`Restaurar ${o.name}`}>
        restaurar
      </Button>
    ) : (
      <>
        <Button
          variant="contorno"
          className="w-full"
          aria-label={`Acesso de organizador de ${o.name}`}
          onClick={() => {
            setAcessoPara(o);
            setArquivar(null);
            setAviso(null);
          }}
        >
          acesso
        </Button>
        <Button
          variant="contorno"
          className="w-full"
          aria-label={`${o.active ? "Suspender" : "Reativar"} ${o.name}`}
          onClick={() => alternar.mutate(o)}
        >
          {o.active ? "suspender" : "reativar"}
        </Button>
        <Button
          variant="contorno"
          className="w-full"
          aria-label={`Arquivar ${o.name}`}
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
    );

  const nome = (o: Organizacao) => (
    <>
      <button
        type="button"
        onClick={() => setAberta(aberta === o.id ? null : o.id)}
        aria-expanded={aberta === o.id}
        aria-controls="organizacao-aberta"
        className="min-w-0 break-words text-left font-medium text-green-deep underline decoration-line-2 underline-offset-2"
      >
        {o.name}
      </button>
      <span className="block break-words font-mono text-[11px] text-muted">
        {o.slug}
        {o.cidade ? ` · ${cidadeUf(o.cidade, o.uf)}` : ""}
      </span>
    </>
  );
  const pessoas = (o: Organizacao) => (
    <Link
      href={`/admin/usuarios?organizacao=${o.id}`}
      className="tnum text-green-deep underline"
      aria-label={`${o.pessoas} pessoa(s) de ${o.name}`}
    >
      {o.pessoas}
    </Link>
  );
  const situacaoDe = (o: Organizacao) => <SituacaoDaOrganizacao o={o} retida={retidas.has(o.id)} />;
  const abertaAgora = orgs?.find((o) => o.id === aberta) ?? null;

  return (
    <PanelShell title="Organizações">
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

      <Filtros
        rotulo="Situação das organizações"
        exclusivo
        className="mb-4 md:mb-6"
        opcoes={[
          { valor: "ativas", rotulo: "ativas" },
          { valor: "arquivadas", rotulo: "arquivadas" },
        ]}
        ativa={situacao}
        aoMudar={(s) => {
          setSituacao(s);
          setAberta(null);
        }}
      />

      {/* Celular e tablet: uma coluna, na ordem do DOM. Computador: a lista à
          esquerda; a nova organização e a demonstração na coluna de 328 px. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_328px] lg:items-start">
        <CartaoDoPainel titulo={situacao === "ativas" ? "Promotores" : "Arquivadas"}>
          {isLoading ? (
            <Empty>Carregando…</Empty>
          ) : orgs?.length ? (
            <TabelaOuCartoes
              aria={situacao === "ativas" ? "Organizações ativas" : "Organizações arquivadas"}
              itens={orgs}
              chave={(o) => o.id}
              colunas={[
                { titulo: "Organização", celula: nome },
                { titulo: "Rifas", celula: (o) => <span className="tnum">{o.campanhas}</span> },
                { titulo: "Pessoas", celula: pessoas },
                { titulo: "Situação", celula: situacaoDe },
                { titulo: "Ações", celula: (o) => <div className="flex w-[120px] flex-col gap-1.5">{acoesDe(o)}</div> },
              ]}
              cartao={(o) => (
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="min-w-0">{nome(o)}</div>
                  <p>
                    <span className="label-xs">rifas: </span>
                    <span className="tnum">{o.campanhas}</span>
                  </p>
                  <p>
                    <span className="label-xs">pessoas: </span>
                    {pessoas(o)}
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="label-xs shrink-0 pt-1">situação:</span>
                    <div className="min-w-0">{situacaoDe(o)}</div>
                  </div>
                  <div className="flex w-[120px] flex-col gap-1.5">{acoesDe(o)}</div>
                </div>
              )}
            />
          ) : (
            <Empty>
              {situacao === "ativas"
                ? "Nenhuma organização ainda. Crie a primeira em \"Nova organização\"."
                : "Nenhuma organização arquivada."}
            </Empty>
          )}

          {abertaAgora ? <DetalheDaOrganizacao o={abertaAgora} aoFechar={() => setAberta(null)} /> : null}

          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Suspender fecha a porta do organizador; as rifas continuam no ar.
            Arquivar tira da lista e fecha a porta de todos da organização, mas
            não apaga nada: venda, cota, comissão e cobrança continuam nos
            relatórios.
          </p>
        </CartaoDoPainel>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6">
          {arquivar ? (
            <div ref={formulario} className="min-w-0">
              <CartaoDoPainel
                titulo={`Arquivar ${arquivar.name}`}
                subtitulo="Confirme com a sua senha e o código do aplicativo autenticador. Rifa no ar ou esperando sorteio impede o arquivamento."
              >
                <form
                  className="grid grid-cols-1 gap-3 px-5 pb-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmarArquivo.mutate();
                  }}
                >
                  <Campo rotulo="Sua senha">
                    <input
                      id="arq-senha"
                      type="password"
                      autoComplete="current-password"
                      value={confirma.password}
                      onChange={(e) => setConfirma({ ...confirma, password: e.target.value })}
                    />
                  </Campo>
                  <Campo rotulo="Código do autenticador">
                    <input
                      id="arq-codigo"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={confirma.code}
                      onChange={(e) => setConfirma({ ...confirma, code: e.target.value.replace(/\D/g, "") })}
                      className="campo tnum text-sm"
                    />
                  </Campo>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={!confirma.password || confirma.code.length !== 6 || confirmarArquivo.isPending}
                    >
                      Arquivar
                    </Button>
                    <Button type="button" variant="cinza" onClick={() => setArquivar(null)}>
                      cancelar
                    </Button>
                  </div>
                </form>
              </CartaoDoPainel>
            </div>
          ) : null}

          {acessoPara ? (
            <div ref={formulario} className="min-w-0">
              <CartaoDoPainel
                titulo={`Acesso de organizador · ${acessoPara.name}`}
                subtitulo="Quem entrar com este acesso vê as mesmas telas do painel, com as rifas, os pedidos e o caixa desta organização — e de mais nenhuma. A entrada é a mesma de todos: /entrar."
              >
                <form
                  className="grid grid-cols-1 gap-3 px-5 pb-5"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    criarAcesso.mutate();
                  }}
                >
                  {(
                    [
                      ["name", "Nome", "text", "off"],
                      ["email", "E-mail", "email", "off"],
                      ["password", `Senha (mínimo ${MIN_SENHA} caracteres)`, "password", "new-password"],
                    ] as const
                  ).map(([campo, rotulo, tipo, auto]) => (
                    <Campo key={campo} rotulo={rotulo} erro={campo === "password" ? problemaAcesso : null}>
                      <input
                        id={`ac-${campo}`}
                        type={tipo}
                        autoComplete={auto}
                        value={acesso[campo]}
                        onChange={(e) => setAcesso({ ...acesso, [campo]: e.target.value })}
                      />
                    </Campo>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={
                        !acesso.name || !acesso.email || !acesso.password ||
                        Boolean(problemaAcesso) || criarAcesso.isPending
                      }
                    >
                      Criar acesso
                    </Button>
                    <Button type="button" variant="cinza" onClick={() => setAcessoPara(null)}>
                      cancelar
                    </Button>
                  </div>
                </form>
              </CartaoDoPainel>
            </div>
          ) : null}

          {situacao === "ativas" ? (
            <CartaoDoPainel titulo="Nova organização">
              <div className="grid grid-cols-1 gap-3 px-5 pb-5">
                {(
                  [
                    ["name", "Nome (sai no bilhete)"],
                    ["cnpj", "CNPJ"],
                    ["contato", "Contato"],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <Campo key={campo} rotulo={rotulo}>
                    <input
                      id={`org-${campo}`}
                      autoComplete="off"
                      value={nova[campo]}
                      onChange={(e) => setNova({ ...nova, [campo]: e.target.value })}
                      className={campo === "cnpj" ? "campo tnum text-sm" : "campo text-sm"}
                    />
                  </Campo>
                ))}
                <div>
                  <Button onClick={() => criar.mutate()} disabled={nova.name.trim().length < 2 || criar.isPending}>
                    Criar organização
                  </Button>
                </div>
              </div>
            </CartaoDoPainel>
          ) : null}
          {situacao === "ativas" ? <DemonstracaoCard aoMudar={recarregar} /> : null}
        </div>
      </div>
    </PanelShell>
  );
}

/**
 * Organização de demonstração: um perfil completo (capa, cor, links e rifas
 * sorteadas com foto do ganhador) para ver como fica — sem rifa à venda.
 */
function DemonstracaoCard({ aoMudar }: { aoMudar: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ existe: boolean; slug: string; rifas: number }>({
    queryKey: ["/api/admin/demonstracao"],
  });
  const [erro, setErro] = useState<string | null>(null);
  const feito = () => {
    setErro(null);
    qc.invalidateQueries({ queryKey: ["/api/admin/demonstracao"] });
    aoMudar();
  };
  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/demonstracao"),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  const remover = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/demonstracao"),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  return (
    <CartaoDoPainel titulo="Perfil de demonstração">
      <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
        <p className="text-[13px] leading-[18px] text-ink-2">
          Cria a organização "Demonstração" com capa, foto, bio, cor de destaque, links, três rifas na página inicial marcadas "Demonstração" (não vendem) e duas já sorteadas
          com foto do ganhador. Nada dela vende e não tem acesso de
          organizador. Remover arquiva e o perfil some.
        </p>
        {erro ? <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">{erro}</p> : null}
        {data?.existe ? (
          <div className="flex flex-wrap items-center gap-2">
            <Pill status="active">no ar</Pill>
            <Link href={`/o/${data.slug}`} className="font-semibold text-green-deep underline">
              Ver o perfil
            </Link>
            <Button variant="contorno" onClick={() => criar.mutate()} disabled={criar.isPending}>
              Refazer
            </Button>
            <Button variant="contorno" onClick={() => remover.mutate()} disabled={remover.isPending}>
              Remover
            </Button>
          </div>
        ) : (
          <div>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
              {criar.isPending ? "Criando…" : "Criar perfil de demonstração"}
            </Button>
          </div>
        )}
      </div>
    </CartaoDoPainel>
  );
}

/**
 * A situação em pílula (ativa, suspensa, arquivada, banida e, por cima de
 * qualquer uma, retida) e o telefone do organizador com a aprovação.
 */
function SituacaoDaOrganizacao({ o, retida }: { o: Organizacao; retida: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="flex flex-wrap gap-1">
        {o.banidaEm ? (
          <Pill status="expired">banida</Pill>
        ) : o.archivedAt ? (
          <Pill status="blocked">arquivada</Pill>
        ) : (
          <Pill status={o.active ? "active" : "blocked"}>{o.active ? "ativa" : "suspensa"}</Pill>
        )}
        {retida ? <Pill status="pending">retida</Pill> : null}
      </span>
      <span className="text-xs">
        <AprovarTelefone
          id={o.id}
          telefone={o.telefoneOrganizador}
          confirmadoEm={o.telefoneConfirmadoEm}
          aprovadoEm={o.telefoneAprovadoEm}
        />
      </span>
    </div>
  );
}

/**
 * A organização aberta: os dados, o endereço, o perfil público, o pagamento e
 * o exemplo. Um só embaixo da lista (no cartão e na tabela), para os campos
 * não existirem duas vezes na página.
 */
function DetalheDaOrganizacao({ o, aoFechar }: { o: Organizacao; aoFechar: () => void }) {
  const qc = useQueryClient();
  const recarregarLista = () => qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] });
  const ref = useRef<HTMLElement>(null);
  // Aberta pelo nome ou pela busca do painel (`?aberta=`): a página vai até ela.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [o.id]);
  return (
    <section
      ref={ref}
      id="organizacao-aberta"
      aria-label={`Dados de ${o.name}`}
      className="min-w-0 border-t border-line bg-mist px-5 py-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold">{o.name}</h3>
        <Button variant="cinza" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Dado rotulo="CNPJ" valor={o.cnpj} tnum />
        <Dado rotulo="Contato" valor={o.contato} />
        <Dado rotulo="Cidade/UF" valor={cidadeUf(o.cidade, o.uf)} />
        <Dado rotulo="Criada em" valor={new Date(o.createdAt).toLocaleDateString("pt-BR")} tnum />
        {o.archivedAt ? (
          <Dado rotulo="Arquivada em" valor={new Date(o.archivedAt).toLocaleDateString("pt-BR")} tnum />
        ) : null}
        <div className="min-w-0 sm:col-span-3">
          <Dado rotulo="Texto do bilhete" valor={o.observacao} />
        </div>
      </dl>
      <Link href={`/admin/usuarios?organizacao=${o.id}`} className="mt-3 inline-block text-sm text-green-deep underline">
        ver as pessoas desta organização
      </Link>
      {o.archivedAt ? null : (
        <div className="mt-4 border-t border-line pt-3">
          <p className="label-xs mb-2">
            Endereço {enderecoDe(o) ? null : <Pill status="pending">falta cadastrar</Pill>}
          </p>
          <EnderecoForm organizacaoId={o.id} atual={o} onSalvo={recarregarLista} />
        </div>
      )}
      {o.archivedAt ? null : (
        <div className="mt-4 border-t border-line pt-3">
          <p className="label-xs mb-2">Perfil público</p>
          <PerfilPublicoForm
            organizacaoId={o.id}
            slug={o.slug}
            nome={o.name}
            bio={o.bio}
            foto={o.foto}
            capa={o.capa}
            destaque={o.destaque}
            links={o.links}
            onSalvo={recarregarLista}
          />
        </div>
      )}
      {o.archivedAt ? null : <PagamentoDaOrganizacao o={o} />}
      {o.archivedAt ? null : <ExemploDaOrganizacao id={o.id} aoFeito={recarregarLista} />}
    </section>
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
  const [aviso, setAviso] = useState(o.avisoTelefone ? maskPhone(o.avisoTelefone) : "");
  const avisoOk = aviso.trim() === "" || telefoneDeAvisoValido(aviso);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const carteiraOk = carteira.trim() === "" || carteiraAsaasValida(carteira);
  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/organizacoes/${o.id}`, {
        asaasWalletId: carteira.trim() || null,
        liberacaoComissao: liberacao,
        prazoEstornoDias: Number(prazo),
        avisoTelefone: aviso,
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo. Vale para as próximas vendas." });
      qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <Campo
        rotulo="Carteira Asaas (walletId)"
        dica={
          carteiraOk
            ? "Com a carteira, a parte do promotor cai direto na conta dele quando o Asaas estiver em uso. Vazio: tudo entra na conta da plataforma."
            : undefined
        }
        erro={carteiraOk ? null : "Formato inválido: o walletId tem 36 caracteres, com hífens."}
        className="min-w-0"
      >
        <input
          id={`carteira-${o.id}`}
          value={carteira}
          onChange={(e) => {
            setMsg(null);
            setCarteira(e.target.value);
          }}
          placeholder="00000000-0000-0000-0000-000000000000"
          autoComplete="off"
          className="campo tnum text-sm"
        />
      </Campo>
      <Campo rotulo="Comissão dos divulgadores" className="min-w-0">
        <select
          id={`liberacao-${o.id}`}
          value={liberacao}
          onChange={(e) => {
            setMsg(null);
            setLiberacao(e.target.value as LiberacaoComissao);
          }}
        >
          {LIBERACAO_COMISSAO.map((m) => (
            <option key={m} value={m}>
              {NOME_LIBERACAO[m]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Prazo de reembolso (dias após aprovar)" className="min-w-0">
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
          className="campo tnum block w-24 text-sm"
        />
      </Campo>
      <Campo
        rotulo="WhatsApp do aviso de chamado novo"
        erro={avisoOk ? null : "Informe DDD e número."}
        className="min-w-0"
      >
        <input
          id={`aviso-${o.id}`}
          inputMode="tel"
          value={aviso}
          onChange={(e) => {
            setMsg(null);
            setAviso(e.target.value);
          }}
          placeholder="vazio: os organizadores"
          className="campo tnum text-sm"
        />
      </Campo>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button onClick={() => salvar.mutate()} disabled={!avisoOk || !carteiraOk || salvar.isPending}>
          Salvar pagamento
        </Button>
        {msg ? (
          <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Organização de teste com cara de pronta: fotos das publicações das rifas
 * marcadas como teste, dois destaques, foto e capa (se faltarem) e stories.
 * O servidor recusa se houver rifa de verdade no ar.
 */
function ExemploDaOrganizacao({ id, aoFeito }: { id: string; aoFeito: () => void }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const preencher = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/admin/organizacoes/${id}/exemplo`)).json() as Promise<{
        fotosDePublicacao: number;
        destaques: number;
        stories: number;
      }>,
    onSuccess: (r) => {
      setMsg({
        ok: true,
        texto: `Pronto: fotos em ${r.fotosDePublicacao} rifa(s) de teste, ${r.destaques} destaques e ${r.stories} stories (vivem 24 h).`,
      });
      qc.invalidateQueries();
      aoFeito();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <div className="mt-4 border-t border-line pt-3 text-sm">
      <p className="label-xs mb-1">Organização de teste</p>
      <p className="text-xs text-muted">
        Preenche com imagens de exemplo: fotos das publicações das rifas marcadas como teste, dois destaques de
        rifas sorteadas com foto do ganhador, foto, capa e links de redes sociais e contato (só se faltarem) e três
        stories. Só para
        organização sem rifa de verdade no ar.
      </p>
      {msg ? (
        <p className={`mt-2 rounded-md px-3 py-2 text-xs ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}
      <Button
        variant="ghost"
        className="mt-2"
        disabled={preencher.isPending}
        onClick={() => {
          if (window.confirm("Preencher esta organização com imagens de exemplo?")) preencher.mutate();
        }}
      >
        {preencher.isPending ? "Preenchendo…" : "Preencher com exemplo"}
      </Button>
    </div>
  );
}
