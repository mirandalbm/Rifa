import { useState, type ReactNode } from "react";
import { Janela } from "@/components/Janela";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { IconeAviao, IconeCasa, IconeLupa, IconePerfil, IconeReels, IconeSacola, IconeVarinha } from "@/components/Icones";
import {
  AVISO_DO_TREVO_PADRAO,
  BOTOES_DO_CONSOLE,
  CORES_DO_AVISO,
  botaoAtivo,
  pendenciasDaConta,
  quemPublica,
  type AvisoDoTrevo,
  type BotaoDoConsole,
} from "@shared/console";
import { useSession } from "@/lib/session";
import { rotuloDasMensagens } from "@shared/mensagens";
import { CONFIG_BUSCA_PADRAO, type ConfigBusca } from "@shared/buscar";
import { bilhetesNoCarrinho, useCarrinho } from "@/lib/carrinho";
import { IconeTrevo } from "@/components/Publicacao";
import { FotoDoApostador } from "@/components/PerfilDoApostador";
import { Marca } from "@/components/Marca";

/** Altura do console na base (sem a área segura do celular). */
export const ALTURA_DO_CONSOLE = "3.25rem";
/** Onde começa o que fica fixo acima do console (barra de compra, avisos). */
export const acimaDoConsole = `calc(${ALTURA_DO_CONSOLE} + env(safe-area-inset-bottom))`;

interface ConfigDoApp {
  avisoDoTrevo: AvisoDoTrevo;
  publicarApostador: boolean;
  reelsLigado: boolean;
  mensagensLigado: boolean;
  buscarLigado: boolean;
  buscarTipos: ConfigBusca;
}

/** Como o trevo avisa e se o apostador publica (escolhas da plataforma). */
export function useConfigDoApp(): ConfigDoApp {
  const { data } = useQuery<ConfigDoApp>({ queryKey: ["/api/public/app"], staleTime: 60_000 });
  return data ?? { avisoDoTrevo: AVISO_DO_TREVO_PADRAO, publicarApostador: false, reelsLigado: false, mensagensLigado: false, buscarLigado: false, buscarTipos: CONFIG_BUSCA_PADRAO };
}

/** Os ícones do console, no traço suave da barra de ações (`Icones.tsx`). */
const ICONE: Record<Exclude<BotaoDoConsole, "perfil">, (p: { aceso?: boolean; tamanho?: number }) => ReactNode> = {
  inicio: IconeCasa,
  reels: IconeReels,
  mensagens: IconeAviao,
  buscar: IconeLupa,
  carrinho: IconeSacola,
};

/* ------------------------------------------------------------------ *
 * Trevo de avisos
 * ------------------------------------------------------------------ */

/**
 * O trevo (o lugar do coração do Instagram): leva à central de avisos. Com
 * novidade, o ponto no canto ou o trevo cheio, na cor que a plataforma
 * escolheu — e o número sempre no rótulo, nunca só a cor.
 */
