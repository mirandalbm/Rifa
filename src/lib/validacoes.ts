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

/// A compra chega de duas formas: com os números escolhidos a dedo (rifa
/// pequena, onde a grade cabe na tela) ou só com a quantidade, deixando o
/// servidor sortear os disponíveis (rifa grande, onde não há grade).
export const esquemaNovaCompra = z
  .object({
    rifaId: z.string().min(1),
    numeros: z.array(z.number().int().nonnegative()).min(1).max(100).optional(),
    quantidade: z.coerce.number().int().min(1).max(100).optional(),
    comprador: esquemaComprador,
    codigoAfiliado: z.string().trim().min(1).max(32).optional().nullable(),
  })
  .refine((dados) => Boolean(dados.numeros) !== Boolean(dados.quantidade), {
    message: "Escolha os números ou informe a quantidade — não os dois",
    path: ["numeros"],
  });

/// O campo aceita nome de usuário ou e-mail — quem entra no painel digita o
/// que for mais curto. Sem tamanho mínimo na senha: validar política de senha
/// no login só serviria para revelar qual é a política a quem tenta adivinhar.
export const esquemaLogin = z.object({
  identificador: z.string().trim().min(1, "Informe usuário ou e-mail").max(160),
  senha: z.string().min(1, "Informe a senha").max(200),
});

const nomeDeUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Usuário deve ter ao menos 3 caracteres")
  .max(32)
  .regex(/^[a-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado");

export const esquemaCadastroApostador = z.object({
  usuario: nomeDeUsuario,
  nome: z.string().trim().min(3, "Informe o nome completo").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(160),
  telefone: z
    .string()
    .trim()
    .transform(apenasDigitos)
    .refine((v) => v.length >= 10 && v.length <= 11, "Telefone deve ter DDD + número"),
  cpf: z
    .string()
    .trim()
    .transform((valor) => apenasDigitos(valor) || null)
    .refine((v) => v === null || v.length === 11, "CPF deve ter 11 dígitos")
    .optional()
    .nullable(),
  senha: z.string().min(6, "Senha deve ter ao menos 6 caracteres").max(200),
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
  /// Prêmios adicionais (2º, 3º…), necessários em rifas acima de 100 mil
  /// números, onde 5 dígitos não cobrem toda a faixa.
  premiosFederal: z
    .array(z.string().trim().transform(apenasDigitos).refine((v) => v.length >= 4, "Prêmio inválido"))
    .max(5)
    .optional(),
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
  quantidadeNumeros: z.coerce.number().int().min(10).max(10_000_000),
  limiteNumerosPorCompra: z.coerce.number().int().min(1).max(100).default(20),
  minutosParaPagar: z.coerce.number().int().min(5).max(1440).default(30),
  dataSorteio: z.coerce.date(),
  autorizacaoNumero: z.string().trim().max(80).optional().nullable(),
  regulamentoUrl: z.string().trim().url().optional().nullable(),
});
