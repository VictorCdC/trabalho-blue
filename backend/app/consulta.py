"""Única porta de leitura das tabelas multi-tenant.

Um `WHERE empresa_id` esquecido num handler vaza dado entre empresas
clientes, e revisão de código não pega isso de forma confiável. Por isso os
handlers não montam select(Modelo) à mão: pedem a consulta já escopada.
O teste tests/test_escopo_tenant.py falha se algum handler burlar isto.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypeVar

from fastapi import Depends
from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.autorizacao import empresa_ativa
from app.db import Base, obter_sessao

M = TypeVar("M", bound=Base)


class ConsultaEscopada:
    def __init__(self, sessao: Session, empresa_id: str) -> None:
        self.sessao = sessao
        self.empresa_id = empresa_id

    def filtro(self, modelo: type[M]) -> ColumnElement[bool]:
        """Predicado de tenant do modelo.

        Existe para as consultas agregadas (app/indicadores.py, app/alertas.py),
        que somam e agrupam em vez de devolver linhas do modelo e por isso nao
        cabem em `selecionar`. Passar por aqui mantem uma definicao so de "o
        que e o meu tenant".
        """
        coluna: InstrumentedAttribute[str] | None = getattr(modelo, "empresa_id", None)
        if coluna is None:
            raise TypeError(f"{modelo.__name__} nao e multi-tenant: use a sessao diretamente")
        return coluna == self.empresa_id

    def selecionar(self, modelo: type[M]) -> Select[tuple[M]]:
        return select(modelo).where(self.filtro(modelo))

    def listar(self, modelo: type[M]) -> Sequence[M]:
        return self.sessao.scalars(self.selecionar(modelo)).all()

    def obter(self, modelo: type[M], id_: str) -> M | None:
        """Uma linha do tenant pelo id, ou None.

        `sessao.get` acharia a linha de qualquer empresa: quem busca por id
        vindo da URL precisa que "nao e meu" e "nao existe" tenham a mesma
        resposta, senao o 404 vira oraculo de existencia entre tenants.
        """
        coluna_id = modelo.__table__.c["id"]
        return self.sessao.scalars(self.selecionar(modelo).where(coluna_id == id_)).one_or_none()

    def contar(self, consulta: Select[Any]) -> int:
        """Total de linhas de uma consulta, sem limite nem offset."""
        total = self.sessao.scalar(
            select(func.count()).select_from(consulta.order_by(None).subquery())
        )
        return int(total or 0)


def consulta_escopada(
    sessao: Session = Depends(obter_sessao),
    empresa_id: str = Depends(empresa_ativa),
) -> ConsultaEscopada:
    return ConsultaEscopada(sessao, empresa_id)
