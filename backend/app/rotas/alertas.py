"""Alertas de recorrência do recorte ativo.

A regra vive em `app/alertas.py`; aqui só entram permissão, recorte, filtro de
tipo e paginação. Quem não tem `dados:identificados` recebe o alerta
individual sem a pessoa — o RH precisa saber que há recorrência no setor, não
de quem ela é.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app import alertas as regra_alertas
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import Alerta, RegrasAlerta
from app.models import Usuario
from app.paginacao import Pagina, Paginacao, paginacao
from app.rbac_gerado import pode
from app.recorte import Recorte, colaboradores, recorte

roteador = APIRouter(tags=["alertas"])


@roteador.get("/alertas/regras", response_model=RegrasAlerta)
def obter_regras(usuario: Usuario = requer("alertas:ver")) -> RegrasAlerta:
    """Os limiares em vigor, para a tela explicar a regra sem recopiá-la."""
    return RegrasAlerta.model_validate(regra_alertas.REGRAS, from_attributes=True)


@roteador.get("/alertas", response_model=Pagina[Alerta])
def listar_alertas(
    tipo: Literal["todos", "individuais", "coletivos"] = Query("todos"),
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    r: Recorte = Depends(recorte),
    p: Paginacao = Depends(paginacao),
    usuario: Usuario = requer("alertas:ver"),
) -> Pagina[Alerta]:
    """Lista ordenada por severidade.

    A paginação corta a lista já ordenada em vez de ir ao banco com OFFSET: o
    `HAVING` da regra reduz milhares de queixas a algumas dezenas de alertas
    antes de qualquer coisa chegar aqui, e ordenar por severidade exige a
    lista inteira de qualquer forma.
    """
    identificar = pode(usuario.role, "dados:identificados")
    lista = regra_alertas.listar(consulta, colaboradores(consulta, r), identificar=identificar)
    if tipo == "individuais":
        lista = [a for a in lista if a.kind == "individual"]
    elif tipo == "coletivos":
        lista = [a for a in lista if a.kind == "coletivo"]
    return Pagina.montar(lista[p.offset : p.offset + p.limit], len(lista), p)
