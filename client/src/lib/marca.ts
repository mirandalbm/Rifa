/**
 * A logo escrita "Loterias do Bem" (o B desenhado como a folha vermelha do
 * ícone) só vale para esse nome. Com outro nome publicado no template, a
 * tela segue mostrando o nome em texto — a logo nunca diz um nome que a
 * plataforma não publicou.
 */
export const NOME_DA_LOGO_ESCRITA = "Loterias do Bem";

/**
 * As cores da logo escrita em cada tema, tiradas do ícone: o verde das folhas
 * (de cima, mais claro, para baixo) e o vermelho da folha (a metade de cima
 * clara e a de baixo escura). Identidade, nunca estado. Os tokens `--logo-*`
 * do `index.css` têm estes valores (`tests/marca.test.ts` confere), e o
 * gerador (`npm run logo-escrita`) desenha os arquivos de `docs/marca/` com
 * eles.
 */
export const CORES_DA_LOGO = {
  claro: {
    "--logo-verde-luz": "#3aa63a",
    "--logo-verde": "#007931",
    "--logo-vermelho-luz": "#e2383e",
    "--logo-vermelho": "#d62931",
    "--logo-vermelho-escuro": "#b61d25",
    "--logo-vermelho-fundo": "#9c1820",
  },
  escuro: {
    "--logo-verde-luz": "#9be06a",
    "--logo-verde": "#4cc35a",
    "--logo-vermelho-luz": "#f46a6f",
    "--logo-vermelho": "#ec4a50",
    "--logo-vermelho-escuro": "#d42f37",
    "--logo-vermelho-fundo": "#c0222b",
  },
} as const;

function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** O nome publicado é o da logo escrita? (sem diferença de acento, maiúscula ou espaço). */
export function usaLogoEscrita(nome: string): boolean {
  return normalizar(nome) === normalizar(NOME_DA_LOGO_ESCRITA);
}
