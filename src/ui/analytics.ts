// Aba Analytics: lê um logcat salvo (Android) e lista os eventos do Firebase
// Analytics com seus parâmetros. A leitura é do motor (analyticsFromLog).
import type { AnalyticsRead, TagEvent } from "../engine/index";
import { botao, campoBusca, casaBusca, chipPlataforma } from "./componentes";
import { aposPintar, h, novoId, prefereMenosMovimento, trocar } from "./dom";
import { icone } from "./icons";
import { lerArquivo, mensagemDeErro, nomePlataforma, numero, plural, tamanhoLegivel, type Dependencias } from "./motor";
import { baixar, copiarComAviso, TIPO } from "./saida";
import { criarSeletor } from "./seletor";

const PASSO_LINHAS = 300;
const PRINCIPAIS = 4;

function valorCurto(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Os primeiros parâmetros, como na coluna "Parâmetros Principais" do Mo baile. */
function principais(params: Record<string, unknown>): string {
  return Object.entries(params)
    .slice(0, PRINCIPAIS)
    .map(([k, v]) => `${k}: ${valorCurto(v)}`)
    .join(", ");
}

function jsonParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params, null, 2);
  } catch {
    return String(params);
  }
}

export function criarAnalytics(deps: Dependencias): { el: HTMLElement } {
  const { motor } = deps;
  let dados: AnalyticsRead | null = null;
  let nomeArquivo = "";
  let buscaAtual = "";
  let limite = PASSO_LINHAS;
  let selecionado: number | null = null;
  const idDetalhe = novoId("ev-detalhe");

  const seletor = criarSeletor({
    titulo: "Logcat salvo",
    dica: [
      "Um arquivo de texto com o logcat do aparelho Android. Salve com ",
      h("code", null, "adb logcat -d > log.txt"),
      " depois de usar o app.",
    ],
    aceitar: ".txt,.log,text/plain",
    rotuloBotao: "Escolher Logcat…",
    icone: "terminal",
    aoEscolher: (arquivo) => void escolher(arquivo),
  });

  const exemploDisponivel = deps.exemplo.log.trim() !== "";
  const botaoExemplo = exemploDisponivel
    ? botao("Experimentar com um Exemplo", "layers", () => void usarExemplo(), "mb-btn--plain")
    : null;

  const resumo = h("div", { class: "mw-res__meta" });
  const busca = campoBusca("Buscar nos eventos", "Buscar evento, parâmetro ou valor", (v) => {
    buscaAtual = v;
    limite = PASSO_LINHAS;
    desenharTabela();
  });
  const contagem = h("p", { class: "mw-contagem", "aria-live": "polite" });
  const idLegenda = novoId("legenda-ev");
  const corpo = h("tbody");
  const tabela = h(
    "table",
    { class: "mw-tabela mw-tabela--eventos" },
    h("caption", { id: idLegenda, class: "mw-sr" }, "Eventos do Firebase Analytics"),
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { scope: "col" }, "Hora"),
        h("th", { scope: "col" }, "Evento"),
        h("th", { scope: "col", class: "mw-col-opc" }, "Origem"),
        h("th", { scope: "col" }, "Parâmetros principais"),
      ),
    ),
    corpo,
  );
  const rolagem = h("div", { class: "mw-tabela-rolagem", role: "region", "aria-labelledby": idLegenda, tabindex: "0" }, tabela);
  const semLinhas = h(
    "div",
    { class: "mb-empty mw-vazio-tabela", hidden: true },
    h("p", { class: "mb-empty__title" }, "Nenhum evento com essa busca"),
    h("p", { class: "mb-empty__text" }, "Tente outro nome de evento ou de parâmetro."),
  );
  const mostrarMais = botao("Mostrar Mais", "chevron-down", () => {
    limite += PASSO_LINHAS;
    desenharTabela();
  }, "mw-mais");
  mostrarMais.hidden = true;

  const detalhe = h("section", { class: "mw-detalhe", id: idDetalhe, "aria-label": "Detalhe do evento" });

  const semEventos = h(
    "div",
    { class: "mb-empty mw-vazio", hidden: true },
    h("div", { class: "mb-empty__icon" }, icone("radio-tower", 34)),
    h("h2", { class: "mb-empty__title" }, "Nenhum evento do Firebase neste arquivo"),
    h(
      "p",
      { class: "mb-empty__text" },
      "Ligue o log do Firebase antes de usar o app (",
      h("code", null, "adb shell setprop log.tag.FA VERBOSE"),
      "), refaça o fluxo e salve o logcat de novo.",
    ),
  );

  const lista = h(
    "section",
    { class: "mw-res", hidden: true, "aria-labelledby": "mw-ev-titulo" },
    h(
      "div",
      { class: "mw-res__cabeca" },
      h("div", { class: "mw-res__titulos" }, h("h2", { id: "mw-ev-titulo", class: "mw-res__titulo mw-res__titulo--medio", tabindex: "-1" }), resumo),
      h(
        "div",
        { class: "mw-exportar", role: "group", "aria-label": "Exportar os eventos" },
        botao("Baixar TSV", "download", () => dados && baixar(dados.tsv, `${base()}.tsv`, TIPO.tsv)),
        botao("Baixar JSON", "download", () => dados && baixar(dados.json, `${base()}.json`, TIPO.json)),
      ),
    ),
    h("div", { class: "mw-filtros" }, h("div", { class: "mw-filtros__busca mw-filtros__busca--largo" }, busca.el, contagem)),
    h("div", { class: "mw-mestre-detalhe" }, h("div", { class: "mw-mestre" }, rolagem, semLinhas, mostrarMais), detalhe),
  );

  const vazio = h(
    "div",
    { class: "mb-empty mw-vazio" },
    h("div", { class: "mb-empty__icon" }, icone("chart-line", 34)),
    h("h2", { class: "mb-empty__title" }, "Nenhum logcat aberto"),
    h("p", { class: "mb-empty__text" }, "Escolha um logcat salvo para ver os eventos, com os parâmetros de cada um."),
  );

  corpo.addEventListener("click", (ev) => {
    const tr = (ev.target as Element).closest<HTMLTableRowElement>("tr[data-i]");
    if (!tr) return;
    if (ev.target instanceof Element && !ev.target.closest("button") && String(window.getSelection() ?? "") !== "") return;
    selecionar(Number(tr.dataset.i), ev.target instanceof Element && !!ev.target.closest("button"));
  });

  const el = h(
    "div",
    { class: "mw-painel" },
    h(
      "header",
      { class: "mw-intro" },
      h("h1", { class: "mw-intro__titulo" }, "Analytics"),
      h(
        "p",
        { class: "mw-intro__texto" },
        "Liste os eventos do Firebase Analytics de um logcat salvo (Android) e confira os parâmetros de cada um.",
      ),
    ),
    h(
      "div",
      { class: "mw-entrada mw-entrada--um" },
      seletor.el,
      h(
        "aside",
        { class: "mb-card mw-como", "aria-labelledby": "mw-como-titulo" },
        h("h2", { id: "mw-como-titulo", class: "mw-cartao__titulo" }, icone("terminal", 15), "Como salvar o logcat"),
        h(
          "ol",
          { class: "mw-como__passos" },
          h("li", null, "Ligue o log do Firebase: ", h("code", null, "adb shell setprop log.tag.FA VERBOSE")),
          h("li", null, "Use o app no aparelho e faça o fluxo que quer conferir."),
          h("li", null, "Salve o que o aparelho registrou: ", h("code", null, "adb logcat -d > log.txt")),
        ),
        h(
          "p",
          { class: "mw-como__nota" },
          icone("info", 14),
          h("span", null, "O Android ao vivo pelo cabo (WebUSB, no Chrome e no Edge) vem numa próxima versão."),
        ),
      ),
    ),
    botaoExemplo ? h("div", { class: "mw-acoes" }, h("div", { class: "mw-acoes__linha" }, botaoExemplo)) : null,
    vazio,
    semEventos,
    lista,
  );

  function base(): string {
    const semExtensao = nomeArquivo.replace(/\.[^.]+$/, "");
    return `eventos_${semExtensao.replace(/[^\w-]+/g, "_").slice(0, 60) || "analytics"}`;
  }

  function aplicar(texto: string, nome: string, tamanho: number | null): void {
    try {
      const lido = motor.analyticsFromLog(texto);
      dados = lido;
      nomeArquivo = nome;
      buscaAtual = "";
      limite = PASSO_LINHAS;
      selecionado = null;
      busca.limpar();
      const partes = [plural(lido.events.length, "evento", "eventos")];
      if (tamanho !== null) partes.push(tamanhoLegivel(tamanho));
      seletor.mostrarArquivo(nome, partes.join(" · "));
      desenhar();
    } catch (erro) {
      dados = null;
      seletor.limpar();
      seletor.erro(mensagemDeErro(erro, "ler o logcat"));
      vazio.hidden = false;
      semEventos.hidden = true;
      lista.hidden = true;
    }
  }

  async function escolher(arquivo: File): Promise<void> {
    seletor.erro(null);
    seletor.ocupado(true);
    try {
      await aposPintar();
      const texto = await lerArquivo(motor, arquivo);
      aplicar(texto, arquivo.name, arquivo.size);
    } catch (erro) {
      seletor.limpar();
      seletor.erro(mensagemDeErro(erro, "ler o logcat"));
    } finally {
      seletor.ocupado(false);
    }
  }

  function usarExemplo(): void {
    seletor.erro(null);
    aplicar(deps.exemplo.log, deps.exemplo.logNome, null);
  }

  function desenhar(): void {
    if (!dados) return;
    vazio.hidden = true;
    const temEventos = dados.events.length > 0;
    semEventos.hidden = temEventos;
    lista.hidden = !temEventos;
    if (!temEventos) return;
    const st = dados.stats;
    const titulo = lista.querySelector<HTMLElement>("#mw-ev-titulo");
    if (titulo) titulo.textContent = plural(dados.events.length, "evento do Firebase", "eventos do Firebase");
    trocar(
      resumo,
      chipPlataforma(dados.platform, nomePlataforma(dados.platform)),
      h("span", { class: "mw-res__arquivo" }, icone("terminal", 13), nomeArquivo),
      h(
        "span",
        null,
        `${plural(st.total_lidos, "lido", "lidos")} · ${plural(st.duplicados, "duplicado descartado", "duplicados descartados")}`,
      ),
    );
    desenharTabela();
    desenharDetalhe(null);
    titulo?.focus({ preventScroll: true });
  }

  function textoBusca(ev: TagEvent): string {
    return `${ev.event_name} ${ev.origin ?? ""} ${ev.time_str ?? ""} ${jsonParams(ev.params)}`;
  }

  function desenharTabela(): void {
    if (!dados) return;
    const indices: number[] = [];
    dados.events.forEach((ev, i) => {
      if (casaBusca(textoBusca(ev), buscaAtual)) indices.push(i);
    });
    const mostrados = indices.slice(0, limite);
    corpo.replaceChildren(
      ...mostrados.map((i) => {
        const ev = dados?.events[i] as TagEvent;
        const sel = i === selecionado;
        return h(
          "tr",
          { "data-i": i, class: sel ? "is-selected" : null },
          h("td", { class: "mw-mono mw-hora" }, ev.time_str ?? ""),
          h(
            "td",
            { class: "mw-ev" },
            h("button", { type: "button", class: "mw-linkbtn", "aria-controls": idDetalhe, "aria-current": sel ? "true" : null }, ev.event_name),
          ),
          h("td", { class: "mw-col-opc" }, ev.origin ?? "-"),
          h("td", { class: "mw-mono mw-params" }, principais(ev.params)),
        );
      }),
    );
    const total = dados.events.length;
    contagem.textContent =
      indices.length === total ? plural(total, "evento", "eventos") : `${numero(indices.length)} de ${plural(total, "evento", "eventos")}`;
    semLinhas.hidden = indices.length > 0;
    rolagem.hidden = indices.length === 0;
    mostrarMais.hidden = indices.length <= mostrados.length;
    if (!mostrarMais.hidden) {
      trocar(mostrarMais.querySelector("span") as HTMLSpanElement, `Mostrar Mais (${numero(indices.length - mostrados.length)} restantes)`);
    }
  }

  function selecionar(i: number, viaBotao: boolean): void {
    selecionado = i;
    for (const tr of corpo.querySelectorAll<HTMLTableRowElement>("tr[data-i]")) {
      const on = Number(tr.dataset.i) === i;
      tr.classList.toggle("is-selected", on);
      const b = tr.querySelector("button");
      if (on) b?.setAttribute("aria-current", "true");
      else b?.removeAttribute("aria-current");
    }
    desenharDetalhe(dados?.events[i] ?? null);
    if (window.matchMedia("(max-width: 1099px)").matches) {
      detalhe.scrollIntoView({ behavior: prefereMenosMovimento() ? "auto" : "smooth", block: "start" });
      detalhe.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    } else if (!viaBotao) {
      corpo.querySelector<HTMLButtonElement>(`tr[data-i="${i}"] button`)?.focus({ preventScroll: true });
    }
  }

  function fecharDetalhe(): void {
    const i = selecionado;
    selecionado = null;
    for (const tr of corpo.querySelectorAll("tr.is-selected")) tr.classList.remove("is-selected");
    desenharDetalhe(null);
    const b = i === null ? null : corpo.querySelector<HTMLButtonElement>(`tr[data-i="${i}"] button`);
    b?.removeAttribute("aria-current");
    b?.focus();
  }

  function desenharDetalhe(ev: TagEvent | null): void {
    detalhe.classList.toggle("is-vazio", ev === null);
    if (!ev) {
      trocar(
        detalhe,
        h(
          "div",
          { class: "mb-empty mw-detalhe__vazio" },
          h("div", { class: "mb-empty__icon" }, icone("braces", 28)),
          h("p", { class: "mb-empty__text" }, "Escolha um evento na tabela para ver o JSON dos parâmetros."),
        ),
      );
      return;
    }
    const json = jsonParams(ev.params);
    const qtd = Object.keys(ev.params).length;
    trocar(
      detalhe,
      h(
        "div",
        { class: "mw-detalhe__cabeca" },
        h("div", { class: "mw-detalhe__titulos" }, h("h3", { class: "mw-detalhe__titulo", tabindex: "-1" }, ev.event_name)),
        h(
          "button",
          { type: "button", class: "mb-btn mb-btn--plain mw-icone-btn", "aria-label": "Fechar Detalhe", title: "Fechar Detalhe", onclick: fecharDetalhe },
          icone("x", 16),
        ),
      ),
      h(
        "dl",
        { class: "mw-dl" },
        h("div", null, h("dt", null, "Hora"), h("dd", { class: "mw-mono" }, ev.time_str ?? "-")),
        h("div", null, h("dt", null, "Plataforma"), h("dd", null, nomePlataforma(ev.platform))),
        ev.origin ? h("div", null, h("dt", null, "Origem"), h("dd", null, ev.origin)) : null,
        h("div", null, h("dt", null, "Parâmetros"), h("dd", null, numero(qtd))),
      ),
      h(
        "div",
        { class: "mw-detalhe__bloco-cabeca" },
        h("h4", { class: "mw-detalhe__secao" }, "Parâmetros (JSON)"),
        botao("Copiar JSON", "copy", () => void copiarComAviso(json, "JSON"), "mb-btn--small"),
      ),
      h("pre", { class: "mw-bloco", tabindex: "0", "aria-label": "JSON dos parâmetros" }, json),
      ev.raw_log
        ? [
            h("h4", { class: "mw-detalhe__secao" }, "Linha do log"),
            h("pre", { class: "mw-bloco mw-bloco--bruto", tabindex: "0", "aria-label": "Linha original do log" }, ev.raw_log),
          ]
        : null,
    );
  }

  desenharDetalhe(null);
  return { el };
}
