import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Campo, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerFoto } from "@/lib/anexo";
import {
  DOCUMENTOS_DA_ENTIDADE,
  DOCUMENTO_DA_ENTIDADE_MAX_BYTES,
  SITUACOES_DOS_DOCUMENTOS,
  documentosQueFaltam,
  type DocumentoDaEntidade,
  type SituacaoDosDocumentos,
  NOME_DA_ENTIDADE_MAX,
  REDES_DA_ENTIDADE,
  TEXTO_DA_ENTIDADE_MAX,
  type RedeDaEntidade,
} from "@shared/bannerDivulgacao";
import { REDES_DO_RODAPE } from "@shared/template";
import { cnpjValido, formatarCnpj } from "@shared/format";

interface EntidadeDoPainel {
  nome: string;
  cnpj: string | null;
  documentos: SituacaoDosDocumentos;
  motivo: string | null;
  enviados: { tipo: DocumentoDaEntidade; em: string }[];
  texto: string;
  site: string | null;
  redes: { rede: RedeDaEntidade; link: string }[];
  imagem: string;
}

const PILL_DA_SITUACAO: Record<SituacaoDosDocumentos, string> = {
  pendente: "pending",
  em_analise: "pending",
  aprovado: "published",
  recusado: "expired",
};

/** CNPJ enquanto digita: 12.345.678/0001-90. */
function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function lerDocumento(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (arquivo.size > DOCUMENTO_DA_ENTIDADE_MAX_BYTES) {
      reject(new Error("O arquivo passa de 5 MB. Envie um menor."));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    r.readAsDataURL(arquivo);
  });
}

const redesVazias = () => Object.fromEntries(REDES_DA_ENTIDADE.map((r) => [r, ""])) as Record<RedeDaEntidade, string>;

/**
 * A entidade beneficiada pela rifa (ONG, fundação, outra organização): só
 * quando a rifa beneficia alguém. O banner dela vai em cima da rifa e, tocado,
 * abre a tela da entidade — a imagem grande, o texto, o site e as redes.
 * Muda a qualquer hora, antes ou depois de publicar (não é termo da rifa).
 */
