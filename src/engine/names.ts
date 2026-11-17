/** Nomes de arquivo a partir de texto livre: port de `security.safe_file_stem` e `service.html_file_name`. */

import { pyCompile } from "./pyre";

const NOT_ALNUM = pyCompile("[^A-Za-z0-9]+");

/** Trecho de nome de arquivo a partir de texto livre (nome do projeto). */
export function safeFileStem(text: string, fallback = "relatorio"): string {
  const plain = text.normalize("NFKD").replace(/[^\x00-\x7f]/gu, "");
  let stem = NOT_ALNUM.sub(plain, () => "-");
  stem = stem.replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60);
  return stem || fallback;
}

const two = (n: number) => String(n).padStart(2, "0");

/** `relatorio_<projeto da spec>_<ios|android>_<dd-mm-aaaa>.html`. */
export function htmlFileName(projeto: string, platform: string, when: Date): string {
  return `relatorio_${safeFileStem(projeto, "spec")}_${platform}_${two(when.getDate())}-${two(when.getMonth() + 1)}-${when.getFullYear()}.html`;
}
