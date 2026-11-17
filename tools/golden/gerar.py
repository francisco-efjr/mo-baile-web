#!/usr/bin/env python3
"""Gabarito de paridade: roda o motor Python do Mo baile sobre o corpus sintético.

Uso (a partir da raiz do repositório):

    PYTHONPATH=<mo-baile>/engine/src python3 tools/golden/gerar.py

Para cada caso de `test/corpus/<caso>/` (spec.json, log.txt ou log.json e
meta.json) grava em `test/golden/`:

- `<caso>.json`: o `report.audit` no formato web (sem caminho de disco: `name`
  e `log_name` no lugar dos caminhos, sem `prints_dir` nem `print_path`), ou
  `{"error": {...}}` com a etapa e a mensagem quando a entrada é recusada;
- `<caso>.html`: o relatório HTML com instante e versão fixos, com os ativos
  fixos (CSS, JS, ícone) trocados por marcadores para o gabarito ficar pequeno;
- `<caso>.analytics.json`: a leitura da aba Analytics (logcat salvo).

Também grava `_unidades.json` (respostas do Python para as entradas de
`tools/golden/unidades.json`: float, JSON, regex, textwrap...) e `_ativos.json`
(sha256 dos ativos do relatório do Mo baile, para provar que os do site são
os mesmos).

O caminho segue o da versão web do Mo baile (`mobaile.web`): o texto passa por
`decode_text` (BOM manda), a spec perde os prints (`WebReportService`) e log
sem eventos é recusado antes da auditoria.
"""

from __future__ import annotations

import dataclasses
import datetime
import difflib
import hashlib
import json
import re
import sys
import tempfile
import textwrap
from pathlib import Path

from mobaile.domain.errors import EngineError, InvalidInputError
from mobaile.domain.report import PLATFORMS, OcrLine
from mobaile.security import safe_file_stem
from mobaile.services.report import html_report
from mobaile.services.report.card_reader import build_spec, read_card, review_markdown
from mobaile.services.report.checklist import checklist_markdown
from mobaile.services.report.firebase_log import events_from_items, items_from_text
from mobaile.services.report.service import export_info, html_file_name
from mobaile.web.handlers import WebReportService, analytics_tsv
from mobaile.web.sandbox import decode_text

RAIZ = Path(__file__).resolve().parents[2]
CORPUS = RAIZ / "test" / "corpus"
CORPUS_PRINTS = RAIZ / "test" / "corpus-prints"
GOLDEN = RAIZ / "test" / "golden"
UNIDADES = Path(__file__).with_name("unidades.json")

# Instante e versão fixos: o HTML depende dos dois.
INSTANTE = datetime.datetime(2026, 11, 16, 9, 30)
VERSAO = "0.0.0-paridade"
ATIVOS_TEXTO = ("design_system.css", "report.css", "motion.min.js", "report.js")


def gravar(caminho: Path, texto: str) -> None:
    caminho.write_text(texto, encoding="utf-8", newline="")


def dump(valor: object) -> str:
    return json.dumps(valor, ensure_ascii=False, indent=2) + "\n"


def marcadores() -> list[tuple[str, str]]:
    """(conteúdo, marcador) dos ativos fixos do HTML."""
    pares = [(html_report._text_asset(nome), f"@@ATIVO:{nome}@@") for nome in ATIVOS_TEXTO]
    pares.append((html_report._icon_data_uri(), "@@ATIVO:icon.png@@"))
    return pares


def compactar(html: str) -> str:
    for conteudo, marcador in marcadores():
        if conteudo not in html:
            raise SystemExit(f"ativo {marcador} não está no HTML")
        html = html.replace(conteudo, marcador)
    return html


def normalizar(payload: dict) -> dict:
    """`report.audit` no formato web: nomes no lugar de caminhos, sem prints."""
    spec = {("name" if k == "path" else k): (Path(v).name if k == "path" else v)
            for k, v in payload["spec"].items() if k not in ("prints_dir", "prints_dir_exists")}
    saida = {}
    for chave, valor in payload.items():
        if chave == "spec":
            saida["spec"] = spec
        elif chave == "log_path":
            saida["log_name"] = Path(valor).name
        elif chave == "results":
            saida["results"] = [{k: v for k, v in r.items() if k != "print_path"} for r in valor]
        else:
            saida[chave] = valor
    return saida


