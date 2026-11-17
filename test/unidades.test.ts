// Paridade das peças: cada resposta esperada aqui saiu do Python 3.14 do Mo
// baile (tools/golden/gerar.py), não deste motor. Float, JSON com posição de
// erro, str() de valores, regex do `re`, textwrap, strip e splitlines.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeFileStem } from "../src/engine/names";
import {
  floatRepr,
  JSONDecodeError,
  PyFloat,
  pyFixed,
  pyJsonDumps,
  pyJsonLoads,
  pyRound,
  pySplitlines,
  pyStr,
  pyStrip,
  type PyValue,
} from "../src/engine/py";
import { pyCompile } from "../src/engine/pyre";
import { wrap } from "../src/engine/textwrap";

type Golden = Record<string, unknown[][]>;
const golden = JSON.parse(readFileSync(new URL("./golden/_unidades.json", import.meta.url), "utf8")) as Golden;

const num = (v: PyValue): number => (v instanceof PyFloat ? v.value : Number(v));

describe("números como o Python", () => {
  it.each(golden.float_repr!)("repr(%s)", (input, expected) => {
    expect(pyStr(pyJsonLoads(input as string))).toBe(expected);
  });
  it.each(golden.fixed!)("format(%s, .%if)", (input, digits, expected) => {
    expect(pyFixed(num(pyJsonLoads(input as string)), digits as number)).toBe(expected);
  });
  it.each(golden.round1!)("round(%s, 1)", (input, expected) => {
    expect(floatRepr(pyRound(num(pyJsonLoads(input as string)), 1))).toBe(expected);
  });
});

describe("json.loads e json.dumps", () => {
  it.each(golden.json!)("%j", (input, expected) => {
    const exp = expected as Record<string, unknown>;
    if ("msg" in exp) {
      let err: unknown;
      try {
        pyJsonLoads(input as string);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(JSONDecodeError);
      const e = err as JSONDecodeError;
      expect({ msg: e.msg, pos: e.pos, lineno: e.lineno, colno: e.colno }).toEqual(exp);
      return;
    }
    const value = pyJsonLoads(input as string);
    expect(pyJsonDumps(value)).toBe(exp.ok);
    expect(pyJsonDumps(value, { indent: 2 })).toBe(exp.indent);
    expect(pyJsonDumps(value, { sortKeys: true })).toBe(exp.sorted);
  });
  it.each(golden.str!)("str(%s)", (input, expected) => {
    expect(pyStr(pyJsonLoads(input as string))).toBe(expected);
  });
});

describe("re do Python", () => {
  it.each(golden.regex!)("/%s/ em %j", (pattern, text, expected) => {
    const exp = expected as { erro?: string; full?: boolean; search?: (string | null)[] | null };
    if (exp.erro !== undefined) {
      expect(() => pyCompile(pattern as string)).toThrow(exp.erro);
      try {
        pyCompile(pattern as string);
      } catch (e) {
        expect((e as Error).message).toBe(exp.erro);
      }
      return;
    }
    const re = pyCompile(pattern as string);
    expect(re.fullmatch(text as string) !== null).toBe(exp.full);
    const m = re.search(text as string);
    expect(m === null ? null : Array.from({ length: re.groups + 1 }, (_, i) => m.group(i))).toEqual(exp.search);
  });
  it.each(golden.search!)("search /%s/", (pattern, text, expected) => {
    const re = pyCompile(pattern as string);
    const m = re.search(text as string);
    expect(m === null ? null : Array.from({ length: re.groups + 1 }, (_, i) => m.group(i))).toEqual(expected);
  });
});

describe("texto", () => {
  it.each(golden.textwrap!)("textwrap.wrap(%j)", (input, expected) => {
    expect(wrap(input as string, 78, "//   ")).toEqual(expected);
  });
  it.each(golden.strip!)("strip(%j)", (input, expected) => {
    expect(pyStrip(input as string)).toBe(expected);
  });
  it.each(golden.splitlines!)("splitlines(%j)", (input, expected) => {
    expect(pySplitlines(input as string)).toEqual(expected);
  });
  it.each(golden.safe_file_stem!)("safe_file_stem(%j)", (input, expected) => {
    expect(safeFileStem(input as string, "spec")).toBe(expected);
  });
});
