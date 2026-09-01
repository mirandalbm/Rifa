import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { TipoMidia } from "@prisma/client";

/// Arquivo enviado por terceiro é conteúdo hostil até prova em contrário. As
/// regras aqui existem para que nada do que o usuário controla vire caminho de
/// arquivo, tipo de conteúdo servido, ou script executado no navegador de quem
/// visita a rifa.

export class ErroDeMidia extends Error {}

/// Só formatos que o navegador trata como mídia inerte.
/// SVG está fora de propósito: é XML, aceita <script> e executaria no domínio
/// da rifa se fosse servido como imagem.
const FORMATOS_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const FORMATOS_VIDEO: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const LIMITES = {
  imagensPorRifa: 5,
  bannerPorRifa: 1,
  videoPorRifa: 1,
  tamanhoImagem: 5 * 1024 * 1024,
  tamanhoVideo: 50 * 1024 * 1024,
};

/// Assinaturas do início do arquivo. O `type` que o navegador envia é apenas
/// uma declaração — quem decide é o conteúdo. Sem isto, um .exe renomeado para
/// .jpg passaria como imagem.
const ASSINATURAS: { mime: string; testar: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", testar: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    testar: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    testar: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
  { mime: "video/mp4", testar: (b) => b.subarray(4, 8).toString() === "ftyp" },
  {
    mime: "video/webm",
    testar: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  },
];

export function detectarMime(conteudo: Buffer): string | null {
  return ASSINATURAS.find((a) => a.testar(conteudo))?.mime ?? null;
}

export function ehVideo(tipo: TipoMidia): boolean {
  return tipo === TipoMidia.VIDEO;
}

/// Valida o arquivo e devolve o mime confirmado pelo conteúdo, nunca o declarado.
export function validarArquivo(tipo: TipoMidia, conteudo: Buffer): string {
  if (conteudo.length === 0) throw new ErroDeMidia("Arquivo vazio");

  const mime = detectarMime(conteudo);
  if (!mime) {
    throw new ErroDeMidia(
      "Formato não reconhecido. Envie JPG, PNG ou WEBP para imagens, MP4 ou WEBM para vídeo.",
    );
  }

  if (ehVideo(tipo)) {
    if (!FORMATOS_VIDEO[mime]) throw new ErroDeMidia("O vídeo precisa ser MP4 ou WEBM.");
    if (conteudo.length > LIMITES.tamanhoVideo) {
      throw new ErroDeMidia(`O vídeo passa de ${LIMITES.tamanhoVideo / 1024 / 1024} MB.`);
    }
  } else {
    if (!FORMATOS_IMAGEM[mime]) throw new ErroDeMidia("A imagem precisa ser JPG, PNG ou WEBP.");
    if (conteudo.length > LIMITES.tamanhoImagem) {
      throw new ErroDeMidia(`A imagem passa de ${LIMITES.tamanhoImagem / 1024 / 1024} MB.`);
    }
  }

  return mime;
}

export function extensaoDe(mime: string): string {
  return FORMATOS_IMAGEM[mime] ?? FORMATOS_VIDEO[mime] ?? "bin";
}

/// Nome do arquivo é sempre gerado aqui. O nome enviado pelo usuário é
/// descartado — é por ele que entrariam "../" e travessia de diretório.
export function gerarChave(mime: string): string {
  return `${crypto.randomUUID()}.${extensaoDe(mime)}`;
}

export function diretorioMidia(): string {
  return process.env.MIDIA_DIR ?? path.join(process.cwd(), "midia");
}

/// Resolve o caminho e confirma que ele continua dentro do diretório de mídia,
/// mesmo que a chave venha adulterada do banco.
function caminhoSeguro(chave: string): string {
  const base = path.resolve(diretorioMidia());
  const destino = path.resolve(base, path.basename(chave));

  if (!destino.startsWith(base + path.sep)) {
    throw new ErroDeMidia("Caminho de arquivo inválido");
  }
  return destino;
}

export async function gravar(chave: string, conteudo: Buffer): Promise<void> {
  const destino = caminhoSeguro(chave);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, conteudo);
}

export async function ler(chave: string): Promise<Buffer> {
  return fs.readFile(caminhoSeguro(chave));
}

export async function apagar(chave: string): Promise<void> {
  await fs.unlink(caminhoSeguro(chave)).catch(() => {
    // Arquivo já sumiu do disco: o registro no banco ainda precisa sair.
  });
}

export function limiteDe(tipo: TipoMidia): number {
  if (tipo === TipoMidia.BANNER) return LIMITES.bannerPorRifa;
  if (tipo === TipoMidia.VIDEO) return LIMITES.videoPorRifa;
  return LIMITES.imagensPorRifa;
}
