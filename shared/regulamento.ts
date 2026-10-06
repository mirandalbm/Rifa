/**
 * Regulamento de cada rifa, montado dos dados que o sistema já tem — a
 * mesma fonte do bilhete e da tela de compra, então não tem como o
 * regulamento dizer uma coisa e a rifa fazer outra. O organizador acrescenta
 * as disposições dele (`regulamentoExtra`), que travam ao publicar junto com
 * a autorização: quem comprou comprou aquelas regras.
 *
 * Puro: o servidor monta, a tela mostra, o teste confere.
 */
import { clausulaDoBonus } from "./bonus";
import { formatBRL, formatQuota, groupNumber } from "./format";
import { regraDoReembolso } from "./reembolso";
import { IMPEDIDOS_DE_PARTICIPAR, SORTEIO_INVALIDO, regraDoNumeroSemDono } from "./sorteio";
import { clausulaDaAntecipacao, cotasMinimasParaSortear } from "./campanhaLegal";
import { clausulaDoMetodo, numeracaoZero, totalDaApuracao } from "./apuracao";
import { CLAUSULA_VALE_BRINDE } from "./premiadas";
import { LOTERIAS, loteriaValida, resultadoDaLoteria } from "./sorteiosOficiais";

const DIAS_DA_FEDERAL_TEXTO = "quartas e sábados, às 19h de Brasília";

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
    /** "Quando completar": a data máxima registrada (8.7); `drawAt` pode ser a antecipada. */
    drawAtMaximo?: string | Date | null;
    authorizationCode: string | null;
    drawSeedHash: string | null;
    /**
     * O método de apuração (`shared/apuracao.ts`): a leitura direta da
     * Federal (numeração a partir de zero, cláusula do advogado) ou o globo.
     * Ausente ou nulo é a rifa de antes, apurada pela semente.
     */
    metodoApuracao?: string | null;
    regulamentoExtra: string | null;
    /** Aceita cotas de bônus do programa de indicação (etapa 13). */
    aceitaCotaBonus?: boolean;
    bonusMaxCotas?: number;
    /** Mínimo de cotas vendidas (%) para o sorteio acontecer; 0 ou ausente = sem mínimo. */
    minimoVendidoPct?: number;
    /** Como a rifa chega ao sorteio (`MODOS_DO_SORTEIO`); ausente = na data marcada. */
    modoSorteio?: string;
    /**
     * Integrada a um sorteio oficial da plataforma: a loteria e o concurso
     * cujo resultado decide a rifa. Ausente = Loteria Federal da data.
     */
    sorteioOficial?: { loteria: string; concurso: number } | null;
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

/** Agrupa "Fone bluetooth" repetido em "3 × Fone bluetooth". */
function agrupar(premios: string[]): string[] {
  const conta = new Map<string, number>();
  for (const p of premios) conta.set(p, (conta.get(p) ?? 0) + 1);
  return [...conta].map(([p, n]) => (n > 1 ? `${n} × ${p}` : p));
}

