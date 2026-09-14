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
export function mediaKey(campaignId: string, role: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(0, 8).replace(/[^.a-z0-9]/g, "");
  return `campanhas/${campaignId}/${role}-${randomUUID()}${ext}`;
}

/* ------------------------------------------------------------------ *
 * Desenvolvimento: disco local
 * ------------------------------------------------------------------ */

export class LocalDiskStorage implements Storage {
  readonly name = "local";
  private root = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads");
  private secret = process.env.SESSION_SECRET ?? "dev-secret-nao-use-em-producao";

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

  async write(key: string, body: Buffer) {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async readAll(key: string) {
    return fs.readFile(this.pathFor(key));
  }

  async size(key: string) {
    return (await fs.stat(this.pathFor(key))).size;
  }

  reader(key: string): RangeReader {
    return async (offset, length) => {
      const handle = await fs.open(this.pathFor(key), "r");
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

export function storage(): Storage {
  if (cached) return cached;
  cached = process.env.R2_BUCKET ? new R2Storage() : new LocalDiskStorage();
  if (cached.name === "local" && process.env.NODE_ENV === "production") {
    throw new Error("Configure o R2 em produção: disco local não serve.");
  }
  return cached;
}
