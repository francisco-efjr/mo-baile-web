/**
 * Expressões regulares com a sintaxe e a semântica do `re` do Python 3.14.
 *
 * A spec aceita `re:<regex>` escrita para o Python, e as regras do motor usam
 * `\d`, `\s`, `\w`, `.` e `$` com o sentido do Python (Unicode, `.` só não
 * casa `\n`, `$` casa antes de um `\n` final). O JavaScript diverge em todos
 * esses pontos, então a expressão é lida aqui com o mesmo analisador do Python
 * (`re/_parser.py`: mesmas mensagens e posições de erro) e reescrita em
 * JavaScript com a flag `u`, sem depender do sentido de `\d`, `.` ou `$` do JS.
 *
 * Fora do alcance (erro de spec com aviso, documentado em docs/PARIDADE.md):
 * grupo condicional `(?(1)a|b)` e `\N{nome}`. Grupo atômico e quantificador
 * possessivo são emulados.
 */

import { PyInternalError, PY_WHITESPACE } from "./py";

export const IGNORECASE = 2;
export const LOCALE = 4;
export const MULTILINE = 8;
export const DOTALL = 16;
export const UNICODE = 32;
export const VERBOSE = 64;
export const ASCII = 256;

const FLAG_CHARS: Record<string, number> = { i: IGNORECASE, L: LOCALE, m: MULTILINE, s: DOTALL, x: VERBOSE, a: ASCII, u: UNICODE };
const TYPE_FLAGS = ASCII | LOCALE | UNICODE;
const MAXREPEAT = 4294967295;
const MAXGROUPS = 1073741823;
const MAXWIDTH = 2 ** 64;

const SPECIAL_CHARS = ".\\[{()*+?^$|";
const REPEAT_CHARS = "*+?{";
const DIGITS = "0123456789";
const OCTDIGITS = "01234567";
const HEXDIGITS = "0123456789abcdefABCDEF";
const WHITESPACE = " \t\n\r\v\f";
const ASCIILETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** `re.error` do Python: a mensagem já sai como `str(exc)`. */
export class PyReError extends Error {
  constructor(
    readonly msg: string,
    pattern?: string[],
    pos?: number,
  ) {
    let text = msg;
    if (pattern !== undefined && pos !== undefined) {
      text = `${msg} at position ${pos}`;
      if (pattern.includes("\n")) {
        let lineno = 1;
        let last = -1;
        for (let i = 0; i < pos && i < pattern.length; i++) {
          if (pattern[i] === "\n") {
            lineno++;
            last = i;
          }
        }
        text = `${text} (line ${lineno}, column ${pos - last})`;
      }
    }
    super(text);
    this.name = "PyReError";
  }
}

// --------------------------------------------------------------------- AST

type Cat = "d" | "D" | "s" | "S" | "w" | "W";
type SetItem = { t: "lit"; cp: number } | { t: "range"; lo: number; hi: number } | { t: "cat"; cat: Cat };
type At = "beginning" | "end" | "begstr" | "endstr" | "boundary" | "nonboundary";

type Node =
  | { op: "lit"; cp: number }
  | { op: "notlit"; cp: number }
  | { op: "any" }
  | { op: "in"; items: SetItem[]; neg: boolean }
  | { op: "at"; at: At }
  | { op: "sub"; group: number | null; add: number; del: number; body: Seq }
  | { op: "atomic"; body: Seq }
  | { op: "assert"; dir: 1 | -1; neg: boolean; body: Seq }
  | { op: "failure" }
  | { op: "ref"; group: number }
  | { op: "rep"; min: number; max: number; kind: "max" | "min" | "poss"; item: Seq }
  | { op: "branch"; branches: Seq[] }
  | { op: "cond"; group: number; yes: Seq; no: Seq | null };
type Seq = Node[];

const CATEGORIES: Record<string, Node> = {
  "\\A": { op: "at", at: "begstr" },
  "\\b": { op: "at", at: "boundary" },
  "\\B": { op: "at", at: "nonboundary" },
  "\\d": { op: "in", items: [{ t: "cat", cat: "d" }], neg: false },
  "\\D": { op: "in", items: [{ t: "cat", cat: "D" }], neg: false },
  "\\s": { op: "in", items: [{ t: "cat", cat: "s" }], neg: false },
  "\\S": { op: "in", items: [{ t: "cat", cat: "S" }], neg: false },
  "\\w": { op: "in", items: [{ t: "cat", cat: "w" }], neg: false },
  "\\W": { op: "in", items: [{ t: "cat", cat: "W" }], neg: false },
  "\\z": { op: "at", at: "endstr" },
  "\\Z": { op: "at", at: "endstr" },
};
const ESCAPES: Record<string, number> = {
  "\\a": 7,
  "\\b": 8,
  "\\f": 12,
  "\\n": 10,
  "\\r": 13,
  "\\t": 9,
  "\\v": 11,
  "\\\\": 92,
};

