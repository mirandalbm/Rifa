import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FotoDoApostador } from "@/components/PerfilDoApostador";

interface QuemJoga {
  pessoas: { apelido: string; foto: string | null }[];
  /** Há mais gente com perfil aberto além dos mostrados (sem dizer quantas). */
  mais: boolean;
}

/**
 * "Quem também joga": mini-perfis de quem comprou esta rifa e abriu o perfil
 * público (opt-in, nasce desligado — participar de rifa é dado pessoal).
 * Só apelido e foto; levam ao perfil `/u/<apelido>`. Sem ninguém, não existe:
 * nada de contador inventado nem "e outras 0 pessoas".
 */
export function QuemTambemJoga({ slug }: { slug: string }) {
  const { data } = useQuery<QuemJoga>({ queryKey: [`/api/public/campaigns/${slug}/quem-joga`], staleTime: 30_000 });
  if (!data || data.pessoas.length === 0) return null;
  const nomes = data.pessoas.slice(0, 2).map((p) => `@${p.apelido}`);
  const resto = data.pessoas.length - nomes.length;
  const texto =
    resto > 0 || data.mais
      ? `${nomes.join(", ")} e outras pessoas também jogam esta rifa`
      : nomes.length === 1
        ? `${nomes[0]} também joga esta rifa`
        : `${nomes.join(" e ")} também jogam esta rifa`;
  return (
    <section aria-label="Quem também joga esta rifa" className="mt-2 flex items-center gap-2 px-4 text-xs text-ink-2 lg:px-0">
      <ul className="flex shrink-0 -space-x-2">
        {data.pessoas.map((p) => (
          <li key={p.apelido}>
            <Link href={`/u/${p.apelido}`} aria-label={`Ver o perfil de @${p.apelido}`} className="block rounded-full ring-2 ring-white">
              <FotoDoApostador nome={p.apelido} foto={p.foto} tamanho={24} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="min-w-0">{texto}</p>
    </section>
  );
}
