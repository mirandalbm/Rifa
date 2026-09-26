import { useRef, useState } from "react";
import { Button } from "@/components/bits";
import { lerImagem } from "@/lib/anexo";

export interface Mensagem {
  id: string;
  autor: "comprador" | "organizacao" | string;
  nome: string | null;
  texto: string;
  anexoId: string | null;
  createdAt: string;
}

/**
 * A conversa do chamado — a mesma para o comprador e para a organização. O
 * lado de quem vê fica à direita; o anexo abre pela rota do lado que vê
 * (`anexoBase`), que confere se ele pode.
 */
export function Conversa({
  mensagens,
  meuLado,
  anexoBase,
  podeEscrever,
  enviar,
  enviando,
}: {
  mensagens: Mensagem[];
  meuLado: "comprador" | "organizacao";
  anexoBase: string;
  podeEscrever: boolean;
  enviar: (m: { texto: string; anexo?: string }) => Promise<unknown>;
  enviando: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<string | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col">
      <ol className="space-y-2 px-3 py-3" aria-label="Mensagens">
        {mensagens.map((m) => {
          const meu = m.autor === meuLado;
          return (
            <li key={m.id} className={`flex ${meu ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  meu ? "bg-green-soft text-ink" : "border border-line bg-white text-ink"
                }`}
              >
                <p className="text-[11px] font-semibold text-muted">
                  {m.nome ?? (m.autor === "comprador" ? "Cliente" : "Atendimento")} ·{" "}
                  <span className="tnum">{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
                {m.anexoId ? (
                  <a href={`${anexoBase}/${m.anexoId}`} target="_blank" rel="noreferrer">
                    <img
                      src={`${anexoBase}/${m.anexoId}`}
                      alt="Anexo enviado na conversa"
                      className="mt-2 max-h-64 rounded-md border border-line"
                      loading="lazy"
                    />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {podeEscrever ? (
        <form
          className="space-y-2 border-t border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErro(null);
            try {
              await enviar({ texto, anexo });
              setTexto("");
              setAnexo(undefined);
              if (arquivo.current) arquivo.current.value = "";
            } catch (err) {
              setErro((err as Error).message);
            }
          }}
        >
          <label htmlFor="msg" className="label-xs">
            Mensagem
          </label>
          <textarea
            id="msg"
            rows={3}
            maxLength={2000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={arquivo}
              type="file"
              accept="image/*"
              aria-label="Anexar imagem"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setAnexo(undefined);
                try {
                  setAnexo(await lerImagem(f));
                } catch (err) {
                  setErro((err as Error).message);
                  e.target.value = "";
                }
              }}
              className="text-xs"
            />
            <Button type="submit" disabled={enviando || (!texto.trim() && !anexo)}>
              {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
          {erro ? <p className="text-xs text-red">{erro}</p> : null}
        </form>
      ) : (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Chamado encerrado.</p>
      )}
    </div>
  );
}
