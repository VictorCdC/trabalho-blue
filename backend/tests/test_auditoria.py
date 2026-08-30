"""Trilha de auditoria: grava o que precisa e não deixa reescrever."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DatabaseError

from app.autorizacao import CABECALHO_EMPRESA
from app.models import LogAuditoria
from tests.conftest import SENHA_PADRAO


def acoes(sessao) -> list[str]:
    return list(sessao.scalars(select(LogAuditoria.acao).order_by(LogAuditoria.ocorrido_em)).all())


def test_login_bem_sucedido_e_registrado(cliente, criar_usuario, empresa, sessao) -> None:
    usuario = criar_usuario("sesmt", empresa_id=empresa.id)
    cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})

    registro = sessao.scalars(select(LogAuditoria)).one()
    assert registro.acao == "login:sucesso"
    assert registro.ator_id == usuario.id
    assert registro.empresa_id == empresa.id


def test_login_falho_e_registrado(cliente, criar_usuario, empresa, sessao) -> None:
    usuario = criar_usuario("sesmt", empresa_id=empresa.id)
    cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": "errada-de-proposito"})
    assert acoes(sessao) == ["login:falha"]


def test_plataforma_abrindo_tenant_de_cliente_e_registrado(
    cliente, criar_usuario, empresa, autenticar, sessao
) -> None:
    autenticar(criar_usuario("superuser"))
    cliente.get("/usuarios", headers={CABECALHO_EMPRESA: empresa.id})

    assert "tenant:abrir" in acoes(sessao)
    abertura = sessao.scalars(select(LogAuditoria).where(LogAuditoria.acao == "tenant:abrir")).one()
    assert abertura.empresa_id == empresa.id
    assert abertura.ator_role == "superuser"


def test_leitura_de_lista_cadastral_e_registrada(
    cliente, criar_usuario, empresa, autenticar, sessao
) -> None:
    autenticar(criar_usuario("admin", empresa_id=empresa.id))
    cliente.get("/usuarios")
    assert "usuarios:listar" in acoes(sessao)


def test_banco_recusa_update_no_log(cliente, criar_usuario, empresa, sessao) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})

    with pytest.raises(DatabaseError, match="somente-insercao"):
        sessao.execute(text("UPDATE log_auditoria SET acao = 'maquiado'"))
    sessao.rollback()


def test_banco_recusa_delete_no_log(cliente, criar_usuario, empresa, sessao) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})

    with pytest.raises(DatabaseError, match="somente-insercao"):
        sessao.execute(text("DELETE FROM log_auditoria"))
    sessao.rollback()
    assert sessao.scalar(select(func.count()).select_from(LogAuditoria)) == 1
