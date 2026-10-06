/**
 * O saque só sai para MEI ou empresa (resposta 6.4 do advogado): as provas
 * que pedem saque aprovam antes um cadastro fiscal com CNPJ e mandam a nota
 * fiscal. Direto no banco, cifrado como o servidor grava — a prova da regra
 * em si é a `npm run fiscal`.
 */
import { afiliadoFiscal } from "../shared/schema";
import { db } from "../server/db";
import { cifrarJson } from "../server/services/cofre";

export async function aprovarCadastroComCnpj(affiliateId: string) {
  const c = cifrarJson({
    nomeCompleto: "Titular De Teste",
    cpf: "52998224725",
    rg: "12.345.678-9",
    nascimento: "1990-05-10",
    endereco: { cep: "01310100", logradouro: "Avenida Teste", numero: "1", complemento: "", bairro: "Centro", cidade: "São Paulo", uf: "SP" },
    conta: { banco: "260", agencia: "0001", conta: "12345678", tipo: "corrente" },
    empresa: { tipo: "mei", cnpj: "11222333000181", razaoSocial: "Titular De Teste MEI" },
  });
  const valores = { status: "aprovado", dados: c.dados, iv: c.iv, tag: c.tag, chaveVersao: c.versao, decididoEm: new Date(), updatedAt: new Date() };
  await db.insert(afiliadoFiscal).values({ affiliateId, ...valores }).onConflictDoUpdate({ target: afiliadoFiscal.affiliateId, set: valores });
}

/** Uma nota fiscal em PDF, em base64, como a tela manda. */
export const NOTA_DE_TESTE = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nNota fiscal de teste\n%%EOF\n").toString("base64")}`;
