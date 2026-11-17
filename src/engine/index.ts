/**
 * Motor do Mo baile Web: auditoria de tagueamento (Firebase Analytics) no navegador.
 *
 * Contrato público usado pela interface (`src/ui`). É um port das regras do
 * motor Python do Mo baile (`services/report` e `domain/report.py`), com os
 * mesmos campos do `report.audit` do protocolo RPC no formato da versão web do
 * Mo baile (`mobaile.web`). A paridade é provada por `test/parity.test.ts`
 * contra o gabarito gerado pelo motor Python (`tools/golden`).
 *
 * Nada aqui faz rede, lê disco ou guarda estado global: entra texto, sai objeto.
 * Diferenças deliberadas (sem caminho de disco, OCR próprio, sem board, `source`
 * fixo) estão em docs/PARIDADE.md.
 *
 * Os objetos devolvidos por `loadSpec`, `readLog` e `audit` levam, num campo
 * oculto, a versão interna (com os tipos do Python) que as etapas seguintes
 * usam. Passe-os adiante como vieram: uma cópia (`structuredClone`, JSON) perde
 * esse campo, e `exportHtml` pede para rodar a auditoria de novo.
 */

import VERSION from "../../VERSION?raw";
import { analyticsPy } from "./analytics";
import { runAudit } from "./audit";
import { EngineError, INTERNAL_MESSAGE } from "./errors";
import { eventsFromItems, itemsFromText } from "./firebaseLog";
import { exportInfo, generateInteractiveHtml, reportInlineHashes, type InlineHashes } from "./html";
import { htmlFileName as fileName, safeFileStem } from "./names";
import { reportPayloadPy, specSummaryPy } from "./payload";
import { cmpCodePoints, fromJs, JSONDecodeError, PyInternalError, pyJsonDumps, pyJsonLoads, pyStrip, strRepr, toJs, type Json, type PyDict, type PyValue } from "./py";
import { readCard, type OcrLine } from "./prints/cardReader";
import { checklistMarkdown } from "./prints/checklist";
import { buildSpec, reviewMarkdown } from "./prints/draft";
import { PLATFORMS, specFromDict, type Report, type SpecTemplate } from "./spec";

export { EngineError } from "./errors";
export { reportInlineHashes, type InlineHashes };
export type { Json };

export type Platform = "android" | "ios";

const INTERNAL = Symbol("mobaile.interno");

/** Erro previsto vira mensagem para a tela; erro não previsto vira o "Erro interno no motor." do Mo baile. */
function guard<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (err instanceof EngineError) throw err;
    if (err instanceof PyInternalError || err instanceof RangeError) throw new EngineError(INTERNAL_MESSAGE, "internal_error");
    throw err;
  }
}

function hide<T extends object>(target: T, value: unknown): T {
  Object.defineProperty(target, INTERNAL, { value, enumerable: false });
  return target;
}

// ---------------------------------------------------------------------- spec

export interface SpecCard {
  secao: string;
  titulo: string | null;
  evento: string;
  params: Record<string, Json>;
  variacoes: Record<string, Json>[];
  por_fluxo: boolean | null;
  params_por_fluxo: Record<string, Record<string, Json>>;
  obs: string | Record<string, string> | null;
}

/** Spec da demanda já validada (o JSON exportado/editado no Mo baile), sem prints. */
export interface Spec {
  name: string;
  projeto: string;
  versao_especificacao: string | null;
  plataforma: string;
  fluxos: { key: string; label: string }[];
  cards: SpecCard[];
}

/** Resumo da spec, igual ao `report.spec` da versão web (sem `path`, `prints_dir` nem `prints_dir_exists`). */
export interface SpecSummary {
  name: string;
  projeto: string;
  versao_especificacao: string | null;
  plataforma: string;
  fluxos: { key: string; label: string }[];
  cards: number;
  variants: number;
  sections: string[];
}

function publicSpec(spec: SpecTemplate, name: string): Spec {
  const out: Spec = {
    name,
    projeto: spec.projeto,
    versao_especificacao: spec.versao_especificacao,
    plataforma: spec.plataforma,
    fluxos: [...spec.fluxos].map(([key, label]) => ({ key, label })),
    cards: spec.cards.map((c) => ({
      secao: c.secao,
      titulo: c.titulo,
      evento: c.evento,
      params: toJs(c.params) as Record<string, Json>,
      variacoes: c.variacoes.map((v) => toJs(v) as Record<string, Json>),
      por_fluxo: c.por_fluxo,
      params_por_fluxo: toJs(c.params_por_fluxo as unknown as PyDict) as Record<string, Record<string, Json>>,
      obs: c.obs instanceof Map ? (toJs(c.obs as unknown as PyDict) as Record<string, string>) : c.obs,
    })),
  };
  return hide(out, spec);
}

