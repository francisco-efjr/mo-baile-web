/**
 * Semântica do Python que o motor do Mo baile usa e que o JavaScript não tem igual.
 *
 * O port é fiel quando o mesmo arquivo dá o mesmo texto nos dois motores. Para
 * isso, os valores lidos do JSON guardam o que o Python guarda:
 *
 * - objeto vira `Map` (ordem de inserção real, mesmo com chave numérica, e sem
 *   risco de `__proto__`);
 * - número com ponto ou expoente vira `PyFloat` (`1.0` continua `1.0`), inteiro
 *   grande vira `bigint`;
 * - `str()` e `repr()` seguem o Python (`None`, `True`, `['a', 1]`, `1e-05`);
 * - `strip()`, `splitlines()` e posições contam como o Python (pontos de
 *   código, não unidades UTF-16).
 *
 * Nada aqui conhece a auditoria: são os tijolos que os outros módulos usam.
 */

export class PyFloat {
  constructor(readonly value: number) {}
}

export type PyDict = Map<string, PyValue>;
export type PyValue = null | boolean | number | bigint | PyFloat | string | PyValue[] | PyDict;

/** Valor JSON comum (o que a interface recebe). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const isDict = (v: unknown): v is PyDict => v instanceof Map;
export const isList = (v: unknown): v is PyValue[] => Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === "string";
/** `int` do Python (bool não conta). */
export const isInt = (v: unknown): v is number | bigint => typeof v === "number" || typeof v === "bigint";

/** Erro que, no Python, sairia como exceção não tratada ("Erro interno no motor."). */
export class PyInternalError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "PyInternalError";
  }
}

// ------------------------------------------------------------ texto e índices

/** Espaços de `str.isspace()` / `str.strip()` do Python. */
export const PY_WHITESPACE =
  "\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　";
const WS_SET = new Set(PY_WHITESPACE);

export function isPySpace(ch: string): boolean {
  return WS_SET.has(ch);
}

export function pyStrip(s: string, chars?: string): string {
  return pyRstrip(pyLstrip(s, chars), chars);
}

export function pyLstrip(s: string, chars?: string): string {
  const set = chars === undefined ? WS_SET : new Set(chars);
  let i = 0;
  while (i < s.length && set.has(s[i]!)) i++;
  return s.slice(i);
}

export function pyRstrip(s: string, chars?: string): string {
  const set = chars === undefined ? WS_SET : new Set(chars);
  let j = s.length;
  while (j > 0 && set.has(s[j - 1]!)) j--;
  return s.slice(0, j);
}

const LINE_BREAKS = new Set(["\n", "\r", "\x0b", "\x0c", "\x1c", "\x1d", "\x1e", "\x85", " ", " "]);

/** `str.splitlines()`: quebra em \n, \r\n, \r e nos separadores Unicode. */
export function pySplitlines(s: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (LINE_BREAKS.has(ch)) {
      out.push(s.slice(start, i));
      i += ch === "\r" && s[i + 1] === "\n" ? 2 : 1;
      start = i;
    } else {
      i++;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

/** Quantidade de pontos de código (o `len()` do Python). */
export function cpLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** Comparação de texto como o Python faz: por ponto de código. */
export function cmpCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x !== y) {
      // Unidades UTF-16 ordenam diferente de pontos de código só entre
      // substitutos e U+E000..U+FFFF: o ajuste clássico corrige.
      if (x >= 0xd800) x = x >= 0xe000 ? x - 0x800 : x + 0x2000;
      if (y >= 0xd800) y = y >= 0xe000 ? y - 0x800 : y + 0x2000;
      return x - y;
    }
  }
  return a.length - b.length;
}

export function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort(cmpCodePoints);
}

/** `html.escape(str(value), quote=True)`. */
export function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ------------------------------------------------------------------- números

