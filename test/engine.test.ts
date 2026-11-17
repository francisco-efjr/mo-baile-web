// Comportamento do motor que não é paridade: decodificação dos arquivos,
// mensagens de erro para a tela, escape do HTML e o contrato com a interface.
// Os valores esperados vêm das regras do Mo baile (mobaile/web/sandbox.py,
// service.py), escritos à mão aqui.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  analyticsFromLog,
  audit,
  checkFileSize,
  decodeText,
  EngineError,
  exportHtml,
  loadSpec,
  readLog,
  reportJson,
  specSummary,
  WEB_VERSION,
} from "../src/engine/index";
import { exemplo } from "../src/exemplos/index";

vi.mock("../src/engine/assets/design_system.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("design_system.css") }));
vi.mock("../src/engine/assets/report.css?raw", async () => ({ default: (await import("./css-raw")).cssDoArquivo("report.css") }));

const texto = "Logging event: ação ☕";
const utf16le = (s: string) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};
const junta = (...partes: (number[] | Uint8Array)[]) => Uint8Array.from(partes.flatMap((p) => [...p]));

function erro(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    return e as EngineError;
  }
  throw new Error("esperava EngineError");
}

describe("decodeText", () => {
  it("UTF-16 LE e BE com BOM (o > do PowerShell 5)", () => {
    expect(decodeText(junta([0xff, 0xfe], utf16le(texto)))).toBe(texto);
    const be = utf16le(texto).map((_, i, a) => a[i ^ 1]!);
    expect(decodeText(junta([0xfe, 0xff], be))).toBe(texto);
  });
  it("tira o BOM do UTF-8 e só ele", () => {
    const utf8 = new TextEncoder().encode("{}");
    expect(decodeText(junta([0xef, 0xbb, 0xbf], utf8))).toBe("{}");
    expect(decodeText(junta([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf], utf8))).toBe("﻿{}");
  });
  it("UTF-32 com BOM", () => {
    const cps = [...texto].map((c) => c.codePointAt(0)!);
    const le = junta([0xff, 0xfe, 0, 0], ...cps.map((c) => [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, 0]));
    expect(decodeText(le)).toBe(texto);
  });
  it("spec fora de UTF-8 é recusada; log é tolerado com �", () => {
    const latin1 = Uint8Array.from([0xe7, 0xe3, 0x6f]);
    expect(erro(() => decodeText(latin1, { label: "spec", strict: true })).message).toBe(
      "O arquivo de spec não está em UTF-8 nem em UTF-16.",
    );
    expect(decodeText(latin1, { label: "log" })).toContain("�");
  });
});

