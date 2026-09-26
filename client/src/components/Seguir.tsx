import { useLocation } from "wouter";
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
  const tamanho = compacto ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm";

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
        className={`rounded-md font-semibold ${tamanho} ${
          seguindo
            ? "border border-line-2 bg-mist text-ink hover:bg-mist-2"
            : "bg-marca text-white hover:brightness-95"
        }`}
      >
        {seguindo ? "Seguindo" : "Seguir"}
      </button>
      {seguindo ? (
        <button
          type="button"
          disabled={sino.isPending}
          onClick={() => sino.mutate()}
          aria-pressed={data?.sino}
          aria-label={data?.sino ? "Sino ligado: desligar avisos" : "Sino desligado: ligar avisos"}
          title={data?.sino ? "Avisos ligados" : "Avisos desligados"}
          className={`flex items-center justify-center rounded-md border border-line-2 ${
            compacto ? "h-7 w-8" : "h-8 w-9"
          } ${data?.sino ? "text-marca" : "text-muted"} hover:bg-mist`}
        >
          {data?.sino ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}

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
