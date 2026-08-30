"""Escrita da trilha de auditoria.

Chame `registrar` em toda leitura de dado identificado, em toda mudança de
acesso e em todo login. A tabela é somente-inserção (trigger na migration),
então não existe caminho de código para "corrigir" um registro.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import LogAuditoria


def registrar(
    sessao: Session,
    *,
    acao: str,
    recurso: str,
    ator_id: str | None = None,
    ator_role: str | None = None,
    empresa_id: str | None = None,
    recurso_id: str | None = None,
    finalidade: str | None = None,
    detalhe: str | None = None,
    requisicao: Request | None = None,
) -> None:
    """Enfileira um registro na sessão. Quem chama decide quando commitar."""
    ip = None
    user_agent = None
    if requisicao is not None:
        ip = requisicao.client.host if requisicao.client else None
        user_agent = (requisicao.headers.get("user-agent") or "")[:255] or None

    sessao.add(
        LogAuditoria(
            acao=acao,
            recurso=recurso,
            ator_id=ator_id,
            ator_role=ator_role,
            empresa_id=empresa_id,
            recurso_id=recurso_id,
            finalidade=finalidade,
            detalhe=detalhe,
            ip=ip,
            user_agent=user_agent,
        )
    )
