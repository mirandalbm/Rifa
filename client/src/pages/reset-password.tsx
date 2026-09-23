import { useState, type FormEvent } from "react";
import { Loader2, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { postAuth } from "@/pages/login";

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "Link inválido. Peça um novo na tela de login.");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await postAuth("/api/auth/reset-password", { token, password });
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Moon className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">DarkNews</h1>
        </div>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Nova senha</CardTitle>
            <CardDescription>Escolha uma nova senha para sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmation">Confirme a nova senha</Label>
                <Input id="confirmation" type="password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar nova senha
              </Button>
              <a href="/login" className="block text-center text-sm text-muted-foreground hover:underline">Voltar para o login</a>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
