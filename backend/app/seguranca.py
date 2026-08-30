"""Hash de senha e cookie de sessão.

O cookie carrega apenas o id do usuário, assinado com SECRET_KEY e com prazo.
Ele é httpOnly: JavaScript não o lê, então um XSS no frontend não vira sessão
roubada — motivo pelo qual a sessão não pode voltar para o localStorage.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import obter_config

NOME_COOKIE = "blue_sessao"

_hasher = PasswordHasher()

#: Hash descartável verificado quando o CPF não existe, para que o tempo de
#: resposta não diferencie "CPF inexistente" de "senha errada".
HASH_DESCARTAVEL = _hasher.hash("senha-que-nunca-sera-usada")


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def senha_confere(senha_hash: str, senha: str) -> bool:
    try:
        return _hasher.verify(senha_hash, senha)
    except (VerifyMismatchError, VerificationError):
        return False


def _serializador() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(obter_config().secret_key, salt="blue.sessao")


def assinar_sessao(usuario_id: str) -> str:
    return _serializador().dumps(usuario_id)


def ler_sessao(token: str) -> str | None:
    """Devolve o id do usuário, ou None se o cookie foi forjado ou expirou."""
    idade_maxima = obter_config().sessao_horas * 3600
    try:
        valor = _serializador().loads(token, max_age=idade_maxima)
    except (BadSignature, SignatureExpired):
        return None
    return valor if isinstance(valor, str) else None


def definir_cookie(resposta: Response, usuario_id: str) -> None:
    config = obter_config()
    resposta.set_cookie(
        NOME_COOKIE,
        assinar_sessao(usuario_id),
        max_age=config.sessao_horas * 3600,
        httponly=True,
        secure=config.cookie_secure,
        samesite="lax",
        path="/",
    )


def limpar_cookie(resposta: Response) -> None:
    resposta.delete_cookie(NOME_COOKIE, path="/")
