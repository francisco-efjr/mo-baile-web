// Aba Relatório: escolhe a spec e o log, chama o motor (audit) e desenha o
// resultado no visual do relatório do Mo baile. Nenhuma regra de auditoria
// mora aqui: tudo que é decisão vem pronto do motor.
import type { AuditReport, AuditRow, ExtraEvent, LogRead, Platform, Spec, SpecSummary } from "../engine/index";
import {
  botao,
  campoBusca,
  casaBusca,
  chipPlataforma,
  rotuloStatus,
  segmentado,
  statusVisual,
  type Segmentado,
} from "./componentes";
import { aposPintar, h, novoId, prefereMenosMovimento, sr, trocar } from "./dom";
import { icone } from "./icons";
import {
  lerArquivo,
  mensagemDeErro,
  nomePlataforma,
  numero,
  plural,
  porcentagem,
  tamanhoLegivel,
  type Dependencias,
} from "./motor";
import { baixar, copiarComAviso, dataArquivo, slug, TIPO } from "./saida";
import { criarSeletor } from "./seletor";

type Filtro = "all" | "action" | "error" | "missing" | "ok";

const FILTROS: Record<Filtro, (status: string) => boolean> = {
  all: () => true,
  action: (s) => s !== "ok",
  error: (s) => s === "error",
  missing: (s) => s === "missing",
  ok: (s) => s === "ok",
};

const PASSO_LINHAS = 200;

interface Estado {
  spec: { nome: string; spec: Spec; resumo: SpecSummary } | null;
  log: { nome: string; log: LogRead } | null;
  report: AuditReport | null;
  filtro: Filtro;
  busca: string;
  selecionado: number | null;
  limite: number;
}

export interface PainelRelatorio {
  el: HTMLElement;
}

