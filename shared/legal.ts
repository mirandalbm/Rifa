/**
 * Termos de uso e Política de privacidade da plataforma — montados das
 * regras que o sistema já aplica, como o regulamento da rifa e a ajuda: a
 * regra de reembolso sai de `regraDoReembolso()`, o prazo de reserva e a
 * idade mínima são os mesmos da tela. Assim o texto não fica dizendo uma
 * coisa enquanto o sistema faz outra.
 *
 * Os dados da empresa (razão social, CNPJ, endereço, contato e o encarregado
 * de dados) são da plataforma, cadastrados em Aparência e publicados com o
 * template (`legal`, `validarDadosDaEmpresa()`): o Decreto 7.962/2013 (art.
 * 2º) pede a identificação de quem vende pela internet, e a LGPD (art. 41,
 * § 1º) pede a identidade e o contato do encarregado em lugar público.
 *
 * Puro: o servidor valida, a tela mostra, o teste confere.
 */
import { DIAS_UTEIS_DEVOLUCAO_INTEGRAL, DISPUTA_PRAZO_DIAS, PRAZO_ESTORNO_MAX, RESPOSTA_PRAZO_DIAS } from "./chamados";
import { GUARDA_DAS_RECUSAS_DIAS, GUARDA_DO_BLOQUEIO_VENCIDO_DIAS } from "./antifraude";
import { DOCUMENTOS_GUARDA_DIAS } from "./verificacao";
import { cnpjValido } from "./format";
import { regraDoReembolso } from "./reembolso";
import { PIX_TARDIO_PRAZO_DIAS_UTEIS } from "./pixTardio";
import type { Secao } from "./regulamento";

/** Data em que esta redação passou a valer. Sobe junto com qualquer mudança de texto. */
export const VIGENCIA_DOS_TERMOS = "2026-10-08";

/**
 * Em quantos dias a plataforma responde a reclamação de consumidor: o teto do
 * Decreto 7.962/2013, art. 4º, parágrafo único (cinco dias). Os Termos dizem
 * isso a quem não conseguiu falar com a promotora.
 */
export const RESPOSTA_DA_PLATAFORMA_DIAS = 5;

/** Dias que a sessão de login vale sem uso (o cookie renova a cada acesso). */
export const SESSAO_DIAS = 7;

/**
 * O que o site guarda no navegador, com finalidade e duração — a tabela da
 * Privacidade (item 8). Só um cookie é do site (`rifa.sid`); o resto do que
 * é do site fica no aparelho (armazenamento local ou da aba) e não vai a
 * terceiros. Os de anúncio são dos fornecedores e só existem depois do
 * "Aceitar". Chave nova no aparelho, ou pixel novo, entra aqui no mesmo PR.
 */
export const GUARDADO_NO_NAVEGADOR: { grupo: string; itens: string[] }[] = [
  {
    grupo: "Cookie do site (essencial, não depende de aceite)",
    itens: [
      `rifa.sid — mantém você conectado à conta e protege os envios de formulário. Vale ${SESSAO_DIAS} dias desde o último uso e sai ao sair da conta.`,
    ],
  },
  {
    grupo: "Guardado só no seu aparelho (não é cookie e não vai a terceiros; fica até você limpar os dados do site)",
    itens: [
      "rifa.device — identificador aleatório do aparelho, para o antifraude e para contar visita e clique uma vez só; o servidor guarda só a impressão (hash) dele.",
      "rifa.carrinho — as rifas e os números que você pôs no carrinho (nunca preço nem dado de pagamento).",
      "rifa.cookies — a sua escolha neste aviso de cookies.",
      "rifa.tema e rifa.regiao — o tema claro ou escuro e o estado escolhido na vitrine.",
      "Preferências de tela: rifa.menu.aberto, rifa.assistente.aberto, rifa.reels.som, rifa.sorteio.comentarios, rifa.rifas.visao, rifa.instalar.fechado, rifa.login.aba, rifa.stories.vistos e rifa.surpresa (o presente da rifa já aberto).",
      "rifa.indicacao e rifa.indicacao.visitas — o código de quem te indicou, por 30 dias, e os links de indicação já contados.",
      "rifa.login.email — o e-mail do painel, só se você marcar \"lembrar\" ao entrar.",
      "rifa.compra-contada — marca a compra já contada para os pixels, para não contar duas vezes.",
    ],
  },
  {
    grupo: "Guardado só na aba (some ao fechar a aba)",
    itens: [
      "rifa.origem e rifa.utm — de onde você chegou (anúncio, story, link), para as estatísticas da organização; nunca decidem dinheiro.",
      "rifa.patrocinadas.vistas — as rifas patrocinadas já mostradas, para não repetir.",
    ],
  },
  {
    grupo: "Cookies de anúncio e medição (só depois do \"Aceitar\" e só quando a página tem o pixel; duração definida por cada fornecedor)",
    itens: [
      "Meta (Facebook e Instagram): _fbp e _fbc — medir a compra que veio de anúncio; 90 dias.",
      "Google Analytics: _ga e _ga_<id> — medir visitas; 2 anos.",
      "Google Ads: _gcl_au — medir a compra que veio de anúncio; 90 dias.",
      "TikTok: _ttp e _tt_enable_cookie — medir a compra que veio de anúncio; 13 meses.",
    ],
  },
];

