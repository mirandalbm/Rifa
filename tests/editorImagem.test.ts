import { describe, expect, it } from "vitest";
import {
  CAMADAS_MAX,
  CORES_DO_TEXTO,
  TEXTO_DA_CAMADA_MAX,
  camadaNova,
  enquadramentoLimitado,
  quebrarEmLinhas,
  retanguloDoFundo,
  textosDasCamadas,
  validarCamadas,
} from "@shared/editorImagem";
import { pedePagamentoPorFora } from "@shared/seguranca";

const comSelo = { temSelo: true };

describe("validarCamadas", () => {
  it("aceita as camadas novas de cada tipo e devolve só as chaves conhecidas", () => {
    const tipos = ["texto", "emoji", "preco", "selo", "logo", "qr"] as const;
    const lista = tipos.map((t) => ({ ...camadaNova(t), lixo: "<script>" }));
    const v = validarCamadas(lista, comSelo);
    expect(v.map((c) => c.tipo)).toEqual(tipos);
    for (const c of v) expect(c).not.toHaveProperty("lixo");
  });

  it("recusa o que não é lista, tipo desconhecido e camadas demais", () => {
    expect(() => validarCamadas({}, comSelo)).toThrow();
    expect(() => validarCamadas([{ tipo: "html", x: 0.5, y: 0.5, tamanho: 0.1 }], comSelo)).toThrow(/não existe/);
    const muitas = Array.from({ length: CAMADAS_MAX + 1 }, () => camadaNova("emoji"));
    expect(() => validarCamadas(muitas, comSelo)).toThrow(/Cabem até/);
  });

  it("uma camada oficial de cada, e o selo só com autorização", () => {
    expect(() => validarCamadas([camadaNova("preco"), camadaNova("preco")], comSelo)).toThrow(/Só cabe uma/);
    expect(() => validarCamadas([camadaNova("selo")], { temSelo: false })).toThrow(/autorização/);
  });

  it("a camada oficial não carrega texto: o preço sai da rifa", () => {
    const [c] = validarCamadas([{ ...camadaNova("preco"), texto: "R$ 0,01" }], comSelo);
    expect(c).not.toHaveProperty("texto");
  });

  it("posição e tamanho ficam na faixa; sem número, recusa", () => {
    const [c] = validarCamadas([{ ...camadaNova("emoji"), x: -3, y: 9, tamanho: 50 }], comSelo);
    expect(c.x).toBe(0.05);
    expect(c.y).toBe(0.95);
    expect(c.tamanho).toBe(0.6);
    expect(() => validarCamadas([{ ...camadaNova("emoji"), x: "meio" }], comSelo)).toThrow(/posição/);
  });

  it("texto: sem link, sem telefone, com tamanho, fonte e cor da lista", () => {
    const t = camadaNova("texto");
    expect(() => validarCamadas([{ ...t, texto: "veja em rifa.com.br" }], comSelo)).toThrow(/No texto/);
    expect(() => validarCamadas([{ ...t, texto: "chama no 11 98765-4321" }], comSelo)).toThrow(/No texto/);
    expect(() => validarCamadas([{ ...t, texto: "x".repeat(TEXTO_DA_CAMADA_MAX + 1) }], comSelo)).toThrow(/até/);
    expect(() => validarCamadas([{ ...t, texto: "   " }], comSelo)).toThrow(/Escreva/);
    expect(() => validarCamadas([{ ...t, fonte: "Comic Sans" }], comSelo)).toThrow(/fontes/);
    expect(() => validarCamadas([{ ...t, cor: "#ffff00" }], comSelo)).toThrow(/cores/);
    expect(() => validarCamadas([{ ...t, fonte: "constructor" }], comSelo)).toThrow(/fontes/);
    const [ok] = validarCamadas([{ ...t, texto: "  Sorteio   sábado  " }], comSelo);
    expect(ok).toMatchObject({ texto: "Sorteio sábado" });
  });

  it("emoji só da lista", () => {
    expect(() => validarCamadas([{ ...camadaNova("emoji"), emoji: "💰" }], comSelo)).toThrow(/emojis/);
  });

  it("as cores do texto não têm amarelo", () => {
    for (const { hex } of Object.values(CORES_DO_TEXTO)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(r > 180 && g > 160 && b < 100).toBe(false);
    }
  });

  it("o texto juntado é o que a varredura do Pix por fora lê", () => {
    const camadas = validarCamadas([{ ...camadaNova("texto"), texto: "faz um pix direto pra mim" }, camadaNova("qr")], comSelo);
    expect(textosDasCamadas(camadas)).toBe("faz um pix direto pra mim");
    expect(pedePagamentoPorFora(textosDasCamadas(camadas))).not.toBeNull();
  });
});

describe("enquadramento do fundo", () => {
  const foto = { largura: 2000, altura: 1000 };
  const imagem = { largura: 1080, altura: 1350 };

  it("cobre a imagem inteira, sem faixa vazia, em qualquer centro e zoom", () => {
    for (const zoom of [1, 1.7, 4, 9]) {
      for (const cx of [-1, 0, 0.3, 0.5, 1, 2]) {
        const r = retanguloDoFundo(foto, imagem, { zoom, cx, cy: cx });
        expect(r.x).toBeLessThanOrEqual(0);
        expect(r.y).toBeLessThanOrEqual(0);
        expect(r.x + r.largura).toBeGreaterThanOrEqual(imagem.largura - 1e-6);
        expect(r.y + r.altura).toBeGreaterThanOrEqual(imagem.altura - 1e-6);
      }
    }
  });

  it("no zoom 1 a altura encosta e o centro é o meio", () => {
    const r = retanguloDoFundo(foto, imagem, { zoom: 1, cx: 0.5, cy: 0.5 });
    expect(r.altura).toBeCloseTo(1350);
    expect(r.x + r.largura / 2).toBeCloseTo(540);
  });

  it("o centro limitado volta para dentro do que a foto alcança", () => {
    const e = enquadramentoLimitado(foto, imagem, { zoom: 1, cx: 0, cy: 0.5 });
    expect(e.cx).toBeCloseTo(540 / 2700);
    expect(e.cy).toBeCloseTo(0.5);
  });
});

describe("quebrarEmLinhas", () => {
  const medir = (t: string) => t.length * 10;
  it("quebra nas palavras pela medida", () => {
    expect(quebrarEmLinhas("Sorteio neste sábado às 19h", 130, medir)).toEqual(["Sorteio neste", "sábado às 19h"]);
  });
  it("palavra maior que a linha fica sozinha", () => {
    expect(quebrarEmLinhas("a supercalifragilístico b", 50, medir)).toEqual(["a", "supercalifragilístico", "b"]);
  });
});
