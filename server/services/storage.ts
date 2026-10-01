/**
 * Armazenamento de mídia.
 *
 * O arquivo nunca passa pela nossa API em produção: o administrador recebe
 * uma URL assinada e envia direto para o R2. Em desenvolvimento o disco
 * local faz o mesmo papel, para o fluxo rodar sem nuvem nenhuma.
 */
import { createHmac, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RangeReader } from "./probe";

export interface UploadTicket {
  /** Para onde o navegador envia o arquivo. */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  /** Identificador do objeto, devolvido depois na confirmação. */
  storageKey: string;
  expiresInSeconds: number;
}

export interface Storage {
  readonly name: string;
  presignUpload(params: { key: string; contentType: string }): Promise<UploadTicket>;
  size(key: string): Promise<number>;
  reader(key: string): RangeReader;
  readAll(key: string): Promise<Buffer>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/** Chave que já é um endereço pronto (data URI do seed, CDN externa). */
function isAbsolute(key: string): boolean {
  return key.startsWith("data:") || key.startsWith("http://") || key.startsWith("https://");
}

/** Chave opaca: nada do nome original do arquivo vaza para a URL. */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

/**
 * A extensão sai do tipo já validado, nunca do nome enviado: com o nome,
 * `banner.html` virava uma página servida pelo próprio domínio.
 */
export function mediaKey(campaignId: string, role: string, mime: string): string {
  const ext = EXT_BY_MIME[mime] ?? "";
  return `campanhas/${campaignId}/${role}-${randomUUID()}${ext}`;
}

/**
 * A chave foi gerada por `mediaKey` para esta campanha e este papel? A
 * confirmação do envio recebe a chave do navegador: sem conferir, o
 * organizador de uma rifa apontava a chave de outra organização (as chaves
 * aparecem nos endereços públicos das imagens) — e a recusa da mídia apaga
 * o objeto da chave. Era apagar o banner do vizinho.
 */
export function chaveDaCampanha(key: string, campaignId: string, role: string): boolean {
  const exts = Object.values(EXT_BY_MIME).map((e) => e.slice(1)).join("|");
  const re = new RegExp(`^campanhas/([0-9a-f-]{36})/([a-z]+)-[0-9a-f-]{36}(\\.(${exts}))?$`);
  const m = re.exec(key);
  return Boolean(m && m[1] === campaignId && m[2] === role);
}

/* ------------------------------------------------------------------ *
 * Desenvolvimento: disco local
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Cópia de segurança: cada arquivo gravado no disco vai também para um
 * bucket S3 (Cloudflare R2, bucket do Railway, AWS…). Foi o que faltou
 * quando o disco do servidor apontava para fora do volume: as fotos e os
 * vídeos sumiam a cada publicação, sem cópia em lugar nenhum.
 * ------------------------------------------------------------------ */

/** O que a cópia precisa saber fazer — a prova injeta uma de mentira. */
export interface Copia {
  readonly nome: string;
  guardar(key: string, body: Buffer, contentType: string): Promise<void>;
  /** O arquivo da cópia, ou nulo se ela não tem. */
  buscar(key: string): Promise<Buffer | null>;
  existe(key: string): Promise<boolean>;
  apagar(key: string): Promise<void>;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};
const mimeDaChave = (key: string) => MIME_BY_EXT[path.extname(key).toLowerCase()] ?? "application/octet-stream";

export class CopiaS3 implements Copia {
  readonly nome = "s3";
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: process.env.BACKUP_S3_REGION || "auto",
      endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
      // Bucket do Railway e MinIO usam o caminho (`/bucket/chave`); o R2 aceita os dois.
      forcePathStyle: process.env.BACKUP_S3_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async guardar(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async buscar(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch (e) {
      const nome = (e as { name?: string }).name;
      if (nome === "NoSuchKey" || nome === "NotFound") return null;
      throw e;
    }
  }

  async existe(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      const nome = (e as { name?: string }).name;
      if (nome === "NotFound" || nome === "NoSuchKey") return false;
      throw e;
    }
  }

  async apagar(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** A cópia configurada pelo ambiente (`BACKUP_S3_BUCKET` e as chaves), ou nenhuma. */
export function copiaDoAmbiente(): Copia | null {
  const bucket = process.env.BACKUP_S3_BUCKET;
  return bucket ? new CopiaS3(bucket) : null;
}

const naoExiste = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

export class LocalDiskStorage implements Storage {
  readonly name = "local";
  private root: string;
  private secret = process.env.SESSION_SECRET ?? "dev-secret-nao-use-em-producao";

  constructor(
    private copia: Copia | null = null,
    root = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads"),
  ) {
    this.root = root;
  }

  get temCopia() {
    return this.copia !== null;
  }

  /**
   * O arquivo sumiu do disco (volume trocado, disco apagado): traz da cópia
   * e grava de novo, para a próxima leitura nem passar por aqui. Sem cópia,
   * ou sem o arquivo nela, devolve falso.
   */
  async restaurar(key: string): Promise<boolean> {
    if (!this.copia) return false;
    const corpo = await this.copia.buscar(key);
    if (!corpo) return false;
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, corpo);
    return true;
  }

  /** Lê do disco; se não estiver lá, tenta a cópia uma vez. */
  private async comCopia<T>(key: string, ler: () => Promise<T>): Promise<T> {
    try {
      return await ler();
    } catch (e) {
      if (naoExiste(e) && (await this.restaurar(key))) return ler();
      throw e;
    }
  }

  /**
   * Põe na cópia o que está no disco e ainda não tem cópia (o que foi
   * enviado antes de a cópia ser ligada). Devolve quantos foram copiados.
   */
  async sincronizarCopia(): Promise<number> {
    if (!this.copia) return 0;
    let copiados = 0;
    const andar = async (dir: string): Promise<void> => {
      let itens: import("node:fs").Dirent[];
      try {
        itens = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (naoExiste(e)) return;
        throw e;
      }
      for (const item of itens) {
        const cheio = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name !== "lost+found") await andar(cheio);
          continue;
        }
        const key = path.relative(this.root, cheio).split(path.sep).join("/");
        if (await this.copia!.existe(key)) continue;
        await this.copia!.guardar(key, await fs.readFile(cheio), mimeDaChave(key));
        copiados++;
      }
    };
    await andar(this.root);
    return copiados;
  }

