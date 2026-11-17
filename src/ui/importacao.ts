// Importar Prints do Figma: escolhe a pasta (ou os prints), lê com o OCR no
// navegador e monta o rascunho da spec com o motor (rascunhoDosPrints). A
// pessoa revisa as dúvidas com o print ao lado e usa a spec na auditoria ou
// baixa os três arquivos. Os prints nunca saem do navegador.
import type { RascunhoDosPrints } from "../engine/index";
import { BYTES_DO_OCR, selecionarPrints, type EntradaDaPasta, type Ignorado, type ProgressoOcr } from "../ocr/index";
import { botao, segmentado, type Segmentado } from "./componentes";
import { h, novoId, trocar } from "./dom";
import { icone } from "./icons";
import { mensagemDeErro, nomePlataforma, numero, plural, type Dependencias, type LeitorOcr } from "./motor";
import { avisar, baixar, TIPO } from "./saida";

interface Entrada extends EntradaDaPasta {
  arquivo: File;
}

type Etapa = "escolha" | "lendo" | "revisao";
type FiltroRevisao = "duvidas" | "todos";

export interface Importacao {
  el: HTMLDialogElement;
  abrir(): void;
}

const mb = (bytes: number) => numero(bytes / 1e6, 0);

function entradaDeArquivo(arquivo: File, caminho?: string): Entrada {
  return { nome: arquivo.name, caminho: caminho ?? (arquivo.webkitRelativePath || arquivo.name), tamanho: arquivo.size, arquivo };
}

/** Lê todas as entradas de uma pasta arrastada (a API devolve em lotes). */
function lerPasta(pasta: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const leitor = pasta.createReader();
  const todas: FileSystemEntry[] = [];
  return new Promise((ok, falha) => {
    const lote = () =>
      leitor.readEntries((entradas) => {
        if (!entradas.length) ok(todas);
        else {
          todas.push(...entradas);
          lote();
        }
      }, falha);
    lote();
  });
}

const arquivoDaEntrada = (e: FileSystemFileEntry) => new Promise<File>((ok, falha) => e.file(ok, falha));

