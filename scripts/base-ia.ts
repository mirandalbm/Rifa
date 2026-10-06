/**
 * A base de conhecimento do Lucky (o assistente de IA dos painéis), gerada do
 * próprio sistema — nunca escrita à parte, para o agente não prometer o que o
 * sistema não faz (a mesma regra dos Termos de uso). `docs/ROTEIRO-ASSISTENTE-IA.md`
 * explica o porquê; aqui só se monta.
 *
 *   npm run base-ia                 → grava em base-do-assistente/ (fora do git)
 *   npm run base-ia -- <pasta>      → grava em outra pasta
 *
 * Com `DATABASE_URL`, lê o template publicado (nome e dados da empresa) e a
 * configuração de reembolso; sem banco, usa o padrão e diz isso no arquivo.
 *
 * **Nunca entra**: dado de comprador, de organização, contrato, números de
 * venda (esses vêm pelas ações, na hora). É só regra e caminho de tela. Os
 * arquivos sobem no Chatbase em Sources → Files; quando uma regra mudar, gere
 * de novo e troque os arquivos lá — é assim que o Lucky "aprende".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SECTIONS, MENUS, type GrupoDoMenu, type Role, type SectionKey } from "../shared/access";

import { NOME_TEMA_AJUDA, perguntasDaAjuda } from "../shared/ajuda";
import { montarPrivacidade, montarTermosDeUso } from "../shared/legal";
import type { Secao } from "../shared/regulamento";
import { TEMPLATE_PADRAO, type Template } from "../shared/template";
import { TAXA_REEMBOLSO_PADRAO_PCT, regraDoReembolso } from "../shared/reembolso";
import { FORMATOS, LEGENDA_MAX, MAX_CARROSSEL, REELS_MAX_S, VIDEO_MAX_S } from "../shared/publicacao";
import { REELS_POR_RIFA } from "../shared/reels";
import {
  BANNER_TAMANHO,
  BANNERS_MAX,
  STORIES_MAX,
  STORY_HORAS,
  STORY_TAMANHO,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_SEGUNDOS,
  LEGENDA_MAX as LEGENDA_DO_STORY_MAX,
} from "../shared/vitrine";
import { ITENS_PROIBIDOS, MENSAGEM_DINHEIRO } from "../shared/premio";
import { EXPLICACAO_DO_METODO, ROTULO_DO_METODO, TOTAIS_DA_APURACAO, clausulaDaApuracao, clausulaDoGlobo } from "../shared/apuracao";
import { MENSAGEM_SAQUE_SO_COM_CNPJ } from "../shared/fiscal";
import { ACOES_DA_IA, ROTULO_DA_ACAO } from "../shared/iaAcoes";
import { CONTEXTO_DO_PAPEL, NOME_DO_ASSISTENTE } from "../shared/ia";

const pasta = resolve(process.argv[2] ?? "base-do-assistente");

interface Fonte {
  template: Template;
  reembolso: { aceita: boolean; taxaPct: number };
  doBanco: boolean;
}

async function lerFonte(): Promise<Fonte> {
  const padrao: Fonte = { template: TEMPLATE_PADRAO, reembolso: { aceita: false, taxaPct: TAXA_REEMBOLSO_PADRAO_PCT }, doBanco: false };
  if (!process.env.DATABASE_URL) return padrao;
  try {
    const { templatePublicado } = await import("../server/services/template");
    const { getPlataforma } = await import("../server/services/settings");
    const { pool } = await import("../server/db");
    const [{ template }, p] = await Promise.all([templatePublicado(), getPlataforma()]);
    await pool.end();
    return { template, reembolso: { aceita: p.estornoManual, taxaPct: p.taxaReembolsoPct }, doBanco: true };
  } catch (e) {
    console.warn(`Sem banco (${(e as Error).message}); vale o padrão.`);
    return padrao;
  }
}

const secoes = (lista: Secao[]) => lista.map((s) => `## ${s.titulo}\n\n${s.itens.map((i) => `- ${i}`).join("\n")}`).join("\n\n");

const rotulo = (k: SectionKey) => SECTIONS.find((s) => s.key === k);

function menuEmTexto(grupos: GrupoDoMenu[]): string {
  return grupos
    .map((g) => {
      const itens = g.itens.flatMap((i) => {
        if ("secao" in i) {
          const s = rotulo(i.secao);
          return s ? [`- **${s.label}** (\`${s.path}\`)`] : [];
        }
        const filhos = i.filhos.map(rotulo).filter(Boolean).map((s) => `  - **${s!.label}** (\`${s!.path}\`)`);
        return [`- **${i.rotulo}**`, ...filhos];
      });
      return `${g.titulo ? `### ${g.titulo}\n\n` : ""}${itens.join("\n")}`;
    })
    .join("\n\n");
}

const NOME_DO_PAPEL: Partial<Record<Role, string>> = {
  admin: "Administração da plataforma (master)",
  organizer: "Organização promotora",
  affiliate: "Afiliado",
  cambista: "Cambista (venda física; o Lucky não atende o cambista)",
};

const QUEM: Record<keyof typeof CONTEXTO_DO_PAPEL, string> = { plataforma: "Master", organizacao: "Organização", afiliado: "Afiliado" };

/** Os arquivos, em ordem. Cada um diz de onde veio, para quem sobe saber o que trocar. */
function arquivos(f: Fonte): { nome: string; texto: string }[] {
  const plataforma = f.template.identidade.nome;
  const origem = f.doBanco
    ? `Gerado do sistema em ${new Date().toISOString().slice(0, 10)}, com o template publicado e a configuração em vigor.`
    : `Gerado do sistema em ${new Date().toISOString().slice(0, 10)}, **sem banco**: nome e dados da empresa do padrão — gere de novo com o banco antes de subir.`;
  const cab = (t: string) => `# ${t}\n\n_${origem}_\n\n`;

  const ajuda = perguntasDaAjuda({ taxaReembolsoPct: f.reembolso.taxaPct, aceitaReembolso: f.reembolso.aceita });
  const temas = [...new Set(ajuda.map((p) => p.tema))];

  const papeis = (Object.keys(MENUS) as Role[]).map(
    (r) => `## ${NOME_DO_PAPEL[r] ?? r}\n\n${menuEmTexto(MENUS[r]!)}`,
  );

  const proibidos = ITENS_PROIBIDOS.map((i) => `- ${i.grupo}`).join("\n");
  const formatos = Object.values(FORMATOS)
    .map((x) => `- ${x.rotulo}: ${x.recomendado} px`)
    .join("\n");

  return [
    {
      nome: "01-quem-e-o-lucky.md",
      texto:
        cab(`Quem é o ${NOME_DO_ASSISTENTE}`) +
        `O ${NOME_DO_ASSISTENTE} é o assistente dos painéis da ${plataforma}, uma plataforma de rifas autorizadas pela SPA/MF. ` +
        `Ele atende três tipos de pessoa, e o sistema diz no começo de cada mensagem com quem ele fala:\n\n` +
        (Object.entries(CONTEXTO_DO_PAPEL) as [keyof typeof CONTEXTO_DO_PAPEL, string][]).map(([k, v]) => `- **${QUEM[k]}**: ${v}`).join("\n") +
        `\n\nO que ele faz:\n\n- Explica as telas e as regras do painel de quem fala, passo a passo.\n` +
        `- Consulta números pelas ações (nunca estima): ${ACOES_DA_IA.filter((a) => !a.grava).map((a) => ROTULO_DA_ACAO[a.nome]).join(", ")}.\n` +
        `- Faz, com a confirmação da pessoa: ${ACOES_DA_IA.filter((a) => a.grava).map((a) => ROTULO_DA_ACAO[a.nome]).join(", ")}.\n` +
        `- Ajuda a divulgar: legenda, roteiro de vídeo e de reels, ideia de arte, calendário de posts, anúncio e SEO da página da rifa, dentro das regras da plataforma (arquivo 05).\n\n` +
        `O que ele não faz: parecer jurídico ou contábil; falar de outra organização; prometer ganho; orientar pagamento fora da plataforma; ver dado de comprador (telefone, CPF, e-mail nunca chegam a ele).\n`,
    },
    {
      nome: "02-paineis-e-telas.md",
      texto:
        cab("Os painéis e o menu de cada um") +
        `Cada pessoa só vê o menu do papel dela. Ao explicar "onde fica", use o nome exato do item. **Só o master conhece todos os painéis**; para a organização e o afiliado, fale só do painel deles.\n\n` +
        papeis.join("\n\n") +
        "\n",
    },
    {
      nome: "03-central-de-ajuda.md",
      texto:
        cab("Central de ajuda (as perguntas do apostador)") +
        `As respostas abaixo são as mesmas da página /ajuda do site, com a regra em vigor.\n\n` +
        temas
          .map((t) => `## ${NOME_TEMA_AJUDA[t]}\n\n${ajuda.filter((p) => p.tema === t).map((p) => `### ${p.pergunta}\n\n${p.resposta.join("\n\n")}`).join("\n\n")}`)
          .join("\n\n") +
        "\n",
    },
    {
      nome: "04-regras-da-rifa.md",
      texto:
        cab("Regras da rifa (organização promotora)") +
        `## Publicar\n\nPara publicar, a rifa precisa do número da autorização SPA/MF, do arquivo do certificado e da data do sorteio (aba "Autorização e sorteio"), do telefone da organização aprovado, do aceite do contrato da plataforma (e dos anexos da modalidade) e do banner. A ação "${ROTULO_DA_ACAO.falta_para_publicar}" diz o que falta numa rifa. Depois de publicar, total de cotas, preço, prêmio, autorização e data travam; mudança é pedido analisado pela plataforma (editar ou adiar).\n\n` +
        `## Total de cotas e apuração\n\nO total é uma potência de 10: ${TOTAIS_DA_APURACAO.map((t) => t.toLocaleString("pt-BR")).join(", ")}.\n\n` +
        (Object.keys(ROTULO_DO_METODO) as (keyof typeof ROTULO_DO_METODO)[])
          .map((m) => `### ${ROTULO_DO_METODO[m]}\n\n${EXPLICACAO_DO_METODO[m]}`)
          .join("\n\n") +
        `\n\nExemplo da cláusula (rifa de 1.000 cotas, Loteria Federal):\n\n> ${clausulaDaApuracao(1000)}\n\nExemplo da cláusula (rifa de 1.000 cotas, globo):\n\n> ${clausulaDoGlobo(1000)}\n\n` +
        `## Prêmio\n\nPrêmio é bem ou serviço. ${MENSAGEM_DINHEIRO} Itens proibidos (Decreto 70.951/72):\n\n${proibidos}\n\n` +
        `## Reembolso\n\n${f.reembolso.aceita ? regraDoReembolso(f.reembolso.taxaPct) : "Os pedidos de reembolso pela conta estão desligados nesta plataforma; o direito de arrependimento do art. 49 do CDC continua valendo e o caminho está na central de ajuda."}\n\n` +
        `## Pagamento\n\nSó vale bilhete pago pela plataforma, pelo Pix dela. Pedir Pix por fora é motivo de banimento.\n`,
    },
    {
      nome: "05-divulgacao-design-video-seo.md",
      texto:
        cab("Divulgação: imagens, design, vídeo, marketing e SEO") +
        `O ${NOME_DO_ASSISTENTE} ajuda a criar a divulgação. As medidas abaixo são as que o sistema aceita; o resto é boa prática.\n\n` +
        `## Regras que valem para todo texto\n\n- Sem link e sem telefone na legenda (até ${LEGENDA_MAX} caracteres); o contato fica no perfil.\n- Nunca prometer ganho nem "chance maior".\n- Sempre o número da autorização SPA/MF e a data do sorteio.\n- Afiliado identifica a peça como publicidade.\n- Nada de menor de idade na peça; nada de Pix por fora.\n\n` +
        `## Publicação da rifa (carrossel)\n\nAté ${MAX_CARROSSEL} peças contando o banner. A primeira peça define o formato:\n\n${formatos}\n\nVídeo de até ${REELS_MAX_S / 60} min é reels; até ${VIDEO_MAX_S / 60} min, feed.\n\n` +
        `## Reels da organização\n\nAté ${REELS_POR_RIFA} vídeos por rifa, em pé e de até ${REELS_MAX_S / 60} min, com legenda própria.\n\n` +
        `## Stories\n\nImagem ${STORY_TAMANHO.largura} × ${STORY_TAMANHO.altura}; vídeo em pé de até ${STORY_VIDEO_MAX_SEGUNDOS} s e ${STORY_VIDEO_MAX_BYTES / 1024 / 1024} MB (MP4 ou MOV). Fica ${STORY_HORAS} h no ar; até ${STORIES_MAX} no ar ou agendados; legenda de até ${LEGENDA_DO_STORY_MAX} caracteres. Enquete e figurinhas (contagem do sorteio, Comprar, texto, emoji).\n\n` +
        `## Banner\n\nBanner da vitrine (da plataforma ou pago): ${BANNER_TAMANHO.largura} × ${BANNER_TAMANHO.altura}, até ${BANNERS_MAX} da plataforma no ar. Capa do perfil 1500 × 500; banner da entidade beneficiada 1200 × 400.\n\n` +
        `## Vídeo\n\nOs 3 primeiros segundos decidem: mostre o prêmio logo de cara. Legende o vídeo (muita gente assiste sem som). Termine com a chamada: "o link está no perfil".\n\n` +
        `## SEO e anúncio\n\nTítulo da rifa com o prêmio e a cidade ("Moto 0 km em Recife"); descrição com o que a pessoa procura, sem promessa de ganho. Anúncio pago na vitrine é "Patrocínio" (por clique) ou "Banner na vitrine" (por dia); pixels e UTM ficam em Marketing.\n`,
    },
    {
      nome: "06-afiliado.md",
      texto:
        cab("Afiliado: comissão e saque") +
        `- A comissão só vale com o vínculo aprovado pela organização dona da rifa e o aceite do termo dela.\n- Ela fica disponível depois do sorteio e da janela de estorno (ou na hora, se a organização escolheu).\n- ${MENSAGEM_SAQUE_SO_COM_CNPJ}\n- A nota fiscal sai contra quem paga: a organização ou, com a comissão guardada, a plataforma.\n- A ação "${ROTULO_DA_ACAO.falta_para_sacar}" diz o que falta para o saque.\n`,
    },
    {
      nome: "07-termos-de-uso.md",
      texto: cab("Termos de uso") + secoes(montarTermosDeUso({ plataforma, empresa: f.template.legal, reembolso: f.reembolso })) + "\n",
    },
    {
      nome: "08-privacidade.md",
      texto: cab("Política de privacidade") + secoes(montarPrivacidade({ plataforma, empresa: f.template.legal, reembolso: f.reembolso })) + "\n",
    },
  ];
}

async function main() {
  const f = await lerFonte();
  mkdirSync(pasta, { recursive: true });
  for (const a of arquivos(f)) {
    writeFileSync(join(pasta, a.nome), a.texto);
    console.log(`  ${a.nome} (${a.texto.length.toLocaleString("pt-BR")} caracteres)`);
  }
  console.log(`\nBase do ${NOME_DO_ASSISTENTE} em ${pasta}${f.doBanco ? "" : " (sem banco: gere de novo com o banco antes de subir)"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
