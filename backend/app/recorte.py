"""O recorte de unidade / setor / cargo, resolvido no `WHERE`.

Era um `filter` no navegador em cima do quadro inteiro da empresa
(`frontend/src/lib/filtros.ts`). Aqui vira predicado de consulta, e passa a
valer para todo mundo: nenhuma tela precisa mais receber os colaboradores que
o recorte exclui.

`colaboradores` é a subconsulta que quase toda agregação usa como âncora —
queixa e check-in não têm setor próprio, quem tem lotação é a pessoa.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query
from sqlalchemy import ColumnElement, Select, select

from app.consulta import ConsultaEscopada
from app.models import Usuario


@dataclass(frozen=True)
class Recorte:
    unidade_id: str | None
    setor_id: str | None
    cargo_id: str | None

    @property
    def ativo(self) -> bool:
        return any((self.unidade_id, self.setor_id, self.cargo_id))

    def condicoes(self) -> list[ColumnElement[bool]]:
        condicoes: list[ColumnElement[bool]] = []
        if self.unidade_id:
            condicoes.append(Usuario.unidade_id == self.unidade_id)
        if self.setor_id:
            condicoes.append(Usuario.setor_id == self.setor_id)
        if self.cargo_id:
            condicoes.append(Usuario.cargo_id == self.cargo_id)
        return condicoes


def recorte(
    unidade_id: str | None = Query(None),
    setor_id: str | None = Query(None),
    cargo_id: str | None = Query(None),
) -> Recorte:
    """Dependency do FastAPI: `recorte: Recorte = Depends(recorte)`."""
    return Recorte(unidade_id=unidade_id, setor_id=setor_id, cargo_id=cargo_id)


def colaboradores(consulta: ConsultaEscopada, r: Recorte) -> Select[tuple[str]]:
    """Ids dos colaboradores ativos dentro do recorte.

    Só quem tem o papel `colaborador`: gestor e SESMT aparecem na empresa mas
    não fazem check-in, e contá-los afundaria a adesão sem significar nada.
    """
    return select(Usuario.id).where(
        consulta.filtro(Usuario),
        Usuario.role == "colaborador",
        Usuario.ativo.is_(True),
        *r.condicoes(),
    )
