// Mensagens entre a página e o worker do OCR.
import type { CaixaPaddle } from "../engine/prints/adaptador";

export type PedidoOcr =
  | { tipo: "preparar"; base?: string }
  | { tipo: "ler"; id: number; nome: string; bytes: ArrayBuffer };

export type RespostaOcr =
  | { tipo: "baixando"; feito: number; total: number; doCache: boolean }
  | { tipo: "pronto"; doCache: boolean; ms: number }
  | { tipo: "lido"; id: number; largura: number; altura: number; caixas: CaixaPaddle[]; ms: number }
  | { tipo: "erro"; id?: number; mensagem: string };