class Tokenizer {
  index = 0;
  next: string | null = null;
  constructor(readonly chars: string[]) {
    this.advance();
  }
  private advance(): void {
    let index = this.index;
    const ch = this.chars[index];
    if (ch === undefined) {
      this.next = null;
      return;
    }
    let token = ch;
    if (ch === "\\") {
      index++;
      const following = this.chars[index];
      if (following === undefined) throw new PyReError("bad escape (end of pattern)", this.chars, this.chars.length - 1);
      token += following;
    }
    this.index = index + 1;
    this.next = token;
  }
  match(ch: string): boolean {
    if (ch === this.next) {
      this.advance();
      return true;
    }
    return false;
  }
  get(): string | null {
    const t = this.next;
    this.advance();
    return t;
  }
  getwhile(n: number, charset: string): string {
    let out = "";
    for (let i = 0; i < n; i++) {
      const c = this.next;
      if (c === null || c.length !== 1 || !charset.includes(c)) break;
      out += c;
      this.advance();
    }
    return out;
  }
  getuntil(terminator: string, name: string): string {
    let out = "";
    for (;;) {
      const c = this.next;
      this.advance();
      if (c === null) {
        if (!out) throw this.error("missing " + name);
        throw this.error(`missing ${terminator}, unterminated name`, [...out].length);
      }
      if (c === terminator) {
        if (!out) throw this.error("missing " + name, 1);
        break;
      }
      out += c;
    }
    return out;
  }
  tell(): number {
    return this.index - (this.next === null ? 0 : [...this.next].length);
  }
  seek(index: number): void {
    this.index = index;
    this.advance();
  }
  error(msg: string, offset = 0): PyReError {
    return new PyReError(msg, this.chars, this.tell() - offset);
  }
  checkgroupname(name: string, offset: number): void {
    if (!isIdentifier(name)) throw this.error(`bad character in group name ${reprStr(name)}`, [...name].length + offset);
  }
}

function isIdentifier(name: string): boolean {
  return /^[\p{XID_Start}_]\p{XID_Continue}*$/u.test(name);
}

const isFlag = (c: string): boolean => Object.prototype.hasOwnProperty.call(FLAG_CHARS, c);

function reprStr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  return quote + s.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), "\\" + quote) + quote;
}

class State {
  flags = 0;
  groupdict = new Map<string, number>();
  groupwidths: ([number, number] | null)[] = [null];
  lookbehindgroups: number | null = null;
  grouprefpos = new Map<number, number>();
  get groups(): number {
    return this.groupwidths.length;
  }
  opengroup(name: string | null): number {
    const gid = this.groups;
    this.groupwidths.push(null);
    if (this.groups > MAXGROUPS) throw new PyReError("too many groups");
    if (name !== null) {
      const ogid = this.groupdict.get(name);
      if (ogid !== undefined)
        throw new PyReError(`redefinition of group name ${reprStr(name)} as group ${gid}; was group ${ogid}`);
      this.groupdict.set(name, gid);
    }
    return gid;
  }
  closegroup(gid: number, p: Seq): void {
    this.groupwidths[gid] = width(p, this);
  }
  checkgroup(gid: number): boolean {
    return gid < this.groups && this.groupwidths[gid] !== null;
  }
  checklookbehindgroup(gid: number, source: Tokenizer): void {
    if (this.lookbehindgroups !== null) {
      if (!this.checkgroup(gid)) throw source.error("cannot refer to an open group");
      if (gid >= this.lookbehindgroups) throw source.error("cannot refer to group defined in the same lookbehind subpattern");
    }
  }
}

function width(seq: Seq, state: State): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const node of seq) {
    switch (node.op) {
      case "branch": {
        let i = MAXWIDTH;
        let j = 0;
        for (const b of node.branches) {
          const [l, h] = width(b, state);
          i = Math.min(i, l);
          j = Math.max(j, h);
        }
        lo += i;
        hi += j;
        break;
      }
      case "atomic":
      case "sub": {
        const [i, j] = width(node.body, state);
        lo += i;
        hi += j;
        break;
      }
      case "rep": {
        const [i, j] = width(node.item, state);
        lo += i * node.min;
        if (node.max === MAXREPEAT && j) hi = MAXWIDTH;
        else hi += j * node.max;
        break;
      }
      case "lit":
      case "notlit":
      case "any":
      case "in":
        lo += 1;
        hi += 1;
        break;
      case "ref": {
        const w = state.groupwidths[node.group] ?? [0, 0];
        lo += w[0];
        hi += w[1];
        break;
      }
      case "cond": {
        let [i, j] = width(node.yes, state);
        if (node.no !== null) {
          const [l, h] = width(node.no, state);
          i = Math.min(i, l);
          j = Math.max(j, h);
        } else i = 0;
        lo += i;
        hi += j;
        break;
      }
      default:
        break;
    }
  }
  return [Math.min(lo, MAXWIDTH), Math.min(hi, MAXWIDTH)];
}

