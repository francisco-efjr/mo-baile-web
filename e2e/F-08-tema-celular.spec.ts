import { expect, test } from "@playwright/test";
import { abrir, auditar, carregarCaso } from "./apoio";

test("F-08 tema: alternar claro e escuro troca o esquema e é lembrado", async ({ page }) => {
  await abrir(page);
  const html = page.locator("html");
  const fundo = () => page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.getByRole("button", { name: "Tema claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Tema claro" })).toHaveAttribute("aria-pressed", "true");
  const claro = await fundo();

  await page.getByRole("button", { name: "Tema escuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Tema escuro" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Tema claro" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(fundo).not.toBe(claro);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Tema escuro" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Tema do sistema" }).click();
  await expect(html).toHaveAttribute("data-theme-pref", "auto");
});

test("F-08 tema: Tema do sistema segue o esquema do navegador", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("F-08 celular: nenhuma aba tem rolagem horizontal", async ({ page }) => {
  const semRolagem = async (onde: string) => {
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw, `${onde}: scrollWidth ${m.sw} > clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw);
  };
  await abrir(page);
  await semRolagem("Relatório vazio");

  await carregarCaso(page, "11-variacoes-e-fluxos");
  await auditar(page);
  await semRolagem("Relatório com resultado");
  await page.getByRole("table", { name: "Validações da auditoria" }).locator("tbody tr").first().getByRole("button").click();
  await semRolagem("Relatório com detalhe");

  await page.getByRole("tab", { name: "Analytics" }).click();
  await semRolagem("Analytics vazio");
  await page.getByRole("button", { name: "Experimentar com um Exemplo" }).click();
  await expect(page.getByRole("heading", { name: /eventos do Firebase/ })).toBeVisible();
  await semRolagem("Analytics com eventos");

  await page.getByRole("tab", { name: "Ajuda" }).click();
  await semRolagem("Ajuda");
  for (const guia of ["Relatório", "Analytics", "Relatar um Problema"]) {
    await page.getByRole("navigation", { name: "Guias da Ajuda" }).getByRole("link", { name: guia }).click();
    await semRolagem(`Ajuda: ${guia}`);
  }
});
