import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { UFS, ufValida } from "@shared/endereco";
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
  // Com conta, a região vem do CEP do cadastro; a escolha no seletor vale mais.
  const { data: conta } = useQuery<{ uf: string | null; cidade: string | null }>({
    queryKey: ["/api/public/conta"],
    enabled: naConta,
  });
  const [escolha, setEscolha] = useState<EscolhaDeRegiao>(() => lerRegiao());
  useEffect(() => ouvirRegiao(() => setEscolha(lerRegiao())), []);

  const regiao = regiaoEfetiva(escolha, conta);
  const valor = escolha === "todos" ? "" : (regiao?.uf ?? "");
  const aoEscolherUf = (uf: string) => {
    if (!uf) return gravarRegiao("todos");
    if (conta?.uf === uf) return gravarRegiao(null);
    if (ufValida(uf)) gravarRegiao({ uf, cidade: null });
  };
  const nome = valor ? (UFS as Record<string, string>)[valor] : "Todo o Brasil";
  return { regiao, valor, nome, aoEscolherUf };
}

function OpcoesDeUf() {
  return (
    <>
      <option value="">Todo o Brasil</option>
      {Object.entries(UFS).map(([sigla, nome]) => (
        <option key={sigla} value={sigla}>
          {nome}
        </option>
      ))}
    </>
  );
}

/**
 * O seletor de estado como ícone. No topo (`lateral` falso), o pino de 40 px
 * ao lado da varinha. Na lateral do computador, um item como os outros: o
 * pino e a sigla embaixo quando a lateral está recolhida; o nome completo
 * quando abre. O `<select>` de verdade fica por cima, transparente — o toque,
 * o teclado e o leitor de tela são dele, e o estado escolhido vai no rótulo.
 */
export function SeletorDeRegiao({ lateral = false }: { lateral?: boolean }) {
  const { valor, nome, aoEscolherUf } = useRegiaoDaVitrine();
  const rotulo = `Rifas perto de: ${nome}`;
  const select = (
    <select
      aria-label={rotulo}
      value={valor}
      onChange={(e) => aoEscolherUf(e.target.value)}
      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
    >
      <OpcoesDeUf />
    </select>
  );

  if (!lateral) {
    return (
      <div
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink focus-within:ring-2 focus-within:ring-marca hover:bg-mist"
        title={rotulo}
      >
        <MapPin size={24} aria-hidden />
        {select}
      </div>
    );
  }
  return (
    <div
      className="relative flex w-full items-center gap-4 rounded-lg p-3 text-ink hover:bg-mist focus-within:ring-2 focus-within:ring-marca"
      title={rotulo}
    >
      <span className="flex w-6 shrink-0 flex-col items-center">
        <MapPin size={24} aria-hidden />
        <span aria-hidden className="tnum text-[10px] font-semibold leading-none text-ink-2 group-hover/lateral:hidden group-focus-within/lateral:hidden">
          {valor || "BR"}
        </span>
      </span>
      <span className="hidden min-w-0 flex-col text-[15px] leading-snug group-hover/lateral:flex group-focus-within/lateral:flex">
        <span className="whitespace-nowrap text-ink-2">Rifas perto de</span>
        <strong className="truncate font-semibold">{nome}</strong>
      </span>
      {select}
    </div>
  );
}
