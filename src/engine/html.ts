/**
 * HTML interativo da auditoria, com a identidade do Mo baile: port de
 * `services/report/html_report.py`.
 *
 * Arquivo único e offline: design system, ícones, Motion (MIT) e o JS do
 * relatório vão embutidos (`src/engine/assets`, cópia byte a byte dos ativos do
 * Mo baile). Todo texto da spec e do log passa por escape. Os blocos `<style>`
 * e `<script>` executáveis têm conteúdo fixo, igual em qualquer relatório: os
 * dados ficam no HTML já escapado. É o que deixa a CSP do arquivo (e a do site,
 * na pré-visualização) liberar só esses blocos pelo hash
 * (`reportInlineHashes`). Sem prints: a versão web não lê imagem do disco.
 */

import designSystemCss from "./assets/design_system.css?raw";
import iconDataUri from "./assets/icon.png?inline";
import glyphs from "./assets/icons.json";
import motionJs from "./assets/motion.min.js?raw";
import reportCss from "./assets/report.css?raw";
import reportJs from "./assets/report.js?raw";
import { EngineError } from "./errors";
import { floatRepr, htmlEscape, pyFixed, pyJsonDumps, pyLstrip, pyStr, pyStrip, pyTruthy, type PyValue } from "./py";
import { pyCompile } from "./pyre";
import { cspHash } from "./sha256";
import { resultsByCard, totals, type ExtraEvent, type Report, type VariantResult, type VariantStatus } from "./spec";
import { complianceRate, flowShortLabel, logPeriod, summaryLines, variantBlockText } from "./text";

export const MOTION_VERSION = "13.5.1";
const THEME_KEY = "mobaile-report-theme";

/** Ativos fixos do relatório, para a CSP e para o gabarito de paridade. */
export const REPORT_ASSETS = {
  "design_system.css": designSystemCss,
  "report.css": reportCss,
  "motion.min.js": motionJs,
  "report.js": reportJs,
  "icon.png": iconDataUri,
} as const;

// status -> (classe da validação, data-s, ícone, texto, variante do StatusIndicator)
const STATUS: Record<VariantStatus, [string, string, string, string, string]> = {
  ok: ["ok", "ok", "circle-check", "OK", "ok"],
  error: ["err", "err", "circle-x", "Divergente", "error"],
  missing: ["err", "miss", "triangle-alert", "Não disparado", "warn"],
};
const RANK: Record<string, number> = { err: 0, miss: 1, ok: 2 };
const FLOW_COLORS = ["var(--cat-3)", "var(--cat-1)", "var(--cat-2)", "var(--accent)"];

export const HEAD_JS =
  "(function(){var d=document.documentElement,m=function(q){return !!(window.matchMedia&&matchMedia(q).matches)}," +
  "p=null;try{p=localStorage.getItem('" +
  THEME_KEY +
  "')}catch(e){}" +
  "if(p!=='light'&&p!=='dark')p='auto';d.dataset.themePref=p;" +
  "d.dataset.theme=(p==='dark'||(p==='auto'&&m('(prefers-color-scheme: dark)')))?'dark':'light';" +
  "if(m('(prefers-contrast: more)'))d.dataset.contrast='high';" +
  "if(m('(prefers-reduced-motion: reduce)'))d.dataset.reduceMotion='true';" +
  "if(m('(prefers-reduced-transparency: reduce)'))d.dataset.reduceTransparency='true';})();";

const SCRIPTS = [HEAD_JS, motionJs, reportJs];
const STYLES = [designSystemCss, reportCss];
/** O único `style=""` do relatório: a cor da coluna de cada fluxo, de uma lista fixa. */
const STYLE_ATTRIBUTES = FLOW_COLORS.map((c) => `--flow-color:${c}`);

