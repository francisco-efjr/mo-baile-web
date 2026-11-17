/**
 * Regras puras da auditoria: port de `services/report/rules.py`.
 *
 * Valores aceitos nos parâmetros da spec: literal, alternância `[0|1]` (inteira
 * ou em trecho), `[numero]`, `[data]` (dd/mm/aaaa), `[preenchido]`,
 * `re:<regex>` (expressão completa, sintaxe do Python) e `items` (cada campo do
 * primeiro item segue as mesmas regras). `{fluxo}` é trocado por cada chave de
 * `fluxos`; `params_por_fluxo` sobrescreve valores de um fluxo.
 */

import { dictGet, isDict, isList, isStr, pyOr, pyStr, pyStrip, PyInternalError, type PyDict, type PyValue } from "./py";
import { IGNORECASE, pyCompile, pyEscape, PyReError, type PyPattern } from "./pyre";
import { cardToDict, type SpecCard, type SpecTemplate, type Variant } from "./spec";

export const NUMBER = "[numero]";
export const DATE = "[data]";
export const FILLED = "[preenchido]";

const TOKEN_REGEX: Record<string, string> = {
  [NUMBER]: String.raw`-?\d+(?:[.,]\d+)?`,
  [DATE]: String.raw`\d{2}/\d{2}/\d{4}`,
  [FILLED]: ".+",
};
const TOKEN = pyCompile(String.raw`\[[^\[\]]*\|[^\[\]]*\]|\[numero\]|\[data\]|\[preenchido\]`);

export const NOISE_EVENT_PATTERNS = [
  "^session_start.*",
  "^app_clear_data.*",
  "^app_exception.*",
  "^CfgFetch.*",
  "^fiam_impression.*",
  "^firebase_in_app_message_impression.*",
  "^CAROUSEL_.*",
  "^COOKIES_.*",
  "^ITEM_.*",
  "^LS_.*",
  "^MOBILE_DATA_.*",
  "^RECOMMENDATION_.*",
  "^WP_MIX_.*",
  "^smartstream_.*",
  "^swipe_.*",
];
const NOISE = pyCompile(NOISE_EVENT_PATTERNS.map((p) => `(?:${p})`).join("|"), IGNORECASE);
const COLON_SPACING = pyCompile(String.raw`\s*:\s*`);
const SDK_SUFFIX = pyCompile(String.raw`\(_[a-zA-Z0-9]+\)$`);

// ------------------------------------------------------------- normalização

/** `app: pedido: home ` vira `app:pedido:home`. */
export function cleanColonSpacing(value: PyValue): string {
  if (!isStr(value)) return pyStr(value);
  const v = pyStrip(value);
  return v.includes(":") ? COLON_SPACING.sub(v, () => ":") : v;
}

/** `screen_view(_vs)` vira `screen_view`. */
export function stripEventSuffixes(name: PyValue): string {
  if (!isStr(name)) return pyStr(name);
  return stripSdkSuffix(pyStrip(name));
}

/** `ga_screen(_sn)` vira `ga_screen`. */
export function stripParamKeySuffixes(key: PyValue): string {
  if (!isStr(key)) return pyStr(key);
  return stripSdkSuffix(pyStrip(key));
}

function stripSdkSuffix(text: string): string {
  return text.endsWith(")") ? SDK_SUFFIX.sub(text, () => "") : text;
}

/** Evento automático do SDK, que não entra em "fora da spec". */
export function isNoiseEvent(eventName: string, params: PyDict): boolean {
  if (!eventName) return true;
  const origin = pyOr(dictGet(params, "ga_event_origin"), dictGet(params, "_o"));
  if (origin === "auto" || origin === "clx") return true;
  const clean = stripEventSuffixes(eventName);
  if (clean === "user_engagement" && origin !== "app") return true;
  return NOISE.match(eventName) !== null || NOISE.match(clean) !== null;
}

// ------------------------------------------------------------- placeholders

type Compiled = [string | null, (got: string) => boolean];
const compiledCache = new Map<string, Compiled>();

