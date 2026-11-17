# Gabarito de paridade

`gerar.py` roda o motor Python do Mo baile sobre o corpus sintético
(`test/corpus/`) e grava o gabarito (`test/golden/`) que `test/parity.test.ts`
e `test/unidades.test.ts` exigem do motor TypeScript. O que é comparado e as
diferenças deliberadas estão em [docs/PARIDADE.md](../../docs/PARIDADE.md).

## Quando regenerar

- A regra mudou no Mo baile: regenere, veja o `git diff` de `test/golden/`,
  porte a mudança para `src/engine/` até os testes passarem.
- Caso novo no corpus, ou entrada nova em `unidades.json`.
- Ativo do relatório atualizado no Mo baile (`services/report/html/`): copie o
  arquivo para `src/engine/assets/` e regenere (`_ativos.json` guarda o sha256).

Nunca edite `test/golden/` à mão: ele é a resposta do Python, não a nossa.

## Como regenerar

Precisa de um clone do Mo baile e do Python que ele usa (3.14, com Pillow, que
o módulo do board importa). A posição de erro do JSON e as mensagens do `re`
mudam entre versões do Python: gere sempre com a mesma versão do Mo baile.

```bash
PYTHONPATH=<clone do Mo baile>/engine/src python3 tools/golden/gerar.py
node_modules/.bin/vitest run
```

O gerador apaga `test/golden/` e grava tudo de novo:

| Arquivo | Conteúdo |
| --- | --- |
| `<caso>.json` | o `report.audit` no formato web (sem caminhos), ou `{"error": {"stage", "code", "message"}}` |
| `<caso>.html` | o relatório HTML com instante (16/11/2026 09:30) e versão (`0.0.0-paridade`) fixos, ativos trocados por marcadores `@@ATIVO:<arquivo>@@` |
| `<caso>.meta.json` | o nome que o Mo baile dá ao HTML exportado |
| `<caso>.analytics.json` | a leitura da aba Analytics (`platform`, `stats`, `events`, `tsv`, `json`) |
| `_unidades.json` | respostas do Python para `tools/golden/unidades.json` |
| `_ativos.json` | sha256 dos ativos do relatório do Mo baile |

O caminho é o da versão web do Mo baile: `decode_text` (o BOM manda; spec
estrita, log tolerante), `WebReportService` (spec sem prints), log sem eventos
recusado antes da auditoria e exceção não prevista como "Erro interno no
motor.". O gabarito não leva caminho de disco nem dado pessoal.

## Formato de um caso

`test/corpus/<caso>/` tem:

- `spec.json`: a spec da demanda (pode ter BOM ou estar quebrada de propósito);
- `log.txt` (logcat, qualquer codificação com BOM) ou `log.json` (export do Mo
  baile, `{"eventos": [...]}` ou `{"jornadas": {...}}`);
- `meta.json`: `{"platform": "android" | "ios" | null, "descricao": "...", "info": {...}}`.
  `platform` é a plataforma escolhida na tela (`null`: a da spec); `info`,
  opcional, são os campos da folha de exportação do HTML.

Dados sempre sintéticos e neutros: app `DemoApp`, hosts `*.demoapp.test`,
nenhum nome real de pessoa, empresa, banco ou produto. O caso
`01-exemplo-loja` é também o exemplo do site (`src/exemplos/index.ts`).

## Importação de prints

`test/corpus-prints/<caso>.json` é uma pasta de prints já lida pelo OCR:
`{"projeto", "pasta", "plataforma", "prints": [{"file", "lines": [{"t", "x", "y", "w", "h", "c"}]}]}`.
Quem grava o corpus é `corpus_prints.py`, com semente fixa:

- casos escritos à mão (`manual-*`), com os ruídos que o OCR comete nos cards
  "Anotações" do Figma;
- casos sorteados (`sorteio-*`), que misturam cabeçalho, tabela, `items` e
  Observação com erros de leitura.

```bash
PYTHONPATH=<clone do Mo baile>/engine/src python3 tools/golden/corpus_prints.py
PYTHONPATH=<clone do Mo baile>/engine/src python3 tools/golden/gerar.py
```

Para cada caso, `gerar.py` grava `test/golden/prints-<caso>.json`. A pasta
passa pelo mesmo caminho do `report.import` depois do OCR: prints em ordem de
nome, `read_card` em cada um, `build_spec`, `review_markdown` e
`checklist_markdown` com o instante fixo. O arquivo guarda:

- os cards lidos (`cards`);
- a revisão (`review`);
- o JSON da spec como o Mo baile grava (`spec_json`);
- os dois Markdown (`review_md` e `checklist_md`).

Os casos são fictícios. O corpus cobre quase todas as linhas de
`card_reader.py`; só fica de fora um ramo que o OCR não alcança. Ao mudar o
corpus, confira com um teste de mutação: trocar uma regra no port precisa
quebrar `test/prints.test.ts`.