/** `repr(float)` do Python: dígitos mínimos, `.0` no inteiro, expoente fora de 1e-4..1e16. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const [mantissa, expText] = Math.abs(x).toExponential().split("e") as [string, string];
  const digits = mantissa.replace(".", "");
  const exp = Number(expText);
  const decpt = exp + 1;
  if (decpt > -4 && decpt <= 16) {
    if (decpt <= 0) return `${sign}0.${"0".repeat(-decpt)}${digits}`;
    if (decpt >= digits.length) return `${sign}${digits}${"0".repeat(decpt - digits.length)}.0`;
    return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  }
  const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
}

/**
 * `f"{x:.Nf}"` do Python: arredondamento correto do valor binário exato,
 * empate para o par, e o sinal do zero negativo (`-0.00`).
 */
export function pyFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const negative = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  if (ax >= 1e21) return (negative ? "-" : "") + ax.toFixed(digits);
  // toFixed(100) é a expansão decimal exata para os valores do relatório.
  const exact = ax.toFixed(100);
  const dot = exact.indexOf(".");
  const intPart = exact.slice(0, dot);
  const frac = exact.slice(dot + 1);
  let kept = intPart + frac.slice(0, digits);
  const rest = frac.slice(digits);
  const first = rest.charCodeAt(0) - 48;
  const tail = rest.slice(1);
  let up = false;
  if (first > 5) up = true;
  else if (first === 5) {
    if (/[1-9]/.test(tail)) up = true;
    else up = (kept.charCodeAt(kept.length - 1) - 48) % 2 === 1;
  }
  if (up) kept = incrementDecimal(kept);
  const intLen = kept.length - digits;
  const text = digits > 0 ? `${kept.slice(0, intLen)}.${kept.slice(intLen)}` : kept;
  return (negative ? "-" : "") + text;
}

function incrementDecimal(digits: string): string {
  const arr = digits.split("");
  let i = arr.length - 1;
  while (i >= 0) {
    if (arr[i] === "9") {
      arr[i] = "0";
      i--;
    } else {
      arr[i] = String.fromCharCode(arr[i]!.charCodeAt(0) + 1);
      return arr.join("");
    }
  }
  return "1" + arr.join("");
}

/** `round(x, n)` do Python para float: arredondamento correto, empate para o par. */
export function pyRound(x: number, digits: number): number {
  return Number(pyFixed(x, digits));
}

// ------------------------------------------------------------ str, repr, tipo

export function pyTypeName(v: PyValue | undefined): string {
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number" || typeof v === "bigint") return "int";
  if (v instanceof PyFloat) return "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list";
  return "dict";
}

const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** `repr(str)` do Python. */
export function strRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === quote || ch === "\\") out += "\\" + ch;
    else if (ch === "\t") out += "\\t";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (cp < 0x20 || cp === 0x7f) out += "\\x" + cp.toString(16).padStart(2, "0");
    else if (cp < 0x7f) out += ch;
    else if (ch !== " " && NON_PRINTABLE.test(ch)) {
      if (cp <= 0xff) out += "\\x" + cp.toString(16).padStart(2, "0");
      else if (cp <= 0xffff) out += "\\u" + cp.toString(16).padStart(4, "0");
      else out += "\\U" + cp.toString(16).padStart(8, "0");
    } else out += ch;
  }
  return out + quote;
}

export function pyRepr(v: PyValue | undefined): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v === 0 ? 0 : v);
  if (typeof v === "bigint") return v.toString();
  if (v instanceof PyFloat) return floatRepr(v.value);
  if (typeof v === "string") return strRepr(v);
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  return "{" + [...v].map(([k, x]) => `${strRepr(k)}: ${pyRepr(x)}`).join(", ") + "}";
}

/** `str(value)` (e o `{value}` de uma f-string). */
export function pyStr(v: PyValue | undefined): string {
  return typeof v === "string" ? v : pyRepr(v);
}

/** Verdade do Python: `None`, `False`, zero, texto/lista/objeto vazios são falsos. */
export function pyTruthy(v: PyValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "bigint") return v !== 0n;
  if (v instanceof PyFloat) return v.value !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v.size > 0;
}

/** `a or b` do Python. */
export function pyOr<T extends PyValue | undefined>(...values: T[]): T {
  for (const v of values.slice(0, -1)) if (pyTruthy(v)) return v;
  return values[values.length - 1]!;
}

function numericValue(v: PyValue): number | bigint | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "bigint") return v;
  if (v instanceof PyFloat) return v.value;
  return null;
}

