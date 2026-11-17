/**
 * Textos da auditoria que o Mo baile repete em todo lugar (board, HTML,
 * Markdown e app): port das partes de texto de `services/report/board.py`.
 * O board Excalidraw em si fica fora do site (docs/PARIDADE.md).
 */

import { cpLen, pyFixed, pyJsonDumps, pyRound, pyStr, pyTruthy, type PyValue } from "./py";
import { pyCompile } from "./pyre";
import { totals, type Report, type TagEvent, type VariantResult } from "./spec";
import { wrap } from "./textwrap";

const fmt = (value: PyValue) => pyJsonDumps(value);

export function complianceRate(report: Report): number {
  const { total, ok } = totals(report);
  if (!total) return 0;
  return pyRound((ok / total) * 100, 1);
}

/** Texto do bloco JSON de uma variação. */
export function variantBlockText(result: VariantResult, flowLabel: string | null): string {
  const variant = result.variant;
  const head = flowLabel ? `${flowLabel} · ` : "";
  let lines: string[];
  if (result.status === "missing") {
    lines = [`// ${head}${variant.event} [ERRO]`, "// NÃO DISPARADO no log", "{"];
    const flat: [string, PyValue][] = [];
    for (const [key, value] of variant.expected) {
      if (key === "items" && Array.isArray(value) && value.length && value[0] instanceof Map) {
        for (const [ik, iv] of value[0]) flat.push([`items[0].${ik}`, iv]);
      } else flat.push([key, value]);
    }
    flat.forEach(([key, value], i) => lines.push(`  "${key}": ${fmt(value)}` + (i < flat.length - 1 ? "," : "")));
    lines.push("}  // esperado (spec)");
  } else {
    const matched = result.matched;
    const ok = result.status === "ok";
    lines = [
      `// ${head}${variant.event} [${ok ? "OK" : "ERRO"}]`,
      `// log ${matched && matched.time_str ? matched.time_str : ""} · ${result.occurrences} disparo(s)`,
      "{",
    ];
    result.checks.forEach((check, i) => {
      const comma = i < result.checks.length - 1 ? "," : "";
      const got = check.obtained === null ? "AUSENTE" : fmt(check.obtained);
      lines.push(`  "${check.field}": ${got}${comma}  ${check.ok ? "✓" : "✗"}`);
      if (!check.ok) lines.push(`    // ↳ esperado: ${check.expected}`);
    });
    lines.push("}");
    if (pyTruthy(result.ga_screen)) lines.push(`// ga_screen: ${pyStr(result.ga_screen)}`);
    if (result.older_divergences.length) {
      lines.push(`// ⚠ ${result.older_divergent} disparo(s) anterior(es) divergente(s):`);
      for (const d of result.older_divergences.slice(0, 4)) lines.push(`//   ${d}`);
    }
  }
  if (variant.note) lines.push(`// obs: ${variant.note}`);
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.startsWith("//") && cpLen(line) > 78) wrapped.push(...wrap(line, 78, "//   "));
    else wrapped.push(line);
  }
  return wrapped.join("\n");
}

export function summaryLines(report: Report): string[] {
  const stats = report.log_stats;
  const t = totals(report);
  return [
    `${report.spec.cards.length} cards · ${t.total} validações · OK: ${t.ok} · ` +
      `Erro: ${t.error} (sendo ${t.missing} não disparadas) · ` +
      `Conformidade: ${pyFixed(complianceRate(report), 1)}%`,
    `Plataforma: ${report.platform.toUpperCase()} · ${stats.uteis} eventos únicos ` +
      `(${stats.duplicados} duplicados removidos de ${stats.da_plataforma} da plataforma; ` +
      `${stats.total_lidos} lidos no arquivo)`,
  ];
}

export function observationLines(report: Report): string[] {
  const lines = ["Eventos dos fluxos da spec que nenhum card cobre:"];
  if (!report.extras.length) lines.push("  (nenhum)");
  for (const extra of report.extras) {
    const parts = [extra.event, extra.screen || "-"];
    if (extra.component) parts.push(`component=${extra.component}`);
    if (extra.detail) parts.push(`detail=${extra.detail}`);
    lines.push(`  • ${parts.join(" · ")} — ${extra.count}x`);
  }
  lines.push("", "Alertas (app_exception / error_view nas telas da spec):");
  if (!report.alerts.length) lines.push("  (nenhum)");
  for (const alert of report.alerts) lines.push(`  • ${alert.event} · ${alert.screen || "-"} — ${alert.count}x`);
  lines.push(
    "",
    "Regra: cada variação é validada pelo disparo mais recente; '⚠' indica disparos anteriores com divergência diferente.",
  );
  return lines;
}

