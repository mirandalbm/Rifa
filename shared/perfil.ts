/**
 * Perfil do organizador (`/o/:slug`), no formato do Instagram.
 *
 * Puro, sem banco: o servidor monta a resposta com isto e a tela mostra com
 * isto. O que decide quem aparece em "seguido por" mora aqui — a regra de
 * privacidade não pode ter duas cópias.
 */
import { formatBRL } from "./format";

export const BIO_MAX = 300;

/** A bio do organizador: texto simples, uma linha em branco no máximo. */
export function validarBio(bruta: unknown): string | null {
  if (bruta === null || bruta === undefined) return null;
  if (typeof bruta !== "string") throw new Error("A bio precisa ser texto.");
  const bio = bruta
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (bio.length > BIO_MAX) throw new Error(`A bio passa de ${BIO_MAX} caracteres.`);
  return bio || null;
}

export interface RifaDaBio {
  prizeTitle: string;
  drawAt: string | Date | null;
  authorizationCode: string | null;
  priceCents: number;
}

/**
 * A parte da bio que se escreve sozinha, a partir da rifa no ar mais
 * próxima do sorteio. Muda quando outra rifa é publicada — o organizador
 * não precisa lembrar de atualizar.
 */
export function bioAutomatica(rifa: RifaDaBio | null, fuso = "America/Sao_Paulo"): string[] {
  if (!rifa) return [];
  const linhas = [`🏆 ${rifa.prizeTitle}`];
  if (rifa.drawAt) {
    const d = new Date(rifa.drawAt);
    const dia = d.toLocaleDateString("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric" });
    const hora = d.toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
    linhas.push(`📅 Sorteio ${dia} às ${hora} · Loteria Federal`);
  }
  linhas.push(`🎟️ Cota ${formatBRL(rifa.priceCents)}`);
  if (rifa.authorizationCode) linhas.push(`✅ Autorização SPA/MF ${rifa.authorizationCode}`);
  return linhas;
}

export function primeiroNome(nome: string | null | undefined): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * "Seguido por Ana, Bruno e outras 12 pessoas". Só entra nome de quem ligou
 * o perfil público; os outros viram número. Sem ninguém público, `null` —
 * o contador de seguidores já diz quantos são.
 */
export function seguidoPor(nomesPublicos: string[], total: number): string | null {
  const nomes = nomesPublicos.map(primeiroNome).filter(Boolean).slice(0, 2);
  if (nomes.length === 0) return null;
  const outros = Math.max(0, total - nomes.length);
  const lista = nomes.join(" e ");
  if (outros === 0) return `Seguido por ${lista}`;
  const base = nomes.length === 2 ? nomes.join(", ") : nomes[0];
  return `Seguido por ${base} e ${outros === 1 ? "outra pessoa" : `outras ${outros} pessoas`}`;
}

/** 1234 → "1.234"; 15300 → "15,3 mil" — como o contador do Instagram. */
export function contador(n: number): string {
  if (n < 10_000) return n.toLocaleString("pt-BR");
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toLocaleString("pt-BR")} mil`;
  return `${(Math.floor(n / 100_000) / 10).toLocaleString("pt-BR")} mi`;
}

export type Rede = "whatsapp" | "telegram" | "facebook" | "instagram" | "tiktok";

export const NOME_REDE: Record<Rede, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/**
 * Link de compartilhar de cada rede. Instagram e TikTok não aceitam link
 * pronto pela web: para eles é `null`, e a tela copia o endereço e avisa.
 */
export function linkDeCompartilhar(rede: Rede, url: string, texto: string): string | null {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(texto);
  switch (rede) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    default:
      return null;
  }
}

/** WhatsApp da organização a partir do contato, se for um telefone. */
export function whatsappDoContato(contato: string | null | undefined): string | null {
  const d = String(contato ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}