function numEq(a: number | bigint, b: number | bigint): boolean {
  if (typeof a === typeof b) return a === b;
  const big = (typeof a === "bigint" ? a : b) as bigint;
  const num = (typeof a === "bigint" ? b : a) as number;
  return Number.isInteger(num) && BigInt(num) === big;
}

/** `a == b` do Python para valores vindos de JSON (1 == 1.0 == True). */
export function pyEq(a: PyValue | undefined, b: PyValue | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  const nx = numericValue(x);
  const ny = numericValue(y);
  if (nx !== null || ny !== null) return nx !== null && ny !== null && numEq(nx, ny);
  if (typeof x === "string" || typeof y === "string") return x === y;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    return x.every((item, i) => pyEq(item, y[i]));
  }
  const dx = x as PyDict;
  const dy = y as PyDict;
  if (dx.size !== dy.size) return false;
  for (const [k, v] of dx) if (!dy.has(k) || !pyEq(v, dy.get(k))) return false;
  return true;
}

let nanCounter = 0;

/**
 * Chave de dicionário/conjunto com a igualdade do Python (1, 1.0 e True são a
 * mesma chave). Lista e objeto não têm hash no Python: viram erro interno.
 */
export function pyHashKey(v: PyValue | undefined): string {
  if (v === null || v === undefined) return "N";
  if (typeof v === "string") return "s" + v;
  const n = numericValue(v);
  if (n !== null) {
    if (typeof n === "bigint") return "n" + n.toString();
    if (Number.isNaN(n)) return "nan" + nanCounter++;
    if (Number.isInteger(n)) return "n" + BigInt(n).toString();
    return "n" + floatRepr(n);
  }
  throw new PyInternalError(`unhashable type: '${pyTypeName(v)}'`);
}

export function dictGet(d: PyDict, key: string): PyValue {
  const v = d.get(key);
  return v === undefined ? null : v;
}

// ---------------------------------------------------------------- JSON: load

export class JSONDecodeError extends Error {
  constructor(
    readonly msg: string,
    readonly pos: number,
    readonly lineno: number,
    readonly colno: number,
  ) {
    super(`${msg}: line ${lineno} column ${colno} (char ${pos})`);
    this.name = "JSONDecodeError";
  }
}

const JSON_WS = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

class StopIter {
  constructor(readonly pos: number) {}
}

/** Posição em pontos de código e linha/coluna, como o `JSONDecodeError` do Python. */
function decodeError(msg: string, s: string, pos: number): JSONDecodeError {
  const cpPos = cpLen(s.slice(0, pos));
  let lineno = 1;
  let lastNl = -1;
  for (let i = 0; i < pos; i++) {
    if (s.charCodeAt(i) === 0x0a) {
      lineno++;
      lastNl = i;
    }
  }
  const colno = lastNl < 0 ? cpPos + 1 : cpPos - cpLen(s.slice(0, lastNl));
  return new JSONDecodeError(msg, cpPos, lineno, colno);
}

