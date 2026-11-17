/**
 * Checklist de conferência do rascunho: port de `checklist_markdown`
 * (`services/report/checklist.py` do Mo baile). O `.checklist.md` lista, card
 * a card, o que o OCR pediu para revisar e cada disparo a conferir no app
 * (card x fluxo x variação), com os parâmetros esperados como referência.
 */

import { pyJsonDumps, pyOr, pyRstrip, pyStr, pyTruthy, type PyDict, type PyValue } from "../py";

const WARN_PREFIX = "⚠";
const FLOW_TOKEN = "{fluxo}";

const isDict = (v: PyValue | undefined): v is PyDict => v instanceof Map;

/** Valor como código inline; usa crase dupla quando o valor tem crase. */
function code(value: PyValue | undefined): string {
  let text = typeof value === "string" ? value : pyJsonDumps(value);
  text = text.replaceAll("\n", " ");
  if (!text) return "*(vazio)*";
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

/** Parâmetros em pares, com o primeiro item de `items` aberto (como no relatório). */
function pairs(params: PyDict): [string, PyValue][] {
  const out: [string, PyValue][] = [];
  for (const [key, value] of params) {
    if (key === "items" && Array.isArray(value) && value.length && isDict(value[0])) {
      for (const [ik, iv] of value[0]) out.push([`items[0].${ik}`, iv]);
    } else {
      out.push([key, value]);
    }
  }
  return out;
}

function variationText(variation: PyDict): string {
  return [...variation].map(([k, v]) => `${code(k)} = ${code(v)}`).join(" · ");
}

/** Os disparos a conferir: um por fluxo x variação. */
function cardItems(card: PyDict, flows: PyDict): string[] {
  const perFlow = pyJsonDumps(card).includes(FLOW_TOKEN) && flows.size > 0;
  const labels: (string | null)[] = perFlow ? [...flows.values()].map((v) => pyStr(v)) : [null];
  const raw = card.get("variacoes");
  const variations: PyValue[] = Array.isArray(raw) && raw.length ? raw : [new Map()];
  const event = code(pyOr(card.get("evento") ?? null, "?"));
  const items: string[] = [];
  for (const label of labels) {
    for (const variation of variations) {
      const parts = label ? [`fluxo **${label}**`] : [];
      const v = isDict(variation) ? variation : new Map<string, PyValue>();
      parts.push(v.size ? variationText(v) : `disparo de ${event}`);
      items.push("- [ ] " + parts.join(" · "));
    }
  }
  return items;
}

const two = (n: number) => String(n).padStart(2, "0");

/** `%d/%m/%Y %H:%M` do `strftime`. */
export function brDateTime(when: Date): string {
  return `${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()} ${two(when.getHours())}:${two(when.getMinutes())}`;
}

/** `checklist_markdown(spec, review, spec_name=..., generated_at=...)`. */
export function checklistMarkdown(
  spec: PyDict,
  review: readonly PyDict[],
  options: { specName?: string; generatedAt?: Date } = {},
): string {
  const when = brDateTime(options.generatedAt ?? new Date());
  const rawFlows = spec.get("fluxos");
  const flows: PyDict = isDict(rawFlows) ? new Map(rawFlows) : new Map();
  const rawCards = spec.get("cards");
  const cards: PyDict[] = Array.isArray(rawCards) ? (rawCards as PyDict[]) : [];
  const doubts = new Map<number, string[]>(review.map((r, i) => [i, [...((r.get("duvidas") as string[] | undefined) ?? [])]]));

  const md = [`# Checklist · ${pyStr(pyOr(spec.get("projeto") ?? null, "spec"))}`, ""];
  md.push(`- Plataforma: ${pyStr(pyOr(spec.get("plataforma") ?? null, "android")).toUpperCase()}`);
  md.push(`- Gerado em: ${when}`);
  if (options.specName) md.push(`- Spec: ${code(options.specName)}`);
  const printsDir = spec.get("prints_dir");
  if (pyTruthy(printsDir)) md.push(`- Prints: ${code(printsDir)}`);
  if (flows.size) md.push(`- Fluxos: ${[...flows.values()].map((v) => pyStr(v)).join(", ")}`);
  md.push(
    "",
    "Marque cada item com `[x]` ao conferir. Os itens com ⚠ são do OCR: confira no print e corrija " +
      "a spec antes de auditar. Para o HTML no padrão do design system, use **Exportar Checklist…** " +
      "na aba Relatório.",
    "",
  );

  const sections = new Map<string, number[]>();
  cards.forEach((card, index) => {
    const name = pyStr(pyOr(card.get("secao") ?? null, "Geral"));
    const list = sections.get(name);
    if (list) list.push(index);
    else sections.set(name, [index]);
  });

  for (const [section, indexes] of sections) {
    md.push(`## ${section}`, "");
    for (const index of indexes) {
      const card = cards[index]!;
      const title = pyStr(pyOr(card.get("titulo") ?? null, card.get("evento") ?? null, `Card ${index + 1}`));
      let heading = `### ${title}`;
      const print = card.get("print");
      if (pyTruthy(print)) heading += ` — ${code(print)}`;
      md.push(heading, "");
      const params = isDict(card.get("params")) ? (card.get("params") as PyDict) : new Map<string, PyValue>();
      const extras = isDict(card.get("params_por_fluxo")) ? (card.get("params_por_fluxo") as PyDict) : new Map<string, PyValue>();
      if (params.size || extras.size) {
        md.push("**Parâmetros esperados**", "");
        for (const [k, v] of pairs(params)) md.push(`- ${code(k)}: ${code(v)}`);
        for (const [flow, values] of extras) {
          const label = flows.has(flow) ? pyStr(flows.get(flow)) : flow;
          if (isDict(values)) for (const [k, v] of pairs(values)) md.push(`- ${code(k)} (só no fluxo ${label}): ${code(v)}`);
        }
        md.push("");
      }
      md.push("**Conferir**", "");
      for (const d of doubts.get(index) ?? []) md.push(`- [ ] ${WARN_PREFIX} Revisar OCR: ${d}`);
      md.push(...cardItems(card, flows));
      md.push("");
    }
  }
  return pyRstrip(md.join("\n")) + "\n";
}
