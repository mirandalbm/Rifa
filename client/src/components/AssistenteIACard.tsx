import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENTE_ID_RE, type ConfigIA } from "@shared/ia";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Retorno {
  config: ConfigIA;
  segredoNoAmbiente: boolean;
}

/** O assistente de IA nos painéis: escolha da plataforma (liga, id do agente e liberação para o organizador). */
export function AssistenteIACard() {
  const qc = useQueryClient();
  const { data } = useQuery<Retorno>({ queryKey: ["/api/admin/ia/config"] });
  const [ligado, setLigado] = useState(false);
  const [agenteId, setAgenteId] = useState("");
  const [paraOrganizador, setParaOrganizador] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setLigado(data.config.ligado);
    setAgenteId(data.config.agenteId);
    setParaOrganizador(data.config.paraOrganizador);
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/admin/ia/config", { ligado, agenteId, paraOrganizador })).json(),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Assistente salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/ia/config"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ia/sessao"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const idInvalido = agenteId.trim() !== "" && !AGENTE_ID_RE.test(agenteId.trim());
  return (
    <div className="mb-3">
      <Card title="Assistente de IA (Chatbase)">
        <div className="space-y-4 p-4 text-sm">
          <p className="text-xs text-muted">
            Um assistente no painel do administrador master e, se você liberar, do organizador. A identidade de quem fala é
            verificada pelo servidor e nós não enviamos dado pessoal de comprador a ele. Atenção: o script do Chatbase roda na
            página do painel e enxerga o que ela mostra.
          </p>
          <p className={`text-xs ${data?.segredoNoAmbiente ? "text-green-deep" : "text-red"}`}>
            {data?.segredoNoAmbiente
              ? "O segredo de verificação (CHATBASE_IDENTITY_SECRET) está configurado no servidor."
              : "Falta o segredo de verificação (CHATBASE_IDENTITY_SECRET) no servidor: sem ele o assistente não liga."}
          </p>
          <div>
            <label htmlFor="ia-agente" className="label-xs">Id do agente no Chatbase</label>
            <input
              id="ia-agente"
              className="campo"
              value={agenteId}
              onChange={(e) => {
                setMsg(null);
                setAgenteId(e.target.value);
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={!data}
              aria-invalid={idInvalido}
            />
            {idInvalido ? <p className="mt-1 text-xs text-red">De 8 a 64 caracteres: letras, números, _ e -.</p> : null}
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" disabled={!data} checked={ligado} onChange={(e) => { setMsg(null); setLigado(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Assistente ligado</span>
              <span className="block text-xs text-muted">Desligado, o botão não aparece em painel nenhum.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" disabled={!data} checked={paraOrganizador} onChange={(e) => { setMsg(null); setParaOrganizador(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Liberar para o organizador</span>
              <span className="block text-xs text-muted">
                O uso do organizador é pago; a cobrança ainda não existe. Deixe desligado até ela entrar.
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button disabled={!data || salvar.isPending || idInvalido} onClick={() => salvar.mutate()}>
              Salvar
            </Button>
            {msg ? (
              <p role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
                {msg.texto}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
