/**
 * Rascunho da spec-modelo a partir dos cards lidos: port de `build_spec` e
 * `review_markdown` (`services/report/card_reader.py` do Mo baile).
 */

import { PyInternalError, pyRepr, pyStr, pyTruthy, type PyDict, type PyValue } from "../py";
import { pyCompile, pyEscape, type PyPattern } from "../pyre";
import { valueMatches } from "../rules";
import { WORD_ALT, mapDescriptive, reSub, type ReadCard } from "./cardReader";

const ALT_SEP = pyCompile("\\s*\\|\\s*");

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** `Path(file).name` do Python (POSIX). */
export function baseName(file: string): string {
  return file.split("/").filter((p) => p && p !== ".").pop() ?? "";
}

function section(screen: string): string {
  const s = reSub("\\[[^\\]]*\\]", "", screen.replaceAll("{fluxo}", ""));
  const parts = s.split(":").filter((p) => p && p !== "app");
  return parts.length ? parts[parts.length - 1]! : "geral";
}

function apply(value: PyValue, fn: (s: string) => string): PyValue {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => apply(v, fn));
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, apply(v, fn)]));
  return value;
}

function itemsTemplate(items: PyValue, doubts: string[]): PyDict[] {
  if (!pyTruthy(items)) return [];
  if (!Array.isArray(items) || !(items[0] instanceof Map)) {
    // `dict(items[0])` com texto no lugar da lista de itens: o Python também falha aqui.
    throw new PyInternalError("dictionary update sequence element #0 has length 1; 2 is required");
  }
  const list = items as PyDict[];
  const first: PyDict = new Map(list[0]!);
  if (list.length > 1) {
    for (const k of [...first.keys()]) {
      const vals = list.map((it) => it.get(k)).filter((v) => pyTruthy(v)).map((v) => pyStr(v));
      const stems = new Set(vals.map((x) => reSub("\\d+$", "", x)));
      if (new Set(vals).size > 1 && stems.size === 1 && vals.every((x) => pyCompile("\\d+$").search(x))) {
        first.set(k, [...stems][0]! + (k.endsWith("_id") ? "[preenchido]" : "[numero]"));
        doubts.push(`items.${k}: exemplos ${pyRepr(vals)} viraram o padrão '${pyStr(first.get(k))}'`);
      }
    }
    doubts.push(`items: a spec mostra ${list.length} itens; só o primeiro é validado`);
  }
  return [first];
}

const flowWord = (f: string): PyPattern => pyCompile(`(?<![\\w])${pyEscape(f)}(?![\\w])`);