export function criarRelatorio(deps: Dependencias): PainelRelatorio {
  const { motor } = deps;
  const estado: Estado = { spec: null, log: null, report: null, filtro: "all", busca: "", selecionado: null, limite: PASSO_LINHAS };
  const idDetalhe = novoId("detalhe");

  /* ------------------------------------------------------------ entrada */

  const seletorSpec = criarSeletor({
    titulo: "Spec da demanda",
    dica: ["O JSON da spec de tagueamento (os cards do Figma), exportado ou editado no Mo baile."],
    aceitar: ".json,application/json",
    rotuloBotao: "Escolher Spec…",
    icone: "file-code",
    aoEscolher: (arquivo) => void escolherSpec(arquivo),
  });

  const seletorLog = criarSeletor({
    titulo: "Log de eventos",
    dica: [
      "Um logcat salvo (",
      h("code", null, ".txt"),
      "), o JSON do Firebase ou o JSON exportado pelo Analytics do Mo baile.",
    ],
    aceitar: ".txt,.log,.json,text/plain,application/json",
    rotuloBotao: "Escolher Log…",
    icone: "radio-tower",
    aoEscolher: (arquivo) => void escolherLog(arquivo),
  });

  const idPlataforma = novoId("plataforma");
  const opcaoDaSpec = h("option", { value: "" }, "A da Spec");
  const plataforma = h(
    "select",
    { id: idPlataforma, class: "mb-popup mw-select" },
    opcaoDaSpec,
    h("option", { value: "android" }, "Android"),
    h("option", { value: "ios" }, "iOS"),
  );
  plataforma.addEventListener("change", marcarDesatualizado);

  const botaoAuditar = h(
    "button",
    { type: "button", class: "mb-btn mb-btn--default mw-btn mw-btn--grande", onclick: () => void auditar() },
    icone("scan-search", 16),
    h("span", null, "Auditar"),
  );

  const exemploDisponivel = deps.exemplo.spec.trim() !== "" && deps.exemplo.log.trim() !== "";
  const botaoExemplo = exemploDisponivel
    ? botao("Experimentar com um Exemplo", "layers", () => void usarExemplo(), "mb-btn--plain mw-btn--grande")
    : null;

  const erroAuditoria = h("div", { class: "mw-acoes__erro", role: "alert" });
  const statusAuditoria = h("p", { class: "mw-acoes__status", "aria-live": "polite" });

  const desatualizado = h(
    "p",
    { class: "mw-aviso mw-aviso--warn", hidden: true },
    icone("info", 15),
    h("span", null, "Você trocou a spec, o log ou a plataforma. Clique em Auditar para atualizar o resultado abaixo."),
  );

  const vazio = h(
    "div",
    { class: "mb-empty mw-vazio" },
    h("div", { class: "mb-empty__icon" }, icone("list-filter", 34)),
    h("h2", { class: "mb-empty__title" }, "Nenhuma auditoria ainda"),
    h(
      "p",
      { class: "mb-empty__text" },
      "Escolha a spec e o log e clique em Auditar. A leitura e a auditoria acontecem neste navegador.",
    ),
  );

  /* ---------------------------------------------------------- resultado */

  const tituloResultado = h("h2", { class: "mw-res__titulo", id: "mw-res-titulo", tabindex: "-1" });
  const metaResultado = h("div", { class: "mw-res__meta" });
  const barra = h("div", { class: "mw-barra", role: "img" });
  const tiles = h("ul", { class: "mw-tiles", "aria-label": "Resumo da auditoria" });
  const estatisticas = h("p", { class: "mw-res__stats" });
  const erroExportar = h("div", { class: "mw-acoes__erro", role: "alert" });

  const exportar = h(
    "div",
    { class: "mw-exportar", role: "group", "aria-label": "Exportar o relatório" },
    botao("Ver HTML", "file-code", () => verHtml()),
    botao("Baixar HTML", "download", () => baixarHtml()),
    botao("Baixar Markdown", "download", () => baixarTexto("markdown")),
    botao("Baixar TSV", "download", () => baixarTexto("tsv")),
    botao("Copiar Resumo", "copy", () => void copiarResumo()),
  );

  const filtro: Segmentado<Filtro> = segmentado<Filtro>(
    "Filtrar as validações por status",
    [
      { valor: "all", rotulo: "Todas" },
      { valor: "action", rotulo: "Pedem Ação" },
      { valor: "error", rotulo: "Divergentes" },
      { valor: "missing", rotulo: "Não Disparadas" },
      { valor: "ok", rotulo: "OK" },
    ],
    "all",
    (f) => {
      estado.filtro = f;
      estado.limite = PASSO_LINHAS;
      desenharTabela();
      desenharTiles();
    },
    "mw-filtro",
  );

  const busca = campoBusca("Buscar nas validações", "Buscar evento, parâmetro ou divergência", (valor) => {
    estado.busca = valor;
    estado.limite = PASSO_LINHAS;
    desenharTabela();
    desenharExtras();
  });

  const contagem = h("p", { class: "mw-contagem", "aria-live": "polite" });
  const idLegenda = novoId("legenda");
  const corpoTabela = h("tbody");
  const tabela = h(
    "table",
    { class: "mw-tabela mw-tabela--resultados" },
    h("caption", { id: idLegenda, class: "mw-sr" }, "Validações da auditoria"),
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { scope: "col" }, "Status"),
        h("th", { scope: "col" }, "Evento"),
        h("th", { scope: "col", class: "mw-col-larga" }, "Variação"),
        h("th", { scope: "col", class: "mw-col-larga" }, "Divergências"),
        h("th", { scope: "col", class: "mw-col-opc" }, "Seção"),
        h("th", { scope: "col", class: "mw-col-opc mw-num" }, "Disparos"),
      ),
    ),
    corpoTabela,
  );
  const semLinhas = h(
    "div",
    { class: "mb-empty mw-vazio-tabela", hidden: true },
    h("p", { class: "mb-empty__title" }, "Nenhuma validação com esse filtro"),
    h(
      "p",
      { class: "mb-empty__text" },
      "Troque o filtro ou limpe a busca para ver as outras validações.",
    ),
    botao("Mostrar Todas", "list-filter", () => {
      busca.limpar();
      estado.busca = "";
      estado.filtro = "all";
      filtro.selecionar("all");
      desenharTabela();
      desenharTiles();
      desenharExtras();
    }),
  );
  const mostrarMais = botao("Mostrar Mais", "chevron-down", () => {
    estado.limite += PASSO_LINHAS;
    desenharTabela();
  }, "mw-mais");
  mostrarMais.hidden = true;

  const rolagemTabela = h(
    "div",
    { class: "mw-tabela-rolagem", role: "region", "aria-labelledby": idLegenda, tabindex: "0" },
    tabela,
  );

  const detalhe = h("section", { class: "mw-detalhe", id: idDetalhe, "aria-label": "Detalhe da validação" });

  const extras = h("section", { class: "mw-extras", "aria-labelledby": "mw-extras-titulo" });

  const resultado = h(
    "section",
    { class: "mw-res", hidden: true, "aria-labelledby": "mw-res-titulo" },
    h(
      "div",
      { class: "mw-res__cabeca" },
      h("div", { class: "mw-res__titulos" }, tituloResultado, metaResultado),
      exportar,
    ),
    erroExportar,
    barra,
    tiles,
    estatisticas,
    h("div", { class: "mw-filtros" }, filtro.el, h("div", { class: "mw-filtros__busca" }, busca.el, contagem)),
    h(
      "div",
      { class: "mw-mestre-detalhe" },
      h("div", { class: "mw-mestre" }, rolagemTabela, semLinhas, mostrarMais),
      detalhe,
    ),
    extras,
  );

  corpoTabela.addEventListener("click", (ev) => {
    const linha = (ev.target as Element).closest<HTMLTableRowElement>("tr[data-id]");
    if (!linha) return;
    // Clique em texto selecionado não troca a linha: deixa copiar.
    if (ev.target instanceof Element && !ev.target.closest("button") && String(window.getSelection() ?? "") !== "") return;
    selecionar(Number(linha.dataset.id), ev.target instanceof Element && !!ev.target.closest("button"));
  });

  const dialogo = criarDialogoHtml();

  const el = h(
    "div",
    { class: "mw-painel" },
    h(
      "header",
      { class: "mw-intro" },
      h("h1", { class: "mw-intro__titulo" }, "Relatório"),
      h(
        "p",
        { class: "mw-intro__texto" },
        "Audite o tagueamento: a spec da demanda contra um log de eventos do Firebase Analytics. O resultado mostra, parâmetro por parâmetro, o que está OK, divergente ou não disparou.",
      ),
    ),
    h("div", { class: "mw-entrada" }, seletorSpec.el, seletorLog.el),
    h(
      "div",
      { class: "mw-acoes" },
      h(
        "div",
        { class: "mw-acoes__linha" },
        h("label", { for: idPlataforma, class: "mw-rotulo" }, "Plataforma"),
        h("span", { class: "mw-select-caixa" }, plataforma, icone("chevron-down", 14, "mw-select-seta")),
        botaoAuditar,
        botaoExemplo,
        statusAuditoria,
      ),
      erroAuditoria,
    ),
    desatualizado,
    vazio,
    resultado,
    dialogo.el,
  );

  /* ------------------------------------------------------------ leitura */

  function aplicarSpec(texto: string, nome: string, tamanho: number | null): boolean {
    try {
      const spec = motor.loadSpec(texto, nome);
      const resumo = motor.specSummary(spec, nome);
      estado.spec = { nome, spec, resumo };
      const partes = [
        resumo.projeto,
        plural(resumo.cards, "card", "cards"),
        plural(resumo.variants, "variação", "variações"),
        nomePlataforma(resumo.plataforma),
      ];
      if (tamanho !== null) partes.push(tamanhoLegivel(tamanho));
      seletorSpec.mostrarArquivo(nome, partes.join(" · "));
      opcaoDaSpec.textContent = `A da Spec (${nomePlataforma(resumo.plataforma)})`;
      return true;
    } catch (erro) {
      estado.spec = null;
      seletorSpec.limpar();
      opcaoDaSpec.textContent = "A da Spec";
      seletorSpec.erro(mensagemDeErro(erro, "ler a spec"));
      return false;
    }
  }

  function aplicarLog(texto: string, nome: string, tamanho: number | null): boolean {
    try {
      const log = motor.readLog(texto, nome);
      estado.log = { nome, log };
      const partes = [
        log.format === "logcat" ? "logcat" : "JSON",
        plural(log.items.length, "registro", "registros"),
      ];
      if (tamanho !== null) partes.push(tamanhoLegivel(tamanho));
      seletorLog.mostrarArquivo(nome, partes.join(" · "));
      return true;
    } catch (erro) {
      estado.log = null;
      seletorLog.limpar();
      seletorLog.erro(mensagemDeErro(erro, "ler o log"));
      return false;
    }
  }

  async function escolherSpec(arquivo: File): Promise<void> {
    seletorSpec.erro(null);
    seletorSpec.ocupado(true);
    try {
      await aposPintar();
      const texto = await lerArquivo(motor, arquivo);
      aplicarSpec(texto, arquivo.name, arquivo.size);
    } catch (erro) {
      estado.spec = null;
      seletorSpec.limpar();
      seletorSpec.erro(mensagemDeErro(erro, "ler a spec"));
    } finally {
      seletorSpec.ocupado(false);
      marcarDesatualizado();
    }
  }

  async function escolherLog(arquivo: File): Promise<void> {
    seletorLog.erro(null);
    seletorLog.ocupado(true);
    try {
      await aposPintar();
      const texto = await lerArquivo(motor, arquivo);
      aplicarLog(texto, arquivo.name, arquivo.size);
    } catch (erro) {
      estado.log = null;
      seletorLog.limpar();
      seletorLog.erro(mensagemDeErro(erro, "ler o log"));
    } finally {
      seletorLog.ocupado(false);
      marcarDesatualizado();
    }
  }

  async function usarExemplo(): Promise<void> {
    const ex = deps.exemplo;
    seletorSpec.erro(null);
    seletorLog.erro(null);
    const specOk = aplicarSpec(ex.spec, ex.specNome, null);
    const logOk = aplicarLog(ex.log, ex.logNome, null);
    plataforma.value = "";
    if (specOk && logOk) await auditar();
  }

  function marcarDesatualizado(): void {
    desatualizado.hidden = estado.report === null;
  }

  /* ---------------------------------------------------------- auditoria */

  async function auditar(): Promise<void> {
    erroAuditoria.replaceChildren();
    if (!estado.spec) {
      seletorSpec.erro("Escolha a spec da demanda antes de auditar.");
      seletorSpec.botao.focus();
      return;
    }
    if (!estado.log) {
      seletorLog.erro("Escolha o log de eventos antes de auditar.");
      seletorLog.botao.focus();
      return;
    }
    botaoAuditar.disabled = true;
    trocar(statusAuditoria, h("span", { class: "mb-spinner mw-spin", "aria-hidden": "true" }), "Auditando…");
    try {
      await aposPintar();
      const escolhida = plataforma.value as "" | Platform;
      const report = motor.audit(estado.spec.spec, estado.log.log, escolhida ? { platform: escolhida } : {});
      estado.report = report;
      estado.filtro = "all";
      estado.busca = "";
      estado.selecionado = null;
      estado.limite = PASSO_LINHAS;
      busca.limpar();
      filtro.selecionar("all");
      desenharResultado();
      vazio.hidden = true;
      resultado.hidden = false;
      desatualizado.hidden = true;
      statusAuditoria.textContent = `Auditoria concluída: ${porcentagem(report.summary.compliance_rate)} de conformidade.`;
      tituloResultado.focus({ preventScroll: true });
      tituloResultado.scrollIntoView({ behavior: prefereMenosMovimento() ? "auto" : "smooth", block: "start" });
    } catch (erro) {
      statusAuditoria.replaceChildren();
      trocar(
        erroAuditoria,
        h("p", { class: "mb-inline-error" }, icone("circle-alert", 14), h("span", null, mensagemDeErro(erro, "auditar"))),
      );
    } finally {
      botaoAuditar.disabled = false;
    }
  }

  /* ------------------------------------------------------------ desenho */

  function desenharResultado(): void {
    const r = estado.report;
    if (!r) return;
    const s = r.summary;
    trocar(
      tituloResultado,
      sr("Resultado da auditoria: "),
      h("span", { class: "mw-res__pct" }, porcentagem(s.compliance_rate)),
      " ",
      h("span", { class: "mw-res__conforme" }, "conforme"),
    );
    trocar(
      metaResultado,
      chipPlataforma(r.platform, nomePlataforma(r.platform)),
      h("span", { class: "mw-res__projeto" }, r.spec.projeto),
      r.spec.versao_especificacao ? h("span", null, `versão ${r.spec.versao_especificacao}`) : null,
      h("span", { class: "mw-res__arquivo" }, icone("file-code", 13), r.spec.name),
      h("span", { class: "mw-res__arquivo" }, icone("radio-tower", 13), r.log_name),
    );

    const total = Math.max(1, s.total);
    barra.replaceChildren();
    for (const [classe, valor] of [["ok", s.ok], ["err", s.divergent], ["miss", s.missing]] as const) {
      const seg = h("span", { class: `mw-barra__seg mw-barra__seg--${classe}` });
      seg.style.width = `${(valor / total) * 100}%`;
      barra.appendChild(seg);
    }
    barra.setAttribute(
      "aria-label",
      `${plural(s.ok, "OK", "OK")}, ${plural(s.divergent, "divergente", "divergentes")} e ${plural(s.missing, "não disparada", "não disparadas")} de ${plural(s.total, "validação", "validações")}.`,
    );

    const st = r.log_stats;
    estatisticas.textContent =
      `${plural(st.total_lidos, "evento lido", "eventos lidos")} no arquivo · ${numero(st.da_plataforma)} da plataforma · ` +
      `${plural(st.duplicados, "duplicado removido", "duplicados removidos")} · ${numero(st.uteis)} usados na auditoria`;

    filtro.contagens({
      all: r.results.length,
      action: r.results.filter((x) => FILTROS.action(x.status)).length,
      error: r.results.filter((x) => x.status === "error").length,
      missing: r.results.filter((x) => x.status === "missing").length,
      ok: r.results.filter((x) => x.status === "ok").length,
    });

    desenharTiles();
    desenharTabela();
    desenharDetalhe(null);
    desenharExtras();
  }

  function desenharTiles(): void {
    const r = estado.report;
    if (!r) return;
    const s = r.summary;
    const tile = (
      valor: string,
      rotulo: string,
      nomeIcone: Parameters<typeof icone>[0] | null,
      classe: string,
      acao: (() => void) | null,
      ativo: boolean | null = null,
    ) => {
      const conteudo = [
        h("span", { class: "mw-tile__valor" }, valor),
        h("span", { class: `mw-tile__rotulo mb-status ${classe}` }, nomeIcone ? icone(nomeIcone, 14) : null, rotulo),
      ];
      return h(
        "li",
        null,
        acao
          ? h(
              "button",
              {
                type: "button",
                class: `mw-tile${ativo ? " is-active" : ""}`,
                "aria-pressed": ativo === null ? null : String(ativo),
                onclick: acao,
              },
              ...conteudo,
            )
          : h("div", { class: "mw-tile mw-tile--fixo" }, ...conteudo),
      );
    };
    const filtrar = (f: Filtro) => () => {
      estado.filtro = estado.filtro === f && f !== "all" ? "all" : f;
      estado.limite = PASSO_LINHAS;
      filtro.selecionar(estado.filtro);
      desenharTabela();
      desenharTiles();
    };
    const irParaExtras = () => {
      extras.scrollIntoView({ behavior: prefereMenosMovimento() ? "auto" : "smooth", block: "start" });
      extras.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    };
    trocar(
      tiles,
      tile(numero(s.total), "Validações", null, "", filtrar("all")),
      tile(numero(s.ok), "OK", "circle-check", "mb-status--ok", filtrar("ok"), estado.filtro === "ok"),
      tile(numero(s.divergent), "Divergentes", "circle-x", "mb-status--error", filtrar("error"), estado.filtro === "error"),
      tile(numero(s.missing), "Não disparadas", "triangle-alert", "mb-status--warn", filtrar("missing"), estado.filtro === "missing"),
      tile(numero(s.extras), "Fora da spec", "minus", "mb-status--off", irParaExtras),
      tile(numero(s.alerts), "Alertas", "circle-alert", s.alerts > 0 ? "mb-status--error" : "mb-status--off", irParaExtras),
    );
  }

  function textoBusca(row: AuditRow): string {
    return [
      row.section,
      row.card_title,
      row.flow_label ?? "",
      row.event,
      row.variation,
      row.divergences,
      rotuloStatus(row.status),
      row.ga_screen ?? "",
      row.note ?? "",
      ...row.checks.flatMap((c) => [c.field, c.expected, c.obtained]),
    ].join(" ");
  }

  function linhasVisiveis(): AuditRow[] {
    const r = estado.report;
    if (!r) return [];
    const passa = FILTROS[estado.filtro];
    return r.results.filter((row) => passa(row.status) && casaBusca(textoBusca(row), estado.busca));
  }

  function desenharTabela(): void {
    const r = estado.report;
    if (!r) return;
    const linhas = linhasVisiveis();
    const mostradas = linhas.slice(0, estado.limite);
    corpoTabela.replaceChildren(
      ...mostradas.map((row) => {
        const sel = row.id === estado.selecionado;
        return h(
          "tr",
          { "data-id": row.id, "data-s": row.status, class: sel ? "is-selected" : null },
          h("td", null, statusVisual(row.status)),
          h(
            "td",
            { class: "mw-ev" },
            h(
              "button",
              { type: "button", class: "mw-linkbtn", "aria-controls": idDetalhe, "aria-current": sel ? "true" : null },
              row.event,
            ),
            // Em tela estreita a coluna Variação some e o valor aparece aqui.
            h("span", { class: "mw-ev__variacao" }, row.variation),
            row.flow_label ? h("span", { class: "mw-ev__fluxo" }, row.flow_label) : null,
          ),
          h("td", { class: "mw-mono mw-col-larga" }, row.variation),
          h("td", { class: "mw-div mw-col-larga" }, row.divergences),
          h("td", { class: "mw-col-opc" }, row.section),
          h("td", { class: "mw-col-opc mw-num" }, numero(row.occurrences)),
        );
      }),
    );
    const total = r.results.length;
    contagem.textContent =
      linhas.length === total ? plural(total, "validação", "validações") : `${numero(linhas.length)} de ${plural(total, "validação", "validações")}`;
    semLinhas.hidden = linhas.length > 0;
    rolagemTabela.hidden = linhas.length === 0;
    mostrarMais.hidden = linhas.length <= mostradas.length;
    if (!mostrarMais.hidden) {
      trocar(mostrarMais.querySelector("span") as HTMLSpanElement, `Mostrar Mais (${numero(linhas.length - mostradas.length)} restantes)`);
    }
  }

  function selecionar(id: number, viaBotao: boolean): void {
    estado.selecionado = id;
    for (const tr of corpoTabela.querySelectorAll<HTMLTableRowElement>("tr[data-id]")) {
      const on = Number(tr.dataset.id) === id;
      tr.classList.toggle("is-selected", on);
      const b = tr.querySelector("button");
      if (on) b?.setAttribute("aria-current", "true");
      else b?.removeAttribute("aria-current");
    }
    const row = estado.report?.results.find((x) => x.id === id) ?? null;
    desenharDetalhe(row);
    // Em tela estreita o detalhe fica embaixo da tabela: leva o foco até ele.
    if (window.matchMedia("(max-width: 1099px)").matches) {
      const titulo = detalhe.querySelector<HTMLElement>("h3");
      detalhe.scrollIntoView({ behavior: prefereMenosMovimento() ? "auto" : "smooth", block: "start" });
      titulo?.focus({ preventScroll: true });
    } else if (!viaBotao) {
      corpoTabela.querySelector<HTMLButtonElement>(`tr[data-id="${id}"] button`)?.focus({ preventScroll: true });
    }
  }

  function fecharDetalhe(): void {
    const id = estado.selecionado;
    estado.selecionado = null;
    for (const tr of corpoTabela.querySelectorAll("tr.is-selected")) tr.classList.remove("is-selected");
    desenharDetalhe(null);
    const b = id === null ? null : corpoTabela.querySelector<HTMLButtonElement>(`tr[data-id="${id}"] button`);
    b?.removeAttribute("aria-current");
    b?.focus();
  }

  function desenharDetalhe(row: AuditRow | null): void {
    detalhe.classList.toggle("is-vazio", row === null);
    if (!row) {
      trocar(
        detalhe,
        h(
          "div",
          { class: "mb-empty mw-detalhe__vazio" },
          h("div", { class: "mb-empty__icon" }, icone("scan-search", 28)),
          h("p", { class: "mb-empty__text" }, "Escolha uma validação na tabela para ver Obtido × Esperado de cada parâmetro."),
        ),
      );
      return;
    }
    const disparos = plural(row.occurrences, "disparo", "disparos");
    const quando = row.matched?.time ? `log ${row.matched.time} · ${disparos}` : disparos;
    const meta: [string, string | null][] = [
      ["Seção", row.section],
      ["Card", row.card_title],
      ["Fluxo", row.flow_label],
      ["Variação", row.variation],
      ["Disparo", quando],
      ["Tela GA", row.ga_screen == null ? null : String(row.ga_screen)],
      ["Nota", row.note],
    ];

    let validacao: HTMLElement;
    if (row.checks.length > 0) {
      validacao = h(
        "table",
        { class: "mw-checks mw-checks--icone" },
        h("caption", { class: "mw-sr" }, "Obtido e esperado de cada parâmetro"),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { scope: "col" }, sr("Resultado")),
            h("th", { scope: "col" }, "Parâmetro"),
            h("th", { scope: "col" }, "Obtido"),
            h("th", { scope: "col" }, "Esperado"),
          ),
        ),
        h(
          "tbody",
          null,
          ...row.checks.map((c) =>
            h(
              "tr",
              { class: c.ok ? null : "is-bad" },
              h("td", null, icone(c.ok ? "circle-check" : "circle-x", 14, c.ok ? "mw-ok" : "mw-bad"), sr(c.ok ? "confere" : "diverge")),
              h("th", { scope: "row", class: "mw-checks__campo" }, c.field),
              h("td", { class: "mw-checks__obtido" }, c.obtained),
              h("td", { class: "mw-checks__esperado" }, c.expected),
            ),
          ),
        ),
      );
    } else {
      validacao = h(
        "div",
        { class: "mw-detalhe__faltou" },
        h(
          "p",
          { class: "mw-aviso mw-aviso--warn" },
          icone("triangle-alert", 15),
          h("span", null, row.divergences || "Não disparado no log."),
        ),
        row.expected.length
          ? h(
              "table",
              { class: "mw-checks" },
              h("caption", { class: "mw-sr" }, "Parâmetros esperados pela spec"),
              h("thead", null, h("tr", null, h("th", { scope: "col" }, "Parâmetro"), h("th", { scope: "col" }, "Esperado (spec)"))),
              h(
                "tbody",
                null,
                ...row.expected.map((e) =>
                  h("tr", null, h("th", { scope: "row", class: "mw-checks__campo" }, e.key), h("td", { class: "mw-checks__esperado" }, e.value)),
                ),
              ),
            )
          : null,
      );
    }

    const anteriores =
      row.older_divergent > 0
        ? h(
            "p",
            { class: "mw-aviso mw-aviso--warn" },
            icone("triangle-alert", 15),
            h(
              "span",
              null,
              `${plural(row.older_divergent, "disparo anterior", "disparos anteriores")} com divergência: `,
              h("span", { class: "mw-mono" }, row.older_divergences.map((d) => String(d)).join(", ")),
            ),
          )
        : null;

    const titulo = h("h3", { class: "mw-detalhe__titulo", tabindex: "-1" }, row.event);
    trocar(
      detalhe,
      h(
        "div",
        { class: "mw-detalhe__cabeca" },
        h("div", { class: "mw-detalhe__titulos" }, titulo, statusVisual(row.status)),
        h(
          "button",
          { type: "button", class: "mb-btn mb-btn--plain mw-icone-btn", "aria-label": "Fechar Detalhe", title: "Fechar Detalhe", onclick: fecharDetalhe },
          icone("x", 16),
        ),
      ),
      h(
        "dl",
        { class: "mw-dl" },
        ...meta
          .filter(([, v]) => v)
          .map(([k, v]) => h("div", null, h("dt", null, k), h("dd", { class: k === "Variação" ? "mw-mono" : null }, v))),
      ),
      h("h4", { class: "mw-detalhe__secao" }, "Validação"),
      validacao,
      anteriores,
      h(
        "div",
        { class: "mw-detalhe__bloco-cabeca" },
        h("h4", { class: "mw-detalhe__secao" }, "Bloco"),
        botao("Copiar Bloco", "copy", () => void copiarComAviso(row.block, "Bloco"), "mb-btn--small"),
      ),
      h("pre", { class: "mw-bloco", tabindex: "0", "aria-label": "Bloco do disparo" }, row.block),
    );
  }

  function desenharExtras(): void {
    const r = estado.report;
    if (!r) return;
    const filtrar = (lista: ExtraEvent[]) =>
      lista.filter((e) => casaBusca([e.event, e.screen, e.flow_name, e.component, e.detail].join(" "), estado.busca));
    const tabelaExtras = (lista: ExtraEvent[], legenda: string, vazioTexto: string, completa: boolean) => {
      if (lista.length === 0) return h("p", { class: "mw-nada" }, vazioTexto);
      return h(
        "div",
        { class: "mw-tabela-rolagem mw-tabela-rolagem--mini", role: "region", "aria-label": legenda, tabindex: "0" },
        h(
          "table",
          { class: "mw-tabela mw-tabela--mini" },
          h("caption", { class: "mw-sr" }, legenda),
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", { scope: "col" }, "Evento"),
              h("th", { scope: "col" }, "Tela"),
              completa ? h("th", { scope: "col" }, "flow_name") : null,
              completa ? h("th", { scope: "col" }, "component") : null,
              completa ? h("th", { scope: "col" }, "detail") : null,
              h("th", { scope: "col", class: "mw-num" }, "Disparos"),
            ),
          ),
          h(
            "tbody",
            null,
            ...lista.map((e) =>
              h(
                "tr",
                null,
                h("td", { class: "mw-ev mw-mono" }, e.event),
                h("td", { class: "mw-mono" }, e.screen ?? "-"),
                completa ? h("td", { class: "mw-mono" }, e.flow_name ?? "-") : null,
                completa ? h("td", { class: "mw-mono" }, e.component ?? "-") : null,
                completa ? h("td", { class: "mw-mono" }, e.detail ?? "-") : null,
                h("td", { class: "mw-num" }, numero(e.count)),
              ),
            ),
          ),
        ),
      );
    };
    const fora = filtrar(r.extras);
    const alertas = filtrar(r.alerts);
    const regra = r.observations
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("Regra:"));
    trocar(
      extras,
      h("h3", { id: "mw-extras-titulo", class: "mw-secao__titulo", tabindex: "-1" }, "Fora da spec e alertas"),
      h(
        "div",
        { class: "mw-extras__grade" },
        h(
          "div",
          { class: "mb-card mw-cartao" },
          h("h4", { class: "mw-cartao__titulo" }, icone("minus", 15), "Fora da spec", h("span", { class: "mb-count--pill" }, String(r.extras.length))),
          h("p", { class: "mw-cartao__texto" }, "Eventos dos fluxos da spec que nenhum card cobre. Confira se falta um card no Figma ou se o app dispara a mais."),
          tabelaExtras(fora, "Eventos fora da spec", estado.busca ? "Nenhum evento fora da spec com essa busca." : "Nenhum evento fora da spec.", true),
        ),
        h(
          "div",
          { class: "mb-card mw-cartao" },
          h("h4", { class: "mw-cartao__titulo" }, icone("circle-alert", 15), "Alertas", h("span", { class: "mb-count--pill" }, String(r.alerts.length))),
          h("p", { class: "mw-cartao__texto" }, "app_exception e error_view nas telas da spec."),
          tabelaExtras(alertas, "Alertas", estado.busca ? "Nenhum alerta com essa busca." : "Nenhum alerta.", false),
        ),
      ),
      regra ? h("p", { class: "mw-regra" }, icone("info", 14), h("span", null, regra)) : null,
    );
  }

  /* ----------------------------------------------------------- exportar */

  function nomeBase(): string {
    const r = estado.report;
    if (!r) return "relatorio";
    return `relatorio_${slug(r.spec.projeto)}_${r.platform}_${dataArquivo()}`;
  }

  function erroNaExportacao(erro: unknown): void {
    trocar(
      erroExportar,
      h("p", { class: "mb-inline-error" }, icone("circle-alert", 14), h("span", null, mensagemDeErro(erro, "gerar o relatório"))),
    );
  }

  function gerarHtml(): string | null {
    const r = estado.report;
    if (!r) return null;
    erroExportar.replaceChildren();
    try {
      return motor.exportHtml(r, {});
    } catch (erro) {
      erroNaExportacao(erro);
      return null;
    }
  }

  function baixarHtml(): void {
    const html = gerarHtml();
    if (html !== null) baixar(html, `${nomeBase()}.html`, TIPO.html);
  }

  function verHtml(): void {
    const html = gerarHtml();
    if (html !== null) dialogo.abrir(html, () => baixar(html, `${nomeBase()}.html`, TIPO.html));
  }

  function baixarTexto(tipo: "markdown" | "tsv"): void {
    const r = estado.report;
    if (!r) return;
    erroExportar.replaceChildren();
    if (tipo === "markdown") baixar(r.markdown, `${nomeBase()}.md`, TIPO.markdown);
    else baixar(r.tsv, `${nomeBase()}.tsv`, TIPO.tsv);
  }

  async function copiarResumo(): Promise<void> {
    const r = estado.report;
    if (!r) return;
    const s = r.summary;
    const pendentes = r.results.filter((x) => x.status !== "ok");
    const linhas = [
      `Auditoria de tagueamento: ${r.spec.projeto} (${nomePlataforma(r.platform)})`,
      `Spec: ${r.spec.name} · Log: ${r.log_name}`,
      `${plural(s.total, "validação", "validações")} · ${numero(s.ok)} OK · ${plural(s.divergent, "divergente", "divergentes")} · ${plural(s.missing, "não disparada", "não disparadas")}`,
      `Conformidade: ${porcentagem(s.compliance_rate)}`,
      `Fora da spec: ${numero(s.extras)} · Alertas: ${numero(s.alerts)}`,
    ];
    if (pendentes.length) {
      linhas.push("", "Pedem ação:");
      for (const p of pendentes.slice(0, 30)) {
        const motivo = p.divergences ? `: ${p.divergences}` : "";
        linhas.push(`- [${rotuloStatus(p.status)}] ${p.event} · ${p.variation}${motivo}`);
      }
      if (pendentes.length > 30) linhas.push(`- e mais ${numero(pendentes.length - 30)}`);
    }
    await copiarComAviso(linhas.join("\n"), "Resumo");
  }

  desenharDetalhe(null);
  return { el };
}

