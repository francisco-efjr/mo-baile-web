#!/usr/bin/env node
// Versionamento do Mo baile Web, no mesmo modelo do Mo baile: a versão mora em
// VERSION (SemVer X.Y.Z); package.json e CHANGELOG.md são cópias conferidas.
//
//   node tools/version.mjs show           versão atual
//   node tools/version.mjs check          cópias e CHANGELOG batem com VERSION
//   node tools/version.mjs bump <parte>   sobe major|minor|patch e propaga
//   node tools/version.mjs tag            tag anotada vX.Y.Z no HEAD
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(raiz, f), "utf8");
const gravar = (f, t) => writeFileSync(join(raiz, f), t);
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function versao() {
  const v = ler("VERSION").trim();
  if (!SEMVER.test(v)) falhar(`VERSION inválida: "${v}" (use X.Y.Z).`);
  return v;
}

function falhar(msg) {
  console.error(msg);
  process.exit(1);
}

function check() {
  const v = versao();
  const pkg = JSON.parse(ler("package.json")).version;
  if (pkg !== v) falhar(`package.json está em ${pkg}, VERSION em ${v}.`);
  if (!ler("CHANGELOG.md").includes(`## [${v}]`)) falhar(`CHANGELOG.md sem a seção ## [${v}].`);
  console.log(`versão ${v} consistente`);
}

function bump(parte) {
  const [maj, min, pat] = versao().split(".").map(Number);
  const nova = parte === "major" ? `${maj + 1}.0.0` : parte === "minor" ? `${maj}.${min + 1}.0`
    : parte === "patch" ? `${maj}.${min}.${pat + 1}` : falhar("use major, minor ou patch");
  gravar("VERSION", `${nova}\n`);
  const pkg = JSON.parse(ler("package.json"));
  pkg.version = nova;
  gravar("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  const hoje = new Date().toISOString().slice(0, 10);
  const log = ler("CHANGELOG.md");
  const i = log.indexOf("\n## [");
  const secao = `\n## [${nova}] - ${hoje}\n\n### Adicionado\n\n- \n`;
  gravar("CHANGELOG.md", i < 0 ? log + secao : log.slice(0, i) + secao + log.slice(i));
  console.log(`${maj}.${min}.${pat} -> ${nova}. Descreva a mudança no CHANGELOG.md.`);
}

function tag() {
  const v = versao();
  check();
  execFileSync("git", ["tag", "-a", `v${v}`, "-m", `Mo baile Web ${v}`], { cwd: raiz, stdio: "inherit" });
  console.log(`tag v${v} criada. Envie só ela: git push origin v${v}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "show") console.log(versao());
else if (cmd === "check") check();
else if (cmd === "bump") bump(arg);
else if (cmd === "tag") tag();
else falhar("uso: version.mjs show|check|bump <major|minor|patch>|tag");
