import { describe, expect, it } from "vitest";
import {
  LEGENDA_MAX,
  MAX_CARROSSEL,
  REELS_MAX_S,
  VIDEO_MAX_S,
  cabeNoCarrossel,
  contadorCurto,
  duracao,
  FORMATO_PADRAO,
  formatoDaPeca,
  formatoDoCarrossel,
  medidaDoSvg,
  formatoDoVideo,
  perfilPorCima,
  problemaNaLegenda,
  quandoPublicou,
} from "@shared/publicacao";
import { problemaNoComentario } from "@shared/comentarios";

describe("vídeo da publicação", () => {
  it("até 3 min é reels, até 15 min é feed, mais que isso não entra", () => {
    expect(REELS_MAX_S).toBe(180);
    expect(VIDEO_MAX_S).toBe(900);
    expect(formatoDoVideo(30)).toBe("reels");
    expect(formatoDoVideo(180)).toBe("reels");
    expect(formatoDoVideo(181)).toBe("feed");
    expect(formatoDoVideo(900)).toBe("feed");
    expect(formatoDoVideo(901)).toBeNull();
    expect(formatoDoVideo(0)).toBeNull();
  });
  it("mostra a duração em m:ss (e h:mm:ss)", () => {
    expect(duracao(45)).toBe("0:45");
    expect(duracao(180)).toBe("3:00");
    expect(duracao(3725)).toBe("1:02:05");
  });
});

describe("carrossel", () => {
  it("até 10 peças, contando o banner", () => {
    expect(MAX_CARROSSEL).toBe(10);
    expect(cabeNoCarrossel(9)).toBe(true);
    expect(cabeNoCarrossel(10)).toBe(false);
  });
});

describe("legenda", () => {
  it("a régua do comentário: sem link e sem telefone; vazia apaga", () => {
    expect(problemaNaLegenda("")).toBeNull();
    expect(problemaNaLegenda("Moto 0 km, sorteio pela Loteria Federal! #rifa")).toBeNull();
    expect(problemaNaLegenda("compre em www.outrosite.com")).toMatch(/^A legenda não pode ter link/);
    expect(problemaNaLegenda("chama no 11 98765-4321")).toMatch(/^A legenda não pode ter telefone/);
    expect(problemaNaLegenda("x".repeat(LEGENDA_MAX + 1))).toMatch(/passa de/);
  });
  it("o comentário segue com as mesmas mensagens de antes", () => {
    expect(problemaNoComentario("veja www.golpe.com")).toMatch(/^Comentário não pode ter link/);
    expect(problemaNoComentario("11 98765-4321")).toMatch(/^Comentário não pode ter telefone/);
  });
});

describe("contadores", () => {
  it("como no Instagram: número inteiro até 9.999, depois mil e mi", () => {
    expect(contadorCurto(337)).toBe("337");
    expect(contadorCurto(9999)).toBe("9.999");
    expect(contadorCurto(12_345)).toBe("12,3 mil");
    expect(contadorCurto(1_234_567)).toBe("1,2 mi");
  });
});

describe("quando publicou", () => {
  const agora = new Date("2026-09-27T15:00:00Z");
  it("relativo até uma semana, depois a data", () => {
    expect(quandoPublicou(new Date("2026-09-27T14:59:40Z"), agora)).toBe("Agora");
    expect(quandoPublicou(new Date("2026-09-27T14:15:00Z"), agora)).toBe("Há 45 minutos");
    expect(quandoPublicou(new Date("2026-09-27T14:00:00Z"), agora)).toBe("Há 1 hora");
    expect(quandoPublicou(new Date("2026-09-24T15:00:00Z"), agora)).toBe("Há 3 dias");
    expect(quandoPublicou(new Date("2026-09-16T15:00:00Z"), agora)).toBe("16 de setembro");
    expect(quandoPublicou(new Date("2025-09-16T15:00:00Z"), agora)).toBe("16 de setembro de 2025");
    expect(quandoPublicou(null, agora)).toBeNull();
  });
});

describe("formato da peça, como no Instagram", () => {
  it("as medidas recomendadas caem cada uma no seu formato", () => {
    expect(formatoDaPeca(1080, 1350)).toBe("retrato");
    expect(formatoDaPeca(1080, 1080)).toBe("quadrado");
    expect(formatoDaPeca(1080, 566)).toBe("paisagem");
    expect(formatoDaPeca(1920, 1080)).toBe("paisagem");
    expect(formatoDaPeca(1080, 1920)).toBe("vertical");
  });

  it("as proporções do meio vão para o vizinho mais próximo", () => {
    expect(formatoDaPeca(3000, 4000)).toBe("retrato"); // foto de celular em pé (3:4)
    expect(formatoDaPeca(4000, 3000)).toBe("quadrado"); // 4:3
    expect(formatoDaPeca(2000, 3000)).toBe("retrato"); // 2:3
    expect(formatoDaPeca(900, 1600)).toBe("vertical");
  });

  it("sem medida (peça antiga) vale o retrato de antes", () => {
    expect(formatoDaPeca(null, null)).toBe(FORMATO_PADRAO);
    expect(formatoDaPeca(0, 100)).toBe("retrato");
  });

  it("a primeira peça define o formato do carrossel inteiro", () => {
    expect(formatoDoCarrossel([{ largura: 1080, altura: 1920 }, { largura: 1080, altura: 1080 }])).toBe("vertical");
    expect(formatoDoCarrossel([{ largura: 1080, altura: 1080 }, { largura: 1080, altura: 1920 }])).toBe("quadrado");
    expect(formatoDoCarrossel([])).toBe("retrato");
  });

  it("só o vertical põe o perfil por cima da imagem", () => {
    expect(perfilPorCima("vertical")).toBe(true);
    for (const f of ["retrato", "quadrado", "paisagem"] as const) expect(perfilPorCima(f)).toBe(false);
  });
});

describe("medidaDoSvg (imagem de exemplo guardada em data URI)", () => {
  const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  it("lê largura e altura da tag <svg>, e a peça sai no formato certo", () => {
    const m = medidaDoSvg(dataUri('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect/></svg>'));
    expect(m).toEqual({ largura: 1600, altura: 900 });
    expect(formatoDaPeca(m!.largura, m!.altura)).toBe("paisagem");
  });

  it("não inventa medida: sem atributo, fora da faixa, outro tipo ou base64 quebrado", () => {
    expect(medidaDoSvg(dataUri('<svg viewBox="0 0 10 10"></svg>'))).toBeNull();
    expect(medidaDoSvg(dataUri('<svg width="0" height="900"></svg>'))).toBeNull();
    expect(medidaDoSvg(dataUri('<svg width="200000" height="900"></svg>'))).toBeNull();
    expect(medidaDoSvg(dataUri('<svg width="100%" height="900"></svg>'))).toBeNull();
    expect(medidaDoSvg("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
    expect(medidaDoSvg("campanhas/x/banner.webp")).toBeNull();
    expect(medidaDoSvg("data:image/svg+xml;base64,@@@")).toBeNull();
  });

  it("o width de um elemento de dentro não conta, só o da tag <svg>", () => {
    expect(medidaDoSvg(dataUri('<svg xmlns="x"><rect width="10" height="10"/></svg>'))).toBeNull();
  });
});
