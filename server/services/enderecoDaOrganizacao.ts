/**
 * O guarda do endereço da organização (`<rotulo>.<base>`): decide, por
 * requisição e só pelo `Host`, de quem é o endereço e o que cada caminho faz
 * ali (`shared/enderecoRotas.ts`). Sem `SUBDOMINIO_BASE` é inerte. Nunca lê
 * `req.hostname`, `req.subdomains` nem `X-Forwarded-Host`.
 * docs/PLANO-SUBDOMINIO.md, cap. 1.3.
 */
import type { NextFunction, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { auditLog, campaigns, organizations } from "@shared/schema";
import { db } from "../db";
import { hit, identify } from "./antifraude";
import { subdominioBaseDoAmbiente } from "./subdominio";
import { hostDoRotulo, hostNormalizado, identificarHost, problemaParaLigarEndereco } from "../../shared/subdominio";
import { decidirNoEndereco, ehArquivoEstatico, ehCaminhoDeApi, type Decisao } from "../../shared/enderecoRotas";

export type EnderecoDaRequisicao =
  | { tipo: "principal" }
  | { tipo: "organizacao"; id: string; slug: string; nome: string }
  | { tipo: "inexistente" };

const VALIDADE_MS = 15_000;
const TETO_DO_CACHE = 2000;
const ehProducao = () => process.env.NODE_ENV === "production";

type Entrada<T> = { v: T; ate: number };
function guardar<T>(mapa: Map<string, Entrada<T>>, chave: string, v: T, agora = Date.now()) {
  if (mapa.size >= TETO_DO_CACHE) mapa.delete(mapa.keys().next().value as string);
  mapa.set(chave, { v, ate: agora + VALIDADE_MS });
}

let geracao = 0;
const rotulos = new Map<string, Entrada<EnderecoDaRequisicao>>();
const rifasPorSlug = new Map<string, Entrada<string | null>>();
const rifasPorId = new Map<string, Entrada<string | null>>();

/**
 * Esquece o que o guarda sabe (arquivar, banir, ligar ou desligar o endereço).
 * **É local ao processo**: com várias réplicas, as outras só soltam o rótulo
 * quando a validade de 15 s vence — esse é o teto do interruptor de emergência.
 */
export function invalidarEndereco() {
  geracao++; // a leitura que começou antes não volta ao cache depois do commit
  rotulos.clear();
  rifasPorSlug.clear();
  rifasPorId.clear();
}

/** A organização do rótulo, só se ela pode ter endereço agora; senão, `inexistente`. */
export async function enderecoDoRotulo(slug: string, agora = Date.now()): Promise<EnderecoDaRequisicao> {
  const guardado = rotulos.get(slug);
  if (guardado && guardado.ate > agora) return guardado.v;
  const lidaNaGeracao = geracao;
  const [o] = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.slug, slug),
        eq(organizations.enderecoAtivo, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    )
    .limit(1);
  const v: EnderecoDaRequisicao = o ? { tipo: "organizacao", id: o.id, slug: o.slug, nome: o.nome } : { tipo: "inexistente" };
  if (lidaNaGeracao === geracao) guardar(rotulos, slug, v, agora);
  return v;
}

