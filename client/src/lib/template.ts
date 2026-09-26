import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FONTES, RAIOS, TEMPLATE_PADRAO, type Template } from "@shared/template";
import { useSession } from "./session";

/**
 * O template publicado (ou o rascunho, na pré-visualização do administrador
 * geral: `?previa=1`). Enquanto carrega, vale o padrão — a tela nunca fica
 * sem casca.
 */
export function useTemplate(): Template {
  const { data: sessao } = useSession();
  const previa =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("previa") === "1" &&
    sessao?.role === "admin";
  const { data } = useQuery<{ template: Template }>({
    queryKey: [previa ? "/api/admin/template/previa" : "/api/public/template"],
    staleTime: previa ? 0 : 60_000,
    refetchInterval: previa ? 2000 : false,
  });
  return data?.template ?? TEMPLATE_PADRAO;
}

/**
 * Leva o template para a casca: cor de marca (os dois temas), fonte e
 * cantos viram variáveis na raiz; a fonte escolhida é carregada do Google
 * Fonts uma vez. Nome e logo são desenhados por `<Marca />`.
 */
export function AplicarTemplate() {
  const t = useTemplate();
  const { cor, fonte, raio, nome } = t.identidade;
  useEffect(() => {
    const raiz = document.documentElement.style;
    raiz.setProperty("--marca-claro", cor.claro);
    raiz.setProperty("--marca-escuro", cor.escuro);
    raiz.setProperty("--raio", `${RAIOS[raio]}px`);
    raiz.setProperty("--fonte", `"${FONTES[fonte].nome}"`);
    if (fonte !== "instrument") {
      const id = `fonte-${fonte}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${FONTES[fonte].google}&display=swap`;
        document.head.appendChild(link);
      }
    }
    if (nome && document.title !== nome) document.title = nome;
  }, [cor.claro, cor.escuro, fonte, raio, nome]);
  return null;
}
