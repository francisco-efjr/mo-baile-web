// Que arquivos de uma pasta escolhida entram na importação de prints. Segue o
// `report.import` do Mo baile (só os arquivos de imagem da própria pasta, sem
// subpastas e sem ocultos), com o que o navegador consegue abrir: PNG e JPG.
// HEIC e TIFF, que o Vision lê no Mac, ficam de fora com o motivo.
import { cmpCodePoints } from "../engine/py";

export const EXTENSOES_ACEITAS = [".png", ".jpg", ".jpeg"] as const;
const EXTENSOES_DO_MAC = [".heic", ".tiff", ".tif"];
/** Um print de card tem poucas centenas de KB; mais que isso não é print. */
export const MAX_BYTES_PRINT = 20 * 1024 * 1024;

export interface EntradaDaPasta {
  /** Nome do arquivo. */
  nome: string;
  /** Caminho dentro da pasta escolhida (`webkitRelativePath`), ou só o nome. */
  caminho: string;
  tamanho: number;
}

export interface Ignorado {
  nome: string;
  motivo: string;
}

export interface SelecaoDePrints<T extends EntradaDaPasta> {
  /** Nome da pasta (a primeira parte do caminho), ou "prints" se vieram arquivos soltos. */
  pasta: string;
  prints: T[];
  ignorados: Ignorado[];
}

const extensao = (nome: string) => {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i).toLowerCase() : "";
};

export function selecionarPrints<T extends EntradaDaPasta>(entradas: readonly T[]): SelecaoDePrints<T> {
  const partes = entradas.map((e) => (e.caminho || e.nome).split("/").filter(Boolean));
  const pastas = new Set(partes.filter((p) => p.length > 1).map((p) => p[0]!));
  const pasta = pastas.size === 1 ? [...pastas][0]! : "prints";
  const prints: T[] = [];
  const ignorados: Ignorado[] = [];
  entradas.forEach((e, i) => {
    const caminho = partes[i]!;
    if (e.nome.startsWith(".")) return; // oculto (.DS_Store e afins): o Mo baile também pula calado
    if (caminho.length > 2) {
      ignorados.push({ nome: caminho.slice(1).join("/"), motivo: "está numa subpasta; só entram os prints da própria pasta" });
      return;
    }
    const ext = extensao(e.nome);
    if (EXTENSOES_DO_MAC.includes(ext)) {
      ignorados.push({ nome: e.nome, motivo: "o navegador não abre esse formato; exporte o print em PNG" });
      return;
    }
    if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) return; // não é imagem: fica de fora calado
    if (e.tamanho > MAX_BYTES_PRINT) {
      ignorados.push({ nome: e.nome, motivo: "tem mais de 20 MB; um print de card é bem menor" });
      return;
    }
    prints.push(e);
  });
  // Em ordem de nome, como o Mo baile lê a pasta (e como o rascunho sai).
  prints.sort((a, b) => cmpCodePoints(a.nome, b.nome));
  return { pasta, prints, ignorados };
}

/** PNG ou JPG pelos primeiros bytes (a extensão sozinha não prova nada). */
export function formatoDaImagem(inicio: Uint8Array): "png" | "jpeg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (inicio.length >= 8 && png.every((b, i) => inicio[i] === b)) return "png";
  if (inicio.length >= 3 && inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff) return "jpeg";
  return null;
}
