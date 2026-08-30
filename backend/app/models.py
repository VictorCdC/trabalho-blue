"""Tabelas das fundações: tenant, identidade e trilha de auditoria.

O domínio clínico (queixa, check-in, caso, estrutura organizacional) entra
junto com os endpoints que o expõem — não faz sentido criar tabela de dado
sensível antes de existir a regra de quem pode lê-la.

Toda tabela multi-tenant tem `empresa_id` e só deve ser lida pela
ConsultaEscopada (app/consulta.py).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.rbac_gerado import Role


def novo_id() -> str:
    return str(uuid4())


class Empresa(Base):
    """Tenant. A tabela de empresas é da plataforma, não de nenhuma empresa."""

    __tablename__ = "empresa"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    nome: Mapped[str] = mapped_column(String(160))
    cnpj: Mapped[str] = mapped_column(String(14), unique=True)
    plano: Mapped[str] = mapped_column(String(20))
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    colaboradores_contratados: Mapped[int] = mapped_column(Integer, default=0)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Usuario(Base):
    """Pessoa que faz login.

    `cpf` é único no sistema inteiro, e não por empresa, porque o login é só
    CPF + senha: sem isso a mesma credencial resolveria para dois tenants.
    Se um dia a mesma pessoa precisar de conta em duas empresas, isto vira
    (empresa_id, cpf) único e o login ganha um seletor de empresa.
    """

    __tablename__ = "usuario"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    #: nulo = equipe da plataforma (superuser), que não pertence a tenant algum
    empresa_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str] = mapped_column(String(160))
    cpf: Mapped[str] = mapped_column(String(11), unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(String(20))
    senha_hash: Mapped[str] = mapped_column(String(255))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # controle de força bruta no login (CPF é enumerável, não é segredo)
    tentativas_falhas: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogAuditoria(Base):
    """Quem fez o quê, quando. Somente inserção.

    A migration instala um trigger que recusa UPDATE e DELETE nesta tabela:
    trilha que a aplicação pode reescrever não é trilha.

    Toda leitura de dado clínico identificado precisa passar por aqui — é o
    que a LGPD chama de accountability (art. 6º, X).
    """

    __tablename__ = "log_auditoria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    #: nulo quando nem houve autenticação (tentativa de login com CPF inexistente)
    ator_id: Mapped[str | None] = mapped_column(String(36), index=True)
    ator_role: Mapped[str | None] = mapped_column(String(20))
    #: tenant cujo dado foi tocado
    empresa_id: Mapped[str | None] = mapped_column(String(36), index=True)
    acao: Mapped[str] = mapped_column(String(60), index=True)
    recurso: Mapped[str] = mapped_column(String(60))
    recurso_id: Mapped[str | None] = mapped_column(String(36))
    #: por que o dado foi acessado — exigido para leitura de dado identificado
    finalidade: Mapped[str | None] = mapped_column(String(120))
    detalhe: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
