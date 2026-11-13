"""
Gera tests/fixtures/projecoes-projecao.json com projeções calculadas pelo PRÓPRIO código do
sistema Projeção Financeira (funções `projection_weeks` e `recalculate_projection` de
dev_server.py), para o teste de paridade do motor do Synapse (tests/paridadeProjecao.test.js).

Uso:  python -I scripts/gerarFixtureProjecao.py "C:/caminho/para/Projeção"

Só as funções puras são extraídas do dev_server.py (sem importar o servidor, o banco ou o
reportlab). O calendário é o que o Projeção usa: feriados nacionais da BrasilAPI + 15/08 (PA)
+ feriados personalizados; aqui fica fixo no arquivo para o teste não depender da rede.
"""

import ast
import json
import math
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

FUNCOES = ["business_periods_for_year", "projection_weeks", "projection_money", "recalculate_projection", "format_qqp_decimal"]

# BrasilAPI /api/feriados/v1/{ano} (consultado em 13/11/2026) + Adesão do Pará (15/08).
FERIADOS = {
    2025: "2025-01-01 2025-03-03 2025-03-04 2025-04-18 2025-04-20 2025-04-21 2025-05-01 2025-06-19 2025-09-07 2025-10-12 2025-11-02 2025-11-15 2025-11-20 2025-12-25",
    2026: "2026-01-01 2026-02-16 2026-02-17 2026-04-03 2026-04-05 2026-04-21 2026-05-01 2026-06-04 2026-09-07 2026-10-12 2026-11-02 2026-11-15 2026-11-20 2026-12-25",
    2027: "2027-01-01 2027-02-08 2027-02-09 2027-03-26 2027-03-28 2027-04-21 2027-05-01 2027-05-27 2027-09-07 2027-10-12 2027-11-02 2027-11-15 2027-11-20 2027-12-25",
}
MESES = ("Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro")


def carregar_funcoes(raiz_projecao):
    fonte = (Path(raiz_projecao) / "dev_server.py").read_text(encoding="utf-8")
    arvore = ast.parse(fonte)
    trechos = [ast.get_source_segment(fonte, no) for no in arvore.body if isinstance(no, ast.FunctionDef) and no.name in FUNCOES]
    if len(trechos) != len(FUNCOES):
        raise SystemExit("Não encontrei todas as funções do Projeção em dev_server.py.")
    espaco = {"date": date, "timedelta": timedelta, "Decimal": Decimal, "math": math, "sys": sys}
    exec(compile("\n\n".join(trechos), "dev_server_extraido", "exec"), espaco)  # noqa: S102 - código local do Projeção
    return espaco


def feriados_do_projecao(extras=()):
    datas = set()
    for ano, texto in FERIADOS.items():
        datas.update(texto.split())
        datas.add(f"{ano}-08-15")
    datas.update(extras)
    return datas


def caso(fn, rng, ano, mes, extras=(), itens_qtd=6):
    periodo = fn["business_periods_for_year"](ano)[mes - 1]
    feriados = feriados_do_projecao(extras)
    semanas = fn["projection_weeks"](periodo, feriados)
    qqp = []
    linhas = []
    for n in range(itens_qtd):
        inteiro = rng.choice([1, 95, 1800, 15000, 45000, 123456])
        casas = rng.randint(0, 8)
        preco = Decimal(f"{inteiro}.{rng.randint(0, 10 ** casas - 1):0{casas}d}") if casas else Decimal(inteiro)
        codigo = f"IT-{n + 1:02d}"
        qqp.append((codigo, f"Item {n + 1}", "mês", preco))
        quantidades = {}
        for semana in semanas:
            if rng.random() < 0.25:
                continue
            dias = rng.randint(0, semana["businessDays"])
            pessoas = rng.choice([1, 2, 3, 0.5, 1.25, 2.5, 0.3333, 7])
            quantidades[semana["key"]] = {"days": dias, "people": pessoas}
        linhas.append({"code": codigo, "weeklyQuantities": quantidades})
    projecao = {"code": "1", "referenceMonth": MESES[mes - 1], "referenceYear": ano, "items": linhas}
    resultado = fn["recalculate_projection"](projecao, qqp, periodo, feriados)
    return {
        "referencia": f"{ano}-{mes:02d}",
        "feriados_personalizados": sorted(extras),
        "precos": {codigo: str(preco) for codigo, _, _, preco in qqp},
        "data_json": resultado,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    fn = carregar_funcoes(sys.argv[1])
    rng = random.Random(20261113)
    casos = [
        caso(fn, rng, 2026, 1),  # ciclo atravessa o ano (16/12/2025 a 15/01/2026)
        caso(fn, rng, 2026, 3),  # Carnaval 16 e 17/02 (ciclo 16/02 a 15/03)
        caso(fn, rng, 2026, 6),  # Corpus Christi 04/06
        caso(fn, rng, 2026, 8),  # 15/08 cai no sábado em 2026
        caso(fn, rng, 2026, 9),  # Independência
        caso(fn, rng, 2026, 11),  # Finados
        caso(fn, rng, 2026, 12),  # Consciência Negra 20/11
        caso(fn, rng, 2027, 3),  # Sexta-feira Santa 26/03/2027
        caso(fn, rng, 2026, 10, extras=["2026-09-21", "2026-10-05"]),  # feriados personalizados
        caso(fn, rng, 2027, 2, itens_qtd=12),
    ]
    destino = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "projecoes-projecao.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(casos, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"{len(casos)} casos gravados em {destino}")


if __name__ == "__main__":
    main()
