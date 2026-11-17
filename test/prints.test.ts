// Paridade da importação de prints: o leitor de cards, o rascunho da spec, a
// revisão e o checklist em TypeScript contra o gabarito do Mo baile em Python
// (tools/golden/gerar.py sobre test/corpus-prints/). Sem tolerância: o mesmo
// JSON e o mesmo Markdown, caractere por caractere.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EngineError, MAX_PRINTS, rascunhoDosPrints, type OcrLine } from "../src/engine/index";
import { safeFileStem } from "../src/engine/names";
import { readCard, readCardAsDict } from "../src/engine/prints/cardReader";
import { checklistMarkdown } from "../src/engine/prints/checklist";
import { getCloseMatches, SequenceMatcher } from "../src/engine/prints/difflib";
import { buildSpec, reviewMarkdown } from "../src/engine/prints/draft";
import { cmpCodePoints, floatRepr, pyJsonDumps, pyJsonLoads, pyStrip, type PyDict, type PyValue } from "../src/engine/py";

const CORPUS = new URL("./corpus-prints/", import.meta.url);
const GOLDEN = new URL("./golden/", import.meta.url);
// O mesmo instante fixo do gabarito (16/11/2026 09:30, hora local).
const INSTANTE = new Date(2026, 10, 16, 9, 30);

interface Caso {
  projeto: string;
  pasta: string;
  plataforma: string;
  prints: { file: string; lines: OcrLine[] }[];
}

const casos = readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort();
const ler = (nome: string): Caso => JSON.parse(readFileSync(new URL(nome, CORPUS), "utf8")) as Caso;
const gabarito = (nome: string): PyDict =>
  pyJsonLoads(readFileSync(new URL(`prints-${nome}`, GOLDEN), "utf8")) as PyDict;
const dump = (v: PyValue | undefined) => pyJsonDumps(v, { indent: 2 });

describe("importação de prints: paridade com o Mo baile", () => {
  it("tem o corpus inteiro no gabarito", () => {
    expect(casos.length).toBeGreaterThanOrEqual(28);
    for (const nome of casos) expect(() => gabarito(nome)).not.toThrow();
  });

  for (const nome of casos) {
    it(nome.replace(/\.json$/, ""), () => {
      const caso = ler(nome);
      const g = gabarito(nome);
      const ordem = [...caso.prints].sort((a, b) => cmpCodePoints(a.file, b.file));
      const cards = ordem.map((p) => readCard(p.lines, `${caso.pasta}/${p.file}`));
      const projeto = pyStrip(caso.projeto ?? "") || caso.pasta;
      expect(projeto).toBe(g.get("nome"));
      expect(dump(cards.map(readCardAsDict))).toBe(dump(g.get("cards")));

      const [spec, review] = buildSpec(cards, projeto, caso.plataforma, caso.pasta);
      expect(dump(review)).toBe(dump(g.get("review")));
      expect(dump(spec) + "\n").toBe(g.get("spec_json"));
      expect(reviewMarkdown(spec, review)).toBe(g.get("review_md"));
      const specName = `${safeFileStem(projeto, "spec")}.json`;
      expect(specName).toBe(g.get("spec_name"));
      expect(checklistMarkdown(spec, review, { specName, generatedAt: INSTANTE })).toBe(g.get("checklist_md"));
    });
  }
});

describe("rascunhoDosPrints (contrato)", () => {
  const comPrints = casos.filter((n) => ler(n).prints.length > 0);

  it("devolve os mesmos arquivos do gabarito", () => {
    for (const nome of comPrints) {
      const caso = ler(nome);
      const g = gabarito(nome);
      const r = rascunhoDosPrints(
        caso.prints.map((p) => ({ nome: p.file, linhas: p.lines })),
        { pasta: caso.pasta, projeto: caso.projeto, plataforma: caso.plataforma, agora: INSTANTE },
      );
      expect(r.specJson).toBe(g.get("spec_json"));
      expect(r.reviewMd).toBe(g.get("review_md"));
      expect(r.checklistMd).toBe(g.get("checklist_md"));
      expect(r.specName).toBe(g.get("spec_name"));
      expect(r.checklistName).toBe(r.specName.replace(/\.json$/, ".checklist.md"));
      const duvidas = (g.get("review") as PyDict[]).reduce((s, x) => s + (x.get("duvidas") as string[]).length, 0);
      expect(r.doubtsTotal).toBe(duvidas);
    }
  });

  it("recusa pasta vazia, pasta grande demais e plataforma inválida", () => {
    const um = [{ nome: "a.png", linhas: [] }];
    expect(() => rascunhoDosPrints([], { pasta: "demo" })).toThrow(EngineError);
    expect(() => rascunhoDosPrints([], { pasta: "demo" })).toThrow("Nenhuma imagem em demo.");
    const muitos = Array.from({ length: MAX_PRINTS + 1 }, (_, i) => ({ nome: `${i}.png`, linhas: [] }));
    expect(() => rascunhoDosPrints(muitos, { pasta: "demo" })).toThrow(`${MAX_PRINTS + 1} imagens em demo; o limite é ${MAX_PRINTS}`);
    expect(() => rascunhoDosPrints(um, { pasta: "demo", plataforma: "web" })).toThrow("Plataforma inválida: 'web'. Use android ou ios.");
    expect(rascunhoDosPrints(um, { pasta: "demo", plataforma: "IOS" }).specJson).toContain('"plataforma": "ios"');
  });
});

describe("difflib: get_close_matches e SequenceMatcher.ratio", () => {
  const unidades = JSON.parse(readFileSync(new URL("_unidades.json", GOLDEN), "utf8")) as {
    close_matches: [string, string[], number, string[], string[]][];
  };
  it.each(unidades.close_matches.map((c) => [c[0].slice(0, 24), c] as const))("%s", (_, c) => {
    const [palavra, opcoes, corte, esperado, razoes] = c;
    expect(getCloseMatches(palavra, opcoes, 1, corte)).toEqual(esperado);
    expect(opcoes.map((o) => floatRepr(new SequenceMatcher(palavra, o).ratio()))).toEqual(razoes);
  });
});
