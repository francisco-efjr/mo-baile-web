// Aparência: segue o sistema (claro/escuro, aumentar contraste, reduzir
// movimento e transparência) e aceita escolha manual de tema, lembrada neste
// navegador. Os atributos em <html> são os do design system do Mo baile.

export type PreferenciaTema = "auto" | "light" | "dark";

const CHAVE = "mobaile-web-tema";
const raiz = document.documentElement;

function consulta(q: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(q) : null;
}

const escuro = consulta("(prefers-color-scheme: dark)");
const contraste = consulta("(prefers-contrast: more)");
const movimento = consulta("(prefers-reduced-motion: reduce)");
const transparencia = consulta("(prefers-reduced-transparency: reduce)");

let preferencia: PreferenciaTema = ler();
const ouvintes = new Set<(p: PreferenciaTema) => void>();

function ler(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v === "auto" || v === "light" || v === "dark") return v;
  } catch {
    /* sem armazenamento (janela privada, dados bloqueados): segue o sistema */
  }
  return "auto";
}

function gravar(p: PreferenciaTema): void {
  try {
    if (p === "auto") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, p);
  } catch {
    /* sem armazenamento: a escolha vale só nesta aba */
  }
}

function aplicar(): void {
  const temaEscuro = preferencia === "dark" || (preferencia === "auto" && !!escuro?.matches);
  raiz.dataset.theme = temaEscuro ? "dark" : "light";
  raiz.dataset.themePref = preferencia;
  if (contraste?.matches) raiz.dataset.contrast = "high";
  else delete raiz.dataset.contrast;
  raiz.dataset.reduceMotion = movimento?.matches ? "true" : "false";
  if (transparencia?.matches) raiz.dataset.reduceTransparency = "true";
  else delete raiz.dataset.reduceTransparency;
}

export function iniciarTema(): void {
  aplicar();
  for (const q of [escuro, contraste, movimento, transparencia]) {
    q?.addEventListener("change", aplicar);
  }
}

export function preferenciaTema(): PreferenciaTema {
  return preferencia;
}

export function definirTema(p: PreferenciaTema): void {
  preferencia = p;
  gravar(p);
  aplicar();
  for (const f of ouvintes) f(p);
}

export function aoMudarTema(f: (p: PreferenciaTema) => void): void {
  ouvintes.add(f);
}
