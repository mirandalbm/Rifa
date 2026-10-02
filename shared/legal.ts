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
import { GUARDA_DAS_RECUSAS_DIAS, GUARDA_DO_BLOQUEIO_VENCIDO_DIAS } from "./antifraude";
import { cnpjValido } from "./format";
import { regraDoReembolso } from "./reembolso";
import type { Secao } from "./regulamento";

/** Data em que esta redação passou a valer. Sobe junto com qualquer mudança de texto. */
export const VIGENCIA_DOS_TERMOS = "2026-10-02";

export interface DadosDaEmpresa {
  razaoSocial: string;
  /** Só dígitos. */
  cnpj: string;
  endereco: string;
  /** E-mail de contato da plataforma. */
  contato: string;
  /** Encarregado pelo tratamento de dados (LGPD, art. 41). */
  encarregadoNome: string;
  encarregadoContato: string;
}

export const EMPRESA_VAZIA: DadosDaEmpresa = {
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  contato: "",
  encarregadoNome: "",
  encarregadoContato: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Confere e normaliza (vem do corpo da requisição e sai na tela de todo
 * mundo). Tudo é opcional — a plataforma preenche antes de lançar —, mas o
 * que vier precisa estar certo: CNPJ com dígito válido e e-mails de verdade.
 * Lança `Error` com a mensagem para a tela.
 */
export function validarDadosDaEmpresa(bruto: unknown): DadosDaEmpresa {
  if (bruto === undefined || bruto === null) return { ...EMPRESA_VAZIA };
  if (typeof bruto !== "object") throw new Error("Dados da empresa inválidos.");
  const b = bruto as Record<string, unknown>;
  const texto = (v: unknown, max: number, campo: string) => {
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") throw new Error(`${campo} precisa ser texto.`);
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length > max) throw new Error(`${campo} passa de ${max} caracteres.`);
    return t;
  };
  const razaoSocial = texto(b.razaoSocial, 150, "A razão social");
  const cnpj = texto(b.cnpj, 20, "O CNPJ").replace(/\D/g, "");
  if (cnpj && !cnpjValido(cnpj)) throw new Error("CNPJ da empresa inválido.");
  const endereco = texto(b.endereco, 200, "O endereço");
  const contato = texto(b.contato, 120, "O e-mail de contato").toLowerCase();
  if (contato && !EMAIL.test(contato)) throw new Error("E-mail de contato inválido.");
  const encarregadoNome = texto(b.encarregadoNome, 120, "O nome do encarregado");
  const encarregadoContato = texto(b.encarregadoContato, 120, "O e-mail do encarregado").toLowerCase();
  if (encarregadoContato && !EMAIL.test(encarregadoContato)) throw new Error("E-mail do encarregado inválido.");
  return { razaoSocial, cnpj, endereco, contato, encarregadoNome, encarregadoContato };
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
    return `O encarregado pelo tratamento de dados pessoais é ${e.encarregadoNome}, pelo e-mail ${e.encarregadoContato}.`;
  }
  return `O contato do encarregado pelo tratamento de dados pessoais será publicado nesta página; até lá, fale com a plataforma ${canal(e)}.`;
}

