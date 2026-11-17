/**
 * Leitura dos prints de cards do Figma: port de
 * `services/report/card_reader.py` do Mo baile (`read_card` e as regras de
 * limpeza), sem mudar as regras.
 *
 * Cada print é um card no padrão "Anotações" do Figma: cabeçalho com o nome
 * do evento, tabela com o parâmetro à esquerda e o valor à direita e,
 * opcional, o quadro "Observação" com "Preenchimento de [x] no parâmetro P:"
 * seguido de itens "• valor". Tudo é regra fixa, sem modelo de linguagem. O
 * que foi corrigido ou ficou ambíguo vai para as dúvidas do card.
 */

import { cpLen, pyStrip, pyRstrip, type PyDict, type PyValue } from "../py";
import { pyCompile, type PyMatch } from "../pyre";
import { getCloseMatches } from "./difflib";

/** Uma linha lida do print: caixa de 0 a 1, `y` a partir do topo, e a confiança. */
export interface OcrLine {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  c?: number;
}

export interface ReadCard {
  file: string;
  event: string;
  params: PyDict;
  bullets: Map<string, string[]>;
  doubts: string[];
}

export const KNOWN_PARAMS: readonly string[] = [
  "screen_name", "flow_name", "component", "detail", "insurance", "currency", "installments", "items",
  "value", "due_date", "installment_value", "operation_type", "loan_insurance_value", "down_payment", "tax",
  "cet", "iof", "transaction_id", "item_list_name", "item_list_id", "text", "title", "section", "sub_section",
  "description", "price", "quantity", "coupon", "payment_type", "shipping_tier", "content_type", "method",
];
export const KNOWN_EVENTS: readonly string[] = [
  "screen_view", "flow_start", "flow_success", "form_input", "modal_view", "error_view", "interaction",
  "view_item_list", "view_item", "select_item", "add_to_cart", "remove_from_cart", "begin_checkout",
  "add_payment_info", "purchase", "refund", "login", "sign_up", "search", "share",
];
export const ITEM_KEYS: readonly string[] = [
  "item_name", "item_id", "item_category", "item_category2", "item_category3", "item_category4",
  "item_category5", "item_brand", "item_variant", "item_list_name", "item_list_id", "price",
  "quantity", "index", "discount", "coupon",
];

const NUMBER_WORDS = ["valor", "taxa", "numero", "número", "custo", "preco", "preço", "quantidade", "iof", "cet",
  "juros", "parcelas"];
const DATE_WORDS = ["data"];
const DESCRIPTIVE_WORDS = ["valor", "numero", "número", "label", "data", "taxa", "elemento", "tipo", "nome", "id",
  "custo", "vencimento", "quantidade", "campo", "botao", "botão", "texto", "codigo", "código"];

export const BULLET = pyCompile("^\\s*[•·▪◦*-]\\s*");
export const WORD_ALT = pyCompile("\\[\\s*([A-Za-zÀ-ú][\\w-]*(?:\\s*\\|\\s*[A-Za-zÀ-ú][\\w-]*)+)\\s*\\]");

/** `re.sub(pattern, repl, text)` com troca fixa (sem referência a grupo) ou por função. */
export function reSub(pattern: string, repl: string | ((m: PyMatch) => string), text: string): string {
  return pyCompile(pattern).sub(text, typeof repl === "string" ? () => repl : repl);
}

const lower = (s: string) => s.toLowerCase();

// ----------------------------------------------------------------------------- normalização

export function squash(s: string): string {
  return reSub("[\\s_.,:;'\"*]", "", lower(s));
}

/** Casa um termo lido com o vocabulário. Retorna [termo, corrigido?]. */
export function matchVocab(token: string, vocab: readonly string[], cutoff = 0.84): [string | null, boolean] {
  const t = pyStrip(pyStrip(pyStrip(token), "\"'*:"));
  if (vocab.includes(t)) return [t, false];
  const sq = squash(t);
  for (const v of vocab) if (squash(v) === sq) return [v, true];
  const close = getCloseMatches(sq, vocab.map(squash), 1, cutoff);
  if (close.length) return [vocab.find((v) => squash(v) === close[0])!, true];
  return [null, false];
}

function bracket(m: PyMatch): string {
  let inner = m.group(1)!;
  inner = reSub("(?<=[A-Za-zÀ-ú])\\s*[)(/]\\s*(?=[A-Za-zÀ-ú])", "|", inner); // '[avulso)empresa]'
  const words = (pyCompile("[\\s|]+").split(pyStrip(inner)) as string[]).filter((w) => w);
  if (!inner.includes("|") && words.length > 1 && !words.some((w) => DESCRIPTIVE_WORDS.includes(lower(w)))) {
    inner = words.join("|"); // '[seguro pedido]' -> '[seguro|pedido]' (o '|' sumiu no OCR)
  }
  return "[" + reSub("\\s*\\|\\s*", "|", pyStrip(inner)) + "]";
}

