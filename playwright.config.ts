import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta no site já construído (vite build + vite preview em 127.0.0.1).
// Local: usa o Chrome instalado (channel "chrome"), sem baixar navegador.
// CI: o Chromium que a workflow instala.
const porta = 4173;
const run = process.env.E2E_RUN;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: run ? `playwright-report/${run}` : "playwright-report", open: "never" }]],
  outputDir: run ? `test-results/${run}` : "test-results",
  use: {
    baseURL: `http://127.0.0.1:${porta}/`,
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) } },
    { name: "celular", use: { ...devices["Pixel 7"], ...(process.env.CI ? {} : { channel: "chrome" }) } },
  ],
  webServer: {
    // MOBAILE_E2E=1 inclui a página de teste do OCR; os modelos vêm de tools/ocr/ativos.mjs.
    command: `node tools/ocr/ativos.mjs && MOBAILE_E2E=1 node_modules/.bin/vite build && node_modules/.bin/vite preview --host 127.0.0.1 --port ${porta} --strictPort`,
    url: `http://127.0.0.1:${porta}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
