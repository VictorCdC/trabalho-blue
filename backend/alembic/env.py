"""Ambiente do Alembic.

A URL vem do ambiente, nunca do alembic.ini — o arquivo é versionado.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from app import models  # noqa: F401  (registra as tabelas em Base.metadata)
from app.config import obter_config
from app.db import Base, obter_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def migrar_offline() -> None:
    context.configure(
        url=obter_config().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def migrar_online() -> None:
    with obter_engine().connect() as conexao:
        context.configure(connection=conexao, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    migrar_offline()
else:
    migrar_online()
