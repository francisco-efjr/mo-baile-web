# Paridade com o Mo baile

O motor do site (`src/engine/`) é um port, em TypeScript, das regras do motor
Python do Mo baile (`engine/src/mobaile/domain/report.py` e
`services/report/`). "Paridade" aqui quer dizer: **para a mesma spec, o mesmo
log, o mesmo instante e a mesma versão, o site devolve o mesmo resultado que o
Mo baile, byte a byte**, no formato da versão web do Mo baile
(`python -m mobaile.web`, ADR 0007 de lá).

## O que é comparado

`tools/golden/gerar.py` roda o motor Python sobre cada caso de `test/corpus/` e
grava o gabarito em `test/golden/`. `test/parity.test.ts` exige, para cada caso:

| O quê | Como |
| --- | --- |
| `report.audit` (resumo, linhas, blocos, divergências, fora da spec, alertas, Markdown, TSV) | `reportJson(audit(...))` igual ao JSON do Python, byte a byte (ordem das chaves, `42.9`, `0.0`, `1e-05`, acentos) |
| Objeto que a interface recebe | `audit(...)` igual ao `JSON.parse` do gabarito |
| `report.spec` | `specSummary(spec)` igual ao resumo do gabarito |
| Relatório HTML | `exportHtml` igual ao `generate_interactive_html` do Python, byte a byte, com instante e versão fixos |
| Nome do HTML | `htmlFileName` igual ao `html_file_name` do Python |
| Aba Analytics | leitura do logcat (eventos, `stats`, TSV, JSON) igual, byte a byte |
| Recusas | mesma etapa (spec, log, auditoria), mesma mensagem em pt-BR, mesmo código (`invalid_input` ou `internal_error`) |
| Importação de prints (`report.import` depois do OCR) | leitor de cards (`read_card`), rascunho da spec (`build_spec`, gravado com `json.dumps(indent=2)`), revisão (`review_markdown`) e checklist (`checklist_markdown`) iguais caractere por caractere, sobre `test/corpus-prints/` (prints fictícios escritos à mão e sorteados com ruído de OCR) |

Não há tolerância numérica: os números saem formatados como o Python os
escreve (`round`, `repr` de float, `:.1f`, `:.2f` do anel do HTML).

No gabarito, o HTML guarda marcadores (`@@ATIVO:report.css@@`) no lugar dos
ativos fixos (CSS, JS do Motion e do relatório, ícone), para não repetir 300 KB
por caso. O teste troca os mesmos ativos pelos mesmos marcadores e confere,
pelo sha256, que `src/engine/assets/` tem os mesmos arquivos do Mo baile
(`test/golden/_ativos.json`). Num build de produção do motor, o HTML do caso
`01-exemplo-loja` sai idêntico ao do Python com os ativos por extenso
(356.486 caracteres), conferido em 16/11/2026.

Além dos casos, `test/golden/_unidades.json` guarda as respostas do Python
para as peças em que o JavaScript diverge do Python: `repr` de float,
arredondamento, `json.loads` (com a posição do erro), `str()` de valores,
expressões regulares do `re` (casamento e mensagem de erro), `difflib`
(`get_close_matches` e `SequenceMatcher.ratio`, usados pelo leitor de cards), `textwrap`,
`strip`, `splitlines` e o nome de arquivo. `test/unidades.test.ts` cobre essas
peças uma a uma.

## Por que há uma camada "Python" no motor

O resultado só sai igual se o motor guardar o que o Python guarda. Por isso
`src/engine/py.ts` e `src/engine/pyre.ts`:

- leem o JSON como o `json.loads` do Python 3.14: objeto vira `Map` (ordem
  real, inclusive com chave numérica), `1.0` continua float, inteiro grande
  vira `bigint`, e o erro aponta a mesma linha e coluna (em caracteres, não em
  unidades UTF-16);
- reproduzem `str()`/`repr()` (`None`, `True`, `['a', 1]`, `1e-05`), `strip()`
  e `splitlines()` com os espaços e quebras do Python, e a ordenação por ponto
  de código;
- leem a expressão regular com o analisador do `re` (mesmas mensagens e
  posições de erro) e a reescrevem em JavaScript com a flag `u`, com o sentido
  do Python para `\d`, `\w`, `\s` (Unicode), `.` (tudo menos `\n`), `$` (antes
  de um `\n` final) e `\b`;
- quebram o comentário longo do bloco com o algoritmo do `textwrap` do Python.

## Diferenças deliberadas

1. **Sem caminho de disco.** `spec.path` vira `spec.name` e `log_path` vira
   `log_name`, com o nome do arquivo que a pessoa escolheu. Saem
   `prints_dir`, `prints_dir_exists` e `print_path`. A versão web do Mo baile
   também tira os caminhos, mas usa o nome gerado no envio (`log-<hex>.log`);
   aqui vale o nome original, inclusive na mensagem "O log ... não tem eventos".
