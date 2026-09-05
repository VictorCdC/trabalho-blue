"""Unidades, setores e cargos da empresa ativa.

Leitura exige só `painel:ver`: sem a estrutura não há como desenhar os filtros
nem trocar id por nome em tela alguma. Escrita exige `estrutura:gerenciar`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from app import auditoria
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import (
    CargoEntrada,
    CargoPublico,
    EmpresaPublica,
    Estrutura,
    SetorEntrada,
    SetorPublico,
    UnidadeEntrada,
    UnidadePublica,
)
from app.models import Cargo, Empresa, Setor, Unidade, Usuario

roteador = APIRouter(tags=["estrutura"])


@roteador.get("/estrutura", response_model=Estrutura)
def obter_estrutura(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("painel:ver"),
) -> Estrutura:
    """O contexto do tenant — dezenas de linhas, não milhares."""
    empresa = consulta.sessao.get(Empresa, consulta.empresa_id)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa nao encontrada")
    efetivo = consulta.sessao.scalar(
        select(func.count()).where(
            consulta.filtro(Usuario), Usuario.role == "colaborador", Usuario.ativo.is_(True)
        )
    )
    por_unidade = _efetivo_por(consulta, Usuario.unidade_id)
    por_setor = _efetivo_por(consulta, Usuario.setor_id)

    unidades: list[UnidadePublica] = []
    for u in consulta.listar(Unidade):
        unidade = UnidadePublica.model_validate(u)
        unidade.colaboradores = por_unidade.get(u.id, 0)
        unidades.append(unidade)

    setores: list[SetorPublico] = []
    for s in consulta.listar(Setor):
        setor = SetorPublico.model_validate(s)
        setor.colaboradores = por_setor.get(s.id, 0)
        setores.append(setor)

    return Estrutura(
        empresa=EmpresaPublica.model_validate(empresa),
        colaboradores=int(efetivo or 0),
        unidades=unidades,
        setores=setores,
        cargos=[CargoPublico.model_validate(c) for c in consulta.listar(Cargo)],
    )


def _efetivo_por(consulta: ConsultaEscopada, coluna: Any) -> dict[str, int]:
    return {
        linha[0]: int(linha[1])
        for linha in consulta.sessao.execute(
            select(coluna, func.count())
            .where(
                consulta.filtro(Usuario),
                Usuario.role == "colaborador",
                Usuario.ativo.is_(True),
                coluna.is_not(None),
            )
            .group_by(coluna)
        ).all()
    }


@roteador.post("/unidades", response_model=UnidadePublica, status_code=status.HTTP_201_CREATED)
def criar_unidade(
    entrada: UnidadeEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("estrutura:gerenciar"),
) -> Unidade:
    unidade = Unidade(
        empresa_id=consulta.empresa_id,
        nome=entrada.nome,
        cidade=entrada.cidade,
        uf=entrada.uf.upper(),
    )
    consulta.sessao.add(unidade)
    consulta.sessao.commit()
    return unidade


@roteador.post("/setores", response_model=SetorPublico, status_code=status.HTTP_201_CREATED)
def criar_setor(
    entrada: SetorEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("estrutura:gerenciar"),
) -> Setor:
    if consulta.obter(Unidade, entrada.unidade_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidade nao encontrada")
    setor = Setor(empresa_id=consulta.empresa_id, unidade_id=entrada.unidade_id, nome=entrada.nome)
    consulta.sessao.add(setor)
    consulta.sessao.commit()
    return setor


@roteador.post("/cargos", response_model=CargoPublico, status_code=status.HTTP_201_CREATED)
def criar_cargo(
    entrada: CargoEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("estrutura:gerenciar"),
) -> Cargo:
    if consulta.obter(Setor, entrada.setor_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setor nao encontrado")
    cargo = Cargo(empresa_id=consulta.empresa_id, setor_id=entrada.setor_id, nome=entrada.nome)
    consulta.sessao.add(cargo)
    consulta.sessao.commit()
    return cargo


@roteador.delete("/cargos/{cargo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_cargo(
    cargo_id: str,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("estrutura:gerenciar"),
) -> None:
    cargo = consulta.obter(Cargo, cargo_id)
    if cargo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo nao encontrado")
    em_uso = consulta.sessao.scalars(
        consulta.selecionar(Usuario).where(Usuario.cargo_id == cargo_id).limit(1)
    ).first()
    if em_uso is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cargo em uso por colaboradores."
        )
    consulta.sessao.delete(cargo)
    auditoria.registrar(
        consulta.sessao,
        acao="estrutura:remover",
        recurso="cargo",
        recurso_id=cargo_id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        requisicao=requisicao,
    )
    consulta.sessao.commit()


@roteador.delete("/setores/{setor_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_setor(
    setor_id: str,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("estrutura:gerenciar"),
) -> None:
    setor = consulta.obter(Setor, setor_id)
    if setor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setor nao encontrado")
    em_uso = consulta.sessao.scalars(
        consulta.selecionar(Usuario).where(Usuario.setor_id == setor_id).limit(1)
    ).first()
    if em_uso is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Setor em uso por colaboradores."
        )
    for cargo in consulta.sessao.scalars(
        consulta.selecionar(Cargo).where(Cargo.setor_id == setor_id)
    ).all():
        consulta.sessao.delete(cargo)
    consulta.sessao.delete(setor)
    auditoria.registrar(
        consulta.sessao,
        acao="estrutura:remover",
        recurso="setor",
        recurso_id=setor_id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        requisicao=requisicao,
    )
    consulta.sessao.commit()