function compiled(exp: string): Compiled {
  const hit = compiledCache.get(exp);
  if (hit) return hit;
  let result: Compiled;
  if (exp === FILLED) result = [null, () => true];
  else {
    let pattern: PyPattern | null = null;
    try {
      if (exp === NUMBER || exp === DATE) pattern = pyCompile(TOKEN_REGEX[exp]!);
      else if (exp.startsWith("re:")) pattern = pyCompile(exp.slice(3));
      else if (TOKEN.search(exp)) pattern = pyCompile(tokenPattern(exp));
    } catch (err) {
      // A spec já validou a regex; inválida aqui é a que o fluxo estragou: no
      // Python a exceção sobe sem tratamento.
      if (err instanceof PyReError) throw new PyInternalError(err.message);
      throw err;
    }
    if (pattern === null) result = [exp, (got) => got === exp];
    else {
      const p = pattern;
      result = [null, (got) => p.fullmatch(got) !== null];
    }
  }
  if (compiledCache.size > 8192) compiledCache.clear();
  compiledCache.set(exp, result);
  return result;
}

function tokenPattern(exp: string): string {
  let pattern = "";
  let last = 0;
  for (const m of TOKEN.finditer(exp)) {
    pattern += pyEscape(exp.slice(last, m.start));
    const token = m.group(0)!;
    if (token in TOKEN_REGEX) pattern += TOKEN_REGEX[token];
    else
      pattern +=
        "(?:" +
        token
          .slice(1, -1)
          .split("|")
          .map((o) => pyEscape(pyStrip(o)))
          .join("|") +
        ")";
    last = m.end;
  }
  return pattern + pyEscape(exp.slice(last));
}

/** O valor do log atende o valor da spec (com placeholders)? */
export function valueMatches(expected: PyValue, obtained: PyValue | undefined): boolean {
  if (obtained === null || obtained === undefined) return false;
  const got = pyStrip(pyStr(obtained));
  if (!got) return false;
  return compiled(pyStrip(pyStr(expected)))[1](got);
}

/** O texto exato que o valor da spec exige, ou `null` se ele tem placeholder. */
export function literalValue(expected: PyValue): string | null {
  return compiled(pyStrip(pyStr(expected)))[0];
}

/** Texto curto do valor esperado, para relatório. */
export function displayExpected(expected: PyValue): string {
  const t = pyStr(expected);
  return t.startsWith("re:") ? t.slice(3) : t;
}

// ----------------------------------------------------------------- expansão

function subst(value: PyValue, flow: string | null): PyValue {
  if (flow === null) return value;
  if (isStr(value)) return value.split("{fluxo}").join(flow);
  if (isList(value)) return value.map((v) => subst(v, flow));
  if (isDict(value)) return new Map([...value].map(([k, v]) => [k, subst(v, flow)]));
  return value;
}

function merge(base: PyDict, extra: PyDict): PyDict {
  const out: PyDict = new Map(base);
  for (const [key, value] of extra) {
    const current = out.get(key);
    if (key === "items" && isList(value) && isList(current) && current.length && value.length) {
      const a = current[0]!;
      const b = value[0]!;
      if (!isDict(a) || !isDict(b)) throw new PyInternalError("'items' sem objeto não mescla");
      out.set(key, [new Map([...a, ...b])]);
    } else out.set(key, value);
  }
  return out;
}

function containsFluxo(value: PyValue | undefined): boolean {
  if (isStr(value)) return value.includes("{fluxo}");
  if (isList(value)) return value.some(containsFluxo);
  if (isDict(value)) return [...value].some(([k, v]) => k.includes("{fluxo}") || containsFluxo(v));
  return false;
}

export function cardIsPerFlow(card: SpecCard, spec: SpecTemplate): boolean {
  if (card.por_fluxo !== null) return card.por_fluxo && spec.fluxos.size > 0;
  // O Python procura "{fluxo}" no JSON do card: o mesmo que procurar em cada texto e chave.
  return spec.fluxos.size > 0 && containsFluxo(cardToDict(card));
}

export function expandCard(index: number, card: SpecCard, spec: SpecTemplate): Variant[] {
  const flows: (string | null)[] = cardIsPerFlow(card, spec) ? [...spec.fluxos.keys()] : [null];
  const variations = card.variacoes.length ? card.variacoes : [new Map() as PyDict];
  const out: Variant[] = [];
  for (const flow of flows) {
    const note = card.obs instanceof Map ? (flow === null ? null : (card.obs.get(flow) ?? null)) : card.obs;
    for (const variation of variations) {
      let params = merge(card.params, variation);
      if (flow !== null && card.params_por_fluxo.has(flow)) params = merge(params, card.params_por_fluxo.get(flow)!);
      out.push({
        card_index: index,
        flow,
        event: subst(card.evento, flow) as string,
        expected: subst(params, flow) as PyDict,
        note,
      });
    }
  }
  return out;
}

export function expandSpec(spec: SpecTemplate): Variant[] {
  return spec.cards.flatMap((card, index) => expandCard(index, card, spec));
}
