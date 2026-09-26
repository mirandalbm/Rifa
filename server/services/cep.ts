/**
 * Consulta de CEP (ViaCEP). Só preenche formulário: quem valida o endereço é
 * `validarEndereco()`, e a pessoa pode sempre digitar à mão. Por isso toda
 * falha aqui vira resposta, nunca exceção — e tem prazo curto, para a tela
 * não ficar esperando um serviço de fora.
 */
import { cepValido, soDigitosCep, ufValida, type UF } from "@shared/endereco";

export interface ResultadoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: UF;
}

export type RespostaCep = ResultadoCep | "invalido" | "nao_encontrado" | "indisponivel";

const PRAZO_MS = 3000;
const CAPACIDADE = 5000;

/** CEP muda pouco: guardar evita bater no serviço a cada tecla. */
const cache = new Map<string, ResultadoCep | "nao_encontrado">();

export function limparCacheDeCep() {
  cache.clear();
}

export async function consultarCep(entrada: string): Promise<RespostaCep> {
  const cep = soDigitosCep(entrada);
  if (!cepValido(cep) || String(entrada).replace(/\D/g, "").length !== 8) return "invalido";

  const guardado = cache.get(cep);
  if (guardado) return guardado;

  const base = process.env.CEP_API_URL ?? "https://viacep.com.br/ws";
  let corpo: Record<string, unknown>;
  try {
    const r = await fetch(`${base}/${cep}/json/`, { signal: AbortSignal.timeout(PRAZO_MS) });
    if (r.status === 400 || r.status === 404) return guardar(cep, "nao_encontrado");
    if (!r.ok) return "indisponivel";
    corpo = (await r.json()) as Record<string, unknown>;
  } catch {
    return "indisponivel";
  }

  // O ViaCEP responde 200 com `{ "erro": true }` para CEP que não existe.
  if (corpo.erro || !ufValida(corpo.uf) || typeof corpo.localidade !== "string") {
    return guardar(cep, "nao_encontrado");
  }
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return guardar(cep, {
    cep,
    logradouro: texto(corpo.logradouro),
    bairro: texto(corpo.bairro),
    cidade: texto(corpo.localidade),
    uf: corpo.uf as UF,
  });
}

function guardar<T extends ResultadoCep | "nao_encontrado">(cep: string, valor: T): T {
  if (cache.size >= CAPACIDADE) {
    const primeiro = cache.keys().next().value;
    if (primeiro !== undefined) cache.delete(primeiro);
  }
  cache.set(cep, valor);
  return valor;
}
