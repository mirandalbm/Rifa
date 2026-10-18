import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { Janela } from "@/components/Janela";
import { EXPLICACAO_DOS_LOCAIS, LOCAIS, LOCAL_NACIONAL, ROTULO_DOS_LOCAIS } from "@shared/locais";

/**
 * O painel "Locais": todos os 27 estados, cada um com a bandeira em círculo
 * e o nome por escrito. Escolher um estado põe as rifas dele primeiro — a
 * localização só ordena, nunca esconde (`shared/locais.ts`). É a mesma
 * escolha do seletor de antes (`useRegiaoDaVitrine` → `gravarRegiao`).
 *
 * É diálogo (`Janela`: Esc e o fundo fecham, a rolagem de trás trava, o foco
 * entra e volta a quem abriu). Cada local é um botão com o nome escrito ao
 * lado da bandeira — a imagem é só enfeite, nunca a única informação — e
 * `aria-pressed` diz o escolhido (com o "✓" e a palavra, nunca só a cor).
 * Vai para o `body` (portal): dentro da lateral do computador, o painel
 * ficaria preso à camada e ao recorte dela.
 */
export function LocaisDaVitrine({
  valor,
  automatica = null,
  onEscolher,
  onFechar,
}: {
  /** A sigla escolhida à mão, ou "" para Nacional (nenhuma escolha). */
  valor: string;
  /** O estado que a conta ordena sozinha (pelo CEP), quando não há escolha à mão. */
  automatica?: string | null;
  onEscolher: (uf: string) => void;
  onFechar: () => void;
}) {
  const titulo = useId();
  const escolher = (uf: string) => {
    onEscolher(uf);
    onFechar();
  };
  return createPortal(
    <Janela onFechar={onFechar} rotuloPor={titulo} largura="sm:max-w-3xl" className="p-0">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white px-4 py-3">
        <div className="min-w-0">
          <h2 id={titulo} className="font-display text-lg font-bold">
            {ROTULO_DOS_LOCAIS}
          </h2>
          <p className="mt-0.5 text-xs text-ink-2">{EXPLICACAO_DOS_LOCAIS}</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label={`Fechar ${ROTULO_DOS_LOCAIS}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-mist focus-visible:ring-2 focus-visible:ring-marca"
        >
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className="p-4">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <li className="min-w-0 sm:col-span-2 lg:col-span-3">
            <BotaoDeLocal escolhido={valor === ""} onClick={() => escolher("")}>
              <img
                src={LOCAL_NACIONAL.bandeira}
                alt=""
                width={40}
                height={40}
                decoding="async"
                className="h-10 w-10 shrink-0 rounded-full border border-line-2"
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-semibold">{LOCAL_NACIONAL.nome}</span>
                <span className="block text-xs text-ink-2">
                  {automatica
                    ? `${LOCAL_NACIONAL.descricao} — a ordem automática pelo seu CEP (${automatica}) continua`
                    : LOCAL_NACIONAL.descricao}
                </span>
              </span>
            </BotaoDeLocal>
          </li>
          {LOCAIS.map((l) => (
            <li key={l.uf} className="min-w-0">
              <BotaoDeLocal escolhido={valor === l.uf} onClick={() => escolher(l.uf)}>
                {/* O nome está escrito ao lado: a bandeira é enfeite (alt vazio), não a única informação. */}
                <img
                  src={l.bandeira}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 shrink-0 rounded-full border border-line-2"
                />
                <span className="min-w-0 flex-1 break-words font-semibold leading-tight">{l.nome}</span>
                <span className="tnum shrink-0 text-xs font-semibold text-muted">{l.uf}</span>
              </BotaoDeLocal>
            </li>
          ))}
        </ul>
      </div>
    </Janela>,
    document.body,
  );
}

function BotaoDeLocal({
  escolhido,
  onClick,
  children,
}: {
  escolhido: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={escolhido}
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 py-1.5 text-left text-sm text-ink focus-visible:ring-2 focus-visible:ring-marca ${
        escolhido ? "border-green bg-green-soft" : "border-line-2 bg-white hover:border-marca hover:bg-mist"
      }`}
    >
      {children}
      {escolhido ? (
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-green-deep">
          <Check size={16} aria-hidden />
          Escolhido
        </span>
      ) : null}
    </button>
  );
}
