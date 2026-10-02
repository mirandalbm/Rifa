import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENTE_ID_RE, type ConfigIA } from "@shared/ia";
import { DIAS_DO_CICLO, MAX_PACOTES } from "@shared/iaCobranca";
import { Button, Campo, Card } from "@/components/bits";
import { ACOES_DA_IA } from "@shared/iaAcoes";
import { apiRequest } from "@/lib/queryClient";

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** "20,50" → 2050; texto que não é dinheiro vira -1 (o servidor recusa). */
const centavos = (texto: string) => {
  const t = texto.trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : -1;
};
const inteiro = (texto: string) => (texto.trim() === "" ? 0 : Number(texto));

interface PacoteNaTela {
  creditos: string;
  preco: string;
}

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
  const [assinatura, setAssinatura] = useState("");
  const [franquia, setFranquia] = useState("");
  const [pacotes, setPacotes] = useState<PacoteNaTela[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setLigado(data.config.ligado);
    setAgenteId(data.config.agenteId);
    setParaOrganizador(data.config.paraOrganizador);
    setParaAfiliado(data.config.paraAfiliado);
    const c = data.config.cobranca;
    setAssinatura(c.assinaturaCents ? reais(c.assinaturaCents) : "");
    setFranquia(c.franquiaCreditos ? String(c.franquiaCreditos) : "");
    setPacotes(
      c.pacotes.map((p) => ({
        creditos: String(p.creditos),
        preco: reais(p.precoCents),
      })),
    );
  }, [data]);

  const mudou = () => setMsg(null);
  const mudarPacote = (i: number, campo: keyof PacoteNaTela, valor: string) => {
    mudou();
    setPacotes((lista) =>
      lista.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)),
    );
  };

  const salvar = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("PUT", "/api/admin/ia/config", {
          ligado,
          agenteId,
          paraOrganizador,
          paraAfiliado,
          cobranca: {
            assinaturaCents: centavos(assinatura),
            franquiaCreditos: inteiro(franquia),
            pacotes: pacotes.map((p) => ({
              creditos: inteiro(p.creditos),
              precoCents: centavos(p.preco),
            })),
          },
        })
      ).json(),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Assistente salvo." });
      qc.invalidateQueries({ queryKey: ["/api/admin/ia/config"] });
      qc.invalidateQueries({ queryKey: ["/api/ia/sessao"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const idInvalido =
    agenteId.trim() !== "" && !AGENTE_ID_RE.test(agenteId.trim());
  return (
    <div className="mb-3">
      <Card title="Assistente de IA (Chatbase)">
        <div className="space-y-4 p-4 text-sm">
          <p className="text-xs text-muted">
            Um assistente numa coluna à direita do painel do administrador
            master e, se você liberar, do organizador e do afiliado. A conversa
            passa pelo nosso servidor, que conta os créditos de cada mensagem e
            barra telefone, CPF e e-mail de clientes; nenhum script do Chatbase
            roda no painel.
          </p>
          <p
            className={`text-xs ${data?.chaveNoAmbiente ? "text-green-deep" : "text-red"}`}
          >
            {data?.chaveNoAmbiente
              ? "A chave da API do Chatbase (CHATBASE_API_KEY) está configurada no servidor."
              : "Falta a chave da API do Chatbase (CHATBASE_API_KEY) no servidor: sem ela o assistente não liga."}
          </p>
          <div>
            <label htmlFor="ia-agente" className="label-xs">
              Id do agente no Chatbase
            </label>
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
            {idInvalido ? (
              <p className="mt-1 text-xs text-red">
                De 8 a 64 caracteres: letras, números, _ e -.
              </p>
            ) : null}
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              disabled={!data}
              checked={ligado}
              onChange={(e) => {
                setMsg(null);
                setLigado(e.target.checked);
              }}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="font-semibold">Assistente ligado</span>
              <span className="block text-xs text-muted">
                Desligado, o botão não aparece em painel nenhum.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              disabled={!data}
              checked={paraOrganizador}
              onChange={(e) => {
                setMsg(null);
                setParaOrganizador(e.target.checked);
              }}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="font-semibold">Liberar para o organizador</span>
              <span className="block text-xs text-muted">
                A organização paga a assinatura abaixo (qualquer organizador
                dela), por Pix da plataforma.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              disabled={!data}
              checked={paraAfiliado}
              onChange={(e) => {
                setMsg(null);
                setParaAfiliado(e.target.checked);
              }}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="font-semibold">Liberar para o afiliado</span>
              <span className="block text-xs text-muted">
                O afiliado paga a própria assinatura, no login dele, com os
                mesmos direitos do organizador.
              </span>
            </span>
          </label>
          <fieldset className="space-y-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">
              Cobrança do organizador e do afiliado
            </legend>
            <p className="text-xs text-muted">
              A assinatura dá uma franquia de créditos do Chatbase por{" "}
              <span className="tnum">{DIAS_DO_CICLO}</span> dias; a franquia que sobra vence com o ciclo. Os
              pacotes avulsos não vencem e só são vendidos a quem tem a
              assinatura ativa. Tudo é pago por Pix da plataforma, sem split. O
              master não paga. Mudar os preços não mexe no que já foi pago.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Assinatura (R$ por ciclo)">
                <input
                  inputMode="decimal"
                  disabled={!data}
                  value={assinatura}
                  onChange={(e) => {
                    mudou();
                    setAssinatura(e.target.value);
                  }}
                />
              </Campo>
              <Campo rotulo="Franquia (créditos por ciclo)">
                <input
                  inputMode="numeric"
                  disabled={!data}
                  value={franquia}
                  onChange={(e) => {
                    mudou();
                    setFranquia(e.target.value);
                  }}
                />
              </Campo>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold">Pacotes avulsos</p>
              {pacotes.length === 0 ? (
                <p className="text-xs text-muted">
                  Nenhum pacote: só a assinatura.
                </p>
              ) : null}
              {pacotes.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Campo rotulo={`Pacote ${i + 1}: créditos`}>
                    <input
                      inputMode="numeric"
                      value={p.creditos}
                      onChange={(e) =>
                        mudarPacote(i, "creditos", e.target.value)
                      }
                    />
                  </Campo>
                  <Campo rotulo={`Pacote ${i + 1}: preço (R$)`}>
                    <input
                      inputMode="decimal"
                      value={p.preco}
                      onChange={(e) => mudarPacote(i, "preco", e.target.value)}
                    />
                  </Campo>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      mudou();
                      setPacotes((lista) => lista.filter((_, j) => j !== i));
                    }}
                  >
                    Tirar o pacote {i + 1}
                  </Button>
                </div>
              ))}
              {pacotes.length < MAX_PACOTES ? (
                <Button
                  variant="ghost"
                  disabled={!data}
                  onClick={() => {
                    mudou();
                    setPacotes((lista) => [
                      ...lista,
                      { creditos: "", preco: "" },
                    ]);
                  }}
                >
                  Adicionar pacote
                </Button>
              ) : null}
            </div>
          </fieldset>
          <AcoesParaOChatbase />
          <div className="flex items-center gap-3">
            <Button
              disabled={!data || salvar.isPending || idInvalido}
              onClick={() => salvar.mutate()}
            >
              Salvar
            </Button>
            {msg ? (
              <p
                role="status"
                className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}
              >
                {msg.texto}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * As ações que o assistente sabe pedir, para a plataforma cadastrar no
 * Chatbase (Actions → Custom action, tipo "Client"), com o mesmo nome e os
 * mesmos parâmetros. Quem executa é o nosso servidor; o que grava pede a
 * confirmação de quem conversa.
 */
function AcoesParaOChatbase() {
  return (
    <details className="rounded-lg border border-line p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Ações do assistente ({ACOES_DA_IA.length}): cadastre no Chatbase
      </summary>
      <p className="mt-2 text-xs text-muted">
        No Chatbase, em Actions, crie cada uma como ação do tipo "Client", com o
        nome e os parâmetros abaixo. Nosso servidor executa no recorte de quem
        conversa; o que grava só acontece depois de a pessoa confirmar na
        coluna, e entra na auditoria como feito pelo assistente. Ação sem
        cadastro lá simplesmente não é pedida.
      </p>
      <ul className="mt-3 space-y-3">
        {ACOES_DA_IA.map((a) => (
          <li key={a.nome} className="space-y-1 border-t border-line pt-2">
            <p className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-mist px-1.5 py-0.5 text-xs">
                {a.nome}
              </code>
              <span className="text-xs text-muted">
                {a.quem
                  .map((q) =>
                    q === "plataforma"
                      ? "plataforma"
                      : q === "organizacao"
                        ? "organizador"
                        : "afiliado",
                  )
                  .join(", ")}
                {a.grava ? " · pede confirmação" : " · só consulta"}
              </span>
            </p>
            <p className="text-xs">{a.descricao}</p>
            {a.parametros.length ? (
              <ul className="ml-4 list-disc text-xs text-muted">
                {a.parametros.map((p) => (
                  <li key={p.nome}>
                    <code>{p.nome}</code> ({p.tipo === "number" ? "número" : "texto"}
                    {p.obrigatorio ? ", obrigatório" : ", opcional"}): {p.descricao}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
