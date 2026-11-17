// Apoio dos specs ponta a ponta: lê o corpus sintético e o gabarito do motor
// Python (a fonte do esperado) e dá atalhos de interação por papel/rótulo.
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const RAIZ = new URL("../test/", import.meta.url);

export const ORIGEM = "http://127.0.0.1:4173";

/** Caminho absoluto de um arquivo do corpus (para setInputFiles). */
export function arquivoCorpus(caso: string, arquivo: string): string {
  return decodeURIComponent(new URL(`corpus/${caso}/${arquivo}`, RAIZ).pathname);
}

export interface Gabarito {
  summary?: { total: number; ok: number; divergent: number; missing: number; compliance_rate: number; extras: number; alerts: number };
  spec?: { projeto: string };
  platform?: string;
  results?: { id: number; event: string; status: string; divergences: string; variation: string; checks: { field: string; expected: string; obtained: string; ok: boolean }[] }[];
  markdown?: string;
  tsv?: string;
  error?: { stage: string; code: string; message: string };
}

export interface GabaritoAnalytics {
  stats: { total_lidos: number; da_plataforma: number; duplicados: number; uteis: number };
  events: { event_name: string; origin?: string; time_str?: string; params: Record<string, unknown> }[];
  tsv: string;
  json: string;
}

export function gabarito(caso: string): Gabarito {
  return JSON.parse(readFileSync(new URL(`golden/${caso}.json`, RAIZ), "utf8")) as Gabarito;
}

export function gabaritoAnalytics(caso: string): GabaritoAnalytics {
  return JSON.parse(readFileSync(new URL(`golden/${caso}.analytics.json`, RAIZ), "utf8")) as GabaritoAnalytics;
}

export function versaoDoProjeto(): string {
  return readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
}

/** Mesmo formato do site: 42.9 vira "42,9%". */
export function pct(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export async function abrir(page: Page, area: "Relatório" | "Analytics" | "Ajuda" = "Relatório"): Promise<void> {
  await page.goto("/");
  if (area !== "Relatório") await page.getByRole("tab", { name: area }).click();
  await expect(page.getByRole("tab", { name: area })).toHaveAttribute("aria-selected", "true");
}

/** Escolhe um arquivo pelo botão (seletor de arquivos do navegador), como a pessoa faria. */
export async function escolherArquivo(page: Page, botao: string, caminho: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: botao }).click(),
  ]);
  await chooser.setFiles(caminho);
}

export async function carregarCaso(page: Page, caso: string, log = "log.txt"): Promise<void> {
  await escolherArquivo(page, "Escolher Spec…", arquivoCorpus(caso, "spec.json"));
  await expect(page.getByText("spec.json").first()).toBeVisible();
  await escolherArquivo(page, "Escolher Log…", arquivoCorpus(caso, log));
  await expect(page.getByText(log).first()).toBeVisible();
}

export async function auditar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Auditar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toBeVisible();
}

/** Resumo em tela: percentual do título e os seis números dos cartões. */
export function cartao(page: Page, rotulo: string): Locator {
  return page.getByRole("list", { name: "Resumo da auditoria" }).getByRole("listitem").filter({ hasText: rotulo });
}

export async function conferirResumo(page: Page, g: NonNullable<Gabarito["summary"]>): Promise<void> {
  await expect(page.getByRole("heading", { name: /Resultado da auditoria/ })).toContainText(pct(g.compliance_rate));
  const esperado: [string, number][] = [
    ["Validações", g.total],
    ["OK", g.ok],
    ["Divergentes", g.divergent],
    ["Não disparadas", g.missing],
    ["Fora da spec", g.extras],
    ["Alertas", g.alerts],
  ];
  for (const [rotulo, n] of esperado) {
    await expect(cartao(page, rotulo), rotulo).toHaveText(new RegExp(`^\\s*${n}\\s*${rotulo}\\s*$`));
  }
}

/** Registra toda requisição que não é da origem do teste (blob: e data: nunca saem do navegador). */
export function vigiarRede(page: Page): string[] {
  const fora: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(`${ORIGEM}/`) || url.startsWith("blob:") || url.startsWith("data:") || url === "about:blank") return;
    fora.push(`${req.method()} ${url}`);
  });
  return fora;
}

export function vigiarDialogos(page: Page): string[] {
  const vistos: string[] = [];
  page.on("dialog", async (d) => {
    vistos.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });
  return vistos;
}

export async function lerDownload(download: import("@playwright/test").Download): Promise<string> {
  const caminho = await download.path();
  expect(caminho).toBeTruthy();
  return readFileSync(caminho as string, "utf8");
}
