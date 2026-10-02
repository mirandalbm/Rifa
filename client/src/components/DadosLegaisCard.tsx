import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import {
  CERTIFICADO_MAX_BYTES,
  CERTIFICADO_MIMES,
  EXPLICACAO_DO_MODO,
  MODOS_DO_SORTEIO,
  ROTULO_DO_MODO,
  cotasMinimasParaSortear,
  minimoDoModo,
  modoSemData,
  type ModoDoSorteio,
  problemaNoMinimoVendido,
  problemaNosDadosLegais,
} from "@shared/campanhaLegal";
import { REGULAMENTO_EXTRA_MAX } from "@shared/regulamento";
import { transmissaoValida } from "@shared/sorteio";

interface Campanha {
  id: string;
  status: string;
  drawAt: string | null;
  authorizationCode: string | null;
  authorizationFileKey?: string | null;
  regulamentoExtra?: string | null;
  aceitaCotaBonus?: boolean;
  minimoVendidoPct?: number;
  modoSorteio?: string;
  totalQuotas?: number;
  transmissaoUrl?: string | null;
  slug?: string;
}

/** ISO → valor do `<input type="datetime-local">`, no fuso de quem está vendo. */
function paraCampoLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function lerArquivo(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CERTIFICADO_MIMES.includes(arquivo.type)) {
      reject(new Error("Envie o certificado em PDF, JPG ou PNG."));
      return;
    }
    if (arquivo.size > CERTIFICADO_MAX_BYTES) {
      reject(new Error("O certificado passa de 5 MB. Envie um arquivo menor."));
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Autorização SPA/MF e data do sorteio — o que a lei exige de cada rifa, e
 * o que o servidor cobra para publicar. Trava ao publicar: quem comprou
 * comprou aquela data e aquela autorização.
 */
export function DadosLegaisCard({ campanha }: { campanha: Campanha }) {
  const qc = useQueryClient();
  const rascunho = campanha.status === "draft";
  const [codigo, setCodigo] = useState(campanha.authorizationCode ?? "");
  const [data, setData] = useState(paraCampoLocal(campanha.drawAt));
  const [arquivo, setArquivo] = useState<{ dataUrl: string; nome: string } | null>(null);
  const [extra, setExtra] = useState(campanha.regulamentoExtra ?? "");
  const [bonus, setBonus] = useState(Boolean(campanha.aceitaCotaBonus));
  const [minimo, setMinimo] = useState(String(campanha.minimoVendidoPct ?? 0));
  const [modo, setModo] = useState<ModoDoSorteio>((campanha.modoSorteio as ModoDoSorteio) ?? "data");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setCodigo(campanha.authorizationCode ?? "");
    setData(paraCampoLocal(campanha.drawAt));
    setArquivo(null);
    setExtra(campanha.regulamentoExtra ?? "");
    setBonus(Boolean(campanha.aceitaCotaBonus));
    setMinimo(String(campanha.minimoVendidoPct ?? 0));
    setModo((campanha.modoSorteio as ModoDoSorteio) ?? "data");
    setMsg(null);
  }, [campanha.id, campanha.authorizationCode, campanha.drawAt, campanha.regulamentoExtra, campanha.aceitaCotaBonus, campanha.minimoVendidoPct, campanha.modoSorteio]);

  const { data: pendencias } = useQuery<{ blockers: string[] }>({
    queryKey: [`/api/admin/campaigns/${campanha.id}/blockers`],
    enabled: rascunho,
  });

  const semData = modoSemData(modo);
  const drawAt = data && !semData ? new Date(data) : null;
  const minimoDigitado = minimo.trim() === "" ? 0 : Number(minimo);
  // Nos modos de rifa cheia o mínimo é 100%; com a promotora completando, não há mínimo.
  const minimoPct = modo === "data" ? minimoDigitado : minimoDoModo(modo, minimoDigitado);
  const problema =
    problemaNosDadosLegais({ authorizationCode: codigo.trim() ? codigo : null, drawAt }, new Date()) ??
    problemaNoMinimoVendido(minimoPct);

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/campaigns/${campanha.id}/legal`, {
        authorizationCode: codigo,
        drawAt: drawAt ? drawAt.toISOString() : null,
        certificado: arquivo,
        regulamentoExtra: extra,
        aceitaCotaBonus: bonus,
        minimoVendidoPct: minimoPct,
        modoSorteio: modo,
      }),
    onSuccess: () => {
      setArquivo(null);
      setMsg({ ok: true, texto: "Salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/campaigns/${campanha.id}/blockers`] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const temCertificado = Boolean(campanha.authorizationFileKey);

  return (
    <Card
      title="Dados legais da rifa"
      right={rascunho ? <Pill status="pending">editável até publicar</Pill> : <Pill status="paid">travado</Pill>}
    >
      <div className="space-y-4 p-4 text-sm">
        <p className="text-xs text-muted">
          A autorização da SPA/MF é da campanha, não da plataforma. O número sai no bilhete e na
          página da rifa, e o certificado fica disponível para o apostador conferir.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`aut-${campanha.id}`} className="label-xs">
              Nº do certificado de autorização SPA/MF
            </label>
            <input
              id={`aut-${campanha.id}`}
              value={codigo}
              disabled={!rascunho}
              maxLength={80}
              placeholder="ex.: 03.021234/2026"
              onChange={(e) => {
                setMsg(null);
                setCodigo(e.target.value);
              }}
              className="campo tnum disabled:bg-mist"
            />
          </div>
          <div>
            <label htmlFor={`sorteio-${campanha.id}`} className="label-xs">
              Data e hora do sorteio
            </label>
            {semData ? (
              <p id={`sorteio-${campanha.id}`} className="mt-1 rounded-md bg-mist px-3 py-2 text-xs text-muted">
                {campanha.drawAt
                  ? `Marcado para ${new Date(campanha.drawAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
                  : "Sem data: é marcada sozinha quando a última cota for paga, na próxima extração da Loteria Federal."}
              </p>
            ) : (
              <input
                id={`sorteio-${campanha.id}`}
                type="datetime-local"
                value={data}
                disabled={!rascunho}
                onChange={(e) => {
                  setMsg(null);
                  setData(e.target.value);
                }}
                className="campo tnum disabled:bg-mist"
              />
            )}
          </div>
        </div>

        <fieldset>
          <legend className="label-xs">Como a rifa chega ao sorteio</legend>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODOS_DO_SORTEIO.map((m) => (
              <label
                key={m}
                className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${
                  modo === m ? "border-green bg-green-soft" : "border-line"
                } ${!rascunho ? "cursor-default opacity-80" : ""}`}
              >
                <input
                  type="radio"
                  name={`modo-${campanha.id}`}
                  value={m}
                  checked={modo === m}
                  disabled={!rascunho}
                  onChange={() => {
                    setMsg(null);
                    setModo(m);
                  }}
                  className="mt-1 h-4 w-4 accent-[var(--green)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{ROTULO_DO_MODO[m]}</span>
                  <span className="block text-xs text-muted">{EXPLICACAO_DO_MODO[m]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {modo === "data" ? (
        <div>
          <label htmlFor={`minimo-${campanha.id}`} className="label-xs">
            Mínimo de cotas vendidas para sortear (%)
          </label>
          <input
            id={`minimo-${campanha.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={minimo}
            disabled={!rascunho}
            onChange={(e) => {
              setMsg(null);
              setMinimo(e.target.value);
            }}
            className="campo tnum max-w-[10rem] disabled:bg-mist"
            aria-describedby={`minimo-dica-${campanha.id}`}
          />
          <p id={`minimo-dica-${campanha.id}`} className="mt-1 text-xs text-muted">
            {minimoPct > 0 && !problemaNoMinimoVendido(minimoPct)
              ? `O sorteio só roda com ${minimoPct}%${
                  campanha.totalQuotas ? ` (${cotasMinimasParaSortear(campanha.totalQuotas, minimoPct).toLocaleString("pt-BR")} cotas)` : ""
                } vendido. Abaixo disso, peça o adiamento da data. Entra no regulamento e trava ao publicar.`
              : "0 = sem mínimo. Use o que a autorização da SPA/MF prevê; entra no regulamento e trava ao publicar."}
          </p>
        </div>
        ) : null}

        <div>
          <label htmlFor={`cert-${campanha.id}`} className="label-xs">
            Arquivo do certificado (PDF, JPG ou PNG, até 5 MB)
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {rascunho ? (
              <input
                id={`cert-${campanha.id}`}
                type="file"
                accept={CERTIFICADO_MIMES.join(",")}
                className="text-xs"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return setArquivo(null);
                  try {
                    setArquivo({ dataUrl: await lerArquivo(f), nome: f.name });
                    setMsg(null);
                  } catch (err) {
                    setMsg({ ok: false, texto: (err as Error).message });
                    e.target.value = "";
                  }
                }}
              />
            ) : null}
            {temCertificado ? (
              <a
                href={`/api/admin/campaigns/${campanha.id}/certificado`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-green-deep underline"
              >
                ver certificado enviado
              </a>
            ) : (
              <span className="text-xs text-muted">nenhum arquivo enviado</span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`reg-${campanha.id}`} className="label-xs">
            Regulamento: disposições da promotora (opcional)
          </label>
          <textarea
            id={`reg-${campanha.id}`}
            value={extra}
            rows={4}
            disabled={!rascunho}
            maxLength={REGULAMENTO_EXTRA_MAX}
            placeholder="Ex.: forma de entrega do prêmio, retirada no endereço da promotora, divulgação do ganhador…"
            onChange={(e) => {
              setMsg(null);
              setExtra(e.target.value);
            }}
            className="campo disabled:bg-mist"
          />
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={bonus}
              disabled={!rascunho}
              onChange={(e) => {
                setMsg(null);
                setBonus(e.target.checked);
              }}
              className="mt-1 h-4 w-4 accent-[var(--green)]"
            />
            <span>
              Aceitar cotas de bônus do programa de indicação
              <span className="block text-xs text-muted">
                Só marque se o regulamento aprovado pela SPA/MF prevê cotas grátis: a cláusula entra no regulamento
                desta rifa e trava ao publicar.
              </span>
            </span>
          </label>
          <p className="text-[11px] text-muted">
            O resto do regulamento (promotora, autorização, prêmios, numeração, sorteio, entrega e
            reembolso) é montado sozinho dos dados da rifa.
            {campanha.slug ? (
              <>
                {" "}
                <a href={`/r/${campanha.slug}/regulamento`} target="_blank" rel="noreferrer" className="text-green-deep underline">
                  ver regulamento
                </a>
              </>
            ) : null}
          </p>
        </div>

        {rascunho ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || Boolean(problema)}>
              {salvar.isPending ? "Salvando…" : "Salvar dados legais"}
            </Button>
            {problema && (codigo || data) ? <span className="text-xs text-red">{problema}</span> : null}
            {msg ? (
              <span className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>{msg.texto}</span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">
            Publicada: autorização e data do sorteio não mudam mais — quem comprou comprou esta data.
          </p>
        )}

        {rascunho && pendencias ? (
          <div className="rounded-md border border-line bg-mist px-3 py-2">
            <p className="label-xs">O que falta para publicar</p>
            {pendencias.blockers.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
                {pendencias.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-green-deep">Nada: a campanha pode ser publicada.</p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Link da live ou do vídeo do sorteio. Muda a qualquer hora — o link da live
 * só existe perto do sorteio, e o vídeo, depois. Aparece na página da rifa.
 */
export function TransmissaoCard({ campanha }: { campanha: Campanha }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(campanha.transmissaoUrl ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setUrl(campanha.transmissaoUrl ?? ""), [campanha.id, campanha.transmissaoUrl]);
  const invalido = url.trim() !== "" && !transmissaoValida(url.trim());
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/campaigns/${campanha.id}/transmissao`, { url: url.trim() }),
    onSuccess: () => {
      setMsg({ ok: true, texto: url.trim() ? "Link salvo: aparece na página da rifa." : "Link retirado." });
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <Card title="Transmissão do sorteio">
      <div className="space-y-2 p-4 text-sm">
        <label htmlFor={`live-${campanha.id}`} className="label-xs">
          Link da live ou do vídeo (YouTube, Instagram, Facebook…)
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`live-${campanha.id}`}
            value={url}
            onChange={(e) => {
              setMsg(null);
              setUrl(e.target.value);
            }}
            placeholder="https://"
            className="min-w-0 flex-1 rounded-md border border-line-2 px-3 py-2"
          />
          <Button onClick={() => salvar.mutate()} disabled={invalido || salvar.isPending}>
            Salvar link
          </Button>
        </div>
        {invalido ? <p className="text-xs text-red">Use o endereço https da live ou do vídeo.</p> : null}
        {msg ? <p className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>{msg.texto}</p> : null}
      </div>
    </Card>
  );
}
