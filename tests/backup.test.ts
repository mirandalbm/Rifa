import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage, type Copia } from "../server/services/storage";

/** Cópia de mentira, em memória: a prova não sai para a internet. */
class CopiaNaMemoria implements Copia {
  readonly nome = "memoria";
  arquivos = new Map<string, { corpo: Buffer; tipo: string }>();
  falhar = false;
  async guardar(key: string, corpo: Buffer, tipo: string) {
    if (this.falhar) throw new Error("bucket fora do ar");
    this.arquivos.set(key, { corpo, tipo });
  }
  async buscar(key: string) {
    return this.arquivos.get(key)?.corpo ?? null;
  }
  async existe(key: string) {
    return this.arquivos.has(key);
  }
  async apagar(key: string) {
    this.arquivos.delete(key);
  }
}

const KEY = "campanhas/00000000-0000-0000-0000-000000000000/photo-11111111-1111-1111-1111-111111111111.jpg";

describe("cópia de segurança da mídia", () => {
  let dir: string;
  let copia: CopiaNaMemoria;
  let store: LocalDiskStorage;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rifa-backup-"));
    copia = new CopiaNaMemoria();
    store = new LocalDiskStorage(copia, dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("cada arquivo gravado vai para a cópia na hora, com o tipo certo", async () => {
    await store.write(KEY, Buffer.from("foto"));
    expect(copia.arquivos.get(KEY)?.corpo.toString()).toBe("foto");
    expect(copia.arquivos.get(KEY)?.tipo).toBe("image/jpeg");
  });

  it("o arquivo que sumiu do disco volta da cópia (e fica no disco de novo)", async () => {
    await store.write(KEY, Buffer.from("foto"));
    await rm(path.join(dir, KEY));
    expect((await store.readAll(KEY)).toString()).toBe("foto");
    expect((await stat(path.join(dir, KEY))).size).toBe(4);
    await rm(path.join(dir, KEY));
    expect(await store.size(KEY)).toBe(4);
    await rm(path.join(dir, KEY));
    expect((await store.reader(KEY)(0, 2)).toString()).toBe("fo");
  });

  it("sem o arquivo em lugar nenhum, o erro de sempre", async () => {
    await expect(store.readAll(KEY)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.restaurar(KEY)).toBe(false);
  });

  it("remover tira do disco e da cópia (senão voltaria sozinho)", async () => {
    await store.write(KEY, Buffer.from("foto"));
    await store.remove(KEY);
    expect(copia.arquivos.has(KEY)).toBe(false);
    await expect(store.readAll(KEY)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cópia fora do ar não derruba o envio: o arquivo fica no disco", async () => {
    copia.falhar = true;
    await store.write(KEY, Buffer.from("foto"));
    expect((await store.readAll(KEY)).toString()).toBe("foto");
  });

  it("a sincronização sobe só o que ainda não tem cópia", async () => {
    copia.falhar = true;
    await store.write(KEY, Buffer.from("a"));
    await store.write("campanhas/x/banner-y.png", Buffer.from("b"));
    copia.falhar = false;
    await store.write("campanhas/x/video-z.mp4", Buffer.from("c"));
    expect(await store.sincronizarCopia()).toBe(2);
    expect(copia.arquivos.get("campanhas/x/banner-y.png")?.tipo).toBe("image/png");
    expect(await store.sincronizarCopia()).toBe(0);
  });

  it("sem cópia configurada, nada muda", async () => {
    const sem = new LocalDiskStorage(null, dir);
    await sem.write(KEY, Buffer.from("foto"));
    expect(sem.temCopia).toBe(false);
    expect(await sem.sincronizarCopia()).toBe(0);
  });
});
