"""Paginação física: `LIMIT`/`OFFSET` no banco, não `slice` no navegador.

O tablet do chão de fábrica não tem memória para o histórico inteiro de uma
empresa, e o Postgres não tem motivo para lê-lo. Toda listagem devolve o
envelope `Pagina`, com o `total` que a tela precisa para desenhar o rodapé.

Limite conhecido do OFFSET: a página N custa ler N×limite linhas. Nas
listagens daqui (colaboradores, casos, histórico de uma pessoa) o total é da
ordem de centenas e isso não aparece. Se alguma listagem crescer para
dezenas de milhares, ela troca OFFSET por paginação com cursor — e aí o
envelope ganha um campo em vez de mudar de forma.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query
from pydantic import BaseModel

LIMITE_PADRAO = 50
LIMITE_MAXIMO = 200


@dataclass(frozen=True)
class Paginacao:
    limit: int
    offset: int


def paginacao(
    limit: int = Query(LIMITE_PADRAO, ge=1, le=LIMITE_MAXIMO, description="Itens por página."),
    offset: int = Query(0, ge=0, description="Itens a pular."),
) -> Paginacao:
    """Dependency do FastAPI: `pagina: Paginacao = Depends(paginacao)`."""
    return Paginacao(limit=limit, offset=offset)


class Pagina[T](BaseModel):
    """Envelope de toda listagem. `total` é a contagem sem limite nem offset."""

    itens: list[T]
    total: int
    limit: int
    offset: int

    @classmethod
    def montar(cls, itens: list[T], total: int, p: Paginacao) -> Pagina[T]:
        return cls(itens=itens, total=total, limit=p.limit, offset=p.offset)
