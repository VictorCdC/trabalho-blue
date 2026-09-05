"""Dados de demonstração no Postgres.

    cd backend
    python -m scripts.semear            # recria a demonstração do zero
    python -m scripts.semear --manter   # não apaga o que já existe

É a porta de `frontend/src/lib/mock/seed.ts`, incluindo o gerador
pseudoaleatório: mesmo `mulberry32`, mesma ordem de chamadas, mesmos dados. Foi
feito assim de propósito — dá para abrir a tela antiga e a nova lado a lado e
comparar número por número enquanto a migração acontece.

Recusa rodar em `AMBIENTE=producao`: são CPFs falsos e senha única.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from math import floor

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import alertas as regra_alertas
from app.config import obter_config
from app.consulta import ConsultaEscopada
from app.db import obter_engine
from app.models import (
    AcaoCaso,
    Cargo,
    Caso,
    CheckIn,
    Empresa,
    Queixa,
    Setor,
    Unidade,
    Usuario,
)
from app.periodo import hoje
from app.recorte import Recorte, colaboradores
from app.seguranca import hash_senha

#: Senha única da demonstração. O backend real faz hash e política própria.
SENHA_DEMO = "blue1234"

JANELA_DIAS = 75

MASCARA32 = 0xFFFFFFFF


def mulberry32(semente: int):  # type: ignore[no-untyped-def]
    """Porta do gerador de `seed.ts`.

    Toda a aritmética do original é de 32 bits (`|0`, `>>>`, `Math.imul`), então
    a versão em Python trabalha com inteiros sem sinal mascarados em 32 bits: o
    padrão de bits é o mesmo e a sequência sai idêntica.
    """
    estado = semente & MASCARA32

    def proximo() -> float:
        nonlocal estado
        estado = (estado + 0x6D2B79F5) & MASCARA32
        t = estado
        t = ((t ^ (t >> 15)) * (1 | t)) & MASCARA32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & MASCARA32)) & MASCARA32) ^ t) & MASCARA32
        return ((t ^ (t >> 14)) & MASCARA32) / 4294967296

    return proximo


def cpf_falso(i: int) -> str:
    return str(10_000_000_000 + i * 1_372_937)[:11]


# --------------------------------- catálogo -----------------------------------

EMPRESAS = [
    ("e1", "Metalúrgica Aurora", "12345678000190", "profissional", True, 40),
    ("e2", "Rede Bem Viver Supermercados", "98765432000155", "essencial", True, 15),
    ("e3", "Transportadora Litoral Norte", "45678912000133", "enterprise", False, 120),
]

UNIDADES = [
    ("u1", "e1", "Matriz Fortaleza", "Fortaleza", "CE"),
    ("u2", "e1", "Planta Maracanaú", "Maracanaú", "CE"),
    ("u3", "e2", "Loja Centro", "Fortaleza", "CE"),
]

SETORES = [
    ("s1", "u1", "Administrativo"),
    ("s2", "u1", "Atendimento"),
    ("s3", "u1", "Estoque"),
    ("s4", "u2", "Produção"),
    ("s5", "u2", "Expedição"),
    ("s6", "u3", "Frente de Caixa"),
    ("s7", "u3", "Padaria"),
]

CARGOS = [
    ("c1", "s1", "Analista"),
    ("c2", "s1", "Assistente Administrativo"),
    ("c3", "s2", "Atendente"),
    ("c4", "s2", "Supervisor de Atendimento"),
    ("c5", "s3", "Conferente"),
    ("c6", "s3", "Empilhadeirista"),
    ("c7", "s3", "Auxiliar de Estoque"),
    ("c8", "s4", "Operador de Máquina"),
    ("c9", "s4", "Montador"),
    ("c10", "s4", "Inspetor de Qualidade"),
    ("c11", "s5", "Auxiliar de Expedição"),
    ("c12", "s5", "Motorista"),
    ("c13", "s6", "Operador de Caixa"),
    ("c14", "s6", "Repositor"),
    ("c15", "s7", "Padeiro"),
    ("c16", "s1", "Coordenação"),
]


@dataclass(frozen=True)
class Perfil:
    nome: str
    setor: str
    cargo: str
    #: chance de relatar desconforto num dia de trabalho
    propensao: float
    #: região que domina os relatos desta pessoa
    foco: tuple[str, str] | None = None
    #: relatos ficam mais intensos com o passar das semanas
    escalada: bool = False
    #: quadro melhorou depois de uma intervenção
    melhorou: bool = False


QUADRO_E1 = [
    # Administrativo — trabalho sentado e tela: cervical e dorsal
    Perfil("Mariana Alves Prado", "s1", "c1", 0.10, ("cervical", "na")),
    Perfil("Rafael Coutinho Lima", "s1", "c1", 0.08, ("dorsal", "na")),
    Perfil("Juliana Sampaio Rocha", "s1", "c2", 0.15, ("cervical", "na")),
    Perfil("Bruno Teixeira Maia", "s1", "c2", 0.06),
    Perfil("Camila Duarte Freitas", "s1", "c1", 0.09, ("punho", "direito")),
    # Atendimento — digitação e telefone
    Perfil("Ana Beatriz Nogueira", "s2", "c3", 0.34, ("punho", "direito"), escalada=True),
    Perfil("Diego Martins Pereira", "s2", "c3", 0.12, ("cervical", "na")),
    Perfil("Larissa Gomes Vieira", "s2", "c3", 0.17, ("dorsal", "na")),
    Perfil("Paulo Henrique Braga", "s2", "c4", 0.07),
    Perfil("Tatiane Ribeiro Costa", "s2", "c3", 0.13, ("punho", "esquerdo")),
    # Estoque — carga e descarga: surto coletivo de lombar
    Perfil("Marcos Vinícius Souza", "s3", "c5", 0.25, ("lombar", "na")),
    Perfil("Fernanda Lopes Andrade", "s3", "c5", 0.21, ("lombar", "na")),
    Perfil("Cláudio Barbosa Neto", "s3", "c6", 0.23, ("lombar", "na")),
    Perfil("Rodrigo Amaral Pinto", "s3", "c7", 0.28, ("lombar", "na")),
    Perfil("Simone Cardoso Melo", "s3", "c7", 0.19, ("lombar", "na")),
    Perfil("Eduardo Farias Campos", "s3", "c6", 0.16, ("ombro", "direito")),
    Perfil("Patrícia Nunes Moura", "s3", "c5", 0.20, ("lombar", "na")),
    # Produção — repetitivo de ombro; setor já passou por intervenção
    Perfil("José Carlos Almeida", "s4", "c8", 0.22, ("ombro", "direito"), melhorou=True),
    Perfil("Vanessa Cruz Batista", "s4", "c9", 0.18, ("antebraco", "direito")),
    Perfil("Igor Menezes Tavares", "s4", "c8", 0.19, ("ombro", "esquerdo"), melhorou=True),
    Perfil("Renata Figueiredo Dias", "s4", "c10", 0.11, ("cervical", "na")),
    Perfil("Wesley Santana Rocha", "s4", "c9", 0.24, ("ombro", "direito"), melhorou=True),
    Perfil("Amanda Peixoto Lira", "s4", "c9", 0.14, ("punho", "direito")),
    Perfil("Gustavo Bezerra Matos", "s4", "c8", 0.17, ("lombar", "na")),
    # Expedição
    Perfil("Sérgio Aquino Ramos", "s5", "c11", 0.21, ("lombar", "na")),
    Perfil("Kelly Oliveira Serra", "s5", "c11", 0.15, ("joelho", "direito")),
    Perfil("Anderson Pires Cunha", "s5", "c12", 0.18, ("lombar", "na")),
    Perfil("Michele Torres Aguiar", "s5", "c11", 0.12, ("punho", "esquerdo")),
    Perfil("Fábio Correia Lemos", "s5", "c12", 0.10, ("panturrilha", "direito")),
]

QUADRO_E2 = [
    Perfil("Beatriz Xavier Pontes", "s6", "c13", 0.26, ("punho", "direito")),
    Perfil("Leandro Aguiar Brito", "s6", "c13", 0.22, ("punho", "direito")),
    Perfil("Cristiane Melo Bastos", "s6", "c13", 0.19, ("ombro", "direito")),
    Perfil("Vitor Hugo Salgado", "s6", "c14", 0.20, ("lombar", "na")),
    Perfil("Nathália Braz Ferreira", "s6", "c14", 0.16, ("lombar", "na")),
    Perfil("Elias Monteiro Rocha", "s7", "c15", 0.18, ("ombro", "esquerdo")),
    Perfil("Rosana Lira Cavalcante", "s7", "c15", 0.14, ("canela", "direito")),
    Perfil("Thiago Meireles Pinho", "s7", "c15", 0.11),
]

#: Gestores e equipe da plataforma — os logins fixos da demonstração.
GESTORES = [
    ("e1", "Helena Castro Vasconcelos", "helena@aurora.com.br", "admin", "u1", "s1", "c16", 1200),
    ("e1", "Priscila Moraes Aragão", "priscila.rh@aurora.com.br", "rh", "u1", "s1", "c16", 980),
    ("e1", "Otávio Mendes Ferraz", "otavio.sesmt@aurora.com.br", "sesmt", "u1", "s1", "c16", 640),
    ("e2", "Denise Aparecida Rangel", "denise@bemviver.com.br", "admin", "u3", "s6", "c13", 300),
    (None, "Letícia Ramalho", "leticia@blue.app", "superuser", None, None, None, None),
]

PERFIL_SETOR: dict[str, list[tuple[str, str]]] = {
    "s1": [
        ("cervical", "na"),
        ("dorsal", "na"),
        ("punho", "direito"),
        ("cabeca", "na"),
        ("lombar", "na"),
    ],
    "s2": [
        ("cervical", "na"),
        ("punho", "direito"),
        ("dorsal", "na"),
        ("ombro", "direito"),
        ("cabeca", "na"),
    ],
    "s3": [
        ("lombar", "na"),
        ("ombro", "direito"),
        ("joelho", "direito"),
        ("dorsal", "na"),
        ("punho", "direito"),
    ],
    "s4": [
        ("ombro", "direito"),
        ("lombar", "na"),
        ("antebraco", "direito"),
        ("cervical", "na"),
        ("punho", "direito"),
    ],
    "s5": [
        ("lombar", "na"),
        ("panturrilha", "direito"),
        ("ombro", "esquerdo"),
        ("joelho", "esquerdo"),
        ("pe", "direito"),
    ],
    "s6": [
        ("punho", "direito"),
        ("ombro", "direito"),
        ("lombar", "na"),
        ("cervical", "na"),
        ("canela", "direito"),
    ],
    "s7": [
        ("ombro", "esquerdo"),
        ("lombar", "na"),
        ("canela", "direito"),
        ("antebraco", "direito"),
        ("punho", "direito"),
    ],
}

TIPO_POR_REGIAO: dict[str, list[str]] = {
    "punho": ["formigamento", "pontada", "queimacao"],
    "antebraco": ["queimacao", "cansaco", "formigamento"],
    "lombar": ["peso", "rigidez", "pontada"],
    "dorsal": ["peso", "rigidez", "cansaco"],
    "cervical": ["rigidez", "peso", "latejante"],
    "ombro": ["pontada", "rigidez", "cansaco"],
    "cabeca": ["latejante", "peso"],
    "joelho": ["pontada", "rigidez"],
    "panturrilha": ["cansaco", "peso"],
    "canela": ["cansaco", "queimacao"],
    "pe": ["queimacao", "cansaco"],
}

AGRAVA_POR_REGIAO: dict[str, list[str]] = {
    "punho": ["esforco_repetitivo", "movimento_especifico", "fim_do_turno"],
    "antebraco": ["esforco_repetitivo", "fim_do_turno"],
    "lombar": ["levantar_peso", "ficar_sentado", "fim_do_turno"],
    "dorsal": ["ficar_sentado", "fim_do_turno"],
    "cervical": ["ficar_sentado", "fim_do_turno", "movimento_especifico"],
    "ombro": ["esforco_repetitivo", "levantar_peso", "movimento_especifico"],
    "joelho": ["ficar_em_pe", "movimento_especifico"],
    "panturrilha": ["ficar_em_pe", "fim_do_turno"],
    "canela": ["ficar_em_pe", "fim_do_turno"],
    "pe": ["ficar_em_pe", "fim_do_turno"],
    "cabeca": ["fim_do_turno", "nao_sei"],
}

OBSERVACOES = [
    "Piora quando fico muito tempo na mesma posição.",
    "Começou depois que mudaram o layout do posto.",
    "Sinto mais no fim do turno, melhora no dia seguinte.",
    "Tomei analgésico por conta própria para conseguir trabalhar.",
    "A cadeira não regula na altura certa.",
    "Acordei com a região travada hoje.",
    "Melhorou um pouco depois do alongamento na pausa.",
    "Estou evitando forçar essa região durante o expediente.",
    "O peso das caixas parece ter aumentado nas últimas semanas.",
    "",
    "",
    "",
    "",
]

#: Ações das intervenções já registradas, por alerta que originou o caso.
#: (dias atrás, tipo, descrição, concluída)
ACOES_DEMO: dict[str, tuple[str, int, list[tuple[int, str, str, bool]]]] = {
    "s3|lombar": (
        "em_andamento",
        21,
        [
            (
                21,
                "avaliacao_ergonomica",
                "Vistoria do fluxo de recebimento e da altura das prateleiras.",
                True,
            ),
            (
                16,
                "treinamento",
                "Treinamento de levantamento de carga para toda a equipe do turno da manhã.",
                True,
            ),
            (
                9,
                "ginastica_laboral",
                "Ginástica laboral 3x por semana, 10 min antes do início do turno.",
                False,
            ),
            (9, "reavaliacao", "Reavaliar indicadores do setor em 30 dias.", False),
        ],
    ),
    "s4|ombro": (
        "resolvido",
        58,
        [
            (
                58,
                "avaliacao_ergonomica",
                "Medição da altura da bancada da linha de montagem 2.",
                True,
            ),
            (
                50,
                "ajuste_posto",
                "Bancadas reguladas e apoio de braço instalado em 6 postos.",
                True,
            ),
            (36, "ginastica_laboral", "Alongamento de ombro incluído na pausa da manhã.", True),
            (
                12,
                "reavaliacao",
                "Queda de 63% nos relatos de ombro no setor. Caso encerrado.",
                True,
            ),
        ],
    ),
}


# -------------------------------- construção ----------------------------------


@dataclass
class Contexto:
    hoje: date
    ids: dict[str, str] = field(default_factory=dict)
    logins: list[tuple[str, str, str]] = field(default_factory=list)


def _escolha(rnd, opcoes):  # type: ignore[no-untyped-def]
    return opcoes[int(rnd() * len(opcoes))]


def _intensidade(rnd, base: float) -> int:  # type: ignore[no-untyped-def]
    # floor(x + 0.5) e o Math.round do JS: round() do Python arredondaria ao par
    return min(5, max(1, floor(base + (rnd() - 0.5) * 1.6 + 0.5)))


def _dia(ctx: Contexto, atras: int) -> date:
    return ctx.hoje - timedelta(days=atras)


def semear_estrutura(sessao: Session, ctx: Contexto) -> None:
    for chave, nome, cnpj, plano, ativa, contratados in EMPRESAS:
        empresa = Empresa(
            nome=nome, cnpj=cnpj, plano=plano, ativa=ativa, colaboradores_contratados=contratados
        )
        sessao.add(empresa)
        sessao.flush()
        ctx.ids[chave] = empresa.id

    for chave, empresa, nome, cidade, uf in UNIDADES:
        unidade = Unidade(empresa_id=ctx.ids[empresa], nome=nome, cidade=cidade, uf=uf)
        sessao.add(unidade)
        sessao.flush()
        ctx.ids[chave] = unidade.id

    empresa_da_unidade = {u[0]: u[1] for u in UNIDADES}
    for chave, unidade, nome in SETORES:
        setor = Setor(
            empresa_id=ctx.ids[empresa_da_unidade[unidade]],
            unidade_id=ctx.ids[unidade],
            nome=nome,
        )
        sessao.add(setor)
        sessao.flush()
        ctx.ids[chave] = setor.id

    unidade_do_setor = {s[0]: s[1] for s in SETORES}
    for chave, setor, nome in CARGOS:
        cargo = Cargo(
            empresa_id=ctx.ids[empresa_da_unidade[unidade_do_setor[setor]]],
            setor_id=ctx.ids[setor],
            nome=nome,
        )
        sessao.add(cargo)
        sessao.flush()
        ctx.ids[chave] = cargo.id


def semear_pessoas(sessao: Session, ctx: Contexto) -> None:
    """Colaboradores, com o histórico de 75 dias que a demonstração mostra."""
    unidade_do_setor = {s[0]: s[1] for s in SETORES}
    senha = hash_senha(SENHA_DEMO)
    indice = 0

    for empresa_chave, quadro in (("e1", QUADRO_E1), ("e2", QUADRO_E2)):
        for perfil in quadro:
            indice += 1
            rnd = mulberry32(indice * 7919 + 13)
            empresa_id = ctx.ids[empresa_chave]

            pessoa = Usuario(
                empresa_id=empresa_id,
                nome=perfil.nome,
                cpf=cpf_falso(indice),
                email=None,
                role="colaborador",
                senha_hash=senha,
                ativo=True,
                unidade_id=ctx.ids[unidade_do_setor[perfil.setor]],
                setor_id=ctx.ids[perfil.setor],
                cargo_id=ctx.ids[perfil.cargo],
                nascimento=_dia(ctx, 7000 + int(rnd() * 7000)),
                admissao_em=_dia(ctx, 120 + int(rnd() * 2200)),
                tentativas_falhas=0,
            )
            sessao.add(pessoa)
            sessao.flush()

            adesao = 0.62 + rnd() * 0.33
            regioes = PERFIL_SETOR.get(perfil.setor, [("lombar", "na")])

            for atras in range(JANELA_DIAS, -1, -1):
                dia = _dia(ctx, atras)
                if dia.weekday() >= 5:
                    continue
                if rnd() > adesao:
                    continue  # não fez check-in nesse dia

                recencia = 1 - atras / JANELA_DIAS  # 0 = antigo, 1 = hoje
                p = perfil.propensao
                if perfil.escalada:
                    p *= 0.45 + 1.5 * recencia
                if perfil.melhorou:
                    p *= 1.5 - 1.1 * recencia

                desconforto = rnd() < p
                sessao.add(
                    CheckIn(
                        empresa_id=empresa_id,
                        colaborador_id=pessoa.id,
                        data=dia,
                        estado="desconforto" if desconforto else "bem",
                    )
                )
                if not desconforto:
                    continue

                if perfil.foco is not None and rnd() < 0.72:
                    regiao, lado = perfil.foco
                else:
                    regiao, lado = _escolha(rnd, regioes)

                base = 2.4 + perfil.propensao * 4
                if perfil.escalada:
                    base = 1.9 + 2.6 * recencia
                if perfil.melhorou:
                    base = 4.1 - 1.8 * recencia

                if atras > 40:
                    inicio = "mais_de_mes"
                elif atras > 14:
                    inicio = "esse_mes"
                elif atras > 3:
                    inicio = "essa_semana"
                else:
                    inicio = "hoje"

                intensidade = _intensidade(rnd, base)
                tipo = _escolha(rnd, TIPO_POR_REGIAO.get(regiao, ["pontada", "peso", "cansaco"]))
                agrava = _escolha(rnd, AGRAVA_POR_REGIAO.get(regiao, ["nao_sei", "fim_do_turno"]))
                relacao = "sim" if rnd() < 0.74 else ("nao_sei" if rnd() < 0.6 else "nao")
                sessao.add(
                    Queixa(
                        empresa_id=empresa_id,
                        colaborador_id=pessoa.id,
                        data=dia,
                        regiao=regiao,
                        lado=lado,
                        intensidade=intensidade,
                        tipo=tipo,
                        inicio=inicio,
                        agrava=agrava,
                        relacao_trabalho=relacao,
                        observacao=_escolha(rnd, OBSERVACOES),
                    )
                )

    for empresa_chave, nome, email, papel, unidade, setor, cargo, admissao in GESTORES:
        indice += 1
        gestor = Usuario(
            empresa_id=ctx.ids[empresa_chave] if empresa_chave else None,
            nome=nome,
            cpf=cpf_falso(indice),
            email=email,
            role=papel,
            senha_hash=senha,
            ativo=True,
            unidade_id=ctx.ids[unidade] if unidade else None,
            setor_id=ctx.ids[setor] if setor else None,
            cargo_id=ctx.ids[cargo] if cargo else None,
            nascimento=_dia(ctx, 9000 + indice * 37),
            admissao_em=_dia(ctx, admissao) if admissao else None,
            tentativas_falhas=0,
        )
        sessao.add(gestor)
        ctx.logins.append((papel, nome, gestor.cpf))

    # o colaborador da demonstração é a Ana, cujo quadro está em escalada
    ana = sessao.scalars(
        select(Usuario).where(Usuario.nome == "Ana Beatriz Nogueira")
    ).one_or_none()
    if ana is not None:
        ctx.logins.insert(0, ("colaborador", ana.nome, ana.cpf))


def semear_casos(sessao: Session, ctx: Contexto) -> None:
    """Casos já em andamento, abertos a partir dos alertas que a regra derivar.

    Deriva de verdade em vez de inventar: se a regra de alerta mudar, a
    demonstração muda junto, em vez de exibir um caso órfão.
    """
    empresa_id = ctx.ids["e1"]
    sesmt = sessao.scalars(
        select(Usuario).where(Usuario.empresa_id == empresa_id, Usuario.role == "sesmt")
    ).first()
    if sesmt is None:
        return

    consulta = ConsultaEscopada(sessao, empresa_id)
    todos = Recorte(unidade_id=None, setor_id=None, cargo_id=None)
    alertas = regra_alertas.listar(
        consulta, colaboradores(consulta, todos), identificar=True, hoje=ctx.hoje
    )
    numero = 0

    for chave, (situacao, aberto_atras, acoes) in ACOES_DEMO.items():
        setor_chave, regiao = chave.split("|")
        alvo = next(
            (
                a
                for a in alertas
                if a.kind == "coletivo"
                and a.setor_id == ctx.ids[setor_chave]
                and a.regiao == regiao
            ),
            None,
        )
        if alvo is None:
            continue
        numero += 1
        caso = Caso(
            empresa_id=empresa_id,
            numero=numero,
            alerta_id=alvo.id,
            origem="coletivo",
            regiao=alvo.regiao,
            lado="na",
            colaborador_id=None,
            setor_id=alvo.setor_id,
            status=situacao,
            severidade=alvo.severidade,
            responsavel_id=sesmt.id,
            aberto_em=_dia(ctx, aberto_atras),
            atualizado_em=_dia(ctx, acoes[-1][0]),
        )
        for atras, tipo, descricao, concluida in acoes:
            caso.acoes.append(
                AcaoCaso(
                    empresa_id=empresa_id,
                    data=_dia(ctx, atras),
                    tipo=tipo,
                    descricao=descricao,
                    autor_id=sesmt.id,
                    concluida=concluida,
                )
            )
        sessao.add(caso)

    individual = next((a for a in alertas if a.kind == "individual"), None)
    if individual is not None:
        numero += 1
        caso = Caso(
            empresa_id=empresa_id,
            numero=numero,
            alerta_id=individual.id,
            origem="individual",
            regiao=individual.regiao,
            lado=individual.lado,
            colaborador_id=individual.colaborador_id,
            setor_id=None,
            status="aberto",
            severidade=individual.severidade,
            responsavel_id=sesmt.id,
            aberto_em=_dia(ctx, 4),
            atualizado_em=_dia(ctx, 4),
        )
        caso.acoes.append(
            AcaoCaso(
                empresa_id=empresa_id,
                data=_dia(ctx, 4),
                tipo="observacao",
                descricao="Relatos em escalada nas ultimas 3 semanas, intensidade crescente.",
                autor_id=sesmt.id,
                concluida=True,
            )
        )
        sessao.add(caso)


def limpar(sessao: Session) -> None:
    """Apaga na ordem inversa das dependências.

    `log_auditoria` fica: a trilha não é apagável nem por script — o trigger
    da migration recusaria o DELETE de qualquer forma.
    """
    for modelo in (AcaoCaso, Caso, Queixa, CheckIn, Usuario, Cargo, Setor, Unidade, Empresa):
        sessao.execute(delete(modelo))
    sessao.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Semeia a demonstração do BLUE.")
    parser.add_argument(
        "--manter", action="store_true", help="não apaga os dados existentes antes de semear"
    )
    argumentos = parser.parse_args()

    if obter_config().producao:
        print("recusado: AMBIENTE=producao. Isto sao CPFs falsos e senha unica.", file=sys.stderr)
        return 1

    with Session(obter_engine()) as sessao:
        if not argumentos.manter:
            limpar(sessao)
        elif sessao.scalar(select(Empresa.id).limit(1)) is not None:
            print("ja existe empresa cadastrada; nada a fazer com --manter")
            return 0

        ctx = Contexto(hoje=hoje())
        semear_estrutura(sessao, ctx)
        semear_pessoas(sessao, ctx)
        sessao.commit()
        semear_casos(sessao, ctx)
        sessao.commit()

    _resumir(ctx)
    return 0


def _resumir(ctx: Contexto) -> None:
    print("demonstracao semeada.")
    print(f"senha de todos os perfis: {SENHA_DEMO}")
    for papel, nome, cpf in ctx.logins:
        print(f"  {papel:12} {cpf}  {nome}")


if __name__ == "__main__":
    raise SystemExit(main())
