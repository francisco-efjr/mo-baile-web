# ADR 0002 — Importação de prints no navegador

Data: 2026-11-17
Status: aceito (fases 1, 2 e 3 entregues na 0.2.0)

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
3. **CSP:** fica como está. O plano era abrir `connect-src 'self'` e
   `'wasm-unsafe-eval'` na página, mas a fase 2 mostrou que não é preciso. Um
   worker carregado de um arquivo do próprio site segue a política que chega
   com o arquivo dele, não a `<meta>` da página. Isso foi conferido no
   Chrome, no Firefox e no WebKit: o OCR roda com a página em
   `connect-src 'none'` e sem `'wasm-unsafe-eval'`.

   O GitHub Pages não manda cabeçalho, então o worker roda sem CSP. Para
   compensar:
   - o worker só aceita endereço da mesma origem;
   - confere o sha256 de cada arquivo antes de usar;
   - aponta o runtime para o próprio site antes de a biblioteca carregar (ela
     apontaria para o jsDelivr);
   - o teste F-10 exige zero requisições para fora.

   Detalhes em `docs/revisao/seguranca-ocr-fase2.md`.
4. **Fase 3:** tela "Importar prints" na aba Relatório. A pessoa escolhe ou
   arrasta a pasta, revisa as dúvidas com o print ao lado, baixa os três
   arquivos ou audita direto.

## Fase 2, como ficou (17/11/2026)

- **Dependências fixadas:** `ppu-paddle-ocr` 6.6.1, `ppu-ocv` 4.0.0 (por
  `overrides`) e `onnxruntime-web` 1.31.1, todas publicadas há mais de duas
  semanas. A 6.6.1 dá as mesmas caixas e o mesmo texto da 6.7.1 medida na
  fase 0, nos 129 prints.
- **Modelos:** `src/ocr/manifesto.json` fixa a fonte num commit e cada arquivo
  pelo sha256. `tools/ocr/ativos.mjs` baixa e confere no build, e o worker
  confere de novo antes de usar. Os modelos não entram no git.
- **Runtime:** o `onnxruntime-web` usa o build só de WebAssembly (14,8 MB, sem
  WebGPU). O binário passa pela mesma conferência.
- **No navegador (Chrome, um núcleo):**
  - os 129 prints reais deram 96,8% dos campos iguais aos do Vision, com 91
    dúvidas contra 109;
  - cada print levou 1,65 s na mediana e 2,1 s nos 10% mais pesados;
  - 126 dos 129 cards saíram iguais aos da leitura em Node.
- **Teste F-10:** nos cards fictícios, a spec do OCR é igual à da leitura
  perfeita. Passa no Chrome e no Firefox. No WebKit do Playwright, que roda
  como sessão temporária, a leitura passa, mas o cache não guarda os modelos:
  eles são baixados de novo a cada vez.

## Fase 3, como ficou (17/11/2026)

- **Onde fica:** no quadro **Spec da demanda**, o botão **Importar Prints do
  Figma…** abre um diálogo (`src/ui/importacao.ts`).
- **O que a pessoa faz:**
  - escolhe a pasta ou os prints, ou arrasta;
  - vê os arquivos que ficaram de fora e o motivo;
  - acompanha o download do leitor e cada print lido, e pode cancelar;
  - revisa as dúvidas com a miniatura do print;
  - usa o rascunho na auditoria ou baixa os três arquivos.
- **Ordem dos prints:** os prints são lidos em ordem de nome, como o Mo baile
  lê a pasta.
- **Teste F-11:** cobre o fluxo inteiro no desktop, o cancelamento, os erros
  e o layout no celular.
- **Pasta real (22 prints) no build de produção, no Chrome:**
  - a leitura levou 33,5 s;
  - nenhuma requisição saiu do site, fora as miniaturas (`blob:`);
  - "Usar na Auditoria" carregou a spec com 22 cards.

## Consequências

- O mesmo print pode gerar linhas um pouco diferentes no site e no Mo baile,
  porque o OCR é outro. A revisão das dúvidas continua obrigatória, como já é
  no Mo baile. A regra que monta a spec é a mesma, provada por gabarito.
- A primeira importação baixa cerca de 46 MB (31 MB de modelo e 15 MB de
  runtime), guardados pelo navegador para as próximas. Comprimido em gzip, o
  runtime cai para 3,8 MB, mas falta conferir se o GitHub Pages o envia assim.
  O modelo compactado (int8) fica como melhoria futura.
- O GitHub Pages não envia os cabeçalhos que liberam vários núcleos no
  WebAssembly, e por isso o OCR roda em um núcleo, a cerca de 1,65 s por
  print. Um service worker que isola a página poderia triplicar a velocidade,
  mas mexe na segurança da página. A decisão fica para depois da tela (fase
  3), com o tempo medido por quem usa.
- Uma regra nova no leitor de cards precisa ser medida nos dois OCRs antes de
  entrar. Na fase 0, uma regra testada (linha recuada vira item) piorou um card
  que o Vision acertava.
