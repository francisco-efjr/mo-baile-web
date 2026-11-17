import { expect, test } from "@playwright/test";
import { ORIGEM, vigiarRede, versaoDoProjeto } from "./apoio";

test("F-01 página: identidade, aviso de privacidade, relato de bug e rodapé", async ({ page }) => {
  const fora = vigiarRede(page);
  const requisicoes: string[] = [];
  page.on("request", (r) => requisicoes.push(r.url()));

  await page.goto("/");
  await expect(page).toHaveTitle(/Mo baile Web/);
  await expect(page.getByRole("button", { name: "Beta" })).toBeVisible();
  await expect(page.getByText("Seus arquivos não saem deste navegador.")).toBeVisible();

  const relatar = page.getByRole("banner").getByRole("link", { name: /Relatar um Problema/ });
  await expect(relatar).toBeVisible();
  const href = (await relatar.getAttribute("href")) ?? "";
  expect(href).toContain("template=bug.yml");
  expect(href).toContain("/issues/new");

  await expect(page.getByRole("contentinfo")).toContainText(`versão ${versaoDoProjeto()} (beta)`);

  // Percorre as três áreas e usa o motor, para valer a regra durante o uso, não só na carga.
  await page.getByRole("tab", { name: "Analytics" }).click();
  await page.getByRole("tab", { name: "Ajuda" }).click();
  await page.getByRole("tab", { name: "Relatório" }).click();
  await page.getByRole("button", { name: "Experimentar com um Exemplo" }).click();
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeVisible();
  await page.getByRole("button", { name: "Baixar Markdown" }).click();

  expect(requisicoes.length).toBeGreaterThan(0);
  expect(requisicoes.filter((u) => u.startsWith(`${ORIGEM}/`)).length).toBeGreaterThan(0);
  expect(fora, `requisições para fora da origem: ${fora.join(", ")}`).toEqual([]);
});

test("F-01 página: o aviso e o link de relato seguem visíveis em todas as áreas", async ({ page }) => {
  await page.goto("/");
  for (const area of ["Relatório", "Analytics", "Ajuda"]) {
    await page.getByRole("tab", { name: area }).click();
    await expect(page.getByText("Seus arquivos não saem deste navegador.")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: /Relatar um Problema/ })).toHaveAttribute("href", new RegExp(`template=bug\\.yml&area=${encodeURIComponent(area)}`));
  }
});
