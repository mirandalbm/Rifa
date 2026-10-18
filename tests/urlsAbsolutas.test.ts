/**
 * Rastreabilidade das URLs absolutas (docs/PLANO-SUBDOMINIO.md, cap. 5): cada
 * lugar que monta endereço com `publicUrl(`, `baseDoSite(`, `baseDoAnuncio(`,
 * `window.location.origin` ou `PUBLIC_BASE_URL` está nesta lista, com a decisão
 * dele — endereço da organização (a rifa) ou domínio principal (a conta, o
 * pedido, o documento). Chamada nova reprova até ser decidida e entrar aqui.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PADRAO = /publicUrl\(|baseDoSite\(|baseDoAnuncio\(|window\.location\.origin|PUBLIC_BASE_URL/g;

/** arquivo → quantas ocorrências, e por quê. `rifa` = já passa pelo endereço da organização (ou tem o caso `null` = hoje). */
const APROVADAS: Record<string, [number, string]> = {
  "server/services/urls.ts": [13, "os auxiliares; baseDoSite é o caminho de hoje, enderecoDaOrganizacao() o da rifa"],
  "server/routes/admin.ts": [7, "artes e editor da rifa (endereço da organização); demonstração no principal; publicUrl do painel"],
  "server/routes/affiliate.ts": [1, "kit do afiliado: endereço da organização da rifa, senão baseDoSite"],
  "server/routes/public.ts": [1, "QR do perfil: endereço da organização, senão o principal"],
  "server/services/trafego.ts": [1, "links do anúncio para a plataforma (endereço da organização da campanha)"],
  "server/services/trafegoCriacao.ts": [3, "link do anúncio no Meta (endereço da organização); a base do anúncio é a de hoje"],
  "server/services/marketing.ts": [1, "event_source_url da compra (endereço da organização, senão a base de hoje)"],
  "server/services/sortear.ts": [1, "aviso do ganhador: endereço da organização, senão o principal"],
  "server/services/orders.ts": [1, "pedido (conta/pedido ficam no principal)"],
  "server/jobs/index.ts": [1, "lembrete de reserva (pedido/carrinho ficam no principal)"],
  "server/services/bonus.ts": [1, "bônus de indicação: principal"],
  "server/services/chamados.ts": [1, "chamado: principal"],
  "server/services/google.ts": [1, "retorno do Google: um só, no principal"],
  "server/services/push.ts": [1, "VAPID/assunto: principal"],
  "server/services/images.ts": [1, "srcSet de imagem pública: principal"],
  "server/services/media.ts": [2, "mídia pública (armazenamento)"],
  "server/services/editorImagem.ts": [1, "mídia pública (armazenamento)"],
  "server/services/storage.ts": [3, "armazenamento"],
  "server/services/enderecoDaOrganizacao.ts": [2, "a casa principal do guarda"],
  "server/services/enderecoDoHost.ts": [4, "Origin e Host conhecidos"],
  "shared/subdominio.ts": [4, "regras puras do host"],
  "shared/trafegoCriacao.ts": [4, "base pública do anúncio"],
  "client/src/components/Comentarios.tsx": [1, "presente: link do aparelho (no principal, o principal; no endereço, o dele)"],
  "client/src/components/LinksCurtos.tsx": [1, "curto: o servidor manda o endereço da organização (`endereco`); isto é o reserva"],
  "client/src/components/Publicacao.tsx": [1, "compartilhar: origem do aparelho (PR 4b: endereço da organização no principal)"],
  "client/src/pages/Perfil.tsx": [1, "compartilhar o perfil: origem do aparelho (PR 4b)"],
  "client/src/pages/PerfilDoUsuario.tsx": [1, "compartilhar o perfil do apostador: origem do aparelho"],
};

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(p);
  }
  return saida;
}

describe("URLs absolutas: cada uma foi decidida", () => {
  it("só os arquivos aprovados montam URL absoluta, e na quantidade aprovada", () => {
    const achados: Record<string, number> = {};
    for (const raiz of ["server", "client/src", "shared"]) {
      for (const f of arquivos(raiz)) {
        const n = (readFileSync(f, "utf8").match(PADRAO) ?? []).length;
        if (n) achados[f] = n;
      }
    }
    const lidos = Object.fromEntries(Object.entries(achados).sort());
    const esperados = Object.fromEntries(Object.entries(APROVADAS).map(([f, [n]]) => [f, n]).sort());
    expect(lidos).toEqual(esperados);
  });
});
