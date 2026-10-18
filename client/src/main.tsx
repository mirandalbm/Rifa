import { createRoot } from "react-dom/client";
import App from "./App";
import { registrarPwa } from "./lib/pwa";
import { carregarEndereco } from "@/lib/endereco";
import { marcarAnuncioPelaUrl } from "./lib/origem";
import { marcarIndicacaoPelaUrl } from "./lib/indicacao";
import { guardarUtmDaUrl } from "./lib/marketing";
import "./index.css";

// Antes do React: o pedido de instalação chega cedo e só uma vez.
registrarPwa();
// Chegou por anúncio? Fica marcado para o painel de resultados.
marcarAnuncioPelaUrl();
// E de qual campanha paga (UTM, gclid, fbclid, ttclid): vai com o pedido.
guardarUtmDaUrl();
// Chegou pelo link de indicação de alguém? Fica guardado para a compra.
marcarIndicacaoPelaUrl();

// De quem é este endereço? Antes do primeiro desenho: o endereço da organização
// não pode piscar a vitrine da plataforma. Resposta rápida (sem banco) e, se
// falhar, segue como o domínio principal.
carregarEndereco().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
