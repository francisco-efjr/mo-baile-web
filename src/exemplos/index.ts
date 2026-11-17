// Exemplo sintético (app de exemplo DemoApp) para "Experimentar com um exemplo".
// Empacotado no build: o site não faz chamada de rede para buscá-lo.
// É o caso 01 do corpus de paridade (test/corpus/01-exemplo-loja): spec com
// dois fluxos e logcat cru do Android com validações OK, divergentes, não
// disparadas, eventos fora da spec, um alerta, um duplicado e um disparo
// antigo divergente. O gabarito do Mo baile para ele está em test/golden.
import log from "../../test/corpus/01-exemplo-loja/log.txt?raw";
import spec from "../../test/corpus/01-exemplo-loja/spec.json?raw";

export const exemplo = {
  specNome: "spec-exemplo.json",
  spec,
  logNome: "log-exemplo.txt",
  log,
};
