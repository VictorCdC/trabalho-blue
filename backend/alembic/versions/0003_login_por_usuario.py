"""login por nome de usuario: coluna usuario, unica no sistema inteiro

Revision ID: 0003_login_por_usuario
Revises: 0002_dominio_clinico
Create Date: 2026-09-05

O login deixou de ser CPF + senha e passou a ser NOME.SOBRENOME + senha. O CPF
continua na tabela, e continua único, mas como cadastro da pessoa — não é mais
credencial.

Escrita à mão a partir do autogenerate, como manda o CLAUDE.md. O que o
autogenerate não faz e foi acrescentado aqui:

  - a coluna entra NULL, é preenchida e só então vira NOT NULL. O
    `ADD COLUMN ... NOT NULL` sem default que ele emite quebra em qualquer
    banco que já tenha usuário cadastrado;
  - o preenchimento deriva o login do nome pela mesma regra da aplicação
    (`seguranca.nome_de_usuario`), copiada para dentro deste arquivo de
    propósito: migration já aplicada não pode mudar de resultado porque a
    regra do código mudou depois;
  - homônimos de primeiro e último nome recebem sufixo numérico, senão a
    unicidade recusaria o próprio preenchimento. Quem for cadastrado daqui
    para frente colide e recebe 409 — a decisão é de quem cadastra.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_login_por_usuario"
down_revision: str | None = "0002_dominio_clinico"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NAO_LETRA = re.compile(r"[^a-z0-9]+")


def _login(nome: str) -> str:
    """Cópia congelada de `app.seguranca.nome_de_usuario`."""
    cru = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    partes = [parte for parte in _NAO_LETRA.split(cru.strip().lower()) if parte]
    if not partes:
        return ""
    return partes[0] if len(partes) == 1 else f"{partes[0]}.{partes[-1]}"


def _preencher(conexao: sa.Connection) -> None:
    linhas = conexao.execute(sa.text("SELECT id, nome FROM usuario ORDER BY criado_em, id")).all()
    usados: set[str] = set()
    for id_usuario, nome in linhas:
        base = _login(nome) or "usuario"
        login = base
        sufixo = 1
        while login in usados:
            sufixo += 1
            login = f"{base}{sufixo}"
        usados.add(login)
        conexao.execute(
            sa.text("UPDATE usuario SET usuario = :login WHERE id = :id"),
            {"login": login, "id": id_usuario},
        )


def upgrade() -> None:
    op.add_column("usuario", sa.Column("usuario", sa.String(length=160), nullable=True))
    _preencher(op.get_bind())
    op.alter_column("usuario", "usuario", nullable=False)
    op.create_unique_constraint("usuario_usuario_key", "usuario", ["usuario"])


def downgrade() -> None:
    op.drop_constraint("usuario_usuario_key", "usuario", type_="unique")
    op.drop_column("usuario", "usuario")
