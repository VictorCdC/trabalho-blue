"""Empresas clientes. Área da plataforma, fora do escopo de tenant."""

from __future__ import annotations

from collections.abc import Sequence

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.autorizacao import requer
from app.db import obter_sessao
from app.esquemas import EmpresaPublica
from app.models import Empresa, Usuario

roteador = APIRouter(tags=["empresas"])


@roteador.get("/empresas", response_model=list[EmpresaPublica])
def listar_empresas(
    sessao: Session = Depends(obter_sessao),
    usuario: Usuario = requer("empresas:gerenciar"),
) -> Sequence[Empresa]:
    """Empresa não é tabela multi-tenant: é a própria lista de tenants."""
    return sessao.scalars(select(Empresa).order_by(Empresa.nome)).all()
