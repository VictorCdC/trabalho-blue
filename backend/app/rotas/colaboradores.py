"""Quadro de pessoal e ficha individual.

Duas camadas de acesso na mesma rota de lista:

  - `colaboradores:ver_lista` devolve o cadastral (setor, cargo, admissão,
    CPF ocultado). É o que RH e admin precisam para conferir o quadro.
  - `dados:identificados` acrescenta as colunas clínicas por pessoa. Sem a
    permissão elas vêm nulas, e não zeradas: zero seria uma afirmação sobre a
    saúde de alguém.

O CPF sai ocultado do servidor. A tela já o mostrava assim; ocultar aqui é o
que impede o número inteiro de trafegar só para desenhar `***.***.123-45`.

A ficha individual é leitura de dado identificado e por isso registra na
trilha de auditoria, com finalidade, antes de responder.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import ColumnElement, Select, func, or_, select

from app import alertas as regra_alertas
from app import auditoria, indicadores
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import (
    CasoPublico,
    ColaboradorLinha,
    QueixaPublica,
    ResumoColaborador,
    mascarar_cpf,
)
from app.models import Caso, CheckIn, Queixa, Usuario
from app.paginacao import Pagina, Paginacao, paginacao
from app.periodo import Janela, hoje, montar_janela
from app.periodo import janela as dependencia_janela
from app.rbac_gerado import pode
from app.recorte import Recorte, colaboradores, recorte

roteador = APIRouter(tags=["colaboradores"])

#: Janela da ficha individual. Noventa dias é o horizonte em que o SESMT vê
#: uma evolução sem se afogar em registro antigo.
JANELA_FICHA = 90

FINALIDADE_FICHA = "acompanhamento de saude ocupacional"


def _so_esta_pessoa(consulta: ConsultaEscopada, colaborador_id: str) -> Select[tuple[str]]:
    """Âncora de uma pessoa só, no formato que `indicadores` espera.

    A ficha é a mesma agregação do painel com o conjunto de um elemento — não
    precisa de função própria, precisa de um conjunto menor.
    """
    return select(Usuario.id).where(consulta.filtro(Usuario), Usuario.id == colaborador_id)


def _linha_cadastral(pessoa: Usuario) -> ColaboradorLinha:
    return ColaboradorLinha(
        id=pessoa.id,
        nome=pessoa.nome,
        cpf_mascarado=mascarar_cpf(pessoa.cpf),
        unidade_id=pessoa.unidade_id,
        setor_id=pessoa.setor_id,
        cargo_id=pessoa.cargo_id,
        admissao_em=pessoa.admissao_em,
        ativo=pessoa.ativo,
    )


@roteador.get("/colaboradores", response_model=Pagina[ColaboradorLinha])
def listar_colaboradores(
    requisicao: Request,
    busca: str | None = Query(None, description="Trecho do nome ou início do CPF."),
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    r: Recorte = Depends(recorte),
    janela: Janela = Depends(dependencia_janela),
    p: Paginacao = Depends(paginacao),
    usuario: Usuario = requer("colaboradores:ver_lista"),
) -> Pagina[ColaboradorLinha]:
    """Uma página do quadro de pessoal, filtrada e ordenada pelo banco."""
    identificar = pode(usuario.role, "dados:identificados")

    base = consulta.selecionar(Usuario).where(Usuario.role == "colaborador", *r.condicoes())
    if busca and busca.strip():
        termo = busca.strip()
        digitos = "".join(c for c in termo if c.isdigit())
        alternativas: list[ColumnElement[bool]] = [Usuario.nome.ilike(f"%{termo}%")]
        if digitos:
            alternativas.append(Usuario.cpf.startswith(digitos))
        base = base.where(or_(*alternativas))

    total = consulta.contar(base)
    pessoas = list(
        consulta.sessao.scalars(base.order_by(Usuario.nome).limit(p.limit).offset(p.offset)).all()
    )
    linhas = [_linha_cadastral(pessoa) for pessoa in pessoas]

    if identificar and pessoas:
        _preencher_clinico(consulta, r, janela, linhas, [pessoa.id for pessoa in pessoas])
        auditoria.registrar(
            consulta.sessao,
            acao="colaboradores:listar_identificado",
            recurso="colaborador",
            ator_id=usuario.id,
            ator_role=usuario.role,
            empresa_id=consulta.empresa_id,
            finalidade=FINALIDADE_FICHA,
            detalhe=f"{len(pessoas)} colaboradores nesta pagina",
            requisicao=requisicao,
        )
        consulta.sessao.commit()

    return Pagina.montar(linhas, total, p)


def _preencher_clinico(
    consulta: ConsultaEscopada,
    r: Recorte,
    janela: Janela,
    linhas: list[ColaboradorLinha],
    ids: list[str],
) -> None:
    """Agrega as queixas apenas das pessoas desta página.

    Antes a tela recebia as queixas da empresa inteira e refazia esta conta a
    cada tecla digitada na busca.
    """
    condicoes = [consulta.filtro(Queixa), Queixa.colaborador_id.in_(ids)]
    if janela.inicio is not None:
        condicoes += [Queixa.data >= janela.inicio, Queixa.data <= janela.fim]

    resumo = {
        linha.colaborador_id: linha
        for linha in consulta.sessao.execute(
            select(
                Queixa.colaborador_id,
                func.count().label("total"),
                func.avg(Queixa.intensidade).label("intensidade"),
                func.max(Queixa.data).label("ultima"),
            )
            .where(*condicoes)
            .group_by(Queixa.colaborador_id)
        ).all()
    }
    ranking = (
        select(
            Queixa.colaborador_id.label("colaborador_id"),
            Queixa.regiao.label("regiao"),
            func.count().label("total"),
        )
        .where(*condicoes)
        .group_by(Queixa.colaborador_id, Queixa.regiao)
        .subquery()
    )
    regiao_top = {
        linha.colaborador_id: linha.regiao
        for linha in consulta.sessao.execute(
            select(ranking.c.colaborador_id, ranking.c.regiao)
            .distinct(ranking.c.colaborador_id)
            .order_by(ranking.c.colaborador_id, ranking.c.total.desc(), ranking.c.regiao)
        ).all()
    }

    alertas_por_pessoa = regra_alertas.individuais_por_colaborador(
        consulta, colaboradores(consulta, r)
    )

    for linha in linhas:
        dados = resumo.get(linha.id)
        linha.queixas = int(dados.total) if dados else 0
        linha.intensidade_media = float(dados.intensidade) if dados else 0.0
        linha.ultima_queixa_em = dados.ultima if dados else None
        linha.regiao_top = regiao_top.get(linha.id)
        linha.alertas = alertas_por_pessoa.get(linha.id, 0)


@roteador.get("/colaboradores/{colaborador_id}", response_model=ResumoColaborador)
def obter_colaborador(
    colaborador_id: str,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("dados:identificados"),
) -> ResumoColaborador:
    """Ficha clínica de uma pessoa. Toda abertura entra na trilha."""
    pessoa = consulta.obter(Usuario, colaborador_id)
    if pessoa is None or pessoa.role != "colaborador":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Colaborador nao encontrado"
        )

    hoje_local = hoje()
    janela = montar_janela(JANELA_FICHA, hoje_local)
    janela30 = montar_janela(30, hoje_local)
    dela = _so_esta_pessoa(consulta, colaborador_id)

    queixas30, intensidade30 = consulta.sessao.execute(
        select(func.count(), func.avg(Queixa.intensidade)).where(
            consulta.filtro(Queixa),
            Queixa.colaborador_id == colaborador_id,
            Queixa.data >= janela30.inicio,
            Queixa.data <= janela30.fim,
        )
    ).one()
    queixas_janela = int(
        consulta.sessao.scalar(
            select(func.count()).where(
                consulta.filtro(Queixa),
                Queixa.colaborador_id == colaborador_id,
                Queixa.data >= janela.inicio,
                Queixa.data <= janela.fim,
            )
        )
        or 0
    )
    checkins30, bem30 = consulta.sessao.execute(
        select(func.count(), func.count().filter(CheckIn.estado == "bem")).where(
            consulta.filtro(CheckIn),
            CheckIn.colaborador_id == colaborador_id,
            CheckIn.data >= janela30.inicio,
            CheckIn.data <= janela30.fim,
        )
    ).one()

    serie, _ = indicadores.serie_diaria(consulta, dela, janela)
    casos = consulta.sessao.scalars(
        consulta.selecionar(Caso)
        .where(Caso.colaborador_id == colaborador_id)
        .order_by(Caso.atualizado_em.desc())
    ).all()

    auditoria.registrar(
        consulta.sessao,
        acao="colaborador:abrir_ficha",
        recurso="colaborador",
        recurso_id=colaborador_id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        finalidade=FINALIDADE_FICHA,
        requisicao=requisicao,
    )
    consulta.sessao.commit()

    linha = _linha_cadastral(pessoa)
    linha.queixas = queixas_janela
    return ResumoColaborador(
        colaborador=linha,
        queixas_30_dias=int(queixas30),
        queixas_janela=queixas_janela,
        checkins_30_dias=int(checkins30),
        checkins_bem_30_dias=int(bem30),
        intensidade_media_30_dias=float(intensidade30) if intensidade30 is not None else 0.0,
        sequencia_checkin=indicadores.sequencia_checkin(consulta, colaborador_id, hoje_local),
        janela_dias=JANELA_FICHA,
        regioes=indicadores.por_regiao(consulta, dela, janela),
        calor=indicadores.por_regiao_lado(consulta, dela, janela),
        serie=serie,
        alertas=regra_alertas.individuais(
            consulta, dela, regra_alertas.janela_padrao(hoje_local), identificar=True
        ),
        casos=[_caso_sem_acoes(caso, pessoa) for caso in casos],
    )


@roteador.get("/colaboradores/{colaborador_id}/queixas", response_model=Pagina[QueixaPublica])
def listar_queixas_do_colaborador(
    colaborador_id: str,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    janela: Janela = Depends(dependencia_janela),
    p: Paginacao = Depends(paginacao),
    usuario: Usuario = requer("dados:identificados"),
) -> Pagina[QueixaPublica]:
    """Registros da pessoa, do mais recente para o mais antigo.

    Paginado de verdade: a ficha abria com noventa dias de histórico inteiro
    na memória do navegador.
    """
    if consulta.obter(Usuario, colaborador_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Colaborador nao encontrado"
        )
    base = consulta.selecionar(Queixa).where(Queixa.colaborador_id == colaborador_id)
    if janela.inicio is not None:
        base = base.where(Queixa.data >= janela.inicio, Queixa.data <= janela.fim)

    total = consulta.contar(base)
    itens = consulta.sessao.scalars(
        base.order_by(Queixa.data.desc(), Queixa.id).limit(p.limit).offset(p.offset)
    ).all()
    return Pagina.montar([QueixaPublica.model_validate(q) for q in itens], total, p)


def _caso_sem_acoes(caso: Caso, pessoa: Usuario) -> CasoPublico:
    """Caso resumido para a ficha: a lista de ações mora na tela do caso.

    A ficha mostra só "3/4 ações", então vai a contagem e não o conteúdo.
    """
    publico = CasoPublico.model_validate(caso)
    publico.acoes_totais = len(caso.acoes)
    publico.acoes_concluidas = sum(1 for acao in caso.acoes if acao.concluida)
    publico.acoes = []
    if caso.colaborador_id == pessoa.id:
        publico.colaborador_nome = pessoa.nome
    return publico
