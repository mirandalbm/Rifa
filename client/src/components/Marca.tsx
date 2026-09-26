import { useTemplate } from "@/lib/template";

/**
 * Nome (ou logo) da plataforma, como o template manda. Sem logo, o nome com
 * o ponto na cor de marca — o "rifa.br" de sempre é só o template padrão.
 */
export function Marca({ className = "" }: { className?: string }) {
  const { nome, logo } = useTemplate().identidade;
  if (logo) {
    return <img src={logo} alt={nome} className={`h-7 w-auto ${className}`} />;
  }
  const i = nome.lastIndexOf(".");
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      {i > 0 ? (
        <>
          {nome.slice(0, i)}
          <span className="text-marca">.</span>
          {nome.slice(i + 1)}
        </>
      ) : (
        nome
      )}
    </span>
  );
}
