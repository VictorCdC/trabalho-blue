"""Login: credencial derivada do nome, mensagem única, bloqueio e cookie httpOnly."""

from __future__ import annotations

import pytest

from app.rotas.auth import CREDENCIAL_INVALIDA
from app.seguranca import NOME_COOKIE, nome_de_usuario
from tests.conftest import SENHA_PADRAO


@pytest.mark.parametrize(
    "nome,esperado",
    [
        ("Marcos Vinícius Souza", "marcos.souza"),
        ("Ana Beatriz Nogueira", "ana.nogueira"),
        ("Otávio Mendes Ferraz", "otavio.ferraz"),
        ("Priscila Moraes Aragão", "priscila.aragao"),
        # nome do meio não entra, sobrenome composto usa o último
        ("Helena Castro Vasconcelos", "helena.vasconcelos"),
        # nome único: o formato pede sobrenome, mas o cadastro não pode travar
        ("Madonna", "madonna"),
    ],
)
def test_usuario_e_nome_ponto_sobrenome_sem_acento(nome, esperado) -> None:
    assert nome_de_usuario(nome) == esperado


def test_login_valido_devolve_o_proprio_usuario(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("sesmt", empresa_id=empresa.id)
    resposta = cliente.post("/auth/login", json={"usuario": usuario.usuario, "senha": SENHA_PADRAO})
    assert resposta.status_code == 200
    assert resposta.json()["id"] == usuario.id
    assert resposta.json()["role"] == "sesmt"
    assert resposta.json()["usuario"] == usuario.usuario


def test_login_ignora_caixa_e_acento_do_que_foi_digitado(
    cliente, criar_usuario, empresa, sessao
) -> None:
    """`Otávio.Ferraz` e `otavio.ferraz` são a mesma conta — o nome gravado é
    sem acento, e ninguém adivinha que precisa digitar assim."""
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    usuario.usuario = "otavio.ferraz"
    sessao.commit()

    resposta = cliente.post(
        "/auth/login", json={"usuario": " Otávio.Ferraz ", "senha": SENHA_PADRAO}
    )

    assert resposta.status_code == 200
    assert resposta.json()["id"] == usuario.id


def test_cookie_de_sessao_e_httponly_e_samesite(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    resposta = cliente.post("/auth/login", json={"usuario": usuario.usuario, "senha": SENHA_PADRAO})
    bruto = resposta.headers["set-cookie"].lower()
    # httpOnly é o que impede um XSS no frontend de virar sessão roubada
    assert "httponly" in bruto
    assert "samesite=lax" in bruto


def test_usuario_inexistente_e_senha_errada_dao_a_mesma_resposta(
    cliente, criar_usuario, empresa
) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    senha_errada = cliente.post(
        "/auth/login", json={"usuario": usuario.usuario, "senha": "outra-senha-1"}
    )
    inexistente = cliente.post(
        "/auth/login", json={"usuario": "ninguem.aqui", "senha": "outra-senha-1"}
    )
    assert senha_errada.status_code == inexistente.status_code == 401
    assert senha_errada.json() == inexistente.json() == {"detail": CREDENCIAL_INVALIDA}


def test_conta_bloqueia_depois_das_tentativas(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id)
    for _ in range(3):  # LOGIN_MAX_TENTATIVAS=3 no conftest
        cliente.post(
            "/auth/login", json={"usuario": usuario.usuario, "senha": "errada-de-proposito"}
        )
    # agora nem a senha certa passa
    resposta = cliente.post("/auth/login", json={"usuario": usuario.usuario, "senha": SENHA_PADRAO})
    assert resposta.status_code == 429


def test_conta_inativa_nao_entra(cliente, criar_usuario, empresa) -> None:
    usuario = criar_usuario("rh", empresa_id=empresa.id, ativo=False)
    resposta = cliente.post("/auth/login", json={"usuario": usuario.usuario, "senha": SENHA_PADRAO})
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


# ------------------------- a credencial que o cadastro gera -------------------


def _novo(nome: str, cpf: str, estrutura: dict[str, str]) -> dict[str, object]:
    return {
        "nome": nome,
        "cpf": cpf,
        "email": None,
        "role": "colaborador",
        "unidadeId": estrutura["unidade"],
        "setorId": estrutura["estoque"],
        "cargoId": estrutura["conferente"],
        "nascimento": "1990-05-14",
        "admissaoEm": None,
    }


def test_cadastro_gera_o_usuario_e_a_pessoa_entra_com_ele(
    cliente, criar_usuario, empresa, estrutura, autenticar
) -> None:
    """O ciclo inteiro: quem cadastra não digita credencial, e a que o servidor
    derivou é a que funciona no login."""
    autenticar(criar_usuario("admin", empresa_id=empresa.id))

    criado = cliente.post(
        "/usuarios", json=_novo("Marcos Vinícius Souza", "52998224725", estrutura)
    )
    assert criado.status_code == 201, criado.text
    assert criado.json()["usuario"] == "marcos.souza"

    cliente.post("/auth/sair")
    # senha do primeiro acesso: a data de nascimento em ddmmaaaa
    entrou = cliente.post("/auth/login", json={"usuario": "marcos.souza", "senha": "14051990"})
    assert entrou.status_code == 200, entrou.text
    assert entrou.json()["nome"] == "Marcos Vinícius Souza"


def test_dois_nomes_que_derivam_o_mesmo_usuario_dao_409(
    cliente, criar_usuario, empresa, estrutura, autenticar
) -> None:
    """`Marcos Vinícius Souza` e `Marcos Aurélio Souza` viram `marcos.souza`.
    O servidor recusa em vez de inventar um sufixo: quem cadastra decide."""
    autenticar(criar_usuario("admin", empresa_id=empresa.id))
    cliente.post("/usuarios", json=_novo("Marcos Vinícius Souza", "52998224725", estrutura))

    repetido = cliente.post(
        "/usuarios", json=_novo("Marcos Aurélio Souza", "11144477735", estrutura)
    )

    assert repetido.status_code == 409
    assert "marcos.souza" in repetido.json()["detail"]
