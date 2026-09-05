"""Credenciais: nome de usuário, hash de senha e cookie de sessão.

O cookie carrega apenas o id do usuário, assinado com SECRET_KEY e com prazo.
Ele é httpOnly: JavaScript não o lê, então um XSS no frontend não vira sessão
roubada — motivo pelo qual a sessão não pode voltar para o localStorage.
"""

from __future__ import annotations

import re
import unicodedata

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import obter_config

NOME_COOKIE = "blue_sessao"

_hasher = PasswordHasher()

#: Hash descartável verificado quando o usuário não existe, para que o tempo de
#: resposta não diferencie "usuário inexistente" de "senha errada".
HASH_DESCARTAVEL = _hasher.hash("senha-que-nunca-sera-usada")

#: separa o nome em partes: hífen, apóstrofo e ponto não entram no login
_NAO_LETRA = re.compile(r"[^a-z0-9]+")


def normalizar_usuario(valor: str) -> str:
    """Minúsculo e sem acento — `Ana.Nogueira` e `ana.nogueira` são o mesmo login.

    Passa por aqui tanto o que o formulário de login digitou quanto o que vai
    gravado: se as duas pontas não normalizassem igual, o nome derivado de
    `Otávio` viraria uma credencial que ninguém consegue digitar de volta.
    """
    cru = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode("ascii")
    return cru.strip().lower()


def nome_de_usuario(nome: str) -> str:
    """`Marcos Vinícius Souza` -> `marcos.souza`: primeiro e último nome.

    Nome do meio fica fora — o formato combinado é NOME.SOBRENOME. Duas
    pessoas com primeiro e último nome iguais colidem, e é a unicidade da
    coluna que recusa a segunda: inventar aqui um `marcos.souza2` esconderia
    de quem cadastrou que existem duas contas parecidas.
    """
    partes = [parte for parte in _NAO_LETRA.split(normalizar_usuario(nome)) if parte]
    if not partes:
        raise ValueError("nome sem letras: nao da para derivar o nome de usuario")
    if len(partes) == 1:
        return partes[0]
    return f"{partes[0]}.{partes[-1]}"


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
