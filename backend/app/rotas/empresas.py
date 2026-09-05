"""Empresas clientes. Área da plataforma, fora do escopo de tenant.

Os números de cada cartão (colaboradores, queixas em 30 dias, casos abertos)
são contagens agregadas: a equipe da plataforma administra tenants e não lê
queixa identificada — ver `_privacidade` em rbac/permissoes.json.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import auditoria
from app.autorizacao import requer
from app.db import obter_sessao
from app.esquemas import (
    EmpresaEntrada,
    EmpresaPatch,
    EmpresaPublica,
    ResumoEmpresa,
)
from app.models import Caso, Empresa, Queixa, Usuario
from app.periodo import hoje

roteador = APIRouter(tags=["empresas"])


@roteador.get("/empresas", response_model=list[ResumoEmpresa])
def listar_empresas(
    sessao: Session = Depends(obter_sessao),
    usuario: Usuario = requer("empresas:gerenciar"),
) -> list[ResumoEmpresa]:
    """Empresa não é tabela multi-tenant: é a própria lista de tenants."""
    empresas = sessao.scalars(select(Empresa).order_by(Empresa.nome)).all()

    colaboradores: dict[str | None, int] = {
        linha[0]: linha[1]
        for linha in sessao.execute(
            select(Usuario.empresa_id, func.count())
            .where(Usuario.role == "colaborador", Usuario.ativo.is_(True))
            .group_by(Usuario.empresa_id)
        ).all()
    }
    corte = hoje() - timedelta(days=29)
    queixas: dict[str, int] = {
        linha[0]: linha[1]
        for linha in sessao.execute(
            select(Queixa.empresa_id, func.count())
            .where(Queixa.data >= corte)
            .group_by(Queixa.empresa_id)
        ).all()
    }
    casos: dict[str, int] = {
        linha[0]: linha[1]
        for linha in sessao.execute(
            select(Caso.empresa_id, func.count())
            .where(Caso.status != "resolvido")
            .group_by(Caso.empresa_id)
        ).all()
    }

    return [
        ResumoEmpresa(
            empresa=EmpresaPublica.model_validate(empresa),
            colaboradores=colaboradores.get(empresa.id, 0),
            queixas_30_dias=queixas.get(empresa.id, 0),
            casos_abertos=casos.get(empresa.id, 0),
        )
        for empresa in empresas
    ]


@roteador.post("/empresas", response_model=EmpresaPublica, status_code=status.HTTP_201_CREATED)
def criar_empresa(
    entrada: EmpresaEntrada,
    requisicao: Request,
    sessao: Session = Depends(obter_sessao),
    usuario: Usuario = requer("empresas:gerenciar"),
) -> Empresa:
    empresa = Empresa(
        nome=entrada.nome,
        cnpj=entrada.cnpj,
        plano=entrada.plano,
        # nasce inativa: quem libera o acesso e uma decisao comercial, nao um POST
        ativa=False,
        colaboradores_contratados=entrada.colaboradores_contratados,
    )
    sessao.add(empresa)
    auditoria.registrar(
        sessao,
        acao="empresa:criar",
        recurso="empresa",
        recurso_id=empresa.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=empresa.id,
        requisicao=requisicao,
    )
    try:
        sessao.commit()
    except IntegrityError as erro:
        sessao.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ja existe uma empresa com este CNPJ."
        ) from erro
    return empresa


@roteador.patch("/empresas/{empresa_id}", response_model=EmpresaPublica)
def atualizar_empresa(
    empresa_id: str,
    patch: EmpresaPatch,
    requisicao: Request,
    sessao: Session = Depends(obter_sessao),
    usuario: Usuario = requer("empresas:gerenciar"),
) -> Empresa:
    empresa = sessao.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa nao encontrada")

    campos = patch.model_dump(exclude_unset=True)
    for campo, valor in campos.items():
        setattr(empresa, campo, valor)

    auditoria.registrar(
        sessao,
        acao="empresa:alterar",
        recurso="empresa",
        recurso_id=empresa.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=empresa.id,
        detalhe=", ".join(sorted(campos)),
        requisicao=requisicao,
    )
    sessao.commit()
    return empresa
