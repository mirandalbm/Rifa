import { TopoDoAppCard } from "@/components/TopoDoAppCard";
import { AssistenteIACard } from "@/components/AssistenteIACard";
import { UsoDoAssistenteCard } from "@/components/UsoDoAssistenteCard";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Monitor, Smartphone, Trash2 } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Button, Caixa, Campo, Filtros, Pill } from "@/components/bits";
import { Abas, AlternarVisao, CartaoDoPainel } from "@/components/painel";
import { BannersCard } from "@/components/BannersCard";
import { apiRequest } from "@/lib/queryClient";
import { DadosDaEmpresaCard } from "@/components/DadosDaEmpresaCard";
import {
  CONTRASTE_MIN,
  FONTES,
  FUNDO,
  RAIOS,
  TIPOS_DE_BLOCO,
  APOIOS_MAX,
  BLOCO_REPETE,
  REDES_DO_RODAPE,
  type Rede,
  type TipoDeBloco,
  contraste,
  corValida,
  validarTemplate,
  type Bloco,
  type Fonte,
  type Raio,
  type Template,
} from "@shared/template";

interface Estado {
  rascunho: Template;
  publicado: Template;
  versaoAtual: string | null;
  versoes: { id: string; publicadoEm: string; restauradaDe: string | null; por: string | null }[];
}

const NOME_RAIO: Record<Raio, string> = { reto: "Retos", suave: "Suaves", redondo: "Redondos" };

/**
 * Construtor de templates: a aparência da plataforma sem código. Edita um
 * rascunho, vê na pré-visualização (celular ou computador) e publica; cada
 * publicação guarda a anterior, e voltar é um clique.
 */
