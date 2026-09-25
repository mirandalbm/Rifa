import { describe, it, expect } from "vitest";
import { isUniqueViolation, UNIQUE_VIOLATION } from "../server/pgError";

/**
 * O erro abaixo é o que o `pg` entrega de verdade quando o índice
 * `uq_orders_code` recusa uma gravação — copiado de uma rodada real do teste
 * de carga, com 500 compradores simultâneos.
 */
const erroReal = Object.assign(
  new Error(
    'duplicate key value violates unique constraint "uq_orders_code"',
  ),
  {
    code: "23505",
    constraint: "uq_orders_code",
    detail: "Key (code)=(482913) already exists.",
    table: "orders",
  },
);

/** O mesmo erro subindo sem o campo `constraint` preenchido. */
const erroSemCampo = Object.assign(
  new Error(
    'duplicate key value violates unique constraint "uq_orders_code"',
  ),
  { code: "23505" },
);

/** Colisão de cota: mesmo código SQL, outra causa — não se resolve sorteando. */
const erroDeCota = Object.assign(
  new Error('duplicate key value violates unique constraint "quota_alloc_pkey"'),
  { code: "23505", constraint: "quota_alloc_pkey", table: "quota_alloc" },
);

describe("leitura de erro do Postgres", () => {
  it("reconhece a colisão do código do pedido", () => {
    expect(isUniqueViolation(erroReal, "uq_orders_code")).toBe(true);
  });

  it("reconhece pela mensagem quando o driver não preenche o campo", () => {
    expect(isUniqueViolation(erroSemCampo, "uq_orders_code")).toBe(true);
  });

  it("não confunde colisão de cota com colisão de código", () => {
    // Este é o ponto: repetir o pedido com outro código não resolve uma
    // cota já vendida — e engolir esse erro venderia a cota duas vezes.
    expect(isUniqueViolation(erroDeCota, "uq_orders_code")).toBe(false);
  });

  it("ignora erro que não é violação de índice único", () => {
    const conexao = Object.assign(new Error("connection terminated"), {
      code: "08006",
    });
    expect(isUniqueViolation(conexao, "uq_orders_code")).toBe(false);
    expect(isUniqueViolation(null, "uq_orders_code")).toBe(false);
    expect(isUniqueViolation(undefined, "uq_orders_code")).toBe(false);
  });

  it("o código de violação é o do Postgres", () => {
    expect(UNIQUE_VIOLATION).toBe("23505");
  });
});

describe("erro embrulhado pelo Drizzle", () => {
  it("reconhece o conflito guardado em `cause`", () => {
    const embrulhado = Object.assign(new Error("Failed query: insert into \"users\" ..."), {
      cause: Object.assign(
        new Error('duplicate key value violates unique constraint "uq_users_email"'),
        { code: "23505", constraint: "uq_users_email" },
      ),
    });
    expect(isUniqueViolation(embrulhado, "uq_users_email")).toBe(true);
    expect(isUniqueViolation(embrulhado, "uq_orders_code")).toBe(false);
  });
});
