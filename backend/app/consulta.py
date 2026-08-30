"""Única porta de leitura das tabelas multi-tenant.

Um `WHERE empresa_id` esquecido num handler vaza dado entre empresas
clientes, e revisão de código não pega isso de forma confiável. Por isso os
handlers não montam select(Modelo) à mão: pedem a consulta já escopada.
O teste tests/test_escopo_tenant.py falha se algum handler burlar isto.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

from fastapi import Depends
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.autorizacao import empresa_ativa
from app.db import Base, obter_sessao

M = TypeVar("M", bound=Base)


class ConsultaEscopada:
    def __init__(self, sessao: Session, empresa_id: str) -> None:
        self.sessao = sessao
        self.empresa_id = empresa_id

    def selecionar(self, modelo: type[M]) -> Select[tuple[M]]:
        coluna = getattr(modelo, "empresa_id", None)
        if coluna is None:
            raise TypeError(f"{modelo.__name__} nao e multi-tenant: use a sessao diretamente")
        return select(modelo).where(coluna == self.empresa_id)

    def listar(self, modelo: type[M]) -> Sequence[M]:
        return self.sessao.scalars(self.selecionar(modelo)).all()


def consulta_escopada(
    sessao: Session = Depends(obter_sessao),
    empresa_id: str = Depends(empresa_ativa),
) -> ConsultaEscopada:
    return ConsultaEscopada(sessao, empresa_id)
