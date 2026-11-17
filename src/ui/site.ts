// Moldura do site: cabeçalho (marca, selo Beta, abas, tema), aviso de
// privacidade, link de relato, painéis e rodapé. As abas seguem o padrão de
// abas do ARIA (setas, Home, End) e o endereço guarda a aba (#analytics).
import { version } from "../../package.json";
import { criarAjuda, existeTopico, TOPICO_PADRAO } from "./ajuda";
import { criarAnalytics } from "./analytics";
import { observarPolegar, posicionarPolegar, segmentado } from "./componentes";
import { h, sr } from "./dom";
import { icone, type NomeIcone } from "./icons";
import type { Dependencias } from "./motor";
import { criarRelatorio } from "./relatorio";
import { montarAviso } from "./saida";
import { aoMudarTema, definirTema, preferenciaTema, type PreferenciaTema } from "./tema";

const REPOSITORIO = "https://github.com/francisco-efjr/mo-baile-web";
const MO_BAILE = "https://github.com/francisco-efjr/mo-baile";

type Area = "relatorio" | "analytics" | "ajuda";

const AREAS: { id: Area; rotulo: string; icone: NomeIcone }[] = [
  { id: "relatorio", rotulo: "Relatório", icone: "list-filter" },
  { id: "analytics", rotulo: "Analytics", icone: "chart-line" },
  { id: "ajuda", rotulo: "Ajuda", icone: "circle-help" },
];

function linkDeRelato(area: string): string {
  return `${REPOSITORIO}/issues/new?template=bug.yml&area=${encodeURIComponent(area)}`;
}

function linkExterno(href: string, ...filhos: (Node | string)[]): HTMLAnchorElement {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...filhos, sr(" (abre em nova aba)"));
}

function seloBeta(): HTMLElement {
  const idDica = "mw-beta-dica";
  const bolha = h("span", { class: "mw-dica__bolha", role: "tooltip", id: idDica }, "Versão beta, em desenvolvimento. Pode ter bugs.");
  const selo = h("button", { type: "button", class: "mw-beta", "aria-describedby": idDica, "aria-expanded": "false" }, "Beta");
  const caixa = h("span", { class: "mw-dica" }, selo, bolha);
  // Toque (sem hover) abre e fecha; Esc fecha (WCAG 1.4.13).
  selo.addEventListener("click", () => {
    const aberta = caixa.classList.toggle("is-aberta");
    caixa.classList.remove("is-dispensada");
    selo.setAttribute("aria-expanded", String(aberta));
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    caixa.classList.remove("is-aberta");
    caixa.classList.add("is-dispensada");
    selo.setAttribute("aria-expanded", "false");
  });
  caixa.addEventListener("pointerleave", () => caixa.classList.remove("is-dispensada"));
  selo.addEventListener("blur", () => {
    caixa.classList.remove("is-aberta", "is-dispensada");
    selo.setAttribute("aria-expanded", "false");
  });
  return caixa;
}

