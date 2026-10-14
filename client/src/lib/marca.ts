/**
 * A logo escrita "Loterias do Bem": as letras da logo oficial da intro, numa
 * linha, ao lado do trevo do ícone. Só vale para esse nome. Com outro nome
 * publicado no template, a tela segue mostrando o nome em texto — a logo
 * nunca diz um nome que a plataforma não publicou.
 */
export const NOME_DA_LOGO_ESCRITA = "Loterias do Bem";

/**
 * As cores da logo escrita em cada tema: o verde das letras da logo oficial
 * ("Loterias do") e o vermelho dos corações dela ("Bem"). No escuro, os mesmos
 * papéis em tons claros, para ler sobre o preto. Identidade, nunca estado. Os
 * tokens `--logo-*` do `index.css` têm estes valores (`tests/marca.test.ts`
 * confere), e o gerador (`npm run logo-escrita`) desenha os arquivos de
 * `docs/marca/` com eles.
 */
export const CORES_DA_LOGO = {
  claro: {
    "--logo-verde": "#026a35",
    "--logo-vermelho": "#d62931",
  },
  escuro: {
    "--logo-verde": "#4cc35a",
    "--logo-vermelho": "#ec4a50",
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
