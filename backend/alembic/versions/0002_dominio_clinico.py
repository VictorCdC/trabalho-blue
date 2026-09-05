"""dominio clinico: estrutura organizacional, queixa, check-in e caso

Revision ID: 0002_dominio_clinico
Revises: 0001_fundacoes
Create Date: 2026-08-30

Escrita à mão a partir do autogenerate, como manda o CLAUDE.md. O que o
autogenerate errou e foi corrigido aqui:

  - índices compostos (empresa_id, data): ele emitiu um índice por coluna,
    que não serve para a consulta do painel, que filtra pelas duas juntas;
  - a unicidade (colaborador_id, data) do check-in, que ele não deduz;
  - as colunas de lotação em `usuario` saíram como NOT NULL por causa da
    anotação do modelo — aqui são NULL, senão a migration quebra na primeira
    empresa que já tem usuário cadastrado.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_dominio_clinico"
down_revision: str | None = "0001_fundacoes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------ estrutura organizacional ------------------------
    op.create_table(
        "unidade",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.Column("cidade", sa.String(length=120), nullable=False),
        sa.Column("uf", sa.String(length=2), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_unidade_empresa_id"), "unidade", ["empresa_id"], unique=False)

    op.create_table(
        "setor",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("unidade_id", sa.String(length=36), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unidade_id"], ["unidade.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_setor_empresa_id"), "setor", ["empresa_id"], unique=False)
    op.create_index(op.f("ix_setor_unidade_id"), "setor", ["unidade_id"], unique=False)

    op.create_table(
        "cargo",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("setor_id", sa.String(length=36), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["setor_id"], ["setor.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_cargo_empresa_id"), "cargo", ["empresa_id"], unique=False)
    op.create_index(op.f("ix_cargo_setor_id"), "cargo", ["setor_id"], unique=False)

    # ----------------------------- lotação do usuário -------------------------
    # Nulas: a equipe da plataforma não ocupa posto, e o cadastro pode existir
    # antes de a empresa ter desenhado a estrutura.
    op.add_column("usuario", sa.Column("unidade_id", sa.String(length=36), nullable=True))
    op.add_column("usuario", sa.Column("setor_id", sa.String(length=36), nullable=True))
    op.add_column("usuario", sa.Column("cargo_id", sa.String(length=36), nullable=True))
    op.add_column("usuario", sa.Column("nascimento", sa.Date(), nullable=True))
    op.add_column("usuario", sa.Column("admissao_em", sa.Date(), nullable=True))
    op.create_foreign_key(
        "usuario_unidade_id_fkey", "usuario", "unidade", ["unidade_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_foreign_key(
        "usuario_setor_id_fkey", "usuario", "setor", ["setor_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_foreign_key(
        "usuario_cargo_id_fkey", "usuario", "cargo", ["cargo_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_usuario_empresa_setor", "usuario", ["empresa_id", "setor_id"], unique=False)

    # ------------------------------ domínio clínico ---------------------------
    op.create_table(
        "queixa",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("colaborador_id", sa.String(length=36), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("regiao", sa.String(length=20), nullable=False),
        sa.Column("lado", sa.String(length=10), nullable=False),
        sa.Column("intensidade", sa.SmallInteger(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("inicio", sa.String(length=20), nullable=False),
        sa.Column("agrava", sa.String(length=30), nullable=False),
        sa.Column("relacao_trabalho", sa.String(length=10), nullable=False),
        sa.Column("observacao", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["colaborador_id"], ["usuario.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_queixa_empresa_data", "queixa", ["empresa_id", "data"], unique=False)
    op.create_index(
        "ix_queixa_colaborador_data", "queixa", ["colaborador_id", "data"], unique=False
    )

    op.create_table(
        "checkin",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("colaborador_id", sa.String(length=36), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(length=12), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["colaborador_id"], ["usuario.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("colaborador_id", "data", name="uq_checkin_colaborador_dia"),
    )
    op.create_index("ix_checkin_empresa_data", "checkin", ["empresa_id", "data"], unique=False)

    op.create_table(
        "caso",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("alerta_id", sa.String(length=120), nullable=False),
        sa.Column("origem", sa.String(length=12), nullable=False),
        sa.Column("regiao", sa.String(length=20), nullable=False),
        sa.Column("lado", sa.String(length=10), nullable=False),
        sa.Column("colaborador_id", sa.String(length=36), nullable=True),
        sa.Column("setor_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("severidade", sa.String(length=10), nullable=False),
        sa.Column("responsavel_id", sa.String(length=36), nullable=False),
        sa.Column("aberto_em", sa.Date(), nullable=False),
        sa.Column("atualizado_em", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["colaborador_id"], ["usuario.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["setor_id"], ["setor.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["responsavel_id"], ["usuario.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "numero", name="uq_caso_numero_por_empresa"),
        sa.UniqueConstraint("empresa_id", "alerta_id", name="uq_caso_alerta_por_empresa"),
    )
    op.create_index("ix_caso_empresa_status", "caso", ["empresa_id", "status"], unique=False)

    op.create_table(
        "acao_caso",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=False),
        sa.Column("caso_id", sa.String(length=36), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("autor_id", sa.String(length=36), nullable=False),
        sa.Column("concluida", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["caso_id"], ["caso.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["autor_id"], ["usuario.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_acao_caso_caso_data", "acao_caso", ["caso_id", "data"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_acao_caso_caso_data", table_name="acao_caso")
    op.drop_table("acao_caso")
    op.drop_index("ix_caso_empresa_status", table_name="caso")
    op.drop_table("caso")
    op.drop_index("ix_checkin_empresa_data", table_name="checkin")
    op.drop_table("checkin")
    op.drop_index("ix_queixa_colaborador_data", table_name="queixa")
    op.drop_index("ix_queixa_empresa_data", table_name="queixa")
    op.drop_table("queixa")

    op.drop_index("ix_usuario_empresa_setor", table_name="usuario")
    op.drop_constraint("usuario_cargo_id_fkey", "usuario", type_="foreignkey")
    op.drop_constraint("usuario_setor_id_fkey", "usuario", type_="foreignkey")
    op.drop_constraint("usuario_unidade_id_fkey", "usuario", type_="foreignkey")
    op.drop_column("usuario", "admissao_em")
    op.drop_column("usuario", "nascimento")
    op.drop_column("usuario", "cargo_id")
    op.drop_column("usuario", "setor_id")
    op.drop_column("usuario", "unidade_id")

    op.drop_index(op.f("ix_cargo_setor_id"), table_name="cargo")
    op.drop_index(op.f("ix_cargo_empresa_id"), table_name="cargo")
    op.drop_table("cargo")
    op.drop_index(op.f("ix_setor_unidade_id"), table_name="setor")
    op.drop_index(op.f("ix_setor_empresa_id"), table_name="setor")
    op.drop_table("setor")
    op.drop_index(op.f("ix_unidade_empresa_id"), table_name="unidade")
    op.drop_table("unidade")
