// OCR dos prints (ADR 0002): os ajustes do PaddleOCR, a escolha dos arquivos
// da pasta e o manifesto dos modelos. O OCR em si roda no navegador
// (e2e/F-10-ocr-navegador.spec.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ajustarLinhas, linhasDoPaddle, linhasDoPrint } from "../src/engine/prints/adaptador";
import type { OcrLine } from "../src/engine/prints/cardReader";
import { formatoDaImagem, MAX_BYTES_PRINT, selecionarPrints } from "../src/ocr/arquivos";
import manifesto from "../src/ocr/manifesto.json";

const L = (t: string, x: number, y: number, w = 0.3, h = 0.03): OcrLine => ({ t, x, y, w, h, c: 1 });
const textos = (ls: OcrLine[]) => ls.map((l) => l.t);

describe("ajustes do PaddleOCR", () => {
  it("tira a margem da detecção (0,4 da altura em cima e embaixo, 0,6 dos lados)", () => {
    const [l] = linhasDoPaddle([{ text: "screen_name", box: { x: 30, y: 50, width: 236, height: 36 }, confidence: 0.98 }], 1000, 500);
    // altura justa = 36 / 1,8 = 20; sobe 8 (0,4 x 20); entra 12 (0,6 x 20) de cada lado
    expect(l).toEqual({ t: "screen_name", x: 42 / 1000, y: 58 / 500, w: 212 / 1000, h: 20 / 500, c: 0.98 });
  });

  it("na borda da imagem não desconta a margem que foi cortada", () => {
    const [l] = linhasDoPaddle([{ text: "x", box: { x: 0, y: 0, width: 50, height: 18 }, confidence: 1 }], 100, 100);
    expect(l!.x).toBe(0);
    expect(l!.y).toBe(0);
  });

  it("descarta caixa só com espaço", () => {
    expect(linhasDoPaddle([{ text: "  ", box: { x: 1, y: 1, width: 9, height: 9 }, confidence: 1 }], 10, 10)).toEqual([]);
  });

  it("devolve o marcador lido como espaço e junta espaços que sobram", () => {
    const out = ajustarLinhas([
      L(" click:voltar", 0.06, 0.9),
      L('" item _name": "demo",', 0.45, 0.3),
      L("Preenchimento de [x] no parâm etro detail:", 0.04, 0.8),
    ], 500, 800);
    expect(textos(out)).toEqual(["• click:voltar", '"item_name": "demo",', "Preenchimento de [x] no parâmetro detail:"]);
  });

  it("repõe o | perdido usando a alternância escrita em outra linha do print", () => {
    const out = ajustarLinhas([
      L("interaction_demo_[pfpj]", 0.04, 0.02),
      L("demo-[pf| pj]", 0.42, 0.2),
      L("app:demo:[pf_pj]:sucesso", 0.42, 0.3),
      L("[outra coisa]", 0.42, 0.4),
    ], 500, 800);
    expect(textos(out)).toEqual(["interaction_demo_[pf|pj]", "demo-[pf| pj]", "app:demo:[pf|pj]:sucesso", "[outra coisa]"]);
  });

  it("descarta caixinha de ruído e caixa repetida dentro de outra", () => {
    const out = ajustarLinhas([
      L("currency", 0.04, 0.4, 0.2, 0.03),
      L("BRL", 0.42, 0.4, 0.08, 0.03),
      L("transaction_id", 0.04, 0.5, 0.25, 0.03),
      L("[id da transacao]", 0.42, 0.5, 0.25, 0.03),
      L("]", 0.66, 0.505, 0.006, 0.01), // dentro da caixa anterior
      L("1", 0.58, 0.3, 0.004, 0.01), // minúscula e sozinha (altura < metade da mediana)
    ], 500, 800);
    expect(textos(out)).toEqual(["currency", "BRL", "transaction_id", "[id da transacao]"]);
  });

  it("linhasDoPrint = caixa justa + ajustes", () => {
    const caixas = [{ text: " button", box: { x: 40, y: 400, width: 120, height: 36 }, confidence: 0.9 }];
    expect(linhasDoPrint(caixas, 500, 800)).toEqual(ajustarLinhas(linhasDoPaddle(caixas, 500, 800), 500, 800));
    expect(linhasDoPrint(caixas, 500, 800)[0]!.t).toBe("• button");
  });
});

describe("arquivos da pasta", () => {
  const e = (caminho: string, tamanho = 1000) => ({ nome: caminho.split("/").pop()!, caminho, tamanho });

  it("pega só as imagens da própria pasta, com o nome dela", () => {
    const s = selecionarPrints([
      e("DemoApp/01.png"), e("DemoApp/02.JPG"), e("DemoApp/03.jpeg"), e("DemoApp/.DS_Store"), e("DemoApp/notas.txt"),
      e("DemoApp/antigos/04.png"), e("DemoApp/05.heic"), e("DemoApp/06.png", MAX_BYTES_PRINT + 1),
    ]);
    expect(s.pasta).toBe("DemoApp");
    expect(s.prints.map((p) => p.nome)).toEqual(["01.png", "02.JPG", "03.jpeg"]);
    // Em ordem de nome (ponto de código), qualquer que seja a ordem do navegador.
    expect(selecionarPrints([e("p/b.png"), e("p/B.png"), e("p/a10.png"), e("p/a2.png")]).prints.map((p) => p.nome)).toEqual([
      "B.png", "a10.png", "a2.png", "b.png",
    ]);
    expect(s.ignorados.map((i) => i.nome)).toEqual(["antigos/04.png", "05.heic", "06.png"]);
    expect(s.ignorados[1]!.motivo).toContain("exporte o print em PNG");
  });

  it("arquivos soltos (sem pasta) vão para a pasta 'prints'", () => {
    const s = selecionarPrints([e("a.png"), e("b.png")]);
    expect(s.pasta).toBe("prints");
    expect(s.prints).toHaveLength(2);
  });

  it("reconhece PNG e JPG pelos primeiros bytes", () => {
    expect(formatoDaImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(formatoDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(formatoDaImagem(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
    expect(formatoDaImagem(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("manifesto dos modelos", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
    overrides: Record<string, string>;
  };

  it("fixa a fonte num commit e cada arquivo pelo sha256", () => {
    expect(manifesto.fonte).toMatch(/^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\/$/);
    for (const m of [...manifesto.modelos, manifesto.runtime]) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes).toBeGreaterThan(1000);
    }
    expect(manifesto.modelos.map((m) => m.papel)).toEqual(["deteccao", "reconhecimento", "dicionario"]);
    for (const m of manifesto.modelos) expect(m.nome).toMatch(/^[\w.-]+$/);
  });

  it("o runtime do manifesto é o onnxruntime-web instalado, com versões exatas", () => {
    expect(pkg.dependencies["onnxruntime-web"]).toBe(manifesto.runtime.versao);
    expect(pkg.dependencies["ppu-paddle-ocr"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.overrides["ppu-ocv"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("o worker nunca aponta o runtime para uma CDN", () => {
    const ambiente = readFileSync(new URL("../src/ocr/ambienteOrt.ts", import.meta.url), "utf8");
    expect(ambiente).toMatch(/wasmPaths = \{ wasm: /);
    expect(ambiente).not.toMatch(/https?:\/\//);
    const worker = readFileSync(new URL("../src/ocr/worker.ts", import.meta.url), "utf8");
    expect(worker.indexOf('from "./ambienteOrt"')).toBeLessThan(worker.indexOf('from "ppu-paddle-ocr/web"'));
    expect(worker).toContain("O OCR só baixa arquivos do próprio site.");
  });
});
