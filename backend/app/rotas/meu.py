"""O que é do próprio colaborador: check-in, queixa e histórico.

Nenhuma rota daqui aceita "de quem" — o autor vem sempre da sessão. Era a
falha mais séria do desenho anterior: o colaborador recebia o snapshot da
empresa inteira, com as queixas dos colegas dentro, e a tela apenas filtrava
as dele na hora de desenhar.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app import indicadores
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import (
    CasoPublico,
    CheckInEntrada,
    CheckInPublico,
    MeuResumo,
    QueixaEntrada,
    QueixaPublica,
)
from app.models import Caso, CheckIn, Queixa, Usuario
from app.paginacao import Pagina, Paginacao, paginacao
from app.periodo import Janela, hoje, montar_janela
from app.periodo import janela as dependencia_janela

roteador = APIRouter(prefix="/meu", tags=["colaborador"])

#: Horizonte do mapa corporal da tela inicial.
JANELA_MAPA = 60


def _minhas(consulta: ConsultaEscopada, eu: Usuario):  # type: ignore[no-untyped-def]
    """Âncora de uma pessoa só, como `indicadores` espera."""
    return select(Usuario.id).where(consulta.filtro(Usuario), Usuario.id == eu.id)


def _registrar_checkin(
    consulta: ConsultaEscopada, eu: Usuario, estado: str, dia: object
) -> CheckIn:
    """Cria ou atualiza o check-in do dia. Um por pessoa por dia é do banco."""
    existente = consulta.sessao.scalars(
        consulta.selecionar(CheckIn).where(CheckIn.colaborador_id == eu.id, CheckIn.data == dia)
    ).one_or_none()
    if existente is not None:
        existente.estado = estado  # type: ignore[assignment]
        return existente
    novo = CheckIn(empresa_id=consulta.empresa_id, colaborador_id=eu.id, data=dia, estado=estado)
    consulta.sessao.add(novo)
    return novo


@roteador.get("/resumo", response_model=MeuResumo)
def meu_resumo(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    eu: Usuario = requer("queixa:ver_proprias"),
) -> MeuResumo:
    """A tela inicial do colaborador, pronta para desenhar."""
    hoje_local = hoje()
    janela30 = montar_janela(30, hoje_local)
    janela60 = montar_janela(JANELA_MAPA, hoje_local)
    minhas = _minhas(consulta, eu)

    checkin_hoje = consulta.sessao.scalars(
        consulta.selecionar(CheckIn).where(
            CheckIn.colaborador_id == eu.id, CheckIn.data == hoje_local
        )
    ).one_or_none()

    checkins30 = int(
        consulta.sessao.scalar(
            select(func.count()).where(
                consulta.filtro(CheckIn),
                CheckIn.colaborador_id == eu.id,
                CheckIn.data >= janela30.inicio,
                CheckIn.data <= janela30.fim,
            )
        )
        or 0
    )
    queixas30 = int(
        consulta.sessao.scalar(
            select(func.count()).where(
                consulta.filtro(Queixa),
                Queixa.colaborador_id == eu.id,
                Queixa.data >= janela30.inicio,
                Queixa.data <= janela30.fim,
            )
        )
        or 0
    )
    caso = consulta.sessao.scalars(
        consulta.selecionar(Caso)
        .where(Caso.colaborador_id == eu.id, Caso.status != "resolvido")
        .order_by(Caso.atualizado_em.desc())
        .limit(1)
    ).first()

    return MeuResumo(
        checkin_hoje=CheckInPublico.model_validate(checkin_hoje) if checkin_hoje else None,
        sequencia=indicadores.sequencia_checkin(consulta, eu.id, hoje_local),
        checkins_30_dias=checkins30,
        queixas_30_dias=queixas30,
        regioes_60_dias=indicadores.por_regiao(consulta, minhas, janela60),
        calor_60_dias=indicadores.por_regiao_lado(consulta, minhas, janela60),
        caso_ativo=_caso_do_colaborador(caso) if caso else None,
    )


@roteador.get("/queixas", response_model=Pagina[QueixaPublica])
def minhas_queixas(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    janela: Janela = Depends(dependencia_janela),
    p: Paginacao = Depends(paginacao),
    eu: Usuario = requer("queixa:ver_proprias"),
) -> Pagina[QueixaPublica]:
    """Histórico próprio, paginado. `dias=0` traz tudo, ainda uma página por vez."""
    base = consulta.selecionar(Queixa).where(Queixa.colaborador_id == eu.id)
    if janela.inicio is not None:
        base = base.where(Queixa.data >= janela.inicio, Queixa.data <= janela.fim)

    total = consulta.contar(base)
    itens = consulta.sessao.scalars(
        base.order_by(Queixa.data.desc(), Queixa.id).limit(p.limit).offset(p.offset)
    ).all()
    return Pagina.montar([QueixaPublica.model_validate(q) for q in itens], total, p)


@roteador.get("/checkins", response_model=list[CheckInPublico])
def meus_checkins(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    janela: Janela = Depends(dependencia_janela),
    eu: Usuario = requer("queixa:ver_proprias"),
) -> list[CheckInPublico]:
    """A faixa de dias da tela de histórico. Sem paginar: a janela já limita."""
    base = consulta.selecionar(CheckIn).where(CheckIn.colaborador_id == eu.id)
    if janela.inicio is not None:
        base = base.where(CheckIn.data >= janela.inicio, CheckIn.data <= janela.fim)
    return [
        CheckInPublico.model_validate(c)
        for c in consulta.sessao.scalars(base.order_by(CheckIn.data)).all()
    ]


@roteador.post("/checkins", response_model=CheckInPublico, status_code=status.HTTP_201_CREATED)
def registrar_checkin(
    entrada: CheckInEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    eu: Usuario = requer("checkin:registrar"),
) -> CheckIn:
    checkin = _registrar_checkin(consulta, eu, entrada.estado, hoje())
    consulta.sessao.commit()
    return checkin


@roteador.post("/queixas", response_model=QueixaPublica, status_code=status.HTTP_201_CREATED)
def registrar_queixa(
    entrada: QueixaEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    eu: Usuario = requer("queixa:registrar"),
) -> Queixa:
    """Registra a queixa e marca o dia como de desconforto.

    Um dia com queixa é sempre um dia de desconforto: sem isso a taxa de
    desconforto contaria o denominador e não o numerador.
    """
    if eu.empresa_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Conta sem empresa nao registra queixa"
        )
    dia = hoje()
    queixa = Queixa(
        empresa_id=consulta.empresa_id,
        colaborador_id=eu.id,
        data=dia,
        regiao=entrada.regiao,
        lado=entrada.lado,
        intensidade=entrada.intensidade,
        tipo=entrada.tipo,
        inicio=entrada.inicio,
        agrava=entrada.agrava,
        relacao_trabalho=entrada.relacao_trabalho,
        observacao=entrada.observacao,
    )
    consulta.sessao.add(queixa)
    _registrar_checkin(consulta, eu, "desconforto", dia)
    consulta.sessao.commit()
    return queixa


def _caso_do_colaborador(caso: Caso) -> CasoPublico:
    publico = CasoPublico.model_validate(caso)
    publico.acoes_totais = len(caso.acoes)
    publico.acoes_concluidas = sum(1 for acao in caso.acoes if acao.concluida)
    publico.acoes = []
    return publico