/** Ruídos típicos do OCR em valores: aspas, barras, alternâncias sem separador, pontuação final. */
export function cleanValue(value: string): string {
  let v = pyStrip(value.replaceAll("“", '"').replaceAll("”", '"').replaceAll("’", "'").replaceAll("‘", "'"));
  v = reSub("\\[\\s*0\\s*[^\\]\\d]?\\s*[1l]\\s*\\]|\\[011\\]", "[0|1]", v);
  v = reSub("\\[([^\\[\\]]+)\\]", bracket, v);
  v = reSub("\\s*:\\s*", ":", v);
  return pyStrip(pyRstrip(v, ".,; "));
}

/** 'clickifechar' -> 'click:fechar'; 'click:ir para tela' -> 'click:ir-para-tela'. Retorna [valor, corrigido?]. */
export function fixClick(v: string): [string, boolean] {
  let fixed = v;
  const m = pyCompile("^click([^:])(.*)$").match(v);
  if (m && !v.startsWith("click:")) {
    const sep = m.group(1)!;
    const rest = m.group(2)!;
    fixed = "click:" + ("i;l1|.,".includes(sep) ? rest : sep + rest);
  }
  if (!fixed.includes("[") && fixed.includes(" ")) fixed = reSub("\\s+", "-", pyStrip(fixed));
  return [fixed, fixed !== v];
}

export function placeholderFor(desc: string): string {
  const d = lower(desc);
  if (DATE_WORDS.some((w) => d.includes(w))) return "[data]";
  if (NUMBER_WORDS.some((w) => d.includes(w))) return "[numero]";
  return "[preenchido]";
}

/** Troca trechos descritivos ('[valor da parcela]', '[elemento]') por placeholders da spec-modelo. */
export function mapDescriptive(v: string): string {
  return reSub("\\[([^\\[\\]]+)\\]", (m) => {
    const inner = m.group(1)!;
    if (inner.includes("|") || ["numero", "data", "preenchido"].includes(lower(pyStrip(inner)))) return m.group(0)!;
    return placeholderFor(inner);
  }, v);
}

function join(parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const p = pyStrip(raw);
    if (!out) out = p;
    else if (["|", "-", ":", "[", "{", "_"].some((s) => out.endsWith(s)) || ["|", "]", "-", ":", "_"].some((s) => p.startsWith(s))) out += p;
    else out += " " + p;
  }
  return out;
}

// ----------------------------------------------------------------------------- leitura de um card

const byY = (a: OcrLine, b: OcrLine) => a.y - b.y;

function rows(lines: OcrLine[], tol: number): OcrLine[][] {
  const out: OcrLine[][] = [];
  for (const ln of [...lines].sort(byY)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0]!.y - ln.y) <= tol) last.push(ln);
    else out.push([ln]);
  }
  return out.map((r) => [...r].sort((a, b) => a.x - b.x));
}

function median(values: number[]): number {
  const data = [...values].sort((a, b) => a - b);
  const n = data.length;
  if (n % 2 === 1) return data[(n - 1) / 2]!;
  return (data[n / 2 - 1]! + data[n / 2]!) / 2;
}

function parseItems(lines: OcrLine[], doubts: string[]): PyDict[] {
  const items: PyDict[] = [];
  let cur: PyDict = new Map();
  const linha = pyCompile("^[\"'*]?\\s*([A-Za-z_,.0-9]+?)\\s*[\"'*]?\\s*[:.]\\s*(.*)$");
  for (const ln of [...lines].sort(byY)) {
    const t = pyStrip(ln.t);
    const m = linha.match(t);
    if (!m) continue;
    const [key, corrected] = matchVocab(m.group(1)!.replaceAll(",", "_").replaceAll(".", "_"), ITEM_KEYS, 0.8);
    if (!key) continue;
    if (corrected) doubts.push(`items: chave '${m.group(1)}' lida como '${key}'`);
    // m.group(2).strip().strip(".,;").strip().strip("\"'*").strip()
    const raw = pyStrip(pyStrip(pyStrip(pyStrip(pyStrip(m.group(2)!), ".,;")), "\"'*"));
    let val: string;
    if (pyCompile("[\\[\\(]").search(raw)) {
      val = placeholderFor(reSub("[\\[\\]\\(\\)]", "", raw));
    } else {
      val = pyStrip(cleanValue(raw), "\"'");
      if (pyCompile("[A-Z][a-z0-9-]+").fullmatch(val)) {
        doubts.push(`items.${key}: '${val}' lido como '${lower(val)}'`);
        val = lower(val);
      }
    }
    if (cur.has(key)) {
      items.push(cur);
      cur = new Map();
    }
    cur.set(key, val);
  }
  if (cur.size) items.push(cur);
  return items;
}

