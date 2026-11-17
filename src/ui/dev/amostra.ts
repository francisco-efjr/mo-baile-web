// Amostra SÓ DE DESENVOLVIMENTO: com `npm run dev` e `?amostra` no endereço,
// troca as funções do motor que ainda são stub por respostas prontas, para ver
// a interface com dados enquanto o port do motor não chega. Não entra no build
// de produção: src/main.ts só importa este módulo quando import.meta.env.DEV.
// Dados sintéticos (projeto "Teste" do fixture do Mo baile e o app DemoApp).
import { EngineError, type AnalyticsRead, type AuditReport, type Spec, type TagEvent } from "../../engine/index";
import type { Dependencias, Motor } from "../motor";
import { AMOSTRA_DEV_MARCA, relatorioAmostra } from "./amostra-dados";

const eventos: TagEvent[] = [
  ["10:00:00.120", "session_start", { engagement_session: 1 }],
  ["10:00:00.480", "screen_view", { screen_name: "app:pedido:home", flow_name: "pedido", ga_screen: "app:pedido:home" }],
  ["10:01:00.000", "interaction_pedido_avulso", { screen_name: "app:pedido:avulso:simulacao", flow_name: "pedido-avulso", component: "button", detail: "click:parcelas" }],
  ["10:01:45.000", "add_to_cart", { screen_name: "app:pedido:empresa:parcelas", flow_name: "pedido-empresa", insurance: "1", value: "1", items: [{ item_id: "1002", item_name: "pedido-empresa" }] }],
  ["10:02:00.000", "interaction_pedido_empresa", { screen_name: "app:pedido:empresa:simulacao", flow_name: "pedido-empresa", component: "toggle", detail: "click:parcelas" }],
  ["10:03:10.250", "modal_view", { screen_name: "app:pedido:avulso:simulacao", flow_name: "pedido-avulso", component: "modal", detail: "calendario" }],
  ["10:04:00.000", "add_to_cart", { screen_name: "app:pedido:avulso:simulacao", flow_name: "pedido-avulso", insurance: "0", value: "200.5", items: [{ item_name: "pedido-avulso", item_category: "simulacao", item_id: "1001" }] }],
  ["10:05:30.900", "app_exception", { screen_name: "app:pedido:avulso:simulacao", fatal: 0 }],
].map(([hora, nome, params], i) => ({
  id: i,
  event_name: nome as string,
  params: params as Record<string, unknown>,
  platform: "android" as const,
  time_str: hora as string,
  origin: "app",
  raw_log: `11-16 ${hora as string}  4821  4890 V FA-SVC  : Logging event: origin=app,name=${nome as string},params=Bundle[${JSON.stringify(params)}]`,
}));

const analyticsAmostra: AnalyticsRead = {
  platform: "android",
  stats: { total_lidos: eventos.length + 1, da_plataforma: eventos.length + 1, duplicados: 1, uteis: eventos.length },
  events: eventos,
  tsv: [
    "Hora\tPlataforma\tOrigem\tNome do Evento\tParâmetros Principais\tJSON dos Parâmetros",
    ...eventos.map((e) => [e.time_str, "ANDROID", e.origin, e.event_name, "", JSON.stringify(e.params)].join("\t")),
  ].join("\n"),
  json: JSON.stringify(eventos, null, 2),
};

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// HTML mínimo com <style> e <script> em linha, como o export real, para
// conferir a pré-visualização isolada no iframe.
function htmlAmostra(r: AuditReport): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Amostra</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#fff;color:#141543}h1{color:#C2456E;margin:0 0 8px}code{font-family:ui-monospace,monospace}</style>
</head><body><!-- ${AMOSTRA_DEV_MARCA} --><h1>Relatório (amostra de desenvolvimento)</h1>
<p>Projeto <strong>${escapar(r.spec.projeto)}</strong> · ${r.summary.total} validações · ${r.summary.compliance_rate}% conforme.</p>
<p id="js">O script em linha não rodou.</p>
<script>document.getElementById("js").textContent = "O script em linha rodou.";</script>
</body></html>`;
}

export function criarAmostra(real: Motor): Dependencias {
  const r = relatorioAmostra;
  const spec: Spec = {
    projeto: r.spec.projeto,
    versao_especificacao: r.spec.versao_especificacao,
    plataforma: r.spec.plataforma,
    fluxos: r.spec.fluxos,
    cards: [],
  };
  // Nome com "erro" simula a mensagem do motor para conferir o erro em linha.
  const talvezErro = (nome: string, msg: string) => {
    if (/erro/i.test(nome)) throw new EngineError(msg);
  };
  const motor: Motor = {
    ...real,
    loadSpec: (_texto, nome = "spec.json") => {
      talvezErro(nome, "A spec não é um JSON válido: falta fechar uma chave perto da linha 12.");
      return spec;
    },
    specSummary: (_spec, nome) => ({ ...r.spec, name: nome }),
    readLog: (_texto, nome = "log.txt") => {
      talvezErro(nome, "O log não tem nenhum evento do Firebase Analytics.");
      return { name: nome, format: nome.endsWith(".json") ? "json" : "logcat", items: new Array<unknown>(r.log_stats.total_lidos).fill(null) };
    },
    audit: (_spec, log, op = {}) => ({ ...r, platform: op.platform ?? r.platform, log_name: log.name }),
    exportHtml: (rep) => htmlAmostra(rep),
    analyticsFromLog: (texto) => {
      if (texto.includes("erro")) throw new EngineError("Este arquivo não parece um logcat: nenhuma linha tem a tag FA ou FA-SVC.");
      return analyticsAmostra;
    },
  };
  return {
    motor,
    exemplo: { specNome: "spec-exemplo.json", spec: "{}", logNome: "log-exemplo.txt", log: "amostra" },
    amostra: true,
  };
}
