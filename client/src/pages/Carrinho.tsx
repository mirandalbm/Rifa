import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Button, Money, Pill } from "@/components/bits";
import { FotoDoPerfil } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { esquecerCartela, porNoCarrinho, tirarBilheteDoCarrinho, tirarDoCarrinho, useCarrinho } from "@/lib/carrinho";
import { agruparPorOrganizacao, bilhetesDoItem, quantidadeNaFaixa } from "@shared/carrinho";
import { cpfValido, formatBRL, formatQuota, maskCpf, maskPhone } from "@shared/format";
import { corDaCasa } from "@/lib/quadro";
import { useSession } from "@/lib/session";
import { lerOrigem } from "@/lib/origem";
import { lerIndicacao } from "@/lib/indicacao";
import { consentiu, lerUtm } from "@/lib/marketing";
import { regraDoReembolso } from "@shared/reembolso";
import { AvisoDePrazo } from "@/components/AvisoDePrazo";
import { SO_VALE_PELA_PLATAFORMA } from "@shared/seguranca";

interface Item {
  slug: string;
  indisponivel: false;
  prizeTitle: string;
  priceCents: number;
  minPerOrder: number;
  maxPerOrder: number;
  quantidade: number;
  totalCents: number;
  /** A cartela escolhida na janela do "+" (sugestão; sem ela, os números são sorteados na compra). */
  numeros: number[] | null;
  totalQuotas: number;
  /** A rifa numera a partir de zero (`shared/apuracao.ts`). */
  numeracaoZero?: boolean;
  vende: boolean;
  status: string;
  drawAt: string | null;
  modoSorteio?: string;
  capa: { url: string; lqip?: string | null; role: string } | null;
  organizacao: { slug: string; nome: string; foto: string | null; verificada: boolean };
}
type Resposta = { itens: (Item | { slug: string; indisponivel: true })[] };

/**
 * O carrinho, separado por organização: cada promotora tem a própria
 * autorização e o próprio bilhete. O total de cada item é o do servidor;
 * aqui só se escolhe a quantidade. Paga-se de um jeito só: o Pix da
 * plataforma, com o botão de pagamento embaixo — o split para cada
 * promotora é interno e não aparece para quem compra. A cota só é tomada
 * ao pagar.
 */
