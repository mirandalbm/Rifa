import { useQuery } from "@tanstack/react-query";
import {
  CORES_DO_SELO_PADRAO,
  PALETA_DO_SELO,
  ROTULO_DO_SELO,
  type CorDoSelo,
  type CoresDoSelo,
  type Sujeito,
} from "@shared/verificacao";

/** As cores que a plataforma escolheu (paleta de 12); sem resposta, as padrão. */
export function useCoresDoSelo(): CoresDoSelo {
  const { data } = useQuery<{ cores: CoresDoSelo }>({ queryKey: ["/api/public/selos"], staleTime: 60_000 });
  return data?.cores ?? CORES_DO_SELO_PADRAO;
}

/**
 * O trevo de quatro folhas com o sinal de confirmação — o selo de
 * verificado. A cor diz de quem é (apostador, afiliado, organização) e o
 * rótulo vai junto no `title` e no `aria-label`: estado nunca só por cor.
 */
export function Trevo({ cor, tamanho = 16, rotulo }: { cor: string; tamanho?: number; rotulo: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      role="img"
      aria-label={rotulo}
      className="inline-block shrink-0 align-[-0.15em]"
    >
      <title>{rotulo}</title>
      <g fill={cor}>
        <circle cx="12" cy="6.6" r="5.4" />
        <circle cx="12" cy="17.4" r="5.4" />
        <circle cx="6.6" cy="12" r="5.4" />
        <circle cx="17.4" cy="12" r="5.4" />
      </g>
      <path d="M7.6 12.3l3 3 5.8-6" fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SeloVerificado({
  sujeito,
  tamanho = 16,
  cor,
}: {
  sujeito: Sujeito;
  tamanho?: number;
  /** Para a pré-visualização da escolha de cores. */
  cor?: CorDoSelo;
}) {
  const cores = useCoresDoSelo();
  return <Trevo cor={PALETA_DO_SELO[cor ?? cores[sujeito]].hex} tamanho={tamanho} rotulo={ROTULO_DO_SELO[sujeito]} />;
}

/** Nome com o selo ao lado, se verificado. */
export function ComSelo({
  sujeito,
  verificado,
  children,
  tamanho,
}: {
  sujeito: Sujeito;
  verificado: boolean | null | undefined;
  children: React.ReactNode;
  tamanho?: number;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{children}</span>
      {verificado && <SeloVerificado sujeito={sujeito} tamanho={tamanho} />}
    </span>
  );
}
