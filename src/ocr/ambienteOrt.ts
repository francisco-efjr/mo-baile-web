// Configura o ONNX Runtime ANTES de a ppu-paddle-ocr carregar. Ao ser
// importada, a biblioteca aponta o runtime para uma CDN (jsDelivr) se ninguém
// escolheu um caminho. Aqui o caminho é o próprio site, só do `.wasm` (na
// forma de objeto, sem `mjs`): assim o runtime usa a cola JavaScript que já
// vem no bundle e não importa nada de fora. O binário chega conferido pelo
// sha256 (`wasmBinary`, no worker), então nem esse caminho é buscado.
// Este módulo precisa ser o primeiro import do worker.
import * as ort from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.numThreads = 1; // o GitHub Pages não libera SharedArrayBuffer (sem COOP/COEP)
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href };

export { ort, wasmUrl };
