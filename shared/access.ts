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

export type Role =
  | "guest"
  | "buyer"
  | "affiliate"
  | "cambista"
  | "organizer"
  | "admin";

/**
 * Cada papel alcança a própria área e o que é público. O administrador NÃO
 * herda a área do afiliado: aquele painel mostra o saldo de um afiliado
 * específico, e administrador não tem saldo. O que o admin precisa saber
 * sobre afiliados ele vê em /admin/afiliados.
 *
 * O administrador geral **herda** o organizador, e aqui o motivo é outro: as
 * telas são as mesmas: campanha, pedido, financeiro, sorteio. O que muda não
 * é a tela, é o recorte — o organizador vê a organização dele, o
 * administrador geral vê todas, porque a organização dele é nula. Papel diz
 * qual porta abre; organização diz o que tem atrás.
 */
const INHERITS: Record<Role, Role[]> = {
  guest: ["guest"],
  buyer: ["guest", "buyer"],
  affiliate: ["guest", "affiliate"],
  cambista: ["guest", "cambista"],
  organizer: ["guest", "organizer"],
  admin: ["guest", "organizer", "admin"],
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
  | "adminUsuarios"
  | "adminAtendimento"
  | "adminFinanceiro"
  | "adminSorteios"
  | "adminCobranca"
  | "adminOrganizacoes"
  | "adminAntifraude"
  | "adminExportacoes"
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

  // Organizador — as telas da própria rifa. O administrador geral usa estas
  // mesmas telas, só que sem recorte de organização.
  { key: "adminPainel", path: "/admin", label: "Painel", requires: "organizer", nav: true },
  { key: "adminCampanhas", path: "/admin/campanhas", label: "Campanhas", requires: "organizer", nav: true },
  { key: "adminPedidos", path: "/admin/pedidos", label: "Pedidos", requires: "organizer", nav: true },
  // Chamados de reembolso, com conversa: cada organização atende os dela.
  { key: "adminAtendimento", path: "/admin/atendimento", label: "Atendimento", requires: "organizer", nav: true },
  { key: "adminAfiliados", path: "/admin/afiliados", label: "Afiliados", requires: "organizer", nav: true },
  { key: "adminCambistas", path: "/admin/cambistas", label: "Cambistas", requires: "organizer", nav: true },
  // Todo mundo que entra no painel, com os dados de cada um. O organizador vê
  // as pessoas da organização dele; a plataforma vê todas.
  { key: "adminUsuarios", path: "/admin/usuarios", label: "Usuários", requires: "organizer", nav: true },
  { key: "adminFinanceiro", path: "/admin/financeiro", label: "Financeiro", requires: "organizer", nav: true },
  { key: "adminSorteios", path: "/admin/sorteios", label: "Sorteios", requires: "organizer", nav: true },
  { key: "adminExportacoes", path: "/admin/exportacoes", label: "Exportações", requires: "organizer", nav: true },
  // Mesma tela, dois lados: a plataforma vê a carteira de clientes; o
  // organizador vê a conta dele. Cobrar sem mostrar a conta seria indefensável.
  { key: "adminCobranca", path: "/admin/cobranca", label: "Cobrança", requires: "organizer", nav: true },
  { key: "adminConfiguracoes", path: "/admin/configuracoes", label: "Configurações", requires: "organizer", nav: true },

  // Só da plataforma. Antifraude e meio de pagamento valem para todo mundo
  // que vende aqui; a lista de organizações é a própria carteira de clientes.
  { key: "adminOrganizacoes", path: "/admin/organizacoes", label: "Organizações", requires: "admin", nav: true },
  { key: "adminAntifraude", path: "/admin/antifraude", label: "Antifraude", requires: "admin", nav: true },
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
  if (role === "admin" || role === "organizer") return "/admin";
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
  // O router inteiro abre para organizador; dentro dele, as rotas que são da
  // plataforma passam por requirePlatformAdmin(). A matriz diz quem entra no
  // prédio; o escopo da organização diz em que sala.
  { prefix: "/api/admin", requires: "organizer" },
];
