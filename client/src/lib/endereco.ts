import { useBrowserLocation } from "wouter/use-browser-location";
import { caminhoLogico, destinoNoEndereco } from "@shared/enderecoRotas";

/**
 * De quem é o endereço que o navegador abriu (`GET /api/public/endereco`).
 * Quem decide é o servidor, só pelo `Host`; o cliente só lê. Vale por toda a
 * vida da aba — o host não muda sem recarregar —, então é um valor de módulo,
 * lido **antes** do primeiro desenho (`carregarEndereco()` em `main.tsx`): sem
 * isso o endereço da organização piscaria a vitrine da plataforma.
 */
export type EnderecoDoApp =
  | { tipo: "principal" }
  | { tipo: "organizacao"; slug: string; nome: string; principal: string }
  | { tipo: "inexistente" };

// Mora no `globalThis`, não numa variável do módulo: o mesmo arquivo importado
// por `./lib/endereco` e por `@/lib/endereco` vira dois módulos no Vite, e o
// valor lido não seria o gravado (foi o que a prova no navegador mostrou).
const CHAVE_DO_ESTADO = Symbol.for("endereco-do-app");
type Guarda = { [CHAVE_DO_ESTADO]?: EnderecoDoApp };
const guarda = globalThis as unknown as Guarda;

function lerAtual(): EnderecoDoApp {
  return guarda[CHAVE_DO_ESTADO] ?? { tipo: "principal" };
}
function gravarAtual(e: EnderecoDoApp): EnderecoDoApp {
  guarda[CHAVE_DO_ESTADO] = e;
  return e;
}

export function enderecoDoApp(): EnderecoDoApp {
  return lerAtual();
}

/** Estamos no endereço de uma organização? (`slug` é o dela.) */
export function slugDoEndereco(): string | null {
  const e = lerAtual();
  return e.tipo === "organizacao" ? e.slug : null;
}

export function noEnderecoDaOrganizacao(): boolean {
  return lerAtual().tipo === "organizacao";
}

/** Só aceita o formato que o servidor manda; qualquer outra coisa é o domínio principal. */
export function lerEndereco(corpo: unknown): EnderecoDoApp {
  if (!corpo || typeof corpo !== "object") return { tipo: "principal" };
  const c = corpo as Record<string, unknown>;
  if (c.tipo === "inexistente") return { tipo: "inexistente" };
  if (c.tipo === "organizacao" && typeof c.slug === "string" && /^[a-z0-9-]{3,80}$/.test(c.slug)) {
    const principal = typeof c.principal === "string" ? principalSeguro(c.principal) : null;
    if (!principal) return { tipo: "principal" };
    return { tipo: "organizacao", slug: c.slug, nome: typeof c.nome === "string" ? c.nome : c.slug, principal };
  }
  return { tipo: "principal" };
}

/** O domínio principal só vale como origem `http(s)` sem caminho, usuário ou consulta. */
function principalSeguro(valor: string): string | null {
  try {
    const u = new URL(valor);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return null;
    if (u.pathname !== "/" || u.search || u.hash) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Pergunta ao servidor de quem é este endereço. Uma segunda tentativa se a
 * primeira cair; sem resposta, segue como o domínio principal (a casca de
 * sempre) — o servidor continua barrando o que não é do endereço.
 */
export async function carregarEndereco(buscar: typeof fetch = fetch): Promise<EnderecoDoApp> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await buscar("/api/public/endereco", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
      if (r.ok) return gravarAtual(lerEndereco(await r.json()));
    } catch {
      /* tenta de novo */
    }
  }
  return gravarAtual({ tipo: "principal" });
}

/** Só para a prova. */
export function definirEnderecoParaTeste(e: EnderecoDoApp) {
  gravarAtual(e);
}

type Navegar = (para: string, opcoes?: { replace?: boolean; state?: unknown }) => void;
export type HookDoEndereco = ((opcoes?: unknown) => [string, Navegar]) & { hrefs: (href: string) => string };
type HookBase = (opcoes?: unknown) => [string, Navegar];

/**
 * O `hook` do `Router` do wouter para o endereço da organização. As rotas e as
 * telas seguem falando o caminho do domínio principal (`/o/<org>/r/<rifa>`);
 * o navegador mostra o curto (`/r/<rifa>`). O que é da plataforma sai da aba
 * para o domínio principal (`hrefs` já devolve o endereço inteiro, para o
 * link abrir no clique do meio e o clique normal chama o `navegar`).
 */
export function criarHookDoEndereco(slug: string, principal: string, hookBase: HookBase = useBrowserLocation as HookBase): HookDoEndereco {
  // O `Router` troca de roteador quando o `hook` muda de referência: um por endereço, não um por desenho.
  const guardado = hookBase === (useBrowserLocation as HookBase) ? HOOKS.get(`${slug}|${principal}`) : undefined;
  if (guardado) return guardado;
  const hook: HookDoEndereco = Object.assign((opcoes?: unknown) => {
    const [real, navegarReal] = hookBase(opcoes);
    const navegar: Navegar = (para, o) => {
      const d = destinoNoEndereco(para, slug);
      if (d.onde === "principal") {
        window.location.assign(`${principal}${d.caminho}`);
        return;
      }
      navegarReal(d.real, o);
    };
    return [caminhoLogico(real, slug), navegar] as [string, Navegar];
  }, {
    hrefs: (href: string) => {
      const d = destinoNoEndereco(href, slug);
      return d.onde === "principal" ? `${principal}${d.caminho}` : d.real;
    },
  });
  if (hookBase === (useBrowserLocation as HookBase)) HOOKS.set(`${slug}|${principal}`, hook);
  return hook;
}

const HOOKS = new Map<string, HookDoEndereco>();
