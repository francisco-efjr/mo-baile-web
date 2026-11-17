// OCR dos prints no navegador (ADR 0002): PaddleOCR v6 small num worker, com
// os modelos servidos pelo próprio site e conferidos pelo sha256.
export { BYTES_DO_OCR, LeitorDePrints, ocrIndisponivel, type MedidaDoPrint, type PrintParaLer, type ProgressoOcr } from "./leitor";
export { EXTENSOES_ACEITAS, MAX_BYTES_PRINT, formatoDaImagem, selecionarPrints, type EntradaDaPasta, type Ignorado, type SelecaoDePrints } from "./arquivos";
