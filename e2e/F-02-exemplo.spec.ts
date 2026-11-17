import { expect, test } from "@playwright/test";
import { abrir, conferirResumo, gabarito } from "./apoio";

// src/exemplos/index.ts usa o caso 01-exemplo-loja do corpus.
const CASO = "01-exemplo-loja";

test("F-02 exemplo: Experimentar com um Exemplo audita e bate com o gabarito", async ({ page }) => {
  const g = gabarito(CASO);
  await abrir(page);
  await expect(page.getByRole("heading", { name: "Nenhuma auditoria ainda" })).toBeVisible();

  await page.getByRole("button", { name: "Experimentar com um Exemplo" }).click();

  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeVisible();
  await conferirResumo(page, g.summary!);
  await expect(page.getByText("spec-exemplo.json").first()).toBeVisible();
  await expect(page.getByText("log-exemplo.txt").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nenhuma auditoria ainda" })).toBeHidden();
});

test("F-02 exemplo: o botão Auditar refaz o resultado sem mudar números", async ({ page }) => {
  const g = gabarito(CASO);
  await abrir(page);
  await page.getByRole("button", { name: "Experimentar com um Exemplo" }).click();
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeVisible();
  await page.getByRole("button", { name: "Auditar", exact: true }).click();
  await expect(page.getByText(/Auditoria concluída/)).toBeVisible();
  await conferirResumo(page, g.summary!);
});
