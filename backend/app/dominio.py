"""Vocabulário fechado do domínio clínico.

Espelha `frontend/src/lib/types.ts` — os dois lados falam a mesma língua e os
mesmos valores literais, sem tradução na fronteira. Fica em módulo próprio
porque `models` (tipagem das colunas) e `esquemas` (validação de entrada e
saída) precisam das mesmas listas: duplicar seria criar duas verdades.

Guardados como texto no banco, e não como ENUM do Postgres, pelo mesmo motivo
que `usuario.role`: acrescentar um valor vira migration de dados em vez de uma
linha aqui. A validação acontece na fronteira, via Pydantic.
"""

from __future__ import annotations

from typing import Literal, get_args

Lado = Literal["esquerdo", "direito", "na"]

TipoDor = Literal["pontada", "queimacao", "peso", "formigamento", "rigidez", "latejante", "cansaco"]

InicioDor = Literal["hoje", "essa_semana", "esse_mes", "mais_de_mes"]

Agravante = Literal[
    "esforco_repetitivo",
    "levantar_peso",
    "ficar_sentado",
    "ficar_em_pe",
    "movimento_especifico",
    "fim_do_turno",
    "nao_sei",
]

RelacaoTrabalho = Literal["sim", "nao", "nao_sei"]

EstadoCheckIn = Literal["bem", "desconforto"]

Severidade = Literal["baixa", "media", "alta"]

StatusCaso = Literal["aberto", "em_andamento", "resolvido"]

OrigemCaso = Literal["individual", "coletivo"]

TipoAcao = Literal[
    "encaminhado_medico",
    "avaliacao_ergonomica",
    "ginastica_laboral",
    "ajuste_posto",
    "mudanca_funcao",
    "treinamento",
    "reavaliacao",
    "observacao",
]

RegiaoId = Literal[
    # centrais — vista frontal
    "cabeca",
    "pescoco",
    "peito",
    "abdomen",
    "quadril",
    # centrais — vista posterior
    "nuca",
    "cervical",
    "dorsal",
    "lombar",
    # bilaterais — membros superiores
    "ombro",
    "braco",
    "cotovelo",
    "antebraco",
    "punho",
    "mao",
    # bilaterais — membros inferiores, vista frontal
    "coxa",
    "joelho",
    "canela",
    "pe",
    # bilaterais — membros inferiores, vista posterior
    "gluteo",
    "posterior_coxa",
    "panturrilha",
    "calcanhar",
]

#: Regiões que existem dos dois lados do corpo. Para as demais o lado é "na" —
#: pintar os dois punhos quando só um dói já seria erro de leitura clínica.
REGIOES_BILATERAIS: frozenset[str] = frozenset(
    {
        "ombro",
        "braco",
        "cotovelo",
        "antebraco",
        "punho",
        "mao",
        "coxa",
        "joelho",
        "canela",
        "pe",
        "gluteo",
        "posterior_coxa",
        "panturrilha",
        "calcanhar",
    }
)

REGIOES: tuple[str, ...] = get_args(RegiaoId)
