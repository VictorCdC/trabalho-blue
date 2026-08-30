"""fundacoes: tenant, identidade e trilha de auditoria

Revision ID: 0001_fundacoes
Revises:
Create Date: 2026-08-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_fundacoes"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Trilha que a aplicação pode reescrever não é trilha: o banco recusa UPDATE
# e DELETE em log_auditoria. (TRUNCATE não passa por trigger de linha; em
# produção o papel da aplicação também não deve ter esse privilégio.)
TRIGGER_SOMENTE_INSERCAO = """
CREATE OR REPLACE FUNCTION log_auditoria_somente_insercao() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'log_auditoria e somente-insercao (tentativa de %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_auditoria_sem_alteracao
BEFORE UPDATE OR DELETE ON log_auditoria
FOR EACH ROW EXECUTE FUNCTION log_auditoria_somente_insercao();
"""


def upgrade() -> None:
    op.create_table(
        "empresa",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("nome", sa.String(length=160), nullable=False),
        sa.Column("cnpj", sa.String(length=14), nullable=False),
        sa.Column("plano", sa.String(length=20), nullable=False),
        sa.Column("ativa", sa.Boolean(), nullable=False),
        sa.Column("colaboradores_contratados", sa.Integer(), nullable=False),
        sa.Column(
            "criada_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cnpj"),
    )
    op.create_table(
        "usuario",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("empresa_id", sa.String(length=36), nullable=True),
        sa.Column("nome", sa.String(length=160), nullable=False),
        sa.Column("cpf", sa.String(length=11), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("senha_hash", sa.String(length=255), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("tentativas_falhas", sa.Integer(), nullable=False),
        sa.Column("bloqueado_ate", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresa.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cpf"),
    )
    op.create_index(op.f("ix_usuario_empresa_id"), "usuario", ["empresa_id"], unique=False)
    op.create_table(
        "log_auditoria",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "ocorrido_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ator_id", sa.String(length=36), nullable=True),
        sa.Column("ator_role", sa.String(length=20), nullable=True),
        sa.Column("empresa_id", sa.String(length=36), nullable=True),
        sa.Column("acao", sa.String(length=60), nullable=False),
        sa.Column("recurso", sa.String(length=60), nullable=False),
        sa.Column("recurso_id", sa.String(length=36), nullable=True),
        sa.Column("finalidade", sa.String(length=120), nullable=True),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_log_auditoria_acao"), "log_auditoria", ["acao"], unique=False)
    op.create_index(op.f("ix_log_auditoria_ator_id"), "log_auditoria", ["ator_id"], unique=False)
    op.create_index(
        op.f("ix_log_auditoria_empresa_id"), "log_auditoria", ["empresa_id"], unique=False
    )
    op.create_index(
        op.f("ix_log_auditoria_ocorrido_em"), "log_auditoria", ["ocorrido_em"], unique=False
    )
    op.execute(TRIGGER_SOMENTE_INSERCAO)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS log_auditoria_sem_alteracao ON log_auditoria")
    op.execute("DROP FUNCTION IF EXISTS log_auditoria_somente_insercao()")
    op.drop_index(op.f("ix_log_auditoria_ocorrido_em"), table_name="log_auditoria")
    op.drop_index(op.f("ix_log_auditoria_empresa_id"), table_name="log_auditoria")
    op.drop_index(op.f("ix_log_auditoria_ator_id"), table_name="log_auditoria")
    op.drop_index(op.f("ix_log_auditoria_acao"), table_name="log_auditoria")
    op.drop_table("log_auditoria")
    op.drop_index(op.f("ix_usuario_empresa_id"), table_name="usuario")
    op.drop_table("usuario")
    op.drop_table("empresa")
