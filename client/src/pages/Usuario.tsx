import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CartaoDoFeed, type RifaDoFeed } from "@/components/CartaoDoFeed";
import { useTemplate } from "@/lib/template";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { BalaoDaNota, ChipDeLink, FotoDoApostador } from "@/components/PerfilDoApostador";
import { MarcadosNoPerfil } from "@/components/MarcadosNoPerfil";
import { FOTO_COMO_NO_INSTAGRAM } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { BotaoMensagem } from "@/components/BotaoMensagem";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

interface PerfilDoApostador {
  apelido: string;
  nomeReal: string;
  foto: string | null;
  desde: string | null;
  verificado: boolean;
  bio: string | null;
  link: string | null;
  nota: string | null;
  seguidores: number;
  seguindo: number;
  seguidoPorMim: boolean;
  proprio: boolean;
}

/**
 * O perfil público do apostador (`/u/<apelido>`): foto, apelido e sempre o
 * nome real — primeiro e último. Nada de telefone, CPF ou e-mail.
 */
export default function Usuario() {
  const nomeDaPlataforma = useTemplate().identidade.nome;
  const { apelido } = useParams<{ apelido: string }>();
  const { data, isLoading, error } = useQuery<PerfilDoApostador>({ queryKey: [`/api/public/u/${apelido}`] });
  return (
    <PublicShell larga>
      {isLoading ? <p className="text-sm text-muted">Carregando…</p> : null}
      {error ? <Empty>
          Perfil não encontrado.{" "}
          <Link href="/" className="font-semibold text-marca underline">
            Voltar ao início
          </Link>
        </Empty> : null}
      {/* O cabeçalho é a faixa escura (`.faixa-escura` no `index.css`): escura
          nos dois temas, o texto herda a cor dela. De ponta a ponta no
          celular; do tablet em diante, com os cantos da capa da organização. */}
      {data ? (
        <section className="-mx-4 -mt-4 flex flex-col items-center gap-1.5 faixa-escura px-4 pb-6 pt-7 text-center sm:mx-0 sm:mt-0 sm:rounded-xl">
          <BalaoDaNota nota={data.nota} invertida />
          <FotoDoApostador nome={data.apelido} foto={data.foto} tamanho={FOTO_COMO_NO_INSTAGRAM} invertida />
          <h1 className="flex min-w-0 max-w-full items-center justify-center gap-1.5 font-display text-[22px] font-bold leading-tight">
            <span className="min-w-0 break-all">@{data.apelido}</span>
            {data.verificado ? <SeloVerificado sujeito="apostador" tamanho={20} /> : null}
          </h1>
          <p className="text-base">{data.nomeReal}</p>
          {data.bio ? <p className="whitespace-pre-line text-sm">{data.bio}</p> : null}
          {data.link ? <ChipDeLink link={data.link} claro /> : null}
          <p className="tnum text-sm">
            <strong className="font-semibold">{data.seguidores}</strong> seguidores · <strong className="font-semibold">{data.seguindo}</strong> seguindo
          </p>
          <BotaoSeguir apelido={data.apelido} seguidoPorMim={data.seguidoPorMim} proprio={data.proprio} />
          {data.verificado ? (
            <p className="text-xs opacity-75">Apostador verificado: documentos e foto conferidos pela plataforma.</p>
          ) : null}
          {data.desde ? (
            <p className="tnum text-xs opacity-75">
              no {nomeDaPlataforma} desde {new Date(data.desde).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          ) : null}
          <div className="pt-2.5 empty:hidden">
            <BotaoMensagem
              para={`@${data.apelido}`}
              icone
              classe="flex items-center gap-2 rounded-[10px] border border-current px-[18px] py-[9px] text-sm font-semibold text-current hover:bg-black/10"
            />
          </div>
        </section>
      ) : null}
      {data ? <Republicacoes apelido={data.apelido} /> : null}
      {data ? (
        <section aria-labelledby="titulo-marcados">
          <div className="px-4 py-6 text-center">
            <h2 id="titulo-marcados" className="text-sm font-semibold text-ink-2">
              Marcados
            </h2>
          </div>
          <MarcadosNoPerfil apelido={data.apelido} proprio={false} />
        </section>
      ) : null}
    </PublicShell>
  );
}

/**
 * Seguir a pessoa (só com conta; sem conta não aparece, e no próprio perfil
 * também não). `aria-pressed` diz o estado; o texto diz também, não só a cor.
 */
function BotaoSeguir({ apelido, seguidoPorMim, proprio }: { apelido: string; seguidoPorMim: boolean; proprio: boolean }) {
  const { data: sessao } = useSession();
  const conta = Boolean(sessao?.buyer?.conta);
  const [erro, setErro] = useState<string | null>(null);
  const mudar = useMutation({
    mutationFn: () =>
      apiRequest(seguidoPorMim ? "DELETE" : "POST", `/api/public/u/${apelido}/seguir`),
    onSuccess: () => {
      setErro(null);
      queryClient.invalidateQueries({ queryKey: [`/api/public/u/${apelido}`] });
    },
    onError: (e: Error) => setErro(e.message),
  });
  if (!conta || proprio) return null;
  return (
    <div className="flex flex-col items-center gap-1 pt-2">
      <button
        type="button"
        aria-pressed={seguidoPorMim}
        disabled={mudar.isPending}
        onClick={() => mudar.mutate()}
        className="rounded-[10px] border border-current px-[18px] py-[9px] text-sm font-semibold text-current hover:bg-black/10 disabled:opacity-60"
      >
        {seguidoPorMim ? "✓ Seguindo" : "Seguir"}
      </button>
      {erro ? <p role="alert" className="text-xs">{erro}</p> : null}
    </div>
  );
}

/**
 * O que a pessoa republicou (o botão de republicar da publicação) aparece no
 * perfil dela, como feed: 1 coluna no celular, 2 no tablet e 3 no computador.
 * Cada cartão tem a altura dele (`items-start`), sem esticar ao do lado.
 */
function Republicacoes({ apelido }: { apelido: string }) {
  const { data } = useQuery<RifaDoFeed[]>({ queryKey: [`/api/public/u/${apelido}/republicacoes`] });
  if (!data) return null;
  return (
    <section aria-labelledby="titulo-republicacoes">
      <div className="px-4 py-6 text-center">
        <h2 id="titulo-republicacoes" className="text-sm font-semibold text-ink-2">
          Republicações
        </h2>
        {data.length === 0 ? (
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-[18px] text-muted">
            Nenhuma republicação ainda. O que esta pessoa republicar aparece aqui.
          </p>
        ) : null}
      </div>
      {data.length ? (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => (
            <CartaoDoFeed key={r.id} rifa={r} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
