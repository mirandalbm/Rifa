/**
 * Regulamento de cada rifa, montado dos dados que o sistema já tem — a
 * mesma fonte do bilhete e da tela de compra, então não tem como o
 * regulamento dizer uma coisa e a rifa fazer outra. O organizador acrescenta
 * as disposições dele (`regulamentoExtra`), que travam ao publicar junto com
 * a autorização: quem comprou comprou aquelas regras.
 *
 * Puro: o servidor monta, a tela mostra, o teste confere.
 */
import { formatBRL, formatQuota, groupNumber } from "./format";
import { regraDoReembolso } from "./reembolso";

export const REGULAMENTO_EXTRA_MAX = 3000;

/** Dias para o ganhador receber o prêmio depois do sorteio. */
export const PRAZO_ENTREGA_DIAS = 30;
/** Dias para o ganhador reclamar o prêmio (Decreto 70.951/72). */
export const PRESCRICAO_DIAS = 180;

export function validarRegulamentoExtra(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto !== "string") throw new Error("O texto do regulamento precisa ser texto.");
  const t = bruto.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > REGULAMENTO_EXTRA_MAX) {
    throw new Error(`O texto do regulamento passa de ${REGULAMENTO_EXTRA_MAX} caracteres.`);
  }
  return t || null;
}

export interface DadosDoRegulamento {
  rifa: {
    title: string;
    prizeTitle: string;
    totalQuotas: number;
    priceCents: number;
    minPerOrder: number;
    maxPerOrder: number;
    reservationTtlMin: number;
    drawAt: string | Date | null;
    authorizationCode: string | null;
    drawSeedHash: string | null;
    regulamentoExtra: string | null;
  };
  promotora: {
    nome: string;
    cnpj: string | null;
    endereco: string | null;
    contato: string | null;
  };
  /** Só a descrição de cada cota premiada — o número nunca sai antes da revelação. */
  cotasPremiadas: string[];
  taxaReembolsoPct: number;
  aceitaReembolso: boolean;
}

export interface Secao {
  titulo: string;
  itens: string[];
}

function dataHora(d: string | Date | null, fuso = "America/Sao_Paulo"): string | null {
  if (!d) return null;
  const x = new Date(d);
  return `${x.toLocaleDateString("pt-BR", { timeZone: fuso })} às ${x.toLocaleTimeString("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  })} (horário de Brasília)`;
}

/** Agrupa "R$ 100 no Pix" repetido em "3 × R$ 100 no Pix". */
function agrupar(premios: string[]): string[] {
  const conta = new Map<string, number>();
  for (const p of premios) conta.set(p, (conta.get(p) ?? 0) + 1);
  return [...conta].map(([p, n]) => (n > 1 ? `${n} × ${p}` : p));
}

export function montarRegulamento(d: DadosDoRegulamento): Secao[] {
  const { rifa, promotora } = d;
  const primeira = formatQuota(1, rifa.totalQuotas);
  const ultima = formatQuota(rifa.totalQuotas, rifa.totalQuotas);
  const quando = dataHora(rifa.drawAt);

  const secoes: Secao[] = [
    {
      titulo: "1. Promotora",
      itens: [
        `Esta promoção é realizada por ${promotora.nome}${promotora.cnpj ? `, CNPJ ${promotora.cnpj}` : ""}${
          promotora.endereco ? `, com sede em ${promotora.endereco}` : ""
        }.`,
        ...(promotora.contato ? [`Contato da promotora: ${promotora.contato}.`] : []),
        "A plataforma rifa.br é o meio de venda e de conferência; a responsabilidade pela promoção e pela entrega do prêmio é da promotora.",
      ],
    },
    {
      titulo: "2. Autorização",
      itens: [
        rifa.authorizationCode
          ? `Promoção comercial autorizada pela Secretaria de Prêmios e Apostas do Ministério da Fazenda (SPA/MF), certificado nº ${rifa.authorizationCode}, nos termos da Lei nº 5.768/1971.`
          : "Autorização SPA/MF ainda não informada — a rifa só é publicada com ela.",
      ],
    },
    {
      titulo: "3. Prêmio",
      itens: [
        `Prêmio principal: ${rifa.prizeTitle}.`,
        ...(d.cotasPremiadas.length
          ? [
              `Há ${d.cotasPremiadas.length} cota(s) premiada(s), reveladas na hora do pagamento: ${agrupar(d.cotasPremiadas).join("; ")}. Os números premiados são secretos até a revelação.`,
            ]
          : []),
      ],
    },
    {
      titulo: "4. Participação",
      itens: [
        `São ${groupNumber(rifa.totalQuotas)} cotas, numeradas de ${primeira} a ${ultima}, a ${formatBRL(rifa.priceCents)} cada.`,
        `Cada pedido tem no mínimo ${rifa.minPerOrder} e no máximo ${groupNumber(rifa.maxPerOrder)} cota(s).`,
        `Só participa a cota paga. A reserva não paga em ${rifa.reservationTtlMin} minutos é desfeita e os números voltam a ficar livres.`,
        "Cada número é vendido uma única vez.",
      ],
    },
    {
      titulo: "5. Apuração",
      itens: [
        quando
          ? `O sorteio acontece em ${quando}, com os 5 prêmios da extração da Loteria Federal dessa data.`
          : "A data do sorteio é informada antes da publicação.",
        "O número vencedor é calculado a partir dos 5 prêmios da Loteria Federal e de uma semente secreta, cujo resumo (hash SHA-256) foi publicado antes da primeira venda. Depois do sorteio a semente é publicada, e qualquer pessoa pode refazer a conta na página da rifa.",
        ...(rifa.drawSeedHash ? [`Resumo da semente publicado: ${rifa.drawSeedHash}.`] : []),
        "Se o número sorteado não tiver sido vendido, a promotora informa o procedimento na página da rifa, conforme a autorização.",
      ],
    },
    {
      titulo: "6. Entrega do prêmio",
      itens: [
        `O ganhador é avisado pelo WhatsApp do cadastro e recebe o prêmio da promotora em até ${PRAZO_ENTREGA_DIAS} dias após o sorteio, sem nenhum custo.`,
        `O direito ao prêmio prescreve em ${PRESCRICAO_DIAS} dias contados da data da apuração.`,
      ],
    },
    {
      titulo: "7. Reembolso",
      itens: [d.aceitaReembolso ? regraDoReembolso(d.taxaReembolsoPct) : "Esta rifa não aceita pedidos de reembolso pelo site no momento."],
    },
    {
      titulo: "8. Dados pessoais",
      itens: [
        "Nome, WhatsApp e CPF são usados para identificar quem comprou, entregar o bilhete e o prêmio, e cumprir obrigações legais (LGPD). O participante pode pedir a exclusão da conta em Minha conta; as compras ficam guardadas pelo prazo legal.",
      ],
    },
  ];

  if (rifa.regulamentoExtra) {
    secoes.push({
      titulo: "9. Disposições da promotora",
      itens: rifa.regulamentoExtra.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    });
  }
  return secoes;
}
