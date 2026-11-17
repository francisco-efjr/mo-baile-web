import { expect, test } from "@playwright/test";
import { abrir, auditar, carregarCaso, gabarito, lerDownload } from "./apoio";

// Caso 01 (o do exemplo), por arquivos: 7 validações, 42,9% de conformidade.
const CASO = "01-exemplo-loja";

async function auditado(page: import("@playwright/test").Page) {
  await abrir(page);
  await carregarCaso(page, CASO);
  await auditar(page);
}

test("F-05 exportações: Markdown e TSV baixam com o conteúdo do gabarito", async ({ page }) => {
  const g = gabarito(CASO);
  await auditado(page);

  const [md] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar Markdown" }).click()]);
  expect(md.suggestedFilename()).toMatch(/^relatorio_demoapp_android_\d{2}-\d{2}-\d{4}\.md$/);
  const textoMd = await lerDownload(md);
  expect(textoMd).toBe(g.markdown);
  expect(textoMd).toContain("Conformidade: 42.9%");

  const [tsv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar TSV" }).click()]);
  expect(tsv.suggestedFilename()).toMatch(/^relatorio_demoapp_android_\d{2}-\d{2}-\d{4}\.tsv$/);
  const textoTsv = await lerDownload(tsv);
  expect(textoTsv).toBe(g.tsv);
  expect(textoTsv.split("\n")[0]).toContain("Seção\tCard");
});

test("F-05 exportações: Baixar HTML entrega o relatório completo", async ({ page }) => {
  const g = gabarito(CASO);
  await auditado(page);
  const [html] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar HTML" }).click()]);
  expect(html.suggestedFilename()).toMatch(/^relatorio_[a-z0-9-]+_android_\d{2}-\d{2}-\d{4}\.html$/);
  const texto = await lerDownload(html);
  expect(texto.toLowerCase()).toContain("<!doctype html>");
  expect(texto).toContain(g.spec!.projeto);
  expect(texto).toContain("42,9");
  expect(texto).toContain("<style");
});

test("F-05 exportações: Ver HTML abre a pré-visualização com estilo aplicado (CSP por hash)", async ({ page }) => {
  const g = gabarito(CASO);
  await auditado(page);
  await page.getByRole("button", { name: "Ver HTML" }).click();

  const dialogo = page.getByRole("dialog", { name: "Relatório HTML" });
  await expect(dialogo).toBeVisible();
  const quadro = page.frameLocator("iframe[title='Relatório HTML exportado']");
  // Em tela estreita o subtítulo da marca fica oculto por CSS: basta estar no documento.
  await expect(quadro.getByText(g.spec!.projeto).first()).toBeAttached();

  // Estilo aplicado: o <body> do navegador sem CSS tem margem de 8px e fonte serifada
  // (Times); com o CSS do relatório as duas coisas mudam.
  const estilo = await quadro.locator("body").evaluate((el) => {
    const c = getComputedStyle(el);
    return { margem: c.marginTop, fonte: c.fontFamily, folhas: document.styleSheets.length, cor: c.backgroundColor };
  });
  expect(estilo.folhas).toBeGreaterThan(0);
  expect(estilo.fonte.toLowerCase()).not.toMatch(/^"?times/);
  expect(estilo.margem === "8px" && estilo.cor === "rgba(0, 0, 0, 0)").toBe(false);

  // O botão Baixar HTML do diálogo baixa o mesmo arquivo.
  const [baixado] = await Promise.all([page.waitForEvent("download"), dialogo.getByRole("button", { name: "Baixar HTML" }).click()]);
  expect(baixado.suggestedFilename()).toMatch(/\.html$/);

  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialogo).toBeHidden();
});

test("F-05 exportações: sem auditoria não há botões de exportar", async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole("button", { name: "Baixar HTML" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Baixar Markdown" })).toBeHidden();
});
