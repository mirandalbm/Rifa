/**
 * Sócios e diretores da organização (resposta 5.6 do advogado): na rifa
 * autorizada não concorrem a promotora, seus sócios e diretores. O telefone
 * já barra quem é da casa (`telefoneImpedido`); os sócios e diretores entram
 * aqui com o CPF, e a compra com o CPF de um deles é recusada. A organização
 * declara que a lista está completa — a declaração é dela, e quem declara
 * responde. Mexer na lista apaga a declaração, e a rifa autorizada não
 * publica sem ela. Regras puras: a tela e o servidor leem daqui.
 */
import { cpfValido } from "./format";

export const CARGOS_DO_SOCIO = { socio: "Sócio", diretor: "Diretor ou administrador" } as const;
export type CargoDoSocio = keyof typeof CARGOS_DO_SOCIO;

export const SOCIOS_MAX = 30;
export const NOME_DO_SOCIO_MAX = 120;

export interface SocioNovo {
  nome: string;
  cargo: CargoDoSocio;
  /** Só os 11 dígitos — o servidor guarda a impressão e o final, nunca o CPF. */
  cpf: string;
}

export class SocioInvalido extends Error {}

/** Confere o que veio do formulário: só as chaves conhecidas. */
export function validarSocio(bruto: unknown): SocioNovo {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const nome = (typeof b.nome === "string" ? b.nome : "").trim().replace(/\s+/g, " ");
  if (nome.length < 3) throw new SocioInvalido("Diga o nome completo do sócio ou diretor.");
  if (nome.length > NOME_DO_SOCIO_MAX) throw new SocioInvalido(`O nome passa de ${NOME_DO_SOCIO_MAX} caracteres.`);
  if (/\d/.test(nome)) throw new SocioInvalido("O nome não leva números.");
  const cargo = typeof b.cargo === "string" ? b.cargo : "";
  if (!(cargo in CARGOS_DO_SOCIO)) throw new SocioInvalido("Escolha o cargo: sócio, ou diretor ou administrador.");
  const cpf = (typeof b.cpf === "string" ? b.cpf : "").replace(/\D/g, "");
  if (!cpfValido(cpf)) throw new SocioInvalido("CPF inválido.");
  return { nome, cargo: cargo as CargoDoSocio, cpf };
}

/** O que a tela mostra do CPF: só o final ("•••.•••.•••-09"). */
export const cpfMascarado = (final: string) => `•••.•••.•••-${final}`;

export const DECLARACAO_DOS_SOCIOS =
  "Declaro que esta lista traz todos os sócios, diretores e administradores da organização. Sei que eles não podem participar das rifas autorizadas dela e que a compra com o CPF de um deles é recusada.";

export const PROBLEMA_SEM_SOCIOS =
  "Cadastre os sócios e diretores da organização e declare a lista completa (Configurações, Organização e perfil): na rifa autorizada eles não podem concorrer.";

export const MSG_SOCIO_IMPEDIDO =
  "Este CPF é de sócio ou diretor da promotora: pelo regulamento, a promotora, seus sócios e diretores e a plataforma não podem participar desta rifa.";
