// Tipos mínimos do Node usados pelos testes (o projeto não depende de @types/node).
declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function readdirSync(path: string | URL): string[];
  export function existsSync(path: string | URL): boolean;
}
declare module "node:crypto" {
  interface Hash {
    update(data: Uint8Array | string): Hash;
    digest(encoding: "base64" | "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}
