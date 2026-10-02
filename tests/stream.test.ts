import { describe, expect, it } from "vitest";
import { entregaHlsLigada, fonteDoVideo, hlsDoStream, uidValido } from "../shared/stream";

const UID = "0123456789abcdef0123456789abcdef";
const HLS = `https://customer-abc123.cloudflarestream.com/${UID}/manifest/video.m3u8`;

describe("entrega em HLS: regras", () => {
  it("uid é o formato do Stream, nada além", () => {
    expect(uidValido(UID)).toBe(true);
    for (const u of ["", "UID1", UID.toUpperCase(), `${UID}0`, "../" + UID.slice(3), null, 42]) expect(uidValido(u)).toBe(false);
  });

  it("só vale o HLS do próprio vídeo, no domínio do Stream", () => {
    expect(hlsDoStream(HLS, UID)).toBe(HLS);
    for (const ruim of [
      HLS.replace("https:", "http:"),
      HLS.replace("customer-abc123.cloudflarestream.com", "evil.example.com"),
      HLS.replace("customer-abc123.cloudflarestream.com", "customer-abc123.cloudflarestream.com.evil.io"),
      HLS.replace("customer-abc123.", ""),
      HLS.replace("customer-abc123.", "user:senha@customer-abc123."),
      HLS.replace(".com/", ".com:8443/"),
      `${HLS}?x=1`,
      `${HLS}#x`,
      HLS.replace(UID, "f".repeat(32)),
      HLS.replace("video.m3u8", "video.mpd"),
      "não é endereço",
      undefined,
    ]) {
      expect(hlsDoStream(ruim, UID)).toBeNull();
    }
    expect(hlsDoStream(HLS, "UID1")).toBeNull();
  });

  it("a entrega só liga com o Stream como processador e a escolha explícita", () => {
    expect(entregaHlsLigada({})).toBe(false);
    expect(entregaHlsLigada({ CLOUDFLARE_STREAM_ENTREGA: "hls" })).toBe(false);
    expect(entregaHlsLigada({ VIDEO_PROCESSOR: "ffmpeg", CLOUDFLARE_STREAM_ENTREGA: "hls" })).toBe(false);
    expect(entregaHlsLigada({ VIDEO_PROCESSOR: "cloudflare-stream" })).toBe(false);
    expect(entregaHlsLigada({ VIDEO_PROCESSOR: "Cloudflare-Stream", CLOUDFLARE_STREAM_ENTREGA: " HLS " })).toBe(true);
  });

  it("a tela toca HLS nativo, hls.js ou o original", () => {
    expect(fonteDoVideo({ hls: null, nativo: true, mse: true })).toBe("original");
    expect(fonteDoVideo({ hls: HLS, nativo: true, mse: true })).toBe("hls-nativo");
    expect(fonteDoVideo({ hls: HLS, nativo: false, mse: true })).toBe("hls-js");
    expect(fonteDoVideo({ hls: HLS, nativo: false, mse: false })).toBe("original");
  });
});
