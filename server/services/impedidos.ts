/**
 * 9.4 do advogado: na rifa autorizada não concorrem a promotora, seus sócios
 * e diretores, nem a plataforma e seus administradores. A prova que o sistema
 * tem é o telefone — a mesma régua da autoindicação: o telefone aprovado da
 * organização, o do aviso de chamado, o dos organizadores dela e o dos
 * administradores da plataforma. Conferido em `prepararPedido`, antes de
 * qualquer gravação (invariante 10).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { telefoneComparavel } from "@shared/format";


const NORMA = (coluna: ReturnType<typeof sql.raw>) =>
  sql`regexp_replace(regexp_replace(coalesce(${coluna}, ''), '\\D', '', 'g'), '^55(\\d{10,11})$', '\\1')`;

/** O telefone é de quem não pode concorrer nas rifas desta organização? */
export async function telefoneImpedido(organizationId: string, telefone: string): Promise<boolean> {
  const t = telefoneComparavel(telefone);
  if (t.length < 10) return false;
  const r = await db.execute(sql`
    SELECT 1 FROM users u
     WHERE ((u.organization_id = ${organizationId}::uuid AND u.role = 'organizer') OR (u.organization_id IS NULL AND u.role = 'admin'))
       AND ${NORMA(sql.raw("u.phone"))} = ${t}
    UNION ALL
    SELECT 1 FROM organizations o
     WHERE o.id = ${organizationId}::uuid
       AND (${NORMA(sql.raw("o.telefone_organizador"))} = ${t} OR ${NORMA(sql.raw("o.aviso_telefone"))} = ${t})
     LIMIT 1
  `);
  return r.rows.length > 0;
}

export const MSG_IMPEDIDO =
  "Este telefone é da promotora ou da plataforma: pelo regulamento, a promotora, seus sócios e diretores e a plataforma não podem participar desta rifa.";