export function AdminAparencia() {
  const qc = useQueryClient();
  const { data } = useQuery<Estado>({ queryKey: ["/api/admin/template"] });
  const [t, setT] = useState<Template | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tela, setTela] = useState<"celular" | "computador">("celular");
  const [sujo, setSujo] = useState(false);
  const arquivoDaLogo = useRef<HTMLInputElement>(null);
  const arquivoDoApoio = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !t) setT(data.rascunho);
  }, [data, t]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/template"] });
  const salvar = useMutation({
    mutationFn: async (novo: Template) => (await apiRequest("PUT", "/api/admin/template/rascunho", novo)).json(),
    onSuccess: () => {
      setSujo(false);
      setMsg({ ok: true, texto: "Rascunho salvo — a pré-visualização já mostra." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const publicar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/template/publicar"),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Publicado: a plataforma já está com esta aparência." });
      recarregar();
      qc.invalidateQueries({ queryKey: ["/api/public/template"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const restaurar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/template/versoes/${id}/restaurar`),
    onSuccess: async () => {
      setMsg({ ok: true, texto: "Versão restaurada e publicada." });
      setT(null);
      await recarregar();
      qc.invalidateQueries({ queryKey: ["/api/public/template"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const enviarLogo = useMutation({
    mutationFn: async (dataUrl: string) => (await apiRequest("PUT", "/api/admin/template/logo", { dataUrl })).json(),
    onSuccess: (novo: Template) => {
      setT((atual) => (atual ? { ...atual, identidade: { ...atual.identidade, logo: novo.identidade.logo } } : novo));
      setMsg({ ok: true, texto: "Logo enviada para o rascunho." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  // Exemplo no rodapé: só o rascunho; publicar continua sendo escolha da plataforma.
  const preencherExemplo = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/template/exemplo-rodape")).json() as Promise<Template>,
    onSuccess: (novo) => {
      setT(novo);
      setSujo(false);
      setMsg({
        ok: true,
        texto: "Rodapé de exemplo no rascunho — veja na pré-visualização e troque pelo material de verdade antes de publicar.",
      });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  // Logo de apoio do rodapé: o servidor reprocessa e devolve o endereço; o
  // nome e o link entram no rascunho, conferidos ao publicar.
  const enviarApoio = useMutation({
    mutationFn: async (dataUrl: string) =>
      (await apiRequest("PUT", "/api/admin/template/apoio", { dataUrl })).json() as Promise<{ id: string; imagem: string }>,
    onSuccess: (a) => {
      setSujo(true);
      setT((atual) =>
        atual ? { ...atual, apoios: [...(atual.apoios ?? []), { id: a.id, imagem: a.imagem, nome: "", link: null }] } : atual,
      );
      setMsg({ ok: true, texto: "Logo enviado. Dê o nome e o link, salve e publique." });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  if (!t || !data) {
    return (
      <PanelShell title="Aparência">
        <p className="text-sm text-muted">Carregando…</p>
      </PanelShell>
    );
  }

  let problema: string | null = null;
  try {
    validarTemplate(t);
  } catch (e) {
    problema = (e as Error).message;
  }
  const mudar = (novo: Template) => {
    setMsg(null);
    setSujo(true);
    setT(novo);
  };
  const id = t.identidade;
  const mudarId = (p: Partial<Template["identidade"]>) => mudar({ ...t, identidade: { ...id, ...p } });
  const mudarBloco = (i: number, p: Partial<Bloco>) =>
    mudar({ ...t, blocos: t.blocos.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const mover = (i: number, d: -1 | 1) => {
    const blocos = [...t.blocos];
    const [b] = blocos.splice(i, 1);
    blocos.splice(i + d, 0, b);
    mudar({ ...t, blocos });
  };
  const rascunhoDiferente = JSON.stringify(data.rascunho) !== JSON.stringify(data.publicado);

  const barra = (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-card">
      <Button variant="contorno" disabled={Boolean(problema) || salvar.isPending || !sujo} onClick={() => salvar.mutate(t)}>
        {salvar.isPending ? "Salvando…" : "Salvar rascunho"}
      </Button>
      <Button disabled={sujo || !rascunhoDiferente || publicar.isPending} onClick={() => publicar.mutate()}>
        {publicar.isPending ? "Publicando…" : "Publicar"}
      </Button>
      <span role="status" className="min-w-0 text-xs">
        {problema ? (
          <span className="text-red">{problema}</span>
        ) : msg ? (
          <span className={msg.ok ? "text-green-deep" : "text-red"}>{msg.texto}</span>
        ) : sujo ? (
          <span className="text-muted">Alterações ainda não salvas.</span>
        ) : rascunhoDiferente ? (
          <span className="text-muted">Rascunho diferente do que está no ar.</span>
        ) : (
          <span className="text-muted">O que está no ar é igual ao rascunho.</span>
        )}
      </span>
    </div>
  );

  return (
    <PanelShell title="Aparência">
      {/* grid-cols-1 (minmax 0): sem ele a coluna cresce até a pré-visualização
          de 400 px e a página passa da tela do celular. */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-start">
        <div className="min-w-0">
          {/* Uma aba por assunto, em vez de uma pilha de dez cartões. A barra de
              salvar e publicar fica nas abas que mexem no template. */}
          <Abas
            rotulo="Assuntos da aparência"
            abas={[
              {
                id: "inicio",
                titulo: "Identidade e tela inicial",
                conteudo: (
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    <CartaoDoPainel titulo="Identidade">
                      <div className="grid grid-cols-1 gap-4 px-5 pb-5 text-sm sm:grid-cols-2">
                        <Campo rotulo="Nome da plataforma" className="min-w-0">
                          <input id="tpl-nome" value={id.nome} maxLength={40} onChange={(e) => mudarId({ nome: e.target.value })} />
                        </Campo>
                        <div className="min-w-0">
                          <span className="label-xs">Logo (troca o nome no topo)</span>
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            {id.logo ? <img src={id.logo} alt="" className="h-8 rounded border border-line bg-branco p-1" /> : null}
                            {/* O botão abre o campo de arquivo escondido: o nativo mostraria "Choose File" na língua do navegador. */}
                            <Button type="button" variant="contorno" onClick={() => arquivoDaLogo.current?.click()}>
                              {id.logo ? "Trocar" : "Enviar logo"}
                            </Button>
                            <input
                              ref={arquivoDaLogo}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              aria-label="Arquivo da logo"
                              tabIndex={-1}
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (!f) return;
                                if (f.size > 2 * 1024 * 1024) return window.alert("A logo passa de 2 MB.");
                                const r = new FileReader();
                                r.onload = () => enviarLogo.mutate(String(r.result));
                                r.readAsDataURL(f);
                              }}
                            />
                            {id.logo ? (
                              <button type="button" className="text-xs text-red underline" onClick={() => mudarId({ logo: null })}>
                                usar o nome
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            Horizontal, de preferência PNG com fundo transparente. Aparece com até{" "}
                            <span className="tnum">96</span> px de altura. PNG, JPG ou WebP até 2 MB.
                          </p>
                        </div>
                        {(["claro", "escuro"] as const).map((tema) => {
                          const c = id.cor[tema];
                          const ok = corValida(c);
                          const razao = ok ? contraste(c, FUNDO[tema]) : 0;
                          const baixo = ok && razao < CONTRASTE_MIN;
                          return (
                            <div key={tema} className="min-w-0">
                              <label htmlFor={`tpl-cor-${tema}`} className="label-xs">Cor de marca — tema {tema}</label>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <input
                                  type="color"
                                  aria-label={`Escolher cor do tema ${tema}`}
                                  value={ok ? c : "#000000"}
                                  onChange={(e) => mudarId({ cor: { ...id.cor, [tema]: e.target.value } })}
                                  className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line-2 bg-white p-0.5"
                                />
                                <input
                                  id={`tpl-cor-${tema}`}
                                  value={c}
                                  aria-describedby={`tpl-cor-${tema}-contraste`}
                                  onChange={(e) => mudarId({ cor: { ...id.cor, [tema]: e.target.value.trim() } })}
                                  className="campo tnum mt-0 w-28 text-sm"
                                />
                                <span id={`tpl-cor-${tema}-contraste`}>
                                  <Pill status={!ok ? "draft" : baixo ? "expired" : "paid"}>
                                    {ok ? `${razao.toFixed(1)}:1` : "—"}
                                    <span className="sr-only"> de contraste com o fundo {tema}</span>
                                  </Pill>
                                </span>
                              </div>
                              {baixo ? (
                                <p className="mt-1 text-xs text-red">Quase não aparece no fundo {tema} (mínimo {CONTRASTE_MIN}:1).</p>
                              ) : null}
                            </div>
                          );
                        })}
                        <Campo rotulo="Fonte do texto" className="min-w-0">
                          <select id="tpl-fonte" value={id.fonte} onChange={(e) => mudarId({ fonte: e.target.value as Fonte })}>
                            {Object.entries(FONTES).map(([k, f]) => (
                              <option key={k} value={k}>{f.nome}</option>
                            ))}
                          </select>
                        </Campo>
                        <div className="min-w-0">
                          <span className="label-xs" aria-hidden>Cantos</span>
                          <Filtros
                            rotulo="Cantos"
                            exclusivo
                            className="mt-1"
                            opcoes={(Object.keys(RAIOS) as Raio[]).map((r) => ({ valor: r, rotulo: NOME_RAIO[r] }))}
                            ativa={id.raio}
                            aoMudar={(r) => mudarId({ raio: r })}
                          />
                        </div>
                        <p className="text-xs text-muted sm:col-span-2">
                          A cor de marca vale para logo, links e destaques. Verde de dinheiro, azul de espera e
                          vermelho de erro não mudam — são significado, não enfeite.
                        </p>
                      </div>
                    </CartaoDoPainel>

                    <BannersCard />

                    <CartaoDoPainel titulo="Tela inicial (blocos)">
                      <ul className="divide-y divide-line border-t border-line">
                        {t.blocos.map((b, i) => (
                          <li key={b.id} className="grid grid-cols-1 gap-2 px-5 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Caixa
                                className="min-w-0 flex-1"
                                marcada={b.ligado}
                                aoMudar={(v) => mudarBloco(i, { ligado: v })}
                              >
                                {TIPOS_DE_BLOCO[b.tipo]}
                              </Caixa>
                              <Pill status={b.ligado ? "paid" : "pending"}>{b.ligado ? "ligado" : "desligado"}</Pill>
                              <button type="button" aria-label={`Subir ${TIPOS_DE_BLOCO[b.tipo]}`} disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1.5 hover:bg-mist disabled:opacity-30">
                                <ArrowUp size={15} aria-hidden />
                              </button>
                              <button type="button" aria-label={`Descer ${TIPOS_DE_BLOCO[b.tipo]}`} disabled={i === t.blocos.length - 1} onClick={() => mover(i, 1)} className="rounded p-1.5 hover:bg-mist disabled:opacity-30">
                                <ArrowDown size={15} aria-hidden />
                              </button>
                              {b.tipo === "texto" ? (
                                <button
                                  type="button"
                                  aria-label="Remover bloco"
                                  onClick={() => mudar({ ...t, blocos: t.blocos.filter((_, j) => j !== i) })}
                                  className="rounded p-1.5 text-red hover:bg-mist"
                                >
                                  <Trash2 size={15} aria-hidden />
                                </button>
                              ) : null}
                            </div>
                            {b.tipo === "rifas" || b.tipo === "texto" || b.tipo === "ajuda" ? (
                              <div className="grid grid-cols-1 items-end gap-3 pl-6 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <Campo rotulo="Título do bloco (opcional)" className="min-w-0">
                                  <input value={b.titulo ?? ""} maxLength={80} onChange={(e) => mudarBloco(i, { titulo: e.target.value })} />
                                </Campo>
                                {b.tipo === "rifas" ? (
                                  <Campo rotulo="Mostrar (0 = todas)" className="min-w-0">
                                    <input
                                      type="number"
                                      min={0}
                                      max={60}
                                      value={b.quantidade ?? 0}
                                      onChange={(e) => mudarBloco(i, { quantidade: Number(e.target.value) })}
                                      className="campo tnum block w-24 text-sm"
                                    />
                                  </Campo>
                                ) : null}
                                {b.tipo === "texto" ? (
                                  <Campo rotulo="Texto do bloco" className="min-w-0 sm:col-span-2">
                                    <textarea value={b.corpo ?? ""} rows={3} maxLength={600} onChange={(e) => mudarBloco(i, { corpo: e.target.value })} />
                                  </Campo>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                        <Button
                          variant="contorno"
                          disabled={t.blocos.length >= 12}
                          onClick={() =>
                            mudar({
                              ...t,
                              blocos: [...t.blocos, { id: `texto-${Date.now().toString(36)}`, tipo: "texto", ligado: true, titulo: "", corpo: "" }],
                            })
                          }
                        >
                          + Bloco de texto
                        </Button>
                        {/* Bloco que ainda não está na lista (template publicado antes
                            de ele existir, por exemplo): entra no fim, ligado. */}
                        {(Object.keys(TIPOS_DE_BLOCO) as TipoDeBloco[])
                          .filter((tipo) => !BLOCO_REPETE[tipo] && !t.blocos.some((b) => b.tipo === tipo))
                          .map((tipo) => (
                            <Button
                              key={tipo}
                              variant="contorno"
                              disabled={t.blocos.length >= 12}
                              onClick={() => mudar({ ...t, blocos: [...t.blocos, { id: tipo, tipo, ligado: true }] })}
                            >
                              + {TIPOS_DE_BLOCO[tipo]}
                            </Button>
                          ))}
                      </div>
                    </CartaoDoPainel>
                    {barra}
                  </div>
                ),
              },
              {
                id: "topo",
                titulo: "Topo do app",
                conteudo: (
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    <TopoDoAppCard />
                  </div>
                ),
              },
              {
                id: "rodape",
                titulo: "Rodapé e empresa",
                conteudo: (
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    <CartaoDoPainel titulo="Textos do rodapé">
                      <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
                        <Campo rotulo="Rodapé (CNPJ, contato, avisos)">
                          <textarea
                            id="tpl-rodape"
                            rows={2}
                            maxLength={300}
                            value={t.textos.rodape}
                            onChange={(e) => mudar({ ...t, textos: { ...t.textos, rodape: e.target.value } })}
                          />
                        </Campo>
                        <Campo rotulo="Aviso de jogo responsável">
                          <input
                            id="tpl-jogo"
                            maxLength={200}
                            value={t.textos.jogoResponsavel}
                            onChange={(e) => mudar({ ...t, textos: { ...t.textos, jogoResponsavel: e.target.value } })}
                          />
                        </Campo>
                      </div>
                    </CartaoDoPainel>

                    <DadosDaEmpresaCard
                      salvo={data.rascunho.legal}
                      aoSalvar={(novo) => {
                        // Só a empresa muda: o resto do que está sendo editado fica como está.
                        setT((atual) => (atual ? { ...atual, legal: novo.legal } : novo));
                        recarregar();
                      }}
                    />

                    <CartaoDoPainel titulo="Rodapé de exemplo">
                      <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
                        <p className="text-xs text-muted">
                          Ainda sem as redes e os logos de verdade? Preenche o <strong>rascunho</strong> com exemplo — quatro
                          ícones neutros, redes sociais e um texto de apresentação — para você ver o rodapé pronto na
                          pré-visualização. Só preenche o que está vazio e <strong>não publica</strong>. Troque tudo pelo
                          material real antes de publicar: "Projetos que apoiamos" com apoiador inventado seria falso para quem
                          olha.
                        </p>
                        <div>
                          <Button variant="contorno" disabled={preencherExemplo.isPending} onClick={() => preencherExemplo.mutate()}>
                            {preencherExemplo.isPending ? "Preenchendo…" : "Preencher o rascunho com exemplo"}
                          </Button>
                        </div>
                      </div>
                    </CartaoDoPainel>

                    <CartaoDoPainel titulo="Redes sociais do rodapé">
                      <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
                        <p className="text-xs text-muted">
                          Cada rede vira um botão redondo embaixo do texto de apresentação, no rodapé do tablet e do
                          computador. Deixe em branco a que não usar. O endereço precisa ser da própria rede (https).
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {(Object.keys(REDES_DO_RODAPE) as Rede[]).map((rede) => (
                            <Campo key={rede} rotulo={REDES_DO_RODAPE[rede].nome} className="min-w-0">
                              <input
                                id={`rede-${rede}`}
                                maxLength={300}
                                placeholder="https://…"
                                value={(t.redes ?? []).find((r) => r.rede === rede)?.link ?? ""}
                                onChange={(e) => {
                                  const link = e.target.value;
                                  const outras = (t.redes ?? []).filter((r) => r.rede !== rede);
                                  const todas = link.trim() ? [...outras, { rede, link }] : outras;
                                  // A ordem dos botões é a da lista, não a de quem foi digitado primeiro.
                                  const ordem = Object.keys(REDES_DO_RODAPE);
                                  mudar({ ...t, redes: todas.sort((a, b) => ordem.indexOf(a.rede) - ordem.indexOf(b.rede)) });
                                }}
                              />
                            </Campo>
                          ))}
                        </div>
                      </div>
                    </CartaoDoPainel>

                    <CartaoDoPainel titulo="Logos do rodapé">
                      <div className="grid grid-cols-1 gap-3 px-5 pb-5 text-sm">
                        <p className="text-xs text-muted">
                          Aparecem no rodapé do tablet e do computador — casas de apoio, ONGs, órgãos públicos. Cada logo é um
                          botão: o link é um caminho do site (/ajuda) ou um endereço https. O nome é o texto alternativo da
                          imagem. No máximo <span className="tnum">{APOIOS_MAX}</span>.
                        </p>
                        {(t.apoios ?? []).map((a, i) => (
                          <div key={a.id} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <img src={a.imagem} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
                            <Campo rotulo="Nome" className="min-w-0">
                              <input
                                id={`apoio-nome-${a.id}`}
                                maxLength={60}
                                value={a.nome}
                                onChange={(e) => mudar({ ...t, apoios: (t.apoios ?? []).map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                              />
                            </Campo>
                            <Campo rotulo="Link (opcional)" className="min-w-0">
                              <input
                                id={`apoio-link-${a.id}`}
                                maxLength={300}
                                placeholder="https://…"
                                value={a.link ?? ""}
                                onChange={(e) =>
                                  mudar({ ...t, apoios: (t.apoios ?? []).map((x, j) => (j === i ? { ...x, link: e.target.value || null } : x)) })
                                }
                              />
                            </Campo>
                            <Button
                              variant="cinza"
                              aria-label={`Tirar o logo ${a.nome || i + 1}`}
                              onClick={() => mudar({ ...t, apoios: (t.apoios ?? []).filter((_, j) => j !== i) })}
                            >
                              Tirar
                            </Button>
                          </div>
                        ))}
                        <div>
                          <span className="label-xs block">Adicionar logo (PNG, JPG ou WebP, até 2 MB)</span>
                          {/* O botão abre o campo de arquivo escondido: o nativo mostraria "Choose File" na língua do navegador. */}
                          <Button
                            type="button"
                            variant="contorno"
                            className="mt-1"
                            disabled={(t.apoios?.length ?? 0) >= APOIOS_MAX || enviarApoio.isPending}
                            onClick={() => arquivoDoApoio.current?.click()}
                          >
                            {enviarApoio.isPending ? "Enviando…" : "Enviar logo do rodapé"}
                          </Button>
                          <input
                            ref={arquivoDoApoio}
                            id="apoio-arquivo"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            aria-label="Arquivo do logo do rodapé"
                            tabIndex={-1}
                            disabled={(t.apoios?.length ?? 0) >= APOIOS_MAX || enviarApoio.isPending}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              const r = new FileReader();
                              r.onload = () => enviarApoio.mutate(String(r.result));
                              r.readAsDataURL(f);
                            }}
                            className="sr-only"
                          />
                        </div>
                      </div>
                    </CartaoDoPainel>
                    {barra}
                  </div>
                ),
              },
              {
                id: "assistente",
                titulo: "Assistente de IA",
                conteudo: (
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    <AssistenteIACard />
                    <UsoDoAssistenteCard />
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-6">
          <CartaoDoPainel
            titulo="Pré-visualização do rascunho"
            acao={
              <AlternarVisao
                visao={tela}
                aoMudar={(v) => setTela(v as "celular" | "computador")}
                opcoes={[
                  { valor: "celular", rotulo: "Celular", icone: Smartphone },
                  { valor: "computador", rotulo: "Computador", icone: Monitor },
                ]}
              />
            }
          >
            {/* mx-auto no filho centraliza quando cabe e deixa rolar quando não cabe. */}
            <div className="flex overflow-x-auto bg-mist p-3">
              {tela === "celular" ? (
                <iframe title="Pré-visualização no celular" src="/?previa=1" className="mx-auto h-[700px] w-[375px] shrink-0 rounded-xl border border-line bg-white" />
              ) : (
                <div className="mx-auto h-[430px] w-[400px] shrink-0 overflow-hidden rounded-lg border border-line bg-white">
                  <iframe
                    title="Pré-visualização no computador"
                    src="/?previa=1"
                    className="origin-top-left bg-white"
                    style={{ width: 1280, height: 1376, transform: "scale(0.3125)" }}
                  />
                </div>
              )}
            </div>
            <p className="px-5 py-3 text-[11px] text-muted">Mostra o último rascunho salvo; atualiza sozinha.</p>
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Versões publicadas">
            <ul className="divide-y divide-line border-t border-line text-sm">
              {data.versoes.length === 0 ? <li className="px-5 py-3 text-muted">Ainda no template padrão.</li> : null}
              {data.versoes.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 px-5 py-2">
                  <span className="tnum flex-1">
                    {new Date(v.publicadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    <span className="block text-[11px] text-muted">
                      {v.por ?? "—"}
                      {v.restauradaDe ? " · restauração" : ""}
                    </span>
                  </span>
                  {v.id === data.versaoAtual ? (
                    <Pill status="paid">no ar</Pill>
                  ) : (
                    <Button variant="contorno" disabled={restaurar.isPending} onClick={() => restaurar.mutate(v.id)}>
                      Voltar para esta
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CartaoDoPainel>
        </div>
      </div>
    </PanelShell>
  );
}
