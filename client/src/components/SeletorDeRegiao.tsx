import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { LocaisDaVitrine } from "@/components/LocaisDaVitrine";
import { LOCAL_NACIONAL, ROTULO_DOS_LOCAIS, escolhaDoLocal, rotuloDoLocalEmVigor } from "@shared/locais";
import { UFS, type UF } from "@shared/endereco";
import { gravarRegiao, lerRegiao, ouvirRegiao, regiaoEfetiva, type EscolhaDeRegiao } from "@/lib/regiao";
import { useSession } from "@/lib/session";

/**
 * A região que ordena a vitrine e o seletor que a escolhe. Vive em dois
 * lugares ao mesmo tempo — o topo (tablet e celular) e a lateral (computador) —,
 * por isso a escolha passa por `ouvirRegiao`: o que muda num, muda no outro.
 */
export function useRegiaoDaVitrine() {
  const { data: sessao } = useSession();
  const naConta = Boolean(sessao?.buyer?.conta);
  // Com conta, a região vem do CEP do cadastro; a escolha no painel vale mais.
  const { data: conta } = useQuery<{ uf: string | null; cidade: string | null }>({
    queryKey: ["/api/public/conta"],
    enabled: naConta,
  });
  const [escolha, setEscolha] = useState<EscolhaDeRegiao>(() => lerRegiao());
  useEffect(() => ouvirRegiao(() => setEscolha(lerRegiao())), []);

  const regiao = regiaoEfetiva(escolha, conta);
  // O estado marcado no painel é só a escolha manual; sem ela, "Nacional".
  const manual = typeof escolha === "object" && escolha !== null;
  const valor = manual ? escolha.uf : "";
  // Escolher só grava a escolha (ou a limpa, no "Nacional"): quem ordena é o
  // servidor, por `ordenarPorProximidade()`, e nenhuma rifa some.
  const aoEscolherUf = (uf: string) => gravarRegiao(escolhaDoLocal(uf, conta));
  const nome = valor ? (UFS as Record<string, string>)[valor] : LOCAL_NACIONAL.nome;
  const rotulo = rotuloDoLocalEmVigor({ uf: (regiao?.uf as UF | undefined) ?? null, manual });
  // Sem escolha manual, a conta ordena pelo CEP dela: o painel avisa.
  const automatica = !manual && regiao ? regiao : null;
  return { regiao, valor, nome, rotulo, automatica, aoEscolherUf };
}

/**
 * "Locais": o estado da vitrine como ícone, que abre o painel com os 27
 * estados e a bandeira de cada um (`LocaisDaVitrine`). No topo (`lateral`
 * falso), o pino de 40 px ao lado da varinha. Na lateral do computador, um
 * item como os outros: o pino e a sigla embaixo quando a lateral está
 * recolhida; "Locais" e o nome do estado quando abre. É um botão de verdade
 * (teclado, leitor de tela) e o estado escolhido vai no rótulo. Escolher só
 * ordena as rifas — nenhuma some.
 */
export function SeletorDeRegiao({ lateral = false }: { lateral?: boolean }) {
  const { valor, nome, rotulo, automatica, aoEscolherUf } = useRegiaoDaVitrine();
  const [aberto, setAberto] = useState(false);
  const painel = aberto ? (
    <LocaisDaVitrine
      valor={valor}
      automatica={automatica ? (UFS as Record<string, string>)[automatica.uf] : null}
      onEscolher={aoEscolherUf}
      onFechar={() => setAberto(false)}
    />
  ) : null;

  if (!lateral) {
    return (
      <>
        <button
          type="button"
          aria-label={rotulo}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          title={rotulo}
          onClick={() => setAberto(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-mist focus-visible:ring-2 focus-visible:ring-marca"
        >
          <MapPin size={24} aria-hidden />
        </button>
        {painel}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={rotulo}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title={rotulo}
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-4 rounded-lg p-3 text-left text-ink hover:bg-mist focus-visible:ring-2 focus-visible:ring-marca"
      >
        <span className="flex w-6 shrink-0 flex-col items-center">
          <MapPin size={24} aria-hidden />
          <span aria-hidden className="tnum text-[10px] font-semibold leading-none text-ink-2 group-hover/lateral:hidden group-focus-within/lateral:hidden">
            {valor || "BR"}
          </span>
        </span>
        <span className="hidden min-w-0 flex-col text-[15px] leading-snug group-hover/lateral:flex group-focus-within/lateral:flex">
          <span className="whitespace-nowrap text-ink-2">{ROTULO_DOS_LOCAIS}</span>
          <strong className="truncate font-semibold">{nome}</strong>
        </span>
      </button>
      {painel}
    </>
  );
}
