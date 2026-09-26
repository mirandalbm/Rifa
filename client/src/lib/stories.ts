/**
 * O "visto" dos stories fica no aparelho: o instante do último story aberto
 * de cada perfil. É conveniência, como a região e o tema — perder só acende
 * o anel de novo.
 */
const CHAVE = "rifa.stories.vistos";

function ler(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function vistoAte(slug: string): string | null {
  return ler()[slug] ?? null;
}

export function marcarVisto(slug: string, criadoEm: string) {
  try {
    const todos = ler();
    const antes = todos[slug];
    if (antes && new Date(antes) >= new Date(criadoEm)) return;
    todos[slug] = criadoEm;
    localStorage.setItem(CHAVE, JSON.stringify(todos));
    window.dispatchEvent(new Event("rifa:stories-vistos"));
  } catch {
    // armazenamento bloqueado: o anel só volta a acender
  }
}
