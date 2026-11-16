/**
 * Motor do Mo baile Web: auditoria de tagueamento (Firebase Analytics) no navegador.
 *
 * Contrato público usado pela interface (`src/ui`). É um port das regras do
 * motor Python do Mo baile (`engine/src/mobaile/services/report` e
 * `domain/report.py`), com os mesmos nomes de campo do `report.audit` do
 * protocolo RPC, para que o resultado seja comparável um a um. A paridade é
 * provada por `test/parity.test.ts` contra o gabarito gerado pelo motor Python
 * (`tools/golden`).
 *
 * Nada aqui faz rede, lê disco ou guarda estado: entra texto, sai objeto.
 * Diferenças deliberadas em relação ao Python (sem caminho de disco, sem prints,
 * sem OCR) estão em docs/PARIDADE.md.
 *
 * ESTE ARQUIVO É O CONTRATO INICIAL (stub). O port completo substitui as
 * implementações mantendo os nomes exportados.
 */

export type Platform = "android" | "ios";

/** Erro de entrada do usuário (spec inválida, log sem eventos...): mensagem pronta para a tela, em pt-BR. */
export class EngineError extends Error {
  constructor(message: string, readonly kind: string = "invalid_input") {
    super(message);
    this.name = "EngineError";
  }
}

/** Spec da demanda já validada (o JSON exportado/editado no Mo baile). */
export interface Spec {
  projeto: string;
  versao_especificacao: string | null;
  plataforma: string;
  fluxos: { key: string; label: string }[];
  cards: unknown[];
  [extra: string]: unknown;
}

/** Resumo da spec, igual ao `report.spec` (sem `path`, `prints_dir` nem `prints_dir_exists`). */
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
  obtained: string;
  ok: boolean;
}

export interface MatchedEvent {
  id: number | string;
  time: string | null;
  event_name: string;
  params: Record<string, unknown>;
}

/** Uma linha do resultado: um card x variação da spec. */
export interface AuditRow {
  id: number;
  card_index: number;
  section: string;
  card_title: string;
  flow: string | null;
  flow_label: string | null;
  event: string;
  variation: string;
  status: string;
  checks: FieldCheck[];
  expected: { key: string; value: string }[];
  matched: MatchedEvent | null;
  occurrences: number;
  older_divergent: number;
  older_divergences: unknown[];
  ga_screen: string | null;
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

/** Igual ao `report.audit` do Mo baile, com `log_name` no lugar de `log_path`. */
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

/** Evento do Analytics normalizado (o `TagEvent` do Python). */
export interface TagEvent {
  id: number | string;
  event_name: string;
  params: Record<string, unknown>;
  platform: Platform;
  raw_log: string | null;
  time_str: string | null;
  origin: string | null;
}

/** Itens lidos de um log (logcat salvo, JSON do Firebase ou export do Mo baile). */
export interface LogRead {
  name: string;
  format: "logcat" | "json";
  items: unknown[];
}

export interface AnalyticsRead {
  platform: Platform;
  stats: LogStats;
  events: TagEvent[];
  tsv: string;
  json: string;
}

export interface ExportInfo {
  /** Campos opcionais do cabeçalho do relatório (responsável, ambiente...), como no export do app. */
  [campo: string]: string | undefined;
}

const naoImplementado = (): never => {
  throw new EngineError("Motor ainda não implementado.", "not_implemented");
};

/** Lê e valida a spec (texto do JSON). Lança EngineError com mensagem para a tela. */
export function loadSpec(_text: string, _name = "spec.json"): Spec {
  return naoImplementado();
}

export function specSummary(_spec: Spec, _name: string): SpecSummary {
  return naoImplementado();
}

/** Lê o log como texto (UTF-8 ou UTF-16 com BOM já decodificado pela interface). */
export function readLog(_text: string, _name = "log.txt"): LogRead {
  return naoImplementado();
}

/** Audita o log contra a spec, como o `report.audit` com `source: "file"`. */
export function audit(_spec: Spec, _log: LogRead, _options: { platform?: Platform } = {}): AuditReport {
  return naoImplementado();
}

/** Relatório HTML autocontido, na identidade do relatório do Mo baile. */
export function exportHtml(_report: AuditReport, _info: ExportInfo = {}): string {
  return naoImplementado();
}

/** Eventos de um logcat salvo (Android) para a aba Analytics. */
export function analyticsFromLog(_text: string): AnalyticsRead {
  return naoImplementado();
}

/** Decodifica bytes de arquivo respeitando BOM (o `>` do PowerShell 5 grava UTF-16). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  return new TextDecoder("utf-8").decode(bytes);
}
