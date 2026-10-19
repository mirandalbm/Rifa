/**
 * Auditoria dos slugs antes de ligar o endereço da organização (PR 7 do
 * `docs/PLANO-SUBDOMINIO.md`). Só lê: diz, para cada organização, se o slug
 * vira endereço (`pronto`), pede confirmação de marca, não pode (reservado,
 * curto, `af-`…) ou não tem endereço (arquivada/banida). Não liga nada.
 *
 *   npm run subdominio-auditoria            # relatório
 *   npm run subdominio-auditoria -- --estrito   # sai 1 se alguma ativa for impossível
 */
import "dotenv/config";
import { db } from "../server/db";
import { organizations } from "../shared/schema";
import { problemaNaBase, situacaoDoRotulo } from "../shared/subdominio";
import { subdominioBaseDoAmbiente } from "../server/services/subdominio";

async function main() {
  const estrito = process.argv.includes("--estrito");
  const bruta = process.env.SUBDOMINIO_BASE?.trim().toLowerCase();
  const base = subdominioBaseDoAmbiente();
  if (!bruta) console.log("SUBDOMINIO_BASE: ausente (o endereço está desligado).");
  else if (!base) console.log(`SUBDOMINIO_BASE: INVÁLIDA — ${problemaNaBase(bruta)}`);
  else console.log(`SUBDOMINIO_BASE: ${base}`);

  const orgs = await db
    .select({
      slug: organizations.slug,
      ativa: organizations.active,
      arquivada: organizations.archivedAt,
      banida: organizations.banidaEm,
      ligado: organizations.enderecoAtivo,
    })
    .from(organizations);

  const contagem: Record<string, number> = { pronto: 0, confirmar_marca: 0, impossivel: 0, sem_endereco: 0 };
  let impossiveisAtivas = 0;
  for (const o of orgs.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const r = situacaoDoRotulo(o.slug, { arquivada: !!o.arquivada, banida: !!o.banida });
    contagem[r.situacao]++;
    if (r.situacao === "impossivel" && o.ativa) impossiveisAtivas++;
    if (r.situacao !== "pronto" || o.ligado) {
      const host = base ? `${o.slug}.${base}` : o.slug;
      console.log(`${r.situacao.padEnd(15)} ${host}${o.ligado ? "  [ligado]" : ""}${r.motivo ? `  — ${r.motivo}` : ""}`);
    }
  }
  console.log(`\n${orgs.length} organização(ões): ${contagem.pronto} pronta(s), ${contagem.confirmar_marca} a confirmar, ${contagem.impossivel} impossível(is), ${contagem.sem_endereco} sem endereço.`);
  if (estrito && impossiveisAtivas > 0) {
    console.error(`${impossiveisAtivas} organização(ões) ativa(s) com slug que não vira endereço.`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
