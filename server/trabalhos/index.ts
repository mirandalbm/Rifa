/** Os tipos de trabalho que o trabalhador sabe fazer. Tipo novo entra aqui. */
import { TIPO_REELS_GERADO } from "@shared/reelsGerado";
import { fazerReelsGerado } from "./reelsGerado";
import type { FazerTrabalho } from "./tipos";

export const TIPOS_DE_TRABALHO: Record<string, FazerTrabalho> = {
  [TIPO_REELS_GERADO]: fazerReelsGerado,
};