def erro(etapa: str, exc: EngineError) -> dict:
    return {"error": {"stage": etapa, "code": exc.code, "message": exc.message}}


def caso(pasta: Path) -> None:
    nome = pasta.name
    meta = json.loads((pasta / "meta.json").read_text(encoding="utf-8"))
    logs = [p for p in (pasta / "log.txt", pasta / "log.json") if p.exists()]
    with tempfile.TemporaryDirectory(prefix="mobaile-paridade-") as tmp:
        tmpdir = Path(tmp)
        servico = WebReportService(ocr=None, documents_dir=tmpdir)
        resultado: dict
        log_texto = decode_text(logs[0].read_bytes(), label="log", strict=False) if logs else None
        try:
            spec_texto = decode_text((pasta / "spec.json").read_bytes(), label="spec", strict=True)
            spec_path = tmpdir / "spec.json"
            gravar(spec_path, spec_texto)
            servico.spec(str(spec_path))
        except EngineError as exc:
            resultado = erro("spec", exc)
        else:
            try:
                log_path = tmpdir / logs[0].name
                gravar(log_path, log_texto or "")
                items, log_path = servico.read_log(str(log_path))
                if not items:
                    raise InvalidInputError(f"O log {log_path.name} não tem eventos do Firebase Analytics.")
            except EngineError as exc:
                resultado = erro("log", exc)
            else:
                plataforma = meta.get("platform")
                try:
                    if plataforma is not None and plataforma not in PLATFORMS:
                        raise InvalidInputError("platform precisa ser android ou ios.")
                    payload = servico.audit(str(spec_path), items, source="file", log_path=log_path, platform=plataforma)
                except EngineError as exc:
                    resultado = erro("audit", exc)
                except Exception:  # noqa: BLE001 - igual à versão web: sem trace, "Erro interno no motor."
                    resultado = {"error": {"stage": "audit", "code": "internal_error", "message": "Erro interno no motor."}}
                else:
                    resultado = normalizar(payload)
                    relatorio = servico._last[0]
                    html = html_report.generate_interactive_html(
                        relatorio, None, generated_at=INSTANTE, info=export_info(meta.get("info")))
                    gravar(GOLDEN / f"{nome}.html", compactar(html))
                    resultado_nome = html_file_name(relatorio.spec.projeto, relatorio.platform, INSTANTE)
                    meta_saida = {"html_file_name": resultado_nome}
                    gravar(GOLDEN / f"{nome}.meta.json", dump(meta_saida))
        gravar(GOLDEN / f"{nome}.json", dump(resultado))
        if log_texto is not None:
            events, stats = events_from_items(items_from_text(log_texto), "android")
            eventos = [dataclasses.asdict(e) for e in events]
            analytics = {
                "platform": "android",
                "stats": stats,
                "events": eventos,
                "tsv": analytics_tsv(events),
                "json": json.dumps(eventos, ensure_ascii=False, indent=2),
            }
            gravar(GOLDEN / f"{nome}.analytics.json", dump(analytics))


