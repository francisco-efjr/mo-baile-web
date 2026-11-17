# Revisão de segurança: OCR no navegador (fase 2 do ADR 0002)

Esta revisão foi feita durante o desenvolvimento, sobre a branch da fase 2, e
não é uma revisão independente. Antes de publicar a tela de importação (fase
3), vale uma revisão independente, como a da 0.1.0.

## O que mudou

| O quê | Como |
| --- | --- |
| Código de terceiros no site | `ppu-paddle-ocr` 6.6.1, `ppu-ocv` 4.0.0 (`overrides`) e `onnxruntime-web` 1.31.1, com versão exata. Os três têm licença MIT e foram publicados há mais de duas semanas |
| Arquivos baixados pelo navegador | 3 arquivos de modelo (`dist/ocr/`) e o WebAssembly do runtime (`dist/assets/`), 46 MB ao todo, só quando a pessoa abre a importação |
| Onde roda | Num worker (`src/ocr/worker.ts`), carregado de um arquivo do próprio site |
| O que entra | Os prints que a pessoa escolhe (PNG ou JPG), lidos em memória e passados ao worker por transferência |
| O que fica guardado | Só os modelos, que são públicos, no Cache Storage do navegador (`mobaile-web-ocr-1`). Nenhum print fica guardado |

## Verificações

- **CSP da página sem mudança.** Continua com `connect-src 'none'` e sem
  `'wasm-unsafe-eval'` (`test/csp-site.test.ts`). Um worker carregado de URL
  do próprio site segue a política que chega com o arquivo dele, não a da
  página. O teste F-10 conferiu isso no Chrome, no Firefox e no WebKit.
- **Nenhuma requisição para fora.** No F-10, o contexto inteiro (página e
  worker) só pede ao próprio servidor. A mesma conta, com os 129 prints reais
  no Chrome, deu zero requisições externas.
- **CDN neutralizada.** Ao carregar, a `ppu-paddle-ocr` aponta o runtime para
  `cdn.jsdelivr.net` quando ninguém escolheu um caminho (`platform.web.js`,
  `applyDefaultWasmPaths`). Por isso:
  - `src/ocr/ambienteOrt.ts` é o primeiro import do worker e fixa o caminho
    no próprio site, na forma de objeto, só com o `.wasm`;
  - o binário vai pronto em `wasmBinary`, e o runtime não busca nada;
  - `test/ocr.test.ts` confere essa ordem e que não há URL nesse módulo.
- **Integridade.** `src/ocr/manifesto.json` fixa a fonte dos modelos num
  commit e cada arquivo pelo tamanho e pelo sha256:
  - no build, `tools/ocr/ativos.mjs` confere tudo e falha se algo diferir;
  - no navegador, o worker confere de novo antes de usar, inclusive o que
    veio do cache;
  - o worker recusa endereço de outra origem.

  Na fase 2, a conferência pegou um caso real: um caminho errado devolvia o
  `index.html` no lugar do modelo.
- **Imagens.** Quem decodifica é o navegador (`createImageBitmap`), dentro do
  worker. O site confere:
  - a assinatura PNG ou JPG antes de mandar o arquivo;
  - o limite de 20 MB por arquivo e de 300 prints por pasta;
  - HEIC e TIFF são recusados com o motivo.
- **Texto lido.** O texto do OCR só vai para o motor: o leitor de cards, a
  spec em JSON e o Markdown. A tela da fase 3 precisa mostrar esse texto como
  texto (`textContent`), nunca como HTML, como já faz com o log (F-09).
- **Cancelar.** O `AbortSignal` encerra o worker, inclusive entre um print e
  outro (F-10).

## Achados

| # | Sev. | Onde | Achado | O que foi feito |
| --- | --- | --- | --- | --- |
| O1 | Média | worker | O GitHub Pages não manda cabeçalho, então o worker roda sem CSP. Se uma dependência do worker fosse comprometida, ela poderia fazer requisição para fora | Versões exatas e lockfile; a CDN foi neutralizada e testada; o F-10 roda no CI e falha com qualquer requisição externa. Ao revisar uma atualização de `ppu-paddle-ocr` ou `onnxruntime-web`, procure URLs no código (como foi feito nesta revisão). Se a hospedagem mudar para um servidor com cabeçalhos, mande uma CSP própria para `assets/worker-*.js`: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'` |
| O2 | Baixa | modelos | Os modelos vêm da conversão para ONNX Runtime publicada pelo autor da `ppu-paddle-ocr` no Hugging Face, e não direto do PaddleOCR | Fonte fixada por commit e conteúdo por sha256. Um modelo alterado de propósito só mudaria o texto lido, que segue como dado e sempre passa pela revisão das dúvidas |
| O3 | Baixa | cache | Em janela privada, ou com o armazenamento bloqueado, os 46 MB são baixados de novo a cada sessão. No WebKit do Playwright foi assim | Sem impacto de segurança. A tela da fase 3 deve avisar o tamanho antes do primeiro download |
| O4 | Baixa | imagens | Uma imagem muito grande, mesmo abaixo de 20 MB, pode ocupar muita memória na decodificação | Limite de 20 MB por arquivo, e só um print por vez no worker; cancelar encerra o worker. Um limite em pixels pode entrar na fase 3 |

Na fase 3 (a tela), o texto lido e os nomes de arquivo entram na página só
como texto (`h()`/`textContent`, sem `innerHTML`). As miniaturas são
endereços `blob:` dos próprios arquivos, liberados quando a revisão recomeça.
A CSP já permitia `img-src blob:`.

Conferido e sem achado:
- nenhuma regra de auditoria mudou;
- não há caminho de disco;
- a página de teste (`e2e/paginas/ocr.html`) só existe no build com
  `MOBAILE_E2E=1` e recebe a mesma CSP do site;
- a ação nova do CI (`actions/cache` v6.1.0) está fixada por SHA;
- os prints reais da fase 0 nunca entram no repositório.
