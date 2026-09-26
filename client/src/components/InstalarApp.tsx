import { useState } from "react";
import { useInstalacao } from "@/lib/pwa";
import { useTemplate } from "@/lib/template";

const CHAVE = "rifa.instalar.fechado";

function fechadoAntes(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/**
 * Faixa "baixe o app" na base da vitrine.
 *
 * Três caminhos, porque os navegadores não concordam:
 * - Chrome/Edge/Samsung (Android e computador): o botão abre o pedido de
 *   instalação do próprio navegador.
 * - iPhone/iPad: o Safari não tem esse pedido; a faixa ensina o caminho
 *   (Compartilhar → Adicionar à Tela de Início).
 * - Os demais: aponta o menu do navegador.
 *
 * Quem já abriu pelo app não vê a faixa. Quem fechou também não — até
 * limpar os dados do navegador.
 */
export function InstalarApp() {
  const nomeDaMarca = useTemplate().identidade.nome;
  const { instalado, podePedir, ios, instalar } = useInstalacao();
  const [fechado, setFechado] = useState(fechadoAntes);
  const [ajuda, setAjuda] = useState(false);

  if (instalado || fechado) return null;

  const fechar = () => {
    setFechado(true);
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {
      // armazenamento bloqueado: fecha só nesta visita
    }
  };

  return (
    <>
      {/* Espaço para a faixa fixa não cobrir o fim da página. */}
      <div aria-hidden className="h-24" />
      <aside
        aria-label="Instalar o aplicativo"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Baixe o app {nomeDaMarca}</p>
            {ajuda ? (
              <p className="text-xs text-ink-2">
                {ios
                  ? "No Safari, toque em Compartilhar (quadrado com seta) e depois em \"Adicionar à Tela de Início\"."
                  : "Abra o menu do navegador (⋮) e escolha \"Instalar app\" ou \"Adicionar à tela inicial\"."}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Acompanhe suas cotas e o sorteio direto da tela do celular.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (podePedir) {
                await instalar();
              } else {
                setAjuda(true);
              }
            }}
            className="shrink-0 rounded-md bg-green px-4 py-2 text-sm font-semibold text-on-green hover:brightness-95"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="shrink-0 rounded-md px-2 py-2 text-lg leading-none text-muted hover:bg-mist-2"
          >
            ×
          </button>
        </div>
      </aside>
    </>
  );
}
