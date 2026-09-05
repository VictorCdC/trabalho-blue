"""Volume sintético para medir consulta, não para demonstrar tela.

    cd backend
    createdb blue_bench && DATABASE_URL=...blue_bench alembic upgrade head
    DATABASE_URL=...blue_bench python -m scripts.volume

`scripts.semear` existe para a demonstração: 42 pessoas com histórias que a
tela conta bem. Nesse tamanho toda consulta responde em dezenas de
milissegundos e nenhuma decisão de índice aparece. Aqui o objetivo é o
contrário — quadro grande, muitos setores e meses de histórico, para que
`EXPLAIN` diga algo e para que uma otimização possa ser comprovada em vez de
argumentada.

O que importa para a medição, e por isso é imitado:

  - **mais de um tenant na mesma tabela**, senão o `WHERE empresa_id` parece
    de graça: com uma empresa só o índice nunca precisa descartar nada.
  - **setores de tamanhos diferentes**, porque é o tamanho do grupo que decide
    o k-mínimo e é por setor que o alerta coletivo agrupa.
  - **queixas concentradas em poucas regiões por setor**, que é o que faz o
    `HAVING` da regra de recorrência ter o que devolver.

Recusa `AMBIENTE=producao` e, por padrão, qualquer banco cujo nome não termine
em `_bench`: são centenas de milhares de linhas e nenhuma delas deveria cair
num banco de trabalho por engano.
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import date, timedelta
from typing import Any

from sqlalchemy import insert, make_url
from sqlalchemy.orm import Session

from app.config import obter_config
from app.db import obter_engine
from app.dominio import REGIOES, REGIOES_BILATERAIS
from app.models import Cargo, Caso, CheckIn, Empresa, Queixa, Setor, Unidade, Usuario, novo_id
from app.periodo import hoje
from app.seguranca import hash_senha

#: Uma linha pronta para o INSERT em lote.
Linha = dict[str, Any]

SENHA_BENCH = "blue1234"

#: Quantas linhas por INSERT. Acima disso o ganho some e a memória cresce.
LOTE = 5_000

UNIDADES_POR_EMPRESA = 4
SETORES_POR_UNIDADE = 3
CARGOS_POR_SETOR = 3

#: Fração dos dias úteis em que a pessoa registra check-in.
ADESAO = (0.45, 0.92)

#: Fração dos check-ins que vira queixa. A faixa larga é de propósito: setor
#: com 5% e setor com 35% no mesmo banco é o que separa o alerta do ruído.
DESCONFORTO = (0.04, 0.34)

TIPOS = ("pontada", "queimacao", "peso", "formigamento", "rigidez", "latejante", "cansaco")
INICIOS = ("hoje", "essa_semana", "esse_mes", "mais_de_mes")
AGRAVANTES = (
    "esforco_repetitivo",
    "levantar_peso",
    "ficar_sentado",
    "ficar_em_pe",
    "movimento_especifico",
    "fim_do_turno",
    "nao_sei",
)
RELACOES = ("sim", "nao", "nao_sei")


def _cpf(indice: int) -> str:
    return str(10_000_000_000 + indice * 1_372_937)[:11]


def _dias_uteis(fim: date, dias: int) -> list[date]:
    inicio = fim - timedelta(days=dias)
    return [
        inicio + timedelta(days=i)
        for i in range(dias + 1)
        if (inicio + timedelta(days=i)).weekday() < 5
    ]


def _inserir(sessao: Session, modelo: type, linhas: list[Linha]) -> int:
    for i in range(0, len(linhas), LOTE):
        sessao.execute(insert(modelo), linhas[i : i + LOTE])
    sessao.commit()
    return len(linhas)


def semear_empresa(
    sessao: Session,
    rnd: random.Random,
    indice_empresa: int,
    colaboradores: int,
    dias: int,
    contador_cpf: int,
) -> tuple[int, dict[str, int]]:
    """Uma empresa inteira: estrutura, quadro, histórico e casos."""
    empresa_id = novo_id()
    sessao.execute(
        insert(Empresa),
        [
            {
                "id": empresa_id,
                "nome": f"Empresa Bench {indice_empresa}",
                "cnpj": str(10_000_000_000_000 + indice_empresa)[:14],
                "plano": "enterprise",
                "ativa": True,
                "colaboradores_contratados": colaboradores,
            }
        ],
    )

    unidades: list[Linha] = [
        {
            "id": novo_id(),
            "empresa_id": empresa_id,
            "nome": f"Unidade {u + 1}",
            "cidade": "Fortaleza",
            "uf": "CE",
        }
        for u in range(UNIDADES_POR_EMPRESA)
    ]
    setores: list[Linha] = [
        {
            "id": novo_id(),
            "empresa_id": empresa_id,
            "unidade_id": unidade["id"],
            "nome": f"Setor {u + 1}.{s + 1}",
        }
        for u, unidade in enumerate(unidades)
        for s in range(SETORES_POR_UNIDADE)
    ]
    cargos: list[Linha] = [
        {
            "id": novo_id(),
            "empresa_id": empresa_id,
            "setor_id": setor["id"],
            "nome": f"Cargo {i + 1}",
        }
        for setor in setores
        for i in range(CARGOS_POR_SETOR)
    ]
    _inserir(sessao, Unidade, unidades)
    _inserir(sessao, Setor, setores)
    _inserir(sessao, Cargo, cargos)

    cargos_do_setor = {s["id"]: [c for c in cargos if c["setor_id"] == s["id"]] for s in setores}
    unidade_do_setor = {s["id"]: s["unidade_id"] for s in setores}

    # setor grande e setor pequeno no mesmo banco: é a diferença entre o
    # agregado que sai e o que o k-mínimo segura
    pesos = [rnd.uniform(0.4, 2.2) for _ in setores]
    total_peso = sum(pesos)
    tamanho = {
        setor["id"]: max(3, round(colaboradores * peso / total_peso))
        for setor, peso in zip(setores, pesos, strict=True)
    }

    #: cada setor adoece à sua maneira: duas ou três regiões respondem pela
    #: maioria das queixas, que é o que a regra de recorrência procura
    foco = {s["id"]: rnd.sample(REGIOES, 3) for s in setores}

    senha = hash_senha(SENHA_BENCH)
    pessoas: list[Linha] = []
    for setor in setores:
        for _ in range(tamanho[setor["id"]]):
            contador_cpf += 1
            cargo = rnd.choice(cargos_do_setor[setor["id"]])
            pessoas.append(
                {
                    "id": novo_id(),
                    "empresa_id": empresa_id,
                    "nome": f"Colaborador {contador_cpf}",
                    "cpf": _cpf(contador_cpf),
                    "email": None,
                    "role": "colaborador",
                    "senha_hash": senha,
                    "ativo": True,
                    "unidade_id": unidade_do_setor[setor["id"]],
                    "setor_id": setor["id"],
                    "cargo_id": cargo["id"],
                    "nascimento": None,
                    "admissao_em": None,
                    "tentativas_falhas": 0,
                }
            )

    # quem abre o painel
    gestores: list[Linha] = []
    for papel in ("admin", "rh", "sesmt"):
        contador_cpf += 1
        gestores.append(
            {
                "id": novo_id(),
                "empresa_id": empresa_id,
                "nome": f"{papel.upper()} Bench {indice_empresa}",
                "cpf": _cpf(contador_cpf),
                "email": None,
                "role": papel,
                "senha_hash": senha,
                "ativo": True,
                "unidade_id": unidades[0]["id"],
                "setor_id": setores[0]["id"],
                "cargo_id": cargos[0]["id"],
                "nascimento": None,
                "admissao_em": None,
                "tentativas_falhas": 0,
            }
        )
    _inserir(sessao, Usuario, pessoas + gestores)

    calendario = _dias_uteis(hoje(), dias)
    checkins: list[Linha] = []
    queixas: list[Linha] = []
    total_checkins = 0

    for pessoa in pessoas:
        adesao = rnd.uniform(*ADESAO)
        propensao = rnd.uniform(*DESCONFORTO)
        regioes_dela = foco[pessoa["setor_id"]]
        for dia in calendario:
            if rnd.random() > adesao:
                continue
            desconforto = rnd.random() < propensao
            checkins.append(
                {
                    "id": novo_id(),
                    "empresa_id": empresa_id,
                    "colaborador_id": pessoa["id"],
                    "data": dia,
                    "estado": "desconforto" if desconforto else "bem",
                }
            )
            if not desconforto:
                continue
            regiao = rnd.choice(regioes_dela)
            queixas.append(
                {
                    "id": novo_id(),
                    "empresa_id": empresa_id,
                    "colaborador_id": pessoa["id"],
                    "data": dia,
                    "regiao": regiao,
                    "lado": (
                        rnd.choice(("esquerdo", "direito"))
                        if regiao in REGIOES_BILATERAIS
                        else "na"
                    ),
                    "intensidade": rnd.randint(1, 5),
                    "tipo": rnd.choice(TIPOS),
                    "inicio": rnd.choice(INICIOS),
                    "agrava": rnd.choice(AGRAVANTES),
                    "relacao_trabalho": rnd.choice(RELACOES),
                    "observacao": "",
                }
            )

        if len(checkins) >= 200_000:
            total_checkins += _inserir(sessao, CheckIn, checkins)
            checkins = []

    total_checkins += _inserir(sessao, CheckIn, checkins)
    _inserir(sessao, Queixa, queixas)

    # casos abertos: é a tabela que `_casos_por_alerta` varre a cada listagem
    responsavel = gestores[-1]["id"]
    casos: list[Linha] = [
        {
            "id": novo_id(),
            "empresa_id": empresa_id,
            "numero": i + 1,
            "alerta_id": f"alr-col-{setores[i % len(setores)]['id']}-{REGIOES[i % len(REGIOES)]}",
            "origem": "coletivo",
            "regiao": REGIOES[i % len(REGIOES)],
            "lado": "na",
            "colaborador_id": None,
            "setor_id": setores[i % len(setores)]["id"],
            "status": ("aberto", "em_andamento", "resolvido")[i % 3],
            "severidade": ("baixa", "media", "alta")[i % 3],
            "responsavel_id": responsavel,
            "aberto_em": calendario[-1],
            "atualizado_em": calendario[-1],
        }
        for i in range(40)
    ]
    _inserir(sessao, Caso, casos)

    return contador_cpf, {
        "colaboradores": len(pessoas),
        "checkins": total_checkins,
        "queixas": len(queixas),
        "setores": len(setores),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera volume sintético para medição.")
    parser.add_argument("--empresas", type=int, default=5)
    parser.add_argument(
        "--colaboradores", type=int, default=800, help="Por empresa (a primeira leva o dobro)."
    )
    parser.add_argument("--dias", type=int, default=180)
    parser.add_argument("--semente", type=int, default=20260831)
    parser.add_argument(
        "--forcar",
        action="store_true",
        help="Permite rodar em banco cujo nome não termina em _bench.",
    )
    args = parser.parse_args()

    config = obter_config()
    if config.producao:
        print("recusado: AMBIENTE=producao.", file=sys.stderr)
        return 1

    nome_banco = make_url(config.database_url).database or ""
    if not nome_banco.endswith("_bench") and not args.forcar:
        print(
            f"recusado: '{nome_banco}' nao termina em _bench. "
            "Este script escreve centenas de milhares de linhas; use um banco "
            "separado ou passe --forcar.",
            file=sys.stderr,
        )
        return 1

    rnd = random.Random(args.semente)  # noqa: S311 — dado sintético, não segredo
    contador = 0
    print(f"banco: {nome_banco}")
    with Session(obter_engine()) as sessao:
        for i in range(args.empresas):
            # a primeira é o cliente grande: é nela que a medição roda
            quantos = args.colaboradores * 2 if i == 0 else args.colaboradores
            contador, resumo = semear_empresa(sessao, rnd, i + 1, quantos, args.dias, contador)
            print(
                f"  empresa {i + 1}: {resumo['colaboradores']} colaboradores, "
                f"{resumo['setores']} setores, {resumo['queixas']} queixas"
            )

    print(f"senha de todos os perfis: {SENHA_BENCH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
