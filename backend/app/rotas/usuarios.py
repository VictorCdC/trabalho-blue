"""Administração de acessos da empresa ativa."""

from __future__ import annotations

from collections.abc import Sequence

from fastapi import APIRouter, Depends, Request

from app import auditoria
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import UsuarioListado
from app.models import Usuario

roteador = APIRouter(tags=["usuarios"])


@roteador.get("/usuarios", response_model=list[UsuarioListado])
def listar_usuarios(
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("usuarios:gerenciar"),
) -> Sequence[Usuario]:
    """Lista cadastral do tenant ativo — nunca de outro, nunca dado clínico."""
    encontrados = consulta.listar(Usuario)
    auditoria.registrar(
        consulta.sessao,
        acao="usuarios:listar",
        recurso="usuario",
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        requisicao=requisicao,
    )
    consulta.sessao.commit()
    return encontrados
