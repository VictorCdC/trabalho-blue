"""Supressão de grupos pequenos nos números agregados.

O painel do RH filtra por unidade + setor + cargo + período. Combinando os
três, um "agregado" pode acabar descrevendo uma pessoa só — e aí o RH está
lendo dado clínico identificado sem ter a permissão para isso.

A regra: grupo com menos de k pessoas não é divulgado. Nem a métrica, nem a
contagem — saber que "o grupo tem 2 pessoas" já estreita demais.

Limite conhecido: se um total for publicado junto com os grupos, subtrair os
divulgados pode recuperar o suprimido (ataque por diferença). Enquanto não
houver supressão complementar, não publique total ao lado de grupos
suprimidos.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Grupo:
    """Um recorte agregado, antes da checagem de divulgação."""

    chave: str
    pessoas: int
    metricas: dict[str, float]


@dataclass(frozen=True)
class GrupoDivulgado:
    """O que a API devolve. `suprimido` é sempre explícito, nunca um zero."""

    chave: str
    pessoas: int | None
    metricas: dict[str, float] | None
    suprimido: bool


def aplicar_k_minimo(grupos: Iterable[Grupo], k: int) -> list[GrupoDivulgado]:
    if k < 2:
        raise ValueError("k < 2 divulgaria individuo como se fosse agregado")
    return [
        GrupoDivulgado(chave=g.chave, pessoas=None, metricas=None, suprimido=True)
        if g.pessoas < k
        else GrupoDivulgado(chave=g.chave, pessoas=g.pessoas, metricas=g.metricas, suprimido=False)
        for g in grupos
    ]
