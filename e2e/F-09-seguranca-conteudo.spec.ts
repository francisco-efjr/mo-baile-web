import { expect, test } from "@playwright/test";
import { abrir, auditar, carregarCaso, gabarito, vigiarDialogos, vigiarRede } from "./apoio";

const CASO = "17-html-hostil";

test("F-09 segurança do conteúdo: nada vindo dos dados executa nem vira elemento", async ({ page }) => {
  const dialogos = vigiarDialogos(page);
  const fora = vigiarRede(page);
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));

  const g = gabarito(CASO);
  await abrir(page);
  await carregarCaso(page, CASO);
  await auditar(page);

  // O texto hostil aparece como texto literal, nunca como marcação.
  const projeto = g.spec!.projeto;
  expect(projeto).toContain("<script>");
  await expect(page.getByText(projeto, { exact: true }).first()).toBeVisible();
  await expect(page.locator("#app script")).toHaveCount(0);
  await expect(page.locator("#app img[src='x']")).toHaveCount(0);
  await expect(page.locator("#app svg[onload]")).toHaveCount(0);
  await expect(page.locator("#app [onerror], #app [onload]")).toHaveCount(0);
  await expect(page.locator("#app b", { hasText: "negrito" })).toHaveCount(0);

  // Detalhe, quadro fora da spec e pré-visualização do HTML exportado.
  await page.getByRole("table", { name: "Validações da auditoria" }).locator("tbody tr").first().getByRole("button").click();
  await expect(page.locator("#app script")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Detalhe da validação" }).locator("img[src='x'], b")).toHaveCount(0);

  await page.getByRole("button", { name: "Ver HTML" }).click();
  const quadro = page.frameLocator("iframe[title='Relatório HTML exportado']");
  await expect(quadro.getByText(projeto).first()).toBeAttached();
  await expect(quadro.locator("img[src='x']")).toHaveCount(0);
  await expect(quadro.locator("svg[onload]")).toHaveCount(0);
  await expect(quadro.locator("[onerror]")).toHaveCount(0);
  // Os scripts do relatório são os do próprio produto; nenhum carrega o texto hostil.
  const scripts = await quadro.locator("script").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  for (const s of scripts) expect(s).not.toContain("alert(");
  await page.getByRole("dialog", { name: "Relatório HTML" }).getByRole("button", { name: "Fechar", exact: true }).click();

  // Analytics com o mesmo log.
  await page.getByRole("tab", { name: "Analytics" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Escolher Logcat…" }).click()]);
  await chooser.setFiles(decodeURIComponent(new URL(`../test/corpus/${CASO}/log.txt`, import.meta.url).pathname));
  await expect(page.getByRole("heading", { name: /eventos do Firebase/ })).toBeVisible();
  await expect(page.locator("#app script")).toHaveCount(0);
  await expect(page.locator("#app img[src='x'], #app svg[onload]")).toHaveCount(0);

  // Dá tempo ao navegador de disparar handlers se existissem, sem espera fixa.
  await page.evaluate(() => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
  expect(dialogos, `diálogos disparados: ${dialogos.join(" | ")}`).toEqual([]);
  expect(fora).toEqual([]);
  expect(erros).toEqual([]);
});
