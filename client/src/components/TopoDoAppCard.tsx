import { useEffect, useState } from "react";
import { TIPOS_DA_BUSCA, type ConfigBusca, type TipoDaBusca } from "@shared/buscar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { IconeTrevo } from "@/components/Publicacao";
import { useConfigDoApp } from "@/components/Console";
import { apiRequest } from "@/lib/queryClient";
import { FUNDOS_DA_CONVERSA_PCT } from "@shared/plataforma";
import { CORES_DO_AVISO, ESTILOS_DO_AVISO, type AvisoDoTrevo, type CorDoAviso, type EstiloDoAviso } from "@shared/console";

/** O trevo com aviso, como aparece no topo — para ver antes de salvar. */
function Previa({ aviso }: { aviso: AvisoDoTrevo }) {
  const hex = CORES_DO_AVISO[aviso.cor].hex;
  const cheio = aviso.estilo === "cheio";
  return (
    <span className={`relative inline-flex ${cheio && !hex ? "text-green" : ""}`} style={cheio && hex ? { color: hex } : undefined}>
      <IconeTrevo cheio={cheio} tamanho={30} corDoCheio={cheio ? "currentColor" : undefined} />
      {!cheio ? (
        <span
          aria-hidden
          className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${hex ? "" : "bg-green"}`}
          style={hex ? { backgroundColor: hex } : undefined}
        />
      ) : null}
    </span>
  );
}

/**
 * O topo do app, escolha da plataforma: como o trevo avisa que há novidade
 * (ponto no canto ou trevo cheio, e a cor — para datas comemorativas e
 * edições especiais) e se o apostador vê o ícone de publicação.
 */
export function TopoDoAppCard() {
  const qc = useQueryClient();
  const atual = useConfigDoApp();
  const [aviso, setAviso] = useState<AvisoDoTrevo>(atual.avisoDoTrevo);
  const [publicar, setPublicar] = useState(atual.publicarApostador);
  const [reels, setReels] = useState(atual.reelsLigado);
  const [mensagens, setMensagens] = useState(atual.mensagensLigado);
  const [buscar, setBuscar] = useState(atual.buscarLigado);
  const [fundo, setFundo] = useState(atual.fundoDaConversaPct);
  const [tipos, setTipos] = useState<ConfigBusca>(atual.buscarTipos);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    setAviso(atual.avisoDoTrevo);
    setPublicar(atual.publicarApostador);
    setReels(atual.reelsLigado);
    setMensagens(atual.mensagensLigado);
    setBuscar(atual.buscarLigado);
    setTipos(atual.buscarTipos);
    setFundo(atual.fundoDaConversaPct);
  }, [atual.avisoDoTrevo, atual.publicarApostador, atual.reelsLigado, atual.mensagensLigado, atual.buscarLigado, atual.buscarTipos, atual.fundoDaConversaPct]);

  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/app", { avisoDoTrevo: aviso, publicarApostador: publicar, reelsLigado: reels, mensagensLigado: mensagens, buscarLigado: buscar, buscarTipos: tipos, fundoDaConversaPct: fundo }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Topo do app salvo." });
      qc.invalidateQueries({ queryKey: ["/api/public/app"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <div className="mb-3">
      <Card title="Topo do app">
        <div className="space-y-4 p-4 text-sm">
          <fieldset>
            <legend className="mb-2 flex items-center gap-3 font-semibold">
              <Previa aviso={aviso} /> Aviso no trevo
            </legend>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ESTILOS_DO_AVISO) as [EstiloDoAviso, string][]).map(([k, nome]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={aviso.estilo === k}
                  onClick={() => {
                    setMsg(null);
                    setAviso({ ...aviso, estilo: k });
                  }}
                  className={`rounded-md border px-3 py-1.5 font-semibold ${aviso.estilo === k ? "border-ink" : "border-line hover:bg-mist"}`}
                >
                  {nome}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Cor do aviso">
              {(Object.entries(CORES_DO_AVISO) as [CorDoAviso, { nome: string; hex: string | null }][]).map(([k, c]) => {
                const escolhida = aviso.cor === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={escolhida}
                    aria-label={c.nome}
                    title={c.nome}
                    onClick={() => {
                      setMsg(null);
                      setAviso({ ...aviso, cor: k });
                    }}
                    className={`rounded-full p-1 ${escolhida ? "ring-2 ring-ink" : "hover:bg-mist"}`}
                  >
                    <span className={`block h-6 w-6 rounded-full ${c.hex ? "" : "bg-green"}`} style={c.hex ? { backgroundColor: c.hex } : undefined} />
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              {CORES_DO_AVISO[aviso.cor].nome}. O número de avisos vai sempre no rótulo, para quem usa leitor de tela.
            </p>
          </fieldset>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={publicar} onChange={(e) => { setMsg(null); setPublicar(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Ícone de publicação para o apostador</span>
              <span className="block text-xs text-muted">
                Desligado, só a organização e o influenciador veem a varinha de publicar. Ligado, o apostador com conta vê — por
                enquanto com "Em breve".
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={reels} onChange={(e) => { setMsg(null); setReels(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Reels aberto ao público</span>
              <span className="block text-xs text-muted">
                Desligado, o botão Reels do console mostra "Em breve". Ligado, mostra os vídeos em pé de até 3 minutos das rifas no ar.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={mensagens} onChange={(e) => { setMsg(null); setMensagens(e.target.checked); }} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Mensagens abertas ao público</span>
              <span className="block text-xs text-muted">
                Desligado, o botão Mensagens do console mostra "Em breve". Ligado, apostadores, organizações e afiliados conversam
                um com um.
              </span>
            </span>
          </label>
          <fieldset className="space-y-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={buscar} onChange={(e) => { setMsg(null); setBuscar(e.target.checked); }} className="mt-1 h-5 w-5" />
              <span>
                <span className="font-semibold">Buscar aberto ao público</span>
                <span className="block text-xs text-muted">
                  Desligado, o botão Buscar do console mostra "Em breve". Ligado, mostra a grade das publicações mais novas e a busca.
                </span>
              </span>
            </label>
            <div className="ml-7 space-y-1.5 rounded-md border border-line p-3">
              <legend className="label-xs">O que a busca mostra</legend>
              {(Object.entries(TIPOS_DA_BUSCA) as [TipoDaBusca, string][]).map(([k, rotulo]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tipos[k]} onChange={(e) => { setMsg(null); setTipos({ ...tipos, [k]: e.target.checked }); }} className="h-4 w-4" />
                  {rotulo}
                </label>
              ))}
              <p className="text-xs text-muted">Perfil de apostador é pessoa, não vitrine: nasce desligado e só aparece pelo @apelido exato.</p>
            </div>
          </fieldset>
          <label className="block">
            <span className="font-semibold">Fundo da conversa por cima do vídeo do sorteio</span>
            <span className="mb-1.5 block text-xs text-muted">
              Na tela cheia do sorteio oficial, quando os comentários ficam por cima do vídeo. Sólido é o padrão, como no YouTube
              e na Twitch; com transparência, o vídeo aparece atrás das mensagens. Quem assiste não escolhe.
            </span>
            <select
              value={fundo}
              onChange={(e) => {
                setMsg(null);
                setFundo(Number(e.target.value));
              }}
              className="campo tnum w-auto"
            >
              {FUNDOS_DA_CONVERSA_PCT.map((p) => (
                <option key={p} value={p}>
                  {p === 100 ? "Sólido (padrão)" : `${p}% (vídeo aparece atrás)`}
                </option>
              ))}
            </select>
          </label>
          {msg ? (
            <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
          ) : null}
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar topo do app
          </Button>
        </div>
      </Card>
    </div>
  );
}
