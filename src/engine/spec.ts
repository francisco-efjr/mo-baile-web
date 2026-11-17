/**
 * Spec da demanda e tipos da auditoria: port de `mobaile/domain/report.py`.
 *
 * Spec malformada vira `EngineError` com o card e o campo do problema, com as
 * mesmas mensagens do Mo baile.
 */

import { EngineError } from "./errors";
import { dictGet, isDict, isList, isStr, pyRepr, pyStrip, pyTruthy, pyTypeName, strRepr, type PyDict, type PyValue } from "./py";
import { PyReError, pyCompile } from "./pyre";

export const PLATFORMS = ["android", "ios"] as const;

export type VariantStatus = "ok" | "error" | "missing";

export interface SpecCard {
  evento: string;
  secao: string;
  titulo: string | null;
  print_name: string | null;
  params: PyDict;
  variacoes: PyDict[];
  por_fluxo: boolean | null;
  params_por_fluxo: Map<string, PyDict>;
  obs: string | Map<string, string> | null;
}

export interface SpecTemplate {
  projeto: string;
  cards: SpecCard[];
  versao_especificacao: string | null;
  plataforma: string;
  prints_dir: string | null;
  fluxos: Map<string, string>;
}

export interface Variant {
  card_index: number;
  flow: string | null;
  event: string;
  expected: PyDict;
  note: string | null;
}

export interface TagEvent {
  id: PyValue;
  event_name: string;
  params: PyDict;
  platform: string;
  raw_log: string | null;
  time_str: string | null;
  origin: string | null;
}

export interface ParamCheck {
  field: string;
  expected: string;
  obtained: PyValue;
  ok: boolean;
}

export interface VariantResult {
  variant: Variant;
  status: VariantStatus;
  matched: TagEvent | null;
  checks: ParamCheck[];
  occurrences: number;
  older_divergent: number;
  older_divergences: string[];
  ga_screen: PyValue;
}

export interface ExtraEvent {
  event: string;
  screen: string | null;
  flow_name: string | null;
  component: string | null;
  detail: string | null;
  count: number;
}

export interface LogStats {
  total_lidos: number;
  da_plataforma: number;
  duplicados: number;
  uteis: number;
}

export interface Report {
  spec: SpecTemplate;
  platform: string;
  results: VariantResult[];
  log_stats: LogStats;
  extras: ExtraEvent[];
  alerts: ExtraEvent[];
  first_event: TagEvent | null;
  last_event: TagEvent | null;
}

export const totals = (report: Report) => {
  const total = report.results.length;
  const ok = report.results.filter((r) => r.status === "ok").length;
  const missing = report.results.filter((r) => r.status === "missing").length;
  const error = total - ok;
  return { total, ok, missing, error, divergent: error - missing };
};

export function resultsByCard(report: Report, cardIndex: number): VariantResult[] {
  return report.results.filter((r) => r.variant.card_index === cardIndex);
}

// ------------------------------------------------------------------ validação

function text(value: PyValue, name: string, required = false): string | null {
  if (value === null || value === "") {
    if (required) throw new EngineError(`Campo obrigatório ausente na spec: '${name}'.`);
    return null;
  }
  if (!isStr(value)) throw new EngineError(`'${name}' precisa ser texto, veio ${pyTypeName(value)}.`);
  return value;
}

/** `SpecTemplate.from_dict`: valida o JSON da spec. */
export function specFromDict(data: PyValue): SpecTemplate {
  if (!isDict(data)) throw new EngineError("A spec precisa ser um objeto JSON com 'projeto' e 'cards'.");
  const projeto = text(dictGet(data, "projeto"), "projeto", true)!;
  const plataforma = (text(dictGet(data, "plataforma"), "plataforma") || "android").toLowerCase();
  if (!(PLATFORMS as readonly string[]).includes(plataforma))
    throw new EngineError(`Plataforma inválida na spec: ${strRepr(plataforma)}. Use android ou ios.`);
  const rawFluxos = dictGet(data, "fluxos");
  const fluxos = pyTruthy(rawFluxos) ? rawFluxos : new Map();
  if (!isDict(fluxos) || ![...fluxos.values()].every(isStr))
    throw new EngineError("'fluxos' precisa mapear a chave do fluxo para o rótulo, os dois em texto.");
  const cardsRaw = dictGet(data, "cards");
  if (!isList(cardsRaw) || !cardsRaw.length) throw new EngineError("A spec não tem cards. Liste ao menos um em 'cards'.");
  const cards = cardsRaw.map((raw, i) => card(i + 1, raw));
  return {
    projeto,
    cards,
    versao_especificacao: text(dictGet(data, "versao_especificacao"), "versao_especificacao"),
    plataforma,
    prints_dir: text(dictGet(data, "prints_dir"), "prints_dir"),
    fluxos: new Map([...fluxos].map(([k, v]) => [k, v as string])),
  };
}

