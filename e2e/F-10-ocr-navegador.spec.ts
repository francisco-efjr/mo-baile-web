import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { ORIGEM } from "./apoio";

// F-10: o OCR dos prints roda no navegador (worker + PaddleOCR + ajustes) sob a
// mesma CSP do site, baixa os modelos só do próprio endereço e monta a mesma
// spec de uma leitura perfeita dos cards fictícios (e2e/fixtures/prints).
// A página de teste só existe no build dos testes (MOBAILE_E2E=1).

const PASTA = decodeURIComponent(new URL("./fixtures/prints/", import.meta.url).pathname);
const PRINTS = readdirSync(PASTA).filter((f) => f.endsWith(".png")).sort().map((f) => PASTA + f);

interface Rascunho {
  specJson: string;
  review: { print: string; event: string; doubts: string[] }[];
}
interface Resultado {
  ok: boolean;
  erro?: string;
  ms?: number;
  medidas?: { nome: string; ms: number }[];
  progresso: { etapa: string; feito: number; total: number; doCache?: boolean }[];
  ocr?: Rascunho;
  ideal?: Rascunho;
}

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "o OCR é o mesmo no celular; roda uma vez, no desktop");
test.setTimeout(180_000);

function vigiar(page: Page) {
  const pedidos: string[] = [];
  page.context().on("request", (r) => pedidos.push(r.url()));
  return pedidos;
}

async function abrirComPrints(page: Page, arquivos = PRINTS) {
  await page.goto("e2e/paginas/ocr.html");
  await expect(page.locator("#estado")).toHaveText("pronto");
  await page.locator("#arquivos").setInputFiles(arquivos);
}

const rodar = (page: Page, opcoes = {}) =>
  page.evaluate((o) => (window as unknown as { rodarOcr: (o: unknown) => Promise<Resultado> }).rodarOcr(o), opcoes) as Promise<Resultado>;

test("lê os prints no navegador e chega à mesma spec da leitura perfeita", async ({ page }) => {
  const pedidos = vigiar(page);
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await abrirComPrints(page);
  const r = await rodar(page);
  expect(r.erro).toBeUndefined();
  expect(r.ok).toBe(true);

  const ocr = JSON.parse(r.ocr!.specJson) as { cards: { evento: string; params: unknown; variacoes?: unknown }[] };
  const ideal = JSON.parse(r.ideal!.specJson) as typeof ocr;
  expect(ocr.cards.map((c) => c.evento)).toEqual([
    "screen_view", "screen_view", "interaction_demo_simulacao", "purchase", "error_view", "form_input",
  ]);
  expect(r.ocr!.specJson).toBe(r.ideal!.specJson);

  // Baixou os três modelos e o runtime do próprio site, e nada de fora.
  expect(pedidos.filter((u) => !u.startsWith(`${ORIGEM}/`) && !u.startsWith("blob:") && !u.startsWith("data:"))).toEqual([]);
  for (const nome of ["PP-OCRv6_small_det.ort", "PP-OCRv6_small_rec.ort", "ppocrv6_dict.txt"]) {
    expect(pedidos.some((u) => u.startsWith(`${ORIGEM}/ocr/${nome}?v=`))).toBe(true);
  }
  expect(pedidos.some((u) => /\/assets\/ort-wasm-simd-threaded-[^/]+\.wasm$/.test(u))).toBe(true);
  expect(r.progresso.some((p) => p.etapa === "baixando" && p.feito === p.total)).toBe(true);
  expect(r.progresso.at(-1)).toMatchObject({ etapa: "lendo", feito: PRINTS.length, total: PRINTS.length });
  expect(erros).toEqual([]);
  console.log(`OCR de ${PRINTS.length} prints: ${Math.round(r.ms!)} ms no total; por print: ${r.medidas!.map((m) => Math.round(m.ms)).join(", ")} ms`);
});

test("na segunda vez usa os modelos guardados no navegador", async ({ page }) => {
  await abrirComPrints(page, PRINTS.slice(0, 1));
  expect((await rodar(page)).ok).toBe(true);
  const pedidos = vigiar(page);
  await abrirComPrints(page, PRINTS.slice(0, 1));
  const r = await rodar(page);
  expect(r.ok).toBe(true);
  expect(pedidos.filter((u) => /\.ort\?v=|ppocrv6_dict|\.wasm$/.test(u))).toEqual([]);
  expect(r.progresso.filter((p) => p.etapa === "baixando").every((p) => p.doCache)).toBe(true);
});

test("cancelar no meio para a leitura", async ({ page }) => {
  await abrirComPrints(page);
  const r = await rodar(page, { cancelarDepoisDe: 2 });
  expect(r.ok).toBe(false);
  expect(r.erro).toMatch(/^AbortError/);
  expect(r.progresso.filter((p) => p.etapa === "lendo").length).toBeLessThan(PRINTS.length);
});

test("recusa arquivo que diz ser PNG e não é", async ({ page }) => {
  await page.goto("e2e/paginas/ocr.html");
  await page.locator("#arquivos").setInputFiles([{ name: "falso.png", mimeType: "image/png", buffer: Buffer.from("não sou imagem") }]);
  const r = await rodar(page);
  expect(r.ok).toBe(false);
  expect(r.erro).toBe("EngineError: Não foi possível ler falso.png: o arquivo não é PNG nem JPG.");
});
