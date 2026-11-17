// Leitor do subconjunto de Markdown dos guias da Ajuda, o mesmo do Mo baile
// (Views/Help/HelpDocument.swift): front matter, `##`, parágrafo, lista com
// `-`, passos numerados, bloco de código, nota com `>` ("Dica:", "Atenção:").
// No texto corrido: **negrito**, `código` e [link](destino).
// Tudo vira nó de DOM com textContent: nada do arquivo é interpretado como HTML.
import { h } from "./dom";
import { icone } from "./icons";

export type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "passos"; itens: string[] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "nota"; estilo: "dica" | "atencao" | "simples"; texto: string };

export interface Guia {
  meta: Record<string, string>;
  blocos: Bloco[];
  /** Linhas fora do subconjunto (tabela, imagem, HTML, `#`, `###`). */
  naoSuportadas: string[];
}

export const SECOES = ["O que é", "Quando usar", "Passo a passo", "Exemplo prático", "Recursos", "Problemas comuns"];

export function lerGuia(texto: string): Guia {
  let linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const meta: Record<string, string> = {};
  if (linhas[0] === "---") {
    const fim = linhas.indexOf("---", 1);
    if (fim > 0) {
      for (const linha of linhas.slice(1, fim)) {
        const sep = linha.indexOf(": ");
        if (sep > 0) meta[linha.slice(0, sep)] = linha.slice(sep + 2).trim();
      }
      linhas = linhas.slice(fim + 1);
    }
  }
  const blocos: Bloco[] = [];
  const naoSuportadas: string[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];
  let numerada = false;
  let codigo: string[] | null = null;

  const fechar = () => {
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", texto: paragrafo.join(" ") });
    if (lista.length) blocos.push(numerada ? { tipo: "passos", itens: lista } : { tipo: "lista", itens: lista });
    paragrafo = [];
    lista = [];
  };

  for (const linha of linhas) {
    if (codigo) {
      if (linha.startsWith("```")) {
        blocos.push({ tipo: "codigo", texto: codigo.join("\n") });
        codigo = null;
      } else codigo.push(linha);
      continue;
    }
    const t = linha.trim();
    if (!t) {
      fechar();
      continue;
    }
    if (t.startsWith("```")) {
      fechar();
      codigo = [];
      continue;
    }
    if (t.startsWith("## ")) {
      fechar();
      blocos.push({ tipo: "titulo", texto: t.slice(3) });
      continue;
    }
    if (t.startsWith("#") || t.startsWith("|") || t.startsWith("![") || t.startsWith("<")) {
      naoSuportadas.push(t);
      continue;
    }
    if (t.startsWith("> ")) {
      fechar();
      const corpo = t.slice(2);
      const estilo = corpo.startsWith("Dica:") ? "dica" : corpo.startsWith("Atenção:") ? "atencao" : "simples";
      blocos.push({ tipo: "nota", estilo, texto: corpo });
      continue;
    }
    if (t.startsWith("- ")) {
      if (paragrafo.length || (numerada && lista.length)) fechar();
      numerada = false;
      lista.push(t.slice(2));
      continue;
    }
    const passo = /^(\d+)\. (.*)$/.exec(t);
    if (passo) {
      if (paragrafo.length || (!numerada && lista.length)) fechar();
      numerada = true;
      lista.push(passo[2] ?? "");
      continue;
    }
    if (lista.length) fechar();
    paragrafo.push(t);
  }
  if (codigo) blocos.push({ tipo: "codigo", texto: codigo.join("\n") });
  fechar();
  return { meta, blocos, naoSuportadas };
}

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Destino de link: outro guia (`report.md`) vira rota interna; só https sai do site. */
export function destinoLink(alvo: string): { tipo: "guia"; topico: string } | { tipo: "externo"; url: string } | null {
  const guia = /^(?:\.\/)?([a-z0-9-]+)\.md(?:#.*)?$/i.exec(alvo);
  if (guia) return { tipo: "guia", topico: (guia[1] ?? "").toLowerCase() };
  const app = /^mobaile:\/\/ajuda\/([a-z0-9-]+)$/i.exec(alvo);
  if (app) return { tipo: "guia", topico: (app[1] ?? "").toLowerCase() };
  try {
    const url = new URL(alvo);
    if (url.protocol === "https:") return { tipo: "externo", url: url.href };
  } catch {
    /* destino inválido: vira texto */
  }
  return null;
}

export function textoRico(texto: string, temGuia: (topico: string) => boolean): Node[] {
  const nos: Node[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(INLINE)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) nos.push(document.createTextNode(texto.slice(ultimo, inicio)));
    if (m[1] !== undefined) nos.push(h("strong", null, m[1]));
    else if (m[2] !== undefined) nos.push(h("code", null, m[2]));
    else {
      const rotulo = m[3] ?? "";
      const destino = destinoLink(m[4] ?? "");
      if (destino?.tipo === "guia" && temGuia(destino.topico)) {
        nos.push(h("a", { href: `#ajuda/${destino.topico}` }, rotulo));
      } else if (destino?.tipo === "externo") {
        nos.push(
          h(
            "a",
            { href: destino.url, target: "_blank", rel: "noopener noreferrer" },
            rotulo,
            h("span", { class: "mw-sr" }, " (abre em nova aba)"),
          ),
        );
      } else {
        nos.push(document.createTextNode(rotulo));
      }
    }
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) nos.push(document.createTextNode(texto.slice(ultimo)));
  return nos;
}

export function desenharGuia(guia: Guia, temGuia: (topico: string) => boolean): HTMLElement[] {
  const rico = (t: string) => textoRico(t, temGuia);
  return guia.blocos.map((b) => {
    switch (b.tipo) {
      case "titulo":
        return h("h3", { class: "mw-guia__secao" }, b.texto);
      case "paragrafo":
        return h("p", null, ...rico(b.texto));
      case "lista":
        return h("ul", null, ...b.itens.map((i) => h("li", null, ...rico(i))));
      case "passos":
        return h("ol", null, ...b.itens.map((i) => h("li", null, ...rico(i))));
      case "codigo":
        return h("pre", { class: "mw-bloco", tabindex: "0" }, b.texto);
      case "nota":
        return h(
          "p",
          { class: `mw-aviso mw-aviso--${b.estilo === "atencao" ? "warn" : "info"}` },
          icone(b.estilo === "atencao" ? "triangle-alert" : "info", 15),
          h("span", null, ...rico(b.texto)),
        );
    }
  });
}
