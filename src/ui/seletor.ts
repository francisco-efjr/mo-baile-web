// Quadro para escolher um arquivo, por botão ou arrastando e soltando. O
// arquivo é lido em memória (File.arrayBuffer) e nunca sai do navegador.
import { h, novoId, trocar } from "./dom";
import { icone, type NomeIcone } from "./icons";

export interface OpcoesSeletor {
  titulo: string;
  dica: (string | Node)[];
  aceitar: string;
  rotuloBotao: string;
  icone: NomeIcone;
  aoEscolher: (arquivo: File) => void;
  /** Ação a mais ao lado do botão (por exemplo, Importar Prints do Figma…). */
  extra?: HTMLElement;
}

export interface Seletor {
  el: HTMLElement;
  botao: HTMLButtonElement;
  mostrarArquivo(nome: string, detalhe: string): void;
  limpar(): void;
  erro(mensagem: string | null): void;
  ocupado(ligado: boolean, texto?: string): void;
}

export function criarSeletor(op: OpcoesSeletor): Seletor {
  const id = novoId("arq");
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  const idArquivo = `${id}-escolhido`;

  const entrada = h("input", { type: "file", accept: op.aceitar, hidden: true, tabindex: "-1" });
  const botao = h(
    "button",
    {
      type: "button",
      class: "mb-btn mw-btn",
      "aria-describedby": `${idArquivo} ${idDica} ${idErro}`,
    },
    icone("upload", 15),
    h("span", null, op.rotuloBotao),
  );
  const escolhido = h("p", { class: "mw-dz__arquivo", id: idArquivo });
  const estado = h("p", { class: "mw-dz__estado", "aria-live": "polite" });
  // A região de erro existe vazia desde o início: assim o leitor de tela anuncia.
  const erro = h("div", { class: "mw-dz__erro", id: idErro, role: "alert" });
  const titulo = h("h2", { class: "mw-dz__titulo" }, op.titulo);

  const zona = h(
    "div",
    { class: "mw-dz" },
    h("div", { class: "mw-dz__icone" }, icone(op.icone, 22)),
    h(
      "div",
      { class: "mw-dz__corpo" },
      titulo,
      h("p", { class: "mw-dz__dica", id: idDica }, ...op.dica),
      escolhido,
      estado,
    ),
    h(
      "div",
      { class: "mw-dz__acao" },
      botao,
      h("span", { class: "mw-dz__ou", "aria-hidden": "true" }, "ou arraste aqui"),
      op.extra ?? null,
    ),
    entrada,
  );

  const el = h("div", { class: "mw-campo" }, zona, erro);

  botao.addEventListener("click", () => entrada.click());
  entrada.addEventListener("change", () => {
    const arquivo = entrada.files?.[0];
    entrada.value = "";
    if (arquivo) op.aoEscolher(arquivo);
  });

  // Arrastar e soltar: só realça quando o que vem é arquivo.
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
    const arquivo = ev.dataTransfer?.files?.[0];
    if (arquivo) op.aoEscolher(arquivo);
  });

  return {
    el,
    botao,
    mostrarArquivo(nome, detalhe) {
      zona.classList.add("is-cheio");
      trocar(
        escolhido,
        icone("circle-check", 14, "mw-ok"),
        h("span", { class: "mw-dz__nome" }, nome),
        detalhe ? h("span", { class: "mw-dz__detalhe" }, detalhe) : null,
      );
      trocar(botao.querySelector("span") as HTMLSpanElement, "Trocar Arquivo…");
    },
    limpar() {
      zona.classList.remove("is-cheio");
      escolhido.replaceChildren();
      trocar(botao.querySelector("span") as HTMLSpanElement, op.rotuloBotao);
    },
    erro(mensagem) {
      zona.classList.toggle("is-invalido", !!mensagem);
      if (!mensagem) {
        erro.replaceChildren();
        return;
      }
      trocar(erro, h("p", { class: "mb-inline-error" }, icone("circle-alert", 14), h("span", null, mensagem)));
    },
    ocupado(ligado, texto = "Lendo…") {
      zona.setAttribute("aria-busy", ligado ? "true" : "false");
      botao.disabled = ligado;
      if (ligado) trocar(estado, h("span", { class: "mb-spinner mw-spin", "aria-hidden": "true" }), texto);
      else estado.replaceChildren();
    },
  };
}
