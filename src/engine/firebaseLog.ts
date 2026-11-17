/**
 * Leitura do log de Firebase Analytics: port de `services/report/firebase_log.py`.
 *
 * Formatos aceitos: a lista que o Mo baile exporta (`log_obtido.json`), objeto
 * com `eventos` ou `jornadas`, e Logcat em texto (uma linha `Logging event:`
 * por evento). Logs mistos são filtrados pela plataforma; no Android os
 * parâmetros são relidos do `raw_log`; disparos repetidos (mesmo horário, nome
 * e parâmetros) contam uma vez; a ordem final é a do horário.
 */

import {
  cmpCodePoints,
  dictGet,
  isDict,
  isList,
  isStr,
  JSONDecodeError,
  pyHashKey,
  pyJsonDumps,
  pyJsonLoads,
  pyOr,
  pySplitlines,
  pyStr,
  pyStrip,
  pyTruthy,
  type PyDict,
  type PyValue,
} from "./py";
import { pyCompile } from "./pyre";
import { cleanColonSpacing, stripEventSuffixes, stripParamKeySuffixes } from "./rules";
import type { LogStats, TagEvent } from "./spec";

const ANDROID_LINE = pyCompile(String.raw`Logging event:\s*origin=([^,]+),name=([^,]+),params=(Bundle\[.*\])\s*$`);
const LOGCAT_TIME = pyCompile(String.raw`^(?:\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2}\.\d{3})`);
const LOG_DATE = pyCompile(String.raw`^(?:(\d{4})-)?(\d{2}-\d{2})\s`);
const IOS_BLOCK = pyCompile(String.raw`\{([^{}]*)\}`);
const IOS_PAIR = pyCompile(String.raw`([\w]+)\s*=\s*([^;]*);`);

/** Divide por vírgulas que não estão dentro de [] ou {}. */
function splitTopLevel(text: string): string[] {
  let parts: string[];
  if (!/[[\]{}]/.test(text)) parts = text.split(",");
  else {
    parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
  }
  if (!pyStrip(parts[parts.length - 1]!)) parts.pop();
  return parts;
}

/** `Bundle[{k=v, items=[Bundle[{...}]]}]` em objeto, com as chaves sem o sufixo do SDK. */
export function parseBundle(text: string): PyDict {
  let body = pyStrip(text);
  if (body.startsWith("Bundle[{") && body.endsWith("}]")) body = body.slice(8, -2);
  const out: PyDict = new Map();
  for (const part of splitTopLevel(body)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = stripParamKeySuffixes(pyStrip(part.slice(0, eq)));
    const value = pyStrip(part.slice(eq + 1));
    if (value.startsWith("[Bundle[") && value.endsWith("]")) out.set(key, splitTopLevel(value.slice(1, -1)).map(parseBundle));
    else out.set(key, cleanColonSpacing(value));
  }
  return out;
}

/** `[ { item_id = x; price = 1; }, {...} ]` do iOS em lista de objetos. */
export function parseIosItems(text: string): PyDict[] {
  const out: PyDict[] = [];
  for (const block of IOS_BLOCK.findall(text) as string[]) {
    const item: PyDict = new Map();
    for (const pair of IOS_PAIR.findall(block) as string[][]) {
      item.set(pyStrip(pair[0]!), pyStrip(pyStrip(pair[1]!), '"'));
    }
    if (item.size) out.push(item);
  }
  return out;
}

/** Tag `FA-SVC` é Android; `FirebaseAnalytics` é iOS; senão, o campo `platform`. */
export function detectPlatform(item: PyDict): string {
  const raw = pyStr(pyOr(dictGet(item, "raw_log"), ""));
  const tag = pyStr(pyOr(dictGet(item, "tag"), ""));
  if (raw.includes("FA-SVC") || tag.includes("FA-SVC")) return "android";
  if (raw.includes("FirebaseAnalytics") || tag.toLowerCase().startsWith("ios")) return "ios";
  return pyStr(pyOr(dictGet(item, "platform"), "unknown")).toLowerCase();
}

function fromAndroidRaw(raw: string): [string, string, PyDict] | null {
  const m = ANDROID_LINE.search(pyStrip(raw));
  if (!m) return null;
  return [pyStrip(m.group(1)!), stripEventSuffixes(pyStrip(m.group(2)!)), parseBundle(m.group(3)!)];
}

