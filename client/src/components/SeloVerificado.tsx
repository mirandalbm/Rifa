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

/** Uma folha em coração, com a ponta no centro; as quatro saem nas diagonais, como no trevo de verdade. */
export const FOLHA =
  "M50 50 L39 39 C25 25 20 8 33 4 C42 1.5 48 7 50 13 C52 7 58 1.5 67 4 C80 8 75 25 61 39 Z";

/**
 * O trevo de quatro folhas com o sinal de confirmação — o selo de
 * verificado. A cor diz de quem é (apostador, afiliado, organização) e o
 * rótulo vai junto no `title` e no `aria-label`: estado nunca só por cor.
 */
export function Trevo({ cor, tamanho = 16, rotulo }: { cor: string; tamanho?: number; rotulo: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamanho}
      height={tamanho}
      role="img"
      aria-label={rotulo}
      className="inline-block shrink-0 align-[-0.15em]"
    >
      <title>{rotulo}</title>
      {/* Quatro folhas em coração, com a ponta no centro — o trevo. */}
      <g fill={cor}>
        {[45, 135, 225, 315].map((giro) => (
          <path key={giro} d={FOLHA} transform={`rotate(${giro} 50 50)`} />
        ))}
      </g>
      <path d="M31 51 L44 64 L70 37" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinejoin="miter" />
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