function cp(ch: string): number {
  return ch.codePointAt(0)!;
}

function classEscape(source: Tokenizer, escape: string): SetItem {
  const code = ESCAPES[escape];
  if (code !== undefined) return { t: "lit", cp: code };
  const cat = CATEGORIES[escape];
  if (cat && cat.op === "in") return cat.items[0]!;
  const c = escape.slice(1, 2);
  if (c === "x") {
    escape += source.getwhile(2, HEXDIGITS);
    if (escape.length !== 4) throw source.error(`incomplete escape ${escape}`, escape.length);
    return { t: "lit", cp: parseInt(escape.slice(2), 16) };
  }
  if (c === "u") {
    escape += source.getwhile(4, HEXDIGITS);
    if (escape.length !== 6) throw source.error(`incomplete escape ${escape}`, escape.length);
    return { t: "lit", cp: parseInt(escape.slice(2), 16) };
  }
  if (c === "U") {
    escape += source.getwhile(8, HEXDIGITS);
    if (escape.length !== 10) throw source.error(`incomplete escape ${escape}`, escape.length);
    const value = parseInt(escape.slice(2), 16);
    if (value > 0x10ffff) throw source.error(`bad escape ${escape}`, escape.length);
    return { t: "lit", cp: value };
  }
  if (c === "N") throw new PyReError("\\N{...} não é suportado no navegador");
  if (OCTDIGITS.includes(c)) {
    escape += source.getwhile(2, OCTDIGITS);
    const value = parseInt(escape.slice(1), 8);
    if (value > 0o377) throw source.error(`octal escape value ${escape} outside of range 0-0o377`, escape.length);
    return { t: "lit", cp: value };
  }
  if (DIGITS.includes(c)) throw source.error(`bad escape ${escape}`, [...escape].length);
  if ([...escape].length === 2) {
    if (ASCIILETTERS.includes(c)) throw source.error(`bad escape ${escape}`, 2);
    return { t: "lit", cp: cp([...escape][1]!) };
  }
  throw source.error(`bad escape ${escape}`, [...escape].length);
}

function escapeNode(source: Tokenizer, escape: string, state: State): Node {
  const cat = CATEGORIES[escape];
  if (cat) return cat;
  const code = ESCAPES[escape];
  if (code !== undefined) return { op: "lit", cp: code };
  const c = escape.slice(1, 2);
  if (c === "x") {
    escape += source.getwhile(2, HEXDIGITS);
    if (escape.length !== 4) throw source.error(`incomplete escape ${escape}`, escape.length);
    return { op: "lit", cp: parseInt(escape.slice(2), 16) };
  }
  if (c === "u") {
    escape += source.getwhile(4, HEXDIGITS);
    if (escape.length !== 6) throw source.error(`incomplete escape ${escape}`, escape.length);
    return { op: "lit", cp: parseInt(escape.slice(2), 16) };
  }
  if (c === "U") {
    escape += source.getwhile(8, HEXDIGITS);
    if (escape.length !== 10) throw source.error(`incomplete escape ${escape}`, escape.length);
    const value = parseInt(escape.slice(2), 16);
    if (value > 0x10ffff) throw source.error(`bad escape ${escape}`, escape.length);
    return { op: "lit", cp: value };
  }
  if (c === "N") throw new PyReError("\\N{...} não é suportado no navegador");
  if (c === "0") {
    escape += source.getwhile(2, OCTDIGITS);
    return { op: "lit", cp: parseInt(escape.slice(1), 8) };
  }
  if (DIGITS.includes(c)) {
    if (source.next !== null && source.next.length === 1 && DIGITS.includes(source.next)) {
      escape += source.get();
      if (
        OCTDIGITS.includes(escape[1]!) &&
        OCTDIGITS.includes(escape[2]!) &&
        source.next !== null &&
        source.next.length === 1 &&
        OCTDIGITS.includes(source.next)
      ) {
        escape += source.get();
        const value = parseInt(escape.slice(1), 8);
        if (value > 0o377) throw source.error(`octal escape value ${escape} outside of range 0-0o377`, escape.length);
        return { op: "lit", cp: value };
      }
    }
    const group = parseInt(escape.slice(1), 10);
    if (group < state.groups) {
      if (!state.checkgroup(group)) throw source.error("cannot refer to an open group", escape.length);
      state.checklookbehindgroup(group, source);
      return { op: "ref", group };
    }
    throw source.error(`invalid group reference ${group}`, escape.length - 1);
  }
  if ([...escape].length === 2) {
    if (ASCIILETTERS.includes(c)) throw source.error(`bad escape ${escape}`, 2);
    return { op: "lit", cp: cp([...escape][1]!) };
  }
  throw source.error(`bad escape ${escape}`, [...escape].length);
}

