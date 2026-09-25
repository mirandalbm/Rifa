import { createRoot } from "react-dom/client";
import App from "./App";
import { registrarPwa } from "./lib/pwa";
import "./index.css";

// Antes do React: o pedido de instalação chega cedo e só uma vez.
registrarPwa();

createRoot(document.getElementById("root")!).render(<App />);
