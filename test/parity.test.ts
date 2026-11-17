// Paridade com o motor Python do Mo baile, por gabarito.
//
// Cada caso de test/corpus passa pelo mesmo caminho da versão web do Mo baile
// (decodeText -> loadSpec -> readLog -> audit -> exportHtml), e o resultado
// tem de ser igual, byte a byte, ao que tools/golden/gerar.py gravou rodando o
// motor Python. Sem tolerância numérica: os números saem como o Python os
// escreve (42.9, 0.0, 1e-05). Para regenerar: tools/golden/README.md.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/engine/assets/design_system.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("design_system.css") }));
vi.mock("../src/engine/assets/report.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("report.css") }));
import { analyticsPy } from "../src/engine/analytics";
import { REPORT_ASSETS } from "../src/engine/html";
import {
  analyticsFromLog,
  audit,
  decodeText,
  EngineError,
  exportHtml,
  htmlFileName,
  loadSpec,
  readLog,
  reportJson,
  specSummary,
  type AuditReport,
  type ExportInfo,
  type Platform,
} from "../src/engine/index";
import { pyJsonDumps } from "../src/engine/py";

const corpus = new URL("./corpus/", import.meta.url);
const golden = new URL("./golden/", import.meta.url);
const ler = (url: URL) => readFileSync(url, "utf8");
const casos = readdirSync(corpus).sort();

/** Mesmo instante e versão que o gerador passa ao Python. */
const INSTANTE = new Date(2026, 10, 16, 9, 30);
const VERSAO = "0.0.0-paridade";

/** Troca os ativos fixos pelos marcadores do gabarito (o gerador faz o mesmo do lado Python). */
function compactar(html: string): string {
  for (const [nome, conteudo] of Object.entries(REPORT_ASSETS)) html = html.split(conteudo).join(`@@ATIVO:${nome}@@`);
  return html;
}

interface Meta {
  platform: Platform | null;
  descricao: string;
  info?: ExportInfo;
}

type Etapa = "spec" | "log" | "audit";

/** Igualdade de texto longo; na diferença mostra só o trecho onde os dois se separam. */
function mesmoTexto(obtido: string, esperado: string): void {
  if (obtido === esperado) return;
  let i = 0;
  while (i < obtido.length && obtido[i] === esperado[i]) i++;
  const trecho = (t: string) => JSON.stringify(t.slice(Math.max(0, i - 120), i + 120));
  expect.fail(`diverge no caractere ${i} (tamanhos ${obtido.length} e ${esperado.length})\nobtido:   ${trecho(obtido)}\nesperado: ${trecho(esperado)}`);
}

function rodar(caso: string): { report?: AuditReport; erro?: { stage: Etapa; error: unknown }; logTexto: string | null } {
  const pasta = new URL(`${caso}/`, corpus);
  const meta = JSON.parse(ler(new URL("meta.json", pasta))) as Meta;
  const logNome = ["log.txt", "log.json"].find((n) => existsSync(new URL(n, pasta)))!;
  const logTexto = decodeText(readFileSync(new URL(logNome, pasta)), { label: "log" });
  let etapa: Etapa = "spec";
  try {
    const spec = loadSpec(decodeText(readFileSync(new URL("spec.json", pasta)), { label: "spec", strict: true }), "spec.json");
    etapa = "log";
    const log = readLog(logTexto, logNome);
    etapa = "audit";
    return { report: audit(spec, log, { platform: meta.platform }), logTexto };
  } catch (error) {
    return { erro: { stage: etapa, error }, logTexto };
  }
}

describe.each(casos)("caso %s", (caso) => {
  const meta = JSON.parse(ler(new URL(`${caso}/meta.json`, corpus))) as Meta;
  const esperadoTexto = ler(new URL(`${caso}.json`, golden));
  const esperado = JSON.parse(esperadoTexto) as Record<string, unknown>;
  const { report, erro, logTexto } = rodar(caso);

  if ("error" in esperado) {
    const exp = esperado.error as { stage: Etapa; code: string; message: string };
    it(`recusa na etapa ${exp.stage} com a mensagem do Mo baile`, () => {
      expect(report).toBeUndefined();
      expect(erro?.stage).toBe(exp.stage);
      expect(erro?.error).toBeInstanceOf(EngineError);
      const e = erro!.error as EngineError;
      expect(e.message).toBe(exp.message);
      expect(e.kind).toBe(exp.code);
    });
  } else {
    it("report.audit igual byte a byte (JSON do Python)", () => {
      expect(erro?.error).toBeUndefined();
      mesmoTexto(reportJson(report!), esperadoTexto);
    });
    it("objeto público igual ao gabarito", () => {
      if (!report) expect.fail(String(erro?.error));
      mesmoTexto(JSON.stringify(report), JSON.stringify(esperado));
      expect(report).toEqual(esperado);
    });
    it("report.spec igual ao resumo do gabarito", () => {
      const spec = loadSpec(decodeText(readFileSync(new URL(`${caso}/spec.json`, corpus)), { label: "spec", strict: true }), "spec.json");
      expect(specSummary(spec)).toEqual(esperado.spec);
    });
    it("HTML igual byte a byte (instante e versão fixos)", () => {
      const html = exportHtml(report!, meta.info ?? {}, { now: INSTANTE, version: VERSAO });
      mesmoTexto(compactar(html), ler(new URL(`${caso}.html`, golden)));
    });
    it("nome do HTML exportado igual", () => {
      const extra = JSON.parse(ler(new URL(`${caso}.meta.json`, golden))) as { html_file_name: string };
      expect(htmlFileName(report!, INSTANTE)).toBe(extra.html_file_name);
    });
  }

  const analyticsUrl = new URL(`${caso}.analytics.json`, golden);
  if (existsSync(analyticsUrl)) {
    it("Analytics (logcat salvo) igual byte a byte", () => {
      const texto = ler(analyticsUrl);
      mesmoTexto(pyJsonDumps(analyticsPy(logTexto!), { indent: 2 }) + "\n", texto);
      expect(analyticsFromLog(logTexto!)).toEqual(JSON.parse(texto));
    });
  }
});

describe("ativos do relatório", () => {
  const hashes = JSON.parse(ler(new URL("_ativos.json", golden))) as Record<string, string>;
  const assets = new URL("../src/engine/assets/", import.meta.url);
  it.each(["design_system.css", "report.css", "motion.min.js", "report.js", "icons.json", "icon.png"])(
    "%s é o mesmo arquivo do Mo baile (sha256)",
    (nome) => {
      expect(createHash("sha256").update(readFileSync(new URL(nome, assets))).digest("hex")).toBe(hashes[nome]);
    },
  );
  it("o HTML embute exatamente esses arquivos", () => {
    for (const nome of ["design_system.css", "report.css", "motion.min.js", "report.js"] as const) {
      expect(REPORT_ASSETS[nome]).toBe(ler(new URL(nome, assets)));
    }
    const png = createHash("sha256").update(readFileSync(new URL("icon.png", assets))).digest("hex");
    expect(png).toBe(hashes["icon.png"]);
    expect(REPORT_ASSETS["icon.png"].startsWith("data:image/png;base64,")).toBe(true);
  });
});
