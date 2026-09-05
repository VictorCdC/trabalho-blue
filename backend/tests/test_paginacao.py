"""Paginação física: o que vai para o navegador cabe numa tela.

O ponto do envelope não é só cortar a lista — é o `total`, que deixa a tela
desenhar o rodapé sem baixar tudo para contar.
"""

from __future__ import annotations

import pytest

from app.paginacao import LIMITE_MAXIMO


@pytest.fixture
def sesmt_logado(cliente, criar_usuario, empresa, autenticar):
    autenticar(criar_usuario("sesmt", empresa_id=empresa.id))
    return cliente


def test_limit_corta_e_total_conta_a_lista_inteira(sesmt_logado, criar_colaborador) -> None:
    for _ in range(12):
        criar_colaborador()

    corpo = sesmt_logado.get("/colaboradores?limit=5").json()

    assert len(corpo["itens"]) == 5
    assert corpo["total"] == 12
    assert corpo["limit"] == 5
    assert corpo["offset"] == 0


def test_offset_avanca_sem_repetir(sesmt_logado, criar_colaborador) -> None:
    for i in range(7):
        criar_colaborador(nome=f"Pessoa {i:02d}")

    primeira = sesmt_logado.get("/colaboradores?limit=3&offset=0").json()
    segunda = sesmt_logado.get("/colaboradores?limit=3&offset=3").json()
    ultima = sesmt_logado.get("/colaboradores?limit=3&offset=6").json()

    ids_primeira = {linha["id"] for linha in primeira["itens"]}
    ids_segunda = {linha["id"] for linha in segunda["itens"]}
    assert not ids_primeira & ids_segunda
    assert len(ultima["itens"]) == 1
    assert ultima["total"] == 7


def test_offset_alem_do_fim_devolve_pagina_vazia(sesmt_logado, criar_colaborador) -> None:
    criar_colaborador()

    corpo = sesmt_logado.get("/colaboradores?offset=50").json()

    assert corpo["itens"] == []
    assert corpo["total"] == 1


def test_limite_tem_teto(sesmt_logado, criar_colaborador) -> None:
    """Sem teto, `?limit=999999` desfaz a paginação com um parâmetro."""
    criar_colaborador()

    assert sesmt_logado.get(f"/colaboradores?limit={LIMITE_MAXIMO + 1}").status_code == 422
    assert sesmt_logado.get("/colaboradores?limit=0").status_code == 422
    assert sesmt_logado.get("/colaboradores?offset=-1").status_code == 422


def test_historico_da_pessoa_e_paginado(sesmt_logado, criar_colaborador, criar_queixa) -> None:
    pessoa = criar_colaborador()
    for atras in range(9):
        criar_queixa(pessoa, atras=atras)

    corpo = sesmt_logado.get(f"/colaboradores/{pessoa.id}/queixas?limit=4").json()

    assert len(corpo["itens"]) == 4
    assert corpo["total"] == 9
    # do mais recente para o mais antigo, como a tela mostra
    datas = [item["data"] for item in corpo["itens"]]
    assert datas == sorted(datas, reverse=True)


def test_busca_por_nome_acontece_no_banco(sesmt_logado, criar_colaborador) -> None:
    criar_colaborador(nome="Ana Beatriz Nogueira")
    criar_colaborador(nome="Marcos Vinicius Souza")

    corpo = sesmt_logado.get("/colaboradores?busca=beatriz").json()

    assert corpo["total"] == 1
    assert corpo["itens"][0]["nome"] == "Ana Beatriz Nogueira"