/** `build_spec(cards, projeto, plataforma, prints_dir)`: [spec-modelo, revisão por card]. */
export function buildSpec(
  cards: readonly ReadCard[],
  projeto: string,
  plataforma = "android",
  printsDir: string | null = null,
): [PyDict, PyDict[]] {
  const flows: string[] = [];
  for (const c of cards) {
    const text = pyStr(c.params.has("flow_name") ? c.params.get("flow_name")! : "") + " " + c.event;
    for (const alt of WORD_ALT.findall(text) as string[]) {
      for (const opt of ALT_SEP.split(alt) as string[]) if (!flows.includes(opt)) flows.push(opt);
    }
  }
  let flowRe: PyPattern | null = null;
  if (flows.length) {
    const any = flows.map(pyEscape).join("|");
    flowRe = pyCompile(`\\[\\s*(?:${any})(?:\\s*\\|\\s*(?:${any}))+\\s*\\]`);
  }
  const templ = (s: string): string => (flowRe ? flowRe.sub(s, () => "{fluxo}") : s);

  const specCards: PyDict[] = [];
  const review: PyDict[] = [];
  const sections: string[] = [];
  for (const c of cards) {
    const doubts = [...c.doubts];
    const event = templ(c.event);
    const params: PyDict = new Map([...c.params].map(([k, v]) => [k, apply(v, templ)]));
    const bullets = new Map<string, string[]>([...c.bullets].map(([k, v]) => [k, v.map(templ)]));
    const bulletsDict: PyDict = new Map([...bullets].map(([k, v]) => [k, v as PyValue]));
    const perFlow = flowRe !== null && (event + pyStr(params) + pyStr(bulletsDict)).includes("{fluxo}");

    // Variações: details (Observação) x alternativas de tela que não são fluxo
    const variations: PyDict[] = [];
    let screenOpts: PyDict[] = [new Map()];
    const screen = pyStr(params.has("screen_name") ? params.get("screen_name")! : "");
    const m = WORD_ALT.search(screen);
    if (m) {
      const opts = ALT_SEP.split(m.group(1)!) as string[];
      screenOpts = opts.map((o) => new Map<string, PyValue>([["screen_name", screen.slice(0, m.start) + o + screen.slice(m.end)]]));
      params.delete("screen_name");
    }
    let detailOpts: PyDict[] = [new Map()];
    const tableDetail = mapDescriptive(pyStr(params.has("detail") ? params.get("detail")! : ""));
    if (bullets.get("detail")?.length && tableDetail.includes("[numero]")) {
      // Exemplos ('click:10-parcela-com-seguro') generalizados pelo padrão da tabela
      const general: string[] = [];
      for (const b of bullets.get("detail")!) {
        const g = valueMatches(tableDetail, b) ? reSub("\\d+", "[numero]", b) : b;
        if (g !== b) doubts.push(`detail: exemplo '${b}' generalizado para '${g}' (padrão da tabela)`);
        general.push(g);
      }
      bullets.set("detail", unique(general));
    }
    if (bullets.get("detail")?.length) {
      detailOpts = bullets.get("detail")!.map((d) => new Map<string, PyValue>([["detail", d]]));
      bullets.delete("detail");
      params.delete("detail");
    }
    for (const sOpt of screenOpts) {
      for (const dOpt of detailOpts) {
        if (sOpt.size || dOpt.size) variations.push(new Map([...sOpt, ...dOpt]));
      }
    }

    for (const [k, vals] of bullets) {
      const uniq = unique(vals);
      if (uniq.length === 1) {
        params.set(k, uniq[0]!);
      } else {
        params.set(k, "[" + uniq.join("|") + "]");
        doubts.push(`${k} aceita ${pyRepr(uniq)}; se cada variação usa um valor específico, ajuste em 'variacoes'`);
      }
    }

    for (const [k, v] of [...params]) {
      if (k === "items") params.set(k, itemsTemplate(v, doubts));
      else if (typeof v === "string") params.set(k, mapDescriptive(v));
    }

    const paramsPorFluxo: PyDict = new Map();
    if (perFlow && pyTruthy(params.get("items"))) {
      const item = (params.get("items") as PyDict[])[0]!;
      for (const f of flows) {
        const word = flowWord(f);
        if ([...item.values()].some((v) => word.search(pyStr(v)))) {
          for (const [ik, iv] of [...item]) {
            const text = pyStr(iv);
            if (word.search(text)) {
              item.set(ik, word.sub(text, () => "{fluxo}"));
            } else if (ik.endsWith("_id") && !text.includes("[")) {
              if (!paramsPorFluxo.has(f)) paramsPorFluxo.set(f, new Map([["items", [new Map()]]]));
              const target = ((paramsPorFluxo.get(f) as PyDict).get("items") as PyDict[])[0]!;
              target.set(ik, iv);
              item.set(ik, "[preenchido]");
            }
          }
          doubts.push(`items: exemplo da spec é do fluxo '${f}'; item_id fixado só para '${f}'`);
          break;
        }
      }
    }

    if (perFlow) {
      for (const [k, v] of params) {
        for (const f of flows) {
          if (typeof v === "string" && flowWord(f).search(v)) {
            doubts.push(`${k}='${v}' cita o fluxo '${f}' fixo num card por fluxo — confira`);
          }
        }
      }
    }

    const secSrc = screen || pyStr(params.has("screen_name") ? params.get("screen_name")! : "");
    const sec = secSrc ? section(secSrc) : "geral";
    if (!sections.includes(sec)) sections.push(sec);
    const entry: PyDict = new Map<string, PyValue>([
      ["secao", `${sections.indexOf(sec) + 1}. ${sec}`],
      ["titulo", `${event || "?"} · ${sec}`],
      ["print", baseName(c.file)],
      ["evento", event],
      ["params", params],
    ]);
    if (variations.length) entry.set("variacoes", variations);
    if (paramsPorFluxo.size) entry.set("params_por_fluxo", paramsPorFluxo);
    if (!event) doubts.push("card sem nome de evento — preencha 'evento'");
    specCards.push(entry);
    review.push(new Map<string, PyValue>([["print", baseName(c.file)], ["evento", event], ["duvidas", doubts]]));
  }

  const spec: PyDict = new Map<string, PyValue>([
    ["projeto", projeto],
    ["versao_especificacao", "Rascunho gerado por OCR — revisar"],
    ["plataforma", plataforma],
  ]);
  if (printsDir) spec.set("prints_dir", printsDir);
  spec.set("fluxos", new Map(flows.map((f) => [f, f])));
  spec.set("cards", specCards);
  return [spec, review];
}

const doubtsOf = (r: PyDict): string[] => (r.get("duvidas") as string[]) ?? [];

/** `review_markdown(spec, review)`: a revisão do rascunho (`.revisao.md`). */
export function reviewMarkdown(spec: PyDict, review: readonly PyDict[]): string {
  const total = review.reduce((s, r) => s + doubtsOf(r).length, 0);
  const md = [
    `# Revisão do rascunho — ${pyStr(spec.get("projeto"))}`,
    "",
    `${review.length} prints lidos · ${total} ponto(s) para conferir. ` +
      "Corrija direto no JSON e audite de novo na aba Relatório.",
    "",
  ];
  const fluxos = spec.get("fluxos");
  if (pyTruthy(fluxos)) {
    md.push(`Fluxos detectados: ${[...(fluxos as PyDict).keys()].join(", ")} (renomeie os rótulos em 'fluxos' se quiser).`, "");
  }
  review.forEach((r, i) => {
    md.push(`## ${i + 1}. ${pyStr(r.get("evento")) || "(sem evento)"} — \`${pyStr(r.get("print"))}\``);
    const lines = doubtsOf(r).map((d) => `- ⚠ ${d}`);
    md.push(...(lines.length ? lines : ["- ✓ nada a conferir"]));
    md.push("");
  });
  return md.join("\n");
}
