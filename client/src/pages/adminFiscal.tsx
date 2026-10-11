import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Empty, Pill } from "@/components/bits";
import { CartaoDoPainel, MestreDetalhe } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { formatarCnpj, maskCpf } from "@shared/format";
import { enderecoEmUmaLinha } from "@shared/endereco";
import {
  DOCUMENTOS,
  REGIMES_TRIBUTARIOS,
  STATUS_FISCAL,
  TIPOS_DE_EMPRESA,
  regimeDaEmpresa,
  type DadosFiscais,
  type StatusFiscal,
} from "@shared/fiscal";

interface Linha {
  affiliateId: string;
  status: StatusFiscal;
  enviadoEm: string | null;
  decididoEm: string | null;
  motivo: string | null;
  nome: string;
  email: string;
  codigo: string;
}

const PILL: Record<StatusFiscal, string> = { incompleto: "draft", em_analise: "pending", aprovado: "active", recusado: "blocked" };

/**
 * Cadastros fiscais dos afiliados (só a plataforma). Abrir um cadastro ou
 * um documento fica registrado na auditoria — por isso os dados só carregam
 * quando alguém clica em "Conferir", nunca na lista.
 */
export function AdminFiscal() {
  const { data = [] } = useQuery<Linha[]>({ queryKey: ["/api/admin/fiscal"] });
  const [aberto, setAberto] = useState<string | null>(null);
  const fila = data.filter((l) => l.status === "em_analise");
  const resto = data.filter((l) => l.status !== "em_analise");
  const linhaAberta = data.find((l) => l.affiliateId === aberto) ?? null;

  // Cartão por cadastro (nome, código, e-mail e a situação) — nenhum dado fiscal na lista.
  const lista = (linhas: Linha[]) => (
    <ul className="divide-y divide-line border-t border-line">
      {linhas.map((l) => (
        <li key={l.affiliateId} className={`px-5 py-3 text-sm ${aberto === l.affiliateId ? "bg-mist" : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{l.nome}</span> · <span className="tnum text-muted">{l.codigo}</span>
              <span className="block truncate text-xs text-muted">{l.email}</span>
            </span>
            <Pill status={PILL[l.status]}>{STATUS_FISCAL[l.status]}</Pill>
            <Button
              variant="cinza"
              className="h-9 px-3 text-xs"
              aria-pressed={aberto === l.affiliateId}
              aria-label={`Conferir o cadastro de ${l.nome}`}
              onClick={() => setAberto(aberto === l.affiliateId ? null : l.affiliateId)}
            >
              Conferir
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <PanelShell title="Cadastros fiscais">
      <div className="space-y-4 md:space-y-6">
        <MestreDetalhe
          aberto={aberto}
          aoFechar={() => setAberto(null)}
          vazio="Escolha um cadastro e toque em Conferir: os dados só carregam aqui, com a auditoria gravada antes."
          lista={
            <div className="space-y-4 md:space-y-6">
              <CartaoDoPainel titulo="Em análise" acao={<Pill status="pending">{`${fila.length}`}</Pill>}>
                {fila.length ? lista(fila) : <Empty>Nenhum cadastro esperando.</Empty>}
              </CartaoDoPainel>
              <CartaoDoPainel titulo="Aprovados, recusados e incompletos">
                {resto.length ? lista(resto) : <Empty>Nenhum outro cadastro.</Empty>}
              </CartaoDoPainel>
            </div>
          }
          detalhe={
            linhaAberta ? (
              <CartaoDoPainel
                titulo={`Cadastro de ${linhaAberta.nome}`}
                subtitulo={<span className="tnum">{linhaAberta.codigo}</span>}
                acao={<Pill status={PILL[linhaAberta.status]}>{STATUS_FISCAL[linhaAberta.status]}</Pill>}
              >
                <div className="px-5 pb-5">
                  <Conferencia
                    key={linhaAberta.affiliateId}
                    affiliateId={linhaAberta.affiliateId}
                    emAnalise={linhaAberta.status === "em_analise"}
                    aoDecidir={() => setAberto(null)}
                  />
                </div>
              </CartaoDoPainel>
            ) : null
          }
        />
        <CartaoDoPainel titulo="Como funciona">
          <ul className="space-y-2 px-5 pb-5 text-[13px] leading-[18px] text-ink-2">
            <li>
              • Dado fiscal e documento só entram cifrados no cofre (AES-256-GCM, chave fora do banco). A lista não traz dado
              nenhum; os dados só carregam ao conferir, e a auditoria é gravada antes de o dado sair.
            </li>
            <li>
              • O saque é pago só a MEI ou empresa: cadastro aprovado com CNPJ e a nota fiscal do valor bruto anexada. No Lucro
              Presumido ou Real retém <span className="tnum">1,5%</span> de IRRF.
            </li>
            <li>
              • Mexer depois de aprovado volta para análise. Decidir é UPDATE condicional; recusa exige motivo. O organizador
              nunca vê (<span className="tnum">403</span>).
            </li>
          </ul>
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}

function Conferencia({ affiliateId, emAnalise, aoDecidir }: { affiliateId: string; emAnalise: boolean; aoDecidir: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ dados: DadosFiscais | null; documentos: { tipo: string; mime: string }[] }>({
    queryKey: [`/api/admin/fiscal/${affiliateId}`],
    staleTime: 0,
    // Cada leitura entra na auditoria: sem releitura ao voltar para a aba.
    refetchOnWindowFocus: false,
  });
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const decidir = useMutation({
    mutationFn: (status: "aprovado" | "recusado") => apiRequest("POST", `/api/admin/fiscal/${affiliateId}/decidir`, { status, motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/fiscal"] });
      aoDecidir();
    },
    onError: (e: Error) => setErro(e.message),
  });
  if (!data) return <p className="text-xs text-muted">Abrindo…</p>;
  const d = data.dados;
  const regime = regimeDaEmpresa(d?.empresa);
  return (
    <div className="space-y-4 text-sm">
      {d ? (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Item rotulo="Nome" valor={d.nomeCompleto} />
          <Item rotulo="CPF" valor={maskCpf(d.cpf)} tnum />
          <Item rotulo="RG" valor={d.rg} tnum />
          <Item rotulo="Nascimento" valor={d.nascimento.split("-").reverse().join("/")} tnum />
          <Item rotulo="Endereço" valor={enderecoEmUmaLinha(d.endereco)} />
          <Item rotulo="Conta" valor={`banco ${d.conta.banco} · ag. ${d.conta.agencia} · ${d.conta.tipo} ${d.conta.conta}`} tnum />
          {/* O saque só sai para MEI ou empresa; o regime decide a retenção de IRRF. */}
          {d.empresa ? (
            <>
              <Item rotulo={TIPOS_DE_EMPRESA[d.empresa.tipo]} valor={d.empresa.razaoSocial} />
              <Item rotulo="CNPJ" valor={formatarCnpj(d.empresa.cnpj)} tnum />
              <Item
                rotulo="Regime tributário"
                valor={regime ? REGIMES_TRIBUTARIOS[regime] : "falta o regime tributário (não saca até informar)"}
              />
            </>
          ) : (
            <Item rotulo="CNPJ" valor="falta o CNPJ (o saque só é pago a MEI ou empresa)" />
          )}
        </dl>
      ) : (
        <p className="text-muted">Sem dados enviados.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(DOCUMENTOS) as [string, string][]).map(([tipo, nome]) =>
          data.documentos.some((x) => x.tipo === tipo) ? (
            <a
              key={tipo}
              href={`/api/admin/fiscal/${affiliateId}/documentos/${tipo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded-lg border border-line-2 bg-white px-3 text-xs font-medium text-green-deep underline"
            >
              {nome}
            </a>
          ) : (
            <span key={tipo} className="inline-flex min-h-9 items-center rounded-lg border border-dashed border-line-2 px-3 text-xs text-muted">
              {nome}: falta
            </span>
          ),
        )}
      </div>
      {emAnalise ? (
        <div className="space-y-3 border-t border-line pt-4">
          <Campo rotulo="Motivo (obrigatório para recusar)" erro={erro} dica="A pessoa lê o motivo da recusa.">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button disabled={decidir.isPending} onClick={() => decidir.mutate("aprovado")}>
              Aprovar
            </Button>
            <Button variant="cinza" disabled={decidir.isPending} onClick={() => decidir.mutate("recusado")}>
              Recusar
            </Button>
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-muted">Esta consulta e cada documento aberto ficam registrados na auditoria.</p>
    </div>
  );
}

function Item({ rotulo, valor, tnum }: { rotulo: string; valor: string; tnum?: boolean }) {
  return (
    <div>
      <dt className="label-xs">{rotulo}</dt>
      <dd className={tnum ? "tnum" : ""}>{valor}</dd>
    </div>
  );
}
