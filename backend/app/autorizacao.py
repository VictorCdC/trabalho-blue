"""Autenticação e autorização. Toda rota não pública passa por `requer`.

O frontend também esconde o que o perfil não pode ver, mas aquilo é
conveniência de navegação: a decisão vale aqui.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import auditoria
from app.db import obter_sessao
from app.models import Empresa, Usuario
from app.rbac_gerado import Permissao, pode
from app.seguranca import NOME_COOKIE, ler_sessao

#: Como o superuser diz qual tenant está olhando. Ninguém mais escolhe.
CABECALHO_EMPRESA = "X-Empresa-Id"


def _nao_autenticado() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão ausente ou expirada"
    )


def usuario_atual(requisicao: Request, sessao: Session = Depends(obter_sessao)) -> Usuario:
    token = requisicao.cookies.get(NOME_COOKIE)
    if not token:
        raise _nao_autenticado()
    usuario_id = ler_sessao(token)
    if usuario_id is None:
        raise _nao_autenticado()
    usuario = sessao.get(Usuario, usuario_id)
    if usuario is None or not usuario.ativo:
        raise _nao_autenticado()
    return usuario


class GuardaPermissao:
    """Marcador reconhecível: o teste de cobertura varre as rotas atrás dele."""

    def __init__(self, permissao: Permissao) -> None:
        self.permissao = permissao

    def __call__(self, usuario: Usuario = Depends(usuario_atual)) -> Usuario:
        if not pode(usuario.role, self.permissao):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Perfil {usuario.role} nao tem a permissao {self.permissao}",
            )
        return usuario


# devolve Any pelo mesmo motivo que o Depends do FastAPI: o valor entregue ao
# handler é o Usuario, não o marcador de dependência
def requer(permissao: Permissao) -> Any:
    """Use no parametro do handler: usuario: Usuario = requer("casos:ver")."""
    return Depends(GuardaPermissao(permissao))


def empresa_ativa(
    requisicao: Request,
    usuario: Usuario = Depends(usuario_atual),
    sessao: Session = Depends(obter_sessao),
) -> str:
    """Tenant do qual esta requisição pode ler.

    Para quem pertence a uma empresa é sempre a própria — o cabeçalho é
    ignorado de propósito, senão qualquer usuário trocaria de tenant.
    """
    if usuario.empresa_id is not None:
        return usuario.empresa_id

    pedida = requisicao.headers.get(CABECALHO_EMPRESA)
    if not pedida:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Informe o cabecalho {CABECALHO_EMPRESA}: sua conta nao pertence a uma empresa",
        )
    empresa = sessao.get(Empresa, pedida)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa nao encontrada")

    # acesso da plataforma ao dado de um cliente é sempre auditado
    auditoria.registrar(
        sessao,
        acao="tenant:abrir",
        recurso="empresa",
        recurso_id=empresa.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=empresa.id,
        requisicao=requisicao,
    )
    sessao.commit()
    return empresa.id
