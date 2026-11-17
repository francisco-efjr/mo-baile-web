import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { abrir, vigiarRede } from "./apoio";

// F-11: a tela Importar Prints do Figma, na aba Relatório. Escolher a pasta (ou
// os prints), ler no navegador, revisar as dúvidas com o print ao lado, baixar
// a spec e usar o rascunho na auditoria. Fonte do esperado: o desenho dos
// cards fictícios (tools/ocr/cards-ficticios.mjs) e o F-10, que já prova que
// o OCR desses cards dá a spec da leitura perfeita.

const PASTA = decodeURIComponent(new URL("./fixtures/prints/", import.meta.url).pathname);
const PRINTS = readdirSync(PASTA).filter((f) => f.endsWith(".png")).sort().map((f) => PASTA + f);
const EVENTOS = ["screen_view", "screen_view", "interaction_demo_simulacao", "purchase", "error_view", "form_input"];

test.setTimeout(180_000);

async function abrirImportacao(page: Page) {
  await abrir(page);
  await page.getByRole("button", { name: "Importar Prints do Figma…" }).click();
  const dialogo = page.getByRole("dialog", { name: "Importar Prints do Figma" });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function escolher(page: Page, botao: "Escolher Pasta…" | "Escolher Prints…", arquivos: string | string[]) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: botao }).click()]);
  await chooser.setFiles(arquivos);
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "fluxo completo no desktop; o celular tem o teste dele");

  test("F-11 importar: pasta, leitura, revisão, Baixar Spec e Usar na Auditoria", async ({ page }, info) => {
    const fora = vigiarRede(page);
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    const dialogo = await abrirImportacao(page);

    // A pasta tem os 6 prints e o linhas-ideais.json, que fica de fora calado.
    await escolher(page, "Escolher Pasta…", PASTA);
    await expect(dialogo.getByText("6 prints")).toBeVisible();
    await expect(dialogo.getByRole("textbox", { name: "Projeto" })).toHaveAttribute("placeholder", "prints");
    await dialogo.getByRole("textbox", { name: "Projeto" }).fill("DemoApp");
    await dialogo.getByRole("combobox", { name: "Plataforma" }).selectOption("ios");
    await dialogo.getByRole("button", { name: "Ler Prints" }).click();
    await expect(dialogo.getByRole("progressbar", { name: "Progresso da leitura" })).toBeVisible();

    await expect(dialogo.getByText("6 prints lidos")).toBeVisible({ timeout: 120_000 });
    await expect(dialogo.getByText("Fluxos detectados: pf, pj.")).toBeVisible();
    // O destaque do seletor (medido quando a revisão aparece) assenta sob o botão escolhido.
    const seletor = dialogo.getByRole("group", { name: "Mostrar os prints" });
    await expect
      .poll(() =>
        seletor.evaluate((el) => {
          const p = el.querySelector<HTMLElement>(".mb-seg__thumb")!.getBoundingClientRect();
          const s = el.querySelector<HTMLElement>(".mb-seg__item.is-selected")!.getBoundingClientRect();
          return Math.abs(p.left - s.left) < 1 && Math.abs(p.width - s.width) < 1;
        }),
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath("revisao-desktop.png") });

    // Todos: os 6 cards, cada um com o print ao lado e o evento lido.
    await dialogo.getByRole("group", { name: "Mostrar os prints" }).getByRole("button", { name: /Todos/ }).click();
    const cards = dialogo.getByRole("list", { name: "Prints lidos" }).getByRole("listitem");
    await expect(cards).toHaveCount(6);
    for (const [i, evento] of EVENTOS.entries()) await expect(cards.nth(i)).toContainText(evento);
    await expect(cards.first().getByRole("img")).toHaveAttribute("src", /^blob:/);

    const [download] = await Promise.all([page.waitForEvent("download"), dialogo.getByRole("button", { name: "Baixar Spec" }).click()]);
    expect(download.suggestedFilename()).toBe("demoapp.json");
    const spec = JSON.parse(readFileSync(await download.path(), "utf8")) as {
      projeto: string;
      plataforma: string;
      prints_dir: string;
      fluxos: Record<string, string>;
      cards: { evento: string; print: string; params: Record<string, unknown>; variacoes?: Record<string, string>[] }[];
    };
    expect(spec.projeto).toBe("DemoApp");
    expect(spec.plataforma).toBe("ios");
    expect(spec.prints_dir).toBe("prints");
    expect(spec.fluxos).toEqual({ pf: "pf", pj: "pj" });
    expect(spec.cards.map((c) => c.evento)).toEqual(EVENTOS);
    expect(spec.cards[1]!.params.screen_name).toBe("app:demo:{fluxo}:simulacao");
    expect(spec.cards[2]!.variacoes).toEqual([{ detail: "click:continuar" }, { detail: "click:voltar" }]);

    const [revisao] = await Promise.all([page.waitForEvent("download"), dialogo.getByRole("button", { name: "Baixar Revisão" }).click()]);
    expect(revisao.suggestedFilename()).toBe("demoapp.revisao.md");
    expect(readFileSync(await revisao.path(), "utf8")).toMatch(/^# Revisão do rascunho — DemoApp\n/);
    const [checklist] = await Promise.all([page.waitForEvent("download"), dialogo.getByRole("button", { name: "Baixar Checklist" }).click()]);
    expect(checklist.suggestedFilename()).toBe("demoapp.checklist.md");
    expect(readFileSync(await checklist.path(), "utf8")).toContain("- Plataforma: IOS");

    // Usar na Auditoria: o rascunho vira a spec do quadro.
    await dialogo.getByRole("button", { name: "Usar na Auditoria" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText("demoapp.json", { exact: true })).toBeVisible();
    await expect(page.getByText(/DemoApp · 6 cards/)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Rascunho da spec carregado");

    expect(fora).toEqual([]);
    expect(erros).toEqual([]);
  });

  test("F-11 importar: Cancelar volta para a escolha com os prints mantidos", async ({ page }) => {
    const dialogo = await abrirImportacao(page);
    await escolher(page, "Escolher Prints…", PRINTS);
    await expect(dialogo.getByText("6 prints")).toBeVisible();
    await dialogo.getByRole("button", { name: "Ler Prints" }).click();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo.getByText("Leitura cancelada.", { exact: false })).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Ler Prints" })).toBeEnabled();
    await expect(dialogo.getByText("6 prints")).toBeVisible();
  });

  test("F-11 importar: sem imagem, imagem falsa e formato do Mac", async ({ page }) => {
    const dialogo = await abrirImportacao(page);
    await escolher(page, "Escolher Prints…", [{ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("x") }] as never);
    await expect(dialogo.getByText("Nenhum print em PNG ou JPG nessa seleção.", { exact: false })).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Ler Prints" })).toBeDisabled();

    await escolher(page, "Escolher Prints…", [
      { name: "falso.png", mimeType: "image/png", buffer: Buffer.from("não sou imagem") },
      { name: "card.heic", mimeType: "image/heic", buffer: Buffer.from("x") },
    ] as never);
    await expect(dialogo.getByText("1 arquivo ficou de fora")).toBeVisible();
    await dialogo.getByText("1 arquivo ficou de fora").click();
    await expect(dialogo.getByText("o navegador não abre esse formato", { exact: false })).toBeVisible();
    await dialogo.getByRole("button", { name: "Ler Prints" }).click();
    await expect(dialogo.getByText("Não foi possível ler falso.png: o arquivo não é PNG nem JPG.")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("celular", () => {
  test.skip(({ isMobile }) => !isMobile, "layout do celular");

  test("F-11 importar no celular: escolher, ler e revisar sem rolagem horizontal", async ({ page }, info) => {
    const dialogo = await abrirImportacao(page);
    await escolher(page, "Escolher Prints…", PRINTS.slice(2, 4));
    await expect(dialogo.getByText("2 prints")).toBeVisible();
    await dialogo.getByRole("button", { name: "Ler Prints" }).click();
    await expect(dialogo.getByText("2 prints lidos")).toBeVisible({ timeout: 120_000 });
    await dialogo.getByRole("group", { name: "Mostrar os prints" }).getByRole("button", { name: /Todos/ }).click();
    await page.screenshot({ path: info.outputPath("revisao-celular.png"), fullPage: false });
    const corpo = dialogo.locator(".mw-imp__corpo");
    const larguras = await corpo.evaluate((el) => ({ rolagem: el.scrollWidth, visivel: el.clientWidth }));
    expect(larguras.rolagem).toBeLessThanOrEqual(larguras.visivel);
    await dialogo.getByRole("button", { name: "Fechar" }).click();
    await expect(dialogo).toBeHidden();
  });
});
