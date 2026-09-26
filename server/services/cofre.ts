/**
 * Cofre: criptografia do que é dado pessoal sensível (cadastro fiscal e
 * documentos do afiliado). AES-256-GCM — o `tag` pega qualquer byte mexido
 * no banco: decifrar dado adulterado dá erro, não lixo.
 *
 * A chave vem do ambiente (`COFRE_CHAVE`, 32 bytes em base64) e **nunca** do
 * banco: um vazamento do banco sozinho não abre nada. Em desenvolvimento,
 * sem a variável, deriva uma chave do `SESSION_SECRET` (com aviso); em
 * produção, sem a chave, o cofre se recusa a funcionar.
 *
 * Também assina o recibo (HMAC-SHA256 com uma chave derivada da mesma
 * chave, com outro rótulo): quem tiver o recibo confere pelo código.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export class CofreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CofreError";
  }
}

let chaveMestra: Buffer | null = null;
let avisou = false;

function mestra(): Buffer {
  if (chaveMestra) return chaveMestra;
  const doAmbiente = process.env.COFRE_CHAVE;
  if (doAmbiente) {
    const k = Buffer.from(doAmbiente, "base64");
    if (k.length !== 32) throw new CofreError("COFRE_CHAVE precisa ter 32 bytes em base64.");
    chaveMestra = k;
    return k;
  }
  if (process.env.NODE_ENV === "production") {
    throw new CofreError("COFRE_CHAVE não configurada: o cadastro fiscal fica desligado até ela existir.");
  }
  if (!avisou) {
    avisou = true;
    console.warn("[cofre] COFRE_CHAVE ausente: usando chave derivada do SESSION_SECRET (só desenvolvimento).");
  }
  chaveMestra = Buffer.from(hkdfSync("sha256", process.env.SESSION_SECRET ?? "dev", "rifa", "cofre-dev", 32));
  return chaveMestra;
}

const derivada = (rotulo: string) => Buffer.from(hkdfSync("sha256", mestra(), "rifa", rotulo, 32));

/** O cofre está pronto? (Em produção, só com a chave no ambiente.) */
export function cofreDisponivel(): boolean {
  try {
    mestra();
    return true;
  } catch {
    return false;
  }
}

export interface Cifrado {
  dados: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** Versão da chave, para trocar a chave sem perder o que já foi guardado. */
  versao: string;
}

export function cifrar(claro: Buffer): Cifrado {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derivada("dados-v1"), iv);
  const dados = Buffer.concat([c.update(claro), c.final()]);
  return { dados, iv, tag: c.getAuthTag(), versao: "v1" };
}

export function decifrar(x: Cifrado): Buffer {
  if (x.versao !== "v1") throw new CofreError(`Versão de chave desconhecida: ${x.versao}.`);
  try {
    const d = createDecipheriv("aes-256-gcm", derivada("dados-v1"), x.iv);
    d.setAuthTag(x.tag);
    return Buffer.concat([d.update(x.dados), d.final()]);
  } catch {
    throw new CofreError("O dado guardado não confere (adulterado ou chave errada).");
  }
}

export const cifrarJson = (v: unknown) => cifrar(Buffer.from(JSON.stringify(v), "utf8"));
export const decifrarJson = <T>(x: Cifrado): T => JSON.parse(decifrar(x).toString("utf8")) as T;

/**
 * Impressão do CPF para achar duplicata sem guardar o CPF em claro: HMAC com
 * chave do cofre (hash puro de CPF se quebra por força bruta em minutos —
 * são só 10⁹ possibilidades).
 */
export function impressaoDoCpf(cpf: string): string {
  return createHmac("sha256", derivada("cpf-v1")).update(cpf.replace(/\D/g, "")).digest("hex");
}

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function assinar(texto: string): string {
  return createHmac("sha256", derivada("recibo-v1")).update(texto, "utf8").digest("hex");
}

export function assinaturaConfere(texto: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinar(texto), "hex");
  const dada = Buffer.from(assinatura, "hex");
  return esperada.length === dada.length && timingSafeEqual(esperada, dada);
}
