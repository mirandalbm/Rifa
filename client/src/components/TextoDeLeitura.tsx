import type { Secao } from "@shared/regulamento";

/**
 * O texto de leitura (Termos, Privacidade e o regulamento da rifa): seção
 * com o título de 18 e os parágrafos de 14 com entrelinha de 21, na coluna
 * estreita do `PublicShell` — linha longa cansa.
 */
export function TextoDeLeitura({ secoes }: { secoes: Secao[] }) {
  return (
    <article className="mt-[18px] space-y-[18px] text-sm leading-[21px] [overflow-wrap:anywhere]">
      {secoes.map((s) => (
        <section key={s.titulo}>
          <h2 className="font-display text-lg font-bold leading-snug">{s.titulo}</h2>
          {s.itens.map((i) => (
            <p key={i} className="mt-2 text-ink-2">
              {i}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
