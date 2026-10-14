/**
 * A logo escrita "Loterias do Bem" (o B desenhado como a folha vermelha do
 * ícone) só vale para esse nome. Com outro nome publicado no template, a
 * tela segue mostrando o nome em texto — a logo nunca diz um nome que a
 * plataforma não publicou.
 */
export const NOME_DA_LOGO_ESCRITA = "Loterias do Bem";

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
