import type pg from "pg";
import { publicarAgendadas } from "../services/publicacaoAgendada";
import { and, eq, sql, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { commissions, orders, buyers, campaigns, carrinhoPedidos } from "@shared/schema";
import { notify } from "../notifications";
import { publicUrl } from "../services/urls";
import { purgarGuardaDoAntifraude, purgeRateEvents } from "../services/antifraude";
import { cifrarSegredosDoSegundoFator } from "../services/segundoFator";
import { preencherCodigosDeCliente } from "../services/codigoCliente";
import { separarCidadesAntigas } from "../services/orgs";
import { avisarSorteiosChegando } from "../services/push";
import { completarRegioesPendentes } from "../services/contaComprador";
import { apagarStoriesVencidos } from "../services/vitrine";
import { apagarNotificacoesAntigas } from "../services/notificacoes";
import { encerrarAnunciosForaDoAr } from "../services/patrocinio";
import { encerrarBannersPagos } from "../services/bannerPago";
import { vencerFranquias } from "../services/iaCobranca";
import { destravarAcoesPresas } from "../services/ia";
import { assinarVideosDoStream, limparStreamPendente } from "../services/streamPendentes";
import { posterDosVideosAntigos } from "../services/posterRetroativo";
import { enviarEventosPendentes } from "../services/marketing";
import { migrarAfiliadosAntigos } from "../services/afiliados";
import { lancarMensalidades } from "../services/billing";
import { releaseExpired } from "../services/quotas";
import { sortearRifasPendentesDosSorteiosOficiais } from "../services/sortear";
import { paymentProviderByName } from "../payments";
import { log } from "../vite";
import { poolDasTravas } from "../db";
import { LocalDiskStorage, storage } from "../services/storage";
import { apagarDocumentosDeVerificacaoAntigos, tirarSelosSemConsentimentoRenovado } from "../services/verificacao";

/**
 * Trava de aplicação no Postgres: com duas réplicas, os dois processos
 * acordam no mesmo minuto e o mesmo job roda duas vezes. A trava é do banco,
 * então não importa quantos processos existam — só um passa.
 *
 * A conexão da trava vem de `poolDasTravas`, nunca do `pool` comum: ela fica
 * presa enquanto `fn` usa o comum, e dividir o mesmo pool travava o servidor
 * inteiro quando muitos relógios disparavam juntos (`npm run relogios`).
 */
export async function withLock(key: number, fn: () => Promise<void>, travas: pg.Pool = poolDasTravas) {
  const client = await travas.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    if (!rows[0]?.locked) return;
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

const LOCK_EXPIRACAO = 811_001;
const LOCK_COMISSAO = 811_002;
const LOCK_LEMBRETE = 811_003;
const LOCK_LIMPEZA = 811_004;
const LOCK_STORIES = 811_010;
const LOCK_AFILIADOS = 811_011;
const LOCK_NOTIFICACOES = 811_012;
const LOCK_MENSALIDADE = 811_005;
const LOCK_CODIGOS = 811_006;
const LOCK_CIDADES = 811_007;
const LOCK_PUSH_SORTEIO = 811_008;
const LOCK_REGIOES = 811_009;
const LOCK_ANUNCIOS = 811_403;
const LOCK_BANNERS = 811_404;
const LOCK_MARKETING = 811_501;
const LOCK_COPIA = 811_013;
const LOCK_IA_FRANQUIA = 811_701;
const LOCK_STREAM = 811_014;
const LOCK_SEGUNDO_FATOR = 811_015;
const LOCK_SORTEIO_OFICIAL = 811_016;
const LOCK_POSTER_ANTIGO = 811_017;
const LOCK_PUBLICACAO_AGENDADA = 811_018;
const LOCK_CONSENTIMENTO = 811_019;
const LOCK_DOCUMENTOS_VERIFICACAO = 811_020;

/** Quantos minutos antes de a reserva cair o lembrete é enviado. */
const LEMBRETE_MINUTOS = Number(process.env.REMINDER_MINUTES_BEFORE ?? 5);

/**
 * Carrinho abandonado: quem reservou e não pagou recebe um empurrão antes
 * de perder os números. A chave de deduplicação garante um lembrete por
 * pedido, não um por minuto.
 */
async function lembrarReservasVencendo() {
  const now = new Date();
  const limite = new Date(now.getTime() + LEMBRETE_MINUTOS * 60_000);

  const pendentes = await db
    .select({
      order: orders,
      buyer: buyers,
      campaignTitle: campaigns.title,
      carrinhoCodigo: carrinhoPedidos.codigo,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .leftJoin(carrinhoPedidos, eq(carrinhoPedidos.id, orders.carrinhoId))
    .where(
      and(
        eq(orders.status, "pending"),
        gt(orders.expiresAt, now),
        lt(orders.expiresAt, limite),
      ),
    )
    .limit(200);

  let enviados = 0;
  // O carrinho num Pix só recebe um lembrete, não um por rifa.
  const carrinhos = new Set<string>();
  for (const row of pendentes) {
    const carrinhoId = row.order.carrinhoId;
    if (carrinhoId) {
      if (carrinhos.has(carrinhoId)) continue;
      carrinhos.add(carrinhoId);
    }
    const restam = Math.max(
      1,
      Math.round((row.order.expiresAt!.getTime() - now.getTime()) / 60_000),
    );
    const ok = await notify({
      to: row.buyer.phone,
      template: "reserva_expirando",
      params: {
        nome: row.buyer.name.split(" ")[0],
        rifa: carrinhoId ? "o seu carrinho" : row.campaignTitle,
        minutos: String(restam),
        link: publicUrl(carrinhoId ? `/carrinho/pix/${row.carrinhoCodigo}` : `/pedido/${row.order.code}`),
      },
      dedupeKey: carrinhoId ? `carrinho:${carrinhoId}:reserva_expirando` : `order:${row.order.id}:reserva_expirando`,
    });
    if (ok) enviados++;
  }
  return enviados;
}

/**
 * Cobrança de reserva vencida precisa deixar de valer no provedor: o Pix do
 * Asaas vale até o fim do dia, e pagar uma reserva já devolvida ao estoque
 * seria dinheiro sem cota. Melhor esforço — falha aqui não trava o relógio;
 * se o pagamento ainda assim chegar, o webhook recusa o pedido expirado e o
 * caso aparece no log para devolução.
 */
async function cancelarCobrancas(cobrancas: { provider: string; chargeId: string }[]) {
  for (const c of cobrancas) {
    try {
      const provider = paymentProviderByName(c.provider);
      await provider.cancelCharge?.(c.chargeId);
    } catch (err) {
      console.error(`[jobs] não cancelou a cobrança ${c.chargeId} (${c.provider}):`, (err as Error).message);
    }
  }
}

/**
 * Dois relógios. A expiração de reserva é o que devolve número ao estoque —
 * sem ela, cota reservada e não paga some da rifa.
 */
export function startJobs() {
  const expiryMs = 60_000;
  const releaseMs = 15 * 60_000;

  setInterval(async () => {
    try {
      await withLock(LOCK_EXPIRACAO, async () => {
        const { liberadas, cobrancas } = await releaseExpired();
        if (liberadas > 0) log(`${liberadas} cota(s) voltaram ao estoque`, "jobs");
        await cancelarCobrancas(cobrancas);
      });
    } catch (err) {
      console.error("[jobs] expiração de reservas:", err);
    }
  }, expiryMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_LEMBRETE, async () => {
        const enviados = await lembrarReservasVencendo();
        if (enviados > 0) log(`${enviados} lembrete(s) de reserva enviados`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] lembrete de reserva:", err);
    }
  }, expiryMs).unref();

  // ID do cliente de quem comprou antes de o ID existir: o painel do
  // organizador mostra cliente da plataforma só por ele. Lotes pequenos até
  // zerar; depois cada rodada não encontra ninguém.
  setInterval(async () => {
    try {
      await withLock(LOCK_CODIGOS, async () => {
        const n = await preencherCodigosDeCliente();
        if (n > 0) log(`${n} ID(s) de cliente gerados`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] IDs de cliente:", err);
    }
  }, releaseMs).unref();

  // Contas criadas com o serviço de CEP fora do ar: completa cidade e UF.
  setInterval(async () => {
    try {
      await withLock(LOCK_REGIOES, async () => {
        const n = await completarRegioesPendentes();
        if (n > 0) log(`${n} conta(s) com cidade completada pelo CEP`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] região pelo CEP:", err);
    }
  }, releaseMs).unref();

  // Sorteio chegando: 24 h e 1 h antes, uma vez por pessoa (a chave do
  // aviso leva a janela). A trava garante uma réplica só.
  setInterval(async () => {
    try {
      await withLock(LOCK_PUSH_SORTEIO, async () => {
        const n = await avisarSorteiosChegando();
        if (n > 0) log(`${n} aviso(s) de sorteio chegando`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] aviso de sorteio:", err);
    }
  }, expiryMs).unref();

  // Cadastro antigo com "Cidade/UF" num campo só: separa uma vez, para a
  // vitrine ordenar por estado sem esperar o organizador preencher tudo.
  setTimeout(async () => {
    try {
      await withLock(LOCK_CIDADES, async () => {
        const n = await separarCidadesAntigas();
        if (n > 0) log(`${n} organização(ões) com cidade e UF separadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] cidades antigas:", err);
    }
  }, 5_000).unref();

  // Cópia de segurança da mídia: o que já estava no disco quando a cópia foi
  // ligada sobe uma vez, ao subir o servidor (o que chega depois sobe na hora).
  setTimeout(async () => {
    try {
      const store = storage();
      if (!(store instanceof LocalDiskStorage) || !store.temCopia) return;
      await withLock(LOCK_COPIA, async () => {
        const n = await store.sincronizarCopia();
        if (n > 0) log(`${n} arquivo(s) de mídia copiados para o backup`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] cópia de segurança da mídia:", err);
    }
  }, 30_000).unref();

  // Segredo do segundo fator guardado em claro antes do cofre: sela uma vez,
  // ao subir o servidor (o novo já nasce selado).
  setTimeout(async () => {
    try {
      await withLock(LOCK_SEGUNDO_FATOR, async () => {
        const n = await cifrarSegredosDoSegundoFator();
        if (n > 0) log(`${n} segredo(s) do segundo fator selado(s) no cofre`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] segredos do segundo fator:", err);
    }
  }, 4_000).unref();

  // Afiliado de antes dos vínculos (organização no usuário): cria o vínculo,
  // e a organização dos cupons e saques antigos. Idempotente.
  const migrarAfiliados = async () => {
    try {
      await withLock(LOCK_AFILIADOS, async () => {
        const n = await migrarAfiliadosAntigos();
        if (n > 0) log(`${n} afiliado(s) antigo(s) com vínculo criado`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] vínculos de afiliados antigos:", err);
    }
  };
  setTimeout(migrarAfiliados, 3_000).unref();
  setInterval(migrarAfiliados, releaseMs).unref();

  // Consentimento biométrico de versão antiga (resposta 7.3): passado o prazo, o selo sai.
  setInterval(async () => {
    try {
      await withLock(LOCK_CONSENTIMENTO, async () => {
        const n = await tirarSelosSemConsentimentoRenovado();
        if (n > 0) log(`${n} selo(s) tirado(s): consentimento biométrico não renovado`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] consentimento não renovado:", err);
    }
  }, releaseMs).unref();

  // Documentos da verificação: saem 90 dias depois da decisão (resposta 7.1). O selo fica.
  setInterval(async () => {
    try {
      await withLock(LOCK_DOCUMENTOS_VERIFICACAO, async () => {
        const n = await apagarDocumentosDeVerificacaoAntigos();
        if (n > 0) log(`documentos de ${n} verificação(ões) apagados (guarda vencida)`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] documentos da verificação:", err);
    }
  }, releaseMs).unref();

  // Stories vencidos (24 h): a rota já não serve, e o relógio tira do banco.
  setInterval(async () => {
    try {
      await withLock(LOCK_STORIES, async () => {
        const n = await apagarStoriesVencidos();
        if (n > 0) log(`${n} story(ies) vencido(s) apagado(s)`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] stories vencidos:", err);
    }
  }, releaseMs).unref();

  // Central de avisos: o que passou de 90 dias sai (a tabela não cresce sem fim).
  setInterval(async () => {
    try {
      await withLock(LOCK_NOTIFICACOES, async () => {
        const n = await apagarNotificacoesAntigas();
        if (n > 0) log(`${n} aviso(s) antigo(s) apagado(s) da central`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] central de avisos:", err);
    }
  }, 60 * 60_000).unref();

  // Rifa com publicação agendada: na hora, a mesma publicação da mão (confere
  // tudo de novo). Cada rifa é tomada num UPDATE condicional: duas réplicas,
  // uma publicação.
  setInterval(async () => {
    try {
      await withLock(LOCK_PUBLICACAO_AGENDADA, async () => {
        const r = await publicarAgendadas();
        if (r.publicadas || r.falharam) log(`publicação agendada: ${r.publicadas} no ar, ${r.falharam} sem publicar`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] publicação agendada:", err);
    }
  }, 60_000).unref();

  // Rifa integrada a um sorteio oficial com resultado que ainda não sorteou
  // (reserva esperando Pix, mínimo, processo que caiu no meio): tenta de novo.
  // Cada sorteio trava a própria linha: duas réplicas, um sorteio.
  setInterval(async () => {
    try {
      await withLock(LOCK_SORTEIO_OFICIAL, async () => {
        const r = await sortearRifasPendentesDosSorteiosOficiais();
        if (r.sorteadas > 0) log(`${r.sorteadas} rifa(s) sorteada(s) pelo resultado oficial`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] sorteio das rifas dos sorteios oficiais:", err);
    }
  }, 5 * 60_000).unref();

  // Anúncio patrocinado de rifa que saiu do ar: encerra e devolve ao saldo
  // o que não foi gasto (condicional: duas réplicas, um reembolso).
  setInterval(async () => {
    try {
      await withLock(LOCK_ANUNCIOS, async () => {
        const n = await encerrarAnunciosForaDoAr();
        if (n > 0) log(`${n} anúncio(s) patrocinado(s) encerrado(s); a sobra voltou ao saldo`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] anúncios de rifa fora do ar:", err);
    }
  }, releaseMs).unref();

  // Banner pago: encerra o vencido e o da rifa que saiu do ar (devolve os dias
  // não usados) e preenche as vagas.
  setInterval(async () => {
    try {
      await withLock(LOCK_BANNERS, async () => {
        const r = await encerrarBannersPagos();
        if (r.venceram + r.devolvidos + r.promovidos > 0) {
          log(`banners pagos: ${r.venceram} venceram, ${r.devolvidos} devolvidos ao saldo, ${r.promovidos} entraram no ar`, "jobs");
        }
      });
    } catch (err) {
      console.error("[jobs] banners pagos:", err);
    }
  }, releaseMs).unref();

  // Assistente de IA: a franquia de ciclo vencido sai pelo livro (uma vez por ciclo).
  setInterval(async () => {
    try {
      await withLock(LOCK_IA_FRANQUIA, async () => {
        const n = await vencerFranquias();
        if (n > 0) log(`${n} franquia(s) do assistente vencida(s)`, "jobs");
        const presas = await destravarAcoesPresas();
        if (presas > 0) log(`${presas} ação(ões) do assistente interrompida(s)`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] franquia do assistente:", err);
    }
  }, releaseMs).unref();

  // Pôster dos vídeos de antes do pôster (ou cujo pôster falhou no envio):
  // poucos por volta, cada um uma vez por processo.
  setInterval(async () => {
    try {
      await withLock(LOCK_POSTER_ANTIGO, async () => {
        const r = await posterDosVideosAntigos();
        if (r.gerados + r.semPoster > 0) log(`Pôster retroativo: ${r.gerados} gerado(s), ${r.semPoster} sem pôster`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] pôster retroativo:", err);
    }
  }, releaseMs).unref();

  // Vídeo esquecido no Cloudflare Stream (processo que caiu no meio, DELETE
  // que falhou): o que passou da folga sem dono é apagado lá.
  setInterval(async () => {
    try {
      await withLock(LOCK_STREAM, async () => {
        try {
          const r = await limparStreamPendente();
          if (r.apagados + r.falhas > 0) log(`Stream: ${r.apagados} vídeo(s) sem dono apagado(s), ${r.falhas} para tentar de novo`, "jobs");
        } catch (err) {
          console.error("[jobs] vídeos do Stream:", err);
        }
        // URL assinada ligada depois: os vídeos de antes passam a pedir token.
        // `try` próprio: a limpeza que falha não segura a marca, nem o contrário.
        try {
          const a = await assinarVideosDoStream();
          if (a.assinados + a.falhas > 0) log(`Stream: ${a.assinados} vídeo(s) passaram a pedir URL assinada, ${a.falhas} para tentar de novo`, "jobs");
        } catch (err) {
          console.error("[jobs] URL assinada do Stream:", err);
        }
      });
    } catch (err) {
      console.error("[jobs] vídeos do Stream:", err);
    }
  }, releaseMs).unref();

  // Compra para as plataformas de anúncio (etapa 16): a cada minuto, só uma
  // réplica. Falha de envio fica na fila com espera crescente; nunca toca o
  // pagamento, que já aconteceu.
  setInterval(async () => {
    try {
      await withLock(LOCK_MARKETING, async () => {
        const n = await enviarEventosPendentes();
        if (n > 0) log(`${n} compra(s) enviada(s) às plataformas de anúncio`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] eventos de marketing:", err);
    }
  }, 60_000).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_LIMPEZA, async () => {
        const apagados = await purgeRateEvents();
        if (apagados > 0) log(`${apagados} registro(s) de ritmo limpos`, "jobs");
        const guarda = await purgarGuardaDoAntifraude();
        if (guarda.recusas + guarda.bloqueios > 0) {
          log(`${guarda.recusas} recusa(s) e ${guarda.bloqueios} bloqueio(s) vencido(s) saíram da guarda do antifraude`, "jobs");
        }
      });
    } catch (err) {
      console.error("[jobs] limpeza do antifraude:", err);
    }
  }, releaseMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_COMISSAO, async () => {
        const rows = await db
          .update(commissions)
          .set({ status: "available" })
          .where(
            and(eq(commissions.status, "pending"), sql`${commissions.availableAt} <= now()`),
          )
          .returning({ id: commissions.id });
        if (rows.length > 0) log(`${rows.length} comissão(ões) liberadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] liberação de comissões:", err);
    }
  }, releaseMs).unref();

  // Mensalidade: lança a competência do mês anterior para quem está nesse
  // contrato. É idempotente pelo índice (organização, competência), então
  // rodar junto com os outros relógios não cobra duas vezes — e não precisa
  // de um agendador de mês, que seria mais uma peça para dar errado.
  setInterval(async () => {
    try {
      await withLock(LOCK_MENSALIDADE, async () => {
        const lancadas = await lancarMensalidades();
        if (lancadas > 0) log(`${lancadas} mensalidade(s) lançadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] mensalidades:", err);
    }
  }, releaseMs).unref();
}