export default function Carrinho() {
  const itens = useCarrinho();
  const { data, isLoading } = useQuery<Resposta>({
    queryKey: ["/api/public/carrinho", itens],
    queryFn: async () => (await apiRequest("POST", "/api/public/carrinho", { itens })).json(),
    enabled: itens.length > 0,
    placeholderData: (antes) => antes,
  });

  // Rifa que saiu do ar (ou de promotora arquivada) sai do carrinho sozinha.
  useEffect(() => {
    data?.itens.forEach((i) => {
      if (i.indisponivel) tirarDoCarrinho(i.slug);
    });
  }, [data]);

  const validos = (data?.itens ?? []).filter((i): i is Item => !i.indisponivel && itens.some((x) => x.slug === i.slug));
  const grupos = agruparPorOrganizacao(validos);
  const aVenda = validos.filter((i) => i.vende);
  const total = aVenda.reduce((s, i) => s + i.totalCents, 0);
  // Quantos bilhetes vão no Pix: os que a pessoa pôs, ou um por rifa sem cartela.
  const nBilhetes = aVenda.reduce(
    (s, i) => s + (i.numeros ? (bilhetesDoItem(itens.find((x) => x.slug === i.slug)?.bilhetes, i.numeros)?.length ?? 1) : 1),
    0,
  );

  return (
    <PublicShell larga>
      <h1 className="font-display text-xl font-extrabold">Carrinho</h1>
      {itens.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-sm text-muted">Seu carrinho está vazio.</p>
          <Link href="/" className="mt-3 inline-block text-sm font-semibold text-green-deep underline">
            Ver rifas no ar
          </Link>
        </div>
      ) : isLoading && !data ? (
        <p className="py-10 text-center text-sm text-muted">Carregando…</p>
      ) : (
        // No computador, as rifas à esquerda e o total com o Pix à direita,
        // fixo na rolagem; no celular, um embaixo do outro, como sempre.
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
          <div>
          <p className="mt-1 text-xs text-muted">
            Cada rifa continua com a autorização e o bilhete da promotora. Os números só ficam seus ao pagar.
          </p>
          <div className="mt-4 space-y-5">
            {grupos.map((g) => {
              const org = g.itens[0].organizacao;
              const subtotal = g.itens.filter((i) => i.vende).reduce((s, i) => s + i.totalCents, 0);
              return (
                <section key={g.slug} aria-label={org.nome} className="rounded-xl border border-line">
                  <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                    <Link href={`/o/${org.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <FotoDoPerfil nome={org.nome} foto={org.foto} tamanho={28} />
                      <span className="truncate text-sm font-semibold">{org.nome}</span>
                      {org.verificada ? <SeloVerificado sujeito="organizacao" tamanho={14} /> : null}
                    </Link>
                    <Money cents={subtotal} className="text-sm text-green-deep" />
                  </header>
                  <ul className="divide-y divide-line">
                    {g.itens.map((i) => (
                      <ItemDoCarrinho key={i.slug} item={i} bilhetes={itens.find((x) => x.slug === i.slug)?.bilhetes} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          </div>
          <aside aria-label="Pagar o carrinho" className="lg:sticky lg:top-[68px] lg:mt-1 lg:rounded-xl lg:border lg:border-line lg:p-4">
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-3 lg:mt-0 lg:border-t-0 lg:pt-0">
            <span className="text-sm">
              Total de <span className="tnum">{aVenda.length}</span> rifa{aVenda.length === 1 ? "" : "s"} ·{" "}
              <span className="tnum">{nBilhetes}</span> bilhete{nBilhetes === 1 ? "" : "s"}
            </span>
            <Money cents={total} className="text-lg font-bold text-green-deep" />
          </div>
          {aVenda.length ? <PagarCarrinho itens={aVenda} total={total} /> : null}
          </aside>
        </div>
      )}
    </PublicShell>
  );
}

function ItemDoCarrinho({ item: i, bilhetes: bilhetesGuardados }: { item: Item; bilhetes?: number[][] }) {
  const [texto, setTexto] = useState(String(i.quantidade));
  // Cada bilhete que a pessoa pôs, separado. Item antigo (sem a lista) é um bilhete só.
  const bilhetes = i.numeros ? (bilhetesDoItem(bilhetesGuardados, i.numeros) ?? [i.numeros]) : null;
  // Foto que não carrega some, em vez do ícone de imagem quebrada.
  const [semFoto, setSemFoto] = useState(false);
  useEffect(() => setTexto(String(i.quantidade)), [i.quantidade]);
  const mudar = (q: number) => porNoCarrinho(i.slug, quantidadeNaFaixa(q, i.minPerOrder, i.maxPerOrder));

  return (
    // A rifa numa faixa no topo (foto, título, preço e a lixeira) e, embaixo,
    // em largura inteira, os bilhetes dela.
    <li className="p-3">
      <div className="flex items-center gap-3">
        {/* A foto repete o link do título ao lado: fora da ordem do teclado e do leitor de tela. */}
        <Link
          href={`/o/${i.organizacao.slug}/r/${i.slug}`}
          aria-hidden
          tabIndex={-1}
          className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-mist"
        >
          {i.capa && i.capa.role !== "video" && !semFoto ? (
            <img src={i.capa.url} alt="" onError={() => setSemFoto(true)} className="h-full w-full object-cover" />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/o/${i.organizacao.slug}/r/${i.slug}`} className="block text-sm font-semibold leading-tight">
            {i.prizeTitle}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            <span className="tnum">{formatBRL(i.priceCents)}</span> por cota
          </p>
        </div>
        <button
          type="button"
          onClick={() => tirarDoCarrinho(i.slug)}
          aria-label={`Tirar ${i.prizeTitle} do carrinho`}
          className="self-start rounded-md p-1 text-muted hover:bg-mist hover:text-ink"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      <div className="min-w-0">
        {i.vende ? (
          bilhetes ? (
            <ol className="mt-3 space-y-2" aria-label={`Bilhetes de ${i.prizeTitle}`}>
              {bilhetes.map((b, k) => (
                <li key={b.join()} className="rounded-lg border border-line p-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-semibold">
                      Bilhete <span className="tnum">{k + 1}</span> ·{" "}
                      <span className="tnum font-normal text-muted">{b.length} números</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => tirarBilheteDoCarrinho(i.slug, k)}
                      aria-label={`Tirar o bilhete ${k + 1} de ${i.prizeTitle}`}
                      className="rounded-md p-1 text-muted hover:bg-mist hover:text-ink"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`Números do bilhete ${k + 1}`}>
                    {b.map((n) => (
                      <li key={n} className={`tnum quadro min-w-10 px-1 text-[10px] ${corDaCasa(n)}`}>
                        {formatQuota(n, i.totalQuotas, i.numeracaoZero === true)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Números sorteados na hora de pagar.</p>
          )
        ) : null}
        {i.vende && bilhetes ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              <span className="tnum">{bilhetes.length}</span> bilhete{bilhetes.length === 1 ? "" : "s"} ·{" "}
              <span className="tnum">{i.quantidade}</span> números
            </span>
            <Money cents={i.totalCents} className="text-sm text-green-deep" />
          </div>
        ) : null}
        {i.vende && !bilhetes ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-line-2">
              <button
                type="button"
                aria-label="Menos cotas"
                disabled={i.quantidade <= i.minPerOrder}
                onClick={() => mudar(i.quantidade - 1)}
                className="p-1.5 disabled:opacity-40"
              >
                <Minus size={14} aria-hidden />
              </button>
              <input
                aria-label={`Cotas de ${i.prizeTitle}`}
                inputMode="numeric"
                value={texto}
                onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
                onBlur={() => mudar(Number(texto))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") mudar(Number(texto));
                }}
                className="tnum w-14 border-x border-line-2 bg-white py-1 text-center text-sm"
              />
              <button
                type="button"
                aria-label="Mais cotas"
                disabled={i.quantidade >= i.maxPerOrder}
                onClick={() => mudar(i.quantidade + 1)}
                className="p-1.5 disabled:opacity-40"
              >
                <Plus size={14} aria-hidden />
              </button>
            </div>
            <Money cents={i.totalCents} className="text-sm text-green-deep" />
          </div>
        ) : i.vende ? null : (
          <div className="mt-2">
            <Pill status="closed">{i.status === "published" ? "Sem venda no momento" : "Vendas encerradas"}</Pill>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Seus dados e o botão de pagamento — o único do carrinho: nome, WhatsApp
 * e (se o provedor pedir) CPF, como na página da rifa. Vão rifa e
 * quantidade — o preço é do servidor, que reserva tudo ou nada e devolve o
 * Pix da plataforma para o carrinho inteiro.
 */
function PagarCarrinho({ itens, total }: { itens: Item[]; total: number }) {
  const [, navegar] = useLocation();
  const { data: sessao } = useSession();
  const naConta = Boolean(sessao?.buyer?.conta);
  const { data: checkout } = useQuery<{ exigeCpf: boolean; reembolso?: { aceita: boolean; taxaPct: number } }>({
    queryKey: ["/api/public/checkout"],
  });
  const exigeCpf = (checkout?.exigeCpf ?? false) && !naConta;
  const [dados, setDados] = useState({ name: "", phone: "", cpf: "" });
  const [erro, setErro] = useState<string | null>(null);
  const comprador = naConta
    ? { name: sessao!.buyer!.name || "Conta", phone: sessao!.buyer!.phone }
    : { name: dados.name, phone: dados.phone };
  const cpfOk = !exigeCpf || cpfValido(dados.cpf);
  const pronto = comprador.name.trim().length >= 2 && comprador.phone.replace(/\D/g, "").length >= 10 && cpfOk;

  const pagar = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/public/carrinho/checkout", {
          itens: itens.map((i) => ({ slug: i.slug, quantidade: i.quantidade, ...(i.numeros?.length ? { numeros: i.numeros } : {}) })),
          buyer: { ...comprador, ...(exigeCpf ? { cpf: dados.cpf.replace(/\D/g, "") } : {}) },
          origem: lerOrigem(),
          indicacao: lerIndicacao(),
          utm: lerUtm(),
          marketing: consentiu(),
        })
      ).json() as Promise<{ codigo: number }>,
    onSuccess: (r) => {
      // O que foi para o Pix sai do carrinho; o resto (sem venda agora) fica.
      itens.forEach((i) => tirarDoCarrinho(i.slug));
      navegar(`/carrinho/pix/${r.codigo}`);
    },
    onError: (e: Error) => {
      setErro(e.message);
      // Alguém levou um número da cartela: aquela rifa passa a sortear na hora.
      const slug = (e as ApiError).corpo?.slug;
      if (typeof slug === "string") esquecerCartela(slug);
    },
  });

  return (
    <section aria-label="Seus dados" className="mt-4 space-y-3 rounded-xl border border-line p-3">
      <h2 className="font-display text-base font-bold">Seus dados</h2>
      {naConta ? (
        <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
          Comprando como <strong>{comprador.name}</strong> · <span className="tnum">{maskPhone(comprador.phone)}</span>
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="carrinho-nome" className="label-xs">
              Nome
            </label>
            <input
              id="carrinho-nome"
              value={dados.name}
              onChange={(e) => setDados({ ...dados, name: e.target.value })}
              className="campo text-sm"
            />
          </div>
          <div>
            <label htmlFor="carrinho-whatsapp" className="label-xs">
              WhatsApp
            </label>
            <input
              id="carrinho-whatsapp"
              value={dados.phone}
              inputMode="tel"
              onChange={(e) => setDados({ ...dados, phone: e.target.value })}
              className="campo tnum text-sm"
            />
          </div>
        </>
      )}
      {exigeCpf ? (
        <div>
          <label htmlFor="carrinho-cpf" className="label-xs">
            CPF
          </label>
          <input
            id="carrinho-cpf"
            value={dados.cpf}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            onChange={(e) => setDados({ ...dados, cpf: maskCpf(e.target.value) })}
            className="campo tnum text-sm"
          />
          {dados.cpf.replace(/\D/g, "").length === 11 && !cpfOk ? (
            <p className="mt-1 text-[11px] text-red">CPF inválido. Confira os números.</p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Exigido pelo banco para gerar o Pix. Não aparece para ninguém.</p>
          )}
        </div>
      ) : null}
      <p className="text-[11px] text-muted">{SO_VALE_PELA_PLATAFORMA}</p>
      {checkout?.reembolso?.aceita ? (
        <>
          {itens
            .filter((i) => i.vende)
            .map((i) => (
              <AvisoDePrazo key={i.slug} sorteioEm={i.drawAt} modoSorteio={i.modoSorteio} rifa={i.prizeTitle} />
            ))}
          <p className="text-[11px] text-muted">{regraDoReembolso(checkout.reembolso.taxaPct)}</p>
        </>
      ) : null}
      <p className="text-[11px] text-muted">
        Ao comprar, você aceita o regulamento de cada rifa:{" "}
        {itens.map((i, n) => (
          <span key={i.slug}>
            {n ? ", " : ""}
            <Link href={`/o/${i.organizacao.slug}/r/${i.slug}/regulamento`} className="underline">
              {i.prizeTitle}
            </Link>
          </span>
        ))}
        , e os{" "}
        <Link href="/termos" className="underline">
          Termos de uso
        </Link>
        .
      </p>
      {erro ? (
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={!pronto || pagar.isPending}
        onClick={() => {
          setErro(null);
          pagar.mutate();
        }}
      >
        {pagar.isPending ? "Reservando…" : `Pagar ${formatBRL(total)} com Pix`}
      </Button>
    </section>
  );
}
