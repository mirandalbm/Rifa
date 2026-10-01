/**
 * As colunas de links do rodapé da plataforma (tablet e computador), como
 * no rodapé de um produto: quatro títulos em negrito, a lista embaixo.
 *
 * Moram aqui, puras, para o teste conferir que cada caminho existe no
 * `App.tsx` e que cada atalho da ajuda aponta para uma pergunta que existe
 * (`shared/ajuda.ts`) — link morto no rodapé aparece em toda página.
 *
 * `emBreve`: a página ainda não existe. Aparece como texto, com o rótulo
 * "Em breve" — nunca como link que cai em 404.
 */
export interface LinkDoRodape {
  rotulo: string;
  /** Caminho do site (com `#pergunta` para abrir uma resposta da ajuda). */
  para?: string;
  emBreve?: true;
}

export interface ColunaDoRodape {
  titulo: string;
  links: LinkDoRodape[];
}

export const COLUNAS_DO_RODAPE: ColunaDoRodape[] = [
  {
    titulo: "Plataforma",
    links: [
      { rotulo: "Minhas compras", para: "/minhas-cotas" },
      { rotulo: "Seja afiliado", para: "/seja-afiliado" },
      { rotulo: "Avisos", para: "/notificacoes" },
      { rotulo: "Perfil e preferências", para: "/perfil" },
    ],
  },
  {
    titulo: "Rifas",
    links: [
      { rotulo: "Rifas no ar", para: "/" },
      { rotulo: "Buscar", para: "/buscar" },
      { rotulo: "Reels", para: "/reels" },
      { rotulo: "Carrinho", para: "/carrinho" },
    ],
  },
  {
    titulo: "Ajuda",
    links: [
      { rotulo: "Central de ajuda", para: "/ajuda" },
      { rotulo: "Como comprar", para: "/ajuda#como-comprar" },
      { rotulo: "Reserva e prazo", para: "/ajuda#reserva" },
      { rotulo: "Reembolso", para: "/ajuda#reembolso" },
    ],
  },
  {
    titulo: "Legal",
    links: [
      { rotulo: "A rifa é legal?", para: "/ajuda#rifa-legal" },
      { rotulo: "Como o sorteio é feito", para: "/ajuda#como-sorteia" },
      { rotulo: "Cuidado com Pix por fora", para: "/ajuda#pix-por-fora" },
      { rotulo: "Termos de uso", emBreve: true },
      { rotulo: "Privacidade", emBreve: true },
    ],
  },
];
