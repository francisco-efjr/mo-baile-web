/**
 * Port de `difflib.SequenceMatcher` e `difflib.get_close_matches` do Python
 * (CPython 3.14), só o que o leitor de cards usa: sem `isjunk`, com
 * `autojunk`. As sequências são de pontos de código, como o `str` do Python.
 */

import { cmpCodePoints } from "../py";

interface Block {
  i: number;
  j: number;
  k: number;
}

function ratioOf(matches: number, length: number): number {
  return length ? (2.0 * matches) / length : 1.0;
}

export class SequenceMatcher {
  private a: string[] = [];
  private b: string[] = [];
  private b2j = new Map<string, number[]>();
  private fullbcount: Map<string, number> | null = null;
  private blocks: Block[] | null = null;

  constructor(a = "", b = "") {
    this.setSeq2(b);
    this.setSeq1(a);
  }

  setSeq1(a: string): void {
    this.a = [...a];
    this.blocks = null;
  }

  setSeq2(b: string): void {
    this.b = [...b];
    this.blocks = null;
    this.fullbcount = null;
    this.chainB();
  }

  private chainB(): void {
    const b2j = new Map<string, number[]>();
    this.b.forEach((elt, i) => {
      const indices = b2j.get(elt);
      if (indices) indices.push(i);
      else b2j.set(elt, [i]);
    });
    const n = this.b.length;
    if (n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      const popular = [...b2j].filter(([, idxs]) => idxs.length > ntest).map(([elt]) => elt);
      for (const elt of popular) b2j.delete(elt);
    }
    this.b2j = b2j;
  }

  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Block {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      for (const j of b2j.get(a[i]!) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }
    // Sem lixo (`isjunk` vazio): só estende por elementos iguais, inclusive os populares.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return { i: besti, j: bestj, k: bestsize };
  }

  getMatchingBlocks(): Block[] {
    if (this.blocks) return this.blocks;
    const la = this.a.length;
    const lb = this.b.length;
    const queue: [number, number, number, number][] = [[0, la, 0, lb]];
    const found: Block[] = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const x = this.findLongestMatch(alo, ahi, blo, bhi);
      const { i, j, k } = x;
      if (k) {
        found.push(x);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    found.sort((p, q) => p.i - q.i || p.j - q.j || p.k - q.k);
    const out: Block[] = [];
    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    for (const { i: i2, j: j2, k: k2 } of found) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) out.push({ i: i1, j: j1, k: k1 });
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) out.push({ i: i1, j: j1, k: k1 });
    out.push({ i: la, j: lb, k: 0 });
    this.blocks = out;
    return out;
  }

  ratio(): number {
    const matches = this.getMatchingBlocks().reduce((s, blk) => s + blk.k, 0);
    return ratioOf(matches, this.a.length + this.b.length);
  }

  quickRatio(): number {
    if (!this.fullbcount) {
      const full = new Map<string, number>();
      for (const elt of this.b) full.set(elt, (full.get(elt) ?? 0) + 1);
      this.fullbcount = full;
    }
    const full = this.fullbcount;
    const avail = new Map<string, number>();
    let matches = 0;
    for (const elt of this.a) {
      const numb = avail.has(elt) ? avail.get(elt)! : (full.get(elt) ?? 0);
      avail.set(elt, numb - 1);
      if (numb > 0) matches++;
    }
    return ratioOf(matches, this.a.length + this.b.length);
  }

  realQuickRatio(): number {
    const la = this.a.length;
    const lb = this.b.length;
    return ratioOf(Math.min(la, lb), la + lb);
  }
}

/** `difflib.get_close_matches(word, possibilities, n, cutoff)`. */
export function getCloseMatches(word: string, possibilities: readonly string[], n = 3, cutoff = 0.6): string[] {
  if (!(n > 0)) throw new RangeError(`n must be > 0: ${n}`);
  if (!(cutoff >= 0 && cutoff <= 1)) throw new RangeError(`cutoff must be in [0.0, 1.0]: ${cutoff}`);
  const result: [number, string][] = [];
  const s = new SequenceMatcher();
  s.setSeq2(word);
  for (const x of possibilities) {
    s.setSeq1(x);
    if (s.realQuickRatio() >= cutoff && s.quickRatio() >= cutoff && s.ratio() >= cutoff) {
      result.push([s.ratio(), x]);
    }
  }
  // heapq.nlargest(n, result) == sorted(result, reverse=True)[:n]
  result.sort((p, q) => q[0] - p[0] || cmpCodePoints(q[1], p[1]));
  return result.slice(0, n).map(([, x]) => x);
}
