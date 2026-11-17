import { expect, test } from "@playwright/test";
import { abrir, arquivoCorpus, auditar, carregarCaso, escolherArquivo, gabarito } from "./apoio";

const CASOS_SPEC = ["13-spec-json-quebrado", "14-spec-campos-invalidos", "22-spec-nao-e-objeto", "19-regex-invalida"];

for (const caso of CASOS_SPEC) {
  test(`F-04 erros: spec recusada mostra a mensagem do motor perto do campo (${caso})`, async ({ page }) => {
    const esperado = gabarito(caso).error!;
    expect(esperado.stage).toBe("spec");
    await abrir(page);
    await escolherArquivo(page, "Escolher Spec…", arquivoCorpus(caso, "spec.json"));

    const campo = page.locator(".mw-campo").filter({ has: page.getByRole("heading", { name: "Spec da demanda" }) });
    await expect(campo.getByRole("alert")).toHaveText(esperado.message);
    // A spec recusada não fica "escolhida": o botão volta ao rótulo inicial.
    await expect(page.getByRole("button", { name: "Escolher Spec…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeHidden();
  });
}

test("F-04 erros: log sem eventos mostra a mensagem do motor no campo do log", async ({ page }) => {
  const esperado = gabarito("15-log-sem-eventos").error!;
  await abrir(page);
  await escolherArquivo(page, "Escolher Spec…", arquivoCorpus("15-log-sem-eventos", "spec.json"));
  await escolherArquivo(page, "Escolher Log…", arquivoCorpus("15-log-sem-eventos", "log.txt"));
  const campo = page.locator(".mw-campo").filter({ has: page.getByRole("heading", { name: "Log de eventos" }) });
  await expect(campo.getByRole("alert")).toHaveText(esperado.message);
});

test("F-04 erros: falha interna do motor aparece perto do botão Auditar, sem travar a tela", async ({ page }) => {
  const esperado = gabarito("23-erro-interno").error!;
  await abrir(page);
  await carregarCaso(page, "23-erro-interno", "log.json");
  await page.getByRole("button", { name: "Auditar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: esperado.message })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "Auditar", exact: true })).toBeEnabled();
});

test("F-04 erros: Auditar sem arquivo leva o foco ao seletor da spec", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "Auditar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Escolha a spec da demanda antes de auditar." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escolher Spec…" })).toBeFocused();
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeHidden();
});

test("F-04 erros: com spec e sem log, o foco vai ao seletor do log", async ({ page }) => {
  await abrir(page);
  await escolherArquivo(page, "Escolher Spec…", arquivoCorpus("02-tudo-ok", "spec.json"));
  await expect(page.getByText("spec.json").first()).toBeVisible();
  await page.getByRole("button", { name: "Auditar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Escolha o log de eventos antes de auditar." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escolher Log…" })).toBeFocused();
});

test("F-04 erros: trocar a spec depois de auditar avisa que o resultado está desatualizado", async ({ page }) => {
  await abrir(page);
  await carregarCaso(page, "02-tudo-ok");
  await auditar(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Trocar Arquivo…" }).first().click(),
  ]);
  await chooser.setFiles(arquivoCorpus("03-nenhum-disparo", "spec.json"));
  await expect(page.getByText(/Você trocou a spec, o log ou a plataforma/)).toBeVisible();
});
