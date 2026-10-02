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
  | "adminStories"
  | "afiliadoOrganizacoes"
  | "adminResultados"
  | "afiliadoDados"
  | "afiliadoDivulgar"
  | "adminFiscal"
  | "adminCaixa"
  | "adminBonus"
  | "adminPatrocinio"
  | "adminBannerPago"
  | "adminMarketing"
  | "adminFinanceiro"
  | "adminSorteios"
  | "adminSorteiosOficiais"
  | "adminCobranca"
  | "adminOrganizacoes"
  | "adminAntifraude"
  | "adminAparencia"
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
  // O afiliado é avulso: adere às organizações que quiser, com o termo de cada uma.
  { key: "afiliadoOrganizacoes", path: "/afiliado/organizacoes", label: "Organizações", requires: "affiliate", nav: true },
  // Publicar com o material da organização (influenciador): direto ou só depois da autorização dela.
  { key: "afiliadoDivulgar", path: "/afiliado/divulgar", label: "Divulgar", requires: "affiliate", nav: true },
  { key: "afiliadoComissoes", path: "/afiliado/comissoes", label: "Comissões", requires: "affiliate", nav: true },
  { key: "afiliadoSaques", path: "/afiliado/saques", label: "Saques", requires: "affiliate", nav: true },
  // Cadastro fiscal: quem recebe a comissão. Cifrado; o organizador nunca vê.
  { key: "afiliadoDados", path: "/afiliado/dados", label: "Meus dados", requires: "affiliate", nav: true },

  // Cambista — vende na mão, imprime o bilhete e acerta com a casa.
  { key: "cambistaVenda", path: "/cambista", label: "Nova venda", requires: "cambista", nav: true },
  { key: "cambistaVendas", path: "/cambista/vendas", label: "Minhas vendas", requires: "cambista", nav: true },
  { key: "cambistaAcerto", path: "/cambista/acerto", label: "Meu acerto", requires: "cambista", nav: true },

  // Organizador — as telas da própria rifa. O administrador geral usa estas
  // mesmas telas, só que sem recorte de organização.
  { key: "adminPainel", path: "/admin", label: "Painel", requires: "organizer", nav: true },
  { key: "adminCampanhas", path: "/admin/campanhas", label: "Campanhas", requires: "organizer", nav: true },
  { key: "adminPedidos", path: "/admin/pedidos", label: "Pedidos", requires: "organizer", nav: true },
  // Vendas por dia e por canal, ticket médio, rifas que mais vendem.
  { key: "adminResultados", path: "/admin/resultados", label: "Resultados", requires: "organizer", nav: true },
  // Chamados de reembolso, com conversa: cada organização atende os dela.
  { key: "adminAtendimento", path: "/admin/atendimento", label: "Atendimento", requires: "organizer", nav: true },
  // Stories de 24 h, para quem segue. Cada organização posta os dela.
  { key: "adminStories", path: "/admin/stories", label: "Stories", requires: "organizer", nav: true },
  // Rifas patrocinadas por clique (etapa 15): saldo e rifas da organização; a plataforma configura.
  { key: "adminPatrocinio", path: "/admin/patrocinio", label: "Patrocínio", requires: "organizer", nav: true },
  { key: "adminBannerPago", path: "/admin/banner-pago", label: "Banner na vitrine", requires: "organizer", nav: true },
  // Pixels, chaves e vendas por campanha (etapa 16).
  { key: "adminMarketing", path: "/admin/marketing", label: "Marketing", requires: "organizer", nav: true },
  { key: "adminAfiliados", path: "/admin/afiliados", label: "Afiliados", requires: "organizer", nav: true },
  { key: "adminCambistas", path: "/admin/cambistas", label: "Cambistas", requires: "organizer", nav: true },
  // Todo mundo que entra no painel, com os dados de cada um. O organizador vê
  // as pessoas da organização dele; a plataforma vê todas.
  { key: "adminUsuarios", path: "/admin/usuarios", label: "Usuários", requires: "organizer", nav: true },
  { key: "adminFinanceiro", path: "/admin/financeiro", label: "Financeiro", requires: "organizer", nav: true },
  { key: "adminSorteios", path: "/admin/sorteios", label: "Sorteios", requires: "organizer", nav: true },
  // O calendário dos sorteios oficiais: a plataforma cadastra e lança o resultado;
  // a organização integra a rifa em rascunho num concurso.
  { key: "adminSorteiosOficiais", path: "/admin/sorteios-oficiais", label: "Sorteios oficiais", requires: "organizer", nav: true },
  { key: "adminExportacoes", path: "/admin/exportacoes", label: "Exportações", requires: "organizer", nav: true },
  // Mesma tela, dois lados: a plataforma vê a carteira de clientes; o
  // organizador vê a conta dele. Cobrar sem mostrar a conta seria indefensável.
  { key: "adminCobranca", path: "/admin/cobranca", label: "Cobrança", requires: "organizer", nav: true },
  { key: "adminConfiguracoes", path: "/admin/configuracoes", label: "Configurações", requires: "organizer", nav: true },

  // Só da plataforma. Antifraude e meio de pagamento valem para todo mundo
  // que vende aqui; a lista de organizações é a própria carteira de clientes.
  { key: "adminOrganizacoes", path: "/admin/organizacoes", label: "Organizações", requires: "admin", nav: true },
  { key: "adminAntifraude", path: "/admin/antifraude", label: "Antifraude", requires: "admin", nav: true },
  { key: "adminAparencia", path: "/admin/aparencia", label: "Aparência", requires: "admin", nav: true },
  // Cadastro fiscal dos afiliados: só a plataforma confere, e cada olhada é auditada.
  // Tudo que espera decisão, de todas as filas, numa lista só (só a plataforma).
  { key: "adminCaixa", path: "/admin/caixa", label: "Tudo", requires: "admin", nav: true },
  { key: "adminFiscal", path: "/admin/fiscal", label: "Cadastros fiscais", requires: "admin", nav: true },
  // Indicação, metas e cota grátis (etapa 13): o interruptor e as metas são da plataforma.
  { key: "adminBonus", path: "/admin/bonus", label: "Bônus", requires: "admin", nav: true },
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

