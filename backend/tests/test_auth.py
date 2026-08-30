"""Login: mensagem única, bloqueio por conta e cookie httpOnly."""

from __future__ import annotations

from app.rotas.auth import CREDENCIAL_INVALIDA
from app.seguranca import NOME_COOKIE
from tests.conftest import SENHA_PADRAO


def test_login_valido_devolve_o_proprio_usuario(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("sesmt", empresa_id=empresa.id)
    resposta = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})
    assert resposta.status_code == 200
    assert resposta.json()["id"] == usuario.id
    assert resposta.json()["role"] == "sesmt"


def test_cookie_de_sessao_e_httponly_e_samesite(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    resposta = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})
    bruto = resposta.headers["set-cookie"].lower()
    # httpOnly é o que impede um XSS no frontend de virar sessão roubada
    assert "httponly" in bruto
    assert "samesite=lax" in bruto


def test_cpf_inexistente_e_senha_errada_dao_a_mesma_resposta(
    cliente, criar_usuario, empresa
) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    senha_errada = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": "outra-senha-1"})
    inexistente = cliente.post("/auth/login", json={"cpf": "98765432100", "senha": "outra-senha-1"})
    assert senha_errada.status_code == inexistente.status_code == 401
    assert senha_errada.json() == inexistente.json() == {"detail": CREDENCIAL_INVALIDA}


def test_conta_bloqueia_depois_das_tentativas(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    for _ in range(3):  # LOGIN_MAX_TENTATIVAS=3 no conftest
        cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": "errada-de-proposito"})
    # agora nem a senha certa passa
    resposta = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})
    assert resposta.status_code == 429


def test_conta_inativa_nao_entra(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id, ativo=False)
    resposta = cliente.post("/auth/login", json={"cpf": usuario.cpf, "senha": SENHA_PADRAO})
    assert resposta.status_code == 401


def test_eu_exige_sessao(cliente) -> None:
    assert cliente.get("/auth/eu").status_code == 401


def test_cookie_forjado_nao_autentica(cliente, criar_usuario, empresa) -> None:
    criar_usuario("admin", empresa_id=empresa.id)
    cliente.cookies.set(NOME_COOKIE, "valor-inventado")
    assert cliente.get("/auth/eu").status_code == 401


def test_sair_limpa_a_sessao(cliente, criar_usuario, empresa, autenticar) -> None:
    autenticar(criar_usuario("admin", empresa_id=empresa.id))
    assert cliente.get("/auth/eu").status_code == 200
    assert cliente.post("/auth/sair").status_code == 204
    assert cliente.get("/auth/eu").status_code == 401
