import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { TOKEN_DO_STREAM_FOLGA_S, TOKEN_DO_STREAM_VALIDADE_S, tokenDoStreamValido } from "../shared/stream";
import { assinarToken, lerChaveDoStream, tokenDoStream, trocarChaveDoStream } from "../server/services/streamAssinatura";

const UID = "0123456789abcdef0123456789abcdef";
const ID = "fedcba9876543210fedcba9876543210";

function chaveDeTeste() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" }))).toString("base64");
  return { jwk, publicKey };
}
const k = chaveDeTeste();
const decodificar = (parte: string) => JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));

afterEach(() => {
  trocarChaveDoStream(undefined);
  vi.restoreAllMocks();
});

describe("URL assinada do Stream: a chave", () => {
  it("lê o id e o JWK em base64 do ambiente", () => {
    const c = lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: k.jwk });
    expect(c?.id).toBe(ID);
  });

  it("sem as duas, ou com elas estragadas, não há chave — e o segredo não vai ao log", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lerChaveDoStream({})).toBeNull();
    expect(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID })).toBeNull();
    expect(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: "x", CLOUDFLARE_STREAM_CHAVE_JWK: k.jwk })).toBeNull();
    expect(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: "bm9wZQ==" })).toBeNull();
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const jwkEc = Buffer.from(JSON.stringify(ec.export({ format: "jwk" }))).toString("base64");
    expect(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: jwkEc })).toBeNull();
    for (const [msg] of aviso.mock.calls) expect(String(msg)).not.toContain(k.jwk.slice(0, 40));
  });
});

describe("URL assinada do Stream: o token", () => {
  it("é um JWT RS256 com o kid, o uid no sub e o prazo de validade, que a chave pública confere", () => {
    const c = lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: k.jwk })!;
    const t = assinarToken(UID, c, 1_000_000);
    expect(tokenDoStreamValido(t)).toBe(true);
    const [h, p, a] = t.split(".");
    expect(decodificar(h)).toEqual({ alg: "RS256", kid: ID });
    expect(decodificar(p)).toEqual({ sub: UID, kid: ID, exp: 1_000_000 + TOKEN_DO_STREAM_VALIDADE_S });
    expect(verify("RSA-SHA256", Buffer.from(`${h}.${p}`), k.publicKey, Buffer.from(a, "base64url"))).toBe(true);
  });

  it("sem chave ou com uid fora do formato: nada", () => {
    trocarChaveDoStream(null);
    expect(tokenDoStream(UID)).toBeNull();
    trocarChaveDoStream(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: k.jwk }));
    expect(tokenDoStream("../outro")).toBeNull();
    expect(tokenDoStream(null)).toBeNull();
  });

  it("o mesmo token serve até faltar a folga; depois, um novo", () => {
    trocarChaveDoStream(lerChaveDoStream({ CLOUDFLARE_STREAM_CHAVE_ID: ID, CLOUDFLARE_STREAM_CHAVE_JWK: k.jwk }));
    const t0 = tokenDoStream(UID, 1_000_000);
    expect(tokenDoStream(UID, 1_000_000 + 60)).toBe(t0);
    const virada = 1_000_000 + TOKEN_DO_STREAM_VALIDADE_S - TOKEN_DO_STREAM_FOLGA_S;
    const t1 = tokenDoStream(UID, virada);
    expect(t1).not.toBe(t0);
    expect(decodificar(t1!.split(".")[1]).exp).toBe(virada + TOKEN_DO_STREAM_VALIDADE_S);
  });
});
