// A interface só fala com o motor por este contrato (src/engine/index.ts).
// Em desenvolvimento, `?amostra` troca algumas funções por uma amostra
// (src/ui/dev), sem tocar no motor nem entrar no build de produção.
import type * as engine from "../engine/index";
import { EngineError } from "../engine/index";
import type { exemplo } from "../exemplos/index";

export type Motor = Pick<
  typeof engine,
  "loadSpec" | "specSummary" | "readLog" | "audit" | "exportHtml" | "analyticsFromLog" | "decodeText"
>;

export type Exemplo = typeof exemplo;

export interface Dependencias {
  motor: Motor;
  exemplo: Exemplo;
  /** Verdadeiro só com a amostra de desenvolvimento ligada. */
  amostra: boolean;
}

/** Texto para a tela: o do motor quando é erro de entrada, senão uma frase genérica. */
export function mensagemDeErro(erro: unknown, contexto: string): string {
  if (erro instanceof EngineError) return erro.message;
  return `Algo deu errado ao ${contexto}. Tente de novo; se continuar, use Relatar um Problema.`;
}

/** Limite de leitura: acima disso o navegador pode travar ao decodificar. */
export const LIMITE_BYTES = 200 * 1024 * 1024;

export async function lerArquivo(motor: Motor, arquivo: File): Promise<string> {
  if (arquivo.size > LIMITE_BYTES) {
    throw new EngineError(
      `O arquivo tem ${tamanhoLegivel(arquivo.size)}, mais do que o navegador consegue ler com folga (200 MB). ` +
        "Salve só o Firebase com adb logcat -d -s FA FA-SVC > log.txt e tente de novo.",
      "too_large",
    );
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  return motor.decodeText(bytes);
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${numero(kb, kb < 10 ? 1 : 0)} KB`;
  return `${numero(kb / 1024, 1)} MB`;
}

export function numero(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function porcentagem(valor: number): string {
  return `${numero(valor, 1)}%`;
}

export function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

export function nomePlataforma(p: string | null | undefined): string {
  if (p === "android") return "Android";
  if (p === "ios") return "iOS";
  return p ? p : "-";
}
