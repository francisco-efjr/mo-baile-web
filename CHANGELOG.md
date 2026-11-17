# Changelog

Todas as mudanças relevantes do Mo baile Web ficam aqui, da mais nova para a
mais antiga. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e a numeração segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).


## [0.2.0] - 2026-11-17

### Adicionado

- **Importar Prints do Figma**, no quadro da spec do Relatório: monta o
  rascunho da spec lendo os prints dos cards "Anotações" do Figma, no
  navegador e com as regras do Mo baile.
  - Escolha a pasta, os prints ou arraste.
  - Acompanhe a leitura, com a opção de cancelar.
  - Revise as dúvidas com a miniatura do print.
  - Use o rascunho na auditoria, ou baixe a spec, a revisão e o checklist.
  - Novo guia na Ajuda e teste F-11.
- **Importação de prints, fase 1 (motor):** o leitor de cards do Mo baile,
  que monta o rascunho da spec, a revisão e o checklist a partir do texto
  lido dos prints do Figma, agora em TypeScript (`src/engine/prints/`). O
  contrato é `rascunhoDosPrints`.
  - A paridade com o Python é provada por gabarito sobre 29 pastas fictícias,
    com 137 prints escritos à mão ou sorteados com ruído de OCR.
  - Conferido também, fora do repositório, sobre 129 prints reais lidos pelo
    Vision e pelo PaddleOCR: o resultado foi idêntico.
  - Decisões no ADR 0002.
- **Importação de prints, fase 2 (OCR no navegador):** o PaddleOCR v6 small
  lê os prints num worker, sem servidor (`src/ocr/`).
  - Dependências novas, com versão exata: `ppu-paddle-ocr` 6.6.1, `ppu-ocv`
    4.0.0 e `onnxruntime-web` 1.31.1.
  - Os modelos (31 MB) e o runtime (15 MB) vêm do próprio site, são
    conferidos pelo sha256 e ficam guardados no navegador depois da primeira
    vez.
  - A biblioteca apontaria o runtime para uma CDN; o site aponta para o
    próprio endereço.
  - A CSP da página não mudou.
  - A camada de ajustes do PaddleOCR (`adaptador.ts`) corrige a margem das
    caixas, o marcador lido como espaço, os espaços que sobram, o `|` perdido
    e as caixas de ruído.
  - O teste F-10 lê cards fictícios no navegador e exige a mesma spec de uma
    leitura perfeita, sem nenhuma requisição externa. Passa no Chrome e no
    Firefox; no WebKit, a leitura passa, mas o cache não guarda os modelos.
  - Revisão de segurança em `docs/revisao/seguranca-ocr-fase2.md`.

## [0.1.0] - 2026-11-16

### Adicionado

- Primeira versão (beta) do Mo baile Web: a parte de tagueamento do Mo baile
  como site, sem instalar nada e sem mandar arquivo para lugar nenhum.
- **Relatório:** escolher a spec da demanda (JSON) e o log (logcat salvo, JSON
  do Firebase ou JSON exportado pelo Mo baile), auditar e ver o resultado com o
  percentual de conformidade, os cartões por status, a tabela com esperado ×
  obtido, o que ficou fora da spec e os alertas; exportar o relatório HTML
  (o mesmo do Mo baile, com pré-visualização no site), Markdown e TSV.
- **Analytics:** ler um logcat salvo do Android e ver os eventos do Firebase,
  com busca, detalhe dos parâmetros e exportação em TSV e JSON.
- **Ajuda** com guias curtos e "Experimentar com um Exemplo".
- **Motor próprio em TypeScript**, port das regras do Mo baile, com paridade
  provada por gabarito gerado pelo motor Python (23 casos sintéticos, relatório
  HTML idêntico byte a byte).
- Identidade do Mo baile (design system do relatório, paleta Praia clara e
  escura), selo Beta e Relatar um Problema.
- Privacidade: a página não faz chamada de rede (CSP `connect-src 'none'`), e
  o relatório roda na pré-visualização com scripts e estilos liberados só por
  hash.