// "10:00:00.000", "10-08 10:00:00.000" (logcat) ou "2026-10-08 10:00:00.123" (iOS).
const STAMP = pyCompile(String.raw`^\s*(?:(?:(\d{4})-)?(\d{2})-(\d{2})[ T]+)?(\d{2}):(\d{2}):(\d{2})`);

export interface LogPeriod {
  start: string;
  end: string;
  duration: string | null;
}

export function periodText(p: LogPeriod): string {
  return `${p.start} até ${p.end}` + (p.duration ? ` (${p.duration})` : "");
}

type Stamp = [string | null, string | null, string | null, string];

function stamp(event: TagEvent): Stamp | null {
  const own = STAMP.match(event.time_str || "");
  const raw = STAMP.match(event.raw_log || "");
  const found = own || raw;
  if (!found) return null;
  let [year, month, day] = [found.group(1), found.group(2), found.group(3)];
  if (month === null && raw !== null) [year, month, day] = [raw.group(1), raw.group(2), raw.group(3)];
  return [year, month, day, [found.group(4), found.group(5), found.group(6)].join(":")];
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  let minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  let hours = Math.floor(minutes / 60);
  minutes %= 60;
  if (hours < 24) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  const days = Math.floor(hours / 24);
  hours %= 24;
  return `${days} d ${hours} h`;
}

/** Valor de um dígito decimal Unicode (o `int()` do Python aceita "١٢"). */
function digitValue(ch: string): number {
  const c = ch.codePointAt(0)!;
  let start = c;
  while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--;
  return (c - start) % 10;
}

function toInt(text: string): number {
  let n = 0;
  for (const ch of text) n = n * 10 + digitValue(ch);
  return n;
}

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** `datetime.strptime("%Y-%m-%d %H:%M:%S")` em segundos, ou `null` se o Python recusaria a data. */
function toSeconds(y: string, mo: string, d: string, hms: string): number | null {
  const [h, mi, s] = hms.split(":").map(toInt) as [number, number, number];
  const year = toInt(y);
  const month = toInt(mo);
  const day = toInt(d);
  if ([...y].length !== 4 || year < 1 || month < 1 || month > 12 || h > 23 || mi > 59 || s > 59) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day < 1 || day > dim) return null;
  return daysFromCivil(year, month, day) * 86400 + h * 3600 + mi * 60 + s;
}

/** Período do log: data e hora do primeiro e do último evento útil. */
export function logPeriod(report: Report): LogPeriod | null {
  if (!report.first_event || !report.last_event) return null;
  const first = stamp(report.first_event);
  const last = stamp(report.last_event);
  if (!first || !last) return null;
  const date = (s: Stamp): string | null => {
    const [year, month, day] = s;
    if (month === null) return null;
    return `${day}/${month}` + (year ? `/${year}` : "");
  };
  const start = date(first) ? `${date(first)} ${first[3]}` : first[3];
  const sameDay = date(first) === date(last) || date(last) === null;
  const end = sameDay ? last[3] : `${date(last)} ${last[3]}`;
  let dur: string | null = null;
  if ((first[1] === null) === (last[1] === null)) {
    const year = first[0] || last[0] || "2000";
    const begin = toSeconds(first[0] || year, first[1] || "01", first[2] || "01", first[3]);
    const finish = toSeconds(last[0] || year, last[1] || "01", last[2] || "01", last[3]);
    if (begin !== null && finish !== null && finish >= begin) dur = duration(finish - begin);
  }
  return { start, end, duration: dur };
}

/** Rótulo curto do fluxo nos blocos: `PDA · pedido-avulso` vira `PDA`. */
export function flowShortLabel(report: Report, flow: string | null): string | null {
  if (flow === null) return null;
  return (report.spec.fluxos.get(flow) ?? flow).split(" · ")[0]!;
}
