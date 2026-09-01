import { redirect } from "next/navigation";
import { lerSessaoApostador } from "@/lib/auth";
import AcessoApostador from "@/components/AcessoApostador";

export const dynamic = "force-dynamic";

export default async function PaginaAcessoApostador() {
  // Já logado não precisa ver formulário de login.
  if (await lerSessaoApostador()) redirect("/minha-conta");
  return <AcessoApostador />;
}
