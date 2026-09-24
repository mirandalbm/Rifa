import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill } from "@/components/bits";
import { EXPORTS, exportFilename, type ExportInfo } from "@shared/exports";

/** O painel devolve campanha e contadores juntos; aqui só a campanha importa. */
interface LinhaCampanha {
  campaign: { id: string; slug: string; title: string; status: string };
}

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
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}

      <Card title="Recorte">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="exp-campanha" className="label-xs">
              Campanha
            </label>
            <select
              id="exp-campanha"
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            >
              <option value="">todas as rifas</option>
              {campanhas?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="exp-de" className="label-xs">
              De
            </label>
            <input
              id="exp-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="tnum mt-1 rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="exp-ate" className="label-xs">
              Até
            </label>
            <input
              id="exp-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="tnum mt-1 rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>

          {de || ate || campanha ? (
            <Button
              variant="ghost"
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

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          O recorte de data vale pelo momento do pedido, e o dia final entra
          inteiro. Sem recorte, o relatório sai com tudo.
        </p>
      </Card>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {EXPORTS.map((info) => {
          const faltaCampanha = info.campanhaObrigatoria && !campanha;

          return (
            <Card key={info.key} title={info.label}>
              {/* Sem `h-full`: o Card é uma section com overflow-hidden e
                  altura vinda do conteúdo — 100% de uma altura indefinida
                  passa a contar o cabeçalho duas vezes e o botão some
                  cortado na borda de baixo. */}
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {info.campanhaObrigatoria ? (
                    <Pill status="reserved">exige campanha</Pill>
                  ) : null}
                  {info.dadoPessoal ? (
                    <Pill status="blocked">leva dado pessoal</Pill>
                  ) : null}
                </div>

                <p className="text-sm text-muted">{info.hint}</p>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => baixar(info)}
                    disabled={baixando !== null || faltaCampanha}
                  >
                    {baixando === info.key ? "gerando…" : "Baixar CSV"}
                  </Button>
                  {faltaCampanha ? (
                    <span className="text-xs text-muted">escolha uma campanha acima</span>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Antes de baixar">
        <ul className="space-y-2 p-4 text-sm text-muted">
          <li>
            Os relatórios marcados com <b>leva dado pessoal</b> carregam nome,
            telefone e CPF de quem comprou. Todo download fica registrado na
            trilha de auditoria, com quem baixou, quando e qual recorte.
          </li>
          <li>
            O arquivo abre direto no Excel e no LibreOffice em português:
            separador ponto e vírgula, vírgula decimal e acento preservado. As
            colunas de dinheiro somam.
          </li>
          <li>
            A semente do sorteio só sai depois que o sorteio aconteceu. Antes
            disso, quem a tivesse poderia calcular o número e comprar a cota.
          </li>
        </ul>
      </Card>
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
