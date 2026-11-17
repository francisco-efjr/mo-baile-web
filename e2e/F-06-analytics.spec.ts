import { expect, test } from "@playwright/test";
import { abrir, arquivoCorpus, escolherArquivo, gabaritoAnalytics, lerDownload } from "./apoio";

// Caso 01: logcat com 12 linhas lidas e 1 duplicada.
const CASO = "01-exemplo-loja";

function casa(ev: { event_name: string; origin?: string; time_str?: string; params: Record<string, unknown> }, termo: string): boolean {
  const alvo = `${ev.event_name} ${ev.origin ?? ""} ${ev.time_str ?? ""} ${JSON.stringify(ev.params, null, 2)}`.toLowerCase();
  return alvo.includes(termo.toLowerCase());
}

test("F-06 analytics: contagem, busca, detalhe em JSON e exportações", async ({ page }) => {
  const g = gabaritoAnalytics(CASO);
  const n = g.events.length;
  await abrir(page, "Analytics");
  await expect(page.getByRole("heading", { name: "Nenhum logcat aberto" })).toBeVisible();
  await escolherArquivo(page, "Escolher Logcat…", arquivoCorpus(CASO, "log.txt"));

  await expect(page.getByRole("heading", { name: `${n} eventos do Firebase` })).toBeVisible();
  await expect(page.getByText(`${g.stats.total_lidos} lidos · ${g.stats.duplicados} duplicado descartado`)).toBeVisible();
  const linhas = page.getByRole("table", { name: "Eventos do Firebase Analytics" }).locator("tbody tr");
  await expect(linhas).toHaveCount(n);

  // Busca: o motor decide quais eventos existem, a tela só filtra.
  const termo = "screen_view";
  const esperados = g.events.filter((e) => casa(e, termo)).length;
  expect(esperados).toBeGreaterThan(0);
  expect(esperados).toBeLessThan(n);
  await page.getByRole("searchbox", { name: "Buscar nos eventos" }).fill(termo);
  await expect(linhas).toHaveCount(esperados);
  await expect(page.getByText(`${esperados} de ${n} eventos`)).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar nos eventos" }).fill("zzz-nao-existe-zzz");
  await expect(page.getByText("Nenhum evento com essa busca")).toBeVisible();
  await page.getByRole("button", { name: "Limpar a busca" }).click();
  await expect(linhas).toHaveCount(n);

  // Detalhe: JSON dos parâmetros do primeiro evento.
  const primeiro = g.events[0]!;
  await linhas.first().getByRole("button").click();
  const detalhe = page.getByRole("region", { name: "Detalhe do evento" });
  await expect(detalhe.getByRole("heading", { level: 3 })).toHaveText(primeiro.event_name);
  const json = detalhe.getByLabel("JSON dos parâmetros");
  expect(JSON.parse((await json.textContent()) ?? "")).toEqual(primeiro.params);

  const [tsv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar TSV" }).click()]);
  expect(tsv.suggestedFilename()).toBe("eventos_log.tsv");
  expect(await lerDownload(tsv)).toBe(g.tsv);

  const [js] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar JSON" }).click()]);
  expect(js.suggestedFilename()).toBe("eventos_log.json");
  const textoJson = await lerDownload(js);
  expect(textoJson).toBe(g.json);
  expect(JSON.parse(textoJson)).toHaveLength(n);
});

test("F-06 analytics: logcat em UTF-16 com CRLF é lido (caso 18)", async ({ page }) => {
  const g = gabaritoAnalytics("18-logcat-utf16-crlf");
  await abrir(page, "Analytics");
  await escolherArquivo(page, "Escolher Logcat…", arquivoCorpus("18-logcat-utf16-crlf", "log.txt"));
  await expect(page.getByRole("heading", { name: `${g.events.length} eventos do Firebase` })).toBeVisible();
});

test("F-06 analytics: arquivo sem eventos mostra o aviso de ligar o log do Firebase (caso 15)", async ({ page }) => {
  expect(gabaritoAnalytics("15-log-sem-eventos").events).toHaveLength(0);
  await abrir(page, "Analytics");
  await escolherArquivo(page, "Escolher Logcat…", arquivoCorpus("15-log-sem-eventos", "log.txt"));
  await expect(page.getByRole("heading", { name: "Nenhum evento do Firebase neste arquivo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar TSV" })).toBeHidden();
});

test("F-06 analytics: o exemplo da aba lista os eventos do gabarito", async ({ page }) => {
  const g = gabaritoAnalytics(CASO);
  await abrir(page, "Analytics");
  await page.getByRole("button", { name: "Experimentar com um Exemplo" }).click();
  await expect(page.getByRole("heading", { name: `${g.events.length} eventos do Firebase` })).toBeVisible();
});
