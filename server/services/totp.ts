/**
 * TOTP (RFC 6238) para o segundo fator do administrador.
 *
 * Implementado com o crypto do próprio Node: é um HMAC com contador de
 * tempo, e trazer uma dependência para isso seria aumentar a superfície de
 * um caminho que protege exatamente a conta mais sensível do sistema.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Aceita o código anterior e o próximo: relógio de celular atrasa. */
const DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Segredo inválido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo de 20 bytes — o tamanho que os aplicativos autenticadores esperam. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function verifyTotp(
  secret: string,
  code: string,
  options: { atMs?: number; window?: number } = {},
): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;

  const at = options.atMs ?? Date.now();
  const window = options.window ?? DEFAULT_WINDOW;

  for (let drift = -window; drift <= window; drift++) {
    const expected = totpCode(secret, at + drift * STEP_SECONDS * 1000);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** URL que vira QR Code no aplicativo autenticador. */
export function otpauthUrl(params: {
  secret: string;
  account: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? "rifa.br";
  const label = encodeURIComponent(`${issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
