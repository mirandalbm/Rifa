/**
 * Conta do apostador: cadastro, entrada por telefone/CPF/e-mail + senha,
 * troca de senha e exclusão pela LGPD.
 *
 * A regra que segura tudo (ver `shared/contaComprador.ts`): conta com
 * telefone não confirmado só enxerga o que comprou dentro dela. Quem
 * confirma o telefone é o código do WhatsApp — o mesmo de "Minhas cotas".
 */
import { createHash } from "node:crypto";
import type { Request } from "express";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, chamados, notifications } from "@shared/schema";
import { cpfValido, normalizePhone } from "@shared/format";
import {
  NOME_EXCLUIDO,
  type Titularidade,
  problemaNoCadastro,
  tipoDoIdentificador,
  type CadastroComprador,
} from "@shared/contaComprador";
import { senhaInvalida } from "@shared/senha";
import { hashPassword, verifyPassword } from "../auth";
import { isUniqueViolation } from "../pgError";
import { guardLogin, hit, identify } from "./antifraude";

export class ContaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ContaError";
  }
}

const LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000;
/** Cadastros por IP por hora: criar conta em série é o primeiro passo de fraude. */
const CADASTROS_POR_HORA = 10;

type Comprador = typeof buyers.$inferSelect;

/**
 * Sessão nova ao entrar, como no painel: id de sessão plantado antes não
 * vira a sessão do comprador. A indicação do afiliado sobrevive.
 */
export async function entrarComoComprador(
  req: Request,
  b: { id: string; phone: string; name: string },
  confirmado: boolean,
  lembrar = false,
) {
  const { affiliateCode, affiliateSince } = req.session;
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.affiliateCode = affiliateCode;
  req.session.affiliateSince = affiliateSince;
  req.session.buyer = { id: b.id, phone: b.phone, name: b.name, confirmado };
  (req.session.cookie as { maxAge: number | null }).maxAge = lembrar ? LEMBRAR_MS : null;
}

/**
 * Derruba as outras sessões da conta. Troca de senha, telefone provado e
 * exclusão são justamente o momento de expulsar quem entrou antes — por
 * exemplo, quem criou a conta com o telefone de outra pessoa.
 */
export async function encerrarOutrasSessoes(buyerId: string, manterSid?: string) {
  await db.execute(sql`
    DELETE FROM sessions
    WHERE sess -> 'buyer' ->> 'id' = ${buyerId}
      ${manterSid ? sql`AND sid <> ${manterSid}` : sql``}`);
}

