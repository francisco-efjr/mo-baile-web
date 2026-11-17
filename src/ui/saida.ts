// Saída para fora da página, sem rede: baixar um Blob e copiar texto.
import { h } from "./dom";
import { icone } from "./icons";

export function baixar(conteudo: string, nome: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = h("a", { href: url, download: nome, class: "mw-sr" });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const TIPO = {
  html: "text/html;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
  json: "application/json;charset=utf-8",
} as const;

/** Copia para a área de transferência. Devolve false se o navegador recusar. */
export async function copiar(texto: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      /* cai para o caminho antigo */
    }
  }
  const area = h("textarea", { readonly: true, class: "mw-copia", "aria-hidden": "true", tabindex: "-1" });
  area.value = texto;
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

// Aviso flutuante ("Copiado"). A região existe vazia desde a carga para que o
// leitor de tela anuncie a mensagem.
let regiao: HTMLDivElement | null = null;
let timer = 0;

export function montarAviso(): HTMLDivElement {
  regiao = h("div", { class: "mw-toast", role: "status", "aria-live": "polite" });
  return regiao;
}

export function avisar(mensagem: string, tipo: "ok" | "erro" = "ok"): void {
  if (!regiao) return;
  regiao.replaceChildren(
    icone(tipo === "ok" ? "circle-check" : "circle-alert", 16),
    h("span", null, mensagem),
  );
  regiao.classList.toggle("is-erro", tipo === "erro");
  regiao.classList.add("is-on");
  window.clearTimeout(timer);
  timer = window.setTimeout(() => regiao?.classList.remove("is-on"), 2600);
}

export async function copiarComAviso(texto: string, oQue: string): Promise<void> {
  if (await copiar(texto)) avisar(`${oQue} copiado.`);
  else avisar("O navegador não deixou copiar. Selecione o texto e copie com o teclado.", "erro");
}

/** Nome de arquivo seguro: minúsculas, sem acento nem espaço. */
export function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "relatorio"
  );
}

export function dataArquivo(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