function parseSub(source: Tokenizer, state: State, verbose: boolean, nested: number): Seq {
  const items: Seq[] = [];
  for (;;) {
    items.push(parse(source, state, verbose, nested + 1, !nested && !items.length));
    if (!source.match("|")) break;
    if (!nested) verbose = (state.flags & VERBOSE) !== 0;
  }
  if (items.length === 1) return items[0]!;
  return [{ op: "branch", branches: items }];
}

function parseFlags(source: Tokenizer, state: State, char: string): [number, number] | null {
  let add = 0;
  let del = 0;
  let c: string | null = char;
  if (c !== "-") {
    for (;;) {
      const flag = FLAG_CHARS[c!]!;
      if (c === "L") throw source.error("bad inline flags: cannot use 'L' flag with a str pattern");
      add |= flag;
      if (flag & TYPE_FLAGS && (add & TYPE_FLAGS) !== flag)
        throw source.error("bad inline flags: flags 'a', 'u' and 'L' are incompatible");
      c = source.get();
      if (c === null) throw source.error("missing -, : or )");
      if (")-:".includes(c)) break;
      if (!isFlag(c)) throw source.error(/^\p{L}$/u.test(c) ? "unknown flag" : "missing -, : or )", [...c].length);
    }
  }
  if (c === ")") {
    state.flags |= add;
    return null;
  }
  if (c === "-") {
    c = source.get();
    if (c === null) throw source.error("missing flag");
    if (!isFlag(c)) throw source.error(/^\p{L}$/u.test(c) ? "unknown flag" : "missing flag", [...c].length);
    for (;;) {
      const flag = FLAG_CHARS[c!]!;
      if (flag & TYPE_FLAGS) throw source.error("bad inline flags: cannot turn off flags 'a', 'u' and 'L'");
      del |= flag;
      c = source.get();
      if (c === null) throw source.error("missing :");
      if (c === ":") break;
      if (!isFlag(c)) throw source.error(/^\p{L}$/u.test(c) ? "unknown flag" : "missing :", [...c].length);
    }
  }
  if (add & del) throw source.error("bad inline flags: flag turned on and off", 1);
  return [add, del];
}

