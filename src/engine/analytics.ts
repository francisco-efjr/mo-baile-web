/**
 * Aba Analytics: eventos de um logcat salvo (Android), como a rota de
 * Analytics da versão web do Mo baile (`mobaile.web.handlers.analytics`): o
 * parser do Relatório (`items_from_text` + `events_from_items`), o TSV com as
 * colunas do "Exportar TSV" do app e o JSON dos eventos.
 */

import { eventsFromItems, itemsFromText } from "./firebaseLog";
import { pyJsonDumps, pyOr, pyStr, type PyDict, type PyValue } from "./py";
import type { TagEvent } from "./spec";

/** Mesmas colunas do "Exportar TSV" do Analytics do app. */
export const TSV_HEADER = "Hora\tPlataforma\tOrigem\tNome do Evento\tParâmetros Principais\tJSON dos Parâmetros";

function cell(value: PyValue): string {
  return pyStr(pyOr(value, "")).split("\t").join(" ").split("\r").join(" ").split("\n").join(" ");
}

export function analyticsTsv(events: TagEvent[]): string {
  const lines = [TSV_HEADER];
  for (const event of events) {
    const main = [...event.params]
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${pyStr(v)}`)
      .join(", ");
    const params = pyJsonDumps(event.params);
    lines.push([event.time_str, event.platform.toUpperCase(), event.origin, event.event_name, main, params].map(cell).join("\t"));
  }
  return lines.join("\n");
}

/** O evento como `dataclasses.asdict(TagEvent)`. */
export function eventDict(e: TagEvent): PyDict {
  return new Map<string, PyValue>([
    ["id", e.id],
    ["event_name", e.event_name],
    ["params", e.params],
    ["platform", e.platform],
    ["raw_log", e.raw_log],
    ["time_str", e.time_str],
    ["origin", e.origin],
  ]);
}

/** Leitura completa, com os valores do Python (para o JSON sair igual ao do Mo baile). */
export function analyticsPy(text: string): PyDict {
  const [events, stats] = eventsFromItems(itemsFromText(text).items, "android");
  const eventos = events.map(eventDict);
  return new Map<string, PyValue>([
    ["platform", "android"],
    [
      "stats",
      new Map<string, PyValue>([
        ["total_lidos", stats.total_lidos],
        ["da_plataforma", stats.da_plataforma],
        ["duplicados", stats.duplicados],
        ["uteis", stats.uteis],
      ]),
    ],
    ["events", eventos],
    ["tsv", analyticsTsv(events)],
    ["json", pyJsonDumps(eventos, { indent: 2 })],
  ]);
}