  /** Caminho no disco, para servir o arquivo. */
  caminho(key: string) {
    return this.pathFor(key);
  }

  private pathFor(key: string) {
    const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return path.join(this.root, safe);
  }

  /** Assinatura própria, para a rota de recepção aceitar só o que prometemos. */
  sign(key: string, expiresAt: number): string {
    return createHmac("sha256", this.secret).update(`${key}:${expiresAt}`).digest("hex");
  }

  verify(key: string, expiresAt: number, signature: string): boolean {
    if (Date.now() > expiresAt) return false;
    return this.sign(key, expiresAt) === signature;
  }

  async presignUpload({ key, contentType }: { key: string; contentType: string }) {
    const expiresAt = Date.now() + 15 * 60_000;
    const sig = this.sign(key, expiresAt);
    return {
      url: `/api/admin/media/raw?key=${encodeURIComponent(key)}&exp=${expiresAt}&sig=${sig}`,
      method: "PUT" as const,
      headers: { "Content-Type": contentType },
      storageKey: key,
      expiresInSeconds: 900,
    };
  }

  /**
   * Grava no disco e, com cópia configurada, no bucket — na hora, a cada
   * envio. Falha da cópia não derruba o envio (o arquivo está no disco), mas
   * vai para o log, que é onde se descobre que a cópia parou.
   */
  async write(key: string, body: Buffer, contentType?: string) {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    if (this.copia) {
      try {
        await this.copia.guardar(key, body, contentType || mimeDaChave(key));
      } catch (e) {
        console.error(`[backup] não guardei a cópia de ${key}:`, (e as Error).message);
      }
    }
  }

  async readAll(key: string) {
    return this.comCopia(key, () => fs.readFile(this.pathFor(key)));
  }

  async size(key: string) {
    return this.comCopia(key, async () => (await fs.stat(this.pathFor(key))).size);
  }

  reader(key: string): RangeReader {
    return async (offset, length) => {
      const handle = await this.comCopia(key, () => fs.open(this.pathFor(key), "r"));
      try {
        const buf = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buf, 0, length, offset);
        return buf.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    };
  }

  async remove(key: string) {
    await fs.rm(this.pathFor(key), { force: true });
    // A mídia recusada ou removida sai da cópia também: senão voltaria sozinha.
    if (this.copia) await this.copia.apagar(key).catch(() => {});
  }

  publicUrl(key: string) {
    return isAbsolute(key) ? key : `/uploads/${key}`;
  }
}

/* ------------------------------------------------------------------ *
 * Produção: Cloudflare R2 (API compatível com S3)
 * ------------------------------------------------------------------ */

export class R2Storage implements Storage {
  readonly name = "r2";
  private client: S3Client;
  private bucket = required("R2_BUCKET");
  private publicBase = required("R2_PUBLIC_URL").replace(/\/+$/, "");

  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async presignUpload({ key, contentType }: { key: string; contentType: string }) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
    return {
      url,
      method: "PUT" as const,
      headers: { "Content-Type": contentType },
      storageKey: key,
      expiresInSeconds: 900,
    };
  }

  async size(key: string) {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return head.ContentLength ?? 0;
  }

  /**
   * Leitura por Range: medir a duração de um vídeo de 300 MB custa alguns
   * kilobytes, não o arquivo inteiro.
   */
  reader(key: string): RangeReader {
    return async (offset, length) => {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=${offset}-${offset + length - 1}`,
        }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    };
  }

  async readAll(key: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async write(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string) {
    return isAbsolute(key) ? key : `${this.publicBase}/${key}`;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatória para usar o R2.`);
  return value;
}

let cached: Storage | null = null;

/**
 * Em produção o disco só serve se for o volume (`UPLOAD_DIR` apontando para
 * ele): fora do volume, tudo some a cada publicação. A cópia (`BACKUP_S3_*`)
 * é o que protege do volume perdido.
 */
export function storage(): Storage {
  if (cached) return cached;
  if (process.env.R2_BUCKET) return (cached = new R2Storage());
  if (process.env.NODE_ENV === "production" && !process.env.UPLOAD_DIR) {
    throw new Error("Configure UPLOAD_DIR (o volume) ou o R2 em produção: o disco do contêiner é apagado a cada publicação.");
  }
  return (cached = new LocalDiskStorage(copiaDoAmbiente()));
}