function parse(source: Tokenizer, state: State, verbose: boolean, nested: number, first = false): Seq {
  const sub: Seq = [];
  for (;;) {
    let ch = source.next;
    if (ch === null) break;
    if (ch === "|" || ch === ")") break;
    source.get();
    if (verbose) {
      if (WHITESPACE.includes(ch) && ch.length === 1) continue;
      if (ch === "#") {
        for (;;) {
          ch = source.get();
          if (ch === null || ch === "\n") break;
        }
        continue;
      }
    }
    const this_ = ch;
    if (this_[0] === "\\" && this_.length > 1) {
      sub.push(escapeNode(source, this_, state));
    } else if (!SPECIAL_CHARS.includes(this_)) {
      sub.push({ op: "lit", cp: cp(this_) });
    } else if (this_ === "[") {
      const here = source.tell() - 1;
      const set: SetItem[] = [];
      const negate = source.match("^");
      for (;;) {
        let t = source.get();
        if (t === null) throw source.error("unterminated character set", source.tell() - here);
        if (t === "]" && set.length) break;
        let code1: SetItem;
        if (t[0] === "\\" && t.length > 1) code1 = classEscape(source, t);
        else code1 = { t: "lit", cp: cp(t) };
        if (source.match("-")) {
          const that = source.get();
          if (that === null) throw source.error("unterminated character set", source.tell() - here);
          if (that === "]") {
            set.push(code1);
            set.push({ t: "lit", cp: 45 });
            break;
          }
          let code2: SetItem;
          if (that[0] === "\\" && that.length > 1) code2 = classEscape(source, that);
          else code2 = { t: "lit", cp: cp(that) };
          const span = [...t].length + 1 + [...that].length;
          if (code1.t !== "lit" || code2.t !== "lit") throw source.error(`bad character range ${t}-${that}`, span);
          if (code2.cp < code1.cp) throw source.error(`bad character range ${t}-${that}`, span);
          set.push({ t: "range", lo: code1.cp, hi: code2.cp });
        } else {
          set.push(code1);
        }
        t = null;
      }
      const only = set[0]!;
      if (set.length === 1 && only.t === "lit") sub.push(negate ? { op: "notlit", cp: only.cp } : { op: "lit", cp: only.cp });
      else sub.push({ op: "in", items: set, neg: negate });
    } else if (REPEAT_CHARS.includes(this_)) {
      const here = source.tell();
      let min = 0;
      let max = MAXREPEAT;
      if (this_ === "?") max = 1;
      else if (this_ === "+") min = 1;
      else if (this_ === "{") {
        if (source.next === "}") {
          sub.push({ op: "lit", cp: cp(this_) });
          continue;
        }
        let lo = "";
        let hi = "";
        while (source.next !== null && source.next.length === 1 && DIGITS.includes(source.next)) lo += source.get();
        if (source.match(",")) {
          while (source.next !== null && source.next.length === 1 && DIGITS.includes(source.next)) hi += source.get();
        } else hi = lo;
        if (!source.match("}")) {
          sub.push({ op: "lit", cp: cp(this_) });
          source.seek(here);
          continue;
        }
        if (lo) {
          min = Number(lo);
          if (min >= MAXREPEAT) throw new PyInternalError("the repetition number is too large");
        }
        if (hi) {
          max = Number(hi);
          if (max >= MAXREPEAT) throw new PyInternalError("the repetition number is too large");
          if (max < min) throw source.error("min repeat greater than max repeat", source.tell() - here);
        }
      }
      const last = sub[sub.length - 1];
      if (!last || last.op === "at") throw source.error("nothing to repeat", source.tell() - here + 1);
      if (last.op === "rep") throw source.error("multiple repeat", source.tell() - here + 1);
      let item: Seq = [last];
      if (last.op === "sub" && last.group === null && !last.add && !last.del) item = last.body;
      let kind: "max" | "min" | "poss" = "max";
      if (source.match("?")) kind = "min";
      else if (source.match("+")) kind = "poss";
      sub[sub.length - 1] = { op: "rep", min, max, kind, item };
    } else if (this_ === ".") {
      sub.push({ op: "any" });
    } else if (this_ === "(") {
      const start = source.tell() - 1;
      let capture = true;
      let atomic = false;
      let name: string | null = null;
      let add = 0;
      let del = 0;
      if (source.match("?")) {
        let c = source.get();
        if (c === null) throw source.error("unexpected end of pattern");
        if (c === "P") {
          if (source.match("<")) {
            name = source.getuntil(">", "group name");
            source.checkgroupname(name, 1);
          } else if (source.match("=")) {
            const ref = source.getuntil(")", "group name");
            source.checkgroupname(ref, 1);
            const gid = state.groupdict.get(ref);
            if (gid === undefined) throw source.error(`unknown group name ${reprStr(ref)}`, [...ref].length + 1);
            if (!state.checkgroup(gid)) throw source.error("cannot refer to an open group", [...ref].length + 1);
            state.checklookbehindgroup(gid, source);
            sub.push({ op: "ref", group: gid });
            continue;
          } else {
            c = source.get();
            if (c === null) throw source.error("unexpected end of pattern");
            throw source.error("unknown extension ?P" + c, [...c].length + 2);
          }
        } else if (c === ":") {
          capture = false;
        } else if (c === "#") {
          for (;;) {
            if (source.next === null) throw source.error("missing ), unterminated comment", source.tell() - start);
            if (source.get() === ")") break;
          }
          continue;
        } else if ("=!<".includes(c) && c.length === 1) {
          let dir: 1 | -1 = 1;
          let lookbehindgroups: number | null = null;
          if (c === "<") {
            c = source.get();
            if (c === null) throw source.error("unexpected end of pattern");
            if (!"=!".includes(c) || c.length !== 1) throw source.error("unknown extension ?<" + c, [...c].length + 2);
            dir = -1;
            lookbehindgroups = state.lookbehindgroups;
            if (lookbehindgroups === null) state.lookbehindgroups = state.groups;
          }
          const p = parseSub(source, state, verbose, nested + 1);
          if (dir < 0 && lookbehindgroups === null) state.lookbehindgroups = null;
          if (!source.match(")")) throw source.error("missing ), unterminated subpattern", source.tell() - start);
          if (c === "=") sub.push({ op: "assert", dir, neg: false, body: p });
          else if (p.length) sub.push({ op: "assert", dir, neg: true, body: p });
          else sub.push({ op: "failure" });
          continue;
        } else if (c === "(") {
          const condname = source.getuntil(")", "group name");
          let condgroup: number;
          if (!/^[0-9]+$/.test(condname)) {
            source.checkgroupname(condname, 1);
            const g = state.groupdict.get(condname);
            if (g === undefined) throw source.error(`unknown group name ${reprStr(condname)}`, [...condname].length + 1);
            condgroup = g;
          } else {
            condgroup = Number(condname);
            if (!condgroup) throw source.error("bad group number", condname.length + 1);
            if (condgroup >= MAXGROUPS) throw source.error(`invalid group reference ${condgroup}`, condname.length + 1);
            if (!state.grouprefpos.has(condgroup)) state.grouprefpos.set(condgroup, source.tell() - condname.length - 1);
          }
          state.checklookbehindgroup(condgroup, source);
          const yes = parse(source, state, verbose, nested + 1);
          let no: Seq | null = null;
          if (source.match("|")) {
            no = parse(source, state, verbose, nested + 1);
            if (source.next === "|") throw source.error("conditional backref with more than two branches");
          }
          if (!source.match(")")) throw source.error("missing ), unterminated subpattern", source.tell() - start);
          sub.push({ op: "cond", group: condgroup, yes, no });
          continue;
        } else if (c === ">") {
          capture = false;
          atomic = true;
        } else if (isFlag(c) || c === "-") {
          const flags = parseFlags(source, state, c);
          if (flags === null) {
            if (!first || sub.length)
              throw source.error("global flags not at the start of the expression", source.tell() - start);
            verbose = (state.flags & VERBOSE) !== 0;
            continue;
          }
          [add, del] = flags;
          capture = false;
        } else {
          throw source.error("unknown extension ?" + c, [...c].length + 1);
        }
      }
      let group: number | null = null;
      if (capture) {
        try {
          group = state.opengroup(name);
        } catch (err) {
          if (err instanceof PyReError) throw source.error(err.msg, [...(name ?? "")].length + 1);
          throw err;
        }
      }
      const subVerbose = (verbose || (add & VERBOSE) !== 0) && !(del & VERBOSE);
      const p = parseSub(source, state, subVerbose, nested + 1);
      if (!source.match(")")) throw source.error("missing ), unterminated subpattern", source.tell() - start);
      if (group !== null) state.closegroup(group, p);
      if (atomic) sub.push({ op: "atomic", body: p });
      else sub.push({ op: "sub", group, add, del, body: p });
    } else if (this_ === "^") {
      sub.push({ op: "at", at: "beginning" });
    } else if (this_ === "$") {
      sub.push({ op: "at", at: "end" });
    }
  }
  // Grupo sem captura e sem flag é só agrupamento: some, como no Python.
  const out: Seq = [];
  for (const node of sub) {
    if (node.op === "sub" && node.group === null && !node.add && !node.del) out.push(...node.body);
    else out.push(node);
  }
  return out;
}