/* -------------------------------------------------- pré-visualização */

// O HTML exportado roda num iframe isolado (sandbox sem allow-same-origin),
// carregado de uma URL blob:. Ele não enxerga o site nem os arquivos escolhidos.
function criarDialogoHtml(): { el: HTMLDialogElement; abrir(html: string, aoBaixar: () => void): void } {
  const idTitulo = novoId("dlg");
  const area = h("div", { class: "mw-dialogo__area" });
  let url: string | null = null;
  let aoBaixar: (() => void) | null = null;
  let origem: HTMLElement | null = null;

  const fechar = () => el.close();
  const el = h(
    "dialog",
    { class: "mw-dialogo", "aria-labelledby": idTitulo },
    h(
      "div",
      { class: "mw-dialogo__barra" },
      h(
        "div",
        { class: "mw-dialogo__titulos" },
        h("h2", { id: idTitulo, class: "mw-dialogo__titulo" }, "Relatório HTML"),
        h("p", { class: "mw-dialogo__sub" }, "Pré-visualização isolada do arquivo que você vai baixar."),
      ),
      botao("Baixar HTML", "download", () => aoBaixar?.(), "mb-btn--default"),
      h(
        "button",
        { type: "button", class: "mb-btn mw-icone-btn", "aria-label": "Fechar", title: "Fechar", onclick: fechar },
        icone("x", 16),
      ),
    ),
    area,
  );
  el.addEventListener("close", () => {
    area.replaceChildren();
    if (url) URL.revokeObjectURL(url);
    url = null;
    origem?.focus();
  });
  // Clique fora do quadro (no fundo escurecido) fecha.
  el.addEventListener("click", (ev) => {
    if (ev.target === el) fechar();
  });

  return {
    el,
    abrir(html, baixarHtml) {
      origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      aoBaixar = baixarHtml;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const quadro = h("iframe", {
        class: "mw-dialogo__quadro",
        title: "Relatório HTML exportado",
        sandbox: "allow-scripts",
        referrerpolicy: "no-referrer",
        src: url,
      });
      area.replaceChildren(quadro);
      el.showModal();
    },
  };
}
