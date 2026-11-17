// Leitura dos prints na página: conversa com o worker do OCR, aplica os
// ajustes do PaddleOCR (src/engine/prints/adaptador.ts) e devolve os prints
// prontos para `rascunhoDosPrints`. Os bytes vão para o worker por
// transferência e nunca saem do navegador.
import { EngineError } from "../engine/errors";
import { linhasDoPrint } from "../engine/prints/adaptador";
import type { PrintLido } from "../engine/index";
import { formatoDaImagem } from "./arquivos";
import manifesto from "./manifesto.json";
import type { PedidoOcr, RespostaOcr } from "./protocolo";

export interface ProgressoOcr {
  etapa: "baixando" | "preparando" | "lendo";
  feito: number;
  total: number;
  /** Print em leitura (etapa "lendo"). */
  arquivo?: string;
  /** Os modelos vieram do que o navegador já guardou. */
  doCache?: boolean;
}

export interface PrintParaLer {
  nome: string;
  arquivo: Blob;
}

export interface MedidaDoPrint {
  nome: string;
  ms: number;
}

/** Tamanho do que a primeira importação baixa (modelos e runtime), em bytes. */
export const BYTES_DO_OCR = manifesto.modelos.reduce((s, m) => s + m.bytes, 0) + manifesto.runtime.bytes;

/** O navegador tem o que o OCR precisa? Devolve o motivo quando não tem. */
export function ocrIndisponivel(): string | null {
  if (typeof WebAssembly === "undefined") return "este navegador não roda WebAssembly";
  if (typeof Worker === "undefined") return "este navegador não roda Web Workers";
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return "este navegador não desenha imagens fora da tela (OffscreenCanvas)";
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) return "a página precisa abrir em https para conferir os modelos";
  return null;
}

const abortado = () => new DOMException("Leitura cancelada.", "AbortError");

export class LeitorDePrints {
  private worker: Worker | null = null;
  private preparado: Promise<void> | null = null;
  private seq = 0;
  private pendentes = new Map<number, { ok: (r: Extract<RespostaOcr, { tipo: "lido" }>) => void; falha: (e: Error) => void }>();
  private aoProgredir: ((p: ProgressoOcr) => void) | undefined;
  private falhaDoPreparo: ((e: Error) => void) | null = null;
  /** Tempo de leitura de cada print da última chamada. */
  medidas: MedidaDoPrint[] = [];

  /** `base`: pasta dos modelos; sem ela, o worker usa `<site>/ocr/`, ao lado de `assets/`. */
  constructor(private readonly base?: string) {}

  /** Baixa (ou acha no navegador) os modelos e liga o OCR. Pode chamar várias vezes. */
  preparar(aoProgredir?: (p: ProgressoOcr) => void): Promise<void> {
    if (aoProgredir) this.aoProgredir = aoProgredir;
    if (this.preparado) return this.preparado;
    const motivo = ocrIndisponivel();
    if (motivo) return Promise.reject(new EngineError(`Não dá para ler os prints aqui: ${motivo}.`));
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "ocr" });
    this.worker = worker;
    this.preparado = new Promise<void>((ok, falha) => {
      this.falhaDoPreparo = falha;
      worker.onmessage = (ev: MessageEvent<RespostaOcr>) => {
        const r = ev.data;
        if (r.tipo === "baixando") {
          this.aoProgredir?.({ etapa: "baixando", feito: r.feito, total: r.total, doCache: r.doCache });
          if (r.feito === r.total) this.aoProgredir?.({ etapa: "preparando", feito: 0, total: 1 });
        } else if (r.tipo === "pronto") {
          this.falhaDoPreparo = null;
          ok();
        } else if (r.tipo === "lido") {
          this.pendentes.get(r.id)?.ok(r);
          this.pendentes.delete(r.id);
        } else if (r.tipo === "erro") {
          const erro = new EngineError(r.mensagem);
          if (r.id !== undefined) {
            this.pendentes.get(r.id)?.falha(erro);
            this.pendentes.delete(r.id);
          } else {
            this.falhaDoPreparo?.(new EngineError(`Não foi possível ligar o leitor de prints: ${r.mensagem}`));
            this.encerrar();
          }
        }
      };
      worker.onerror = (ev) => {
        ev.preventDefault();
        const erro = new EngineError(`O leitor de prints parou: ${ev.message || "erro no worker"}.`);
        this.falhaDoPreparo?.(erro);
        for (const p of this.pendentes.values()) p.falha(erro);
        this.encerrar();
      };
    });
    this.enviar(this.base ? { tipo: "preparar", base: this.base } : { tipo: "preparar" });
    return this.preparado;
  }

  /** Lê os prints em ordem, um por vez. `sinal` cancela (o worker é encerrado). */
  async lerPrints(
    prints: readonly PrintParaLer[],
    opcoes: { aoProgredir?: (p: ProgressoOcr) => void; sinal?: AbortSignal } = {},
  ): Promise<PrintLido[]> {
    const { sinal } = opcoes;
    if (sinal?.aborted) throw abortado();
    const aoAbortar = () => {
      for (const p of this.pendentes.values()) p.falha(abortado());
      this.falhaDoPreparo?.(abortado());
      this.encerrar();
    };
    sinal?.addEventListener("abort", aoAbortar, { once: true });
    try {
      await this.preparar(opcoes.aoProgredir);
      const lidos: PrintLido[] = [];
      this.medidas = [];
      for (const [i, p] of prints.entries()) {
        if (sinal?.aborted) throw abortado();
        opcoes.aoProgredir?.({ etapa: "lendo", feito: i, total: prints.length, arquivo: p.nome });
        const bytes = await p.arquivo.arrayBuffer();
        if (sinal?.aborted) throw abortado();
        if (!formatoDaImagem(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength)))) {
          throw new EngineError(`Não foi possível ler ${p.nome}: o arquivo não é PNG nem JPG.`);
        }
        let r: Extract<RespostaOcr, { tipo: "lido" }>;
        try {
          r = await this.pedirLeitura(p.nome, bytes);
        } catch (err) {
          if (err instanceof DOMException) throw err;
          throw new EngineError(`Não foi possível ler ${p.nome}: ${(err as Error).message}.`);
        }
        this.medidas.push({ nome: p.nome, ms: r.ms });
        lidos.push({ nome: p.nome, linhas: linhasDoPrint(r.caixas, r.largura, r.altura) });
      }
      opcoes.aoProgredir?.({ etapa: "lendo", feito: prints.length, total: prints.length });
      return lidos;
    } finally {
      sinal?.removeEventListener("abort", aoAbortar);
    }
  }

  /** Desliga o worker. A próxima leitura liga de novo (os modelos já estão guardados no navegador). */
  encerrar(): void {
    this.worker?.terminate();
    this.worker = null;
    this.preparado = null;
    this.falhaDoPreparo = null;
    this.pendentes.clear();
  }

  private enviar(p: PedidoOcr, transferir: Transferable[] = []): void {
    this.worker?.postMessage(p, transferir);
  }

  private pedirLeitura(nome: string, bytes: ArrayBuffer): Promise<Extract<RespostaOcr, { tipo: "lido" }>> {
    const id = ++this.seq;
    return new Promise((ok, falha) => {
      if (!this.worker) {
        falha(new EngineError("o leitor de prints foi encerrado"));
        return;
      }
      this.pendentes.set(id, { ok, falha });
      this.enviar({ tipo: "ler", id, nome, bytes }, [bytes]);
    });
  }
}
