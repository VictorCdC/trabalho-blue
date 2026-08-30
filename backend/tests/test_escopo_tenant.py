"""Handler nenhum monta consulta multi-tenant à mão.

Revisão de código não pega `WHERE empresa_id` esquecido de forma confiável.
Este teste lê o AST de app/rotas e falha se algum módulo chamar select() num
modelo multi-tenant em vez de pedir a ConsultaEscopada.
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.db import Base

ROTAS = Path(__file__).resolve().parents[1] / "app" / "rotas"

#: O login acontece antes de existir tenant: ele procura o usuário pelo CPF
#: no sistema inteiro, e é o único lugar onde isso é legítimo.
MODULOS_LIBERADOS = {"auth.py"}


def modelos_multitenant() -> set[str]:
    return {
        mapeador.class_.__name__
        for mapeador in Base.registry.mappers
        if "empresa_id" in mapeador.class_.__table__.columns
    }


def test_ha_modelo_multitenant_para_vigiar() -> None:
    # se o conjunto ficar vazio, o teste abaixo passa sem olhar nada
    assert "Usuario" in modelos_multitenant()


def test_nenhum_handler_consulta_modelo_multitenant_direto() -> None:
    vigiados = modelos_multitenant()
    infracoes: list[str] = []

    for arquivo in sorted(ROTAS.glob("*.py")):
        if arquivo.name in MODULOS_LIBERADOS:
            continue
        arvore = ast.parse(arquivo.read_text(encoding="utf-8"), filename=str(arquivo))
        for no in ast.walk(arvore):
            if not isinstance(no, ast.Call):
                continue
            nome = no.func.id if isinstance(no.func, ast.Name) else None
            if nome != "select":
                continue
            for argumento in no.args:
                if isinstance(argumento, ast.Name) and argumento.id in vigiados:
                    infracoes.append(f"{arquivo.name}:{no.lineno} select({argumento.id})")

    assert not infracoes, (
        f"consulta multi-tenant fora da ConsultaEscopada: {infracoes}. "
        "Use consulta.selecionar(Modelo) — ou libere o módulo em MODULOS_LIBERADOS "
        "com a justificativa."
    )
