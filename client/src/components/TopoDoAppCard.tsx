import { useEffect, useState } from "react";
import { TIPOS_DA_BUSCA, type ConfigBusca, type TipoDaBusca } from "@shared/buscar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Caixa, Campo, Filtros } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
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

  const limpar = () => setMsg(null);

  return (
    <CartaoDoPainel titulo="Topo do app">
      <div className="grid grid-cols-1 gap-5 px-5 pb-5 text-sm">
        <fieldset className="min-w-0">
          <legend className="mb-2 flex items-center gap-3 font-semibold">
            <Previa aviso={aviso} /> Aviso no trevo
          </legend>
          <span className="label-xs block">Estilo</span>
          <Filtros
            rotulo="Estilo do aviso"
            exclusivo
            className="mt-1"
            opcoes={(Object.entries(ESTILOS_DO_AVISO) as [EstiloDoAviso, string][]).map(([k, nome]) => ({ valor: k, rotulo: nome }))}
            ativa={aviso.estilo}
            aoMudar={(k) => {
              limpar();
              setAviso({ ...aviso, estilo: k });
            }}
          />
          <span className="label-xs mt-3 block">Cor</span>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor do aviso">
            {(Object.entries(CORES_DO_AVISO) as [CorDoAviso, { nome: string; hex: string | null }][]).map(([k, c]) => {
              const escolhida = aviso.cor === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={escolhida}
                  aria-label={c.nome}
                  title={c.nome}
                  onClick={() => {
                    limpar();
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
            Cor escolhida: <span className="font-semibold text-ink">{CORES_DO_AVISO[aviso.cor].nome}</span>. O número de avisos vai
            sempre no rótulo, para quem usa leitor de tela.
          </p>
        </fieldset>
        <Caixa
          marcada={publicar}
          aoMudar={(v) => {
            limpar();
            setPublicar(v);
          }}
          sub={'Desligado, só a organização e o influenciador veem a varinha de publicar. Ligado, o apostador com conta vê — por enquanto com "Em breve".'}
        >
          <span className="font-semibold">Ícone de publicação para o apostador</span>
        </Caixa>
        <Caixa
          marcada={reels}
          aoMudar={(v) => {
            limpar();
            setReels(v);
          }}
          sub={'Desligado, o botão Reels do console mostra "Em breve". Ligado, mostra os vídeos em pé de até 3 minutos das rifas no ar.'}
        >
          <span className="font-semibold">Reels aberto ao público</span>
        </Caixa>
        <Caixa
          marcada={mensagens}
          aoMudar={(v) => {
            limpar();
            setMensagens(v);
          }}
          sub={'Desligado, o botão Mensagens do console mostra "Em breve". Ligado, apostadores, organizações e afiliados conversam um com um.'}
        >
          <span className="font-semibold">Mensagens abertas ao público</span>
        </Caixa>
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <Caixa
            marcada={buscar}
            aoMudar={(v) => {
              limpar();
              setBuscar(v);
            }}
            sub={'Desligado, o botão Buscar do console mostra "Em breve". Ligado, mostra a grade das publicações mais novas e a busca.'}
          >
            <span className="font-semibold">Buscar aberto ao público</span>
          </Caixa>
          <fieldset className="ml-7 grid min-w-0 grid-cols-1 gap-1.5 rounded-md border border-line p-3">
            <legend className="label-xs px-1">O que a busca mostra</legend>
            {(Object.entries(TIPOS_DA_BUSCA) as [TipoDaBusca, string][]).map(([k, rotulo]) => (
              <Caixa
                key={k}
                marcada={tipos[k]}
                aoMudar={(v) => {
                  limpar();
                  setTipos({ ...tipos, [k]: v });
                }}
              >
                {rotulo}
              </Caixa>
            ))}
            <p className="text-xs text-muted">Perfil de apostador é pessoa, não vitrine: nasce desligado e só aparece pelo @apelido exato.</p>
          </fieldset>
        </div>
        <Campo
          rotulo="Fundo da conversa por cima do vídeo do sorteio"
          dica="Na tela cheia do sorteio oficial, quando os comentários ficam por cima do vídeo. Sem fundo é o padrão, como no YouTube e na Twitch; com fundo, as mensagens ficam sobre uma faixa escura. Quem assiste não escolhe."
        >
          <select
            value={fundo}
            onChange={(e) => {
              limpar();
              setFundo(Number(e.target.value));
            }}
            className="campo tnum block w-auto text-sm"
          >
            {FUNDOS_DA_CONVERSA_PCT.map((p) => (
              <option key={p} value={p}>
                {p === 0 ? "Sem fundo (padrão)" : p === 100 ? "Sólido (100%)" : `${p}% (vídeo aparece atrás)`}
              </option>
            ))}
          </select>
        </Campo>
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
        <div>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar topo do app
          </Button>
        </div>
      </div>
    </CartaoDoPainel>
  );
}
