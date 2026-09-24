import { describe, it, expect } from "vitest";
import {
  roleSatisfies,
  sectionsFor,
  canAccess,
  homeFor,
  SECTIONS,
  API_SCOPES,
  type Role,
} from "../shared/access";

const PAPEIS: Role[] = ["guest", "buyer", "affiliate", "cambista", "organizer", "admin"];

describe("matriz de acesso com organizador", () => {
  it("o administrador geral alcança as telas do organizador", () => {
    // São as MESMAS telas: o que muda é o recorte, não o menu.
    expect(roleSatisfies("admin", "organizer")).toBe(true);
    expect(canAccess("admin", "adminCampanhas")).toBe(true);
    expect(canAccess("organizer", "adminCampanhas")).toBe(true);
  });

  it("o organizador não alcança o que é da plataforma", () => {
    expect(roleSatisfies("organizer", "admin")).toBe(false);
    expect(canAccess("organizer", "adminOrganizacoes")).toBe(false);
    expect(canAccess("organizer", "adminAntifraude")).toBe(false);
  });

  it("organizador não é afiliado nem cambista", () => {
    // O painel do afiliado mostra o saldo de um afiliado; organizador não tem.
    expect(roleSatisfies("organizer", "affiliate")).toBe(false);
    expect(roleSatisfies("organizer", "cambista")).toBe(false);
  });

  it("nem afiliado nem cambista viram organizador", () => {
    for (const papel of ["affiliate", "cambista", "buyer", "guest"] as Role[]) {
      expect(roleSatisfies(papel, "organizer")).toBe(false);
      expect(roleSatisfies(papel, "admin")).toBe(false);
    }
  });

  it("o menu do organizador é o do admin menos o da plataforma", () => {
    const doAdmin = sectionsFor("admin").map((s) => s.key);
    const doOrganizador = sectionsFor("organizer").map((s) => s.key);

    expect(doOrganizador.every((k) => doAdmin.includes(k))).toBe(true);
    expect(doAdmin).toContain("adminOrganizacoes");
    expect(doOrganizador).not.toContain("adminOrganizacoes");
    expect(doOrganizador).not.toContain("adminAntifraude");
  });

  it("todo papel de painel cai numa home própria", () => {
    expect(homeFor("organizer")).toBe("/admin");
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("affiliate")).toBe("/afiliado");
    expect(homeFor("cambista")).toBe("/cambista");
  });

  it("o router de admin abre para organizador — quem separa é o escopo", () => {
    const admin = API_SCOPES.find((s) => s.prefix === "/api/admin");
    expect(admin?.requires).toBe("organizer");
  });

  it("nenhuma seção do painel fica sem dono", () => {
    // Seção que ninguém alcança é tela morta; seção que todo mundo alcança
    // provavelmente é engano.
    for (const s of SECTIONS) {
      const quem = PAPEIS.filter((p) => roleSatisfies(p, s.requires));
      expect(quem.length).toBeGreaterThan(0);
      if (s.key.startsWith("admin")) {
        expect(quem).not.toContain("guest");
        expect(quem).not.toContain("affiliate");
      }
    }
  });

  it("toda chave de seção é única e tem caminho", () => {
    const chaves = SECTIONS.map((s) => s.key);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const s of SECTIONS) expect(s.path.startsWith("/")).toBe(true);
  });
});
