/**
 * O manifesto do app instalado (`/manifest.webmanifest`), montado do
 * template publicado: o nome e a cor de marca que a plataforma escolheu em
 * Aparência, e, se houver logo, o ícone feito dela. Puro — o servidor traz
 * os dados e a rota só entrega o resultado, para o teste exercitar tudo.
 *
 * Só dados conhecidos entram: nome limpo e curto, cor no formato `#rrggbb`
 * (o template já a valida, mas o manifesto é lido pelo sistema do celular e
 * não confia em ninguém), ícones em endereços nossos.
 */

export const NOME_PADRAO = "rifa.br";
/** O nome curto (embaixo do ícone na tela inicial) cabe em ~12 letras. */
export const NOME_CURTO_MAX = 12;
export const COR_PADRAO = "#00873e";

export interface EntradaDoManifesto {
  nome: string;
  /** A cor de marca do tema claro. */
  cor: string;
  /** A versão da logo (a data do arquivo) — sem logo, nulo e valem os ícones de fábrica. */
  logoVersao: string | null;
}

/** Nome limpo: sem espaço sobrando nem quebra de linha, no máximo 40 letras. */
export function nomeDoApp(nome: string): string {
  const limpo = String(nome ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return limpo || NOME_PADRAO;
}

/** Corta no fim de uma palavra quando dá; senão, nas 12 primeiras letras. */
export function nomeCurtoDoApp(nome: string): string {
  const n = nomeDoApp(nome);
  if (n.length <= NOME_CURTO_MAX) return n;
  const palavras = n.split(" ");
  const primeira = palavras[0];
  if (primeira.length <= NOME_CURTO_MAX) {
    let curto = primeira;
    for (const p of palavras.slice(1)) {
      if (`${curto} ${p}`.length > NOME_CURTO_MAX) break;
      curto = `${curto} ${p}`;
    }
    return curto;
  }
  return primeira.slice(0, NOME_CURTO_MAX);
}

export function corDoApp(cor: string): string {
  return /^#[0-9a-f]{6}$/i.test(String(cor ?? "")) ? cor.toLowerCase() : COR_PADRAO;
}

export function montarManifest({ nome, cor, logoVersao }: EntradaDoManifesto) {
  const v = logoVersao && /^[0-9a-z]{1,20}$/i.test(logoVersao) ? `?v=${logoVersao}` : null;
  const icones = v
    ? [
        { src: `/api/public/marca/icone/192${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/api/public/marca/icone/512${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/api/public/marca/icone/maskable${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  const atalho = icones[0];
  return {
    name: nomeDoApp(nome),
    short_name: nomeCurtoDoApp(nome),
    description: "Rifas online com pagamento por Pix e sorteio auditável.",
    lang: "pt-BR",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: corDoApp(cor),
    icons: icones,
    shortcuts: [
      { name: "Minhas cotas", url: "/minhas-cotas", icons: [{ src: atalho.src, sizes: atalho.sizes }] },
      { name: "Entrar no painel", url: "/entrar", icons: [{ src: atalho.src, sizes: atalho.sizes }] },
    ],
  };
}
