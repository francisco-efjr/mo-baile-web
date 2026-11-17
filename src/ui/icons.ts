// Ícones SVG em linha, sem fonte de ícone nem arquivo externo. A base é o
// conjunto do relatório do Mo baile (src/engine/assets/icons.json); os extras
// abaixo vêm do mesmo Lucide do design system do Mo baile
// (lucide-static@0.460.0, licença ISC), copiados de components/indicators/Icon.jsx.
import base from "../engine/assets/icons.json";

const extras: Record<string, string> = {
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="7 10 12 15 17 10" /> <line x1="12" x2="12" y1="15" y2="3" />',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="17 8 12 3 7 8" /> <line x1="12" x2="12" y1="3" y2="15" />',
  "file-code": '<path d="M10 12.5 8 15l2 2.5" /> <path d="m14 12.5 2 2.5-2 2.5" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />',
  "circle-help": '<circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <path d="M12 17h.01" />',
  "chart-line": '<path d="M3 3v16a2 2 0 0 0 2 2h16" /> <path d="m19 9-5 5-4-4-3 3" />',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /> <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  "list-ordered": '<path d="M10 12h11" /> <path d="M10 18h11" /> <path d="M10 6h11" /> <path d="M4 10h2" /> <path d="M4 6h1v4" /> <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />',
  "chevron-right": '<path d="m9 18 6-6-6-6" />',
  terminal: '<polyline points="4 17 10 11 4 5" /> <line x1="12" x2="20" y1="19" y2="19" />',
  "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />',
  images: '<path d="M18 22H4a2 2 0 0 1-2-2V6" /> <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" /> <circle cx="12" cy="8" r="2" /> <rect width="16" height="16" x="6" y="2" rx="2" />',
};

const glifos: Record<string, string> = { ...(base as Record<string, string>), ...extras };

export type NomeIcone = keyof typeof base | keyof typeof extras;

const SVG = "http://www.w3.org/2000/svg";
const ELEMENTO = /<(path|circle|line|rect|polyline|polygon|ellipse)\b([^>]*?)\/?>/g;
const ATRIBUTO = /([a-zA-Z][\w:-]*)="([^"]*)"/g;
const cache = new Map<string, SVGElement[]>();

// Os glifos são estáticos e empacotados; mesmo assim, viram nós pelo DOM
// (createElementNS), sem passar por parser de HTML.
function formas(nome: string): SVGElement[] {
  let lista = cache.get(nome);
  if (!lista) {
    lista = [];
    for (const [, tag, attrs] of (glifos[nome] ?? "").matchAll(ELEMENTO)) {
      const forma = document.createElementNS(SVG, tag as string);
      for (const [, chave, valor] of (attrs ?? "").matchAll(ATRIBUTO)) {
        forma.setAttribute(chave as string, valor as string);
      }
      lista.push(forma);
    }
    cache.set(nome, lista);
  }
  return lista.map((forma) => forma.cloneNode(true) as SVGElement);
}

/** Ícone decorativo (aria-hidden). Para ícone sozinho num botão, dê aria-label ao botão. */
export function icone(nome: NomeIcone, tamanho = 16, classe = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(tamanho));
  svg.setAttribute("height", String(tamanho));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `mb-icon${classe ? ` ${classe}` : ""}`);
  for (const forma of formas(nome)) svg.appendChild(forma);
  return svg;
}
