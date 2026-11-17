/**
 * Export de exploração do Google Analytics 4 em TSV, como log da auditoria:
 * port de `services/report/ga4_tsv.py` do Mo baile.
 *
 * O export não traz disparos: traz combinações já somadas (evento + as
 * dimensões escolhidas + métricas). Cada linha com métrica maior que zero vira
 * um evento, uma vez por plataforma quando a exploração é pivotada por sistema
 * operacional. As dimensões viram parâmetros; `firebase_screen` vira
 * `ga_screen`, como no logcat; `(not set)` é exportado e vazio. A lista do que
 * foi exportado vai em cada item (`exportados`): o resto é "não exportado".
 */

import { PyInternalError, pyLstrip, pySplitlines, pyStrip, type PyDict, type PyValue } from "./py";
import { pyCompile } from "./pyre";

const EVENT_HEADERS = new Set(["nome do evento", "event name", "eventname", "event_name"]);
const PLATFORM_HEADERS = new Set(["sistema operacional", "operating system", "operatingsystem", "plataforma", "platform"]);
const SCREEN_HEADERS = new Set([
  "firebase_screen", "nome da tela", "screen name", "título da página e nome da tela",
  "page title and screen name", "unifiedscreenname",
]);
const TOTAL_LABELS = new Set(["totais", "totals", "total", "total geral", "grand total"]);
const NOT_SET = new Set(["(not set)", "(não definido)", "(nao definido)"]);
const PARAM_LIKE = pyCompile("^[a-z0-9_]+$");
const POSITIVE = pyCompile("[1-9]");
const NUMERIC = pyCompile("[\\d.,\\s%-]+");
/** Plataforma do item quando o export não diz qual: vale para a plataforma auditada. */
export const ANY_PLATFORM = "qualquer";

const norm = (cell: string): string => pyStrip(pyLstrip(pyStrip(cell), "﻿")).toLowerCase();

function rows(content: string): string[][] {
  const out: string[][] = [];
  for (const line of pySplitlines(content)) {
    if (!pyStrip(line) || pyLstrip(pyLstrip(line, "﻿")).startsWith("#")) continue;
    out.push(line.split("\t"));
  }
  return out;
}

function headerIndex(all: string[][]): number | null {
  const limit = Math.min(all.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = all[i]!;
    if (row.length > 1 && row.some((cell) => EVENT_HEADERS.has(norm(cell)))) return i;
  }
  return null;
}

/** O texto é um export TSV do GA4 com a coluna do nome do evento? */
export function looksLikeGa4Tsv(content: string): boolean {
  return content.includes("\t") && headerIndex(rows(content)) !== null;
}

const paramKey = (header: string): string => (SCREEN_HEADERS.has(norm(header)) ? "ga_screen" : pyStrip(header));
const platformOf = (value: string): string => norm(value) || ANY_PLATFORM;
const positive = (cell: string): boolean => POSITIVE.search(cell) !== null;

/** Itens no formato da leitura do log, um por linha e plataforma com métrica maior que zero. */
export function itemsFromGa4Tsv(content: string): PyDict[] {
  const all = rows(content);
  const hi = headerIndex(all);
  if (hi === null) return [];
  const header = all[hi]!.map((cell) => pyStrip(cell));
  const data = all.slice(hi + 1);

  // Pivô de colunas: a linha logo acima do cabeçalho, vazia até o nome da dimensão.
  const pivot = hi > 0 ? all[hi - 1]! : null;
  let pivotAt: number | null = null;
  if (pivot) {
    const i = pivot.findIndex((cell) => pyStrip(cell) !== "");
    pivotAt = i >= 0 ? i : null;
  }
  let dims: number[];
  let metricCols: number[];
  let byPlatform: boolean;
  let columnValue = new Map<number, string>();
  if (pivot !== null && pivotAt !== null && pivotAt > 0 && pivotAt < header.length - 1) {
    dims = Array.from({ length: pivotAt + 1 }, (_, i) => i);
    metricCols = Array.from({ length: header.length - pivotAt - 1 }, (_, i) => pivotAt! + 1 + i);
    byPlatform = PLATFORM_HEADERS.has(norm(pivot[pivotAt]!));
    for (const j of metricCols) columnValue.set(j, j < pivot.length ? pyStrip(pivot[j]!) : "");
  } else {
    const numeric = (j: number): boolean => {
      const cells = data.filter((row) => j < row.length && pyStrip(row[j]!)).map((row) => pyStrip(row[j]!));
      return cells.length > 0 && cells.every((cell) => NUMERIC.fullmatch(cell) !== null);
    };
    let firstMetric = header.length;
    while (firstMetric > 1 && numeric(firstMetric - 1) && PARAM_LIKE.match(header[firstMetric - 1]!) === null) firstMetric--;
    dims = Array.from({ length: firstMetric }, (_, i) => i);
    metricCols = Array.from({ length: header.length - firstMetric }, (_, i) => firstMetric + i);
    byPlatform = false;
    columnValue = new Map();
  }

  const eventCol = dims.find((i) => EVENT_HEADERS.has(norm(header[i]!)));
  if (eventCol === undefined) throw new PyInternalError("StopIteration"); // `next()` sem valor, como no Python
  const platformColFound = dims.find((i) => PLATFORM_HEADERS.has(norm(header[i]!)));
  const platformCol = platformColFound === undefined ? null : platformColFound;
  const paramCols = dims.filter((i) => i !== eventCol && i !== platformCol);
  const exported = paramCols.map((i) => paramKey(header[i]!));

  const items: PyDict[] = [];
  for (const row of data) {
    const cells = header.map((_, i) => (i < row.length ? pyStrip(row[i]!) : ""));
    const event = cells[eventCol]!;
    if (!event || dims.every((i) => !cells[i])) continue; // linha de totais ou vazia
    const params: PyDict = new Map();
    for (const i of paramCols) {
      const value = cells[i]!;
      params.set(paramKey(header[i]!), NOT_SET.has(norm(value)) || !value ? null : value);
    }
    const rowPlatform = platformCol !== null ? platformOf(cells[platformCol]!) : ANY_PLATFORM;
    let targets: [string, string][];
    if (byPlatform) {
      targets = metricCols
        .filter((j) => !TOTAL_LABELS.has(norm(columnValue.get(j)!)) && columnValue.get(j))
        .map((j) => [platformOf(columnValue.get(j)!), cells[j]!]);
    } else {
      const totals = metricCols.filter((j) => TOTAL_LABELS.has(norm(columnValue.get(j) ?? "")));
      const col = totals.length ? totals[0]! : metricCols.length ? metricCols[0]! : null;
      targets = [[rowPlatform, col !== null ? cells[col]! : "1"]];
    }
    for (const [platform, count] of targets) {
      if (!positive(count)) continue;
      items.push(
        new Map<string, PyValue>([
          ["event_name", event],
          ["params", new Map(params)],
          ["platform", platform],
          ["exportados", [...exported]],
        ]),
      );
    }
  }
  return items;
}
