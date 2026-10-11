import { SociosDaOrganizacaoCard } from "@/components/SociosDaOrganizacaoCard";
import { LegendaCard } from "@/components/Publicacao";
import { problemaNoPremio } from "@shared/premio";
import { AbrirEditorDeImagem, ArtesParaDivulgar } from "@/components/ArtesParaDivulgar";
import { BannerDivulgacaoCard } from "@/components/BannerDivulgacaoCard";
import { DivulgacoesDaOrganizacao } from "@/components/DivulgacoesDaOrganizacao";
import { SeloVerificado } from "@/components/SeloVerificado";
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrocarSenha } from "@/components/TrocarSenha";
import { WhatsAppCard } from "@/components/WhatsAppCard";
import { PagamentosCard } from "@/components/PagamentosCard";
import { ComissaoCard } from "@/components/ComissaoCard";
import { ReembolsoCard } from "@/components/ReembolsoCard";
import { PanelShell } from "@/components/AppShell";
import { Card, Money, Pill, Button, Empty, Progress } from "@/components/bits";
import { AlternarVisao, BarrasHorizontais, CabecalhoDaTabela, CartaoDoPainel, Estatistica, Sparkline, TabelaOuCartoes, VerMais, Abas } from "@/components/painel";
import { useListaPaginada } from "@/lib/paginada";
import { ChevronRight, Image as ImagemIcone, LayoutGrid, List, MoreVertical, Percent, Ticket } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { PixTardios } from "@/components/PixTardios";
import { ReelsDaRifa } from "@/components/ReelsDaRifa";
import { MediaManager } from "@/components/MediaManager";
import { CampaignExtras } from "@/components/CampaignExtras";
import { DadosLegaisCard, TransmissaoCard } from "@/components/DadosLegaisCard";
import { AgendarPublicacaoCard } from "@/components/AgendarPublicacaoCard";
import { EnderecoForm, type EnderecoParcial } from "@/components/EnderecoForm";
import { PerfilPublicoForm } from "@/components/PerfilPublicoForm";
import { EnderecoCurto } from "@/components/LinksCurtos";
import { AdiarSorteioCard, EditarRifaCard, type RifaEditavel } from "@/components/EditarRifa";
import { CobrancaDaRifaCard } from "@/components/CobrancaDaRifa";
import { TelefoneDoOrganizadorCard } from "@/components/Seguranca";
import { ContratoPromotoraCard } from "@/components/ContratoPromotoraCard";
import { VerificacaoCard } from "@/components/Verificacao";
import { CoresDoSeloCard } from "@/components/CoresDoSelo";
import { Campo } from "@/components/bits";
import { CheckCircle2 } from "lucide-react";
import { regraDoNumeroSemDono } from "@shared/sorteio";
import { senhaInvalida } from "@shared/senha";
import { podeExcluir } from "@shared/solicitacoes";
import type { CorDeDestaque, LinkDoPerfil } from "@shared/perfil";
import type { Endereco } from "@shared/endereco";
import { formatBRL, groupNumber, formatQuota, maskPhone, quotaDigits } from "@shared/format";
import { numeracaoZero, TOTAIS_DA_APURACAO } from "@shared/apuracao";
import {
  PAYMENT_METHODS,
  type PaymentMethodKey,
  type PaymentMethodSettings,
} from "@shared/payments";

// O link com a forma do botão do kit e o nome da loteria do próximo sorteio (Painel).
// Nome local em minúsculas: é um valor (as classes dos tons), não uma peça de tela — a matriz da reformulação conta como cartão todo nome maiúsculo importado de `@/components`.
import { TONS_DO_BOTAO as tonsDoBotao } from "@/components/bits";
import { BarChart3, ExternalLink } from "lucide-react";
import { loteriaDoMetodo } from "@shared/apuracao";
import { LOTERIAS } from "@shared/sorteiosOficiais";
import { useLocation } from "wouter";

/* ------------------------------- painel ------------------------------- */

/**
 * Link que se parece com o botão do kit (mesma forma e os mesmos tons): ir a
 * outra tela é link, não botão. O kit ainda não tem a peça; a forma é a do
 * `Button` de `bits.tsx` e o tom vem de `TONS_DO_BOTAO`.
 */
const FORMA_DO_BOTAO = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition";

interface AdminOverview {
  revenueCents: number;
  soldCount: number;
  reservedCount: number;
  publishedCampaigns: number;
  publishedQuotas: number;
  commissionToPayCents: number;
  commissionAffiliates: number;
  daily: { day: string; cents: number; cotas: number }[];
  topAffiliates: { code: string; name: string; cents: number }[];
  proximoSorteio?: { slug: string; prizeTitle: string; drawAt: string; totalQuotas: number; soldCount: number; priceCents?: number; capa?: string | null } | null;
  hoje?: { cents: number; cotas: number };
  mesCents?: number;
  canais?: { site: { vendas: number; cents: number }; cambista: { vendas: number; cents: number } };
  porEstado?: { uf: string; cents: number; pedidos: number }[];
  pendencias?: { chamadosAbertos: number; rascunhosSemAutorizacao: number; pedidosEsperandoPix: number; telefonePendente: boolean };
  ultimasVendas?: { code: number; prizeTitle: string; quantity: number; amountCents: number; paidAt: string; cambista: boolean }[];
}

const quandoFoi = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

/** Os últimos N dias (fuso de São Paulo), com zero onde não houve venda. */
function serie(daily: { day: string; cents: number; cotas: number }[], dias: number, campo: "cents" | "cotas"): { dia: string; valor: number }[] {
  const por = new Map(daily.map((d) => [d.day.slice(0, 10), d[campo]]));
  const out: { dia: string; valor: number }[] = [];
  const hoje = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 86_400_000);
    const chave = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    out.push({ dia: chave, valor: por.get(chave) ?? 0 });
  }
  return out;
}

const DIAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function AdminPainel() {
  const { data } = useQuery<AdminOverview>({ queryKey: ["/api/admin/overview"] });
  const { data: rifas } = useQuery<CampaignRow[]>({ queryKey: ["/api/admin/campaigns"] });
  const { data: sessao } = useSession();

  const p = data?.pendencias;
  const afazer = p
    ? [
        p.telefonePendente ? { texto: "Confirmar o telefone da organização", apoio: "exigido para publicar", href: "/admin/configuracoes", tom: "yellow" as const } : null,
        p.chamadosAbertos ? { texto: "Reembolsos esperando resposta", apoio: `${p.chamadosAbertos} chamado(s)`, href: "/admin/atendimento", tom: "red" as const } : null,
        p.rascunhosSemAutorizacao
          ? { texto: "Rascunhos sem autorização SPA/MF", apoio: `${p.rascunhosSemAutorizacao} rifa(s)`, href: "/admin/campanhas", tom: "yellow" as const }
          : null,
        p.pedidosEsperandoPix ? { texto: "Pedidos esperando o Pix", apoio: `${p.pedidosEsperandoPix} pedido(s)`, href: "/admin/pedidos", tom: "yellow" as const } : null,
      ].filter((x): x is { texto: string; apoio: string; href: string; tom: "yellow" | "red" } => Boolean(x))
    : [];
  const prox = data?.proximoSorteio;
  // Quem apura o próximo sorteio, pelo método da rifa (a rifa de antes, sem método, não diz).
  const metodoDoProximo = prox ? rifas?.find((r) => r.campaign.slug === prox.slug)?.campaign.metodoApuracao : null;
  const loteriaDoProximo = metodoDoProximo ? LOTERIAS[loteriaDoMetodo(metodoDoProximo)].nome : null;
  const faltam = prox ? Math.max(0, Math.ceil((new Date(prox.drawAt).getTime() - Date.now()) / 86_400_000)) : 0;
  const TOM_DA_PENDENCIA = { yellow: "bg-yellow-soft text-yellow-deep", red: "bg-red-soft text-red" };

  const sete = data ? serie(data.daily, 7, "cents") : [];
  const seteCotas = data ? serie(data.daily, 7, "cotas") : [];
  const trinta = data ? serie(data.daily, 30, "cents") : [];
  // Vendas por dia da semana, nos últimos 30 dias.
  const porDiaDaSemana = DIAS_DA_SEMANA.map((_, i) => trinta.filter((d) => new Date(`${d.dia}T12:00:00`).getDay() === i).reduce((s, d) => s + d.valor, 0));
  const melhorDia = porDiaDaSemana.indexOf(Math.max(...porDiaDaSemana));
  const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const canais = data?.canais;
  const totalCanais = (canais?.site.vendas ?? 0) + (canais?.cambista.vendas ?? 0);
  const pctSite = totalCanais ? Math.round(((canais?.site.vendas ?? 0) / totalCanais) * 100) : 0;
  const noAr = (rifas ?? [])
    .filter((r) => r.campaign.status === "published" && !r.campaign.demonstracao)
    .sort((a, b) => (b.stats?.soldCount ?? 0) / b.campaign.totalQuotas - (a.stats?.soldCount ?? 0) / a.campaign.totalQuotas)
    .slice(0, 5);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (sessao?.user?.name ?? "").split(" ")[0];

  return (
    <PanelShell title="Painel">
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : (
        // Os widgets dos painéis prontos do kit (eCommerce e Analytics),
        // cada um ligado a um dado nosso. Grade de 4 colunas no computador.
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Boas-vindas: o resumo do dia. */}
          <section aria-label="Resumo de hoje" className="cartao flex items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 md:col-span-2">
            <div className="min-w-0">
              <h2 className="text-lg font-medium">
                {saudacao}{primeiroNome ? `, ${primeiroNome}` : ""}! <span aria-hidden>🍀</span>
              </h2>
              <p className="mt-1 text-sm text-muted">
                Hoje entraram <span className="tnum font-medium text-green-deep">{formatBRL(data.hoje?.cents ?? 0)}</span> em{" "}
                <span className="tnum">{groupNumber(data.hoje?.cotas ?? 0)}</span> cotas pagas.
              </p>
              <Link href="/admin/resultados" className={`mt-4 whitespace-nowrap ${FORMA_DO_BOTAO} ${tonsDoBotao.primario}`}>
                <BarChart3 size={16} aria-hidden />
                Ver resultados
              </Link>
            </div>
            <Sparkline pontos={sete.map((d) => d.valor)} tipo="barras" largura={140} altura={72} rotulo={`Receita dos últimos 7 dias: ${sete.map((d) => formatBRL(d.valor)).join(", ")}`} />
          </section>
          <Estatistica icone={Ticket} tom="azul" valor={groupNumber(data.hoje?.cotas ?? 0)} rotulo="Cotas vendidas hoje" dica={<><span className="tnum">{groupNumber(data.soldCount)}</span> no total · <span className="tnum">{groupNumber(data.reservedCount)}</span> reservadas</>} />
          <Estatistica icone={Percent} tom="yellow" valor={formatBRL(data.commissionToPayCents)} rotulo="Comissão a pagar" dica={<><span className="tnum">{data.commissionAffiliates}</span> afiliado(s)</>} href="/admin/financeiro" />

          {/* O próximo sorteio em destaque (o cartão colorido do kit), com a capa. */}
          {/* Azul: é espera (o sorteio que vem), não dinheiro. O texto é branco sobre o azul cheio nos dois temas (`--yellow`/`--on-yellow` são o azul de hoje). */}
          <section aria-label="Próximo sorteio" className="cartao relative flex min-h-[200px] overflow-hidden rounded-xl border border-line bg-yellow text-on-yellow md:col-span-2">
            {prox?.capa ? (
              <img src={prox.capa} alt="" className="absolute inset-y-0 right-0 w-1/2 object-cover opacity-60 [mask-image:linear-gradient(to_right,transparent,black_40%)]" />
            ) : null}
            <div className="relative flex min-w-0 flex-1 flex-col justify-between p-5">
              {prox ? (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-80">Próximo sorteio · {faltam <= 1 ? "amanhã ou hoje" : `em ${faltam} dias`}</p>
                    <h2 className="mt-1 truncate text-lg font-semibold">{prox.prizeTitle}</h2>
                    <p className="tnum text-sm opacity-90">
                      {new Date(prox.drawAt).toLocaleDateString("pt-BR")}
                      {loteriaDoProximo ? ` · ${loteriaDoProximo}` : ""}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {[
                      [groupNumber(prox.soldCount), "vendidas"],
                      [groupNumber(prox.totalQuotas - prox.soldCount), "faltam"],
                      [`${Math.round((prox.soldCount / prox.totalQuotas) * 100)}%`, "do total"],
                    ].map(([n, t]) => (
                      <span key={t} className="flex items-center gap-1.5 rounded-md bg-branco/15 px-2 py-1">
                        <span className="tnum font-semibold">{n}</span> {t}
                      </span>
                    ))}
                  </div>
                  {/* O tom "branco" do kit, com o texto no azul do próprio cartão: o verde-texto clareia no escuro e sumiria no branco. */}
                  <Link href={`/r/${prox.slug}`} className={`mt-4 w-fit ${FORMA_DO_BOTAO} bg-branco text-yellow hover:brightness-95`}>
                    Ver a rifa
                  </Link>
                </>
              ) : (
                <p className="text-sm">Nenhuma rifa no ar com sorteio marcado.</p>
              )}
            </div>
          </section>
          {/* Canais: site ou cambista (o "Mobile vs Desktop" do kit). */}
          <CartaoDoPainel titulo="Canais" subtitulo="Vendas pagas, 30 dias">
            <div className="px-5 pb-5">
              <div className="flex items-end justify-between gap-4 text-sm">
                <span>
                  <span className="block text-xs text-muted">Site</span>
                  <span className="tnum text-lg font-medium">{pctSite}%</span>
                  <span className="tnum block text-xs text-muted">{groupNumber(canais?.site.vendas ?? 0)} · {formatBRL(canais?.site.cents ?? 0)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xs text-muted">Cambista</span>
                  <span className="tnum text-lg font-medium">{totalCanais ? 100 - pctSite : 0}%</span>
                  <span className="tnum block text-xs text-muted">{groupNumber(canais?.cambista.vendas ?? 0)} · {formatBRL(canais?.cambista.cents ?? 0)}</span>
                </span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-mist-2" role="img" aria-label={`Site ${pctSite}%, cambista ${totalCanais ? 100 - pctSite : 0}%`}>
                <span className="bg-green" style={{ width: `${pctSite}%` }} />
              </div>
            </div>
          </CartaoDoPainel>
          {/* Vendas do mês com a linha dos 30 dias. */}
          <CartaoDoPainel titulo="Vendas do mês" subtitulo="Receita paga neste mês">
            {/* O valor encolhe com o cartão (consulta de contêiner): com a coluna do assistente aberta, ou perto de 1024 px
                com o menu aberto, o cartão fica estreito e o valor saía cortado. Dinheiro não se corta. */}
            <div className="px-5 pb-5 [container-type:inline-size]">
              <p className="tnum whitespace-nowrap font-medium text-green-deep [font-size:clamp(1.125rem,13cqi,1.5rem)]">{formatBRL(data.mesCents ?? 0)}</p>
              <div className="mt-3">
                <Sparkline cheio pontos={trinta.map((d) => d.valor)} largura={240} altura={56} rotulo={`Receita dos últimos 30 dias, por dia: ${trinta.map((d) => formatBRL(d.valor)).join(", ")}`} />
              </div>
            </div>
          </CartaoDoPainel>

          {/* Atividade: as últimas vendas numa linha do tempo. */}
          <CartaoDoPainel titulo="Atividade" subtitulo="Últimas vendas pagas — sem nome nem telefone" className="md:col-span-2">
            {!data.ultimasVendas?.length ? (
              <Empty>Nenhuma venda paga ainda.</Empty>
            ) : (
              <ol className="mx-5 mb-3 divide-y divide-line">
                {data.ultimasVendas.map((v) => (
                  <li key={v.code} className="relative py-3 pl-5 text-sm">
                    <span aria-hidden className="absolute left-0 top-[18px] h-2 w-2 rounded-full bg-green" />
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">
                        <span className="tnum text-green-deep">#{v.code}</span> · {v.prizeTitle}
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted">{quandoFoi(v.paidAt)}</span>
                    </p>
                    <p className="tnum text-xs text-muted">
                      {v.quantity} cota(s) · <Money cents={v.amountCents} /> · {v.cambista ? "cambista" : "site"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CartaoDoPainel>
          {/* Rifas no ar: a tabela de produtos do kit, com a capa. */}
          <CartaoDoPainel titulo="Rifas no ar" subtitulo="As que mais venderam, com o progresso" className="md:col-span-2" acao={<Link href="/admin/campanhas" className="text-xs font-semibold uppercase tracking-wide text-green-deep hover:underline">Todas</Link>}>
            {noAr.length === 0 ? (
              <Empty>Nenhuma rifa no ar.</Empty>
            ) : (
              <div className="px-5 pb-3">
                {/* No celular a linha é a rifa e o progresso (o Figma, nó 32:180): o cabeçalho e a receita
                    aparecem do `sm` em diante. A data do sorteio está no cartão do próximo sorteio e na Rifas. */}
                <table className="w-full text-sm [&_thead]:hidden sm:[&_thead]:table-header-group">
                  <CabecalhoDaTabela colunas={["Rifa", "Vendidas", "Receita"]} />
                  <tbody>
                    {noAr.map(({ campaign, stats, capa }) => {
                      const pct = Math.round(((stats?.soldCount ?? 0) / campaign.totalQuotas) * 100);
                      return (
                        <tr key={campaign.id} className="border-t border-line">
                          {/* `w-full max-w-0`: a célula fica com o que sobra e o prêmio corta com
                              reticências; sem isso a tabela crescia até o título inteiro e saía do
                              cartão. Sem a coluna do sorteio, a tabela cabe no cartão em toda largura. */}
                          <td className="w-full max-w-0 py-2.5 pr-3 sm:px-4">
                            <span className="flex items-center gap-3">
                              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-mist-2">
                                {capa ? <img src={capa} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{campaign.prizeTitle}</span>
                                <span className="tnum block truncate text-xs text-muted">{formatBRL(campaign.priceCents)} a cota</span>
                              </span>
                            </span>
                          </td>
                          <td className="w-28 py-2.5 sm:px-4">
                            <Progress value={stats?.soldCount ?? 0} total={campaign.totalQuotas} />
                            <span className="tnum whitespace-nowrap text-xs text-muted">{pct}% · {groupNumber(stats?.soldCount ?? 0)}</span>
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-2.5 sm:table-cell"><Money cents={stats?.revenueCents ?? 0} className="font-medium" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CartaoDoPainel>

          {/* Vendas por estado (o "Sales by Country"), por dia da semana, o que falta e top afiliados. */}
          <CartaoDoPainel titulo="Vendas por estado" subtitulo="30 dias, pelo cadastro de quem comprou">
            <div className="px-5 pb-5">
              {!data.porEstado?.length ? (
                <p className="text-sm text-muted">Sem venda paga nos últimos 30 dias.</p>
              ) : (
                <BarrasHorizontais linhas={data.porEstado.map((e) => ({ rotulo: e.uf, valor: e.cents, texto: formatBRL(e.cents).replace("R$", "").trim() }))} />
              )}
            </div>
          </CartaoDoPainel>
          <CartaoDoPainel titulo="Dia da semana" subtitulo="Receita por dia, 30 dias">
            <div className="px-5 pb-5">
              <div className="flex h-28 items-end justify-between gap-2" role="img" aria-label={`Receita por dia da semana: ${porDiaDaSemana.map((v, i) => `${NOME_DO_DIA[i]} ${formatBRL(v)}`).join(", ")}`}>
                {porDiaDaSemana.map((v, i) => (
                  <span key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className={`w-full rounded-md ${i === melhorDia && v > 0 ? "bg-green" : "bg-green/30"}`} style={{ height: `${Math.max(6, Math.round((v / Math.max(...porDiaDaSemana, 1)) * 100))}%` }} />
                    <span className="text-[11px] text-muted" aria-hidden>{DIAS_DA_SEMANA[i]}</span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                Melhor dia: <span className="font-medium text-ink">{Math.max(...porDiaDaSemana) > 0 ? NOME_DO_DIA[melhorDia] : "—"}</span>
              </p>
            </div>
          </CartaoDoPainel>
          <CartaoDoPainel titulo="O que falta" subtitulo="Resolva antes de vender">
            {afazer.length === 0 ? (
              <p className="flex items-center gap-2 px-5 pb-5 text-sm">
                <span className="shrink-0"><Pill status="paid">em dia</Pill></span> Nada esperando por você agora.
              </p>
            ) : (
              <ul className="pb-3">
                {afazer.map((a) => (
                  <li key={a.href + a.texto}>
                    <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-mist">
                      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TOM_DA_PENDENCIA[a.tom]}`}>
                        <ChevronRight size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{a.texto}</span>
                        <span className="block text-xs text-muted">{a.apoio}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CartaoDoPainel>
          <CartaoDoPainel titulo="Top afiliados" subtitulo="Quem mais vendeu pelo link">
            {data.topAffiliates.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nenhum afiliado ainda.</p>
            ) : (
              <ul className="divide-y divide-line pb-2">
                {data.topAffiliates.map((a, i) => (
                  <li key={a.code} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${i === 0 ? "bg-yellow-soft text-yellow-deep" : "bg-mist-2 text-muted"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.name}</span>
                      <span className="tnum block text-xs text-muted">{a.code}</span>
                    </span>
                    <Money cents={a.cents} className="shrink-0 text-ink-2" />
                  </li>
                ))}
              </ul>
            )}
          </CartaoDoPainel>
        </div>
      )}
    </PanelShell>
  );
}

/* ----------------------------- campanhas ----------------------------- */

interface CampaignRow {
  campaign: RifaEditavel & {
    slug: string;
    authorizationCode: string | null;
    authorizationFileKey: string | null;
    demonstracao?: boolean;
    adiamentos?: number;
    drawAtOriginal?: string | null;
    travadaEm?: string | null;
    travadaMotivo?: string | null;
    publicarEm?: string | null;
    publicacaoAgendadaFalha?: string | null;
    publishedAt?: string | null;
    /** O método de apuração (`shared/apuracao.ts`); nulo é a rifa de antes, apurada pela semente. */
    metodoApuracao?: string | null;
    /** Como a plataforma cobra por ela, e a tabela fotografada na publicação (`shared/cobranca.ts`). */
    cobrancaModo: string;
    cobranca: import("@shared/cobranca").CobrancaDaRifa | null;
  };
  stats: { soldCount: number; reservedCount?: number; revenueCents: number } | null;
  /** Pedidos de mudança esperando a plataforma: "edicao", "adiamento". */
  emAnalise?: string[] | null;
  /** O banner (ou a primeira foto) — a capa da grade de rifas. */
  capa?: string | null;
}

const CHAVE_VISAO = "rifa.rifas.visao";
type VisaoDasRifas = "grade" | "lista";
function visaoInicial(): VisaoDasRifas {
  try {
    return localStorage.getItem(CHAVE_VISAO) === "lista" ? "lista" : "grade";
  } catch {
    return "grade";
  }
}

/** A situação da rifa em texto, para o selo da capa (nunca só a cor). */
function situacaoDaRifa(c: CampaignRow["campaign"], emAnalise?: string[] | null): { status: string; texto: string }[] {
  const selos = [{ status: c.status, texto: c.status === "published" ? "No ar" : c.status === "draft" ? "Rascunho" : c.status === "drawn" ? "Sorteada" : "Encerrada" }];
  if (c.demonstracao) selos.push({ status: "pending", texto: "Demonstração" });
  if (c.travadaEm) selos.push({ status: "expired", texto: "Travada" });
  if (c.status === "draft" && c.publicarEm) selos.push({ status: "pending", texto: "Publicação agendada" });
  if (c.status === "draft" && c.publicacaoAgendadaFalha) selos.push({ status: "expired", texto: "Agendada não publicou" });
  if (emAnalise?.includes("edicao")) selos.push({ status: "pending", texto: "Edição em análise" });
  if (emAnalise?.includes("adiamento")) selos.push({ status: "pending", texto: "Adiamento em análise" });
  return selos;
}

/**
 * Para onde levar cada bloqueio de publicação (`publishBlockers`): a aba da
 * edição que tem o cartão, ou a tela do painel. Só apresentação — o texto é o
 * do servidor; o que não reconhece fica sem link.
 */
function ondeResolver(bloqueio: string): { aba: string; ancora?: string } | { href: string; rotulo: string } | null {
  const t = bloqueio.toLowerCase();
  if (t.includes("telefone")) return { href: "/admin/configuracoes", rotulo: "Configurações" };
  if (/contrato|anexo|sócio|socio|diretor/.test(t)) return { href: "/admin/configuracoes?aba=organizacao", rotulo: "Configurações" };
  if (/notifica|falta de pagamento|em aberto/.test(t)) return { href: "/admin/cobranca", rotulo: "Cobrança" };
  if (/cota premiada/.test(t)) return { aba: "vendas", ancora: "cotas-premiadas" };
  if (/banner|foto|carrossel|vídeo|video/.test(t)) return { aba: "publicacao", ancora: "midia" };
  if (/cobran|pacote|taxa/.test(t)) return { aba: "rifa" };
  if (/autoriza|certificado|sorteio|apura|bônus|bonus|vale-brinde|data/.test(t)) return { aba: "autorizacao", ancora: "dados-legais" };
  if (/prêmio|premio/.test(t)) return { aba: "rifa" };
  return null;
}

const NOME_DA_ABA: Record<string, string> = {
  rifa: "A rifa",
  autorizacao: "Autorização e sorteio",
  publicacao: "Publicação",
  vendas: "Pacotes e cotas premiadas",
};

/**
 * A situação da rifa ao lado dos dados (o Figma, nó 54:4503): no ar, o que
 * vendeu, a data e quem apura, a autorização e os links públicos; no
 * rascunho, o que falta para publicar, cada item com o link do cartão.
 */
function SituacaoDaRifaCard({
  linha,
  aoIrPara,
  aoPublicar,
  publicando,
}: {
  linha: CampaignRow;
  aoIrPara: (aba: string, ancora?: string) => void;
  aoPublicar: () => void;
  publicando: boolean;
}) {
  const { campaign: c, stats, emAnalise } = linha;
  const rascunho = c.status === "draft";
  const { data: pendencias } = useQuery<{ blockers: string[] }>({
    queryKey: [`/api/admin/campaigns/${c.id}/blockers`],
    enabled: rascunho,
  });
  const loteria = c.metodoApuracao ? LOTERIAS[loteriaDoMetodo(c.metodoApuracao)].curto : null;
  const linhas: [string, React.ReactNode][] = [
    ["Vendidas", `${groupNumber(stats?.soldCount ?? 0)} de ${groupNumber(c.totalQuotas)}`],
    ["Receita paga", formatBRL(stats?.revenueCents ?? 0)],
    ["Sorteio", c.drawAt ? `${new Date(c.drawAt).toLocaleDateString("pt-BR")}${loteria ? ` · ${loteria}` : ""}` : "sem data"],
    ["Autorização", c.authorizationCode ?? "falta"],
  ];
  return (
    <CartaoDoPainel titulo="Situação">
      <div className="space-y-3 px-5 pb-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-2">{rascunho ? "Rascunho" : "Publicada"}</span>
          <span className="flex flex-wrap justify-end gap-1">
            {situacaoDaRifa(c, emAnalise).map((sel) => (
              <Pill key={sel.texto} status={sel.status}>
                {sel.texto}
              </Pill>
            ))}
          </span>
        </div>
        <dl className="space-y-2">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-ink-2">{rotulo}</dt>
              <dd className="tnum min-w-0 truncate text-right font-medium" title={typeof valor === "string" ? valor : undefined}>
                {valor}
              </dd>
            </div>
          ))}
        </dl>

        {rascunho ? (
          pendencias ? (
            pendencias.blockers.length ? (
              <div>
                <p className="label-xs">O que falta para publicar</p>
                <ul className="mt-1 space-y-1.5 text-xs text-ink-2">
                  {pendencias.blockers.map((b) => {
                    const onde = ondeResolver(b);
                    return (
                      <li key={b} className="flex flex-col">
                        <span>{b}</span>
                        {onde && "href" in onde ? (
                          <Link href={onde.href} className="inline-flex min-h-6 w-fit items-center font-medium text-green-deep hover:underline">
                            Resolver em {onde.rotulo}
                          </Link>
                        ) : onde ? (
                          <button
                            type="button"
                            onClick={() => aoIrPara(onde.aba, onde.ancora)}
                            className="inline-flex min-h-6 w-fit items-center font-medium text-green-deep hover:underline"
                          >
                            Resolver na aba {NOME_DA_ABA[onde.aba]}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-green-deep">Nada falta: a rifa pode ser publicada.</p>
            )
          ) : null
        ) : null}

        <div className="flex flex-wrap gap-2">
          {rascunho ? (
            <Button onClick={aoPublicar} disabled={publicando || !pendencias || pendencias.blockers.length > 0}>
              Publicar
            </Button>
          ) : (
            <>
              <a href={`/r/${c.slug}`} target="_blank" rel="noreferrer" className={`relative h-9 ${FORMA_DO_BOTAO} ${tonsDoBotao.contorno}`}>
                <ExternalLink size={16} aria-hidden />
                Ver a rifa
                <span className="sr-only">(abre em outra aba)</span>
              </a>
              <a href={`/r/${c.slug}/regulamento`} target="_blank" rel="noreferrer" className={`relative h-9 ${FORMA_DO_BOTAO} ${tonsDoBotao.contorno}`}>
                Regulamento
                <span className="sr-only">(abre em outra aba)</span>
              </a>
            </>
          )}
        </div>
      </div>
    </CartaoDoPainel>
  );
}

export function AdminCampanhas() {
  const qc = useQueryClient();
  const { data } = useQuery<CampaignRow[]>({ queryKey: ["/api/admin/campaigns"] });
  const { data: sessao } = useSession();

  // O organizador cria na organização dele e nem vê o campo. O administrador
  // geral não tem organização, então precisa dizer quem promove a rifa — é a
  // promotora que a Lei 5.768/71 autoriza, não a plataforma.
  const daPlataforma = sessao?.role === "admin";
  const { data: organizacoes } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/admin/organizacoes"],
    enabled: daPlataforma,
  });
  const [open, setOpen] = useState(false);
  // A rifa aberta vem do endereço (`?rifa=`, com a aba em `?aba=`): recarregar ou mandar o link abre a
  // mesma edição. Id que não está na lista do recorte (o do vizinho, a apagada) cai na grade.
  const mediaFor = new URLSearchParams(useSearch()).get("rifa");
  const [, navegar] = useLocation();
  const setMediaFor = (id: string | null) => navegar(id ? `/admin/campanhas?rifa=${encodeURIComponent(id)}` : "/admin/campanhas");
  // "Pedir adiamento" e os links dos bloqueios trocam de aba: a URL leva a aba (e a âncora do cartão) e as abas remontam.
  const [remontar, setRemontar] = useState(0);
  const irParaAba = (aba: string, ancora?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("aba", aba);
    url.hash = ancora ?? "";
    window.history.replaceState(null, "", url);
    setRemontar((n) => n + 1);
  };
  // Grade de capas ou lista, lembrado no aparelho.
  const [visao, setVisao] = useState<VisaoDasRifas>(visaoInicial);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    prizeTitle: "",
    totalQuotas: 1000,
    priceCents: 490,
    commissionPctDefault: 10,
    organizationId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/campaigns", form),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const publish = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/campaigns/${id}/publish`),
    onSuccess: () => qc.invalidateQueries(),
    onError: (err: Error) => setError(err.message),
  });
  const teste = useMutation({
    mutationFn: ({ id, ligado }: { id: string; ligado: boolean }) =>
      apiRequest("POST", `/api/admin/campaigns/${id}/demonstracao`, { ligado }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/campaigns/${id}`),
    onSuccess: () => {
      setError(null);
      setMediaFor(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });
  const destravar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/campaigns/${id}/destravar`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });
  const tirar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/campaigns/${id}/tirar-do-ar`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  const digits = quotaDigits(form.totalQuotas, true);

  const aberta = mediaFor ? data?.find((r) => r.campaign.id === mediaFor) : undefined;

  return (
    <PanelShell title="Rifas">
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
      ) : null}

      {!aberta ? (
      <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted">
          <span className="tnum">{data?.length ?? 0}</span> rifa(s)
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <AlternarVisao
            visao={visao}
            aoMudar={(v) => {
              setVisao(v as VisaoDasRifas);
              try {
                localStorage.setItem(CHAVE_VISAO, v);
              } catch {
                // armazenamento bloqueado: vale só nesta visita
              }
            }}
            opcoes={[
              { valor: "grade", rotulo: "Grade de capas", icone: LayoutGrid },
              { valor: "lista", rotulo: "Lista", icone: List },
            ]}
          />
          <Button onClick={() => setOpen((v) => !v)}>
            {open ? "Fechar" : "Nova rifa"}
          </Button>
        </div>
      </div>

      {open ? (
        <Card title="Nova campanha" right={<Pill status="draft" />}>
          <div className="space-y-4 p-4">
            {daPlataforma ? (
              <div>
                <label htmlFor="promotora" className="label-xs">
                  Organização promotora
                </label>
                <select
                  id="promotora"
                  value={form.organizationId}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                  className="campo text-sm"
                >
                  <option value="">escolha…</option>
                  {organizacoes?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted">
                  É o nome que sai no bilhete como administradora da rifa, e é
                  dela que a autorização SPA/MF é exigida.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="titulo" className="label-xs">Título</label>
                <input
                  id="titulo"
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                      slug: e.target.value
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[̀-ͯ]/g, "")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    })
                  }
                  className="campo text-sm"
                />
              </div>
              <div>
                <label htmlFor="premio" className="label-xs">Prêmio</label>
                <input
                  id="premio"
                  value={form.prizeTitle}
                  onChange={(e) => setForm({ ...form, prizeTitle: e.target.value })}
                  className="campo text-sm"
                  aria-describedby="premio-dica"
                />
                {/* Rifa autorizada pela SPA/MF: bem ou serviço, nunca dinheiro
                    nem item proibido (shared/premio.ts). Quem barra é o servidor. */}
                <p id="premio-dica" className={`mt-1 text-xs ${problemaNoPremio(form.prizeTitle, true) ? "text-red" : "text-muted"}`} role={problemaNoPremio(form.prizeTitle, true) ? "alert" : undefined}>
                  {problemaNoPremio(form.prizeTitle, true) ?? "Um bem ou serviço — nunca dinheiro, Pix ou transferência."}
                </p>
              </div>
            </div>

            {/* O total trava ao publicar. Só potência de 10: a leitura direta da
                Loteria Federal alcança todo número da rifa (shared/apuracao.ts). */}
            <fieldset>
              <legend className="label-xs">Total de cotas</legend>
              <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-5">
                {TOTAIS_DA_APURACAO.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={form.totalQuotas === p}
                    onClick={() => setForm({ ...form, totalQuotas: p })}
                    className={`tnum min-h-[40px] rounded-md border px-2 py-1 text-sm ${
                      form.totalQuotas === p
                        ? "border-green bg-green font-semibold text-on-green"
                        : "border-line-2 text-ink-2"
                    }`}
                  >
                    {groupNumber(p)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Numeração de <span className="tnum">{formatQuota(1, form.totalQuotas, true)}</span> a{" "}
                <span className="tnum">{formatQuota(form.totalQuotas, form.totalQuotas, true)}</span> — {digits} dígitos,
                a partir de zero, como a SPA/MF pede. Só 100, 1.000, 10.000, 100.000 ou 1.000.000: é o que a leitura da
                Loteria Federal alcança.
              </p>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="preco" className="label-xs">Preço da cota (centavos)</label>
                <input
                  id="preco"
                  type="number"
                  value={form.priceCents}
                  onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
                  className="campo tnum text-sm"
                />
                <p className="mt-1 text-[11px] text-muted">
                  {formatBRL(form.priceCents)} por cota · arrecadação potencial{" "}
                  {formatBRL(form.priceCents * form.totalQuotas)}
                </p>
              </div>
              <div>
                <label htmlFor="comissao" className="label-xs">Comissão padrão (%)</label>
                <input
                  id="comissao"
                  type="number"
                  value={form.commissionPctDefault}
                  onChange={(e) =>
                    setForm({ ...form, commissionPctDefault: Number(e.target.value) })
                  }
                  className="campo tnum text-sm"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
              <span aria-hidden>⚠️</span>
              <span>
                <b>O total trava ao publicar.</b> Depois da primeira venda, mudar a quantidade
                alteraria a chance de quem já comprou.
              </span>
            </div>

            {daPlataforma && !form.organizationId ? (
              <p className="text-xs text-muted">
                Escolha a organização promotora no topo do formulário para criar a campanha.
              </p>
            ) : null}
            <Button
              onClick={() => {
                setError(null);
                create.mutate();
              }}
              disabled={create.isPending || (daPlataforma && !form.organizationId)}
            >
              Criar rascunho
            </Button>
          </div>
        </Card>
      ) : null}

      </>
      ) : null}

      {aberta ? (
        (() => {
          const linha = aberta;
          const c = linha.campaign;
          const vendidas = linha.stats?.soldCount ?? 0;
          const podeAdiar = c.status === "published" && !c.demonstracao && vendidas < c.totalQuotas;
          // O cabeçalho e as quatro abas da rifa (o Figma, nó 54:4503); a grade volta pelo "Todas as rifas".
          return (
            <div className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{c.title}</h2>
                  <p className="tnum text-xs text-muted">
                    <Link href="/admin/campanhas" className="inline-flex min-h-6 items-center font-medium text-green-deep hover:underline">
                      Todas as rifas
                    </Link>
                    {" · "}
                    {c.status === "draft"
                      ? "rascunho"
                      : c.publishedAt
                        ? `publicada em ${new Date(c.publishedAt).toLocaleDateString("pt-BR")}`
                        : "publicada"}
                  </p>
                </div>
                <span className="flex flex-wrap gap-1">
                  {situacaoDaRifa(c, linha.emAnalise).map((sel) => (
                    <Pill key={sel.texto} status={sel.status}>
                      {sel.texto}
                    </Pill>
                  ))}
                </span>
              </header>
              <Abas
                key={`${c.id}-${remontar}`}
                rotulo={`Edição de ${c.title}`}
                ancoras={{ adiar: "autorizacao", "dados-legais": "autorizacao", midia: "publicacao", "cotas-premiadas": "vendas" }}
                abas={[
                  {
                    id: "rifa",
                    titulo: "A rifa",
                    conteudo: (
                      // Computador: os dados da rifa em duas colunas e a situação na terceira; o resto embaixo.
                      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                        <div className="min-w-0 lg:col-span-2">
                          <EditarRifaCard
                            rifa={c}
                            daPlataforma={daPlataforma}
                            edicaoEmAnalise={Boolean(linha.emAnalise?.includes("edicao"))}
                            aoPedirAdiamento={podeAdiar ? () => irParaAba("autorizacao", "adiar") : undefined}
                          />
                        </div>
                        <SituacaoDaRifaCard
                          linha={linha}
                          aoIrPara={irParaAba}
                          aoPublicar={() => publish.mutate(c.id)}
                          publicando={publish.isPending}
                        />
                        <CobrancaDaRifaCard rifa={c} />
                        <AgendarPublicacaoCard rifa={c} />
                        {c.status !== "draft" ? (
                          <CartaoDoPainel titulo="Endereço curto" subtitulo="Para divulgar a rifa com um link pequeno.">
                            <div className="px-5 pb-5">
                              <EnderecoCurto alvo={{ tipo: "rifa", id: c.id }} rotulo="Endereço curto da rifa" />
                            </div>
                          </CartaoDoPainel>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    id: "autorizacao",
                    titulo: "Autorização e sorteio",
                    conteudo: (
                      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                        <div id="dados-legais" className="min-w-0">
                          <DadosLegaisCard campanha={c} />
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-4">
                          <TransmissaoCard campanha={c} />
                          {podeAdiar ? (
                            <div id="adiar" className="min-w-0 scroll-mt-20">
                              <AdiarSorteioCard
                                rifa={c}
                                vendidas={vendidas}
                                adiamentoEmAnalise={Boolean(linha.emAnalise?.includes("adiamento"))}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "publicacao",
                    titulo: "Publicação",
                    conteudo: (
                      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                        <div id="midia" className="min-w-0 lg:col-span-2">
                          <MediaManager campaignId={c.id} />
                        </div>
                        <LegendaCard campanha={c} />
                        <ReelsDaRifa campaignId={c.id} />
                        <CartaoDoPainel titulo="Artes para divulgar" subtitulo="Prontas nos três formatos, ou monte a sua no editor.">
                          <div className="space-y-4 px-5 pb-5">
                            <AbrirEditorDeImagem
                              portas={{
                                dados: `/api/admin/campaigns/${c.id}/editor`,
                                conferir: `/api/admin/campaigns/${c.id}/editor/conferir`,
                                sugerir: `/api/admin/campaigns/${c.id}/sugerir`,
                                artes: `/api/admin/campaigns/${c.id}/artes`,
                                carrossel: `/api/admin/campaigns/${c.id}/media`,
                              }}
                            />
                            <ArtesParaDivulgar base={`/api/admin/campaigns/${c.id}/artes`} />
                          </div>
                        </CartaoDoPainel>
                        <BannerDivulgacaoCard campaignId={c.id} />
                      </div>
                    ),
                  },
                  {
                    id: "vendas",
                    titulo: "Pacotes e cotas premiadas",
                    conteudo: <CampaignExtras campaignId={c.id} totalQuotas={c.totalQuotas ?? 1000} numeracaoZero={numeracaoZero(c.metodoApuracao)} rascunho={c.status === "draft"} />,
                  },
                ]}
              />
            </div>
          );
        })()
      ) : null}

      {/* As ações de cada rifa, as mesmas na grade e na lista. */}
      {!aberta ? (() => {
        const acoesDa = ({ campaign, stats }: CampaignRow) => {
          const lista: { rotulo: string; aoClicar: () => void; primario?: boolean; perigo?: boolean; ocupado?: boolean }[] = [
            { rotulo: "Editar", aoClicar: () => setMediaFor(campaign.id) },
          ];
          if (campaign.status === "draft") lista.push({ rotulo: "Publicar", primario: true, aoClicar: () => publish.mutate(campaign.id) });
          if (daPlataforma && campaign.travadaEm)
            lista.push({
              rotulo: "Destravar",
              ocupado: destravar.isPending,
              aoClicar: () => {
                if (window.confirm(`Destravar "${campaign.title}"? As vendas voltam e ela volta à vitrine.\nMotivo da trava: ${campaign.travadaMotivo ?? "—"}`)) destravar.mutate(campaign.id);
              },
            });
          if (daPlataforma && campaign.status === "published" && !stats?.soldCount)
            lista.push({
              rotulo: "Tirar do ar",
              ocupado: tirar.isPending,
              aoClicar: () => {
                if (window.confirm(`Tirar "${campaign.title}" do ar? Ela volta a rascunho e sai da vitrine.`)) tirar.mutate(campaign.id);
              },
            });
          if (daPlataforma && (campaign.demonstracao ? Boolean(campaign.authorizationCode) : !stats?.soldCount))
            lista.push({
              rotulo: campaign.demonstracao ? "Desmarcar teste" : "Marcar como teste",
              ocupado: teste.isPending,
              aoClicar: () => {
                const ligar = !campaign.demonstracao;
                const aviso = ligar
                  ? `Marcar "${campaign.title}" como teste? Fica na vitrine com a marca "Demonstração" e não vende.`
                  : `Desmarcar "${campaign.title}"? Ela volta a vender normalmente.`;
                if (window.confirm(aviso)) teste.mutate({ id: campaign.id, ligado: ligar });
              },
            });
          if (podeExcluir({ status: campaign.status, vendidas: (stats?.soldCount ?? 0) + (stats?.reservedCount ?? 0), demonstracao: campaign.demonstracao }))
            lista.push({
              rotulo: "Excluir",
              perigo: true,
              ocupado: excluir.isPending,
              aoClicar: () => {
                if (window.confirm(`Apagar "${campaign.title}" de vez? Some a rifa, o sorteio, as mídias e os pedidos não pagos. Não tem volta.`)) excluir.mutate(campaign.id);
              },
            });
          return lista;
        };
        const botao = (a: ReturnType<typeof acoesDa>[number]) => (
          <Button
            key={a.rotulo}
            variant={a.primario ? "primary" : "ghost"}
            className={`h-9 whitespace-nowrap ${a.perigo ? "border-red text-red hover:bg-red-soft" : ""}`}
            disabled={a.ocupado}
            onClick={a.aoClicar}
          >
            {a.rotulo}
          </Button>
        );
        return (
          <div className="mt-3 space-y-3">
            {data?.length === 0 ? (
              <Card>
                <Empty>Nenhuma campanha criada.</Empty>
              </Card>
            ) : visao === "grade" ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Rifas em grade">
                {data?.map((linha) => {
                  const { campaign, stats, emAnalise, capa } = linha;
                  const acoes = acoesDa(linha);
                  const [principal, segunda, ...resto] = acoes;
                  const vendidas = stats?.soldCount ?? 0;
                  return (
                    <li key={campaign.id} className="cartao min-w-0 overflow-hidden rounded-xl border border-line bg-white">
                      <div className="relative aspect-[16/9] bg-mist-2">
                        {capa ? (
                          <img src={capa} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-mist text-muted" aria-hidden>
                            <ImagemIcone size={28} />
                          </span>
                        )}
                        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                          {situacaoDaRifa(campaign, emAnalise).map((sel) => (
                            <Pill key={sel.texto} status={sel.status}>
                              {sel.texto}
                            </Pill>
                          ))}
                        </span>
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="truncate text-base font-semibold" title={campaign.prizeTitle}>{campaign.prizeTitle}</p>
                        <p className="tnum text-xs text-muted">
                          <Money cents={campaign.priceCents} /> a cota · {groupNumber(campaign.totalQuotas)} cotas
                        </p>
                        <Progress value={vendidas} total={campaign.totalQuotas} />
                        <p className="tnum text-xs text-muted">
                          {groupNumber(vendidas)} de {groupNumber(campaign.totalQuotas)} · <Money cents={stats?.revenueCents ?? 0} />
                        </p>
                        <p className="tnum text-xs">
                          {campaign.drawAt ? (
                            <span className={campaign.status === "published" ? "font-medium text-green-deep" : "text-muted"}>
                              Sorteio {new Date(campaign.drawAt).toLocaleDateString("pt-BR")}
                              {campaign.adiamentos ? ` (adiado${campaign.drawAtOriginal ? `, era ${new Date(campaign.drawAtOriginal).toLocaleDateString("pt-BR")}` : ""})` : ""}
                            </span>
                          ) : (
                            <span className="text-muted">Sem data de sorteio</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {botao(principal)}
                          {segunda ? botao(segunda) : null}
                          {resto.length ? (
                            <details className="relative ml-auto">
                              <summary aria-label={`Mais ações de ${campaign.title}`} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-muted hover:bg-mist [&::-webkit-details-marker]:hidden">
                                <MoreVertical size={18} aria-hidden />
                              </summary>
                              <div className="cartao absolute right-0 top-full z-20 mt-1 flex w-48 flex-col rounded-lg border border-line bg-white py-1 text-sm">
                                {resto.map((a) => (
                                  <button key={a.rotulo} type="button" disabled={a.ocupado} onClick={a.aoClicar} className={`px-3 py-2 text-left hover:bg-mist ${a.perigo ? "text-red" : ""}`}>
                                    {a.rotulo}
                                  </button>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <CabecalhoDaTabela colunas={["Campanha", "Cota", "Progresso", "Arrecadado", "Sorteio", "Status", ""]} />
                    <tbody>
                      {data?.map((linha) => {
                        const { campaign, stats, emAnalise } = linha;
                        return (
                          <tr key={campaign.id} className="border-t border-line">
                            <td className="px-4 py-3 font-medium">{campaign.prizeTitle}</td>
                            <td className="px-4 py-3">
                              <Money cents={campaign.priceCents} />
                            </td>
                            <td className="min-w-[130px] px-4 py-3">
                              <Progress value={stats?.soldCount ?? 0} total={campaign.totalQuotas} />
                              <span className="label-xs">
                                {groupNumber(stats?.soldCount ?? 0)}/{groupNumber(campaign.totalQuotas)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Money cents={stats?.revenueCents ?? 0} />
                            </td>
                            <td className="tnum px-4 py-3">
                              {campaign.drawAt ? new Date(campaign.drawAt).toLocaleDateString("pt-BR") : "—"}
                              {campaign.adiamentos ? (
                                <span className="block text-[11px] text-muted">
                                  adiado{campaign.drawAtOriginal ? ` (era ${new Date(campaign.drawAtOriginal).toLocaleDateString("pt-BR")})` : ""}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex flex-wrap gap-1">
                                {situacaoDaRifa(campaign, emAnalise).map((sel) => (
                                  <Pill key={sel.texto} status={sel.status}>
                                    {sel.texto}
                                  </Pill>
                                ))}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex flex-wrap gap-1">{acoesDa(linha).map(botao)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        );
      })() : null}
    </PanelShell>
  );
}

/* ------------------------------ pedidos ------------------------------ */

interface LinhaDePedido {
  order: { code: number; status: string; quantity: number; amountCents: number; createdAt: string };
  buyer: { name: string; phone: string | null; codigo: string | null; completo: boolean };
  campaign: { title: string };
}

/** Cliente da plataforma: só o ID. Do cambista: completo (`shared/titularidade.ts`). */
function Comprador({ r }: { r: LinhaDePedido }) {
  return (
    <>
      {r.buyer.name}
      {r.buyer.completo && r.buyer.phone ? (
        <span className="tnum block text-[11px] text-muted">{maskPhone(r.buyer.phone)}</span>
      ) : null}
    </>
  );
}

/**
 * A situação do pedido em pílula: pendente azul (espera), pago verde (dinheiro
 * que entrou), vencido e estornado neutros — não são erro, só o fim do pedido.
 * O kit pinta `expired`/`refunded` de vermelho para outros usos; aqui o tom é
 * o neutro e o texto continua dizendo qual é.
 */
const PEDIDO_NEUTRO: Record<string, string> = { expired: "expirado", refunded: "estornado" };
function SituacaoDoPedido({ status }: { status: string }) {
  return PEDIDO_NEUTRO[status] ? <Pill status="closed">{PEDIDO_NEUTRO[status]}</Pill> : <Pill status={status} />;
}

function BilheteDoPedido({ codigo }: { codigo: number }) {
  return (
    <a
      href={`/bilhete/${codigo}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-6 items-center text-xs font-medium text-green-deep hover:underline"
    >
      bilhete
    </a>
  );
}

export function AdminPedidos() {
  // A busca do painel chega com `?codigo=` (um pedido) ou `?cliente=` (o ID):
  // a lista fica só com eles e o filtro aparece em texto, com o "ver todos".
  const busca = new URLSearchParams(useSearch());
  const codigo = busca.get("codigo");
  const cliente = busca.get("cliente");
  const { paginas, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } = useListaPaginada<LinhaDePedido[]>(
    "/api/admin/orders",
    { codigo, cliente },
  );
  const linhas = paginas.flat();
  const { data: sessao } = useSession();
  return (
    <PanelShell title="Pedidos">
      {sessao?.role === "admin" && !codigo && !cliente ? <PixTardios /> : null}
      <p className="mb-3 text-xs text-muted">
        Reembolso não se faz por aqui: o comprador pede em "Minhas cotas", com o print do
        bilhete, e a organização decide em Atendimento.
      </p>
      {codigo || cliente ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span>
            Mostrando {codigo ? <>o pedido <span className="tnum font-medium">#{codigo}</span></> : <>os pedidos do cliente <span className="tnum font-medium">{cliente}</span></>}.
          </span>
          <Link href="/admin/pedidos" className="inline-flex min-h-6 items-center text-green-deep underline">
            Ver todos
          </Link>
        </p>
      ) : null}
      <Card>
        <TabelaOuCartoes
          aria="Pedidos"
          itens={linhas}
          chave={(r) => r.order.code}
          colunas={[
            { titulo: "Pedido", celula: (r) => <span className="tnum">#{r.order.code}</span> },
            { titulo: "Rifa", celula: (r) => r.campaign.title },
            { titulo: "Comprador", celula: (r) => <Comprador r={r} /> },
            { titulo: "Cotas", celula: (r) => <span className="tnum">{r.order.quantity}</span> },
            { titulo: "Valor", celula: (r) => <Money cents={r.order.amountCents} /> },
            { titulo: "Status", celula: (r) => <SituacaoDoPedido status={r.order.status} /> },
            { titulo: "", celula: (r) => <BilheteDoPedido codigo={r.order.code} /> },
          ]}
          cartao={(r) => (
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <span className="tnum font-medium">#{r.order.code}</span>
                <SituacaoDoPedido status={r.order.status} />
              </div>
              <p className="min-w-0 truncate">{r.campaign.title}</p>
              <p className="text-sm text-muted">
                <Comprador r={r} />
              </p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="tnum text-muted">{r.order.quantity} cota{r.order.quantity === 1 ? "" : "s"}</span>
                <Money cents={r.order.amountCents} />
              </div>
              <BilheteDoPedido codigo={r.order.code} />
            </div>
          )}
        />
        {!isLoading && linhas.length === 0 ? <Empty>{codigo || cliente ? "Nenhum pedido com esse código ou ID aqui." : "Nenhum pedido ainda."}</Empty> : null}
        {linhas.length ? (
          <VerMais temMais={Boolean(hasNextPage)} carregando={isFetchingNextPage} aoPedir={() => fetchNextPage()} mostradas={linhas.length} />
        ) : null}
      </Card>
    </PanelShell>
  );
}

/* ----------------------------- afiliados ----------------------------- */

const PILL_DO_VINCULO: Record<string, string> = {
  pendente: "pending",
  aprovado: "published",
  recusado: "blocked",
  desfeito: "expired",
};

export function AdminAfiliados() {
  const qc = useQueryClient();
  const { data: sessao } = useSession();
  const daOrganizacao = sessao?.role !== "admin";
  const { data } = useQuery<
    {
      affiliate: { id: string; code: string; status: string; commissionPct: number | null; pixKey: string | null; verificadoEm?: string | null };
      user: { name: string; email: string };
      salesCents: number;
      /** Só para a organização: o vínculo do afiliado com ela. */
      vinculo?: { id: string; status: string; commissionPct: number | null; aceiteVersao: number | null; termoVersaoAtual: number | null };
    }[]
  >({ queryKey: ["/api/admin/affiliates"] });
  // A busca do painel chega com `?q=` (o código do afiliado): a lista fica
  // só com ele — o recorte já veio do servidor, aqui só se estreita.
  const filtro = (new URLSearchParams(useSearch()).get("q") ?? "").trim().toLowerCase();
  const doFiltro = (r: NonNullable<typeof data>[number]) =>
    !filtro || [r.affiliate.code, r.user.name, r.user.email].some((t) => t.toLowerCase().includes(filtro));
  // O que a organização decide é o vínculo; a plataforma, a conta.
  const statusDe = (r: NonNullable<typeof data>[number]) =>
    r.vinculo ? r.vinculo.status : r.affiliate.status === "active" ? "aprovado" : r.affiliate.status === "blocked" ? "recusado" : "pendente";

  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/affiliates", form),
    onSuccess: () => {
      setForm({ name: "", email: "", password: "", code: "" });
      qc.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/affiliates/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/affiliates"] }),
  });

  const pending = data?.filter((r) => statusDe(r) === "pendente") ?? [];
  // A régua de senha do afiliado (a mesma do servidor), embaixo do campo antes de enviar.
  const problemaSenha = form.password ? senhaInvalida(form.password, "affiliate") : null;

  return (
    <PanelShell title="Afiliados">
      {/*
        Duas colunas a partir de `xl`: o termo e o modo das divulgações à
        esquerda; a fila de adesão, os cupons e os vínculos à direita. O DOM
        segue a ordem do celular (esquerda, depois direita).
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 space-y-4">
          {daOrganizacao ? <TermoAfiliadoCard /> : null}
          <DivulgacoesDaOrganizacao daOrganizacao={daOrganizacao} />
        </div>

        <div className="min-w-0 space-y-4">
          {pending.length > 0 ? (
            <CartaoDoPainel titulo="Pedidos de adesão" acao={<Pill status="pending">{`${pending.length} na fila`}</Pill>}>
              <ul aria-label="Pedidos de adesão" className="divide-y divide-line">
                {pending.map((row) => (
                  <li key={row.affiliate.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      {row.user.name}
                      {row.affiliate.verificadoEm ? (
                        <span className="ml-1 inline-block">
                          <SeloVerificado sujeito="afiliado" tamanho={14} />
                        </span>
                      ) : null}{" "}
                      · <span className="tnum break-all text-muted">{row.user.email}</span>
                    </span>
                    <span className="tnum text-xs text-muted">código {row.affiliate.code}</span>
                    <Button onClick={() => update.mutate({ id: row.affiliate.id, status: "active" })}>Aprovar</Button>
                    <Button variant="contorno" onClick={() => update.mutate({ id: row.affiliate.id, status: "blocked" })}>
                      Recusar
                    </Button>
                  </li>
                ))}
              </ul>
            </CartaoDoPainel>
          ) : null}

          <CouponsCard affiliates={data ?? []} />

          <CartaoDoPainel titulo={daOrganizacao ? "Afiliados desta organização" : "Afiliados da plataforma"}>
            {filtro ? (
              <p className="flex flex-wrap items-center gap-2 border-b border-line px-5 pb-3 text-sm">
                <span>
                  Mostrando <span className="tnum font-medium">{filtro}</span>.
                </span>
                <Link href="/admin/afiliados" className="inline-flex min-h-6 items-center text-green-deep underline">
                  Ver todos
                </Link>
              </p>
            ) : null}
            <ul aria-label="Afiliados" className="divide-y divide-line">
              {data?.filter(doFiltro).map((row) => {
                const st = statusDe(row);
                const semAceite =
                  row.vinculo?.termoVersaoAtual && (row.vinculo.aceiteVersao ?? 0) < row.vinculo.termoVersaoAtual;
                return (
                  <li key={row.affiliate.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      {row.user.name}
                      {row.affiliate.verificadoEm ? (
                        <span className="ml-1 inline-block">
                          <SeloVerificado sujeito="afiliado" tamanho={14} />
                        </span>
                      ) : null}{" "}
                      · <span className="tnum text-muted">{row.affiliate.code}</span>
                      {semAceite ? (
                        <span className="block text-[11px] text-yellow-deep">
                          ainda não aceitou a versão <span className="tnum">{row.vinculo!.termoVersaoAtual}</span> do termo
                        </span>
                      ) : null}
                    </span>
                    <Money cents={row.salesCents} className="text-muted" />
                    <Pill status={PILL_DO_VINCULO[st]}>{{ pendente: "pendente", aprovado: "aprovado", recusado: "recusado", desfeito: "saiu" }[st]}</Pill>
                    {st !== "desfeito" ? (
                      <Button
                        variant="contorno"
                        onClick={() =>
                          update.mutate({ id: row.affiliate.id, status: st === "aprovado" ? "blocked" : "active" })
                        }
                      >
                        {st === "aprovado" ? (daOrganizacao ? "desligar" : "bloquear") : daOrganizacao ? "aprovar" : "ativar"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {data?.length === 0 ? <Empty>Nenhum afiliado cadastrado.</Empty> : null}
            {data?.length && !data.filter(doFiltro).length ? <Empty>Nenhum afiliado com esse código, nome ou e-mail.</Empty> : null}
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Novo afiliado">
            <form
              className="space-y-3 px-5 pb-5"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                create.mutate();
              }}
            >
              {(["name", "email", "password", "code"] as const).map((field) => (
                <Campo
                  key={field}
                  rotulo={{ name: "Nome", email: "E-mail", password: "Senha", code: "Código" }[field]}
                  erro={field === "password" ? problemaSenha : null}
                >
                  <input
                    id={field}
                    type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                    autoComplete={field === "password" ? "new-password" : "off"}
                    value={form[field]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [field]: field === "code" ? e.target.value.toUpperCase() : e.target.value,
                      })
                    }
                    className={field === "code" ? "tnum" : ""}
                  />
                </Campo>
              ))}
              {error ? (
                <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={create.isPending || Boolean(problemaSenha)}>
                Cadastrar e aprovar
              </Button>
            </form>
          </CartaoDoPainel>
        </div>
      </div>
    </PanelShell>
  );
}

/**
 * Termo de adesão de afiliado da organização: percentual e regras dela. O
 * resto (quem paga, quando, estorno, autoindicação) o sistema escreve. Cada
 * publicação é uma versão nova: rifa já no ar segue com a versão com que foi
 * publicada, e o afiliado precisa aceitar a nova para as próximas.
 */
function TermoAfiliadoCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    termo: { versao: number; comissaoPct: number; textoExtra: string; texto: string; createdAt: string } | null;
    desatualizado?: boolean;
  }>({
    queryKey: ["/api/admin/termo-afiliado"],
  });
  const atual = data?.termo ?? null;
  const [pct, setPct] = useState<number | null>(null);
  const [extra, setExtra] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const valorPct = pct ?? atual?.comissaoPct ?? 10;
  const valorExtra = extra ?? atual?.textoExtra ?? "";
  const publicar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/termo-afiliado", { comissaoPct: valorPct, textoExtra: valorExtra }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Versão publicada. Vale para as rifas publicadas daqui em diante." });
      setPct(null);
      setExtra(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/termo-afiliado"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const desatualizado = Boolean(data?.desatualizado);
  const mudou = !atual || desatualizado || valorPct !== atual.comissaoPct || valorExtra.trim() !== atual.textoExtra;

  return (
    <CartaoDoPainel
      titulo="Termo de adesão de afiliado"
      acao={
        atual ? (
          <span className="tnum text-xs text-muted">
            versão {atual.versao} · {new Date(atual.createdAt).toLocaleDateString("pt-BR")}
          </span>
        ) : (
          <Pill status="pending">sem termo</Pill>
        )
      }
    >
      <div className="space-y-3 px-5 pb-5 text-sm">
        <p className="text-muted">
          O afiliado lê e aceita antes de divulgar suas rifas. Quem paga, quando, estorno, autoindicação, regras de
          divulgação, dados pessoais e tributos o sistema escreve; aqui entram o percentual e as regras da organização.
        </p>
        <div>
          <label htmlFor="termo-pct" className="label-xs text-ink-2">
            Comissão
          </label>
          <div className="flex items-center gap-2">
            <input
              id="termo-pct"
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              value={valorPct}
              onChange={(e) => {
                setMsg(null);
                setPct(Number(e.target.value));
              }}
              className="campo tnum w-20 text-sm"
            />
            <span className="text-xs text-muted">% sobre o pago, depois das taxas da plataforma</span>
          </div>
        </div>
        <Campo rotulo="Regras da organização (opcional)">
          <textarea
            id="termo-extra"
            rows={4}
            maxLength={3000}
            value={valorExtra}
            onChange={(e) => {
              setMsg(null);
              setExtra(e.target.value);
            }}
          />
        </Campo>
        {atual ? (
          <details className="text-xs">
            <summary className="inline-flex min-h-6 cursor-pointer items-center text-ink-2 underline">Ver o termo em vigor</summary>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-mist p-3 font-sans text-xs text-ink-2">{atual.texto}</pre>
          </details>
        ) : null}
        {desatualizado ? (
          <p role="note" className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
            O texto do termo mudou (cláusulas da plataforma ou dados da organização). A versão em vigor segue valendo
            para quem já aceitou; publique a versão seguinte para as próximas rifas usarem o texto novo.
          </p>
        ) : null}
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
        <Button disabled={!mudou || publicar.isPending} onClick={() => publicar.mutate()}>
          {atual ? `Publicar versão ${atual.versao + 1}` : "Publicar o termo"}
        </Button>
      </div>
    </CartaoDoPainel>
  );
}

/** Cupom do afiliado: desconto para o comprador, atribuição para o afiliado. */
function CouponsCard({
  affiliates,
}: {
  affiliates: { affiliate: { id: string; code: string }; user: { name: string } }[];
}) {
  const qc = useQueryClient();
  const { data } = useQuery<
    {
      coupon: {
        id: string;
        code: string;
        discountPct: number;
        uses: number;
        maxUses: number | null;
      };
      affiliateCode: string | null;
    }[]
  >({ queryKey: ["/api/admin/coupons"] });

  const [form, setForm] = useState({ code: "", discountPct: 10, affiliateId: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/coupons", {
        ...form,
        affiliateId: form.affiliateId || null,
      }),
    onSuccess: () => {
      setForm({ code: "", discountPct: 10, affiliateId: "" });
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/coupons"] }),
  });

  return (
    <CartaoDoPainel titulo="Cupons">
      <div className="space-y-3 px-5 pb-5">
        {/* No celular os campos ficam um embaixo do outro (antes o formulário saía do cartão em 390); do `sm` em diante, numa linha. */}
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.3fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Campo rotulo="Código">
            <input
              id="coupon-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="tnum"
            />
          </Campo>
          <Campo rotulo="Desconto %">
            <input
              id="coupon-pct"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={form.discountPct}
              onChange={(e) => setForm({ ...form, discountPct: Number(e.target.value) })}
              className="tnum"
            />
          </Campo>
          <Campo rotulo="Afiliado">
            <select id="coupon-aff" value={form.affiliateId} onChange={(e) => setForm({ ...form, affiliateId: e.target.value })}>
              <option value="">sem afiliado</option>
              {affiliates.map((a) => (
                <option key={a.affiliate.id} value={a.affiliate.id}>
                  {a.user.name} ({a.affiliate.code})
                </option>
              ))}
            </select>
          </Campo>
          <Button type="submit" disabled={form.code.length < 3 || create.isPending}>
            Criar cupom
          </Button>
        </form>

        {error ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}

        {data?.length === 0 ? (
          <Empty>Nenhum cupom criado.</Empty>
        ) : (
          <ul aria-label="Cupons" className="divide-y divide-line">
            {data?.map((row) => (
              <li key={row.coupon.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="tnum font-medium">{row.coupon.code}</span>
                <span className="tnum text-muted">−{row.coupon.discountPct}%</span>
                <span className="min-w-0 flex-1 text-xs text-muted">
                  {row.affiliateCode ? (
                    <>
                      afiliado <span className="tnum">{row.affiliateCode}</span>
                    </>
                  ) : (
                    "sem afiliado"
                  )}{" "}
                  ·{" "}
                  <span className="tnum">
                    {row.coupon.uses}
                    {row.coupon.maxUses ? `/${row.coupon.maxUses}` : ""} uso(s)
                  </span>
                </span>
                <Button variant="cinza" onClick={() => remove.mutate(row.coupon.id)}>
                  remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CartaoDoPainel>
  );
}

/* ---------------------------- financeiro ---------------------------- */

interface SaquePedido {
  id: string;
  amountCents: number;
  irrfCents?: number;
  pixKey: string;
  requestedAt: string;
  /** Nulo: a comissão guardada pela plataforma — quem paga é ela (só o master vê). */
  organizationId?: string | null;
}

interface SaquePago {
  id: string;
  amountCents: number;
  irrfCents?: number;
  processedAt: string | null;
  codigoAfiliado: string;
  recibo: string | null;
}

/** O líquido que quem paga transfere: o bruto menos o IRRF (que vai no DARF). */
const liquidoDo = (s: { amountCents: number; irrfCents?: number }) => s.amountCents - (s.irrfCents ?? 0);

/**
 * Financeiro: a comissão de cada afiliado e os saques.
 *
 * Cada saque mostra o bruto (o valor da nota), o IRRF retido (Lucro
 * Presumido ou Real) e o líquido que quem paga transfere, sempre em `tnum`;
 * a nota fiscal abre pela porta do painel (`/api/admin/payouts/:id/nota`,
 * que confere o recorte e grava a auditoria). O saque da comissão guardada
 * pela plataforma vai marcado "Plataforma" — só o master o vê e paga.
 */
export function AdminFinanceiro() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const plataforma = session?.role === "admin";
  const [erro, setErro] = useState<string | null>(null);
  const { data } = useQuery<{
    perAffiliate: {
      affiliateId: string;
      code: string;
      name: string;
      pixKey: string | null;
      pendingCents: number;
      availableCents: number;
    }[];
    payoutsRequested: SaquePedido[];
  }>({ queryKey: ["/api/admin/finance"] });

  const release = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/finance/release"),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });

  const pay = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/payouts/${id}/paid`),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });
  const { data: pagos = [] } = useQuery<SaquePago[]>({ queryKey: ["/api/admin/saques-pagos"] });

  const pedidos = data?.payoutsRequested ?? [];
  const deQuem = (s: SaquePedido) =>
    plataforma && !s.organizationId ? <Pill status="pending">Plataforma</Pill> : null;
  const nota = (s: SaquePedido) => (
    <a href={`/api/admin/payouts/${s.id}/nota`} className="whitespace-nowrap text-xs text-green-deep underline">
      nota fiscal
    </a>
  );
  const marcarPago = (s: SaquePedido) => (
    <Button variant="contorno" className="whitespace-nowrap" disabled={pay.isPending} onClick={() => pay.mutate(s.id)}>
      marcar pago
    </Button>
  );
  const recibo = (p: SaquePago) =>
    p.recibo ? (
      <a
        href={`/api/admin/recibos/${p.recibo}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="tnum whitespace-nowrap text-xs text-green-deep underline"
      >
        recibo {p.recibo}
      </a>
    ) : (
      <span className="whitespace-nowrap text-xs text-muted">sem recibo</span>
    );
  const dataDo = (p: SaquePago) => (
    <span className="tnum">{p.processedAt ? new Date(p.processedAt).toLocaleDateString("pt-BR") : "—"}</span>
  );

  return (
    <PanelShell title="Financeiro">
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
      <div className="mb-4 flex justify-end">
        <Button variant="contorno" disabled={release.isPending} onClick={() => release.mutate()}>
          Liberar comissões vencidas
        </Button>
      </div>

      {/*
        Tablet: duas colunas de cartões. Computador (`xl`): a comissão por
        afiliado numa coluna estreita à esquerda e os saques, em tabela, na
        larga à direita. O DOM segue a ordem do celular.
      */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <CartaoDoPainel
          className="xl:row-span-2"
          titulo="Comissão por afiliado"
          subtitulo={
            plataforma
              ? "Pendente vira disponível depois da carência; aqui entra também a comissão guardada pela plataforma."
              : "Pendente vira disponível depois da carência; a guardada pela plataforma não aparece aqui."
          }
        >
          {data?.perAffiliate.length === 0 ? (
            <Empty>Nada a pagar.</Empty>
          ) : (
            <ul aria-label="Comissão por afiliado" className="divide-y divide-line">
              {data?.perAffiliate.map((a) => (
                <li key={a.affiliateId} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {a.name} · <span className="tnum text-muted">{a.code}</span>
                    </span>
                    <Money cents={a.availableCents} className="shrink-0 font-medium text-green-deep" />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <span className="tnum">{formatBRL(a.pendingCents)}</span> pendentes · disponível{" "}
                    <span className="tnum">{formatBRL(a.availableCents)}</span> · Pix{" "}
                    <span className="tnum break-all">{a.pixKey ?? "não cadastrado"}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CartaoDoPainel>

        <CartaoDoPainel
          titulo="Saques solicitados"
          subtitulo="Só MEI ou empresa, com a nota fiscal do bruto; IRRF de 1,5% no Lucro Presumido ou Real."
        >
          {pedidos.length === 0 ? (
            <Empty>Nenhum saque pendente.</Empty>
          ) : (
            <TabelaOuCartoes
              itens={pedidos}
              chave={(s) => s.id}
              aria="Saques solicitados"
              colunas={[
                {
                  titulo: "Chave Pix",
                  celula: (s) => (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="tnum min-w-0 [overflow-wrap:anywhere] text-ink-2">{s.pixKey}</span>
                      {deQuem(s)}
                    </span>
                  ),
                },
                { titulo: "Bruto", celula: (s) => <Money cents={s.amountCents} />, direita: true },
                { titulo: "IRRF", celula: (s) => <Money cents={s.irrfCents ?? 0} />, direita: true },
                { titulo: "Líquido", celula: (s) => <Money cents={liquidoDo(s)} className="font-medium" />, direita: true },
                { titulo: "Nota", celula: nota },
                { titulo: "", celula: marcarPago, direita: true },
              ]}
              cartao={(s) => (
                <div className="space-y-1.5 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="tnum min-w-0 break-all text-ink-2">{s.pixKey}</span>
                    {deQuem(s)}
                  </p>
                  {/* Com retenção, quem paga transfere o líquido e recolhe o IRRF no DARF; a nota é do bruto. */}
                  <dl className="tnum flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted">bruto</dt>
                      <dd>{formatBRL(s.amountCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">IRRF (DARF)</dt>
                      <dd>{formatBRL(s.irrfCents ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">líquido</dt>
                      <dd className="font-medium">{formatBRL(liquidoDo(s))}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {nota(s)}
                    {marcarPago(s)}
                  </div>
                </div>
              )}
            />
          )}
        </CartaoDoPainel>

        <CartaoDoPainel titulo="Saques pagos" subtitulo="Baixa e recibo na mesma transação.">
          {pagos.length === 0 ? (
            <Empty>Nenhum saque pago ainda.</Empty>
          ) : (
            <TabelaOuCartoes
              itens={pagos}
              chave={(p) => p.id}
              aria="Saques pagos"
              colunas={[
                { titulo: "Pago em", celula: dataDo },
                { titulo: "Afiliado", celula: (p) => <span className="tnum">{p.codigoAfiliado}</span> },
                { titulo: "Bruto", celula: (p) => <Money cents={p.amountCents} />, direita: true },
                { titulo: "IRRF", celula: (p) => <Money cents={p.irrfCents ?? 0} />, direita: true },
                { titulo: "Líquido", celula: (p) => <Money cents={liquidoDo(p)} className="font-medium" />, direita: true },
                { titulo: "Recibo", celula: recibo },
              ]}
              cartao={(p) => (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="tnum min-w-0 truncate">{p.codigoAfiliado}</span>
                    <span className="text-xs text-muted">pago em {dataDo(p)}</span>
                  </div>
                  <p className="tnum text-xs text-muted">
                    bruto {formatBRL(p.amountCents)} · IRRF {formatBRL(p.irrfCents ?? 0)} · líquido{" "}
                    <span className="font-medium text-ink">{formatBRL(liquidoDo(p))}</span>
                  </p>
                  {recibo(p)}
                </div>
              )}
            />
          )}
        </CartaoDoPainel>
      </div>
    </PanelShell>
  );
}

/* ------------------------------ sorteios ----------------------------- */

/** Os 5 prêmios da Federal têm 5 algarismos cada: fora disso o servidor recusa (400), e a tela avisa antes. */
const PREMIO_DA_FEDERAL = /^\d{5}$/;

export function AdminSorteios() {
  const qc = useQueryClient();
  const { data } = useQuery<CampaignRow[]>({ queryKey: ["/api/admin/campaigns"] });
  const [selected, setSelected] = useState<string | null>(null);
  const [contest, setContest] = useState("");
  const [prizes, setPrizes] = useState(["", "", "", "", ""]);
  const [result, setResult] = useState<{ resultNumber: number; winnerNumber: number | null; aproximacao?: boolean; seed: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/campaigns/${selected}/draw`, {
        federalContest: Number(contest),
        federalPrizes: prizes,
      });
      return (await res.json()) as { resultNumber: number; winnerNumber: number | null; aproximacao?: boolean; seed: string | null };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  const live = data?.filter((c) => c.campaign.status === "published") ?? [];
  const sorteadas = data?.filter((c) => c.campaign.status === "drawn") ?? [];
  // A rifa escolhida: a com método mostra o número a partir de zero e não tem semente.
  const escolhida = data?.find((c) => c.campaign.id === selected)?.campaign;
  const zero = numeracaoZero(escolhida?.metodoApuracao);
  const naTela = (n: number) => (escolhida ? formatQuota(n, escolhida.totalQuotas, zero) : groupNumber(n));
  // Prêmio fora dos 5 algarismos é recusado antes de sortear (o servidor recusa de novo).
  const premioErrado = prizes.findIndex((p) => p !== "" && !PREMIO_DA_FEDERAL.test(p));
  const prontos = prizes.every((p) => PREMIO_DA_FEDERAL.test(p));

  return (
    <PanelShell title="Sorteios">
      {/* O DOM segue a ordem do celular (executar, como o número sai, feitos); o computador põe as regras à direita. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <CartaoDoPainel titulo="Executar sorteio">
          <div className="space-y-3 px-5 pb-5">
            <p className="text-sm text-muted">
              A rifa integrada a um sorteio oficial usa o resultado lançado pela plataforma e ignora este
              formulário. A rifa do globo nunca sorteia por aqui: sorteia sozinha quando a plataforma lança a
              sessão.
            </p>
            {escolhida ? (
              <p className="rounded-md bg-mist px-3 py-2 text-sm text-ink-2">
                {escolhida.metodoApuracao === "globo"
                  ? "Esta rifa é apurada pelo globo da plataforma: ela sorteia sozinha quando a plataforma lançar o resultado da sessão do globo (com a ata) no calendário de Sorteios oficiais. O formulário abaixo não vale para ela."
                  : escolhida.metodoApuracao === "federal_direta"
                  ? "O número sai da leitura direta dos 5 prêmios (as unidades do 1º ao 5º, de cima para baixo), como diz o regulamento — qualquer pessoa confere com papel e caneta."
                  : "O hash da semente foi publicado antes da primeira venda. O número sai de HMAC(semente, os 5 prêmios do concurso) — qualquer pessoa refaz a conta."}
              </p>
            ) : null}

            <Campo rotulo="Campanha">
              <select id="campanha" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}>
                <option value="">selecione</option>
                {live.map((c) => (
                  <option key={c.campaign.id} value={c.campaign.id}>
                    {c.campaign.prizeTitle} ({groupNumber(c.campaign.totalQuotas)} cotas)
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Concurso da Loteria Federal">
              <input
                id="concurso"
                inputMode="numeric"
                value={contest}
                onChange={(e) => setContest(e.target.value.replace(/\D/g, ""))}
                className="tnum"
              />
            </Campo>

            <fieldset>
              <legend className="label-xs text-ink-2">Os 5 prêmios, na ordem</legend>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {prizes.map((p, i) => (
                  <input
                    key={i}
                    id={`premio-${i + 1}`}
                    aria-label={`${i + 1}º prêmio`}
                    placeholder={`${i + 1}º`}
                    inputMode="numeric"
                    value={p}
                    maxLength={5}
                    aria-invalid={premioErrado === i ? true : undefined}
                    onChange={(e) => {
                      const next = [...prizes];
                      next[i] = e.target.value.replace(/\D/g, "");
                      setPrizes(next);
                    }}
                    className="campo tnum mt-0 text-sm"
                  />
                ))}
              </div>
              {premioErrado >= 0 ? (
                <p role="alert" className="mt-1 text-xs text-red">
                  O {premioErrado + 1}º prêmio precisa ter 5 algarismos, como sai no resultado da Federal.
                </p>
              ) : null}
            </fieldset>

            {error ? (
              <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
                {error}
              </p>
            ) : null}

            <Button
              disabled={!selected || !prontos || run.isPending}
              onClick={() => {
                setError(null);
                run.mutate();
              }}
            >
              Executar sorteio
            </Button>

            {result ? (
              <div role="status" className="space-y-2 rounded-md bg-green-soft p-3 text-sm text-green-deep">
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="label-xs">Número sorteado</dt>
                    <dd className="tnum text-lg font-semibold">{naTela(result.resultNumber)}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Contemplado</dt>
                    <dd className="tnum text-lg font-semibold">
                      {result.winnerNumber !== null ? naTela(result.winnerNumber) : "nenhum"}
                    </dd>
                  </div>
                </dl>
                {result.aproximacao && result.winnerNumber !== null ? (
                  <p>
                    O número sorteado não foi distribuído; o contemplado sai pela regra:{" "}
                    {regraDoNumeroSemDono(escolhida?.metodoApuracao)}
                  </p>
                ) : result.winnerNumber === null ? (
                  <p>Nenhuma cota paga: o sorteio não tem contemplado.</p>
                ) : (
                  <p>O número sorteado foi distribuído: é ele o contemplado.</p>
                )}
                {result.seed ? <p className="tnum break-all text-[11px]">semente: {result.seed}</p> : null}
              </div>
            ) : null}
          </div>
        </CartaoDoPainel>

        <CartaoDoPainel titulo="Como o número sai">
          <ul className="space-y-2.5 px-5 pb-5 text-sm text-ink-2">
            {[
              "Loteria Federal: as unidades do 1º ao 5º prêmio formam o Número da Sorte; a rifa menor fica com os últimos algarismos; na de 1.000.000 a Série entra na frente.",
              "Número sem dono: busca alternada e circular (+1, −1, +2, −2…) entre as cotas pagas.",
              "Com cota reservada esperando Pix, o sorteio espera (409). Mínimo de vendidas abaixo do definido: adiamento.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0 text-green-deep" />
                <span className="min-w-0">{t}</span>
              </li>
            ))}
          </ul>
        </CartaoDoPainel>
      </div>

      <div className="mt-4">
        <CartaoDoPainel
          titulo="Sorteios feitos"
          subtitulo="Resultado, número contemplado e a conferência pública de cada rifa."
        >
          {sorteadas.length === 0 ? (
            <Empty>Nenhum sorteio feito ainda.</Empty>
          ) : (
            <ul aria-label="Sorteios feitos" className="divide-y divide-line">
              {sorteadas.map((c) => (
                <SorteioFeito key={c.campaign.id} rifa={c.campaign} />
              ))}
            </ul>
          )}
        </CartaoDoPainel>
      </div>

      <FotoDoGanhadorCard sorteadas={sorteadas} />
    </PanelShell>
  );
}

/**
 * Uma linha de "Sorteios feitos": o sorteado e o contemplado separados, com a
 * regra aplicada em texto quando o sorteado não tinha dono. Lê a mesma
 * conferência pública da página da rifa (`/campaigns/:slug/sorteio`), que só
 * fala de rifa publicada ou sorteada — nada que o público já não veja.
 */
function SorteioFeito({ rifa }: { rifa: CampaignRow["campaign"] }) {
  const { data: s } = useQuery<{
    realizado: boolean;
    numero?: string;
    contemplado?: string | null;
    aproximacao?: boolean;
    semContemplado?: boolean;
    ficouComPromotora?: boolean;
    executedAt?: string | null;
  }>({ queryKey: [`/api/public/campaigns/${rifa.slug}/sorteio`] });
  return (
    <li className="space-y-1.5 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-medium">{rifa.prizeTitle}</span>
        <Pill status="drawn">sorteada</Pill>
      </div>
      {s?.realizado ? (
        <>
          <dl className="tnum flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <div>
              <dt className="inline">sorteado </dt>
              <dd className="inline font-medium text-ink">{s.numero}</dd>
            </div>
            <div>
              <dt className="inline">contemplado </dt>
              <dd className="inline font-medium text-ink">
                {s.semContemplado || s.ficouComPromotora ? "nenhum" : (s.contemplado ?? s.numero)}
              </dd>
            </div>
            {s.executedAt ? (
              <div>
                <dt className="inline">em </dt>
                <dd className="inline">{new Date(s.executedAt).toLocaleDateString("pt-BR")}</dd>
              </div>
            ) : null}
          </dl>
          {s.aproximacao ? (
            <p className="text-xs text-muted">
              O sorteado não foi distribuído; valeu a regra: {regraDoNumeroSemDono(rifa.metodoApuracao)}
            </p>
          ) : s.ficouComPromotora ? (
            <p className="text-xs text-muted">O número sorteado não foi vendido: o prêmio ficou com a promotora.</p>
          ) : s.semContemplado ? (
            <p className="text-xs text-muted">Nenhuma cota paga: o sorteio não teve contemplado.</p>
          ) : null}
        </>
      ) : null}
      <Link href={`/r/${rifa.slug}`} className="inline-flex min-h-6 items-center text-xs text-green-deep underline">
        Ver a conferência pública
      </Link>
    </li>
  );
}

/**
 * Depois do sorteio: a foto do ganhador com o prêmio vira a capa da rifa nos
 * destaques do perfil e aparece no resultado. Só com autorização dele.
 */
function FotoDoGanhadorCard({ sorteadas }: { sorteadas: CampaignRow[] }) {
  const qc = useQueryClient();
  const [campanha, setCampanha] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const escolhida = sorteadas.find((c) => c.campaign.id === campanha);
  const { data: sorteio } = useQuery<{ fotoGanhador?: string | null }>({
    queryKey: [`/api/public/campaigns/${escolhida?.campaign.slug}/sorteio`],
    enabled: Boolean(escolhida),
  });
  const salvar = useMutation({
    mutationFn: (valor: string | null) => apiRequest("PUT", `/api/admin/campaigns/${campanha}/foto-ganhador`, { foto: valor }),
    onSuccess: (_r, valor) => {
      setFoto(null);
      setMsg({ ok: true, texto: valor ? "Foto publicada. Já é a capa da rifa no perfil." : "Foto retirada." });
      qc.invalidateQueries({ queryKey: [`/api/public/campaigns/${escolhida?.campaign.slug}/sorteio`] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  if (sorteadas.length === 0) return null;
  const mostrada = foto ?? sorteio?.fotoGanhador ?? null;

  return (
    <div className="mt-4">
      <CartaoDoPainel
        titulo="Foto do ganhador"
        subtitulo="Vira a capa da rifa nos destaques do perfil e aparece no resultado. Publique só com a autorização do ganhador para usar a imagem dele."
      >
        <div className="space-y-3 px-5 pb-5 text-sm">
          <Campo rotulo="Rifa sorteada">
            <select
              value={campanha}
              onChange={(e) => {
                setCampanha(e.target.value);
                setFoto(null);
                setMsg(null);
              }}
            >
              <option value="">Escolha a rifa sorteada</option>
              {sorteadas.map((c) => (
                <option key={c.campaign.id} value={c.campaign.id}>
                  {c.campaign.prizeTitle}
                </option>
              ))}
            </select>
          </Campo>
          {campanha ? (
            <div className="flex items-start gap-3">
              <div className="aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-md border border-line bg-mist-2">
                {mostrada ? <img src={mostrada} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="space-y-2">
                <label className="relative inline-flex h-10 cursor-pointer items-center rounded-lg border border-line-2 bg-white px-4 text-[13px] font-semibold text-ink hover:bg-mist">
                  {mostrada ? "Trocar foto" : "Escolher foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setMsg(null);
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) return setMsg({ ok: false, texto: "A foto passa de 5 MB." });
                      const r = new FileReader();
                      r.onload = () => setFoto(String(r.result));
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <Button disabled={!foto || salvar.isPending} onClick={() => salvar.mutate(foto)}>
                    Publicar foto
                  </Button>
                  {sorteio?.fotoGanhador && !foto ? (
                    <button type="button" onClick={() => salvar.mutate(null)} className="text-xs text-red underline">
                      tirar foto
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted">
                  Em pé (4 por 5, recortada em <span className="tnum">1080 × 1350</span>). JPG, PNG ou WebP até 5 MB.
                </p>
              </div>
            </div>
          ) : null}
          {msg ? (
            <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
          ) : null}
        </div>
      </CartaoDoPainel>
    </div>
  );
}

/* --------------------------- configurações --------------------------- */

/** Segundo fator: gera o segredo, confirma com um código e só então grava. */
function TwoFactorCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/admin/2fa"] });
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/2fa/setup");
      return (await res.json()) as { secret: string; otpauth: string; qr: string };
    },
    onSuccess: setSetup,
    onError: (err: Error) => setError(err.message),
  });

  const enable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/2fa/enable", { code }),
    onSuccess: () => {
      setSetup(null);
      setCode("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/2fa"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const disable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/2fa/disable", { code, password }),
    onSuccess: () => {
      setCode("");
      setPassword("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/2fa"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card
      title="Segundo fator"
      right={<Pill status={data?.enabled ? "paid" : "pending"}>
        {data?.enabled ? "ativo" : "desligado"}
      </Pill>}
    >
      <div className="space-y-3 p-4">
        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        {!data?.enabled && !setup ? (
          <>
            <p className="text-sm text-ink-2">
              A conta do administrador move dinheiro e publica campanha. Com o segundo fator,
              a senha sozinha deixa de ser suficiente para entrar.
            </p>
            <Button onClick={() => start.mutate()}>Ativar segundo fator</Button>
          </>
        ) : null}

        {setup ? (
          <>
            <p className="text-sm text-ink-2">
              Cadastre no aplicativo autenticador e confirme com o código que aparecer.
            </p>
            <div className="flex flex-wrap items-start gap-4 rounded-md bg-mist p-3">
              <img
                src={setup.qr}
                alt="QR Code para cadastrar no aplicativo autenticador"
                className="h-36 w-36 rounded-md border border-line bg-white"
              />
              <div className="min-w-[12rem] flex-1">
                <p className="label-xs">Ou digite esta chave</p>
                <p className="tnum mt-1 break-all text-sm">
                  {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                id="totp-confirm"
                aria-label="Código do autenticador"
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tnum w-32 rounded-md border border-line-2 px-3 py-2 tracking-[0.2em]"
              />
              <Button onClick={() => enable.mutate()} disabled={code.length !== 6}>
                Confirmar
              </Button>
            </div>
          </>
        ) : null}

        {data?.enabled ? (
          <>
            <p className="text-sm text-ink-2">
              Para desligar, confirme com a senha e um código — sessão roubada não desarma
              o segundo fator sozinha.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                id="totp-password"
                type="password"
                aria-label="Senha"
                placeholder="senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-40 rounded-md border border-line-2 px-3 py-2 text-sm"
              />
              <input
                id="totp-disable"
                aria-label="Código do autenticador"
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tnum w-32 rounded-md border border-line-2 px-3 py-2 tracking-[0.2em]"
              />
              <Button
                variant="ghost"
                onClick={() => disable.mutate()}
                disabled={code.length !== 6 || password.length < 4}
              >
                Desligar
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

/** Liga e desliga os meios de pagamento do app inteiro. */
function PaymentMethodsCard() {
  const qc = useQueryClient();
  const { data } = useQuery<PaymentMethodSettings>({
    queryKey: ["/api/admin/payment-methods"],
  });
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (proximo: PaymentMethodSettings) =>
      apiRequest("PUT", "/api/admin/payment-methods", proximo),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });

  function alternar(key: PaymentMethodKey) {
    if (!data) return;
    setErro(null);
    salvar.mutate({ ...data, [key]: !data[key] });
  }

  const ligados = data ? PAYMENT_METHODS.filter((m) => data[m.key]).length : 0;

  return (
    <Card
      title="Meios de pagamento"
      right={<Pill status={ligados > 0 ? "paid" : "expired"}>{`${ligados} ligado(s)`}</Pill>}
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          Vale para o app inteiro: a loja online e a tela do cambista só oferecem o que
          estiver ligado aqui.
        </p>

        {(["online", "fisico"] as const).map((scope) => (
          <div key={scope} className="space-y-2">
            <span className="label-xs">
              {scope === "online" ? "Loja online" : "Venda na mão (cambista)"}
            </span>
            {PAYMENT_METHODS.filter((m) => m.scope === scope).map((m) => {
              const ligado = data?.[m.key] ?? false;
              return (
                <label
                  key={m.key}
                  htmlFor={`meio-${m.key}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
                    ligado ? "border-green bg-green-soft" : "border-line-2 bg-white"
                  }`}
                >
                  <input
                    id={`meio-${m.key}`}
                    type="checkbox"
                    checked={ligado}
                    disabled={!data || salvar.isPending}
                    onChange={() => alternar(m.key)}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-[11px] text-muted">{m.hint}</span>
                  </span>
                  <Pill status={ligado ? "paid" : "draft"}>
                    {ligado ? "aceito" : "desligado"}
                  </Pill>
                </label>
              );
            })}
          </div>
        ))}

        {data && !data.pix_online ? (
          <p className="rounded-md bg-yellow-soft px-3 py-2 text-[11px] text-yellow-deep">
            Com o Pix online desligado, a página da rifa deixa de vender sozinha e passa
            a orientar o comprador a procurar um cambista.
          </p>
        ) : null}

        {erro ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
        ) : null}
      </div>
    </Card>
  );
}

/** Dados que saem impressos em todo bilhete. */
function OrganizerCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    nome: string;
    cnpj?: string;
    contato?: string;
    cidade?: string;
    observacao?: string;
    /** Só para quem entra por uma organização: o endereço é dela. */
    organizacaoId?: string;
    endereco?: Endereco | null;
  }>({ queryKey: ["/api/admin/organizer"] });
  const daOrganizacao = Boolean(data?.organizacaoId);

  const [form, setForm] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const valor = (campo: string) => form[campo] ?? (data as never)?.[campo] ?? "";

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/organizer", {
        nome: valor("nome"),
        cnpj: valor("cnpj"),
        contato: valor("contato"),
        // Na organização, a cidade vem do endereço (card ao lado).
        cidade: daOrganizacao ? undefined : valor("cidade"),
        observacao: valor("observacao"),
      }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/organizer"] });
    },
    onError: (err: Error) => setErro(err.message),
  });

  return (
    <Card title="Administradora da rifa">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          Estes dados saem impressos em todo bilhete, junto da autorização da campanha.
        </p>
        {(
          [
            ["nome", "Nome"],
            ["cnpj", "CNPJ"],
            ["cidade", "Cidade"],
            ["contato", "Contato"],
            ["observacao", "Observação do rodapé"],
          ] as const
        )
          .filter(([campo]) => !(daOrganizacao && campo === "cidade"))
          .map(([campo, rotulo]) => (
          <div key={campo}>
            <label htmlFor={`org-${campo}`} className="label-xs">{rotulo}</label>
            <input
              id={`org-${campo}`}
              value={valor(campo)}
              onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
              className="campo text-sm"
            />
          </div>
        ))}
        {erro ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
        ) : null}
        <Button onClick={() => salvar.mutate()}>Salvar</Button>
      </div>
    </Card>
  );
}

/**
 * Endereço da organização: a cidade sai no bilhete, e cidade e estado põem
 * as rifas dela na frente de quem está perto.
 */
function EnderecoDaOrganizacaoCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    organizacaoId?: string;
    endereco?: Endereco | null;
    enderecoParcial?: EnderecoParcial;
  }>({
    queryKey: ["/api/admin/organizer"],
  });
  if (!data?.organizacaoId) return null;
  return (
    <Card
      title="Endereço da organização"
      right={data.endereco ? null : <Pill status="pending">falta cadastrar</Pill>}
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          A cidade sai no bilhete. Na vitrine, suas rifas aparecem primeiro para quem está na sua
          cidade, depois no seu estado — e continuam aparecendo para o Brasil inteiro.
        </p>
        <EnderecoForm
          organizacaoId={data.organizacaoId}
          atual={data.endereco ?? data.enderecoParcial}
          onSalvo={() => qc.invalidateQueries({ queryKey: ["/api/admin/organizer"] })}
        />
      </div>
    </Card>
  );
}

/** Foto e bio do perfil público — o que o apostador vê em /o/:slug. */
function PerfilPublicoCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    organizacaoId?: string;
    slug?: string;
    nome: string;
    bio?: string | null;
    foto?: string | null;
    capa?: string | null;
    destaque?: CorDeDestaque | null;
    links?: LinkDoPerfil[];
  }>({ queryKey: ["/api/admin/organizer"] });
  if (!data?.organizacaoId || !data.slug) return null;
  return (
    <Card title="Perfil público">
      <div className="p-4">
        <PerfilPublicoForm
          organizacaoId={data.organizacaoId}
          slug={data.slug}
          nome={data.nome}
          bio={data.bio ?? null}
          foto={data.foto ?? null}
          capa={data.capa ?? null}
          destaque={data.destaque ?? null}
          links={data.links ?? []}
          onSalvo={() => qc.invalidateQueries({ queryKey: ["/api/admin/organizer"] })}
        />
      </div>
    </Card>
  );
}

/** A organização pede o selo de verificada (opcional — não trava rifa nenhuma). */
function VerificacaoDaOrganizacaoCard() {
  const { data } = useQuery<{ organizacaoId?: string }>({ queryKey: ["/api/admin/organizer"] });
  if (!data?.organizacaoId) return null;
  return (
    <div className="mb-3">
      <VerificacaoCard base={`/api/admin/organizacoes/${data.organizacaoId}/verificacao`} sujeito="organizacao" />
    </div>
  );
}

export function AdminConfiguracoes() {
  const { data: session } = useSession();
  const plataforma = session?.role === "admin";
  // A trilha é só da plataforma (o servidor recusa o organizador): sem pedir, sem cartão vazio.
  const { data } = useQuery<
    { id: string; action: string; entity: string; createdAt: string; actorRole: string }[]
  >({ queryKey: ["/api/admin/audit"], enabled: plataforma });

  return (
    <PanelShell title="Configurações">
      {/* Uma aba por assunto, em vez de uma pilha de doze cartões. */}
      <Abas
        rotulo="Assuntos das configurações"
        ancoras={{ verificacao: "organizacao", contrato: "organizacao" }}
        abas={[
          {
            id: "conta",
            titulo: "Conta e segurança",
            conteudo: (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <TwoFactorCard />
                  <TrocarSenha />
                </div>
                <TelefoneDoOrganizadorCard />
              </div>
            ),
          },
          {
            id: "organizacao",
            titulo: "Organização e perfil",
            conteudo: (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <OrganizerCard />
                  <EnderecoDaOrganizacaoCard />
                </div>
                <ContratoPromotoraCard plataforma={plataforma} />
                {plataforma ? null : <SociosDaOrganizacaoCard />}
                <PerfilPublicoCard />
                {plataforma ? <CoresDoSeloCard /> : <VerificacaoDaOrganizacaoCard />}
              </div>
            ),
          },
          {
            id: "vendas",
            titulo: "Vendas e pagamentos",
            conteudo: (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <PaymentMethodsCard />
                {plataforma ? (
                  <>
                    <PagamentosCard />
                    <WhatsAppCard />
                  </>
                ) : (
                  <>
                    <ComissaoCard />
                    <ReembolsoCard />
                  </>
                )}
              </div>
            ),
          },
          // A trilha é só da plataforma, e longa: numa aba própria, não no fim da conta.
          ...(plataforma
            ? [
                {
                  id: "auditoria",
                  titulo: "Trilha de auditoria",
                  conteudo: (
                    <Card title="Trilha de auditoria" right={<span className="label-xs">últimas 200 ações</span>}>
                      <ul className="divide-y divide-line">
                        {data?.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                            <span className="tnum text-[11px] text-muted">{new Date(a.createdAt).toLocaleString("pt-BR")}</span>
                            <span className="tnum min-w-0 flex-1 break-words">{a.action}</span>
                            <span className="label-xs">{a.actorRole}</span>
                          </li>
                        ))}
                      </ul>
                      {data?.length === 0 ? <Empty>Nenhuma ação registrada.</Empty> : null}
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
      />
    </PanelShell>
  );
}
