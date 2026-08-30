"""Engine, sessão e base declarativa."""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import obter_config


class Base(DeclarativeBase):
    pass


@lru_cache
def obter_engine() -> Engine:
    return create_engine(obter_config().database_url, pool_pre_ping=True, future=True)


@lru_cache
def _fabrica() -> sessionmaker[Session]:
    return sessionmaker(bind=obter_engine(), autoflush=False, expire_on_commit=False)


def obter_sessao() -> Generator[Session, None, None]:
    """Dependency do FastAPI: uma sessão por requisição."""
    with _fabrica()() as sessao:
        yield sessao
