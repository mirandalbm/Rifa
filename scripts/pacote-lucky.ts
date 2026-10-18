/**
 * O pacote do Lucky para colar no Chatbase (`docs/PACOTE-LUCKY.md`), gerado do
 * código — as instruções do agente e a tabela das ações saem de
 * `shared/iaAcoes.ts` e `shared/ia.ts`, nunca digitadas à mão.
 *
 *   npm run pacote-lucky                 reescreve docs/PACOTE-LUCKY.md
 *   npm run pacote-lucky -- --stdout     imprime o documento inteiro
 *   npm run pacote-lucky -- --instrucoes imprime só as instruções do agente
 *   npm run pacote-lucky -- --acoes      imprime só o JSON Schema de cada ação
 *
 * Não toca o banco, não lê segredo e não faz chamada de rede.
 * `tests/pacoteLucky.test.ts` falha se o arquivo em docs/ ficar velho.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACOES_DA_IA } from "../shared/iaAcoes";
import { esquemaDaAcao, instrucoesDoAgente, montarPacote } from "../shared/pacoteLucky";

const ARQUIVO_DO_PACOTE = path.join(fileURLToPath(new URL("..", import.meta.url)), "docs/PACOTE-LUCKY.md");

const args = process.argv.slice(2);

if (args.includes("--instrucoes")) {
  console.log(instrucoesDoAgente());
} else if (args.includes("--acoes")) {
  for (const a of ACOES_DA_IA) console.log(`# ${a.nome}\n${esquemaDaAcao(a)}\n`);
} else if (args.includes("--stdout")) {
  process.stdout.write(montarPacote());
} else {
  fs.writeFileSync(ARQUIVO_DO_PACOTE, montarPacote());
  console.log(`docs/PACOTE-LUCKY.md atualizado (${ACOES_DA_IA.length} ações, ${instrucoesDoAgente().length.toLocaleString("pt-BR")} caracteres de instruções).`);
}
