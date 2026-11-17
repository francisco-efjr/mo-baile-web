// O relatório HTML só tem <style> e <script> executável de conteúdo fixo, e a
// lista de hashes que o motor exporta cobre todos eles, em qualquer relatório:
// é o que deixa o site mostrar o relatório com CSP por hash, sem 'unsafe-inline'.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { audit, decodeText, exportHtml, loadSpec, readLog, reportInlineHashes } from "../src/engine/index";

vi.mock("../src/engine/assets/design_system.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("design_system.css") }));
vi.mock("../src/engine/assets/report.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("report.css") }));

const corpus = new URL("./corpus/", import.meta.url);
const hash = (texto: string) => `'sha256-${createHash("sha256").update(texto).digest("base64")}'`;

function relatorios(): [string, string][] {
  const out: [string, string][] = [];
  for (const caso of readdirSync(corpus).sort()) {
    const pasta = new URL(`${caso}/`, corpus);
    const logNome = ["log.txt", "log.json"].find((n) => existsSync(new URL(n, pasta)))!;
    try {
      const spec = loadSpec(decodeText(readFileSync(new URL("spec.json", pasta)), { label: "spec", strict: true }));
      const log = readLog(decodeText(readFileSync(new URL(logNome, pasta))), logNome);
      out.push([caso, exportHtml(audit(spec, log), { versao: "<script>x</script>" })]);
    } catch {
      // casos de erro não geram relatório
    }
  }
  return out;
}

/** Blocos inline do HTML: conteúdo de <style>, de <script> executável e de atributos style. */
function blocos(html: string) {
  const styles = [...html.matchAll(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/g)].map((m) => m[2]!);
  const scripts: string[] = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const tipo = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1] ?? "")?.[1]?.toLowerCase();
    if (!tipo || tipo === "module" || tipo.includes("javascript")) scripts.push(m[2]!);
  }
  const atributos = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)].map((m) => m[1]!);
  return { styles, scripts, atributos };
}

describe("reportInlineHashes", () => {
  const lista = reportInlineHashes();
  const gerados = relatorios();

  it("há relatórios do corpus para conferir", () => {
    expect(gerados.length).toBeGreaterThanOrEqual(15);
  });

  it.each(gerados)("%s: todo <style> e <script> executável está na lista", (_, html) => {
    const { styles, scripts, atributos } = blocos(html);
    expect(styles.length).toBe(2);
    expect(scripts.length).toBe(3);
    for (const s of styles) expect(lista.styles).toContain(hash(s));
    for (const s of scripts) expect(lista.scripts).toContain(hash(s));
    for (const a of atributos) expect(lista.styleAttributes).toContain(hash(a));
  });

  it("a CSP dentro do arquivo libera exatamente os scripts da lista", () => {
    const html = gerados[0]![1];
    const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)![1]!;
    expect(csp).toContain(`script-src ${lista.scripts.join(" ")};`);
  });

  it("formato da CSP: 'sha256-<base64>' com as aspas simples", () => {
    for (const h of [...lista.styles, ...lista.scripts, ...lista.styleAttributes]) expect(h).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
  });
});