/** A versão interna da spec; sem ela (objeto copiado), valida de novo a partir dos campos públicos. */
function internalSpec(spec: Spec): SpecTemplate {
  const hidden = (spec as unknown as Record<symbol, SpecTemplate | undefined>)[INTERNAL];
  if (hidden) return hidden;
  const data: PyDict = new Map<string, PyValue>([
    ["projeto", spec.projeto],
    ["versao_especificacao", spec.versao_especificacao],
    ["plataforma", spec.plataforma],
    ["fluxos", new Map(spec.fluxos.map((f) => [f.key, f.label]))],
    ["cards", spec.cards.map((c) => fromJs(c))],
  ]);
  return webSpec(specFromDict(data));
}

/** A versão web não lê imagem do disco: a spec perde os prints (`WebReportService`). */
function webSpec(spec: SpecTemplate): SpecTemplate {
  spec.prints_dir = null;
  for (const card of spec.cards) card.print_name = null;
  return spec;
}

/** Lê e valida a spec (texto do JSON). Lança EngineError com mensagem para a tela. */
export function loadSpec(text: string, name = "spec.json"): Spec {
  return guard(() => {
    let data: PyValue;
    try {
      data = pyJsonLoads(text);
    } catch (err) {
      if (err instanceof JSONDecodeError)
        throw new EngineError(`A spec ${name} não é um JSON válido (linha ${err.lineno}, coluna ${err.colno}).`);
      throw err;
    }
    return publicSpec(webSpec(specFromDict(data)), name);
  });
}

export function specSummary(spec: Spec, name: string = spec.name): SpecSummary {
  return guard(() => toJs(specSummaryPy(internalSpec(spec), name)) as unknown as SpecSummary);
}

// ----------------------------------------------------------------------- log

/** Itens lidos de um log (logcat salvo, JSON do Firebase ou export do Mo baile). */
export interface LogRead {
  name: string;
  format: "logcat" | "json";
  /** Quantos itens o arquivo tem (antes de filtrar a plataforma). */
  count: number;
  /** Itens crus, com os tipos do Python: opacos para a interface. */
  items: unknown[];
}

/** Lê o log como texto (UTF-8 ou UTF-16 com BOM já decodificado por `decodeText`). */
export function readLog(text: string, name = "log.txt"): LogRead {
  return guard(() => {
    const read = itemsFromText(text);
    if (!read.items.length) throw new EngineError(`O log ${name} não tem eventos do Firebase Analytics.`);
    return { name, format: read.format, count: read.items.length, items: read.items };
  });
}

// ------------------------------------------------------------------- auditoria

export interface LogStats {
  total_lidos: number;
  da_plataforma: number;
  duplicados: number;
  uteis: number;
}

export interface AuditSummary {
  total: number;
  ok: number;
  divergent: number;
  missing: number;
  compliance_rate: number;
  extras: number;
  alerts: number;
}

export interface FieldCheck {
  field: string;
  expected: string;
  /** Valor do log como texto (JSON quando não é texto), ou `null` se o parâmetro não veio. */
  obtained: string | null;
  ok: boolean;
}

export interface MatchedEvent {
  /** Id inteiro do item no log, ou `null` quando não é inteiro. */
  id: number | null;
  time: string | null;
  event_name: string;
  params: Record<string, Json>;
}

/** Uma linha do resultado: um card x fluxo x variação da spec. */
export interface AuditRow {
  id: number;
  card_index: number;
  section: string;
  card_title: string;
  flow: string | null;
  flow_label: string | null;
  event: string;
  variation: string;
  status: "ok" | "error" | "missing";
  checks: FieldCheck[];
  expected: { key: string; value: string | null }[];
  matched: MatchedEvent | null;
  occurrences: number;
  older_divergent: number;
  older_divergences: string[];
  ga_screen: Json;
  note: string | null;
  divergences: string;
  block: string;
}

export interface ExtraEvent {
  event: string;
  screen: string | null;
  flow_name: string | null;
  component: string | null;
  detail: string | null;
  count: number;
}

/** Igual ao `report.audit` da versão web do Mo baile, com `log_name` no lugar de `log_path`. */
export interface AuditReport {
  spec: SpecSummary;
  platform: Platform;
  source: "file";
  log_name: string;
  log_stats: LogStats;
  summary: AuditSummary;
  results: AuditRow[];
  extras: ExtraEvent[];
  alerts: ExtraEvent[];
  observations: string;
  markdown: string;
  tsv: string;
}

interface Internal {
  report: Report;
  payload: PyDict;
}

