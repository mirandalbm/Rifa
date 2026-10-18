/**
 * "Locais": o painel que escolhe o estado da vitrine (antes, "Rifas perto
 * de"). Mostra os 27 estados, cada um com a bandeira em círculo.
 *
 * **A localização só ordena, nunca esconde** (seção "Endereço e região" do
 * `CLAUDE.md`): escolher um local põe as rifas dele primeiro, e todas as
 * outras seguem na vitrine. A escolha é a mesma do seletor de antes
 * (`client/src/lib/regiao.ts`): o que muda aqui muda na vitrine, na lateral
 * e no topo.
 *
 * As bandeiras são arquivos do próprio site (`client/public/bandeiras/<uf>.svg`,
 * conjunto CC0 `pierrelapalu/icones-bandeiras-br-uf`, estilo `circle`; origem
 * e licença em `docs/LICENCAS-DE-TERCEIROS.md`). Puro: a tela e o teste leem
 * daqui.
 */
import { UFS, ufValida, type UF } from "./endereco";

/** O nome do painel e do botão que o abre. */
export const ROTULO_DOS_LOCAIS = "Locais";

/**
 * O primeiro item da lista, antes dos 27 estados: o Brasil todo, sem
 * prioridade de estado — o mesmo efeito de não escolher estado (`"todos"` em
 * `regiao.ts`). Quando a rifa nacional existir (plano em `docs/`), ela passa a
 * liderar o feed por outra função; este item e o painel não mudam.
 */
export const LOCAL_NACIONAL = {
  nome: "Nacional",
  descricao: "Brasil todo, sem prioridade de estado",
  /** A bandeira do Brasil, do mesmo conjunto (`br.svg`). */
  bandeira: "/bandeiras/br.svg",
} as const;

/** O que a tela diz embaixo do título — a regra, em palavras. */
export const EXPLICACAO_DOS_LOCAIS =
  "Escolha um estado para ver primeiro as rifas de lá. Nenhuma rifa some: as dos outros estados aparecem logo depois. Nacional é o Brasil todo, sem prioridade de estado.";

export interface Local {
  uf: UF;
  nome: string;
  /** Endereço do arquivo da bandeira, no próprio site. */
  bandeira: string;
}

/** Onde mora a bandeira de um estado (minúsculas, como o nome do arquivo). */
export function caminhoDaBandeira(uf: UF): string {
  return `/bandeiras/${uf.toLowerCase()}.svg`;
}

/** Os 27 locais, na ordem de `UFS` (por nome do estado). */
export const LOCAIS: readonly Local[] = (Object.keys(UFS) as UF[]).map((uf) => ({
  uf,
  nome: UFS[uf],
  bandeira: caminhoDaBandeira(uf),
}));

/** O texto do botão e do rótulo: "Locais: São Paulo" ou "Locais: Nacional". */
export function rotuloDoLocalEscolhido(nome: string): string {
  return `${ROTULO_DOS_LOCAIS}: ${nome}`;
}

/**
 * O que gravar em `regiao.ts` quando a pessoa escolhe um local no painel.
 *
 * - um estado: o estado que vai na frente (`{ uf, cidade }`). Se é o estado
 *   da conta, a cidade da conta fica junto — a ordem por cidade segue valendo;
 * - "Nacional" (`""`) ou qualquer valor que não seja estado: `null`, ou seja,
 *   **limpa a escolha manual**. Não esconde estado nenhum e não muda a ordem
 *   automática de sempre (o CEP e a cidade da conta, quando há conta).
 *
 * Nenhum dos dois filtra: quem ordena é `ordenarPorProximidade()`, que só
 * reordena. `/estado/UF` segue sendo a única página que filtra.
 */
export function escolhaDoLocal(
  uf: string,
  conta?: { uf?: string | null; cidade?: string | null } | null,
): { uf: UF; cidade: string | null } | null {
  if (!ufValida(uf)) return null;
  return { uf, cidade: conta?.uf === uf ? (conta.cidade ?? null) : null };
}

/**
 * O que está valendo, em texto, para o rótulo do botão (`aria-label`/`title`):
 * "Locais: São Paulo" (escolha manual), "Locais: Nacional" (nenhuma região) ou
 * "Locais: Nacional (automático: SP)" — sem escolha manual, a conta ordena
 * pelo CEP dela, e o rótulo não diz Nacional sozinho para não prometer o que
 * não está valendo.
 */
export function rotuloDoLocalEmVigor(vigor: { uf: UF | null; manual: boolean }): string {
  if (vigor.uf && vigor.manual) return rotuloDoLocalEscolhido(UFS[vigor.uf]);
  if (vigor.uf) return `${ROTULO_DOS_LOCAIS}: ${LOCAL_NACIONAL.nome} (automático: ${vigor.uf})`;
  return rotuloDoLocalEscolhido(LOCAL_NACIONAL.nome);
}
