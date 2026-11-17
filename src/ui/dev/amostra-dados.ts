// Amostra SÓ DE DESENVOLVIMENTO (ativada por ?amostra no `npm run dev`).
// Gerada a partir do resultado real `report.audit` do fixture do Mo baile
// (engine_payloads.json), com `name`/`log_name` no lugar dos caminhos.
// Dados sintéticos. Não entra no build de produção (ver src/main.ts).
import type { AuditReport } from "../../engine/index";

export const AMOSTRA_DEV_MARCA = "amostra-de-desenvolvimento-mo-baile-web";

export const relatorioAmostra: AuditReport = {
  "spec": {
    "name": "spec.json",
    "projeto": "Teste",
    "versao_especificacao": null,
    "plataforma": "android",
    "fluxos": [
      {
        "key": "avulso",
        "label": "PDA · pedido-avulso"
      },
      {
        "key": "empresa",
        "label": "PDE · pedido-empresa"
      }
    ],
    "cards": 3,
    "variants": 7,
    "sections": [
      "Home",
      "Simulação"
    ]
  },
  "platform": "android",
  "source": "file",
  "log_name": "log.json",
  "log_stats": {
    "total_lidos": 12,
    "da_plataforma": 11,
    "duplicados": 1,
    "uteis": 10
  },
  "summary": {
    "total": 7,
    "ok": 3,
    "divergent": 2,
    "missing": 2,
    "compliance_rate": 42.9,
    "extras": 3,
    "alerts": 1
  },
  "results": [
    {
      "id": 0,
      "card_index": 0,
      "section": "Home",
      "card_title": "screen_view",
      "flow": null,
      "flow_label": null,
      "event": "screen_view",
      "variation": "app:pedido:home",
      "status": "ok",
      "checks": [
        {
          "field": "screen_name",
          "expected": "app:pedido:home",
          "obtained": "app:pedido:home",
          "ok": true
        },
        {
          "field": "flow_name",
          "expected": "pedido",
          "obtained": "pedido",
          "ok": true
        }
      ],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:home"
        },
        {
          "key": "flow_name",
          "value": "pedido"
        }
      ],
      "matched": {
        "id": 0,
        "time": "10:00:00.000",
        "event_name": "screen_view",
        "params": {
          "flow_name": "pedido",
          "ga_event_origin": "app",
          "ga_screen": "app:pedido:home"
        }
      },
      "occurrences": 1,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": null,
      "note": null,
      "divergences": "",
      "block": "// screen_view [OK]\n// log 10:00:00.000 · 1 disparo(s)\n{\n  \"screen_name\": \"app:pedido:home\",  ✓\n  \"flow_name\": \"pedido\"  ✓\n}"
    },
    {
      "id": 1,
      "card_index": 1,
      "section": "Simulação",
      "card_title": "interaction_pedido_{fluxo}",
      "flow": "avulso",
      "flow_label": "PDA · pedido-avulso",
      "event": "interaction_pedido_avulso",
      "variation": "click:parcelas",
      "status": "ok",
      "checks": [
        {
          "field": "screen_name",
          "expected": "app:pedido:avulso:simulacao",
          "obtained": "app:pedido:avulso:simulacao",
          "ok": true
        },
        {
          "field": "flow_name",
          "expected": "pedido-avulso",
          "obtained": "pedido-avulso",
          "ok": true
        },
        {
          "field": "component",
          "expected": "button",
          "obtained": "button",
          "ok": true
        },
        {
          "field": "detail",
          "expected": "click:parcelas",
          "obtained": "click:parcelas",
          "ok": true
        }
      ],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:avulso:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-avulso"
        },
        {
          "key": "component",
          "value": "button"
        },
        {
          "key": "detail",
          "value": "click:parcelas"
        }
      ],
      "matched": {
        "id": 0,
        "time": "10:01:00.000",
        "event_name": "interaction_pedido_avulso",
        "params": {
          "screen_name": "app:pedido:avulso:simulacao",
          "flow_name": "pedido-avulso",
          "component": "button",
          "detail": "click:parcelas",
          "ga_screen": "app:pedido:avulso:simulacao"
        }
      },
      "occurrences": 1,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": null,
      "note": null,
      "divergences": "",
      "block": "// PDA · interaction_pedido_avulso [OK]\n// log 10:01:00.000 · 1 disparo(s)\n{\n  \"screen_name\": \"app:pedido:avulso:simulacao\",  ✓\n  \"flow_name\": \"pedido-avulso\",  ✓\n  \"component\": \"button\",  ✓\n  \"detail\": \"click:parcelas\"  ✓\n}"
    },
    {
      "id": 2,
      "card_index": 1,
      "section": "Simulação",
      "card_title": "interaction_pedido_{fluxo}",
      "flow": "avulso",
      "flow_label": "PDA · pedido-avulso",
      "event": "interaction_pedido_avulso",
      "variation": "click:[numero]-parcela-sem-seguro",
      "status": "missing",
      "checks": [],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:avulso:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-avulso"
        },
        {
          "key": "component",
          "value": "button"
        },
        {
          "key": "detail",
          "value": "click:[numero]-parcela-sem-seguro"
        }
      ],
      "matched": null,
      "occurrences": 0,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": null,
      "note": null,
      "divergences": "Não disparado no log",
      "block": "// PDA · interaction_pedido_avulso [ERRO]\n// NÃO DISPARADO no log\n{\n  \"screen_name\": \"app:pedido:avulso:simulacao\",\n  \"flow_name\": \"pedido-avulso\",\n  \"component\": \"button\",\n  \"detail\": \"click:[numero]-parcela-sem-seguro\"\n}  // esperado (spec)"
    },
    {
      "id": 3,
      "card_index": 1,
      "section": "Simulação",
      "card_title": "interaction_pedido_{fluxo}",
      "flow": "empresa",
      "flow_label": "PDE · pedido-empresa",
      "event": "interaction_pedido_empresa",
      "variation": "click:parcelas",
      "status": "error",
      "checks": [
        {
          "field": "screen_name",
          "expected": "app:pedido:empresa:simulacao",
          "obtained": "app:pedido:empresa:simulacao",
          "ok": true
        },
        {
          "field": "flow_name",
          "expected": "pedido-empresa",
          "obtained": "pedido-empresa",
          "ok": true
        },
        {
          "field": "component",
          "expected": "button",
          "obtained": "toggle",
          "ok": false
        },
        {
          "field": "detail",
          "expected": "click:parcelas",
          "obtained": "click:parcelas",
          "ok": true
        }
      ],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:empresa:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-empresa"
        },
        {
          "key": "component",
          "value": "button"
        },
        {
          "key": "detail",
          "value": "click:parcelas"
        }
      ],
      "matched": {
        "id": 0,
        "time": "10:02:00.000",
        "event_name": "interaction_pedido_empresa",
        "params": {
          "screen_name": "app:pedido:empresa:simulacao",
          "flow_name": "pedido-empresa",
          "component": "toggle",
          "detail": "click:parcelas"
        }
      },
      "occurrences": 1,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": null,
      "note": null,
      "divergences": "component: obtido toggle, esperado button",
      "block": "// PDE · interaction_pedido_empresa [ERRO]\n// log 10:02:00.000 · 1 disparo(s)\n{\n  \"screen_name\": \"app:pedido:empresa:simulacao\",  ✓\n  \"flow_name\": \"pedido-empresa\",  ✓\n  \"component\": \"toggle\",  ✗\n    // ↳ esperado: button\n  \"detail\": \"click:parcelas\"  ✓\n}"
    },
    {
      "id": 4,
      "card_index": 1,
      "section": "Simulação",
      "card_title": "interaction_pedido_{fluxo}",
      "flow": "empresa",
      "flow_label": "PDE · pedido-empresa",
      "event": "interaction_pedido_empresa",
      "variation": "click:[numero]-parcela-sem-seguro",
      "status": "missing",
      "checks": [],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:empresa:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-empresa"
        },
        {
          "key": "component",
          "value": "button"
        },
        {
          "key": "detail",
          "value": "click:[numero]-parcela-sem-seguro"
        }
      ],
      "matched": null,
      "occurrences": 0,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": null,
      "note": null,
      "divergences": "Não disparado no log",
      "block": "// PDE · interaction_pedido_empresa [ERRO]\n// NÃO DISPARADO no log\n{\n  \"screen_name\": \"app:pedido:empresa:simulacao\",\n  \"flow_name\": \"pedido-empresa\",\n  \"component\": \"button\",\n  \"detail\": \"click:[numero]-parcela-sem-seguro\"\n}  // esperado (spec)"
    },
    {
      "id": 5,
      "card_index": 2,
      "section": "Simulação",
      "card_title": "add_to_cart",
      "flow": "avulso",
      "flow_label": "PDA · pedido-avulso",
      "event": "add_to_cart",
      "variation": "app:pedido:avulso:simulacao",
      "status": "ok",
      "checks": [
        {
          "field": "screen_name",
          "expected": "app:pedido:avulso:simulacao",
          "obtained": "app:pedido:avulso:simulacao",
          "ok": true
        },
        {
          "field": "flow_name",
          "expected": "pedido-avulso",
          "obtained": "pedido-avulso",
          "ok": true
        },
        {
          "field": "insurance",
          "expected": "[0|1]",
          "obtained": "0",
          "ok": true
        },
        {
          "field": "value",
          "expected": "[numero]",
          "obtained": "200.5",
          "ok": true
        },
        {
          "field": "items[0].item_id",
          "expected": "1001",
          "obtained": "1001",
          "ok": true
        },
        {
          "field": "items[0].item_name",
          "expected": "pedido-avulso",
          "obtained": "pedido-avulso",
          "ok": true
        }
      ],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:avulso:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-avulso"
        },
        {
          "key": "insurance",
          "value": "[0|1]"
        },
        {
          "key": "value",
          "value": "[numero]"
        },
        {
          "key": "items",
          "value": "[{\"item_id\": \"1001\", \"item_name\": \"pedido-avulso\"}]"
        }
      ],
      "matched": {
        "id": 0,
        "time": "10:04:00.000",
        "event_name": "add_to_cart",
        "params": {
          "screen_name": "app:pedido:avulso:simulacao",
          "flow_name": "pedido-avulso",
          "insurance": "0",
          "value": "200.5",
          "items": [
            {
              "item_name": "pedido-avulso",
              "item_category": "simulacao",
              "item_id": "1001"
            }
          ]
        }
      },
      "occurrences": 2,
      "older_divergent": 1,
      "older_divergences": [
        "items[0].item_name=pedido-errado"
      ],
      "ga_screen": null,
      "note": null,
      "divergences": "⚠ 1 disparo(s) anterior(es): items[0].item_name=pedido-errado",
      "block": "// PDA · add_to_cart [OK]\n// log 10:04:00.000 · 2 disparo(s)\n{\n  \"screen_name\": \"app:pedido:avulso:simulacao\",  ✓\n  \"flow_name\": \"pedido-avulso\",  ✓\n  \"insurance\": \"0\",  ✓\n  \"value\": \"200.5\",  ✓\n  \"items[0].item_id\": \"1001\",  ✓\n  \"items[0].item_name\": \"pedido-avulso\"  ✓\n}\n// ⚠ 1 disparo(s) anterior(es) divergente(s):\n//   items[0].item_name=pedido-errado"
    },
    {
      "id": 6,
      "card_index": 2,
      "section": "Simulação",
      "card_title": "add_to_cart",
      "flow": "empresa",
      "flow_label": "PDE · pedido-empresa",
      "event": "add_to_cart",
      "variation": "app:pedido:empresa:simulacao",
      "status": "error",
      "checks": [
        {
          "field": "screen_name",
          "expected": "app:pedido:empresa:simulacao",
          "obtained": "app:pedido:empresa:parcelas",
          "ok": false
        },
        {
          "field": "flow_name",
          "expected": "pedido-empresa",
          "obtained": "pedido-empresa",
          "ok": true
        },
        {
          "field": "insurance",
          "expected": "[0|1]",
          "obtained": "1",
          "ok": true
        },
        {
          "field": "value",
          "expected": "[numero]",
          "obtained": "1",
          "ok": true
        },
        {
          "field": "items[0].item_id",
          "expected": "[preenchido]",
          "obtained": "1002",
          "ok": true
        },
        {
          "field": "items[0].item_name",
          "expected": "pedido-empresa",
          "obtained": "pedido-empresa",
          "ok": true
        }
      ],
      "expected": [
        {
          "key": "screen_name",
          "value": "app:pedido:empresa:simulacao"
        },
        {
          "key": "flow_name",
          "value": "pedido-empresa"
        },
        {
          "key": "insurance",
          "value": "[0|1]"
        },
        {
          "key": "value",
          "value": "[numero]"
        },
        {
          "key": "items",
          "value": "[{\"item_id\": \"[preenchido]\", \"item_name\": \"pedido-empresa\"}]"
        }
      ],
      "matched": {
        "id": 0,
        "time": "10:01:45.000",
        "event_name": "add_to_cart",
        "params": {
          "screen_name": "app:pedido:empresa:parcelas",
          "flow_name": "pedido-empresa",
          "insurance": "1",
          "value": "1",
          "items": [
            {
              "item_name": "pedido-empresa",
              "item_id": "1002"
            }
          ],
          "ga_screen": "app:pedido:empresa:simulacao"
        }
      },
      "occurrences": 1,
      "older_divergent": 0,
      "older_divergences": [],
      "ga_screen": "app:pedido:empresa:simulacao",
      "note": null,
      "divergences": "screen_name: obtido app:pedido:empresa:parcelas, esperado app:pedido:empresa:simulacao",
      "block": "// PDE · add_to_cart [ERRO]\n// log 10:01:45.000 · 1 disparo(s)\n{\n  \"screen_name\": \"app:pedido:empresa:parcelas\",  ✗\n    // ↳ esperado: app:pedido:empresa:simulacao\n  \"flow_name\": \"pedido-empresa\",  ✓\n  \"insurance\": \"1\",  ✓\n  \"value\": \"1\",  ✓\n  \"items[0].item_id\": \"1002\",  ✓\n  \"items[0].item_name\": \"pedido-empresa\"  ✓\n}\n// ga_screen: app:pedido:empresa:simulacao"
    }
  ],
  "extras": [
    {
      "event": "interaction_pedido_avulso",
      "screen": "app:pedido:avulso:detalhes-do-pedido",
      "flow_name": "pedido-avulso",
      "component": "button",
      "detail": "click:parcelas",
      "count": 1
    },
    {
      "event": "screen_view",
      "screen": "app:pedido:outra-tela",
      "flow_name": "pedido",
      "component": null,
      "detail": null,
      "count": 1
    },
    {
      "event": "modal_view",
      "screen": "app:pedido:avulso:simulacao",
      "flow_name": "pedido-avulso",
      "component": "modal",
      "detail": "calendario",
      "count": 1
    }
  ],
  "alerts": [
    {
      "event": "app_exception",
      "screen": "app:pedido:avulso:simulacao",
      "flow_name": null,
      "component": null,
      "detail": null,
      "count": 1
    }
  ],
  "observations": "Eventos dos fluxos da spec que nenhum card cobre:\n  • interaction_pedido_avulso · app:pedido:avulso:detalhes-do-pedido · component=button · detail=click:parcelas — 1x\n  • screen_view · app:pedido:outra-tela — 1x\n  • modal_view · app:pedido:avulso:simulacao · component=modal · detail=calendario — 1x\n\nAlertas (app_exception / error_view nas telas da spec):\n  • app_exception · app:pedido:avulso:simulacao — 1x\n\nRegra: cada variação é validada pelo disparo mais recente; '⚠' indica disparos anteriores com divergência diferente.",
  "markdown": "# Auditoria de Tagueamento — Teste (ANDROID)\n\n- Período do log: 08/10 10:00:00 até 10:06:00 (6 min)\n- 3 cards · 7 validações · OK: 3 · Erro: 4 (sendo 2 não disparadas) · Conformidade: 42.9%\n- Plataforma: ANDROID · 10 eventos únicos (1 duplicados removidos de 11 da plataforma; 12 lidos no arquivo)\n\n| Seção | Card | Fluxo | Evento | Variação | Status | Divergências | Horário | Disparos |\n|---|---|---|---|---|---|---|---|---|\n| Home | screen_view | - | screen_view | app:pedido:home | OK |  | 10:00:00.000 | 1 |\n| Simulação | interaction_pedido_{fluxo} | PDA · pedido-avulso | interaction_pedido_avulso | click:parcelas | OK |  | 10:01:00.000 | 1 |\n| Simulação | interaction_pedido_{fluxo} | PDA · pedido-avulso | interaction_pedido_avulso | click:[numero]-parcela-sem-seguro | NÃO DISPARADO | Não disparado no log |  | 0 |\n| Simulação | interaction_pedido_{fluxo} | PDE · pedido-empresa | interaction_pedido_empresa | click:parcelas | ERRO | component: obtido toggle, esperado button | 10:02:00.000 | 1 |\n| Simulação | interaction_pedido_{fluxo} | PDE · pedido-empresa | interaction_pedido_empresa | click:[numero]-parcela-sem-seguro | NÃO DISPARADO | Não disparado no log |  | 0 |\n| Simulação | add_to_cart | PDA · pedido-avulso | add_to_cart | app:pedido:avulso:simulacao | OK | ⚠ 1 disparo(s) anterior(es): items[0].item_name=pedido-errado | 10:04:00.000 | 2 |\n| Simulação | add_to_cart | PDE · pedido-empresa | add_to_cart | app:pedido:empresa:simulacao | ERRO | screen_name: obtido app:pedido:empresa:parcelas, esperado app:pedido:empresa:simulacao | 10:01:45.000 | 1 |\n\n## Fora da spec / Observações\n\nEventos dos fluxos da spec que nenhum card cobre:\n  • interaction_pedido_avulso · app:pedido:avulso:detalhes-do-pedido · component=button · detail=click:parcelas — 1x\n  • screen_view · app:pedido:outra-tela — 1x\n  • modal_view · app:pedido:avulso:simulacao · component=modal · detail=calendario — 1x\n\nAlertas (app_exception / error_view nas telas da spec):\n  • app_exception · app:pedido:avulso:simulacao — 1x\n\nRegra: cada variação é validada pelo disparo mais recente; '⚠' indica disparos anteriores com divergência diferente.\n",
  "tsv": "Seção\tCard\tFluxo\tEvento\tVariação\tStatus\tDivergências\tHorário\tDisparos\nHome\tscreen_view\t-\tscreen_view\tapp:pedido:home\tOK\t\t10:00:00.000\t1\nSimulação\tinteraction_pedido_{fluxo}\tPDA · pedido-avulso\tinteraction_pedido_avulso\tclick:parcelas\tOK\t\t10:01:00.000\t1\nSimulação\tinteraction_pedido_{fluxo}\tPDA · pedido-avulso\tinteraction_pedido_avulso\tclick:[numero]-parcela-sem-seguro\tNÃO DISPARADO\tNão disparado no log\t\t0\nSimulação\tinteraction_pedido_{fluxo}\tPDE · pedido-empresa\tinteraction_pedido_empresa\tclick:parcelas\tERRO\tcomponent: obtido toggle, esperado button\t10:02:00.000\t1\nSimulação\tinteraction_pedido_{fluxo}\tPDE · pedido-empresa\tinteraction_pedido_empresa\tclick:[numero]-parcela-sem-seguro\tNÃO DISPARADO\tNão disparado no log\t\t0\nSimulação\tadd_to_cart\tPDA · pedido-avulso\tadd_to_cart\tapp:pedido:avulso:simulacao\tOK\t⚠ 1 disparo(s) anterior(es): items[0].item_name=pedido-errado\t10:04:00.000\t2\nSimulação\tadd_to_cart\tPDE · pedido-empresa\tadd_to_cart\tapp:pedido:empresa:simulacao\tERRO\tscreen_name: obtido app:pedido:empresa:parcelas, esperado app:pedido:empresa:simulacao\t10:01:45.000\t1\n"
};
