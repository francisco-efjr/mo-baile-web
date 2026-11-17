/// <reference lib="webworker" />
// Worker do OCR: baixa os modelos do próprio site, confere o sha256, guarda no
// navegador (Cache API) e lê cada print com o PaddleOCR v6 small. Devolve as
// caixas como o PaddleOCR entrega; os ajustes e o leitor de cards rodam na
// página (src/engine/prints). Nada daqui sai do navegador.
import { ort, wasmUrl } from "./ambienteOrt";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import type { RecognitionOptions } from "ppu-paddle-ocr";
import manifesto from "./manifesto.json";
import type { PedidoOcr, RespostaOcr } from "./protocolo";

declare const self: DedicatedWorkerGlobalScope;

const CACHE = `mobaile-web-ocr-${manifesto.versao}`;
let servico: PaddleOcrService | null = null;

const enviar = (r: RespostaOcr, transferir: Transferable[] = []) => self.postMessage(r, transferir);

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Arquivo {
  url: string;
  nome: string;
  bytes: number;
  sha256: string;
}

async function abrirCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    return null; // janela privada ou armazenamento bloqueado: baixa toda vez
  }
}

async function obter(arq: Arquivo, cache: Cache | null, avancar: (n: number, doCache: boolean) => void): Promise<[ArrayBuffer, boolean]> {
  if (cache) {
    try {
      const salvo = await cache.match(arq.url);
      if (salvo) {
        const buf = await salvo.arrayBuffer();
        if (buf.byteLength === arq.bytes && (await sha256(buf)) === arq.sha256) {
          avancar(arq.bytes, true);
          return [buf, true];
        }
        await cache.delete(arq.url);
      }
    } catch {
      /* segue para o download */
    }
  }
  const resposta = await fetch(arq.url, { credentials: "same-origin", cache: "no-cache" });
  if (!resposta.ok || !resposta.body) throw new Error(`Não foi possível baixar ${arq.nome} (HTTP ${resposta.status}).`);
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebido += value.byteLength;
    avancar(value.byteLength, false);
  }
  const buf = new Uint8Array(recebido);
  let pos = 0;
  for (const p of partes) {
    buf.set(p, pos);
    pos += p.byteLength;
  }
  const hash = await sha256(buf.buffer);
  if (recebido !== arq.bytes || hash !== arq.sha256) {
    throw new Error(
      `${arq.nome} chegou diferente do esperado (${recebido} bytes, sha256 ${hash.slice(0, 12)}…; ` +
        `esperado ${arq.bytes} bytes, ${arq.sha256.slice(0, 12)}…). Recarregue a página.`,
    );
  }
  if (cache) {
    try {
      await cache.put(arq.url, new Response(buf.slice().buffer, { headers: { "Content-Type": "application/octet-stream" } }));
    } catch {
      /* sem espaço: segue sem guardar */
    }
  }
  return [buf.buffer, false];
}

async function preparar(base: string): Promise<void> {
  // Os modelos ficam em <site>/ocr/; o worker está em <site>/assets/.
  const t0 = performance.now();
  const versao = (sha: string) => `?v=${sha.slice(0, 16)}`;
  const arquivos: Arquivo[] = [
    ...manifesto.modelos.map((m) => ({ url: new URL(m.nome + versao(m.sha256), base).href, nome: m.nome, bytes: m.bytes, sha256: m.sha256 })),
    {
      url: new URL(wasmUrl, self.location.href).href,
      nome: manifesto.runtime.arquivo,
      bytes: manifesto.runtime.bytes,
      sha256: manifesto.runtime.sha256,
    },
  ];
  for (const a of arquivos) {
    if (new URL(a.url).origin !== self.location.origin) throw new Error("O OCR só baixa arquivos do próprio site.");
  }
  const total = arquivos.reduce((s, a) => s + a.bytes, 0);
  const cache = await abrirCache();
  let feito = 0;
  let ultimo = 0;
  let todosDoCache = true;
  const buffers: ArrayBuffer[] = [];
  for (const a of arquivos) {
    const [buf, doCache] = await obter(a, cache, (n, veioDoCache) => {
      feito += n;
      if (feito - ultimo > total / 100 || feito === total) {
        ultimo = feito;
        enviar({ tipo: "baixando", feito, total, doCache: veioDoCache });
      }
    });
    todosDoCache &&= doCache;
    buffers.push(buf);
  }
  const [det, rec, dic, wasm] = buffers as [ArrayBuffer, ArrayBuffer, ArrayBuffer, ArrayBuffer];
  ort.env.wasm.wasmBinary = wasm;
  servico = new PaddleOcrService({
    model: { detection: det, recognition: rec, charactersDictionary: dic },
    // Uma inferência por caixa, como na fase 0. O dicionário vem em `model`.
    recognition: { strategy: "per-box" } as RecognitionOptions,
    session: { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
  });
  await servico.initialize();
  enviar({ tipo: "pronto", doCache: todosDoCache, ms: performance.now() - t0 });
}

async function ler(id: number, bytes: ArrayBuffer): Promise<void> {
  if (!servico) throw new Error("O OCR ainda não foi preparado.");
  const t0 = performance.now();
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(new Blob([bytes]));
  } catch {
    enviar({ tipo: "erro", id, mensagem: "a imagem não abre (arquivo corrompido ou formato não suportado)" });
    return;
  }
  const { width: largura, height: altura } = imagem;
  const tela = new OffscreenCanvas(largura, altura);
  tela.getContext("2d")!.drawImage(imagem, 0, 0);
  imagem.close();
  const r = await servico.recognize(tela as unknown as HTMLCanvasElement, { flatten: true });
  const caixas = r.results.map((it) => ({
    text: it.text,
    box: { x: it.box.x, y: it.box.y, width: it.box.width, height: it.box.height },
    confidence: it.confidence,
  }));
  enviar({ tipo: "lido", id, largura, altura, caixas, ms: performance.now() - t0 });
}

self.onmessage = async (ev: MessageEvent<PedidoOcr>) => {
  const p = ev.data;
  try {
    if (p.tipo === "preparar") await preparar(p.base ?? new URL("../ocr/", self.location.href).href);
    else if (p.tipo === "ler") await ler(p.id, p.bytes);
  } catch (err) {
    enviar({ tipo: "erro", ...(p.tipo === "ler" ? { id: p.id } : {}), mensagem: err instanceof Error ? err.message : String(err) });
  }
};
