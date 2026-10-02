import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { MestreDetalhe } from "@/components/painel";
import { SeloVerificado } from "@/components/SeloVerificado";
import { apiRequest } from "@/lib/queryClient";
import { maskCpf } from "@shared/format";
import {
  DOCUMENTOS_VERIFICACAO,
  LIMIAR_ROSTO,
  NOME_SUJEITO,
  PILL_VERIFICACAO,
  STATUS_VERIFICACAO,
  TIPOS_DE_PIX,
  type DadosOrganizacao,
  type DadosPessoa,
  type DocumentoVerificacao,
  type StatusVerificacao,
  type Sujeito,
} from "@shared/verificacao";

interface Linha {
  id: string;
  sujeito: Sujeito;
  status: StatusVerificacao;
  enviadoEm: string | null;
  nome: string;
  identificador: string;
  similaridade: number | null;
  semAutorizacao: boolean;
}

interface Detalhe {
  id: string;
  sujeito: Sujeito;
  status: StatusVerificacao;
  motivo: string | null;
  nome: string;
  identificador: string;
  documentosAprovados: boolean;
  comparaFoto: boolean;
  fotoVersao: number | null;
  similaridade: number | null;
  comparadorAutomatico: string | null;
  dados: DadosPessoa | DadosOrganizacao | null;
  documentos: { tipo: string; mime: string; tamanho: number; createdAt: string }[];
}

const FILTROS = [
  { valor: "pendentes", rotulo: "Esperando análise" },
  { valor: "todas", rotulo: "Todas" },
] as const;

/**
 * A fila da plataforma: quem pediu o selo, e o detalhe com a foto do
 * perfil e o documento **lado a lado** — é assim que se confere quando o
 * comparador automático não está ligado (ou ficou em dúvida). Abrir o
 * detalhe entra na auditoria antes de o dado sair.
 */
