"""As agregações do painel, feitas no banco.

Cada função aqui era um `useMemo` no navegador operando sobre o histórico
inteiro da empresa — o array que a tela recebia inteiro para depois somar.
Agora o Postgres soma e agrupa, e a tela recebe o resultado.

Nada neste módulo decide se o número **pode** ser divulgado: a supressão de
grupo pequeno é regra de privacidade e mora em `app/agregacao.py`, aplicada
pelas rotas. Aqui só se conta.

As funções não são handlers, e por isso montam `select()` diretamente — mas
sempre a partir de `consulta.filtro(Modelo)`, que é o mesmo predicado de
tenant que a ConsultaEscopada usa.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Select, func, select

from app.consulta import ConsultaEscopada
from app.esquemas import (
    ContagemRegiao,
    ContagemRegiaoLado,
    ContagemRotulada,
    FatiaIntensidade,
    Kpis,
    PontoSerie,
)
from app.models import CheckIn, Queixa, Usuario
from app.periodo import Janela, dias_uteis

#: Acima disto o gráfico diário vira serrilha ilegível e a série sai por semana.
LIMITE_SERIE_SEMANAL = 45

#: Queixas na mesma região e lado, pela mesma pessoa, para considerá-la
#: recorrente. É o mesmo limiar que abre alerta individual (app/alertas.py).
MIN_OCORRENCIAS_RECORRENCIA = 3


def _no_periodo(coluna: Any, janela: Janela) -> list[ColumnElement[bool]]:
    if janela.inicio is None:
        return []
    return [coluna >= janela.inicio, coluna <= janela.fim]


def _float(valor: Any) -> float:
    return float(valor) if valor is not None else 0.0


def _pct(parte: float, total: float) -> float:
    return (parte / total) * 100 if total else 0.0


def _queixas_de(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[ColumnElement[bool]]:
    return [
        consulta.filtro(Queixa),
        Queixa.colaborador_id.in_(ids),
        *_no_periodo(Queixa.data, janela),
    ]


def _checkins_de(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[ColumnElement[bool]]:
    return [
        consulta.filtro(CheckIn),
        CheckIn.colaborador_id.in_(ids),
        *_no_periodo(CheckIn.data, janela),
    ]


def contar_colaboradores(consulta: ConsultaEscopada, ids: Select[tuple[str]]) -> int:
    total = consulta.sessao.scalar(select(func.count()).select_from(ids.subquery()))
    return int(total or 0)


def _contar_recorrentes(
    consulta: ConsultaEscopada, condicoes: Sequence[ColumnElement[bool]]
) -> int:
    """Pessoas que cruzaram o limiar de repetição na mesma região e lado."""
    repeticoes = (
        select(Queixa.colaborador_id)
        .where(*condicoes)
        .group_by(Queixa.colaborador_id, Queixa.regiao, Queixa.lado)
        .having(func.count() >= MIN_OCORRENCIAS_RECORRENCIA)
        .subquery()
    )
    total = consulta.sessao.scalar(
        select(func.count(func.distinct(repeticoes.c.colaborador_id))).select_from(repeticoes)
    )
    return int(total or 0)


def calcular_kpis(consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela) -> Kpis:
    """Os doze números do topo do painel, em quatro consultas."""
    ativos = contar_colaboradores(consulta, ids)
    condicoes_q = _queixas_de(consulta, ids, janela)

    total_q, pessoas, intensidade, nexo_sim = consulta.sessao.execute(
        select(
            func.count(),
            func.count(func.distinct(Queixa.colaborador_id)),
            func.avg(Queixa.intensidade),
            func.count().filter(Queixa.relacao_trabalho == "sim"),
        ).where(*condicoes_q)
    ).one()

    checkins = int(
        consulta.sessao.scalar(select(func.count()).where(*_checkins_de(consulta, ids, janela)))
        or 0
    )

    # variação: mesma janela deslocada para trás. Sem janela ("tudo") não há
    # período anterior com que comparar, e a variação fica em zero.
    anteriores = 0
    if not janela.tudo:
        anteriores = int(
            consulta.sessao.scalar(
                select(func.count()).where(*_queixas_de(consulta, ids, janela.anterior()))
            )
            or 0
        )

    recorrentes = _contar_recorrentes(consulta, condicoes_q)

    # adesão: check-ins feitos sobre check-ins possíveis (pessoas × dias úteis).
    # Em "tudo" não existe denominador, então o indicador não se aplica.
    possiveis = ativos * dias_uteis(janela.dias) if not janela.tudo else 0
    adesao = min(100.0, _pct(checkins, possiveis)) if possiveis else 0.0

    return Kpis(
        colaboradores_ativos=ativos,
        checkins=checkins,
        adesao=adesao,
        queixas=int(total_q),
        pessoas_com_queixa=int(pessoas),
        percentual_afetado=_pct(int(pessoas), ativos),
        intensidade_media=_float(intensidade),
        relacao_trabalho_sim=_pct(int(nexo_sim), int(total_q)),
        variacao_queixas=_pct(int(total_q) - anteriores, anteriores),
        taxa_desconforto=_pct(int(total_q), checkins),
        pessoas_recorrentes=recorrentes,
        percentual_recorrente=_pct(recorrentes, ativos),
    )


def _agrupar_por_semana(serie: list[PontoSerie]) -> list[PontoSerie]:
    """Blocos de sete dias, rotulados pelo primeiro dia do bloco."""
    saida: list[PontoSerie] = []
    for i in range(0, len(serie), 7):
        bloco = serie[i : i + 7]
        com_queixa = [p.intensidade_media for p in bloco if p.queixas]
        saida.append(
            PontoSerie(
                data=bloco[0].data,
                queixas=sum(p.queixas for p in bloco),
                checkins=sum(p.checkins for p in bloco),
                bem=sum(p.bem for p in bloco),
                intensidade_media=sum(com_queixa) / len(com_queixa) if com_queixa else 0.0,
            )
        )
    return saida


def serie_diaria(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> tuple[list[PontoSerie], bool]:
    """Série temporal do recorte e se ela saiu agrupada por semana.

    Dias sem registro entram com zero: o buraco no gráfico é informação, e
    deixá-lo de fora faria a linha mentir sobre a continuidade.
    """
    if janela.inicio is None:
        # "tudo" não tem eixo de tempo com começo; nenhuma tela pede série assim
        return [], False

    por_dia_q = {
        linha.data: linha
        for linha in consulta.sessao.execute(
            select(
                Queixa.data.label("data"),
                func.count().label("total"),
                func.avg(Queixa.intensidade).label("intensidade"),
            )
            .where(*_queixas_de(consulta, ids, janela))
            .group_by(Queixa.data)
        ).all()
    }
    por_dia_c = {
        linha.data: linha
        for linha in consulta.sessao.execute(
            select(
                CheckIn.data.label("data"),
                func.count().label("total"),
                func.count().filter(CheckIn.estado == "bem").label("bem"),
            )
            .where(*_checkins_de(consulta, ids, janela))
            .group_by(CheckIn.data)
        ).all()
    }

    serie: list[PontoSerie] = []
    for i in range(janela.dias):
        dia = janela.inicio + timedelta(days=i)
        q = por_dia_q.get(dia)
        c = por_dia_c.get(dia)
        serie.append(
            PontoSerie(
                data=dia,
                queixas=int(q.total) if q else 0,
                checkins=int(c.total) if c else 0,
                bem=int(c.bem) if c else 0,
                intensidade_media=_float(q.intensidade) if q else 0.0,
            )
        )

    if janela.dias > LIMITE_SERIE_SEMANAL:
        return _agrupar_por_semana(serie), True
    return serie, False


def _select_regioes(condicoes: Sequence[ColumnElement[bool]], com_lado: bool) -> Select[Any]:
    colunas: list[Any] = [Queixa.regiao]
    if com_lado:
        colunas.append(Queixa.lado)
    return (
        select(
            *colunas,
            func.count().label("total"),
            func.count(func.distinct(Queixa.colaborador_id)).label("pessoas"),
            func.avg(Queixa.intensidade).label("intensidade"),
        )
        .where(*condicoes)
        .group_by(*colunas)
        .order_by(func.count().desc())
    )


def por_regiao(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[ContagemRegiao]:
    condicoes = _queixas_de(consulta, ids, janela)
    return [
        ContagemRegiao(
            regiao=linha.regiao,
            total=int(linha.total),
            pessoas=int(linha.pessoas),
            intensidade_media=_float(linha.intensidade),
        )
        for linha in consulta.sessao.execute(_select_regioes(condicoes, com_lado=False)).all()
    ]


def por_regiao_lado(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[ContagemRegiaoLado]:
    """Separa esquerdo de direito — o mapa de calor não pode pintar os dois
    punhos quando só um dói."""
    condicoes = _queixas_de(consulta, ids, janela)
    return [
        ContagemRegiaoLado(
            regiao=linha.regiao,
            lado=linha.lado,
            total=int(linha.total),
            pessoas=int(linha.pessoas),
            intensidade_media=_float(linha.intensidade),
        )
        for linha in consulta.sessao.execute(_select_regioes(condicoes, com_lado=True)).all()
    ]


def distribuicao_intensidade(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[FatiaIntensidade]:
    contagem = {
        int(linha.intensidade): int(linha.total)
        for linha in consulta.sessao.execute(
            select(Queixa.intensidade.label("intensidade"), func.count().label("total"))
            .where(*_queixas_de(consulta, ids, janela))
            .group_by(Queixa.intensidade)
        ).all()
    }
    # a barra empilhada tem sempre as cinco faixas, mesmo as vazias
    return [FatiaIntensidade(intensidade=i, total=contagem.get(i, 0)) for i in range(1, 6)]


def contagem_por(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela, coluna: Any
) -> list[ContagemRotulada]:
    """Quantas queixas por valor de um campo de vocabulário fechado.

    O rótulo legível continua no frontend (`format.ts`): é texto de interface,
    não dado.
    """
    return [
        ContagemRotulada(chave=linha[0], total=int(linha.total))
        for linha in consulta.sessao.execute(
            select(coluna, func.count().label("total"))
            .where(*_queixas_de(consulta, ids, janela))
            .group_by(coluna)
            .order_by(func.count().desc())
        ).all()
    ]


# --------------------------- agregados por grupo ------------------------------
#
# Setor e cargo são os recortes que o k-mínimo protege: é combinando-os que um
# "agregado" passa a descrever uma pessoa só.


def _regiao_top_por(
    consulta: ConsultaEscopada, condicoes: Sequence[ColumnElement[bool]], grupo: Any
) -> dict[str, str]:
    """Região mais relatada de cada grupo, resolvida com DISTINCT ON."""
    ranking = (
        select(grupo.label("grupo"), Queixa.regiao.label("regiao"), func.count().label("total"))
        .join(Usuario, Usuario.id == Queixa.colaborador_id)
        .where(*condicoes)
        .group_by(grupo, Queixa.regiao)
        .subquery()
    )
    linhas = consulta.sessao.execute(
        select(ranking.c.grupo, ranking.c.regiao)
        .distinct(ranking.c.grupo)
        .order_by(ranking.c.grupo, ranking.c.total.desc(), ranking.c.regiao)
    ).all()
    return {linha.grupo: linha.regiao for linha in linhas if linha.grupo}


def por_setor(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[dict[str, Any]]:
    """Uma linha por setor do recorte, com os números que a tela ordena.

    Devolve dicionário cru de propósito: quem chama ainda precisa passar pelo
    k-mínimo antes de transformar isto em resposta.
    """
    condicoes_q = [*_queixas_de(consulta, ids, janela), Usuario.setor_id.is_not(None)]

    membros = {
        linha.setor_id: int(linha.total)
        for linha in consulta.sessao.execute(
            select(Usuario.setor_id, func.count().label("total"))
            .where(Usuario.id.in_(ids), Usuario.setor_id.is_not(None))
            .group_by(Usuario.setor_id)
        ).all()
    }
    if not membros:
        return []

    queixas = {
        linha.setor_id: linha
        for linha in consulta.sessao.execute(
            select(
                Usuario.setor_id,
                func.count().label("total"),
                func.count(func.distinct(Queixa.colaborador_id)).label("pessoas"),
                func.avg(Queixa.intensidade).label("intensidade"),
            )
            .join(Usuario, Usuario.id == Queixa.colaborador_id)
            .where(*condicoes_q)
            .group_by(Usuario.setor_id)
        ).all()
    }
    checkins = {
        linha.setor_id: int(linha.total)
        for linha in consulta.sessao.execute(
            select(Usuario.setor_id, func.count().label("total"))
            # o SELECT so cita colunas de Usuario: sem o select_from explicito o
            # SQLAlchemy nao sabe de que lado comecar o join
            .select_from(CheckIn)
            .join(Usuario, Usuario.id == CheckIn.colaborador_id)
            .where(*_checkins_de(consulta, ids, janela), Usuario.setor_id.is_not(None))
            .group_by(Usuario.setor_id)
        ).all()
    }

    repeticoes = (
        select(Usuario.setor_id.label("setor_id"), Queixa.colaborador_id.label("colaborador_id"))
        .join(Usuario, Usuario.id == Queixa.colaborador_id)
        .where(*condicoes_q)
        .group_by(Usuario.setor_id, Queixa.colaborador_id, Queixa.regiao, Queixa.lado)
        .having(func.count() >= MIN_OCORRENCIAS_RECORRENCIA)
        .subquery()
    )
    recorrentes = {
        linha.setor_id: int(linha.total)
        for linha in consulta.sessao.execute(
            select(
                repeticoes.c.setor_id,
                func.count(func.distinct(repeticoes.c.colaborador_id)).label("total"),
            ).group_by(repeticoes.c.setor_id)
        ).all()
    }
    regiao_top = _regiao_top_por(consulta, condicoes_q, Usuario.setor_id)

    uteis = dias_uteis(janela.dias) if not janela.tudo else 0
    linhas: list[dict[str, Any]] = []
    for setor_id, total_membros in membros.items():
        q = queixas.get(setor_id)
        total_q = int(q.total) if q else 0
        pessoas = int(q.pessoas) if q else 0
        cs = checkins.get(setor_id, 0)
        rec = recorrentes.get(setor_id, 0)
        linhas.append(
            {
                "setor_id": setor_id,
                # tamanho do grupo: e sobre ele que o k-minimo decide
                "tamanho_grupo": total_membros,
                "total_colaboradores": total_membros,
                "pessoas_com_queixa": pessoas,
                "queixas": total_q,
                "intensidade_media": _float(q.intensidade) if q else 0.0,
                "adesao": min(100.0, _pct(cs, total_membros * uteis)) if uteis else 0.0,
                "regiao_top": regiao_top.get(setor_id),
                "percentual_afetado": _pct(pessoas, total_membros),
                "taxa_desconforto": _pct(total_q, cs),
                "pessoas_recorrentes": rec,
                "percentual_recorrente": _pct(rec, total_membros),
            }
        )
    linhas.sort(
        key=lambda linha: (linha["percentual_recorrente"], linha["taxa_desconforto"]), reverse=True
    )
    return linhas


def por_cargo(
    consulta: ConsultaEscopada, ids: Select[tuple[str]], janela: Janela
) -> list[dict[str, Any]]:
    """Uma linha por cargo — onde a função, e não o setor, é o fator."""
    condicoes_q = [*_queixas_de(consulta, ids, janela), Usuario.cargo_id.is_not(None)]

    efetivo = {
        linha.cargo_id: (int(linha.total), linha.setor_id)
        for linha in consulta.sessao.execute(
            # o label não é enfeite: sem ele a coluna chega como `min_1` e a
            # linha, lida por nome, estoura
            select(
                Usuario.cargo_id,
                func.count().label("total"),
                func.min(Usuario.setor_id).label("setor_id"),
            )
            .where(Usuario.id.in_(ids), Usuario.cargo_id.is_not(None))
            .group_by(Usuario.cargo_id)
        ).all()
    }
    if not efetivo:
        return []

    queixas = {
        linha.cargo_id: linha
        for linha in consulta.sessao.execute(
            select(
                Usuario.cargo_id,
                func.count().label("total"),
                func.count(func.distinct(Queixa.colaborador_id)).label("pessoas"),
                func.avg(Queixa.intensidade).label("intensidade"),
            )
            .join(Usuario, Usuario.id == Queixa.colaborador_id)
            .where(*condicoes_q)
            .group_by(Usuario.cargo_id)
        ).all()
    }

    linhas: list[dict[str, Any]] = []
    for cargo_id, (total_efetivo, setor_id) in efetivo.items():
        q = queixas.get(cargo_id)
        if q is None:
            # a tela lista cargos que relataram algo; sem queixa não há linha
            continue
        pessoas = int(q.pessoas)
        linhas.append(
            {
                "cargo_id": cargo_id,
                "setor_id": setor_id,
                # tamanho do grupo: e sobre ele que o k-minimo decide
                "tamanho_grupo": total_efetivo,
                "efetivo": total_efetivo,
                "pessoas_com_queixa": pessoas,
                "total": int(q.total),
                "intensidade_media": _float(q.intensidade),
                "percentual": _pct(pessoas, total_efetivo),
            }
        )
    linhas.sort(key=lambda linha: linha["percentual"], reverse=True)
    return linhas


def sequencia_checkin(consulta: ConsultaEscopada, colaborador_id: str, hoje: date) -> int:
    """Dias úteis seguidos com check-in, contando de hoje para trás.

    Fim de semana não quebra a sequência — ninguém registra desconforto de
    trabalho no domingo, e cobrar isso transformaria o indicador em ruído.
    """
    registrados = {
        linha
        for linha in consulta.sessao.scalars(
            select(CheckIn.data).where(
                consulta.filtro(CheckIn),
                CheckIn.colaborador_id == colaborador_id,
                CheckIn.data > hoje - timedelta(days=120),
            )
        ).all()
    }
    sequencia = 0
    for distancia in range(120):
        dia = hoje - timedelta(days=distancia)
        if dia.weekday() >= 5:
            continue
        if dia in registrados:
            sequencia += 1
        elif distancia > 0:
            break
    return sequencia
