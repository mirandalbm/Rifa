/**
 * Controle de acesso — a fonte única de verdade.
 *
 * Um app só atende as três superfícies (comprador, afiliado, administrador).
 * O que separa uma da outra é o papel na sessão, e é ESTE arquivo que define
 * o que cada papel alcança. O servidor usa a matriz para barrar a rota; o
 * cliente usa a mesma matriz para montar o menu e esconder a tela.
 *
 * Esconder no cliente é cortesia. Barrar no servidor é a segurança —
 * toda rota protegida passa por requireRole() em server/auth.ts.
 */

export type Role = "guest" | "buyer" | "affiliate" | "cambista" | "admin";

/**
 * Cada papel alcança a própria área e o que é público. O administrador NÃO
 * herda a área do afiliado: aquele painel mostra o saldo de um afiliado
 * específico, e administrador não tem saldo. O que o admin precisa saber
 * sobre afiliados ele vê em /admin/afiliados.
 */
const INHERITS: Record<Role, Role[]> = {
  guest: ["guest"],
  buyer: ["guest", "buyer"],
  affiliate: ["guest", "affiliate"],
  cambista: ["guest", "cambista"],
  admin: ["guest", "admin"],
};

export function roleSatisfies(actual: Role, required: Role): boolean {
  return INHERITS[actual].includes(required);
}

export type SectionKey =
  | "vitrine"
  | "campanha"
  | "checkout"
  | "minhasCotas"
  | "afiliadoPainel"
  | "afiliadoLinks"
  | "afiliadoComissoes"
  | "afiliadoSaques"
  | "cambistaVenda"
  | "cambistaVendas"
  | "cambistaAcerto"
  | "adminPainel"
  | "adminCampanhas"
  | "adminPedidos"
  | "adminAfiliados"
  | "adminCambistas"
  | "adminFinanceiro"
  | "adminSorteios"
  | "adminConfiguracoes";

export interface Section {
  key: SectionKey;
  path: string;
  label: string;
  /** Papel mínimo para entrar. */
  requires: Role;
  /** Aparece no menu lateral daquele papel. */
  nav: boolean;
}

export const SECTIONS: Section[] = [
  // Público — qualquer pessoa, sem login.
  { key: "vitrine", path: "/", label: "Rifas", requires: "guest", nav: false },
  { key: "campanha", path: "/r/:slug", label: "Rifa", requires: "guest", nav: false },
  { key: "checkout", path: "/pedido/:code", label: "Pedido", requires: "guest", nav: false },
  { key: "minhasCotas", path: "/minhas-cotas", label: "Minhas cotas", requires: "guest", nav: false },

  // Afiliado — login próprio, aprovado pelo administrador.
  { key: "afiliadoPainel", path: "/afiliado", label: "Visão geral", requires: "affiliate", nav: true },
  { key: "afiliadoLinks", path: "/afiliado/links", label: "Meus links", requires: "affiliate", nav: true },
  { key: "afiliadoComissoes", path: "/afiliado/comissoes", label: "Comissões", requires: "affiliate", nav: true },
  { key: "afiliadoSaques", path: "/afiliado/saques", label: "Saques", requires: "affiliate", nav: true },

  // Cambista — vende na mão, imprime o bilhete e acerta com a casa.
  { key: "cambistaVenda", path: "/cambista", label: "Nova venda", requires: "cambista", nav: true },
  { key: "cambistaVendas", path: "/cambista/vendas", label: "Minhas vendas", requires: "cambista", nav: true },
  { key: "cambistaAcerto", path: "/cambista/acerto", label: "Meu acerto", requires: "cambista", nav: true },

  // Administrador geral — login + 2FA, tudo auditado.
  { key: "adminPainel", path: "/admin", label: "Painel", requires: "admin", nav: true },
  { key: "adminCampanhas", path: "/admin/campanhas", label: "Campanhas", requires: "admin", nav: true },
  { key: "adminPedidos", path: "/admin/pedidos", label: "Pedidos", requires: "admin", nav: true },
  { key: "adminAfiliados", path: "/admin/afiliados", label: "Afiliados", requires: "admin", nav: true },
  { key: "adminCambistas", path: "/admin/cambistas", label: "Cambistas", requires: "admin", nav: true },
  { key: "adminFinanceiro", path: "/admin/financeiro", label: "Financeiro", requires: "admin", nav: true },
  { key: "adminSorteios", path: "/admin/sorteios", label: "Sorteios", requires: "admin", nav: true },
  { key: "adminConfiguracoes", path: "/admin/configuracoes", label: "Configurações", requires: "admin", nav: true },
];

export function sectionsFor(role: Role): Section[] {
  return SECTIONS.filter((s) => s.nav && roleSatisfies(role, s.requires));
}

export function canAccess(role: Role, key: SectionKey): boolean {
  const section = SECTIONS.find((s) => s.key === key);
  return section ? roleSatisfies(role, section.requires) : false;
}

/** Para onde cada papel vai depois de entrar. */
export function homeFor(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "affiliate") return "/afiliado";
  if (role === "cambista") return "/cambista";
  return "/";
}

/**
 * Prefixo de API por papel. O servidor monta os routers nestes caminhos e o
 * guard combina com o prefixo, então rota nova nasce protegida por padrão.
 */
export const API_SCOPES: { prefix: string; requires: Role }[] = [
  { prefix: "/api/public", requires: "guest" },
  { prefix: "/api/affiliate", requires: "affiliate" },
  { prefix: "/api/seller", requires: "cambista" },
  { prefix: "/api/admin", requires: "admin" },
];
