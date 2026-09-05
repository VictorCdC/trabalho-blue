"""O que cada perfil recebe de dado clínico — e o que fica na trilha.

Antes desta mudança a decisão era do navegador: o snapshot trazia as queixas
identificadas da empresa inteira e a tela escondia o que o perfil não podia
ver. Aqui a decisão é do servidor, e estes testes são o que impede a regressão.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import LogAuditoria

REGIAO = "punho"


@pytest.fixture
def recorrencia(criar_colaborador, criar_queixa):
    """Uma pessoa com três queixas na mesma região: o limiar do alerta."""

    def montar(nome: str = "Ana Beatriz Nogueira"):
        pessoa = criar_colaborador(nome=nome)
        for atras in (0, 2, 4):
            criar_queixa(pessoa, atras=atras, regiao=REGIAO, lado="direito", intensidade=4)
        return pessoa

    return montar


def test_rh_recebe_alerta_sem_a_pessoa(
    cliente, criar_usuario, empresa, autenticar, recorrencia
) -> None:
    pessoa = recorrencia()
    autenticar(criar_usuario("rh", empresa_id=empresa.id))

    (alerta,) = cliente.get("/alertas").json()["itens"]

    assert alerta["kind"] == "individual"
    assert alerta["ocorrencias"] == 3
    # o RH precisa saber que há recorrência; não de quem ela é
    assert alerta["colaboradorId"] is None
    assert alerta["colaboradorNome"] is None
    assert pessoa.nome not in cliente.get("/alertas").text


def test_sesmt_recebe_o_alerta_com_a_pessoa(
    cliente, criar_usuario, empresa, autenticar, recorrencia
) -> None:
    pessoa = recorrencia()
    autenticar(criar_usuario("sesmt", empresa_id=empresa.id))

    (alerta,) = cliente.get("/alertas").json()["itens"]

    assert alerta["colaboradorId"] == pessoa.id
    assert alerta["colaboradorNome"] == pessoa.nome


def test_lista_de_colaboradores_nao_leva_clinico_para_quem_nao_pode(
    cliente, criar_usuario, empresa, autenticar, recorrencia
) -> None:
    recorrencia()
    autenticar(criar_usuario("admin", empresa_id=empresa.id))

    (linha,) = cliente.get("/colaboradores").json()["itens"]

    # o cadastral sai; o clínico vem nulo, e não zerado — zero seria afirmação
    assert linha["setorId"] is not None
    assert linha["queixas"] is None
    assert linha["regiaoTop"] is None
    assert linha["alertas"] is None


def test_lista_de_colaboradores_leva_clinico_para_o_sesmt(
    cliente, criar_usuario, empresa, autenticar, recorrencia
) -> None:
    recorrencia()
    autenticar(criar_usuario("sesmt", empresa_id=empresa.id))

    (linha,) = cliente.get("/colaboradores").json()["itens"]

    assert linha["queixas"] == 3
    assert linha["regiaoTop"] == REGIAO
    assert linha["alertas"] == 1


def test_cpf_inteiro_nao_sai_na_lista(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador
) -> None:
    """A tela mostra o CPF ocultado; ocultar no servidor é o que evita mandá-lo."""
    pessoa = criar_colaborador()
    autenticar(criar_usuario("sesmt", empresa_id=empresa.id))

    resposta = cliente.get("/colaboradores")

    assert pessoa.cpf not in resposta.text
    assert resposta.json()["itens"][0]["cpfMascarado"].startswith("***.***.")


def test_abrir_ficha_fica_na_trilha_com_finalidade(
    cliente, criar_usuario, empresa, autenticar, recorrencia, sessao
) -> None:
    pessoa = recorrencia()
    sesmt = criar_usuario("sesmt", empresa_id=empresa.id)
    autenticar(sesmt)

    assert cliente.get(f"/colaboradores/{pessoa.id}").status_code == 200

    registro = sessao.scalars(
        select(LogAuditoria).where(LogAuditoria.acao == "colaborador:abrir_ficha")
    ).one()
    assert registro.recurso_id == pessoa.id
    assert registro.ator_id == sesmt.id
    assert registro.finalidade  # ler dado identificado exige dizer para quê


def test_ficha_de_outra_empresa_nao_existe(
    cliente, criar_usuario, empresa, outra_empresa, autenticar, recorrencia, sessao
) -> None:
    """404 e não 403: o status não pode virar oráculo de existência entre tenants."""
    pessoa = recorrencia()
    intruso = criar_usuario("sesmt", empresa_id=outra_empresa.id)
    autenticar(intruso)

    assert cliente.get(f"/colaboradores/{pessoa.id}").status_code == 404


def test_colaborador_so_enxerga_o_proprio_historico(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    eu = criar_colaborador(nome="Eu Mesmo")
    colega = criar_colaborador(nome="Colega")
    criar_queixa(eu, regiao="lombar")
    criar_queixa(colega, regiao="ombro")
    autenticar(eu)

    corpo = cliente.get("/meu/queixas").json()

    assert corpo["total"] == 1
    assert corpo["itens"][0]["colaboradorId"] == eu.id
    assert "ombro" not in cliente.get("/meu/queixas").text


def test_colaborador_nao_abre_o_painel(cliente, criar_colaborador, autenticar) -> None:
    autenticar(criar_colaborador())

    assert cliente.get("/painel/resumo").status_code == 403
    assert cliente.get("/colaboradores").status_code == 403
    assert cliente.get("/alertas").status_code == 403
