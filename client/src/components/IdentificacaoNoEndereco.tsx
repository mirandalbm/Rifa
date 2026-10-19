import { useQuery } from "@tanstack/react-query";
import { slugDoEndereco } from "@/lib/endereco";
import { useTemplate } from "@/lib/template";
import { identificacaoDaPlataforma, identificacaoDaPromotora } from "@shared/rodape";

type PerfilResumido = { nome: string; cnpj: string | null; local: string | null; autorizacoes: string[] };

/**
 * No endereço da organização, a promotora é quem vende: nome empresarial, CNPJ,
 * cidade e autorização SPA/MF aparecem no alto, sem rolar (Decreto 7.962/2013,
 * art. 2º, I e II — parecer R31 de 18/10/2026). Usa a mesma consulta do perfil,
 * então não custa outra chamada.
 */
export function FaixaDaPromotora({ largura }: { largura: string }) {
  const slug = slugDoEndereco();
  const { data } = useQuery<PerfilResumido>({ queryKey: [`/api/public/o/${slug}`], enabled: Boolean(slug) });
  if (!slug || !data) return null;
  const p = identificacaoDaPromotora(data);
  return (
    <section aria-label="Quem realiza a rifa" className="border-b border-line bg-mist">
      <p className={`mx-auto ${largura} px-4 py-1.5 text-[11px] leading-snug text-ink-2`}>
        <span className="font-semibold text-ink">{p.nome}</span>
        {p.cnpj ? (
          <>
            {" · CNPJ "}
            <span className="tnum">{p.cnpj}</span>
          </>
        ) : null}
        {p.local ? ` · ${p.local}` : null}
        {p.autorizacoes.length ? (
          <>
            {" · Autorização SPA/MF "}
            <span className="tnum">{p.autorizacoes.join(" · ")}</span>
          </>
        ) : null}
      </p>
    </section>
  );
}

/** A plataforma aparece como operadora técnica, em corpo menor mas legível (R31). */
export function OperadoraNoEndereco({ largura }: { largura: string }) {
  const t = useTemplate();
  const op = identificacaoDaPlataforma(t.legal);
  if (!op) return null;
  return (
    <p className={`mx-auto ${largura} border-t border-line px-4 py-3 text-[11px] leading-snug text-muted`}>
      Plataforma operada por {op.razaoSocial} · CNPJ <span className="tnum">{op.cnpj}</span>
      {op.email ? (
        <>
          {" · "}
          <a href={`mailto:${op.email}`} className="underline hover:text-ink">
            {op.email}
          </a>
        </>
      ) : null}
    </p>
  );
}
