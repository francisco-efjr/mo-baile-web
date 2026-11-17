# ADR 0002 — Importação de prints no navegador

Data: 2026-11-17
Status: aceito (fase 1 entregue; fases 2 e 3 planejadas)

## Contexto

No Mo baile, a aba Relatório monta o rascunho da spec a partir de uma pasta de
prints dos cards "Anotações" do Figma (`report.import`). O texto dos prints é
lido pelo Vision, que só existe no macOS; o resto (o leitor de cards, o
rascunho, a revisão e o checklist) é regra fixa em Python. O ADR 0001 deixou a
importação fora da primeira versão do site por depender do macOS. O dono pediu
a importação em qualquer sistema, sem a ferramenta do Mac.

Na fase 0 (17/11/2026), os leitores open source foram comparados numa pasta
real de 129 prints, que fica fora do repositório. O Vision foi a referência, e
cada leitor passou pelo mesmo leitor de cards:

| Leitor | Campos iguais aos do Vision | Dúvidas |
| --- | --- | --- |
| Vision (macOS, referência) | — | 109 |
| PaddleOCR v6 small + ajustes do adaptador | 97,3% | 90 |
| PaddleOCR v6 small, sem ajustes | 93,8% | 93 |
| PaddleOCR v6 tiny + ajustes | 91,4% | 136 |
| Tesseract.js (melhor modo) | 68,6% | 360 |
| PaddleOCR v5 latino | 34% | — |

Nos 19 cards em que o PaddleOCR v6 small ajustado e o Vision discordaram, o
print foi conferido. O PaddleOCR acertou 13, o Vision acertou 5 e os dois
erraram 1. No Chrome, o PaddleOCR leu cada print em cerca de 1,1 s com um núcleo
e em 0,36 s com quatro, sem nenhuma requisição para fora.

## Decisão

1. **Fase 1 (este ADR):** o leitor de cards (`read_card`), o rascunho da spec
   (`build_spec`), a revisão (`review_markdown`) e o checklist em Markdown
   (`checklist_markdown`) foram portados para `src/engine/prints/`. A paridade
   é provada por gabarito (`test/prints.test.ts`), como a da auditoria. O
   contrato é `rascunhoDosPrints(prints, { pasta, projeto, plataforma })`, que
   recebe os prints já lidos pelo OCR.
2. **Fase 2:** OCR no navegador com o PaddleOCR v6 small (biblioteca
   `ppu-paddle-ocr`, MIT; modelos PaddleOCR, Apache-2.0; ONNX Runtime Web,
   MIT), num Worker. Modelos e runtime ficam servidos pelo próprio site, com
   sha256 conferido e versão fixa, e só são baixados quando a pessoa abre a
   importação. Os ajustes do adaptador ficam do lado do OCR e não mexem no
   leitor de cards:
   - tirar a margem que a detecção soma às caixas;
   - devolver o "•" lido como espaço;
   - juntar espaços que sobram perto de `_` e no meio de palavras do card;
   - repor o `|` perdido usando as alternâncias do mesmo print;
   - descartar caixas de ruído.

   As dependências novas entram com a aprovação do dono, como pede o AGENTS.md.
3. **CSP na fase 2:** o OCR precisa buscar os modelos e o runtime no próprio
   endereço e rodar WebAssembly. Por isso, `connect-src 'none'` passa a
   `connect-src 'self'`, e `script-src` ganha `'wasm-unsafe-eval'`. A página
   continua sem terceiros e sem mandar arquivo para lugar nenhum, e o teste da
   CSP passa a exigir isso.
4. **Fase 3:** tela "Importar prints" na aba Relatório. A pessoa escolhe ou
   arrasta a pasta, revisa as dúvidas com o print ao lado, baixa os três
   arquivos ou audita direto.

## Consequências

- O mesmo print pode gerar linhas um pouco diferentes no site e no Mo baile,
  porque o OCR é outro. A revisão das dúvidas continua obrigatória, como já é
  no Mo baile. A regra que monta a spec é a mesma, provada por gabarito.
- A primeira importação baixa cerca de 46 MB (31 MB de modelo e 15 MB de
  runtime), guardados pelo navegador para as próximas. Vale testar o modelo
  compactado (int8) na fase 2.
- O GitHub Pages não envia os cabeçalhos que liberam vários núcleos no
  WebAssembly. Sem eles, o OCR roda em um núcleo, a cerca de 1 s por print.
  Usar um service worker para isolar a página fica para decidir na fase 2.
- Uma regra nova no leitor de cards precisa ser medida nos dois OCRs antes de
  entrar. Na fase 0, uma regra testada (linha recuada vira item) piorou um card
  que o Vision acertava.