export function BannerDivulgacaoCard({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const chave = [`/api/admin/campaigns/${campaignId}/banner-divulgacao`];
  const { data } = useQuery<EntidadeDoPainel | null>({ queryKey: chave });
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [texto, setTexto] = useState("");
  const [site, setSite] = useState("");
  const [redes, setRedes] = useState(redesVazias);
  const [imagem, setImagem] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setNome(data?.nome ?? "");
    setCnpj(data?.cnpj ? formatarCnpj(data.cnpj) : "");
    setTexto(data?.texto ?? "");
    setSite(data?.site ?? "");
    const r = redesVazias();
    for (const x of data?.redes ?? []) r[x.rede] = x.link;
    setRedes(r);
  }, [data]);

  const tem = Boolean(data);
  const mostrar = tem || aberto;
  const mudar = <T,>(f: (v: T) => void) => (v: T) => {
    setMsg(null);
    f(v);
  };

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/campaigns/${campaignId}/banner-divulgacao`, {
        nome,
        cnpj,
        texto,
        site,
        redes: REDES_DA_ENTIDADE.map((rede) => ({ rede, link: redes[rede] })),
        ...(imagem ? { imagem } : {}),
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo. O banner aparece em cima da rifa depois que a plataforma conferir os documentos." });
      setImagem(null);
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const remover = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/campaigns/${campaignId}/banner-divulgacao`),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Entidade retirada: nada aparece em cima da rifa." });
      setImagem(null);
      setAberto(false);
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const enviar = useMutation({
    mutationFn: (v: { tipo: DocumentoDaEntidade; arquivo: string }) =>
      apiRequest("PUT", `/api/admin/campaigns/${campaignId}/banner-divulgacao/documentos/${v.tipo}`, { arquivo: v.arquivo }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Documento enviado." });
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const previa = imagem ?? data?.imagem ?? null;
  const podeSalvar =
    nome.trim().length >= 3 && cnpjValido(cnpj) && texto.trim().length >= 10 && Boolean(imagem || tem) && !salvar.isPending;
  const enviados = new Set((data?.enviados ?? []).map((d) => d.tipo));
  const faltam = documentosQueFaltam([...enviados]);

  return (
    <Card
      title="Entidade beneficiada"
      right={data ? <Pill status={PILL_DA_SITUACAO[data.documentos]}>{SITUACOES_DOS_DOCUMENTOS[data.documentos]}</Pill> : null}
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          Esta rifa beneficia uma ONG, uma fundação ou outra organização? Cadastre aqui: o banner dela aparece em cima da
          rifa e, tocado, abre uma tela com a imagem, o que ela faz, o site e as redes. Sem entidade beneficiada, nada
          aparece. Muda a qualquer hora, inclusive com a rifa no ar. O banner só aparece depois que a plataforma
          conferir o CNPJ ativo, a ata da diretoria e a certidão de regularidade fiscal da entidade.
        </p>
        {!mostrar ? (
          <Button variant="ghost" onClick={() => setAberto(true)}>
            Esta rifa beneficia uma entidade
          </Button>
        ) : (
          <>
            {previa ? (
              <img src={previa} alt={nome || "Prévia do banner"} className="aspect-[3/1] w-full max-w-2xl rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-[3/1] w-full max-w-2xl items-center justify-center rounded-xl border border-dashed border-line-2 text-xs text-muted">
                Sem imagem
              </div>
            )}
            <div>
              {/* O botão é o rótulo (como em "Escolher fotos"): o campo nativo
                  mostraria "Choose File" na língua do navegador. */}
              <label className="relative inline-flex cursor-pointer items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold focus-within:ring-2 focus-within:ring-green">
                {previa ? "Trocar a imagem" : "Escolher a imagem"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setMsg(null);
                    try {
                      setImagem(await lerFoto(f, 2400));
                    } catch (err) {
                      setMsg({ ok: false, texto: (err as Error).message });
                    }
                  }}
                />
              </label>
              <p className="mt-1 text-[11px] text-muted">
                A mesma imagem vira o banner (largo, 3 por 1, cortado ao centro) e a imagem grande da tela da entidade.
                Sem Pix, telefone ou link desenhado na imagem.
              </p>
            </div>
            <Campo rotulo="Nome da entidade" dica="Também é o que o leitor de tela lê no banner.">
              <input type="text" value={nome} maxLength={NOME_DA_ENTIDADE_MAX} onChange={(e) => mudar(setNome)(e.target.value)} />
            </Campo>
            <Campo rotulo="CNPJ da entidade" dica="Trocar o nome ou o CNPJ volta a conferência dos documentos à análise.">
              <input
                type="text"
                inputMode="numeric"
                value={cnpj}
                className="campo tnum text-sm"
                onChange={(e) => mudar(setCnpj)(mascaraCnpj(e.target.value))}
              />
            </Campo>
            <Campo rotulo="O que a entidade faz" dica="Os dizeres e as realizações. Sem link e sem telefone — o site e as redes vão nos campos abaixo.">
              <textarea rows={5} value={texto} maxLength={TEXTO_DA_ENTIDADE_MAX} onChange={(e) => mudar(setTexto)(e.target.value)} />
            </Campo>
            <Campo rotulo="Site (opcional)" dica="Só endereço https.">
              <input type="url" inputMode="url" value={site} placeholder="https://" onChange={(e) => mudar(setSite)(e.target.value)} />
            </Campo>
            <fieldset className="space-y-2">
              <legend className="label-xs">Redes sociais (opcional)</legend>
              {REDES_DA_ENTIDADE.map((rede) => (
                <Campo key={rede} rotulo={REDES_DO_RODAPE[rede].nome}>
                  <input
                    type="url"
                    inputMode="url"
                    value={redes[rede]}
                    placeholder="https://"
                    onChange={(e) => mudar((v: string) => setRedes((r) => ({ ...r, [rede]: v })))(e.target.value)}
                  />
                </Campo>
              ))}
            </fieldset>
            {tem ? (
              <fieldset className="space-y-2 rounded-lg border border-line p-3">
                <legend className="label-xs px-1">Documentos da entidade</legend>
                {data?.documentos === "recusado" && data.motivo ? (
                  <p role="status" className="text-xs text-red">
                    A plataforma recusou: {data.motivo} Envie de novo o que for preciso.
                  </p>
                ) : null}
                <p className="text-[11px] text-muted">
                  Foto ou PDF, até 5 MB cada. Ficam guardados cifrados e só a plataforma os abre.
                  {faltam.length ? ` Faltam: ${faltam.map((t) => DOCUMENTOS_DA_ENTIDADE[t]).join(", ")}.` : ""}
                </p>
                <ul className="space-y-1">
                  {(Object.keys(DOCUMENTOS_DA_ENTIDADE) as DocumentoDaEntidade[]).map((tipo) => (
                    <li key={tipo} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        {DOCUMENTOS_DA_ENTIDADE[tipo]}
                        <span className="ml-2 text-xs text-muted">{enviados.has(tipo) ? "enviado" : "não enviado"}</span>
                      </span>
                      <label className="relative inline-flex cursor-pointer items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold focus-within:ring-2 focus-within:ring-green">
                        {enviados.has(tipo) ? "Trocar" : "Enviar"}
                        <span className="sr-only"> {DOCUMENTOS_DA_ENTIDADE[tipo]}</span>
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={enviar.isPending}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            setMsg(null);
                            try {
                              enviar.mutate({ tipo, arquivo: await lerDocumento(f) });
                            } catch (err) {
                              setMsg({ ok: false, texto: (err as Error).message });
                            }
                          }}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
            {msg ? (
              <p role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
                {msg.texto}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!podeSalvar} onClick={() => salvar.mutate()}>
                Salvar entidade
              </Button>
              {tem ? (
                <Button variant="ghost" disabled={remover.isPending} onClick={() => remover.mutate()}>
                  Retirar a entidade
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </>
        )}
        {!mostrar && msg ? (
          <p role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
