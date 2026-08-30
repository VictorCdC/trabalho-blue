"""Configuração do processo, lida do ambiente.

Nada aqui tem valor padrão que sirva para produção: `AMBIENTE=producao`
recusa subir com chave de desenvolvimento ou cookie sem TLS.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

CHAVE_DE_DESENVOLVIMENTO = "chave-apenas-de-desenvolvimento-nao-use-em-producao"


class Config(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    database_url: str
    secret_key: str
    ambiente: Literal["desenvolvimento", "producao"] = "desenvolvimento"

    sessao_horas: int = 8
    cookie_secure: bool = False

    login_max_tentativas: int = 5
    login_bloqueio_minutos: int = 15

    #: Menor grupo cujo agregado pode ser divulgado. Ver app/agregacao.py.
    k_minimo_agregacao: int = 5

    origens_permitidas: str = "http://localhost:3000"

    @property
    def origens(self) -> list[str]:
        return [o.strip() for o in self.origens_permitidas.split(",") if o.strip()]

    @property
    def producao(self) -> bool:
        return self.ambiente == "producao"

    @model_validator(mode="after")
    def _producao_exige_endurecimento(self) -> Config:
        if not self.producao:
            return self
        if self.secret_key == CHAVE_DE_DESENVOLVIMENTO or len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY de produção precisa ser própria e ter 32+ caracteres")
        if not self.cookie_secure:
            raise ValueError(
                "COOKIE_SECURE precisa ser true em produção: "
                "sem TLS o cookie de sessão trafega aberto"
            )
        if self.k_minimo_agregacao < 2:
            raise ValueError("K_MINIMO_AGREGACAO < 2 divulga indivíduo como se fosse agregado")
        return self


@lru_cache
def obter_config() -> Config:
    return Config()  # type: ignore[call-arg]  # os campos vêm do ambiente