/** Termos de uso da plataforma (apostador; organização e afiliado têm os termos deles além destes). */
export function montarTermosDeUso(d: DadosDosTermos): Secao[] {
  const s: Secao[] = [
    {
      titulo: "1. Quem somos",
      itens: [
        identificacao(d),
        `${d.plataforma} é a plataforma de tecnologia que hospeda as rifas, recebe o pagamento pelo Pix e emite os bilhetes. Cada rifa tem uma promotora — a organização que obteve a autorização da Secretaria de Prêmios e Apostas do Ministério da Fazenda (Lei 5.768/71) —, e o regulamento de cada rifa, publicado na página dela, vale para aquela rifa junto com estes termos.`,
        "A promotora responde pelo prêmio e pela entrega dele ao ganhador. A plataforma responde pelo funcionamento do sistema: venda, reserva, pagamento, bilhete, sorteio conferível e atendimento.",
      ],
    },
    {
      titulo: "2. Quem pode usar",
      itens: [
        "Só maiores de 18 anos. Comprar para menor de idade, ou deixar que use a sua conta, é proibido.",
        "Os dados do cadastro precisam ser verdadeiros e seus. CPF e e-mail valem para uma conta só; o telefone pode ser confirmado por código no WhatsApp — sem essa confirmação, algumas funções (como ver compras feitas fora da conta e pedir reembolso de venda do cambista) ficam limitadas.",
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
        "O sorteio segue o regulamento da rifa: data, forma (inclusive a regra para número sorteado não vendido) e mínimo de cotas, se houver. O compromisso do sorteio (hash da semente) é publicado antes; depois, qualquer pessoa confere o resultado no próprio aparelho.",
        "O ganhador é avisado pelos dados do cadastro e recebe o prêmio da promotora no prazo do regulamento. Prêmio não reclamado em 180 dias prescreve, na forma da lei.",
      ],
    },
    {
      titulo: "5. Desistência e reembolso",
      itens: d.reembolso.aceita
        ? [
            regraDoReembolso(d.reembolso.taxaPct),
            "O pedido é feito por chamado, dentro da conta, e a devolução vai para a mesma conta que pagou. Se a promotora recusar, você pode levar a disputa à plataforma, que dá a palavra final.",
          ]
        : [
            `No momento a plataforma não recebe pedidos de reembolso pelo site: fale com a promotora da rifa (os contatos dela estão no perfil). O seu direito de desistir da compra online em até 7 dias (art. 49 do Código de Defesa do Consumidor), antes do fechamento dos pedidos, segue valendo — se a promotora não responder, fale com a plataforma ${canal(d.empresa)}.`,
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
        "Afiliados divulgam pelas regras do termo de adesão de cada organização: publicidade identificada, sem prometer ganho e sem atingir menores.",
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
        `A plataforma mantém o sistema no ar com o cuidado devido, mas pode ter interrupções para manutenção ou por falha de terceiros (provedor do Pix, WhatsApp, internet). Pague dentro do prazo da reserva: se a confirmação do Pix chegar depois de a reserva vencer, ou depois do sorteio, os números não ficam garantidos e o valor é devolvido: o pagamento entra numa fila que a plataforma confere e devolve para a mesma conta que pagou — pelo provedor do Pix, sempre que ele permitir. Se demorar, fale com a plataforma ${canal(d.empresa)}.`,
        "Nada nestes termos afasta os seus direitos de consumidor.",
      ],
    },
    {
      titulo: "10. Mudanças, lei e foro",
      itens: [
        `Esta versão vale a partir de ${dataPorExtenso(VIGENCIA_DOS_TERMOS)}. Uma versão nova é publicada nesta página com a data em que passa a valer; a compra já feita segue as regras do momento em que foi feita.`,
        `Vale a lei brasileira. Você pode reclamar no foro do seu domicílio, como prevê o Código de Defesa do Consumidor, além de falar com a plataforma ${canal(d.empresa)} e usar o consumidor.gov.br.`,
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
        "A plataforma é a controladora dos dados do seu cadastro e das suas compras. A promotora da rifa recebe só o necessário para cumprir o que é dela: o ganhador (para entregar o prêmio), os clientes que compraram na mão do cambista dela e o nome e o WhatsApp de quem pede para ser colaborador dela. Das demais compras, ela vê o pedido, os números e o valor, com o cliente identificado só por um código. O afiliado vê só o primeiro nome de quem comprou pelo link dele.",
        contatoDoEncarregado(d.empresa),
      ],
    },
    {
      titulo: "2. Quais dados e para quê",
      itens: [
        "Cadastro (nome, telefone, CPF, e-mail, CEP, cidade e estado, apelido e foto): identificar você, emitir o bilhete, avisar do resultado, entregar o prêmio e cumprir a lei das rifas. Base legal: execução do contrato e obrigação legal.",
        "Compras e pagamentos (pedidos, números, valores, o identificador do Pix): vender, conferir o pagamento, devolver em caso de reembolso e prestar contas. Os dados do pagamento ficam com o provedor do Pix; a plataforma não guarda dados bancários de quem compra.",
        "Segurança e antifraude (endereço IP e identificador do aparelho em hash, telefone mascarado nas recusas, e tentativas de acesso): impedir golpe, bloqueio de estoque e uso indevido de contas. O registro de auditoria de algumas ações (entrar no painel, autorizar ou revogar a comparação de foto, por exemplo) guarda o IP de quem agiu. Base legal: legítimo interesse e prevenção à fraude.",
        "Comentários, mensagens e publicações: o que você escreve, para mostrar a quem deve ver e para moderar denúncias (a plataforma lê só o trecho denunciado).",
        "Verificação de perfil (opcional): documentos, guardados cifrados, e — só com a sua autorização destacada — a comparação da foto do perfil com a do documento, que é dado biométrico (art. 11). A autorização pode ser revogada na própria tela.",
        "Origem da visita (de onde você chegou, campanha de anúncio): estatística de vendas; nunca decide preço nem comissão.",
      ],
    },
    {
      titulo: "3. Com quem compartilhamos",
      itens: [
        "Provedor do Pix (para gerar e conferir a cobrança e fazer devoluções); Meta/WhatsApp (código de acesso e mensagens das suas compras); Google (só se você entrar com o Google); serviço de consulta de CEP (só o CEP); serviços de notificação do celular (Google, Apple, Mozilla, Microsoft — só se você ligar os avisos); Amazon Rekognition, que pode processar a imagem fora do Brasil (só se você autorizou o texto que o cita); os provedores de hospedagem, banco de dados e cópia de segurança, que guardam os dados por nós; e a promotora e o afiliado (o que está no item 1).",
        "Pixels de anúncio (Meta, Google, TikTok) só carregam depois do seu \"Aceitar\" no aviso de cookies; a compra enviada a eles leva o telefone só em hash, nunca nome, CPF ou e-mail.",
        "Autoridades, quando a lei ou ordem judicial exigir. Nunca vendemos dados pessoais.",
      ],
    },
    {
      titulo: "4. O que fica público",
      itens: [
        "Nos comentários, o seu apelido ou o primeiro nome com a inicial. No seu perfil (/u/apelido), apelido, foto e o primeiro e o último nome.",
        "Quando a compra é paga, o primeiro nome com a inicial e a cidade/UF do cadastro podem aparecer em \"jogando agora\" na vitrine; o ganhador (do sorteio ou de cota premiada) aparece da mesma forma, no comentário fixo da rifa e, se a promotora publicar, na foto do resultado. Quem tem o código do pedido vê o nome de quem comprou ao consultá-lo — guarde o código com você.",
        "Só se você ligar o perfil público: aparecer em \"Quem também joga\" e em \"Seguido por\". Nasce desligado. Telefone, CPF e e-mail nunca são públicos.",
      ],
    },
    {
      titulo: "5. Por quanto tempo",
      itens: [
        `Compras, bilhetes, recibos e o registro do sorteio: pelo prazo que a lei de rifas, a lei fiscal e o Código de Defesa do Consumidor exigem, mesmo depois de excluída a conta. Avisos da central: 90 dias. Contagem de tentativas para os limites de antifraude: 2 horas; o registro das recusas (com o telefone mascarado e o aparelho em hash): ${GUARDA_DAS_RECUSAS_DIAS} dias; o bloqueio com prazo sai ${GUARDA_DO_BLOQUEIO_VENCIDO_DIAS} dias depois de vencer, e o bloqueio sem prazo fica até a plataforma retirá-lo.`,
        "Ao excluir a conta, nome, telefone, CPF, e-mail, senha, apelido, foto e verificação saem; o que precisa ficar por lei fica sem identificar você.",
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
        "Você pode confirmar se tratamos seus dados, acessá-los, corrigi-los (Minha conta), excluir a conta, revogar consentimentos (cookies e perfil público no seu perfil, avisos no celular, comparação de foto na verificação), pedir informação sobre compartilhamento e a portabilidade (LGPD, art. 18).",
        `Peça pelo encarregado (item 1) ou fale com a plataforma ${canal(d.empresa)}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      titulo: "8. Cookies",
      itens: [
        "Os essenciais (sessão, carrinho, tema, região) fazem o site funcionar e não dependem de aceite. Os de anúncio e medição só depois do \"Aceitar\"; recusar é tão fácil quanto aceitar, e você muda de ideia em Perfil → Preferência de cookies.",
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
