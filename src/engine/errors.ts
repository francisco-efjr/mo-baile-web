/** Erro de entrada do usuário (spec inválida, log sem eventos...): mensagem pronta para a tela, em pt-BR. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly kind: string = "invalid_input",
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/** O que o Mo baile responderia a uma exceção não prevista (o mesmo texto da versão web em Python). */
export const INTERNAL_MESSAGE = "Erro interno no motor.";