2. **OCR próprio, sem board.** Na auditoria, a spec perde `print` e
   `prints_dir` ao ser lida (como o `WebReportService`), e o HTML não tem coluna
   de print. Na importação de prints, o leitor de cards e o checklist em
   Markdown seguem o Mo baile (tabela acima). O OCR, porém, não é o Vision do
   macOS: é o PaddleOCR no navegador (ADR 0002), e a mesma pasta pode gerar
   linhas um pouco diferentes. A pasta não tem caminho de disco: `prints_dir`
   e as mensagens de recusa ("Nenhuma imagem em …") usam o nome da pasta.
   Entram só PNG e JPG, porque o navegador não abre HEIC nem TIFF; esses
   arquivos ficam de fora, e o motivo aparece na tela.

   Entre o OCR e o leitor de cards, o site tem uma camada que o Mo baile não
   tem, porque o Vision não precisa dela: os ajustes do PaddleOCR
   (`src/engine/prints/adaptador.ts`, ADR 0002). Essa camada não é coberta pela
   paridade com o Mo baile. Ela foi conferida contra o protótipo da fase 0, com
   linhas idênticas nos 129 prints reais, e `test/ocr.test.ts` cobre cada
   ajuste.
   Ficam fora o board Excalidraw (`board_auditoria.excalidraw`), o checklist
   em HTML e a edição de cards.
3. **`source` é sempre `file`.** Não há escuta de Analytics ao vivo nesta versão.
4. **Rodapé e instante do HTML.** O Python escreve "Gerado pelo Mo baile
   <versão do app>" e a hora atual. Aqui a versão é `Web <VERSION do site>` e o
   instante pode ser injetado (`exportHtml(report, info, { now, version })`); o
   gabarito usa os dois fixos.
5. **`analyticsFromLog().json`.** A rota de Analytics da versão web do Mo baile
   devolve `platform`, `stats`, `events` e `tsv`. O campo `json` é deste site:
   os eventos indentados (`json.dumps([asdict(evento)], indent=2)`), que a
   auditoria aceita de volta como log. O gabarito o grava do lado Python.
6. **Objeto público com números de JavaScript.** O objeto devolvido por
   `audit()` e `analyticsFromLog()` usa `number`: `1.0` aparece como `1` e
   inteiro além de 2^53 perde precisão, como em qualquer `JSON.parse`. O texto
   exato do Mo baile está em `reportJson(report)` e nos campos de texto
   (`block`, `markdown`, `tsv`, `checks[].obtained`).
7. **Relatório copiado.** `exportHtml` e `reportJson` usam a versão interna que
   `audit()` guarda num campo oculto. Uma cópia (`structuredClone`, JSON) perde
   esse campo e recebe "Nenhuma auditoria para exportar. Rode a auditoria
   primeiro.", a mesma mensagem do Mo baile. A spec copiada é validada de novo.
8. **Regex que o navegador não tem.** Grupo condicional `(?(1)a|b)` e
   `\N{nome}` são aceitos pelo Python e recusados aqui como regex inválida
   (com o motivo em português). Grupo atômico `(?>...)` e quantificador
   possessivo (`a++`) são emulados. `(?i:...)` só num trecho é emulado trocando
   cada letra pelas duas caixas; referência `\1` dentro dele continua sensível a
   maiúsculas.
9. **Tabelas Unicode.** `\d`, `\w`, `\s`, a caixa de letras, o `repr` de
   caractere não imprimível e a normalização NFKD do nome do arquivo usam as
   tabelas Unicode do navegador. Para caractere atribuído depois da versão
   Unicode de um dos lados, o resultado pode mudar.
10. **Limite de aninhamento do JSON.** JSON aninhado além da pilha de um dos
    lados vira "Erro interno no motor." nos dois, mas o limite não é o mesmo.

## Diferenças que restam

Nenhuma conhecida nos 23 casos do corpus e nas 200+ entradas de unidade: tudo
igual byte a byte, sem tolerância.

Um comportamento do Mo baile que o site reproduz de propósito, e que vale
conhecer: parâmetro em lista (`"screen_name": ["x"]`) num evento que vai para
"fora da spec" quebra o agrupamento no Python (`unhashable type: 'list'`), e a
versão web responde "Erro interno no motor.". O site responde igual (caso
`23-erro-interno`). Corrigir isso é mudança de regra: primeiro no Mo baile,
depois aqui, com o gabarito regenerado.

## CSP do relatório

Todo `<style>` e todo `<script>` executável do HTML exportado tem conteúdo
fixo (design system, CSS e JS do relatório, Motion e o script do tema), igual
em qualquer relatório; os dados entram no HTML já escapados, nunca dentro de um
bloco executável. É o mesmo desenho do Mo baile (`html_report.py`, CSP com
hash dos três scripts). `reportInlineHashes()` devolve os hashes no formato da
CSP (`'sha256-<base64>'`, com as aspas simples) para quem mostra o relatório:

- `styles`: os dois `<style>`;
- `scripts`: os três `<script>`;
- `styleAttributes`: o único `style=""` do relatório, a cor da coluna de cada
  fluxo (`--flow-color:var(--cat-3)` e mais três valores fixos). Atributo
  `style` só é liberado por hash com `'unsafe-hashes'` na CSP; sem isso, as
  colunas de fluxo perdem a cor de destaque e o resto funciona.

`test/csp.test.ts` gera o relatório de cada caso do corpus, extrai todos os
blocos e confere cada hash nessa lista.
