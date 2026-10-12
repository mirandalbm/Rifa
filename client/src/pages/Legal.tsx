import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PublicShell } from "@/components/AppShell";
import { TextoDeLeitura } from "@/components/TextoDeLeitura";
import { useTemplate } from "@/lib/template";
import { EMPRESA_VAZIA, VIGENCIA_DOS_TERMOS, montarPrivacidade, montarTermosDeUso, type DadosDosTermos } from "@shared/legal";
import type { Secao } from "@shared/regulamento";

/**
 * Termos de uso e Política de privacidade — montados das regras que o
 * sistema aplica (`shared/legal.ts`), com os dados da empresa publicados no
 * template e a regra de reembolso em vigor. Texto de leitura: coluna estreita.
 */
function useDados(): DadosDosTermos | null {
  const t = useTemplate();
  const { data: checkout, isLoading } = useQuery<{ reembolso?: { aceita: boolean; taxaPct: number } }>({
    queryKey: ["/api/public/checkout"],
  });
  // A regra de reembolso depende da configuração: não mostra uma versão e troca pela outra.
  if (isLoading) return null;
  return {
    plataforma: t.identidade.nome,
    empresa: t.legal ?? EMPRESA_VAZIA,
    reembolso: { aceita: checkout?.reembolso?.aceita ?? false, taxaPct: checkout?.reembolso?.taxaPct ?? 10 },
  };
}

function Documento({ titulo, secoes, outro }: { titulo: string; secoes: Secao[] | null; outro: { href: string; rotulo: string } }) {
  const [a, m, d] = VIGENCIA_DOS_TERMOS.split("-");
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-extrabold">{titulo}</h1>
      <p className="mt-[18px] text-[13px] leading-[18px] text-muted">
        Em vigor desde <span className="tnum">{`${d}/${m}/${a}`}</span> ·{" "}
        <Link href={outro.href} className="text-green-deep underline">
          {outro.rotulo}
        </Link>{" "}
        ·{" "}
        <Link href="/ajuda" className="text-green-deep underline">
          Central de ajuda
        </Link>
      </p>
      {secoes ? null : <p className="mt-[18px] text-sm text-muted">Carregando…</p>}
      <TextoDeLeitura secoes={secoes ?? []} />
    </PublicShell>
  );
}

export function TermosDeUso() {
  const dados = useDados();
  return <Documento titulo="Termos de uso" secoes={dados && montarTermosDeUso(dados)} outro={{ href: "/privacidade", rotulo: "Política de privacidade" }} />;
}

export function Privacidade() {
  const dados = useDados();
  return <Documento titulo="Política de privacidade" secoes={dados && montarPrivacidade(dados)} outro={{ href: "/termos", rotulo: "Termos de uso" }} />;
}
