"""Nenhuma rota sem permissão declarada.

Esquecer o `requer(...)` num endpoint novo é o erro mais fácil de cometer e o
mais caro: a rota fica aberta a qualquer sessão autenticada. Aqui a ausência
falha o build, e abrir exceção obriga a mexer numa lista explícita.
"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

from app.autorizacao import GuardaPermissao
from app.main import ROTAS_PUBLICAS, ROTAS_SEM_PERMISSAO, app


def rotas_api(alvo: object, prefixo: str = "") -> Iterator[tuple[str, APIRoute]]:
    """Achata a árvore de rotas.

    Desde o FastAPI 0.141 `include_router` aninha o router em vez de copiar as
    rotas, então `app.routes` não devolve mais tudo. Se esta função parar de
    encontrar rotas depois de um upgrade, o teste vira falso positivo — daí o
    test_o_flattener_acha_as_rotas_conhecidas logo abaixo.
    """
    for rota in getattr(alvo, "routes", []):
        if isinstance(rota, APIRoute):
            yield prefixo + rota.path, rota
        elif hasattr(rota, "original_router"):
            interno = getattr(rota.include_context, "prefix", "") or ""
            yield from rotas_api(rota.original_router, prefixo + interno)


def test_o_flattener_acha_as_rotas_conhecidas() -> None:
    caminhos = {caminho for caminho, _ in rotas_api(app)}
    assert {"/saude", "/auth/login", "/usuarios", "/empresas"} <= caminhos


def _tem_guarda(dependant: Dependant) -> bool:
    if isinstance(dependant.call, GuardaPermissao):
        return True
    return any(_tem_guarda(filho) for filho in dependant.dependencies)


def test_toda_rota_declara_permissao_ou_esta_na_lista() -> None:
    faltando = [
        caminho
        for caminho, rota in rotas_api(app)
        if caminho not in ROTAS_PUBLICAS
        and caminho not in ROTAS_SEM_PERMISSAO
        and not _tem_guarda(rota.dependant)
    ]
    assert not faltando, (
        f"rotas sem requer(): {faltando}. Declare a permissão ou justifique "
        "acrescentando o caminho a ROTAS_PUBLICAS/ROTAS_SEM_PERMISSAO em app/main.py."
    )


def test_listas_de_excecao_nao_citam_rota_que_nao_existe() -> None:
    caminhos = {caminho for caminho, _ in rotas_api(app)}
    orfas = (ROTAS_PUBLICAS | ROTAS_SEM_PERMISSAO) - caminhos
    assert not orfas, f"exceção para rota inexistente: {orfas}"


def test_o_detector_reprova_rota_sem_guarda() -> None:
    """Guarda do guarda: um detector que nunca acusa não protege nada."""
    from fastapi import APIRouter, FastAPI

    solto = APIRouter()

    @solto.get("/rota-esquecida")
    def _rota_esquecida() -> dict[str, str]:
        return {}

    app_temp = FastAPI()
    app_temp.include_router(solto)

    caminhos_sem_guarda = [
        caminho for caminho, rota in rotas_api(app_temp) if not _tem_guarda(rota.dependant)
    ]
    assert caminhos_sem_guarda == ["/rota-esquecida"]
