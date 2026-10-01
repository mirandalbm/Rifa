import { sql } from "drizzle-orm";
import { db } from "../db";
import { ordenarCaixa, type PendenciaDaCaixa } from "@shared/caixa";

/**
 * A caixa de entrada da plataforma: o que espera decisão, de todas as filas,
 * numa lista só. Só a plataforma chama (a rota barra o resto). Cada consulta
 * traz só o que está esperando e **nenhum dado pessoal**: organização,
 * afiliado ou apelido — nunca telefone, CPF ou nome de comprador.
 */
export async function caixaDeEntrada(): Promise<PendenciaDaCaixa[]> {
  const [chamados, solicitacoes, denuncias, verificacoes, fiscais, telefones, banners] = await Promise.all([
    db.execute(sql`
      SELECT ch.id, ch.disputa, ch.created_at AS desde, o.name AS org, ch.protocolo, ord.code AS pedido
        FROM chamados ch
        JOIN organizations o ON o.id = ch.organization_id
        JOIN orders ord ON ord.id = ch.order_id
       WHERE ch.disputa = 'aberta' OR ch.status = 'aberto'
       ORDER BY ch.created_at LIMIT 200`),
    db.execute(sql`
      SELECT s.id, s.tipo::text AS tipo, s.created_at AS desde, o.name AS org, c.title AS rifa, s.protocolo
        FROM campanha_solicitacoes s
        JOIN organizations o ON o.id = s.organization_id
        JOIN campaigns c ON c.id = s.campaign_id
       WHERE s.status = 'em_analise'
       ORDER BY s.created_at LIMIT 200`),
    db.execute(sql`
      SELECT d.id, d.created_at AS desde, o.name AS org, d.protocolo
        FROM denuncias d
        JOIN organizations o ON o.id = d.organization_id
       WHERE d.status = 'aberta'
       ORDER BY d.created_at LIMIT 200`),
    db.execute(sql`
      SELECT v.id, v.sujeito::text AS sujeito, coalesce(v.enviado_em, now()) AS desde,
             coalesce('@' || b.apelido, a.code, o.name) AS quem
        FROM verificacoes v
        LEFT JOIN buyers b ON v.sujeito = 'apostador' AND b.id = v.sujeito_id
        LEFT JOIN affiliates a ON v.sujeito = 'afiliado' AND a.id = v.sujeito_id
        LEFT JOIN organizations o ON v.sujeito = 'organizacao' AND o.id = v.sujeito_id
       WHERE v.status IN ('em_analise', 'foto_em_analise')
       ORDER BY v.enviado_em NULLS LAST LIMIT 200`),
    db.execute(sql`
      SELECT f.affiliate_id AS id, coalesce(f.enviado_em, f.updated_at) AS desde, a.code AS quem
        FROM afiliado_fiscal f
        JOIN affiliates a ON a.id = f.affiliate_id
       WHERE f.status = 'em_analise'
       ORDER BY 2 LIMIT 200`),
    db.execute(sql`
      SELECT o.id, o.name AS org, o.telefone_confirmado_em AS desde
        FROM organizations o
       WHERE o.telefone_aprovado_em IS NULL AND o.telefone_confirmado_em IS NOT NULL
         AND o.archived_at IS NULL AND o.banida_em IS NULL
       ORDER BY o.telefone_confirmado_em LIMIT 200`),
    db.execute(sql`
      SELECT b.id, b.created_at AS desde, o.name AS org, c.title AS rifa, b.dias
        FROM banner_pedidos b
        JOIN organizations o ON o.id = b.organization_id
        JOIN campaigns c ON c.id = b.campaign_id
       WHERE b.status = 'em_analise'
       ORDER BY b.created_at LIMIT 200`),
  ]);

  const iso = (d: unknown) => new Date(d as string | Date).toISOString();
  const linhas: PendenciaDaCaixa[] = [];

  for (const r of chamados.rows as any[]) {
    const disputa = r.disputa === "aberta";
    linhas.push({
      chave: `${disputa ? "disputa" : "reembolso"}:${r.id}`,
      tipo: disputa ? "disputa" : "reembolso",
      quem: r.org,
      oQue: disputa
        ? `Reembolso recusado em disputa — protocolo ${r.protocolo}, pedido ${r.pedido}`
        : `Pedido de reembolso esperando resposta — protocolo ${r.protocolo}, pedido ${r.pedido}`,
      desde: iso(r.desde),
    });
  }
  for (const r of solicitacoes.rows as any[]) {
    const adiamento = r.tipo === "adiamento";
    linhas.push({
      chave: `${adiamento ? "adiamento" : "edicao"}:${r.id}`,
      tipo: adiamento ? "adiamento" : "edicao",
      quem: r.org,
      oQue: `${adiamento ? "Pede adiar o sorteio" : "Pede editar"} da rifa ${r.rifa} — ${r.protocolo}`,
      desde: iso(r.desde),
    });
  }
  for (const r of denuncias.rows as any[]) {
    linhas.push({ chave: `denuncia:${r.id}`, tipo: "denuncia", quem: r.org, oQue: `Denúncia aberta contra a organização — ${r.protocolo}`, desde: iso(r.desde) });
  }
  const SUJEITO: Record<string, string> = { apostador: "do apostador", afiliado: "do afiliado", organizacao: "da organização" };
  for (const r of verificacoes.rows as any[]) {
    linhas.push({ chave: `verificacao:${r.id}`, tipo: "verificacao", quem: r.quem ?? "—", oQue: `Pedido de selo ${SUJEITO[r.sujeito] ?? ""} esperando conferência`.replace(/ +/g, " "), desde: iso(r.desde) });
  }
  for (const r of fiscais.rows as any[]) {
    linhas.push({ chave: `fiscal:${r.id}`, tipo: "fiscal", quem: r.quem, oQue: "Cadastro fiscal enviado — dados e documentos no cofre", desde: iso(r.desde) });
  }
  for (const r of telefones.rows as any[]) {
    linhas.push({ chave: `telefone:${r.id}`, tipo: "telefone", quem: r.org, oQue: "Telefone provado pelo WhatsApp — espera aprovação para publicar", desde: iso(r.desde) });
  }
  for (const r of banners.rows as any[]) {
    linhas.push({ chave: `banner:${r.id}`, tipo: "banner", quem: r.org, oQue: `Arte de banner pago esperando aprovação — rifa ${r.rifa}, ${r.dias} dia(s)`, desde: iso(r.desde) });
  }
  return ordenarCaixa(linhas);
}
