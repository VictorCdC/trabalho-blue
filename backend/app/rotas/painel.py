"""Os números do painel — já somados, já suprimidos, prontos para desenhar.

Estas rotas substituem o `snapshot()` que entregava a empresa inteira ao
navegador. Duas consequências que não são só de desempenho:

  - o RH deixa de receber queixa identificada. Antes ela chegava no pacote e a
    tela apenas não a mostrava; a permissão `dados:agregados` só valia como
    conveniência de navegação.
  - o k-mínimo passa a existir de fato. Ele é aplicado aqui, no único lugar
    onde os agregados são montados: recorte com menos de
    `K_MINIMO_AGREGACAO` pessoas não devolve número nenhum, porque
    unidade + setor + cargo combinados chegam a descrever uma pessoa só.

A supressão vale para todos os perfis, inclusive o SESMT. A regra do
CLAUDE.md não abre exceção por papel, e um agregado que muda de valor
conforme quem pergunta é um agregado em que não se pode confiar — quem tem
`dados:identificados` consulta a ficha da pessoa, que é o caminho auditado.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app import alertas as regra_alertas
from app import indicadores
from app.agregacao import divulga
from app.autorizacao import requer
from app.config import obter_config
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import PainelResumo, ResumoCargo, ResumoSetor
from app.models import Queixa, Usuario
from app.periodo import Janela
from app.periodo import janela as dependencia_janela
from app.recorte import Recorte, colaboradores, recorte

roteador = APIRouter(prefix="/painel", tags=["painel"])


@roteador.get("/resumo", response_model=PainelResumo)
def resumo(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    r: Recorte = Depends(recorte),
    janela: Janela = Depends(dependencia_janela),
    usuario: Usuario = requer("dados:agregados"),
) -> PainelResumo:
    """Todo o painel numa resposta: KPIs, série, regiões, mapa e distribuições."""
    k = obter_config().k_minimo_agregacao
    ids = colaboradores(consulta, r)
    total = indicadores.contar_colaboradores(consulta, ids)
    if not divulga(total, k):
        # nem o tamanho do grupo sai: saber que ele tem duas pessoas ja estreita
        return PainelResumo(suprimido=True, dias=janela.dias, colaboradores=None)

    serie, por_semana = indicadores.serie_diaria(consulta, ids, janela)
    return PainelResumo(
        suprimido=False,
        dias=janela.dias,
        colaboradores=total,
        kpis=indicadores.calcular_kpis(consulta, ids, janela),
        serie=serie,
        por_semana=por_semana,
        regioes=indicadores.por_regiao(consulta, ids, janela),
        calor=indicadores.por_regiao_lado(consulta, ids, janela),
        intensidades=indicadores.distribuicao_intensidade(consulta, ids, janela),
        tipos=indicadores.contagem_por(consulta, ids, janela, Queixa.tipo),
        agravantes=indicadores.contagem_por(consulta, ids, janela, Queixa.agrava),
        relacoes=indicadores.contagem_por(consulta, ids, janela, Queixa.relacao_trabalho),
        alertas=regra_alertas.contar(consulta, ids),
    )


@roteador.get("/setores", response_model=list[ResumoSetor])
def por_setor(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    r: Recorte = Depends(recorte),
    janela: Janela = Depends(dependencia_janela),
    usuario: Usuario = requer("dados:agregados"),
) -> list[ResumoSetor]:
    """Uma linha por setor. Setor pequeno aparece na lista, mas sem números."""
    k = obter_config().k_minimo_agregacao
    ids = colaboradores(consulta, r)
    alertas_por_setor = regra_alertas.coletivos_por_setor(consulta, ids)

    saida: list[ResumoSetor] = []
    for linha in indicadores.por_setor(consulta, ids, janela):
        setor_id = linha["setor_id"]
        alertas = alertas_por_setor.get(setor_id, 0)
        if not divulga(linha["tamanho_grupo"], k):
            saida.append(ResumoSetor(setor_id=setor_id, suprimido=True, alertas=alertas))
            continue
        saida.append(
            ResumoSetor(
                setor_id=setor_id,
                suprimido=False,
                total_colaboradores=linha["total_colaboradores"],
                pessoas_com_queixa=linha["pessoas_com_queixa"],
                queixas=linha["queixas"],
                intensidade_media=linha["intensidade_media"],
                adesao=linha["adesao"],
                regiao_top=linha["regiao_top"],
                percentual_afetado=linha["percentual_afetado"],
                taxa_desconforto=linha["taxa_desconforto"],
                pessoas_recorrentes=linha["pessoas_recorrentes"],
                percentual_recorrente=linha["percentual_recorrente"],
                alertas=alertas,
            )
        )
    return saida


@roteador.get("/cargos", response_model=list[ResumoCargo])
def por_cargo(
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    r: Recorte = Depends(recorte),
    janela: Janela = Depends(dependencia_janela),
    usuario: Usuario = requer("dados:agregados"),
) -> list[ResumoCargo]:
    """Uma linha por cargo — cargo costuma ser menor que setor, e é onde a
    reidentificação por combinação de filtros começa."""
    k = obter_config().k_minimo_agregacao
    ids = colaboradores(consulta, r)
    saida: list[ResumoCargo] = []
    for linha in indicadores.por_cargo(consulta, ids, janela):
        if not divulga(linha["tamanho_grupo"], k):
            saida.append(
                ResumoCargo(cargo_id=linha["cargo_id"], setor_id=linha["setor_id"], suprimido=True)
            )
            continue
        saida.append(
            ResumoCargo(
                cargo_id=linha["cargo_id"],
                setor_id=linha["setor_id"],
                suprimido=False,
                efetivo=linha["efetivo"],
                pessoas=linha["pessoas_com_queixa"],
                total=linha["total"],
                intensidade_media=linha["intensidade_media"],
                percentual=linha["percentual"],
            )
        )
    return saida
