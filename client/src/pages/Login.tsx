import { useState } from "react";
import { BotaoGoogle } from "@/components/BotaoGoogle";
import { CampoDeSenha } from "@/components/CampoDeSenha";
import { Marca } from "@/components/Marca";
import { Link, useLocation } from "wouter";
import { Button, Caixa, Campo, TONS_DO_BOTAO } from "@/components/bits";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLogin } from "@/lib/session";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { abaDoTeclado } from "@shared/abas";

const CHAVE_EMAIL = "rifa.login.email";

function emailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_EMAIL) ?? "";
  } catch {
    return "";
  }
}

/**
 * Oferece ao cofre de senhas do navegador/celular guardar o acesso. Numa
 * página que não recarrega depois do login, o Chrome às vezes não percebe que
 * houve um login e não pergunta; a Credential Management API pergunta
 * explicitamente. Onde não existe (Safari, Firefox), o cofre do sistema já
 * pergunta sozinho pelos campos `username` e `current-password`.
 *
 * A senha nunca é guardada pelo site: ela fica no cofre, criptografada, e
 * só volta ao campo quando a pessoa escolhe.
 */
async function oferecerSalvarSenha(email: string, senha: string) {
  const w = window as Window & {
    PasswordCredential?: new (dados: { id: string; password: string; name?: string }) => Credential;
  };
  if (!w.PasswordCredential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new w.PasswordCredential({ id: email, password: senha }));
  } catch {
    // Recusado ou indisponível: segue sem salvar.
  }
}

/** O texto pequeno do pé do cartão (13 px, centralizado, como no Figma). */
const PE = "text-center text-[13px] leading-[18px] text-ink-2";
const LINK = "text-green-deep underline";
const INTRO = "text-[15px] leading-[21px] text-ink-2";

/** O erro do servidor, em texto: o mesmo para conta inexistente e senha errada. */
function ErroDoLogin({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
      {texto}
    </p>
  ) : null;
}

/**
 * Painel: o papel gravado no banco decide onde a pessoa cai — afiliado no
 * painel de afiliado, administrador no painel geral.
 */
function PainelForm() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ email: emailLembrado(), password: "", token: "" });
  // Marcado por padrão: o caso comum é o celular da própria pessoa.
  const [lembrar, setLembrar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // O campo do segundo fator só aparece quando o servidor pede.
  const [needsToken, setNeedsToken] = useState(false);
  const login = useLogin();

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        login.mutate({ ...form, lembrar }, {
          onSuccess: async (session) => {
            try {
              if (lembrar) localStorage.setItem(CHAVE_EMAIL, form.email.trim());
              else localStorage.removeItem(CHAVE_EMAIL);
            } catch {
              // armazenamento bloqueado: só não lembra o e-mail
            }
            if (lembrar) await oferecerSalvarSenha(form.email.trim(), form.password);
            navigate(session.home);
          },
          onError: (err: Error) => {
            const code = err instanceof ApiError ? err.code : undefined;
            if (code === "totp_required" || code === "totp_invalid") {
              setNeedsToken(true);
            }
            setError(err.message);
          },
        });
      }}
    >
      <p className={INTRO}>Acesso de administrador, organizador, afiliado e cambista.</p>

      <Campo rotulo="E-mail">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Campo>
      <CampoDeSenha
        id="senha"
        name="password"
        rotulo="Senha"
        autoComplete="current-password"
        valor={form.password}
        aoMudar={(password) => setForm({ ...form, password })}
      />

      {needsToken ? (
        <Campo rotulo="Código do autenticador">
          <input
            id="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value.replace(/\D/g, "") })}
            className="campo tnum text-lg tracking-[0.3em]"
          />
        </Campo>
      ) : (
        <button type="button" onClick={() => setNeedsToken(true)} className={`min-h-6 text-[13px] ${LINK}`}>
          Tenho código do autenticador
        </button>
      )}

      <Caixa
        marcada={lembrar}
        aoMudar={setLembrar}
        sub="Fica conectado por 30 dias e oferece salvar a senha no celular. Não marque em aparelho de outra pessoa."
      >
        Lembrar de mim neste aparelho
      </Caixa>

      <ErroDoLogin texto={error} />

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Entrando…" : "Entrar"}
      </Button>

      <p className={PE}>
        Quer divulgar as rifas?{" "}
        <Link href="/seja-afiliado" className={LINK}>
          seja afiliado
        </Link>
      </p>
    </form>
  );
}

const CHAVE_ABA = "rifa.login.aba";
const ABAS = [
  ["apostador", "Sou apostador"],
  ["painel", "Painel"],
] as const;
type Aba = (typeof ABAS)[number][0];