export interface InlineHashes {
  /** Hash de cada `<style>`, no formato da CSP: `'sha256-<base64>'` (com as aspas simples). */
  styles: string[];
  /** Hash de cada `<script>` executável, no mesmo formato. */
  scripts: string[];
  /** Hash dos atributos `style` (exigem `'unsafe-hashes'` na CSP de quem embute o relatório). */
  styleAttributes: string[];
}

let hashes: InlineHashes | null = null;

/** Hashes dos blocos inline fixos do relatório HTML, para a CSP de quem o mostra. */
export function reportInlineHashes(): InlineHashes {
  hashes ??= {
    styles: STYLES.map(cspHash),
    scripts: SCRIPTS.map(cspHash),
    styleAttributes: STYLE_ATTRIBUTES.map(cspHash),
  };
  return { styles: [...hashes.styles], scripts: [...hashes.scripts], styleAttributes: [...hashes.styleAttributes] };
}

const e = (value: PyValue | number): string => htmlEscape(typeof value === "number" ? String(value) : pyStr(value));

function icon(name: string, size = 13, stroke = 1.6): string {
  const glyph = (glyphs as Record<string, string>)[name];
  return (
    `<svg class="mb-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${glyph}</svg>`
  );
}

/** Valor como aparece na validação do app: texto puro; o resto em JSON. */
function value(v: PyValue): string {
  if (v === null) return "AUSENTE";
  return typeof v === "string" ? v : pyJsonDumps(v);
}

const pct = (rate: number) => pyFixed(rate, 1).replace(".", ",") + "%";

function statusIndicator(result: VariantResult): string {
  const [, , glyph, word, kind] = STATUS[result.status];
  return `<span class="mb-status mb-status--${kind}">${icon(glyph, 12, 2.2)}<span>${word}</span></span>`;
}

function variation(result: VariantResult): string {
  const ex = result.variant.expected;
  for (const v of [ex.get("detail"), ex.get("screen_name")]) if (pyTruthy(v)) return pyStr(v!);
  return result.variant.event;
}

function expectedPairs(expected: Map<string, PyValue>): [string, PyValue][] {
  const pairs: [string, PyValue][] = [];
  for (const [key, v] of expected) {
    if (key === "items" && Array.isArray(v) && v.length && v[0] instanceof Map) {
      for (const [ik, iv] of v[0]) pairs.push([`items[0].${ik}`, iv]);
    } else pairs.push([key, v]);
  }
  return pairs;
}

function divergences(result: VariantResult): string {
  if (result.status === "missing") return "Não disparado no log";
  return result.checks
    .filter((c) => !c.ok)
    .map((c) => `${c.field}: obtido ${value(c.obtained)}, esperado ${c.expected}`)
    .join("; ");
}

function searchText(report: Report, result: VariantResult): string {
  const card = report.spec.cards[result.variant.card_index]!;
  const flow = pyTruthy(result.variant.flow) ? (report.spec.fluxos.get(result.variant.flow!) ?? "") : "";
  const parts = [
    card.secao,
    card.titulo || "",
    card.evento,
    result.variant.event,
    flow,
    variation(result),
    divergences(result),
    STATUS[result.status][3],
  ];
  parts.push(...result.checks.map((c) => `${c.field} ${value(c.obtained)} ${c.expected}`));
  return parts.join(" ").toLowerCase();
}

const KEY = pyCompile(String.raw`^(\s*)(&quot;[^&]*&quot;)(:)`);
const MARK_OK = pyCompile("  ✓$");
const MARK_BAD = pyCompile("  ✗$");
const COMMENT = pyCompile("  // (.*)$");

/** Bloco com as cores de sintaxe do app (comentário, chave, ✓/✗). */
function highlightBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (pyLstrip(line).startsWith("//")) return `<span class="c">${htmlEscape(line)}</span>`;
      let safe = KEY.sub(htmlEscape(line), (m) => `${m.group(1)}<span class="k">${m.group(2)}</span>${m.group(3)}`);
      safe = MARK_OK.sub(safe, () => '  <span class="ok">✓</span>');
      safe = MARK_BAD.sub(safe, () => '  <span class="bad">✗</span>');
      safe = COMMENT.sub(safe, (m) => `  <span class="c">// ${m.group(1)}</span>`);
      return safe;
    })
    .join("\n");
}

