import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "@/app/App";
import "@/styles/index.css";

if ("serviceWorker" in navigator) {
  registerSW({
    onRegisterError(error) {
      // The editor must remain usable even if offline caching cannot be registered.
      console.warn("No se pudo registrar el modo sin conexión.", error);
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
