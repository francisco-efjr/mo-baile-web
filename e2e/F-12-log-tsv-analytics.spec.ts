import { expect, test } from "@playwright/test";
import { abrir, auditar, carregarCaso, conferirResumo, gabarito, vigiarRede } from "./apoio";

// F-12: o log de eventos pode ser o TSV de uma exploração do Google Analytics
// (GA4). Só as dimensões exportadas são conferidas; o resto aparece como "não
// exportado". Fonte do esperado: o gabarito do motor Python do Mo baile
// (test/golden/24-tsv-ga4-pivo.json).
const CASO = "24-tsv-ga4-pivo";

test("F-12 log em TSV do GA4: resumo do gabarito e parâmetros não exportados", async ({ page }) => {
  const fora = vigiarRede(page);
  const g = gabarito(CASO);
  await abrir(page);
  await carregarCaso(page, CASO, "log.tsv");
  await expect(page.getByText(/TSV do Google Analytics · 7 combinações/)).toBeVisible();
  await auditar(page);
  await conferirResumo(page, g.summary!);
  await expect(page.getByText("export do GA4 · confere ga_screen, flow_name, flow_step")).toBeVisible();

  // A interação da sacola: component e detail não vieram no export.
  const linha = page.getByRole("table", { name: "Validações da auditoria" }).locator("tbody tr").filter({ hasText: "click:finalizar" });
  await linha.getByRole("button").first().click();
  const detalhe = page.getByRole("region", { name: "Detalhe da validação" });
  const validacao = detalhe.getByRole("table", { name: "Obtido e esperado de cada parâmetro" });
  for (const campo of ["component", "detail"]) {
    const tr = validacao.getByRole("row").filter({ has: page.getByRole("rowheader", { name: campo, exact: true }) });
    await expect(tr).toContainText("não exportado");
  }
  const tela = validacao.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "screen_name", exact: true }) });
  await expect(tela).toContainText("demoapp:loja:sacola");
  expect(fora).toEqual([]);
});