/** A chave do limite de tentativas nunca guarda CPF ou telefone cru. */
function chaveDeLogin(identificador: string) {
  return `comprador:${createHash("sha256").update(identificador).digest("hex").slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * Cadastro
 * ------------------------------------------------------------------ */

export async function criarConta(req: Request, entrada: CadastroComprador & { lembrar?: boolean }) {
  const problema = problemaNoCadastro(entrada);
  if (problema) throw new ContaError(problema);

  const ident = identify(req);
  const limite = await hit(`cadastro:${ident.ipHash ?? "sem-ip"}`, 60, CADASTROS_POR_HORA);
  if (limite.excedeu) {
    throw new ContaError("Muitos cadastros deste endereço. Tente de novo em uma hora.", 429);
  }

  const phone = normalizePhone(entrada.telefone);
  const cpf = entrada.cpf.replace(/\D/g, "");
  const email = entrada.email?.trim().toLowerCase() || null;
  const nome = entrada.nome.trim();
  const passwordHash = await hashPassword(entrada.senha);
  // Quem já provou o telefone nesta sessão (código do WhatsApp) cria a conta
  // já confirmada.
  const confirmadoAgora =
    req.session.buyer?.confirmado === true && req.session.buyer.phone === phone;

  try {
    const [existente] = await db.select().from(buyers).where(eq(buyers.phone, phone));
    let conta: Comprador | undefined;

    if (existente) {
      if (existente.passwordHash) {
        throw new ContaError(
          "Este telefone já tem conta. Entre com a senha, ou recupere pelo código do WhatsApp.",
          409,
        );
      }
      // Comprador antigo virando conta. O CPF das compras não muda: se já
      // estava gravado e é outro, este cadastro não é do dono das compras.
      if (existente.cpf && existente.cpf.replace(/\D/g, "") !== cpf) {
        throw new ContaError("O CPF não confere com as compras feitas por este telefone.", 409);
      }
      // O CPF gravado nas compras bateu: elas vêm para a conta. Sem CPF
      // gravado não há o que conferir — só o código do WhatsApp as libera.
      const cpfProvou = Boolean(existente.cpf);
      // Condicional: dois cadastros ao mesmo tempo, só um vira dono.
      [conta] = await db
        .update(buyers)
        .set({
          name: nome,
          cpf,
          email,
          passwordHash,
          contaCriadaEm: new Date(),
          ...(cpfProvou ? { comprasVinculadasEm: new Date() } : {}),
          ...(confirmadoAgora ? { telefoneConfirmadoEm: new Date() } : {}),
        })
        .where(and(eq(buyers.id, existente.id), isNull(buyers.passwordHash)))
        .returning();
      if (!conta) throw new ContaError("Este telefone já tem conta. Entre com a senha.", 409);
    } else {
      [conta] = await db
        .insert(buyers)
        .values({
          name: nome,
          phone,
          cpf,
          email,
          passwordHash,
          contaCriadaEm: new Date(),
          telefoneConfirmadoEm: confirmadoAgora ? new Date() : null,
        })
        .returning();
    }

    await entrarComoComprador(req, conta, Boolean(conta.telefoneConfirmadoEm), entrada.lembrar);
    return conta;
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_conta_cpf")) {
      throw new ContaError("Já existe uma conta com este CPF. Entre com a senha.", 409);
    }
    if (isUniqueViolation(err, "uq_buyers_conta_email")) {
      throw new ContaError("Já existe uma conta com este e-mail. Entre com a senha.", 409);
    }
    if (isUniqueViolation(err, "uq_buyers_phone")) {
      throw new ContaError("Este telefone já tem conta. Entre com a senha.", 409);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Entrar
 * ------------------------------------------------------------------ */

/** Mesma mensagem para quem não existe e para senha errada. */
const NAO_CONFERE = "Telefone, CPF, e-mail ou senha não conferem.";

export async function entrarNaConta(
  req: Request,
  identificador: string,
  senha: string,
  lembrar: boolean,
) {
  const tipo = tipoDoIdentificador(identificador);
  if (!tipo || !senha) throw new ContaError(NAO_CONFERE, 401);

  const chave = tipo === "email" ? identificador.trim().toLowerCase() : normalizePhone(identificador);
  const veredito = await guardLogin(chaveDeLogin(chave), identify(req));
  if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);

  // Telefone e CPF têm 11 dígitos os dois: procura nas duas colunas e a
  // senha decide. Só entre contas (com senha) e não excluídas.
  const candidatos = await db
    .select()
    .from(buyers)
    .where(
      and(
        isNotNull(buyers.passwordHash),
        isNull(buyers.excluidoEm),
        tipo === "email"
          ? eq(buyers.email, chave)
          : or(eq(buyers.phone, chave), cpfValido(chave) ? eq(buyers.cpf, chave) : sql`false`),
      ),
    )
    .limit(3);

  for (const c of candidatos) {
    if (c.passwordHash && (await verifyPassword(senha, c.passwordHash))) {
      await entrarComoComprador(req, c, Boolean(c.telefoneConfirmadoEm), lembrar);
      return c;
    }
  }
  throw new ContaError(NAO_CONFERE, 401);
}

/* ------------------------------------------------------------------ *
 * Dados, senha e exclusão
 * ------------------------------------------------------------------ */

/**
 * O que esta sessão pode enxergar do telefone. O código do WhatsApp nesta
 * sessão vale como telefone provado mesmo sem cadastro por trás.
 */
export async function titularidadeDaSessao(req: Request): Promise<Titularidade> {
  const b = req.session.buyer;
  if (!b) return { telefoneConfirmado: false, comprasVinculadasEm: null };
  if (!b.id) return { telefoneConfirmado: b.confirmado === true, comprasVinculadasEm: null };
  const [c] = await db
    .select({ tel: buyers.telefoneConfirmadoEm, vinc: buyers.comprasVinculadasEm })
    .from(buyers)
    .where(eq(buyers.id, b.id));
  return {
    telefoneConfirmado: b.confirmado === true || Boolean(c?.tel),
    comprasVinculadasEm: c?.vinc ?? null,
  };
}

export function compradorDaSessao(req: Request) {
  const b = req.session.buyer;
  if (!b?.id) throw new ContaError("Entre na sua conta para continuar.", 401);
  return b;
}

export async function dadosDaConta(buyerId: string) {
  const [c] = await db.select().from(buyers).where(eq(buyers.id, buyerId));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);
  return {
    nome: c.name,
    telefone: c.phone,
    cpf: c.cpf,
    email: c.email,
    codigo: c.codigo,
    temSenha: Boolean(c.passwordHash),
    telefoneConfirmado: Boolean(c.telefoneConfirmadoEm),
  };
}

/**
 * Trocar ou criar a senha. Pede a atual — exceto logo depois do código do
 * WhatsApp, que já provou o telefone (é o "esqueci a senha").
 */
export async function trocarSenha(req: Request, atual: string, nova: string) {
  const sessao = compradorDaSessao(req);
  const [c] = await db.select().from(buyers).where(eq(buyers.id, sessao.id));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);

  const provouTelefone = sessao.confirmado === true;
  if (c.passwordHash && !provouTelefone) {
    const veredito = await guardLogin(chaveDeLogin(c.phone), identify(req));
    if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);
    if (!(await verifyPassword(atual, c.passwordHash))) {
      throw new ContaError("A senha atual não confere.", 401);
    }
  }
  if (!c.passwordHash && !provouTelefone) {
    throw new ContaError("Confirme o telefone pelo código do WhatsApp para criar a senha.", 403);
  }
  const invalida = senhaInvalida(nova, "buyer");
  if (invalida) throw new ContaError(invalida);

  await db
    .update(buyers)
    .set({
      passwordHash: await hashPassword(nova),
      contaCriadaEm: c.contaCriadaEm ?? new Date(),
    })
    .where(eq(buyers.id, c.id));
  await encerrarOutrasSessoes(c.id, req.sessionID);
}

/**
 * Exclusão pela LGPD. Os dados pessoais saem (nome, telefone, CPF, e-mail,
 * senha) e as mensagens enviadas perdem o telefone; compras, bilhetes e
 * recibos ficam, sem ligação com a pessoa, pelo prazo legal.
 */
export async function excluirConta(req: Request, senha: string) {
  const sessao = compradorDaSessao(req);
  const [c] = await db.select().from(buyers).where(eq(buyers.id, sessao.id));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);

  // Quem entrou pelo código do WhatsApp já provou o telefone; quem entrou
  // pela senha confirma com ela.
  if (sessao.confirmado !== true) {
    if (!c.passwordHash || !(await verifyPassword(senha, c.passwordHash))) {
      throw new ContaError("A senha não confere.", 401);
    }
  }

  const [andamento] = await db
    .select({ id: chamados.id })
    .from(chamados)
    .where(and(eq(chamados.buyerId, c.id), inArray(chamados.status, ["aberto", "aprovado"])))
    .limit(1);
  if (andamento) {
    throw new ContaError(
      "Você tem um pedido de reembolso em andamento. Aguarde a conclusão para excluir a conta.",
      409,
    );
  }

  await db.transaction(async (tx) => {
    // O telefone é chave única: vira um marcador que ninguém digita.
    await tx
      .update(buyers)
      .set({
        name: NOME_EXCLUIDO,
        phone: `removido:${c.id}`,
        cpf: null,
        email: null,
        passwordHash: null,
        telefoneConfirmadoEm: null,
        excluidoEm: new Date(),
      })
      .where(eq(buyers.id, c.id));
    await tx
      .update(notifications)
      .set({ to: "removido", params: {} })
      .where(eq(notifications.to, c.phone));
  });

  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  await encerrarOutrasSessoes(c.id);
}
