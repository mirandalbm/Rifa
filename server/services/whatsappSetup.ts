/**
 * Preparar a conta do WhatsApp sem sair do painel: ver se os modelos da rifa
 * existem e estão aprovados na Meta, criar os que faltam e mandar um teste.
 *
 * Existe porque criar oito modelos à mão no WhatsApp Manager é onde o erro
 * mora — um nome trocado ou um parâmetro fora de ordem e a mensagem é
 * recusada em todo envio, calada, lá no meio de uma venda.
 */
import { randomInt } from "node:crypto";
import { TEMPLATES, type TemplateName } from "../notifications/templates";
import { GRAPH_VERSION, IDIOMA_PADRAO, definicaoMeta } from "../notifications/metaTemplates";
import { WhatsAppProvider } from "../notifications/whatsapp";

export class WhatsAppSetupError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "WhatsAppSetupError";
  }
}

interface Config {
  token: string;
  phoneId: string;
  contaId: string | null;
  idioma: string;
}

function config(): Config | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return null;
  return {
    token,
    phoneId,
    contaId: process.env.WHATSAPP_WABA_ID || null,
    idioma: process.env.WHATSAPP_LANGUAGE ?? IDIOMA_PADRAO,
  };
}

async function graph(c: Config, caminho: string, init: RequestInit = {}) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const corpo = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; error_user_msg?: string; code?: number };
  } & Record<string, unknown>;
  if (!res.ok) {
    const e = corpo.error;
    // Token vencido é o erro mais comum com número de teste: o token
    // temporário da Meta dura 24 horas.
    if (e?.code === 190) {
      throw new WhatsAppSetupError(
        "O token do WhatsApp venceu ou é inválido. Gere um token permanente (usuário do sistema) e troque WHATSAPP_TOKEN no Railway.",
        502,
      );
    }
    throw new WhatsAppSetupError(
      `A Meta recusou: ${e?.error_user_msg || e?.message || `HTTP ${res.status}`}`,
      502,
    );
  }
  return corpo;
}

type Remoto = { name: string; status: string; category: string; language: string; rejected_reason?: string };

async function modelosRemotos(c: Config): Promise<Remoto[]> {
  if (!c.contaId) return [];
  const r = (await graph(
    c,
    `${c.contaId}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`,
  )) as { data?: Remoto[] };
  return r.data ?? [];
}

export async function estadoWhatsApp() {
  const c = config();
  if (!c) {
    return {
      configurado: false as const,
      faltando: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID"].filter(
        (v) => !process.env[v],
      ),
    };
  }

  const numero = (await graph(
    c,
    `${c.phoneId}?fields=display_phone_number,verified_name,quality_rating`,
  )) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };

  const remotos = await modelosRemotos(c);
  const modelos = (Object.keys(TEMPLATES) as TemplateName[]).map((nome) => {
    const spec = TEMPLATES[nome];
    const achado = remotos.find((r) => r.name === spec.whatsappName && r.language === c.idioma);
    return {
      nome: spec.whatsappName,
      categoria: spec.categoria,
      status: achado?.status ?? "NAO_CRIADO",
      motivo: achado?.rejected_reason && achado.rejected_reason !== "NONE" ? achado.rejected_reason : null,
      exemplo: spec.text(Object.fromEntries(spec.order.map((k, i) => [k, spec.exemplo[i]]))),
    };
  });

  return {
    configurado: true as const,
    contaInformada: Boolean(c.contaId),
    idioma: c.idioma,
    numero: numero.display_phone_number ?? null,
    nome: numero.verified_name ?? null,
    qualidade: numero.quality_rating ?? null,
    modelos,
  };
}

/** Submete à Meta os modelos que ainda não existem. Os que existem ficam. */
export async function criarModelosFaltantes() {
  const c = config();
  if (!c) throw new WhatsAppSetupError("Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no Railway.");
  if (!c.contaId) {
    throw new WhatsAppSetupError(
      "Configure WHATSAPP_WABA_ID (o ID da conta do WhatsApp Business) no Railway.",
    );
  }

  const remotos = await modelosRemotos(c);
  const resultado: { nome: string; ok: boolean; detalhe: string }[] = [];
  for (const nome of Object.keys(TEMPLATES) as TemplateName[]) {
    const spec = TEMPLATES[nome];
    if (remotos.some((r) => r.name === spec.whatsappName && r.language === c.idioma)) {
      resultado.push({ nome: spec.whatsappName, ok: true, detalhe: "já existia" });
      continue;
    }
    try {
      const r = (await graph(c, `${c.contaId}/message_templates`, {
        method: "POST",
        body: JSON.stringify(definicaoMeta(nome, c.idioma)),
      })) as { status?: string };
      resultado.push({ nome: spec.whatsappName, ok: true, detalhe: r.status ?? "enviado para aprovação" });
    } catch (err) {
      // Um recusado não impede os outros: cada modelo é aprovado sozinho.
      resultado.push({ nome: spec.whatsappName, ok: false, detalhe: (err as Error).message });
    }
  }
  return resultado;
}

/**
 * Manda um código de acesso de verdade para o telefone informado — o mesmo
 * modelo que o comprador recebe ao entrar em "Minhas cotas". O código é
 * aleatório e não serve para nada: é só para ver a mensagem chegar.
 */
export async function enviarTeste(telefone: string) {
  if (!config()) throw new WhatsAppSetupError("Configure o WhatsApp no Railway antes de testar.");
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) throw new WhatsAppSetupError("Informe o telefone com DDD.");
  try {
    await new WhatsAppProvider().send({
      to: digitos,
      template: "codigo_acesso",
      params: { codigo: String(randomInt(0, 1_000_000)).padStart(6, "0") },
    });
  } catch (err) {
    throw new WhatsAppSetupError((err as Error).message, 502);
  }
}
