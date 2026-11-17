import { expect, test } from "@playwright/test";
import { abrir } from "./apoio";

const GUIAS = ["Começando", "Relatório", "Analytics", "Relatar um Problema"];
const SECOES = ["O que é", "Quando usar", "Passo a passo", "Exemplo prático", "Recursos", "Problemas comuns"];

test("F-07 ajuda: lista os guias e abre cada um com as seis seções", async ({ page }) => {
  await abrir(page, "Ajuda");
  const nav = page.getByRole("navigation", { name: "Guias da Ajuda" });
  await expect(nav.getByRole("link")).toHaveCount(4);

  // Guia padrão
  await expect(nav.getByRole("link", { name: "Começando" })).toHaveAttribute("aria-current", "page");
  for (const s of SECOES) await expect(page.getByRole("heading", { level: 3, name: s })).toBeVisible();

  for (const guia of GUIAS) {
    const link = nav.getByRole("link", { name: guia });
    await expect(link).toBeVisible();
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2, name: guia })).toBeVisible();
    for (const s of SECOES) await expect(page.getByRole("heading", { level: 3, name: s })).toBeVisible();
  }
});

test("F-07 ajuda: o endereço do guia abre direto nele", async ({ page }) => {
  await page.goto("/#ajuda/analytics");
  await expect(page.getByRole("tab", { name: "Ajuda" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Analytics" })).toBeVisible();
});
