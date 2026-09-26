import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import {
  CERTIFICADO_MAX_BYTES,
  CERTIFICADO_MIMES,
  problemaNosDadosLegais,
} from "@shared/campanhaLegal";

interface Campanha {
  id: string;
  status: string;
  drawAt: string | null;
  authorizationCode: string | null;
  authorizationFileKey?: string | null;
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
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setCodigo(campanha.authorizationCode ?? "");
    setData(paraCampoLocal(campanha.drawAt));
    setArquivo(null);
    setMsg(null);
  }, [campanha.id, campanha.authorizationCode, campanha.drawAt]);

  const { data: pendencias } = useQuery<{ blockers: string[] }>({
    queryKey: [`/api/admin/campaigns/${campanha.id}/blockers`],
    enabled: rascunho,
  });

  const drawAt = data ? new Date(data) : null;
  const problema = problemaNosDadosLegais(
    { authorizationCode: codigo.trim() ? codigo : null, drawAt },
    new Date(),
  );

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/campaigns/${campanha.id}/legal`, {
        authorizationCode: codigo,
        drawAt: drawAt ? drawAt.toISOString() : null,
        certificado: arquivo,
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

        <div className="grid gap-3 sm:grid-cols-2">
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
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 disabled:bg-mist"
            />
          </div>
          <div>
            <label htmlFor={`sorteio-${campanha.id}`} className="label-xs">
              Data e hora do sorteio
            </label>
            <input
              id={`sorteio-${campanha.id}`}
              type="datetime-local"
              value={data}
              disabled={!rascunho}
              onChange={(e) => {
                setMsg(null);
                setData(e.target.value);
              }}
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 disabled:bg-mist"
            />
          </div>
        </div>

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
