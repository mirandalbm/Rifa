import { Prisma } from "@prisma/client";

/// Valores monetários nunca transitam como float: entram e saem como string
/// decimal e são somados/multiplicados via Prisma.Decimal.
export function decimal(valor: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

export function multiplicar(valor: Prisma.Decimal | string, quantidade: number): Prisma.Decimal {
  return decimal(valor).mul(quantidade);
}

export function percentualDe(valor: Prisma.Decimal | string, percentual: Prisma.Decimal | string): Prisma.Decimal {
  return decimal(valor).mul(decimal(percentual)).div(100).toDecimalPlaces(2);
}

export function paraCentavos(valor: Prisma.Decimal | string): number {
  return decimal(valor).mul(100).toNumber();
}

export function formatarBRL(valor: Prisma.Decimal | string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    decimal(valor).toNumber(),
  );
}
