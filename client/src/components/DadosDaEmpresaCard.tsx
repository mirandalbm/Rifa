import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Campo, Card } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import {
  CAMPOS_DA_EMPRESA,
  EMPRESA_VAZIA,
  conferirCampoDaEmpresa,
  faltaNaEmpresa,
  formatarCnpj,
  type CampoDaEmpresa,
  type DadosDaEmpresa,
} from "@shared/legal";
import type { Template } from "@shared/template";

const ROTULO: Record<CampoDaEmpresa, string> = {
  razaoSocial: "Razão social",
  cnpj: "CNPJ",
  endereco: "Endereço da sede",
  contato: "E-mail de contato",
  encarregadoNome: "Encarregado de dados (nome)",
  encarregadoContato: "Encarregado de dados (e-mail)",
};

const AUTO: Record<CampoDaEmpresa, string> = {
  razaoSocial: "organization",
  cnpj: "off",
  endereco: "street-address",
  contato: "email",
  encarregadoNome: "off",
  encarregadoContato: "email",
};

const MAX: Record<CampoDaEmpresa, number> = {
  razaoSocial: 150,
  cnpj: 18,
  endereco: 200,
  contato: 120,
  encarregadoNome: 120,
  encarregadoContato: 120,
};

type Erros = Partial<Record<CampoDaEmpresa, string>>;

/**
 * Dados da empresa, salvos por etapas: o cartão tem o próprio botão e grava
 * só estes campos no rascunho (`PUT /admin/template/empresa`). O que estiver
 * certo entra; o que não estiver fica com o valor de antes e a mensagem
 * aparece embaixo do campo. A conferência roda ao sair do campo — nunca a
 * cada letra, senão o e-mail pela metade já aparece como erro. Entra no ar
 * ao publicar o template, como o resto da Aparência.
 */
export function DadosDaEmpresaCard({
  salvo,
  aoSalvar,
}: {
  salvo: DadosDaEmpresa | undefined;
  aoSalvar: (t: Template) => void;
}) {
  const base = { ...EMPRESA_VAZIA, ...salvo };
  const [valores, setValores] = useState<DadosDaEmpresa>(base);
  const [erros, setErros] = useState<Erros>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const mudou = CAMPOS_DA_EMPRESA.some((c) => valores[c] !== base[c]);

  const conferir = (c: CampoDaEmpresa) => {
    const r = conferirCampoDaEmpresa(c, valores[c]);
    setErros((e) => ({ ...e, [c]: "erro" in r ? r.erro : undefined }));
  };

  const salvar = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/template/empresa", valores)).json() as Promise<{
        template: Template;
        erros: Erros;
      }>,
    onSuccess: ({ template, erros: doServidor }) => {
      aoSalvar(template);
      setErros(doServidor);
      // O que entrou volta normalizado; o que não entrou fica como a pessoa digitou, para corrigir.
      const gravado = { ...EMPRESA_VAZIA, ...template.legal };
      setValores((v) => {
        const novo = { ...v };
        for (const c of CAMPOS_DA_EMPRESA) if (!doServidor[c]) novo[c] = gravado[c];
        return novo;
      });
      const errados = CAMPOS_DA_EMPRESA.filter((c) => doServidor[c]);
      setMsg(
        errados.length
          ? {
              ok: false,
              texto: `Salvei o que estava certo. Confira: ${errados.map((c) => ROTULO[c].toLowerCase()).join(", ")}.`,
            }
          : { ok: true, texto: "Dados da empresa salvos no rascunho. Publique o template para irem ao ar." },
      );
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const falta = faltaNaEmpresa(base);

  return (
    <Card title="Dados da empresa (Termos e Privacidade)">
      <div className="space-y-3 p-4 text-sm">
        <p className="text-xs text-muted">
          Saem nos <a href="/termos" className="underline">Termos de uso</a> e na{" "}
          <a href="/privacidade" className="underline">Política de privacidade</a>: quem vende pela internet precisa se
          identificar (Decreto 7.962/2013), e o encarregado de dados precisa ter nome e contato públicos (LGPD, art. 41).
          Dá para salvar aos poucos — o que estiver certo fica guardado. Entram no ar ao publicar o template.
        </p>
        {falta.length ? (
          <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
            Falta preencher antes de lançar: {falta.join(", ")}.
          </p>
        ) : null}
        {CAMPOS_DA_EMPRESA.map((c) => (
          <Campo key={c} rotulo={ROTULO[c]} erro={erros[c]}>
            <input
              id={`tpl-legal-${c}`}
              maxLength={MAX[c]}
              autoComplete={AUTO[c]}
              type={c === "contato" || c === "encarregadoContato" ? "email" : "text"}
              inputMode={c === "cnpj" ? "numeric" : c === "contato" || c === "encarregadoContato" ? "email" : undefined}
              autoCapitalize={c === "contato" || c === "encarregadoContato" ? "none" : undefined}
              spellCheck={c === "contato" || c === "encarregadoContato" ? false : undefined}
              value={c === "cnpj" ? formatarCnpj(valores.cnpj) : valores[c]}
              onChange={(e) => {
                const v = c === "cnpj" ? e.target.value.replace(/\D/g, "").slice(0, 14) : e.target.value;
                setValores((atual) => ({ ...atual, [c]: v }));
                // Corrigiu: some a mensagem; a próxima conferência é ao sair do campo.
                if (erros[c]) setErros((x) => ({ ...x, [c]: undefined }));
              }}
              onBlur={() => conferir(c)}
              className="campo"
            />
          </Campo>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {/* O toque no botão não tira o foco do campo: sem isso, a mensagem do campo
              aparece ao sair dele, empurra o botão para baixo e o clique cai fora. */}
          <Button
            disabled={!mudou || salvar.isPending}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? "Salvando…" : "Salvar dados da empresa"}
          </Button>
          {msg ? (
            <span role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
              {msg.texto}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