export interface DadosDaEmpresa {
  razaoSocial: string;
  /** Só dígitos. */
  cnpj: string;
  endereco: string;
  /** E-mail de contato da plataforma. */
  contato: string;
  /** Encarregado pelo tratamento de dados (LGPD, art. 41). */
  encarregadoNome: string;
  /** Cargo ou função do encarregado (opcional; a Privacidade diz junto do nome). */
  encarregadoCargo: string;
  encarregadoContato: string;
}

export const EMPRESA_VAZIA: DadosDaEmpresa = {
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  contato: "",
  encarregadoNome: "",
  encarregadoCargo: "",
  encarregadoContato: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CampoDaEmpresa = keyof DadosDaEmpresa;

/** A ordem dos campos na tela e nas mensagens. */
export const CAMPOS_DA_EMPRESA: readonly CampoDaEmpresa[] = [
  "razaoSocial",
  "cnpj",
  "endereco",
  "contato",
  "encarregadoNome",
  "encarregadoCargo",
  "encarregadoContato",
];

const LIMITE: Record<CampoDaEmpresa, [number, string]> = {
  razaoSocial: [150, "A razão social"],
  cnpj: [20, "O CNPJ"],
  endereco: [200, "O endereço"],
  contato: [120, "O e-mail de contato"],
  encarregadoNome: [120, "O nome do encarregado"],
  encarregadoCargo: [80, "O cargo do encarregado"],
  encarregadoContato: [120, "O e-mail do encarregado"],
};

/**
 * Confere um campo só e devolve o valor normalizado ou a mensagem do erro.
 * Vazio é sempre válido: a plataforma preenche aos poucos, antes de lançar.
 */
export function conferirCampoDaEmpresa(campo: CampoDaEmpresa, v: unknown): { valor: string } | { erro: string } {
  const [max, nome] = LIMITE[campo];
  if (v === undefined || v === null) return { valor: "" };
  if (typeof v !== "string") return { erro: `${nome} precisa ser texto.` };
  let t = v.replace(/\s+/g, " ").trim();
  if (campo === "cnpj") t = t.replace(/\D/g, "");
  if (t.length > max) return { erro: `${nome} passa de ${max} caracteres.` };
  if (!t) return { valor: "" };
  if (campo === "cnpj" && !cnpjValido(t)) return { erro: "CNPJ da empresa inválido." };
  if (campo === "contato" || campo === "encarregadoContato") {
    t = t.toLowerCase();
    if (!EMAIL.test(t)) {
      return {
        erro: `${campo === "contato" ? "E-mail de contato" : "E-mail do encarregado"} inválido: use o formato nome@dominio.com.`,
      };
    }
  }
  return { valor: t };
}

/**
 * Confere campo a campo e separa o que está certo do que não está — para
 * salvar por etapas: o que passou entra, o que não passou volta com a
 * mensagem embaixo do campo. Só as chaves conhecidas.
 */
export function conferirDadosDaEmpresa(bruto: unknown): {
  dados: DadosDaEmpresa;
  erros: Partial<Record<CampoDaEmpresa, string>>;
} {
  const dados: DadosDaEmpresa = { ...EMPRESA_VAZIA };
  const erros: Partial<Record<CampoDaEmpresa, string>> = {};
  if (bruto === undefined || bruto === null) return { dados, erros };
  if (typeof bruto !== "object" || Array.isArray(bruto)) {
    for (const c of CAMPOS_DA_EMPRESA) erros[c] = "Dados da empresa inválidos.";
    return { dados, erros };
  }
  const b = bruto as Record<string, unknown>;
  for (const c of CAMPOS_DA_EMPRESA) {
    const r = conferirCampoDaEmpresa(c, b[c]);
    if ("erro" in r) erros[c] = r.erro;
    else dados[c] = r.valor;
  }
  return { dados, erros };
}

/**
 * Confere e normaliza (vem do corpo da requisição e sai na tela de todo
 * mundo). Tudo é opcional — a plataforma preenche antes de lançar —, mas o
 * que vier precisa estar certo: CNPJ com dígito válido e e-mails de verdade.
 * Lança `Error` com a mensagem do primeiro campo errado.
 */
export function validarDadosDaEmpresa(bruto: unknown): DadosDaEmpresa {
  if (bruto === undefined || bruto === null) return { ...EMPRESA_VAZIA };
  if (typeof bruto !== "object") throw new Error("Dados da empresa inválidos.");
  const { dados, erros } = conferirDadosDaEmpresa(bruto);
  const primeiro = CAMPOS_DA_EMPRESA.find((c) => erros[c]);
  if (primeiro) throw new Error(erros[primeiro]);
  return dados;
}

/** 12345678000190 → 12.345.678/0001-90. */
export function formatarCnpj(d: string): string {
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}

/** O que falta cadastrar antes de lançar — a tela de Aparência avisa. */
export function faltaNaEmpresa(e: DadosDaEmpresa): string[] {
  const falta: string[] = [];
  if (!e.razaoSocial) falta.push("razão social");
  if (!e.cnpj) falta.push("CNPJ");
  if (!e.endereco) falta.push("endereço");
  if (!e.contato) falta.push("e-mail de contato");
  if (!e.encarregadoNome || !e.encarregadoContato) falta.push("encarregado de dados (nome e e-mail)");
  return falta;
}

export interface DadosDosTermos {
  /** Nome da plataforma (identidade do template). */
  plataforma: string;
  empresa: DadosDaEmpresa;
  reembolso: { aceita: boolean; taxaPct: number };
}

/** Quem é a plataforma, numa frase — ou o aviso de que ainda falta cadastrar. */
function identificacao(d: DadosDosTermos): string {
  const e = d.empresa;
  if (!e.razaoSocial || !e.cnpj) {
    return `${d.plataforma} — os dados da empresa responsável (razão social, CNPJ e endereço) ainda não foram publicados nesta página.`;
  }
  return (
    `${d.plataforma} é operada por ${e.razaoSocial}, CNPJ ${formatarCnpj(e.cnpj)}` +
    (e.endereco ? `, com sede em ${e.endereco}` : "") +
    (e.contato ? `. Contato: ${e.contato}.` : ".")
  );
}

/** Para onde mandar quem precisa falar com a plataforma: o e-mail cadastrado, ou a ajuda enquanto não houver. */
function canal(e: DadosDaEmpresa): string {
  return e.contato ? `pelo e-mail ${e.contato}` : "pelos contatos que a plataforma publicar nesta página (até lá, a central de ajuda reúne as respostas)";
}

function contatoDoEncarregado(e: DadosDaEmpresa): string {
  if (e.encarregadoNome && e.encarregadoContato) {
    const cargo = e.encarregadoCargo ? `, ${e.encarregadoCargo}` : "";
    return `O encarregado pelo tratamento de dados pessoais é ${e.encarregadoNome}${cargo}, pelo e-mail ${e.encarregadoContato} — é o canal para exercer os seus direitos (item 7).`;
  }
  return `O contato do encarregado pelo tratamento de dados pessoais será publicado nesta página; até lá, fale com a plataforma ${canal(e)}.`;
}

/**
 * Os canais de quem não resolveu com a promotora, num item à parte para não
 * se perder no meio do parágrafo: a plataforma, com o prazo de resposta, e os
 * órgãos públicos, um não dependendo do outro.
 */
function canaisDoConsumidor(e: DadosDaEmpresa): string[] {
  return [
    `Reclamação: a plataforma responde em até ${RESPOSTA_DA_PLATAFORMA_DIAS} dias (Decreto 7.962/2013, art. 4º, parágrafo único) ${e.contato ? `— escreva para ${e.contato}` : "— pelos contatos que ela publicar nesta página"}. Você também pode registrar a reclamação no consumidor.gov.br, o serviço público do governo federal, ou no Procon da sua cidade, sem precisar falar antes com a plataforma.`,
  ];
}

/** Termos de uso da plataforma (apostador; organização e afiliado têm os termos deles além destes). */
export function montarTermosDeUso(d: DadosDosTermos): Secao[] {
  const s: Secao[] = [
    {
      titulo: "1. Quem somos",
      itens: [
        identificacao(d),
        `${d.plataforma} é a plataforma de tecnologia que hospeda as rifas e emite os bilhetes, e facilita o pagamento pelo Pix por meio de instituição de pagamento autorizada pelo Banco Central, que recebe e processa o Pix. Cada rifa tem uma promotora — a organização que obteve a autorização da Secretaria de Prêmios e Apostas do Ministério da Fazenda (Lei 5.768/71) —, e o regulamento de cada rifa, publicado na página dela, vale para aquela rifa junto com estes termos.`,
        "A promotora responde pelo prêmio e pela entrega dele ao ganhador. A plataforma responde pelo funcionamento do sistema: venda, reserva, pagamento, bilhete, sorteio conferível e atendimento.",
        "A compra de uma cota é relação de consumo: valem o Código de Defesa do Consumidor (Lei 8.078/1990) e a Lei 5.768/71, e nada nestes termos afasta os seus direitos de consumidor. A lei aplicável e o foro estão no item 10.",
        "Os dados pessoais seguem a Política de privacidade: lá estão o papel da plataforma (controladora dos dados do seu cadastro e das suas compras), as bases legais de cada uso e o encarregado pelo tratamento de dados.",
      ],
    },
    {
      titulo: "2. Quem pode usar",
      itens: [
        "Só maiores de 18 anos. Comprar para menor de idade, ou deixar que use a sua conta, é proibido.",
        "Os dados do cadastro precisam ser verdadeiros e seus. CPF e e-mail valem para uma conta só; o telefone pode ser confirmado por código no WhatsApp. Sem essa confirmação: (a) uma compra feita fora da conta, com o mesmo telefone, só aparece nela se tiver sido feita com o CPF da conta; (b) não dá para pedir pelo site o reembolso de compra feita com cambista; e (c) a conta criada pelo Google só compra depois de confirmar o telefone e informar o CPF.",
        "Você é responsável pela sua senha e pelo que é feito na sua conta. Desconfiou de acesso de outra pessoa, troque a senha: as outras sessões são encerradas.",
      ],
    },
    {
      titulo: "3. Compra, reserva e pagamento",
      itens: [
        "O preço é sempre o que o sistema calcula na hora da compra, com o pacote e o cupom aplicáveis. Os números escolhidos (ou sorteados para você) ficam reservados pelo prazo mostrado na tela; sem o pagamento nesse prazo, a reserva é desfeita e os números voltam a ficar livres.",
        "Cada número é vendido uma vez só. O carrinho é uma lista de desejos: só a compra reserva.",
        "Só vale bilhete pago pela plataforma. Pix feito direto para a promotora, para um afiliado ou para qualquer outra pessoa não gera bilhete, não concorre e não tem reembolso pela plataforma. Recebeu esse pedido, denuncie.",
        "A confirmação do pagamento vem do provedor do Pix, nunca da tela do navegador. O bilhete fica em Minhas compras e, para quem tem conta, também no seu perfil.",
      ],
    },
    {
      titulo: "4. Sorteio e prêmio",
      itens: [
        "O sorteio segue o regulamento da rifa: data (no modo \"quando completar\", a data máxima, que é antecipada para a próxima extração da Loteria Federal se a rifa completar antes, com aviso na plataforma), método de apuração da autorização (a leitura direta da Loteria Federal ou o globo da plataforma, com ata notarial), a regra para número sorteado não distribuído (na Loteria Federal, aproximação obrigatória por busca alternada e contínua em fita circular, +1, −1, +2, −2…, a partir do número apurado, até identificar um número distribuído; no globo, nova extração no mesmo ato, quantas vezes forem necessárias) e o mínimo de cotas, se houver. Na rifa autorizada não podem participar a promotora, seus sócios e diretores, nem a plataforma e seus administradores: a compra com o telefone de um deles, ou com o CPF de um sócio ou diretor, é recusada. Qualquer pessoa confere o resultado na página do sorteio da rifa. Cotas premiadas, quando houver, são vale-brinde, autorizado junto com o sorteio (promoção mista).",
        "O ganhador é avisado pelos dados do cadastro e recebe o prêmio da promotora no prazo do regulamento. Prêmio não reclamado em 180 dias prescreve, na forma da lei.",
      ],
    },
    {
      titulo: "5. Desistência e reembolso",
      itens: d.reembolso.aceita
        ? [
            regraDoReembolso(d.reembolso.taxaPct),
            `O pedido é feito por chamado, dentro da conta, e a devolução vai para a mesma conta que pagou. A devolução integral (arrependimento ou sorteio adiado) sai em até ${DIAS_UTEIS_DEVOLUCAO_INTEGRAL} dias úteis da aprovação; a com taxa, no prazo informado no protocolo, de até ${PRAZO_ESTORNO_MAX} dias. A promotora responde em até ${RESPOSTA_PRAZO_DIAS} dias; se recusar, ou se não responder nesse prazo, você pode levar a disputa à plataforma em até ${DISPUTA_PRAZO_DIAS} dias, e ela dá a palavra final. Nada disso tira o seu direito de reclamar no Procon ou no consumidor.gov.br.`,
            ...canaisDoConsumidor(d.empresa),
          ]
        : [
            `No momento a plataforma não recebe pedidos de reembolso pelo site: fale com a promotora da rifa (os contatos dela estão no perfil). O seu direito de desistir da compra online em até 7 dias (art. 49 do Código de Defesa do Consumidor), antes do fechamento dos pedidos, segue valendo — se a promotora não responder, fale com a plataforma ${canal(d.empresa)}, com o número do pedido.`,
            ...canaisDoConsumidor(d.empresa),
          ],
    },
    {
      titulo: "6. Bônus, indicação e presentes",
      itens: [
        "Cota de bônus, indicação e presente só existem quando a plataforma os liga, e a cota grátis só vale em rifa cujo regulamento a prevê, na quantidade autorizada. Não viram dinheiro, não têm reembolso e não podem ser transferidos. Autoindicação não conta, e o estorno de uma compra desfaz o bônus que ela rendeu: o da indicação e o das metas de compras e de indicações que deixarem de ser cumpridas.",
      ],
    },
    {
      titulo: "7. Comentários, mensagens e conduta",
      itens: [
        "Comentários, mensagens, grupos e publicações não podem ter link, telefone, pedido de pagamento por fora, ofensa, discriminação, conteúdo ilegal ou dado pessoal de terceiros. A plataforma pode retirar o conteúdo, encerrar conversas, travar a rifa ou banir a organização que descumprir — e as denúncias são analisadas por ela.",
        "Afiliados divulgam pelas regras do termo de adesão de cada organização: publicidade identificada, sem prometer ganho e sem atingir menores. Esse termo é um contrato à parte, entre o afiliado e a promotora: não integra estes termos, e o afiliado não fala nem age em nome da plataforma.",
      ],
    },
    {
      titulo: "8. Jogo responsável",
      itens: [
        "Rifa é entretenimento com chance de ganhar, não investimento nem fonte de renda. Compre só o que pode perder, nunca para recuperar perdas. Se o jogo estiver causando problema, procure ajuda (CVV, 188) e peça a exclusão da sua conta.",
      ],
    },
    {
      titulo: "9. Responsabilidade e funcionamento",
      itens: [
        `A plataforma mantém o sistema no ar com o cuidado devido, mas pode ter interrupções para manutenção ou por falha de terceiros (provedor do Pix, WhatsApp, internet). Pague dentro do prazo da reserva: se a confirmação do Pix chegar depois de a reserva vencer, ou depois do sorteio, os números não ficam garantidos e o valor é devolvido: o pagamento entra numa fila que a plataforma confere e devolve para a mesma conta que pagou, em até ${PIX_TARDIO_PRAZO_DIAS_UTEIS} dias úteis da confirmação do pagamento — pelo provedor do Pix, sempre que ele permitir. Se demorar, fale com a plataforma ${canal(d.empresa)}.`,
      ],
    },
    {
      titulo: "10. Mudanças, lei e foro",
      itens: [
        `Esta versão vale a partir de ${dataPorExtenso(VIGENCIA_DOS_TERMOS)}. Uma versão nova é publicada nesta página com a data em que passa a valer; a compra já feita segue as regras do momento em que foi feita.`,
        "Você aceita estes termos ao criar a conta e, a cada compra, junto com o regulamento da rifa — os dois ficam ao lado do botão de pagar. Eles estão sempre nesta página, para ler, copiar ou imprimir.",
        `Vale a lei brasileira. Você pode reclamar no foro do seu domicílio, nos termos do art. 101, I, do Código de Defesa do Consumidor, além de falar com a plataforma ${canal(d.empresa)} e usar o consumidor.gov.br.`,
        "Nas relações não sujeitas ao Código de Defesa do Consumidor, fica eleito o foro da comarca da sede da plataforma, informada no item 1.",
      ],
    },
  ];
  return s;
}

/** Política de privacidade (LGPD). */
export function montarPrivacidade(d: DadosDosTermos): Secao[] {
  return [
    {
      titulo: "1. Quem trata os seus dados",
      itens: [
        identificacao(d),
        "A plataforma atua como controladora dos dados que trata em nome próprio — o seu cadastro e as suas compras — e como operadora dos dados que trata por conta da promotora, para ela cumprir o que é dela (como a entrega do prêmio), na forma desta Política. A promotora da rifa recebe só o necessário para cumprir o que é dela: o ganhador (para entregar o prêmio), os clientes que compraram na mão do cambista dela e o nome e o WhatsApp de quem pede para ser colaborador dela. Das demais compras, ela vê o pedido, os números e o valor, com o cliente identificado só por um código. O afiliado vê só o primeiro nome de quem comprou pelo link dele.",
        contatoDoEncarregado(d.empresa),
      ],
    },
    {
      titulo: "2. Quais dados e para quê",
      itens: [
        "Cadastro (nome, telefone, CPF, e-mail, CEP, cidade e estado, apelido e foto): identificar você, emitir o bilhete, avisar do resultado, entregar o prêmio e cumprir a lei das rifas. Base legal: execução do contrato e obrigação legal.",
        "Compras e pagamentos (pedidos, números, valores, o identificador do Pix): vender, conferir o pagamento, devolver em caso de reembolso e prestar contas. Os dados do pagamento ficam com o provedor do Pix; a plataforma não guarda dados bancários de quem compra; guarda apenas o identificador do Pix, necessário para conferir o pagamento e fazer devoluções. Base legal: execução do contrato e obrigação legal (prestação de contas da rifa).",
        "Segurança e antifraude (endereço IP e identificador do aparelho em hash, telefone mascarado nas recusas, e tentativas de acesso): impedir golpe, bloqueio de estoque e uso indevido de contas. O registro de auditoria de algumas ações (entrar no painel, autorizar ou revogar a comparação de foto, por exemplo) guarda o IP de quem agiu. Base legal: legítimo interesse e prevenção à fraude.",
        "Comentários, mensagens e publicações: o que você escreve, para mostrar a quem deve ver e para moderar denúncias (a plataforma lê só o trecho denunciado). Base legal: execução do contrato e legítimo interesse (moderação).",
        "Voto nas enquetes dos stories (só com conta): qual opção você escolheu, guardado só para contar um voto por pessoa e mostrar a você o resultado. A organização vê os totais de cada opção, nunca quem votou em quê; o voto sai com o story. Base legal: execução do contrato (a enquete que você escolheu responder).",
        `Verificação de perfil (opcional): documentos, guardados cifrados, e — só com a sua autorização destacada — a comparação da foto do perfil com a do documento, que é dado biométrico (art. 11), para verificação de identidade e prevenção a fraudes. Da comparação fica só o resultado (verificado ou não) — nenhum modelo ou medida do rosto. Os documentos são apagados ${DOCUMENTOS_GUARDA_DIAS} dias depois da decisão (verificado ou recusado); o resultado e o selo ficam. A autorização pode ser revogada na própria tela; quem foi verificado com uma autorização anterior é chamado a confirmar de novo, senão o selo sai. Base legal: os documentos, execução do contrato (a verificação que você pede); a comparação da foto, o seu consentimento específico e destacado (LGPD, art. 11, I).`,
        "Origem da visita (de onde você chegou, campanha de anúncio): estatística de vendas; nunca decide preço nem comissão. Base legal: legítimo interesse.",
        "Sócios e diretores da promotora (nome, cargo e CPF, cadastrados pela organização): só para recusar a compra deles nas rifas autorizadas, que eles não podem disputar. O CPF não fica guardado — só uma impressão cifrada para a comparação e os dois últimos dígitos para a tela. Sai quando a organização tira a pessoa da lista. Base legal: cumprimento de obrigação regulatória (Lei 5.768/71).",
        "Documentos da entidade beneficiada (CNPJ, ata da diretoria, certidões), enviados pela organização: só a plataforma os abre, para conferir a entidade antes de ela aparecer na rifa; guardados cifrados e apagados junto com a entidade. Base legal: legítimo interesse (conferir a entidade antes de ela aparecer ao público) e prevenção à fraude.",
      ],
    },
    {
      titulo: "3. Com quem compartilhamos",
      itens: [
        "Provedor do Pix (para gerar e conferir a cobrança e fazer devoluções); Meta/WhatsApp (código de acesso e mensagens das suas compras); Google (só se você entrar com o Google); serviço de consulta de CEP (só o CEP); serviços de notificação do celular (Google, Apple, Mozilla, Microsoft — só se você ligar os avisos); Amazon Web Services (Amazon Rekognition), só quando a plataforma liga o comparador automático (sem ele, a comparação é feita por uma pessoa da plataforma e a foto não sai), como operadora, nos termos do contrato dela com a plataforma, em servidores no exterior — transferência internacional que só acontece com o seu consentimento expresso no texto que a cita (LGPD, art. 33, VIII); os provedores de hospedagem, banco de dados e cópia de segurança, que guardam os dados por nós; e a promotora e o afiliado (o que está no item 1).",
        "Pixels de anúncio (Meta, Google, TikTok) só carregam depois do seu \"Aceitar\" no aviso de cookies; a compra enviada a eles leva o telefone só em hash, nunca nome, CPF ou e-mail. Meta, Google e TikTok atuam como controladores conjuntos dos dados coletados por esses cookies, nos termos das respectivas políticas de privacidade. Base legal: o seu consentimento, que você retira em Perfil → Preferência de cookies; ao recusar, os cookies não essenciais já instalados são removidos.",
        "Autoridades, quando a lei ou ordem judicial exigir. Nunca vendemos dados pessoais.",
      ],
    },
    {
      titulo: "4. O que fica público",
      itens: [
        "Nos comentários, o seu apelido ou o primeiro nome com a inicial. No seu perfil (/u/apelido), apelido, foto e o primeiro e o último nome.",
        "Quando a compra é paga, o primeiro nome com a inicial e a cidade/UF do cadastro podem aparecer em \"jogando agora\" na vitrine; o ganhador (do sorteio ou de cota premiada) aparece da mesma forma, no comentário fixo da rifa e, se a promotora publicar, na foto do resultado. No sorteio pelo globo da plataforma, a ata notarial da extração (com o nome do auditor ou das testemunhas, o local e a hora de cada bola) fica pública na página do sorteio, como prova da apuração. Quem tem o código do pedido vê o nome de quem comprou ao consultá-lo — guarde o código com você.",
        "Se você publicar sobre uma rifa (quando a plataforma liga essa opção), o texto e as fotos que você enviar aparecem na página da rifa com o seu apelido, depois que a organização autorizar; sai do ar se você retirar, se a compra for estornada ou se a organização retirar. As fotos de uma publicação recusada ou retirada são apagadas na hora.",
        "Se você é afiliado e publica sobre uma rifa, o texto e as fotos ou o vídeo que você enviar aparecem na página da rifa com o seu nome curto e o seu código, depois que a organização autorizar (com foto ou vídeo, sempre depois); sai do ar se você retirar, se a organização retirar ou se você perder o vínculo com ela. As fotos e o vídeo saem do banco quando a publicação é recusada ou retirada — inclusive por você, a qualquer momento, em Divulgar.",
        "Só se você ligar o perfil público: aparecer em \"Quem também joga\" e em \"Seguido por\". Nasce desligado. Telefone, CPF e e-mail nunca são públicos.",
      ],
    },
    {
      titulo: "5. Por quanto tempo",
      itens: [
        `Compras, bilhetes, recibos e o registro do sorteio: 5 anos (Código Tributário Nacional, arts. 173 e 174), e os documentos fiscais eletrônicos até 11 anos, mesmo depois de excluída a conta. Avisos da central: 90 dias. Contagem de tentativas para os limites de antifraude: 2 horas; o registro das recusas (com o telefone mascarado e o aparelho em hash): ${GUARDA_DAS_RECUSAS_DIAS} dias; o bloqueio com prazo sai ${GUARDA_DO_BLOQUEIO_VENCIDO_DIAS} dias depois de vencer, e o bloqueio sem prazo fica até a plataforma retirá-lo.`,
        "Ao excluir a conta, nome, telefone, CPF, e-mail, senha, apelido, foto, as fotos das suas publicações e a verificação e os votos nas enquetes saem; o que precisa ficar por lei fica sem identificar você: as compras e os bilhetes ficam anonimizados (sem nome, telefone, CPF e e-mail), para fins fiscais e de auditoria do sorteio.",
      ],
    },
    {
      titulo: "6. Segurança",
      itens: [
        "Documentos e dados fiscais ficam cifrados (AES-256-GCM), com a chave fora do banco; senhas ficam em hash, e o IP e o aparelho usados no antifraude também. Quem da plataforma abre documento, dado fiscal, trecho denunciado ou baixa exportação com dados pessoais deixa registro em auditoria.",
      ],
    },
    {
      titulo: "7. Seus direitos",
      itens: [
        "Você pode confirmar se tratamos seus dados, acessá-los, corrigi-los (Minha conta), excluir a conta, revogar consentimentos a qualquer momento e sem custo (cookies e perfil público no seu perfil, avisos no celular, comparação de foto na verificação), pedir informação sobre compartilhamento e a portabilidade (LGPD, art. 18). Você também pode se opor a tratamento feito sem o seu consentimento — como os de legítimo interesse (segurança e antifraude, moderação, origem da visita) — quando ele descumprir a LGPD (art. 18, § 2º).",
        `Peça pelo encarregado (item 1) ou fale com a plataforma ${canal(d.empresa)}. O pedido é gratuito e respondido em até 15 dias (LGPD, art. 19, II). Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      titulo: "8. Cookies",
      itens: [
        "Os essenciais (sessão, carrinho, tema, região) fazem o site funcionar e não dependem de aceite. Os de anúncio e medição só depois do \"Aceitar\"; recusar é tão fácil quanto aceitar, apaga os de anúncio e medição já gravados, e você muda de ideia em Perfil → Preferência de cookies.",
        ...GUARDADO_NO_NAVEGADOR.flatMap((g) => [`${g.grupo}:`, ...g.itens.map((i) => `• ${i}`)]),
      ],
    },
    {
      titulo: "9. Menores e mudanças",
      itens: [
        "A plataforma não é para menores de 18 anos e não trata, de propósito, dados deles; conta de menor pode ser encerrada.",
        `Esta versão vale a partir de ${dataPorExtenso(VIGENCIA_DOS_TERMOS)}. Uma versão nova é publicada nesta página com a data em que passa a valer.`,
      ],
    },
  ];
}

function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
