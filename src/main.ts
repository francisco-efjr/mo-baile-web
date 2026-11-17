// Ponto de entrada do site. A interface mora em src/ui/ e só fala com o motor
// pelo contrato de src/engine/index.ts.
import * as engine from "./engine/index";
import { exemplo } from "./exemplos/index";
import { LeitorDePrints } from "./ocr/index";
import type { Dependencias } from "./ui/motor";
import { montarSite } from "./ui/site";
import { iniciarTema } from "./ui/tema";

async function iniciar(): Promise<void> {
  iniciarTema();
  const deps: Dependencias = { motor: engine, exemplo, criarLeitorOcr: () => new LeitorDePrints() };
  const raiz = document.querySelector<HTMLDivElement>("#app");
  if (raiz) montarSite(raiz, deps);
}

void iniciar();
