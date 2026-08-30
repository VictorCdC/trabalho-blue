"""Matriz papel × endpoint.

Este é o teste que precisa existir antes de qualquer feature: ele é a única
coisa que garante que a matriz de /rbac/permissoes.json é o que o servidor
realmente faz. Toda rota nova entra aqui.
"""

from __future__ import annotations

import pytest

from app.autorizacao import CABECALHO_EMPRESA
from app.models import Usuario
from app.rbac_gerado import PERMISSOES

PAPEIS = list(PERMISSOES)

# endpoint -> permissão exigida
ENDPOINTS = {
    "/usuarios": "usuarios:gerenciar",
    "/empresas": "empresas:gerenciar",
}


def _cabecalhos(usuario: Usuario, empresa_id: str) -> dict[str, str]:
    """Só o superuser precisa dizer qual tenant está olhando."""
    return {} if usuario.empresa_id else {CABECALHO_EMPRESA: empresa_id}


@pytest.mark.parametrize("papel", PAPEIS)
@pytest.mark.parametrize("caminho,permissao", list(ENDPOINTS.items()))
def test_matriz_papel_endpoint(
    papel, caminho, permissao, cliente, criar_usuario, empresa, autenticar
) -> None:
    empresa_id = None if papel == "superuser" else empresa.id
    usuario = criar_usuario(papel, empresa_id=empresa_id)
    autenticar(usuario)

    resposta = cliente.get(caminho, headers=_cabecalhos(usuario, empresa.id))

    esperado = 200 if permissao in PERMISSOES[papel] else 403
    assert resposta.status_code == esperado, f"{papel} em {caminho}: {resposta.text}"


def test_sem_sessao_nao_passa(cliente) -> None:
    for caminho in ENDPOINTS:
        assert cliente.get(caminho).status_code == 401


def test_admin_nao_ve_usuarios_de_outra_empresa(
    cliente, criar_usuario, empresa, outra_empresa, autenticar
) -> None:
    admin = criar_usuario("admin", empresa_id=empresa.id)
    criar_usuario("colaborador", empresa_id=empresa.id)
    criar_usuario("colaborador", empresa_id=outra_empresa.id)
    autenticar(admin)

    ids = {linha["id"] for linha in cliente.get("/usuarios").json()}

    assert len(ids) == 2  # o admin e o colaborador da própria empresa
    vizinhos = {
        linha["id"]
        for linha in cliente.get("/usuarios").json()
        if linha["nome"].startswith("Usuario colaborador")
    }
    assert len(vizinhos) == 1


def test_cabecalho_de_empresa_e_ignorado_para_quem_tem_empresa(
    cliente, criar_usuario, empresa, outra_empresa, autenticar
) -> None:
    """Sem isto, qualquer admin liga o cabeçalho e lê o tenant do vizinho."""
    admin = criar_usuario("admin", empresa_id=empresa.id)
    criar_usuario("colaborador", empresa_id=outra_empresa.id)
    autenticar(admin)

    resposta = cliente.get("/usuarios", headers={CABECALHO_EMPRESA: outra_empresa.id})

    assert resposta.status_code == 200
    assert all(linha["id"] == admin.id for linha in resposta.json())


def test_superuser_sem_cabecalho_nao_escolhe_tenant_sozinho(
    cliente, criar_usuario, empresa, autenticar
) -> None:
    autenticar(criar_usuario("superuser"))
    assert cliente.get("/usuarios").status_code == 400


def test_lista_de_usuarios_nao_devolve_cpf(cliente, criar_usuario, empresa, autenticar) -> None:
    """Minimização: a tela de acessos não precisa do CPF de ninguém."""
    autenticar(criar_usuario("admin", empresa_id=empresa.id))
    (linha,) = cliente.get("/usuarios").json()
    assert "cpf" not in linha
