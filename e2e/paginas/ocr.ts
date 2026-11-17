// Página de teste do OCR: lê os prints escolhidos no <input> com o leitor do
// site (worker + PaddleOCR + ajustes) e monta dois rascunhos, um do OCR e um
// da leitura perfeita (linhas-ideais.json). O teste F-10 compara os dois.
import { rascunhoDosPrints, type PrintLido } from "../../src/engine/index";
import { LeitorDePrints, type ProgressoOcr } from "../../src/ocr";
import ideais from "../fixtures/prints/linhas-ideais.json";

const leitor = new LeitorDePrints();
const estado = document.getElementById("estado")!;

async function rodar(opcoes: { cancelarDepoisDe?: number } = {}) {
  const arquivos = [...(document.getElementById("arquivos") as HTMLInputElement).files!];
  const progresso: ProgressoOcr[] = [];
  const controle = new AbortController();
  const t0 = performance.now();
  try {
    const lidos: PrintLido[] = await leitor.lerPrints(
      arquivos.map((f) => ({ nome: f.name, arquivo: f })),
      {
        sinal: controle.signal,
        aoProgredir: (p) => {
          progresso.push(p);
          estado.textContent = `${p.etapa} ${p.feito}/${p.total}`;
          if (opcoes.cancelarDepoisDe !== undefined && p.etapa === "lendo" && p.feito >= opcoes.cancelarDepoisDe) controle.abort();
        },
      },
    );
    const agora = new Date(2026, 10, 16, 9, 30);
    const ocr = rascunhoDosPrints(lidos, { pasta: "prints-demo", projeto: "DemoApp", agora });
    const ideal = rascunhoDosPrints(ideais as PrintLido[], { pasta: "prints-demo", projeto: "DemoApp", agora });
    return { ok: true, ms: performance.now() - t0, medidas: leitor.medidas, progresso, ocr, ideal, linhas: lidos };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? `${err.name}: ${err.message}` : String(err), progresso };
  }
}

Object.assign(window, { rodarOcr: rodar });
estado.textContent = "pronto";
