// A CSP do site (index.html) libera, por hash, exatamente os blocos fixos do
// relatório HTML. A pré-visualização do relatório roda num iframe `blob:` que
// herda esta CSP: sem os hashes, o relatório aparece sem estilo e sem filtros.
// Se os ativos do relatório mudarem, este teste falha e mostra a linha nova.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { reportInlineHashes } from "../src/engine/index";

vi.mock("../src/engine/assets/design_system.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("design_system.css") }));
vi.mock("../src/engine/assets/report.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("report.css") }));

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
const diretivas = new Map(
  csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [nome, ...valores] = d.split(/\s+/);
    return [nome!, valores] as const;
  }),
);

function esperado() {
  const h = reportInlineHashes();
  return {
    script: ["'self'", ...h.scripts],
    style: ["'self'", ...h.styles, ...(h.styleAttributes.length ? ["'unsafe-hashes'", ...h.styleAttributes] : [])],
  };
}

describe("CSP do site", () => {
  it("libera por hash os scripts e estilos fixos do relatório", () => {
    const e = esperado();
    const linha = `script-src ${e.script.join(" ")}; style-src ${e.style.join(" ")}`;
    expect(new Set(diretivas.get("script-src")), `Atualize o index.html com: ${linha}`).toEqual(new Set(e.script));
    expect(new Set(diretivas.get("style-src")), `Atualize o index.html com: ${linha}`).toEqual(new Set(e.style));
  });

  it("continua sem rede, sem 'unsafe-inline' e sem 'unsafe-eval'", () => {
    expect(diretivas.get("connect-src")).toEqual(["'none'"]);
    expect(diretivas.get("default-src")).toEqual(["'none'"]);
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(diretivas.get("frame-src")).toEqual(["blob:"]);
  });
});