function abaLembrada(): Aba {
  try {
    return localStorage.getItem(CHAVE_ABA) === "painel" ? "painel" : "apostador";
  } catch {
    return "apostador";
  }
}

/**
 * A porta de entrada. Duas abas porque são duas contas diferentes: o
 * apostador joga em qualquer rifa; o painel é de quem trabalha nelas. Sem
 * casca: o cartão de 384 px no centro, nas três larguras.
 */
export default function Login() {
  const [aba, setAba] = useState(abaLembrada);
  const escolher = (a: Aba) => {
    setAba(a);
    try {
      localStorage.setItem(CHAVE_ABA, a);
    } catch {
      // sem armazenamento: vale só agora
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[416px] flex-col justify-center px-4 py-8">
      <div className="space-y-3.5">
        <Link href="/" className="inline-block text-[30px] leading-9">
          <Marca />
        </Link>
        {/* O título da página, para leitor de tela: a tela já diz "entrar" pelas abas. */}
        <h1 className="sr-only">Entrar</h1>

        <div role="tablist" aria-label="Como você quer entrar" className="grid grid-cols-2 gap-1 rounded-xl bg-mist-2 p-1">
          {ABAS.map(([v, rotulo], i) => (
            <button
              key={v}
              id={`aba-${v}`}
              type="button"
              role="tab"
              aria-selected={aba === v}
              aria-controls={aba === v ? `painel-${v}` : undefined}
              tabIndex={aba === v ? 0 : -1}
              onClick={() => escolher(v)}
              onKeyDown={(e) => {
                const proxima = abaDoTeclado(e.key, i, ABAS.length);
                if (proxima === null) return;
                e.preventDefault();
                escolher(ABAS[proxima][0]);
                document.getElementById(`aba-${ABAS[proxima][0]}`)?.focus();
              }}
              className={`rounded-[9px] px-3 py-[9px] text-[15px] font-bold ${
                aba === v ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
          {aba === "apostador" ? <ApostadorForm /> : <PainelForm />}
        </div>
      </div>
    </main>
  );
}

/** Só caminho deste site: "//outro.site" ou "https://…" viram a vitrine. */
function voltaSegura(volta: string | null): string {
  return volta && volta.startsWith("/") && !volta.startsWith("//") ? volta : "/";
}

/** Apostador: telefone, CPF ou e-mail + senha. */
function ApostadorForm() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  // A volta do Google traz o motivo da recusa em ?erro= (e-mail que já tem conta, por exemplo).
  const [erro, setErro] = useState<string | null>(() => new URLSearchParams(window.location.search).get("erro"));

  const entrar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/public/conta/entrar", { identificador, senha, lembrar }),
    onSuccess: async () => {
      if (lembrar) await oferecerSalvarSenha(identificador.trim(), senha);
      qc.invalidateQueries();
      // A casa do apostador é a vitrine; as compras ficam no menu dele. Quem
      // veio de um "Seguir" volta para o perfil.
      navigate(voltaSegura(new URLSearchParams(window.location.search).get("volta")));
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <div className="space-y-3.5">
      <p className={INTRO}>Entre para jogar em qualquer rifa e acompanhar suas cotas.</p>
      <BotaoGoogle volta={voltaSegura(new URLSearchParams(window.location.search).get("volta"))} />
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          entrar.mutate();
        }}
      >
        <Campo rotulo="WhatsApp, CPF ou e-mail">
          <input
            id="identificador"
            name="username"
            autoComplete="username"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
          />
        </Campo>
        <CampoDeSenha
          id="senha-apostador"
          name="password"
          rotulo="Senha"
          autoComplete="current-password"
          valor={senha}
          aoMudar={setSenha}
        />
        <Caixa marcada={lembrar} aoMudar={setLembrar}>
          Lembrar de mim neste aparelho
        </Caixa>

        <ErroDoLogin texto={erro} />

        <Button type="submit" className="w-full" disabled={entrar.isPending || !identificador || !senha}>
          {entrar.isPending ? "Entrando…" : "Entrar"}
        </Button>

        <Link
          href="/criar-conta"
          className={`flex h-10 w-full items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.contorno}`}
        >
          Criar conta
        </Link>

        <p className={PE}>
          Esqueceu a senha ou comprou sem conta?{" "}
          <Link href="/minhas-cotas" className={LINK}>
            entre com o código do WhatsApp
          </Link>
        </p>
        <p className={PE}>
          Quer ganhar divulgando rifas?{" "}
          <Link href="/seja-afiliado" className={LINK}>
            seja afiliado
          </Link>
        </p>
      </form>
    </div>
  );
}