/** Audita o log contra a spec, como o `report.audit` com `source: "file"`. */
export function audit(spec: Spec, log: LogRead, options: { platform?: Platform | null } = {}): AuditReport {
  return guard(() => {
    const platform = options.platform ?? null;
    if (platform !== null && !(PLATFORMS as readonly string[]).includes(platform))
      throw new EngineError("platform precisa ser android ou ios.");
    if (!log.items.length) throw new EngineError(`O log ${log.name} não tem eventos do Firebase Analytics.`);
    const template = internalSpec(spec);
    const chosen = (platform || template.plataforma).toLowerCase();
    const [events, stats] = eventsFromItems(log.items as PyDict[], chosen);
    const report = runAudit(template, events, chosen, stats);
    const payload = reportPayloadPy(report, spec.name, log.name);
    return hide(toJs(payload) as unknown as AuditReport, { report, payload } satisfies Internal);
  });
}

function internalReport(report: AuditReport): Internal {
  const hidden = (report as unknown as Record<symbol, Internal | undefined>)[INTERNAL];
  if (!hidden) throw new EngineError("Nenhuma auditoria para exportar. Rode a auditoria primeiro.");
  return hidden;
}

/** O resultado da auditoria em JSON, byte a byte igual ao do Mo baile (floats, ordem e acentos). */
export function reportJson(report: AuditReport): string {
  return pyJsonDumps(internalReport(report).payload, { indent: 2 }) + "\n";
}

// ------------------------------------------------------------------ exportação

export interface ExportInfo {
  /** Campos opcionais do cabeçalho do relatório, como na folha de exportação do app. */
  versao?: string;
  conta?: string;
  cooperativa?: string;
  codigo_usuario?: string;
}

export interface ExportOptions {
  /** Instante de "gerado em" (padrão: agora). */
  now?: Date;
  /** Texto depois de "Gerado pelo Mo baile" (padrão: `Web <versão do site>`). */
  version?: string;
}

/** Versão do site, mostrada no rodapé do relatório. */
export const WEB_VERSION = VERSION.trim();

/** Relatório HTML autocontido, na identidade do relatório do Mo baile. */
export function exportHtml(report: AuditReport, info: ExportInfo = {}, options: ExportOptions = {}): string {
  return guard(() => {
    const { report: internal } = internalReport(report);
    return generateInteractiveHtml(internal, exportInfo(info), {
      now: options.now ?? new Date(),
      version: options.version ?? `Web ${WEB_VERSION}`,
    });
  });
}

/** Nome do HTML exportado: `relatorio_<projeto>_<android|ios>_<dd-mm-aaaa>.html`. */
export function htmlFileName(report: AuditReport, now: Date = new Date()): string {
  return fileName(report.spec.projeto, report.platform, now);
}

// ------------------------------------------------------------------- analytics

/** Evento do Analytics normalizado (o `TagEvent` do Python). */
export interface TagEvent {
  id: Json;
  event_name: string;
  params: Record<string, Json>;
  platform: Platform;
  raw_log: string | null;
  time_str: string | null;
  origin: string | null;
}

export interface AnalyticsRead {
  platform: Platform;
  stats: LogStats;
  events: TagEvent[];
  /** Colunas do "Exportar TSV" do app: Hora, Plataforma, Origem, Nome do Evento, Parâmetros Principais, JSON. */
  tsv: string;
  /** Os eventos em JSON (indentado), que a auditoria também aceita como log. */
  json: string;
}

/** Eventos de um logcat salvo (Android) para a aba Analytics. */
export function analyticsFromLog(text: string): AnalyticsRead {
  return guard(() => toJs(analyticsPy(text)) as unknown as AnalyticsRead);
}

// ----------------------------------------------------------------- arquivos

/** Limites de tamanho do Mo baile para os arquivos enviados. */
export const MAX_SPEC_BYTES = 5 * 1024 * 1024;
export const MAX_LOG_BYTES = 64 * 1024 * 1024;

/** Recusa arquivo maior que o limite do Mo baile, antes de ler. */
export function checkFileSize(kind: "spec" | "log", bytes: number): void {
  const limit = kind === "spec" ? MAX_SPEC_BYTES : MAX_LOG_BYTES;
  if (bytes > limit) throw new EngineError(`O arquivo de ${kind} passa do limite de ${Math.floor(limit / (1024 * 1024))} MB.`);
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean, strict: boolean, label: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  const whole = bytes.length - (bytes.length % 4);
  for (let i = 0; i < whole; i += 4) {
    const cp = view.getUint32(i, littleEndian);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      if (strict) throw new EngineError(`O arquivo de ${label} não está em UTF-8 nem em UTF-16.`);
      out += "�";
    } else out += String.fromCodePoint(cp);
  }
  if (whole !== bytes.length) {
    if (strict) throw new EngineError(`O arquivo de ${label} não está em UTF-8 nem em UTF-16.`);
    out += "�";
  }
  return out;
}

