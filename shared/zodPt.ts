/**
 * Erro de validação em português, dizendo QUAL campo e O QUE fazer.
 *
 * "Dados inválidos." sozinho deixava a pessoa sem saber o que corrigir — e o
 * texto padrão do Zod vem em inglês ("Invalid uuid"). Mensagem escrita no
 * próprio schema (ex.: "O mínimo é 100 cotas.") tem precedência.
 */
import type { ZodIssue } from "zod";

/** Nome de cada campo como aparece na tela. */
const CAMPOS: Record<string, string> = {
  title: "Título",
  slug: "Endereço da rifa",
  prizeTitle: "Prêmio",
  description: "Descrição",
  totalQuotas: "Total de cotas",
  priceCents: "Preço da cota",
  commissionPctDefault: "Comissão padrão",
  minPerOrder: "Mínimo por pedido",
  maxPerOrder: "Máximo por pedido",
  reservationTtlMin: "Tempo de reserva",
  drawAt: "Data do sorteio",
  authorizationCode: "Autorização SPA/MF",
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  password: "Senha",
  quantity: "Quantidade",
  campaignId: "Campanha",
};

export function nomeDoCampo(path: (string | number)[]): string {
  const chave = path.filter((p) => typeof p === "string").at(-1) as string | undefined;
  return (chave && CAMPOS[chave]) ?? chave ?? "Campo";
}

/** As mensagens padrão do Zod começam em inglês; as escritas no schema, não. */
function mensagemPadrao(m: string): boolean {
  return /^(Invalid|Expected|Required|String must|Number must|Array must)/.test(m);
}

export function mensagemDoCampo(issue: ZodIssue): string {
  if (!mensagemPadrao(issue.message)) return issue.message;
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" ? "é obrigatório." : "está em formato errado.";
    case "too_small":
      return issue.type === "string"
        ? `precisa ter pelo menos ${issue.minimum} caracteres.`
        : `precisa ser no mínimo ${issue.minimum}.`;
    case "too_big":
      return issue.type === "string"
        ? `pode ter no máximo ${issue.maximum} caracteres.`
        : `pode ser no máximo ${issue.maximum}.`;
    case "invalid_string":
      return "está em formato errado.";
    default:
      return "está inválido.";
  }
}

export function mensagemDeValidacao(issues: ZodIssue[]): string {
  const partes = issues.slice(0, 3).map((i) => {
    const texto = mensagemDoCampo(i);
    // Mensagem do schema já é uma frase inteira; a genérica leva o campo na frente.
    return mensagemPadrao(i.message) ? `${nomeDoCampo(i.path)} ${texto}` : `${nomeDoCampo(i.path)}: ${texto}`;
  });
  return partes.join(" ");
}
