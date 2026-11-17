import { expect, test } from "@playwright/test";
import { abrir, auditar, carregarCaso, conferirResumo, gabarito } from "./apoio";

// Caso 11: 10 validações (5 OK, 2 divergentes, 3 não disparadas), logcat do Android.
const CASO = "11-variacoes-e-fluxos";

test("F-03 relatório por arquivos: resumo igual ao gabarito, filtro e detalhe Esperado × Obtido", async ({ page }) => {
  const g = gabarito(CASO);
  const s = g.summary!;
  await abrir(page);
  await carregarCaso(page, CASO);
  await auditar(page);
  await conferirResumo(page, s);

  const linhas = page.getByRole("table", { name: "Validações da auditoria" }).locator("tbody tr");
  await expect(linhas).toHaveCount(s.total);

  const grupo = page.getByRole("group", { name: "Filtrar as validações por status" });
  await grupo.getByRole("button", { name: /Divergentes/ }).click();
  await expect(linhas).toHaveCount(s.divergent);
  await expect(page.getByText(`${s.divergent} de ${s.total} validações`)).toBeVisible();
  for (const l of await linhas.all()) await expect(l).toContainText("Divergente");

  await grupo.getByRole("button", { name: /Não Disparadas/ }).click();
  await expect(linhas).toHaveCount(s.missing);

  await grupo.getByRole("button", { name: /^OK/ }).click();
  await expect(linhas).toHaveCount(s.ok);

  await grupo.getByRole("button", { name: /Todas/ }).click();
  await expect(linhas).toHaveCount(s.total);

  // Detalhe de uma linha divergente: o esperado e o obtido do gabarito.
  const divergente = g.results!.find((r) => r.status === "error")!;
  const falha = divergente.checks.find((c) => !c.ok)!;
  await grupo.getByRole("button", { name: /Divergentes/ }).click();
  await linhas.first().getByRole("button").click();

  const detalhe = page.getByRole("region", { name: "Detalhe da validação" });
  await expect(detalhe.getByRole("heading", { level: 3 })).toHaveText(divergente.event);
  const checks = detalhe.getByRole("table", { name: "Obtido e esperado de cada parâmetro" });
  await expect(checks.getByRole("columnheader", { name: "Obtido" })).toBeVisible();
  await expect(checks.getByRole("columnheader", { name: "Esperado" })).toBeVisible();
  const linhaFalha = checks.getByRole("row").filter({ has: page.getByRole("rowheader", { name: falha.field, exact: true }) }).filter({ hasText: "diverge" });
  await expect(linhaFalha.first()).toBeVisible();
  await expect(linhaFalha.first().locator(".mw-checks__obtido")).toHaveText(falha.obtained);
  await expect(linhaFalha.first().locator(".mw-checks__esperado")).toHaveText(falha.expected);
  expect(falha.obtained).not.toBe(falha.expected);

  await detalhe.getByRole("button", { name: "Fechar Detalhe" }).click();
  // Em tela estreita o quadro vazio fica oculto por CSS: vale que ele voltou ao DOM e a tabela de checks saiu.
  await expect(page.getByText("Escolha uma validação na tabela")).toHaveCount(1);
  await expect(checks).toHaveCount(0);
});

test("F-03 relatório por arquivos: a busca reduz as linhas e Mostrar Todas restaura", async ({ page }) => {
  const g = gabarito(CASO);
  await abrir(page);
  await carregarCaso(page, CASO);
  await auditar(page);
  const linhas = page.getByRole("table", { name: "Validações da auditoria" }).locator("tbody tr");
  await page.getByRole("searchbox", { name: "Buscar nas validações" }).fill("zzz-nao-existe-zzz");
  await expect(linhas).toHaveCount(0);
  await expect(page.getByText("Nenhuma validação com esse filtro")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar Todas" }).click();
  await expect(linhas).toHaveCount(g.summary!.total);
});

test("F-03 relatório por arquivos: plataforma escolhida muda o resultado (caso 20)", async ({ page }) => {
  const g = gabarito("20-plataforma-escolhida");
  await abrir(page);
  await carregarCaso(page, "20-plataforma-escolhida", "log.json");
  await page.getByLabel("Plataforma").selectOption("ios");
  await auditar(page);
  await conferirResumo(page, g.summary!);
});

test("F-03 relatório por arquivos: log JSON do iOS (caso 08)", async ({ page }) => {
  const g = gabarito("08-ios-json-firebase");
  await abrir(page);
  await carregarCaso(page, "08-ios-json-firebase", "log.json");
  await auditar(page);
  await conferirResumo(page, g.summary!);
});
