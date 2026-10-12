import { useLocation } from "wouter";
import { BotaoMensagem } from "@/components/BotaoMensagem";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { oferecerPushSePreciso } from "@/lib/push";

interface EstadoSeguir {
  seguindo: boolean;
  sino: boolean;
  seguidores: number;
}

/**
 * "Seguir" e o sino de um perfil. Seguir liga o sino junto; deixar de seguir
 * fica no próprio botão "Seguindo". Sem sessão de comprador, leva para a
 * entrada e volta para cá.
 */
export function SeguirBotoes({ slug, compacto = false }: { slug: string; compacto?: boolean }) {
  const qc = useQueryClient();
  const [local, navigate] = useLocation();
  const { data: session } = useSession();
  const logado = Boolean(session?.buyer);
  const chave = [`/api/public/o/${slug}/seguir`];
  const { data } = useQuery<EstadoSeguir>({ queryKey: chave });

  const aplicar = (novo: EstadoSeguir) => {
    qc.setQueryData(chave, novo);
    qc.invalidateQueries({ queryKey: [`/api/public/o/${slug}`] });
    qc.invalidateQueries({ queryKey: ["/api/public/seguindo"] });
  };

  // Seguir e ligar o sino são o toque que justifica pedir permissão de
  // notificação — nunca ao abrir a página.
  const alternar = useMutation({
    mutationFn: async () =>
      (await apiRequest(data?.seguindo ? "DELETE" : "POST", `/api/public/o/${slug}/seguir`)).json(),
    onSuccess: (novo: EstadoSeguir) => {
      aplicar(novo);
      if (novo.seguindo && novo.sino) void oferecerPushSePreciso();
    },
  });
  const sino = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", `/api/public/o/${slug}/sino`, { ligado: !data?.sino })).json(),
    onSuccess: (novo: EstadoSeguir) => {
      aplicar(novo);
      if (novo.sino) void oferecerPushSePreciso();
    },
  });

  const seguindo = data?.seguindo ?? false;
  // Botão na cor de marca (a do perfil, dentro de `DestaqueOrg`). O texto é
  // a cor da superfície (`text-white`): a marca tem contraste ≥ 3:1 com ela
  // nos dois temas, conferido quando a cor é salva.
  // 36 px de altura e cantos de 10, como no cartão do perfil (Figma, 03).
  const tamanho = compacto ? "rounded-md px-3 py-1 text-xs" : "h-9 rounded-[10px] px-[18px] text-sm";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={alternar.isPending}
        onClick={() => {
          if (!logado) return navigate(`/entrar?volta=${encodeURIComponent(local)}`);
          alternar.mutate();
        }}
        aria-pressed={seguindo}
        className={`flex items-center font-semibold ${tamanho} ${
          seguindo
            ? "border border-line-2 bg-mist text-ink hover:bg-mist-2"
            : "bg-marca text-white hover:brightness-95"
        }`}
      >
        {seguindo ? "Seguindo" : "Seguir"}
      </button>
      <BotaoMensagem
        para={slug}
        compacto={compacto}
        classe={
          compacto
            ? undefined
            : "flex h-9 items-center rounded-[10px] border border-line-2 px-[18px] text-sm font-semibold text-ink hover:bg-mist"
        }
      />
      {seguindo ? (
        <button
          type="button"
          disabled={sino.isPending}
          onClick={() => sino.mutate()}
          aria-pressed={data?.sino}
          aria-label={data?.sino ? "Sino ligado: desligar avisos" : "Sino desligado: ligar avisos"}
          title={data?.sino ? "Avisos ligados" : "Avisos desligados"}
          className={`flex items-center justify-center border border-line-2 ${
            compacto ? "h-7 w-8 rounded-md" : "h-9 w-9 rounded-[10px]"
          } ${data?.sino ? "text-marca" : "text-muted"} hover:bg-mist`}
        >
          {data?.sino ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}

/**
 * O tamanho da foto do perfil como no Instagram (o da fileira de stories da
 * home, que o Instagram repete na foto do perfil e nos destaques): ~76 px — o
 * Instagram não publica a medida; é a do app, medida na tela. Vale na tela do
 * sorteio, no perfil da organização (foto e destaques) e no do apostador. O
 * feed e a fileira de stories da vitrine têm o tamanho deles.
 */
export const FOTO_COMO_NO_INSTAGRAM = 76;

/** A bolinha com a foto do perfil (ou a inicial, sem foto). */
export function FotoDoPerfil({
  nome,
  foto,
  tamanho = 40,
}: {
  nome: string;
  foto: string | null | undefined;
  tamanho?: number;
}) {
  return foto ? (
    <img
      src={foto}
      alt=""
      width={tamanho}
      height={tamanho}
      className="shrink-0 rounded-full border border-line object-cover"
      style={{ width: tamanho, height: tamanho }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-green-soft font-display font-extrabold text-green-deep"
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42 }}
    >
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