function checksTable(result: VariantResult): string {
  const rows: string[] = [];
  if (result.status === "missing") {
    for (const [key, v] of expectedPairs(result.variant.expected)) {
      rows.push(
        `<tr><td class="v__none">${icon("minus", 12, 2.2)}</td><td class="v__field">${e(key)}</td>` +
          `<td class="v__none">—</td><td class="v__exp">${e(value(v))}</td></tr>`,
      );
    }
  } else {
    for (const check of result.checks) {
      if (check.exported === false) {
        rows.push(
          `<tr class="is-off"><td class="v__none">${icon("minus", 12, 2.2)}` +
            `<span class="rp-sr">não exportado</span></td><td class="v__field">${e(check.field)}</td>` +
            `<td class="v__none">não exportado</td><td class="v__exp">${e(check.expected)}</td></tr>`,
        );
        continue;
      }
      const mark = check.ok
        ? `<td class="v__ok">${icon("circle-check", 12, 2.2)}<span class="rp-sr">ok</span></td>`
        : `<td class="v__bad">${icon("circle-x", 12, 2.2)}<span class="rp-sr">diverge</span></td>`;
      const rowClass = check.ok ? "" : ' class="is-bad"';
      rows.push(
        `<tr${rowClass}>${mark}<td class="v__field">${e(check.field)}</td>` +
          `<td class="v__got">${e(value(check.obtained))}</td><td class="v__exp">${e(check.expected)}</td></tr>`,
      );
    }
  }
  if (!rows.length) return "";
  return (
    '<table class="v__checks"><thead><tr><th><span class="rp-sr">Status</span></th><th>Parâmetro</th>' +
    `<th>Obtido</th><th>Esperado</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
  );
}

function variantHtml(report: Report, result: VariantResult, index: number, flowLabel: string | null): string {
  const [css, dataS] = STATUS[result.status];
  let when: string;
  if (result.status === "missing") when = "não disparado no log";
  else {
    const time = result.matched && result.matched.time_str ? result.matched.time_str : "";
    when = stripChars(`${time} · ${result.occurrences} disparo${result.occurrences !== 1 ? "s" : ""}`, " ·");
  }
  const notes: string[] = [];
  if (pyTruthy(result.ga_screen)) notes.push(`<span>ga_screen: <span class='mb-mono'>${e(result.ga_screen)}</span></span>`);
  if (result.older_divergences.length)
    notes.push(
      `<span class="is-warn">${icon("triangle-alert", 11, 2)} ${result.older_divergent} disparo(s) ` +
        `anterior(es) com outra divergência: ${e(result.older_divergences.slice(0, 4).join(", "))}</span>`,
    );
  if (result.variant.note) notes.push(`<span>obs: ${e(result.variant.note)}</span>`);
  const label = variation(result);
  return (
    `<article class="v ${css}" data-s="${dataS}" id="v-${index}" data-q="${e(searchText(report, result))}">` +
    `<header class="v__head">${statusIndicator(result)}` +
    `<span class="v__label" title="${e(label)}">${e(label)}</span>` +
    `<span class="v__when">${e(when)}</span></header>` +
    checksTable(result) +
    (notes.length ? `<div class="v__notes">${notes.join("")}</div>` : "") +
    '<footer class="v__foot">' +
    '<button type="button" class="mb-btn mb-btn--small mb-btn--plain" data-act="block" aria-expanded="false">' +
    `${icon("braces", 12)}<span>Bloco</span></button>` +
    '<button type="button" class="mb-btn mb-btn--small mb-btn--plain" data-act="copy" ' +
    `title="Copia o bloco desta validação, o mesmo do board e do app">${icon("copy", 12)}<span>Copiar</span></button>` +
    "</footer>" +
    `<pre class="v__block" hidden>${highlightBlock(variantBlockText(result, flowLabel))}</pre>` +
    "</article>"
  );
}

/** `str.strip(chars)`. */
function stripChars(text: string, chars: string): string {
  let i = 0;
  let j = text.length;
  while (i < j && chars.includes(text[i]!)) i++;
  while (j > i && chars.includes(text[j - 1]!)) j--;
  return text.slice(i, j);
}

function worst(statuses: string[]): string {
  if (!statuses.length) return "off";
  return statuses.reduce((best, s) => (RANK[s]! < RANK[best]! ? s : best));
}

function sections(report: Report): [string, [string, string, number, string][]] {
  const spec = report.spec;
  const flowColors = new Map([...spec.fluxos.keys()].map((flow, i) => [flow, FLOW_COLORS[i % FLOW_COLORS.length]!]));
  const groups: [string, number[]][] = [];
  spec.cards.forEach((card, index) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup[0] !== card.secao) groups.push([card.secao, [index]]);
    else lastGroup[1].push(index);
  });
  const position = new Map(report.results.map((r, i) => [r, i]));
  const parts: string[] = [];
  const nav: [string, string, number, string][] = [];
  groups.forEach(([secao, cardIndexes], sIndex) => {
    const secId = `sec-${sIndex}`;
    const statuses = cardIndexes.flatMap((ci) => resultsByCard(report, ci).map((r) => STATUS[r.status][1]));
    nav.push([secId, secao, statuses.length, worst(statuses)]);
    parts.push(
      `<section class="rp-section" id="${secId}" aria-labelledby="${secId}-t">` +
        `<div class="rp-section__head"><h2 class="rp-section__title" id="${secId}-t">${e(secao)}</h2>` +
        `<span class="mb-count mb-count--pill">${statuses.length}</span></div>`,
    );
    for (const ci of cardIndexes) {
      const card = spec.cards[ci]!;
      const title = card.titulo || card.evento;
      const results = resultsByCard(report, ci);
      parts.push(
        `<div class="rp-card" id="card-${ci}"><div class="rp-card__spec">` +
          `<h3 class="rp-card__title">${e(title)}</h3>` +
          `<span class="rp-card__event">${e(card.evento)}</span></div><div class="rp-cols">`,
      );
      if (results.some((r) => pyTruthy(r.variant.flow))) {
        for (const [flow, name] of spec.fluxos) {
          const blocks = results
            .filter((r) => r.variant.flow === flow)
            .map((r) => variantHtml(report, r, position.get(r)!, flowShortLabel(report, flow)))
            .join("");
          if (blocks)
            parts.push(
              `<div class="rp-col" style="--flow-color:${flowColors.get(flow)}">` + `<h4 class="rp-col__title">${e(name)}</h4>${blocks}</div>`,
            );
        }
      } else {
        parts.push('<div class="rp-col">' + results.map((r) => variantHtml(report, r, position.get(r)!, null)).join("") + "</div>");
      }
      parts.push("</div></div>");
    }
    parts.push("</section>");
  });
  return [parts.join(""), nav];
}

function table(report: Report): string {
  const head: [string, string][] = [
    ["Status", ""],
    ["Seção", ""],
    ["Fluxo", ""],
    ["Evento", ""],
    ["Variação", ""],
    ["Divergências", ""],
    ["Horário", ""],
    ["Disparos", "num"],
  ];
  const ths = head
    .map(([name, kind]) =>
      `<th scope="col"${kind ? ` data-type='${kind}'` : ""}>${name}${icon("chevron-down", 10, 2)}</th>`.replace(
        'class="mb-icon"',
        'class="mb-icon rp-sort"',
      ),
    )
    .join("");
  const rows = report.results.map((result) => {
    const card = report.spec.cards[result.variant.card_index]!;
    const dataS = STATUS[result.status][1];
    const flow = pyTruthy(result.variant.flow) ? (report.spec.fluxos.get(result.variant.flow!) ?? "—") : "—";
    const time = result.matched && result.matched.time_str ? result.matched.time_str : "";
    return (
      `<tr data-s="${dataS}" data-target="card-${result.variant.card_index}" ` +
      `data-q="${e(searchText(report, result))}" title="Abrir o card">` +
      `<td data-sort="${RANK[dataS]}">${statusIndicator(result)}</td><td>${e(card.secao)}</td>` +
      `<td>${e(flow)}</td><td class="ev">${e(result.variant.event)}</td>` +
      `<td class="mono">${e(variation(result))}</td><td title="${e(divergences(result))}">${e(divergences(result))}</td>` +
      `<td class="mono">${e(time)}</td><td class="num">${result.occurrences}</td></tr>`
    );
  });
  return `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${ths}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function extraRows(items: ExtraEvent[], withDetails: boolean): string {
  const kind = withDetails ? "extra" : "alert";
  return items
    .map((item) => {
      const cells = [item.event, item.screen || "—"];
      if (withDetails) cells.push(item.component || "—", item.detail || "—");
      const q = cells.join(" ").toLowerCase();
      return `<tr data-k="${kind}" data-q="${e(q)}">` + cells.map((c) => `<td>${e(c)}</td>`).join("") + `<td class="num">${item.count}&#215;</td></tr>`;
    })
    .join("");
}

function extras(report: Report): string {
  const box = (title: string, glyph: string, items: ExtraEvent[], heads: string[], withDetails: boolean, empty: string) => {
    const body = items.length
      ? `<table class="rp-mini"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead>` +
        `<tbody>${extraRows(items, withDetails)}</tbody></table>`
      : `<p class="rp-none">${empty}</p>`;
    return `<div class="mb-card"><h3>${icon(glyph, 14)}${title} <span class="mb-count mb-count--pill">${items.length}</span></h3>${body}</div>`;
  };
  return (
    '<section class="rp-extras" id="fora-da-spec" aria-labelledby="fora-t">' +
    '<div class="rp-section__head"><h2 class="rp-section__title" id="fora-t">Fora da spec e observações</h2></div>' +
    '<div class="rp-extras__grid">' +
    box("Eventos dos fluxos que nenhum card cobre", "layers", report.extras, ["Evento", "Tela", "component", "detail"], true, "Nenhum evento fora da spec.") +
    box("Alertas nas telas da spec", "circle-alert", report.alerts, ["Evento", "Tela"], false, "Nenhum app_exception ou error_view.") +
    '</div><p class="rp-rule">Cada variação é validada pelo disparo mais recente. O aviso de disparos ' +
    "anteriores aparece quando um disparo antigo teve uma divergência diferente.</p></section>"
  );
}

function seg(cls: string, items: [string, string][], attr: string, selected: string, label: string): string {
  const buttons = items
    .map(
      ([v, content]) =>
        `<button type="button" class="mb-seg__item${v === selected ? " is-selected" : ""}" ` +
        `data-${attr}="${v}" aria-pressed="${v === selected ? "true" : "false"}">${content}</button>`,
    )
    .join("");
  return `<div class="mb-seg ${cls}" role="group" aria-label="${label}"><span class="mb-seg__thumb"></span>${buttons}</div>`;
}

function ring(report: Report): string {
  const t = totals(report);
  const radius = 64;
  const circ = 2 * Math.PI * radius;
  const total = t.total || 1;
  const parts: string[] = [];
  let start = 0;
  for (const [kind, count] of [
    ["ok", t.ok],
    ["err", t.divergent],
    ["miss", t.missing],
  ] as [string, number][]) {
    const length = (circ * count) / total;
    if (count)
      parts.push(
        `<circle class="rp-ring__seg rp-ring__seg--${kind}" cx="76" cy="76" r="${radius}" ` +
          `data-len="${pyFixed(length, 2)}" data-start="${pyFixed(start, 2)}" ` +
          `stroke-dasharray="${pyFixed(length, 2)} ${pyFixed(circ, 2)}" stroke-dashoffset="${pyFixed(-start, 2)}"/>`,
      );
    start += length;
  }
  const rate = complianceRate(report);
  return (
    `<div class="rp-ring" data-c="${pyFixed(circ, 2)}" data-rate="${floatRepr(rate)}">` +
    `<svg viewBox="0 0 152 152" aria-hidden="true"><circle class="rp-ring__track" cx="76" cy="76" r="${radius}"/>` +
    `${parts.join("")}</svg><div class="rp-ring__label"><span class="rp-ring__value">${pct(rate)}</span>` +
    `<span class="rp-ring__caption">conforme</span></div></div>`
  );
}

function tile(filter: string, v: number, kind: string, glyph: string, word: string): string {
  return (
    `<button type="button" class="rp-tile" data-filter="${filter}"><span class="rp-tile__value">${v}</span>` +
    `<span class="mb-status mb-status--${kind}">${icon(glyph, 12, 2.2)}<span>${word}</span></span></button>`
  );
}

function period(report: Report): string {
  const p = logPeriod(report);
  if (!p) return "";
  const dur = p.duration ? `<span class="rp-period__dur">${e(p.duration)}</span>` : "";
  return (
    `<span class="rp-period" title="Primeiro e último evento do log auditado">${icon("radio-tower", 13, 1.8)}` +
    `<span class="rp-period__label">Log</span><time>${e(p.start)}</time>` +
    `<span class="rp-period__to">até</span><time>${e(p.end)}</time>${dur}</span>`
  );
}

function csp(): string {
  return (
    `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src ${reportInlineHashes().scripts.join(" ")}; ` +
    "base-uri 'none'; form-action 'none'"
  );
}

const two = (n: number) => String(n).padStart(2, "0");

/** `strftime("%d/%m/%Y %H:%M")` no horário local, como o `datetime.now()` do Python. */
export function formatWhen(d: Date): string {
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Campos opcionais da exportação: port de `service.export_info`. */
export const EXPORT_INFO_FIELDS: [string, string][] = [
  ["versao", "versão"],
  ["conta", "conta"],
  ["cooperativa", "cooperativa"],
  ["codigo_usuario", "usuário"],
];

export function exportInfo(info: unknown): [string, string][] {
  if (info === null || info === undefined) return [];
  if (typeof info !== "object" || Array.isArray(info)) throw new EngineError("info precisa ser um objeto.");
  const pares: [string, string][] = [];
  for (const [key, label] of EXPORT_INFO_FIELDS) {
    const raw = (info as Record<string, unknown>)[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "string") throw new EngineError(`info.${key} precisa ser texto.`);
    const v = [...pyStrip(raw)].slice(0, 120).join("");
    if (v) pares.push([label, v]);
  }
  return pares;
}

export interface HtmlOptions {
  /** Instante de "gerado em" (padrão: agora, no horário local). */
  now?: Date;
  /** Versão no rodapé e no `generator`: "Gerado pelo Mo baile <versão>". */
  version: string;
}

export function generateInteractiveHtml(report: Report, info: [string, string][], options: HtmlOptions): string {
  const spec = report.spec;
  const t = totals(report);
  const when = formatWhen(options.now ?? new Date());
  const version = options.version;
  const projeto = e(spec.projeto);
  const platform = report.platform.toLowerCase();
  const rate = pct(complianceRate(report));
  const [bodySections, nav] = sections(report);

  const filters: [string, string, number][] = [
    ["all", "Todas", t.total],
    ["action", "Pedem Ação", t.error],
    ["err", "Divergentes", t.divergent],
    ["miss", "Não Disparadas", t.missing],
    ["ok", "OK", t.ok],
    ["off", "Fora da Spec", report.extras.length],
  ];
  const filterSeg = seg(
    "rp-filter",
    filters.map(([key, name, n]) => [
      key,
      `<span aria-label="${name} (${n})">${name}</span><span class="mb-count mb-count--pill" aria-hidden="true">${n}</span>`,
    ]),
    "filter",
    "all",
    "Filtrar por status",
  );
  const viewSeg = seg("rp-viewseg mb-seg--small", [["cards", "Cards"], ["table", "Tabela"]], "view", "cards", "Visão");
  const themeSeg = seg(
    "rp-theme mb-seg--small",
    [
      ["auto", icon("contrast", 12) + '<span class="rp-sr">Automático</span>'],
      ["light", icon("sun", 12) + '<span class="rp-sr">Claro</span>'],
      ["dark", icon("moon", 12) + '<span class="rp-sr">Escuro</span>'],
    ],
    "pick-theme",
    "auto",
    "Aparência",
  );
  const navItems = nav
    .map(
      ([sid, name, n, w]) =>
        `<li><a href="#${sid}"><span class="rp-dot rp-dot--${w}"></span>` +
        `<span class="rp-nav__name">${e(name)}</span><span class="mb-count">${n}</span></a></li>`,
    )
    .join("");
  const extrasN = report.extras.length + report.alerts.length;
  const meta = [
    `<span class="rp-chip rp-chip--${e(platform)}">${icon("smartphone", 11, 2)}${e(report.platform.toUpperCase())}</span>`,
    period(report),
  ];
  if (report.log_stats.exportados !== undefined) {
    // Export do GA4: diz o que deu para conferir; o resto aparece como "não exportado".
    const campos = report.log_stats.exportados.join(", ") || "só o nome do evento";
    meta.push(`<span>export do GA4 · confere ${e(campos)}</span>`);
  }
  if (spec.versao_especificacao) meta.push(`<span>spec ${e(spec.versao_especificacao)}</span>`);
  meta.push(`<span>${spec.cards.length} cards</span>`, `<span>${t.total} validações</span>`, `<span>gerado em ${when}</span>`);
  meta.push(...info.map(([label, v]) => `<span class="rp-info">${e(label)} <strong>${e(v)}</strong></span>`));

  return [
    "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    `<meta http-equiv="Content-Security-Policy" content="${csp()}">`,
    '<meta name="color-scheme" content="light dark"><meta name="generator" content="Mo baile ',
    e(version),
    '">',
    `<title>Relatório · ${projeto}</title>`,
    `<link rel="icon" href="${iconDataUri}">`,
    `<script>${HEAD_JS}</script>`,
    `<style>${designSystemCss}</style><style>${reportCss}</style>`,
    "</head><body class='mb-root'>",
    '<header class="rp-toolbar"><div class="rp-brand">',
    `<img src="${iconDataUri}" alt="Mo baile"><div class="mb-truncate"><div class="rp-brand__title">Relatório</div>`,
    `<div class="rp-brand__sub mb-truncate">${projeto} · ${t.total} validações · ${rate} conforme</div></div></div>`,
    `<label class="mb-search">${icon("search", 12)}<span class="rp-sr">Buscar</span>`,
    '<input id="rp-q" type="search" placeholder="Buscar em eventos, parâmetros e divergências" autocomplete="off">',
    '<span class="mb-kbd">/</span></label>',
    themeSeg,
    "</header>",
    '<div class="rp-shell">',
    '<nav class="rp-sidebar" aria-label="Seções"><div class="rp-sidebar__label">Relatório</div><ul class="rp-nav">',
    `<li><a href="#resumo"><span class="rp-dot rp-dot--${worst(report.results.map((r) => STATUS[r.status][1]))}"></span>`,
    `<span class="rp-nav__name">Resumo</span><span class="mb-count">${rate}</span></a></li></ul>`,
    `<div class="rp-sidebar__label">Seções da spec</div><ul class="rp-nav">${navItems}</ul>`,
    '<ul class="rp-nav"><li><a href="#fora-da-spec"><span class="rp-dot rp-dot--off"></span>',
    `<span class="rp-nav__name">Fora da spec</span><span class="mb-count">${extrasN}</span></a></li></ul>`,
    '<div class="rp-sidebar__label">Atalhos</div><div class="rp-shortcuts">',
    "<kbd>/</kbd><span>buscar</span><kbd>1&#8211;6</kbd><span>filtrar por status</span>",
    "<kbd>t</kbd><span>cards ou tabela</span><kbd>b</kbd><span>expandir os blocos</span></div></nav>",
    '<main class="rp-main">',
    `<section class="rp-hero" id="resumo" aria-label="Resumo">${ring(report)}<div>`,
    `<h1 class="rp-hero__title">Auditoria de tagueamento · ${projeto}</h1>`,
    `<div class="rp-hero__meta">${meta.join("")}</div><div class="rp-tiles">`,
    tile("ok", t.ok, "ok", "circle-check", "OK"),
    tile("err", t.divergent, "error", "circle-x", "Divergentes"),
    tile("miss", t.missing, "warn", "triangle-alert", "Não disparadas"),
    tile("off", report.extras.length, "off", "minus", "Fora da spec"),
    tile("off", report.alerts.length, report.alerts.length ? "error" : "off", "circle-alert", "Alertas"),
    `</div><p class="rp-hero__stats">${e(summaryLines(report)[1]!)}</p></div></section>`,
    `<div class="rp-filterbar">${filterSeg}${viewSeg}<span class="rp-filterbar__spacer"></span>`,
    '<span class="rp-result-count" aria-live="polite"></span>',
    `<button type="button" class="mb-btn mb-btn--small" data-act="blocks" aria-pressed="false">${icon("braces", 12)}`,
    "<span>Expandir Blocos</span></button></div>",
    `<div class="rp-view rp-view--cards">${bodySections}</div>`,
    `<div class="rp-view rp-view--table" hidden>${table(report)}</div>`,
    `<div class="rp-empty mb-empty" hidden><span class="mb-empty__icon">${icon("list-filter", 28, 1.4)}</span>`,
    '<p class="mb-empty__title">Nada neste filtro</p><p class="mb-empty__text">Nenhuma validação bate com o status ' +
      'e a busca escolhidos.</p><button type="button" class="mb-btn" data-act="all">Mostrar Todas</button></div>',
    extras(report),
    `<footer class="rp-footer"><img src="${iconDataUri}" alt=""><span>Gerado pelo <b>Mo baile</b> ${e(version)}</span>`,
    `<span class="rp-footer__sep">·</span><span>${when}</span><span class="rp-footer__sep">·</span>`,
    '<span>auditoria de tagueamento contra a spec do Figma</span><span class="rp-footer__sep">·</span>',
    `<span>animações com Motion ${MOTION_VERSION} (MIT) e ícones Lucide (ISC)</span></footer>`,
    "</main></div>",
    '<dialog class="rp-lightbox" aria-label="Print do card"><div class="rp-lightbox__frame"><div class="rp-lightbox__bar">',
    `<span></span><button type="button" class="mb-btn mb-btn--small mb-btn--plain" data-act="close" aria-label="Fechar">` +
      `${icon("x", 13)}</button></div><img alt=""></div></dialog>`,
    `<div class="rp-toast" role="status">${icon("check", 13, 2.2)}<span></span></div>`,
    `<script>${motionJs}</script><script>${reportJs}</script>`,
    "</body></html>",
  ].join("");
}
