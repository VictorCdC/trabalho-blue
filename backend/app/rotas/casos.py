"""Casos: o acompanhamento que o SESMT abre a partir de um alerta.

Ver exige `casos:ver`; mexer exige `casos:gerenciar`. Quem vê sem
`dados:identificados` recebe o caso sem o nome da pessoa — o caso continua
existindo para o gestor, só não diz de quem é.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app import alertas as regra_alertas
from app import auditoria
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import (
    AcaoConclusaoEntrada,
    AcaoEntrada,
    CasoEntrada,
    CasoPublico,
    CasoStatusEntrada,
    ContagemCasos,
)
from app.models import AcaoCaso, Caso, Usuario
from app.paginacao import Pagina, Paginacao, paginacao
from app.periodo import hoje
from app.rbac_gerado import pode
from app.recorte import Recorte, colaboradores

roteador = APIRouter(tags=["casos"])


def _nomes(consulta: ConsultaEscopada, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    return {
        linha.id: linha.nome
        for linha in consulta.sessao.execute(
            select(Usuario.id, Usuario.nome).where(consulta.filtro(Usuario), Usuario.id.in_(ids))
        ).all()
    }


def _publicar(
    caso: Caso, nomes: dict[str, str], *, identificar: bool, com_acoes: bool
) -> CasoPublico:
    publico = CasoPublico.model_validate(caso)
    publico.acoes_totais = len(caso.acoes)
    publico.acoes_concluidas = sum(1 for acao in caso.acoes if acao.concluida)
    if not com_acoes:
        publico.acoes = []
    publico.responsavel_nome = nomes.get(caso.responsavel_id)
    if not identificar:
        # o caso continua existindo para o gestor; so nao diz de quem e
        publico.colaborador_id = None
        publico.colaborador_nome = None
    elif caso.colaborador_id:
        publico.colaborador_nome = nomes.get(caso.colaborador_id)
    return publico


@roteador.get("/casos/contagem", response_model=ContagemCasos)
def contar_casos(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:ver"),
) -> ContagemCasos:
    """As abas da tela de casos, sem baixar os casos para contá-los."""
    por_status = {
        linha.status: int(linha.total)
        for linha in consulta.sessao.execute(
            select(Caso.status, func.count().label("total"))
            .where(consulta.filtro(Caso))
            .group_by(Caso.status)
        ).all()
    }
    return ContagemCasos(
        todos=sum(por_status.values()),
        aberto=por_status.get("aberto", 0),
        em_andamento=por_status.get("em_andamento", 0),
        resolvido=por_status.get("resolvido", 0),
    )


@roteador.get("/casos", response_model=Pagina[CasoPublico])
def listar_casos(
    situacao: Literal["todos", "aberto", "em_andamento", "resolvido"] = Query(
        "todos", alias="status"
    ),
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    p: Paginacao = Depends(paginacao),
    usuario: Usuario = requer("casos:ver"),
) -> Pagina[CasoPublico]:
    """Lista paginada, do mais recentemente atualizado para o mais antigo.

    As ações não vão na listagem: a tela só mostra "3/4", e é a contagem que
    ela recebe.
    """
    identificar = pode(usuario.role, "dados:identificados")
    base = consulta.selecionar(Caso)
    if situacao != "todos":
        base = base.where(Caso.status == situacao)

    total = consulta.contar(base)
    casos = list(
        consulta.sessao.scalars(
            base.order_by(Caso.atualizado_em.desc(), Caso.numero.desc())
            .limit(p.limit)
            .offset(p.offset)
        ).all()
    )
    nomes = _nomes(
        consulta,
        {c.responsavel_id for c in casos} | {c.colaborador_id for c in casos if c.colaborador_id},
    )
    itens = [_publicar(c, nomes, identificar=identificar, com_acoes=False) for c in casos]
    return Pagina.montar(itens, total, p)


@roteador.get("/casos/{caso_id}", response_model=CasoPublico)
def obter_caso(
    caso_id: str,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:ver"),
) -> CasoPublico:
    caso = _buscar(consulta, caso_id)
    identificar = pode(usuario.role, "dados:identificados")
    nomes = _nomes(
        consulta, {caso.responsavel_id} | ({caso.colaborador_id} if caso.colaborador_id else set())
    )
    if caso.colaborador_id and identificar:
        # abrir um caso individual é ler o dado clínico de alguém com nome
        auditoria.registrar(
            consulta.sessao,
            acao="caso:abrir",
            recurso="caso",
            recurso_id=caso.id,
            ator_id=usuario.id,
            ator_role=usuario.role,
            empresa_id=consulta.empresa_id,
            finalidade="conducao de caso de saude ocupacional",
            requisicao=requisicao,
        )
        consulta.sessao.commit()
    return _publicar(caso, nomes, identificar=identificar, com_acoes=True)


@roteador.post("/casos", response_model=CasoPublico, status_code=status.HTTP_201_CREATED)
def abrir_caso(
    entrada: CasoEntrada,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:gerenciar"),
) -> CasoPublico:
    """Abre o caso a partir de um alerta.

    O alerta é derivado, então o servidor o recalcula e confere que ele existe
    de verdade — aceitar os dados do alerta pelo corpo da requisição deixaria
    o cliente inventar severidade e região.
    """
    existente = consulta.sessao.scalars(
        consulta.selecionar(Caso).where(Caso.alerta_id == entrada.alerta_id)
    ).one_or_none()
    if existente is not None:
        nomes = _nomes(
            consulta,
            {existente.responsavel_id}
            | ({existente.colaborador_id} if existente.colaborador_id else set()),
        )
        return _publicar(
            existente, nomes, identificar=pode(usuario.role, "dados:identificados"), com_acoes=True
        )

    todos = Recorte(unidade_id=None, setor_id=None, cargo_id=None)
    alerta = next(
        (
            a
            for a in regra_alertas.listar(
                consulta, colaboradores(consulta, todos), identificar=True
            )
            if a.id == entrada.alerta_id
        ),
        None,
    )
    if alerta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta nao existe mais: a recorrencia pode ter saido da janela de 30 dias",
        )

    dia = hoje()
    proximo = (
        consulta.sessao.scalar(select(func.max(Caso.numero)).where(consulta.filtro(Caso))) or 0
    ) + 1
    caso = Caso(
        empresa_id=consulta.empresa_id,
        numero=proximo,
        alerta_id=alerta.id,
        origem=alerta.kind,
        regiao=alerta.regiao,
        lado=alerta.lado if alerta.kind == "individual" else "na",
        colaborador_id=alerta.colaborador_id if alerta.kind == "individual" else None,
        setor_id=alerta.setor_id,
        status="aberto",
        severidade=alerta.severidade,
        responsavel_id=usuario.id,
        aberto_em=dia,
        atualizado_em=dia,
    )
    consulta.sessao.add(caso)
    auditoria.registrar(
        consulta.sessao,
        acao="caso:abrir_novo",
        recurso="caso",
        recurso_id=caso.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        finalidade="conducao de caso de saude ocupacional",
        detalhe=f"alerta {alerta.id}",
        requisicao=requisicao,
    )
    consulta.sessao.commit()
    nomes = _nomes(
        consulta, {caso.responsavel_id} | ({caso.colaborador_id} if caso.colaborador_id else set())
    )
    return _publicar(
        caso, nomes, identificar=pode(usuario.role, "dados:identificados"), com_acoes=True
    )


@roteador.patch("/casos/{caso_id}", response_model=CasoPublico)
def mudar_status(
    caso_id: str,
    entrada: CasoStatusEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:gerenciar"),
) -> CasoPublico:
    caso = _buscar(consulta, caso_id)
    caso.status = entrada.status
    caso.atualizado_em = hoje()
    consulta.sessao.commit()
    return _publicar(
        caso,
        _nomes_do_caso(consulta, caso),
        identificar=pode(usuario.role, "dados:identificados"),
        com_acoes=True,
    )


@roteador.post(
    "/casos/{caso_id}/acoes", response_model=CasoPublico, status_code=status.HTTP_201_CREATED
)
def adicionar_acao(
    caso_id: str,
    entrada: AcaoEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:gerenciar"),
) -> CasoPublico:
    caso = _buscar(consulta, caso_id)
    dia = hoje()
    caso.acoes.append(
        AcaoCaso(
            empresa_id=consulta.empresa_id,
            caso_id=caso.id,
            data=dia,
            tipo=entrada.tipo,
            descricao=entrada.descricao,
            autor_id=usuario.id,
            concluida=entrada.concluida,
        )
    )
    caso.atualizado_em = dia
    # registrar a primeira ação é o que tira o caso da fila de "ninguém olhou"
    if caso.status == "aberto":
        caso.status = "em_andamento"
    consulta.sessao.commit()
    return _publicar(
        caso,
        _nomes_do_caso(consulta, caso),
        identificar=pode(usuario.role, "dados:identificados"),
        com_acoes=True,
    )


@roteador.patch("/casos/{caso_id}/acoes/{acao_id}", response_model=CasoPublico)
def concluir_acao(
    caso_id: str,
    acao_id: str,
    entrada: AcaoConclusaoEntrada,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("casos:gerenciar"),
) -> CasoPublico:
    caso = _buscar(consulta, caso_id)
    acao = next((a for a in caso.acoes if a.id == acao_id), None)
    if acao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acao nao encontrada")
    acao.concluida = entrada.concluida
    caso.atualizado_em = hoje()
    consulta.sessao.commit()
    return _publicar(
        caso,
        _nomes_do_caso(consulta, caso),
        identificar=pode(usuario.role, "dados:identificados"),
        com_acoes=True,
    )


def _buscar(consulta: ConsultaEscopada, caso_id: str) -> Caso:
    caso = consulta.obter(Caso, caso_id)
    if caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso nao encontrado")
    return caso


def _nomes_do_caso(consulta: ConsultaEscopada, caso: Caso) -> dict[str, str]:
    return _nomes(
        consulta, {caso.responsavel_id} | ({caso.colaborador_id} if caso.colaborador_id else set())
    )
