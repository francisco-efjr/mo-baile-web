// Montagem de DOM sem innerHTML: todo texto (da spec, do log, dos guias) entra
// como nó de texto. Atributo `style` não existe aqui de propósito: a CSP não
// aceita estilo em linha; use classes ou `element.style` pelo CSSOM.

export type Filho = Node | string | number | null | undefined | false;
type Valor = string | number | boolean | null | undefined;
export type Atributos = Record<string, Valor | ((ev: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos?: Atributos | null,
  ...filhos: (Filho | Filho[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (atributos) {
    for (const [nome, valor] of Object.entries(atributos)) {
      if (valor === null || valor === undefined || valor === false) continue;
      if (typeof valor === "function") {
        el.addEventListener(nome.replace(/^on/, "").toLowerCase(), valor);
      } else if (nome === "class") {
        el.className = String(valor);
      } else if (nome === "style") {
        throw new Error("Use classes ou element.style: a CSP não aceita style em linha.");
      } else {
        el.setAttribute(nome, valor === true ? "" : String(valor));
      }
    }
  }
  anexar(el, filhos);
  return el;
}

export function anexar(pai: Node, filhos: (Filho | Filho[])[]): void {
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    pai.appendChild(typeof filho === "object" ? filho : document.createTextNode(String(filho)));
  }
}

export function trocar(pai: Element, ...filhos: (Filho | Filho[])[]): void {
  pai.replaceChildren();
  anexar(pai, filhos);
}

/** Texto só para leitor de tela. */
export function sr(texto: string): HTMLSpanElement {
  return h("span", { class: "mw-sr" }, texto);
}

let contador = 0;
export function novoId(prefixo: string): string {
  contador += 1;
  return `${prefixo}-${contador}`;
}

/** Deixa o navegador pintar (por exemplo, o "Lendo…") antes de um trabalho síncrono pesado. */
export function aposPintar(): Promise<void> {
  return new Promise((resolve) => {
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(fim, 0));
    // Em aba em segundo plano o navegador não pinta (rAF parado): não fica preso.
    setTimeout(fim, 80);
  });
}

export function prefereMenosMovimento(): boolean {
  return document.documentElement.dataset.reduceMotion === "true";
}