describe("mensagens para a tela", () => {
  it("JSON quebrado aponta linha e coluna (em caracteres, não em UTF-16)", () => {
    expect(erro(() => loadSpec('{\n  "projeto": "☕🎉",\n  x', "minha.json")).message).toBe(
      "A spec minha.json não é um JSON válido (linha 3, coluna 3).",
    );
    expect(erro(() => loadSpec('{"🎉": 1,}')).message).toBe("A spec spec.json não é um JSON válido (linha 1, coluna 8).");
  });
  it("campos da spec", () => {
    expect(erro(() => loadSpec('{"projeto": 7, "cards": [{"evento": "e"}]}')).message).toBe("'projeto' precisa ser texto, veio int.");
    expect(erro(() => loadSpec('{"projeto": "p", "plataforma": "Web", "cards": [{"evento": "e"}]}')).message).toBe(
      "Plataforma inválida na spec: 'web'. Use android ou ios.",
    );
    expect(erro(() => loadSpec('{"projeto": "p", "cards": []}')).message).toBe("A spec não tem cards. Liste ao menos um em 'cards'.");
    expect(erro(() => loadSpec('{"projeto": "p", "cards": [{"evento": "e", "por_fluxo": "sim"}]}')).message).toBe(
      "card 1: 'por_fluxo' precisa ser true ou false.",
    );
  });
  it("log sem eventos e plataforma inválida", () => {
    expect(erro(() => readLog("nada aqui", "saida.log")).message).toBe("O log saida.log não tem eventos do Firebase Analytics.");
    const spec = loadSpec(exemplo.spec, exemplo.specNome);
    const log = readLog(exemplo.log, exemplo.logNome);
    expect(erro(() => audit(spec, log, { platform: "web" as "ios" })).message).toBe("platform precisa ser android ou ios.");
  });
  it("arquivo grande demais", () => {
    expect(() => checkFileSize("spec", 5 * 1024 * 1024)).not.toThrow();
    expect(erro(() => checkFileSize("spec", 5 * 1024 * 1024 + 1)).message).toBe("O arquivo de spec passa do limite de 5 MB.");
    expect(erro(() => checkFileSize("log", 64 * 1024 * 1024 + 1)).message).toBe("O arquivo de log passa do limite de 64 MB.");
  });
  it("dados da exportação inválidos", () => {
    const report = audit(loadSpec(exemplo.spec), readLog(exemplo.log));
    expect(erro(() => exportHtml(report, { conta: 7 as unknown as string })).message).toBe("info.conta precisa ser texto.");
  });
  it("relatório copiado perde a ligação com a auditoria e pede para rodar de novo", () => {
    const report = audit(loadSpec(exemplo.spec), readLog(exemplo.log));
    const copia = structuredClone(report);
    expect(copia).toEqual(report);
    expect(erro(() => exportHtml(copia)).message).toBe("Nenhuma auditoria para exportar. Rode a auditoria primeiro.");
    expect(erro(() => reportJson(copia)).message).toBe("Nenhuma auditoria para exportar. Rode a auditoria primeiro.");
  });
  it("spec copiada ainda audita igual (é validada de novo)", () => {
    const spec = loadSpec(exemplo.spec, exemplo.specNome);
    const log = readLog(exemplo.log, exemplo.logNome);
    expect(audit(structuredClone(spec), log)).toEqual(audit(spec, log));
    expect(specSummary(structuredClone(spec))).toEqual(specSummary(spec));
  });
});

describe("escape do HTML", () => {
  const spec = JSON.stringify({
    projeto: '<script>alert("x")</script>',
    plataforma: "android",
    fluxos: { a: "<img src=x onerror=alert(1)>" },
    cards: [{ secao: "<b>s</b>", titulo: "</h3><script>", evento: "ev_{fluxo}", params: { flow_name: "f", detail: "<svg onload=alert(1)>" } }],
  });
  const log =
    "11-16 10:00:00.000 V FA-SVC : Logging event: origin=app,name=ev_a,params=Bundle[{flow_name=f, detail=<svg onload=alert(2)>, x='\"&}]\n";
  const html = exportHtml(audit(loadSpec(spec), readLog(log)), { conta: "<i>c</i>" }, { now: new Date(2026, 10, 16, 9, 30) });

  it("só os três scripts embutidos, e nenhuma marcação vinda dos dados", () => {
    expect(html.match(/<script>/g)).toHaveLength(3);
    for (const hostil of ["<script>alert", "<img src=x", "<svg onload", "<b>s</b>", "<i>c</i>", "</h3><script>"]) expect(html).not.toContain(hostil);
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;svg onload=alert(2)&gt;");
    expect(html).toContain("&lt;i&gt;c&lt;/i&gt;");
  });
  it("rodapé com a versão do site e a hora pedida", () => {
    expect(html).toContain(`Gerado pelo <b>Mo baile</b> Web ${WEB_VERSION}</span>`);
    expect(html).toContain("<span>gerado em 16/11/2026 09:30</span>");
    expect(WEB_VERSION).toBe(readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim());
  });
});

describe("exemplo embutido", () => {
  it("vem do corpus e mostra OK, divergente, não disparada, fora da spec e alerta", () => {
    const report = audit(loadSpec(exemplo.spec, exemplo.specNome), readLog(exemplo.log, exemplo.logNome));
    expect(report.summary).toMatchObject({ ok: 3, divergent: 2, missing: 2, extras: 3, alerts: 1 });
    expect(report.spec.name).toBe(exemplo.specNome);
    expect(report.log_name).toBe(exemplo.logNome);
    expect(analyticsFromLog(exemplo.log).events.length).toBe(report.log_stats.uteis);
  });
});
