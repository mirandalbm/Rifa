import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Pill } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { EXPORTS, exportFilename, type ExportInfo } from "@shared/exports";

/** O painel devolve campanha e contadores juntos; aqui só a campanha importa. */
interface LinhaCampanha {
  campaign: { id: string; slug: string; title: string; status: string };
}

/** "2026-10-01" → "01/10/2026", sem passar por Date (o campo já dá a data certa). */
const diaBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * Exportações.
 *
 * A tela é deliberadamente sem graça: escolher o relatório, o recorte e
 * baixar. O que ela precisa fazer bem é uma coisa só — avisar, **antes** do
 * download, quando o arquivo leva nome, telefone e CPF. Depois de baixado o
 * arquivo sai do controle do sistema, e quem responde por ele é quem clicou.
 */
export function AdminExportacoes() {
  const { data: linhas } = useQuery<LinhaCampanha[]>({
    queryKey: ["/api/admin/campaigns"],
  });
  const campanhas = linhas?.map((l) => l.campaign);

  const [campanha, setCampanha] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const urlDe = (info: ExportInfo) => {
    const q = new URLSearchParams();
    if (campanha) q.set("campanha", campanha);
    if (de) q.set("de", de);
    if (ate) q.set("ate", ate);
    const busca = q.toString();
    return `/api/admin/exportacoes/${info.key}${busca ? `?${busca}` : ""}`;
  };

  // O recorte aplicado, em texto, ao lado de cada botão: a rifa (ou todas) e as datas.
  const nomeDaCampanha = campanhas?.find((c) => c.id === campanha)?.title;
  const recorte = [
    campanha ? (nomeDaCampanha ?? "a rifa escolhida") : "todas as rifas",
    de && ate ? `de ${diaBr(de)} a ${diaBr(ate)}` : de ? `a partir de ${diaBr(de)}` : ate ? `até ${diaBr(ate)}` : "sem recorte de data",
  ].join(" · ");

  async function baixar(info: ExportInfo) {
    setErro(null);

    if (info.campanhaObrigatoria && !campanha) {
      setErro(`"${info.label}" precisa de uma campanha escolhida.`);
      return;
    }
    if (de && ate && de > ate) {
      setErro("A data inicial é depois da final.");
      return;
    }

    setBaixando(info.key);
    try {
      const res = await fetch(urlDe(info), { credentials: "include" });

      if (!res.ok) {
        const corpo = await res.json().catch(() => ({}));
        setErro(corpo.message ?? "Não foi possível gerar o relatório.");
        return;
      }

      // O arquivo passa pela memória do navegador para que a falha volte como
      // mensagem em vez de uma página de erro no lugar da tela. Num relatório
      // de meio milhão de linhas isso é uns 50 MB — pesado, mas exportação de
      // rifa grande se faz no computador, não no celular na fila do banco.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        nomeDoCabecalho(res.headers.get("content-disposition")) ??
        exportFilename(info.key, campanhaSlug(campanhas, campanha));
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("A conexão caiu no meio do download. Tente de novo.");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <PanelShell title="Exportações">
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}

      <CartaoDoPainel titulo="Recorte">
        {/* No celular a rifa ocupa a linha e as datas dividem a seguinte; do computador em diante, tudo numa linha. */}
        <div className="grid grid-cols-2 items-end gap-3 px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <Campo rotulo="Campanha" className="col-span-2 min-w-0 lg:col-span-1">
            <select id="exp-campanha" value={campanha} onChange={(e) => setCampanha(e.target.value)}>
              <option value="">todas as rifas</option>
              {campanhas?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="De" className="min-w-0">
            <input id="exp-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="campo tnum min-w-0" />
          </Campo>
          <Campo rotulo="Até" className="min-w-0">
            <input id="exp-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="campo tnum min-w-0" />
          </Campo>
          {de || ate || campanha ? (
            <Button
              variant="cinza"
              className="col-span-2 justify-self-start lg:col-span-1"
              onClick={() => {
                setCampanha("");
                setDe("");
                setAte("");
              }}
            >
              limpar
            </Button>
          ) : null}
        </div>

        <p className="px-5 pb-5 pt-3 text-xs text-muted">
          O recorte de data vale pelo momento do pedido, e o dia final entra inteiro. Sem recorte, o relatório sai com tudo.
        </p>
      </CartaoDoPainel>

      {/* Um cartão por relatório: coluna única até o tablet, duas colunas no computador. */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:gap-6 lg:grid-cols-2">
        {EXPORTS.map((info) => {
          const faltaCampanha = info.campanhaObrigatoria && !campanha;

          return (
            <CartaoDoPainel key={info.key} titulo={info.label}>
              <div className="flex flex-col gap-3 px-5 pb-5">
                {info.campanhaObrigatoria || info.dadoPessoal ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {info.campanhaObrigatoria ? <Pill status="reserved">exige campanha</Pill> : null}
                    {info.dadoPessoal ? <Pill status="blocked">leva dado pessoal</Pill> : null}
                  </div>
                ) : null}

                <p className="text-sm text-muted">{info.hint}</p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => baixar(info)}
                    disabled={baixando !== null || faltaCampanha}
                    title={`Arquivo CSV em português (pt-BR) · ${recorte}`}
                  >
                    {baixando === info.key ? "gerando…" : "Baixar CSV"}
                  </Button>
                  {/* O formato e o recorte que vai no arquivo, em texto, ao lado do botão. */}
                  <span className="min-w-0 text-xs text-muted">{faltaCampanha ? "escolha uma campanha acima" : `pt-BR · ${recorte}`}</span>
                </div>
              </div>
            </CartaoDoPainel>
          );
        })}
      </div>

      <CartaoDoPainel titulo="Antes de baixar" className="mt-4 md:mt-6">
        <ul className="space-y-2 px-5 pb-5 text-sm text-muted">
          <li>
            Os relatórios marcados com <b>leva dado pessoal</b> carregam nome, telefone e CPF de quem comprou. Todo download fica
            registrado na trilha de auditoria, com quem baixou, quando e qual recorte.
          </li>
          <li>
            O arquivo abre direto no Excel e no LibreOffice em português: separador ponto e vírgula, vírgula decimal e acento
            preservado. As colunas de dinheiro somam.
          </li>
          <li>
            A semente do sorteio só sai depois que o sorteio aconteceu. Antes disso, quem a tivesse poderia calcular o número e
            comprar a cota.
          </li>
        </ul>
      </CartaoDoPainel>
    </PanelShell>
  );
}

/** O nome que o servidor mandou, que já vem com a data do dia. */
function nomeDoCabecalho(header: string | null): string | null {
  const m = header ? /filename="([^"]+)"/.exec(header) : null;
  return m ? m[1] : null;
}

function campanhaSlug(
  lista: { id: string; slug: string }[] | undefined,
  id: string,
): string | null {
  return lista?.find((c) => c.id === id)?.slug ?? null;
}
