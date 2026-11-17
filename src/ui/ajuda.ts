// Aba Ajuda: os guias de docs/ajuda/*.md, empacotados no build (?raw) e
// desenhados pelo leitor do subconjunto de Markdown do Mo baile.
import analyticsMd from "../../docs/ajuda/analytics.md?raw";
import comecandoMd from "../../docs/ajuda/comecando.md?raw";
import importarMd from "../../docs/ajuda/importar-prints.md?raw";
import relatarMd from "../../docs/ajuda/relatar-problema.md?raw";
import reportMd from "../../docs/ajuda/report.md?raw";
import { h, trocar } from "./dom";
import { icone, type NomeIcone } from "./icons";
import { desenharGuia, lerGuia, type Guia } from "./markdown";

interface Topico {
  id: string;
  icone: NomeIcone;
  guia: Guia;
}

const TOPICOS: Topico[] = [
  { id: "comecando", icone: "info", guia: lerGuia(comecandoMd) },
  { id: "report", icone: "list-filter", guia: lerGuia(reportMd) },
  { id: "importar-prints", icone: "images", guia: lerGuia(importarMd) },
  { id: "analytics", icone: "chart-line", guia: lerGuia(analyticsMd) },
  { id: "relatar-problema", icone: "circle-alert", guia: lerGuia(relatarMd) },
];

export const TOPICO_PADRAO = "comecando";

export function existeTopico(id: string): boolean {
  return TOPICOS.some((t) => t.id === id);
}

export function criarAjuda(): { el: HTMLElement; mostrar(topico: string, focar: boolean): void } {
  const links = new Map<string, HTMLAnchorElement>();
  const artigo = h("article", { class: "mw-guia", "aria-live": "off" });

  const nav = h(
    "nav",
    { class: "mw-ajuda__nav", "aria-label": "Guias da Ajuda" },
    h(
      "ul",
      null,
      ...TOPICOS.map((t) => {
        const a = h(
          "a",
          { href: `#ajuda/${t.id}`, class: "mw-ajuda__link" },
          icone(t.icone, 16),
          h("span", null, t.guia.meta.titulo ?? t.id),
        );
        links.set(t.id, a);
        return h("li", null, a);
      }),
    ),
  );

  const el = h(
    "div",
    { class: "mw-painel mw-ajuda" },
    h(
      "header",
      { class: "mw-intro" },
      h("h1", { class: "mw-intro__titulo" }, "Ajuda"),
      h("p", { class: "mw-intro__texto" }, "Guias curtos de cada área do Mo baile Web."),
    ),
    h("div", { class: "mw-ajuda__grade" }, nav, artigo),
  );

  function mostrar(id: string, focar: boolean): void {
    const topico = TOPICOS.find((t) => t.id === id) ?? TOPICOS[0];
    if (!topico) return;
    for (const [chave, a] of links) {
      if (chave === topico.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    const { meta } = topico.guia;
    const titulo = h("h2", { class: "mw-guia__titulo", tabindex: "-1" }, meta.titulo ?? topico.id);
    trocar(
      artigo,
      h(
        "header",
        { class: "mw-guia__cabeca" },
        titulo,
        meta.resumo ? h("p", { class: "mw-guia__resumo" }, meta.resumo) : null,
        meta.precisa
          ? h("p", { class: "mw-guia__precisa" }, h("span", { class: "mw-guia__rotulo" }, "Precisa:"), " ", meta.precisa)
          : null,
      ),
      ...desenharGuia(topico.guia, existeTopico),
    );
    if (focar) titulo.focus();
  }

  mostrar(TOPICO_PADRAO, false);
  return { el, mostrar };
}
