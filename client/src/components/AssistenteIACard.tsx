import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENTE_ID_RE, type ConfigIA } from "@shared/ia";
import { Button, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Retorno {
  config: ConfigIA;
  chaveNoAmbiente: boolean;
}

/** O assistente de IA nos painéis: escolha da plataforma (liga, id do agente e liberação para organizador e afiliado). */
export function AssistenteIACard() {
  const qc = useQueryClient();
  const { data } = useQuery<Retorno>({ queryKey: ["/api/admin/ia/config"] });
  const [ligado, setLigado] = useState(false);
  const [agenteId, setAgenteId] = useState("");
  const [paraOrganizador, setParaOrganizador] = useState(false);
  const [paraAfiliado, setParaAfiliado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setLigado(data.config.ligado);
    setAgenteId(data.config.agenteId);
    setParaOrganizador(data.config.paraOrganizador);
    setParaAfiliado(data.config.paraAfiliado);
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/admin/ia/config", { ligado, agenteId, paraOrganizador, paraAfiliado })).json(),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Assistente salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/ia/config"] });
      qc.invalidateQueries({ queryKey: ["/api/ia/sessao"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const idInvalido = agenteId.trim() !== "" && !AGENTE_ID_RE.test(agenteId.trim());
  return (
    <div className="mb-3">
      <Card title="Assistente de IA (Chatbase)">
        <div className="space-y-4 p-4 text-sm">
          <p className="text-xs text-muted">
            Um assistente numa coluna à direita do painel do administrador master e, se você liberar, do organizador e do
            afiliado. A conversa passa pelo nosso servidor, que conta os créditos de cada mensagem e barra telefone, CPF e
            e-mail de clientes; nenhum script do Chatbase roda no painel.
          </p>
          <p className={`text-xs ${data?.chaveNoAmbiente ? "text-green-deep" : "text-red"}`}>
            {data?.chaveNoAmbiente
              ? "A chave da API do Chatbase (CHATBASE_API_KEY) está configurada no servidor."
              : "Falta a chave da API do Chatbase (CHATBASE_API_KEY) no servidor: sem ela o assistente não liga."}
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
          <label className="flex items-start gap-2">
            <input type="checkbox" disabled={!data} checked={paraAfiliado} onChange={(e) => { setMsg(null); setParaAfiliado(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Liberar para o afiliado</span>
              <span className="block text-xs text-muted">
                O uso do afiliado também é pago, no login dele; a cobrança ainda não existe. Deixe desligado até ela entrar.
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
