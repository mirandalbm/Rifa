import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/bits";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLogin } from "@/lib/session";
import { ApiError, apiRequest } from "@/lib/queryClient";

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

/**
 * Painel: o papel gravado no banco decide onde a pessoa cai — afiliado no
 * painel de afiliado, administrador no painel geral.
 */
function PainelForm() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ email: emailLembrado(), password: "", token: "" });
  // Marcado por padrão: o caso comum é o celular da própria pessoa.
  const [lembrar, setLembrar] = useState(true);
  const [verSenha, setVerSenha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O campo do segundo fator só aparece quando o servidor pede.
  const [needsToken, setNeedsToken] = useState(false);
  const login = useLogin();

  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Acesso de administrador, organizador, afiliado e cambista.
      </p>

      <form
        className="mt-4 space-y-3"
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
        <div>
          <label htmlFor="email" className="label-xs">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="senha" className="label-xs">
            Senha
          </label>
          <div className="relative mt-1">
            <input
              id="senha"
              name="password"
              type={verSenha ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-line-2 px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setVerSenha(!verSenha)}
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
              title={verSenha ? "Esconder senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink"
            >
              {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {needsToken ? (
          <div>
            <label htmlFor="token" className="label-xs">
              Código do autenticador
            </label>
            <input
              id="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={form.token}
              onChange={(e) =>
                setForm({ ...form, token: e.target.value.replace(/\D/g, "") })
              }
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-lg tracking-[0.3em]"
            />
          </div>
        ) : null}

        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--green)]"
          />
          <span>
            Lembrar de mim neste aparelho
            <span className="block text-xs text-muted">
              Fica conectado por 30 dias e oferece salvar a senha no celular. Não marque em
              aparelho de outra pessoa.
            </span>
          </span>
        </label>

        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-center text-xs text-muted">
          Quer divulgar as rifas?{" "}
          <Link href="/seja-afiliado" className="text-green-deep underline">
            seja afiliado
          </Link>
        </p>
      </form>
    </>
  );
}

const CHAVE_ABA = "rifa.login.aba";

function abaLembrada(): "apostador" | "painel" {
  try {
    return localStorage.getItem(CHAVE_ABA) === "painel" ? "painel" : "apostador";
  } catch {
    return "apostador";
  }
}

/**
 * A porta de entrada. Duas abas porque são duas contas diferentes: o
 * apostador joga em qualquer rifa; o painel é de quem trabalha nelas.
 */
export default function Login() {
  const [aba, setAba] = useState(abaLembrada);
  const escolher = (a: "apostador" | "painel") => {
    setAba(a);
    try {
      localStorage.setItem(CHAVE_ABA, a);
    } catch {
      // sem armazenamento: vale só agora
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-8">
      <Link href="/" className="font-display text-2xl font-extrabold">
        rifa<span className="text-green">.</span>br
      </Link>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-mist-2 p-1" role="tablist">
        {(
          [
            ["apostador", "Sou apostador"],
            ["painel", "Painel"],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={aba === v}
            onClick={() => escolher(v)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              aba === v ? "bg-white text-ink shadow-sm" : "text-muted"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "apostador" ? <ApostadorForm /> : <PainelForm />}
    </div>
  );
}

/** Apostador: telefone, CPF ou e-mail + senha. */
function ApostadorForm() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/public/conta/entrar", { identificador, senha, lembrar }),
    onSuccess: async () => {
      if (lembrar) await oferecerSalvarSenha(identificador.trim(), senha);
      qc.invalidateQueries();
      // A casa do apostador é a vitrine; as compras ficam no menu dele.
      navigate("/");
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Entre para jogar em qualquer rifa e acompanhar suas cotas.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          entrar.mutate();
        }}
      >
        <div>
          <label htmlFor="identificador" className="label-xs">
            WhatsApp, CPF ou e-mail
          </label>
          <input
            id="identificador"
            name="username"
            autoComplete="username"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="senha-apostador" className="label-xs">
            Senha
          </label>
          <div className="relative mt-1">
            <input
              id="senha-apostador"
              name="password"
              type={verSenha ? "text" : "password"}
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-md border border-line-2 px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setVerSenha(!verSenha)}
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink"
            >
              {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
            className="h-4 w-4 accent-[var(--green)]"
          />
          Lembrar de mim neste aparelho
        </label>

        {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}

        <Button type="submit" className="w-full" disabled={entrar.isPending || !identificador || !senha}>
          {entrar.isPending ? "Entrando…" : "Entrar"}
        </Button>

        <Link
          href="/criar-conta"
          className="block w-full rounded-md border-2 border-green px-3 py-2 text-center text-sm font-semibold text-green-deep hover:bg-green-soft"
        >
          Criar conta
        </Link>

        <div className="space-y-1 pt-2 text-center text-xs text-muted">
          <p>
            Esqueceu a senha ou comprou sem conta?{" "}
            <Link href="/minhas-cotas" className="text-green-deep underline">
              entre com o código do WhatsApp
            </Link>
          </p>
          <p>
            Quer ganhar divulgando rifas?{" "}
            <Link href="/seja-afiliado" className="text-green-deep underline">
              seja afiliado
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}
