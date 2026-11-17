# Componentes de terceiros

Este arquivo lista o que o site publicado leva de código ou dados de
terceiros. As ferramentas usadas só no desenvolvimento (Vite, TypeScript,
Vitest, Playwright) não vão para o site.

| Componente | Versão | Licença | Uso |
| --- | --- | --- | --- |
| [Motion](https://motion.dev) | 13.5.1 | MIT | Animações do relatório HTML (vem do Mo baile, `src/engine/assets/`) |
| [ppu-paddle-ocr](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr) | 6.6.1 | MIT | Detecção e leitura de texto dos prints (PaddleOCR em JavaScript) |
| [ppu-ocv](https://github.com/PT-Perkasa-Pilar-Utama/ppu-ocv) | 4.0.0 | MIT | Operações de imagem usadas pela ppu-paddle-ocr |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 1.31.1 | MIT | Roda os modelos no navegador (WebAssembly) |
| Modelos PP-OCRv6 small (detecção, reconhecimento e dicionário) | commit `3cbb2688` | Apache-2.0 | Modelos do [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), convertidos para ONNX Runtime e publicados em [snowfluke/ppu-paddle-ocr-models](https://huggingface.co/snowfluke/ppu-paddle-ocr-models) |

A fonte e o sha256 de cada modelo estão em `src/ocr/manifesto.json`. Os
modelos não ficam no repositório: `tools/ocr/ativos.mjs` baixa e confere esses
arquivos no build.
