// O config do Playwright roda no Node e lê variáveis de ambiente. Declaração
// mínima, para não depender de @types/node só por isso.
declare const process: { env: Record<string, string | undefined> };
