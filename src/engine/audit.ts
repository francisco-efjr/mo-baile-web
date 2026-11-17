/**
 * Auditoria por variação (card x fluxo x variação): port de `services/report/audit.py`.
 *
 * - Candidatos: mesmo evento, `flow_name` e `detail` compatíveis, na tela da
 *   spec (`screen_name` explícito ou, na falta, `ga_screen`). Se só houver
 *   disparos com `ga_screen` na tela certa e `screen_name` diferente, eles viram
 *   erro de `screen_name`.
 * - O disparo mais recente é o avaliado; disparos anteriores com divergência
 *   diferente aparecem como aviso.
 * - Sem candidato: não disparado. Com candidato e algum parâmetro divergente: erro.
 * - Eventos dos fluxos da spec que nenhuma variação cobre vão para "fora da
 *   spec"; `app_exception` e `error_view` nas telas da spec viram alertas.
 */

import { dictGet, isDict, isList, pyEq, pyHashKey, pyOr, pyStr, pyStrip, pyTruthy, sortedStrings, type PyDict, type PyValue } from "./py";
import { displayExpected, expandSpec, isNoiseEvent, literalValue, valueMatches } from "./rules";
import type { ExtraEvent, LogStats, ParamCheck, Report, SpecTemplate, TagEvent, Variant, VariantResult } from "./spec";

export const ALERT_EVENTS = ["app_exception", "error_view"];
export const IGNORED_EXTRA_EVENTS = ["user_engagement", "session_start", "app_clear_data"];

export function screenOf(params: PyDict): PyValue {
  return pyOr(dictGet(params, "screen_name"), dictGet(params, "ga_screen"));
}

export function checkParams(expected: PyDict, params: PyDict): ParamCheck[] {
  const checks: ParamCheck[] = [];
  for (const [key, exp] of expected) {
    if (key === "items" && isList(exp)) {
      const gotItems = dictGet(params, "items");
      const first = isList(gotItems) && gotItems.length && isDict(gotItems[0]) ? (gotItems[0] as PyDict) : new Map();
      const expFirst = exp.length && isDict(exp[0]) ? (exp[0] as PyDict) : new Map();
      for (const [itemKey, itemExp] of expFirst) {
        const got = dictGet(first, itemKey);
        checks.push({ field: `items[0].${itemKey}`, expected: displayExpected(itemExp), obtained: got, ok: valueMatches(itemExp, got) });
      }
      continue;
    }
    const got = key === "screen_name" ? screenOf(params) : dictGet(params, key);
    checks.push({ field: key, expected: displayExpected(exp), obtained: got, ok: valueMatches(exp, got) });
  }
  return checks;
}

function failures(checks: ParamCheck[]): Set<string> {
  return new Set(checks.filter((c) => !c.ok).map((c) => `${c.field}=${pyStr(c.obtained)}`));
}

type Field = "flow_name" | "detail" | "screen" | "ga_screen";
const FIELDS: Record<Field, (p: PyDict) => PyValue> = {
  flow_name: (p) => dictGet(p, "flow_name"),
  detail: (p) => dictGet(p, "detail"),
  screen: screenOf,
  ga_screen: (p) => dictGet(p, "ga_screen"),
};

/** Eventos do log por nome e, sob demanda, por valor exato de um campo (na ordem do log). */
export class EventIndex {
  private readonly byName = new Map<string, TagEvent[]>();
  private readonly byValue = new Map<string, Map<string, TagEvent[]>>();

  constructor(events: TagEvent[]) {
    for (const event of events) {
      const list = this.byName.get(event.event_name);
      if (list) list.push(event);
      else this.byName.set(event.event_name, [event]);
    }
  }

  named(name: string): TagEvent[] {
    return this.byName.get(name) ?? [];
  }

  private values(name: string, field: Field): Map<string, TagEvent[]> {
    const cacheKey = `${field}\u0000${name}`;
    let index = this.byValue.get(cacheKey);
    if (!index) {
      const getter = FIELDS[field];
      index = new Map();
      for (const event of this.named(name)) {
        const got = getter(event.params);
        const key = got === null ? null : pyStrip(pyStr(got));
        if (key) {
          const list = index.get(key);
          if (list) list.push(event);
          else index.set(key, [event]);
        }
      }
      this.byValue.set(cacheKey, index);
    }
    return index;
  }

  /** Eventos `name` que atendem todos os filtros (campo, valor da spec), na ordem do log. */
  select(name: string, filters: [Field, PyValue][]): TagEvent[] {
    let pool = this.named(name);
    let start: number | null = null;
    filters.forEach(([field, expected], position) => {
      const literal = literalValue(expected);
      if (literal !== null) {
        const found = this.values(name, field).get(literal) ?? [];
        if (start === null || found.length < pool.length) {
          pool = found;
          start = position;
        }
      }
    });
    filters.forEach(([field, expected], position) => {
      if (position !== start && pool.length) {
        const getter = FIELDS[field];
        pool = pool.filter((e) => valueMatches(expected, getter(e.params)));
      }
    });
    return pool;
  }
}