/** A organização dona da rifa pelo `slug`, ou `null` se a rifa não existe. */
export async function donoDaRifaPorSlug(slug: string, agora = Date.now()): Promise<string | null> {
  const g = rifasPorSlug.get(slug);
  if (g && g.ate > agora) return g.v;
  const [r] = await db.select({ org: campaigns.organizationId }).from(campaigns).where(eq(campaigns.slug, slug)).limit(1);
  const v = r?.org ?? null;
  guardar(rifasPorSlug, slug, v, agora);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function donoDaRifaPorId(id: string, agora = Date.now()): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const g = rifasPorId.get(id);
  if (g && g.ate > agora) return g.v;
  const [r] = await db.select({ org: campaigns.organizationId }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
  const v = r?.org ?? null;
  guardar(rifasPorId, id, v, agora);
  return v;
}

/** A casa principal (`PUBLIC_BASE_URL`), sem barra no fim. */
export function casaPrincipal(base: string): string {
  const publica = process.env.PUBLIC_BASE_URL?.trim();
  if (publica) return publica.replace(/\/+$/, "");
  return `${ehProducao() ? "https" : "http"}://${base}`;
}

function caminhoPuro(req: Request): string {
  return req.originalUrl.split("?")[0] ?? "/";
}

function consulta(req: Request): string {
  const i = req.originalUrl.indexOf("?");
  return i === -1 ? "" : req.originalUrl.slice(i);
}

/**
 * Responde 404 mantendo o `index.html` nas páginas (a SPA desenha a tela de
 * "não encontrado" pelo `GET /api/public/endereco`): status de verdade, não 200
 * com tela de erro — o buscador e o Meta leriam um "soft 404" como página boa.
 */
function negar(req: Request, res: Response, next: NextFunction) {
  // Qualquer caixa: `/API/…` chega ao mesmo handler no Express, e seguir daqui executaria a rota.
  if (ehCaminhoDeApi(req.originalUrl)) {
    return res.status(404).json({ message: "Rota não encontrada." });
  }
  const escrever = res.writeHead.bind(res) as (...a: unknown[]) => Response;
  (res as unknown as { writeHead: (...a: unknown[]) => Response }).writeHead = (codigo: unknown, ...resto: unknown[]) =>
    escrever(codigo === 200 ? 404 : codigo, ...resto);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

/** Resolve a decisão que precisa do banco (dono da rifa, da organização). */
async function conferir(d: Decisao, req: Request, dono: string): Promise<boolean> {
  if (d.acao === "conferir-organizacao") return true; // o slug é conferido por quem o chama, abaixo
  if (d.acao === "conferir-rifa") return (await donoDaRifaPorSlug(d.slug)) === dono;
  if (d.acao === "conferir-corpo") {
    const corpo = (req.body ?? {}) as { campaignId?: unknown; itens?: unknown };
    // Só o campo que a rota usa: o corpo pode trazer o outro de enfeite (e a rifa do vizinho no que vale).
    if (d.campo === "campaignId") {
      return typeof corpo.campaignId === "string" && (await donoDaRifaPorId(corpo.campaignId)) === dono;
    }
    if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) return false;
    for (const i of corpo.itens as { slug?: unknown }[]) {
      if (typeof i?.slug !== "string" || (await donoDaRifaPorSlug(i.slug)) !== dono) return false;
    }
    return true;
  }
  return true;
}

/**
 * O webhook do provedor só existe no domínio principal. Ele é montado antes do
 * corpo e do guarda (precisa do corpo cru), então a recusa fica aqui, à parte.
 */
export function webhookSoNoPrincipal(req: Request, res: Response, next: NextFunction) {
  const base = subdominioBaseDoAmbiente();
  if (!base) return next();
  const limpo = hostNormalizado(req.headers.host, ehProducao());
  // Host torto (porta estranha em produção) também não é o principal.
  if (!limpo || (limpo !== base && limpo.endsWith(`.${base}`))) {
    return res.status(404).json({ message: "Rota não encontrada." });
  }
  next();
}

export async function guardaDoEndereco(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.subdominio = null;
    res.locals.endereco = { tipo: "principal" } satisfies EnderecoDaRequisicao;
    const base = subdominioBaseDoAmbiente();
    const host = req.headers.host;
    if (!base || !host) return next();
    const producao = ehProducao();
    const limpo = hostNormalizado(host, producao);
    // Host torto (usuário, barra, porta estranha em produção): 400, nunca "segue como principal".
    if (!limpo) return res.status(400).json({ message: "Endereço inválido." });
    if (limpo === base || !limpo.endsWith(`.${base}`)) return next(); // principal, Railway, IP: como hoje

    // Forma absoluta (`GET http://x/api/…`): o Express a roteia pelo caminho, mas aqui ele não seria lido.
    if (!req.originalUrl.startsWith("/")) return res.status(400).json({ message: "Pedido inválido." });

    const destino = identificarHost(limpo, base, producao);
    res.locals.subdominio = destino;
    const caminho = caminhoPuro(req);
    const ehEndereco = caminho === "/api/public/endereco";
    const endereco: EnderecoDaRequisicao = destino?.tipo === "organizacao" ? await enderecoDoRotulo(destino.slug) : { tipo: "inexistente" };
    res.locals.endereco = endereco;
    if (endereco.tipo !== "organizacao") {
      // Varrer rótulos é descobrir quais organizações existem: o miss conta no limite por IP.
      // Só a navegação e a API contam: o carregamento da casca (script, imagem) de um visitante legítimo não.
      const lim = ehArquivoEstatico(caminho)
        ? { excedeu: false }
        : await hit(`endereco-rotulo:${identify(req).ipHash ?? "?"}`, 10, 120);
      if (lim.excedeu) return res.status(429).json({ message: "Muitas tentativas. Tente de novo em instantes." });
      if (ehEndereco) return next();
      return negar(req, res, next);
    }

    const d = decidirNoEndereco(req.method, caminho, endereco.slug);
    switch (d.acao) {
      case "seguir":
        return next();
      case "404":
        return negar(req, res, next);
      case "principal":
        if (ehCaminhoDeApi(caminho)) return negar(req, res, next);
        return res.redirect(302, `${casaPrincipal(base)}${req.originalUrl}`);
      case "canonico":
        return res.redirect(301, `${d.para}${consulta(req)}`);
      case "conferir-organizacao": {
        const slug = caminho.split("/")[4]; // /api/public/o/<slug>
        if (slug !== endereco.slug) return negar(req, res, next);
        return next();
      }
      default:
        return (await conferir(d, req, endereco.id)) ? next() : negar(req, res, next);
    }
  } catch (err) {
    next(err);
  }
}

