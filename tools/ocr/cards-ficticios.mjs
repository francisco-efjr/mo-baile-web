#!/usr/bin/env node
// Prints fictícios para o teste de ponta a ponta do OCR (e2e/F-10).
//
//   node tools/ocr/cards-ficticios.mjs
//
// Desenha cards no padrão "Anotações" do Figma (cabeçalho com o evento,
// tabela parâmetro x valor, quadro de Observação) em HTML e grava cada um como
// PNG em e2e/fixtures/prints/. Grava também linhas-ideais.json: o texto e a
// caixa de cada linha, tirados do próprio desenho, que valem como uma leitura
// perfeita. O teste exige que a spec montada a partir do OCR no navegador seja
// a mesma da leitura perfeita. Tudo é fictício (app DemoApp).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = join(raiz, "e2e/fixtures/prints");

const ICONE_TELA = '<svg width="18" height="22" viewBox="0 0 18 22"><rect x="2" y="1" width="14" height="20" rx="3" fill="none" stroke="#7a6a2a" stroke-width="1.6"/><line x1="7" y1="18" x2="11" y2="18" stroke="#7a6a2a" stroke-width="1.6"/></svg>';
const ICONE_TOQUE = '<svg width="20" height="22" viewBox="0 0 20 22"><path d="M8 9V3.5a1.5 1.5 0 0 1 3 0V11l3 .5a2 2 0 0 1 1.7 2.3L15 19H8l-4-5 1.2-1 2.8 2" fill="none" stroke="#2a6a8a" stroke-width="1.6"/></svg>';
const ICONE_CARRINHO = '<svg width="22" height="20" viewBox="0 0 22 20"><path d="M1 2h3l2.5 11h11l2-8H6" fill="none" stroke="#2a6a4a" stroke-width="1.6"/><circle cx="8" cy="17" r="1.5" fill="#2a6a4a"/><circle cx="16" cy="17" r="1.5" fill="#2a6a4a"/></svg>';

// Cada valor é uma lista de linhas (a célula quebra onde a lista quebra).
const CARDS = [
  {
    arquivo: "01-tela-inicial.png", icone: ICONE_TELA, cor: "#fdf6dc", evento: "screen_view",
    tabela: [["screen_name", ["app:demo:home"]], ["flow_name", ["demo"]]],
  },
  {
    arquivo: "02-simulacao.png", icone: ICONE_TELA, cor: "#fdf6dc", evento: "screen_view",
    tabela: [["screen_name", ["app:demo:[pf|pj]:simulacao"]], ["flow_name", ["demo-[pf|pj]"]],
      ["installments", ["[número de parcelas]"]]],
  },
  {
    arquivo: "03-botao-continuar.png", icone: ICONE_TOQUE, cor: "#e3f1fa", evento: "interaction_demo_simulacao",
    tabela: [["screen_name", ["app:demo:simulacao"]], ["flow_name", ["demo"]], ["component", ["[elemento]"]],
      ["detail", ["click:[label do botao]"]]],
    observacao: {
      titulo: "interaction_demo_simulacao",
      texto: ["O evento interaction_demo_simulacao deve disparar no", "momento da interação com elementos da tela."],
      blocos: [
        ["Preenchimento de [elemento] no parâmetro component:", ["button"]],
        ["Preenchimento de [label do botao] no parâmetro detail:", ["click:continuar", "click:voltar"]],
      ],
    },
  },
  {
    arquivo: "04-compra.png", icone: ICONE_CARRINHO, cor: "#e6f3ea", evento: "purchase",
    tabela: [
      ["screen_name", ["app:demo:sucesso"]],
      ["flow_name", ["demo"]],
      ["currency", ["BRL"]],
      ["items", ["[", "  {", '    "item_id": "5501",', '    "item_name": "plano-demo",', '    "item_category": "assinatura"', "  }", "]"]],
      ["value", ["[valor total]"]],
      ["loan_insurance_value", ["[valor do seguro]"]],
      ["transaction_id", ["[id da transacao]"]],
    ],
  },
  {
    arquivo: "05-erro.png", icone: ICONE_TELA, cor: "#fdf6dc", evento: "error_view",
    tabela: [["screen_name", ["app:demo:pagamento:erro"]], ["flow_name", ["demo"]], ["description", ["[mensagem de erro]"]]],
  },
  {
    arquivo: "06-formulario.png", icone: ICONE_TOQUE, cor: "#e3f1fa", evento: "form_input",
    tabela: [["screen_name", ["app:demo:cadastro:dados-pessoais"]], ["flow_name", ["demo-cadastro"]], ["text", ["[nome do campo]"]]],
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(card) {
  const linhas = card.tabela.map(([k, v]) =>
    `<tr><th><span class="t">${esc(k)}</span></th><td>${v.map((l) => `<span class="t">${esc(l).replace(/^ +/, (m) => "&nbsp;".repeat(m.length))}</span>`).join("<br>")}</td></tr>`).join("");
  const obs = card.observacao
    ? `<div class="obs"><div class="obs-cab"><span class="t"><b>Observação</b> <i>"${esc(card.observacao.titulo)}"</i></span></div><div class="obs-corpo">` +
      card.observacao.texto.map((l) => `<div><span class="t">${esc(l)}</span></div>`).join("") +
      card.observacao.blocos.map(([frase, itens]) =>
        `<div class="bloco"><span class="t">${esc(frase)}</span></div>` + itens.map((i) => `<div class="item"><span class="t">• ${esc(i)}</span></div>`).join("")).join("") +
      "</div></div>"
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 8px; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #1c1c1c; }
    #card { width: 520px; }
    .caixa { border: 1.5px solid #cfc8a8; border-radius: 8px; overflow: hidden; }
    .cab { background: ${card.cor}; padding: 12px 16px; font-size: 19px; font-weight: bold; display: flex; gap: 10px; align-items: center; }
    table { width: 100%; border-collapse: collapse; font-size: 15px; }
    th, td { border-top: 1px solid #ddd; padding: 12px 16px; text-align: left; vertical-align: top; line-height: 22px; }
    th { width: 34%; font-weight: bold; border-right: 1px solid #ddd; }
    .obs { margin-top: 18px; border: 1.5px solid #9cc6dc; border-radius: 8px; overflow: hidden; font-size: 15px; }
    .obs-cab { background: #e3f1fa; padding: 10px 16px; font-size: 17px; }
    .obs-corpo { padding: 12px 16px; line-height: 24px; }
    .bloco { margin-top: 14px; }
    .item { padding-left: 14px; }
  </style></head><body><div id="card"><div class="caixa"><div class="cab">${card.icone}<span class="t">${esc(card.evento)}</span></div><table>${linhas}</table></div>${obs}</div></body></html>`;
}

mkdirSync(saida, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2 });
const ideais = [];
for (const card of CARDS) {
  await page.setContent(html(card));
  const el = page.locator("#card");
  await el.screenshot({ path: join(saida, card.arquivo) });
  const linhas = await page.evaluate(() => {
    const base = document.querySelector("#card").getBoundingClientRect();
    return [...document.querySelectorAll(".t")].map((s) => {
      const r = s.getBoundingClientRect();
      return { t: s.textContent.replace(/ /g, " "), x: (r.left - base.left) / base.width, y: (r.top - base.top) / base.height,
        w: r.width / base.width, h: r.height / base.height, c: 1 };
    });
  });
  ideais.push({ nome: card.arquivo, linhas });
}
await browser.close();
writeFileSync(join(saida, "linhas-ideais.json"), JSON.stringify(ideais, null, 1) + "\n");
console.log(`${CARDS.length} cards em ${saida}`);
