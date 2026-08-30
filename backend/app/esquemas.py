"""Contratos de entrada e saída da API.

Cada esquema devolve o mínimo que a tela precisa. O CPF, por exemplo, sai em
/auth/eu (o próprio dado do usuário) e não na listagem de colegas.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, field_validator

from app.rbac_gerado import Role

SO_DIGITOS = re.compile(r"\D")


class LoginEntrada(BaseModel):
    cpf: str
    senha: str

    @field_validator("cpf")
    @classmethod
    def _normalizar_cpf(cls, valor: str) -> str:
        digitos = SO_DIGITOS.sub("", valor)
        if len(digitos) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return digitos


class UsuarioEu(BaseModel):
    """Dados do próprio usuário autenticado."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    empresa_id: str | None
    nome: str
    cpf: str
    email: str | None
    role: Role


class UsuarioListado(BaseModel):
    """Linha da administração de acessos. Sem CPF: a tela não precisa dele."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    nome: str
    email: str | None
    role: Role
    ativo: bool


class EmpresaPublica(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nome: str
    cnpj: str
    plano: str
    ativa: bool
    colaboradores_contratados: int
