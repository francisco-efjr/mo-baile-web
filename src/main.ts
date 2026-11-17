// Ponto de entrada do site. A interface mora em src/ui/ e só fala com o motor
// pelo contrato de src/engine/index.ts.
import * as engine from "./engine/index";
import { exemplo } from "./exemplos/index";
import type { Dependencias } from "./ui/motor";
import { montarSite } from "./ui/site";
import { iniciarTema } from "./ui/tema";

async function iniciar(): Promise<void> {
  iniciarTema();
  let deps: Dependencias = { motor: engine, exemplo, amostra: false };
  // Amostra só de desenvolvimento (npm run dev + ?amostra). No build de
  // produção `import.meta.env.DEV` é false e o import some do pacote.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("amostra")) {
    const { criarAmostra } = await import("./ui/dev/amostra");
    deps = criarAmostra(engine);
  }
  const raiz = document.querySelector<HTMLDivElement>("#app");
  if (raiz) montarSite(raiz, deps);
}

void iniciar();
