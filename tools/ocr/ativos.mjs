#!/usr/bin/env node
// Modelos do OCR (PaddleOCR v6 small) em public/ocr/, conferidos pelo sha256.
//
//   node tools/ocr/ativos.mjs           baixa o que falta e confere tudo
//   node tools/ocr/ativos.mjs --conferir só confere (falha se faltar arquivo)
//
// A fonte, o caminho, o tamanho e o sha256 de cada arquivo estão em
// src/ocr/manifesto.json, fixados num commit do repositório de modelos. O
// download fica guardado em .cache/ocr/<sha256> (fora do git) e é copiado
// para public/ocr/, que o Vite publica junto com o site. Também confere que o
// WebAssembly do ONNX Runtime instalado é o do manifesto.
//
// Nenhum dado da pessoa passa por aqui: é só o download dos modelos públicos
// na hora do build, nunca no navegador de quem usa o site.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifesto = JSON.parse(readFileSync(join(raiz, "src/ocr/manifesto.json"), "utf8"));
const destino = join(raiz, "public/ocr");
const cache = join(raiz, ".cache/ocr");
const soConferir = process.argv.includes("--conferir");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function falhar(msg) {
  console.error(`ocr: ${msg}`);
  process.exit(1);
}
function conferir(buf, item, origem) {
  if (buf.length !== item.bytes) falhar(`${item.nome ?? item.arquivo} de ${origem} tem ${buf.length} bytes, o manifesto diz ${item.bytes}.`);
  const h = sha256(buf);
  if (h !== item.sha256) falhar(`${item.nome ?? item.arquivo} de ${origem} tem sha256 ${h}, o manifesto diz ${item.sha256}.`);
}

async function baixar(item) {
  const url = new URL(item.caminho, manifesto.fonte).href;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) falhar(`não foi possível baixar ${url} (HTTP ${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  conferir(buf, item, url);
  mkdirSync(cache, { recursive: true });
  const tmp = join(cache, `${item.sha256}.parcial`);
  writeFileSync(tmp, buf);
  renameSync(tmp, join(cache, item.sha256));
  return buf;
}

mkdirSync(destino, { recursive: true });
let baixados = 0;
for (const item of manifesto.modelos) {
  const final = join(destino, item.nome);
  if (existsSync(final)) {
    const buf = readFileSync(final);
    if (buf.length === item.bytes && sha256(buf) === item.sha256) continue;
  }
  if (soConferir) falhar(`falta ${item.nome} em public/ocr (rode: node tools/ocr/ativos.mjs).`);
  const guardado = join(cache, item.sha256);
  let buf;
  if (existsSync(guardado)) {
    buf = readFileSync(guardado);
    conferir(buf, item, guardado);
  } else {
    buf = await baixar(item);
    baixados++;
  }
  copyFileSync(guardado, final);
}

const rt = manifesto.runtime;
const pacote = JSON.parse(readFileSync(join(raiz, "node_modules", rt.pacote, "package.json"), "utf8"));
if (pacote.version !== rt.versao) falhar(`${rt.pacote} instalado é ${pacote.version}, o manifesto pede ${rt.versao}.`);
conferir(readFileSync(join(raiz, "node_modules", rt.pacote, "dist", rt.arquivo)), rt, `node_modules/${rt.pacote}`);

const total = manifesto.modelos.reduce((s, m) => s + m.bytes, 0) + rt.bytes;
console.log(`ocr: ${manifesto.modelos.length} modelos e o runtime conferidos (${(total / 1e6).toFixed(1)} MB)` +
  (baixados ? `, ${baixados} baixado(s)` : ""));
