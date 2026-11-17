import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

// Site estático: `base: "./"` funciona em qualquer subcaminho (GitHub Pages em
// /mo-baile-web/). O servidor de desenvolvimento só escuta nesta máquina.
//
// OCR (ADR 0002): `onnxruntime-web` aponta para o build só de WebAssembly
// (sem WebGPU, metade do tamanho), e o worker é módulo ES.
//
// MOBAILE_E2E=1 inclui a página de teste do OCR (e2e/paginas/ocr.html), que
// só existe no build dos testes de ponta a ponta, nunca no site publicado. Ela
// recebe a mesma CSP do index.html.
const e2e = process.env.MOBAILE_E2E === "1";

function cspDoSite(): Plugin {
  return {
    name: "mobaile-csp-do-site",
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.includes("/e2e/")) return html;
      const site = readFileSync(new URL("./index.html", import.meta.url), "utf8");
      const meta = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(site)?.[0];
      if (!meta) throw new Error("index.html sem CSP");
      return html.replace("<!--CSP-->", meta);
    },
  };
}

export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", strictPort: false },
  preview: { host: "127.0.0.1" },
  resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" }] },
  worker: { format: "es" },
  plugins: [cspDoSite()],
  build: {
    outDir: "dist",
    sourcemap: false,
    assetsInlineLimit: 0,
    ...(e2e ? { rollupOptions: { input: { index: "index.html", ocr: "e2e/paginas/ocr.html" } } } : {}),
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
