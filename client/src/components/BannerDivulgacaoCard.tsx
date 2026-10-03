import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Campo } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerFoto } from "@/lib/anexo";
import { BANNER_DIVULGACAO_TITULO_MAX, problemaNoTituloDoBanner } from "@shared/bannerDivulgacao";

interface BannerDoPainel {
  titulo: string;
  imagem: string;
}

/**
 * O banner de divulgação em cima da rifa: a organização escolhe a imagem (a
 * empresa dela, uma ONG que apoia) e a descrição. Muda a qualquer hora —
 * antes ou depois de publicar —, porque não é termo da rifa. Opcional: sem
 * ele, nada aparece em cima da rifa.
 */
export function BannerDivulgacaoCard({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const chave = [`/api/admin/campaigns/${campaignId}/banner-divulgacao`];
  const { data } = useQuery<BannerDoPainel | null>({ queryKey: chave });
  const [titulo, setTitulo] = useState("");
  const [imagem, setImagem] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setTitulo(data?.titulo ?? ""), [data?.titulo]);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    setImagem(null);
  };
  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/campaigns/${campaignId}/banner-divulgacao`, imagem ? { titulo, imagem } : { titulo }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Banner salvo: aparece em cima da rifa." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const remover = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/campaigns/${campaignId}/banner-divulgacao`),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Banner retirado." });
      setTitulo("");
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const problema = titulo ? problemaNoTituloDoBanner(titulo) : null;
  const previa = imagem ?? data?.imagem ?? null;
  const podeSalvar = Boolean(titulo.trim()) && !problema && Boolean(imagem || data) && !salvar.isPending;

  return (
    <Card title="Banner de divulgação">
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          Uma imagem em cima da rifa para divulgar a sua empresa, uma ONG que você apoia ou o que quiser. Opcional — sem
          ela, nada aparece ali. Muda a qualquer hora, inclusive com a rifa no ar.
        </p>
        {previa ? (
          <img src={previa} alt={titulo || "Prévia do banner"} className="aspect-[3/1] w-full max-w-2xl rounded-xl object-cover" />
        ) : (
          <div className="flex aspect-[3/1] w-full max-w-2xl items-center justify-center rounded-xl border border-dashed border-line-2 text-xs text-muted">
            Sem banner
          </div>
        )}
        <div>
          <label htmlFor={`banner-div-${campaignId}`} className="label-xs">
            {data || imagem ? "Trocar a imagem" : "Escolher a imagem"}
          </label>
          <input
            id={`banner-div-${campaignId}`}
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
            Formato largo (3 por 1), cortado ao centro. Sem Pix, telefone ou link na imagem — o contato fica no perfil.
          </p>
        </div>
        <Campo rotulo="Descrição da imagem" dica="O que o leitor de tela lê. Sem link e sem telefone." erro={problema ?? undefined}>
          <input
            type="text"
            value={titulo}
            maxLength={BANNER_DIVULGACAO_TITULO_MAX}
            onChange={(e) => {
              setMsg(null);
              setTitulo(e.target.value);
            }}
          />
        </Campo>
        {msg ? (
          <p role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!podeSalvar} onClick={() => salvar.mutate()}>
            Salvar banner
          </Button>
          {data ? (
            <Button variant="ghost" disabled={remover.isPending} onClick={() => remover.mutate()}>
              Retirar o banner
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
