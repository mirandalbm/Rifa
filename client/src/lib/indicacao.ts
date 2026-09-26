import { codigoDeIndicacaoValido } from "@shared/bonus";
import { apiRequest } from "@/lib/queryClient";

/**
 * Link de indicação (etapa 13): `/?ind=CODIGO`. O código fica no aparelho
 * por 30 dias e vai junto na próxima compra — quem decide se vale é o
 * servidor (primeira compra, sem autoindicação). A visita é contada uma vez
 * por código neste aparelho. Perder o armazenamento só perde o bônus de
 * quem indicou; a compra nunca depende disto.
 */
const CHAVE = "rifa.indicacao";
const VISITAS = "rifa.indicacao.visitas";
const VALIDADE_MS = 30 * 86_400_000;

export function marcarIndicacaoPelaUrl(busca = window.location.search) {
  const codigo = new URLSearchParams(busca).get("ind")?.toUpperCase();
  if (!codigoDeIndicacaoValido(codigo)) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ codigo, em: Date.now() }));
    const vistos: string[] = JSON.parse(localStorage.getItem(VISITAS) ?? "[]");
    if (vistos.includes(codigo)) return;
    localStorage.setItem(VISITAS, JSON.stringify([...vistos, codigo].slice(-20)));
  } catch {
    // armazenamento bloqueado: a visita ainda conta uma vez nesta carga
  }
  apiRequest("POST", "/api/public/bonus/visita", { codigo }).catch(() => {});
}

export function lerIndicacao(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { codigo?: string; em?: number } | null;
    if (!v?.codigo || !v.em || Date.now() - v.em > VALIDADE_MS) return undefined;
    return codigoDeIndicacaoValido(v.codigo) ? v.codigo : undefined;
  } catch {
    return undefined;
  }
}