export function TrevoDeAvisos({ comRotulo = false }: { comRotulo?: boolean }) {
  const { data: sessao } = useSession();
  const { avisoDoTrevo } = useConfigDoApp();
  const { data } = useQuery<{ naoLidas: number }>({
    queryKey: ["/api/public/notificacoes/resumo"],
    refetchInterval: 60_000,
    enabled: Boolean(sessao?.buyer),
  });
  const n = sessao?.buyer ? (data?.naoLidas ?? 0) : 0;
  const hex = CORES_DO_AVISO[avisoDoTrevo.cor]?.hex ?? null;
  const cor = hex ? { color: hex } : undefined;
  const fundo = hex ? { backgroundColor: hex } : undefined;
  const cheio = n > 0 && avisoDoTrevo.estilo === "cheio";
  const rotulo = n ? `Avisos: ${n > 99 ? "mais de 99" : n} novo(s)` : "Avisos";
  return (
    <Link href="/notificacoes" aria-label={rotulo} title={rotulo} className={itemClasse(comRotulo)}>
      <span className={`relative inline-flex ${cheio && !hex ? "text-green" : ""}`} style={cheio ? cor : undefined}>
        <IconeTrevo cheio={cheio} tamanho={26} corDoCheio={cheio ? "currentColor" : undefined} />
        {n > 0 && avisoDoTrevo.estilo === "ponto" ? (
          <span
            aria-hidden
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${hex ? "" : "bg-green"}`}
            style={fundo}
          />
        ) : null}
      </span>
      {comRotulo ? <span className="hidden group-hover/lateral:inline group-focus-within/lateral:inline">Avisos</span> : null}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Publicar
 * ------------------------------------------------------------------ */

/**
 * O ícone de publicação (a varinha), ao lado do trevo. Organização cria
 * rifa, story e legenda; o influenciador vai publicar com o material das
 * organizações; o apostador só com o interruptor da plataforma. Sem conta,
 * não aparece.
 */
export function BotaoPublicar({ comRotulo = false }: { comRotulo?: boolean }) {
  const { data: sessao } = useSession();
  const { publicarApostador } = useConfigDoApp();
  const [aberto, setAberto] = useState(false);
  const quem = quemPublica(
    sessao ? { role: sessao.user ? sessao.role : null, apostador: Boolean(sessao.buyer?.conta) } : null,
    publicarApostador,
  );
  if (!quem) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        aria-label="Criar publicação"
        title="Criar publicação"
        className={itemClasse(comRotulo)}
      >
        <IconeVarinha tamanho={26} />
        {comRotulo ? <span className="hidden group-hover/lateral:inline group-focus-within/lateral:inline">Criar</span> : null}
      </button>
      {/* No body: dentro do topo (camada própria, z-20) o console passaria por cima do menu. */}
      {aberto ? createPortal(<MenuCriar quem={quem} onFechar={() => setAberto(false)} />, document.body) : null}
    </>
  );
}

function MenuCriar({ quem, onFechar }: { quem: NonNullable<ReturnType<typeof quemPublica>>; onFechar: () => void }) {
  const [, navegar] = useLocation();
  const ir = (href: string) => {
    onFechar();
    navegar(href);
  };
  const opcoes: { rotulo: string; detalhe: string; href?: string }[] =
    quem === "organizador"
      ? [
          { rotulo: "Rifa", detalhe: "Cadastrar uma rifa nova, com fotos, vídeos e cotas premiadas", href: "/admin/campanhas" },
          { rotulo: "Story", detalhe: "Uma imagem que fica 24 horas no topo da vitrine", href: "/admin/stories" },
          { rotulo: "Legenda", detalhe: "O texto embaixo da publicação de uma rifa no ar", href: "/admin/campanhas" },
          { rotulo: "Reels e mais ferramentas", detalhe: "Em breve" },
        ]
      : quem === "influenciador"
        ? [
            { rotulo: "Meus links e materiais", detalhe: "O kit de divulgação das organizações", href: "/afiliado/links" },
            { rotulo: "Publicar com o material da organização", detalhe: "Em breve" },
          ]
        : [{ rotulo: "Publicar", detalhe: "Em breve" }];
  return (
    <Janela onFechar={onFechar} rotulo="Criar" className="p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Criar</h2>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted hover:text-ink">
          <X size={18} aria-hidden />
        </button>
      </div>
      <ul className="divide-y divide-line">
        {opcoes.map((o) => (
          <li key={o.rotulo}>
            {o.href ? (
              <button type="button" onClick={() => ir(o.href!)} className="block w-full py-3 text-left hover:bg-mist">
                <span className="block text-sm font-semibold">{o.rotulo}</span>
                <span className="block text-xs text-muted">{o.detalhe}</span>
              </button>
            ) : (
              <div className="py-3 opacity-70">
                <span className="block text-sm font-semibold">{o.rotulo}</span>
                <span className="block text-xs text-muted">{o.detalhe}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Janela>
  );
}

/* ------------------------------------------------------------------ *
 * Console (base no celular, lateral no computador)
 * ------------------------------------------------------------------ */

/** No celular, só o ícone (a barra é estreita); na lateral larga (`xl`), ícone e nome. */
function itemClasse(comRotulo: boolean) {
  return comRotulo
    ? "flex items-center gap-4 rounded-lg p-3 text-ink hover:bg-mist w-full"
    : "flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-mist";
}

/** A foto do perfil no botão do console (ou a inicial, ou o boneco sem conta). */
function AvatarDoConsole() {
  const { data: sessao } = useSession();
  const comConta = Boolean(sessao?.buyer?.conta);
  const { data } = useQuery<{ foto: string | null; apelido: string | null; nomeReal: string }>({
    queryKey: ["/api/public/conta/perfil"],
    enabled: comConta,
  });
  if (comConta) return <FotoDoApostador nome={data?.apelido ?? sessao?.buyer?.name ?? ""} foto={data?.foto ?? null} tamanho={26} />;
  const nome = sessao?.user?.name ?? sessao?.buyer?.name;
  if (nome) {
    return (
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-green text-[12px] font-bold text-on-green">
        {nome.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <IconePerfil tamanho={26} />;
}

/** O que falta na conta de quem entrou (o ponto na foto do perfil). */
export function usePendencias(): string[] {
  const { data: sessao } = useSession();
  const conta = Boolean(sessao?.buyer?.conta);
  const { data } = useQuery<{ apelido: string | null; falta?: string[] }>({ queryKey: ["/api/public/conta/perfil"], enabled: conta });
  if (!conta || !data) return [];
  return pendenciasDaConta({ conta, confirmado: Boolean(sessao?.buyer?.confirmado), apelido: data.apelido, falta: data.falta });
}

/** O número de não lidas do botão Mensagens: só pergunta com a caixa ligada e com conta. */
function useMensagensNaoLidas(ativo: boolean) {
  const { mensagensLigado } = useConfigDoApp();
  const { data: sessao } = useSession();
  const { data } = useQuery<{ naoLidas: number }>({
    queryKey: ["/api/public/mensagens/resumo"],
    refetchInterval: 30_000,
    enabled: ativo && mensagensLigado && Boolean(sessao?.buyer || sessao?.user),
  });
  return mensagensLigado ? (data?.naoLidas ?? 0) : 0;
}

function BotaoDoConsole({ chave, rotulo, caminho, ativo, lateral }: { chave: BotaoDoConsole; rotulo: string; caminho: string; ativo: boolean; lateral: boolean }) {
  // O número do carrinho conta os bilhetes (cada cartela posta é um); a
  // rifa que só tem quantidade conta como um.
  const itens = bilhetesNoCarrinho(useCarrinho());
  const pendencias = usePendencias().length;
  const naoLidas = useMensagensNaoLidas(chave === "mensagens");
  const Icone = chave === "perfil" ? null : ICONE[chave];
  const nome =
    chave === "carrinho" && itens
      ? `${rotulo}: ${itens} bilhete(s)`
      : chave === "perfil" && pendencias
        ? `${rotulo}: ${pendencias} pendência(s) na conta`
        : chave === "mensagens" && naoLidas
          ? rotuloDasMensagens(naoLidas)
          : rotulo;
  const icone: ReactNode = Icone ? (
    <Icone aceso={ativo} tamanho={26} />
  ) : (
    <span className={`inline-flex rounded-full ${ativo ? "ring-2 ring-ink ring-offset-1 ring-offset-white" : ""}`}>
      <AvatarDoConsole />
    </span>
  );
  return (
    <Link
      href={caminho}
      aria-label={nome}
      title={nome}
      aria-current={ativo ? "page" : undefined}
      className={
        lateral
          ? `flex items-center gap-4 rounded-lg p-3 hover:bg-mist w-full ${ativo ? "font-bold" : ""}`
          : "flex h-full flex-1 items-center justify-center"
      }
    >
      <span className="relative inline-flex">
        {icone}
        {chave === "carrinho" && itens ? (
          <span
            aria-hidden
            className="tnum absolute -right-2 -top-1.5 min-w-[18px] rounded-full border-2 border-white bg-marca px-1 text-center text-[10px] font-bold leading-[14px] text-white"
          >
            {itens > 9 ? "9+" : itens}
          </span>
        ) : null}
        {chave === "mensagens" && naoLidas ? (
          <span
            aria-hidden
            className="tnum absolute -right-2 -top-1.5 min-w-[18px] rounded-full border-2 border-white bg-marca px-1 text-center text-[10px] font-bold leading-[14px] text-white"
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        ) : null}
        {chave === "perfil" && pendencias ? (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green" />
        ) : null}
      </span>
      {lateral ? <span className="hidden whitespace-nowrap text-[15px] group-hover/lateral:inline group-focus-within/lateral:inline">{rotulo}</span> : null}
    </Link>
  );
}

/**
 * O console do app. No celular e no tablet, a barra fixa da base com os
 * seis botões, como no Instagram (fundo opaco: com transparência o feed
 * aparecia por baixo). No computador, os mesmos botões na lateral esquerda —
 * só os ícones em `lg`, ícone e nome em `xl` —, com a logo em cima e o trevo
 * e a publicação junto, porque ali o topo some.
 */
export function ConsoleDoApp() {
  const [local] = useLocation();
  const ativo = botaoAtivo(local);
  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-stretch" style={{ height: ALTURA_DO_CONSOLE }}>
          {BOTOES_DO_CONSOLE.map((b) => (
            <BotaoDoConsole key={b.chave} chave={b.chave} rotulo={b.rotulo} caminho={b.caminho} ativo={ativo === b.chave} lateral={false} />
          ))}
        </div>
      </nav>
      <nav
        aria-label="Navegação principal"
        // Sempre só os ícones (72 px); ao passar o ponteiro — ou ao entrar
        // pelo teclado — abre com os nomes por cima do conteúdo, sem empurrar
        // a página, e fecha ao sair.
        className="group/lateral fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col overflow-hidden border-r border-line bg-white px-3 py-6 transition-[width,box-shadow] duration-150 focus-within:w-[244px] focus-within:shadow-card hover:w-[244px] hover:shadow-card motion-reduce:transition-none lg:flex"
      >
        {/* A logo como é, na cor e na forma de sempre — só menor na lateral estreita. */}
        <Link href="/" className="mb-6 flex h-10 items-center whitespace-nowrap px-1 text-[15px] group-hover/lateral:text-xl group-focus-within/lateral:text-xl" aria-label="Início">
          <Marca />
        </Link>
        <div className="flex flex-col gap-1">
          {BOTOES_DO_CONSOLE.filter((b) => b.chave !== "perfil").map((b) => (
            <BotaoDoConsole key={b.chave} chave={b.chave} rotulo={b.rotulo} caminho={b.caminho} ativo={ativo === b.chave} lateral />
          ))}
          <TrevoDeAvisos comRotulo />
          <BotaoPublicar comRotulo />
        </div>
        <div className="mt-auto">
          <BotaoDoConsole chave="perfil" rotulo="Perfil" caminho="/perfil" ativo={ativo === "perfil"} lateral />
        </div>
      </nav>
    </>
  );
}