function candidates(variant: Variant, events: EventIndex): TagEvent[] {
  const exp = variant.expected;
  const base: [Field, PyValue][] = (["flow_name", "detail"] as const).filter((k) => exp.has(k)).map((k) => [k, exp.get(k)!]);
  if (!exp.has("screen_name")) return events.select(variant.event, base);
  const sameScreen = events.select(variant.event, [...base, ["screen", exp.get("screen_name")!]]);
  if (sameScreen.length) return sameScreen;
  // Disparou na tela certa (ga_screen) com screen_name divergente: vira erro
  // de screen_name. Em outra tela qualquer não é esta variação.
  return events.select(variant.event, [...base, ["ga_screen", exp.get("screen_name")!]]);
}

function judge(variant: Variant, pool: TagEvent[]): VariantResult {
  if (!pool.length)
    return { variant, status: "missing", matched: null, checks: [], occurrences: 0, older_divergent: 0, older_divergences: [], ga_screen: null };
  const latest = pool[pool.length - 1]!;
  const checks = checkParams(variant.expected, latest.params);
  const current = failures(checks);
  const olderBad: Set<string>[] = [];
  for (const e of pool.slice(0, -1)) {
    const diff = new Set([...failures(checkParams(variant.expected, e.params))].filter((f) => !current.has(f)));
    if (diff.size) olderBad.push(diff);
  }
  const union = new Set<string>();
  for (const s of olderBad) for (const f of s) union.add(f);
  const gaScreen = dictGet(latest.params, "ga_screen");
  const explicit = dictGet(latest.params, "screen_name");
  return {
    variant,
    status: checks.every((c) => c.ok) ? "ok" : "error",
    matched: latest,
    checks,
    occurrences: pool.length,
    older_divergent: olderBad.length,
    older_divergences: sortedStrings(union),
    ga_screen: pyTruthy(explicit) && pyTruthy(gaScreen) && !pyEq(gaScreen, explicit) ? gaScreen : null,
  };
}

/** Confere um valor do log contra uma lista de valores da spec, lembrando a resposta. */
function anyMatcher(expected: PyValue[]): (obtained: PyValue) => boolean {
  const patterns = [...new Set(expected.map((v) => pyStrip(pyStr(v))))];
  const memo = new Map<string | null, boolean>();
  return (obtained) => {
    const key = obtained === null ? null : pyStrip(pyStr(obtained));
    let hit = memo.get(key);
    if (hit === undefined) {
      hit = patterns.some((p) => valueMatches(p, key));
      memo.set(key, hit);
    }
    return hit;
  };
}

function textOrNone(value: PyValue): string | null {
  return value === null ? null : pyStr(value);
}

function group(events: TagEvent[]): ExtraEvent[] {
  const groups = new Map<string, ExtraEvent>();
  for (const event of events) {
    const p = event.params;
    const values = [screenOf(p), dictGet(p, "flow_name"), dictGet(p, "component"), dictGet(p, "detail")];
    const key = [event.event_name, ...values.map(pyHashKey)].join("\u0000");
    let g = groups.get(key);
    if (!g) {
      g = {
        event: event.event_name,
        screen: textOrNone(values[0]!),
        flow_name: textOrNone(values[1]!),
        component: textOrNone(values[2]!),
        detail: textOrNone(values[3]!),
        count: 0,
      };
      groups.set(key, g);
    }
    g.count++;
  }
  return [...groups.values()];
}

/** Eventos "fora da spec" e alertas. */
export function findExtras(variants: Variant[], events: TagEvent[], pools: TagEvent[][]): [ExtraEvent[], ExtraEvent[]] {
  const inFlows = anyMatcher(variants.filter((v) => v.expected.has("flow_name")).map((v) => v.expected.get("flow_name")!));
  const inScreens = anyMatcher(variants.filter((v) => v.expected.has("screen_name")).map((v) => v.expected.get("screen_name")!));
  const related = (e: TagEvent) =>
    inFlows(dictGet(e.params, "flow_name")) || inScreens(pyOr(dictGet(e.params, "ga_screen"), screenOf(e.params)));
  const alerts = events.filter((e) => ALERT_EVENTS.includes(e.event_name) && related(e));
  const assigned = new Set<TagEvent>();
  for (const pool of pools) for (const e of pool) assigned.add(e);
  const extras = events.filter(
    (e) =>
      !assigned.has(e) &&
      !ALERT_EVENTS.includes(e.event_name) &&
      !IGNORED_EXTRA_EVENTS.includes(e.event_name) &&
      inFlows(dictGet(e.params, "flow_name")) &&
      !isNoiseEvent(e.event_name, e.params),
  );
  return [group(extras), group(alerts)];
}

export function runAudit(spec: SpecTemplate, events: TagEvent[], platform: string, logStats: LogStats): Report {
  const variants = expandSpec(spec);
  const index = new EventIndex(events);
  const pools = variants.map((v) => candidates(v, index));
  const results = variants.map((v, i) => judge(v, pools[i]!));
  const [extras, alerts] = findExtras(variants, events, pools);
  return {
    spec,
    platform,
    results,
    log_stats: { ...logStats },
    extras,
    alerts,
    first_event: events[0] ?? null,
    last_event: events[events.length - 1] ?? null,
  };
}
