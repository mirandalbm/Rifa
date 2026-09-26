/**
 * Central de ajuda: as perguntas da plataforma. Cada resposta sai das
 * mesmas regras que o sistema aplica (reembolso, sorteio, conta) — quando a
 * regra muda, a resposta muda junto, sem ninguém lembrar de reescrever.
 */
import { regraDoReembolso } from "./reembolso";

export interface Pergunta {
  id: string;
  tema: "comprar" | "sorteio" | "conta" | "reembolso" | "organizador";
  pergunta: string;
  resposta: string[];
}

export const NOME_TEMA_AJUDA: Record<Pergunta["tema"], string> = {
  comprar: "Comprar",
  sorteio: "Sorteio e prêmio",
  conta: "Minha conta",
  reembolso: "Reembolso",
  organizador: "Para organizadores",
};

export function perguntasDaAjuda(p: { taxaReembolsoPct: number; aceitaReembolso: boolean }): Pergunta[] {
  return [
    {
      id: "como-comprar",
      tema: "comprar",
      pergunta: "Como compro cotas?",
      resposta: [
        "Escolha a rifa, a quantidade (ou os números no mapa) e pague pelo Pix. As cotas ficam reservadas enquanto o Pix não é pago e viram suas assim que o pagamento é confirmado.",
        "O bilhete chega pelo WhatsApp e fica em Minhas compras, com a 2ª via.",
      ],
    },
    {
      id: "reserva",
      tema: "comprar",
      pergunta: "Quanto tempo tenho para pagar?",
      resposta: [
        "O prazo aparece na tela do Pix e no regulamento de cada rifa. Reserva não paga no prazo é desfeita e os números voltam a ficar livres.",
      ],
    },
    {
      id: "rifa-legal",
      tema: "comprar",
      pergunta: "Como sei que a rifa é legal?",
      resposta: [
        "Toda rifa publicada aqui tem autorização da SPA/MF (Lei 5.768/1971). O número do certificado e o arquivo ficam na página da rifa, em \"ver certificado\", e no regulamento.",
      ],
    },
    {
      id: "como-sorteia",
      tema: "sorteio",
      pergunta: "Como o número é sorteado?",
      resposta: [
        "O número sai dos 5 prêmios da Loteria Federal da data do sorteio, combinados com uma semente secreta. O resumo dessa semente é publicado antes da primeira venda — assim ninguém pode trocá-la depois de ver a Federal.",
        "Depois do sorteio a semente é publicada, e a página da rifa tem o botão \"Conferir o sorteio\", que refaz a conta no seu próprio aparelho.",
      ],
    },
    {
      id: "transmissao",
      tema: "sorteio",
      pergunta: "Posso assistir ao sorteio?",
      resposta: [
        "Quando o organizador transmite, o link da live aparece na página da rifa. Depois do sorteio fica o vídeo, junto com o número sorteado.",
      ],
    },
    {
      id: "ganhei",
      tema: "sorteio",
      pergunta: "Ganhei. E agora?",
      resposta: [
        "Você recebe um aviso pelo WhatsApp do cadastro e a promotora combina a entrega, sem custo. O prazo está no regulamento da rifa.",
        "Cotas premiadas são reveladas na hora do pagamento, na tela do pedido.",
      ],
    },
    {
      id: "minhas-compras",
      tema: "conta",
      pergunta: "Onde vejo minhas cotas?",
      resposta: [
        "Em Minhas compras, no menu da sua conta: as cotas de cada rifa, o perfil do organizador e a 2ª via do bilhete.",
      ],
    },
    {
      id: "avisos",
      tema: "conta",
      pergunta: "Como recebo avisos no celular?",
      resposta: [
        "Siga o organizador e deixe o sino ligado. O celular pede permissão na primeira vez; também dá para ligar em Minha conta → Avisos neste aparelho.",
        "No iPhone, os avisos só chegam com o app instalado na tela de início.",
      ],
    },
    {
      id: "excluir",
      tema: "conta",
      pergunta: "Como apago minha conta?",
      resposta: [
        "Em Minha conta → Excluir conta. Seus dados pessoais saem; as compras e bilhetes ficam guardados pelo prazo legal, sem o seu nome.",
      ],
    },
    {
      id: "reembolso",
      tema: "reembolso",
      pergunta: "Posso pedir o dinheiro de volta?",
      resposta: p.aceitaReembolso
        ? [
            regraDoReembolso(p.taxaReembolsoPct),
            "O pedido é feito em Minhas compras → Reembolsos, com o CPF e o print do bilhete, e você acompanha a resposta por lá.",
          ]
        : ["No momento a plataforma não recebe pedidos de reembolso pelo site. Fale com a promotora da rifa."],
    },
    {
      id: "ser-organizador",
      tema: "organizador",
      pergunta: "Quero organizar uma rifa aqui.",
      resposta: [
        "A rifa precisa de autorização da SPA/MF em nome da sua empresa. Com ela, fale com a plataforma para abrir a sua organização: você ganha painel, perfil próprio, venda online com Pix e venda com cambista.",
      ],
    },
    {
      id: "afiliado",
      tema: "organizador",
      pergunta: "Como viro afiliado ou cambista?",
      resposta: [
        "No perfil do organizador, toque em ⋮ → Seja um afiliado (vende pelo seu link e recebe comissão) ou Seja um colaborador (vende na mão, como cambista).",
      ],
    },
  ];
}

/** Busca sem acento e sem caixa, na pergunta e na resposta. */
export function buscarNaAjuda(perguntas: Pergunta[], termo: string): Pergunta[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(termo.trim());
  if (!t) return perguntas;
  return perguntas.filter((q) => norm(`${q.pergunta} ${q.resposta.join(" ")}`).includes(t));
}