export function montarRegulamento(d: DadosDoRegulamento): Secao[] {
  const { rifa, promotora } = d;
  const zero = numeracaoZero(rifa.metodoApuracao);
  const primeira = formatQuota(1, rifa.totalQuotas, zero);
  const ultima = formatQuota(rifa.totalQuotas, rifa.totalQuotas, zero);
  // Como o número sai do resultado: a cláusula da leitura direta, a do globo, ou a semente (rifa de antes).
  const comoSai =
    (rifa.metodoApuracao === "federal_direta" || rifa.metodoApuracao === "globo") && totalDaApuracao(rifa.totalQuotas)
      ? [
          clausulaDoMetodo(rifa.metodoApuracao, rifa.totalQuotas),
          ...(rifa.metodoApuracao === "globo" ? ["A ata notarial e o vídeo da sessão ficam na página do sorteio da rifa."] : []),
        ]
      : null;
  const quando = dataHora(rifa.drawAt);
  // "Quando completar": a data máxima (a registrada) e, se a rifa encheu antes, a antecipada.
  const maxima = rifa.modoSorteio === "quando_completar" ? dataHora(rifa.drawAtMaximo ?? rifa.drawAt) : null;
  const antecipado =
    maxima && rifa.drawAtMaximo && rifa.drawAt && new Date(rifa.drawAt).getTime() < new Date(rifa.drawAtMaximo).getTime();
  const oficial = rifa.sorteioOficial && loteriaValida(rifa.sorteioOficial.loteria) ? rifa.sorteioOficial.loteria : null;

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
              // Resposta 8.8: cota premiada é vale-brinde — com o sorteio, promoção mista.
              ...(rifa.metodoApuracao ? [CLAUSULA_VALE_BRINDE] : []),
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
        "Só vale bilhete pago pela plataforma. Pagamento feito por fora (Pix ou transferência direto à promotora ou a terceiros) não gera cota nem participa do sorteio, e pedir pagamento por fora leva ao banimento da promotora.",
        ...(rifa.aceitaCotaBonus ? [clausulaDoBonus(rifa.bonusMaxCotas ?? 0)] : []),
        // 9.4: na rifa autorizada a promotora não fica com as cotas e não concorre.
        ...(rifa.metodoApuracao ? [IMPEDIDOS_DE_PARTICIPAR] : []),
      ],
    },
    {
      titulo: "5. Apuração",
      itens: [
        rifa.modoSorteio === "quando_completar" && !quando
          ? `O sorteio não tem data marcada: acontece na primeira extração da Loteria Federal (${DIAS_DA_FEDERAL_TEXTO}) pelo menos 24 horas depois de a última cota ser paga, com os 5 prêmios dessa extração. A data é informada na página da rifa e avisada a quem comprou.`
          : maxima
            ? `${clausulaDaAntecipacao(maxima)} As extrações da Loteria Federal são às ${DIAS_DA_FEDERAL_TEXTO}.${
                antecipado ? ` A rifa completou: o sorteio foi antecipado para ${quando}, com os 5 prêmios dessa extração.` : ""
              }`
          : quando && oficial === "globo"
            ? `O sorteio acontece em ${quando}, na sessão nº ${rifa.sorteioOficial!.concurso} do ${LOTERIAS.globo.nome.toLowerCase()}, transmitida ao vivo. Lançado o resultado da sessão, a rifa é sorteada na hora.`
          : quando && oficial
            ? `O sorteio acontece em ${quando}, no sorteio oficial da plataforma: ${LOTERIAS[oficial].nome}, concurso ${rifa.sorteioOficial!.concurso}, com ${resultadoDaLoteria(oficial)} nesse concurso. Lançado o resultado oficial, a rifa é sorteada na hora.`
            : quando
              ? `O sorteio acontece em ${quando}, com os 5 prêmios da extração da Loteria Federal dessa data.`
              : "A data do sorteio é informada antes da publicação.",
        ...(comoSai ?? [
          `O número vencedor é calculado a partir de ${oficial ? resultadoDaLoteria(oficial) : "os 5 prêmios da Loteria Federal"} e de uma semente secreta, cujo resumo (hash SHA-256) foi publicado antes da primeira venda. Depois do sorteio a semente é publicada, e qualquer pessoa pode refazer a conta na página da rifa.`,
          ...(rifa.drawSeedHash ? [`Resumo da semente publicado: ${rifa.drawSeedHash}.`] : []),
        ]),
        ...(rifa.modoSorteio === "quando_completar"
          ? [
              "O sorteio só é realizado com todas as cotas vendidas e pagas (rifa cheia). Se a rifa não completar até a data máxima, o sorteio é adiado para nova data, informada na página da rifa e avisada a quem comprou.",
            ]
          : rifa.modoSorteio === "cheia_com_data"
            ? [
                "O sorteio só é realizado com todas as cotas vendidas e pagas (rifa cheia). Se a rifa não completar até a data, o sorteio é adiado para nova data, informada na página da rifa e avisada a quem comprou.",
              ]
            : rifa.minimoVendidoPct && rifa.minimoVendidoPct > 0
              ? [
                  `O sorteio só é realizado com pelo menos ${rifa.minimoVendidoPct}% das cotas vendidas e pagas (${groupNumber(
                    cotasMinimasParaSortear(rifa.totalQuotas, rifa.minimoVendidoPct),
                  )} cotas). Se o mínimo não for atingido até a data, o sorteio é adiado para nova data, informada na página da rifa e avisada a quem comprou.`,
                ]
              : []),
        // Item 9 do advogado: ressorteio no globo, busca alternada e circular na Federal.
        regraDoNumeroSemDono(rifa.metodoApuracao, rifa.modoSorteio),
        ...(rifa.metodoApuracao === "globo"
          ? [`Cada extração que não valer é registrada como "${SORTEIO_INVALIDO}", com o número e a hora de cada bola, na ata e na página do sorteio da rifa.`]
          : []),
      ],
    },
    {
      titulo: "6. Entrega do prêmio",
      itens: [
        `O ganhador é avisado pelo WhatsApp do cadastro e recebe o prêmio da promotora em até ${PRAZO_ENTREGA_DIAS} dias após o sorteio, sem nenhum custo.`,
        `O direito ao prêmio prescreve em ${PRESCRICAO_DIAS} dias contados da data da apuração; o prêmio não reclamado nesse prazo tem o valor recolhido ao Tesouro Nacional, nos termos da Lei nº 5.768/1971 e do Decreto nº 70.951/1972.`,
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