def unidades() -> None:
    entradas = json.loads(UNIDADES.read_text(encoding="utf-8"))
    saida: dict[str, list] = {}
    saida["float_repr"] = [[s, repr(json.loads(s))] for s in entradas["float_repr"]]
    saida["fixed"] = [[s, d, f"{json.loads(s):.{d}f}"] for s, d in entradas["fixed"]]
    saida["round1"] = [[s, repr(round(json.loads(s), 1))] for s in entradas["round1"]]
    js = []
    for s in entradas["json"]:
        try:
            v = json.loads(s)
            js.append([s, {"ok": json.dumps(v, ensure_ascii=False), "indent": json.dumps(v, ensure_ascii=False, indent=2),
                           "sorted": json.dumps(v, ensure_ascii=False, sort_keys=True)}])
        except json.JSONDecodeError as exc:
            js.append([s, {"msg": exc.msg, "pos": exc.pos, "lineno": exc.lineno, "colno": exc.colno}])
    saida["json"] = js
    saida["str"] = [[s, str(json.loads(s))] for s in entradas["str"]]
    rx = []
    for padrao, texto in entradas["regex"]:
        try:
            compilado = re.compile(padrao)
        except re.error as exc:
            rx.append([padrao, texto, {"erro": str(exc)}])
            continue
        achado = compilado.search(texto)
        rx.append([padrao, texto, {"full": compilado.fullmatch(texto) is not None,
                                   "search": None if achado is None else [achado.group(0), *achado.groups()]}])
    saida["regex"] = rx
    saida["search"] = [[p, t, (lambda m: None if m is None else [m.group(0), *m.groups()])(re.search(p, t))]
                       for p, t in entradas["search"]]
    saida["textwrap"] = [[s, textwrap.wrap(s, width=78, subsequent_indent="//   ")] for s in entradas["textwrap"]]
    saida["strip"] = [[s, s.strip()] for s in entradas["strip"]]
    saida["splitlines"] = [[s, s.splitlines()] for s in entradas["splitlines"]]
    saida["safe_file_stem"] = [[s, safe_file_stem(s, "spec")] for s in
                               ["DemoApp", "DemoApp Café ☕", "  ", "<script>alert(\"x\")</script>", "Ação & Reação!", "x" * 80]]
    saida["close_matches"] = [
        [palavra, opcoes, corte, difflib.get_close_matches(palavra, opcoes, n=1, cutoff=corte),
         [repr(difflib.SequenceMatcher(None, palavra, o).ratio()) for o in opcoes]]
        for palavra, opcoes, corte in entradas["close_matches"]
    ]
    gravar(GOLDEN / "_unidades.json", dump(saida))


def prints() -> int:
    """Importação de prints: leitor de cards, rascunho da spec, revisão e checklist.

    Segue `ReportService.import_prints` depois do OCR: os prints da pasta em
    ordem de nome, um card por print, o nome do projeto (ou o da pasta) e o
    nome do arquivo da spec que vai no checklist.
    """
    casos = sorted(CORPUS_PRINTS.glob("*.json")) if CORPUS_PRINTS.exists() else []
    for arquivo in casos:
        caso = json.loads(arquivo.read_text(encoding="utf-8"))
        pasta = caso["pasta"]
        ordem = sorted(caso["prints"], key=lambda p: p["file"])
        cards = [read_card([OcrLine(**ln) for ln in p["lines"]], f"{pasta}/{p['file']}") for p in ordem]
        nome = (caso["projeto"] or "").strip() or pasta
        spec, review = build_spec(cards, nome, caso["plataforma"], pasta)
        spec_name = f"{safe_file_stem(nome, 'spec')}.json"
        saida = {
            "nome": nome,
            "spec_name": spec_name,
            "cards": [dataclasses.asdict(c) for c in cards],
            "review": review,
            "spec_json": json.dumps(spec, ensure_ascii=False, indent=2) + "\n",
            "review_md": review_markdown(spec, review),
            "checklist_md": checklist_markdown(spec, review, spec_name=spec_name, generated_at=INSTANTE),
        }
        gravar(GOLDEN / f"prints-{arquivo.stem}.json", dump(saida))
    return len(casos)


def ativos() -> None:
    pasta = Path(html_report.ASSETS)
    saida = {nome: hashlib.sha256((pasta / nome).read_bytes()).hexdigest()
             for nome in (*ATIVOS_TEXTO, "icons.json", "icon.png")}
    saida["_head_js"] = hashlib.sha256(html_report._HEAD_JS.encode()).hexdigest()
    saida["_motion_version"] = html_report.MOTION_VERSION
    gravar(GOLDEN / "_ativos.json", dump(saida))


def main() -> None:
    html_report.__version__ = VERSAO
    GOLDEN.mkdir(parents=True, exist_ok=True)
    for antigo in GOLDEN.iterdir():
        antigo.unlink()
    unidades()
    ativos()
    casos = sorted(p for p in CORPUS.iterdir() if p.is_dir()) if CORPUS.exists() else []
    for pasta in casos:
        caso(pasta)
    n_prints = prints()
    print(f"gabarito: {len(casos)} caso(s), {n_prints} pasta(s) de prints e as unidades em {GOLDEN.relative_to(RAIZ)}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
