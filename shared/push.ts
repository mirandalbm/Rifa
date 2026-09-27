/**
 * Notificações no celular (Web Push). Puro: o servidor valida e monta a
 * mensagem com isto; os testes exercitam sem rede.
 *
 * WhatsApp continua sendo o canal do que é transação (pagamento, bilhete);
 * o push é o aviso de quem segue: rifa nova, sorteio chegando, resultado —
 * e o reembolso respondido, que interessa na hora.
 */

/**
 * Serviços de push dos navegadores. O servidor faz POST no `endpoint` que o
 * aparelho mandou — aceitar qualquer endereço seria deixar alguém usar o
 * servidor para bater em rede interna (SSRF). Só estes hosts, só HTTPS.
 */
const HOSTS_DE_PUSH = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  ".push.apple.com",
  ".notify.windows.com",
];

/**
 * @param desenvolvimento em dev, aceita também https://127.0.0.1/localhost —
 *   é como o teste de ponta a ponta recebe o push sem sair da máquina.
 */
export function endpointPermitido(endpoint: unknown, desenvolvimento = false): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (desenvolvimento && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) {
    return u.protocol === "https:";
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return HOSTS_DE_PUSH.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
}

/** Chaves do aparelho: base64url, no tamanho que o navegador gera. */
export function chavesValidas(chaves: unknown): chaves is { p256dh: string; auth: string } {
  if (!chaves || typeof chaves !== "object") return false;
  const { p256dh, auth } = chaves as Record<string, unknown>;
  const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
  return (
    typeof p256dh === "string" &&
    typeof auth === "string" &&
    b64url.test(p256dh) &&
    b64url.test(auth) &&
    p256dh.length >= 80 &&
    p256dh.length <= 100 &&
    auth.length >= 16 &&
    auth.length <= 32
  );
}

export type TipoAviso =
  | "rifa_nova"
  | "sorteio_chegando"
  | "sorteio_adiado"
  | "resultado"
  | "reembolso"
  | "comentario"
  | "verificacao";

export interface MensagemPush {
  title: string;
  body: string;
  /** Caminho aberto ao tocar na notificação. Sempre interno. */
  url: string;
  /** Mesma etiqueta substitui a anterior na gaveta, em vez de empilhar. */
  tag: string;
}

/** Quanto tempo o serviço de push segura o aviso com o aparelho desligado. */
export const VALIDADE_S: Record<TipoAviso, number> = {
  rifa_nova: 24 * 3600,
  sorteio_chegando: 3600,
  sorteio_adiado: 3 * 24 * 3600,
  comentario: 24 * 3600,
  verificacao: 3 * 24 * 3600,
  resultado: 24 * 3600,
  reembolso: 3 * 24 * 3600,
};

export const JANELAS_DO_SORTEIO = [
  { chave: "24h", antesMs: 24 * 3600_000, texto: "nas próximas 24 horas" },
  { chave: "1h", antesMs: 3600_000, texto: "em menos de 1 hora" },
] as const;

export type JanelaDoSorteio = (typeof JANELAS_DO_SORTEIO)[number];

/**
 * A janela mais apertada em que o sorteio está: rifa a 30 min do sorteio
 * recebe só o aviso de "1 hora" — mandar o de "24 horas" junto seria dois
 * avisos de uma vez, um deles dizendo a coisa errada. Fora das janelas (ou já
 * sorteado), `null`.
 */
export function janelaDoSorteio(drawAt: Date | string | null, agora: Date): JanelaDoSorteio | null {
  if (!drawAt) return null;
  const falta = new Date(drawAt).getTime() - agora.getTime();
  if (falta <= 0) return null;
  let escolhida: JanelaDoSorteio | null = null;
  for (const j of JANELAS_DO_SORTEIO) if (falta <= j.antesMs) escolhida = j;
  return escolhida;
}

export function mensagemRifaNova(r: { org: string; orgSlug: string; premio: string; slug: string }): MensagemPush {
  return {
    title: `${r.org} publicou uma rifa nova`,
    body: r.premio,
    url: `/o/${r.orgSlug}/r/${r.slug}`,
    tag: `rifa:${r.slug}`,
  };
}

export function mensagemSorteioChegando(r: {
  premio: string;
  orgSlug: string;
  slug: string;
  quando: string;
}): MensagemPush {
  return {
    title: `Sorteio ${r.quando}`,
    body: `${r.premio} — ainda dá para garantir seus números.`,
    url: `/o/${r.orgSlug}/r/${r.slug}`,
    tag: `sorteio:${r.slug}`,
  };
}

export function mensagemSorteioAdiado(r: {
  premio: string;
  orgSlug: string;
  slug: string;
  novaData: string;
}): MensagemPush {
  return {
    title: "Sorteio adiado",
    body: `${r.premio} — nova data: ${r.novaData}. Seus números continuam valendo.`,
    url: `/o/${r.orgSlug}/r/${r.slug}`,
    tag: `sorteio:${r.slug}`,
  };
}

export function mensagemRespostaAoComentario(r: { org: string; texto: string; url: string }): MensagemPush {
  return {
    title: `${r.org} respondeu seu comentário`,
    body: r.texto.length > 120 ? `${r.texto.slice(0, 117)}…` : r.texto,
    url: r.url,
    tag: `comentario:${r.url}`,
  };
}

/** A análise da verificação terminou: selo, foto a trocar ou documento a corrigir. */
export function mensagemVerificacao(r: { status: "verificado" | "foto_divergente" | "recusado" }): MensagemPush {
  const texto = {
    verificado: { title: "Seu perfil foi verificado", body: "O selo de trevo já aparece ao lado do seu nome — e agora você comenta com emojis." },
    foto_divergente: { title: "A foto do perfil não confere", body: "Os documentos estão certos, mas a foto do perfil não é a da pessoa do documento. Troque por uma foto sua." },
    recusado: { title: "Verificação recusada", body: "Veja o motivo em Minha conta e envie de novo." },
  }[r.status];
  return { ...texto, url: "/minhas-cotas?aba=conta#verificacao", tag: "verificacao" };
}

export function mensagemResultado(r: { premio: string; orgSlug: string; slug: string; numero: string }): MensagemPush {
  return {
    title: `Saiu o resultado: ${r.premio}`,
    body: `Número sorteado: ${r.numero}. Confira se é o seu.`,
    url: `/o/${r.orgSlug}/r/${r.slug}`,
    tag: `sorteio:${r.slug}`,
  };
}

export function mensagemDisputa(r: { procedente: boolean; protocolo: string }): MensagemPush {
  return {
    title: r.procedente ? "Reembolso aprovado pela plataforma" : "Disputa respondida",
    body: r.procedente
      ? `Protocolo ${r.protocolo}. A plataforma deu razão a você; veja o prazo da devolução.`
      : `Protocolo ${r.protocolo}. Veja a decisão da plataforma.`,
    url: "/minhas-compras?aba=reembolsos",
    tag: `reembolso:${r.protocolo}`,
  };
}

export function mensagemReembolso(r: { aprovado: boolean; protocolo: string }): MensagemPush {
  return {
    title: r.aprovado ? "Reembolso aprovado" : "Reembolso respondido",
    body: r.aprovado
      ? `Protocolo ${r.protocolo}. Veja o prazo da devolução.`
      : `Protocolo ${r.protocolo}. Veja a resposta do atendimento.`,
    url: "/minhas-compras?aba=reembolsos",
    tag: `reembolso:${r.protocolo}`,
  };
}