function checkLookbehinds(seq: Seq, state: State): void {
  for (const node of seq) {
    switch (node.op) {
      case "assert":
        if (node.dir < 0) {
          const [lo, hi] = width(node.body, state);
          if (lo !== hi) throw new PyReError("look-behind requires fixed-width pattern");
        }
        checkLookbehinds(node.body, state);
        break;
      case "sub":
      case "atomic":
        checkLookbehinds(node.body, state);
        break;
      case "rep":
        checkLookbehinds(node.item, state);
        break;
      case "branch":
        for (const b of node.branches) checkLookbehinds(b, state);
        break;
      case "cond":
        checkLookbehinds(node.yes, state);
        if (node.no) checkLookbehinds(node.no, state);
        break;
      default:
        break;
    }
  }
}

function touchesIgnorecase(seq: Seq): boolean {
  return seq.some((node) => {
    switch (node.op) {
      case "sub":
        return ((node.add | node.del) & IGNORECASE) !== 0 || touchesIgnorecase(node.body);
      case "atomic":
      case "assert":
        return touchesIgnorecase(node.body);
      case "rep":
        return touchesIgnorecase(node.item);
      case "branch":
        return node.branches.some(touchesIgnorecase);
      default:
        return false;
    }
  });
}

// ----------------------------------------------------------------- emissão

const hex = (n: number) => `\\u{${n.toString(16)}}`;
const PY_WS_CLASS = [...PY_WHITESPACE].map((c) => hex(cp(c))).join("");
const ASCII_WS_CLASS = [..." \t\n\r\f\v"].map((c) => hex(cp(c))).join("");
const WORD_UNI = "\\p{L}\\p{N}_";
const WORD_ASCII = "A-Za-z0-9_";

function catBody(cat: Cat, ascii: boolean): { body: string; negated: boolean } {
  const lower = cat.toLowerCase();
  const body = lower === "d" ? (ascii ? "0-9" : "\\p{Nd}") : lower === "w" ? (ascii ? WORD_ASCII : WORD_UNI) : ascii ? ASCII_WS_CLASS : PY_WS_CLASS;
  return { body, negated: cat !== lower };
}

function caseVariants(code: number): number[] {
  const ch = String.fromCodePoint(code);
  const out = new Set([code]);
  for (const v of [ch.toLowerCase(), ch.toUpperCase()]) {
    const arr = [...v];
    if (arr.length === 1) out.add(cp(arr[0]!));
  }
  return [...out];
}

interface EmitContext {
  globalI: boolean;
  jsIndex: number[]; // grupo do Python -> grupo do JS
  nextJs: number;
}

