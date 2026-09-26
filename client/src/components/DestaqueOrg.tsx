import type { CSSProperties, ReactNode } from "react";
import { Facebook, Globe, Instagram, MessageCircle, Music2, Send, Youtube, type LucideIcon } from "lucide-react";
import { redeDoLink, type CorDeDestaque, type LinkDoPerfil, type RedeDoLink } from "@shared/perfil";

/**
 * Aplica a cor de destaque da organização ao que está dentro (troca
 * `--marca`, nos dois temas — ver `.destaque-org` no `index.css`). Sem cor,
 * vale a da plataforma.
 */
export function DestaqueOrg({
  cor,
  children,
  className = "",
}: {
  cor: CorDeDestaque | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!cor) return <div className={className}>{children}</div>;
  const estilo = { "--destaque-claro": cor.claro, "--destaque-escuro": cor.escuro } as CSSProperties;
  return (
    <div className={`destaque-org ${className}`} style={estilo}>
      {children}
    </div>
  );
}

const ICONE: Record<RedeDoLink, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  facebook: Facebook,
  whatsapp: MessageCircle,
  telegram: Send,
  site: Globe,
};

/**
 * Os links da bio. `nofollow ugc`: é texto do organizador, não indicação da
 * plataforma; e `noopener` para a página aberta não mexer nesta.
 */
export function LinksDoPerfil({ links }: { links: LinkDoPerfil[] }) {
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 pt-1">
      {links.map((l) => {
        const Icone = ICONE[redeDoLink(l.url).rede];
        return (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-xs font-semibold text-marca hover:bg-mist"
            >
              <Icone size={13} aria-hidden />
              {l.rotulo}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
