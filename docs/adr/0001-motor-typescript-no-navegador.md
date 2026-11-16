# ADR 0001 — Motor de tagueamento em TypeScript, no navegador

Data: 2026-11-16
Status: aceito

## Contexto

O Mo baile é um app nativo de macOS com motor Python. A auditoria de
tagueamento (Relatório) e a leitura de eventos do Firebase (Analytics) são
Python puro e já rodam fora do Mac (`python -m mobaile.web`, ADR 0007 do Mo
baile), mas exigem instalar Python. O dono quer um site, num repositório à
parte, com motor próprio e as mesmas regras.

Opções avaliadas:

- **TypeScript no navegador:** port das regras, sem servidor e sem instalação.
- **Pyodide:** o mesmo Python no navegador, mas com uns 10 MB na primeira carga.
- **Servidor:** exigiria enviar logs, que podem ter dado de cliente.

## Decisão

1. Motor próprio em TypeScript (`src/engine/`), port das regras do Mo baile
   (`services/report` e `domain/report.py`), com os mesmos nomes de campo do
   `report.audit`.
2. Site estático (Vite) publicado no GitHub Pages. Os arquivos escolhidos são
   lidos em memória e nunca saem do navegador; a CSP tem `connect-src 'none'`.
3. **Paridade provada por teste:** um gerador (`tools/golden`) roda o motor
   Python do Mo baile sobre um corpus sintético (`test/corpus`) e grava o
   gabarito (`test/golden`). `test/parity.test.ts` exige o mesmo resultado no
   motor TypeScript.
4. Fora da primeira versão, por depender de macOS ou do cabo: importação de
   prints do Figma (OCR), board em imagem, checklist e escuta ao vivo. O
   Android ao vivo por WebUSB (Chrome e Edge) é a fase 2.

## Consequências

- A regra existe em duas linguagens. A paridade por gabarito é o que impede
  as duas de divergirem em silêncio. Mudou a regra no Mo baile: regenere o
  gabarito e porte.
- Sem servidor, não há custo nem dado de terceiros guardado. O site funciona
  offline depois de carregado.