function emitIn(items: SetItem[], neg: boolean, flags: number, ctx: EmitContext): string {
  const ascii = (flags & ASCII) !== 0;
  const localI = (flags & IGNORECASE) !== 0 && !ctx.globalI;
  const pos: string[] = [];
  const negCats: string[] = [];
  for (const item of items) {
    if (item.t === "lit") {
      for (const v of localI ? caseVariants(item.cp) : [item.cp]) pos.push(hex(v));
    } else if (item.t === "range") {
      pos.push(`${hex(item.lo)}-${hex(item.hi)}`);
      if (localI && item.hi - item.lo <= 2000) {
        for (let c = item.lo; c <= item.hi; c++) for (const v of caseVariants(c)) if (v < item.lo || v > item.hi) pos.push(hex(v));
      }
    } else {
      const { body, negated } = catBody(item.cat, ascii);
      if (!negated) pos.push(body);
      else if (item.cat === "D" && !ascii) pos.push("\\P{Nd}");
      else negCats.push(body);
    }
  }
  const alts = [...(pos.length ? [`[${pos.join("")}]`] : []), ...negCats.map((c) => `[^${c}]`)];
  if (!neg) return alts.length === 1 ? alts[0]! : `(?:${alts.join("|")})`;
  if (!negCats.length) return pos.length ? `[^${pos.join("")}]` : "[\\s\\S]";
  return `(?:${alts.map((a) => `(?!${a})`).join("")}[\\s\\S])`;
}

function emitSeq(seq: Seq, flags: number, ctx: EmitContext): string {
  return seq.map((node) => emitNode(node, flags, ctx)).join("");
}

function wordClass(flags: number): string {
  return `[${flags & ASCII ? WORD_ASCII : WORD_UNI}]`;
}

function quant(min: number, max: number): string {
  if (max === MAXREPEAT) return min === 0 ? "*" : min === 1 ? "+" : `{${min},}`;
  if (min === 0 && max === 1) return "?";
  return min === max ? `{${min}}` : `{${min},${max}}`;
}

function emitNode(node: Node, flags: number, ctx: EmitContext): string {
  const localI = (flags & IGNORECASE) !== 0 && !ctx.globalI;
  switch (node.op) {
    case "lit": {
      const variants = localI ? caseVariants(node.cp) : [node.cp];
      return variants.length === 1 ? hex(node.cp) : `[${variants.map(hex).join("")}]`;
    }
    case "notlit":
      return `[^${(localI ? caseVariants(node.cp) : [node.cp]).map(hex).join("")}]`;
    case "any":
      return flags & DOTALL ? "[\\s\\S]" : "[^\\n]";
    case "in":
      return emitIn(node.items, node.neg, flags, ctx);
    case "at": {
      const w = wordClass(flags);
      switch (node.at) {
        case "beginning":
          return flags & MULTILINE ? "(?<![^\\n])" : "(?<![\\s\\S])";
        case "end":
          return flags & MULTILINE ? "(?=\\n|(?![\\s\\S]))" : "(?=\\n?(?![\\s\\S]))";
        case "begstr":
          return "(?<![\\s\\S])";
        case "endstr":
          return "(?![\\s\\S])";
        case "boundary":
          return `(?:(?<=${w})(?!${w})|(?<!${w})(?=${w}))`;
        case "nonboundary":
          return `(?:(?<=${w})(?=${w})|(?<!${w})(?!${w}))`;
      }
      break;
    }
    case "sub": {
      const inner = emitSeqWithFlags(node.body, (flags | node.add) & ~node.del, ctx, node.group);
      return inner;
    }
    case "atomic": {
      const k = ++ctx.nextJs;
      return `(?:(?=(${emitSeq(node.body, flags, ctx)}))\\${k})`;
    }
    case "assert": {
      const body = emitSeq(node.body, flags, ctx);
      if (node.dir > 0) return node.neg ? `(?!${body})` : `(?=${body})`;
      return node.neg ? `(?<!${body})` : `(?<=${body})`;
    }
    case "failure":
      return "(?!)";
    case "ref":
      return `(?:\\${ctx.jsIndex[node.group]})`;
    case "rep": {
      if (node.kind === "poss") {
        const k = ++ctx.nextJs;
        const body = `(?:${emitSeq(node.item, flags, ctx)})${quant(node.min, node.max)}`;
        return `(?:(?=(${body}))\\${k})`;
      }
      return `(?:${emitSeq(node.item, flags, ctx)})${quant(node.min, node.max)}${node.kind === "min" ? "?" : ""}`;
    }
    case "branch":
      return `(?:${node.branches.map((b) => emitSeq(b, flags, ctx)).join("|")})`;
    case "cond":
      throw new PyReError("grupo condicional (?(...)...) não é suportado no navegador");
  }
  return "";
}

function emitSeqWithFlags(body: Seq, flags: number, ctx: EmitContext, group: number | null): string {
  if (group === null) return `(?:${emitSeq(body, flags, ctx)})`;
  // Grupo nomeado vira grupo numerado: a referência por nome já foi resolvida
  // para o número no analisador, e o JS não precisa conhecer o nome.
  ctx.jsIndex[group] = ++ctx.nextJs;
  return `(${emitSeq(body, flags, ctx)})`;
}

// ------------------------------------------------------------------ objetos

export interface PyMatch {
  readonly start: number;
  readonly end: number;
  group(n?: number): string | null;
}

