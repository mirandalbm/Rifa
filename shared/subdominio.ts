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
  // Marca da plataforma, do Estado e de quem o apostador já reconhece: o
  // endereço carrega a confiança da casa (docs/PLANO-SUBDOMINIO.md, cap. 3).
  "loteriasdobem", "loterias", "loteria", "bem", "oficial", "federal",
  "caixa", "cef", "gov", "fazenda", "receita", "spa", "pix", "pagamento",
  "pagamentos", "login", "entrar", "conta", "seguranca", "bancodobrasil",
  "bb", "itau", "bradesco", "santander", "nubank", "inter", "mercadopago",
  "pagarme", "stone", "asaas", "google", "facebook", "meta", "instagram",
  "tiktok", "whatsapp", "youtube", "windsor", "cloudflare", "railway",
]);

/**
 * Começo ou fim de rótulo que lembra a marca ou o Estado (`caixa-premios`,
 * `rifa-oficial`, `gov-sorteios`, `loteriasdobem-x`). Não é proibido: o rótulo
 * só liga o endereço se a plataforma ligar conscientemente (`PUT` com
 * confirmação), nunca sozinho.
 */
const PARECE_MARCA = /^(?:loteriasdobem|caixa-|gov-|oficial-)|(?:loteriasdobem|-caixa|-oficial)$/;
export function rotuloPareceMarca(rotulo: string): boolean {
  return PARECE_MARCA.test(rotulo);
}

const ROTULO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const CODIGO_DO_AFILIADO = /^[a-z0-9]{3,40}$/;

