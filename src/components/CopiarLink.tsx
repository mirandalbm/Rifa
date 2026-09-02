"use client";

import { useState } from "react";

export default function CopiarLink({ link, codigo }: { link: string; codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <code className="flex-1 overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-sm">{link}</code>
      <button type="button" onClick={copiar} className="botao">
        {copiado ? "Copiado!" : "Copiar link"}
      </button>
      <span className="text-sm text-slate-500">
        Seu código: <strong className="font-mono">{codigo}</strong>
      </span>
    </div>
  );
}
