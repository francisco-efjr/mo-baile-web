/**
 * Resultado de `report.spec` e `report.audit` no formato web: port de
 * `ReportService.spec_summary`, `report_payload` e `_result_payload`.
 *
 * Igual ao Mo baile, com as diferenças da versão web (`mobaile.web`): nome do
 * arquivo no lugar do caminho (`name`, `log_name`), sem `prints_dir`,
 * `prints_dir_exists` nem `print_path`, e `source` sempre `file`. O resultado
 * é montado com os valores do Python (`Map`, `PyFloat`) para sair igual byte a
 * byte no JSON; a interface recebe a versão comum (`toJs`).
 */

import { divergencesText, generateMarkdown, generateTsv, variationText } from "./documents";
import { isInt, isStr, PyFloat, pyJsonDumps, pyTruthy, type PyDict, type PyValue } from "./py";
import { expandSpec } from "./rules";
import { totals, type ExtraEvent, type Report, type SpecTemplate, type TagEvent, type VariantResult } from "./spec";
import { complianceRate, flowShortLabel, observationLines, variantBlockText } from "./text";

const dict = (entries: [string, PyValue][]): PyDict => new Map(entries);

/** Valor do log como texto de relatório; `null` quando o parâmetro não veio. */
function display(value: PyValue): string | null {
  if (value === null) return null;
  return isStr(value) ? value : pyJsonDumps(value);
}

export function specSummaryPy(spec: SpecTemplate, name: string): PyDict {
  const sections: string[] = [];
  for (const card of spec.cards) if (!sections.includes(card.secao)) sections.push(card.secao);
  return dict([
    ["name", name],
    ["projeto", spec.projeto],
    ["versao_especificacao", spec.versao_especificacao],
    ["plataforma", spec.plataforma],
    ["fluxos", [...spec.fluxos].map(([key, label]) => dict([["key", key], ["label", label]]))],
    ["cards", spec.cards.length],
    ["variants", expandSpec(spec).length],
    ["sections", sections],
  ]);
}

function matchedPayload(event: TagEvent | null): PyValue {
  if (event === null) return null;
  return dict([
    ["id", isInt(event.id) ? event.id : null],
    ["time", event.time_str],
    ["event_name", event.event_name],
    ["params", event.params],
  ]);
}

function resultPayload(report: Report, index: number, result: VariantResult): PyDict {
  const spec = report.spec;
  const card = spec.cards[result.variant.card_index]!;
  const flow = result.variant.flow;
  return dict([
    ["id", index],
    ["card_index", result.variant.card_index],
    ["section", card.secao],
    ["card_title", card.titulo || card.evento],
    ["flow", flow],
    ["flow_label", pyTruthy(flow) ? (spec.fluxos.get(flow!) ?? flow) : null],
    ["event", result.variant.event],
    ["variation", variationText(result)],
    ["status", result.status],
    [
      "checks",
      result.checks.map((c) =>
        dict([
          ["field", c.field],
          ["expected", c.expected],
          ["obtained", display(c.obtained)],
          ["ok", c.ok],
        ]),
      ),
    ],
    ["expected", [...result.variant.expected].map(([key, value]) => dict([["key", key], ["value", display(value)]]))],
    ["matched", matchedPayload(result.matched)],
    ["occurrences", result.occurrences],
    ["older_divergent", result.older_divergent],
    ["older_divergences", [...result.older_divergences]],
    ["ga_screen", result.ga_screen],
    ["note", result.variant.note],
    ["divergences", divergencesText(result)],
    ["block", variantBlockText(result, flowShortLabel(report, flow))],
  ]);
}

const extraDict = (e: ExtraEvent): PyDict =>
  dict([
    ["event", e.event],
    ["screen", e.screen],
    ["flow_name", e.flow_name],
    ["component", e.component],
    ["detail", e.detail],
    ["count", e.count],
  ]);

export function reportPayloadPy(report: Report, specName: string, logName: string): PyDict {
  const stats = report.log_stats;
  const t = totals(report);
  return dict([
    ["spec", specSummaryPy(report.spec, specName)],
    ["platform", report.platform],
    ["source", "file"],
    ["log_name", logName],
    [
      "log_stats",
      dict([
        ["total_lidos", stats.total_lidos],
        ["da_plataforma", stats.da_plataforma],
        ["duplicados", stats.duplicados],
        ["uteis", stats.uteis],
      ]),
    ],
    [
      "summary",
      dict([
        ["total", t.total],
        ["ok", t.ok],
        ["divergent", t.divergent],
        ["missing", t.missing],
        ["compliance_rate", new PyFloat(complianceRate(report))],
        ["extras", report.extras.length],
        ["alerts", report.alerts.length],
      ]),
    ],
    ["results", report.results.map((r, i) => resultPayload(report, i, r))],
    ["extras", report.extras.map(extraDict)],
    ["alerts", report.alerts.map(extraDict)],
    ["observations", observationLines(report).join("\n")],
    ["markdown", generateMarkdown(report)],
    ["tsv", generateTsv(report)],
  ]);
}
