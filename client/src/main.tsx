import { createRoot } from "react-dom/client";
import App from "./App";
import { registrarPwa } from "./lib/pwa";
import { marcarAnuncioPelaUrl } from "./lib/origem";
import { marcarIndicacaoPelaUrl } from "./lib/indicacao";
import "./index.css";

// Antes do React: o pedido de instalação chega cedo e só uma vez.
registrarPwa();
// Chegou por anúncio? Fica marcado para o painel de resultados.
marcarAnuncioPelaUrl();
// Chegou pelo link de indicação de alguém? Fica guardado para a compra.
marcarIndicacaoPelaUrl();

createRoot(document.getElementById("root")!).render(<App />);