/* ------------------------------ menu em grupos ------------------------------ */

/**
 * O menu lateral dos painéis, no padrão do kit (Materialize): seções com um
 * subtítulo em letras pequenas, itens soltos e itens "pai" que abrem os
 * filhos. A matriz acima continua sendo quem diz o que cada papel alcança —
 * aqui só se arruma a ordem e a hierarquia do que a sessão já liberou:
 * `menuDe()` monta o menu a partir das seções da sessão, e o que a sessão
 * não trouxe não aparece, esteja ou não listado aqui.
 *
 * O ícone de cada item pai é um nome fixo (desenhado em `AppShell.tsx`); o
 * dos itens soltos sai da seção.
 */
export type IconeDoGrupo =
  | "caixa"
  | "visaoGeral"
  | "rifas"
  | "dinheiro"
  | "pessoas"
  | "crescimento"
  | "plataforma"
  | "equipe";

export type ItemDoMenu =
  | { secao: SectionKey }
  | { rotulo: string; icone: IconeDoGrupo; filhos: SectionKey[] };

export interface GrupoDoMenu {
  /** O subtítulo da seção; sem ele, os itens vêm colados no topo (ou no grupo anterior). */
  titulo?: string;
  itens: ItemDoMenu[];
}

const MENU_DO_MASTER: GrupoDoMenu[] = [
  // A caixa de entrada vem primeiro: é onde a plataforma decide o que só ela
  // decide (disputas, edições de rifa, denúncias, verificações, cadastros).
  { itens: [{ rotulo: "Caixa de entrada", icone: "caixa", filhos: ["adminCaixa", "adminAtendimento", "adminAntifraude"] }] },
  {
    titulo: "Painel",
    itens: [
      { rotulo: "Visão geral", icone: "visaoGeral", filhos: ["adminPainel", "adminResultados"] },
      { rotulo: "Rifas", icone: "rifas", filhos: ["adminCampanhas", "adminSorteios", "adminSorteiosOficiais", "adminStories"] },
      { rotulo: "Vendas e dinheiro", icone: "dinheiro", filhos: ["adminPedidos", "adminFinanceiro", "adminCobranca", "adminExportacoes"] },
      { rotulo: "Pessoas", icone: "pessoas", filhos: ["adminOrganizacoes", "adminUsuarios", "adminAfiliados", "adminCambistas", "adminFiscal"] },
      { rotulo: "Crescimento", icone: "crescimento", filhos: ["adminMarketing", "adminPatrocinio", "adminBannerPago", "adminBonus"] },
      { rotulo: "Plataforma", icone: "plataforma", filhos: ["adminAparencia", "adminConfiguracoes"] },
    ],
  },
];

