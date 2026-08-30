"""Gerado por `python rbac/gerar.py` a partir de rbac/permissoes.json. Não edite.

Decisão de privacidade (LGPD): dado clínico identificado é exclusivo do SESMT. RH e
admin veem apenas agregados; a equipe da plataforma (superuser) administra tenants mas
NÃO lê queixa identificada. Para permitir, acrescente 'dados:identificados' em superuser
— e assuma a consequência.
"""

from __future__ import annotations

from typing import Literal

Permissao = Literal[
    "checkin:registrar",
    "queixa:registrar",
    "queixa:ver_proprias",
    "painel:ver",
    "dados:agregados",
    "dados:identificados",
    "alertas:ver",
    "casos:ver",
    "casos:gerenciar",
    "colaboradores:ver_lista",
    "relatorios:ver",
    "estrutura:gerenciar",
    "usuarios:gerenciar",
    "empresas:gerenciar",
]

Role = Literal[
    "colaborador",
    "rh",
    "sesmt",
    "admin",
    "superuser",
]

PERMISSOES: dict[Role, frozenset[Permissao]] = {
    "colaborador": frozenset({
        "checkin:registrar",
        "queixa:registrar",
        "queixa:ver_proprias",
    }),
    "rh": frozenset({
        "painel:ver",
        "dados:agregados",
        "alertas:ver",
        "relatorios:ver",
    }),
    "sesmt": frozenset({
        "painel:ver",
        "dados:agregados",
        "dados:identificados",
        "alertas:ver",
        "casos:ver",
        "casos:gerenciar",
        "colaboradores:ver_lista",
        "relatorios:ver",
    }),
    "admin": frozenset({
        "painel:ver",
        "dados:agregados",
        "alertas:ver",
        "casos:ver",
        "colaboradores:ver_lista",
        "relatorios:ver",
        "estrutura:gerenciar",
        "usuarios:gerenciar",
    }),
    "superuser": frozenset({
        "painel:ver",
        "dados:agregados",
        "alertas:ver",
        "casos:ver",
        "colaboradores:ver_lista",
        "relatorios:ver",
        "estrutura:gerenciar",
        "usuarios:gerenciar",
        "empresas:gerenciar",
    }),
}


def pode(role: Role, permissao: Permissao) -> bool:
    """Autorização é decidida aqui e em nenhum outro lugar."""
    return permissao in PERMISSOES[role]
