import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Mail, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthProviders {
  email: boolean;
  google: boolean;
  phone: boolean;
}

type Notice = { kind: "error" | "success"; text: string } | null;

// POSTs JSON and returns the parsed body, throwing with the server's message on failure
export async function postAuth<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "Algo deu errado. Tente novamente.") as Error & { code?: string };
    error.code = data.code;
    throw error;
  }
  return data as T;
}

const errorMessages: Record<string, string> = {
  invalid_token: "Link inválido ou expirado. Peça um novo.",
  not_allowed: "Esta conta não tem permissão para acessar o sistema.",
  google: "Não foi possível entrar com o Google. Tente novamente.",
  google_disabled: "Login com Google não está configurado.",
  server: "Erro no servidor. Tente novamente.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.8 2.4 2.6 6.7 2.6 12s4.2 9.6 9.4 9.6c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.5H12z" />
    </svg>
  );
}

export default function Login() {
  const { data: providers } = useQuery<AuthProviders>({ queryKey: ["/api/auth/providers"] });
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);

  // Email
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);

  // Phone
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error) setNotice({ kind: "error", text: errorMessages[error] || errorMessages.server });
  }, []);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setNotice(null);
    try {
      await action();
    } catch (error: any) {
      setNotice({ kind: "error", text: error.message });
      if (error.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
    } finally {
      setLoading(false);
    }
  };

  const goToDashboard = () => {
    window.location.href = "/";
  };

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        await postAuth("/api/auth/login", { email, password });
        goToDashboard();
      } else if (mode === "register") {
        const data = await postAuth("/api/auth/register", { email, password, firstName: firstName || undefined });
        setNotice({ kind: "success", text: data.message });
        setMode("login");
        setPassword("");
      } else {
        const data = await postAuth("/api/auth/forgot-password", { email });
        setNotice({ kind: "success", text: data.message });
        setMode("login");
      }
    });
  };

  const resendVerification = () =>
    run(async () => {
      const data = await postAuth("/api/auth/resend-verification", { email });
      setNotice({ kind: "success", text: data.message });
      setNeedsVerification(false);
    });

  const handleSendCode = (e?: FormEvent) => {
    e?.preventDefault();
    run(async () => {
      const data = await postAuth<{ message: string; phone: string }>("/api/auth/phone/send-code", { phone });
      setCodeSent(true);
      setNotice({ kind: "success", text: `${data.message} (${data.phone})` });
    });
  };

  const handleVerifyCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await postAuth("/api/auth/phone/verify", { phone, code });
      goToDashboard();
    });
  };

  const emailTitle = mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Recuperar senha";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <a href="/" className="flex items-center justify-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Moon className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">DarkNews</h1>
            <p className="text-sm text-muted-foreground">Autopilot System</p>
          </div>
        </a>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Acesse sua conta</CardTitle>
            <CardDescription>Entre com e-mail e senha, Google ou telefone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notice && (
              <Alert variant={notice.kind === "error" ? "destructive" : "default"} data-testid="auth-notice">
                <AlertDescription>{notice.text}</AlertDescription>
              </Alert>
            )}

            {providers?.google && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => { window.location.href = "/api/auth/google"; }}
                  data-testid="button-google-login"
                >
                  <GoogleIcon />
                  <span className="ml-2">Continuar com Google</span>
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  ou
                  <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <Tabs defaultValue="email" onValueChange={() => setNotice(null)}>
              {providers?.phone && (
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" data-testid="tab-email"><Mail className="h-4 w-4 mr-2" />E-mail</TabsTrigger>
                  <TabsTrigger value="phone" data-testid="tab-phone"><Phone className="h-4 w-4 mr-2" />Telefone</TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="email" className="mt-4">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <h2 className="text-base font-semibold">{emailTitle}</h2>
                  {mode === "register" && (
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Nome (opcional)</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" data-testid="input-first-name" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="input-email" />
                  </div>
                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={mode === "register" ? 8 : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                        data-testid="input-password"
                      />
                      {mode === "register" && <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading} data-testid="button-email-submit">
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Enviar link de recuperação"}
                  </Button>

                  {needsVerification && mode === "login" && (
                    <Button type="button" variant="link" className="w-full" onClick={resendVerification} disabled={loading}>
                      Reenviar e-mail de confirmação
                    </Button>
                  )}

                  <div className="flex flex-col items-center gap-1 text-sm">
                    {mode === "login" ? (
                      <>
                        <button type="button" className="text-primary hover:underline" onClick={() => { setMode("register"); setNotice(null); }} data-testid="link-register">
                          Não tem conta? Criar conta
                        </button>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setMode("forgot"); setNotice(null); }} data-testid="link-forgot">
                          Esqueci minha senha
                        </button>
                      </>
                    ) : (
                      <button type="button" className="text-primary hover:underline" onClick={() => { setMode("login"); setNotice(null); }}>
                        Já tenho conta. Entrar
                      </button>
                    )}
                  </div>
                </form>
              </TabsContent>

              {providers?.phone && (
                <TabsContent value="phone" className="mt-4">
                  {!codeSent ? (
                    <form onSubmit={handleSendCode} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Número de telefone</Label>
                        <Input id="phone" type="tel" required placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" data-testid="input-phone" />
                        <p className="text-xs text-muted-foreground">Enviaremos um código de 6 dígitos por SMS. Números de fora do Brasil: inclua o código do país (ex.: +1).</p>
                      </div>
                      <Button type="submit" className="w-full" disabled={loading} data-testid="button-send-code">
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Enviar código
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyCode} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="code">Código recebido</Label>
                        <Input
                          id="code"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          required
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                          autoComplete="one-time-code"
                          data-testid="input-code"
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading} data-testid="button-verify-code">
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Entrar
                      </Button>
                      <div className="flex justify-between text-sm">
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setCodeSent(false); setCode(""); setNotice(null); }}>
                          Trocar número
                        </button>
                        <button type="button" className="text-primary hover:underline" onClick={() => handleSendCode()} disabled={loading}>
                          Reenviar código
                        </button>
                      </div>
                    </form>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