const STRING_CHUNK = /[^"\\\x00-\x1f]*/y;

/**
 * `json.loads` do Python 3.14 (scanner em C): mesmos valores, mesmas mensagens
 * e mesma posição de erro, que a mensagem de spec inválida mostra.
 */
export function pyJsonLoads(s: string): PyValue {
  if (s.charCodeAt(0) === 0xfeff) throw decodeError("Unexpected UTF-8 BOM (decode using utf-8-sig)", s, 0);
  const len = s.length;
  const end = len - 1;

  const scanString = (start: number): [string, number] => {
    // start = índice depois da aspa inicial
    const begin = start - 1;
    let idx = start;
    let out = "";
    for (;;) {
      STRING_CHUNK.lastIndex = idx;
      STRING_CHUNK.exec(s);
      const next = STRING_CHUNK.lastIndex;
      out += s.slice(idx, next);
      if (next >= len) throw decodeError("Unterminated string starting at", s, begin);
      const c = s[next]!;
      if (c === '"') return [out, next + 1];
      if (c !== "\\") throw decodeError("Invalid control character at", s, next);
      let i = next + 1;
      if (i === len) throw decodeError("Unterminated string starting at", s, begin);
      const esc = s[i]!;
      if (esc !== "u") {
        const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        const ch = map[esc];
        if (ch === undefined) throw decodeError("Invalid \\escape", s, i - 1);
        out += ch;
        idx = i + 1;
        continue;
      }
      i++;
      let stop = i + 4;
      if (stop >= len) throw decodeError("Invalid \\uXXXX escape", s, i - 1);
      const hex = (from: number, errAt: number): number => {
        let v = 0;
        for (let k = from; k < from + 4; k++) {
          const d = parseInt(s[k]!, 16);
          if (!/^[0-9a-fA-F]$/.test(s[k]!)) throw decodeError("Invalid \\uXXXX escape", s, errAt);
          v = (v << 4) | d;
        }
        return v;
      };
      let cp = hex(i, stop - 5);
      i = stop;
      if (cp >= 0xd800 && cp <= 0xdbff && stop + 6 < len && s[i] === "\\" && s[i + 1] === "u") {
        stop += 6;
        const low = hex(i + 2, stop - 5);
        if (low >= 0xdc00 && low <= 0xdfff) {
          cp = 0x10000 + (((cp - 0xd800) << 10) | (low - 0xdc00));
        } else {
          stop -= 6;
        }
      }
      out += cp <= 0xffff ? String.fromCharCode(cp) : String.fromCodePoint(cp);
      idx = stop;
    }
  };

  const matchNumber = (start: number): [PyValue, number] => {
    let idx = start;
    if (s[idx] === "-") {
      idx++;
      if (idx > end) throw new StopIter(start);
    }
    const c = s.charCodeAt(idx);
    if (c >= 0x31 && c <= 0x39) {
      idx++;
      while (idx <= end && isDigit(s.charCodeAt(idx))) idx++;
    } else if (c === 0x30) {
      idx++;
    } else {
      throw new StopIter(start);
    }
    let isFloat = false;
    if (idx < end && s[idx] === "." && isDigit(s.charCodeAt(idx + 1))) {
      isFloat = true;
      idx += 2;
      while (idx <= end && isDigit(s.charCodeAt(idx))) idx++;
    }
    if (idx < end && (s[idx] === "e" || s[idx] === "E")) {
      const eStart = idx;
      idx++;
      if (idx < end && (s[idx] === "-" || s[idx] === "+")) idx++;
      while (idx <= end && isDigit(s.charCodeAt(idx))) idx++;
      if (isDigit(s.charCodeAt(idx - 1))) isFloat = true;
      else idx = eStart;
    }
    const text = s.slice(start, idx);
    if (isFloat) return [new PyFloat(Number(text)), idx];
    if (text.replace("-", "").length <= 15) return [Number(text) || 0, idx];
    const big = BigInt(text);
    return [big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big, idx];
  };

  const skipWs = (idx: number): number => {
    while (idx <= end && JSON_WS(s.charCodeAt(idx))) idx++;
    return idx;
  };

  const scanOnce = (idx: number): [PyValue, number] => {
    if (idx >= len) throw new StopIter(idx);
    const c = s[idx];
    switch (c) {
      case '"':
        return scanString(idx + 1);
      case "{":
        return parseObject(idx + 1);
      case "[":
        return parseArray(idx + 1);
      case "n":
        if (s.startsWith("null", idx)) return [null, idx + 4];
        break;
      case "t":
        if (s.startsWith("true", idx)) return [true, idx + 4];
        break;
      case "f":
        if (s.startsWith("false", idx)) return [false, idx + 5];
        break;
      case "N":
        if (s.startsWith("NaN", idx)) return [new PyFloat(NaN), idx + 3];
        break;
      case "I":
        if (s.startsWith("Infinity", idx)) return [new PyFloat(Infinity), idx + 8];
        break;
      case "-":
        if (s.startsWith("-Infinity", idx)) return [new PyFloat(-Infinity), idx + 9];
        break;
    }
    return matchNumber(idx);
  };

  const parseObject = (start: number): [PyDict, number] => {
    const out: PyDict = new Map();
    let idx = skipWs(start);
    if (idx > end || s[idx] !== "}") {
      for (;;) {
        if (idx > end || s[idx] !== '"') throw decodeError("Expecting property name enclosed in double quotes", s, idx);
        const [key, afterKey] = scanString(idx + 1);
        idx = skipWs(afterKey);
        if (idx > end || s[idx] !== ":") throw decodeError("Expecting ':' delimiter", s, idx);
        idx = skipWs(idx + 1);
        const [value, afterValue] = scanOnce(idx);
        out.set(key, value);
        idx = skipWs(afterValue);
        if (idx <= end && s[idx] === "}") break;
        if (idx > end || s[idx] !== ",") throw decodeError("Expecting ',' delimiter", s, idx);
        const comma = idx;
        idx = skipWs(idx + 1);
        if (idx <= end && s[idx] === "}") throw decodeError("Illegal trailing comma before end of object", s, comma);
      }
    }
    return [out, idx + 1];
  };

  const parseArray = (start: number): [PyValue[], number] => {
    const out: PyValue[] = [];
    let idx = skipWs(start);
    if (idx > end || s[idx] !== "]") {
      for (;;) {
        const [value, afterValue] = scanOnce(idx);
        out.push(value);
        idx = skipWs(afterValue);
        if (idx <= end && s[idx] === "]") break;
        if (idx > end || s[idx] !== ",") throw decodeError("Expecting ',' delimiter", s, idx);
        const comma = idx;
        idx = skipWs(idx + 1);
        if (idx <= end && s[idx] === "]") throw decodeError("Illegal trailing comma before end of array", s, comma);
      }
    }
    return [out, idx + 1];
  };

  try {
    const [value, after] = scanOnce(skipWs(0));
    const tail = skipWs(after);
    if (tail !== len) throw decodeError("Extra data", s, tail);
    return value;
  } catch (err) {
    if (err instanceof StopIter) throw decodeError("Expecting value", s, err.pos);
    if (err instanceof RangeError) throw new PyInternalError("JSON aninhado demais");
    throw err;
  }
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

// ---------------------------------------------------------------- JSON: dump

function jsonString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const c = s.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

function jsonFloat(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (x === Infinity) return "Infinity";
  if (x === -Infinity) return "-Infinity";
  return floatRepr(x);
}

export interface DumpOptions {
  indent?: number;
  sortKeys?: boolean;
}

/** `json.dumps(value, ensure_ascii=False, ...)` do Python. */
export function pyJsonDumps(value: PyValue | undefined, options: DumpOptions = {}): string {
  const { indent, sortKeys = false } = options;
  const itemSep = indent === undefined ? ", " : ",";
  const render = (v: PyValue | undefined, level: number): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v === 0 ? 0 : v);
    if (typeof v === "bigint") return v.toString();
    if (v instanceof PyFloat) return jsonFloat(v.value);
    if (typeof v === "string") return jsonString(v);
    const open = indent === undefined ? "" : "\n" + " ".repeat(indent * (level + 1));
    const close = indent === undefined ? "" : "\n" + " ".repeat(indent * level);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return "[" + open + v.map((x) => render(x, level + 1)).join(itemSep + open) + close + "]";
    }
    if (!v.size) return "{}";
    let keys = [...v.keys()];
    if (sortKeys) keys = keys.sort(cmpCodePoints);
    const parts = keys.map((k) => jsonString(k) + ": " + render(v.get(k), level + 1));
    return "{" + open + parts.join(itemSep + open) + close + "}";
  };
  return render(value, 0);
}

// ------------------------------------------------------ conversão de fronteira

function setOwn(obj: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Valor do Python para JSON comum, que a interface usa. Float vira número; inteiro grande, número aproximado. */
export function toJs(v: PyValue | undefined): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof PyFloat) return v.value;
  if (Array.isArray(v)) return v.map(toJs);
  const out: Record<string, Json> = {};
  for (const [k, x] of v) setOwn(out, k, toJs(x));
  return out;
}

/** JSON comum (de volta da interface) para valor do Python. Número com fração vira float. */
export function fromJs(v: unknown): PyValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? v : new PyFloat(v);
  if (typeof v === "bigint") return v;
  if (v instanceof PyFloat) return v;
  if (Array.isArray(v)) return v.map(fromJs);
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [String(k), fromJs(x)]));
  const out: PyDict = new Map();
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out.set(k, fromJs(x));
  return out;
}
