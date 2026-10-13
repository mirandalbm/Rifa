/**
 * Endereço próprio (subdomínio) de cada organização e de cada afiliado.
 *
 * Organização: `<rotulo>.<base>` — o rótulo é o slug da organização. A página
 * dela e as divulgações saem por esse endereço, então quem recebe vê a marca
 * da promotora (white label), e não a vitrine da plataforma. Afiliado:
 * `af-<codigo>.<base>` — o perfil dele. A divulgação de rifa do afiliado sai
 * pelo endereço da organização, com `?ref=` dele (a comissão é da régua de
 * sempre, não do endereço).
 *
 * Só funções puras: quem monta e quem confere o endereço lê daqui. Sem
 * `base` configurado (o domínio ainda não existe), tudo devolve `null` e o
 * sistema segue com os endereços de hoje — a estrutura fica pronta, ligada
 * só quando o domínio e o certificado curinga (`*.base`) estiverem no ar.
 */

/** Limite de um rótulo DNS. O slug da organização aceita 80; o endereço, 63. */
export const TAMANHO_MAX_DO_ROTULO = 63;
export const TAMANHO_MIN_DO_ROTULO = 3;

/** Prefixo do endereço de afiliado. Organização não pode começar com ele. */
export const PREFIXO_DO_AFILIADO = "af-";

/** Nomes que não podem virar organização nem afiliado (são do sistema). */
export const RESERVADOS = new Set([
  "www", "api", "admin", "painel", "app", "mail", "smtp", "ftp",
  "static", "cdn", "assets", "img", "imagens", "uploads", "status",
  "suporte", "ajuda", "termos", "privacidade", "legal", "webhook",
  "webhooks", "dev", "teste", "staging", "homolog", "o", "r", "u", "c",
]);

const ROTULO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const CODIGO_DO_AFILIADO = /^[a-z0-9]{3,40}$/;

/** Mensagem em português para o rótulo recusado, ou `null` se ele vale. */
export function problemaNoRotulo(rotulo: string): string | null {
  if (rotulo.length < TAMANHO_MIN_DO_ROTULO) return "O endereço precisa de pelo menos 3 letras ou números.";
  if (rotulo.length > TAMANHO_MAX_DO_ROTULO) return `O endereço pode ter no máximo ${TAMANHO_MAX_DO_ROTULO} caracteres.`;
  if (!ROTULO.test(rotulo)) return "Use só letras minúsculas, números e hífen, sem hífen no começo ou no fim.";
  if (RESERVADOS.has(rotulo)) return "Esse endereço é reservado pelo sistema.";
  if (rotulo.startsWith(PREFIXO_DO_AFILIADO)) return `Endereço de organização não pode começar com "${PREFIXO_DO_AFILIADO}".`;
  return null;
}

/** Rótulo do afiliado (`af-<codigo>`), ou `null` se o código não cabe. */
export function rotuloDoAfiliado(codigo: string): string | null {
  if (!CODIGO_DO_AFILIADO.test(codigo)) return null;
  const rotulo = `${PREFIXO_DO_AFILIADO}${codigo}`;
  return rotulo.length <= TAMANHO_MAX_DO_ROTULO ? rotulo : null;
}

/** Endereço completo (`rotulo.base`), ou `null` sem domínio configurado. */
export function hostDoRotulo(rotulo: string, base: string | null): string | null {
  return base ? `${rotulo}.${base}` : null;
}

export type DestinoDoHost =
  | { tipo: "organizacao"; slug: string }
  | { tipo: "afiliado"; codigo: string };

/**
 * Diz de quem é o endereço que chegou (`Host` da requisição). Recusa domínio
 * que não é o `base`, mais de um nível antes do `base`, porta estranha e
 * rótulo inválido. O `Host` vem do cliente: nada aqui confia nele além do
 * formato.
 */
export function identificarHost(host: string, base: string | null): DestinoDoHost | null {
  if (!base) return null;
  const limpo = host.trim().toLowerCase().replace(/:\d+$/, "");
  const sufixo = `.${base.toLowerCase()}`;
  if (!limpo.endsWith(sufixo)) return null;
  const rotulo = limpo.slice(0, -sufixo.length);
  if (!rotulo || rotulo.includes(".")) return null;
  if (rotulo.startsWith(PREFIXO_DO_AFILIADO)) {
    const codigo = rotulo.slice(PREFIXO_DO_AFILIADO.length);
    return CODIGO_DO_AFILIADO.test(codigo) ? { tipo: "afiliado", codigo } : null;
  }
  return problemaNoRotulo(rotulo) === null ? { tipo: "organizacao", slug: rotulo } : null;
}

/**
 * Link de uma rifa para divulgar. Sai pelo endereço da organização (white
 * label). Com afiliado, leva o `?ref=` dele; o afiliado nunca manda o próprio
 * endereço como destino da compra. Sem `base`, devolve `null`.
 */
export function linkDaRifaNoEndereco(opcoes: {
  base: string | null;
  rotuloDaOrganizacao: string;
  rifaSlug: string;
  codigoDoAfiliado?: string | null;
}): string | null {
  const host = hostDoRotulo(opcoes.rotuloDaOrganizacao, opcoes.base);
  if (!host) return null;
  const ref = opcoes.codigoDoAfiliado ? `?ref=${encodeURIComponent(opcoes.codigoDoAfiliado)}` : "";
  return `https://${host}/r/${encodeURIComponent(opcoes.rifaSlug)}${ref}`;
}
