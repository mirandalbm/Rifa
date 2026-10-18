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
import type { Rede } from "./template";
import { conferirDadosDaEmpresa, formatarCnpj } from "./legal";

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
      { rotulo: "Termos de uso", para: "/termos" },
      { rotulo: "Privacidade", para: "/privacidade" },
    ],
  },
];

/**
 * Exemplo do rodapé, para a fase de construção da plataforma: enquanto a
 * plataforma não cadastrou **nenhuma** rede nem **nenhum** logo em Aparência,
 * o rodapé mostra isto, direto do código — não escreve nada no banco e some
 * sozinho no momento em que houver cadastro de verdade. É só mostra: os
 * ícones são neutros, o nome diz "Exemplo" e as redes apontam para a página
 * inicial de cada rede, nunca para a conta de alguém.
 */
export const TEXTO_DE_EXEMPLO =
  "Texto de exemplo: apresente aqui a plataforma e a promotora. Troque pelo texto oficial em Aparência.";

export const REDES_DE_EXEMPLO: { rede: Rede; link: string }[] = [
  { rede: "instagram", link: "https://www.instagram.com/" },
  { rede: "whatsapp", link: "https://wa.me/" },
  { rede: "youtube", link: "https://www.youtube.com/" },
  { rede: "facebook", link: "https://www.facebook.com/" },
];

export type IconeDeApoio = "casa" | "folha" | "cruz" | "coracao";

export const APOIOS_DE_EXEMPLO: { id: IconeDeApoio; nome: string; cor: string }[] = [
  { id: "casa", nome: "Exemplo: casa de apoio", cor: "#0b6fb8" },
  { id: "folha", nome: "Exemplo: projeto ambiental", cor: "#00873e" },
  { id: "cruz", nome: "Exemplo: projeto de saúde", cor: "#0b6fb8" },
  { id: "coracao", nome: "Exemplo: ação social", cor: "#00873e" },
];

/** O exemplo só aparece com o rodapé inteiro vazio: qualquer cadastro real o desliga. */
export function rodapeEmModoExemplo(redes: unknown[], apoios: unknown[]): boolean {
  return redes.length === 0 && apoios.length === 0;
}

/**
 * O aviso de jogo responsável quando o template publicado não traz um
 * (`textos.jogoResponsavel` vazio). É o texto que o pé do rodapé já usava;
 * agora mora aqui e a tela só o mostra, numa versão só.
 */
export const AVISO_DE_JOGO_PADRAO = "Proibido para menores de 18 anos.";

/** O aviso do template publicado, ou o padrão — nunca um texto digitado na tela. */
export function avisoDeJogoResponsavel(textos: { jogoResponsavel?: string | null } | null | undefined): string {
  return textos?.jogoResponsavel?.trim() || AVISO_DE_JOGO_PADRAO;
}

/**
 * A primeira linha de texto oficial embaixo da logo: razão social e CNPJ dos
 * "Dados da empresa" **publicados** (`legal` do template). Os dados passam de
 * novo pela régua do servidor (`conferirDadosDaEmpresa`): CNPJ sem dígito
 * certo ou campo estranho não vira texto na tela de todo apostador.
 *
 * Falta a razão social ou o CNPJ, devolve `null` — e a linha não aparece. A
 * tela nunca inventa nem preenche com exemplo: quem cadastra é a plataforma,
 * em Aparência → Rodapé e empresa.
 */
export function linhaDaEmpresa(legal: unknown): { razaoSocial: string; cnpj: string } | null {
  const { dados } = conferirDadosDaEmpresa(legal);
  if (!dados.razaoSocial || !dados.cnpj) return null;
  return { razaoSocial: dados.razaoSocial, cnpj: formatarCnpj(dados.cnpj) };
}
