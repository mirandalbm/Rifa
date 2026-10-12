import { BotaoGoogle } from "@/components/BotaoGoogle";
import { CampoDeSenha } from "@/components/CampoDeSenha";
import { useState } from "react";
import { Marca } from "@/components/Marca";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Campo } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { erroDoCampoDoCadastro, type CampoDoCadastro } from "@/lib/cadastro";
import { cpfValido, maskCpf } from "@shared/format";
import { cepValido, maskCep, soDigitosCep } from "@shared/endereco";
import { problemaNoCadastro } from "@shared/contaComprador";

type Campos = Record<CampoDoCadastro | "repetir", string>;

const LINK = "text-green-deep underline";

/**
 * Cadastro do apostador. Uma conta joga em todas as rifas de todos os
 * organizadores. Telefone e CPF são obrigatórios: o telefone recebe o
 * bilhete e o código de confirmação; o CPF é o que prova quem é o dono num
 * pedido de reembolso. Sem casca: o cartão de 384 px no centro, os campos em
 * coluna e o erro de cada um embaixo dele.
 */
export default function CriarConta() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [f, setF] = useState<Campos>({ nome: "", apelido: "", telefone: "", cpf: "", cep: "", email: "", senha: "", repetir: "" });
  // Os campos por onde a pessoa já passou: o erro só aparece depois de sair dele.
  const [tocados, setTocados] = useState<Set<keyof Campos>>(() => new Set());
  // A cidade que o CEP dá, mostrada embaixo do campo: a pessoa confere na hora.
  const [lugar, setLugar] = useState<{ texto: string; erro: boolean } | null>(null);

  async function conferirCep(cep: string) {
    setLugar(null);
    const d = soDigitosCep(cep);
    if (!cepValido(d)) return;
    try {
      const r = await fetch(`/api/public/cep/${d}`);
      const j = await r.json().catch(() => ({}));
      setLugar(
        r.ok ? { texto: `${j.cidade}/${j.uf}`, erro: false } : r.status === 404 ? { texto: "CEP não encontrado.", erro: true } : null,
      );
    } catch {
      /* sem conexão para conferir: o servidor confere no cadastro */
    }
  }
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problema =
    problemaNoCadastro(f) ?? (f.senha !== f.repetir ? "As senhas não são iguais." : null);

  /** O erro que aparece embaixo do campo — só depois de a pessoa sair dele. */
  const erroDe = (id: keyof Campos): string | null => {
    if (id === "cpf" && f.cpf.replace(/\D/g, "").length === 11 && !cpfValido(f.cpf)) return "CPF inválido.";
    if (id === "cep" && lugar?.erro) return lugar.texto;
    if (!tocados.has(id)) return null;
    if (id === "repetir") return f.repetir && f.senha !== f.repetir ? "As senhas não são iguais." : null;
    return erroDoCampoDoCadastro(id, f[id]);
  };
  const algumErroNaTela = (Object.keys(f) as (keyof Campos)[]).some((id) => erroDe(id));
  const tocou = Object.values(f).some(Boolean);

  const criar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/public/conta", {
        nome: f.nome,
        apelido: f.apelido,
        telefone: f.telefone,
        cpf: f.cpf,
        cep: f.cep,
        email: f.email || undefined,
        senha: f.senha,
        lembrar: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      // Veio de um presente (ou de outra página): volta para lá. Só caminho do
      // próprio site — `//outro-site` seria redirecionador aberto.
      const volta = new URLSearchParams(window.location.search).get("volta");
      navigate(volta && volta.startsWith("/") && !volta.startsWith("//") ? volta : "/");
    },
    onError: (e: Error) => setErro(e.message),
  });

  const sair = (id: keyof Campos) => () => setTocados((t) => (t.has(id) ? t : new Set(t).add(id)));
  const mudar = (id: keyof Campos, valor: string) => {
    setErro(null);
    setF((atual) => ({ ...atual, [id]: valor }));
  };

  const campo = (
    id: Exclude<keyof Campos, "senha">,
    rotulo: React.ReactNode,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
    dica?: string,
  ) => (
    <Campo rotulo={rotulo} dica={dica} erro={erroDe(id)}>
      <input
        id={`cc-${id}`}
        value={f[id]}
        onChange={(e) => {
          const valor =
            id === "cpf"
              ? maskCpf(e.target.value)
              : id === "cep"
                ? maskCep(e.target.value)
                : id === "apelido"
                  ? e.target.value.replace(/^@/, "").toLowerCase()
                  : e.target.value;
          mudar(id, valor);
          if (id === "cep") void conferirCep(valor);
        }}
        onBlur={sair(id)}
        {...extra}
      />
    </Campo>
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[416px] flex-col justify-center px-4 py-6">
      <div className="space-y-3.5">
        <Link href="/" className="inline-block text-[30px] leading-9">
          <Marca />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold">Criar conta</h1>
          <p className="mt-3.5 text-[15px] leading-[21px] text-ink-2">
            Uma conta para jogar em qualquer rifa e acompanhar tudo o que você comprou.
          </p>
        </div>

        <BotaoGoogle />

        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            criar.mutate();
          }}
        >
          {campo("nome", "Nome completo", { autoComplete: "name" })}
          {campo(
            "apelido",
            // Rótulo de duas linhas no celular: a altura da linha do rótulo, não a da página.
            <span className="block leading-4">Apelido (seu nome de usuário, único na plataforma)</span>,
            { autoCapitalize: "none", autoCorrect: "off", placeholder: "ex.: ana.souza", maxLength: 30 },
            "É como você aparece nos comentários e no seu perfil (letras, números, ponto e sublinhado).",
          )}
          {campo("telefone", "WhatsApp com DDD", { inputMode: "tel", autoComplete: "tel", className: "campo tnum text-sm" })}
          {campo("cpf", "CPF", { inputMode: "numeric", className: "campo tnum text-sm" })}
          {campo(
            "cep",
            "CEP",
            { inputMode: "numeric", autoComplete: "postal-code", className: "campo tnum text-sm" },
            lugar && !lugar.erro ? lugar.texto : "Para mostrar primeiro as rifas perto de você.",
          )}
          {campo("email", "E-mail (opcional)", { type: "email", inputMode: "email", autoComplete: "email" })}

          <CampoDeSenha
            id="cc-senha"
            rotulo="Senha (mínimo 8 caracteres)"
            autoComplete="new-password"
            valor={f.senha}
            aoMudar={(v) => mudar("senha", v)}
            aoSair={sair("senha")}
            erro={erroDe("senha")}
            verSenha={verSenha}
            aoVerSenha={setVerSenha}
          />
          {campo("repetir", "Repita a senha", {
            type: verSenha ? "text" : "password",
            autoComplete: "new-password",
          })}

          {erro ? (
            <p role="alert" className="rounded-lg bg-red-soft px-3 py-2 text-sm text-red">
              {erro}
            </p>
          ) : problema && tocou && !algumErroNaTela ? (
            // O botão apagado diz por quê, enquanto nenhum erro está embaixo de um campo.
            <p className="text-xs text-muted">{problema}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={Boolean(problema) || criar.isPending}>
            {criar.isPending ? "Criando…" : "Criar conta"}
          </Button>

          <p className="text-[13px] leading-[18px] text-ink-2">
            Ao criar a conta, você declara ter 18 anos ou mais e concorda com os{" "}
            <Link href="/termos" className={LINK}>
              Termos de uso
            </Link>
            . O que fazemos com os seus dados está na{" "}
            <Link href="/privacidade" className={LINK}>
              Política de privacidade
            </Link>
            .
          </p>

          <p className="text-[13px] leading-[18px] text-ink-2">
            Já comprou antes com este WhatsApp? As compras antigas aparecem na conta depois que você
            confirmar o telefone pelo código do WhatsApp — é o que impede outra pessoa de ver o que é
            seu.
          </p>
          <p className="text-center text-[13px] leading-[18px] text-ink-2">
            Já tem conta?{" "}
            <Link href="/entrar" className={LINK}>
              entrar
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
