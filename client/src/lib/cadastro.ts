import { problemaNoCadastro, type CadastroComprador } from "@shared/contaComprador";

/**
 * O erro de cada campo do Criar conta, para a tela mostrar embaixo dele.
 *
 * A regra continua uma só (`problemaNoCadastro()`, que o servidor também
 * aplica): para saber o erro de um campo, ele entra num cadastro de exemplo
 * que passa na régua, e a mensagem que sair é dele. Se um dia a régua mudar e
 * o exemplo deixar de passar, a tela só deixa de mostrar o erro por campo
 * (fica a linha geral ao lado do botão) — nunca põe o erro no campo errado.
 */
export const CADASTRO_DE_EXEMPLO = {
  nome: "Ana Souza",
  apelido: "ana.souza",
  telefone: "11987654321",
  cpf: "529.982.247-25",
  cep: "01001-000",
  email: "",
  senha: "Exemplo-de-senha-boa-2026",
} satisfies CadastroComprador;

export type CampoDoCadastro = keyof typeof CADASTRO_DE_EXEMPLO;

const EXEMPLO_PASSA = problemaNoCadastro(CADASTRO_DE_EXEMPLO) === null;

export function erroDoCampoDoCadastro(campo: CampoDoCadastro, valor: string): string | null {
  if (!EXEMPLO_PASSA) return null;
  return problemaNoCadastro({ ...CADASTRO_DE_EXEMPLO, [campo]: valor });
}
