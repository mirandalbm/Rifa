import { describe, it, expect } from "vitest";
import { sslConfigFor } from "../server/dbSsl";

describe("TLS do Postgres", () => {
  it("não usa TLS na máquina local", () => {
    expect(sslConfigFor("postgres://rifa:rifa@127.0.0.1:5433/rifa")).toBe(false);
    expect(sslConfigFor("postgres://rifa:rifa@localhost:5432/rifa")).toBe(false);
  });

  it("não usa TLS na rede privada do Railway", () => {
    expect(sslConfigFor("postgresql://postgres:x@postgres.railway.internal:5432/railway")).toBe(false);
  });

  it("verifica o certificado por padrão em banco remoto", () => {
    expect(sslConfigFor("postgres://u:p@ep-cool.sa-east-1.aws.neon.tech/rifa")).toEqual({
      rejectUnauthorized: true,
    });
    expect(sslConfigFor("postgres://u:p@db.exemplo.com/rifa?sslmode=require")).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("respeita o sslmode declarado na URL", () => {
    expect(sslConfigFor("postgres://u:p@db.exemplo.com/rifa?sslmode=disable")).toBe(false);
    expect(sslConfigFor("postgres://u:p@shuttle.proxy.rlwy.net:12345/railway?sslmode=no-verify")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("não afrouxa por um nome parecido", () => {
    // "localhost" no meio do nome não é a máquina local.
    expect(sslConfigFor("postgres://u:p@localhost.evil.com/rifa")).toEqual({ rejectUnauthorized: true });
    expect(sslConfigFor("postgres://u:p@railway.internal.evil.com/rifa")).toEqual({ rejectUnauthorized: true });
  });
});
