/** Relatórios em texto (Markdown e TSV): port de `services/report/documents.py`. */

import { pyOr, pyStr, pyTruthy } from "./py";
import type { Report, VariantResult, VariantStatus } from "./spec";
import { logPeriod, observationLines, periodText, summaryLines } from "./text";

export const HEADERS = ["Seção", "Card", "Fluxo", "Evento", "Variação", "Status", "Divergências", "Horário", "Disparos"];

export const STATUS_TEXT: Record<VariantStatus, string> = { ok: "OK", error: "ERRO", missing: "NÃO DISPARADO" };

export function variationText(result: VariantResult): string {
  const e = result.variant.expected;
  return pyStr(pyOr(e.get("detail") ?? null, e.get("screen_name") ?? null, ""));
}

export function divergencesText(result: VariantResult): string {
  if (result.status === "missing") return "Não disparado no log";
  const out = result.checks
    .filter((c) => !c.ok)
    .map((c) => `${c.field}: obtido ${c.obtained !== null ? pyStr(c.obtained) : "AUSENTE"}, esperado ${c.expected}`);
  if (result.older_divergences.length)
    out.push(`⚠ ${result.older_divergent} disparo(s) anterior(es): ` + result.older_divergences.join(", "));
  return out.join("; ");
}

function rows(report: Report): string[][] {
  return report.results.map((result) => {
    const card = report.spec.cards[result.variant.card_index]!;
    const flow = pyTruthy(result.variant.flow) ? (report.spec.fluxos.get(result.variant.flow!) ?? "") : "-";
    return [
      card.secao,
      card.titulo || card.evento,
      flow,
      result.variant.event,
      variationText(result),
      STATUS_TEXT[result.status],
      divergencesText(result),
      result.matched ? result.matched.time_str || "" : "",
      String(result.occurrences),
    ];
  });
}

export function generateMarkdown(report: Report): string {
  const spec = report.spec;
  const md = [`# Auditoria de Tagueamento — ${spec.projeto} (${report.platform.toUpperCase()})`, ""];
  if (spec.versao_especificacao) md.push(`Spec: ${spec.versao_especificacao}`);
  const period = logPeriod(report);
  if (period) md.push(`- Período do log: ${periodText(period)}`);
  md.push(...summaryLines(report).map((line) => `- ${line}`), "");
  md.push("| " + HEADERS.join(" | ") + " |");
  md.push("|" + HEADERS.map(() => "---").join("|") + "|");
  for (const row of rows(report)) md.push("| " + row.map((c) => c.split("|").join("\\|").split("\n").join(" ")).join(" | ") + " |");
  md.push("", "## Fora da spec / Observações", "", ...observationLines(report));
  return md.join("\n") + "\n";
}

export function generateTsv(report: Report): string {
  const clean = (cell: string) => cell.split("\t").join(" ").split("\n").join(" ");
  return [HEADERS, ...rows(report)].map((row) => row.map(clean).join("\t")).join("\n") + "\n";
}
