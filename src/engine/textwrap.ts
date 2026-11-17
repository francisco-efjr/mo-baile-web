/**
 * `textwrap.wrap` do Python 3.14, com os padrões que o motor usa (quebra em
 * hífen, palavra longa partida, espaços das pontas descartados). O bloco de
 * cada variação quebra comentários longos com ele, e o texto precisa sair
 * igual ao do Mo baile. Larguras contam pontos de código, como no Python.
 */

import { pyStrip } from "./py";
import { pyCompile, pyEscape, VERBOSE } from "./pyre";

const WHITESPACE_CHARS = "\t\n\x0b\x0c\r ";

// Mesma construção de `TextWrapper.wordsep_re` no Python 3.14.
const wordPunct = String.raw`[\w!"\'&.,?]`;
const letter = String.raw`[^\d\W]`;
const whitespace = `[${pyEscape(WHITESPACE_CHARS)}]`;
const nowhitespace = "[^" + whitespace.slice(1);
const WORDSEP = String.raw`
        ( # any whitespace
          %(ws)s+
        | # em-dash between words
          (?<=%(wp)s) -{2,} (?=\w)
        | # word, possibly hyphenated
          %(nws)s+? (?:
            # hyphenated word
              -(?: (?<=%(lt)s{2}-) | (?<=%(lt)s-%(lt)s-))
              (?= %(lt)s -? %(lt)s)
            | # end of word
              (?=%(ws)s|\z)
            | # em-dash
              (?<=%(wp)s) (?=-{2,}\w)
            )
        )`
  .replace(/%\((ws|wp|lt|nws)\)s/g, (_, name: string) => ({ ws: whitespace, wp: wordPunct, lt: letter, nws: nowhitespace })[name]!);

function expandTabs(text: string, tabsize = 8): string {
  let out = "";
  let column = 0;
  for (const ch of text) {
    if (ch === "\t") {
      const spaces = tabsize - (column % tabsize);
      out += " ".repeat(spaces);
      column += spaces;
    } else {
      out += ch;
      column++;
      if (ch === "\n" || ch === "\r") column = 0;
    }
  }
  return out;
}

function mungeWhitespace(text: string): string {
  let out = "";
  for (const ch of expandTabs(text)) out += WHITESPACE_CHARS.includes(ch) ? " " : ch;
  return out;
}

const cps = (s: string): string[] => [...s];

export function wrap(text: string, width: number, subsequentIndent = "", initialIndent = ""): string[] {
  const chunks = pyCompile(WORDSEP, VERBOSE)
    .split(mungeWhitespace(text))
    .filter((c): c is string => !!c)
    .map(cps);
  const lines: string[] = [];
  chunks.reverse();
  const isBlank = (chunk: string[]) => pyStrip(chunk.join("")) === "";
  while (chunks.length) {
    const curLine: string[][] = [];
    let curLen = 0;
    const indent = lines.length ? subsequentIndent : initialIndent;
    const w = width - cps(indent).length;
    if (isBlank(chunks[chunks.length - 1]!) && lines.length) chunks.pop();
    while (chunks.length) {
      const l = chunks[chunks.length - 1]!.length;
      if (curLen + l <= w) {
        curLine.push(chunks.pop()!);
        curLen += l;
      } else break;
    }
    if (chunks.length && chunks[chunks.length - 1]!.length > w) {
      // _handle_long_word
      const spaceLeft = w < 1 ? 1 : w - curLen;
      const chunk = chunks[chunks.length - 1]!;
      let end = spaceLeft;
      if (chunk.length > spaceLeft) {
        const hyphen = chunk.slice(0, spaceLeft).lastIndexOf("-");
        if (hyphen > 0 && chunk.slice(0, hyphen).some((c) => c !== "-")) end = hyphen + 1;
      }
      curLine.push(chunk.slice(0, end));
      chunks[chunks.length - 1] = chunk.slice(end);
      curLen = curLine.reduce((n, c) => n + c.length, 0);
    }
    if (curLine.length && isBlank(curLine[curLine.length - 1]!)) {
      curLen -= curLine[curLine.length - 1]!.length;
      curLine.pop();
    }
    if (curLine.length) lines.push(indent + curLine.map((c) => c.join("")).join(""));
  }
  return lines;
}
