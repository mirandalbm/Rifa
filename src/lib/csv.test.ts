import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { campoCsv, montarCsv } from "@/lib/csv";

describe("campoCsv", () => {
  test("neutraliza fórmula vinda de dado cadastrado pelo comprador", () => {
    // Sem o apóstrofo, o Excel executaria isto ao abrir o relatório.
    assert.equal(campoCsv("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(campoCsv("+1+1"), "\"'+1+1\"");
    assert.equal(campoCsv("-2+3"), "\"'-2+3\"");
    assert.equal(campoCsv("@SUM(A1)"), "\"'@SUM(A1)\"");
  });

  test("não mexe em texto comum", () => {
    assert.equal(campoCsv("Maria Silva"), '"Maria Silva"');
    assert.equal(campoCsv("joao@email.com"), '"joao@email.com"');
  });

  test("escapa aspas duplicando-as, como manda o formato", () => {
    assert.equal(campoCsv('Ana "Aninha" Souza'), '"Ana ""Aninha"" Souza"');
  });

  test("campo vazio e ausente viram string vazia entre aspas", () => {
    assert.equal(campoCsv(null), '""');
    assert.equal(campoCsv(undefined), '""');
    assert.equal(campoCsv(""), '""');
  });

  test("ponto e vírgula e quebra de linha ficam contidos no campo", () => {
    // Sem as aspas, isto quebraria a coluna e a linha do relatório.
    assert.equal(campoCsv("Rua A; 123"), '"Rua A; 123"');
    assert.equal(campoCsv("linha1\nlinha2"), '"linha1\nlinha2"');
  });

  test("número é aceito sem virar texto quebrado", () => {
    assert.equal(campoCsv(42), '"42"');
    assert.equal(campoCsv(0), '"0"');
  });
});

describe("montarCsv", () => {
  test("começa com BOM para o Excel reconhecer a acentuação", () => {
    const csv = montarCsv(["nome"], [["João"]]);
    assert.ok(csv.startsWith("﻿"), "CSV deveria começar com BOM");
    assert.ok(csv.includes("João"));
  });

  test("usa ponto e vírgula entre colunas", () => {
    const csv = montarCsv(["a", "b"], [["1", "2"]]);
    assert.equal(csv, '﻿"a";"b"\n"1";"2"');
  });
});
