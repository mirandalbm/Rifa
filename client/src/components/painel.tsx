import { useEffect, useRef, useState, type Key, type ReactNode } from "react";
import { Link } from "wouter";
import { abaDoTeclado, abaInicial } from "@shared/abas";
import type { LucideIcon } from "lucide-react";

/**
 * As peças do painel no padrão do kit (Materialize), reusadas pelo
 * organizador, pela plataforma e pelo afiliado: o cartão de estatística
 * (ícone num quadrado colorido, o número e o rótulo), o cartão com título e
 * subtítulo, e a tabela com o cabeçalho cinza.
 *
 * As cores seguem o significado de sempre (verde = dinheiro que entrou,
 * amarelo = espera, vermelho = erro); o azul é o neutro de contagem.
 */

const TOM = {
  green: "bg-green-soft text-green-deep",
  yellow: "bg-yellow-soft text-yellow-deep",
  red: "bg-red-soft text-red",
  azul: "bg-azul/10 text-azul",
} as const;

export function Estatistica({
  icone: Icone,
  tom = "green",
  valor,
  rotulo,
  dica,
  href,
}: {
  icone: LucideIcon;
  tom?: keyof typeof TOM;
  /** O número (vai em `tnum`). */
  valor: ReactNode;
  rotulo: string;
  /** Texto de apoio; número dentro dele vai num <span className="tnum">. */
  dica?: ReactNode;
  href?: string;
}) {
  const miolo = (
    <>
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TOM[tom]}`}>
        <Icone size={22} />
      </span>
      <span className="min-w-0">
        <span className="tnum block truncate text-xl font-medium leading-8 text-ink">{valor}</span>
        <span className="block text-xs leading-4 text-muted">{rotulo}</span>
        {dica ? <span className="block text-[11px] leading-4 text-muted">{dica}</span> : null}
      </span>
    </>
  );
  const classe = "cartao flex min-w-0 items-center gap-4 rounded-xl border border-line bg-white px-5 py-4";
  return href ? (
    <Link href={href} className={`${classe} hover:bg-mist`} aria-label={`${rotulo}: ${typeof valor === "string" ? valor : ""}`}>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

export function CartaoDoPainel({
  titulo,
  subtitulo,
  acao,
  className = "",
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** O que fica à direita do título (botão, filtro, selo). */
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className={`cartao min-w-0 overflow-hidden rounded-xl border border-line bg-white ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="text-lg font-medium leading-7">{titulo}</h2>
          {subtitulo ? <p className="text-xs text-muted">{subtitulo}</p> : null}
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** O cabeçalho cinza da tabela do kit: letras pequenas, maiúsculas, espaçadas. */
export function CabecalhoDaTabela({ colunas }: { colunas: string[] }) {
  return (
    <thead>
      <tr className="bg-mist">
        {colunas.map((c, i) => (
          <th key={`${c}-${i}`} scope="col" className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-2">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Grade ou lista, lembrado no aparelho: o botão aceso tem `aria-pressed` e o
 * nome em texto para o leitor de tela — nunca só o ícone.
 */
export function AlternarVisao({
  visao,
  aoMudar,
  opcoes,
}: {
  visao: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string; icone: LucideIcon }[];
}) {
  return (
    <div role="group" aria-label="Como mostrar" className="inline-flex overflow-hidden rounded-md border border-line-2">
      {opcoes.map(({ valor, rotulo, icone: Icone }) => {
        const aceso = visao === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={aceso}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => aoMudar(valor)}
            className={`flex h-9 w-10 items-center justify-center ${aceso ? "bg-green-soft text-green-deep" : "text-muted hover:text-ink"}`}
          >
            <Icone size={18} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Gráfico pequeno dentro do cartão de estatística (o "sparkline" do kit):
 * barras ou linha com área, sem eixo — o número ao lado é que diz o valor;
 * a lista de pontos vai no `aria-label` para o leitor de tela.
 */
export function Sparkline({
  pontos,
  tipo = "linha",
  cor = "var(--green)",
  largura = 120,
  altura = 48,
  rotulo,
  cheio = false,
}: {
  pontos: number[];
  tipo?: "linha" | "barras";
  cor?: string;
  largura?: number;
  altura?: number;
  rotulo: string;
  /** Ocupa a largura do cartão (esticando o desenho), em vez da largura fixa. */
  cheio?: boolean;
}) {
  const classe = cheio ? "block h-auto w-full overflow-visible" : "shrink-0 overflow-visible";
  const ratio = cheio ? { preserveAspectRatio: "none" as const } : {};
  const max = Math.max(...pontos, 1);
  const n = Math.max(pontos.length, 1);
  if (tipo === "barras") {
    const passo = largura / n;
    return (
      <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={rotulo} className={classe} {...ratio}>
        {pontos.map((p, i) => {
          const h = Math.max(3, Math.round((p / max) * (altura - 4)));
          return <rect key={i} x={i * passo + passo * 0.2} y={altura - h} width={passo * 0.6} height={h} rx={2} fill={cor} opacity={p === max ? 1 : 0.45} />;
        })}
      </svg>
    );
  }
  const passo = n > 1 ? largura / (n - 1) : 0;
  const y = (p: number) => altura - 4 - (p / max) * (altura - 8);
  const d = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${(i * passo).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={rotulo} className={classe} {...ratio}>
      {n > 1 ? <path d={`${d} L${largura},${altura} L0,${altura} Z`} fill={cor} opacity={0.12} /> : null}
      <path d={n > 1 ? d : `M0,${y(pontos[0] ?? 0)} L${largura},${y(pontos[0] ?? 0)}`} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Lista de barras horizontais com rótulo e valor (o "Sales by Country" do kit). */
export function BarrasHorizontais({
  linhas,
  cores = ["bg-green", "bg-azul", "bg-yellow", "bg-green-deep", "bg-red", "bg-muted"],
}: {
  linhas: { rotulo: string; valor: number; texto: string }[];
  cores?: string[];
}) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="space-y-3">
      {linhas.map((l, i) => (
        <li key={l.rotulo} className="flex items-center gap-3 text-sm">
          <span className="w-8 shrink-0 text-xs font-medium text-ink-2">{l.rotulo}</span>
          <span className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-mist-2">
            <span
              className={`tnum flex h-full items-center justify-end rounded pr-2 text-[11px] font-semibold text-branco ${cores[i % cores.length]}`}
              style={{ width: `${Math.max(10, Math.round((l.valor / max) * 100))}%` }}
            >
              {l.texto}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A lista longa do painel: **cartão por linha no celular, tabela a partir de
 * `sm`** (639 px). Uma tabela de cinco colunas num celular de 390 px rola
 * para o lado ou espreme o texto; o cartão conta a mesma linha de cima para
 * baixo. Só um dos dois fica na tela (o outro é `display: none`, então o
 * leitor de tela também lê uma vez só).
 */
export function TabelaOuCartoes<T>({
  itens,
  chave,
  colunas,
  cartao,
  aria,
}: {
  itens: T[];
  chave: (i: T) => Key;
  /** `direita` alinha número e dinheiro, como no kit. */
  colunas: { titulo: string; celula: (i: T) => ReactNode; direita?: boolean }[];
  /** A linha contada de cima para baixo, para o celular. */
  cartao: (i: T) => ReactNode;
  aria: string;
}) {
  return (
    <>
      <ul aria-label={aria} className="divide-y divide-line sm:hidden">
        {itens.map((i) => (
          <li key={chave(i)} className="px-4 py-3">
            {cartao(i)}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table aria-label={aria} className="w-full text-sm">
          <CabecalhoDaTabela colunas={colunas.map((c) => c.titulo)} />
          <tbody>
            {itens.map((i) => (
              <tr key={chave(i)} className="border-t border-line">
                {colunas.map((c) => (
                  <td key={c.titulo} className={`px-4 py-3 ${c.direita ? "text-right" : ""}`}>
                    {c.celula(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** "Ver mais" no pé da lista paginada: some quando o servidor não mandou o próximo cursor. */
export function VerMais({
  temMais,
  carregando,
  aoPedir,
  mostradas,
}: {
  temMais: boolean;
  carregando: boolean;
  aoPedir: () => void;
  mostradas: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        <span className="tnum">{mostradas}</span> mostrad{mostradas === 1 ? "a" : "as"}
        {temMais ? "" : " — é tudo"}
      </span>
      {temMais ? (
        <button
          type="button"
          onClick={aoPedir}
          disabled={carregando}
          className="inline-flex min-h-9 items-center rounded-md border-2 border-green px-4 text-sm font-semibold text-green-deep hover:bg-green-soft disabled:opacity-50"
        >
          {carregando ? "Carregando…" : "Ver mais"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Abas de uma tela de painel com muito cartão (Configurações, a edição da
 * rifa): em vez de uma pilha de dez cartões, uma aba por assunto — como as
 * "Account Settings" do kit.
 *
 * - **A aba vai na URL** (`?aba=`): recarregar ou mandar o link abre a mesma
 *   aba; sem o parâmetro, a primeira.
 * - **Âncora abre a aba dela**: `#verificacao` num link antigo cai na aba
 *   que tem aquele cartão e rola até ele (`ancoras`).
 * - Teclado como em toda lista de abas: setas, Home e End; só a aba ativa
 *   entra na ordem do Tab (`tabIndex`), o painel em si recebe o foco depois.
 * - Só a aba aberta é montada: cartão de outra aba não busca dado à toa.
 */
export function Abas({
  abas,
  rotulo,
  ancoras = {},
  parametro = "aba",
  naUrl = true,
}: {
  abas: { id: string; titulo: string; conteudo: ReactNode }[];
  /** O nome da lista de abas, para o leitor de tela. */
  rotulo: string;
  /** `{ "verificacao": "perfil" }`: a âncora e a aba que a contém. */
  ancoras?: Record<string, string>;
  parametro?: string;
  /** Falso num painel que abre e fecha dentro da tela (a edição da rifa): sem URL para lembrar. */
  naUrl?: boolean;
}) {
  const ids = abas.map((a) => a.id);
  const inicial = () =>
    typeof window === "undefined" || !naUrl
      ? ids[0]
      : abaInicial(ids, { search: window.location.search, hash: window.location.hash }, ancoras, parametro);
  const [ativa, setAtiva] = useState(inicial);
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});

  // A âncora de um link antigo: rola até o cartão assim que a aba monta.
  useEffect(() => {
    const ancora = naUrl ? window.location.hash.replace(/^#/, "") : "";
    if (!ancora || ancoras[ancora] !== ativa) return;
    const t = setTimeout(() => document.getElementById(ancora)?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(t);
    // só na primeira montagem da aba pedida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = (id: string, foco = false) => {
    setAtiva(id);
    if (naUrl) {
      const url = new URL(window.location.href);
      if (id === ids[0]) url.searchParams.delete(parametro);
      else url.searchParams.set(parametro, id);
      url.hash = "";
      window.history.replaceState(null, "", url);
    }
    if (foco) botoes.current[id]?.focus();
  };

  const noTeclado = (e: React.KeyboardEvent, i: number) => {
    const alvo = abaDoTeclado(e.key, i, ids.length);
    if (alvo === null) return;
    e.preventDefault();
    abrir(ids[alvo], true);
  };

  const atual = abas.find((a) => a.id === ativa) ?? abas[0];
  return (
    <div>
      <div className="relative mb-3 overflow-x-auto">
        <div role="tablist" aria-label={rotulo} className="flex min-w-max gap-1 border-b border-line">
          {abas.map((a, i) => {
            const aceso = a.id === atual.id;
            return (
              <button
                key={a.id}
                ref={(el) => {
                  botoes.current[a.id] = el;
                }}
                id={`aba-${a.id}`}
                type="button"
                role="tab"
                aria-selected={aceso}
                aria-controls={`painel-${a.id}`}
                tabIndex={aceso ? 0 : -1}
                onClick={() => abrir(a.id)}
                onKeyDown={(e) => noTeclado(e, i)}
                className={`-mb-px inline-flex min-h-10 items-center whitespace-nowrap border-b-2 px-4 text-sm font-medium ${
                  aceso ? "border-green text-green-deep" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {a.titulo}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={`painel-${atual.id}`} aria-labelledby={`aba-${atual.id}`} tabIndex={0} className="focus:outline-none">
        {atual.conteudo}
      </div>
    </div>
  );
}

/**
 * Lista à esquerda e o item aberto à direita — o Atendimento (chamados,
 * pedidos de mudança, denúncias, verificações), como a caixa de e-mail do kit.
 *
 * - **Tela larga (`xl`, 1280 px)**: os dois lado a lado; a lista e o item
 *   rolam cada um no seu lugar, e o item fica fixo sob a barra de cima — a
 *   conversa não some quando a lista é longa.
 * - **Abaixo disso**: uma coisa por vez. Abriu um item, a lista dá lugar a
 *   ele com um "Voltar" no alto (o foco vai para o botão e a página sobe);
 *   antes, o item abria **embaixo** de uma lista que podia ter metros.
 * - **Esc fecha o item** (menos dentro de campo de texto — não perde o
 *   rascunho da resposta).
 */
export function MestreDetalhe({
  lista,
  detalhe,
  aberto,
  aoFechar,
  vazio,
  voltar = "Voltar para a lista",
}: {
  /** O `<Card>` com a lista (cada tela escolhe o título e as linhas). */
  lista: ReactNode;
  /** O item aberto; só é montado com `aberto`. */
  detalhe: ReactNode;
  aberto: string | null;
  aoFechar: () => void;
  /** O que a coluna da direita diz enquanto nada está aberto (só em tela larga). */
  vazio: string;
  voltar?: string;
}) {
  const botaoVoltar = useRef<HTMLButtonElement>(null);
  // O `aoFechar` das telas é uma função nova a cada desenho: se entrasse na
  // lista do efeito, a lista que se atualiza sozinha (a cada 30 s) subiria a
  // página e tomaria o foco de quem está respondendo.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    // Abaixo de `xl` o item ocupa a tela: sobe a página e leva o foco ao "Voltar".
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      window.scrollTo({ top: 0 });
      botaoVoltar.current?.focus();
    }
    const noEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      fechar.current();
    };
    document.addEventListener("keydown", noEsc);
    return () => document.removeEventListener("keydown", noEsc);
  }, [aberto]);

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:items-start">
      <div className={`min-w-0 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto ${aberto ? "hidden xl:block" : ""}`}>{lista}</div>
      {aberto ? (
        <div className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:space-y-0 xl:overflow-y-auto">
          <button
            ref={botaoVoltar}
            type="button"
            onClick={aoFechar}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-green-deep hover:bg-green-soft xl:hidden"
          >
            <span aria-hidden>←</span> {voltar}
          </button>
          {detalhe}
        </div>
      ) : (
        <div className="hidden min-w-0 xl:block">
          <div className="cartao rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-muted">{vazio}</div>
        </div>
      )}
    </div>
  );
}