export class EnderecoError extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/**
 * Liga ou desliga o endereço de uma organização (só a plataforma; a rota
 * confere). `UPDATE` na linha travada e a auditoria na mesma transação.
 * Desligar vale para qualquer situação e não pede nada além do motivo;
 * ligar passa por `problemaParaLigarEndereco`.
 */
export async function mudarEndereco(
  req: Request,
  id: string,
  corpo: { ativo?: unknown; motivo?: unknown; confirmarMarca?: unknown },
) {
  if (typeof corpo.ativo !== "boolean") throw new EnderecoError(400, "Diga se o endereço fica ligado ou desligado.");
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim().slice(0, 300) : "";
  if (!corpo.ativo && motivo.length < 3) throw new EnderecoError(400, "Para desligar, escreva o motivo.");
  if (!UUID.test(id)) throw new EnderecoError(404, "Organização não encontrada.");
  const resultado = await db.transaction(async (tx) => {
    const [o] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .for("update");
    if (!o) throw new EnderecoError(404, "Organização não encontrada.");
    if (corpo.ativo) {
      const problema = problemaParaLigarEndereco(
        o.slug,
        { arquivada: o.archivedAt !== null, banida: o.banidaEm !== null },
        corpo.confirmarMarca === true,
      );
      if (problema) throw new EnderecoError(problema.status, problema.mensagem);
    }
    const [novo] = await tx
      .update(organizations)
      .set({ enderecoAtivo: corpo.ativo as boolean, enderecoMotivo: motivo || null })
      .where(eq(organizations.id, id))
      .returning({ ativo: organizations.enderecoAtivo, slug: organizations.slug });
    await tx.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action: "organizacao.endereco",
      entity: "organization",
      entityId: id,
      diff: { ativo: corpo.ativo, antes: o.enderecoAtivo, rotulo: o.slug, motivo: motivo || null, confirmouMarca: corpo.confirmarMarca === true },
      ip: req.ip,
    });
    return novo!;
  });
  invalidarEndereco();
  return { enderecoAtivo: resultado.ativo, endereco: hostDoRotulo(resultado.slug, subdominioBaseDoAmbiente()) };
}
