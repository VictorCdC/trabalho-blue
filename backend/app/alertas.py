"""Alertas de recorrência, derivados por consulta.

Alerta não é tabela. É o que a regra abaixo diz sobre as queixas dos últimos
30 dias, recalculado a cada leitura. Materializar traria um agendador e a
possibilidade de alerta desatualizado — e um alerta atrasado é pior do que
nenhum, porque parece atualizado.

O id é derivado e estável (`alr-ind-...`, `alr-col-...`): é ele que o caso
guarda em `caso.alerta_id`, e é o que faz o link de um caso continuar
apontando para o mesmo alerta na leitura seguinte.

Redação da identidade acontece aqui, e não em cada rota: `identificar=False`
devolve o alerta sem a pessoa. O RH precisa saber que existe recorrência no
setor; não precisa saber de quem.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import Row, Select, func, select

from app.consulta import ConsultaEscopada
from app.dominio import RegiaoId, Severidade
from app.esquemas import AlertaColetivo, AlertaIndividual, ContagemAlertas
from app.models import Caso, Queixa, Setor, Usuario
from app.periodo import Janela, montar_janela


@dataclass(frozen=True)
class Regras:
    """Os limiares. Fixos nesta versão; a intenção é virarem configuração por
    empresa numa tela futura — por isso estão reunidos e não espalhados."""

    janela_dias: int = 30
    #: queixas na mesma região e lado, pela mesma pessoa, para abrir alerta
    individual_min_ocorrencias: int = 3
    #: fração do setor relatando a mesma região para abrir alerta coletivo
    coletivo_min_percentual: float = 20.0
    #: e no mínimo esta quantidade de pessoas, para não alertar setor pequeno
    coletivo_min_pessoas: int = 3


REGRAS = Regras()

PESO_SEVERIDADE: dict[str, int] = {"alta": 3, "media": 2, "baixa": 1}


def _severidade_individual(ocorrencias: int, intensidade_media: float) -> Severidade:
    if ocorrencias >= 6 or intensidade_media >= 4:
        return "alta"
    if ocorrencias >= 4 or intensidade_media >= 3:
        return "media"
    return "baixa"


def _severidade_coletiva(percentual: float) -> Severidade:
    if percentual >= 40:
        return "alta"
    if percentual >= 28:
        return "media"
    return "baixa"


def id_individual(colaborador_id: str, regiao: str, lado: str) -> str:
    return f"alr-ind-{colaborador_id}-{regiao}-{lado}"


def id_coletivo(setor_id: str, regiao: str) -> str:
    return f"alr-col-{setor_id}-{regiao}"


def janela_padrao(hoje: date | None = None) -> Janela:
    return montar_janela(REGRAS.janela_dias, hoje)


def _casos_por_alerta(consulta: ConsultaEscopada) -> dict[str, str]:
    """Liga alerta a caso já aberto, para a tela não oferecer abrir duas vezes."""
    return {
        linha.alerta_id: linha.id
        for linha in consulta.sessao.execute(
            select(Caso.alerta_id, Caso.id).where(consulta.filtro(Caso))
        ).all()
    }


def _linhas_individuais(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> Sequence[Row[Any]]:
    """A regra individual, uma vez só.

    Existe separada de `individuais` porque nem todo chamador quer alertas:
    a lista de colaboradores quer quantos cada pessoa tem, o painel quer o
    total. O `join` com Usuario fica aqui mesmo para quem só vai contar —
    manter uma definição só da regra vale mais do que os poucos
    milissegundos do join.
    """
    return consulta.sessao.execute(
        select(
            Queixa.colaborador_id,
            Usuario.nome,
            Usuario.setor_id,
            Queixa.regiao,
            Queixa.lado,
            func.count().label("ocorrencias"),
            func.avg(Queixa.intensidade).label("intensidade"),
            func.max(Queixa.data).label("ultima"),
        )
        .join(Usuario, Usuario.id == Queixa.colaborador_id)
        .where(
            consulta.filtro(Queixa),
            Queixa.colaborador_id.in_(ids),
            Queixa.data >= janela.inicio,
            Queixa.data <= janela.fim,
        )
        .group_by(Queixa.colaborador_id, Usuario.nome, Usuario.setor_id, Queixa.regiao, Queixa.lado)
        .having(func.count() >= REGRAS.individual_min_ocorrencias)
    ).all()


def individuais(
    consulta: ConsultaEscopada,
    ids: Select[tuple[str]],
    janela: Janela,
    *,
    identificar: bool,
    casos: dict[str, str] | None = None,
) -> list[AlertaIndividual]:
    """Os alertas individuais montados. `casos` já resolvido evita repetir a
    varredura quando a mesma requisição também monta os coletivos."""
    linhas = _linhas_individuais(consulta, ids, janela)
    if casos is None:
        casos = _casos_por_alerta(consulta)
    saida: list[AlertaIndividual] = []
    for linha in linhas:
        intensidade = float(linha.intensidade)
        alerta_id = id_individual(linha.colaborador_id, linha.regiao, linha.lado)
        saida.append(
            AlertaIndividual(
                id=alerta_id,
                colaborador_id=linha.colaborador_id if identificar else None,
                colaborador_nome=linha.nome if identificar else None,
                setor_id=linha.setor_id,
                regiao=linha.regiao,
                lado=linha.lado,
                ocorrencias=int(linha.ocorrencias),
                intensidade_media=intensidade,
                janela_dias=janela.dias,
                ultima_em=linha.ultima,
                severidade=_severidade_individual(int(linha.ocorrencias), intensidade),
                caso_id=casos.get(alerta_id),
            )
        )
    return saida


@dataclass(frozen=True)
class _Coletivo:
    """Um alerta coletivo antes de virar resposta: a regra já aplicada."""

    setor_id: str
    unidade_id: str
    regiao: RegiaoId
    afetados: int
    total_setor: int
    percentual: float
    ultima_em: date
    severidade: Severidade


def _linhas_coletivas(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[_Coletivo]:
    """A regra coletiva, uma vez só.

    A proporção é sempre sobre o setor inteiro, mesmo quando o recorte filtra
    por cargo: o alerta afirma algo sobre o posto de trabalho, e recalculá-lo
    dentro da fatia inventaria um percentual que não descreve nada. O recorte
    entra só depois, escolhendo quais setores aparecem.
    """
    efetivo = {
        linha.setor_id: int(linha.total)
        for linha in consulta.sessao.execute(
            select(Usuario.setor_id, func.count().label("total"))
            .where(
                consulta.filtro(Usuario),
                Usuario.role == "colaborador",
                Usuario.ativo.is_(True),
                Usuario.setor_id.is_not(None),
            )
            .group_by(Usuario.setor_id)
        ).all()
    }
    if not efetivo:
        return []

    linhas = consulta.sessao.execute(
        select(
            Usuario.setor_id,
            Setor.unidade_id,
            Queixa.regiao,
            func.count(func.distinct(Queixa.colaborador_id)).label("afetados"),
            func.max(Queixa.data).label("ultima"),
        )
        .join(Usuario, Usuario.id == Queixa.colaborador_id)
        .join(Setor, Setor.id == Usuario.setor_id)
        .where(
            consulta.filtro(Queixa),
            Queixa.data >= janela.inicio,
            Queixa.data <= janela.fim,
        )
        .group_by(Usuario.setor_id, Setor.unidade_id, Queixa.regiao)
        .having(func.count(func.distinct(Queixa.colaborador_id)) >= REGRAS.coletivo_min_pessoas)
    ).all()

    # setores que o recorte deixa ver
    visiveis = {
        setor
        for setor in consulta.sessao.scalars(
            select(Usuario.setor_id).where(Usuario.id.in_(ids)).distinct()
        ).all()
        if setor
    }

    saida: list[_Coletivo] = []
    for linha in linhas:
        if linha.setor_id not in visiveis:
            continue
        total = efetivo.get(linha.setor_id, 0)
        if not total:
            continue
        afetados = int(linha.afetados)
        percentual = (afetados / total) * 100
        if percentual < REGRAS.coletivo_min_percentual:
            continue
        saida.append(
            _Coletivo(
                setor_id=linha.setor_id,
                unidade_id=linha.unidade_id,
                regiao=linha.regiao,
                afetados=afetados,
                total_setor=total,
                percentual=percentual,
                ultima_em=linha.ultima,
                severidade=_severidade_coletiva(percentual),
            )
        )
    return saida


def coletivos(
    consulta: ConsultaEscopada,
    ids: Select[tuple[str]],
    janela: Janela,
    *,
    casos: dict[str, str] | None = None,
) -> list[AlertaColetivo]:
    """Os alertas coletivos montados."""
    if casos is None:
        casos = _casos_por_alerta(consulta)
    saida: list[AlertaColetivo] = []
    for linha in _linhas_coletivas(consulta, ids, janela):
        alerta_id = id_coletivo(linha.setor_id, linha.regiao)
        saida.append(
            AlertaColetivo(
                id=alerta_id,
                unidade_id=linha.unidade_id,
                setor_id=linha.setor_id,
                regiao=linha.regiao,
                afetados=linha.afetados,
                total_setor=linha.total_setor,
                percentual=linha.percentual,
                janela_dias=janela.dias,
                ultima_em=linha.ultima_em,
                severidade=linha.severidade,
                caso_id=casos.get(alerta_id),
            )
        )
    return saida


# ------------------------- só o número, sem a lista ---------------------------
#
# Três telas mostram quantidade de alerta, não alerta: a Visão geral conta por
# tipo e severidade, a de setores conta por setor, a de colaboradores conta por
# pessoa. Montar a lista inteira — com nome, com caso ligado, com a metade que
# a tela descarta — era o preço que cada uma pagava para chegar a um inteiro.


def contar(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], *, hoje: date | None = None
) -> ContagemAlertas:
    """Os quatro números do topo do painel."""
    janela = janela_padrao(hoje)
    severidades = [
        _severidade_individual(int(linha.ocorrencias), float(linha.intensidade))
        for linha in _linhas_individuais(consulta, ids, janela)
    ]
    coletivas = _linhas_coletivas(consulta, ids, janela)
    return ContagemAlertas(
        todos=len(severidades) + len(coletivas),
        individuais=len(severidades),
        coletivos=len(coletivas),
        alta=sum(1 for s in severidades if s == "alta")
        + sum(1 for c in coletivas if c.severidade == "alta"),
    )


def coletivos_por_setor(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], *, hoje: date | None = None
) -> dict[str, int]:
    """Quantos alertas coletivos por setor — a tela de setores não mostra os
    individuais, e antes calculava os dois para descartar metade."""
    contagem: dict[str, int] = {}
    for linha in _linhas_coletivas(consulta, ids, janela_padrao(hoje)):
        contagem[linha.setor_id] = contagem.get(linha.setor_id, 0) + 1
    return contagem


def individuais_por_colaborador(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], *, hoje: date | None = None
) -> dict[str, int]:
    """Quantos alertas individuais por pessoa — o inverso do de cima, para a
    lista de colaboradores."""
    contagem: dict[str, int] = {}
    for linha in _linhas_individuais(consulta, ids, janela_padrao(hoje)):
        contagem[linha.colaborador_id] = contagem.get(linha.colaborador_id, 0) + 1
    return contagem


def ordenar(
    alertas: list[AlertaIndividual | AlertaColetivo],
) -> list[AlertaIndividual | AlertaColetivo]:
    """Severidade desc; no empate o coletivo primeiro (uma intervenção atinge
    mais gente); depois o mais recente."""
    return sorted(
        alertas,
        key=lambda a: (
            -PESO_SEVERIDADE[a.severidade],
            0 if a.kind == "coletivo" else 1,
            # data mais recente primeiro: ordinal negativo mantém a chave crescente
            -a.ultima_em.toordinal(),
        ),
    )


def listar(
    consulta: ConsultaEscopada,
    ids: Select[tuple[str]],
    *,
    identificar: bool,
    hoje: date | None = None,
) -> list[AlertaIndividual | AlertaColetivo]:
    janela = janela_padrao(hoje)
    # uma varredura de casos para os dois: era feita dentro de cada um
    casos = _casos_por_alerta(consulta)
    return ordenar(
        [
            *individuais(consulta, ids, janela, identificar=identificar, casos=casos),
            *coletivos(consulta, ids, janela, casos=casos),
        ]
    )