function countUnderscores(s: string): number {
  return s.split("_").length - 1;
}

function eventName(header: string, obsNames: string[], doubts: string[]): string {
  const clean = (text: string): string => {
    let t = reSub("^[^\\w\\[]+", "", pyStrip(text));
    t = reSub("^[A-Z0-9]\\s+(?=[a-z])", "", t);
    t = reSub("\\s*\\|\\s*", "|", t);
    return reSub("\\s+", "_", pyStrip(t, "\"'“” "));
  };
  const cands = [header, ...obsNames].filter((c) => c && clean(c)).map(clean);
  if (!cands.length) {
    doubts.push("nome do evento não lido");
    return "";
  }
  const [known, corrected] = matchVocab(cands[0]!, KNOWN_EVENTS, 0.86);
  if (known && !obsNames.length) {
    if (corrected) doubts.push(`evento '${pyStrip(header)}' lido como '${known}'`);
    return known;
  }
  // Com quadro de Observação, o nome aparece 2-3 vezes: vence a grafia (sem '_') mais frequente,
  // e entre as iguais a que tem mais '_' (o OCR às vezes come o sublinhado).
  const groups = new Map<string, string[]>();
  for (const c of cands) {
    const k = reSub("[_\\s]", "", c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const keyOf = (g: string[]): [number, number] => [g.length, Math.max(...g.map(countUnderscores))];
  let best: string[] | null = null;
  let bestKey: [number, number] = [0, 0];
  for (const g of groups.values()) {
    const k = keyOf(g);
    if (best === null || k[0] > bestKey[0] || (k[0] === bestKey[0] && k[1] > bestKey[1])) {
      best = g;
      bestKey = k;
    }
  }
  let name = best![0]!;
  for (const x of best!) if (countUnderscores(x) > countUnderscores(name)) name = x;
  if (squash(name) !== squash(clean(header))) {
    doubts.push(`cabeçalho '${pyStrip(header)}' corrigido para '${name}' pela Observação`);
  }
  return name;
}

/** `read_card(lines, file)`: um card a partir das linhas lidas de um print. */
export function readCard(input: readonly OcrLine[], file: string): ReadCard {
  const card: ReadCard = { file, event: "", params: new Map(), bullets: new Map(), doubts: [] };
  const anota = pyCompile("(?i)^\\s*anota");
  const lines = input.filter((ln) => ln.x < 0.75 && !anota.match(ln.t));
  if (!lines.length) {
    card.doubts.push("nenhum texto lido");
    return card;
  }
  const tol = 0.6 * median(lines.map((ln) => ln.h));

  const observa = pyCompile("(?i)^\\s*observa");
  const obsYs = lines.filter((ln) => observa.match(ln.t)).map((ln) => ln.y);
  const obsY = obsYs.length ? Math.min(...obsYs) : 2.0;
  const table = lines.filter((ln) => ln.y < obsY - tol);
  const obs = lines.filter((ln) => ln.y >= obsY - tol);

  // Coluna esquerda: cabeçalho + nomes de parâmetros (fragmentos na mesma linha são unidos)
  let left = rows(table.filter((ln) => ln.x < 0.3), tol);
  const exact = new Set(KNOWN_PARAMS.map(squash));
  const joined = (row: OcrLine[]) => row.map((ln) => pyStrip(ln.t)).join("");
  const merged: OcrLine[][] = [];
  for (const row of left) {
    const prev = merged.length ? joined(merged[merged.length - 1]!) : "";
    const cur = joined(row);
    if (merged.length && !exact.has(squash(prev)) && exact.has(squash(prev + cur))) {
      merged[merged.length - 1] = [...merged[merged.length - 1]!, ...row]; // 'loan_insurance_va' + 'lue'
    } else {
      merged.push(row);
    }
  }
  left = merged;
  const keys: [number, string][] = [];
  let header = "";
  let pending: [number, string] | null = null;
  for (const row of left) {
    let text = row.length > 1 ? joined(row) : row[0]!.t;
    if (!keys.length && !header && !matchVocab(text, KNOWN_PARAMS)[0]) text = row.map((ln) => ln.t).join(" ");
    const y = row[0]!.y;
    if (pending) {
      const [joinedKey] = matchVocab(pending[1] + text, KNOWN_PARAMS);
      if (joinedKey && !matchVocab(text, KNOWN_PARAMS)[0]) {
        keys.push([pending[0], joinedKey]);
        pending = null;
        continue;
      }
      keys.push(pending);
      pending = null;
    }
    const [key, corrected] = matchVocab(text, KNOWN_PARAMS);
    if (key) {
      if (corrected) card.doubts.push(`parâmetro '${text}' lido como '${key}'`);
      keys.push([y, key]);
    } else if (!keys.length && !header) {
      header = row.map((ln) => ln.t).join(" ");
    } else if (!keys.length) {
      header += " " + row.map((ln) => ln.t).join(" ");
    } else {
      // pode ser o começo de uma chave quebrada em duas linhas; decide na próxima
      const guess = pyStrip(reSub("\\W+", "_", lower(pyStrip(text))), "_");
      pending = [y, guess];
      card.doubts.push(`parâmetro desconhecido '${text}' (mantido como '${guess}')`);
    }
  }
  if (pending) keys.push(pending);

  // Coluna direita: cada linha vai para a chave mais próxima acima dela
  const byKey = new Map<string, OcrLine[]>();
  for (const ln of table.filter((l) => l.x >= 0.3).sort(byY)) {
    const owner = keys.filter((k) => k[0] <= ln.y + tol);
    if (!owner.length) {
      if (!header || pyStrip(header) === '"' || pyStrip(header) === "'") header = pyStrip(header + " " + ln.t);
      continue;
    }
    const k = owner[owner.length - 1]![1];
    const list = byKey.get(k);
    if (list) list.push(ln);
    else byKey.set(k, [ln]);
  }
  for (const [, key] of keys) {
    const vals = byKey.get(key) ?? [];
    if (key === "items") {
      const items = parseItems(vals, card.doubts);
      card.params.set(key, items);
      if (!items.length) card.doubts.push("items: não foi possível ler o JSON");
    } else {
      let val = vals.length ? cleanValue(join(vals.map((ln) => ln.t))) : "";
      if (key === "screen_name" && pyCompile("\\s").search(reSub("\\[[^\\]]*\\]", "", val))) {
        const fixed = reSub("\\s+(?![^\\[]*\\])", ":", val);
        card.doubts.push(`screen_name '${val}' lido como '${fixed}' (espaço vira ':')`);
        val = fixed;
      }
      card.params.set(key, val);
      if (!vals.length) card.doubts.push(`valor de '${key}' não lido`);
    }
  }

  // Observação: "Preenchimento de [x] no parâmetro P:" + "• valores"
  const obsNames: string[] = [];
  let acc = "";
  let current: string | null = null;
  const titulo = pyCompile("(?i)^observa\\S*\\s+(.+)$");
  const evento = pyCompile("O evento\\s+(\\S+)\\s+deve");
  const parametro = pyCompile("(?i)par[aâ]metro\\s+([\\w ]+?)\\s*:");
  for (const ln of [...obs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const t = pyStrip(ln.t);
    let m = titulo.match(t);
    if (m) {
      obsNames.push(m.group(1)!);
      continue;
    }
    if (BULLET.match(t) && current) {
      const semMarca = BULLET.sub(t, () => "");
      const [val, fixed] = fixClick(cleanValue(semMarca));
      if (fixed) card.doubts.push(`${current}: item '${semMarca}' lido como '${val}'`);
      const list = card.bullets.get(current);
      if (list) list.push(val);
      else card.bullets.set(current, [val]);
      continue;
    }
    acc = pyStrip(acc + " " + t);
    m = evento.search(acc);
    if (m) obsNames.push(m.group(1)!);
    m = parametro.search(acc);
    if (m) {
      const [key, corrected] = matchVocab(m.group(1)!, KNOWN_PARAMS);
      current = key || pyStrip(m.group(1)!).replaceAll(" ", "_");
      if (corrected || !key) card.doubts.push(`Observação: parâmetro '${m.group(1)}' lido como '${current}'`);
      acc = "";
    } else if (cpLen(acc) > 400) {
      acc = [...acc].slice(-200).join("");
    }
  }
  card.event = eventName(header, obsNames, card.doubts);
  return card;
}

/** `dataclasses.asdict(card)`, na ordem dos campos do Python. */
export function readCardAsDict(card: ReadCard): PyDict {
  const bullets: PyDict = new Map([...card.bullets].map(([k, v]) => [k, [...v] as PyValue]));
  return new Map<string, PyValue>([
    ["file", card.file],
    ["event", card.event],
    ["params", card.params],
    ["bullets", bullets],
    ["doubts", [...card.doubts]],
  ]);
}
