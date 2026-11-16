# Arquitetura

```
index.html ─ src/main.ts ─ src/ui/        interface (abas Relatório e Analytics, ajuda)
                              │
                              ▼  só pelo contrato de src/engine/index.ts
                           src/engine/    motor: spec, log, auditoria, exportação
                              │
                              ▼  paridade provada por teste
            test/golden/ ◄── tools/golden/ ◄── motor Python do Mo baile
```

- **Motor (`src/engine/`):** funções puras. Entra texto (spec JSON, log), sai
  objeto com os mesmos campos do `report.audit` do Mo baile. Sem rede, sem
  disco, sem estado global.
- **Interface (`src/ui/`):** lê os arquivos escolhidos com a File API,
  decodifica (UTF-8 ou UTF-16 com BOM), chama o motor e desenha com o design
  system do Mo baile. Exportar gera um Blob e baixa no navegador.
- **Relatório HTML exportado:** autocontido, com o mesmo CSS e JS do relatório
  do Mo baile (`src/engine/assets/`), e o conteúdo do log sempre escapado.
- **Publicação:** `vite build` gera `dist/`, que a workflow `pages.yml` envia
  ao GitHub Pages quando a tag `vX.Y.Z` sobe.

Decisões em [adr/](adr/). Paridade e diferenças deliberadas em
[PARIDADE.md](PARIDADE.md).
