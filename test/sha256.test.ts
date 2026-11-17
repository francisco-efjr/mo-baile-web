// SHA-256 próprio (o da CSP do relatório) contra o do Node.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64, cspHash, sha256 } from "../src/engine/sha256";

describe("sha256", () => {
  const amostras = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "ação 🎉 <script>", "x".repeat(100_000)];
  it.each(amostras.map((s) => [s.slice(0, 20), s]))("igual ao node:crypto (%j...)", (_, texto) => {
    const bytes = new TextEncoder().encode(texto);
    expect(base64(sha256(bytes))).toBe(createHash("sha256").update(bytes).digest("base64"));
  });
  it("formata o hash da CSP como o Python", () => {
    expect(cspHash("abc")).toBe(`'sha256-${createHash("sha256").update("abc").digest("base64")}'`);
  });
});