function card(index: number, raw: PyValue): SpecCard {
  const where = `card ${index}`;
  if (!isDict(raw)) throw new EngineError(`${where}: cada card precisa ser um objeto JSON.`);
  const evento = text(dictGet(raw, "evento"), `${where}.evento`, true);
  const params = pyTruthy(dictGet(raw, "params")) ? dictGet(raw, "params") : new Map();
  if (!isDict(params)) throw new EngineError(`${where}: 'params' precisa ser um objeto.`);
  const variacoes = pyTruthy(dictGet(raw, "variacoes")) ? dictGet(raw, "variacoes") : [];
  if (!isList(variacoes) || !variacoes.every(isDict))
    throw new EngineError(`${where}: 'variacoes' precisa ser uma lista de objetos.`);
  const porFluxo = dictGet(raw, "por_fluxo");
  if (porFluxo !== null && typeof porFluxo !== "boolean") throw new EngineError(`${where}: 'por_fluxo' precisa ser true ou false.`);
  const porFluxoParams = pyTruthy(dictGet(raw, "params_por_fluxo")) ? dictGet(raw, "params_por_fluxo") : new Map();
  if (!isDict(porFluxoParams) || ![...porFluxoParams.values()].every(isDict))
    throw new EngineError(`${where}: 'params_por_fluxo' precisa mapear o fluxo para um objeto.`);
  const obs = dictGet(raw, "obs");
  if (obs !== null && !isStr(obs) && !(isDict(obs) && [...obs.values()].every(isStr)))
    throw new EngineError(`${where}: 'obs' precisa ser texto ou um objeto por fluxo.`);
  for (const origem of [params, ...(variacoes as PyDict[]), ...(porFluxoParams.values() as Iterable<PyDict>)]) checkRegexes(origem, where);
  return {
    evento: evento || "",
    secao: text(dictGet(raw, "secao"), `${where}.secao`) || "Geral",
    titulo: text(dictGet(raw, "titulo"), `${where}.titulo`),
    print_name: text(dictGet(raw, "print"), `${where}.print`),
    params: new Map(params),
    variacoes: (variacoes as PyDict[]).map((v) => new Map(v)),
    por_fluxo: porFluxo as boolean | null,
    params_por_fluxo: new Map([...porFluxoParams].map(([k, v]) => [k, new Map(v as PyDict)])),
    obs: isDict(obs) ? new Map([...obs].map(([k, v]) => [k, v as string])) : (obs as string | null),
  };
}

/** `re:<regex>` inválida quebraria a auditoria no meio; aqui vira erro de spec. */
function checkRegexes(value: PyValue, where: string): void {
  if (isDict(value)) {
    for (const item of value.values()) checkRegexes(item, where);
  } else if (isList(value)) {
    for (const item of value) checkRegexes(item, where);
  } else if (isStr(value) && pyStrip(value).startsWith("re:")) {
    try {
      pyCompile(pyStrip(value).slice(3));
    } catch (err) {
      if (err instanceof PyReError) throw new EngineError(`${where}: expressão regular inválida ${pyRepr(value)} (${err.message}).`);
      throw err;
    }
  }
}

/** `SpecCard.to_dict()`: o card no formato do JSON da spec. */
export function cardToDict(c: SpecCard): PyDict {
  return new Map<string, PyValue>([
    ["secao", c.secao],
    ["titulo", c.titulo],
    ["print", c.print_name],
    ["evento", c.evento],
    ["params", c.params],
    ["variacoes", c.variacoes],
    ["por_fluxo", c.por_fluxo],
    ["params_por_fluxo", c.params_por_fluxo as unknown as PyDict],
    ["obs", c.obs as PyValue],
  ]);
}
