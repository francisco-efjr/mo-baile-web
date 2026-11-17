// O Vitest troca todo import de .css por "" (até com ?raw) quando `test.css`
// não está configurado. O build do Vite embute o arquivo de verdade; nos testes,
// os dois CSS do relatório voltam a ser o conteúdo do arquivo.
import { readFileSync } from "node:fs";

export const cssDoArquivo = (nome: string): string =>
  readFileSync(new URL(`../src/engine/assets/${nome}`, import.meta.url), "utf8");