export interface PyPattern {
  readonly groups: number;
  search(text: string, pos?: number): PyMatch | null;
  match(text: string): PyMatch | null;
  fullmatch(text: string): PyMatch | null;
  finditer(text: string): PyMatch[];
  /** `pattern.sub(repl, text)`, com a troca calculada por função. */
  sub(text: string, repl: (m: PyMatch) => string): string;
  /** `pattern.split(text)` com os grupos capturados no meio, como no Python. */
  split(text: string): (string | null)[];
  findall(text: string): (string | (string | null)[])[];
}

class Compiled implements PyPattern {
  private readonly g: RegExp;
  private readonly y: RegExp;
  private readonly full: RegExp;
  constructor(
    source: string,
    jsFlags: string,
    private readonly jsIndex: number[],
    readonly groups: number,
  ) {
    this.g = new RegExp(source, jsFlags + "g");
    this.y = new RegExp(source, jsFlags + "y");
    this.full = new RegExp(`^(?:${source})$`, jsFlags);
  }
  private wrap(m: RegExpExecArray): PyMatch {
    const jsIndex = this.jsIndex;
    return {
      start: m.index,
      end: m.index + m[0].length,
      group(n = 0) {
        const value = n === 0 ? m[0] : m[jsIndex[n]!];
        return value === undefined ? null : value;
      },
    };
  }
  search(text: string, pos = 0): PyMatch | null {
    this.g.lastIndex = pos;
    const m = this.g.exec(text);
    return m ? this.wrap(m) : null;
  }
  match(text: string): PyMatch | null {
    this.y.lastIndex = 0;
    const m = this.y.exec(text);
    return m ? this.wrap(m) : null;
  }
  fullmatch(text: string): PyMatch | null {
    const m = this.full.exec(text);
    return m ? this.wrap(m) : null;
  }
  finditer(text: string): PyMatch[] {
    const out: PyMatch[] = [];
    this.g.lastIndex = 0;
    for (;;) {
      const m = this.g.exec(text);
      if (!m) break;
      out.push(this.wrap(m));
      if (m[0].length === 0) this.g.lastIndex = m.index + (text.codePointAt(m.index)! > 0xffff ? 2 : 1);
    }
    return out;
  }
  sub(text: string, repl: (m: PyMatch) => string): string {
    let out = "";
    let last = 0;
    for (const m of this.finditer(text)) {
      out += text.slice(last, m.start) + repl(m);
      last = m.end;
    }
    return out + text.slice(last);
  }
  split(text: string): (string | null)[] {
    const out: (string | null)[] = [];
    let last = 0;
    for (const m of this.finditer(text)) {
      out.push(text.slice(last, m.start));
      for (let i = 1; i <= this.groups; i++) out.push(m.group(i));
      last = m.end;
    }
    out.push(text.slice(last));
    return out;
  }
  findall(text: string): (string | (string | null)[])[] {
    return this.finditer(text).map((m) => {
      if (this.groups === 0) return m.group(0)!;
      if (this.groups === 1) return m.group(1) ?? "";
      return Array.from({ length: this.groups }, (_, i) => m.group(i + 1) ?? "");
    });
  }
}

const cache = new Map<string, PyPattern>();

/**
 * `re.compile(pattern, flags)` do Python. Erro de sintaxe vira `PyReError`
 * com a mensagem do Python (`missing ), unterminated subpattern at position 0`).
 */
export function pyCompile(pattern: string, flags = 0): PyPattern {
  const key = `${flags}\u0000${pattern}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const chars = [...pattern];
  const source = new Tokenizer(chars);
  const state = new State();
  state.flags = flags;
  const tree = parseSub(source, state, (flags & VERBOSE) !== 0, 0);
  if (state.flags & LOCALE) throw new PyInternalError("cannot use LOCALE flag with a str pattern");
  if (source.next !== null) throw source.error("unbalanced parenthesis");
  for (const [g, pos] of state.grouprefpos) {
    if (g >= state.groups) throw new PyReError(`invalid group reference ${g}`, chars, pos);
  }
  checkLookbehinds(tree, state);
  const globalI = (state.flags & IGNORECASE) !== 0 && !touchesIgnorecase(tree);
  const ctx: EmitContext = { globalI, jsIndex: [0], nextJs: 0 };
  const js = emitSeq(tree, state.flags, ctx);
  let compiled: PyPattern;
  try {
    compiled = new Compiled(js, globalI ? "ui" : "u", ctx.jsIndex, state.groups - 1);
  } catch (err) {
    throw new PyInternalError(`regex não traduzida: ${(err as Error).message}`);
  }
  if (cache.size > 8192) cache.clear();
  cache.set(key, compiled);
  return compiled;
}

/** `re.escape` do Python. */
export function pyEscape(text: string): string {
  const special = new Set("()[]{}?*+-|^$\\.&~# \t\n\r\v\f");
  let out = "";
  for (const ch of text) out += special.has(ch) ? "\\" + ch : ch;
  return out;
}