export function montarSite(raiz: HTMLElement, deps: Dependencias): void {
  document.body.classList.add("mb-root");

  const relatorio = criarRelatorio(deps);
  const analytics = criarAnalytics(deps);
  const ajuda = criarAjuda();
  const conteudos: Record<Area, HTMLElement> = { relatorio: relatorio.el, analytics: analytics.el, ajuda: ajuda.el };

  /* ---------------------------------------------------------------- abas */

  const abas = new Map<Area, HTMLButtonElement>();
  const paineis = new Map<Area, HTMLElement>();
  const polegar = h("span", { class: "mb-seg__thumb", "aria-hidden": "true" });
  const listaAbas = h("div", { class: "mb-seg mb-seg--large mw-abas", role: "tablist", "aria-label": "Áreas do site" }, polegar);
  for (const area of AREAS) {
    const aba = h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `aba-${area.id}`,
        class: "mb-seg__item mw-aba",
        "aria-controls": `painel-${area.id}`,
        "aria-selected": "false",
        tabindex: "-1",
      },
      icone(area.icone, 16),
      h("span", null, area.rotulo),
    );
    aba.addEventListener("click", () => selecionar(area.id, { focarAba: false, gravar: true }));
    aba.addEventListener("keydown", (ev) => {
      const ordem = AREAS.map((a) => a.id);
      const i = ordem.indexOf(area.id);
      const alvo = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ordem.length - 1 }[ev.key];
      if (alvo === undefined) return;
      ev.preventDefault();
      const proxima = ordem[(alvo + ordem.length) % ordem.length];
      if (proxima) selecionar(proxima, { focarAba: true, gravar: true });
    });
    abas.set(area.id, aba);
    listaAbas.appendChild(aba);
    paineis.set(
      area.id,
      h(
        "section",
        { id: `painel-${area.id}`, role: "tabpanel", "aria-labelledby": `aba-${area.id}`, class: "mw-aba-painel", hidden: true },
        conteudos[area.id],
      ),
    );
  }
  observarPolegar(listaAbas);

  /* ---------------------------------------------------------------- tema */

  const tema = segmentado<PreferenciaTema>(
    "Tema",
    [
      { valor: "auto", rotulo: "", icone: "contrast", rotuloAcessivel: "Tema do sistema" },
      { valor: "light", rotulo: "", icone: "sun", rotuloAcessivel: "Tema claro" },
      { valor: "dark", rotulo: "", icone: "moon", rotuloAcessivel: "Tema escuro" },
    ],
    preferenciaTema(),
    (p) => definirTema(p),
    "mw-tema",
  );
  aoMudarTema((p) => tema.selecionar(p));

  /* ---------------------------------------------------------- cabeçalho */

  const relatar = linkExterno(linkDeRelato("Relatório"), icone("circle-alert", 15), h("span", null, "Relatar um Problema"));
  relatar.classList.add("mw-relatar");

  const base = import.meta.env.BASE_URL;
  const topo = h(
    "header",
    { class: "mw-topo" },
    h(
      "div",
      { class: "mw-topo__barra" },
      h(
        "div",
        { class: "mw-marca" },
        h("img", { src: `${base}icon.png`, alt: "", width: 30, height: 30, class: "mw-marca__icone" }),
        h("span", { class: "mw-marca__nome" }, "Mo baile Web"),
        seloBeta(),
      ),
      h("div", { class: "mw-topo__abas" }, listaAbas),
      h("div", { class: "mw-topo__acoes" }, tema.el),
    ),
    h(
      "div",
      { class: "mw-topo__faixa" },
      h(
        "p",
        { class: "mw-privacidade" },
        icone("shield-check", 15),
        h("span", null, "Seus arquivos não saem deste navegador."),
      ),
      deps.amostra ? h("span", { class: "mw-amostra" }, "Amostra de desenvolvimento") : null,
      relatar,
    ),
  );

  const principal = h("main", { id: "conteudo", class: "mw-principal", tabindex: "-1" }, ...paineis.values());

  const rodape = h(
    "footer",
    { class: "mw-rodape" },
    h("img", { src: `${base}icon.png`, alt: "", width: 16, height: 16 }),
    h(
      "p",
      null,
      h("b", null, "Mo baile Web"),
      h("span", { class: "mw-rodape__sep", "aria-hidden": "true" }, " · "),
      "parte do ",
      linkExterno(MO_BAILE, "Mo baile"),
      h("span", { class: "mw-rodape__sep", "aria-hidden": "true" }, " · "),
      linkExterno(REPOSITORIO, "código aberto (MIT)"),
      h("span", { class: "mw-rodape__sep", "aria-hidden": "true" }, " · "),
      "Desenvolvido por Francisco Edson Ferreira Junior",
      h("span", { class: "mw-rodape__sep", "aria-hidden": "true" }, " · "),
      h("span", { class: "mw-rodape__versao" }, `versão ${version} (beta)`),
    ),
  );

  raiz.replaceChildren(
    h("a", { class: "mw-pular", href: "#conteudo" }, "Pular para o conteúdo"),
    topo,
    principal,
    rodape,
    montarAviso(),
  );

  /* -------------------------------------------------------------- rotas */

  let atual: Area | null = null;

  function selecionar(area: Area, op: { focarAba: boolean; gravar: boolean; topico?: string; focarTopico?: boolean }): void {
    const info = AREAS.find((a) => a.id === area) ?? AREAS[0];
    if (!info) return;
    for (const [id, aba] of abas) {
      const on = id === area;
      aba.setAttribute("aria-selected", String(on));
      aba.tabIndex = on ? 0 : -1;
      aba.classList.toggle("is-selected", on);
      const painel = paineis.get(id);
      if (painel) {
        if (on && painel.hidden) {
          painel.hidden = false;
          painel.classList.remove("is-entrando");
          void painel.offsetWidth;
          painel.classList.add("is-entrando");
        } else if (!on) painel.hidden = true;
      }
    }
    posicionarPolegar(listaAbas);
    if (op.focarAba) abas.get(area)?.focus();
    relatar.href = linkDeRelato(info.rotulo);
    document.title = `${info.rotulo} · Mo baile Web`;
    if (area === "ajuda") ajuda.mostrar(op.topico ?? TOPICO_PADRAO, !!op.focarTopico);
    if (op.gravar) {
      const hash = area === "ajuda" && op.topico && op.topico !== TOPICO_PADRAO ? `#ajuda/${op.topico}` : `#${area}`;
      if (location.hash !== hash) history.replaceState(null, "", hash);
    }
    atual = area;
  }

  function rota(): { area: Area; topico?: string } | null {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (hash === "" || hash === "relatorio") return { area: "relatorio" };
    if (hash === "analytics") return { area: "analytics" };
    if (hash === "ajuda") return { area: "ajuda" };
    const ajudaTopico = /^ajuda\/([a-z0-9-]+)$/.exec(hash);
    if (ajudaTopico && existeTopico(ajudaTopico[1] ?? "")) return { area: "ajuda", topico: ajudaTopico[1] };
    return null;
  }

  window.addEventListener("hashchange", () => {
    const r = rota();
    // Âncoras que não são rota (como #conteudo, do "Pular para o conteúdo") não trocam a aba.
    if (!r) return;
    selecionar(r.area, { focarAba: false, gravar: false, topico: r.topico, focarTopico: r.area === "ajuda" && atual === "ajuda" });
  });

  const inicial = rota() ?? { area: "relatorio" as Area };
  selecionar(inicial.area, { focarAba: false, gravar: false, topico: inicial.topico });
  // As fontes e o tamanho final só valem depois da primeira pintura.
  requestAnimationFrame(() => posicionarPolegar(listaAbas));
  document.fonts?.ready.then(() => {
    posicionarPolegar(listaAbas);
    posicionarPolegar(tema.el);
  });
}
