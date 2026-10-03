/**
 * A entidade beneficiada pela rifa: quando o organizador destina a rifa (ou
 * parte dela) a uma ONG, fundação ou outra organização, o banner dela vai em
 * cima da rifa e, tocado, abre a tela da entidade — a imagem grande, o texto
 * (o que ela diz e o que já fez), o site e as redes. Só existe quando há
 * entidade beneficiada; sem ela, nada aparece. Regras puras — a tela e o
 * servidor leem daqui.
 */
import { temLinkOuTelefone } from "./comentarios";
import { REDES_DO_RODAPE } from "./template";

/** O banner (3:1, cortado ao centro) e a imagem grande da tela da entidade. */
export const BANNER_DIVULGACAO_LARGURA = 1200;
export const BANNER_DIVULGACAO_ALTURA = 400;
export const IMAGEM_GRANDE_LADO = 1200;

export const NOME_DA_ENTIDADE_MAX = 80;
export const TEXTO_DA_ENTIDADE_MAX = 2000;

/**
 * As redes da entidade: as de vitrine. WhatsApp e Telegram ficam de fora —
 * conversa direta com quem recebe dinheiro é o caminho do Pix por fora, a
 * mesma razão de a legenda não aceitar telefone.
 */
export const REDES_DA_ENTIDADE = ["instagram", "facebook", "youtube", "tiktok", "x"] as const;
export type RedeDaEntidade = (typeof REDES_DA_ENTIDADE)[number];

export interface DadosDaEntidade {
  nome: string;
  texto: string;
  site: string | null;
  redes: { rede: RedeDaEntidade; link: string }[];
}

export class EntidadeInvalida extends Error {}

const limpar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function semLinkNemTelefone(texto: string, oQue: string) {
  const p = temLinkOuTelefone(texto);
  if (p) throw new EntidadeInvalida(`${oQue} ${p.charAt(0).toLowerCase()}${p.slice(1)}`);
}

/** Endereço `https:` de domínio de verdade, sem usuário nem senha. */
function urlSegura(bruta: string, oQue: string): URL {
  if (bruta.length > 300) throw new EntidadeInvalida(`${oQue}: endereço longo demais.`);
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(bruta) ? bruta : `https://${bruta}`);
  } catch {
    throw new EntidadeInvalida(`${oQue}: endereço inválido.`);
  }
  if (u.protocol !== "https:") throw new EntidadeInvalida(`${oQue}: só endereços https.`);
  const host = u.hostname.toLowerCase();
  // Domínio de verdade: nada de IP, de host sem ponto ou terminado em ponto.
  if (u.username || u.password || !host.includes(".") || host.endsWith(".") || /^[\d.]+$/.test(host) || host.startsWith("[")) {
    throw new EntidadeInvalida(`${oQue}: endereço inválido.`);
  }
  return u;
}

/**
 * O site da entidade não pode ser conversa direta (WhatsApp, Telegram) nem
 * levar telefone no endereço — o mesmo motivo de o texto não aceitar
 * telefone: é o caminho do Pix por fora.
 */
function siteSeguro(bruta: string): string {
  const u = urlSegura(bruta, "Site");
  const host = u.hostname.toLowerCase();
  if (REDES_DO_RODAPE.whatsapp.dominio.test(host) || REDES_DO_RODAPE.telegram.dominio.test(host)) {
    throw new EntidadeInvalida("Site: WhatsApp e Telegram não entram — use o site da entidade.");
  }
  let resto = u.pathname + u.search + u.hash;
  try {
    resto = decodeURIComponent(resto);
  } catch {
    /* fica como veio */
  }
  if (/\d{8,}/.test(resto.replace(/[\s().+-]/g, ""))) throw new EntidadeInvalida("Site: o endereço não pode levar número de telefone.");
  return u.toString();
}

/**
 * Confere e limpa o que veio do formulário. Só as chaves conhecidas; o nome
 * é o texto alternativo do banner. Texto, nome: sem link e sem telefone (o
 * site e as redes têm campo próprio, conferido); cada rede só no domínio dela.
 */
export function validarEntidade(bruto: unknown): DadosDaEntidade {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const nome = limpar(b.nome).replace(/\s+/g, " ");
  if (nome.length < 3) throw new EntidadeInvalida("Diga o nome da entidade beneficiada.");
  if (nome.length > NOME_DA_ENTIDADE_MAX) throw new EntidadeInvalida(`O nome passa de ${NOME_DA_ENTIDADE_MAX} caracteres.`);
  semLinkNemTelefone(nome, "O nome");

  const texto = limpar(b.texto).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  if (texto.length < 10) throw new EntidadeInvalida("Conte em poucas linhas o que a entidade faz.");
  if (texto.length > TEXTO_DA_ENTIDADE_MAX) throw new EntidadeInvalida(`O texto passa de ${TEXTO_DA_ENTIDADE_MAX} caracteres.`);
  semLinkNemTelefone(texto, "O texto");

  const siteBruto = limpar(b.site);
  const site = siteBruto ? siteSeguro(siteBruto) : null;

  const redesBrutas = b.redes ?? [];
  if (!Array.isArray(redesBrutas)) throw new EntidadeInvalida("As redes sociais precisam ser uma lista.");
  const vistas = new Set<string>();
  const redes: DadosDaEntidade["redes"] = [];
  for (const r of redesBrutas as { rede?: unknown; link?: unknown }[]) {
    const rede = typeof r?.rede === "string" ? r.rede : "";
    if (!(REDES_DA_ENTIDADE as readonly string[]).includes(rede)) throw new EntidadeInvalida("Escolha uma rede da lista.");
    const { nome: nomeDaRede, dominio } = REDES_DO_RODAPE[rede as RedeDaEntidade];
    const link = limpar(r.link);
    if (!link) continue; // campo deixado em branco
    if (vistas.has(rede)) throw new EntidadeInvalida(`${nomeDaRede} aparece duas vezes.`);
    vistas.add(rede);
    const u = urlSegura(link, nomeDaRede);
    if (!dominio.test(u.hostname.toLowerCase())) {
      throw new EntidadeInvalida(`${nomeDaRede}: o endereço precisa ser do próprio ${nomeDaRede}.`);
    }
    redes.push({ rede: rede as RedeDaEntidade, link: u.toString() });
  }
  return { nome, texto, site, redes };
}

/** Os endereços públicos das imagens (com `?v=`: troca de imagem, troca de endereço). */
export const urlDoBannerDeDivulgacao = (slug: string, em: Date | string, grande = false) =>
  `/api/public/campaigns/${slug}/banner-divulgacao?v=${new Date(em).getTime()}${grande ? "&tam=grande" : ""}`;
