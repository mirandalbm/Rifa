import { ufValida, type UF } from "@shared/endereco";

/**
 * A região de quem olha a vitrine. É conveniência deste aparelho — ordena as
 * rifas, não esconde nenhuma —, então mora no navegador e pode sumir sem
 * estrago (aba anônima, dados limpos): a vitrine volta à ordem de sempre.
 */
export interface MinhaRegiao {
  uf: UF;
  cidade: string | null;
}

const CHAVE = "rifa.regiao";

export function lerRegiao(): MinhaRegiao | null {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    if (!bruto || !ufValida(bruto.uf)) return null;
    return { uf: bruto.uf, cidade: typeof bruto.cidade === "string" ? bruto.cidade : null };
  } catch {
    return null;
  }
}

export function gravarRegiao(r: MinhaRegiao | null) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento, a escolha vale só nesta visita */
  }
}
