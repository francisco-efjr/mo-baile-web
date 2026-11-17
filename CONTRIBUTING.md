# Como contribuir

Obrigado pelo interesse. O projeto é um beta em desenvolvimento.

## Ambiente

Node 20 ou mais novo.

```bash
npm install        # respeita o package-lock.json (versões exatas)
npm run dev        # http://127.0.0.1:5173
```

Use `npm install`, e não `npm ci`: o npm 11 grava o lockfile sem uma das
dependências opcionais de plataforma do Rollup, e o `npm ci` recusa. As
versões continuam as do lockfile.

### Modelos do OCR

A importação de prints usa o PaddleOCR v6 small. Os modelos (31 MB) não ficam
no git:

```bash
npm run ocr:ativos # baixa uma vez, confere o sha256 e copia para public/ocr/
```

O download fica em `.cache/ocr/`. O `npm run check` e o `npm run e2e` rodam
esse passo sozinhos. Para mudar de modelo, atualize `src/ocr/manifesto.json`
(fonte fixada num commit, tamanho e sha256) e registre o motivo no ADR 0002.
`npm run ocr:cards` redesenha os cards fictícios do teste F-10.

## Portão de qualidade

```bash
npm run check      # versão, tipos, testes (motor e paridade) e build
npm run e2e        # Playwright no Chrome instalado
```

## Regras

- Leia o [AGENTS.md](AGENTS.md): motor como fonte da verdade, paridade com o
  Mo baile, nada sai do navegador, identidade do Mo baile.
- Todo push sobe a versão: `node tools/version.mjs bump patch|minor|major` e
  descreva no `CHANGELOG.md`.
- Commits no formato Conventional Commits, em português
  (`feat(motor): ...`, `fix(site): ...`).
- Dados de teste sintéticos. Nada de dado real de pessoa, cliente ou empresa.

A participação segue o [Código de Conduta](CODE_OF_CONDUCT.md).