/**
 * Decodifica bytes de arquivo respeitando BOM (o `>` do PowerShell 5 grava
 * UTF-16), como o `decode_text` da versão web do Mo baile. Com `strict` (a
 * spec), byte inválido é recusado; sem ele (o log), vira `�`.
 */
export function decodeText(bytes: Uint8Array, options: { label?: "spec" | "log"; strict?: boolean } = {}): string {
  const { label = "log", strict = false } = options;
  const starts = (...bom: number[]) => bom.every((b, i) => bytes[i] === b);
  let encoding = "utf-8";
  let body = bytes;
  if (starts(0xff, 0xfe, 0x00, 0x00)) return decodeUtf32(bytes.subarray(4), true, strict, label);
  if (starts(0x00, 0x00, 0xfe, 0xff)) return decodeUtf32(bytes.subarray(4), false, strict, label);
  if (starts(0xef, 0xbb, 0xbf)) body = bytes.subarray(3);
  else if (starts(0xff, 0xfe)) [encoding, body] = ["utf-16le", bytes.subarray(2)];
  else if (starts(0xfe, 0xff)) [encoding, body] = ["utf-16be", bytes.subarray(2)];
  try {
    return new TextDecoder(encoding, { fatal: strict, ignoreBOM: true }).decode(body);
  } catch {
    throw new EngineError(`O arquivo de ${label} não está em UTF-8 nem em UTF-16.`);
  }
}

// ------------------------------------------------------------ importação de prints

export type { OcrLine };

/** Um print da pasta, já lido pelo OCR. `nome` é o nome do arquivo (ou o caminho dentro da pasta). */
export interface PrintLido {
  nome: string;
  linhas: readonly OcrLine[];
}

export interface DuvidaDoPrint {
  print: string;
  event: string;
  doubts: string[];
}

/** O que `report.import` grava e devolve, sem disco: os três arquivos em texto e a revisão. */
export interface RascunhoDosPrints {
  projeto: string;
  specName: string;
  reviewName: string;
  checklistName: string;
  specJson: string;
  reviewMd: string;
  checklistMd: string;
  review: DuvidaDoPrint[];
  doubtsTotal: number;
}

/** Mais que isso não é um card por print: é a pasta errada (o mesmo limite do Mo baile). */
export const MAX_PRINTS = 300;

/**
 * Rascunho da spec a partir dos prints de uma pasta já lidos pelo OCR: o
 * `report.import` do Mo baile depois do OCR. Os prints vão em ordem de nome,
 * um card por print; o nome do projeto, se vazio, é o da pasta.
 */
export function rascunhoDosPrints(
  prints: readonly PrintLido[],
  options: { pasta: string; projeto?: string; plataforma?: string; agora?: Date },
): RascunhoDosPrints {
  return guard(() => {
    const chosen = (options.plataforma || "android").toLowerCase();
    if (!(PLATFORMS as readonly string[]).includes(chosen)) {
      throw new EngineError(`Plataforma inválida: ${strRepr(chosen)}. Use android ou ios.`);
    }
    if (!prints.length) throw new EngineError(`Nenhuma imagem em ${options.pasta}. Use os prints dos cards em PNG ou JPG.`);
    if (prints.length > MAX_PRINTS) {
      throw new EngineError(`${prints.length} imagens em ${options.pasta}; o limite é ${MAX_PRINTS} prints por spec.`);
    }
    const ordem = [...prints].sort((a, b) => cmpCodePoints(a.nome, b.nome));
    const cards = ordem.map((p) => readCard(p.linhas, `${options.pasta}/${p.nome}`));
    const projeto = pyStrip(options.projeto ?? "") || options.pasta;
    const [spec, review] = buildSpec(cards, projeto, chosen, options.pasta);
    const stem = safeFileStem(projeto, "spec");
    const specName = `${stem}.json`;
    const lista = review.map((r) => ({
      print: r.get("print") as string,
      event: r.get("evento") as string,
      doubts: [...(r.get("duvidas") as string[])],
    }));
    return {
      projeto,
      specName,
      reviewName: `${stem}.revisao.md`,
      checklistName: `${stem}.checklist.md`,
      specJson: pyJsonDumps(spec, { indent: 2 }) + "\n",
      reviewMd: reviewMarkdown(spec, review),
      checklistMd: checklistMarkdown(spec, review, { specName, generatedAt: options.agora ?? new Date() }),
      review: lista,
      doubtsTotal: lista.reduce((s, r) => s + r.doubts.length, 0),
    };
  });
}
