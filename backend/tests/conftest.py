"""Base dos testes.

Roda contra Postgres de verdade, não SQLite: metade do que estamos testando
(trigger de auditoria, tipos com timezone, constraints) não existe no SQLite.

    pytest      # o Postgres da máquina precisa estar de pé

Qual banco: `TEST_DATABASE_URL`, se definida (é o que a CI faz); senão a
`DATABASE_URL` do `.env` da raiz com o nome do banco trocado por `blue_teste`.
Nunca o banco de desenvolvimento — o `_limpar` daqui dá TRUNCATE em tudo depois
de cada teste. A senha do Postgres local não está no repositório: vem do
`.env`, que é local e ignorado pelo git.

O banco de teste é criado sozinho se não existir.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

BANCO_DE_TESTE = "blue_teste"


def _url_de_teste() -> str:
    """A URL do banco de teste, sem senha no repositório."""
    explicita = os.environ.get("TEST_DATABASE_URL")
    if explicita:
        return explicita

    arquivo = Path(__file__).resolve().parents[2] / ".env"
    if not arquivo.exists():
        raise RuntimeError("defina TEST_DATABASE_URL ou crie o .env da raiz (cp .env.example .env)")
    linha = next(
        (
            bruta
            for bruta in arquivo.read_text(encoding="utf-8").splitlines()
            if bruta.strip().startswith("DATABASE_URL=")
        ),
        None,
    )
    if linha is None:
        raise RuntimeError(f"{arquivo} não define DATABASE_URL")

    partes = urlsplit(linha.split("=", 1)[1].strip().strip('"').strip("'"))
    if partes.path.lstrip("/") == BANCO_DE_TESTE:
        return urlunsplit(partes)
    # troca só o nome do banco: o resto (papel, senha, host, porta) é o mesmo
    return urlunsplit(partes._replace(path=f"/{BANCO_DE_TESTE}"))


URL_TESTE = _url_de_teste()

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
from app.models import (  # noqa: E402
    Cargo,
    CheckIn,
    Empresa,
    Queixa,
    Setor,
    Unidade,
    Usuario,
)
from app.periodo import hoje  # noqa: E402
from app.rbac_gerado import Role  # noqa: E402
from app.seguranca import hash_senha  # noqa: E402

SENHA_PADRAO = "senha-de-teste-123"
TABELAS = (
    "log_auditoria",
    "acao_caso",
    "caso",
    "queixa",
    "checkin",
    "usuario",
    "cargo",
    "setor",
    "unidade",
    "empresa",
)


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
            # login previsível e sem homônimo: o nome de fábrica repetiria
            usuario=f"{role}.{contador['n']}",
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
        resposta = cliente.post("/auth/login", json={"usuario": usuario.usuario, "senha": senha})
        assert resposta.status_code == 200, resposta.text
        return cliente

    return entrar


# ------------------------- domínio clínico nos testes -------------------------


@pytest.fixture
def estrutura(sessao: Session, empresa: Empresa) -> dict[str, str]:
    """Uma unidade, dois setores e dois cargos — o mínimo para filtrar."""
    unidade = Unidade(empresa_id=empresa.id, nome="Matriz", cidade="Fortaleza", uf="CE")
    sessao.add(unidade)
    sessao.flush()
    estoque = Setor(empresa_id=empresa.id, unidade_id=unidade.id, nome="Estoque")
    producao = Setor(empresa_id=empresa.id, unidade_id=unidade.id, nome="Producao")
    sessao.add_all([estoque, producao])
    sessao.flush()
    conferente = Cargo(empresa_id=empresa.id, setor_id=estoque.id, nome="Conferente")
    montador = Cargo(empresa_id=empresa.id, setor_id=producao.id, nome="Montador")
    sessao.add_all([conferente, montador])
    sessao.commit()
    return {
        "unidade": unidade.id,
        "estoque": estoque.id,
        "producao": producao.id,
        "conferente": conferente.id,
        "montador": montador.id,
    }


@pytest.fixture
def criar_colaborador(sessao: Session, empresa: Empresa, estrutura: dict[str, str]):
    """Fábrica de colaborador lotado. Devolve o Usuario já persistido."""
    contador = {"n": 500}

    def criar(nome: str = "", *, setor: str = "estoque", cargo: str = "conferente") -> Usuario:
        contador["n"] += 1
        u = Usuario(
            empresa_id=empresa.id,
            nome=nome or f"Colaborador {contador['n']}",
            usuario=f"colaborador.{contador['n']}",
            cpf=f"{contador['n']:011d}",
            email=None,
            role="colaborador",
            senha_hash=hash_senha(SENHA_PADRAO),
            ativo=True,
            unidade_id=estrutura["unidade"],
            setor_id=estrutura[setor],
            cargo_id=estrutura[cargo],
            tentativas_falhas=0,
        )
        sessao.add(u)
        sessao.commit()
        return u

    return criar


@pytest.fixture
def criar_queixa(sessao: Session, empresa: Empresa):
    """Fábrica de queixa. `atras` é a distância em dias até hoje."""

    def criar(
        colaborador: Usuario,
        *,
        atras: int = 0,
        regiao: str = "lombar",
        lado: str = "na",
        intensidade: int = 3,
        relacao: str = "sim",
    ) -> Queixa:
        q = Queixa(
            empresa_id=empresa.id,
            colaborador_id=colaborador.id,
            data=hoje() - timedelta(days=atras),
            regiao=regiao,
            lado=lado,
            intensidade=intensidade,
            tipo="peso",
            inicio="hoje",
            agrava="levantar_peso",
            relacao_trabalho=relacao,
            observacao="",
        )
        sessao.add(q)
        sessao.commit()
        return q

    return criar


@pytest.fixture
def criar_checkin(sessao: Session, empresa: Empresa):
    def criar(colaborador: Usuario, *, atras: int = 0, estado: str = "bem") -> CheckIn:
        c = CheckIn(
            empresa_id=empresa.id,
            colaborador_id=colaborador.id,
            data=hoje() - timedelta(days=atras),
            estado=estado,
        )
        sessao.add(c)
        sessao.commit()
        return c

    return criar
