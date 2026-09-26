import { ufValida, type UF } from "@shared/endereco";

/**
 * A região de quem olha a vitrine. Com conta, vem do CEP do cadastro; a
 * escolha no seletor de estado vale mais e fica neste aparelho. É
 * conveniência — ordena as rifas, não esconde nenhuma —, então pode sumir sem
 * estrago (aba anônima, dados limpos): volta a valer a da conta.
 *
 * - `null`: nenhuma escolha — usa a da conta, se houver;
 * - `"todos"`: a pessoa pediu o Brasil inteiro, sem ordem por região;
 * - `{ uf, cidade }`: a escolha dela.
 */
export interface MinhaRegiao {
  uf: UF;
  cidade: string | null;
}
export type EscolhaDeRegiao = MinhaRegiao | "todos" | null;

const CHAVE = "rifa.regiao";

export function lerRegiao(): EscolhaDeRegiao {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    if (bruto === "todos") return "todos";
    if (!bruto || !ufValida(bruto.uf)) return null;
    return { uf: bruto.uf, cidade: typeof bruto.cidade === "string" ? bruto.cidade : null };
  } catch {
    return null;
  }
}

export function gravarRegiao(r: EscolhaDeRegiao) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento, a escolha vale só nesta visita */
  }
}

/** A região que de fato ordena: a escolha, senão a da conta. */
export function regiaoEfetiva(
  escolha: EscolhaDeRegiao,
  conta: { uf?: string | null; cidade?: string | null } | null | undefined,
): MinhaRegiao | null {
  if (escolha === "todos") return null;
  if (escolha) return escolha;
  return conta?.uf && ufValida(conta.uf) ? { uf: conta.uf, cidade: conta.cidade ?? null } : null;
}
