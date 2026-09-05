"""Os agregados do painel: a conta certa e o que não pode ser divulgado.

Este arquivo existe por causa de duas regras do CLAUDE.md que antes não tinham
como falhar, porque não havia agregado no servidor: a supressão de grupo
pequeno e a proibição de dado identificado fora do SESMT.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import obter_config

K = obter_config().k_minimo_agregacao


def _abrir(
    cliente: TestClient, criar_usuario, empresa, autenticar, papel: str = "rh"
) -> TestClient:
    """Loga um perfil que abre o painel e devolve o cliente com o cookie."""
    autenticar(criar_usuario(papel, empresa_id=empresa.id))
    return cliente


def test_recorte_menor_que_k_nao_divulga_nem_o_tamanho(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    """Unidade + setor + cargo combinados chegam a descrever uma pessoa só."""
    for _ in range(K - 1):
        criar_queixa(criar_colaborador())
    _abrir(cliente, criar_usuario, empresa, autenticar)

    corpo = cliente.get("/painel/resumo").json()

    assert corpo["suprimido"] is True
    assert corpo["kpis"] is None
    assert corpo["serie"] == []
    # nem a contagem sai: "o grupo tem 4 pessoas" já estreita demais
    assert corpo["colaboradores"] is None


def test_recorte_no_limite_de_k_divulga(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    for _ in range(K):
        criar_queixa(criar_colaborador())
    _abrir(cliente, criar_usuario, empresa, autenticar)

    corpo = cliente.get("/painel/resumo").json()

    assert corpo["suprimido"] is False
    assert corpo["colaboradores"] == K
    assert corpo["kpis"]["queixas"] == K


def test_setor_pequeno_e_suprimido_sem_derrubar_o_grande(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    """A supressão é por grupo: um setor pequeno não apaga o resto da tela."""
    for _ in range(K):
        criar_queixa(criar_colaborador(setor="estoque", cargo="conferente"))
    criar_queixa(criar_colaborador(setor="producao", cargo="montador"))
    _abrir(cliente, criar_usuario, empresa, autenticar)

    por_setor = {linha["setorId"]: linha for linha in cliente.get("/painel/setores").json()}
    suprimidos = [linha for linha in por_setor.values() if linha["suprimido"]]
    divulgados = [linha for linha in por_setor.values() if not linha["suprimido"]]

    assert len(suprimidos) == 1
    assert suprimidos[0]["queixas"] is None
    assert suprimidos[0]["totalColaboradores"] is None
    assert len(divulgados) == 1
    assert divulgados[0]["totalColaboradores"] == K


def test_a_supressao_vale_tambem_para_o_sesmt(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    """A regra não abre exceção por papel.

    Quem tem `dados:identificados` chega ao dado da pessoa pela ficha, que é
    auditada — não por um agregado que muda de valor conforme quem pergunta.
    """
    criar_queixa(criar_colaborador())
    _abrir(cliente, criar_usuario, empresa, autenticar, papel="sesmt")

    assert cliente.get("/painel/resumo").json()["suprimido"] is True


def test_kpis_contam_o_que_a_tela_mostrava(
    cliente,
    criar_usuario,
    empresa,
    autenticar,
    criar_colaborador,
    criar_queixa,
    criar_checkin,
) -> None:
    pessoas = [criar_colaborador() for _ in range(K)]
    # uma pessoa com três registros na mesma região vira "recorrente"
    for atras in (0, 1, 2):
        criar_queixa(pessoas[0], atras=atras, intensidade=4)
    criar_queixa(pessoas[1], atras=0, intensidade=2, relacao="nao")
    for pessoa in pessoas:
        criar_checkin(pessoa, atras=0)
    _abrir(cliente, criar_usuario, empresa, autenticar)

    kpis = cliente.get("/painel/resumo?dias=30").json()["kpis"]

    assert kpis["queixas"] == 4
    assert kpis["pessoasComQueixa"] == 2
    assert kpis["colaboradoresAtivos"] == K
    assert kpis["pessoasRecorrentes"] == 1
    assert kpis["checkins"] == K
    # três queixas de intensidade 4 e uma de 2
    assert round(kpis["intensidadeMedia"], 2) == 3.5
    # três de quatro registros apontam nexo com o trabalho
    assert round(kpis["relacaoTrabalhoSim"]) == 75


def test_janela_de_dias_corta_no_banco(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    """O filtro de data virou parâmetro: fora da janela não sai do Postgres."""
    pessoas = [criar_colaborador() for _ in range(K)]
    criar_queixa(pessoas[0], atras=0)
    criar_queixa(pessoas[1], atras=45)
    _abrir(cliente, criar_usuario, empresa, autenticar)

    assert cliente.get("/painel/resumo?dias=7").json()["kpis"]["queixas"] == 1
    assert cliente.get("/painel/resumo?dias=60").json()["kpis"]["queixas"] == 2


def test_serie_tem_um_ponto_por_dia_da_janela(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    """Dia sem registro entra com zero: buraco no gráfico é informação."""
    pessoas = [criar_colaborador() for _ in range(K)]
    criar_queixa(pessoas[0], atras=0)
    _abrir(cliente, criar_usuario, empresa, autenticar)

    corpo = cliente.get("/painel/resumo?dias=7").json()

    assert corpo["porSemana"] is False
    assert len(corpo["serie"]) == 7
    assert sum(ponto["queixas"] for ponto in corpo["serie"]) == 1


def test_janela_longa_vem_agrupada_por_semana(
    cliente, criar_usuario, empresa, autenticar, criar_colaborador, criar_queixa
) -> None:
    pessoas = [criar_colaborador() for _ in range(K)]
    criar_queixa(pessoas[0], atras=0)
    _abrir(cliente, criar_usuario, empresa, autenticar)

    corpo = cliente.get("/painel/resumo?dias=90").json()

    assert corpo["porSemana"] is True
    assert len(corpo["serie"]) == 13  # 90 dias em blocos de sete


def test_recorte_de_setor_filtra_o_agregado(
    cliente, criar_usuario, empresa, autenticar, estrutura, criar_colaborador, criar_queixa
) -> None:
    for _ in range(K):
        criar_queixa(criar_colaborador(setor="estoque", cargo="conferente"))
    for _ in range(K):
        criar_queixa(criar_colaborador(setor="producao", cargo="montador"), regiao="ombro")
    _abrir(cliente, criar_usuario, empresa, autenticar)

    corpo = cliente.get(f"/painel/resumo?setor_id={estrutura['estoque']}").json()

    assert corpo["kpis"]["queixas"] == K
    assert [r["regiao"] for r in corpo["regioes"]] == ["lombar"]


def test_por_cargo_devolve_a_linha_do_cargo(
    cliente, criar_usuario, empresa, autenticar, estrutura, criar_colaborador, criar_queixa
) -> None:
    """A tela de relatórios pede /painel/cargos, e ela precisa responder.

    A rota devolvia 500: a coluna do setor saía do `select` sem rótulo e a
    linha era lida por nome. Nenhum teste passava por aqui, e no navegador o
    erro só se via na tabela que não aparecia.
    """
    for _ in range(K):
        criar_queixa(criar_colaborador(setor="producao", cargo="montador"))
    _abrir(cliente, criar_usuario, empresa, autenticar)

    resposta = cliente.get("/painel/cargos")

    assert resposta.status_code == 200
    (linha,) = resposta.json()
    assert linha["cargoId"] == estrutura["montador"]
    assert linha["setorId"] == estrutura["producao"]
    assert linha["suprimido"] is False
    assert linha["efetivo"] == K
    assert linha["total"] == K