const MENU_DO_ORGANIZADOR: GrupoDoMenu[] = [
  { itens: [{ secao: "adminPainel" }, { secao: "adminAtendimento" }] },
  {
    titulo: "Rifas",
    itens: [{ rotulo: "Rifas", icone: "rifas", filhos: ["adminCampanhas", "adminSorteios", "adminSorteiosOficiais", "adminStories"] }, { secao: "adminResultados" }],
  },
  {
    titulo: "Vendas",
    itens: [{ secao: "adminPedidos" }, { secao: "adminFinanceiro" }, { secao: "adminCobranca" }, { secao: "adminExportacoes" }],
  },
  {
    titulo: "Equipe e crescimento",
    itens: [
      { rotulo: "Equipe", icone: "equipe", filhos: ["adminAfiliados", "adminCambistas", "adminUsuarios"] },
      { rotulo: "Crescimento", icone: "crescimento", filhos: ["adminMarketing", "adminPatrocinio", "adminBannerPago"] },
      { secao: "adminConfiguracoes" },
    ],
  },
];

const MENU_DO_AFILIADO: GrupoDoMenu[] = [
  { itens: [{ secao: "afiliadoPainel" }, { secao: "afiliadoLinks" }, { secao: "afiliadoDivulgar" }, { secao: "afiliadoOrganizacoes" }] },
  { titulo: "Dinheiro", itens: [{ secao: "afiliadoComissoes" }, { secao: "afiliadoSaques" }, { secao: "afiliadoDados" }] },
];

const MENU_DO_CAMBISTA: GrupoDoMenu[] = [
  { itens: [{ secao: "cambistaVenda" }, { secao: "cambistaVendas" }, { secao: "cambistaAcerto" }] },
];

export const MENUS: Partial<Record<Role, GrupoDoMenu[]>> = {
  admin: MENU_DO_MASTER,
  organizer: MENU_DO_ORGANIZADOR,
  affiliate: MENU_DO_AFILIADO,
  cambista: MENU_DO_CAMBISTA,
};

/** As chaves de seção que um menu cita, na ordem em que aparecem. */
export function secoesDoMenu(grupos: GrupoDoMenu[]): SectionKey[] {
  return grupos.flatMap((g) => g.itens.flatMap((i) => ("secao" in i ? [i.secao] : i.filhos)));
}

/**
 * O menu de um papel, só com o que a sessão liberou (`sections`). Item pai
 * sem filho liberado some; grupo sem item some. Seção liberada que nenhum
 * menu cita entra no fim, solta — melhor um item fora de lugar do que uma
 * tela que a sessão alcança e o menu esconde.
 */
export function menuDe(role: Role, sections: Pick<Section, "key">[]): GrupoDoMenu[] {
  const liberadas = new Set(sections.map((s) => s.key));
  const grupos = (MENUS[role] ?? [])
    .map((g) => ({
      ...g,
      itens: g.itens
        .map((i) => ("secao" in i ? i : { ...i, filhos: i.filhos.filter((f) => liberadas.has(f)) }))
        .filter((i) => ("secao" in i ? liberadas.has(i.secao) : i.filhos.length > 0)),
    }))
    .filter((g) => g.itens.length > 0);
  const citadas = new Set(secoesDoMenu(grupos));
  const soltas = sections.filter((s) => !citadas.has(s.key)).map((s) => ({ secao: s.key }));
  return soltas.length ? [...grupos, { itens: soltas }] : grupos;
}