/** Eventos crus de qualquer um dos formatos JSON aceitos. */
export function itemsFromJson(data: PyValue): PyDict[] {
  if (isList(data)) return data.filter(isDict);
  if (isDict(data)) {
    const eventos = dictGet(data, "eventos");
    if (isList(eventos)) return eventos.filter(isDict);
    const jornadas = dictGet(data, "jornadas");
    if (isDict(jornadas)) {
      const out: PyDict[] = [];
      for (const jornada of jornadas.values()) {
        const lista = isDict(jornada) ? dictGet(jornada, "eventos") : jornada;
        if (isList(lista)) out.push(...lista.filter(isDict));
      }
      return out;
    }
    return [data];
  }
  return [];
}

export interface ItemsRead {
  format: "json" | "logcat";
  items: PyDict[];
}

/** JSON quando é JSON; senão Logcat em texto, uma linha `Logging event:` por evento. */
export function itemsFromText(content: string): ItemsRead {
  let data: PyValue;
  try {
    data = pyJsonLoads(content);
  } catch (err) {
    if (!(err instanceof JSONDecodeError)) throw err;
    const items = pySplitlines(content)
      .filter((line) => line.includes("Logging event:"))
      .map((line) => new Map<string, PyValue>([["raw_log", line], ["tag", "FA-SVC"]]));
    return { format: "logcat", items };
  }
  return { format: "json", items: itemsFromJson(data) };
}

/** Normaliza os eventos da plataforma pedida, em ordem de horário, com as estatísticas da leitura. */
export function eventsFromItems(items: PyDict[], platformIn: string, dedupe = true): [TagEvent[], LogStats] {
  const platform = platformIn.toLowerCase();
  const stats: LogStats = { total_lidos: items.length, da_plataforma: 0, duplicados: 0, uteis: 0 };
  const seen = new Set<string>();
  const events: TagEvent[] = [];
  const order: string[] = [];
  items.forEach((item, index) => {
    if (detectPlatform(item) !== platform) return;
    stats.da_plataforma++;
    const raw = pyStr(pyOr(dictGet(item, "raw_log"), ""));
    const parsed = platform === "android" ? fromAndroidRaw(raw) : null;
    let origin: string;
    let name: string;
    let params: PyDict;
    if (parsed) [origin, name, params] = parsed;
    else {
      name = stripEventSuffixes(pyStrip(pyStr(pyOr(dictGet(item, "event_name"), dictGet(item, "event"), ""))));
      const rawParams = dictGet(item, "params");
      params = new Map();
      if (isDict(rawParams)) {
        for (const [k, v] of rawParams) params.set(stripParamKeySuffixes(k), isStr(v) ? cleanColonSpacing(v) : v);
      }
      origin = pyStr(pyOr(dictGet(params, "ga_event_origin"), ""));
      const items_ = params.get("items");
      if (isStr(items_) && items_.includes("=")) params.set("items", parseIosItems(items_));
    }
    if (!name) return;
    let timeStr: PyValue = pyOr(dictGet(item, "time_str"), dictGet(item, "time"));
    if (!pyTruthy(timeStr)) {
      const found = LOGCAT_TIME.match(raw);
      timeStr = found ? found.group(1) : null;
    }
    if (dedupe) {
      const key = `${pyHashKey(timeStr)}\u0000${name}\u0000${pyJsonDumps(params, { sortKeys: true })}`;
      if (seen.has(key)) {
        stats.duplicados++;
        return;
      }
      seen.add(key);
    }
    const date = LOG_DATE.match(raw);
    order.push(`${date ? date.group(2) : ""} ${pyStr(pyOr(timeStr, ""))}`);
    events.push({
      id: item.has("id") ? dictGet(item, "id") : index,
      event_name: name,
      params,
      platform,
      raw_log: raw || null,
      time_str: pyTruthy(timeStr) ? pyStr(timeStr) : null,
      origin: origin || null,
    });
  });
  // `sort` é estável: empate de horário fica na ordem do arquivo.
  const sorted = events.map((_, i) => i).sort((a, b) => cmpCodePoints(order[a]!, order[b]!));
  const out = sorted.map((i) => events[i]!);
  stats.uteis = out.length;
  return [out, stats];
}
