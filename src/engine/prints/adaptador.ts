/**
 * Camada de ajuste do PaddleOCR (ADR 0002): o que o OCR do site devolve vira
 * as linhas que o leitor de cards espera, no formato do Vision (caixa justa,
 * de 0 a 1, `y` a partir do topo).
 *
 * Não é regra de card: o leitor (`cardReader.ts`) é o mesmo do Mo baile. Aqui
 * só se corrige o jeito de o PaddleOCR entregar cada linha, medido na fase 0
 * em 129 prints reais:
 *
 * - a detecção soma uma margem a cada caixa (0,4 da altura em cima e embaixo,
 *   0,6 da altura dos lados), e o leitor juntava linhas vizinhas;
 * - o "•" e o ícone do cabeçalho às vezes saem como espaço no começo da linha;
 * - sobra espaço perto de `_` (`item _name`), depois da aspa que abre a linha
 *   e no meio de palavras fixas do card (`parâm etro`);
 * - o `|` some de alternâncias (`[pessoalinvestimentos]`) que o mesmo print
 *   escreve inteiras em outra linha;
 * - caixinhas de ruído (ícone, borda) e caixas repetidas dentro de outra.
 */

import { isPySpace, pyLstrip, pyStrip } from "../py";
import { pyCompile, pyEscape, type PyMatch } from "../pyre";
import type { OcrLine } from "./cardReader";
import { reSub } from "./cardReader";

/** Uma caixa como o PaddleOCR (ppu-paddle-ocr) devolve: em pixels, com a margem da detecção. */
export interface CaixaPaddle {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
}

// Margem que a detecção da ppu-paddle-ocr soma à caixa (paddingVertical / paddingHorizontal).
const MARGEM_VERTICAL = 0.4;
const MARGEM_HORIZONTAL = 0.6;
const PALAVRAS_DO_CARD = ["Preenchimento", "parâmetro", "Observação", "evento", "disparar"];
const ALT = pyCompile("\\[([^\\[\\]]+)\\]");

/** Tira a margem da caixa; na borda da imagem a margem foi cortada e não é descontada. */
function caixaJusta(b: CaixaPaddle["box"]): CaixaPaddle["box"] {
  const h0 = b.height / (1 + 2 * MARGEM_VERTICAL);
  const y0 = b.y + (b.y > 0 ? h0 * MARGEM_VERTICAL : 0);
  const x0 = b.x + (b.x > 0 ? h0 * MARGEM_HORIZONTAL : 0);
  return { x: x0, y: y0, width: Math.max(1, b.width - (x0 - b.x) - h0 * MARGEM_HORIZONTAL), height: h0 };
}

/** Caixas do PaddleOCR em linhas normalizadas, com a caixa justa (sem os ajustes de texto). */
export function linhasDoPaddle(caixas: readonly CaixaPaddle[], largura: number, altura: number): OcrLine[] {
  return caixas
    .filter((it) => it.text.trim())
    .map((it) => {
      const b = caixaJusta(it.box);
      return { t: it.text, x: b.x / largura, y: b.y / altura, w: b.width / largura, h: b.height / altura, c: it.confidence };
    });
}

function mediana(valores: number[]): number {
  const d = [...valores].sort((a, b) => a - b);
  const n = d.length;
  return n % 2 === 1 ? d[(n - 1) / 2]! : (d[n / 2 - 1]! + d[n / 2]!) / 2;
}

interface EmPixels {
  ln: OcrLine;
  X: number;
  Y: number;
  Wd: number;
  Hd: number;
}

/** Os ajustes de texto e de ruído sobre as linhas de um print (`largura` x `altura` em pixels). */
export function ajustarLinhas(linhas: readonly OcrLine[], largura: number, altura: number): OcrLine[] {
  if (!linhas.length) return [...linhas];
  const px: EmPixels[] = linhas.map((ln) => ({ ln, X: ln.x * largura, Y: ln.y * altura, Wd: ln.w * largura, Hd: ln.h * altura }));
  const medH = mediana(px.map((b) => b.Hd));
  const dentro = (a: EmPixels, b: EmPixels): boolean => {
    const ix = Math.max(0, Math.min(a.X + a.Wd, b.X + b.Wd) - Math.max(a.X, b.X));
    const iy = Math.max(0, Math.min(a.Y + a.Hd, b.Y + b.Hd) - Math.max(a.Y, b.Y));
    return ix * iy >= 0.6 * a.Wd * a.Hd;
  };
  const limpas = px.filter((a) => {
    const pequena = a.Hd < 0.5 * medH && a.Wd < medH;
    const contida = px.some((b) => b !== a && b.Wd * b.Hd > a.Wd * a.Hd && dentro(a, b));
    return !(pequena || contida);
  });

  // Alternâncias lidas com o "|" neste print, para reparar as que perderam o separador.
  const alts: string[][] = [];
  for (const a of limpas) {
    for (const m of ALT.finditer(a.ln.t)) {
      const inner = m.group(1)!;
      if (!inner.includes("|")) continue;
      const partes = inner.split("|").filter((x) => pyStrip(x)).map((x) => pyStrip(x));
      if (partes.length > 1 && !alts.some((p) => p.length === partes.length && p.every((x, i) => x === partes[i]))) {
        alts.push(partes);
      }
    }
  }
  const repara = (m: PyMatch): string => {
    const inner = m.group(1)!;
    if (inner.includes("|")) return m.group(0)!;
    const sq = reSub("[\\s_]", "", inner);
    for (const partes of alts) {
      if (sq === partes.join("") || pyCompile(partes.map(pyEscape).join("[_\\s]*")).fullmatch(pyStrip(inner))) {
        return "[" + partes.join("|") + "]";
      }
    }
    return m.group(0)!;
  };

  return limpas.map((a) => {
    let t = a.ln.t;
    if (t.length && isPySpace(t[0]!) && pyStrip(t)) t = "• " + pyLstrip(t); // glifo lido como espaço
    t = reSub("(?<=\\w) +_|_ +(?=\\w)", "_", t);
    t = reSub('^"\\s+', '"', t);
    t = ALT.sub(t, repara);
    for (const w of PALAVRAS_DO_CARD) t = reSub([...w].map(pyEscape).join("\\s?"), w, t); // "parâm etro"
    return { t, x: a.ln.x, y: a.ln.y, w: a.ln.w, h: a.ln.h, c: a.ln.c ?? 1.0 };
  });
}

/** Do PaddleOCR às linhas do leitor de cards: caixa justa e os ajustes de texto. */
export function linhasDoPrint(caixas: readonly CaixaPaddle[], largura: number, altura: number): OcrLine[] {
  return ajustarLinhas(linhasDoPaddle(caixas, largura, altura), largura, altura);
}
