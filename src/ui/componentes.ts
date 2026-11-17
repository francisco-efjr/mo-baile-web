// Peças pequenas reaproveitadas pelas abas, nas classes do design system (.mb-*).
import { h } from "./dom";
import { icone, type NomeIcone } from "./icons";

/** Posiciona o "polegar" do controle segmentado sob o item selecionado. */
export function posicionarPolegar(seg: HTMLElement): void {
  const polegar = seg.querySelector<HTMLElement>(".mb-seg__thumb");
  const sel = seg.querySelector<HTMLElement>(".mb-seg__item.is-selected");
  if (!polegar || !sel) return;
  polegar.style.left = `${sel.offsetLeft}px`;
  polegar.style.width = `${sel.offsetWidth}px`;
}

/** Recalcula o polegar quando o controle muda de tamanho (fonte, aba que aparece, tela girada). */
export function observarPolegar(seg: HTMLElement): void {
  if ("ResizeObserver" in window) new ResizeObserver(() => posicionarPolegar(seg)).observe(seg);
}

export interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: string;
  icone?: NomeIcone;
  /** Para botão só com ícone. */
  rotuloAcessivel?: string;
  contagem?: number;
}

export interface Segmentado<T extends string> {
  el: HTMLDivElement;
  selecionar(valor: T): void;
  contagens(valores: Partial<Record<T, number>>): void;
}

/** Grupo de botões que funciona como filtro (aria-pressed), no visual do segmentado do Mo baile. */
export function segmentado<T extends string>(
  rotuloGrupo: string,
  opcoes: OpcaoSegmento<T>[],
  inicial: T,
  aoEscolher: (valor: T) => void,
  classe = "",
): Segmentado<T> {
  const polegar = h("span", { class: "mb-seg__thumb", "aria-hidden": "true" });
  const botoes = new Map<T, HTMLButtonElement>();
  const contadores = new Map<T, HTMLSpanElement>();
  const el = h("div", { class: `mb-seg mw-seg ${classe}`.trim(), role: "group", "aria-label": rotuloGrupo }, polegar);
  for (const op of opcoes) {
    const conta = h("span", { class: "mw-seg__conta" });
    if (op.contagem !== undefined) conta.textContent = String(op.contagem);
    const b = h(
      "button",
      {
        type: "button",
        class: "mb-seg__item",
        "aria-pressed": "false",
        "aria-label": op.rotuloAcessivel ?? null,
        title: op.rotuloAcessivel ?? null,
      },
      op.icone ? icone(op.icone, 15) : null,
      op.rotulo ? h("span", null, op.rotulo) : null,
      op.rotulo ? conta : null,
    );
    b.addEventListener("click", () => {
      selecionar(op.valor);
      aoEscolher(op.valor);
    });
    botoes.set(op.valor, b);
    contadores.set(op.valor, conta);
    el.appendChild(b);
  }
  function selecionar(valor: T) {
    for (const [v, b] of botoes) {
      const on = v === valor;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    posicionarPolegar(el);
  }
  selecionar(inicial);
  observarPolegar(el);
  return {
    el,
    selecionar,
    contagens(valores) {
      for (const [v, n] of Object.entries(valores) as [T, number][]) {
        const c = contadores.get(v);
        if (c) c.textContent = String(n);
      }
      posicionarPolegar(el);
    },
  };
}

export type StatusValidacao = "ok" | "error" | "missing";

const STATUS: Record<string, { rotulo: string; icone: NomeIcone; classe: string }> = {
  ok: { rotulo: "OK", icone: "circle-check", classe: "ok" },
  error: { rotulo: "Divergente", icone: "circle-x", classe: "error" },
  missing: { rotulo: "Não disparado", icone: "triangle-alert", classe: "warn" },
};

export function rotuloStatus(status: string): string {
  return STATUS[status]?.rotulo ?? status;
}

export function statusVisual(status: string, extra = ""): HTMLSpanElement {
  const s = STATUS[status] ?? { rotulo: status, icone: "info" as NomeIcone, classe: "off" };
  return h("span", { class: `mb-status mb-status--${s.classe} mw-status ${extra}`.trim() }, icone(s.icone, 14), s.rotulo);
}

export function chipPlataforma(plataforma: string, rotulo: string): HTMLSpanElement {
  const classe = plataforma === "android" ? "mw-chip--android" : plataforma === "ios" ? "mw-chip--ios" : "";
  return h("span", { class: `mw-chip ${classe}`.trim() }, icone("smartphone", 13), rotulo);
}

/** Campo de busca no visual do Mo baile, com rótulo acessível e botão de limpar. */
export function campoBusca(rotulo: string, dica: string, aoMudar: (valor: string) => void): {
  el: HTMLDivElement;
  entrada: HTMLInputElement;
  limpar(): void;
} {
  const entrada = h("input", {
    type: "search",
    placeholder: dica,
    "aria-label": rotulo,
    autocomplete: "off",
    spellcheck: "false",
  });
  const limpar = h(
    "button",
    { type: "button", class: "mw-busca__limpar", "aria-label": "Limpar a busca", title: "Limpar a busca", hidden: true },
    icone("x", 12),
  );
  let timer = 0;
  const avisar = () => {
    limpar.hidden = entrada.value === "";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => aoMudar(entrada.value.trim()), 120);
  };
  entrada.addEventListener("input", avisar);
  entrada.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && entrada.value) {
      ev.preventDefault();
      entrada.value = "";
      avisar();
    }
  });
  limpar.addEventListener("click", () => {
    entrada.value = "";
    avisar();
    entrada.focus();
  });
  const el = h("div", { class: "mb-search mw-busca" }, icone("search", 15), entrada, limpar);
  return {
    el,
    entrada,
    limpar() {
      entrada.value = "";
      limpar.hidden = true;
    },
  };
}

/** Termos da busca: todos precisam aparecer no texto (sem diferenciar maiúsculas). */
export function casaBusca(texto: string, busca: string): boolean {
  if (!busca) return true;
  const alvo = texto.toLocaleLowerCase("pt-BR");
  return busca
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => alvo.includes(t));
}

/** Botão no padrão do Mo baile: ícone + verbo no infinitivo. */
export function botao(
  rotulo: string,
  nomeIcone: NomeIcone | null,
  aoClicar: () => void,
  classe = "",
): HTMLButtonElement {
  return h(
    "button",
    { type: "button", class: `mb-btn mw-btn ${classe}`.trim(), onclick: aoClicar },
    nomeIcone ? icone(nomeIcone, 15) : null,
    h("span", null, rotulo),
  );
}
