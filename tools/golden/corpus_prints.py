#!/usr/bin/env python3
"""Corpus sintético da importação de prints: linhas de OCR fictícias, por pasta.

Uso (a partir da raiz do repositório):

    PYTHONPATH=<mo-baile>/engine/src python3 tools/golden/corpus_prints.py

Grava `test/corpus-prints/<caso>.json`, a entrada que `gerar.py` passa pelo
leitor de cards do Mo baile (`services/report/card_reader.py`) e que
`test/prints.test.ts` passa pelo port em TypeScript. Cada caso é uma pasta de
prints já lida pelo OCR:

    {"projeto": "...", "pasta": "...", "plataforma": "android|ios",
     "prints": [{"file": "01.png", "lines": [{"t", "x", "y", "w", "h", "c"}]}]}

Há casos escritos à mão (`manual-*`), com os ruídos que o OCR comete nos cards
"Anotações" do Figma, e casos sorteados com semente fixa (`sorteio-*`), que
misturam cabeçalho, tabela, `items` e Observação com erros de leitura. Tudo é
fictício: app `DemoApp`, fluxos e telas inventados.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from mobaile.services.report.card_reader import ITEM_KEYS, KNOWN_EVENTS, KNOWN_PARAMS

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "test" / "corpus-prints"
SEMENTE = 20261117


def linha(t: str, x: float, y: float, c: float = 1.0, w: float = 0.3, h: float = 0.03) -> dict:
    return {"t": t, "x": round(x, 4), "y": round(y, 4), "w": round(w, 4), "h": round(h, 4), "c": round(c, 3)}


# ----------------------------------------------------------------------------- casos à mão

CARD_INTERACTION = [
    linha("Anotações", 0.02, 0.0),
    linha("5 interaction_pedido_[avulso |empresa]", 0.04, 0.03),
    linha("screen name", 0.04, 0.10), linha("app:pedido:[avulso|", 0.42, 0.10), linha("empresa]:simulacao", 0.42, 0.13),
    linha("flow_name", 0.04, 0.20), linha("pedido-[avulso empresa]", 0.42, 0.20),
    linha("component", 0.04, 0.27), linha("[elemento]", 0.42, 0.27),
    linha("detail", 0.04, 0.33), linha("click:[numero de parcelas]-parcela-", 0.42, 0.33),
    linha("[com |sem]-seguro", 0.42, 0.36),
    linha("interactio", 0.85, 0.30),
    linha('Observação "interaction_pedido_[avulso| empresa]"', 0.04, 0.42),
    linha("O evento interaction_pedido_[avulso|empresa] deve disparar", 0.04, 0.49),
    linha("Preenchimento de [elemento] no parâmetro component:", 0.04, 0.63),
    linha("• modal", 0.06, 0.67),
    linha("Preenchimento de [label do botao] no", 0.04, 0.79), linha("parâmetro detail:", 0.04, 0.82),
    linha("• click:10-parcela-com-seguro", 0.06, 0.86), linha("• clickifechar", 0.06, 0.90),
]

CARD_CHECKOUT = [
    linha("add_to cart", 0.04, 0.03, 0.3),
    linha("screen_name", 0.04, 0.09), linha("app:pedido:[avulso|", 0.42, 0.09), linha("empresa]:simulacao", 0.42, 0.11),
    linha("flow_name", 0.04, 0.17), linha("pedido-[avulso | empresa]", 0.42, 0.17),
    linha("installments", 0.04, 0.22), linha("[número de parcelas]", 0.42, 0.22),
    linha("items", 0.04, 0.27),
    linha('"item_id": "1001",', 0.45, 0.30), linha('"item_name": "pedido-avulso",', 0.45, 0.32),
    linha('"item_category": "Simulacao"', 0.45, 0.34), linha("}", 0.44, 0.36),
    linha("due_date", 0.04, 0.42), linha("[data primeiro vencimento]", 0.42, 0.42),
    linha("insurance", 0.04, 0.48), linha("[0/1]", 0.41, 0.48),
    linha("loan_insurance_va", 0.04, 0.54), linha("[valor do seguro]", 0.42, 0.54), linha("lue", 0.04, 0.57),
    linha("operation_type", 0.04, 0.62), linha("[avulso| empresa]-pre-", 0.41, 0.62), linha("agendado", 0.42, 0.65),
]

CARD_LIST = [
    linha("view item_list", 0.04, 0.02, 0.3),
    linha("screen_name", 0.04, 0.08), linha("app:pedido:reserva-de-", 0.41, 0.08), linha("entrega", 0.41, 0.10),
    linha("item_list_name", 0.03, 0.19), linha("agenda-de-pedidos", 0.41, 0.20),
    linha("items", 0.03, 0.35),
    linha('"item_name": "recebivel-1",', 0.46, 0.40), linha('"item_id": "card-1".', 0.46, 0.42),
    linha('"price": [valor liquido]', 0.46, 0.52),
    linha('"item_name": "recebivel-2".', 0.46, 0.59), linha("'item_id\": \"card-2", 0.46, 0.62),
    linha('"price": [valor liquido]', 0.46, 0.72),
]

# Card por fluxo com item de compra que cita o fluxo (params_por_fluxo) e detail com exemplos numéricos
CARD_PURCHASE_FLUXO = [
    linha("🛒 purchase", 0.05, 0.02, 0.5),
    linha("screen_name", 0.04, 0.08), linha("app:demo:[pf|pj]:sucesso", 0.42, 0.08),
    linha("flow_name", 0.04, 0.15), linha("demo-[pf | pj]", 0.42, 0.15),
    linha("currency", 0.04, 0.20), linha("BRL", 0.42, 0.20),
    linha("items", 0.04, 0.26),
    linha("[", 0.42, 0.28), linha("{", 0.43, 0.30),
    linha('"item_id": "5501",', 0.45, 0.32, 0.3), linha('"item_name": "demo-pf",', 0.45, 0.34, 0.5),
    linha('"item_category": "simulacao"', 0.45, 0.36), linha("}", 0.43, 0.38), linha("]", 0.42, 0.40),
    linha("value", 0.04, 0.44, 0.5), linha("[valor desejado total]", 0.42, 0.44),
    linha("transaction_id", 0.04, 0.50), linha("[id da transacao]", 0.42, 0.50),
    linha("detail", 0.04, 0.56), linha("click:[numero]-parcelas", 0.42, 0.56),
    linha("Observação", 0.04, 0.64),
    linha("Preenchimento de [x] no parâmetro detail:", 0.04, 0.70),
    linha("• click:10-parcelas", 0.06, 0.74), linha("• click:12-parcelas", 0.06, 0.78),
    linha("• click:12-parcelas", 0.06, 0.82), linha("• click:ver-mais", 0.06, 0.86),
]

# Tela com alternância que não é fluxo (vira variações) e Observação com nome do evento repetido
CARD_SCREEN_ALT = [
    linha("S screen_view", 0.05, 0.03),
    linha("screen_name", 0.04, 0.10), linha("app:demo:[resumo|detalhe]", 0.42, 0.10),
    linha("flow_name", 0.04, 0.18), linha("demo-pf", 0.42, 0.18),
    linha('Observação "screen_view"', 0.04, 0.30),
    linha("O evento screen_view deve disparar ao abrir a tela.", 0.04, 0.36),
    linha("Preenchimento de [tela] no parâmetro flow name:", 0.04, 0.44),
    linha("• demo-pf", 0.06, 0.48), linha("· demo-pj", 0.06, 0.52),
]

# Bordas: espaço no screen_name, chave desconhecida, cabeçalho em duas linhas, valores vazios
CARD_BORDAS = [
    linha("O form", 0.04, 0.02), linha("input", 0.04, 0.05),
    linha("screen_name", 0.04, 0.12), linha("app demo cadastro [dados|endereco]", 0.42, 0.12),
    linha("flow_name", 0.04, 0.19),
    linha("campo_extra", 0.04, 0.25), linha("[0 l]", 0.42, 0.25),
    linha("installment_", 0.04, 0.31), linha("value", 0.04, 0.34), linha("[valor da parcela]", 0.42, 0.31),
    linha("component", 0.04, 0.40), linha("[seguro pedido]", 0.42, 0.40),
    linha("detail", 0.04, 0.46), linha("click;fechar", 0.42, 0.46),
    linha("text", 0.04, 0.52), linha("“Olá, açaí ✨”.", 0.42, 0.52),
    linha("section", 0.04, 0.58), linha("[avulso)empresa]", 0.42, 0.58),
    linha("method", 0.04, 0.64), linha("[011]", 0.42, 0.64),
    linha("loan_insurance", 0.04, 0.70), linha("_value", 0.22, 0.701), linha("[valor do seguro]", 0.42, 0.70),
    linha("ruído na margem", 0.80, 0.20),
]

# Card só com cabeçalho no lado direito (sem dono) e Observação longa (acumulador passa de 400)
CARD_SEM_CHAVE = [
    linha('"', 0.04, 0.02), linha("login", 0.45, 0.02),
    linha("Observação", 0.04, 0.20),
    *[linha(f"Texto de apoio número {i} que não cita parâmetro nenhum, só explica a regra de negócio.", 0.04,
            0.25 + i * 0.03) for i in range(8)],
    linha("Preenchimento de [metodo] no parâmetro method:", 0.04, 0.55),
    linha("- senha", 0.06, 0.59), linha("* biometria", 0.06, 0.62),
]

# Itens com chaves com vírgula e ponto, valores com parênteses e prefixos numéricos diferentes
CARD_ITENS = [
    linha("view_item_list", 0.04, 0.02),
    linha("items", 0.04, 0.10),
    linha('"item,name": "Produto-1",', 0.45, 0.12), linha('"item.id": "sku-1",', 0.45, 0.15),
    linha('"price": (valor do item)', 0.45, 0.18), linha('"index": "1"', 0.45, 0.21),
    linha('"item_name": "Produto-2",', 0.45, 0.26), linha('"item_id": "sku-2",', 0.45, 0.29),
    linha('"price": (valor do item)', 0.45, 0.32), linha('"index": "2"', 0.45, 0.35),
    linha('"itemm_brand": "demo"', 0.45, 0.40), linha('"cor_favorita": "azul",', 0.45, 0.43),
    linha("item_list_id", 0.04, 0.50), linha("lista-demo", 0.42, 0.50),
]

CARD_VAZIO = [linha("Anotações", 0.02, 0.0), linha("fora da área", 0.9, 0.5)]

CARD_SO_PARAMETROS = [
    linha("screen_name", 0.04, 0.05), linha("app:demo:home", 0.42, 0.05),
    linha("flow_name", 0.04, 0.12), linha("demo", 0.42, 0.12),
]


def card_acumulador() -> list[dict]:
    """O acumulador da Observação passa de 400 caracteres e é cortado nos últimos 200.

    O "O" de "O evento search deve" fica exatamente no 201º caractere a partir do
    fim: com o corte em 200, a frase não volta a casar e o cabeçalho "login" vence;
    com qualquer outro corte, o nome da Observação aparece duas vezes e vence.
    """
    a = ("texto de apoio sem regra nenhuma " * 6)[:150].strip() + "x"
    frase = "O evento search deve disparar"
    cauda = ("abcde" * 40)[: 201 - len(frase) - 1]
    b = "abcd" * 12 + "zz " + frase + " " + cauda
    assert len(frase + " " + cauda) == 201
    return [
        linha("login", 0.04, 0.02),
        linha("Observação", 0.04, 0.20),
        linha(a, 0.04, 0.25),
        linha(b, 0.04, 0.30),
        linha("fim.", 0.04, 0.35),
    ]


def manuais() -> dict[str, dict]:
    return {
        "manual-01-ruidos-do-ocr": {
            "projeto": "DemoApp pedido", "pasta": "prints-pedido", "plataforma": "android",
            "prints": [{"file": "01-interaction.png", "lines": CARD_INTERACTION},
                       {"file": "02-checkout.png", "lines": CARD_CHECKOUT},
                       {"file": "03-lista.png", "lines": CARD_LIST}],
        },
        "manual-02-fluxos-e-variacoes": {
            "projeto": "", "pasta": "DemoApp Café", "plataforma": "ios",
            "prints": [{"file": "b-tela.png", "lines": CARD_SCREEN_ALT},
                       {"file": "a-compra.png", "lines": CARD_PURCHASE_FLUXO}],
        },
        "manual-03-bordas": {
            "projeto": "  Demo bordas  ", "pasta": "bordas", "plataforma": "android",
            "prints": [{"file": "z.png", "lines": CARD_BORDAS},
                       {"file": "Y.png", "lines": CARD_SEM_CHAVE},
                       {"file": "x.png", "lines": CARD_ITENS},
                       {"file": "w.png", "lines": CARD_VAZIO},
                       {"file": "v.png", "lines": CARD_SO_PARAMETROS},
                       {"file": "u.png", "lines": []}],
        },
        "manual-04-sem-prints": {"projeto": "DemoApp", "pasta": "vazia", "plataforma": "android", "prints": []},
        "manual-05-acumulador": {
            "projeto": "DemoApp", "pasta": "acumulador", "plataforma": "android",
            "prints": [{"file": "01.png", "lines": card_acumulador()}],
        },
    }


# ----------------------------------------------------------------------------- sorteio

FLUXOS = [["pf", "pj"], ["novo", "usado"], ["avulso", "empresa", "grupo"], ["mensal", "anual"]]
ICONES = ["", "", "5 ", "S ", "• ", "O ", "🛒 ", "@ "]
TELAS = ["home", "simulacao", "resumo", "sucesso", "erro", "detalhe", "termos-e-condicoes"]
DESCRITIVOS = ["[valor da parcela]", "[número de parcelas]", "[data primeiro vencimento]", "[taxa de juros]",
               "[id da transacao]", "[elemento]", "[label do botao]", "[valor]", "[nome do produto]"]
CLIQUES = ["click:continuar", "click:voltar", "click:fechar", "click:ver-detalhes", "click:10-parcelas",
           "click:12-parcelas", "click:simular"]


def errar(r: random.Random, texto: str, chance: float) -> str:
    """Erros típicos de OCR: troca de letra, sublinhado vira espaço, letra some, espaço a mais."""
    if not texto or r.random() > chance:
        return texto
    i = r.randrange(len(texto))
    tipo = r.randrange(6)
    if tipo == 0:
        return texto[:i] + r.choice("lI1|oO0ae") + texto[i + 1:]
    if tipo == 1:
        return texto.replace("_", " ", 1)
    if tipo == 2:
        return texto[:i] + texto[i + 1:]
    if tipo == 3:
        return texto[:i] + " " + texto[i:]
    if tipo == 4:
        return texto.replace("_", "__", 1)
    return texto.replace(":", ".", 1)


def card_sorteado(r: random.Random, fluxos: list[str]) -> list[dict]:
    out: list[dict] = []
    y = 0.0
    alt = "[" + r.choice(["|", " |", "| ", " | ", " "]).join(fluxos) + "]"
    if r.random() < 0.3:
        out.append(linha("Anotações", 0.02, y, w=0.2, h=0.02))
        y += 0.03
    evento = r.choice(KNOWN_EVENTS)
    if r.random() < 0.35:
        evento = f"{evento.split('_')[0]}_demo_{alt}"
    cab = r.choice(ICONES) + errar(r, evento, 0.3)
    alt_cab = r.random() < 0.15
    if alt_cab:
        meio = r.randrange(1, max(2, len(cab)))
        out.append(linha(cab[:meio], 0.04, y, c=r.choice([0.3, 0.5, 1.0])))
        out.append(linha(cab[meio:], 0.04, y + 0.03))
        y += 0.03
    else:
        out.append(linha(cab, r.choice([0.02, 0.04, 0.05]), y, c=r.choice([0.3, 0.5, 1.0])))
    y += r.uniform(0.05, 0.08)

    nomes = r.sample(KNOWN_PARAMS[:12], r.randint(1, 6))
    if r.random() < 0.3 and "items" not in nomes:
        nomes.insert(r.randrange(len(nomes) + 1), "items")
    if r.random() < 0.15:
        nomes.append(r.choice(["campo_novo", "status do pedido", "x"]))
    for nome in nomes:
        h = r.uniform(0.015, 0.035)
        texto = errar(r, nome, 0.25)
        if len(texto) > 10 and r.random() < 0.15:
            corte = r.randrange(5, len(texto) - 2)
            out.append(linha(texto[:corte], 0.04, y, h=h))
            out.append(linha(texto[corte:], 0.04, y + 0.025, h=h))
        else:
            out.append(linha(texto, r.choice([0.02, 0.03, 0.04, 0.29]), y + r.uniform(-0.004, 0.004), h=h))
        if nome == "items":
            n_itens = r.randint(1, 3)
            yy = y + 0.03
            for k in range(n_itens):
                for chave in r.sample(ITEM_KEYS[:8], r.randint(1, 4)) + ["item_id"]:
                    valor = r.choice([f"demo-{fluxos[0]}", f"card-{k + 1}", "Simulacao", "[valor bruto]",
                                      "(taxa)", f"{1000 + k}", "simulacao"])
                    aspa = r.choice(['"', "'", "*", ""])
                    out.append(linha(errar(r, f'{aspa}{chave}{aspa}: "{valor}",', 0.2),
                                     r.uniform(0.42, 0.47), yy, c=r.choice([0.3, 0.5, 1.0])))
                    yy += 0.022
                if r.random() < 0.5:
                    out.append(linha("}", 0.43, yy))
                    yy += 0.02
            y = yy + 0.03
            continue
        if nome == "screen_name":
            valor = r.choice([f"app:demo:{r.choice(TELAS)}", f"app:demo:{alt}:{r.choice(TELAS)}",
                              f"app:demo:[{r.choice(TELAS)}|{r.choice(TELAS)}]", f"app demo {r.choice(TELAS)}"])
        elif nome == "flow_name":
            valor = r.choice([f"demo-{alt}", f"demo-{fluxos[0]}", "demo"])
        elif nome == "detail":
            valor = r.choice(["click:[label do botao]", "click:[numero]-parcelas", r.choice(CLIQUES)])
        elif nome in ("insurance",):
            valor = r.choice(["[0|1]", "[0/1]", "[0 1]", "[011]", "[0l1]"])
        else:
            valor = r.choice([*DESCRITIVOS, "BRL", f"{alt}-pre-agendado", "texto livre"])
        valor = errar(r, valor, 0.25)
        if len(valor) > 14 and r.random() < 0.3:
            corte = r.randrange(6, len(valor) - 3)
            out.append(linha(valor[:corte], 0.42, y + r.uniform(-0.004, 0.004), c=r.random()))
            out.append(linha(valor[corte:], 0.42, y + 0.025))
        else:
            out.append(linha(valor, r.choice([0.41, 0.42, 0.43, 0.6, 0.74]), y + r.uniform(-0.004, 0.004)))
        y += r.uniform(0.05, 0.08)

    if r.random() < 0.15:
        out.append(linha(r.choice(["interactio", "T", "①"]), r.uniform(0.76, 0.95), r.uniform(0, y)))

    if r.random() < 0.5:
        y += 0.04
        out.append(linha(r.choice(["Observação", f'Observação "{evento}"', f"Observacao {errar(r, evento, 0.5)}"]),
                         0.04, y))
        y += 0.06
        if r.random() < 0.6:
            out.append(linha(f"O evento {errar(r, evento, 0.3)} deve disparar no", 0.04, y))
            out.append(linha("momento da interação com elementos da tela.", 0.04, y + 0.03))
            y += 0.08
        for alvo in r.sample(["component", "detail", "flow_name", "order_status", "screen_name"], r.randint(1, 2)):
            frase = f"Preenchimento de [{r.choice(['elemento', 'label do botao', 'situacao'])}] no parâmetro {errar(r, alvo, 0.2)}:"
            if r.random() < 0.3:
                corte = frase.index("parâmetro")
                out.append(linha(frase[:corte].strip(), 0.04, y))
                out.append(linha(frase[corte:], 0.04, y + 0.03))
                y += 0.03
            else:
                out.append(linha(frase, 0.04, y))
            y += 0.05
            for v in r.sample(CLIQUES + ["button", "modal", f"demo-{fluxos[0]}", "aprovado"], r.randint(1, 4)):
                out.append(linha(r.choice(["• ", "· ", "- ", "* ", "", "•"]) + errar(r, v, 0.3), r.uniform(0.04, 0.07), y))
                y += 0.04
    if r.random() < 0.3:
        r.shuffle(out)
    return out


def sorteados() -> dict[str, dict]:
    r = random.Random(SEMENTE)
    casos = {}
    for n in range(1, 25):
        fluxos = r.choice(FLUXOS)
        prints = []
        nomes = [f"Captura {r.randint(10, 99)}.{r.randint(10, 59)}.png" for _ in range(r.randint(2, 9))]
        for nome in dict.fromkeys(nomes):
            prints.append({"file": nome, "lines": card_sorteado(r, fluxos)})
        casos[f"sorteio-{n:02d}"] = {
            "projeto": r.choice(["", "DemoApp", "Demo Ação & Reação", " demo "]),
            "pasta": f"demo-{n:02d}",
            "plataforma": r.choice(["android", "ios"]),
            "prints": prints,
        }
    return casos


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    for antigo in SAIDA.glob("*.json"):
        antigo.unlink()
    casos = {**manuais(), **sorteados()}
    for nome, caso in casos.items():
        (SAIDA / f"{nome}.json").write_text(json.dumps(caso, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(len(c["prints"]) for c in casos.values())
    print(f"corpus de prints: {len(casos)} casos, {total} prints em {SAIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