/** Mensagem em português para o rótulo recusado, ou `null` se ele vale. */
export function problemaNoRotulo(rotulo: string): string | null {
  if (rotulo.length < TAMANHO_MIN_DO_ROTULO) return "O endereço precisa de pelo menos 3 letras ou números.";
  if (rotulo.length > TAMANHO_MAX_DO_ROTULO) return `O endereço pode ter no máximo ${TAMANHO_MAX_DO_ROTULO} caracteres.`;
  if (!ROTULO.test(rotulo)) return "Use só letras minúsculas, números e hífen, sem hífen no começo ou no fim.";
  // Dois hífens seguidos são ambíguos e é assim que se escreve IDN (`xn--`).
  if (rotulo.includes("--")) return "O endereço não pode ter dois hífens seguidos.";
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
 * Põe o `Host` na forma que se compara: minúsculo, sem o ponto final (que é DNS
 * válido: `org.base.` é o mesmo endereço) e sem a porta. Em produção só a porta
 * padrão (`:80` e `:443`) passa; qualquer outra, e tudo que não parece um nome
 * de máquina (usuário, barra, espaço, `%`, IPv6 literal), devolve `null`. Fora
 * de produção a porta é livre (a prova e `*.localhost:5000`).
 */
export function hostNormalizado(host: string | undefined, producao = false): string | null {
  if (!host) return null;
  const m = /^([a-z0-9.-]+?)\.?(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase());
  if (!m || !m[1]) return null;
  const porta = m[2];
  if (producao && porta !== undefined && porta !== "80" && porta !== "443") return null;
  return m[1];
}

/**
 * Diz de quem é o endereço que chegou (`Host` da requisição). Recusa domínio
 * que não é o `base`, mais de um nível antes do `base`, porta estranha e
 * rótulo inválido. O `Host` vem do cliente: nada aqui confia nele além do
 * formato.
 */
export function identificarHost(host: string, base: string | null, producao = false): DestinoDoHost | null {
  if (!base) return null;
  const limpo = hostNormalizado(host, producao);
  if (!limpo) return null;
  const sufixo = `.${base.toLowerCase()}`;
  if (!limpo.endsWith(sufixo)) return null;
  const rotulo = limpo.slice(0, -sufixo.length);
  if (!rotulo || rotulo.includes(".")) return null;
  if (rotulo.startsWith(PREFIXO_DO_AFILIADO)) {
    const codigo = rotulo.slice(PREFIXO_DO_AFILIADO.length);
    return CODIGO_DO_AFILIADO.test(codigo) && !codigo.includes("--") ? { tipo: "afiliado", codigo } : null;
  }
  return problemaNoRotulo(rotulo) === null ? { tipo: "organizacao", slug: rotulo } : null;
}

/**
 * Para onde mandar quem chegou pelo `www` (ou pela raiz, se o canônico é o
 * `www`): o outro nome da casa principal. Duas casas com o mesmo conteúdo
 * dividem sessão e `localStorage` ao meio e duplicam o conteúdo no buscador.
 * `principal` é a `PUBLIC_BASE_URL`. Devolve a origem de destino
 * (`https://loteriasdobem.com.br`) ou `null` quando o `Host` não é o par.
 */
export function destinoDoWww(host: string | undefined, principal: string | undefined, producao = false): string | null {
  if (!principal) return null;
  let url: URL;
  try {
    url = new URL(principal);
  } catch {
    return null;
  }
  const canonico = url.hostname.toLowerCase();
  const chegou = hostNormalizado(host, producao);
  if (!chegou || chegou === canonico) return null;
  const par = canonico.startsWith("www.") ? canonico.slice(4) : `www.${canonico}`;
  return chegou === par ? url.origin : null;
}

/**
 * O `Host` é um endereço que este sistema conhece? O principal (`PUBLIC_BASE_URL`)
 * e o seu par com/sem `www` sim; um endereço de organização (dentro do `base`)
 * sim. O resto — o domínio gerado pela Railway, um IP, um nome apontado para cá
 * por engano — recebe `X-Robots-Tag: noindex`: serve como hoje (a verificação de
 * saúde usa um `Host` próprio), mas não entra no buscador duplicando a casa.
 */
export function hostEhConhecido(
  host: string | undefined,
  principal: string | undefined,
  base: string | null,
  producao = false,
): boolean {
  const chegou = hostNormalizado(host, producao);
  if (!chegou) return false;
  if (principal) {
    try {
      const canonico = new URL(principal).hostname.toLowerCase();
      const par = canonico.startsWith("www.") ? canonico.slice(4) : `www.${canonico}`;
      if (chegou === canonico || chegou === par) return true;
    } catch {
      // PUBLIC_BASE_URL torta: nada é "conhecido" por ela
    }
  }
  return identificarHost(chegou, base, producao) !== null;
}

/**
 * O pedido que muda estado veio de outra casa? `Origin` tem de ser o mesmo
 * `Host` (SameSite não separa subdomínios da mesma família: um endereço poderia
 * mandar um formulário ao principal com o cookie do principal). Sem `Origin`,
 * o `Sec-Fetch-Site` tem de ser `same-origin` ou `none`; sem nenhum dos dois
 * (curl, prova, servidor a servidor) passa. Devolve o motivo, ou `null`.
 */
export function motivoDeOrigemDiferente(
  cabecalhos: { host?: string; origin?: string; secFetchSite?: string },
  producao = false,
): string | null {
  const { origin, secFetchSite } = cabecalhos;
  if (origin !== undefined && origin !== "") {
    let doOrigin: string;
    try {
      doOrigin = new URL(origin).host.toLowerCase();
    } catch {
      return "origin-invalida";
    }
    const dele = hostNormalizado(doOrigin, false);
    const meu = hostNormalizado(cabecalhos.host, false);
    if (!dele || !meu) return "host-invalido";
    // Compara o nome da máquina: é ele que separa um endereço do outro.
    if (dele !== meu) return "origin-de-outro-host";
    if (producao && !origin.startsWith("https://")) return "origin-sem-https";
    return null;
  }
  if (secFetchSite !== undefined && secFetchSite !== "") {
    const v = secFetchSite.toLowerCase();
    if (v === "same-origin" || v === "none") return null;
    return `sec-fetch-site-${v.replace(/[^a-z-]/g, "").slice(0, 20)}`;
  }
  return null;
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

/**
 * Por que o endereço da organização não pode ser ligado agora, ou `null`.
 * `confirmouMarca`: a plataforma leu que o rótulo lembra a marca ou o Estado e
 * quer ligar mesmo assim (conscientemente, nunca sozinho).
 */
export function problemaParaLigarEndereco(
  slug: string,
  situacao: { arquivada: boolean; banida: boolean },
  confirmouMarca: boolean,
): { status: 409 | 422; mensagem: string } | null {
  const rotulo = problemaNoRotulo(slug);
  if (rotulo) return { status: 422, mensagem: `Esta organização não pode ter endereço próprio: ${rotulo}` };
  if (situacao.banida) return { status: 409, mensagem: "Organização banida não tem endereço." };
  if (situacao.arquivada) return { status: 409, mensagem: "Organização arquivada não tem endereço." };
  if (rotuloPareceMarca(slug) && !confirmouMarca) {
    return {
      status: 409,
      mensagem: "O endereço lembra a marca da plataforma, do Estado ou de um banco. Confirme que você conferiu e quer ligar.",
    };
  }
  return null;
}
