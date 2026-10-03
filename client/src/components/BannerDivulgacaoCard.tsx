import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Campo } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerFoto } from "@/lib/anexo";
import {
  NOME_DA_ENTIDADE_MAX,
  REDES_DA_ENTIDADE,
  TEXTO_DA_ENTIDADE_MAX,
  type RedeDaEntidade,
} from "@shared/bannerDivulgacao";
import { REDES_DO_RODAPE } from "@shared/template";

interface EntidadeDoPainel {
  nome: string;
  texto: string;
  site: string | null;
  redes: { rede: RedeDaEntidade; link: string }[];
  imagem: string;
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
  const [texto, setTexto] = useState("");
  const [site, setSite] = useState("");
  const [redes, setRedes] = useState(redesVazias);
  const [imagem, setImagem] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setNome(data?.nome ?? "");
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
        texto,
        site,
        redes: REDES_DA_ENTIDADE.map((rede) => ({ rede, link: redes[rede] })),
        ...(imagem ? { imagem } : {}),
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo: o banner da entidade aparece em cima da rifa." });
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

  const previa = imagem ?? data?.imagem ?? null;
  const podeSalvar = nome.trim().length >= 3 && texto.trim().length >= 10 && Boolean(imagem || tem) && !salvar.isPending;

  return (
    <Card title="Entidade beneficiada">
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          Esta rifa beneficia uma ONG, uma fundação ou outra organização? Cadastre aqui: o banner dela aparece em cima da
          rifa e, tocado, abre uma tela com a imagem, o que ela faz, o site e as redes. Sem entidade beneficiada, nada
          aparece. Muda a qualquer hora, inclusive com a rifa no ar.
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
              <label htmlFor={`entidade-img-${campaignId}`} className="label-xs">
                {previa ? "Trocar a imagem" : "Escolher a imagem"}
              </label>
              <input
                id={`entidade-img-${campaignId}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm"
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
              <p className="mt-1 text-[11px] text-muted">
                A mesma imagem vira o banner (largo, 3 por 1, cortado ao centro) e a imagem grande da tela da entidade.
                Sem Pix, telefone ou link desenhado na imagem.
              </p>
            </div>
            <Campo rotulo="Nome da entidade" dica="Também é o que o leitor de tela lê no banner.">
              <input type="text" value={nome} maxLength={NOME_DA_ENTIDADE_MAX} onChange={(e) => mudar(setNome)(e.target.value)} />
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
