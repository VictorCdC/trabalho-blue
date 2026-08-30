"""Supressão de grupo pequeno — o furo de reidentificação mais provável."""

from __future__ import annotations

import pytest

from app.agregacao import Grupo, aplicar_k_minimo


def grupo(chave: str, pessoas: int) -> Grupo:
    return Grupo(chave=chave, pessoas=pessoas, metricas={"taxa_desconforto": 0.42})


def test_grupo_menor_que_k_nao_divulga_nada() -> None:
    (linha,) = aplicar_k_minimo([grupo("Estoque", 2)], k=5)
    assert linha.suprimido
    assert linha.metricas is None
    # a contagem também não sai: "o grupo tem 2 pessoas" já estreita demais
    assert linha.pessoas is None


def test_grupo_no_limite_divulga() -> None:
    (linha,) = aplicar_k_minimo([grupo("Producao", 5)], k=5)
    assert not linha.suprimido
    assert linha.pessoas == 5
    assert linha.metricas == {"taxa_desconforto": 0.42}


def test_supressao_e_por_grupo() -> None:
    linhas = aplicar_k_minimo([grupo("Estoque", 2), grupo("Producao", 30)], k=5)
    assert [linha.suprimido for linha in linhas] == [True, False]


def test_k_menor_que_dois_e_recusado() -> None:
    with pytest.raises(ValueError, match="individuo"):
        aplicar_k_minimo([grupo("Estoque", 1)], k=1)
