import { z } from "zod";

const apenasDigitos = (valor: string) => valor.replace(/\D/g, "");

export const esquemaComprador = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(160),
  telefone: z
    .string()
    .trim()
    .transform(apenasDigitos)
    .refine((v) => v.length >= 10 && v.length <= 11, "Telefone deve ter DDD + número"),
  // CPF em branco vira null: string vazia gravada atrapalharia a consulta depois.
  cpf: z
    .string()
    .trim()
    .transform((valor) => apenasDigitos(valor) || null)
    .refine((v) => v === null || v.length === 11, "CPF deve ter 11 dígitos")
    .optional()
    .nullable(),
});

export const esquemaNovaCompra = z.object({
  rifaId: z.string().min(1),
  numeros: z.array(z.number().int().nonnegative()).min(1, "Selecione ao menos um número").max(100),
  comprador: esquemaComprador,
  codigoAfiliado: z.string().trim().min(1).max(32).optional().nullable(),
});

export const esquemaLogin = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
});

export const esquemaConsultaNumeros = z.object({
  termo: z.string().trim().min(3, "Informe CPF, telefone ou código da compra"),
});

export const esquemaPublicarResultado = z.object({
  rifaId: z.string().min(1),
  concurso: z.string().trim().min(1, "Informe o concurso da Loteria Federal"),
  primeiroPremio: z
    .string()
    .trim()
    .transform(apenasDigitos)
    .refine((v) => v.length >= 4, "O 1º prêmio da Federal tem 5 dígitos"),
  premiosFederal: z.array(z.string()).optional(),
  dataApuracao: z.coerce.date(),
  observacao: z.string().trim().max(500).optional().nullable(),
});

export const esquemaNovoAfiliado = z.object({
  nome: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  telefone: z.string().trim().transform(apenasDigitos).optional().nullable(),
  senha: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  percentualComissao: z.coerce.number().min(0).max(50),
  chavePixRecebimento: z.string().trim().max(140).optional().nullable(),
});

export const esquemaNovaRifa = z.object({
  titulo: z.string().trim().min(3).max(140),
  descricao: z.string().trim().max(2000).optional().nullable(),
  premio: z.string().trim().min(3).max(280),
  precoPorNumero: z.coerce.number().positive(),
  quantidadeNumeros: z.coerce.number().int().min(10).max(100000),
  limiteNumerosPorCompra: z.coerce.number().int().min(1).max(100).default(20),
  minutosParaPagar: z.coerce.number().int().min(5).max(1440).default(30),
  dataSorteio: z.coerce.date(),
  autorizacaoNumero: z.string().trim().max(80).optional().nullable(),
  regulamentoUrl: z.string().trim().url().optional().nullable(),
});
