import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TipoMidia } from "@prisma/client";
import { ErroDeMidia, LIMITES, detectarMime, extensaoDe, gerarChave, limiteDe, validarArquivo } from "@/lib/midia";

/// Cabeçalhos reais de cada formato, seguidos de enchimento.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(64),
]);
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.alloc(64)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);

describe("detectarMime", () => {
  test("reconhece os formatos aceitos pela assinatura do arquivo", () => {
    assert.equal(detectarMime(JPEG), "image/jpeg");
    assert.equal(detectarMime(PNG), "image/png");
    assert.equal(detectarMime(WEBP), "image/webp");
    assert.equal(detectarMime(MP4), "video/mp4");
    assert.equal(detectarMime(WEBM), "video/webm");
  });

  test("não reconhece conteúdo que não é mídia", () => {
    assert.equal(detectarMime(Buffer.from("<?php system($_GET['c']); ?>")), null);
    assert.equal(detectarMime(Buffer.from("<script>alert(1)</script>")), null);
    assert.equal(detectarMime(Buffer.from("GIF89a")), null);
  });
});

describe("validarArquivo", () => {
  test("aceita imagem e vídeo nos formatos previstos", () => {
    assert.equal(validarArquivo(TipoMidia.IMAGEM, JPEG), "image/jpeg");
    assert.equal(validarArquivo(TipoMidia.BANNER, PNG), "image/png");
    assert.equal(validarArquivo(TipoMidia.VIDEO, MP4), "video/mp4");
  });

  test("recusa executável disfarçado de imagem", () => {
    // O caso clássico: arquivo renomeado para .jpg com type "image/jpeg"
    // declarado pelo navegador. Só o conteúdo denuncia.
    const executavel = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(64)]);
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, executavel), ErroDeMidia);
  });

  test("recusa SVG mesmo sendo imagem de verdade", () => {
    // SVG é XML e aceita <script>: serviria como vetor de XSS no domínio da rifa.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, svg), ErroDeMidia);
  });

  test("recusa HTML disfarçado", () => {
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, Buffer.from("<html><body>oi")), ErroDeMidia);
  });

  test("não deixa vídeo entrar como imagem, nem o contrário", () => {
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, MP4), /precisa ser JPG/);
    assert.throws(() => validarArquivo(TipoMidia.VIDEO, JPEG), /precisa ser MP4/);
  });

  test("recusa arquivo vazio", () => {
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, Buffer.alloc(0)), /vazio/);
  });

  test("aplica o limite de tamanho de cada tipo", () => {
    const imagemGrande = Buffer.concat([JPEG, Buffer.alloc(LIMITES.tamanhoImagem)]);
    assert.throws(() => validarArquivo(TipoMidia.IMAGEM, imagemGrande), /passa de 5 MB/);

    const videoGrande = Buffer.concat([MP4, Buffer.alloc(LIMITES.tamanhoVideo)]);
    assert.throws(() => validarArquivo(TipoMidia.VIDEO, videoGrande), /passa de 50 MB/);
  });

  test("uma imagem no limite do tamanho ainda passa", () => {
    const noLimite = Buffer.concat([JPEG, Buffer.alloc(LIMITES.tamanhoImagem - JPEG.length)]);
    assert.equal(validarArquivo(TipoMidia.IMAGEM, noLimite), "image/jpeg");
  });
});

describe("gerarChave", () => {
  test("descarta o nome enviado e gera um próprio", () => {
    const chave = gerarChave("image/jpeg");
    assert.match(chave, /^[0-9a-f-]{36}\.jpg$/);
  });

  test("a chave não carrega travessia de diretório", () => {
    // Independente do que o usuário mandou, a chave nunca tem barra nem "..".
    for (let i = 0; i < 50; i++) {
      const chave = gerarChave("video/mp4");
      assert.doesNotMatch(chave, /[/\\]|\.\./);
    }
  });

  test("a extensão vem do mime confirmado, não do nome do arquivo", () => {
    assert.equal(extensaoDe("image/png"), "png");
    assert.equal(extensaoDe("video/webm"), "webm");
    assert.equal(extensaoDe("application/x-msdownload"), "bin");
  });
});

describe("limiteDe", () => {
  test("banner e vídeo são únicos; imagens vão até cinco", () => {
    assert.equal(limiteDe(TipoMidia.BANNER), 1);
    assert.equal(limiteDe(TipoMidia.VIDEO), 1);
    assert.equal(limiteDe(TipoMidia.IMAGEM), 5);
  });
});