export function criarImportacao(deps: Dependencias, aoUsar: (rascunho: RascunhoDosPrints) => void): Importacao {
  let leitor: LeitorOcr | null = null;
  let entradas: Entrada[] = [];
  let pasta = "prints";
  let ignorados: Ignorado[] = [];
  let rascunho: RascunhoDosPrints | null = null;
  let miniaturas: string[] = [];
  let controle: AbortController | null = null;
  let origem: HTMLElement | null = null;
  let filtroRevisao: FiltroRevisao = "duvidas";

  const idTitulo = novoId("imp");
  const idProjeto = novoId("imp-projeto");
  const idPlataforma = novoId("imp-plataforma");

  /* ------------------------------------------------------------- escolha */

  const entradaPasta = h("input", { type: "file", webkitdirectory: true, multiple: true, hidden: true, tabindex: "-1" });
  const entradaPrints = h("input", { type: "file", multiple: true, accept: ".png,.jpg,.jpeg,image/png,image/jpeg", hidden: true, tabindex: "-1" });
  entradaPasta.setAttribute("aria-label", "Pasta com os prints");
  entradaPrints.setAttribute("aria-label", "Prints dos cards");

  const botaoPasta = botao("Escolher Pasta…", "folder-open", () => entradaPasta.click());
  const botaoPrints = botao("Escolher Prints…", "images", () => entradaPrints.click(), "mb-btn--plain");
  const escolhido = h("p", { class: "mw-dz__arquivo" });
  const listaIgnorados = h("div", { class: "mw-imp__ignorados" });
  const zona = h(
    "div",
    { class: "mw-dz mw-imp__zona" },
    h("div", { class: "mw-dz__icone" }, icone("folder-open", 22)),
    h(
      "div",
      { class: "mw-dz__corpo" },
      h("h3", { class: "mw-dz__titulo" }, "Pasta com os prints"),
      h("p", { class: "mw-dz__dica" }, "Os prints dos cards \"Anotações\" do Figma, em PNG ou JPG: um card por print."),
      escolhido,
    ),
    h("div", { class: "mw-dz__acao" }, botaoPasta, botaoPrints, h("span", { class: "mw-dz__ou", "aria-hidden": "true" }, "ou arraste aqui")),
    entradaPasta,
    entradaPrints,
  );

  const campoProjeto = h("input", { id: idProjeto, type: "text", class: "mb-field mw-imp__projeto", autocomplete: "off", spellcheck: "false" });
  const campoPlataforma = h(
    "select",
    { id: idPlataforma, class: "mb-popup mw-select" },
    h("option", { value: "android" }, "Android"),
    h("option", { value: "ios" }, "iOS"),
  );
  const campos = h(
    "div",
    { class: "mw-imp__campos" },
    h("div", { class: "mw-imp__campo" }, h("label", { for: idProjeto, class: "mw-rotulo" }, "Projeto"), campoProjeto),
    h(
      "div",
      { class: "mw-imp__campo" },
      h("label", { for: idPlataforma, class: "mw-rotulo" }, "Plataforma"),
      h("span", { class: "mw-select-caixa" }, campoPlataforma, icone("chevron-down", 14, "mw-select-seta")),
    ),
  );

  const aviso = h(
    "p",
    { class: "mw-aviso" },
    icone("shield-check", 15),
    h(
      "span",
      null,
      `Na primeira leitura, o site baixa o leitor de texto (${mb(BYTES_DO_OCR)} MB), que fica guardado neste navegador. ` +
        "Os prints são lidos aqui e não saem do seu computador. O rascunho sempre precisa de revisão: confira as dúvidas.",
    ),
  );

  const botaoLer = h(
    "button",
    { type: "button", class: "mb-btn mb-btn--default mw-btn mw-btn--grande", disabled: true, onclick: () => void ler() },
    icone("scan-search", 16),
    h("span", null, "Ler Prints"),
  );
  const erroEscolha = h("div", { class: "mw-acoes__erro", role: "alert" });

  const etapaEscolha = h(
    "section",
    { class: "mw-imp__etapa", "aria-label": "Escolher os prints" },
    zona,
    listaIgnorados,
    campos,
    aviso,
    h("div", { class: "mw-imp__rodape" }, botaoLer),
    erroEscolha,
  );

  /* --------------------------------------------------------------- leitura */

  const barra = h("div", { class: "mb-progress__bar" });
  const progresso = h(
    "div",
    { class: "mb-progress mw-imp__progresso", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Progresso da leitura" },
    barra,
  );
  const textoProgresso = h("p", { class: "mw-imp__texto-progresso", "aria-live": "polite" });
  const botaoCancelar = botao("Cancelar", "x", () => controle?.abort());
  const etapaLendo = h(
    "section",
    { class: "mw-imp__etapa mw-imp__lendo", hidden: true, "aria-label": "Lendo os prints" },
    h("h3", { class: "mw-imp__subtitulo" }, "Lendo os prints"),
    progresso,
    textoProgresso,
    h("div", { class: "mw-imp__rodape" }, botaoCancelar),
  );

  /* --------------------------------------------------------------- revisão */

  const resumo = h("p", { class: "mw-imp__resumo", tabindex: "-1" });
  const fluxos = h("p", { class: "mw-imp__fluxos" });
  const lista = h("ul", { class: "mw-imp__lista", "aria-label": "Prints lidos" });
  const filtro: Segmentado<FiltroRevisao> = segmentado<FiltroRevisao>(
    "Mostrar os prints",
    [
      { valor: "duvidas", rotulo: "Com Dúvidas" },
      { valor: "todos", rotulo: "Todos" },
    ],
    "duvidas",
    (f) => {
      filtroRevisao = f;
      desenharLista();
    },
    "mw-imp__filtro",
  );
  const acoesRevisao = h(
    "div",
    { class: "mw-imp__acoes", role: "group", "aria-label": "O que fazer com o rascunho" },
    botao("Usar na Auditoria", "check", () => usar(), "mb-btn--default"),
    botao("Baixar Spec", "download", () => rascunho && baixar(rascunho.specJson, rascunho.specName, TIPO.json)),
    botao("Baixar Revisão", "download", () => rascunho && baixar(rascunho.reviewMd, rascunho.reviewName, TIPO.markdown)),
    botao("Baixar Checklist", "download", () => rascunho && baixar(rascunho.checklistMd, rascunho.checklistName, TIPO.markdown)),
    botao("Ler Outra Pasta", "folder-open", () => recomecar(), "mb-btn--plain"),
  );
  const etapaRevisao = h(
    "section",
    { class: "mw-imp__etapa", hidden: true, "aria-label": "Revisar o rascunho" },
    resumo,
    fluxos,
    acoesRevisao,
    filtro.el,
    lista,
  );

  /* ---------------------------------------------------------------- moldura */

  const el = h(
    "dialog",
    { class: "mw-dialogo mw-importar", "aria-labelledby": idTitulo },
    h(
      "div",
      { class: "mw-dialogo__barra" },
      h(
        "div",
        { class: "mw-dialogo__titulos" },
        h("h2", { id: idTitulo, class: "mw-dialogo__titulo" }, "Importar Prints do Figma"),
        h("p", { class: "mw-dialogo__sub" }, "Monta o rascunho da spec lendo os prints dos cards, aqui no navegador."),
      ),
      h(
        "button",
        { type: "button", class: "mb-btn mw-icone-btn", "aria-label": "Fechar", title: "Fechar", onclick: () => el.close() },
        icone("x", 16),
      ),
    ),
    h("div", { class: "mw-imp__corpo" }, etapaEscolha, etapaLendo, etapaRevisao),
  );

  el.addEventListener("close", () => {
    controle?.abort();
    leitor?.encerrar();
    leitor = null;
    origem?.focus();
  });
  el.addEventListener("click", (ev) => {
    if (ev.target === el) el.close();
  });

  /* ---------------------------------------------------------------- seleção */

  function aplicarSelecao(novas: Entrada[], extrasIgnorados: Ignorado[] = []): void {
    erroEscolha.replaceChildren();
    const s = selecionarPrints(novas);
    entradas = s.prints;
    pasta = s.pasta;
    ignorados = [...s.ignorados, ...extrasIgnorados];
    zona.classList.toggle("is-cheio", entradas.length > 0);
    campoProjeto.placeholder = pasta;
    if (entradas.length) {
      trocar(
        escolhido,
        icone("circle-check", 14, "mw-ok"),
        h("span", { class: "mw-dz__nome" }, pasta),
        h("span", { class: "mw-dz__detalhe" }, plural(entradas.length, "print", "prints")),
      );
    } else {
      escolhido.replaceChildren();
    }
    if (ignorados.length) {
      trocar(
        listaIgnorados,
        h(
          "details",
          { class: "mw-imp__detalhes" },
          h("summary", null, `${plural(ignorados.length, "arquivo ficou", "arquivos ficaram")} de fora`),
          h("ul", null, ...ignorados.map((i) => h("li", null, h("code", null, i.nome), `: ${i.motivo}`))),
        ),
      );
    } else {
      listaIgnorados.replaceChildren();
    }
    botaoLer.disabled = entradas.length === 0;
    if (!entradas.length && novas.length) {
      erro(erroEscolha, "Nenhum print em PNG ou JPG nessa seleção. Escolha a pasta com os prints dos cards.");
    }
  }

  function usarInput(input: HTMLInputElement): void {
    const arquivos = [...(input.files ?? [])];
    input.value = "";
    if (arquivos.length) aplicarSelecao(arquivos.map((a) => entradaDeArquivo(a)));
  }
  entradaPasta.addEventListener("change", () => usarInput(entradaPasta));
  entradaPrints.addEventListener("change", () => usarInput(entradaPrints));

  // Arrastar uma pasta (ou vários prints) para o quadro.
  let profundidade = 0;
  const temArquivo = (ev: DragEvent) => Array.from(ev.dataTransfer?.types ?? []).includes("Files");
  zona.addEventListener("dragenter", (ev) => {
    if (!temArquivo(ev)) return;
    ev.preventDefault();
    profundidade += 1;
    zona.classList.add("is-over");
  });
  zona.addEventListener("dragover", (ev) => {
    if (!temArquivo(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  zona.addEventListener("dragleave", () => {
    profundidade = Math.max(0, profundidade - 1);
    if (profundidade === 0) zona.classList.remove("is-over");
  });
  zona.addEventListener("drop", (ev) => {
    ev.preventDefault();
    profundidade = 0;
    zona.classList.remove("is-over");
    const dt = ev.dataTransfer;
    if (!dt) return;
    // As entradas só valem durante o evento: pega todas agora.
    const itens = [...dt.items].filter((i) => i.kind === "file").map((i) => i.webkitGetAsEntry?.() ?? null);
    const soltos = [...dt.files];
    void (async () => {
      const unica = itens.length === 1 ? itens[0] : null;
      if (unica?.isDirectory) {
        const dir = unica as FileSystemDirectoryEntry;
        const filhos = await lerPasta(dir);
        const novas: Entrada[] = [];
        const subpastas: Ignorado[] = [];
        for (const f of filhos) {
          if (f.isFile) novas.push(entradaDeArquivo(await arquivoDaEntrada(f as FileSystemFileEntry), `${dir.name}/${f.name}`));
          else if (!f.name.startsWith(".")) subpastas.push({ nome: `${f.name}/`, motivo: "é uma subpasta; só entram os prints da própria pasta" });
        }
        aplicarSelecao(novas, subpastas);
      } else {
        aplicarSelecao(soltos.map((a) => entradaDeArquivo(a, a.name)));
      }
    })().catch((e: unknown) => erro(erroEscolha, mensagemDeErro(e, "abrir a pasta")));
  });

  /* ---------------------------------------------------------------- leitura */

  function mostrar(etapa: Etapa): void {
    etapaEscolha.hidden = etapa !== "escolha";
    etapaLendo.hidden = etapa !== "lendo";
    etapaRevisao.hidden = etapa !== "revisao";
  }

  function andamento(p: ProgressoOcr): void {
    let pct = 0;
    if (p.etapa === "baixando") {
      pct = (p.feito / Math.max(1, p.total)) * 20;
      textoProgresso.textContent = p.doCache
        ? "Abrindo o leitor de texto guardado neste navegador…"
        : `Baixando o leitor de texto: ${mb(p.feito)} de ${mb(p.total)} MB…`;
    } else if (p.etapa === "preparando") {
      pct = 22;
      textoProgresso.textContent = "Preparando o leitor de texto…";
    } else {
      pct = 25 + (p.feito / Math.max(1, p.total)) * 75;
      textoProgresso.textContent =
        p.feito < p.total ? `Lendo ${numero(p.feito + 1)} de ${numero(p.total)}: ${p.arquivo ?? ""}` : "Montando o rascunho…";
    }
    barra.style.width = `${Math.round(pct)}%`;
    progresso.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  async function ler(): Promise<void> {
    if (!entradas.length) return;
    erroEscolha.replaceChildren();
    mostrar("lendo");
    andamento({ etapa: "baixando", feito: 0, total: BYTES_DO_OCR });
    botaoCancelar.focus();
    controle = new AbortController();
    try {
      leitor ??= deps.criarLeitorOcr();
      const lidos = await leitor.lerPrints(
        entradas.map((e) => ({ nome: e.nome, arquivo: e.arquivo })),
        { aoProgredir: andamento, sinal: controle.signal },
      );
      rascunho = deps.motor.rascunhoDosPrints(lidos, {
        pasta,
        projeto: campoProjeto.value,
        plataforma: campoPlataforma.value,
        agora: new Date(),
      });
      desenharRevisao();
      mostrar("revisao");
      resumo.focus();
    } catch (e) {
      mostrar("escolha");
      if (e instanceof DOMException && e.name === "AbortError") {
        leitor = null;
        erro(erroEscolha, "Leitura cancelada. Os prints continuam escolhidos; clique em Ler Prints para tentar de novo.", "info");
      } else {
        erro(erroEscolha, mensagemDeErro(e, "ler os prints"));
      }
      botaoLer.focus();
    } finally {
      controle = null;
    }
  }

  /* ---------------------------------------------------------------- revisão */

  function liberarMiniaturas(): void {
    for (const url of miniaturas) URL.revokeObjectURL(url);
    miniaturas = [];
  }

  function desenharRevisao(): void {
    const r = rascunho;
    if (!r) return;
    const comDuvida = r.review.filter((x) => x.doubts.length).length;
    trocar(
      resumo,
      h("strong", null, plural(r.review.length, "print lido", "prints lidos")),
      ` · ${plural(r.doubtsTotal, "ponto para conferir", "pontos para conferir")} · `,
      `${r.projeto} · ${nomePlataforma(campoPlataforma.value)}`,
    );
    const spec = JSON.parse(r.specJson) as { fluxos?: Record<string, string> };
    const nomes = Object.keys(spec.fluxos ?? {});
    fluxos.textContent = nomes.length ? `Fluxos detectados: ${nomes.join(", ")}.` : "";
    fluxos.hidden = !nomes.length;
    filtroRevisao = comDuvida ? "duvidas" : "todos";
    filtro.selecionar(filtroRevisao);
    filtro.contagens({ duvidas: comDuvida, todos: r.review.length });
    liberarMiniaturas();
    const porNome = new Map(entradas.map((e) => [e.nome, e.arquivo]));
    miniaturas = r.review.map((x) => {
      const arquivo = porNome.get(x.print);
      return arquivo ? URL.createObjectURL(arquivo) : "";
    });
    desenharLista();
  }

  function desenharLista(): void {
    const r = rascunho;
    if (!r) return;
    const itens = r.review
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => filtroRevisao === "todos" || x.doubts.length > 0);
    trocar(
      lista,
      itens.length
        ? itens.map(({ x, i }) =>
            h(
              "li",
              { class: "mb-card mw-imp__card" },
              miniaturas[i]
                ? h(
                    "a",
                    { href: miniaturas[i]!, target: "_blank", rel: "noopener", class: "mw-imp__mini", title: `Abrir ${x.print}` },
                    h("img", { src: miniaturas[i]!, alt: `Print ${x.print}`, loading: "lazy", decoding: "async" }),
                  )
                : null,
              h(
                "div",
                { class: "mw-imp__info" },
                h("p", { class: "mw-imp__print" }, h("code", null, x.print)),
                h("p", { class: "mw-imp__evento" }, x.event ? h("strong", null, x.event) : h("em", null, "sem evento lido")),
                x.doubts.length
                  ? h(
                      "ul",
                      { class: "mw-imp__duvidas" },
                      ...x.doubts.map((d) => h("li", null, icone("triangle-alert", 13), h("span", null, d))),
                    )
                  : h("p", { class: "mw-imp__ok" }, icone("circle-check", 13), "Nada a conferir"),
              ),
            ),
          )
        : h("li", { class: "mw-imp__vazio" }, "Nenhum print com dúvida. Veja Todos para conferir os cards."),
    );
  }

  function usar(): void {
    if (!rascunho) return;
    aoUsar(rascunho);
    el.close();
    avisar("Rascunho da spec carregado. Confira as dúvidas antes de confiar na auditoria.");
  }

  function recomecar(): void {
    rascunho = null;
    liberarMiniaturas();
    lista.replaceChildren();
    mostrar("escolha");
    botaoPasta.focus();
  }

  function erro(alvo: HTMLElement, mensagem: string, tipo: "erro" | "info" = "erro"): void {
    trocar(
      alvo,
      h(
        "p",
        { class: tipo === "erro" ? "mb-inline-error" : "mw-imp__info-msg" },
        icone(tipo === "erro" ? "circle-alert" : "info", 14),
        h("span", null, mensagem),
      ),
    );
  }

  return {
    el,
    abrir() {
      origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!rascunho) mostrar("escolha");
      el.showModal();
      (rascunho ? resumo : botaoPasta).focus();
    },
  };
}
