import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
import { Empty, Filtros, Pill } from "@/components/bits";
import { TIPOS_DA_CAIXA, contarPorTipo, destinoDaPendencia, type PendenciaDaCaixa, type TipoDaCaixa } from "@shared/caixa";

/** O tom do tipo vira a pílula do kit (o rótulo vai em texto, nunca só a cor). */
const PILL_DO_TOM = { red: "expired", yellow: "pending", green: "paid" } as const;

/** "O que entra aqui": o que cada fila traz, para quem chega na Caixa pela primeira vez. */
const O_QUE_ENTRA: [string, string][] = [
  ["Disputa de reembolso", "palavra final da plataforma"],
  ["Denúncia", "rifa, comentário, organização, conversa, grupo, comentário do sorteio"],
  ["Pedido de mudança em rifa", "editar, adiar, excluir, remover comentário"],
  ["Verificação", "apostador, afiliado, organização"],
  ["Cadastro fiscal", "afiliado"],
  ["Banner pago", "arte para aprovar"],
  ["Entidade beneficiada", "documentos para conferir"],
  ["Tráfego pago", "campanha em análise ou fechando a conta"],
  ["Pix a devolver", "reserva vencida ou depois do sorteio"],
  ["Saldo retido", "retenção cautelar"],
  ["Telefone por aprovar", "organizador"],
];

function TipoDaLinha({ l }: { l: PendenciaDaCaixa }) {
  const t = TIPOS_DA_CAIXA[l.tipo];
  return <Pill status={PILL_DO_TOM[t.tom]}>{t.rotulo}</Pill>;
}

function Abrir({ l }: { l: PendenciaDaCaixa }) {
  return (
    <Link
      href={destinoDaPendencia(l)}
      aria-label={`Abrir ${TIPOS_DA_CAIXA[l.tipo].rotulo} de ${l.quem}`}
      className="inline-flex min-h-6 items-center text-xs font-semibold uppercase tracking-wide text-green-deep hover:underline"
    >
      Abrir
    </Link>
  );
}

const quando = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

/**
 * A caixa de entrada da plataforma: tudo que espera uma decisão, numa lista
 * só. Cada linha leva à tela que decide aquele tipo — a caixa não decide nada.
 * Sem dado pessoal: organização, afiliado ou apelido.
 */
export function AdminCaixa() {
  const { data = [], isLoading } = useQuery<PendenciaDaCaixa[]>({
    queryKey: ["/api/admin/caixa-de-entrada"],
    refetchInterval: 60_000,
  });
  const [tipo, setTipo] = useState<TipoDaCaixa | "tudo">("tudo");
  const contagem = contarPorTipo(data);
  const linhas = tipo === "tudo" ? data : data.filter((l) => l.tipo === tipo);

  return (
    <PanelShell title="Caixa de entrada">
      <CartaoDoPainel titulo="Esperando a plataforma" subtitulo="Disputas e denúncias primeiro; dentro de cada grupo, o mais antigo.">
        <Filtros<TipoDaCaixa | "tudo">
          rotulo="Filtrar por tipo"
          className="px-5 pb-4"
          ativa={tipo}
          aoMudar={setTipo}
          opcoes={(["tudo", ...(Object.keys(TIPOS_DA_CAIXA) as TipoDaCaixa[])] as const)
            .map((t) => ({ valor: t, rotulo: t === "tudo" ? "Tudo" : TIPOS_DA_CAIXA[t].rotulo, extra: t === "tudo" ? data.length : (contagem[t] ?? 0) }))
            .filter((o) => o.valor === "tudo" || o.extra)}
        />
        {isLoading ? (
          <Empty>Carregando…</Empty>
        ) : linhas.length === 0 ? (
          <Empty>Nada esperando por você agora.</Empty>
        ) : (
          <TabelaOuCartoes
            aria="Pendências da plataforma"
            itens={linhas}
            chave={(l) => l.chave}
            colunas={[
              { titulo: "Tipo", celula: (l) => <TipoDaLinha l={l} /> },
              { titulo: "Quem", celula: (l) => <span className="block max-w-[200px] truncate font-medium">{l.quem}</span> },
              { titulo: "O que", celula: (l) => <span className="block max-w-[420px] text-xs text-ink-2">{l.oQue}</span> },
              { titulo: "Quando", celula: (l) => <span className="whitespace-nowrap text-muted">{quando(l.desde)}</span> },
              { titulo: "", celula: (l) => <Abrir l={l} />, direita: true },
            ]}
            cartao={(l) => (
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <TipoDaLinha l={l} />
                  <span className="whitespace-nowrap text-xs text-muted">{quando(l.desde)}</span>
                </div>
                <p className="truncate text-sm font-medium">{l.quem}</p>
                <p className="text-xs text-ink-2">{l.oQue}</p>
                <Abrir l={l} />
              </div>
            )}
          />
        )}
      </CartaoDoPainel>
      <CartaoDoPainel
        className="mt-4 md:mt-6"
        titulo="O que entra aqui"
        subtitulo="A Caixa reúne, não decide: cada tipo abre na tela onde a auditoria já é gravada."
      >
        <dl className="px-5">
          {O_QUE_ENTRA.map(([tipo, oQue]) => (
            <div key={tipo} className="grid grid-cols-1 gap-x-[10px] gap-y-1 border-b border-line py-2 text-sm sm:grid-cols-[220px_minmax(0,1fr)]">
              <dt className="font-medium">{tipo}</dt>
              <dd className="min-w-0 text-[13px] text-muted">{oQue}</dd>
            </div>
          ))}
        </dl>
        <p className="px-5 pb-5 pt-3 text-xs text-muted">
          Sem dado pessoal na lista: organização, código do afiliado ou apelido — nunca telefone, CPF ou nome de comprador.
        </p>
      </CartaoDoPainel>
    </PanelShell>
  );
}
