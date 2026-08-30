"""Base dos testes.

Roda contra Postgres de verdade, não SQLite: metade do que estamos testando
(trigger de auditoria, tipos com timezone, constraints) não existe no SQLite.

    docker compose up -d db     # basta o banco
    pytest

O banco de teste é criado sozinho se não existir.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

URL_TESTE = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg2://blue:blue@localhost:5433/blue_teste"
)

os.environ["DATABASE_URL"] = URL_TESTE
os.environ.setdefault("SECRET_KEY", "chave-de-teste-sem-valor-nenhum")
os.environ.setdefault("AMBIENTE", "desenvolvimento")
os.environ.setdefault("LOGIN_MAX_TENTATIVAS", "3")
os.environ.setdefault("LOGIN_BLOQUEIO_MINUTOS", "15")

from alembic.config import Config as ConfigAlembic  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from alembic import command  # noqa: E402
from app.db import obter_sessao  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Empresa, Usuario  # noqa: E402
from app.rbac_gerado import Role  # noqa: E402
from app.seguranca import hash_senha  # noqa: E402

SENHA_PADRAO = "senha-de-teste-123"
TABELAS = ("log_auditoria", "usuario", "empresa")


def _criar_banco_se_faltar() -> None:
    partes = urlsplit(URL_TESTE)
    nome = partes.path.lstrip("/")
    manutencao = urlunsplit(partes._replace(path="/postgres"))
    engine = create_engine(manutencao, isolation_level="AUTOCOMMIT")
    with engine.connect() as conexao:
        existe = conexao.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :nome"), {"nome": nome}
        ).scalar()
        if not existe:
            conexao.execute(text(f'CREATE DATABASE "{nome}"'))
    engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def banco() -> None:
    """Sobe o schema pelas migrations — o mesmo caminho que a produção usa."""
    _criar_banco_se_faltar()
    raiz = Path(__file__).resolve().parents[1]
    cfg = ConfigAlembic(str(raiz / "alembic.ini"))
    cfg.set_main_option("script_location", str(raiz / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture
def sessao() -> Iterator[Session]:
    gerador = obter_sessao()
    s = next(gerador)
    try:
        yield s
    finally:
        gerador.close()


@pytest.fixture(autouse=True)
def _limpar(banco: None) -> Iterator[None]:
    yield
    from app.db import obter_engine

    with obter_engine().begin() as conexao:
        conexao.execute(text(f"TRUNCATE {', '.join(TABELAS)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def cliente() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def empresa(sessao: Session) -> Empresa:
    e = Empresa(
        nome="Metalurgica Norte",
        cnpj="11222333000181",
        plano="profissional",
        ativa=True,
        colaboradores_contratados=120,
    )
    sessao.add(e)
    sessao.commit()
    return e


@pytest.fixture
def outra_empresa(sessao: Session) -> Empresa:
    e = Empresa(
        nome="Logistica Sul",
        cnpj="44555666000199",
        plano="essencial",
        ativa=True,
        colaboradores_contratados=40,
    )
    sessao.add(e)
    sessao.commit()
    return e


@pytest.fixture
def criar_usuario(sessao: Session):
    """Fábrica: criar_usuario('sesmt', empresa_id=...) devolve o usuário."""
    contador = {"n": 0}

    def criar(
        role: Role,
        *,
        empresa_id: str | None = None,
        senha: str = SENHA_PADRAO,
        ativo: bool = True,
    ) -> Usuario:
        contador["n"] += 1
        u = Usuario(
            empresa_id=empresa_id,
            nome=f"Usuario {role} {contador['n']}",
            cpf=f"{contador['n']:011d}",
            email=None,
            role=role,
            senha_hash=hash_senha(senha),
            ativo=ativo,
            tentativas_falhas=0,
        )
        sessao.add(u)
        sessao.commit()
        return u

    return criar


@pytest.fixture
def autenticar(cliente: TestClient):
    """Faz login de verdade e devolve o cliente com o cookie de sessão."""

    def entrar(usuario: Usuario, senha: str = SENHA_PADRAO) -> TestClient:
        resposta = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": senha})
        assert resposta.status_code == 200, resposta.text
        return cliente

    return entrar