export function VerificacoesDaPlataforma() {
  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");
  const [aberto, setAberto] = useState<string | null>(null);
  const { data } = useQuery<Linha[]>({ queryKey: ["/api/admin/verificacoes", { filtro }], refetchInterval: 30_000 });
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Situação das verificações">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            role="tab"
            aria-selected={filtro === f.valor}
            onClick={() => {
              setFiltro(f.valor);
              setAberto(null);
            }}
            className={
              filtro === f.valor
                ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green"
                : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"
            }
          >
            {f.rotulo}
          </button>
        ))}
      </div>
      <MestreDetalhe
        aberto={aberto}
        aoFechar={() => setAberto(null)}
        vazio="Escolha uma verificação para conferir os documentos e a foto."
        lista={
          <Card title="Verificações">
            {data?.length ? (
              <ul className="divide-y divide-line">
                {data.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setAberto(v.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-mist ${aberto === v.id ? "bg-mist" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <SeloVerificado sujeito={v.sujeito} tamanho={14} />
                          {v.nome}
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          {v.semAutorizacao ? <Pill status="neutral">Sem autorização da foto</Pill> : null}
                          <Pill status={PILL_VERIFICACAO[v.status]}>{STATUS_VERIFICACAO[v.status]}</Pill>
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {NOME_SUJEITO[v.sujeito]} · {v.identificador}
                        {v.enviadoEm ? ` · enviado em ${new Date(v.enviadoEm).toLocaleString("pt-BR")}` : ""}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma verificação aqui.</Empty>
            )}
          </Card>
        }
        detalhe={aberto ? <DetalheDaVerificacao key={aberto} id={aberto} /> : null}
      />
    </>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="label-xs">{rotulo}</dt>
      <dd className="tnum break-words">{valor}</dd>
    </div>
  );
}

function DetalheDaVerificacao({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<Detalhe>({ queryKey: [`/api/admin/verificacoes/${id}`] });
  const [motivo, setMotivo] = useState("");
  const [fotoConfere, setFotoConfere] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const decidir = useMutation({
    mutationFn: (acao: string) =>
      apiRequest("POST", `/api/admin/verificacoes/${id}/decidir`, { acao, motivo, fotoVersao: data?.fotoVersao }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Decisão registrada." });
      qc.invalidateQueries({ queryKey: ["/api/admin/verificacoes"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/verificacoes/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/chamados/pendentes"] });
    },
    onError: (e: Error) => {
      setMsg({ ok: false, texto: e.message });
      qc.invalidateQueries({ queryKey: [`/api/admin/verificacoes/${id}`] });
    },
  });
  if (!data) return <Card><Empty>Carregando…</Empty></Card>;

  const d = data.dados;
  const ident = d ? ("responsavel" in d ? d.responsavel : d) : null;
  const esperando = data.status === "em_analise" || data.status === "foto_em_analise";
  const frente = data.documentos.find((x) => x.tipo === "identidade_frente");
  const docUrl = (tipo: string) => `/api/admin/verificacoes/${id}/documentos/${tipo}`;

  return (
    <Card title={`${NOME_SUJEITO[data.sujeito]} · ${data.nome}`} right={<Pill status={PILL_VERIFICACAO[data.status]}>{STATUS_VERIFICACAO[data.status]}</Pill>}>
      <div className="space-y-4 p-4 text-sm">
        {data.comparaFoto ? (
          <section aria-label="Foto do perfil e documento, lado a lado">
            <p className="label-xs mb-2">A foto do perfil é da pessoa do documento?</p>
            <div className="grid grid-cols-2 gap-2">
              <figure>
                {data.fotoVersao ? (
                  <img
                    src={`/api/admin/verificacoes/${id}/foto?v=${data.fotoVersao}`}
                    alt="Foto do perfil"
                    className="aspect-square w-full rounded-lg border border-line object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-lg border border-line text-muted">sem foto</div>
                )}
                <figcaption className="mt-1 text-center text-xs text-muted">Foto do perfil</figcaption>
              </figure>
              <figure>
                {frente && frente.mime !== "application/pdf" ? (
                  <img src={docUrl("identidade_frente")} alt="Documento com foto (frente)" className="aspect-square w-full rounded-lg border border-line object-contain" />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-lg border border-line text-muted">sem foto do documento</div>
                )}
                <figcaption className="mt-1 text-center text-xs text-muted">Documento (frente)</figcaption>
              </figure>
            </div>
            <p className="mt-2 text-xs text-muted">
              {data.comparadorAutomatico
                ? data.similaridade !== null
                  ? `Comparador automático (${data.comparadorAutomatico}): semelhança de ${data.similaridade}% — verifica sozinho a partir de ${LIMIAR_ROSTO}%.`
                  : `Comparador automático (${data.comparadorAutomatico}) ligado: aprovando só os documentos, ele confere a foto.`
                : "Comparador automático desligado: a foto é conferida aqui, por você."}
            </p>
          </section>
        ) : null}

        {d && ident ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {"razaoSocial" in d ? (
              <>
                <Campo rotulo="Razão social" valor={d.razaoSocial} />
                <Campo rotulo="CNPJ" valor={d.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")} />
              </>
            ) : null}
            <Campo rotulo={"razaoSocial" in d ? "Responsável" : "Nome completo"} valor={ident.nomeCompleto} />
            <Campo rotulo="CPF" valor={maskCpf(ident.cpf)} />
            <Campo rotulo="RG" valor={ident.rg} />
            <Campo rotulo="Nascimento" valor={ident.nascimento.split("-").reverse().join("/")} />
            <Campo rotulo="Conta" valor={`${d.conta.banco} · ag. ${d.conta.agencia} · ${d.conta.conta} (${d.conta.tipo})`} />
            <Campo rotulo={`Pix (${TIPOS_DE_PIX[d.pix.tipo]})`} valor={d.pix.chave} />
          </dl>
        ) : (
          <p className="text-muted">Sem dados enviados.</p>
        )}

        <div>
          <p className="label-xs mb-1">Documentos</p>
          <ul className="space-y-1">
            {data.documentos.map((doc) => (
              <li key={doc.tipo}>
                <a href={docUrl(doc.tipo)} target="_blank" rel="noopener noreferrer" className="text-marca underline">
                  {DOCUMENTOS_VERIFICACAO[doc.tipo as DocumentoVerificacao] ?? doc.tipo}
                </a>{" "}
                <span className="text-xs text-muted">({doc.mime === "application/pdf" ? "PDF" : "imagem"})</span>
              </li>
            ))}
          </ul>
        </div>

        {data.motivo ? <p className="rounded-md bg-mist px-3 py-2">Último motivo: {data.motivo}</p> : null}

        {esperando ? (
          <div className="space-y-3 border-t border-line pt-3">
            {data.comparaFoto ? (
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={fotoConfere} onChange={(e) => setFotoConfere(e.target.checked)} className="mt-0.5" />
                <span>Conferi lado a lado: a foto do perfil é da pessoa do documento.</span>
              </label>
            ) : null}
            <label className="block">
              <span className="label-xs">Motivo (obrigatório para recusar ou pedir outra foto)</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                maxLength={500}
                className="campo"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={decidir.isPending || (data.comparaFoto && !fotoConfere)} onClick={() => decidir.mutate("aprovar")}>
                {data.comparaFoto ? "Verificar (documentos e foto)" : "Verificar organização"}
              </Button>
              {data.comparaFoto && data.status === "em_analise" ? (
                <Button variant="ghost" disabled={decidir.isPending} onClick={() => decidir.mutate("aprovar_documentos")}>
                  Aprovar só os documentos
                </Button>
              ) : null}
              {data.comparaFoto ? (
                <Button variant="ghost" disabled={decidir.isPending} onClick={() => decidir.mutate("foto_divergente")}>
                  Foto não confere
                </Button>
              ) : null}
              <Button variant="ghost" disabled={decidir.isPending} onClick={() => decidir.mutate("recusar")}>
                Recusar documentos
              </Button>
            </div>
          </div>
        ) : null}
        {msg ? (
          <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
        ) : null}
        <p className="text-xs text-muted">Abrir esta verificação e cada documento fica registrado na auditoria.</p>
      </div>
    </Card>
  );
}
